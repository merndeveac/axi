import {
  createPaperExitPolicyConfig,
  evaluatePaperExitPolicy,
  paperExitPolicyVersion,
  paperExitRuleCompletionReasonCode,
  type PaperExitAction,
  type PaperExitMarketContext,
  type PaperExitPolicyConfig,
  type PaperExitPolicyConfigInput
} from "@axi/exit-strategy";
import {
  createPaperPortfolioEngine,
  paperPortfolioReasonCodes,
  type PaperFill,
  type PaperOrderIntent,
  type PaperPortfolioSnapshot,
  type PaperPosition
} from "@axi/paper-portfolio";

export const paperLifecycleValidationVersion =
  "paper-lifecycle-validation-v1" as const;

export type PaperLifecyclePartition = "train" | "validation";

export type PaperLifecycleReplayPoint = {
  at: string;
  priceSol: number;
  volumeSol: number;
  buyVolumeSol: number;
  sellVolumeSol: number;
  buyCount: number;
  sellCount: number;
  synthetic: boolean;
  source: "canonical_one_second_bucket" | "fixture";
};

export type PaperLifecycleReplayCase = {
  observationId: string;
  captureSessionId: string;
  partition: PaperLifecyclePartition;
  mint: string;
  signalAt: string;
  outcomeAt: string;
  score: number;
  entryPriceSol: number;
  points: PaperLifecycleReplayPoint[];
};

export type PaperLifecycleStrategyProvenance = {
  evaluationId: string;
  evaluationVersion: "paper-strategy-evaluation-v1";
  evaluationStatus: "paper_observation_candidate";
  selectedThreshold: number;
  captureSessionIds: string[];
  expectedObservationCount: number;
};

export type PaperLifecycleValidationConfig = {
  schemaVersion: 1;
  startingCapitalSol: number;
  positionSizeSol: number;
  maxOpenPositions: number;
  maxDailySpendSol: number;
  feeBps: number;
  baseSlippageBps: number;
  maximumMarketImpactBps: number;
  maximumVolumeParticipationRatio: number;
  entryLatencyMs: number;
  exitLatencyMs: number;
  maximumFillDelayMs: number;
  entryMissedFillRate: number;
  exitMissedFillRate: number;
  minimumPathCoverageRatio: number;
  minimumValidationTrades: 30;
  minimumValidationExpectancyPct: 0;
  minimumValidationConfidenceLowerBoundPct: 0;
  minimumValidationProfitFactor: 1.2;
  maximumValidationDrawdownPct: 20;
  maximumConsecutiveLosses: 8;
  maximumMissedFillRate: 0.2;
  minimumBenchmarkOutperformancePct: 0;
};

export type PaperLifecycleValidationConfigInput = Partial<
  Omit<
    PaperLifecycleValidationConfig,
    | "schemaVersion"
    | "minimumValidationTrades"
    | "minimumValidationExpectancyPct"
    | "minimumValidationConfidenceLowerBoundPct"
    | "minimumValidationProfitFactor"
    | "maximumValidationDrawdownPct"
    | "maximumConsecutiveLosses"
    | "maximumMissedFillRate"
    | "minimumBenchmarkOutperformancePct"
  >
>;

export const defaultPaperLifecycleValidationConfig: PaperLifecycleValidationConfig =
  {
    schemaVersion: 1,
    startingCapitalSol: 1,
    positionSizeSol: 0.005,
    maxOpenPositions: 3,
    maxDailySpendSol: 0.05,
    feeBps: 100,
    baseSlippageBps: 300,
    maximumMarketImpactBps: 1_000,
    maximumVolumeParticipationRatio: 0.1,
    entryLatencyMs: 1_000,
    exitLatencyMs: 1_000,
    maximumFillDelayMs: 5_000,
    entryMissedFillRate: 0,
    exitMissedFillRate: 0,
    minimumPathCoverageRatio: 0.9,
    minimumValidationTrades: 30,
    minimumValidationExpectancyPct: 0,
    minimumValidationConfidenceLowerBoundPct: 0,
    minimumValidationProfitFactor: 1.2,
    maximumValidationDrawdownPct: 20,
    maximumConsecutiveLosses: 8,
    maximumMissedFillRate: 0.2,
    minimumBenchmarkOutperformancePct: 0
  };

export type PaperLifecycleDataAudit = {
  caseCount: number;
  trainingCaseCount: number;
  validationCaseCount: number;
  replayPointCount: number;
  expectedReplayPointCount: number;
  pathCoverageRatio: number | null;
  invalidCaseCount: number;
  syntheticPointCount: number;
  duplicateObservationCount: number;
  temporalHoldoutValid: boolean | null;
  latestTrainingOutcomeAt: string | null;
  earliestValidationSignalAt: string | null;
  noLookAheadValid: boolean;
  integrityValid: boolean;
  qualitySufficient: boolean;
  reasonCodes: string[];
};

export type PaperLifecycleTradeStatus =
  "score_below_threshold" | "entry_rejected" | "closed" | "open_unresolved";

export type PaperLifecycleTradeResult = {
  observationId: string;
  captureSessionId: string;
  partition: PaperLifecyclePartition;
  mint: string;
  score: number;
  status: PaperLifecycleTradeStatus;
  signalAt: string;
  outcomeAt: string;
  entryDecisionAt: string | null;
  entryFillAt: string | null;
  entryMarketPriceSol: number | null;
  entryEffectivePriceSol: number | null;
  exitFillAt: string | null;
  exitMarketPriceSol: number | null;
  exitEffectivePriceSol: number | null;
  requestedSizeSol: number;
  realizedPnlSol: number;
  netReturnPct: number | null;
  grossReturnPct: number | null;
  totalFeesSol: number;
  totalSlippageSol: number;
  totalMarketImpactSol: number;
  maximumFavorableExcursionPct: number | null;
  maximumAdverseExcursionPct: number | null;
  holdingMs: number | null;
  entryLatencyMs: number | null;
  averageExitLatencyMs: number | null;
  entryAttemptCount: number;
  exitAttemptCount: number;
  missedEntryFillCount: number;
  missedExitFillCount: number;
  selectedExitRuleIds: string[];
  exitEvaluationCount: number;
  reasonCodes: string[];
};

export type PaperLifecyclePerformance = {
  partition: PaperLifecyclePartition;
  signalCount: number;
  thresholdEligibleCount: number;
  tradeCount: number;
  entryFillRate: number | null;
  closedTradeCount: number;
  rejectedEntryCount: number;
  unresolvedPositionCount: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
  winRate: number | null;
  averageNetReturnPct: number | null;
  medianNetReturnPct: number | null;
  netReturnStandardDeviationPct: number | null;
  netReturnStandardErrorPct: number | null;
  netReturnConfidenceLowerBoundPct: number | null;
  netReturnConfidenceUpperBoundPct: number | null;
  confidenceMethod: "normal_approximation_95pct";
  grossProfitSol: number;
  grossLossSol: number;
  totalNetPnlSol: number;
  totalFeesSol: number;
  totalSlippageSol: number;
  totalMarketImpactSol: number;
  profitFactor: number | null;
  profitFactorStatus: "finite" | "no_losses" | "unavailable";
  maximumDrawdownSol: number;
  maximumDrawdownPct: number;
  maximumConsecutiveLosses: number;
  averageMfePct: number | null;
  averageMaePct: number | null;
  averageEntryLatencyMs: number | null;
  averageExitLatencyMs: number | null;
  fillAttemptCount: number;
  missedFillCount: number;
  missedFillRate: number | null;
  firstSignalAt: string | null;
  lastExitAt: string | null;
  reasonCodes: string[];
};

export type PaperLifecycleBenchmark = {
  policy: "same_entries_fixed_horizon_close";
  tradeCount: number;
  averageNetReturnPct: number | null;
  totalNetPnlSol: number;
  profitFactor: number | null;
  profitFactorStatus: "finite" | "no_losses" | "unavailable";
  reasonCodes: string[];
};

export type PaperLifecycleAcceptanceGate = {
  gate: string;
  passed: boolean;
  actual: number | string | boolean | null;
  required: string;
};

export type PaperLifecycleValidationStatus =
  | "invalid_input"
  | "data_quality_failed"
  | "insufficient_evidence"
  | "holdout_rejected"
  | "paper_automation_candidate";

