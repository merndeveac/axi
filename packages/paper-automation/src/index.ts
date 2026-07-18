import type {
  PaperLifecycleValidationConfig,
  PaperLifecycleValidationReport
} from "@axi/paper-lifecycle-validation";

export const paperAutomationVersion = "paper-automation-v1" as const;

export type PaperAutomationDeploymentStatus =
  "approved" | "armed" | "paused" | "revoked";

export type PaperAutomationForwardConfig = {
  schemaVersion: 1;
  maximumSignalAgeMs: number;
  minimumClosedTradesForDrift: number;
  minimumExpectancyRetentionRatio: number;
  minimumForwardExpectancyPct: 0;
  maximumForwardDrawdownPct: number;
  maximumConsecutiveLosses: number;
  maximumRejectedEntryRate: number;
  maximumConsecutiveStaleSignals: number;
};

export type PaperAutomationForwardConfigInput = Partial<
  Omit<
    PaperAutomationForwardConfig,
    "schemaVersion" | "minimumForwardExpectancyPct"
  >
>;

export const defaultPaperAutomationForwardConfig: PaperAutomationForwardConfig =
  {
    schemaVersion: 1,
    maximumSignalAgeMs: 5_000,
    minimumClosedTradesForDrift: 30,
    minimumExpectancyRetentionRatio: 0.5,
    minimumForwardExpectancyPct: 0,
    maximumForwardDrawdownPct: 10,
    maximumConsecutiveLosses: 5,
    maximumRejectedEntryRate: 0.2,
    maximumConsecutiveStaleSignals: 3
  };

export type PaperAutomationDeployment = {
  schemaVersion: 1;
  automationVersion: typeof paperAutomationVersion;
  deploymentId: string;
  validationId: string;
  validationVersion: "paper-lifecycle-validation-v1";
  strategyEvaluationId: string;
  strategyEvaluationVersion: "paper-strategy-evaluation-v1";
  selectedThreshold: number;
  exitPolicyVersion: "paper-exit-policy-v1";
  executionConfig: PaperLifecycleValidationConfig;
  exitPolicyConfig: PaperLifecycleValidationReport["exitPolicyConfig"];
  validationExpectancyPct: number;
  validationConfidenceLowerBoundPct: number;
  forwardStartingEquitySol: number;
  forwardConfig: PaperAutomationForwardConfig;
  approvedBy: string;
  approvedAt: string;
  status: PaperAutomationDeploymentStatus;
  statusReasonCodes: string[];
  armedAt: string | null;
  pausedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
  automaticLiveExecution: false;
  paperOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
};

export type PaperAutomationEventKind =
  | "approved"
  | "armed"
  | "paused"
  | "revoked"
  | "restart_reconciled"
  | "signal_accepted"
  | "signal_rejected"
  | "entry_scheduled"
  | "entry_missed"
  | "entry_executed"
  | "entry_rejected"
  | "entry_expired"
  | "entry_cancelled"
  | "exit_scheduled"
  | "exit_missed"
  | "exit_executed"
  | "exit_rejected"
  | "exit_expired"
  | "exit_cancelled"
  | "drift_detected"
  | "kill_switch_triggered";

export type PaperAutomationEvent = {
  schemaVersion: 1;
  eventId: string;
  deploymentId: string;
  operationId: string | null;
  kind: PaperAutomationEventKind;
  mint: string | null;
  observedAt: string;
  orderId: string | null;
  fillId: string | null;
  entryFeeSol: number | null;
  positionSizeSol: number | null;
  realizedPnlSol: number | null;
  positionClosed: boolean | null;
  reasonCodes: string[];
  payload: unknown;
  paperOnly: true;
  liveExecutionDisabled: true;
};

export type PaperAutomationOperationKind = "entry" | "exit";
export type PaperAutomationOperationStatus =
  "pending" | "executed" | "rejected" | "expired" | "cancelled";

