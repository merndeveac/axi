import type { CalibrationDataset } from "@axi/session-capture";
import {
  defaultCalibrationEvidenceRequirements,
  defaultCalibrationThresholds,
  evaluateSignalCalibration,
  launchDerivativeReferencePolicy,
  type CalibrationEvidenceRequirementOverrides,
  type CalibrationObservation,
  type CalibrationPartition,
  type SignalCalibrationEvaluation
} from "@axi/signal-calibration";

export const paperStrategyEvaluationVersion =
  "paper-strategy-evaluation-v1" as const;

export const defaultPaperStrategyEvaluationConfig = {
  schemaVersion: 1,
  startingCapitalSol: 1,
  positionSizeSol: 0.005,
  minimumDatasetCompletenessRatio: 0.95,
  maximumUnavailableOutcomeRatio: 0.05,
  confidenceLevel: 0.95,
  confidenceZScore: 1.96,
  minimumValidationExpectancyPct: 0,
  minimumValidationProfitFactor: 1,
  minimumValidationConfidenceLowerBoundPct: 0
} as const;

export type PaperStrategyEvaluationConfig = {
  schemaVersion: 1;
  startingCapitalSol: number;
  positionSizeSol: number;
  minimumDatasetCompletenessRatio: number;
  maximumUnavailableOutcomeRatio: number;
  confidenceLevel: 0.95;
  confidenceZScore: 1.96;
  minimumValidationExpectancyPct: 0;
  minimumValidationProfitFactor: 1;
  minimumValidationConfidenceLowerBoundPct: 0;
};

export type PaperStrategyEvaluationConfigInput = {
  startingCapitalSol?: number | undefined;
  positionSizeSol?: number | undefined;
};

export type PaperStrategyEvaluationStatus =
  | "invalid_dataset"
  | "data_quality_failed"
  | "insufficient_evidence"
  | "holdout_rejected"
  | "paper_observation_candidate";

export type PaperStrategyDatasetAudit = {
  datasetCount: number;
  trainingDatasetCount: number;
  validationDatasetCount: number;
  manifestObservationCount: number;
  completedObservationCount: number;
  pendingObservationCount: number;
  unavailableObservationCount: number;
  excludedObservationCount: number;
  completenessRatio: number | null;
  unavailableOutcomeRatio: number | null;
  integrityValid: boolean;
  qualitySufficient: boolean;
  temporalHoldoutValid: boolean | null;
  latestTrainingOutcomeAt: string | null;
  earliestValidationSignalAt: string | null;
  reasonCodes: string[];
};

export type PaperStrategyPerformance = {
  partition: CalibrationPartition;
  threshold: number;
  observationCount: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
  targetHitCount: number;
  targetHitRate: number | null;
  winRate: number | null;
  averageGrossReturnPct: number | null;
  averageNetReturnPct: number | null;
  medianNetReturnPct: number | null;
  netReturnStandardDeviationPct: number | null;
  netReturnStandardErrorPct: number | null;
  netReturnConfidenceLowerBoundPct: number | null;
  netReturnConfidenceUpperBoundPct: number | null;
  confidenceMethod: "normal_approximation_95pct";
  grossProfitSol: number;
  grossLossSol: number;
  totalEstimatedCostSol: number;
  totalNetPnlSol: number;
  returnOnStartingCapitalPct: number;
  returnOnAllocatedCapitalPct: number | null;
  profitFactor: number | null;
  profitFactorStatus: "finite" | "no_losses" | "unavailable";
  averageWinPct: number | null;
  averageLossPct: number | null;
  payoffRatio: number | null;
  maximumDrawdownSol: number;
  maximumDrawdownPct: number;
  maximumConsecutiveLosses: number;
  averageMfePct: number | null;
  averageMaePct: number | null;
  firstSignalAt: string | null;
  lastOutcomeAt: string | null;
  simulationPolicy: "independent_fixed_size_outcome_time_order";
  reasonCodes: string[];
};

