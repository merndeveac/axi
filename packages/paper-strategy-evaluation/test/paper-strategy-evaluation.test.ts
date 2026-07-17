import { describe, expect, it } from "vitest";
import type { CalibrationDataset } from "@axi/session-capture";
import {
  createPaperStrategyEvaluationConfig,
  evaluatePaperStrategy,
  getPaperStrategyEvaluationRuntimeContract
} from "../src";

describe("@axi/paper-strategy-evaluation", () => {
  it("selects on training data and passes a later positive holdout", () => {
    const report = evaluatePaperStrategy({
      evaluationId: "evaluation-1",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [trainingDataset(), validationDataset()],
      thresholdCandidates: [75]
    });

    expect(report).toMatchObject({
      evaluationVersion: "paper-strategy-evaluation-v1",
      evaluationStatus: "paper_observation_candidate",
      selectedThreshold: 75,
      datasetAudit: {
        integrityValid: true,
        qualitySufficient: true,
        temporalHoldoutValid: true,
        completedObservationCount: 180
      },
      trainingPerformance: {
        tradeCount: 60,
        averageNetReturnPct: 9,
        profitFactorStatus: "no_losses"
      },
      validationPerformance: {
        tradeCount: 30,
        averageNetReturnPct: 9,
        netReturnConfidenceLowerBoundPct: 9,
        profitFactorStatus: "no_losses"
      },
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
    expect(report.acceptanceGates.every((gate) => gate.passed)).toBe(true);
    expect(report.calibration.trainingCandidate?.threshold).toBe(75);
    expect(report.calibration.candidateValidation?.threshold).toBe(75);
  });

  it("rejects a threshold when sufficient holdout evidence loses after costs", () => {
    const report = evaluatePaperStrategy({
      evaluationId: "evaluation-negative-holdout",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [trainingDataset(), validationDataset({ negative: true })],
      thresholdCandidates: [75]
    });

    expect(report).toMatchObject({
      evaluationStatus: "holdout_rejected",
      selectedThreshold: 75,
      validationPerformance: {
        tradeCount: 30,
        averageNetReturnPct: -11,
        profitFactorStatus: "finite"
      },
      automaticPaperTradingActivation: false
    });
    expect(
      report.acceptanceGates.find(
        (gate) => gate.gate === "validation_expectancy"
      )
    ).toMatchObject({ passed: false });
  });

  it("fails closed on temporal leakage between training and validation", () => {
    const report = evaluatePaperStrategy({
      evaluationId: "evaluation-overlap",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [
        trainingDataset(),
        validationDataset({ startAt: "2026-01-01T00:01:00.000Z" })
      ],
      thresholdCandidates: [75]
    });

    expect(report).toMatchObject({
      evaluationStatus: "invalid_dataset",
      selectedThreshold: null,
      datasetAudit: {
        integrityValid: false,
        temporalHoldoutValid: false
      }
    });
    expect(report.reasonCodes).toContain(
      "PAPER_STRATEGY_TEMPORAL_HOLDOUT_VIOLATION"
    );
  });

  it("does not evaluate a dataset while outcomes remain pending", () => {
    const validation = validationDataset();
    const report = evaluatePaperStrategy({
      evaluationId: "evaluation-pending",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [
        trainingDataset(),
        {
          ...validation,
          manifest: {
            ...validation.manifest,
            observationCount: validation.manifest.observationCount + 1,
            pendingObservationCount: 1
          }
        }
      ],
      thresholdCandidates: [75]
    });

    expect(report).toMatchObject({
      evaluationStatus: "data_quality_failed",
      selectedThreshold: null,
      datasetAudit: {
        integrityValid: true,
        qualitySufficient: false,
        pendingObservationCount: 1
      },
      calibration: { acceptedObservationCount: 0 },
      automaticThresholdActivation: false
    });
  });

  it("marks rejected calibration observations as an invalid dataset", () => {
    const validation = validationDataset();
    const first = validation.observations[0];

    if (!first) {
      throw new Error("validation fixture is empty");
    }

    const report = evaluatePaperStrategy({
      evaluationId: "evaluation-lookahead",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [
        trainingDataset(),
        {
          ...validation,
          observations: [
            { ...first, outcomeAt: first.signalAt },
            ...validation.observations.slice(1)
          ]
        }
      ],
      thresholdCandidates: [75]
    });

    expect(report).toMatchObject({
      evaluationStatus: "invalid_dataset",
      calibration: {
        rejectedObservationCount: 1,
        lookaheadViolationCount: 1
      },
      automaticThresholdActivation: false
    });
  });

  it("reports insufficient evidence without weakening calibration floors", () => {
    const train = trainingDataset({ count: 10 });
    const validation = validationDataset({ count: 10 });
    const report = evaluatePaperStrategy({
      evaluationId: "evaluation-small",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [train, validation],
      thresholdCandidates: [75],
      evidenceRequirements: {
        minimumTrainingObservations: 1,
        minimumValidationObservations: 1,
        minimumPositiveOutcomes: 1,
        minimumSignalsPerThreshold: 1
      }
    });

    expect(report).toMatchObject({
      evaluationStatus: "insufficient_evidence",
      selectedThreshold: null,
      automaticPaperTradingActivation: false
    });
    expect(report.calibration.evidenceRequirements).toMatchObject({
      minimumTrainingObservations: 100,
      minimumValidationObservations: 50,
      minimumPositiveOutcomes: 20,
      minimumSignalsPerThreshold: 20
    });
  });

  it("bounds capital assumptions and publishes a non-activating contract", () => {
    expect(
      createPaperStrategyEvaluationConfig({
        startingCapitalSol: -1,
        positionSizeSol: 100
      })
    ).toMatchObject({
      startingCapitalSol: 0.01,
      positionSizeSol: 0.01,
      minimumDatasetCompletenessRatio: 0.95
    });
    expect(getPaperStrategyEvaluationRuntimeContract()).toMatchObject({
      implementationStatus: "implemented",
      activationMode: "offline_local_only",
      temporalHoldoutRequired: true,
      incompleteOutcomesRejected: true,
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      tradingDisabled: true
    });
  });
});

function trainingDataset(
  options: { count?: number; startAt?: string } = {}
): CalibrationDataset {
  return dataset({
    captureSessionId: "capture-train",
    count: options.count ?? 120,
    partition: "train",
    startAt: options.startAt ?? "2026-01-01T00:00:00.000Z"
  });
}

function validationDataset(
  options: { count?: number; negative?: boolean; startAt?: string } = {}
): CalibrationDataset {
  return dataset({
    captureSessionId: "capture-validation",
    count: options.count ?? 60,
    negative: options.negative ?? false,
    partition: "validation",
    startAt: options.startAt ?? "2026-01-02T00:00:00.000Z"
  });
}

function dataset(input: {
  captureSessionId: string;
  count: number;
  negative?: boolean;
  partition: "train" | "validation";
  startAt: string;
}): CalibrationDataset {
  const startMs = Date.parse(input.startAt);
  const observations = Array.from({ length: input.count }, (_, index) => {
    const highScore = index % 2 === 0;
    const highScoreIndex = Math.floor(index / 2);
    const negativeHoldoutTrade =
      input.negative === true && highScore && highScoreIndex >= 20;
    const forwardReturnPct = highScore ? (negativeHoldoutTrade ? -50 : 10) : -2;
    const signalAt = new Date(startMs + index * 1_000).toISOString();
    const outcomeAt = new Date(startMs + (index + 60) * 1_000).toISOString();

    return {
      observationId: `${input.captureSessionId}-${index}`,
      partition: input.partition,
      strategyVersion: "launch-derivative-reference-v1",
      signalAt,
      outcomeAt,
      score: highScore ? 85 : 20,
      targetReached: highScore && !negativeHoldoutTrade,
      forwardReturnPct,
      estimatedCostPct: 1,
      maxFavorableExcursionPct: highScore ? 15 : 1,
      maxAdverseExcursionPct: highScore ? -2 : -5
    };
  });

  return {
    manifest: {
      schemaVersion: 1,
      captureVersion: "calibration-session-capture-v1",
      datasetId: `${input.captureSessionId}:launch-derivative-reference-v1:60000`,
      captureSessionId: input.captureSessionId,
      runtimeSessionId: `runtime-${input.partition}`,
      strategyVersion: "launch-derivative-reference-v1",
      partition: input.partition,
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