export type PaperAutomationOperation = {
  schemaVersion: 1;
  operationId: string;
  deploymentId: string;
  kind: PaperAutomationOperationKind;
  status: PaperAutomationOperationStatus;
  mint: string;
  signalScore: number;
  signalHardReject: boolean;
  signalAt: string;
  executeAfter: string;
  expiresAt: string;
  exitEvaluationId: string | null;
  reasonCodes: string[];
  createdAt: string;
  updatedAt: string;
  paperOnly: true;
  liveExecutionDisabled: true;
};

export type PaperAutomationForwardMetrics = {
  entryDecisionCount: number;
  filledEntryCount: number;
  rejectedEntryCount: number;
  rejectedEntryRate: number | null;
  fillAttemptCount: number;
  missedFillCount: number;
  missedFillRate: number | null;
  closedTradeCount: number;
  winCount: number;
  lossCount: number;
  averageNetReturnPct: number | null;
  totalNetPnlSol: number;
  maximumDrawdownPct: number;
  maximumConsecutiveLosses: number;
  consecutiveStaleSignalCount: number;
  latestEventAt: string | null;
};

export type PaperAutomationHealth = {
  healthy: boolean;
  sufficientForDriftEvaluation: boolean;
  metrics: PaperAutomationForwardMetrics;
  blockers: string[];
  warnings: string[];
  automaticPauseRequired: boolean;
  paperOnly: true;
  liveExecutionDisabled: true;
};

export type PaperAutomationPortfolioConfig = {
  enabled: boolean;
  legacyEntryEnabled: boolean;
  legacyExitEnabled: boolean;
  startingCashSol: number;
  maxPositionSizeSol: number;
  maxOpenPositions: number;
  maxDailySpendSol: number;
  feeBps: number;
  slippageBps: number;
  allowPartialExits: boolean;
};

export function createPaperAutomationForwardConfig(
  input: PaperAutomationForwardConfigInput = {}
): PaperAutomationForwardConfig {
  return {
    schemaVersion: 1,
    maximumSignalAgeMs: stricterMaximum(
      input.maximumSignalAgeMs,
      defaultPaperAutomationForwardConfig.maximumSignalAgeMs,
      1
    ),
    minimumClosedTradesForDrift: stricterMinimumInteger(
      input.minimumClosedTradesForDrift,
      defaultPaperAutomationForwardConfig.minimumClosedTradesForDrift
    ),
    minimumExpectancyRetentionRatio: stricterMinimum(
      input.minimumExpectancyRetentionRatio,
      defaultPaperAutomationForwardConfig.minimumExpectancyRetentionRatio,
      1
    ),
    minimumForwardExpectancyPct: 0,
    maximumForwardDrawdownPct: stricterMaximum(
      input.maximumForwardDrawdownPct,
      defaultPaperAutomationForwardConfig.maximumForwardDrawdownPct,
      0.01
    ),
    maximumConsecutiveLosses: stricterMaximumInteger(
      input.maximumConsecutiveLosses,
      defaultPaperAutomationForwardConfig.maximumConsecutiveLosses,
      1
    ),
    maximumRejectedEntryRate: stricterMaximum(
      input.maximumRejectedEntryRate,
      defaultPaperAutomationForwardConfig.maximumRejectedEntryRate,
      0
    ),
    maximumConsecutiveStaleSignals: stricterMaximumInteger(
      input.maximumConsecutiveStaleSignals,
      defaultPaperAutomationForwardConfig.maximumConsecutiveStaleSignals,
      1
    )
  };
}