export type PaperLifecycleValidationReport = {
  schemaVersion: 1;
  validationVersion: typeof paperLifecycleValidationVersion;
  validationId: string;
  evaluatedAt: string;
  policyStatus: "reference_only";
  validationPolicy: "global_event_time_portfolio_replay";
  selectionPolicy: "upstream_training_threshold_single_temporal_holdout";
  simulationPolicy: "shared_capital_latency_cost_liquidity_and_missed_fills";
  strategyProvenance: PaperLifecycleStrategyProvenance;
  captureSessionIds: string[];
  selectedThreshold: number;
  config: PaperLifecycleValidationConfig;
  exitPolicyVersion: typeof paperExitPolicyVersion;
  exitPolicyConfig: PaperExitPolicyConfig;
  dataAudit: PaperLifecycleDataAudit;
  portfolioSnapshot: PaperPortfolioSnapshot;
  peakOpenPositionCount: number;
  trades: PaperLifecycleTradeResult[];
  trainingPerformance: PaperLifecyclePerformance | null;
  validationPerformance: PaperLifecyclePerformance | null;
  validationHorizonBenchmark: PaperLifecycleBenchmark | null;
  benchmarkOutperformancePct: number | null;
  acceptanceGates: PaperLifecycleAcceptanceGate[];
  validationStatus: PaperLifecycleValidationStatus;
  automaticThresholdActivation: false;
  automaticPaperTradingActivation: false;
  automaticLiveExecution: false;
  calibrated: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
  reasonCodes: string[];
};

export type EvaluatePaperLifecycleValidationInput = {
  validationId: string;
  evaluatedAt: string;
  strategyProvenance: PaperLifecycleStrategyProvenance;
  cases: readonly PaperLifecycleReplayCase[];
  config?: PaperLifecycleValidationConfigInput | undefined;
  exitPolicyConfig?: PaperExitPolicyConfigInput | undefined;
};

type PendingExit = {
  ruleId: string;
  trigger: string;
  sellPct: number;
  decidedAtMs: number;
  executeAtMs: number;
  reasonCodes: string[];
};

type ReplayState = {
  replayCase: PaperLifecycleReplayCase;
  status: PaperLifecycleTradeStatus | "pending_entry" | "open";
  position: PaperPosition | null;
  entryFill: PaperFill | null;
  entryPoint: PaperLifecycleReplayPoint | null;
  exitFills: PaperFill[];
  pendingExit: PendingExit | null;
  completedRuleIds: Set<string>;
  selectedExitRuleIds: string[];
  exitEvaluationCount: number;
  entryAttemptCount: number;
  exitAttemptCount: number;
  missedEntryFillCount: number;
  missedExitFillCount: number;
  maximumFavorableExcursionPct: number | null;
  maximumAdverseExcursionPct: number | null;
  exitDecisionLatencies: number[];
  marketImpactSol: number;
  lastExitMarketPriceSol: number | null;
  reasonCodes: string[];
};

type ReplaySimulation = {
  trades: PaperLifecycleTradeResult[];
  snapshot: PaperPortfolioSnapshot;
  peakOpenPositionCount: number;
};

export function createPaperLifecycleValidationConfig(
  input: PaperLifecycleValidationConfigInput = {}
): PaperLifecycleValidationConfig {
  const startingCapitalSol = bounded(
    input.startingCapitalSol,
    0.01,
    1_000,
    defaultPaperLifecycleValidationConfig.startingCapitalSol
  );

  return {
    schemaVersion: 1,
    startingCapitalSol,
    positionSizeSol: bounded(
      input.positionSizeSol,
      0.000001,
      Math.min(startingCapitalSol, 0.01),
      defaultPaperLifecycleValidationConfig.positionSizeSol
    ),
    maxOpenPositions: boundedInteger(
      input.maxOpenPositions,
      1,
      100,
      defaultPaperLifecycleValidationConfig.maxOpenPositions
    ),
    maxDailySpendSol: bounded(
      input.maxDailySpendSol,
      0.000001,
      startingCapitalSol,
      defaultPaperLifecycleValidationConfig.maxDailySpendSol
    ),
    feeBps: bounded(
      input.feeBps,
      0,
      10_000,
      defaultPaperLifecycleValidationConfig.feeBps
    ),
    baseSlippageBps: bounded(
      input.baseSlippageBps,
      0,
      10_000,
      defaultPaperLifecycleValidationConfig.baseSlippageBps
    ),
    maximumMarketImpactBps: bounded(
      input.maximumMarketImpactBps,
      0,
      10_000,
      defaultPaperLifecycleValidationConfig.maximumMarketImpactBps
    ),
    maximumVolumeParticipationRatio: bounded(
      input.maximumVolumeParticipationRatio,
      0.0001,
      1,
      defaultPaperLifecycleValidationConfig.maximumVolumeParticipationRatio
    ),
    entryLatencyMs: boundedInteger(
      input.entryLatencyMs,
      0,
      60_000,
      defaultPaperLifecycleValidationConfig.entryLatencyMs
    ),
    exitLatencyMs: boundedInteger(
      input.exitLatencyMs,
      0,
      60_000,
      defaultPaperLifecycleValidationConfig.exitLatencyMs
    ),
    maximumFillDelayMs: boundedInteger(
      input.maximumFillDelayMs,
      0,
      60_000,
      defaultPaperLifecycleValidationConfig.maximumFillDelayMs
    ),
    entryMissedFillRate: bounded(
      input.entryMissedFillRate,
      0,
      1,
      defaultPaperLifecycleValidationConfig.entryMissedFillRate
    ),
    exitMissedFillRate: bounded(
      input.exitMissedFillRate,
      0,
      1,
      defaultPaperLifecycleValidationConfig.exitMissedFillRate
    ),
    minimumPathCoverageRatio: bounded(
      input.minimumPathCoverageRatio,
      0.5,
      1,
      defaultPaperLifecycleValidationConfig.minimumPathCoverageRatio
    ),
    minimumValidationTrades:
      defaultPaperLifecycleValidationConfig.minimumValidationTrades,
    minimumValidationExpectancyPct:
      defaultPaperLifecycleValidationConfig.minimumValidationExpectancyPct,
    minimumValidationConfidenceLowerBoundPct:
      defaultPaperLifecycleValidationConfig.minimumValidationConfidenceLowerBoundPct,
    minimumValidationProfitFactor:
      defaultPaperLifecycleValidationConfig.minimumValidationProfitFactor,
    maximumValidationDrawdownPct:
      defaultPaperLifecycleValidationConfig.maximumValidationDrawdownPct,
    maximumConsecutiveLosses:
      defaultPaperLifecycleValidationConfig.maximumConsecutiveLosses,
    maximumMissedFillRate:
      defaultPaperLifecycleValidationConfig.maximumMissedFillRate,
    minimumBenchmarkOutperformancePct:
      defaultPaperLifecycleValidationConfig.minimumBenchmarkOutperformancePct
  };
}

export function evaluatePaperLifecycleValidation(
  input: EvaluatePaperLifecycleValidationInput
): PaperLifecycleValidationReport {
  const validationId = input.validationId.trim();
  const evaluatedAt = normalizeIso(input.evaluatedAt);

  if (!validationId) {
    throw new RangeError("paper lifecycle validation ID is required");
  }
  if (!evaluatedAt) {
    throw new RangeError("paper lifecycle validation timestamp is invalid");
  }

  const config = createPaperLifecycleValidationConfig(input.config);
  const exitPolicyConfig = createPaperExitPolicyConfig(input.exitPolicyConfig);
  const dataAudit = auditReplayCases(
    input.cases,
    input.strategyProvenance,
    config
  );
  const simulation = dataAudit.integrityValid
    ? simulateLifecycle(
        validationId,
        input.cases,
        input.strategyProvenance.selectedThreshold,
        config,
        exitPolicyConfig
      )
    : emptySimulation(config, evaluatedAt);
  const trainingPerformance = calculatePerformance(
    "train",
    simulation.trades,
    input.strategyProvenance.selectedThreshold,
    config.startingCapitalSol
  );
  const validationPerformance = calculatePerformance(
    "validation",
    simulation.trades,
    input.strategyProvenance.selectedThreshold,
    config.startingCapitalSol
  );
  const validationHorizonBenchmark = calculateHorizonBenchmark(
    input.cases,
    simulation.trades,
    config
  );
  const benchmarkOutperformancePct =
    validationPerformance?.averageNetReturnPct !== null &&
    validationPerformance?.averageNetReturnPct !== undefined &&
    validationHorizonBenchmark?.averageNetReturnPct !== null &&
    validationHorizonBenchmark?.averageNetReturnPct !== undefined
      ? rounded(
          validationPerformance.averageNetReturnPct -
            validationHorizonBenchmark.averageNetReturnPct
        )
      : null;
  const acceptanceGates = buildAcceptanceGates({
    dataAudit,
    validationPerformance,
    benchmarkOutperformancePct,
    config,
    provenance: input.strategyProvenance
  });
  const validationStatus = determineStatus(
    dataAudit,
    validationPerformance,
    acceptanceGates
  );

  return {
    schemaVersion: 1,
    validationVersion: paperLifecycleValidationVersion,
    validationId,
    evaluatedAt,
    policyStatus: "reference_only",
    validationPolicy: "global_event_time_portfolio_replay",
    selectionPolicy: "upstream_training_threshold_single_temporal_holdout",
    simulationPolicy: "shared_capital_latency_cost_liquidity_and_missed_fills",
    strategyProvenance: {
      ...input.strategyProvenance,
      captureSessionIds: unique(input.strategyProvenance.captureSessionIds)
    },
    captureSessionIds: unique(input.strategyProvenance.captureSessionIds),
    selectedThreshold: input.strategyProvenance.selectedThreshold,
    config,
    exitPolicyVersion: paperExitPolicyVersion,
    exitPolicyConfig,
    dataAudit,
    portfolioSnapshot: simulation.snapshot,
    peakOpenPositionCount: simulation.peakOpenPositionCount,
    trades: simulation.trades,
    trainingPerformance,
    validationPerformance,
    validationHorizonBenchmark,
    benchmarkOutperformancePct,
    acceptanceGates,
    validationStatus,
    automaticThresholdActivation: false,
    automaticPaperTradingActivation: false,
    automaticLiveExecution: false,
    calibrated: false,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true,
    reasonCodes: unique([
      "PAPER_LIFECYCLE_GLOBAL_EVENT_TIME_REPLAY",
      "PAPER_LIFECYCLE_NO_LOOKAHEAD",
      "PAPER_LIFECYCLE_SHARED_CAPITAL_MODELED",
      "PAPER_LIFECYCLE_COST_LATENCY_LIQUIDITY_MODELED",
      "PAPER_LIFECYCLE_RESULT_DOES_NOT_SELF_ACTIVATE",
      "LIVE_EXECUTION_DISABLED",
      ...dataAudit.reasonCodes,
      ...statusReasonCodes(validationStatus)
    ])
  };
}