export type PaperStrategyAcceptanceGate = {
  gate: string;
  passed: boolean;
  actual: number | string | boolean | null;
  required: string;
};

export type PaperStrategyEvaluationReport = {
  schemaVersion: 1;
  evaluationVersion: typeof paperStrategyEvaluationVersion;
  evaluationId: string;
  evaluatedAt: string;
  strategyVersion: typeof launchDerivativeReferencePolicy.strategyVersion;
  policyStatus: "reference_only";
  evaluationPolicy: "fixed_horizon_score_threshold";
  selectionPolicy: "training_only_then_single_temporal_holdout";
  datasetIds: string[];
  captureSessionIds: string[];
  config: PaperStrategyEvaluationConfig;
  datasetAudit: PaperStrategyDatasetAudit;
  calibration: SignalCalibrationEvaluation;
  selectedThreshold: number | null;
  trainingPerformance: PaperStrategyPerformance | null;
  validationPerformance: PaperStrategyPerformance | null;
  acceptanceGates: PaperStrategyAcceptanceGate[];
  evaluationStatus: PaperStrategyEvaluationStatus;
  automaticThresholdActivation: false;
  automaticPaperTradingActivation: false;
  calibrated: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
  reasonCodes: string[];
};

export type EvaluatePaperStrategyInput = {
  evaluationId: string;
  evaluatedAt: string;
  datasets: readonly CalibrationDataset[];
  config?: PaperStrategyEvaluationConfigInput | undefined;
  thresholdCandidates?: readonly number[] | undefined;
  evidenceRequirements?: CalibrationEvidenceRequirementOverrides | undefined;
};

type AuditedDatasets = {
  audit: PaperStrategyDatasetAudit;
  observations: CalibrationObservation[];
};

export function createPaperStrategyEvaluationConfig(
  input: PaperStrategyEvaluationConfigInput = {}
): PaperStrategyEvaluationConfig {
  const startingCapitalSol = numberWithin(
    input.startingCapitalSol,
    0.01,
    1_000,
    defaultPaperStrategyEvaluationConfig.startingCapitalSol
  );

  return {
    schemaVersion: 1,
    startingCapitalSol,
    positionSizeSol: numberWithin(
      input.positionSizeSol,
      0.000001,
      Math.min(startingCapitalSol, 0.01),
      defaultPaperStrategyEvaluationConfig.positionSizeSol
    ),
    minimumDatasetCompletenessRatio:
      defaultPaperStrategyEvaluationConfig.minimumDatasetCompletenessRatio,
    maximumUnavailableOutcomeRatio:
      defaultPaperStrategyEvaluationConfig.maximumUnavailableOutcomeRatio,
    confidenceLevel: defaultPaperStrategyEvaluationConfig.confidenceLevel,
    confidenceZScore: defaultPaperStrategyEvaluationConfig.confidenceZScore,
    minimumValidationExpectancyPct:
      defaultPaperStrategyEvaluationConfig.minimumValidationExpectancyPct,
    minimumValidationProfitFactor:
      defaultPaperStrategyEvaluationConfig.minimumValidationProfitFactor,
    minimumValidationConfidenceLowerBoundPct:
      defaultPaperStrategyEvaluationConfig.minimumValidationConfidenceLowerBoundPct
  };
}

