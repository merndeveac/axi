import { describe, expect, it } from "vitest";
import {
  buildCalibrationDataset,
  createCalibrationCaptureSession,
  createCapturedSignalObservation,
  createSessionCaptureConfig,
  getSessionCaptureRuntimeContract,
  materializeCapturedSignalOutcome,
  serializeCalibrationDataset,
  stopCalibrationCaptureSession,
  type CalibrationCaptureSession,
  type CapturedSignalObservation,
  type OutcomePriceBucket
} from "../src";

const startedAt = "2026-01-01T00:00:00.000Z";

describe("@axi/session-capture", () => {
  it("creates a manual, versioned, session-level partition", () => {
    const session = createSession();

    expect(session).toMatchObject({
      captureVersion: "calibration-session-capture-v1",
      strategyVersion: "launch-derivative-reference-v1",
      partition: "train",
      status: "active",
      config: {
        horizonMs: 10_000,
        targetReturnPct: 20,
        estimatedCostPct: 8,
        minimumTradeSamples: 3
      },
      tradingDisabled: true
    });

    const stopped = stopCalibrationCaptureSession(session, {
      stoppedAt: "2026-01-01T00:01:00.000Z",
      reason: "test_complete"
    });
    expect(stopped).toMatchObject({
      status: "stopped",
      stopReason: "test_complete"
    });
  });

  it("bounds capture configuration to safe supported values", () => {
    expect(
      createSessionCaptureConfig({
        horizonMs: -1,
        targetReturnPct: -2,
        estimatedCostPct: 500,
        samplingIntervalMs: 1,
        maxOutcomeLagMs: 50_000,
        minimumTradeSamples: 1,
        maxObservationsPerSession: 200_000
      })
    ).toEqual({
      schemaVersion: 1,
      horizonMs: 1_000,
      targetReturnPct: 0,
      estimatedCostPct: 100,
      samplingIntervalMs: 1_000,
      maxOutcomeLagMs: 10_000,
      minimumTradeSamples: 3,
      maxObservationsPerSession: 100_000
    });
  });

  it("captures only priced, full-sample snapshots from the matching policy", () => {
    const session = createSession();
    const accepted = createCapturedSignalObservation({
      session,
      snapshot: signalSnapshot(),
      capturedAt: "2026-01-01T00:00:02.000Z"
    });

    expect(accepted).toMatchObject({
      accepted: true,
      observation: {
        observationId: "capture-1:42:10000",
        sourceSnapshotId: 42,
        score: 65,
        entryPriceSol: 100,
        status: "pending",
        outcomeAt: null,
        tradingDisabled: true
      }
    });

    const wrongVersion = createCapturedSignalObservation({
      session,
      snapshot: {
        ...signalSnapshot(),
        derivativeScore: {
          ...signalSnapshot().derivativeScore,
          strategyVersion: "future-policy"
        }
      },
      capturedAt: "2026-01-01T00:00:02.000Z"
    });
    const noPrice = createCapturedSignalObservation({
      session,
      snapshot: { ...signalSnapshot(), priceSol: null },
      capturedAt: "2026-01-01T00:00:02.000Z"
    });
    const incomplete = createCapturedSignalObservation({
      session,
      snapshot: { ...signalSnapshot(), tradeSampleCount: 2 },
      capturedAt: "2026-01-01T00:00:02.000Z"
    });
    const beforeSession = createCapturedSignalObservation({
      session,
      snapshot: {
        ...signalSnapshot(),
        evaluatedAt: "2025-12-31T23:59:59.000Z"
      },
      capturedAt: "2026-01-01T00:00:02.000Z"
    });

    expect(wrongVersion).toMatchObject({
      accepted: false,
      reasonCodes: ["CALIBRATION_CAPTURE_STRATEGY_VERSION_MISMATCH"]
    });
    expect(noPrice).toMatchObject({
      accepted: false,
      reasonCodes: ["CALIBRATION_CAPTURE_ENTRY_PRICE_UNAVAILABLE"]
    });
    expect(incomplete).toMatchObject({
      accepted: false,
      reasonCodes: ["CALIBRATION_CAPTURE_INSUFFICIENT_TRADE_SAMPLES"]
    });
    expect(beforeSession).toMatchObject({
      accepted: false,
      reasonCodes: ["CALIBRATION_CAPTURE_SIGNAL_PRECEDES_SESSION"]
    });
  });

  it("materializes only after the horizon from the first eligible real bucket", () => {
    const observation = pendingObservation();
    const buckets: OutcomePriceBucket[] = [
      bucket(-1, 0.5, 100, 999, 1),
      bucket(4, 5, 110, 120, 90),
      bucket(9, 10, 130, 135, 105),
      bucket(10, 11, 200, 210, 125),
      { ...bucket(9, 10, 999, 999, 1), synthetic: true }
    ];
    const pending = materializeCapturedSignalOutcome({
      observation,
      buckets,
      asOf: "2026-01-01T00:00:09.999Z"
    });
    const complete = materializeCapturedSignalOutcome({
      observation,
      buckets,
      asOf: "2026-01-01T00:00:11.000Z"
    });

    expect(pending.status).toBe("pending");
    expect(complete).toMatchObject({
      status: "complete",
      outcomeAt: "2026-01-01T00:00:10.000Z",
      outcomePriceSol: 130,
      forwardReturnPct: 30,
      maxFavorableExcursionPct: 35,
      maxAdverseExcursionPct: -10,
      targetReached: true
    });
    expect(complete.reasonCodes).toContain("CALIBRATION_FORWARD_ONLY_WINDOW");
  });

  it("marks a matured observation unavailable instead of carrying a stale price", () => {
    const unavailable = materializeCapturedSignalOutcome({
      observation: pendingObservation(),
      buckets: [bucket(4, 5, 110, 120, 90)],
      asOf: "2026-01-01T00:00:12.000Z"
    });

    expect(unavailable).toMatchObject({
      status: "unavailable",
      outcomeAt: null,
      outcomePriceSol: null
    });
    expect(unavailable.reasonCodes).toContain(
      "CALIBRATION_OUTCOME_BUCKET_UNAVAILABLE"
    );
  });

  it("exports only complete forward observations with a deterministic manifest", () => {
    const session = createSession();
    const complete = materializeCapturedSignalOutcome({
      observation: pendingObservation(),
      buckets: [bucket(9, 10, 130, 135, 90)],
      asOf: "2026-01-01T00:00:10.000Z"
    });
    const dataset = buildCalibrationDataset({
      session,
      observations: [
        { ...pendingObservation(), observationId: "pending" },
        complete
      ],
      generatedAt: "2026-01-01T00:01:00.000Z"
    });

    expect(dataset.manifest).toMatchObject({
      observationCount: 2,
      completedObservationCount: 1,
      pendingObservationCount: 1,
      unavailableObservationCount: 0,
      automaticThresholdActivation: false,
      calibrated: false
    });
    expect(dataset.observations).toEqual([
      expect.objectContaining({
        observationId: "capture-1:42:10000",
        partition: "train",
        signalAt: "2026-01-01T00:00:00.000Z",
        outcomeAt: "2026-01-01T00:00:10.000Z",
        forwardReturnPct: 30,
        estimatedCostPct: 8
      })
    ]);
    expect(JSON.parse(serializeCalibrationDataset(dataset, "json"))).toEqual(
      dataset
    );
    expect(
      serializeCalibrationDataset(dataset, "jsonl").split("\n")
    ).toHaveLength(2);
    expect(serializeCalibrationDataset(dataset, "csv")).toContain(
      "observationId,partition,strategyVersion"
    );
    expect(serializeCalibrationDataset(dataset, "csv")).toContain(
      `# axi-calibration-manifest={"schemaVersion":1,"captureVersion":"calibration-session-capture-v1"`
    );
  });

  it("publishes a disabled-by-default runtime contract", () => {
    expect(getSessionCaptureRuntimeContract()).toMatchObject({
      implementationStatus: "implemented",
      activationMode: "manual_local_only",
      defaultActive: false,
      outcomePolicy: "first_real_bucket_at_horizon_with_bounded_lag",
      partitionPolicy: "one_partition_per_capture_session",
      futureDataRejected: true,
      automaticThresholdActivation: false,
      tradingDisabled: true
    });
  });
});

