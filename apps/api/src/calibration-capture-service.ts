import { randomUUID } from "node:crypto";
import type { LaunchMomentumSnapshot } from "@axi/launch-momentum";
import {
  buildCalibrationDataset,
  createCalibrationCaptureSession,
  createCapturedSignalObservation,
  createSessionCaptureConfig,
  getSessionCaptureRuntimeContract,
  materializeCapturedSignalOutcome,
  serializeCalibrationDataset,
  stopCalibrationCaptureSession,
  type CalibrationDataset,
  type CalibrationExportFormat,
  type CreateSessionCaptureConfigInput
} from "@axi/session-capture";
import {
  getActiveCalibrationCaptureSessionForRuntime,
  getCalibrationCaptureObservationCounts,
  getCalibrationCaptureSession,
  getLatestCapturedSignalObservationByMint,
  listCalibrationCaptureSessions,
  listCapturedSignalObservationsBySession,
  listLaunchTimeseriesBucketsByMint,
  saveCalibrationCaptureSession,
  saveCapturedSignalObservation,
  type StoredCalibrationCaptureSession,
  type StoredCapturedSignalObservation
} from "@axi/storage";
import type { CalibrationPartition } from "@axi/signal-calibration";

export type CalibrationCaptureStartInput = {
  partition: CalibrationPartition;
  config?: CreateSessionCaptureConfigInput | undefined;
};