export function createPaperAutomationDeployment(input: {
  deploymentId: string;
  validation: PaperLifecycleValidationReport;
  approvedBy: string;
  approvedAt: string;
  forwardStartingEquitySol?: number | undefined;
  forwardConfig?: PaperAutomationForwardConfigInput | undefined;
}): PaperAutomationDeployment {
  const deploymentId = input.deploymentId.trim();
  const approvedBy = input.approvedBy.trim();
  const approvedAt = normalizeIso(input.approvedAt);
  const validation = input.validation;
  const forwardStartingEquitySol = finite(
    input.forwardStartingEquitySol,
    validation.config.startingCapitalSol
  );

  if (
    !deploymentId ||
    !approvedBy ||
    !approvedAt ||
    forwardStartingEquitySol <= 0
  ) {
    throw new RangeError("paper automation approval identity is invalid");
  }
  if (
    validation.validationStatus !== "paper_automation_candidate" ||
    !validation.dataAudit.integrityValid ||
    !validation.dataAudit.qualitySufficient ||
    !validation.validationPerformance ||
    validation.acceptanceGates.length === 0 ||
    !validation.acceptanceGates.every((gate) => gate.passed)
  ) {
    throw new RangeError(
      "paper automation requires a lifecycle validation with every promotion gate passed"
    );
  }
  const expectancy = validation.validationPerformance.averageNetReturnPct;
  const confidenceLower =
    validation.validationPerformance.netReturnConfidenceLowerBoundPct;
  if (
    expectancy === null ||
    expectancy <= 0 ||
    confidenceLower === null ||
    confidenceLower <= 0
  ) {
    throw new RangeError("paper automation validation expectancy is invalid");
  }

  return {
    schemaVersion: 1,
    automationVersion: paperAutomationVersion,
    deploymentId,
    validationId: validation.validationId,
    validationVersion: validation.validationVersion,
    strategyEvaluationId: validation.strategyProvenance.evaluationId,
    strategyEvaluationVersion: validation.strategyProvenance.evaluationVersion,
    selectedThreshold: validation.selectedThreshold,
    exitPolicyVersion: validation.exitPolicyVersion,
    executionConfig: validation.config,
    exitPolicyConfig: validation.exitPolicyConfig,
    validationExpectancyPct: expectancy,
    validationConfidenceLowerBoundPct: confidenceLower,
    forwardStartingEquitySol,
    forwardConfig: createPaperAutomationForwardConfig(input.forwardConfig),
    approvedBy,
    approvedAt,
    status: "approved",
    statusReasonCodes: [
      "PAPER_AUTOMATION_OPERATOR_APPROVED",
      "PAPER_AUTOMATION_NOT_ARMED",
      "LIVE_EXECUTION_DISABLED"
    ],
    armedAt: null,
    pausedAt: null,
    revokedAt: null,
    updatedAt: approvedAt,
    automaticLiveExecution: false,
    paperOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true
  };
}

export function transitionPaperAutomationDeployment(input: {
  deployment: PaperAutomationDeployment;
  status: PaperAutomationDeploymentStatus;
  at: string;
  reasonCodes: string[];
}): PaperAutomationDeployment {
  const at = normalizeIso(input.at);
  if (!at || Date.parse(at) < Date.parse(input.deployment.approvedAt)) {
    throw new RangeError("paper automation transition timestamp is invalid");
  }
  if (!isAllowedTransition(input.deployment.status, input.status)) {
    throw new RangeError(
      `paper automation cannot transition from ${input.deployment.status} to ${input.status}`
    );
  }

  return {
    ...input.deployment,
    status: input.status,
    statusReasonCodes: unique([
      ...input.reasonCodes,
      "PAPER_AUTOMATION_PAPER_ONLY",
      "LIVE_EXECUTION_DISABLED"
    ]),
    armedAt: input.status === "armed" ? at : input.deployment.armedAt,
    pausedAt: input.status === "paused" ? at : input.deployment.pausedAt,
    revokedAt: input.status === "revoked" ? at : input.deployment.revokedAt,
    updatedAt: at,
    automaticLiveExecution: false,
    paperOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true
  };
}

