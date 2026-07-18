import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluatePaperStrategy } from "@axi/paper-strategy-evaluation";
import {
  createCalibrationCaptureSession,
  createCapturedSignalObservation,
  materializeCapturedSignalOutcome,
  stopCalibrationCaptureSession,
  type CalibrationDataset
} from "@axi/session-capture";
import {
  closeStorage,
  initStorage,
  saveCalibrationCaptureSession,
  saveCapturedSignalObservation,
  savePaperStrategyEvaluation,
  upsertLaunchTimeseriesBucket
} from "@axi/storage";
import {
  PaperLifecycleValidationServiceError,
  createPaperLifecycleValidationService
} from "../src/paper-lifecycle-validation-service";

let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-paper-lifecycle-"));
  initStorage({ databasePath: join(testDirectory, "axi.sqlite") });
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("PaperLifecycleValidationService", () => {
  it("replays finalized canonical paths and persists a non-activating report", () => {
    persistReplaySession(
      "capture-train",
      "train",
      "2026-01-01T00:00:00.000Z",
      120
    );
    persistReplaySession(
      "capture-validation",
      "validation",
      "2026-01-02T00:00:00.000Z",
      60
    );
    const upstream = evaluatePaperStrategy({
      evaluationId: "paper-upstream-candidate",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [
        createCandidateDataset(
          "capture-train",
          "train",
          "2026-01-01T00:00:00.000Z",
          120
        ),
        createCandidateDataset(
          "capture-validation",
          "validation",
          "2026-01-02T00:00:00.000Z",
          60
        )
      ],
      thresholdCandidates: [75]
    });
    savePaperStrategyEvaluation(upstream);
    const service = createPaperLifecycleValidationService({
      createId: () => "test-1",
      now: () => new Date("2026-01-03T00:01:00.000Z")
    });

    const report = service.evaluate({
      paperStrategyEvaluationId: upstream.evaluationId
    });

    expect(report).toMatchObject({
      validationId: "paper-lifecycle-test-1",
      validationStatus: "insufficient_evidence",
      selectedThreshold: 75,
      dataAudit: {
        caseCount: 180,
        replayPointCount: 540,
        integrityValid: true,
        temporalHoldoutValid: true
      },
      automaticPaperTradingActivation: false,
      automaticLiveExecution: false,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
    expect(report.trades).toHaveLength(180);
    expect(report.trades.some((trade) => trade.entryFillAt !== null)).toBe(
      true
    );
    expect(service.getValidation(report.validationId)).toEqual(report);
    expect(service.getValidations()).toHaveLength(1);
    expect(service.getStatus()).toMatchObject({
      validationCount: 1,
      statusCounts: { insufficient_evidence: 1 },
      latestValidation: { validationId: report.validationId },
      automaticPaperTradingActivation: false,
      automaticLiveExecution: false
    });
  });

  it("rejects missing and upstream-ineligible strategy evaluations", () => {
    const service = createPaperLifecycleValidationService();
    const ineligible = evaluatePaperStrategy({
      evaluationId: "paper-upstream-ineligible",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [
        createCandidateDataset(
          "capture-small-train",
          "train",
          "2026-01-01T00:00:00.000Z",
          1
        ),
        createCandidateDataset(
          "capture-small-validation",
          "validation",
          "2026-01-02T00:00:00.000Z",
          1
        )
      ],
      thresholdCandidates: [75]
    });
    savePaperStrategyEvaluation(ineligible);

    expect(() =>
      service.evaluate({ paperStrategyEvaluationId: "missing" })
    ).toThrow(PaperLifecycleValidationServiceError);
    expect(() =>
      service.evaluate({
        paperStrategyEvaluationId: ineligible.evaluationId
      })
    ).toThrow("has not passed its temporal holdout");
    expect(service.getStatus()).toMatchObject({
      validationCount: 0,
      latestValidation: null,
      contract: {
        implementationStatus: "implemented",
        sharedCapitalModeled: true,
        liveExecutionDisabled: true
      }
    });
  });
});

function persistReplaySession(
  sessionId: string,
  partition: "train" | "validation",
  startedAt: string,
  count: number
): void {
  const session = createCalibrationCaptureSession({
    sessionId,
    runtimeSessionId: `runtime-${sessionId}`,
    partition,
    config: {
      horizonMs: 3_000,
      targetReturnPct: 5,
      estimatedCostPct: 1,
      samplingIntervalMs: 1_000,
      maxOutcomeLagMs: 0,
      maxObservationsPerSession: 1_000
    },
    startedAt
  });
  saveCalibrationCaptureSession(session);
  const startedAtMs = Date.parse(startedAt);

  for (
    let observationIndex = 0;
    observationIndex < count;
    observationIndex += 1
  ) {
    const signalAt = new Date(
      startedAtMs + observationIndex * 4_000
    ).toISOString();
    const outcomeAt = new Date(Date.parse(signalAt) + 3_000).toISOString();
    const mint = `${sessionId}-mint-${observationIndex}`;
    const captured = createCapturedSignalObservation({
      session,
      snapshot: {
        sourceSnapshotId: observationIndex + 1,
        mint,
        evaluatedAt: signalAt,
        ageSeconds: observationIndex + 1,
        tradeSampleCount: 3,
        priceSol: 1,
        derivativeScore: {
          totalScore: 85,
          strengthLabel: "ripping",
          policySchemaVersion: 1,
          strategyVersion: "launch-derivative-reference-v1",
          policyStatus: "reference_only",
          calibrated: false,
          confidenceAppliedToSignalScore: false
        }
      },
      capturedAt: signalAt
    });

    if (!captured.accepted) {
      throw new Error(captured.reasonCodes.join(","));
    }

    saveCapturedSignalObservation(
      materializeCapturedSignalOutcome({
        observation: captured.observation,
        buckets: [
          {
            bucketStart: signalAt,
            bucketEnd: outcomeAt,
            openSol: 1,
            highSol: 1.22,
            lowSol: 0.99,
            closeSol: 1.2,
            synthetic: false
          }
        ],
        asOf: outcomeAt
      })
    );

    [1.03, 1.15, 1.2].forEach((priceSol, pointIndex) => {
      const bucketStart = new Date(
        Date.parse(signalAt) + pointIndex * 1_000
      ).toISOString();
      const bucketEnd = new Date(
        Date.parse(signalAt) + (pointIndex + 1) * 1_000
      ).toISOString();
      upsertLaunchTimeseriesBucket(
        createBucket(mint, bucketStart, bucketEnd, priceSol)
      );
    });
  }

  const stoppedAt = new Date(
    startedAtMs + (count - 1) * 4_000 + 3_000
  ).toISOString();
  saveCalibrationCaptureSession(
    stopCalibrationCaptureSession(session, {
      stoppedAt,
      reason: "test_complete"
    })
  );
}

function createBucket(
  mint: string,
  bucketStart: string,
  bucketEnd: string,
  priceSol: number
) {
  return {
    schemaVersion: 1 as const,
    bucketMs: 1000 as const,
    mint,
    bucketStart,
    bucketEnd,
    firstTradeAt: bucketStart,
    lastTradeAt: bucketEnd,
    openSol: priceSol,
    highSol: priceSol,
    lowSol: priceSol,
    closeSol: priceSol,
    volumeSol: 1,
    buyVolumeSol: 0.8,
    sellVolumeSol: 0.2,
    vwapSol: priceSol,
    openUsd: null,
    highUsd: null,
    lowUsd: null,
    closeUsd: null,
    volumeUsd: 0,
    buyVolumeUsd: 0,
    sellVolumeUsd: 0,
    vwapUsd: null,
    tokenVolume: 1_000,
    tradeCount: 10,
    buyCount: 8,
    sellCount: 2,
    uniqueBuyers: 8,
    uniqueSellers: 2,
    sourceCount: 1,
    sources: ["test"],
    confidence: "high" as const,
    complete: true,
    synthetic: false,
    reasonCodes: ["TIMESERIES_BUCKET_1S"],
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const
  };
}

function createCandidateDataset(
  captureSessionId: string,
  partition: "train" | "validation",
  startAt: string,
  count: number
): CalibrationDataset {
  const startMs = Date.parse(startAt);
  const observations = Array.from({ length: count }, (_, index) => {
    const highScore = index % 2 === 0;
    const signalAt = new Date(startMs + index * 1_000).toISOString();

    return {
      observationId: `${captureSessionId}-provenance-${index}`,
      partition,
      strategyVersion: "launch-derivative-reference-v1",
      signalAt,
      outcomeAt: new Date(startMs + (index + 60) * 1_000).toISOString(),
      score: highScore ? 85 : 20,
      targetReached: highScore,
      forwardReturnPct: highScore ? 10 : -2,
      estimatedCostPct: 1,
      maxFavorableExcursionPct: highScore ? 15 : 1,
      maxAdverseExcursionPct: highScore ? -2 : -5
    };
  });

  return {
    manifest: {
      schemaVersion: 1,
      captureVersion: "calibration-session-capture-v1",
      datasetId: `${captureSessionId}:launch-derivative-reference-v1:60000`,
      captureSessionId,
      runtimeSessionId: `runtime-${partition}`,
      strategyVersion: "launch-derivative-reference-v1",
      partition,
      generatedAt: "2026-01-03T00:00:00.000Z",
      horizonMs: 60_000,
      targetReturnPct: 5,
      estimatedCostPct: 1,
      observationCount: observations.length,
      completedObservationCount: observations.length,
      pendingObservationCount: 0,
      unavailableObservationCount: 0,
      excludedObservationCount: 0,
      automaticThresholdActivation: false,
      calibrated: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      reasonCodes: ["CALIBRATION_DATASET_FORWARD_ONLY"]
    },
    observations
  };
}
