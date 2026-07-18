export const paperExitPolicyVersion = "paper-exit-policy-v1" as const;

export type PaperExitTrigger =
  | "emergency_hard_risk"
  | "liquidity_deterioration"
  | "stop_loss"
  | "watched_wallet_sell"
  | "trailing_stop"
  | "derivative_reversal"
  | "momentum_decay"
  | "buyer_reversal"
  | "volume_collapse"
  | "watched_wallet_buy"
  | "take_profit_stage_2"
  | "take_profit_stage_1"
  | "maximum_hold_time"
  | "migration_transition";

export type PaperExitPolicyConfig = {
  schemaVersion: 1;
  stopLossPct: number;
  takeProfitStage1Pct: number;
  takeProfitStage1SellPct: number;
  takeProfitStage2Pct: number;
  takeProfitStage2SellPct: number;
  trailingStopPct: number | null;
  trailingActivationPct: number;
  momentumDecayMinimumAgeMs: number;
  momentumDecayMaximumScore: number;
  volumeCollapseRatio: number;
  buyerReversalMaximumPressure: number;
  liquidityMaximumSellSlippagePct: number;
  liquidityMinimumVelocitySolPerSec: number;
  derivativeReversalMaximumVelocityPctPerSec: number;
  derivativeReversalMaximumAccelerationPctPerSec2: number;
  maximumHoldMs: number;
  watchedWalletMinimumProfitPct: number;
  enableLiquidityDeterioration: boolean;
  enableDerivativeReversal: boolean;
  enableMomentumDecay: boolean;
  enableBuyerReversal: boolean;
  enableVolumeCollapse: boolean;
  enableMaximumHold: boolean;
  enableMigrationTransition: boolean;
  migrationSellPct: number;
};

export type PaperExitPolicyConfigInput = Partial<
  Omit<PaperExitPolicyConfig, "schemaVersion">
>;

export const defaultPaperExitPolicyConfig: PaperExitPolicyConfig = {
  schemaVersion: 1,
  stopLossPct: -25,
  takeProfitStage1Pct: 25,
  takeProfitStage1SellPct: 50,
  takeProfitStage2Pct: 50,
  takeProfitStage2SellPct: 100,
  trailingStopPct: null,
  trailingActivationPct: 20,
  momentumDecayMinimumAgeMs: 30_000,
  momentumDecayMaximumScore: 30,
  volumeCollapseRatio: 0.25,
  buyerReversalMaximumPressure: -0.2,
  liquidityMaximumSellSlippagePct: 15,
  liquidityMinimumVelocitySolPerSec: -0.01,
  derivativeReversalMaximumVelocityPctPerSec: -0.1,
  derivativeReversalMaximumAccelerationPctPerSec2: -0.01,
  maximumHoldMs: 300_000,
  watchedWalletMinimumProfitPct: 25,
  enableLiquidityDeterioration: true,
  enableDerivativeReversal: true,
  enableMomentumDecay: true,
  enableBuyerReversal: true,
  enableVolumeCollapse: true,
  enableMaximumHold: true,
  enableMigrationTransition: false,
  migrationSellPct: 50
};

export type PaperExitPolicyPosition = {
  mint: string;
  status: "open" | "partially_closed";
  openedAt: string;
  entryPriceSol: number;
  currentPriceSol: number;
  peakPriceSol: number;
  unrealizedPnlPct: number;
  peakUnrealizedPnlPct: number;
  remainingSizeSol: number;
  remainingTokenAmount: number;
  completedRuleIds: string[];
};

export type PaperExitWatchedWalletSignal = {
  signalId: string;
  side: "buy" | "sell" | "unknown";
  usable: boolean;
  blocked: boolean;
  sellPct: number;
};

export type PaperExitMarketContext = {
  launchScore: number | null;
  launchPhase: string | null;
  priceVelocityPctPerSec: number | null;
  priceAccelerationPctPerSec2: number | null;
  volume5sSol: number | null;
  volume30sSol: number | null;
  volumeAccelerationSolPerSec2: number | null;
  buyerAccelerationPerSec2: number | null;
  netBuyPressure: number | null;
  liquidityVelocitySolPerSec: number | null;
  estimatedSellSlippagePct: number | null;
  riskLevel: "unknown" | "low" | "medium" | "high" | "critical";
  hardReject: boolean;
  migrationDetected: boolean;
  watchedWalletSignal: PaperExitWatchedWalletSignal | null;
  reasonCodes: string[];
};