export function getPaperLifecycleValidationRuntimeContract() {
  return {
    schemaVersion: 1,
    validationVersion: paperLifecycleValidationVersion,
    implementationStatus: "implemented" as const,
    activationMode: "offline_local_only" as const,
    validationPolicy: "global_event_time_portfolio_replay" as const,
    selectionPolicy:
      "upstream_training_threshold_single_temporal_holdout" as const,
    simulationPolicy:
      "shared_capital_latency_cost_liquidity_and_missed_fills" as const,
    defaultConfig: defaultPaperLifecycleValidationConfig,
    exitPolicyVersion: paperExitPolicyVersion,
    temporalHoldoutRequired: true as const,
    canonicalOneSecondPathsRequired: true as const,
    noLookAhead: true as const,
    sharedCapitalModeled: true as const,
    overlappingPositionsModeled: true as const,
    latencyModeled: true as const,
    feesAndSlippageModeled: true as const,
    liquidityParticipationModeled: true as const,
    missedFillsModeled: true as const,
    benchmarkRequired: true as const,
    automaticThresholdActivation: false as const,
    automaticPaperTradingActivation: false as const,
    automaticLiveExecution: false as const,
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const,
    liveExecutionDisabled: true as const,
    reasonCodes: [
      "PAPER_LIFECYCLE_FINALIZED_CAPTURE_REQUIRED",
      "PAPER_LIFECYCLE_UPSTREAM_HOLDOUT_REQUIRED",
      "PAPER_LIFECYCLE_RESULT_IS_NON_ACTIVATING",
      "LIVE_EXECUTION_DISABLED"
    ]
  };
}

function auditReplayCases(
  cases: readonly PaperLifecycleReplayCase[],
  provenance: PaperLifecycleStrategyProvenance,
  config: PaperLifecycleValidationConfig
): PaperLifecycleDataAudit {
  const reasonCodes: string[] = [];
  const ids = cases.map((replayCase) => replayCase.observationId.trim());
  const duplicateObservationCount = ids.length - new Set(ids).size;
  let replayPointCount = 0;
  let expectedReplayPointCount = 0;
  let invalidCaseCount = 0;
  let syntheticPointCount = 0;
  let lookAheadViolationCount = 0;

  if (cases.length === 0) {
    reasonCodes.push("PAPER_LIFECYCLE_REPLAY_CASES_REQUIRED");
  }
  if (duplicateObservationCount > 0) {
    reasonCodes.push("PAPER_LIFECYCLE_DUPLICATE_OBSERVATION");
  }
  if (
    provenance.evaluationStatus !== "paper_observation_candidate" ||
    provenance.evaluationVersion !== "paper-strategy-evaluation-v1" ||
    !Number.isFinite(provenance.selectedThreshold) ||
    provenance.selectedThreshold < 0 ||
    provenance.selectedThreshold > 100 ||
    !nonnegativeInteger(provenance.expectedObservationCount) ||
    provenance.expectedObservationCount !== cases.length
  ) {
    reasonCodes.push("PAPER_LIFECYCLE_UPSTREAM_EVALUATION_INVALID");
  }

  for (const replayCase of cases) {
    const signalAtMs = Date.parse(replayCase.signalAt);
    const outcomeAtMs = Date.parse(replayCase.outcomeAt);
    const caseReasons: string[] = [];
    const seenPointTimes = new Set<number>();
    let previousAtMs = Number.NEGATIVE_INFINITY;

    if (
      !replayCase.observationId.trim() ||
      !replayCase.captureSessionId.trim() ||
      !replayCase.mint.trim()
    ) {
      caseReasons.push("PAPER_LIFECYCLE_CASE_IDENTITY_INVALID");
    }
    if (
      !Number.isFinite(signalAtMs) ||
      !Number.isFinite(outcomeAtMs) ||
      outcomeAtMs <= signalAtMs
    ) {
      caseReasons.push("PAPER_LIFECYCLE_CASE_TIME_INVALID");
    }
    if (
      !Number.isFinite(replayCase.score) ||
      replayCase.score < 0 ||
      replayCase.score > 100 ||
      !positive(replayCase.entryPriceSol)
    ) {
      caseReasons.push("PAPER_LIFECYCLE_CASE_SIGNAL_INVALID");
    }
    if (!provenance.captureSessionIds.includes(replayCase.captureSessionId)) {
      caseReasons.push("PAPER_LIFECYCLE_CAPTURE_SESSION_MISMATCH");
    }

    expectedReplayPointCount +=
      Number.isFinite(signalAtMs) && Number.isFinite(outcomeAtMs)
        ? Math.max(1, Math.ceil((outcomeAtMs - signalAtMs) / 1_000))
        : 0;
    replayPointCount += replayCase.points.length;

    for (const point of replayCase.points) {
      const atMs = Date.parse(point.at);

      if (
        !Number.isFinite(atMs) ||
        !positive(point.priceSol) ||
        !nonnegative(point.volumeSol) ||
        !nonnegative(point.buyVolumeSol) ||
        !nonnegative(point.sellVolumeSol) ||
        !nonnegativeInteger(point.buyCount) ||
        !nonnegativeInteger(point.sellCount) ||
        atMs <= previousAtMs ||
        seenPointTimes.has(atMs)
      ) {
        caseReasons.push("PAPER_LIFECYCLE_REPLAY_POINT_INVALID");
      }
      if (
        Number.isFinite(atMs) &&
        Number.isFinite(signalAtMs) &&
        Number.isFinite(outcomeAtMs) &&
        (atMs <= signalAtMs || atMs > outcomeAtMs)
      ) {
        lookAheadViolationCount += 1;
        caseReasons.push("PAPER_LIFECYCLE_LOOKAHEAD_VIOLATION");
      }
      if (point.synthetic) {
        syntheticPointCount += 1;
        caseReasons.push("PAPER_LIFECYCLE_SYNTHETIC_POINT_REJECTED");
      }
      if (point.source !== "canonical_one_second_bucket") {
        caseReasons.push("PAPER_LIFECYCLE_NON_CANONICAL_POINT_REJECTED");
      }

      previousAtMs = atMs;
      seenPointTimes.add(atMs);
    }

    if (
      replayCase.points.length === 0 ||
      replayCase.points.at(-1)?.at !== normalizeIso(replayCase.outcomeAt)
    ) {
      caseReasons.push("PAPER_LIFECYCLE_OUTCOME_POINT_MISSING");
    }

    if (caseReasons.length > 0) {
      invalidCaseCount += 1;
      reasonCodes.push(...caseReasons);
    }
  }

  const training = cases.filter((item) => item.partition === "train");
  const validation = cases.filter((item) => item.partition === "validation");
  const latestTrainingOutcomeAt = latest(
    training.map((item) => normalizeIso(item.outcomeAt)).filter(isString)
  );
  const earliestValidationSignalAt = earliest(
    validation.map((item) => normalizeIso(item.signalAt)).filter(isString)
  );
  const temporalHoldoutValid =
    latestTrainingOutcomeAt && earliestValidationSignalAt
      ? Date.parse(latestTrainingOutcomeAt) <
        Date.parse(earliestValidationSignalAt)
      : null;

  if (training.length === 0 || validation.length === 0) {
    reasonCodes.push("PAPER_LIFECYCLE_BOTH_PARTITIONS_REQUIRED");
  }
  if (temporalHoldoutValid === false) {
    reasonCodes.push("PAPER_LIFECYCLE_TEMPORAL_HOLDOUT_VIOLATION");
  }

  const pathCoverageRatio = ratio(replayPointCount, expectedReplayPointCount);
  const noLookAheadValid = lookAheadViolationCount === 0;
  const integrityValid =
    cases.length > 0 &&
    duplicateObservationCount === 0 &&
    invalidCaseCount === 0 &&
    training.length > 0 &&
    validation.length > 0 &&
    temporalHoldoutValid === true &&
    noLookAheadValid &&
    !reasonCodes.includes("PAPER_LIFECYCLE_UPSTREAM_EVALUATION_INVALID");
  const qualitySufficient =
    integrityValid &&
    pathCoverageRatio !== null &&
    pathCoverageRatio >= config.minimumPathCoverageRatio;

  if (
    pathCoverageRatio !== null &&
    pathCoverageRatio < config.minimumPathCoverageRatio
  ) {
    reasonCodes.push("PAPER_LIFECYCLE_PATH_COVERAGE_BELOW_MINIMUM");
  }

  return {
    caseCount: cases.length,
    trainingCaseCount: training.length,
    validationCaseCount: validation.length,
    replayPointCount,
    expectedReplayPointCount,
    pathCoverageRatio,
    invalidCaseCount,
    syntheticPointCount,
    duplicateObservationCount,
    temporalHoldoutValid,
    latestTrainingOutcomeAt,
    earliestValidationSignalAt,
    noLookAheadValid,
    integrityValid,
    qualitySufficient,
    reasonCodes: unique(reasonCodes)
  };
}