export function evaluatePaperStrategy(
  input: EvaluatePaperStrategyInput
): PaperStrategyEvaluationReport {
  const evaluationId = input.evaluationId.trim();
  const evaluatedAt = requireIsoTime(input.evaluatedAt, "strategy evaluation");

  if (!evaluationId) {
    throw new RangeError("paper strategy evaluation ID is required");
  }

  const config = createPaperStrategyEvaluationConfig(input.config);
  const audited = auditDatasets(input.datasets, config);
  const evidenceObservations =
    audited.audit.integrityValid && audited.audit.qualitySufficient
      ? audited.observations
      : [];
  const calibration = evaluateSignalCalibration({
    observations: evidenceObservations,
    ...(input.thresholdCandidates
      ? { thresholdCandidates: input.thresholdCandidates }
      : {}),
    ...(input.evidenceRequirements
      ? { evidenceRequirements: input.evidenceRequirements }
      : {})
  });
  const selectedThreshold = calibration.trainingCandidate?.threshold ?? null;
  const trainingPerformance =
    selectedThreshold === null
      ? null
      : calculatePerformance(
          "train",
          selectedThreshold,
          audited.observations,
          config
        );
  const validationPerformance =
    selectedThreshold === null
      ? null
      : calculatePerformance(
          "validation",
          selectedThreshold,
          audited.observations,
          config
        );
  const acceptanceGates = buildAcceptanceGates({
    audit: audited.audit,
    calibration,
    validationPerformance,
    config
  });
  const evaluationStatus = determineEvaluationStatus(
    audited.audit,
    calibration,
    acceptanceGates
  );

  return {
    schemaVersion: 1,
    evaluationVersion: paperStrategyEvaluationVersion,
    evaluationId,
    evaluatedAt,
    strategyVersion: launchDerivativeReferencePolicy.strategyVersion,
    policyStatus: "reference_only",
    evaluationPolicy: "fixed_horizon_score_threshold",
    selectionPolicy: "training_only_then_single_temporal_holdout",
    datasetIds: input.datasets.map((dataset) => dataset.manifest.datasetId),
    captureSessionIds: input.datasets.map(
      (dataset) => dataset.manifest.captureSessionId
    ),
    config,
    datasetAudit: audited.audit,
    calibration,
    selectedThreshold,
    trainingPerformance,
    validationPerformance,
    acceptanceGates,
    evaluationStatus,
    automaticThresholdActivation: false,
    automaticPaperTradingActivation: false,
    calibrated: false,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true,
    reasonCodes: uniqueStrings([
      "PAPER_STRATEGY_FIXED_HORIZON_EVALUATION",
      "PAPER_STRATEGY_TEMPORAL_HOLDOUT_REQUIRED",
      "PAPER_STRATEGY_PORTFOLIO_CONCURRENCY_NOT_MODELED",
      "PAPER_STRATEGY_THRESHOLDS_NOT_ACTIVATED",
      "LIVE_EXECUTION_DISABLED",
      ...audited.audit.reasonCodes,
      ...statusReasonCodes(evaluationStatus)
    ])
  };
}

export function getPaperStrategyEvaluationRuntimeContract() {
  return {
    schemaVersion: 1,
    evaluationVersion: paperStrategyEvaluationVersion,
    implementationStatus: "implemented" as const,
    activationMode: "offline_local_only" as const,
    evaluationPolicy: "fixed_horizon_score_threshold" as const,
    selectionPolicy: "training_only_then_single_temporal_holdout" as const,
    simulationPolicy: "independent_fixed_size_outcome_time_order" as const,
    thresholdCandidates: [...defaultCalibrationThresholds],
    evidenceRequirements: defaultCalibrationEvidenceRequirements,
    defaultConfig: defaultPaperStrategyEvaluationConfig,
    temporalHoldoutRequired: true as const,
    incompleteOutcomesRejected: true as const,
    confidenceMethod: "normal_approximation_95pct" as const,
    automaticThresholdActivation: false as const,
    automaticPaperTradingActivation: false as const,
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const,
    liveExecutionDisabled: true as const,
    reasonCodes: [
      "PAPER_STRATEGY_REQUIRES_CAPTURED_DATASETS",
      "PAPER_STRATEGY_REQUIRES_TEMPORAL_HOLDOUT",
      "PAPER_STRATEGY_RESULT_IS_NON_ACTIVATING",
      "LIVE_EXECUTION_DISABLED"
    ]
  };
}

