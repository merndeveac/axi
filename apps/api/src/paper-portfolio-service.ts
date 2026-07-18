import {
  createPaperExitPolicyConfig,
  evaluatePaperExitPolicy,
  getPaperExitPolicyRuntimeContract,
  paperExitRuleCompletionReasonCode,
  type ExitSignal,
  type PaperExitMarketContext,
  type PaperExitPolicyConfig,
  type PaperExitPolicyConfigInput
} from "@axi/exit-strategy";
import type { LaunchCandidateView } from "./launch-scanner-service";
import type { OverlaySignal, RiskLevel, RiskSnapshot } from "@axi/shared";
import {
  paperAutomationMarketImpactBps,
  type PaperAutomationPortfolioConfig
} from "@axi/paper-automation";
import {
  createEntryIntentFromLaunchSignal,
  createExitIntentFromExitSignal,
  createPaperPortfolioEngine,
  paperPortfolioReasonCodes,
  type PaperFill,
  type PaperOrderIntent,
  type PaperOrderSource,
  type PaperPortfolioConfig,
  type PaperPortfolioEngine,
  type PaperPortfolioSnapshot,
  type PaperPosition,
  type PaperRiskLevel
} from "@axi/paper-portfolio";
import {
  getPaperExitPolicyEvaluation,
  getPaperPortfolioPosition,
  getStorageStats,
  listPaperExitPolicyEvaluations,
  listPaperPortfolioFills,
  listPaperPortfolioFillsForState,
  listPaperPortfolioOrders,
  listPaperPortfolioOrdersForState,
  listPaperPortfolioPositions,
  listPaperPortfolioPositionsForState,
  listPaperPortfolioSnapshots,
  savePaperPortfolioFill,
  savePaperPortfolioOrder,
  savePaperPortfolioSnapshot,
  savePaperExitPolicyEvaluation,
  upsertPaperPortfolioPosition,
  type StoredPaperPortfolioFill,
  type StoredPaperPortfolioOrder,
  type StoredPaperPortfolioPosition,
  type StoredPaperPortfolioSnapshot,
  type StoredPaperExitPolicyEvaluation
} from "@axi/storage";

export type PaperEntryPolicyConfig = {
  enabled: boolean;
  minLaunchScore: number;
  allowedLabels: string[];
  maxRiskLevel: RiskLevel;
  blockHardReject: boolean;
  requireTradeTracked: boolean;
  requirePrice: boolean;
  minValidTradeSamples: number;
  minBuySellRatio: number;
  minUniqueBuyers10s: number;
  maxAgeSeconds: number;
  positionSizeSol: number;
  cooldownByMintMs: number;
};

export type PaperExitExecutionPolicyConfig = {
  enabled: boolean;
  allowWatchedWalletSignals: boolean;
  defaultSellPct: number;
  requirePrice: boolean;
  minProfitPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number | null;
  cooldownMs: number;
  policy?: PaperExitPolicyConfigInput | undefined;
};

export type PaperPortfolioServiceConfig = PaperPortfolioConfig & {
  enabled: boolean;
  resetEnabled: boolean;
  entry: PaperEntryPolicyConfig;
  exit: PaperExitExecutionPolicyConfig;
};

export type PaperPortfolioStatus = {
  enabled: boolean;
  entryPolicyEnabled: boolean;
  exitPolicyEnabled: boolean;
  openPositionCount: number;
  closedPositionCount: number;
  orderCount: number;
  fillCount: number;
  snapshotCount: number;
  totalPnlSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  winRate: number;
  maxDrawdownSol: number;
  exitPolicyVersion: string;
  exitPolicyEvaluationCount: number;
  paperOnly: true;
  liveExecutionDisabled: true;
  reasonCodes: string[];
};

export type PaperPortfolioEvaluation = {
  intent: PaperOrderIntent | null;
  fill: PaperFill | null;
  position: PaperPosition | null;
  snapshot: PaperPortfolioSnapshot;
  blocked: boolean;
  reasonCodes: string[];
  paperOnly: true;
  liveExecutionDisabled: true;
  exitPolicyEvaluation?: StoredPaperExitPolicyEvaluation | null | undefined;
};

export type ApprovedPaperAutomationExecution = {
  deploymentId: string;
  operationId: string;
  positionSizeSol: number;
  maximumVolumeParticipationRatio: number;
  maximumMarketImpactBps: number;
};

export type PaperPositionSummary = {
  hasPosition: boolean;
  status: PaperPosition["status"] | null;
  entryPriceSol: number | null;
  currentPriceSol: number | null;
  peakPriceSol: number | null;
  peakUnrealizedPnlPct: number | null;
  unrealizedPnlPct: number | null;
  unrealizedPnlSol: number | null;
  realizedPnlSol: number | null;
  remainingSizeSol: number | null;
  latestPaperOrder: {
    orderId: string;
    side: PaperOrderIntent["side"];
    source: PaperOrderIntent["source"];
    createdAt: string;
    reasonCodes: string[];
  } | null;
  latestPaperExitSignal: {
    signalId: string;
    sellPct: number;
    blocked: boolean;
    createdAt: string;
    reasonCodes: string[];
  } | null;
};

export type PaperPortfolioServiceOptions = {
  config?: Partial<PaperPortfolioServiceConfig>;
  getCurrentPriceSol?: (mint: string) => number | null | undefined;
  getCurrentVolumeSol?: (mint: string) => number | null | undefined;
  getLaunchCandidate?: (mint: string) => LaunchCandidateView | null | undefined;
  getRiskSnapshot?: (mint: string) => RiskSnapshot | null | undefined;
  getRecentSignals?: () => OverlaySignal[];
  now?: () => Date;
};

export class PaperPortfolioServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly reasonCodes: string[];

  constructor(
    code: string,
    message: string,
    options: { reasonCodes?: string[]; statusCode?: number } = {}
  ) {
    super(message);
    this.name = "PaperPortfolioServiceError";
    this.code = code;
    this.statusCode = options.statusCode ?? 400;
    this.reasonCodes = options.reasonCodes ?? [code];
  }
}