function simulateLifecycle(
  validationId: string,
  cases: readonly PaperLifecycleReplayCase[],
  threshold: number,
  config: PaperLifecycleValidationConfig,
  exitPolicyConfig: PaperExitPolicyConfig
): ReplaySimulation {
  let clockMs = Math.min(
    ...cases.map((replayCase) => Date.parse(replayCase.signalAt))
  );
  const engine = createPaperPortfolioEngine({
    startingCashSol: config.startingCapitalSol,
    maxPositionSizeSol: config.positionSizeSol,
    maxOpenPositions: config.maxOpenPositions,
    maxDailySpendSol: config.maxDailySpendSol,
    feeBps: config.feeBps,
    slippageBps: config.baseSlippageBps,
    requirePriceForEntry: true,
    requirePriceForExit: true,
    allowPartialExits: true,
    fallbackPriceSol: null,
    paperOnly: true,
    now: () => new Date(clockMs)
  });
  const states = cases
    .map(createReplayState)
    .sort(
      (left, right) =>
        Date.parse(left.replayCase.signalAt) -
          Date.parse(right.replayCase.signalAt) ||
        left.replayCase.observationId.localeCompare(
          right.replayCase.observationId
        )
    );
  const events = states
    .flatMap((state) =>
      state.replayCase.points.map((point, pointIndex) => ({
        atMs: Date.parse(point.at),
        point,
        pointIndex,
        state
      }))
    )
    .sort(
      (left, right) =>
        left.atMs - right.atMs ||
        left.state.replayCase.observationId.localeCompare(
          right.state.replayCase.observationId
        ) ||
        left.pointIndex - right.pointIndex
    );
  let peakOpenPositionCount = 0;

  for (let index = 0; index < events.length;) {
    const atMs = events[index]?.atMs;

    if (atMs === undefined) {
      break;
    }

    const group = [] as typeof events;
    while (index < events.length && events[index]?.atMs === atMs) {
      const event = events[index];
      if (event) {
        group.push(event);
      }
      index += 1;
    }
    clockMs = atMs;

    for (const event of group) {
      processOpenStateAtPoint(
        validationId,
        event.state,
        event.point,
        event.pointIndex,
        engine,
        config,
        exitPolicyConfig
      );
    }

    for (const event of group) {
      processEntryAtPoint(event.state, event.point, engine, threshold, config);
    }

    peakOpenPositionCount = Math.max(
      peakOpenPositionCount,
      engine.getOpenPositions().length
    );
  }

  for (const state of states) {
    if (state.status === "pending_entry") {
      state.status = "entry_rejected";
      state.reasonCodes.push("PAPER_LIFECYCLE_ENTRY_FILL_WINDOW_EXPIRED");
    } else if (state.status === "open") {
      state.status = "open_unresolved";
      state.reasonCodes.push("PAPER_LIFECYCLE_POSITION_UNRESOLVED");
    }
  }

  return {
    trades: states.map(toTradeResult),
    snapshot: engine.getSnapshot(),
    peakOpenPositionCount
  };
}

function createReplayState(replayCase: PaperLifecycleReplayCase): ReplayState {
  return {
    replayCase,
    status: "pending_entry",
    position: null,
    entryFill: null,
    entryPoint: null,
    exitFills: [],
    pendingExit: null,
    completedRuleIds: new Set<string>(),
    selectedExitRuleIds: [],
    exitEvaluationCount: 0,
    entryAttemptCount: 0,
    exitAttemptCount: 0,
    missedEntryFillCount: 0,
    missedExitFillCount: 0,
    maximumFavorableExcursionPct: null,
    maximumAdverseExcursionPct: null,
    exitDecisionLatencies: [],
    marketImpactSol: 0,
    lastExitMarketPriceSol: null,
    reasonCodes: ["PAPER_LIFECYCLE_REPLAY_CASE"]
  };
}

function processEntryAtPoint(
  state: ReplayState,
  point: PaperLifecycleReplayPoint,
  engine: ReturnType<typeof createPaperPortfolioEngine>,
  threshold: number,
  config: PaperLifecycleValidationConfig
): void {
  if (state.status !== "pending_entry") {
    return;
  }

  const signalAtMs = Date.parse(state.replayCase.signalAt);
  const pointAtMs = Date.parse(point.at);
  const firstEligibleAtMs = signalAtMs + config.entryLatencyMs;
  const fillDeadlineMs = firstEligibleAtMs + config.maximumFillDelayMs;

  if (state.replayCase.score < threshold) {
    state.status = "score_below_threshold";
    state.reasonCodes.push("PAPER_LIFECYCLE_SCORE_BELOW_SELECTED_THRESHOLD");
    return;
  }
  if (pointAtMs < firstEligibleAtMs) {
    return;
  }
  if (pointAtMs > fillDeadlineMs) {
    state.status = "entry_rejected";
    state.reasonCodes.push("PAPER_LIFECYCLE_ENTRY_FILL_WINDOW_EXPIRED");
    return;
  }

  state.entryAttemptCount += 1;
  if (
    deterministicMiss(
      `${state.replayCase.observationId}:entry:${point.at}`,
      config.entryMissedFillRate
    )
  ) {
    state.missedEntryFillCount += 1;
    state.reasonCodes.push("PAPER_LIFECYCLE_ENTRY_MISSED_FILL");
    return;
  }
  if (!hasLiquidity(config.positionSizeSol, point, config)) {
    state.missedEntryFillCount += 1;
    state.reasonCodes.push("PAPER_LIFECYCLE_ENTRY_LIQUIDITY_CAP");
    return;
  }

  const impactBps = marketImpactBps(config.positionSizeSol, point, config);
  const adjustedPriceSol = point.priceSol * (1 + impactBps / 10_000);
  const intent: PaperOrderIntent = {
    id: `lifecycle-entry-${safeId(state.replayCase.observationId)}`,
    type: "entry",
    side: "buy",
    mint: state.replayCase.mint,
    symbol: null,
    title: null,
    reason: "paper lifecycle threshold entry",
    source: "replay",
    requestedSizeSol: config.positionSizeSol,
    requestedSellPct: null,
    signalScore: state.replayCase.score,
    riskLevel: "unknown",
    reasonCodes: [
      "PAPER_LIFECYCLE_THRESHOLD_ENTRY",
      "PAPER_LIFECYCLE_LATENCY_APPLIED",
      "PAPER_LIFECYCLE_MARKET_IMPACT_APPLIED",
      paperPortfolioReasonCodes.paperOnlyNoLiveExecution
    ],
    createdAt: point.at
  };
  const fill = engine.simulateBuy(intent, adjustedPriceSol);
  const position = engine.applyFill(fill, intent);

  state.reasonCodes.push(...fill.reasonCodes);

  if (!position || fill.fillStatus === "rejected") {
    if (
      pointAtMs < fillDeadlineMs &&
      isTransientEntryRejection(fill.rejectionReason)
    ) {
      state.reasonCodes.push("PAPER_LIFECYCLE_ENTRY_RETRY_SCHEDULED");
      return;
    }
    state.status = "entry_rejected";
    state.reasonCodes.push("PAPER_LIFECYCLE_ENTRY_REJECTED");
    return;
  }

  state.entryFill = fill;
  state.entryPoint = point;
  state.position = position;
  state.marketImpactSol += fill.sizeSol * (impactBps / 10_000);
  state.status = "open";
  state.reasonCodes.push("PAPER_LIFECYCLE_ENTRY_FILLED");
}

