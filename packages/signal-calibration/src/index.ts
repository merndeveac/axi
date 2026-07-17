export const launchDerivativeReferencePolicy = {
  schemaVersion: 1,
  strategyVersion: "launch-derivative-reference-v1",
  policyStatus: "reference_only",
  calibrated: false,
  confidenceAppliedToSignalScore: false,
  weights: {
    volumeVelocity: 0.16,
    volumeAcceleration: 0.12,
    priceVelocity: 0.16,
    priceAcceleration: 0.1,
    buyerVelocity: 0.14,
    buyerAcceleration: 0.08,
    tradeVelocity: 0.1,
    buyPressure: 0.14
  },
  thresholds: {
    watch: 25,
    hot: 55,
    ripping: 75
  },
  minimumSamples: {
    firstDerivative: 2,
    fullSignal: 3
  },
  penalties: {
    sellPressureMild: 14,
    sellPressureStrong: 32,
    missingAllTrades: 45,
    missingFullSignalSamples: 22,
    riskMedium: 12,
    riskHigh: 28,
    riskCritical: 100
  }
} as const;

export const defaultCalibrationThresholds = [
  25, 35, 45, 55, 65, 75, 85
] as const;

export const defaultCalibrationEvidenceRequirements = {
  minimumTrainingObservations: 100,
  minimumValidationObservations: 50,
  minimumPositiveOutcomes: 20,
  minimumSignalsPerThreshold: 20,
  minimumTrainingExpectancyPct: 0
} as const;

export type SignalPolicyStatus = "reference_only";
export type SignalLabel = "none" | "watch" | "hot" | "ripping" | "reject";
export type SignalRiskLevel =
  "unknown" | "low" | "medium" | "high" | "critical";
export type SellPressureSeverity = "none" | "mild" | "strong";

export type SignalFeatureScores = {
  volumeVelocity: number;
  volumeAcceleration: number;
  priceVelocity: number;
  priceAcceleration: number;
  buyerVelocity: number;
  buyerAcceleration: number;
  tradeVelocity: number;
  buyPressure: number;
};

export type SignalScoreComponents = {
  volumeVelocityScore: number;
  volumeAccelerationScore: number;
  priceVelocityScore: number;
  priceAccelerationScore: number;
  buyerVelocityScore: number;
  buyerAccelerationScore: number;
  tradeVelocityScore: number;
  buyPressureScore: number;
  sellPressurePenalty: number;
  missingDataPenalty: number;
  riskPenalty: number;
};

export type SignalScoreInput = {
  featureScores: SignalFeatureScores;
  tradeSampleCount: number;
  sellPressure: SellPressureSeverity;
  riskLevel: SignalRiskLevel | string;
  hardReject: boolean;
};

export type SignalScoreResult = {
  totalScore: number;
  strengthLabel: SignalLabel;
  components: SignalScoreComponents;
  reasonCodes: string[];
  policySchemaVersion: 1;
  strategyVersion: typeof launchDerivativeReferencePolicy.strategyVersion;
  policyStatus: SignalPolicyStatus;
  calibrated: false;
  confidenceAppliedToSignalScore: false;
};