function auditDatasets(
  datasets: readonly CalibrationDataset[],
  config: PaperStrategyEvaluationConfig
): AuditedDatasets {
  const reasonCodes: string[] = [];
  const observations = datasets.flatMap((dataset) => dataset.observations);
  const datasetIds = datasets.map((dataset) => dataset.manifest.datasetId);
  const captureSessionIds = datasets.map(
    (dataset) => dataset.manifest.captureSessionId
  );
  const reference = datasets[0]?.manifest;

  if (datasets.length === 0) {
    reasonCodes.push("PAPER_STRATEGY_DATASET_REQUIRED");
  }

  if (new Set(datasetIds).size !== datasetIds.length) {
    reasonCodes.push("PAPER_STRATEGY_DUPLICATE_DATASET");
  }

  if (new Set(captureSessionIds).size !== captureSessionIds.length) {
    reasonCodes.push("PAPER_STRATEGY_DUPLICATE_CAPTURE_SESSION");
  }

  for (const dataset of datasets) {
    const manifest = dataset.manifest;
    const accountedObservationCount =
      manifest.completedObservationCount +
      manifest.pendingObservationCount +
      manifest.unavailableObservationCount +
      manifest.excludedObservationCount;

    if (
      manifest.strategyVersion !==
        launchDerivativeReferencePolicy.strategyVersion ||
      manifest.captureVersion !== "calibration-session-capture-v1"
    ) {
      reasonCodes.push("PAPER_STRATEGY_DATASET_VERSION_MISMATCH");
    }

    if (
      manifest.automaticThresholdActivation !== false ||
      manifest.calibrated !== false ||
      manifest.paperOnly !== true ||
      manifest.dataOnly !== true ||
      manifest.tradingDisabled !== true
    ) {
      reasonCodes.push("PAPER_STRATEGY_DATASET_SAFETY_MISMATCH");
    }

    if (
      manifest.completedObservationCount !== dataset.observations.length ||
      manifest.observationCount !== accountedObservationCount
    ) {
      reasonCodes.push("PAPER_STRATEGY_DATASET_MANIFEST_MISMATCH");
    }

    if (
      dataset.observations.some(
        (observation) =>
          observation.partition !== manifest.partition ||
          observation.strategyVersion !== manifest.strategyVersion ||
          Math.abs(
            (observation.estimatedCostPct ?? 0) - manifest.estimatedCostPct
          ) > 0.000001 ||
          observation.targetReached !==
            observation.forwardReturnPct -
              (observation.estimatedCostPct ?? 0) >=
              manifest.targetReturnPct
      )
    ) {
      reasonCodes.push("PAPER_STRATEGY_DATASET_OBSERVATION_MISMATCH");
    }

    if (
      reference &&
      (manifest.strategyVersion !== reference.strategyVersion ||
        manifest.horizonMs !== reference.horizonMs ||
        manifest.targetReturnPct !== reference.targetReturnPct ||
        manifest.estimatedCostPct !== reference.estimatedCostPct)
    ) {
      reasonCodes.push("PAPER_STRATEGY_DATASET_POLICY_MISMATCH");
    }
  }

  const training = observations.filter(
    (observation) => observation.partition === "train"
  );
  const validation = observations.filter(
    (observation) => observation.partition === "validation"
  );
  const latestTrainingOutcomeAt = latestTime(
    training.map((observation) => observation.outcomeAt)
  );
  const earliestValidationSignalAt = earliestTime(
    validation.map((observation) => observation.signalAt)
  );
  const temporalHoldoutValid =
    latestTrainingOutcomeAt && earliestValidationSignalAt
      ? Date.parse(latestTrainingOutcomeAt) <
        Date.parse(earliestValidationSignalAt)
      : null;

  if (temporalHoldoutValid === false) {
    reasonCodes.push("PAPER_STRATEGY_TEMPORAL_HOLDOUT_VIOLATION");
  }

  const manifestObservationCount = sum(
    datasets.map((dataset) => dataset.manifest.observationCount)
  );
  const completedObservationCount = sum(
    datasets.map((dataset) => dataset.manifest.completedObservationCount)
  );
  const pendingObservationCount = sum(
    datasets.map((dataset) => dataset.manifest.pendingObservationCount)
  );
  const unavailableObservationCount = sum(
    datasets.map((dataset) => dataset.manifest.unavailableObservationCount)
  );
  const excludedObservationCount = sum(
    datasets.map((dataset) => dataset.manifest.excludedObservationCount)
  );
  const completenessRatio = safeRatio(
    completedObservationCount,
    manifestObservationCount
  );
  const unavailableOutcomeRatio = safeRatio(
    unavailableObservationCount,
    manifestObservationCount
  );
  const structuralReasonCodes = new Set([
    "PAPER_STRATEGY_DATASET_REQUIRED",
    "PAPER_STRATEGY_DUPLICATE_DATASET",
    "PAPER_STRATEGY_DUPLICATE_CAPTURE_SESSION",
    "PAPER_STRATEGY_DATASET_VERSION_MISMATCH",
    "PAPER_STRATEGY_DATASET_MANIFEST_MISMATCH",
    "PAPER_STRATEGY_DATASET_OBSERVATION_MISMATCH",
    "PAPER_STRATEGY_DATASET_POLICY_MISMATCH",
    "PAPER_STRATEGY_DATASET_SAFETY_MISMATCH",
    "PAPER_STRATEGY_TEMPORAL_HOLDOUT_VIOLATION"
  ]);
  const integrityValid = !reasonCodes.some((code) =>
    structuralReasonCodes.has(code)
  );
  const qualitySufficient =
    pendingObservationCount === 0 &&
    excludedObservationCount === 0 &&
    (completenessRatio === null ||
      completenessRatio >= config.minimumDatasetCompletenessRatio) &&
    (unavailableOutcomeRatio === null ||
      unavailableOutcomeRatio <= config.maximumUnavailableOutcomeRatio);

  if (pendingObservationCount > 0) {
    reasonCodes.push("PAPER_STRATEGY_PENDING_OUTCOMES_PRESENT");
  }
  if (excludedObservationCount > 0) {
    reasonCodes.push("PAPER_STRATEGY_EXCLUDED_OUTCOMES_PRESENT");
  }
  if (
    completenessRatio !== null &&
    completenessRatio < config.minimumDatasetCompletenessRatio
  ) {
    reasonCodes.push("PAPER_STRATEGY_DATASET_COMPLETENESS_BELOW_MINIMUM");
  }
  if (
    unavailableOutcomeRatio !== null &&
    unavailableOutcomeRatio > config.maximumUnavailableOutcomeRatio
  ) {
    reasonCodes.push("PAPER_STRATEGY_UNAVAILABLE_OUTCOME_RATE_TOO_HIGH");
  }

  return {
    observations,
    audit: {
      datasetCount: datasets.length,
      trainingDatasetCount: datasets.filter(
        (dataset) => dataset.manifest.partition === "train"
      ).length,
      validationDatasetCount: datasets.filter(
        (dataset) => dataset.manifest.partition === "validation"
      ).length,
      manifestObservationCount,
      completedObservationCount,
      pendingObservationCount,
      unavailableObservationCount,
      excludedObservationCount,
      completenessRatio,
      unavailableOutcomeRatio,
      integrityValid,
      qualitySufficient,
      temporalHoldoutValid,
      latestTrainingOutcomeAt,
      earliestValidationSignalAt,
      reasonCodes: uniqueStrings(reasonCodes)
    }
  };
}