function processOpenStateAtPoint(
  validationId: string,
  state: ReplayState,
  point: PaperLifecycleReplayPoint,
  pointIndex: number,
  engine: ReturnType<typeof createPaperPortfolioEngine>,
  config: PaperLifecycleValidationConfig,
  exitPolicyConfig: PaperExitPolicyConfig
): void {
  if (state.status !== "open" || !state.position || !state.entryPoint) {
    return;
  }

  const marked = engine.updateMarkPrice(state.replayCase.mint, point.priceSol);
  if (marked) {
    state.position = marked;
  }
  updateExcursions(state, point.priceSol);

  const atMs = Date.parse(point.at);
  if (state.pendingExit && atMs >= state.pendingExit.executeAtMs) {
    attemptExit(state, point, engine, config);
  }
  if (state.status !== "open" || state.pendingExit) {
    return;
  }

  const outcomeAtMs = Date.parse(state.replayCase.outcomeAt);
  if (atMs >= outcomeAtMs - config.exitLatencyMs) {
    const horizonDecisionAtMs = outcomeAtMs - config.exitLatencyMs;
    if (horizonDecisionAtMs < Date.parse(state.entryPoint.at)) {
      state.reasonCodes.push(
        "PAPER_LIFECYCLE_EXIT_LATENCY_EXCEEDS_REMAINING_HORIZON"
      );
      return;
    }
    state.pendingExit = {
      ruleId: "validation-horizon-close",
      trigger: "validation_horizon_close",
      sellPct: 100,
      decidedAtMs: horizonDecisionAtMs,
      executeAtMs: outcomeAtMs,
      reasonCodes: ["PAPER_LIFECYCLE_HORIZON_CLOSE"]
    };
  } else {
    const action = evaluateExitAtPoint(
      validationId,
      state,
      point,
      pointIndex,
      exitPolicyConfig
    );
    if (action) {
      state.pendingExit = {
        ruleId: action.ruleId,
        trigger: action.trigger,
        sellPct: action.sellPct,
        decidedAtMs: atMs,
        executeAtMs: atMs + config.exitLatencyMs,
        reasonCodes: action.reasonCodes
      };
    }
  }

  if (state.pendingExit && state.pendingExit.executeAtMs <= atMs) {
    attemptExit(state, point, engine, config);
  }
}

function evaluateExitAtPoint(
  validationId: string,
  state: ReplayState,
  point: PaperLifecycleReplayPoint,
  pointIndex: number,
  exitPolicyConfig: PaperExitPolicyConfig
): PaperExitAction | null {
  const position = state.position;

  if (!position) {
    return null;
  }

  const market = buildMarketContext(state.replayCase, pointIndex);
  const evaluation = evaluatePaperExitPolicy({
    evaluationId: [
      "lifecycle-exit",
      safeId(validationId),
      safeId(state.replayCase.observationId),
      String(pointIndex).padStart(6, "0")
    ].join("-"),
    evaluatedAt: point.at,
    position: {
      mint: position.mint,
      status:
        position.status === "partially_closed" ? "partially_closed" : "open",
      openedAt: position.openedAt,
      entryPriceSol: position.averageEntryPriceSol,
      currentPriceSol: position.currentPriceSol ?? point.priceSol,
      peakPriceSol: position.peakPriceSol ?? point.priceSol,
      unrealizedPnlPct: position.unrealizedPnlPct,
      peakUnrealizedPnlPct:
        position.peakUnrealizedPnlPct ?? position.unrealizedPnlPct,
      remainingSizeSol: position.remainingSizeSol,
      remainingTokenAmount: position.remainingTokenAmount,
      completedRuleIds: [...state.completedRuleIds]
    },
    market,
    config: exitPolicyConfig
  });

  state.exitEvaluationCount += 1;
  return evaluation.selectedAction;
}

function attemptExit(
  state: ReplayState,
  point: PaperLifecycleReplayPoint,
  engine: ReturnType<typeof createPaperPortfolioEngine>,
  config: PaperLifecycleValidationConfig
): void {
  const pending = state.pendingExit;
  const position = state.position;

  if (!pending || !position) {
    return;
  }

  state.exitAttemptCount += 1;
  if (
    deterministicMiss(
      `${state.replayCase.observationId}:exit:${pending.ruleId}:${point.at}`,
      config.exitMissedFillRate
    )
  ) {
    state.missedExitFillCount += 1;
    state.reasonCodes.push("PAPER_LIFECYCLE_EXIT_MISSED_FILL");
    state.pendingExit = null;
    return;
  }
  const requestedExitSizeSol =
    position.remainingTokenAmount * point.priceSol * (pending.sellPct / 100);
  if (!hasLiquidity(requestedExitSizeSol, point, config)) {
    state.missedExitFillCount += 1;
    state.reasonCodes.push("PAPER_LIFECYCLE_EXIT_LIQUIDITY_CAP");
    state.pendingExit = null;
    return;
  }

  const impactBps = marketImpactBps(requestedExitSizeSol, point, config);
  const adjustedPriceSol = point.priceSol * (1 - impactBps / 10_000);
  const completionCode = paperExitRuleCompletionReasonCode(pending.ruleId);
  const intent: PaperOrderIntent = {
    id: [
      "lifecycle-exit",
      safeId(state.replayCase.observationId),
      safeId(pending.ruleId),
      String(state.exitAttemptCount).padStart(4, "0")
    ].join("-"),
    type: "exit",
    side: "sell",
    mint: state.replayCase.mint,
    symbol: null,
    title: null,
    reason: pending.trigger.replaceAll("_", " "),
    source: "replay",
    requestedSizeSol: null,
    requestedSellPct: pending.sellPct,
    signalScore: state.replayCase.score,
    riskLevel: "unknown",
    reasonCodes: unique([
      ...pending.reasonCodes,
      completionCode,
      "PAPER_LIFECYCLE_EXIT_LATENCY_APPLIED",
      "PAPER_LIFECYCLE_MARKET_IMPACT_APPLIED",
      paperPortfolioReasonCodes.paperOnlyNoLiveExecution
    ]),
    createdAt: point.at
  };
  const fill = engine.simulateSell(intent, position, adjustedPriceSol);
  const updated = engine.applyFill(fill, intent);

  state.exitFills.push(fill);
  state.reasonCodes.push(...fill.reasonCodes);
  state.pendingExit = null;

  if (fill.fillStatus === "rejected" || !updated) {
    state.reasonCodes.push("PAPER_LIFECYCLE_EXIT_REJECTED");
    return;
  }

  state.position = updated;
  state.lastExitMarketPriceSol = point.priceSol;
  state.marketImpactSol +=
    fill.tokenAmount * point.priceSol * (impactBps / 10_000);
  state.completedRuleIds.add(pending.ruleId);
  state.selectedExitRuleIds.push(pending.ruleId);
  state.exitDecisionLatencies.push(
    Math.max(0, Date.parse(fill.createdAt) - pending.decidedAtMs)
  );

  if (updated.status === "closed") {
    state.status = "closed";
    state.reasonCodes.push("PAPER_LIFECYCLE_POSITION_CLOSED");
  }
}