export function scoreLaunchDerivativeSignal(
  input: SignalScoreInput
): SignalScoreResult {
  const weights = launchDerivativeReferencePolicy.weights;
  const penalties = launchDerivativeReferencePolicy.penalties;
  const sampleCount = sanitizeCount(input.tradeSampleCount);
  const components: SignalScoreComponents = {
    volumeVelocityScore: weighted(
      input.featureScores.volumeVelocity,
      weights.volumeVelocity
    ),
    volumeAccelerationScore: weighted(
      input.featureScores.volumeAcceleration,
      weights.volumeAcceleration
    ),
    priceVelocityScore: weighted(
      input.featureScores.priceVelocity,
      weights.priceVelocity
    ),
    priceAccelerationScore: weighted(
      input.featureScores.priceAcceleration,
      weights.priceAcceleration
    ),
    buyerVelocityScore: weighted(
      input.featureScores.buyerVelocity,
      weights.buyerVelocity
    ),
    buyerAccelerationScore: weighted(
      input.featureScores.buyerAcceleration,
      weights.buyerAcceleration
    ),
    tradeVelocityScore: weighted(
      input.featureScores.tradeVelocity,
      weights.tradeVelocity
    ),
    buyPressureScore: weighted(
      input.featureScores.buyPressure,
      weights.buyPressure
    ),
    sellPressurePenalty:
      input.sellPressure === "strong"
        ? penalties.sellPressureStrong
        : input.sellPressure === "mild"
          ? penalties.sellPressureMild
          : 0,
    missingDataPenalty:
      sampleCount === 0
        ? penalties.missingAllTrades
        : sampleCount <
            launchDerivativeReferencePolicy.minimumSamples.fullSignal
          ? penalties.missingFullSignalSamples
          : 0,
    riskPenalty: riskPenaltyFor(input.riskLevel, input.hardReject)
  };
  const positiveScore =
    components.volumeVelocityScore +
    components.volumeAccelerationScore +
    components.priceVelocityScore +
    components.priceAccelerationScore +
    components.buyerVelocityScore +
    components.buyerAccelerationScore +
    components.tradeVelocityScore +
    components.buyPressureScore;
  const rawScore =
    positiveScore -
    components.sellPressurePenalty -
    components.missingDataPenalty -
    components.riskPenalty;
  const totalScore = input.hardReject ? 0 : round(clamp(rawScore, 0, 100));
  const reasonCodes = [
    "SIGNAL_POLICY_REFERENCE_ONLY",
    "SIGNAL_SCORE_CONFIDENCE_NOT_APPLIED"
  ];

  if (sampleCount === 0) {
    reasonCodes.push("DISCOVERY_ONLY_NO_DERIVATIVES");
  }

  if (
    sampleCount < launchDerivativeReferencePolicy.minimumSamples.firstDerivative
  ) {
    reasonCodes.push("INSUFFICIENT_SAMPLES_FOR_DERIVATIVE");
  }

  if (sampleCount < launchDerivativeReferencePolicy.minimumSamples.fullSignal) {
    reasonCodes.push("LAUNCH_INSUFFICIENT_TRADE_DATA");
  }

  if (components.sellPressurePenalty > 0) {
    reasonCodes.push("LAUNCH_SELL_PRESSURE");
  }

  if (input.hardReject) {
    reasonCodes.push("LAUNCH_REJECTED");
  }

  return {
    totalScore,
    strengthLabel: classifySignalScore(totalScore, {
      hardReject: input.hardReject,
      tradeSampleCount: sampleCount
    }),
    components,
    reasonCodes: uniqueStrings(reasonCodes),
    policySchemaVersion: launchDerivativeReferencePolicy.schemaVersion,
    strategyVersion: launchDerivativeReferencePolicy.strategyVersion,
    policyStatus: launchDerivativeReferencePolicy.policyStatus,
    calibrated: false,
    confidenceAppliedToSignalScore: false
  };
}

export function classifySignalScore(
  score: number,
  options: { hardReject: boolean; tradeSampleCount: number }
): SignalLabel {
  if (options.hardReject) {
    return "reject";
  }

  const sanitizedScore = clamp(score, 0, 100);

  if (
    options.tradeSampleCount <
    launchDerivativeReferencePolicy.minimumSamples.fullSignal
  ) {
    return sanitizedScore >= launchDerivativeReferencePolicy.thresholds.watch
      ? "watch"
      : "none";
  }

  if (sanitizedScore >= launchDerivativeReferencePolicy.thresholds.ripping) {
    return "ripping";
  }

  if (sanitizedScore >= launchDerivativeReferencePolicy.thresholds.hot) {
    return "hot";
  }

  if (sanitizedScore >= launchDerivativeReferencePolicy.thresholds.watch) {
    return "watch";
  }

  return "none";
}

export type CalibrationPartition = "train" | "validation";

export type CalibrationObservation = {
  observationId: string;
  partition: CalibrationPartition;
  strategyVersion: string;
  signalAt: string;
  outcomeAt: string;
  score: number;
  targetReached: boolean;
  forwardReturnPct: number;
  estimatedCostPct?: number | undefined;
  maxFavorableExcursionPct?: number | undefined;
  maxAdverseExcursionPct?: number | undefined;
};

