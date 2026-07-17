import { describe, expect, it } from "vitest";
import {
  classifySignalScore,
  evaluateSignalCalibration,
  getSignalCalibrationRuntimeContract,
  launchDerivativeReferencePolicy,
  scoreLaunchDerivativeSignal,
  type CalibrationObservation,
  type SignalFeatureScores
} from "../src";

const maximumFeatures: SignalFeatureScores = {
  volumeVelocity: 100,
  volumeAcceleration: 100,
  priceVelocity: 100,
  priceAcceleration: 100,
  buyerVelocity: 100,
  buyerAcceleration: 100,
  tradeVelocity: 100,
  buyPressure: 100
};

describe("@axi/signal-calibration", () => {
  it("defines one bounded reference policy with ordered thresholds", () => {
    const weightTotal = Object.values(
      launchDerivativeReferencePolicy.weights
    ).reduce((sum, weight) => sum + weight, 0);

    expect(weightTotal).toBeCloseTo(1);
    expect(launchDerivativeReferencePolicy.thresholds.watch).toBeLessThan(
      launchDerivativeReferencePolicy.thresholds.hot
    );
    expect(launchDerivativeReferencePolicy.thresholds.hot).toBeLessThan(
      launchDerivativeReferencePolicy.thresholds.ripping
    );
    expect(launchDerivativeReferencePolicy).toMatchObject({
      policyStatus: "reference_only",
      calibrated: false,
      confidenceAppliedToSignalScore: false
    });
  });

  it("scores positive strength deterministically without applying confidence", () => {
    const score = scoreLaunchDerivativeSignal({
      featureScores: maximumFeatures,
      tradeSampleCount: 3,
      sellPressure: "none",
      riskLevel: "low",
      hardReject: false
    });

    expect(score).toMatchObject({
      totalScore: 100,
      strengthLabel: "ripping",
      strategyVersion: "launch-derivative-reference-v1",
      policyStatus: "reference_only",
      calibrated: false,
      confidenceAppliedToSignalScore: false
    });
    expect(score.reasonCodes).toContain("SIGNAL_POLICY_REFERENCE_ONLY");
    expect(JSON.stringify(score)).not.toMatch(/NaN|Infinity/);
  });

  it("caps incomplete samples at watch and lets hard rejection override score", () => {
    expect(
      scoreLaunchDerivativeSignal({
        featureScores: maximumFeatures,
        tradeSampleCount: 2,
        sellPressure: "none",
        riskLevel: "low",
        hardReject: false
      }).strengthLabel
    ).toBe("watch");
    expect(
      scoreLaunchDerivativeSignal({
        featureScores: maximumFeatures,
        tradeSampleCount: 3,
        sellPressure: "none",
        riskLevel: "low",
        hardReject: true
      })
    ).toMatchObject({ totalScore: 0, strengthLabel: "reject" });
    expect(
      classifySignalScore(Number.POSITIVE_INFINITY, {
        hardReject: false,
        tradeSampleCount: 3
      })
    ).toBe("none");
  });

  it("rejects lookahead and version-mismatched observations", () => {
    const result = evaluateSignalCalibration({
      observations: [
        observation("lookahead", "train", 75, true, 5, 10, 10),
        {
          ...observation("wrong-version", "train", 75, true, 5, 10, 20),
          strategyVersion: "future-policy"
        },
        observation("duplicate", "train", 75, true, 5, 10, 20),
        observation("duplicate", "validation", 75, true, 5, 30, 40),
        observation("out-of-range", "train", 101, true, 5, 10, 20)
      ]
    });

    expect(result).toMatchObject({
      acceptedObservationCount: 0,
      rejectedObservationCount: 5,
      lookaheadViolationCount: 1,
      evaluationStatus: "insufficient_evidence",
      automaticThresholdActivation: false,
      tradingDisabled: true
    });
    expect(result.rejections.map((rejection) => rejection.reasonCode)).toEqual(
      expect.arrayContaining([
        "CALIBRATION_LOOKAHEAD_VIOLATION",
        "CALIBRATION_STRATEGY_VERSION_MISMATCH",
        "CALIBRATION_DUPLICATE_OBSERVATION_ID",
        "CALIBRATION_SCORE_OUT_OF_RANGE"
      ])
    );
  });

  it("keeps threshold selection on training data and evaluates holdout separately", () => {
    const observations = [
      ...buildPartition("train", 0),
      ...buildPartition("validation", 1_000)
    ];
    const first = evaluateSignalCalibration({ observations });
    const second = evaluateSignalCalibration({
      observations: [...observations].reverse()
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      acceptedObservationCount: 240,
      rejectedObservationCount: 0,
      evaluationStatus: "validation_evaluated",
      policyStatus: "reference_only",
      calibrated: false,
      automaticThresholdActivation: false
    });
    expect(first.trainingCandidate).toMatchObject({
      threshold: 85,
      signalCount: 20,
      evidenceStatus: "sufficient"
    });
    expect(first.candidateValidation).toMatchObject({
      threshold: 85,
      signalCount: 20,
      evidenceStatus: "sufficient"
    });
    expect(first.training.thresholds).not.toBe(first.validation.thresholds);
  });

  it("allows evidence requirements to tighten but never weaken the policy floors", () => {
    const result = evaluateSignalCalibration({
      observations: [
        observation("single", "train", 85, true, 10, 0, 1)
      ],
      thresholdCandidates: [85],
      evidenceRequirements: {
        minimumTrainingObservations: 1,
        minimumValidationObservations: 1,
        minimumPositiveOutcomes: 1,
        minimumSignalsPerThreshold: 1,
        minimumTrainingExpectancyPct: -100
      }
    });

    expect(result.evidenceRequirements).toEqual({
      minimumTrainingObservations: 100,
      minimumValidationObservations: 50,
      minimumPositiveOutcomes: 20,
      minimumSignalsPerThreshold: 20,
      minimumTrainingExpectancyPct: 0
    });
    expect(result.trainingCandidate).toBeNull();
    expect(result.evaluationStatus).toBe("insufficient_evidence");
  });

  it("reports an explicitly non-activating runtime contract", () => {
    expect(getSignalCalibrationRuntimeContract()).toMatchObject({
      canonicalPolicy: true,
      strategyVersion: "launch-derivative-reference-v1",
      policyStatus: "reference_only",
      calibrationStatus: "reference_only",
      evaluatorStatus: "implemented",
      outcomeCaptureStatus: "implemented",
      outcomeCaptureOwner: "@axi/session-capture",
      paperStrategyEvaluationStatus: "implemented",
      paperStrategyEvaluationOwner: "@axi/paper-strategy-evaluation",
      automaticThresholdActivation: false,
      tradingDisabled: true
    });
  });
});