export function getPaperAutomationCompatibilityBlockers(input: {
  deployment: PaperAutomationDeployment;
  portfolio: PaperAutomationPortfolioConfig;
}): string[] {
  const expected = input.deployment.executionConfig;
  const actual = input.portfolio;

  return unique([
    ...(actual.enabled ? [] : ["PAPER_AUTOMATION_PORTFOLIO_DISABLED"]),
    ...(!actual.legacyEntryEnabled
      ? []
      : ["PAPER_AUTOMATION_LEGACY_ENTRY_LOOP_ENABLED"]),
    ...(!actual.legacyExitEnabled
      ? []
      : ["PAPER_AUTOMATION_LEGACY_EXIT_LOOP_ENABLED"]),
    ...(actual.allowPartialExits
      ? []
      : ["PAPER_AUTOMATION_PARTIAL_EXITS_DISABLED"]),
    ...(sameNumber(actual.startingCashSol, expected.startingCapitalSol)
      ? []
      : ["PAPER_AUTOMATION_STARTING_CAPITAL_MISMATCH"]),
    ...(actual.maxPositionSizeSol + 1e-12 >= expected.positionSizeSol
      ? []
      : ["PAPER_AUTOMATION_POSITION_LIMIT_MISMATCH"]),
    ...(actual.maxOpenPositions === expected.maxOpenPositions
      ? []
      : ["PAPER_AUTOMATION_OPEN_POSITION_LIMIT_MISMATCH"]),
    ...(sameNumber(actual.maxDailySpendSol, expected.maxDailySpendSol)
      ? []
      : ["PAPER_AUTOMATION_DAILY_SPEND_MISMATCH"]),
    ...(sameNumber(actual.feeBps, expected.feeBps)
      ? []
      : ["PAPER_AUTOMATION_FEE_ASSUMPTION_MISMATCH"]),
    ...(sameNumber(actual.slippageBps, expected.baseSlippageBps)
      ? []
      : ["PAPER_AUTOMATION_SLIPPAGE_ASSUMPTION_MISMATCH"])
  ]);
}

export function calculatePaperAutomationForwardMetrics(
  events: readonly PaperAutomationEvent[],
  startingCapitalSol: number
): PaperAutomationForwardMetrics {
  const sorted = events
    .map((event, index) => ({ event, index }))
    .sort(
      (left, right) =>
        Date.parse(left.event.observedAt) -
          Date.parse(right.event.observedAt) || left.index - right.index
    )
    .map(({ event }) => event);
  const entryEvents = sorted.filter((event) =>
    ["entry_executed", "entry_rejected", "entry_expired"].includes(event.kind)
  );
  const filledEntries = entryEvents.filter(
    (event) => event.kind === "entry_executed"
  );
  const rejectedEntries = entryEvents.filter(
    (event) => event.kind === "entry_rejected" || event.kind === "entry_expired"
  );
  const fillAttempts = sorted.filter((event) =>
    [
      "entry_missed",
      "exit_missed",
      "entry_executed",
      "entry_rejected",
      "exit_executed",
      "exit_rejected"
    ].includes(event.kind)
  );
  const missedFills = fillAttempts.filter((event) =>
    ["entry_missed", "exit_missed"].includes(event.kind)
  );
  const entryFeesByMint = new Map<string, number[]>();
  for (const event of filledEntries) {
    if (event.mint) {
      const fees = entryFeesByMint.get(event.mint) ?? [];
      fees.push(event.entryFeeSol ?? 0);
      entryFeesByMint.set(event.mint, fees);
    }
  }
  const closed = sorted
    .filter(
      (event) =>
        event.kind === "exit_executed" &&
        event.positionClosed === true &&
        event.realizedPnlSol !== null &&
        event.positionSizeSol !== null &&
        event.positionSizeSol > 0
    )
    .map((event) => {
      const fees = event.mint ? entryFeesByMint.get(event.mint) : undefined;
      const entryFee = fees?.shift() ?? 0;
      const netPnlSol = (event.realizedPnlSol ?? 0) - entryFee;
      return {
        netPnlSol,
        netReturnPct: (netPnlSol / (event.positionSizeSol ?? 1)) * 100
      };
    });
  const returns = closed.map((trade) => trade.netReturnPct);
  const pnl = closed.map((trade) => trade.netPnlSol);

  return {
    entryDecisionCount: entryEvents.length,
    filledEntryCount: filledEntries.length,
    rejectedEntryCount: rejectedEntries.length,
    rejectedEntryRate: ratio(rejectedEntries.length, entryEvents.length),
    fillAttemptCount: fillAttempts.length,
    missedFillCount: missedFills.length,
    missedFillRate: ratio(missedFills.length, fillAttempts.length),
    closedTradeCount: closed.length,
    winCount: closed.filter((trade) => trade.netPnlSol > 0).length,
    lossCount: closed.filter((trade) => trade.netPnlSol < 0).length,
    averageNetReturnPct: average(returns),
    totalNetPnlSol: rounded(sum(pnl), 9),
    maximumDrawdownPct: calculateDrawdownPct(pnl, startingCapitalSol),
    maximumConsecutiveLosses: consecutiveLosses(pnl),
    consecutiveStaleSignalCount: trailingCount(
      sorted.filter((event) =>
        ["signal_accepted", "signal_rejected"].includes(event.kind)
      ),
      (event) =>
        event.kind === "signal_rejected" &&
        event.reasonCodes.includes("PAPER_AUTOMATION_SIGNAL_STALE")
    ),
    latestEventAt: sorted.at(-1)?.observedAt ?? null
  };
}