function buildMarketContext(
  replayCase: PaperLifecycleReplayCase,
  pointIndex: number
): PaperExitMarketContext {
  const points = replayCase.points.slice(0, pointIndex + 1);
  const current = points.at(-1);
  const previous = points.at(-2);
  const beforePrevious = points.at(-3);
  const currentAtMs = current ? Date.parse(current.at) : 0;
  const priceVelocity = velocityPct(previous, current);
  const previousVelocity = velocityPct(beforePrevious, previous);
  const acceleration = accelerationPerSecond(
    previousVelocity,
    priceVelocity,
    previous?.at ?? null,
    current?.at ?? null
  );
  const recent5s = points.filter(
    (point) => currentAtMs - Date.parse(point.at) < 5_000
  );
  const recent30s = points.filter(
    (point) => currentAtMs - Date.parse(point.at) < 30_000
  );
  const volumeAcceleration = scalarAcceleration(
    beforePrevious?.volumeSol ?? null,
    previous?.volumeSol ?? null,
    current?.volumeSol ?? null,
    beforePrevious?.at ?? null,
    previous?.at ?? null,
    current?.at ?? null
  );
  const buyerAcceleration = scalarAcceleration(
    beforePrevious?.buyCount ?? null,
    previous?.buyCount ?? null,
    current?.buyCount ?? null,
    beforePrevious?.at ?? null,
    previous?.at ?? null,
    current?.at ?? null
  );
  const buyVolume = sum(recent5s.map((point) => point.buyVolumeSol));
  const sellVolume = sum(recent5s.map((point) => point.sellVolumeSol));

  return {
    launchScore: replayCase.score,
    launchPhase: "validation_replay",
    priceVelocityPctPerSec: priceVelocity,
    priceAccelerationPctPerSec2: acceleration,
    volume5sSol: sum(recent5s.map((point) => point.volumeSol)),
    volume30sSol: sum(recent30s.map((point) => point.volumeSol)),
    volumeAccelerationSolPerSec2: volumeAcceleration,
    buyerAccelerationPerSec2: buyerAcceleration,
    netBuyPressure:
      buyVolume + sellVolume > 0
        ? rounded((buyVolume - sellVolume) / (buyVolume + sellVolume))
        : 0,
    liquidityVelocitySolPerSec: null,
    estimatedSellSlippagePct: null,
    riskLevel: "unknown",
    hardReject: false,
    migrationDetected: false,
    watchedWalletSignal: null,
    reasonCodes: [
      "PAPER_LIFECYCLE_CONTEXT_PAST_AND_PRESENT_ONLY",
      "PAPER_LIFECYCLE_UNAVAILABLE_RISK_FIELDS_REMAIN_NULL"
    ]
  };
}

function updateExcursions(state: ReplayState, currentPriceSol: number): void {
  const entryPriceSol = state.entryFill?.effectivePriceSol;
  if (!entryPriceSol || !positive(entryPriceSol)) {
    return;
  }

  const returnPct = ((currentPriceSol - entryPriceSol) / entryPriceSol) * 100;
  state.maximumFavorableExcursionPct = Math.max(
    state.maximumFavorableExcursionPct ?? returnPct,
    returnPct
  );
  state.maximumAdverseExcursionPct = Math.min(
    state.maximumAdverseExcursionPct ?? returnPct,
    returnPct
  );
}

function toTradeResult(state: ReplayState): PaperLifecycleTradeResult {
  const entryFill = state.entryFill;
  const lastExitFill = state.exitFills.at(-1) ?? null;
  const allFills = [...(entryFill ? [entryFill] : []), ...state.exitFills];
  const position = state.position;
  const realizedPnlSol =
    state.status === "closed"
      ? (position?.realizedPnlSol ?? 0) - (entryFill?.feeSol ?? 0)
      : 0;
  const totalFeesSol = sum(allFills.map((fill) => fill.feeSol));
  const totalSlippageSol = sum(allFills.map((fill) => fill.slippageSol));
  const totalMarketImpactSol = state.marketImpactSol;
  const grossPnlSol =
    realizedPnlSol + totalFeesSol + totalSlippageSol + totalMarketImpactSol;
  const requestedSizeSol = entryFill?.sizeSol ?? 0;
  const netReturnPct =
    state.status === "closed" && requestedSizeSol > 0
      ? rounded((realizedPnlSol / requestedSizeSol) * 100)
      : null;
  const grossReturnPct =
    state.status === "closed" && requestedSizeSol > 0
      ? rounded((grossPnlSol / requestedSizeSol) * 100)
      : null;
  const entryFillAt = entryFill?.createdAt ?? null;
  const exitFillAt = lastExitFill?.createdAt ?? null;

  return {
    observationId: state.replayCase.observationId,
    captureSessionId: state.replayCase.captureSessionId,
    partition: state.replayCase.partition,
    mint: state.replayCase.mint,
    score: state.replayCase.score,
    status:
      state.status === "pending_entry"
        ? "entry_rejected"
        : state.status === "open"
          ? "open_unresolved"
          : state.status,
    signalAt: state.replayCase.signalAt,
    outcomeAt: state.replayCase.outcomeAt,
    entryDecisionAt:
      state.status === "score_below_threshold"
        ? null
        : state.replayCase.signalAt,
    entryFillAt,
    entryMarketPriceSol: state.entryPoint?.priceSol ?? null,
    entryEffectivePriceSol: entryFill?.effectivePriceSol ?? null,
    exitFillAt,
    exitMarketPriceSol: state.lastExitMarketPriceSol,
    exitEffectivePriceSol: lastExitFill?.effectivePriceSol ?? null,
    requestedSizeSol,
    realizedPnlSol: rounded(realizedPnlSol, 9),
    netReturnPct,
    grossReturnPct,
    totalFeesSol: rounded(totalFeesSol, 9),
    totalSlippageSol: rounded(totalSlippageSol, 9),
    totalMarketImpactSol: rounded(totalMarketImpactSol, 9),
    maximumFavorableExcursionPct:
      state.maximumFavorableExcursionPct === null
        ? null
        : rounded(state.maximumFavorableExcursionPct),
    maximumAdverseExcursionPct:
      state.maximumAdverseExcursionPct === null
        ? null
        : rounded(state.maximumAdverseExcursionPct),
    holdingMs:
      entryFillAt && exitFillAt
        ? Math.max(0, Date.parse(exitFillAt) - Date.parse(entryFillAt))
        : null,
    entryLatencyMs: entryFillAt
      ? Math.max(
          0,
          Date.parse(entryFillAt) - Date.parse(state.replayCase.signalAt)
        )
      : null,
    averageExitLatencyMs: average(state.exitDecisionLatencies),
    entryAttemptCount: state.entryAttemptCount,
    exitAttemptCount: state.exitAttemptCount,
    missedEntryFillCount: state.missedEntryFillCount,
    missedExitFillCount: state.missedExitFillCount,
    selectedExitRuleIds: unique(state.selectedExitRuleIds),
    exitEvaluationCount: state.exitEvaluationCount,
    reasonCodes: unique(state.reasonCodes)
  };
}