export type PaperExitRuleEvaluation = {
  ruleId: string;
  trigger: PaperExitTrigger;
  priority: number;
  enabled: boolean;
  matched: boolean;
  eligible: boolean;
  sellPct: number;
  actual: number | string | boolean | null;
  required: string;
  blockers: string[];
  reasonCodes: string[];
};

export type PaperExitAction = {
  ruleId: string;
  trigger: PaperExitTrigger;
  priority: number;
  sellPct: number;
  reason: string;
  reasonCodes: string[];
};

export type PaperExitPolicyEvaluation = {
  schemaVersion: 1;
  policyVersion: typeof paperExitPolicyVersion;
  evaluationId: string;
  evaluatedAt: string;
  mint: string;
  policyStatus: "reference_only";
  evaluationStatus: "invalid_input" | "hold" | "paper_exit_candidate";
  precedencePolicy: "first_eligible_rule_by_ascending_priority";
  config: PaperExitPolicyConfig;
  position: PaperExitPolicyPosition;
  market: PaperExitMarketContext;
  positionAgeMs: number;
  trailingDrawdownPct: number;
  volumeRateRatio5sTo30s: number | null;
  ruleEvaluations: PaperExitRuleEvaluation[];
  selectedAction: PaperExitAction | null;
  automaticPaperExitActivation: false;
  automaticLiveExecution: false;
  calibrated: false;
  paperOnly: true;
  liveExecutionDisabled: true;
  reasonCodes: string[];
};

export type EvaluatePaperExitPolicyInput = {
  evaluationId: string;
  evaluatedAt: string;
  position: PaperExitPolicyPosition;
  market: PaperExitMarketContext;
  config?: PaperExitPolicyConfigInput | undefined;
};

type RuleCandidate = Omit<
  PaperExitRuleEvaluation,
  "blockers" | "eligible" | "reasonCodes"
>;