function calculatePerformance(
  partition: CalibrationPartition,
  threshold: number,
  observations: readonly CalibrationObservation[],
  config: PaperStrategyEvaluationConfig
): PaperStrategyPerformance {
  const partitionObservations = observations.filter(
    (observation) => observation.partition === partition
  );
  const trades = partitionObservations
    .filter((observation) => observation.score >= threshold)
    .map((observation) => {
      const estimatedCostPct = observation.estimatedCostPct ?? 0;
      const netReturnPct = observation.forwardReturnPct - estimatedCostPct;
      return {
        ...observation,
        estimatedCostPct,
        netReturnPct,
        netPnlSol: config.positionSizeSol * (netReturnPct / 100),
        grossPnlSol:
          config.positionSizeSol * (observation.forwardReturnPct / 100),
        estimatedCostSol: config.positionSizeSol * (estimatedCostPct / 100)
      };
    })
    .sort(
      (left, right) =>
        Date.parse(left.outcomeAt) - Date.parse(right.outcomeAt) ||
        left.observationId.localeCompare(right.observationId)
    );
  const netReturns = trades.map((trade) => trade.netReturnPct);
  const wins = netReturns.filter((value) => value > 0);
  const losses = netReturns.filter((value) => value < 0);
  const meanNetReturn = average(netReturns);
  const standardDeviation = sampleStandardDeviation(netReturns);
  const standardError =
    standardDeviation === null || trades.length === 0
      ? null
      : standardDeviation / Math.sqrt(trades.length);
  const confidenceDelta =
    standardError === null ? null : config.confidenceZScore * standardError;
  const grossProfitSol = sum(
    trades
      .filter((trade) => trade.netPnlSol > 0)
      .map((trade) => trade.netPnlSol)
  );
  const grossLossSol = Math.abs(
    sum(
      trades
        .filter((trade) => trade.netPnlSol < 0)
        .map((trade) => trade.netPnlSol)
    )
  );
  const totalNetPnlSol = sum(trades.map((trade) => trade.netPnlSol));
  const drawdown = calculateDrawdown(
    trades.map((trade) => trade.netPnlSol),
    config.startingCapitalSol
  );
  const profitFactorStatus =
    trades.length === 0 || (grossProfitSol === 0 && grossLossSol === 0)
      ? "unavailable"
      : grossLossSol === 0
        ? "no_losses"
        : "finite";

  return {
    partition,
    threshold,
    observationCount: partitionObservations.length,
    tradeCount: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    breakEvenCount: trades.length - wins.length - losses.length,
    targetHitCount: trades.filter((trade) => trade.targetReached).length,
    targetHitRate: safeRatio(
      trades.filter((trade) => trade.targetReached).length,
      trades.length
    ),
    winRate: safeRatio(wins.length, trades.length),
    averageGrossReturnPct: average(
      trades.map((trade) => trade.forwardReturnPct)
    ),
    averageNetReturnPct: meanNetReturn,
    medianNetReturnPct: median(netReturns),
    netReturnStandardDeviationPct: nullableRound(standardDeviation),
    netReturnStandardErrorPct: nullableRound(standardError),
    netReturnConfidenceLowerBoundPct:
      meanNetReturn === null || confidenceDelta === null
        ? null
        : round(meanNetReturn - confidenceDelta),
    netReturnConfidenceUpperBoundPct:
      meanNetReturn === null || confidenceDelta === null
        ? null
        : round(meanNetReturn + confidenceDelta),
    confidenceMethod: "normal_approximation_95pct",
    grossProfitSol: round(grossProfitSol, 9),
    grossLossSol: round(grossLossSol, 9),
    totalEstimatedCostSol: round(
      sum(trades.map((trade) => trade.estimatedCostSol)),
      9
    ),
    totalNetPnlSol: round(totalNetPnlSol, 9),
    returnOnStartingCapitalPct: round(
      (totalNetPnlSol / config.startingCapitalSol) * 100
    ),
    returnOnAllocatedCapitalPct: safeRatio(
      totalNetPnlSol * 100,
      config.positionSizeSol * trades.length
    ),
    profitFactor:
      profitFactorStatus === "finite"
        ? round(grossProfitSol / grossLossSol)
        : null,
    profitFactorStatus,
    averageWinPct: average(wins),
    averageLossPct: average(losses),
    payoffRatio:
      wins.length === 0 || losses.length === 0
        ? null
        : round((average(wins) ?? 0) / Math.abs(average(losses) ?? 1)),
    maximumDrawdownSol: round(drawdown.sol, 9),
    maximumDrawdownPct: round(drawdown.pct),
    maximumConsecutiveLosses: maximumConsecutiveLosses(netReturns),
    averageMfePct: averageOptional(
      trades.map((trade) => trade.maxFavorableExcursionPct)
    ),
    averageMaePct: averageOptional(
      trades.map((trade) => trade.maxAdverseExcursionPct)
    ),
    firstSignalAt: earliestTime(trades.map((trade) => trade.signalAt)),
    lastOutcomeAt: latestTime(trades.map((trade) => trade.outcomeAt)),
    simulationPolicy: "independent_fixed_size_outcome_time_order",
    reasonCodes: [
      "PAPER_STRATEGY_FIXED_POSITION_SIZE",
      "PAPER_STRATEGY_COSTS_DEDUCTED",
      "PAPER_STRATEGY_OUTCOME_TIME_ORDER",
      "PAPER_STRATEGY_CONCURRENCY_NOT_MODELED"
    ]
  };
}