function createSession(): CalibrationCaptureSession {
  return createCalibrationCaptureSession({
    sessionId: "capture-1",
    runtimeSessionId: "runtime-1",
    partition: "train",
    config: {
      horizonMs: 10_000,
      targetReturnPct: 20,
      estimatedCostPct: 8,
      samplingIntervalMs: 1_000,
      maxOutcomeLagMs: 2_000
    },
    startedAt
  });
}

function signalSnapshot() {
  return {
    sourceSnapshotId: 42,
    mint: "CaptureMint11111111111111111111111111111111",
    evaluatedAt: startedAt,
    ageSeconds: 10,
    tradeSampleCount: 3,
    priceSol: 100,
    derivativeScore: {
      totalScore: 65,
      strengthLabel: "hot" as const,
      policySchemaVersion: 1 as const,
      strategyVersion: "launch-derivative-reference-v1",
      policyStatus: "reference_only" as const,
      calibrated: false as const,
      confidenceAppliedToSignalScore: false as const
    }
  };
}

function pendingObservation(): CapturedSignalObservation {
  const result = createCapturedSignalObservation({
    session: createSession(),
    snapshot: signalSnapshot(),
    capturedAt: "2026-01-01T00:00:02.000Z"
  });

  if (!result.accepted) {
    throw new Error(result.reasonCodes.join(","));
  }

  return result.observation;
}

function bucket(
  startSecond: number,
  endSecond: number,
  closeSol: number,
  highSol: number,
  lowSol: number
): OutcomePriceBucket {
  const epoch = Date.parse(startedAt);

  return {
    bucketStart: new Date(epoch + startSecond * 1_000).toISOString(),
    bucketEnd: new Date(epoch + endSecond * 1_000).toISOString(),
    openSol: closeSol,
    highSol,
    lowSol,
    closeSol,
    synthetic: false
  };
}
