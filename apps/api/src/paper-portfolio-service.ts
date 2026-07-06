import type { ExitSignal } from "@axi/exit-strategy";
import type { LaunchCandidateView } from "./launch-scanner-service";
import type { OverlaySignal, RiskLevel } from "@axi/shared";
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
  getPaperPortfolioPosition,
  getStorageStats,
  listPaperPortfolioFills,
  listPaperPortfolioOrders,
  listPaperPortfolioPositions,
  listPaperPortfolioSnapshots,
  savePaperPortfolioFill,
  savePaperPortfolioOrder,
  savePaperPortfolioSnapshot,
  upsertPaperPortfolioPosition,
  type StoredPaperPortfolioFill,
  type StoredPaperPortfolioOrder,
  type StoredPaperPortfolioPosition,
  type StoredPaperPortfolioSnapshot
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

export type PaperExitPolicyConfig = {
  enabled: boolean;
  allowWatchedWalletSignals: boolean;
  defaultSellPct: number;
  requirePrice: boolean;
  minProfitPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number | null;
  cooldownMs: number;
};

export type PaperPortfolioServiceConfig = PaperPortfolioConfig & {
  enabled: boolean;
  resetEnabled: boolean;
  entry: PaperEntryPolicyConfig;
  exit: PaperExitPolicyConfig;
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
};

