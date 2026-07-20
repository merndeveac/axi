import {
  launchDerivativeReferencePolicy,
  type CalibrationObservation,
  type CalibrationPartition,
  type SignalLabel
} from "@axi/signal-calibration";

export const sessionCaptureVersion = "calibration-session-capture-v1" as const;

export const defaultSessionCaptureConfig = {
  schemaVersion: 1,
  horizonMs: 60_000,
  targetReturnPct: 20,
  estimatedCostPct: 8,
  samplingIntervalMs: 5_000,
  maxOutcomeLagMs: 10_000,
  minimumTradeSamples: 3,
  maxObservationsPerSession: 10_000
} as const;

export type SessionCaptureStatus = "active" | "stopped" | "interrupted";
export type CapturedObservationStatus = "pending" | "complete" | "unavailable";
export type CalibrationExportFormat = "json" | "jsonl" | "csv";

export type SessionCaptureConfig = {
  schemaVersion: 1;
  horizonMs: number;
  targetReturnPct: number;
  estimatedCostPct: number;
  samplingIntervalMs: number;
  maxOutcomeLagMs: number;
  minimumTradeSamples: number;
  maxObservationsPerSession: number;
};

export type CreateSessionCaptureConfigInput = {
  horizonMs?: number | undefined;
  targetReturnPct?: number | undefined;
  estimatedCostPct?: number | undefined;
  samplingIntervalMs?: number | undefined;
  maxOutcomeLagMs?: number | undefined;
  minimumTradeSamples?: number | undefined;
  maxObservationsPerSession?: number | undefined;
};

export type CalibrationCaptureSession = {
  schemaVersion: 1;
  captureVersion: typeof sessionCaptureVersion;
  sessionId: string;
  runtimeSessionId: string;
  strategyVersion: typeof launchDerivativeReferencePolicy.strategyVersion;
  partition: CalibrationPartition;
  status: SessionCaptureStatus;
  config: SessionCaptureConfig;
  startedAt: string;
  stoppedAt: string | null;
  stopReason: string | null;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  createdAt: string;
  updatedAt: string;
};

export type CaptureSignalSnapshot = {
  sourceSnapshotId: number;
  mint: string;
  evaluatedAt: string;
  ageSeconds: number;
  tradeSampleCount: number;
  priceSol: number | null;
  derivativeScore: {
    totalScore: number;
    strengthLabel: SignalLabel;
    policySchemaVersion: 1;
    strategyVersion: string;
    policyStatus: "reference_only";
    calibrated: false;
    confidenceAppliedToSignalScore: false;
  };
};

export type CapturedSignalObservation = {
  schemaVersion: 1;
  captureVersion: typeof sessionCaptureVersion;
  observationId: string;
  captureSessionId: string;
  runtimeSessionId: string;
  mint: string;
  strategyVersion: typeof launchDerivativeReferencePolicy.strategyVersion;
  partition: CalibrationPartition;
  sourceSnapshotId: number;
  signalAt: string;
  signalAgeSeconds: number;
  score: number;
  label: SignalLabel;
  tradeSampleCount: number;
  entryPriceSol: number;
  horizonMs: number;
  targetReturnPct: number;
  estimatedCostPct: number;
  maxOutcomeLagMs: number;
  status: CapturedObservationStatus;
  outcomeAt: string | null;
  outcomePriceSol: number | null;
  forwardReturnPct: number | null;
  maxFavorableExcursionPct: number | null;
  maxAdverseExcursionPct: number | null;
  targetReached: boolean | null;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  createdAt: string;
  updatedAt: string;
};

export type OutcomePriceBucket = {
  bucketStart: string;
  bucketEnd: string;
  openSol: number | null;
  highSol: number | null;
  lowSol: number | null;
  closeSol: number | null;
  synthetic: boolean;
};

export type CaptureObservationResult =
  | { accepted: true; observation: CapturedSignalObservation }
  | { accepted: false; reasonCodes: string[] };