export function evaluatePaperAutomationHealth(input: {
  deployment: PaperAutomationDeployment;
  events: readonly PaperAutomationEvent[];
}): PaperAutomationHealth {
  const metrics = calculatePaperAutomationForwardMetrics(
    input.events,
    input.deployment.forwardStartingEquitySol
  );
  const config = input.deployment.forwardConfig;
  const sufficientForDriftEvaluation =
    metrics.closedTradeCount >= config.minimumClosedTradesForDrift;
  const retainedExpectancyFloor = Math.max(
    config.minimumForwardExpectancyPct,
    input.deployment.validationExpectancyPct *
      config.minimumExpectancyRetentionRatio
  );
  const blockers = unique([
    ...(metrics.maximumDrawdownPct <= config.maximumForwardDrawdownPct
      ? []
      : ["PAPER_AUTOMATION_FORWARD_DRAWDOWN_EXCEEDED"]),
    ...(metrics.maximumConsecutiveLosses <= config.maximumConsecutiveLosses
      ? []
      : ["PAPER_AUTOMATION_CONSECUTIVE_LOSSES_EXCEEDED"]),
    ...(metrics.rejectedEntryRate === null ||
    metrics.entryDecisionCount < 10 ||
    metrics.rejectedEntryRate <= config.maximumRejectedEntryRate
      ? []
      : ["PAPER_AUTOMATION_REJECTED_ENTRY_RATE_EXCEEDED"]),
    ...(metrics.missedFillRate === null ||
    metrics.fillAttemptCount < 10 ||
    metrics.missedFillRate <=
      input.deployment.executionConfig.maximumMissedFillRate
      ? []
      : ["PAPER_AUTOMATION_MISSED_FILL_RATE_EXCEEDED"]),
    ...(metrics.consecutiveStaleSignalCount <
    config.maximumConsecutiveStaleSignals
      ? []
      : ["PAPER_AUTOMATION_STALE_SIGNAL_LIMIT_EXCEEDED"]),
    ...(sufficientForDriftEvaluation &&
    (metrics.averageNetReturnPct === null ||
      metrics.averageNetReturnPct < retainedExpectancyFloor)
      ? ["PAPER_AUTOMATION_EXPECTANCY_DRIFT"]
      : [])
  ]);

  return {
    healthy: blockers.length === 0,
    sufficientForDriftEvaluation,
    metrics,
    blockers,
    warnings: sufficientForDriftEvaluation
      ? []
      : ["PAPER_AUTOMATION_FORWARD_EVIDENCE_ACCUMULATING"],
    automaticPauseRequired: blockers.length > 0,
    paperOnly: true,
    liveExecutionDisabled: true
  };
}

export function deterministicPaperAutomationMiss(
  key: string,
  rate: number
): boolean {
  const boundedRate = Math.min(1, Math.max(0, finite(rate, 0)));
  if (boundedRate <= 0) return false;
  if (boundedRate >= 1) return true;
  let hash = 2_166_136_261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_296 < boundedRate;
}