export function createPaperExitPolicyConfig(
  input: PaperExitPolicyConfigInput = {}
): PaperExitPolicyConfig {
  const takeProfitStage1Pct = bounded(
    input.takeProfitStage1Pct,
    0,
    10_000,
    defaultPaperExitPolicyConfig.takeProfitStage1Pct
  );
  const takeProfitStage2Pct = bounded(
    input.takeProfitStage2Pct,
    takeProfitStage1Pct,
    10_000,
    defaultPaperExitPolicyConfig.takeProfitStage2Pct
  );

  return {
    schemaVersion: 1,
    stopLossPct: bounded(
      input.stopLossPct,
      -100,
      0,
      defaultPaperExitPolicyConfig.stopLossPct
    ),
    takeProfitStage1Pct,
    takeProfitStage1SellPct: bounded(
      input.takeProfitStage1SellPct,
      1,
      100,
      defaultPaperExitPolicyConfig.takeProfitStage1SellPct
    ),
    takeProfitStage2Pct,
    takeProfitStage2SellPct: bounded(
      input.takeProfitStage2SellPct,
      1,
      100,
      defaultPaperExitPolicyConfig.takeProfitStage2SellPct
    ),
    trailingStopPct:
      input.trailingStopPct === undefined
        ? defaultPaperExitPolicyConfig.trailingStopPct
        : input.trailingStopPct === null
          ? null
          : bounded(
              input.trailingStopPct,
              1,
              100,
              defaultPaperExitPolicyConfig.trailingStopPct
            ),
    trailingActivationPct: bounded(
      input.trailingActivationPct,
      0,
      10_000,
      defaultPaperExitPolicyConfig.trailingActivationPct
    ),
    momentumDecayMinimumAgeMs: boundedInteger(
      input.momentumDecayMinimumAgeMs,
      0,
      86_400_000,
      defaultPaperExitPolicyConfig.momentumDecayMinimumAgeMs
    ),
    momentumDecayMaximumScore: bounded(
      input.momentumDecayMaximumScore,
      0,
      100,
      defaultPaperExitPolicyConfig.momentumDecayMaximumScore
    ),
    volumeCollapseRatio: bounded(
      input.volumeCollapseRatio,
      0,
      1,
      defaultPaperExitPolicyConfig.volumeCollapseRatio
    ),
    buyerReversalMaximumPressure: bounded(
      input.buyerReversalMaximumPressure,
      -1,
      1,
      defaultPaperExitPolicyConfig.buyerReversalMaximumPressure
    ),
    liquidityMaximumSellSlippagePct: bounded(
      input.liquidityMaximumSellSlippagePct,
      0,
      100,
      defaultPaperExitPolicyConfig.liquidityMaximumSellSlippagePct
    ),
    liquidityMinimumVelocitySolPerSec: bounded(
      input.liquidityMinimumVelocitySolPerSec,
      -1_000_000,
      0,
      defaultPaperExitPolicyConfig.liquidityMinimumVelocitySolPerSec
    ),
    derivativeReversalMaximumVelocityPctPerSec: bounded(
      input.derivativeReversalMaximumVelocityPctPerSec,
      -10_000,
      0,
      defaultPaperExitPolicyConfig.derivativeReversalMaximumVelocityPctPerSec
    ),
    derivativeReversalMaximumAccelerationPctPerSec2: bounded(
      input.derivativeReversalMaximumAccelerationPctPerSec2,
      -10_000,
      0,
      defaultPaperExitPolicyConfig.derivativeReversalMaximumAccelerationPctPerSec2
    ),
    maximumHoldMs: boundedInteger(
      input.maximumHoldMs,
      1_000,
      86_400_000,
      defaultPaperExitPolicyConfig.maximumHoldMs
    ),
    watchedWalletMinimumProfitPct: bounded(
      input.watchedWalletMinimumProfitPct,
      -100,
      10_000,
      defaultPaperExitPolicyConfig.watchedWalletMinimumProfitPct
    ),
    enableLiquidityDeterioration:
      input.enableLiquidityDeterioration ??
      defaultPaperExitPolicyConfig.enableLiquidityDeterioration,
    enableDerivativeReversal:
      input.enableDerivativeReversal ??
      defaultPaperExitPolicyConfig.enableDerivativeReversal,
    enableMomentumDecay:
      input.enableMomentumDecay ??
      defaultPaperExitPolicyConfig.enableMomentumDecay,
    enableBuyerReversal:
      input.enableBuyerReversal ??
      defaultPaperExitPolicyConfig.enableBuyerReversal,
    enableVolumeCollapse:
      input.enableVolumeCollapse ??
      defaultPaperExitPolicyConfig.enableVolumeCollapse,
    enableMaximumHold:
      input.enableMaximumHold ?? defaultPaperExitPolicyConfig.enableMaximumHold,
    enableMigrationTransition:
      input.enableMigrationTransition ??
      defaultPaperExitPolicyConfig.enableMigrationTransition,
    migrationSellPct: bounded(
      input.migrationSellPct,
      1,
      100,
      defaultPaperExitPolicyConfig.migrationSellPct
    )
  };
}