export type CalibrationDatasetManifest = {
  schemaVersion: 1;
  captureVersion: typeof sessionCaptureVersion;
  datasetId: string;
  captureSessionId: string;
  runtimeSessionId: string;
  strategyVersion: typeof launchDerivativeReferencePolicy.strategyVersion;
  partition: CalibrationPartition;
  generatedAt: string;
  horizonMs: number;
  targetReturnPct: number;
  estimatedCostPct: number;
  observationCount: number;
  completedObservationCount: number;
  pendingObservationCount: number;
  unavailableObservationCount: number;
  excludedObservationCount: number;
  automaticThresholdActivation: false;
  calibrated: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

export type CalibrationDataset = {
  manifest: CalibrationDatasetManifest;
  observations: CalibrationObservation[];
};

export function createSessionCaptureConfig(
  input: CreateSessionCaptureConfigInput = {}
): SessionCaptureConfig {
  return {
    schemaVersion: 1,
    horizonMs: integerWithin(
      input.horizonMs,
      1_000,
      300_000,
      defaultSessionCaptureConfig.horizonMs
    ),
    targetReturnPct: numberWithin(
      input.targetReturnPct,
      0,
      1_000,
      defaultSessionCaptureConfig.targetReturnPct
    ),
    estimatedCostPct: numberWithin(
      input.estimatedCostPct,
      0,
      100,
      defaultSessionCaptureConfig.estimatedCostPct
    ),
    samplingIntervalMs: integerWithin(
      input.samplingIntervalMs,
      1_000,
      300_000,
      defaultSessionCaptureConfig.samplingIntervalMs
    ),
    maxOutcomeLagMs: integerWithin(
      input.maxOutcomeLagMs,
      0,
      10_000,
      defaultSessionCaptureConfig.maxOutcomeLagMs
    ),
    minimumTradeSamples: integerWithin(
      input.minimumTradeSamples,
      launchDerivativeReferencePolicy.minimumSamples.fullSignal,
      10_000,
      defaultSessionCaptureConfig.minimumTradeSamples
    ),
    maxObservationsPerSession: integerWithin(
      input.maxObservationsPerSession,
      1,
      100_000,
      defaultSessionCaptureConfig.maxObservationsPerSession
    )
  };
}

export function createCalibrationCaptureSession(input: {
  sessionId: string;
  runtimeSessionId: string;
  partition: CalibrationPartition;
  config?: CreateSessionCaptureConfigInput | undefined;
  startedAt: string;
}): CalibrationCaptureSession {
  const startedAt = requireIsoTime(input.startedAt, "capture start");

  if (!input.sessionId.trim() || !input.runtimeSessionId.trim()) {
    throw new RangeError("capture and runtime session IDs are required");
  }

  return {
    schemaVersion: 1,
    captureVersion: sessionCaptureVersion,
    sessionId: input.sessionId,
    runtimeSessionId: input.runtimeSessionId,
    strategyVersion: launchDerivativeReferencePolicy.strategyVersion,
    partition: input.partition,
    status: "active",
    config: createSessionCaptureConfig(input.config),
    startedAt,
    stoppedAt: null,
    stopReason: null,
    reasonCodes: [
      "CALIBRATION_CAPTURE_ACTIVE",
      "SIGNAL_POLICY_REFERENCE_ONLY",
      "LIVE_EXECUTION_DISABLED"
    ],
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true,
    createdAt: startedAt,
    updatedAt: startedAt
  };
}

export function stopCalibrationCaptureSession(
  session: CalibrationCaptureSession,
  input: {
    stoppedAt: string;
    reason: string;
    interrupted?: boolean | undefined;
  }
): CalibrationCaptureSession {
  const stoppedAt = requireIsoTime(input.stoppedAt, "capture stop");

  if (Date.parse(stoppedAt) < Date.parse(session.startedAt)) {
    throw new RangeError("capture stop cannot precede capture start");
  }

  return {
    ...session,
    status: input.interrupted ? "interrupted" : "stopped",
    stoppedAt,
    stopReason: input.reason,
    reasonCodes: uniqueStrings([
      ...session.reasonCodes.filter(
        (code) => code !== "CALIBRATION_CAPTURE_ACTIVE"
      ),
      input.interrupted
        ? "CALIBRATION_CAPTURE_INTERRUPTED"
        : "CALIBRATION_CAPTURE_STOPPED",
      "CALIBRATION_CAPTURE_EXPORT_READY"
    ]),
    updatedAt: stoppedAt
  };
}

export function createCapturedSignalObservation(input: {
  session: CalibrationCaptureSession;
  snapshot: CaptureSignalSnapshot;
  capturedAt: string;
}): CaptureObservationResult {
  const { session, snapshot } = input;
  const reasonCodes: string[] = [];
  const signalAtMs = Date.parse(snapshot.evaluatedAt);
  const capturedAtMs = Date.parse(input.capturedAt);

  if (session.status !== "active") {
    reasonCodes.push("CALIBRATION_CAPTURE_NOT_ACTIVE");
  }

  if (
    snapshot.derivativeScore.strategyVersion !== session.strategyVersion ||
    snapshot.derivativeScore.policySchemaVersion !== 1
  ) {
    reasonCodes.push("CALIBRATION_CAPTURE_STRATEGY_VERSION_MISMATCH");
  }

  if (
    !Number.isFinite(signalAtMs) ||
    !Number.isFinite(capturedAtMs) ||
    signalAtMs > capturedAtMs
  ) {
    reasonCodes.push("CALIBRATION_CAPTURE_INVALID_SIGNAL_TIME");
  } else if (signalAtMs < Date.parse(session.startedAt)) {
    reasonCodes.push("CALIBRATION_CAPTURE_SIGNAL_PRECEDES_SESSION");
  }

  if (!isPositiveFinite(snapshot.priceSol)) {
    reasonCodes.push("CALIBRATION_CAPTURE_ENTRY_PRICE_UNAVAILABLE");
  }

  if (snapshot.tradeSampleCount < session.config.minimumTradeSamples) {
    reasonCodes.push("CALIBRATION_CAPTURE_INSUFFICIENT_TRADE_SAMPLES");
  }

  if (
    !Number.isFinite(snapshot.derivativeScore.totalScore) ||
    snapshot.derivativeScore.totalScore < 0 ||
    snapshot.derivativeScore.totalScore > 100
  ) {
    reasonCodes.push("CALIBRATION_CAPTURE_INVALID_SCORE");
  }

  if (reasonCodes.length > 0 || snapshot.priceSol === null) {
    return { accepted: false, reasonCodes: uniqueStrings(reasonCodes) };
  }

  const signalAt = new Date(signalAtMs).toISOString();
  const capturedAt = new Date(capturedAtMs).toISOString();
  const observationId = [
    session.sessionId,
    snapshot.sourceSnapshotId,
    session.config.horizonMs
  ].join(":");

  return {
    accepted: true,
    observation: {
      schemaVersion: 1,
      captureVersion: sessionCaptureVersion,
      observationId,
      captureSessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      mint: snapshot.mint,
      strategyVersion: launchDerivativeReferencePolicy.strategyVersion,
      partition: session.partition,
      sourceSnapshotId: snapshot.sourceSnapshotId,
      signalAt,
      signalAgeSeconds: round(nonNegative(snapshot.ageSeconds)),
      score: round(snapshot.derivativeScore.totalScore),
      label: snapshot.derivativeScore.strengthLabel,
      tradeSampleCount: Math.max(0, Math.floor(snapshot.tradeSampleCount)),
      entryPriceSol: snapshot.priceSol,
      horizonMs: session.config.horizonMs,
      targetReturnPct: session.config.targetReturnPct,
      estimatedCostPct: session.config.estimatedCostPct,
      maxOutcomeLagMs: session.config.maxOutcomeLagMs,
      status: "pending",
      outcomeAt: null,
      outcomePriceSol: null,
      forwardReturnPct: null,
      maxFavorableExcursionPct: null,
      maxAdverseExcursionPct: null,
      targetReached: null,
      reasonCodes: [
        "CALIBRATION_SIGNAL_CAPTURED",
        "CALIBRATION_OUTCOME_PENDING",
        "SIGNAL_POLICY_REFERENCE_ONLY"
      ],
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      createdAt: capturedAt,
      updatedAt: capturedAt
    }
  };
}

export function materializeCapturedSignalOutcome(input: {
  observation: CapturedSignalObservation;
  buckets: readonly OutcomePriceBucket[];
  asOf: string;
}): CapturedSignalObservation {
  const { observation } = input;

  if (observation.status === "complete") {
    return observation;
  }

  const asOfMs = Date.parse(input.asOf);
  const signalAtMs = Date.parse(observation.signalAt);
  const targetAtMs = signalAtMs + observation.horizonMs;
  const deadlineMs = targetAtMs + observation.maxOutcomeLagMs;

  if (!Number.isFinite(asOfMs) || !Number.isFinite(signalAtMs)) {
    throw new RangeError("materialization timestamps must be valid");
  }

  if (asOfMs < targetAtMs) {
    return observation;
  }

  const eligible = input.buckets
    .map((bucket) => ({
      bucket,
      startMs: Date.parse(bucket.bucketStart),
      endMs: Date.parse(bucket.bucketEnd)
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.startMs) &&
        Number.isFinite(entry.endMs) &&
        entry.startMs >= signalAtMs &&
        entry.endMs > entry.startMs &&
        entry.endMs >= targetAtMs &&
        entry.endMs <= deadlineMs &&
        entry.endMs <= asOfMs &&
        !entry.bucket.synthetic &&
        isPositiveFinite(entry.bucket.closeSol)
    )
    .sort(
      (left, right) => left.endMs - right.endMs || left.startMs - right.startMs
    );
  const outcome = eligible[0];

  if (!outcome || outcome.bucket.closeSol === null) {
    if (asOfMs < deadlineMs) {
      return observation;
    }

    return {
      ...observation,
      status: "unavailable",
      reasonCodes: uniqueStrings([
        ...observation.reasonCodes.filter(
          (code) => code !== "CALIBRATION_OUTCOME_PENDING"
        ),
        "CALIBRATION_OUTCOME_BUCKET_UNAVAILABLE"
      ]),
      updatedAt: new Date(asOfMs).toISOString()
    };
  }

  const pathBuckets = input.buckets.filter((bucket) => {
    const startMs = Date.parse(bucket.bucketStart);
    const endMs = Date.parse(bucket.bucketEnd);

    return (
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      startMs >= signalAtMs &&
      endMs > startMs &&
      endMs <= outcome.endMs &&
      !bucket.synthetic
    );
  });
  const highPrice = maximumPositive([
    observation.entryPriceSol,
    outcome.bucket.closeSol,
    ...pathBuckets.map((bucket) => bucket.highSol)
  ]);
  const lowPrice = minimumPositive([
    observation.entryPriceSol,
    outcome.bucket.closeSol,
    ...pathBuckets.map((bucket) => bucket.lowSol)
  ]);
  const forwardReturnPct = percentReturn(
    observation.entryPriceSol,
    outcome.bucket.closeSol
  );
  const maxFavorableExcursionPct = percentReturn(
    observation.entryPriceSol,
    highPrice ?? outcome.bucket.closeSol
  );
  const maxAdverseExcursionPct = percentReturn(
    observation.entryPriceSol,
    lowPrice ?? outcome.bucket.closeSol
  );

  return {
    ...observation,
    status: "complete",
    outcomeAt: new Date(outcome.endMs).toISOString(),
    outcomePriceSol: outcome.bucket.closeSol,
    forwardReturnPct,
    maxFavorableExcursionPct,
    maxAdverseExcursionPct,
    targetReached:
      forwardReturnPct - observation.estimatedCostPct >=
      observation.targetReturnPct,
    reasonCodes: uniqueStrings([
      ...observation.reasonCodes.filter(
        (code) => code !== "CALIBRATION_OUTCOME_PENDING"
      ),
      "CALIBRATION_OUTCOME_MATERIALIZED",
      "CALIBRATION_FORWARD_ONLY_WINDOW"
    ]),
    updatedAt: new Date(asOfMs).toISOString()
  };
}

export function buildCalibrationDataset(input: {
  session: CalibrationCaptureSession;
  observations: readonly CapturedSignalObservation[];
  generatedAt: string;
}): CalibrationDataset {
  const generatedAt = requireIsoTime(input.generatedAt, "dataset generation");
  const sessionObservations = input.observations
    .filter(
      (observation) =>
        observation.captureSessionId === input.session.sessionId &&
        observation.strategyVersion === input.session.strategyVersion &&
        observation.partition === input.session.partition
    )
    .sort(
      (left, right) =>
        Date.parse(left.signalAt) - Date.parse(right.signalAt) ||
        left.mint.localeCompare(right.mint) ||
        left.observationId.localeCompare(right.observationId)
    );
  const complete = sessionObservations.filter(
    (observation) =>
      observation.status === "complete" &&
      observation.outcomeAt !== null &&
      observation.forwardReturnPct !== null &&
      observation.targetReached !== null &&
      Date.parse(observation.outcomeAt) > Date.parse(observation.signalAt)
  );
  const observations: CalibrationObservation[] = complete.map(
    (observation) => ({
      observationId: observation.observationId,
      partition: observation.partition,
      strategyVersion: observation.strategyVersion,
      signalAt: observation.signalAt,
      outcomeAt: observation.outcomeAt ?? observation.signalAt,
      score: observation.score,
      targetReached: observation.targetReached ?? false,
      forwardReturnPct: observation.forwardReturnPct ?? 0,
      estimatedCostPct: observation.estimatedCostPct,
      maxFavorableExcursionPct:
        observation.maxFavorableExcursionPct ?? undefined,
      maxAdverseExcursionPct: observation.maxAdverseExcursionPct ?? undefined
    })
  );
  const pendingObservationCount = sessionObservations.filter(
    (observation) => observation.status === "pending"
  ).length;
  const unavailableObservationCount = sessionObservations.filter(
    (observation) => observation.status === "unavailable"
  ).length;

  return {
    manifest: {
      schemaVersion: 1,
      captureVersion: sessionCaptureVersion,
      datasetId: `${input.session.sessionId}:${input.session.strategyVersion}:${input.session.config.horizonMs}`,
      captureSessionId: input.session.sessionId,
      runtimeSessionId: input.session.runtimeSessionId,
      strategyVersion: input.session.strategyVersion,
      partition: input.session.partition,
      generatedAt,
      horizonMs: input.session.config.horizonMs,
      targetReturnPct: input.session.config.targetReturnPct,
      estimatedCostPct: input.session.config.estimatedCostPct,
      observationCount: sessionObservations.length,
      completedObservationCount: observations.length,
      pendingObservationCount,
      unavailableObservationCount,
      excludedObservationCount:
        sessionObservations.length -
        observations.length -
        pendingObservationCount -
        unavailableObservationCount,
      automaticThresholdActivation: false,
      calibrated: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      reasonCodes: [
        "CALIBRATION_DATASET_FORWARD_ONLY",
        "CALIBRATION_DATASET_SESSION_PARTITIONED",
        "CALIBRATION_THRESHOLDS_NOT_AUTO_ACTIVATED"
      ]
    },
    observations
  };
}

export function serializeCalibrationDataset(
  dataset: CalibrationDataset,
  format: CalibrationExportFormat
): string {
  if (format === "json") {
    return JSON.stringify(dataset, null, 2);
  }

  if (format === "jsonl") {
    return [
      JSON.stringify({ recordType: "manifest", manifest: dataset.manifest }),
      ...dataset.observations.map((observation) =>
        JSON.stringify({ recordType: "observation", ...observation })
      )
    ].join("\n");
  }

  const columns: Array<keyof CalibrationObservation> = [
    "observationId",
    "partition",
    "strategyVersion",
    "signalAt",
    "outcomeAt",
    "score",
    "targetReached",
    "forwardReturnPct",
    "estimatedCostPct",
    "maxFavorableExcursionPct",
    "maxAdverseExcursionPct"
  ];

  return [
    `# axi-calibration-manifest=${JSON.stringify(dataset.manifest)}`,
    columns.join(","),
    ...dataset.observations.map((observation) =>
      columns.map((column) => csvCell(observation[column])).join(",")
    )
  ].join("\n");
}

export function getSessionCaptureRuntimeContract() {
  return {
    schemaVersion: 1,
    captureVersion: sessionCaptureVersion,
    implementationStatus: "implemented" as const,
    activationMode: "manual_local_only" as const,
    defaultActive: false as const,
    strategyVersion: launchDerivativeReferencePolicy.strategyVersion,
    supportedPartitions: ["train", "validation"] as const,
    supportedFormats: ["json", "jsonl", "csv"] as const,
    defaultConfig: defaultSessionCaptureConfig,
    outcomePolicy: "first_real_bucket_at_horizon_with_bounded_lag" as const,
    partitionPolicy: "one_partition_per_capture_session" as const,
    futureDataRejected: true as const,
    automaticThresholdActivation: false as const,
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const,
    reasonCodes: [
      "CALIBRATION_CAPTURE_MANUAL_START_REQUIRED",
      "CALIBRATION_OUTCOMES_FORWARD_ONLY",
      "LIVE_EXECUTION_DISABLED"
    ]
  };
}

function percentReturn(entryPrice: number, exitPrice: number): number {
  return round(((exitPrice - entryPrice) / entryPrice) * 100, 6);
}

function maximumPositive(values: readonly (number | null)[]): number | null {
  const valid = values.filter(isPositiveFinite);
  return valid.length > 0 ? Math.max(...valid) : null;
}

function minimumPositive(values: readonly (number | null)[]): number | null {
  const valid = values.filter(isPositiveFinite);
  return valid.length > 0 ? Math.min(...valid) : null;
}

function isPositiveFinite(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function integerWithin(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return Math.floor(numberWithin(value, minimum, maximum, fallback));
}

function numberWithin(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const finiteValue =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(finiteValue, minimum), maximum);
}

function requireIsoTime(value: string, label: string): string {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${label} timestamp must be valid`);
  }

  return new Date(parsed).toISOString();
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  const text = String(value);

  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function round(value: number, precision = 3): number {
  const factor = 10 ** precision;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