export function createPaperPortfolioServiceConfig(
  input: Partial<PaperPortfolioServiceConfig> = {}
): PaperPortfolioServiceConfig {
  return {
    enabled: input.enabled ?? true,
    startingCashSol: input.startingCashSol ?? 1,
    maxPositionSizeSol: input.maxPositionSizeSol ?? 0.01,
    maxOpenPositions: input.maxOpenPositions ?? 3,
    maxDailySpendSol: input.maxDailySpendSol ?? 0.05,
    feeBps: input.feeBps ?? 100,
    slippageBps: input.slippageBps ?? 300,
    requirePriceForEntry: input.requirePriceForEntry ?? true,
    requirePriceForExit: input.requirePriceForExit ?? true,
    allowPartialExits: input.allowPartialExits ?? true,
    fallbackPriceSol: input.fallbackPriceSol ?? null,
    paperOnly: true,
    resetEnabled: input.resetEnabled ?? false,
    entry: {
      enabled: input.entry?.enabled ?? false,
      minLaunchScore: input.entry?.minLaunchScore ?? 80,
      allowedLabels: input.entry?.allowedLabels ?? ["ripping", "hot"],
      maxRiskLevel: input.entry?.maxRiskLevel ?? "medium",
      blockHardReject: input.entry?.blockHardReject ?? true,
      requireTradeTracked: input.entry?.requireTradeTracked ?? true,
      requirePrice: input.entry?.requirePrice ?? true,
      minValidTradeSamples: input.entry?.minValidTradeSamples ?? 10,
      minBuySellRatio: input.entry?.minBuySellRatio ?? 1.5,
      minUniqueBuyers10s: input.entry?.minUniqueBuyers10s ?? 5,
      maxAgeSeconds: input.entry?.maxAgeSeconds ?? 120,
      positionSizeSol: input.entry?.positionSizeSol ?? 0.005,
      cooldownByMintMs: input.entry?.cooldownByMintMs ?? 300_000
    },
    exit: {
      enabled: input.exit?.enabled ?? false,
      allowWatchedWalletSignals: input.exit?.allowWatchedWalletSignals ?? true,
      defaultSellPct: input.exit?.defaultSellPct ?? 100,
      requirePrice: input.exit?.requirePrice ?? true,
      minProfitPct: input.exit?.minProfitPct ?? 25,
      takeProfitPct: input.exit?.takeProfitPct ?? 50,
      stopLossPct: input.exit?.stopLossPct ?? -25,
      trailingStopPct: input.exit?.trailingStopPct ?? null,
      cooldownMs: input.exit?.cooldownMs ?? 60_000,
      ...(input.exit?.policy ? { policy: input.exit.policy } : {})
    }
  };
}

export function createPaperPortfolioService(
  options: PaperPortfolioServiceOptions = {}
): PaperPortfolioService {
  return new PaperPortfolioService(options);
}

export class PaperPortfolioService {
  private readonly config: PaperPortfolioServiceConfig;
  private readonly engine: PaperPortfolioEngine;
  private readonly getCurrentPriceSol:
    ((mint: string) => number | null | undefined) | undefined;
  private readonly getLaunchCandidate:
    ((mint: string) => LaunchCandidateView | null | undefined) | undefined;
  private readonly getRiskSnapshot:
    ((mint: string) => RiskSnapshot | null | undefined) | undefined;
  private readonly getRecentSignals: (() => OverlaySignal[]) | undefined;
  private readonly getCurrentVolumeSol:
    ((mint: string) => number | null | undefined) | undefined;
  private readonly exitPolicyConfig: PaperExitPolicyConfig;
  private readonly now: () => Date;
  private readonly entryCooldowns = new Map<string, number>();
  private readonly exitCooldowns = new Map<string, number>();
  private readonly latestExitSignals = new Map<string, ExitSignal>();
  private exitPolicySequence = 0;
  private started = false;

  constructor(options: PaperPortfolioServiceOptions = {}) {
    this.config = createPaperPortfolioServiceConfig(options.config);
    this.now = options.now ?? (() => new Date());
    this.engine = createPaperPortfolioEngine({
      ...this.config,
      now: this.now
    });
    this.getCurrentPriceSol = options.getCurrentPriceSol;
    this.getCurrentVolumeSol = options.getCurrentVolumeSol;
    this.getLaunchCandidate = options.getLaunchCandidate;
    this.getRiskSnapshot = options.getRiskSnapshot;
    this.getRecentSignals = options.getRecentSignals;
    this.exitPolicyConfig = createPaperExitPolicyConfig({
      stopLossPct: this.config.exit.stopLossPct,
      takeProfitStage1Pct: Math.min(
        this.config.exit.minProfitPct,
        this.config.exit.takeProfitPct
      ),
      takeProfitStage1SellPct: 50,
      takeProfitStage2Pct: this.config.exit.takeProfitPct,
      takeProfitStage2SellPct: this.config.exit.defaultSellPct,
      trailingStopPct: this.config.exit.trailingStopPct,
      watchedWalletMinimumProfitPct: this.config.exit.minProfitPct,
      ...(this.config.exit.policy ?? {})
    });
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.engine.loadState({
      positions: listPaperPortfolioPositionsForState().map(
        storedPositionToPaperPosition
      ),
      orders: listPaperPortfolioOrdersForState().map(storedOrderToPaperOrder),
      fills: listPaperPortfolioFillsForState().map(storedFillToPaperFill)
    });
  }

  stop(): void {
    this.started = false;
  }