export function evaluatePaperExitPolicy(
  input: EvaluatePaperExitPolicyInput
): PaperExitPolicyEvaluation {
  const config = createPaperExitPolicyConfig(input.config);
  const evaluationId = input.evaluationId.trim();
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  const openedAtMs = Date.parse(input.position.openedAt);
  const invalidReasons = validateInput(
    input,
    evaluationId,
    evaluatedAtMs,
    openedAtMs
  );
  const evaluatedAt = Number.isFinite(evaluatedAtMs)
    ? new Date(evaluatedAtMs).toISOString()
    : input.evaluatedAt;
  const positionAgeMs =
    Number.isFinite(evaluatedAtMs) && Number.isFinite(openedAtMs)
      ? Math.max(0, evaluatedAtMs - openedAtMs)
      : 0;
  const trailingDrawdownPct = percentageDrawdown(
    input.position.peakPriceSol,
    input.position.currentPriceSol
  );
  const volumeRateRatio5sTo30s = volumeRateRatio(input.market);
  const candidates = buildRuleCandidates({
    config,
    market: input.market,
    position: input.position,
    positionAgeMs,
    trailingDrawdownPct,
    volumeRateRatio5sTo30s
  });
  const completed = new Set(input.position.completedRuleIds);
  const ruleEvaluations = candidates
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.ruleId.localeCompare(right.ruleId)
    )
    .map((candidate): PaperExitRuleEvaluation => {
      const blockers = [
        ...(candidate.enabled ? [] : ["PAPER_EXIT_RULE_DISABLED"]),
        ...(completed.has(candidate.ruleId)
          ? ["PAPER_EXIT_RULE_ALREADY_COMPLETED"]
          : []),
        ...(invalidReasons.length > 0 ? ["PAPER_EXIT_INPUT_INVALID"] : [])
      ];
      const eligible =
        candidate.enabled && candidate.matched && blockers.length === 0;

      return {
        ...candidate,
        eligible,
        blockers,
        reasonCodes: unique([
          `PAPER_EXIT_RULE_${candidate.trigger.toUpperCase()}`,
          ...(candidate.matched ? ["PAPER_EXIT_RULE_MATCHED"] : []),
          ...(eligible ? ["PAPER_EXIT_RULE_ELIGIBLE"] : []),
          ...blockers
        ])
      };
    });
  const selected = ruleEvaluations.find((evaluation) => evaluation.eligible);
  const selectedAction = selected
    ? {
        ruleId: selected.ruleId,
        trigger: selected.trigger,
        priority: selected.priority,
        sellPct: selected.sellPct,
        reason: exitReason(selected.trigger),
        reasonCodes: unique([
          ...selected.reasonCodes,
          `PAPER_EXIT_SELECTED_${selected.trigger.toUpperCase()}`,
          "PAPER_EXIT_POLICY_CANDIDATE_ONLY",
          "LIVE_EXECUTION_DISABLED"
        ])
      }
    : null;
  const evaluationStatus =
    invalidReasons.length > 0
      ? "invalid_input"
      : selectedAction
        ? "paper_exit_candidate"
        : "hold";

  return {
    schemaVersion: 1,
    policyVersion: paperExitPolicyVersion,
    evaluationId: evaluationId || "invalid-evaluation",
    evaluatedAt,
    mint: input.position.mint,
    policyStatus: "reference_only",
    evaluationStatus,
    precedencePolicy: "first_eligible_rule_by_ascending_priority",
    config,
    position: {
      ...input.position,
      completedRuleIds: unique(input.position.completedRuleIds)
    },
    market: {
      ...input.market,
      reasonCodes: unique(input.market.reasonCodes)
    },
    positionAgeMs,
    trailingDrawdownPct,
    volumeRateRatio5sTo30s,
    ruleEvaluations,
    selectedAction,
    automaticPaperExitActivation: false,
    automaticLiveExecution: false,
    calibrated: false,
    paperOnly: true,
    liveExecutionDisabled: true,
    reasonCodes: unique([
      "PAPER_EXIT_POLICY_REFERENCE_ONLY",
      "PAPER_EXIT_POLICY_PRECEDENCE_APPLIED",
      "PAPER_EXIT_POLICY_DOES_NOT_SELF_ACTIVATE",
      "LIVE_EXECUTION_DISABLED",
      ...invalidReasons,
      ...(evaluationStatus === "hold" ? ["PAPER_EXIT_POLICY_HOLD"] : []),
      ...(evaluationStatus === "paper_exit_candidate"
        ? ["PAPER_EXIT_POLICY_CANDIDATE"]
        : [])
    ])
  };
}

export function getPaperExitPolicyRuntimeContract() {
  return {
    schemaVersion: 1,
    policyVersion: paperExitPolicyVersion,
    implementationStatus: "implemented" as const,
    policyStatus: "reference_only" as const,
    evaluationMode: "deterministic_paper_and_replay" as const,
    precedencePolicy: "first_eligible_rule_by_ascending_priority" as const,
    supportedTriggers: [
      "emergency_hard_risk",
      "liquidity_deterioration",
      "stop_loss",
      "watched_wallet_sell",
      "trailing_stop",
      "derivative_reversal",
      "momentum_decay",
      "buyer_reversal",
      "volume_collapse",
      "watched_wallet_buy",
      "take_profit_stage_2",
      "take_profit_stage_1",
      "maximum_hold_time",
      "migration_transition"
    ] as const,
    defaultConfig: defaultPaperExitPolicyConfig,
    automaticPaperExitActivation: false as const,
    automaticLiveExecution: false as const,
    operatorConfiguredPaperExecutionRequired: true as const,
    calibrated: false as const,
    paperOnly: true as const,
    liveExecutionDisabled: true as const,
    reasonCodes: [
      "PAPER_EXIT_POLICY_REFERENCE_ONLY",
      "PAPER_EXIT_POLICY_DOES_NOT_SELF_ACTIVATE",
      "PAPER_EXIT_POLICY_PAPER_REPLAY_FIRST",
      "LIVE_EXECUTION_DISABLED"
    ]
  };
}