function buildPartition(
  partition: "train" | "validation",
  offset: number
): CalibrationObservation[] {
  return Array.from({ length: 120 }, (_, index) => {
    const score = [10, 25, 40, 55, 70, 85][index % 6] ?? 0;
    const targetReached = score >= 55;
    const forwardReturnPct = score >= 70 ? 8 : score >= 55 ? 3 : -2;

    return observation(
      `${partition}-${index}`,
      partition,
      score,
      targetReached,
      forwardReturnPct,
      offset + index * 2,
      offset + index * 2 + 1
    );
  });
}

function observation(
  observationId: string,
  partition: "train" | "validation",
  score: number,
  targetReached: boolean,
  forwardReturnPct: number,
  signalSecond: number,
  outcomeSecond: number
): CalibrationObservation {
  const epoch = Date.parse("2026-01-01T00:00:00.000Z");

  return {
    observationId,
    partition,
    strategyVersion: launchDerivativeReferencePolicy.strategyVersion,
    signalAt: new Date(epoch + signalSecond * 1_000).toISOString(),
    outcomeAt: new Date(epoch + outcomeSecond * 1_000).toISOString(),
    score,
    targetReached,
    forwardReturnPct,
    estimatedCostPct: 1,
    maxFavorableExcursionPct: Math.max(forwardReturnPct, 0),
    maxAdverseExcursionPct: Math.min(forwardReturnPct, 0)
  };
}