export function paperAutomationMarketImpactBps(input: {
  sizeSol: number;
  volumeSol: number;
  maximumVolumeParticipationRatio: number;
  maximumMarketImpactBps: number;
}): number | null {
  if (
    input.sizeSol <= 0 ||
    input.volumeSol <= 0 ||
    input.maximumVolumeParticipationRatio <= 0 ||
    input.sizeSol > input.volumeSol * input.maximumVolumeParticipationRatio
  ) {
    return null;
  }
  const participation = input.sizeSol / input.volumeSol;
  return rounded(
    Math.min(
      input.maximumMarketImpactBps,
      (participation / input.maximumVolumeParticipationRatio) *
        input.maximumMarketImpactBps
    )
  );
}

export function getPaperAutomationRuntimeContract() {
  return {
    schemaVersion: 1,
    automationVersion: paperAutomationVersion,
    implementationStatus: "implemented" as const,
    activationMode: "operator_approved_paper_only" as const,
    approvalSource: "paper_automation_candidate" as const,
    restartPolicy: "fail_closed_rearm_required" as const,
    forwardValidation: true as const,
    latencyModeled: true as const,
    deterministicMissedFillsModeled: true as const,
    liquidityAndMarketImpactModeled: true as const,
    driftKillSwitch: true as const,
    automaticLiveExecution: false as const,
    paperOnly: true as const,
    tradingDisabled: true as const,
    liveExecutionDisabled: true as const,
    defaultForwardConfig: defaultPaperAutomationForwardConfig,
    reasonCodes: [
      "PAPER_AUTOMATION_EXPLICIT_APPROVAL_REQUIRED",
      "PAPER_AUTOMATION_EXPLICIT_ARM_REQUIRED",
      "PAPER_AUTOMATION_RESTART_REARM_REQUIRED",
      "LIVE_EXECUTION_DISABLED"
    ]
  };
}

function isAllowedTransition(
  from: PaperAutomationDeploymentStatus,
  to: PaperAutomationDeploymentStatus
): boolean {
  if (from === "revoked") return to === "revoked";
  if (to === "revoked") return true;
  if (from === "approved") return to === "armed" || to === "paused";
  if (from === "armed") return to === "paused";
  return to === "armed" || to === "paused";
}

function stricterMaximum(
  value: number | undefined,
  defaultValue: number,
  minimum: number
): number {
  return Math.max(minimum, Math.min(defaultValue, finite(value, defaultValue)));
}

function stricterMaximumInteger(
  value: number | undefined,
  defaultValue: number,
  minimum: number
): number {
  return Math.round(stricterMaximum(value, defaultValue, minimum));
}

function stricterMinimum(
  value: number | undefined,
  defaultValue: number,
  maximum: number
): number {
  return Math.min(maximum, Math.max(defaultValue, finite(value, defaultValue)));
}

function stricterMinimumInteger(
  value: number | undefined,
  defaultValue: number
): number {
  return Math.round(stricterMinimum(value, defaultValue, 100_000));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeIso(value: string): string | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-12;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? rounded(numerator / denominator, 6) : null;
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? rounded(sum(values) / values.length) : null;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function rounded(value: number, precision = 6): number {
  const factor = 10 ** precision;
  return Number.isFinite(value) ? Math.round(value * factor) / factor : 0;
}

function calculateDrawdownPct(
  values: readonly number[],
  startingCapital: number
): number {
  let equity = startingCapital;
  let peak = startingCapital;
  let maximum = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maximum = Math.max(maximum, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
  }
  return rounded(maximum);
}

function consecutiveLosses(values: readonly number[]): number {
  let current = 0;
  let maximum = 0;
  for (const value of values) {
    current = value < 0 ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function trailingCount<T>(
  values: readonly T[],
  predicate: (value: T) => boolean
): number {
  let count = 0;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value === undefined || !predicate(value)) break;
    count += 1;
  }
  return count;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