function buildAcceptanceGates(input: {
  audit: PaperStrategyDatasetAudit;
  calibration: SignalCalibrationEvaluation;
  validationPerformance: PaperStrategyPerformance | null;
  config: PaperStrategyEvaluationConfig;
}): PaperStrategyAcceptanceGate[] {
  const validation = input.validationPerformance;
  const validationMetrics = input.calibration.candidateValidation;
  const profitFactorPassed =
    validation?.profitFactorStatus === "no_losses" ||
    (validation?.profitFactor !== null &&
      validation?.profitFactor !== undefined &&
      validation.profitFactor > input.config.minimumValidationProfitFactor);

  return [
    gate(
      "dataset_integrity",
      input.audit.integrityValid,
      input.audit.integrityValid,
      "all manifests, policies, partitions, and temporal boundaries valid"
    ),
    gate(
      "dataset_quality",
      input.audit.qualitySufficient,
      input.audit.completenessRatio,
      `completion >= ${input.config.minimumDatasetCompletenessRatio}, no pending/excluded, unavailable <= ${input.config.maximumUnavailableOutcomeRatio}`
    ),
    gate(
      "temporal_holdout",
      input.audit.temporalHoldoutValid === true,
      input.audit.temporalHoldoutValid,
      "latest training outcome precedes earliest validation signal"
    ),
    gate(
      "calibration_observations",
      input.calibration.rejectedObservationCount === 0,
      input.calibration.rejectedObservationCount,
      "0 rejected calibration observations"
    ),
    gate(
      "training_candidate",
      input.calibration.trainingCandidate !== null,
      input.calibration.trainingCandidate?.threshold ?? null,
      "training-only threshold candidate with sufficient evidence"
    ),
    gate(
      "validation_evidence",
      validationMetrics?.evidenceStatus === "sufficient",
      validationMetrics?.signalCount ?? 0,
      "holdout evidence floors satisfied"
    ),
    gate(
      "validation_expectancy",
      (validation?.averageNetReturnPct ?? Number.NEGATIVE_INFINITY) >
        input.config.minimumValidationExpectancyPct,
      validation?.averageNetReturnPct ?? null,
      `> ${input.config.minimumValidationExpectancyPct}% net expectancy`
    ),
    gate(
      "validation_profit_factor",
      profitFactorPassed,
      validation?.profitFactorStatus === "no_losses"
        ? "no_losses"
        : (validation?.profitFactor ?? null),
      `> ${input.config.minimumValidationProfitFactor} or no holdout losses`
    ),
    gate(
      "validation_confidence_lower_bound",
      (validation?.netReturnConfidenceLowerBoundPct ??
        Number.NEGATIVE_INFINITY) >
        input.config.minimumValidationConfidenceLowerBoundPct,
      validation?.netReturnConfidenceLowerBoundPct ?? null,
      `95% lower bound > ${input.config.minimumValidationConfidenceLowerBoundPct}%`
    )
  ];
}