  getStatus(): PaperPortfolioStatus {
    const stats = getStorageStats();
    const snapshot = this.engine.getSnapshot();

    return {
      enabled: this.config.enabled,
      entryPolicyEnabled: this.config.entry.enabled,
      exitPolicyEnabled: this.config.exit.enabled,
      openPositionCount: snapshot.openPositionCount,
      closedPositionCount: snapshot.closedPositionCount,
      orderCount: Math.max(
        stats.paperPortfolioOrderCount,
        this.engine.getOrderHistory().length
      ),
      fillCount: Math.max(
        stats.paperPortfolioFillCount,
        this.engine.getFillHistory().length
      ),
      snapshotCount: stats.paperPortfolioSnapshotCount,
      totalPnlSol: snapshot.totalPnlSol,
      realizedPnlSol: snapshot.realizedPnlSol,
      unrealizedPnlSol: snapshot.unrealizedPnlSol,
      winRate: snapshot.winRate,
      maxDrawdownSol: snapshot.maxDrawdownSol,
      exitPolicyVersion: getPaperExitPolicyRuntimeContract().policyVersion,
      exitPolicyEvaluationCount: stats.paperExitPolicyEvaluationCount,
      paperOnly: true,
      liveExecutionDisabled: true,
      reasonCodes: uniqueStrings([
        this.config.enabled
          ? "PAPER_PORTFOLIO_ENABLED"
          : "PAPER_PORTFOLIO_DISABLED",
        this.config.entry.enabled
          ? "PAPER_ENTRY_POLICY_ENABLED"
          : "PAPER_ENTRY_POLICY_DISABLED",
        this.config.exit.enabled
          ? "PAPER_EXIT_POLICY_ENABLED"
          : "PAPER_EXIT_POLICY_DISABLED",
        paperPortfolioReasonCodes.paperOnlyNoLiveExecution
      ])
    };
  }

  getAutomationCompatibilityConfig(): PaperAutomationPortfolioConfig {
    return {
      enabled: this.config.enabled,
      legacyEntryEnabled: this.config.entry.enabled,
      legacyExitEnabled: this.config.exit.enabled,
      startingCashSol: this.config.startingCashSol,
      maxPositionSizeSol: this.config.maxPositionSizeSol,
      maxOpenPositions: this.config.maxOpenPositions,
      maxDailySpendSol: this.config.maxDailySpendSol,
      feeBps: this.config.feeBps,
      slippageBps: this.config.slippageBps,
      allowPartialExits: this.config.allowPartialExits
    };
  }

  getExitPolicyStatus() {
    const evaluations = listPaperExitPolicyEvaluations(1);

    return {
      enabled: this.config.exit.enabled,
      executionMode: this.config.exit.enabled
        ? ("operator_configured_paper" as const)
        : ("evaluation_only" as const),
      evaluationCount: getStorageStats().paperExitPolicyEvaluationCount,
      latestEvaluation: evaluations[0] ?? null,
      config: this.exitPolicyConfig,
      contract: getPaperExitPolicyRuntimeContract(),
      automaticPaperExitActivation: false as const,
      automaticLiveExecution: false as const,
      paperOnly: true as const,
      liveExecutionDisabled: true as const
    };
  }

  getExitPolicyEvaluation(
    evaluationId: string
  ): StoredPaperExitPolicyEvaluation | null {
    return getPaperExitPolicyEvaluation(evaluationId);
  }

  getExitPolicyEvaluations(limit = 50): StoredPaperExitPolicyEvaluation[] {
    return listPaperExitPolicyEvaluations(limit);
  }

  getSnapshot(): PaperPortfolioSnapshot {
    return this.engine.getSnapshot();
  }

  getPositions(): StoredPaperPortfolioPosition[] {
    return listPaperPortfolioPositions(1000);
  }

  getPosition(mint: string): StoredPaperPortfolioPosition | null {
    return getPaperPortfolioPosition(mint);
  }

  getOrders(limit = 50): StoredPaperPortfolioOrder[] {
    return listPaperPortfolioOrders(limit);
  }

  getFills(limit = 50): StoredPaperPortfolioFill[] {
    return listPaperPortfolioFills(limit);
  }