export type CalibrationEvidenceRequirements = {
  minimumTrainingObservations: number;
  minimumValidationObservations: number;
  minimumPositiveOutcomes: number;
  minimumSignalsPerThreshold: number;
  minimumTrainingExpectancyPct: number;
};

export type CalibrationEvidenceRequirementOverrides = {
  minimumTrainingObservations?: number | undefined;
  minimumValidationObservations?: number | undefined;
  minimumPositiveOutcomes?: number | undefined;
  minimumSignalsPerThreshold?: number | undefined;
  minimumTrainingExpectancyPct?: number | undefined;
};

export type SignalCalibrationEvaluationInput = {
  observations: readonly CalibrationObservation[];
  thresholdCandidates?: readonly number[] | undefined;
  evidenceRequirements?: CalibrationEvidenceRequirementOverrides | undefined;
};

export type CalibrationThresholdMetrics = {
  threshold: number;
  observationCount: number;
  signalCount: number;
  targetPositiveCount: number;
  truePositiveCount: number;
  falsePositiveCount: number;
  trueNegativeCount: number;
  falseNegativeCount: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositiveRate: number | null;
  targetHitRate: number | null;
  averageGrossReturnPct: number | null;
  averageNetReturnPct: number | null;
  expectancyPct: number | null;
  averageMfePct: number | null;
  averageMaePct: number | null;
  evidenceStatus: "sufficient" | "insufficient";
  evidenceReasonCodes: string[];
};

export type CalibrationPartitionReport = {
  partition: CalibrationPartition;
  observationCount: number;
  targetPositiveCount: number;
  thresholds: CalibrationThresholdMetrics[];
};