function determineEvaluationStatus(
  audit: PaperStrategyDatasetAudit,
  calibration: SignalCalibrationEvaluation,
  gates: readonly PaperStrategyAcceptanceGate[]
): PaperStrategyEvaluationStatus {
  if (!audit.integrityValid || calibration.rejectedObservationCount > 0) {
    return "invalid_dataset";
  }

  if (!audit.qualitySufficient) {
    return "data_quality_failed";
  }

  if (
    calibration.trainingCandidate === null ||
    calibration.candidateValidation?.evidenceStatus !== "sufficient"
  ) {
    return "insufficient_evidence";
  }

  return gates.every((item) => item.passed)
    ? "paper_observation_candidate"
    : "holdout_rejected";
}

function calculateDrawdown(
  pnl: readonly number[],
  startingCapitalSol: number
): { sol: number; pct: number } {
  let equity = startingCapitalSol;
  let peak = startingCapitalSol;
  let maximumSol = 0;
  let maximumPct = 0;

  for (const value of pnl) {
    equity += value;
    peak = Math.max(peak, equity);
    const drawdownSol = Math.max(0, peak - equity);
    const drawdownPct = peak > 0 ? (drawdownSol / peak) * 100 : 0;
    maximumSol = Math.max(maximumSol, drawdownSol);
    maximumPct = Math.max(maximumPct, drawdownPct);
  }

  return { sol: maximumSol, pct: maximumPct };
}