export type CalibrationCaptureMaterializationSummary = {
  sessionId: string;
  asOf: string;
  observationCount: number;
  completedCount: number;
  pendingCount: number;
  unavailableCount: number;
  changedCount: number;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type CalibrationCaptureStatus = {
  runtimeSessionId: string;
  active: boolean;
  activeSession: StoredCalibrationCaptureSession | null;
  observationCount: number;
  completedCount: number;
  pendingCount: number;
  unavailableCount: number;
  contract: ReturnType<typeof getSessionCaptureRuntimeContract>;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export class CalibrationCaptureServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "CalibrationCaptureServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class CalibrationCaptureService {
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly runtimeSessionId: string;

  constructor(options: {
    runtimeSessionId: string;
    createId?: (() => string) | undefined;
    now?: (() => Date) | undefined;
  }) {
    this.runtimeSessionId = options.runtimeSessionId;
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  start(input: CalibrationCaptureStartInput): {
    created: boolean;
    session: StoredCalibrationCaptureSession;
    status: CalibrationCaptureStatus;
  } {
    const active = this.getActiveSession();

    if (active) {
      const requestedConfig = input.config
        ? createSessionCaptureConfig(input.config)
        : null;

      if (
        active.partition !== input.partition ||
        (requestedConfig &&
          JSON.stringify(active.config) !== JSON.stringify(requestedConfig))
      ) {
        throw new CalibrationCaptureServiceError(
          "CALIBRATION_CAPTURE_SESSION_ALREADY_ACTIVE",
          `Calibration capture session ${active.sessionId} is already active with a different partition or policy.`,
          409
        );
      }

      return {
        created: false,
        session: active,
        status: this.getStatus()
      };
    }

    const startedAt = this.now().toISOString();
    const session = saveCalibrationCaptureSession(
      createCalibrationCaptureSession({
        sessionId: `capture-${this.createId()}`,
        runtimeSessionId: this.runtimeSessionId,
        partition: input.partition,
        config: input.config,
        startedAt
      })
    );

    return {
      created: true,
      session,
      status: this.getStatus()
    };
  }

  captureSnapshot(
    snapshot: LaunchMomentumSnapshot,
    sourceSnapshotId: number
  ):
    | { captured: true; observation: StoredCapturedSignalObservation }
    | { captured: false; reasonCodes: string[] } {
    const session = this.getActiveSession();

    if (!session) {
      return {
        captured: false,
        reasonCodes: ["CALIBRATION_CAPTURE_NOT_ACTIVE"]
      };
    }

    const counts = getCalibrationCaptureObservationCounts(session.sessionId);

    if (counts.observationCount >= session.config.maxObservationsPerSession) {
      return {
        captured: false,
        reasonCodes: ["CALIBRATION_CAPTURE_OBSERVATION_LIMIT_REACHED"]
      };
    }

    const latest = getLatestCapturedSignalObservationByMint(
      session.sessionId,
      snapshot.mint
    );

    if (
      latest &&
      Date.parse(snapshot.evaluatedAt) - Date.parse(latest.signalAt) <
        session.config.samplingIntervalMs
    ) {
      return {
        captured: false,
        reasonCodes: ["CALIBRATION_CAPTURE_SAMPLING_INTERVAL"]
      };
    }

    const result = createCapturedSignalObservation({
      session,
      snapshot: {
        sourceSnapshotId,
        mint: snapshot.mint,
        evaluatedAt: snapshot.evaluatedAt,
        ageSeconds: snapshot.ageSeconds,
        tradeSampleCount: snapshot.tradeSampleCount,
        priceSol: snapshot.priceSol,
        derivativeScore: snapshot.derivativeScore
      },
      capturedAt: this.now().toISOString()
    });

    if (!result.accepted) {
      return { captured: false, reasonCodes: result.reasonCodes };
    }

    return {
      captured: true,
      observation: saveCapturedSignalObservation(result.observation)
    };
  }

  materialize(
    sessionId: string,
    asOf = this.now().toISOString()
  ): CalibrationCaptureMaterializationSummary {
    const session = this.requireSession(sessionId);
    const observations = listCapturedSignalObservationsBySession(
      session.sessionId,
      { limit: session.config.maxObservationsPerSession }
    );
    const bucketCache = new Map<
      string,
      ReturnType<typeof listLaunchTimeseriesBucketsByMint>
    >();
    let changedCount = 0;

    for (const observation of observations) {
      if (observation.status === "complete") {
        continue;
      }

      let buckets = bucketCache.get(observation.mint);

      if (!buckets) {
        buckets = listLaunchTimeseriesBucketsByMint(observation.mint, 1_000);
        bucketCache.set(observation.mint, buckets);
      }

      const materialized = materializeCapturedSignalOutcome({
        observation,
        buckets,
        asOf
      });

      if (
        materialized.status !== observation.status ||
        materialized.updatedAt !== observation.updatedAt
      ) {
        saveCapturedSignalObservation(materialized);
        changedCount += 1;
      }
    }

    const current = listCapturedSignalObservationsBySession(session.sessionId, {
      limit: session.config.maxObservationsPerSession
    });

    return summarizeMaterialization(
      session.sessionId,
      asOf,
      current,
      changedCount
    );
  }

  stop(reason = "operator_stop"): {
    stopped: boolean;
    session: StoredCalibrationCaptureSession | null;
    materialization: CalibrationCaptureMaterializationSummary | null;
  } {
    const active = this.getActiveSession();

    if (!active) {
      return { stopped: false, session: null, materialization: null };
    }

    const stoppedAt = this.now().toISOString();
    const materialization = this.materialize(active.sessionId, stoppedAt);
    const session = saveCalibrationCaptureSession(
      stopCalibrationCaptureSession(active, {
        stoppedAt,
        reason
      })
    );

    return { stopped: true, session, materialization };
  }

  interrupt(reason = "runtime_closed"): StoredCalibrationCaptureSession | null {
    const active = this.getActiveSession();

    if (!active) {
      return null;
    }

    const stoppedAt = this.now().toISOString();
    this.materialize(active.sessionId, stoppedAt);

    return saveCalibrationCaptureSession(
      stopCalibrationCaptureSession(active, {
        stoppedAt,
        reason,
        interrupted: true
      })
    );
  }

  getDataset(
    sessionId: string,
    generatedAt = this.now().toISOString()
  ): CalibrationDataset {
    const session = this.requireSession(sessionId);
    const observations = listCapturedSignalObservationsBySession(
      session.sessionId,
      { limit: session.config.maxObservationsPerSession }
    );

    return buildCalibrationDataset({ session, observations, generatedAt });
  }

  export(
    sessionId: string,
    format: CalibrationExportFormat,
    generatedAt = this.now().toISOString()
  ): { dataset: CalibrationDataset; serialized: string } {
    const dataset = this.getDataset(sessionId, generatedAt);
    return {
      dataset,
      serialized: serializeCalibrationDataset(dataset, format)
    };
  }

  getSession(sessionId: string): StoredCalibrationCaptureSession | null {
    return getCalibrationCaptureSession(sessionId);
  }

  getSessions(limit = 50): StoredCalibrationCaptureSession[] {
    return listCalibrationCaptureSessions(limit);
  }

  getObservations(
    sessionId: string,
    options: Parameters<typeof listCapturedSignalObservationsBySession>[1]
  ): StoredCapturedSignalObservation[] {
    this.requireSession(sessionId);
    return listCapturedSignalObservationsBySession(sessionId, options);
  }

  getStatus(): CalibrationCaptureStatus {
    const activeSession = this.getActiveSession();
    const counts = activeSession
      ? getCalibrationCaptureObservationCounts(activeSession.sessionId)
      : {
          observationCount: 0,
          completedCount: 0,
          pendingCount: 0,
          unavailableCount: 0
        };

    return {
      runtimeSessionId: this.runtimeSessionId,
      active: activeSession !== null,
      activeSession,
      ...counts,
      contract: getSessionCaptureRuntimeContract(),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  private getActiveSession(): StoredCalibrationCaptureSession | null {
    return getActiveCalibrationCaptureSessionForRuntime(this.runtimeSessionId);
  }

  private requireSession(sessionId: string): StoredCalibrationCaptureSession {
    const session = getCalibrationCaptureSession(sessionId);

    if (!session) {
      throw new CalibrationCaptureServiceError(
        "CALIBRATION_CAPTURE_SESSION_NOT_FOUND",
        `Calibration capture session ${sessionId} was not found.`,
        404
      );
    }

    return session;
  }
}

export function createCalibrationCaptureService(options: {
  runtimeSessionId: string;
  createId?: (() => string) | undefined;
  now?: (() => Date) | undefined;
}): CalibrationCaptureService {
  return new CalibrationCaptureService(options);
}

function summarizeMaterialization(
  sessionId: string,
  asOf: string,
  observations: readonly StoredCapturedSignalObservation[],
  changedCount: number
): CalibrationCaptureMaterializationSummary {
  return {
    sessionId,
    asOf,
    observationCount: observations.length,
    completedCount: countStatus(observations, "complete"),
    pendingCount: countStatus(observations, "pending"),
    unavailableCount: countStatus(observations, "unavailable"),
    changedCount,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  };
}

function countStatus(
  observations: readonly StoredCapturedSignalObservation[],
  status: StoredCapturedSignalObservation["status"]
): number {
  return observations.filter((observation) => observation.status === status)
    .length;
}