export type SignalCalibrationEvaluation = {
  schemaVersion: 1;
  strategyVersion: typeof launchDerivativeReferencePolicy.strategyVersion;
  policyStatus: SignalPolicyStatus;
  calibrationStatus: "reference_only";
  evaluationStatus:
    | "insufficient_evidence"
    | "training_candidate_unvalidated"
    | "validation_evaluated";
  selectionPolicy: "train_only_highest_net_expectancy_then_precision_then_threshold";
  acceptedObservationCount: number;
  rejectedObservationCount: number;
  lookaheadViolationCount: number;
  rejections: Array<{ observationId: string; reasonCode: string }>;
  evidenceRequirements: CalibrationEvidenceRequirements;
  training: CalibrationPartitionReport;
  validation: CalibrationPartitionReport;
  trainingCandidate: CalibrationThresholdMetrics | null;
  candidateValidation: CalibrationThresholdMetrics | null;
  automaticThresholdActivation: false;
  calibrated: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

type AcceptedObservation = {
  partition: CalibrationPartition;
  score: number;
  targetReached: boolean;
  forwardReturnPct: number;
  estimatedCostPct: number;
  maxFavorableExcursionPct: number | null;
  maxAdverseExcursionPct: number | null;
};

export function evaluateSignalCalibration(
  input: SignalCalibrationEvaluationInput
): SignalCalibrationEvaluation {
  const evidenceRequirements = normalizeEvidenceRequirements(
    input.evidenceRequirements
  );
  const thresholds = normalizeThresholds(input.thresholdCandidates);
  const accepted: AcceptedObservation[] = [];
  const rejections: Array<{ observationId: string; reasonCode: string }> = [];
  const observationIdCounts = new Map<string, number>();

  for (const observation of input.observations) {
    observationIdCounts.set(
      observation.observationId,
      (observationIdCounts.get(observation.observationId) ?? 0) + 1
    );
  }

  for (const observation of input.observations) {
    const rejection =
      (observationIdCounts.get(observation.observationId) ?? 0) > 1
        ? "CALIBRATION_DUPLICATE_OBSERVATION_ID"
        : validateObservation(observation);

    if (rejection) {
      rejections.push({
        observationId: observation.observationId || "unknown",
        reasonCode: rejection
      });
      continue;
    }

    accepted.push({
      partition: observation.partition,
      score: observation.score,
      targetReached: observation.targetReached,
      forwardReturnPct: observation.forwardReturnPct,
      estimatedCostPct: observation.estimatedCostPct ?? 0,
      maxFavorableExcursionPct: finiteOrNull(
        observation.maxFavorableExcursionPct
      ),
      maxAdverseExcursionPct: finiteOrNull(observation.maxAdverseExcursionPct)
    });
  }

  rejections.sort(
    (left, right) =>
      left.observationId.localeCompare(right.observationId) ||
      left.reasonCode.localeCompare(right.reasonCode)
  );

  const training = buildPartitionReport(
    "train",
    accepted,
    thresholds,
    evidenceRequirements
  );
  const validation = buildPartitionReport(
    "validation",
    accepted,
    thresholds,
    evidenceRequirements
  );
  const trainingCandidate = selectTrainingCandidate(
    training.thresholds,
    evidenceRequirements.minimumTrainingExpectancyPct
  );
  const candidateValidation = trainingCandidate
    ? (validation.thresholds.find(
        (metrics) => metrics.threshold === trainingCandidate.threshold
      ) ?? null)
    : null;
  const evaluationStatus = trainingCandidate
    ? candidateValidation?.evidenceStatus === "sufficient"
      ? "validation_evaluated"
      : "training_candidate_unvalidated"
    : "insufficient_evidence";
  const reasonCodes = [
    "SIGNAL_POLICY_REFERENCE_ONLY",
    "CALIBRATION_THRESHOLDS_NOT_AUTO_ACTIVATED",
    ...(trainingCandidate
      ? ["CALIBRATION_TRAINING_CANDIDATE"]
      : ["CALIBRATION_INSUFFICIENT_EVIDENCE"]),
    ...(candidateValidation?.evidenceStatus === "sufficient"
      ? ["CALIBRATION_HOLDOUT_EVALUATED"]
      : ["CALIBRATION_HOLDOUT_INSUFFICIENT"]),
    ...(rejections.some(
      (rejection) => rejection.reasonCode === "CALIBRATION_LOOKAHEAD_VIOLATION"
    )
      ? ["CALIBRATION_LOOKAHEAD_VIOLATIONS_REJECTED"]
      : [])
  ];

  return {
    schemaVersion: 1,
    strategyVersion: launchDerivativeReferencePolicy.strategyVersion,
    policyStatus: launchDerivativeReferencePolicy.policyStatus,
    calibrationStatus: "reference_only",
    evaluationStatus,
    selectionPolicy:
      "train_only_highest_net_expectancy_then_precision_then_threshold",
    acceptedObservationCount: accepted.length,
    rejectedObservationCount: rejections.length,
    lookaheadViolationCount: rejections.filter(
      (rejection) => rejection.reasonCode === "CALIBRATION_LOOKAHEAD_VIOLATION"
    ).length,
    rejections,
    evidenceRequirements,
    training,
    validation,
    trainingCandidate,
    candidateValidation,
    automaticThresholdActivation: false,
    calibrated: false,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true,
    reasonCodes: uniqueStrings(reasonCodes)
  };
}

export function getSignalCalibrationRuntimeContract() {
  return {
    schemaVersion: 1,
    canonicalPolicy: true,
    strategyVersion: launchDerivativeReferencePolicy.strategyVersion,
    policyStatus: launchDerivativeReferencePolicy.policyStatus,
    calibrationStatus: "reference_only" as const,
    evaluatorStatus: "implemented" as const,
    outcomeCaptureStatus: "not_implemented" as const,
    selectionPartition: "train_only" as const,
    validationPartition: "holdout_only" as const,
    weights: launchDerivativeReferencePolicy.weights,
    thresholds: launchDerivativeReferencePolicy.thresholds,
    minimumSamples: launchDerivativeReferencePolicy.minimumSamples,
    penalties: launchDerivativeReferencePolicy.penalties,
    thresholdCandidates: [...defaultCalibrationThresholds],
    evidenceRequirements: defaultCalibrationEvidenceRequirements,
    confidenceAppliedToSignalScore: false as const,
    automaticThresholdActivation: false as const,
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const,
    reasonCodes: [
      "SIGNAL_POLICY_REFERENCE_ONLY",
      "CALIBRATION_REQUIRES_CAPTURED_FORWARD_OUTCOMES",
      "CALIBRATION_THRESHOLDS_NOT_AUTO_ACTIVATED"
    ]
  };
}

function buildPartitionReport(
  partition: CalibrationPartition,
  observations: readonly AcceptedObservation[],
  thresholds: readonly number[],
  evidence: CalibrationEvidenceRequirements
): CalibrationPartitionReport {
  const partitionObservations = observations.filter(
    (observation) => observation.partition === partition
  );

  return {
    partition,
    observationCount: partitionObservations.length,
    targetPositiveCount: partitionObservations.filter(
      (observation) => observation.targetReached
    ).length,
    thresholds: thresholds.map((threshold) =>
      calculateThresholdMetrics(
        partition,
        partitionObservations,
        threshold,
        evidence
      )
    )
  };
}

function calculateThresholdMetrics(
  partition: CalibrationPartition,
  observations: readonly AcceptedObservation[],
  threshold: number,
  evidence: CalibrationEvidenceRequirements
): CalibrationThresholdMetrics {
  const signaled = observations.filter(
    (observation) => observation.score >= threshold
  );
  const truePositiveCount = signaled.filter(
    (observation) => observation.targetReached
  ).length;
  const falsePositiveCount = signaled.length - truePositiveCount;
  const notSignaled = observations.filter(
    (observation) => observation.score < threshold
  );
  const falseNegativeCount = notSignaled.filter(
    (observation) => observation.targetReached
  ).length;
  const trueNegativeCount = notSignaled.length - falseNegativeCount;
  const targetPositiveCount = truePositiveCount + falseNegativeCount;
  const precision = safeRatio(truePositiveCount, signaled.length);
  const recall = safeRatio(truePositiveCount, targetPositiveCount);
  const minimumObservations =
    partition === "train"
      ? evidence.minimumTrainingObservations
      : evidence.minimumValidationObservations;
  const evidenceReasonCodes = [
    ...(observations.length < minimumObservations
      ? ["CALIBRATION_MINIMUM_OBSERVATIONS_NOT_MET"]
      : []),
    ...(truePositiveCount < evidence.minimumPositiveOutcomes
      ? ["CALIBRATION_MINIMUM_POSITIVE_OUTCOMES_NOT_MET"]
      : []),
    ...(signaled.length < evidence.minimumSignalsPerThreshold
      ? ["CALIBRATION_MINIMUM_SIGNALS_NOT_MET"]
      : [])
  ];

  return {
    threshold,
    observationCount: observations.length,
    signalCount: signaled.length,
    targetPositiveCount,
    truePositiveCount,
    falsePositiveCount,
    trueNegativeCount,
    falseNegativeCount,
    precision,
    recall,
    f1:
      precision === null || recall === null || precision + recall === 0
        ? null
        : round((2 * precision * recall) / (precision + recall), 6),
    falsePositiveRate: safeRatio(
      falsePositiveCount,
      falsePositiveCount + trueNegativeCount
    ),
    targetHitRate: precision,
    averageGrossReturnPct: average(
      signaled.map((observation) => observation.forwardReturnPct)
    ),
    averageNetReturnPct: average(
      signaled.map(
        (observation) =>
          observation.forwardReturnPct - observation.estimatedCostPct
      )
    ),
    expectancyPct: average(
      signaled.map(
        (observation) =>
          observation.forwardReturnPct - observation.estimatedCostPct
      )
    ),
    averageMfePct: averageNullable(
      signaled.map((observation) => observation.maxFavorableExcursionPct)
    ),
    averageMaePct: averageNullable(
      signaled.map((observation) => observation.maxAdverseExcursionPct)
    ),
    evidenceStatus:
      evidenceReasonCodes.length === 0 ? "sufficient" : "insufficient",
    evidenceReasonCodes
  };
}

function selectTrainingCandidate(
  thresholds: readonly CalibrationThresholdMetrics[],
  minimumExpectancyPct: number
): CalibrationThresholdMetrics | null {
  const candidates = thresholds
    .filter(
      (metrics) =>
        metrics.evidenceStatus === "sufficient" &&
        metrics.expectancyPct !== null &&
        metrics.expectancyPct > minimumExpectancyPct
    )
    .sort(
      (left, right) =>
        (right.expectancyPct ?? Number.NEGATIVE_INFINITY) -
          (left.expectancyPct ?? Number.NEGATIVE_INFINITY) ||
        (right.precision ?? Number.NEGATIVE_INFINITY) -
          (left.precision ?? Number.NEGATIVE_INFINITY) ||
        right.threshold - left.threshold
    );

  return candidates[0] ?? null;
}

function validateObservation(
  observation: CalibrationObservation
): string | null {
  if (!observation.observationId.trim()) {
    return "CALIBRATION_OBSERVATION_ID_REQUIRED";
  }

  if (
    observation.strategyVersion !==
    launchDerivativeReferencePolicy.strategyVersion
  ) {
    return "CALIBRATION_STRATEGY_VERSION_MISMATCH";
  }

  if (
    !Number.isFinite(observation.score) ||
    !Number.isFinite(observation.forwardReturnPct) ||
    !isOptionalFinite(observation.estimatedCostPct) ||
    (observation.estimatedCostPct ?? 0) < 0 ||
    !isOptionalFinite(observation.maxFavorableExcursionPct) ||
    !isOptionalFinite(observation.maxAdverseExcursionPct)
  ) {
    return "CALIBRATION_NON_FINITE_VALUE";
  }

  if (observation.score < 0 || observation.score > 100) {
    return "CALIBRATION_SCORE_OUT_OF_RANGE";
  }

  const signalAtMs = Date.parse(observation.signalAt);
  const outcomeAtMs = Date.parse(observation.outcomeAt);

  if (!Number.isFinite(signalAtMs) || !Number.isFinite(outcomeAtMs)) {
    return "CALIBRATION_INVALID_TIMESTAMP";
  }

  if (outcomeAtMs <= signalAtMs) {
    return "CALIBRATION_LOOKAHEAD_VIOLATION";
  }

  return null;
}

function normalizeThresholds(
  thresholds: readonly number[] | undefined
): number[] {
  const valid = (thresholds ?? defaultCalibrationThresholds)
    .filter((threshold) => Number.isFinite(threshold))
    .map((threshold) => round(clamp(threshold, 0, 100), 6));

  return [...new Set(valid)].sort((left, right) => left - right);
}

function normalizeEvidenceRequirements(
  evidence: CalibrationEvidenceRequirementOverrides | undefined
): CalibrationEvidenceRequirements {
  return {
    minimumTrainingObservations: positiveInteger(
      evidence?.minimumTrainingObservations,
      defaultCalibrationEvidenceRequirements.minimumTrainingObservations
    ),
    minimumValidationObservations: positiveInteger(
      evidence?.minimumValidationObservations,
      defaultCalibrationEvidenceRequirements.minimumValidationObservations
    ),
    minimumPositiveOutcomes: positiveInteger(
      evidence?.minimumPositiveOutcomes,
      defaultCalibrationEvidenceRequirements.minimumPositiveOutcomes
    ),
    minimumSignalsPerThreshold: positiveInteger(
      evidence?.minimumSignalsPerThreshold,
      defaultCalibrationEvidenceRequirements.minimumSignalsPerThreshold
    ),
    minimumTrainingExpectancyPct: Number.isFinite(
      evidence?.minimumTrainingExpectancyPct
    )
      ? Math.max(
          evidence?.minimumTrainingExpectancyPct ?? 0,
          defaultCalibrationEvidenceRequirements.minimumTrainingExpectancyPct
        )
      : defaultCalibrationEvidenceRequirements.minimumTrainingExpectancyPct
  };
}

function riskPenaltyFor(riskLevel: string, hardReject: boolean): number {
  const penalties = launchDerivativeReferencePolicy.penalties;

  if (hardReject || riskLevel === "critical") {
    return penalties.riskCritical;
  }

  if (riskLevel === "high") {
    return penalties.riskHigh;
  }

  if (riskLevel === "medium") {
    return penalties.riskMedium;
  }

  return 0;
}

function weighted(value: number, weight: number): number {
  return round(clamp(value, 0, 100) * weight);
}

function average(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : round(values.reduce((sum, value) => sum + value, 0) / values.length, 6);
}

function averageNullable(values: readonly (number | null)[]): number | null {
  return average(values.filter((value): value is number => value !== null));
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round(numerator / denominator, 6);
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isOptionalFinite(value: number | undefined): boolean {
  return value === undefined || Number.isFinite(value);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(Math.floor(value), fallback)
    : fallback;
}

function sanitizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  const finiteValue = Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(finiteValue, minimum), maximum);
}

function round(value: number, precision = 3): number {
  const factor = 10 ** precision;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