function maximumConsecutiveLosses(values: readonly number[]): number {
  let current = 0;
  let maximum = 0;

  for (const value of values) {
    current = value < 0 ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }

  return maximum;
}

function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const mean = average(values) ?? 0;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : round(sum(values) / values.length);
}

function averageOptional(
  values: readonly (number | undefined)[]
): number | null {
  return average(
    values.filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    )
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : round(sorted[middle] ?? 0);
}

function earliestTime(values: readonly string[]): string | null {
  return values.length === 0
    ? null
    : ([...values].sort(
        (left, right) => Date.parse(left) - Date.parse(right)
      )[0] ?? null);
}

function latestTime(values: readonly string[]): string | null {
  return values.length === 0
    ? null
    : ([...values].sort(
        (left, right) => Date.parse(right) - Date.parse(left)
      )[0] ?? null);
}

function gate(
  name: string,
  passed: boolean,
  actual: number | string | boolean | null,
  required: string
): PaperStrategyAcceptanceGate {
  return { gate: name, passed, actual, required };
}

function statusReasonCodes(status: PaperStrategyEvaluationStatus): string[] {
  switch (status) {
    case "invalid_dataset":
      return ["PAPER_STRATEGY_INVALID_DATASET"];
    case "data_quality_failed":
      return ["PAPER_STRATEGY_DATA_QUALITY_FAILED"];
    case "insufficient_evidence":
      return ["PAPER_STRATEGY_INSUFFICIENT_EVIDENCE"];
    case "holdout_rejected":
      return ["PAPER_STRATEGY_HOLDOUT_REJECTED"];
    case "paper_observation_candidate":
      return [
        "PAPER_STRATEGY_HOLDOUT_GATES_PASSED",
        "PAPER_STRATEGY_CANDIDATE_REQUIRES_OPERATOR_REVIEW"
      ];
  }
}

function requireIsoTime(value: string, label: string): string {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${label} time must be valid`);
  }

  return new Date(parsed).toISOString();
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round(numerator / denominator);
}

function nullableRound(value: number | null): number | null {
  return value === null ? null : round(value);
}

function numberWithin(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const finite =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(finite, minimum), maximum);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, precision = 6): number {
  const factor = 10 ** precision;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