function calculatePerformance(
  partition: PaperLifecyclePartition,
  trades: readonly PaperLifecycleTradeResult[],
  threshold: number,
  startingCapitalSol: number
): PaperLifecyclePerformance | null {
  const partitionTrades = trades.filter(
    (trade) => trade.partition === partition
  );
  if (partitionTrades.length === 0) {
    return null;
  }

  const eligible = partitionTrades.filter((trade) => trade.score >= threshold);
  const closed = eligible
    .filter(
      (trade): trade is PaperLifecycleTradeResult & { netReturnPct: number } =>
        trade.status === "closed" && trade.netReturnPct !== null
    )
    .sort(
      (left, right) =>
        Date.parse(left.exitFillAt ?? left.outcomeAt) -
          Date.parse(right.exitFillAt ?? right.outcomeAt) ||
        left.observationId.localeCompare(right.observationId)
    );
  const returns = closed.map((trade) => trade.netReturnPct);
  const wins = closed.filter((trade) => trade.realizedPnlSol > 0);
  const losses = closed.filter((trade) => trade.realizedPnlSol < 0);
  const grossProfitSol = sum(wins.map((trade) => trade.realizedPnlSol));
  const grossLossSol = Math.abs(
    sum(losses.map((trade) => trade.realizedPnlSol))
  );
  const mean = average(returns);
  const standardDeviation = sampleStandardDeviation(returns);
  const standardError =
    standardDeviation === null || returns.length === 0
      ? null
      : standardDeviation / Math.sqrt(returns.length);
  const confidenceDelta = standardError === null ? null : 1.96 * standardError;
  const drawdown = calculateDrawdown(
    closed.map((trade) => trade.realizedPnlSol),
    startingCapitalSol
  );
  const fillAttemptCount = sum(
    eligible.map((trade) => trade.entryAttemptCount + trade.exitAttemptCount)
  );
  const missedFillCount = sum(
    eligible.map(
      (trade) => trade.missedEntryFillCount + trade.missedExitFillCount
    )
  );
  const profitFactorStatus =
    closed.length === 0 || (grossProfitSol === 0 && grossLossSol === 0)
      ? "unavailable"
      : grossLossSol === 0
        ? "no_losses"
        : "finite";
  const tradeCount = eligible.filter(
    (trade) => trade.entryFillAt !== null
  ).length;

  return {
    partition,
    signalCount: partitionTrades.length,
    thresholdEligibleCount: eligible.length,
    tradeCount,
    entryFillRate: ratio(tradeCount, eligible.length),
    closedTradeCount: closed.length,
    rejectedEntryCount: eligible.filter(
      (trade) => trade.status === "entry_rejected"
    ).length,
    unresolvedPositionCount: eligible.filter(
      (trade) => trade.status === "open_unresolved"
    ).length,
    winCount: wins.length,
    lossCount: losses.length,
    breakEvenCount: closed.length - wins.length - losses.length,
    winRate: ratio(wins.length, closed.length),
    averageNetReturnPct: mean,
    medianNetReturnPct: median(returns),
    netReturnStandardDeviationPct: standardDeviation,
    netReturnStandardErrorPct:
      standardError === null ? null : rounded(standardError),
    netReturnConfidenceLowerBoundPct:
      mean === null || confidenceDelta === null
        ? null
        : rounded(mean - confidenceDelta),
    netReturnConfidenceUpperBoundPct:
      mean === null || confidenceDelta === null
        ? null
        : rounded(mean + confidenceDelta),
    confidenceMethod: "normal_approximation_95pct",
    grossProfitSol: rounded(grossProfitSol, 9),
    grossLossSol: rounded(grossLossSol, 9),
    totalNetPnlSol: rounded(
      sum(closed.map((trade) => trade.realizedPnlSol)),
      9
    ),
    totalFeesSol: rounded(sum(closed.map((trade) => trade.totalFeesSol)), 9),
    totalSlippageSol: rounded(
      sum(closed.map((trade) => trade.totalSlippageSol)),
      9
    ),
    totalMarketImpactSol: rounded(
      sum(closed.map((trade) => trade.totalMarketImpactSol)),
      9
    ),
    profitFactor:
      profitFactorStatus === "finite"
        ? rounded(grossProfitSol / grossLossSol)
        : null,
    profitFactorStatus,
    maximumDrawdownSol: drawdown.maximumDrawdownSol,
    maximumDrawdownPct: drawdown.maximumDrawdownPct,
    maximumConsecutiveLosses: maximumConsecutiveLosses(
      closed.map((trade) => trade.realizedPnlSol)
    ),
    averageMfePct: average(
      closed.map((trade) => trade.maximumFavorableExcursionPct).filter(isNumber)
    ),
    averageMaePct: average(
      closed.map((trade) => trade.maximumAdverseExcursionPct).filter(isNumber)
    ),
    averageEntryLatencyMs: average(
      eligible.map((trade) => trade.entryLatencyMs).filter(isNumber)
    ),
    averageExitLatencyMs: average(
      closed.map((trade) => trade.averageExitLatencyMs).filter(isNumber)
    ),
    fillAttemptCount,
    missedFillCount,
    missedFillRate: ratio(missedFillCount, fillAttemptCount),
    firstSignalAt: earliest(partitionTrades.map((trade) => trade.signalAt)),
    lastExitAt: latest(
      closed.map((trade) => trade.exitFillAt).filter(isString)
    ),
    reasonCodes: [
      "PAPER_LIFECYCLE_SHARED_PORTFOLIO_PERFORMANCE",
      "PAPER_LIFECYCLE_NET_OF_MODELED_COSTS"
    ]
  };
}

function calculateHorizonBenchmark(
  cases: readonly PaperLifecycleReplayCase[],
  trades: readonly PaperLifecycleTradeResult[],
  config: PaperLifecycleValidationConfig
): PaperLifecycleBenchmark | null {
  const byObservation = new Map(
    cases.map((replayCase) => [replayCase.observationId, replayCase])
  );
  const benchmarkTrades = trades
    .filter(
      (trade) => trade.partition === "validation" && trade.entryFillAt !== null
    )
    .flatMap((trade) => {
      const replayCase = byObservation.get(trade.observationId);
      const outcomePoint = replayCase?.points.at(-1);
      if (!replayCase || !outcomePoint || !trade.entryEffectivePriceSol) {
        return [];
      }

      const impactBps = marketImpactBps(
        trade.requestedSizeSol,
        outcomePoint,
        config
      );
      const exitPrice =
        outcomePoint.priceSol *
        (1 - (impactBps + config.baseSlippageBps) / 10_000);
      const grossProceeds =
        (trade.requestedSizeSol / trade.entryEffectivePriceSol) * exitPrice;
      const exitFee = grossProceeds * (config.feeBps / 10_000);
      const netPnlSol =
        grossProceeds -
        exitFee -
        trade.requestedSizeSol -
        trade.requestedSizeSol * (config.feeBps / 10_000);

      return [
        {
          netPnlSol,
          netReturnPct: (netPnlSol / trade.requestedSizeSol) * 100
        }
      ];
    });

  if (benchmarkTrades.length === 0) {
    return null;
  }

  const gains = benchmarkTrades.filter((trade) => trade.netPnlSol > 0);
  const losses = benchmarkTrades.filter((trade) => trade.netPnlSol < 0);
  const grossProfit = sum(gains.map((trade) => trade.netPnlSol));
  const grossLoss = Math.abs(sum(losses.map((trade) => trade.netPnlSol)));
  const profitFactorStatus =
    grossProfit === 0 && grossLoss === 0
      ? "unavailable"
      : grossLoss === 0
        ? "no_losses"
        : "finite";

  return {
    policy: "same_entries_fixed_horizon_close",
    tradeCount: benchmarkTrades.length,
    averageNetReturnPct: average(
      benchmarkTrades.map((trade) => trade.netReturnPct)
    ),
    totalNetPnlSol: rounded(
      sum(benchmarkTrades.map((trade) => trade.netPnlSol)),
      9
    ),
    profitFactor:
      profitFactorStatus === "finite" ? rounded(grossProfit / grossLoss) : null,
    profitFactorStatus,
    reasonCodes: [
      "PAPER_LIFECYCLE_BENCHMARK_SAME_EXECUTED_ENTRIES",
      "PAPER_LIFECYCLE_BENCHMARK_FIXED_HORIZON"
    ]
  };
}

function buildAcceptanceGates(input: {
  dataAudit: PaperLifecycleDataAudit;
  validationPerformance: PaperLifecyclePerformance | null;
  benchmarkOutperformancePct: number | null;
  config: PaperLifecycleValidationConfig;
  provenance: PaperLifecycleStrategyProvenance;
}): PaperLifecycleAcceptanceGate[] {
  const performance = input.validationPerformance;
  const profitFactorPass = Boolean(
    performance &&
    (performance.profitFactorStatus === "no_losses" ||
      (performance.profitFactor !== null &&
        performance.profitFactor >= input.config.minimumValidationProfitFactor))
  );

  return [
    gate(
      "upstream_holdout_candidate",
      input.provenance.evaluationStatus === "paper_observation_candidate",
      input.provenance.evaluationStatus,
      "paper_observation_candidate"
    ),
    gate(
      "dataset_integrity",
      input.dataAudit.integrityValid,
      input.dataAudit.integrityValid,
      "true"
    ),
    gate(
      "path_coverage",
      input.dataAudit.qualitySufficient,
      input.dataAudit.pathCoverageRatio,
      `>= ${input.config.minimumPathCoverageRatio}`
    ),
    gate(
      "temporal_holdout",
      input.dataAudit.temporalHoldoutValid === true,
      input.dataAudit.temporalHoldoutValid,
      "training outcomes strictly before validation signals"
    ),
    gate(
      "validation_trade_count",
      (performance?.closedTradeCount ?? 0) >=
        input.config.minimumValidationTrades,
      performance?.closedTradeCount ?? 0,
      `>= ${input.config.minimumValidationTrades}`
    ),
    gate(
      "validation_expectancy",
      (performance?.averageNetReturnPct ?? Number.NEGATIVE_INFINITY) >
        input.config.minimumValidationExpectancyPct,
      performance?.averageNetReturnPct ?? null,
      `> ${input.config.minimumValidationExpectancyPct}% net of costs`
    ),
    gate(
      "validation_confidence_lower_bound",
      (performance?.netReturnConfidenceLowerBoundPct ??
        Number.NEGATIVE_INFINITY) >
        input.config.minimumValidationConfidenceLowerBoundPct,
      performance?.netReturnConfidenceLowerBoundPct ?? null,
      `> ${input.config.minimumValidationConfidenceLowerBoundPct}%`
    ),
    gate(
      "validation_profit_factor",
      profitFactorPass,
      performance?.profitFactorStatus === "no_losses"
        ? "no_losses"
        : (performance?.profitFactor ?? null),
      `>= ${input.config.minimumValidationProfitFactor} or no losses`
    ),
    gate(
      "validation_drawdown",
      (performance?.maximumDrawdownPct ?? Number.POSITIVE_INFINITY) <=
        input.config.maximumValidationDrawdownPct,
      performance?.maximumDrawdownPct ?? null,
      `<= ${input.config.maximumValidationDrawdownPct}%`
    ),
    gate(
      "validation_consecutive_losses",
      (performance?.maximumConsecutiveLosses ?? Number.POSITIVE_INFINITY) <=
        input.config.maximumConsecutiveLosses,
      performance?.maximumConsecutiveLosses ?? null,
      `<= ${input.config.maximumConsecutiveLosses}`
    ),
    gate(
      "missed_fill_rate",
      performance?.missedFillRate !== null &&
        performance?.missedFillRate !== undefined &&
        performance.missedFillRate <= input.config.maximumMissedFillRate,
      performance?.missedFillRate ?? null,
      `<= ${input.config.maximumMissedFillRate}`
    ),
    gate(
      "entry_fill_rate",
      performance?.entryFillRate !== null &&
        performance?.entryFillRate !== undefined &&
        performance.entryFillRate >= 1 - input.config.maximumMissedFillRate,
      performance?.entryFillRate ?? null,
      `>= ${1 - input.config.maximumMissedFillRate}`
    ),
    gate(
      "resolved_positions",
      (performance?.unresolvedPositionCount ?? Number.POSITIVE_INFINITY) === 0,
      performance?.unresolvedPositionCount ?? null,
      "0"
    ),
    gate(
      "horizon_benchmark",
      input.benchmarkOutperformancePct !== null &&
        input.benchmarkOutperformancePct >=
          input.config.minimumBenchmarkOutperformancePct,
      input.benchmarkOutperformancePct,
      `>= ${input.config.minimumBenchmarkOutperformancePct}% expectancy difference`
    )
  ];
}