  getPerformance(): {
    snapshot: PaperPortfolioSnapshot;
    bestTrade: StoredPaperPortfolioPosition | null;
    worstTrade: StoredPaperPortfolioPosition | null;
    snapshots: StoredPaperPortfolioSnapshot[];
    paperOnly: true;
    liveExecutionDisabled: true;
  } {
    const closed = this.getPositions().filter(
      (position) => position.status === "closed"
    );
    const sorted = [...closed].sort(
      (left, right) => right.realizedPnlSol - left.realizedPnlSol
    );

    return {
      snapshot: this.getSnapshot(),
      bestTrade: sorted[0] ?? null,
      worstTrade: sorted.at(-1) ?? null,
      snapshots: listPaperPortfolioSnapshots(50),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  evaluateEntries(
    signals = this.getRecentSignals?.() ?? []
  ): PaperPortfolioEvaluation[] {
    return signals.map((signal) => this.evaluateEntrySignal(signal));
  }

  evaluateEntrySignal(signal: OverlaySignal): PaperPortfolioEvaluation {
    const blockers = this.getEntryPolicyBlockers(signal);
    const nonPriceBlockers = blockers.filter(
      (blocker) => blocker !== paperPortfolioReasonCodes.priceMissing
    );

    if (blockers.includes("PAPER_ENTRY_POLICY_DISABLED")) {
      return this.noopEvaluation(blockers);
    }

    if (nonPriceBlockers.length > 0) {
      return this.noopEvaluation(blockers);
    }

    const intent = createEntryIntentFromLaunchSignal(signal, {
      requestedSizeSol: this.config.entry.positionSizeSol,
      reason: "launch scanner paper entry",
      reasonCodes: uniqueStrings([
        "PAPER_ENTRY_POLICY_MATCHED",
        ...signal.reasonCodes,
        ...blockers
      ]),
      createdAt: this.now().toISOString()
    });
    const fill = this.engine.simulateBuy(intent, this.getPrice(signal.mint));
    const position = this.persistAndApply(intent, fill);

    if (fill.fillStatus !== "rejected") {
      this.entryCooldowns.set(signal.mint, this.now().getTime());
    }

    return {
      intent,
      fill,
      position,
      snapshot: this.persistSnapshot(),
      blocked: fill.fillStatus === "rejected",
      reasonCodes: uniqueStrings([...blockers, ...fill.reasonCodes]),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  executeApprovedAutomationEntry(
    signal: OverlaySignal,
    input: ApprovedPaperAutomationExecution & { selectedThreshold: number }
  ): PaperPortfolioEvaluation {
    const price = this.getPrice(signal.mint);
    const volumeSol = this.getCurrentVolume(signal.mint);
    const impactBps = paperAutomationMarketImpactBps({
      sizeSol: input.positionSizeSol,
      volumeSol,
      maximumVolumeParticipationRatio: input.maximumVolumeParticipationRatio,
      maximumMarketImpactBps: input.maximumMarketImpactBps
    });
    const blockers = uniqueStrings([
      ...(this.config.enabled ? [] : ["PAPER_PORTFOLIO_DISABLED"]),
      ...(signal.score >= input.selectedThreshold
        ? []
        : ["PAPER_AUTOMATION_SCORE_BELOW_APPROVED_THRESHOLD"]),
      ...(signal.hardReject ? ["PAPER_AUTOMATION_HARD_REJECT"] : []),
      ...(price === null ? [paperPortfolioReasonCodes.priceMissing] : []),
      ...(impactBps === null ? ["PAPER_AUTOMATION_LIQUIDITY_CAP"] : [])
    ]);
    if (blockers.length > 0 || price === null || impactBps === null) {
      return this.noopEvaluation(blockers);
    }

    const intent = createEntryIntentFromLaunchSignal(signal, {
      requestedSizeSol: input.positionSizeSol,
      reason: `approved paper automation ${input.deploymentId}`,
      reasonCodes: uniqueStrings([
        "PAPER_AUTOMATION_APPROVED_ENTRY",
        `PAPER_AUTOMATION_DEPLOYMENT_${safeId(input.deploymentId)}`,
        `PAPER_AUTOMATION_OPERATION_${safeId(input.operationId)}`,
        `PAPER_AUTOMATION_MARKET_IMPACT_BPS_${impactBps}`,
        paperPortfolioReasonCodes.paperOnlyNoLiveExecution
      ]),
      createdAt: this.now().toISOString()
    });
    const impactedPrice = price * (1 + impactBps / 10_000);
    const fill = this.engine.simulateBuy(intent, impactedPrice);
    const position = this.persistAndApply(intent, fill);
    return {
      intent,
      fill,
      position,
      snapshot: this.persistSnapshot(),
      blocked: fill.fillStatus === "rejected",
      reasonCodes: uniqueStrings([...blockers, ...fill.reasonCodes]),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  evaluateApprovedAutomationExit(
    mint: string,
    config: PaperExitPolicyConfig
  ): StoredPaperExitPolicyEvaluation | null {
    const current = this.engine.getPosition(mint);
    if (!current || current.status === "closed") return null;
    const marked = this.updateMarkPrice(mint, this.getPrice(mint)) ?? current;
    return this.evaluateExitPolicyForPosition(marked, null, config);
  }

  executeApprovedAutomationExit(
    evaluation: StoredPaperExitPolicyEvaluation,
    input: ApprovedPaperAutomationExecution
  ): PaperPortfolioEvaluation {
    const position = this.engine.getPosition(evaluation.mint);
    const action = evaluation.selectedAction;
    if (!position || !action) {
      return this.noopEvaluation(
        ["PAPER_AUTOMATION_EXIT_NO_LONGER_ACTIONABLE"],
        evaluation
      );
    }
    const price = this.getPrice(evaluation.mint);
    const volumeSol = this.getCurrentVolume(evaluation.mint);
    const exitSizeSol =
      (position.remainingTokenAmount * (price ?? 0) * action.sellPct) / 100;
    const impactBps = paperAutomationMarketImpactBps({
      sizeSol: exitSizeSol,
      volumeSol,
      maximumVolumeParticipationRatio: input.maximumVolumeParticipationRatio,
      maximumMarketImpactBps: input.maximumMarketImpactBps
    });
    if (price === null || impactBps === null) {
      return this.noopEvaluation(
        uniqueStrings([
          ...(price === null ? [paperPortfolioReasonCodes.priceMissing] : []),
          ...(impactBps === null ? ["PAPER_AUTOMATION_LIQUIDITY_CAP"] : [])
        ]),
        evaluation
      );
    }
    return this.createExitForPosition({
      position,
      reason: `approved paper automation ${input.deploymentId}: ${action.reason}`,
      reasonCodes: uniqueStrings([
        ...action.reasonCodes,
        paperExitRuleCompletionReasonCode(action.ruleId),
        "PAPER_AUTOMATION_APPROVED_EXIT",
        `PAPER_AUTOMATION_DEPLOYMENT_${safeId(input.deploymentId)}`,
        `PAPER_AUTOMATION_OPERATION_${safeId(input.operationId)}`,
        `PAPER_AUTOMATION_MARKET_IMPACT_BPS_${impactBps}`
      ]),
      sellPct: action.sellPct,
      source: "paper_exit_policy",
      marketPriceSol: price * (1 - impactBps / 10_000),
      exitPolicyEvaluation: evaluation
    });
  }

  ingestExitSignals(signals: ExitSignal[]): PaperPortfolioEvaluation[] {
    for (const signal of signals) {
      this.latestExitSignals.set(signal.mint, signal);
    }

    if (
      !this.config.exit.enabled ||
      !this.config.exit.allowWatchedWalletSignals
    ) {
      return signals.map(() =>
        this.noopEvaluation([
          this.config.exit.enabled
            ? "PAPER_EXIT_WATCHED_WALLET_SIGNALS_DISABLED"
            : "PAPER_EXIT_POLICY_DISABLED"
        ])
      );
    }

    return signals.map((signal) => {
      if (signal.blocked) {
        return this.noopEvaluation([
          "WATCHED_WALLET_EXIT_SIGNAL_BLOCKED",
          ...signal.blockers
        ]);
      }

      const position = this.engine.getPosition(signal.mint);
      const marked = position
        ? (this.updateMarkPrice(signal.mint, this.getPrice(signal.mint)) ??
          position)
        : null;
      const evaluation = this.evaluateExitPolicyForPosition(marked, signal);

      return evaluation.selectedAction
        ? this.executeExitPolicyEvaluation(evaluation, marked, signal)
        : this.noopEvaluation(evaluation.reasonCodes, evaluation);
    });
  }

  evaluateExits(): PaperPortfolioEvaluation[] {
    const results: PaperPortfolioEvaluation[] = [];

    if (!this.config.exit.enabled) {
      return [this.noopEvaluation(["PAPER_EXIT_POLICY_DISABLED"])];
    }

    for (const position of this.engine.getOpenPositions()) {
      const marked =
        this.updateMarkPrice(position.mint, this.getPrice(position.mint)) ??
        position;
      const evaluation = this.evaluateExitPolicyForPosition(marked, null);

      if (evaluation.selectedAction) {
        results.push(
          this.executeExitPolicyEvaluation(evaluation, marked, null)
        );
      }
    }

    return results;
  }

  manualEntry(input: {
    mint: string;
    sizeSol?: number | null;
    reason?: string | null;
    marketPriceSol?: number | null;
  }): PaperPortfolioEvaluation {
    const intent: PaperOrderIntent = {
      id: `manual-entry-${safeId(input.mint)}-${Date.now()}`,
      type: "entry",
      side: "buy",
      mint: input.mint.trim(),
      symbol: null,
      title: null,
      reason: input.reason?.trim() || "manual_paper_test",
      source: "manual_paper",
      requestedSizeSol: input.sizeSol ?? this.config.entry.positionSizeSol,
      requestedSellPct: null,
      signalScore: null,
      riskLevel: null,
      reasonCodes: [
        "PAPER_MANUAL_ENTRY",
        paperPortfolioReasonCodes.paperOnlyNoLiveExecution
      ],
      createdAt: this.now().toISOString()
    };
    const fill = this.engine.simulateBuy(
      intent,
      input.marketPriceSol ?? this.getPrice(input.mint)
    );
    const position = this.persistAndApply(intent, fill);

    return {
      intent,
      fill,
      position,
      snapshot: this.persistSnapshot(),
      blocked: fill.fillStatus === "rejected",
      reasonCodes: fill.reasonCodes,
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  manualExit(input: {
    mint: string;
    sellPct?: number | null;
    reason?: string | null;
    marketPriceSol?: number | null;
  }): PaperPortfolioEvaluation {
    const position = this.engine.getPosition(input.mint);

    return this.createExitForPosition({
      position,
      reason: input.reason?.trim() || "manual_paper_test",
      reasonCodes: ["PAPER_MANUAL_EXIT"],
      sellPct: input.sellPct ?? this.config.exit.defaultSellPct,
      source: "manual_paper",
      ...(input.marketPriceSol !== undefined
        ? { marketPriceSol: input.marketPriceSol }
        : {})
    });
  }

  updateMarkPrice(
    mint: string,
    priceSol?: number | null
  ): PaperPosition | null {
    const updated = this.engine.updateMarkPrice(mint, priceSol);

    if (updated) {
      this.persistPosition(updated);
      this.persistSnapshot();
    }

    return updated;
  }

  getPositionSummaryForMint(mint: string): PaperPositionSummary {
    const position = this.engine.getPosition(mint) ?? storedOrNull(mint);
    const latestOrder =
      this.getOrders(100).find((order) => order.mint === mint) ?? null;
    const latestExit = this.latestExitSignals.get(mint) ?? null;

    return {
      hasPosition: Boolean(position && position.status !== "closed"),
      status: position?.status ?? null,
      entryPriceSol: position?.entryPriceSol ?? null,
      currentPriceSol: position?.currentPriceSol ?? null,
      peakPriceSol: position?.peakPriceSol ?? null,
      peakUnrealizedPnlPct: position?.peakUnrealizedPnlPct ?? null,
      unrealizedPnlPct: position?.unrealizedPnlPct ?? null,
      unrealizedPnlSol: position?.unrealizedPnlSol ?? null,
      realizedPnlSol: position?.realizedPnlSol ?? null,
      remainingSizeSol: position?.remainingSizeSol ?? null,
      latestPaperOrder: latestOrder
        ? {
            orderId: latestOrder.orderId,
            side: latestOrder.side,
            source: latestOrder.source,
            createdAt: latestOrder.createdAt,
            reasonCodes: latestOrder.reasonCodes
          }
        : null,
      latestPaperExitSignal: latestExit
        ? {
            signalId: latestExit.id,
            sellPct: latestExit.sellPct,
            blocked: latestExit.blocked,
            createdAt: latestExit.createdAt,
            reasonCodes: latestExit.reasonCodes
          }
        : null
    };
  }

  resetPaperPortfolio(): {
    reset: boolean;
    status: PaperPortfolioStatus;
    paperOnly: true;
    liveExecutionDisabled: true;
  } {
    if (!this.config.resetEnabled) {
      throw new PaperPortfolioServiceError(
        "PAPER_PORTFOLIO_RESET_DISABLED",
        "Paper portfolio reset is disabled by configuration.",
        { statusCode: 409 }
      );
    }

    this.engine.reset();

    return {
      reset: true,
      status: this.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  private evaluateExitPolicyForPosition(
    position: PaperPosition | null,
    signal: ExitSignal | null,
    config: PaperExitPolicyConfig = this.exitPolicyConfig
  ): StoredPaperExitPolicyEvaluation {
    const evaluatedAt = this.now().toISOString();
    const mint = position?.mint ?? signal?.mint ?? "";
    const candidate = this.getLaunchCandidate?.(mint) ?? null;
    const snapshot = candidate?.snapshot ?? null;
    const risk = this.getRiskSnapshot?.(mint) ?? null;
    const currentPriceSol =
      positiveOrNull(position?.currentPriceSol) ?? this.getPrice(mint) ?? 0;
    const entryPriceSol = positiveOrNull(position?.averageEntryPriceSol) ?? 0;
    const peakPriceSol =
      positiveOrNull(position?.peakPriceSol) ??
      Math.max(currentPriceSol, entryPriceSol);
    const market: PaperExitMarketContext = {
      launchScore: snapshot?.score ?? null,
      launchPhase: snapshot?.phase ?? null,
      priceVelocityPctPerSec:
        snapshot?.derivatives.priceVelocityPctPerSec ?? null,
      priceAccelerationPctPerSec2:
        snapshot?.derivatives.priceAccelerationPctPerSec2 ?? null,
      volume5sSol: snapshot?.windows["5s"].volumeSol ?? null,
      volume30sSol: snapshot?.windows["30s"].volumeSol ?? null,
      volumeAccelerationSolPerSec2:
        snapshot?.derivatives.volumeAccelerationSolPerSec2 ?? null,
      buyerAccelerationPerSec2:
        snapshot?.derivatives.buyerAccelerationPerSec2 ?? null,
      netBuyPressure: snapshot?.windows["10s"].netBuyPressure ?? null,
      liquidityVelocitySolPerSec:
        snapshot?.derivatives.liquiditySolVelocityPerSec ?? null,
      estimatedSellSlippagePct: risk?.flags.estimatedSellSlippagePct ?? null,
      riskLevel: risk?.riskLevel ?? "unknown",
      hardReject: risk?.hardReject ?? false,
      migrationDetected:
        candidate?.eventType.toLowerCase().includes("migration") === true ||
        candidate?.reasonCodes.some((code) =>
          code.toUpperCase().includes("MIGRATION")
        ) === true,
      watchedWalletSignal: signal
        ? {
            signalId: signal.id,
            side: signal.triggerEvent.side,
            usable: signal.triggerEvent.usableForExitStrategy,
            blocked: signal.blocked,
            sellPct: signal.sellPct
          }
        : null,
      reasonCodes: uniqueStrings([
        ...(snapshot?.reasonCodes ?? []),
        ...(risk?.reasonCodes ?? []),
        ...(signal?.reasonCodes ?? [])
      ])
    };
    this.exitPolicySequence += 1;
    const evaluation = evaluatePaperExitPolicy({
      evaluationId: [
        "paper-exit",
        safeId(mint),
        evaluatedAt.replace(/[^0-9]/gu, ""),
        String(this.exitPolicySequence).padStart(6, "0")
      ].join("-"),
      evaluatedAt,
      position: {
        mint,
        status:
          position?.status === "partially_closed" ? "partially_closed" : "open",
        openedAt: position?.openedAt ?? evaluatedAt,
        entryPriceSol,
        currentPriceSol,
        peakPriceSol,
        unrealizedPnlPct: position?.unrealizedPnlPct ?? 0,
        peakUnrealizedPnlPct:
          position?.peakUnrealizedPnlPct ?? position?.unrealizedPnlPct ?? 0,
        remainingSizeSol: position?.remainingSizeSol ?? 0,
        remainingTokenAmount: position?.remainingTokenAmount ?? 0,
        completedRuleIds: completedExitPolicyRuleIds(
          position?.exitReasonCodes ?? []
        )
      },
      market,
      config
    });

    return savePaperExitPolicyEvaluation(evaluation);
  }

  private executeExitPolicyEvaluation(
    evaluation: StoredPaperExitPolicyEvaluation,
    position: PaperPosition | null,
    signal: ExitSignal | null
  ): PaperPortfolioEvaluation {
    const action = evaluation.selectedAction;

    if (!action) {
      return this.noopEvaluation(evaluation.reasonCodes, evaluation);
    }

    const watchedWalletTrigger = action.trigger.startsWith("watched_wallet_");

    return this.createExitForPosition({
      position,
      reason: action.reason,
      reasonCodes: uniqueStrings([
        ...action.reasonCodes,
        paperExitRuleCompletionReasonCode(action.ruleId),
        paperPortfolioReasonCodes.exitPolicyTriggered
      ]),
      sellPct: action.sellPct,
      source: watchedWalletTrigger
        ? "watched_wallet_exit"
        : "paper_exit_policy",
      ...(signal ? { signal } : {}),
      marketPriceSol:
        signal?.triggerEvent.priceSol ?? position?.currentPriceSol ?? null,
      exitPolicyEvaluation: evaluation
    });
  }

  private createExitForPosition(input: {
    position: PaperPosition | null;
    reason: string;
    reasonCodes: string[];
    sellPct: number;
    source: PaperOrderSource;
    signal?: ExitSignal;
    marketPriceSol?: number | null;
    exitPolicyEvaluation?: StoredPaperExitPolicyEvaluation | null;
  }): PaperPortfolioEvaluation {
    const mint = input.position?.mint ?? input.signal?.mint ?? "";
    const cooldownKey = `${input.source}:${mint}`;
    const nowMs = this.now().getTime();
    const lastExitAt = this.exitCooldowns.get(cooldownKey) ?? 0;

    if (lastExitAt > 0 && nowMs - lastExitAt < this.config.exit.cooldownMs) {
      return this.noopEvaluation(
        ["PAPER_EXIT_COOLDOWN_ACTIVE"],
        input.exitPolicyEvaluation
      );
    }

    const intent =
      input.signal !== undefined
        ? createExitIntentFromExitSignal(input.signal, {
            requestedSellPct: input.sellPct,
            source: input.source,
            reason: input.reason,
            reasonCodes: input.reasonCodes,
            createdAt: this.now().toISOString()
          })
        : ({
            id: `${input.source}-${safeId(mint)}-${nowMs}`,
            type: "exit",
            side: "sell",
            mint,
            symbol: input.position?.symbol ?? null,
            title: input.position?.title ?? null,
            reason: input.reason,
            source: input.source,
            requestedSizeSol: null,
            requestedSellPct: input.sellPct,
            signalScore: null,
            riskLevel: null,
            reasonCodes: uniqueStrings([
              ...input.reasonCodes,
              paperPortfolioReasonCodes.exitIntentCreated,
              paperPortfolioReasonCodes.paperOnlyNoLiveExecution
            ]),
            createdAt: this.now().toISOString()
          } satisfies PaperOrderIntent);
    const fill = this.engine.simulateSell(
      intent,
      input.position,
      input.marketPriceSol ?? this.getPrice(mint)
    );
    const position = this.persistAndApply(intent, fill);

    if (fill.fillStatus !== "rejected") {
      this.exitCooldowns.set(cooldownKey, nowMs);
    }

    return {
      intent,
      fill,
      position,
      snapshot: this.persistSnapshot(),
      blocked: fill.fillStatus === "rejected",
      reasonCodes: fill.reasonCodes,
      paperOnly: true,
      liveExecutionDisabled: true,
      ...(input.exitPolicyEvaluation
        ? { exitPolicyEvaluation: input.exitPolicyEvaluation }
        : {})
    };
  }

  private persistAndApply(
    intent: PaperOrderIntent,
    fill: PaperFill
  ): PaperPosition | null {
    savePaperPortfolioOrder({
      orderId: intent.id,
      type: intent.type,
      side: intent.side,
      mint: intent.mint,
      symbol: intent.symbol ?? null,
      title: intent.title ?? null,
      source: intent.source,
      requestedSizeSol: intent.requestedSizeSol ?? null,
      requestedSellPct: intent.requestedSellPct ?? null,
      signalScore: intent.signalScore ?? null,
      riskLevel: intent.riskLevel ?? null,
      reasonCodes: intent.reasonCodes,
      payload: intent,
      createdAt: intent.createdAt
    });
    savePaperPortfolioFill({
      fillId: fill.id,
      orderId: fill.orderIntentId,
      side: fill.side,
      mint: fill.mint,
      priceSol: fill.priceSol,
      effectivePriceSol: fill.effectivePriceSol,
      sizeSol: fill.sizeSol,
      tokenAmount: fill.tokenAmount,
      feeSol: fill.feeSol,
      slippageSol: fill.slippageSol,
      fillStatus: fill.fillStatus,
      rejectionReason: fill.rejectionReason ?? null,
      reasonCodes: fill.reasonCodes,
      payload: fill,
      createdAt: fill.createdAt
    });

    const position = this.engine.applyFill(fill, intent);

    if (position) {
      this.persistPosition(position);
    }

    return position;
  }

  private persistPosition(position: PaperPosition): void {
    upsertPaperPortfolioPosition({
      positionId: position.id,
      mint: position.mint,
      symbol: position.symbol ?? null,
      title: position.title ?? null,
      status: position.status,
      entryPriceSol: position.entryPriceSol,
      averageEntryPriceSol: position.averageEntryPriceSol,
      currentPriceSol: position.currentPriceSol ?? null,
      sizeSol: position.sizeSol,
      remainingSizeSol: position.remainingSizeSol,
      tokenAmount: position.tokenAmount,
      remainingTokenAmount: position.remainingTokenAmount,
      realizedPnlSol: position.realizedPnlSol,
      unrealizedPnlSol: position.unrealizedPnlSol,
      realizedPnlPct: position.realizedPnlPct,
      unrealizedPnlPct: position.unrealizedPnlPct,
      totalFeesSol: position.totalFeesSol,
      payload: position,
      openedAt: position.openedAt,
      updatedAt: position.updatedAt,
      closedAt: position.closedAt ?? null
    });
  }

  private persistSnapshot(): PaperPortfolioSnapshot {
    const snapshot = this.engine.getSnapshot();
    savePaperPortfolioSnapshot({
      cashSol: snapshot.cashSol,
      deployedSol: snapshot.deployedSol,
      equitySol: snapshot.equitySol,
      realizedPnlSol: snapshot.realizedPnlSol,
      unrealizedPnlSol: snapshot.unrealizedPnlSol,
      totalPnlSol: snapshot.totalPnlSol,
      totalPnlPct: snapshot.totalPnlPct,
      openPositionCount: snapshot.openPositionCount,
      closedPositionCount: snapshot.closedPositionCount,
      winRate: snapshot.winRate,
      maxDrawdownSol: snapshot.maxDrawdownSol,
      maxDrawdownPct: snapshot.maxDrawdownPct,
      totalFeesSol: snapshot.totalFeesSol,
      totalTrades: snapshot.totalTrades,
      payload: snapshot,
      createdAt: snapshot.updatedAt
    });
    return snapshot;
  }

  private getEntryPolicyBlockers(signal: OverlaySignal): string[] {
    const launch = this.getLaunchCandidate?.(signal.mint);
    const snapshot = launch?.snapshot;
    const window10s = snapshot?.windows["10s"];
    const nowMs = this.now().getTime();
    const lastEntryAt = this.entryCooldowns.get(signal.mint) ?? 0;
    const riskLevel = signal.riskLevel ?? "unknown";
    const price = this.getPrice(signal.mint);

    return uniqueStrings([
      ...(this.config.enabled ? [] : ["PAPER_PORTFOLIO_DISABLED"]),
      ...(this.config.entry.enabled ? [] : ["PAPER_ENTRY_POLICY_DISABLED"]),
      ...(signal.score >= this.config.entry.minLaunchScore
        ? []
        : ["PAPER_ENTRY_SCORE_TOO_LOW"]),
      ...(snapshot &&
      (this.config.entry.allowedLabels.includes(snapshot.phase) ||
        this.config.entry.allowedLabels.includes(snapshot.label))
        ? []
        : ["PAPER_ENTRY_LABEL_BLOCKED"]),
      ...(this.config.entry.blockHardReject && signal.hardReject
        ? ["PAPER_ENTRY_HARD_REJECT"]
        : []),
      ...(compareRisk(riskLevel, this.config.entry.maxRiskLevel) <= 0
        ? []
        : ["PAPER_ENTRY_RISK_TOO_HIGH"]),
      ...(this.config.entry.requireTradeTracked &&
      (snapshot?.tradeSampleCount ?? 0) <= 0
        ? ["PAPER_ENTRY_TRADE_TRACKING_REQUIRED"]
        : []),
      ...((snapshot?.tradeSampleCount ?? 0) >=
      this.config.entry.minValidTradeSamples
        ? []
        : ["PAPER_ENTRY_INSUFFICIENT_SAMPLES"]),
      ...((window10s?.buySellRatio ?? 0) >= this.config.entry.minBuySellRatio
        ? []
        : ["PAPER_ENTRY_BUY_SELL_RATIO_TOO_LOW"]),
      ...((window10s?.uniqueBuyers ?? 0) >= this.config.entry.minUniqueBuyers10s
        ? []
        : ["PAPER_ENTRY_UNIQUE_BUYERS_TOO_LOW"]),
      ...((snapshot?.ageSeconds ?? Number.POSITIVE_INFINITY) <=
      this.config.entry.maxAgeSeconds
        ? []
        : ["PAPER_ENTRY_TOO_OLD"]),
      ...(lastEntryAt > 0 &&
      nowMs - lastEntryAt < this.config.entry.cooldownByMintMs
        ? ["PAPER_ENTRY_COOLDOWN_ACTIVE"]
        : []),
      ...(this.config.entry.requirePrice && price === null
        ? [paperPortfolioReasonCodes.priceMissing]
        : [])
    ]);
  }

  private getPrice(mint: string): number | null {
    const price = this.getCurrentPriceSol?.(mint);
    return typeof price === "number" && Number.isFinite(price) && price > 0
      ? price
      : null;
  }

  private getCurrentVolume(mint: string): number {
    const volume = this.getCurrentVolumeSol?.(mint);
    return typeof volume === "number" && Number.isFinite(volume) && volume > 0
      ? volume
      : 0;
  }

  private noopEvaluation(
    reasonCodes: string[],
    exitPolicyEvaluation?: StoredPaperExitPolicyEvaluation | null
  ): PaperPortfolioEvaluation {
    return {
      intent: null,
      fill: null,
      position: null,
      snapshot: this.engine.getSnapshot(),
      blocked: true,
      reasonCodes,
      paperOnly: true,
      liveExecutionDisabled: true,
      ...(exitPolicyEvaluation ? { exitPolicyEvaluation } : {})
    };
  }
}

function storedPositionToPaperPosition(
  stored: StoredPaperPortfolioPosition
): PaperPosition {
  const payload =
    stored.payload && typeof stored.payload === "object"
      ? (stored.payload as Partial<PaperPosition>)
      : {};

  return {
    id: stored.positionId,
    mint: stored.mint,
    symbol: stored.symbol,
    title: stored.title,
    status: stored.status,
    entryPriceSol: stored.entryPriceSol,
    averageEntryPriceSol: stored.averageEntryPriceSol,
    currentPriceSol: stored.currentPriceSol,
    peakPriceSol: payload.peakPriceSol ?? stored.currentPriceSol,
    peakUnrealizedPnlPct:
      payload.peakUnrealizedPnlPct ?? stored.unrealizedPnlPct,
    sizeSol: stored.sizeSol,
    remainingSizeSol: stored.remainingSizeSol,
    tokenAmount: stored.tokenAmount,
    remainingTokenAmount: stored.remainingTokenAmount,
    realizedPnlSol: stored.realizedPnlSol,
    unrealizedPnlSol: stored.unrealizedPnlSol,
    realizedPnlPct: stored.realizedPnlPct,
    unrealizedPnlPct: stored.unrealizedPnlPct,
    totalFeesSol: stored.totalFeesSol,
    openedAt: stored.openedAt,
    updatedAt: stored.updatedAt,
    closedAt: stored.closedAt,
    entryReasonCodes: payload.entryReasonCodes ?? [],
    exitReasonCodes: payload.exitReasonCodes ?? []
  };
}

function storedOrderToPaperOrder(
  stored: StoredPaperPortfolioOrder
): PaperOrderIntent {
  const payload =
    stored.payload && typeof stored.payload === "object"
      ? (stored.payload as Partial<PaperOrderIntent>)
      : {};
  return {
    id: stored.orderId,
    type: stored.type,
    side: stored.side,
    mint: stored.mint,
    symbol: stored.symbol,
    title: stored.title,
    reason: payload.reason ?? "persisted paper order",
    source: stored.source,
    requestedSizeSol: stored.requestedSizeSol,
    requestedSellPct: stored.requestedSellPct,
    signalScore: stored.signalScore,
    riskLevel: stored.riskLevel,
    reasonCodes: stored.reasonCodes,
    createdAt: stored.createdAt
  };
}

function storedFillToPaperFill(stored: StoredPaperPortfolioFill): PaperFill {
  return {
    id: stored.fillId,
    orderIntentId: stored.orderId,
    side: stored.side,
    mint: stored.mint,
    priceSol: stored.priceSol,
    sizeSol: stored.sizeSol,
    tokenAmount: stored.tokenAmount,
    feeSol: stored.feeSol,
    slippageSol: stored.slippageSol,
    effectivePriceSol: stored.effectivePriceSol,
    fillStatus: stored.fillStatus,
    rejectionReason: stored.rejectionReason,
    reasonCodes: stored.reasonCodes,
    paperOnly: true,
    createdAt: stored.createdAt
  };
}

function storedOrNull(mint: string): PaperPosition | null {
  const stored = getPaperPortfolioPosition(mint);
  return stored ? storedPositionToPaperPosition(stored) : null;
}

function compareRisk(left: RiskLevel, right: RiskLevel): number {
  return riskRank(left) - riskRank(right);
}

function riskRank(value: RiskLevel): number {
  switch (value) {
    case "unknown":
      return 0;
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    case "critical":
      return 4;
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0)
    )
  );
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function completedExitPolicyRuleIds(reasonCodes: readonly string[]): string[] {
  const prefix = "PAPER_EXIT_RULE_COMPLETED_";

  return uniqueStrings(
    reasonCodes
      .filter((reasonCode) => reasonCode.startsWith(prefix))
      .map((reasonCode) =>
        reasonCode.slice(prefix.length).toLowerCase().replaceAll("_", "-")
      )
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "unknown";
}

export function toPaperRiskLevel(value: RiskLevel | undefined): PaperRiskLevel {
  return value ?? "unknown";
}