export type PaperPositionSummary = {
  hasPosition: boolean;
  status: PaperPosition["status"] | null;
  entryPriceSol: number | null;
  currentPriceSol: number | null;
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
  getLaunchCandidate?: (mint: string) => LaunchCandidateView | null | undefined;
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
      allowWatchedWalletSignals:
        input.exit?.allowWatchedWalletSignals ?? true,
      defaultSellPct: input.exit?.defaultSellPct ?? 100,
      requirePrice: input.exit?.requirePrice ?? true,
      minProfitPct: input.exit?.minProfitPct ?? 25,
      takeProfitPct: input.exit?.takeProfitPct ?? 50,
      stopLossPct: input.exit?.stopLossPct ?? -25,
      trailingStopPct: input.exit?.trailingStopPct ?? null,
      cooldownMs: input.exit?.cooldownMs ?? 60_000
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
    | ((mint: string) => number | null | undefined)
    | undefined;
  private readonly getLaunchCandidate:
    | ((mint: string) => LaunchCandidateView | null | undefined)
    | undefined;
  private readonly getRecentSignals: (() => OverlaySignal[]) | undefined;
  private readonly now: () => Date;
  private readonly entryCooldowns = new Map<string, number>();
  private readonly exitCooldowns = new Map<string, number>();
  private readonly latestExitSignals = new Map<string, ExitSignal>();
  private started = false;

  constructor(options: PaperPortfolioServiceOptions = {}) {
    this.config = createPaperPortfolioServiceConfig(options.config);
    this.now = options.now ?? (() => new Date());
    this.engine = createPaperPortfolioEngine({
      ...this.config,
      now: this.now
    });
    this.getCurrentPriceSol = options.getCurrentPriceSol;
    this.getLaunchCandidate = options.getLaunchCandidate;
    this.getRecentSignals = options.getRecentSignals;
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.engine.loadPositions(
      listPaperPortfolioPositions(1000).map(storedPositionToPaperPosition)
    );
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
      orderCount: Math.max(stats.paperPortfolioOrderCount, this.engine.getOrderHistory().length),
      fillCount: Math.max(stats.paperPortfolioFillCount, this.engine.getFillHistory().length),
      snapshotCount: stats.paperPortfolioSnapshotCount,
      totalPnlSol: snapshot.totalPnlSol,
      realizedPnlSol: snapshot.realizedPnlSol,
      unrealizedPnlSol: snapshot.unrealizedPnlSol,
      winRate: snapshot.winRate,
      maxDrawdownSol: snapshot.maxDrawdownSol,
      paperOnly: true,
      liveExecutionDisabled: true,
      reasonCodes: uniqueStrings([
        this.config.enabled ? "PAPER_PORTFOLIO_ENABLED" : "PAPER_PORTFOLIO_DISABLED",
        this.config.entry.enabled ? "PAPER_ENTRY_POLICY_ENABLED" : "PAPER_ENTRY_POLICY_DISABLED",
        this.config.exit.enabled ? "PAPER_EXIT_POLICY_ENABLED" : "PAPER_EXIT_POLICY_DISABLED",
        paperPortfolioReasonCodes.paperOnlyNoLiveExecution
      ])
    };
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

  evaluateEntries(signals = this.getRecentSignals?.() ?? []): PaperPortfolioEvaluation[] {
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

  ingestExitSignals(signals: ExitSignal[]): PaperPortfolioEvaluation[] {
    for (const signal of signals) {
      this.latestExitSignals.set(signal.mint, signal);
    }

    if (!this.config.exit.enabled || !this.config.exit.allowWatchedWalletSignals) {
      return signals.map(() =>
        this.noopEvaluation([
          this.config.exit.enabled
            ? "PAPER_EXIT_WATCHED_WALLET_SIGNALS_DISABLED"
            : "PAPER_EXIT_POLICY_DISABLED"
        ])
      );
    }

    return signals.map((signal) => this.evaluateExitSignal(signal));
  }

  evaluateExits(): PaperPortfolioEvaluation[] {
    const results: PaperPortfolioEvaluation[] = [];

    if (!this.config.exit.enabled) {
      return [this.noopEvaluation(["PAPER_EXIT_POLICY_DISABLED"])];
    }

    for (const position of this.engine.getOpenPositions()) {
      const marked = this.updateMarkPrice(position.mint, this.getPrice(position.mint)) ?? position;
      const pnlPct = marked.unrealizedPnlPct;
      const source: PaperOrderSource | null =
        pnlPct >= this.config.exit.takeProfitPct
          ? "take_profit"
          : pnlPct <= this.config.exit.stopLossPct
            ? "stop_loss"
            : null;

      if (!source) {
        continue;
      }

      const reasonCode =
        source === "take_profit"
          ? paperPortfolioReasonCodes.takeProfitTriggered
          : paperPortfolioReasonCodes.stopLossTriggered;
      results.push(
        this.createExitForPosition({
          position: marked,
          reason: source === "take_profit" ? "take profit" : "stop loss",
          reasonCodes: [reasonCode],
          sellPct: this.config.exit.defaultSellPct,
          source
        })
      );
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

  updateMarkPrice(mint: string, priceSol?: number | null): PaperPosition | null {
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

  private evaluateExitSignal(signal: ExitSignal): PaperPortfolioEvaluation {
    if (signal.blocked) {
      return this.noopEvaluation([
        "WATCHED_WALLET_EXIT_SIGNAL_BLOCKED",
        ...signal.blockers
      ]);
    }

    const position = this.engine.getPosition(signal.mint);
    const minProfitBlocker =
      position && position.unrealizedPnlPct < this.config.exit.minProfitPct
        ? "PAPER_EXIT_MIN_PROFIT_NOT_MET"
        : null;

    if (minProfitBlocker) {
      const intent = createExitIntentFromExitSignal(signal, {
        reasonCodes: [minProfitBlocker, ...signal.reasonCodes],
        createdAt: this.now().toISOString()
      });
      const fill = {
        ...this.engine.simulateSell(intent, position, this.getPrice(signal.mint)),
        rejectionReason: minProfitBlocker,
        fillStatus: "rejected" as const,
        reasonCodes: uniqueStrings([
          paperPortfolioReasonCodes.fillRejected,
          minProfitBlocker,
          paperPortfolioReasonCodes.paperOnlyNoLiveExecution,
          ...intent.reasonCodes
        ])
      };
      this.persistAndApply(intent, fill);

      return {
        intent,
        fill,
        position: null,
        snapshot: this.persistSnapshot(),
        blocked: true,
        reasonCodes: fill.reasonCodes,
        paperOnly: true,
        liveExecutionDisabled: true
      };
    }

    return this.createExitForPosition({
      position,
      reason: signal.sellReason,
      reasonCodes: signal.reasonCodes,
      sellPct: signal.sellPct,
      source: "watched_wallet_exit",
      signal,
      marketPriceSol:
        signal.triggerEvent.priceSol ?? position?.currentPriceSol ?? null
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
  }): PaperPortfolioEvaluation {
    const mint = input.position?.mint ?? input.signal?.mint ?? "";
    const cooldownKey = `${input.source}:${mint}`;
    const nowMs = this.now().getTime();
    const lastExitAt = this.exitCooldowns.get(cooldownKey) ?? 0;

    if (lastExitAt > 0 && nowMs - lastExitAt < this.config.exit.cooldownMs) {
      return this.noopEvaluation(["PAPER_EXIT_COOLDOWN_ACTIVE"]);
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
            id: `${input.source}-${safeId(mint)}-${Date.now()}`,
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
      liveExecutionDisabled: true
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
      ...((snapshot?.tradeSampleCount ?? 0) >= this.config.entry.minValidTradeSamples
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

  private noopEvaluation(reasonCodes: string[]): PaperPortfolioEvaluation {
    return {
      intent: null,
      fill: null,
      position: null,
      snapshot: this.engine.getSnapshot(),
      blocked: true,
      reasonCodes,
      paperOnly: true,
      liveExecutionDisabled: true
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
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "unknown";
}

export function toPaperRiskLevel(value: RiskLevel | undefined): PaperRiskLevel {
  return value ?? "unknown";
}