function determineStatus(
  audit: PaperLifecycleDataAudit,
  performance: PaperLifecyclePerformance | null,
  gates: readonly PaperLifecycleAcceptanceGate[]
): PaperLifecycleValidationStatus {
  if (!audit.integrityValid) {
    return "invalid_input";
  }
  if (!audit.qualitySufficient) {
    return "data_quality_failed";
  }
  if (
    !performance ||
    performance.closedTradeCount <
      defaultPaperLifecycleValidationConfig.minimumValidationTrades
  ) {
    return "insufficient_evidence";
  }
  return gates.every((item) => item.passed)
    ? "paper_automation_candidate"
    : "holdout_rejected";
}

function statusReasonCodes(status: PaperLifecycleValidationStatus): string[] {
  switch (status) {
    case "invalid_input":
      return ["PAPER_LIFECYCLE_INVALID_INPUT"];
    case "data_quality_failed":
      return ["PAPER_LIFECYCLE_DATA_QUALITY_FAILED"];
    case "insufficient_evidence":
      return ["PAPER_LIFECYCLE_INSUFFICIENT_EVIDENCE"];
    case "holdout_rejected":
      return ["PAPER_LIFECYCLE_HOLDOUT_REJECTED"];
    case "paper_automation_candidate":
      return [
        "PAPER_LIFECYCLE_PAPER_AUTOMATION_CANDIDATE_ONLY",
        "PAPER_LIFECYCLE_MANUAL_REVIEW_REQUIRED"
      ];
  }
}

function gate(
  name: string,
  passed: boolean,
  actual: number | string | boolean | null,
  required: string
): PaperLifecycleAcceptanceGate {
  return { gate: name, passed, actual, required };
}

function emptySimulation(
  config: PaperLifecycleValidationConfig,
  at: string
): ReplaySimulation {
  const engine = createPaperPortfolioEngine({
    startingCashSol: config.startingCapitalSol,
    maxPositionSizeSol: config.positionSizeSol,
    maxOpenPositions: config.maxOpenPositions,
    maxDailySpendSol: config.maxDailySpendSol,
    feeBps: config.feeBps,
    slippageBps: config.baseSlippageBps,
    requirePriceForEntry: true,
    requirePriceForExit: true,
    allowPartialExits: true,
    fallbackPriceSol: null,
    paperOnly: true,
    now: () => new Date(at)
  });
  return {
    trades: [],
    snapshot: engine.getSnapshot(),
    peakOpenPositionCount: 0
  };
}

function hasLiquidity(
  sizeSol: number,
  point: PaperLifecycleReplayPoint,
  config: PaperLifecycleValidationConfig
): boolean {
  return (
    point.volumeSol > 0 &&
    sizeSol <= point.volumeSol * config.maximumVolumeParticipationRatio
  );
}

function marketImpactBps(
  sizeSol: number,
  point: PaperLifecycleReplayPoint,
  config: PaperLifecycleValidationConfig
): number {
  if (point.volumeSol <= 0) {
    return config.maximumMarketImpactBps;
  }
  const participation = sizeSol / point.volumeSol;
  return rounded(
    Math.min(
      config.maximumMarketImpactBps,
      (participation / config.maximumVolumeParticipationRatio) *
        config.maximumMarketImpactBps
    )
  );
}

function deterministicMiss(key: string, rate: number): boolean {
  if (rate <= 0) {
    return false;
  }
  if (rate >= 1) {
    return true;
  }

  let hash = 2_166_136_261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_296 < rate;
}

function isTransientEntryRejection(reason: string | null | undefined): boolean {
  return (
    reason === paperPortfolioReasonCodes.maxOpenPositionsExceeded ||
    reason === paperPortfolioReasonCodes.duplicatePosition ||
    reason === paperPortfolioReasonCodes.insufficientCash
  );
}

function velocityPct(
  previous: PaperLifecycleReplayPoint | undefined,
  current: PaperLifecycleReplayPoint | undefined
): number | null {
  if (!previous || !current || !positive(previous.priceSol)) {
    return null;
  }
  const elapsedSeconds =
    (Date.parse(current.at) - Date.parse(previous.at)) / 1_000;
  return elapsedSeconds > 0
    ? rounded(
        (((current.priceSol - previous.priceSol) / previous.priceSol) * 100) /
          elapsedSeconds
      )
    : null;
}

function accelerationPerSecond(
  previous: number | null,
  current: number | null,
  previousAt: string | null,
  currentAt: string | null
): number | null {
  if (
    previous === null ||
    current === null ||
    previousAt === null ||
    currentAt === null
  ) {
    return null;
  }
  const elapsedSeconds =
    (Date.parse(currentAt) - Date.parse(previousAt)) / 1_000;
  return elapsedSeconds > 0
    ? rounded((current - previous) / elapsedSeconds)
    : null;
}

function scalarAcceleration(
  first: number | null,
  second: number | null,
  third: number | null,
  firstAt: string | null,
  secondAt: string | null,
  thirdAt: string | null
): number | null {
  if (
    first === null ||
    second === null ||
    third === null ||
    firstAt === null ||
    secondAt === null ||
    thirdAt === null
  ) {
    return null;
  }
  const firstElapsed = (Date.parse(secondAt) - Date.parse(firstAt)) / 1_000;
  const secondElapsed = (Date.parse(thirdAt) - Date.parse(secondAt)) / 1_000;
  if (firstElapsed <= 0 || secondElapsed <= 0) {
    return null;
  }
  const firstVelocity = (second - first) / firstElapsed;
  const secondVelocity = (third - second) / secondElapsed;
  return rounded(
    (secondVelocity - firstVelocity) /
      Math.max((firstElapsed + secondElapsed) / 2, 0.001)
  );
}

function calculateDrawdown(values: readonly number[], startingCapital: number) {
  let equity = startingCapital;
  let peak = startingCapital;
  let maximumDrawdownSol = 0;
  let maximumDrawdownPct = 0;

  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    const drawdownSol = Math.max(0, peak - equity);
    const drawdownPct = peak > 0 ? (drawdownSol / peak) * 100 : 0;
    maximumDrawdownSol = Math.max(maximumDrawdownSol, drawdownSol);
    maximumDrawdownPct = Math.max(maximumDrawdownPct, drawdownPct);
  }

  return {
    maximumDrawdownSol: rounded(maximumDrawdownSol, 9),
    maximumDrawdownPct: rounded(maximumDrawdownPct)
  };
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
  const mean = average(values);
  if (mean === null) {
    return null;
  }
  return rounded(
    Math.sqrt(
      sum(values.map((value) => (value - mean) ** 2)) / (values.length - 1)
    )
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return rounded(value);
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? rounded(sum(values) / values.length) : null;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? rounded(numerator / denominator, 6) : null;
}

function bounded(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const finite =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, finite));
}

function boundedInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return Math.round(bounded(value, minimum, maximum, fallback));
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function nonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function nonnegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function normalizeIso(value: string): string | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function earliest(values: readonly string[]): string | null {
  return values.length > 0
    ? ([...values].sort(
        (left, right) => Date.parse(left) - Date.parse(right)
      )[0] ?? null)
    : null;
}

function latest(values: readonly string[]): string | null {
  return values.length > 0
    ? ([...values].sort(
        (left, right) => Date.parse(right) - Date.parse(left)
      )[0] ?? null)
    : null;
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 48) || "unknown";
}

function rounded(value: number, precision = 6): number {
  const factor = 10 ** precision;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