export function paperExitRuleCompletionReasonCode(ruleId: string): string {
  const normalized = ruleId
    .trim()
    .replace(/[^a-zA-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toUpperCase();
  return `PAPER_EXIT_RULE_COMPLETED_${normalized || "UNKNOWN"}`;
}

function buildRuleCandidates(input: {
  config: PaperExitPolicyConfig;
  position: PaperExitPolicyPosition;
  market: PaperExitMarketContext;
  positionAgeMs: number;
  trailingDrawdownPct: number;
  volumeRateRatio5sTo30s: number | null;
}): RuleCandidate[] {
  const { config, market, position } = input;
  const wallet = market.watchedWalletSignal;
  const momentumDecayed =
    input.positionAgeMs >= config.momentumDecayMinimumAgeMs &&
    ((market.launchScore !== null &&
      market.launchScore <= config.momentumDecayMaximumScore) ||
      market.launchPhase === "expired" ||
      market.launchPhase === "rejected");
  const liquidityDeteriorated =
    (market.estimatedSellSlippagePct !== null &&
      market.estimatedSellSlippagePct >=
        config.liquidityMaximumSellSlippagePct) ||
    (market.liquidityVelocitySolPerSec !== null &&
      market.liquidityVelocitySolPerSec <=
        config.liquidityMinimumVelocitySolPerSec);
  const walletUsable = Boolean(wallet?.usable && !wallet.blocked);

  return [
    rule(
      "emergency-hard-risk",
      "emergency_hard_risk",
      10,
      true,
      market.hardReject || market.riskLevel === "critical",
      100,
      market.hardReject || market.riskLevel,
      "hard reject or critical risk"
    ),
    rule(
      "liquidity-deterioration",
      "liquidity_deterioration",
      20,
      config.enableLiquidityDeterioration,
      liquidityDeteriorated,
      100,
      market.estimatedSellSlippagePct ?? market.liquidityVelocitySolPerSec,
      `sell slippage >= ${config.liquidityMaximumSellSlippagePct}% or liquidity velocity <= ${config.liquidityMinimumVelocitySolPerSec} SOL/s`
    ),
    rule(
      "stop-loss",
      "stop_loss",
      30,
      true,
      position.unrealizedPnlPct <= config.stopLossPct,
      100,
      position.unrealizedPnlPct,
      `PnL <= ${config.stopLossPct}%`
    ),
    rule(
      "watched-wallet-sell",
      "watched_wallet_sell",
      40,
      true,
      walletUsable && wallet?.side === "sell",
      wallet?.sellPct ?? 100,
      wallet?.side ?? null,
      "usable, unblocked watched-wallet sell signal"
    ),
    rule(
      "trailing-stop",
      "trailing_stop",
      50,
      config.trailingStopPct !== null,
      config.trailingStopPct !== null &&
        position.peakUnrealizedPnlPct >= config.trailingActivationPct &&
        input.trailingDrawdownPct >= config.trailingStopPct,
      100,
      input.trailingDrawdownPct,
      `peak PnL >= ${config.trailingActivationPct}% and peak drawdown >= ${config.trailingStopPct ?? "disabled"}%`
    ),
    rule(
      "derivative-reversal",
      "derivative_reversal",
      60,
      config.enableDerivativeReversal,
      market.priceVelocityPctPerSec !== null &&
        market.priceVelocityPctPerSec <=
          config.derivativeReversalMaximumVelocityPctPerSec &&
        market.priceAccelerationPctPerSec2 !== null &&
        market.priceAccelerationPctPerSec2 <=
          config.derivativeReversalMaximumAccelerationPctPerSec2,
      100,
      market.priceAccelerationPctPerSec2,
      `price velocity <= ${config.derivativeReversalMaximumVelocityPctPerSec}%/s and price acceleration <= ${config.derivativeReversalMaximumAccelerationPctPerSec2}%/s²`
    ),
    rule(
      "momentum-decay",
      "momentum_decay",
      70,
      config.enableMomentumDecay,
      momentumDecayed,
      100,
      market.launchScore,
      `age >= ${config.momentumDecayMinimumAgeMs}ms and score <= ${config.momentumDecayMaximumScore} or phase expired/rejected`
    ),
    rule(
      "buyer-reversal",
      "buyer_reversal",
      80,
      config.enableBuyerReversal,
      isNegative(market.buyerAccelerationPerSec2) &&
        market.netBuyPressure !== null &&
        market.netBuyPressure <= config.buyerReversalMaximumPressure,
      50,
      market.netBuyPressure,
      `buyer acceleration < 0 and net buy pressure <= ${config.buyerReversalMaximumPressure}`
    ),
    rule(
      "volume-collapse",
      "volume_collapse",
      90,
      config.enableVolumeCollapse,
      input.positionAgeMs >= config.momentumDecayMinimumAgeMs &&
        input.volumeRateRatio5sTo30s !== null &&
        input.volumeRateRatio5sTo30s <= config.volumeCollapseRatio &&
        isNonpositive(market.volumeAccelerationSolPerSec2),
      50,
      input.volumeRateRatio5sTo30s,
      `5s/30s volume-rate ratio <= ${config.volumeCollapseRatio} and volume acceleration <= 0`
    ),
    rule(
      "watched-wallet-buy",
      "watched_wallet_buy",
      100,
      true,
      walletUsable &&
        wallet?.side === "buy" &&
        position.unrealizedPnlPct >= config.watchedWalletMinimumProfitPct,
      wallet?.sellPct ?? 100,
      position.unrealizedPnlPct,
      `usable watched-wallet buy and PnL >= ${config.watchedWalletMinimumProfitPct}%`
    ),
    rule(
      "take-profit-stage-2",
      "take_profit_stage_2",
      110,
      true,
      position.unrealizedPnlPct >= config.takeProfitStage2Pct,
      config.takeProfitStage2SellPct,
      position.unrealizedPnlPct,
      `PnL >= ${config.takeProfitStage2Pct}%`
    ),
    rule(
      "take-profit-stage-1",
      "take_profit_stage_1",
      120,
      true,
      position.unrealizedPnlPct >= config.takeProfitStage1Pct,
      config.takeProfitStage1SellPct,
      position.unrealizedPnlPct,
      `PnL >= ${config.takeProfitStage1Pct}%`
    ),
    rule(
      "maximum-hold-time",
      "maximum_hold_time",
      130,
      config.enableMaximumHold,
      input.positionAgeMs >= config.maximumHoldMs,
      100,
      input.positionAgeMs,
      `position age >= ${config.maximumHoldMs}ms`
    ),
    rule(
      "migration-transition",
      "migration_transition",
      140,
      config.enableMigrationTransition,
      market.migrationDetected,
      config.migrationSellPct,
      market.migrationDetected,
      "migration transition observed"
    )
  ];
}

function rule(
  ruleId: string,
  trigger: PaperExitTrigger,
  priority: number,
  enabled: boolean,
  matched: boolean,
  sellPct: number,
  actual: number | string | boolean | null,
  required: string
): RuleCandidate {
  return {
    ruleId,
    trigger,
    priority,
    enabled,
    matched,
    sellPct: bounded(sellPct, 1, 100, 100),
    actual,
    required
  };
}

function validateInput(
  input: EvaluatePaperExitPolicyInput,
  evaluationId: string,
  evaluatedAtMs: number,
  openedAtMs: number
): string[] {
  return unique([
    ...(evaluationId ? [] : ["PAPER_EXIT_EVALUATION_ID_REQUIRED"]),
    ...(input.position.mint.trim()
      ? []
      : ["PAPER_EXIT_POSITION_MINT_REQUIRED"]),
    ...(Number.isFinite(evaluatedAtMs)
      ? []
      : ["PAPER_EXIT_EVALUATED_AT_INVALID"]),
    ...(Number.isFinite(openedAtMs) ? [] : ["PAPER_EXIT_OPENED_AT_INVALID"]),
    ...(Number.isFinite(evaluatedAtMs) &&
    Number.isFinite(openedAtMs) &&
    openedAtMs <= evaluatedAtMs
      ? []
      : ["PAPER_EXIT_POSITION_FROM_FUTURE"]),
    ...(positive(input.position.entryPriceSol)
      ? []
      : ["PAPER_EXIT_ENTRY_PRICE_INVALID"]),
    ...(positive(input.position.currentPriceSol)
      ? []
      : ["PAPER_EXIT_CURRENT_PRICE_INVALID"]),
    ...(positive(input.position.peakPriceSol)
      ? []
      : ["PAPER_EXIT_PEAK_PRICE_INVALID"]),
    ...(input.position.peakPriceSol >= input.position.currentPriceSol
      ? []
      : ["PAPER_EXIT_PEAK_PRICE_BELOW_CURRENT"]),
    ...(Number.isFinite(input.position.unrealizedPnlPct)
      ? []
      : ["PAPER_EXIT_UNREALIZED_PNL_INVALID"]),
    ...(Number.isFinite(input.position.peakUnrealizedPnlPct)
      ? []
      : ["PAPER_EXIT_PEAK_PNL_INVALID"]),
    ...(input.position.peakUnrealizedPnlPct >=
    input.position.unrealizedPnlPct
      ? []
      : ["PAPER_EXIT_PEAK_PNL_BELOW_CURRENT"]),
    ...(input.position.remainingSizeSol > 0 &&
    Number.isFinite(input.position.remainingSizeSol)
      ? []
      : ["PAPER_EXIT_REMAINING_SIZE_INVALID"]),
    ...(input.position.remainingTokenAmount > 0 &&
    Number.isFinite(input.position.remainingTokenAmount)
      ? []
      : ["PAPER_EXIT_REMAINING_TOKEN_AMOUNT_INVALID"]),
    ...(optionalInRange(input.market.launchScore, 0, 100)
      ? []
      : ["PAPER_EXIT_LAUNCH_SCORE_INVALID"]),
    ...(optionalNonnegative(input.market.volume5sSol) &&
    optionalNonnegative(input.market.volume30sSol)
      ? []
      : ["PAPER_EXIT_VOLUME_INVALID"]),
    ...(optionalFinite(input.market.volumeAccelerationSolPerSec2) &&
    optionalFinite(input.market.buyerAccelerationPerSec2) &&
    optionalFinite(input.market.priceVelocityPctPerSec) &&
    optionalFinite(input.market.priceAccelerationPctPerSec2) &&
    optionalFinite(input.market.liquidityVelocitySolPerSec)
      ? []
      : ["PAPER_EXIT_DERIVATIVE_INVALID"]),
    ...(optionalInRange(input.market.netBuyPressure, -1, 1)
      ? []
      : ["PAPER_EXIT_BUY_PRESSURE_INVALID"]),
    ...(optionalNonnegative(input.market.estimatedSellSlippagePct)
      ? []
      : ["PAPER_EXIT_SELL_SLIPPAGE_INVALID"]),
    ...(input.market.watchedWalletSignal === null ||
    (input.market.watchedWalletSignal.signalId.trim().length > 0 &&
      Number.isFinite(input.market.watchedWalletSignal.sellPct) &&
      input.market.watchedWalletSignal.sellPct > 0 &&
      input.market.watchedWalletSignal.sellPct <= 100)
      ? []
      : ["PAPER_EXIT_WATCHED_WALLET_SIGNAL_INVALID"])
  ]);
}

function optionalFinite(value: number | null): boolean {
  return value === null || Number.isFinite(value);
}

function optionalNonnegative(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

function optionalInRange(
  value: number | null,
  minimum: number,
  maximum: number
): boolean {
  return (
    value === null ||
    (Number.isFinite(value) && value >= minimum && value <= maximum)
  );
}

function volumeRateRatio(market: PaperExitMarketContext): number | null {
  if (
    market.volume5sSol === null ||
    market.volume30sSol === null ||
    market.volume5sSol < 0 ||
    market.volume30sSol <= 0
  ) {
    return null;
  }

  return rounded(market.volume5sSol / 5 / (market.volume30sSol / 30));
}

function percentageDrawdown(peak: number, current: number): number {
  return positive(peak) && Number.isFinite(current)
    ? rounded(Math.max(0, ((peak - current) / peak) * 100))
    : 0;
}

function exitReason(trigger: PaperExitTrigger): string {
  return trigger.replaceAll("_", " ");
}

function isNegative(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value < 0;
}

function isNonpositive(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value <= 0;
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function bounded(
  value: number | null | undefined,
  minimum: number,
  maximum: number,
  fallback: number | null
): number {
  const finite =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, finite ?? minimum));
}

function boundedInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return Math.round(bounded(value, minimum, maximum, fallback));
}

function rounded(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
