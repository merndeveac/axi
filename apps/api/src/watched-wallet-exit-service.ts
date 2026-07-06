import {
  isValidSolanaMint,
  type PumpPortalFeedProvider,
  type AccountTradeEvent
} from "@axi/data-feeds";
import {
  createDefaultExitRule,
  createExitStrategyEngine,
  type ExitRule,
  type ExitRuleTrigger,
  type ExitSignal,
  type PaperPositionSnapshot,
  type WatchedWallet,
  type WatchedWalletTradeEvent
} from "@axi/exit-strategy";
import {
  deleteExitRule,
  deleteWatchedWallet,
  getStorageStats,
  listExitRules,
  listExitSignals,
  listExitSignalsByMint,
  listPaperPositions,
  listWatchedWallets,
  listWatchedWalletTradeEvents,
  listWatchedWalletTradeEventsByMint,
  listWatchedWalletTradeEventsByWallet,
  saveExitRule,
  saveExitSignal,
  saveWatchedWallet,
  saveWatchedWalletTradeEvent,
  type StoredExitRule,
  type StoredExitSignal,
  type StoredPaperPosition,
  type StoredWatchedWallet,
  type StoredWatchedWalletTradeEvent
} from "@axi/storage";

export type WatchedWalletExitConfig = {
  enabled: boolean;
  accountTradesEnabled: boolean;
  accountTradesAcknowledgedMetered: boolean;
  apiKeyConfigured: boolean;
  maxWatchedWallets: number;
  maxEventsPerSession: number;
  maxSessionCostSol: number;
  defaultMinProfitPct: number;
  defaultSellPct: number;
  requireDataWalletReady: boolean;
  cooldownMs: number;
  eventCostSolPer10000: number;
};

export type WatchedWalletExitServiceOptions = {
  config?: Partial<WatchedWalletExitConfig>;
  dataWalletReadiness?: () => WatchedWalletExitDataWalletReadiness;
  getCurrentPriceSol?: (mint: string) => number | null | undefined;
  getOpenPaperPositions?: () => StoredPaperPosition[];
  providerName?: string;
  pumpPortalProvider?: PumpPortalFeedProvider;
};

export type WatchedWalletExitDataWalletReadiness = {
  configured: boolean;
  reasonCodes: string[];
  subscriptionBlockers: string[];
};

export type WatchedWalletExitStatus = {
  enabled: boolean;
  accountTradesEnabled: boolean;
  meteredAck: boolean;
  watchedWalletCount: number;
  enabledRuleCount: number;
  observedTradeCount: number;
  exitSignalCount: number;
  maxWatchedWallets: number;
  maxEventsPerSession: number;
  estimatedCostSol: number;
  budgetReached: boolean;
  dataWalletReady: boolean;
  accountTradeMonitoringEnabled: boolean;
  accountTradeSubscribedWalletCount: number;
  accountTradeEventCount: number;
  reasonCodes: string[];
  paperOnly: true;
  liveExecutionDisabled: true;
};

export type WatchedWalletExitEvaluation = {
  signals: ExitSignal[];
  persistedSignals: StoredExitSignal[];
  openPositionCount: number;
  recentEventCount: number;
  paperOnly: true;
  liveExecutionDisabled: true;
};

export type ExitSignalSummary = {
  hasExitSignal: boolean;
  exitSignalCount: number;
  latestExitSignal: {
    signalId: string;
    action: "paper_sell";
    sellPct: number;
    blocked: boolean;
    wallet: string;
    walletAlias: string | null;
    ruleId: string;
    createdAt: string;
    reasonCodes: string[];
  } | null;
  watchedWalletTriggers: string[];
  exitBlockers: string[];
};

type InputPatch<T> = {
  [Key in keyof T]?: T[Key] | undefined;
};

type WatchedWalletInputPatch = InputPatch<WatchedWallet> & {
  address: string;
};

type ExitRuleInputPatch = InputPatch<ExitRule> & {
  id?: string | undefined;
};

type WatchedWalletTradeInput = InputPatch<WatchedWalletTradeEvent> & {
  wallet: string;
  mint: string;
  side: WatchedWalletTradeEvent["side"];
  timestamp: string;
  source: WatchedWalletTradeEvent["source"];
  confidence: WatchedWalletTradeEvent["confidence"];
  usableForExitStrategy: boolean;
  reasonCodes: string[];
};

type PaperPositionSnapshotInput = InputPatch<PaperPositionSnapshot> & {
  mint: string;
  sizeSol: number;
  openedAt: string;
  status: PaperPositionSnapshot["status"];
};

export class WatchedWalletExitServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly reasonCodes: string[];

  constructor(
    code: string,
    message: string,
    options: { reasonCodes?: string[]; statusCode?: number } = {}
  ) {
    super(message);
    this.name = "WatchedWalletExitServiceError";
    this.code = code;
    this.statusCode = options.statusCode ?? 400;
    this.reasonCodes = options.reasonCodes ?? [code];
  }
}

export function createWatchedWalletExitConfig(
  input: Partial<WatchedWalletExitConfig> = {}
): WatchedWalletExitConfig {
  return {
    enabled: input.enabled ?? false,
    accountTradesEnabled: input.accountTradesEnabled ?? false,
    accountTradesAcknowledgedMetered:
      input.accountTradesAcknowledgedMetered ?? false,
    apiKeyConfigured: input.apiKeyConfigured ?? false,
    maxWatchedWallets: input.maxWatchedWallets ?? 25,
    maxEventsPerSession: input.maxEventsPerSession ?? 1000,
    maxSessionCostSol: input.maxSessionCostSol ?? 0.001,
    defaultMinProfitPct: input.defaultMinProfitPct ?? 25,
    defaultSellPct: input.defaultSellPct ?? 100,
    requireDataWalletReady: input.requireDataWalletReady ?? true,
    cooldownMs: input.cooldownMs ?? 60_000,
    eventCostSolPer10000: input.eventCostSolPer10000 ?? 0.01
  };
}

export function createWatchedWalletExitService(
  options: WatchedWalletExitServiceOptions = {}
): WatchedWalletExitService {
  return new WatchedWalletExitService(options);
}

export class WatchedWalletExitService {
  private readonly config: WatchedWalletExitConfig;
  private readonly dataWalletReadiness:
    | (() => WatchedWalletExitDataWalletReadiness)
    | undefined;
  private readonly engine = createExitStrategyEngine({
    defaultRules: [
      createDefaultExitRule({
        cooldownMs: 60_000,
        enabled: false,
        minProfitPct: 25,
        sellPct: 100
      })
    ]
  });
  private readonly getCurrentPriceSol:
    | ((mint: string) => number | null | undefined)
    | undefined;
  private readonly getOpenPaperPositions: () => StoredPaperPosition[];
  private readonly providerName: string;
  private readonly pumpPortalProvider: PumpPortalFeedProvider | undefined;
  private started = false;
  private observedEventsThisSession = 0;

  constructor(options: WatchedWalletExitServiceOptions = {}) {
    this.config = createWatchedWalletExitConfig(options.config);
    this.dataWalletReadiness = options.dataWalletReadiness;
    this.getCurrentPriceSol = options.getCurrentPriceSol;
    this.getOpenPaperPositions =
      options.getOpenPaperPositions ?? (() => listPaperPositions());
    this.providerName = options.providerName ?? "none";
    this.pumpPortalProvider = options.pumpPortalProvider;

    this.engine.updateExitRule(
      createDefaultExitRule({
        cooldownMs: this.config.cooldownMs,
        enabled: false,
        minProfitPct: this.config.defaultMinProfitPct,
        sellPct: this.config.defaultSellPct
      })
    );
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.loadPersistedState();
    this.syncAccountTradeSubscriptions();
  }

  stop(): void {
    this.started = false;

    if (this.pumpPortalProvider) {
      this.pumpPortalProvider.unsubscribeAccountTrades(
        this.pumpPortalProvider.getAccountTradeSubscriptions()
      );
    }
  }

  addWallet(
    input: WatchedWalletInputPatch
  ): { wallet: WatchedWallet; subscription: unknown } {
    const address = normalizeAddress(input.address);

    if (!isValidSolanaMint(address)) {
      throw new WatchedWalletExitServiceError(
        "INVALID_WATCHED_WALLET_ADDRESS",
        "Watched wallet must be a valid Solana public key.",
        { statusCode: 400 }
      );
    }

    const existing = this.engine
      .getWatchedWallets()
      .some((wallet) => wallet.address === address);

    if (!existing && this.engine.getWatchedWallets().length >= this.config.maxWatchedWallets) {
      throw new WatchedWalletExitServiceError(
        "ACCOUNT_TRADE_MAX_WALLETS_REACHED",
        "Watched wallet cap reached.",
        {
          reasonCodes: ["ACCOUNT_TRADE_MAX_WALLETS_REACHED"],
          statusCode: 400
        }
      );
    }

    const wallet = this.engine.addWatchedWallet({
      address,
      alias: normalizeNullableString(input.alias),
      tags: uniqueStrings(input.tags ?? []),
      enabled: input.enabled ?? true,
      source: input.source ?? "manual",
      reasonCodes: input.reasonCodes ?? [],
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
      ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {})
    });

    saveWatchedWallet({
      address: wallet.address,
      alias: wallet.alias ?? null,
      tags: wallet.tags,
      enabled: wallet.enabled,
      source: wallet.source,
      reasonCodes: wallet.reasonCodes,
      payload: wallet,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    });

    const subscription = this.syncAccountTradeSubscriptions();

    return {
      wallet,
      subscription
    };
  }

  removeWallet(address: string): { removed: boolean; subscription: unknown } {
    const normalized = normalizeAddress(address);
    const removed = this.engine.removeWatchedWallet(normalized);
    const storageRemoved = deleteWatchedWallet(normalized);
    const subscription = this.pumpPortalProvider
      ? this.pumpPortalProvider.unsubscribeAccountTrades([normalized])
      : null;

    return {
      removed: removed || storageRemoved,
      subscription
    };
  }

  listWallets(): WatchedWallet[] {
    return this.engine.getWatchedWallets();
  }

  listStoredWallets(): StoredWatchedWallet[] {
    return listWatchedWallets();
  }

  addRule(input: ExitRuleInputPatch): ExitRule {
    const rule = normalizeExitRuleInput(input, this.config);
    const saved = this.engine.addExitRule(rule);
    persistExitRule(saved);
    return saved;
  }

  updateRule(ruleId: string, input: InputPatch<ExitRule>): ExitRule {
    const existing = this.engine
      .getExitRules()
      .find((rule) => rule.id === ruleId);

    if (!existing) {
      throw new WatchedWalletExitServiceError(
        "EXIT_RULE_NOT_FOUND",
        `No exit rule found for ${ruleId}.`,
        { statusCode: 404 }
      );
    }

    const saved = this.engine.updateExitRule(
      normalizeExitRuleInput({ ...existing, ...input, id: ruleId }, this.config)
    );
    persistExitRule(saved);
    return saved;
  }

  removeRule(ruleId: string): { removed: boolean } {
    return {
      removed: this.engine.removeExitRule(ruleId) || deleteExitRule(ruleId)
    };
  }

  listRules(): ExitRule[] {
    return this.engine.getExitRules();
  }

  listStoredRules(): StoredExitRule[] {
    return listExitRules();
  }

  ingestFeedEvent(event: AccountTradeEvent): WatchedWalletExitEvaluation {
    return this.ingestWatchedWalletTrade(accountTradeToWatchedTrade(event));
  }

  ingestWatchedWalletTrade(
    event: WatchedWalletTradeEvent
  ): WatchedWalletExitEvaluation {
    const wallet = this.engine
      .getWatchedWallets()
      .find((item) => item.address === event.wallet);

    if (!wallet || !wallet.enabled) {
      return {
        signals: [],
        persistedSignals: [],
        openPositionCount: this.getOpenPositionSnapshots().length,
        recentEventCount: this.engine.getRecentEvents().length,
        paperOnly: true,
        liveExecutionDisabled: true
      };
    }

    const observed = this.engine.ingestWatchedWalletTrade({
      ...event,
      walletAlias: event.walletAlias ?? wallet.alias ?? null
    });
    this.observedEventsThisSession += 1;
    saveWatchedWalletTradeEvent({
      wallet: observed.wallet,
      walletAlias: observed.walletAlias ?? null,
      mint: observed.mint,
      side: observed.side,
      priceSol: observed.priceSol ?? null,
      volumeSol: observed.volumeSol ?? null,
      tokenAmount: observed.tokenAmount ?? null,
      signature: observed.signature ?? null,
      confidence: observed.confidence,
      usableForExitStrategy: observed.usableForExitStrategy,
      reasonCodes: observed.reasonCodes,
      payload: observed,
      createdAt: observed.timestamp
    });

    const position = this.getOpenPositionSnapshots().find(
      (snapshot) => snapshot.mint === observed.mint
    ) ?? null;
    const signals = this.engine.evaluateExitForPosition(position, observed);
    const persistedSignals = signals.map((signal) => persistExitSignal(signal));

    return {
      signals,
      persistedSignals,
      openPositionCount: this.getOpenPositionSnapshots().length,
      recentEventCount: this.engine.getRecentEvents().length,
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  evaluateForOpenPositions(): WatchedWalletExitEvaluation {
    const positions = this.getOpenPositionSnapshots();
    const events = this.engine.getRecentEvents();
    const signals = this.engine.evaluateAll(positions, events);
    const persistedSignals = signals.map((signal) => persistExitSignal(signal));

    return {
      signals,
      persistedSignals,
      openPositionCount: positions.length,
      recentEventCount: events.length,
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  simulate(input: {
    event: WatchedWalletTradeInput;
    position: PaperPositionSnapshotInput | null;
    rule?: ExitRuleInputPatch | undefined;
  }): { signal: ExitSignal | null; signals: ExitSignal[]; paperOnly: true; liveExecutionDisabled: true } {
    const rule = normalizeExitRuleInput(
      {
        ...createDefaultExitRule({
          enabled: true,
          minProfitPct: this.config.defaultMinProfitPct,
          sellPct: this.config.defaultSellPct
        }),
        ...(input.rule ?? {})
      },
      this.config
    );
    const engine = createExitStrategyEngine({ defaultRules: [rule] });
    engine.addWatchedWallet({
      address: input.event.wallet,
      alias: input.event.walletAlias ?? null,
      enabled: true,
      reasonCodes: ["SIMULATED_WATCHED_WALLET"],
      source: "test",
      tags: []
    });
    const event = normalizeWatchedWalletTradeInput(input.event);
    const position = input.position
      ? normalizePaperPositionSnapshotInput(input.position)
      : null;
    const signals = engine.evaluateExitForPosition(position, event);

    return {
      signal: signals[0] ?? null,
      signals,
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  getStatus(): WatchedWalletExitStatus {
    const engineState = this.engine.getState();
    const stats = getStorageStats();
    const accountStats = this.pumpPortalProvider?.getPumpPortalAccountTradeStats();
    const estimatedCostSol = this.estimateCost({
      eventsPerWallet: 1,
      wallets: engineState.watchedWalletCount
    }).estimatedCostSol;
    const blockers = this.getAccountTradeSubscriptionBlockers();

    return {
      enabled: this.config.enabled,
      accountTradesEnabled: this.config.accountTradesEnabled,
      meteredAck: this.config.accountTradesAcknowledgedMetered,
      watchedWalletCount: engineState.watchedWalletCount,
      enabledRuleCount: engineState.enabledRuleCount,
      observedTradeCount: Math.max(
        engineState.observedTradeCount,
        stats.watchedWalletTradeEventCount
      ),
      exitSignalCount: Math.max(engineState.exitSignalCount, stats.exitSignalCount),
      maxWatchedWallets: this.config.maxWatchedWallets,
      maxEventsPerSession: this.config.maxEventsPerSession,
      estimatedCostSol,
      budgetReached: this.isBudgetReached(),
      dataWalletReady: this.isDataWalletReady(),
      accountTradeMonitoringEnabled: blockers.length === 0,
      accountTradeSubscribedWalletCount:
        accountStats?.subscribedWalletCount ?? 0,
      accountTradeEventCount:
        accountStats?.totalEventsThisSession ?? this.observedEventsThisSession,
      reasonCodes: uniqueStrings([
        ...engineState.reasonCodes,
        ...blockers,
        ...(blockers.length === 0
          ? ["ACCOUNT_TRADE_MONITORING_READY"]
          : []),
        "PAPER_SELL_PLAN_ONLY",
        "LIVE_EXECUTION_DISABLED"
      ]),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  getRecentEvents(limit = 50): StoredWatchedWalletTradeEvent[] {
    return listWatchedWalletTradeEvents(limit);
  }

  getRecentEventsByWallet(
    address: string,
    limit = 50
  ): StoredWatchedWalletTradeEvent[] {
    return listWatchedWalletTradeEventsByWallet(address, limit);
  }

  getRecentEventsByMint(
    mint: string,
    limit = 50
  ): StoredWatchedWalletTradeEvent[] {
    return listWatchedWalletTradeEventsByMint(mint, limit);
  }

  getSignals(limit = 50): StoredExitSignal[] {
    return listExitSignals(limit);
  }

  getSignalsByMint(mint: string, limit = 50): StoredExitSignal[] {
    return listExitSignalsByMint(mint, limit);
  }

  getSignalSummaryForMint(mint: string): ExitSignalSummary {
    const signals = this.getSignalsByMint(mint, 25);
    const latest = signals[0] ?? null;

    return {
      hasExitSignal: signals.length > 0,
      exitSignalCount: signals.length,
      latestExitSignal: latest
        ? {
            signalId: latest.signalId,
            action: latest.action,
            sellPct: latest.sellPct,
            blocked: latest.blocked,
            wallet: latest.wallet,
            walletAlias: latest.walletAlias,
            ruleId: latest.ruleId,
            createdAt: latest.createdAt,
            reasonCodes: latest.reasonCodes
          }
        : null,
      watchedWalletTriggers: uniqueStrings(
        signals.map((signal) => signal.walletAlias ?? signal.wallet)
      ),
      exitBlockers: uniqueStrings(signals.flatMap((signal) => signal.blockers))
    };
  }

  estimateCost(input: {
    eventsPerWallet: number;
    wallets: number;
  }): {
    events: number;
    estimatedCostSol: number;
    maxSessionCostSol: number;
    budgetReached: boolean;
    paperOnly: true;
    liveExecutionDisabled: true;
  } {
    const events = Math.max(0, Math.floor(input.wallets * input.eventsPerWallet));
    const estimatedCostSol =
      (events / 10_000) * this.config.eventCostSolPer10000;

    return {
      events,
      estimatedCostSol,
      maxSessionCostSol: this.config.maxSessionCostSol,
      budgetReached: estimatedCostSol >= this.config.maxSessionCostSol,
      paperOnly: true,
      liveExecutionDisabled: true
    };
  }

  private loadPersistedState(): void {
    for (const wallet of listWatchedWallets()) {
      this.engine.addWatchedWallet({
        address: wallet.address,
        alias: wallet.alias,
        tags: wallet.tags,
        enabled: wallet.enabled,
        source: wallet.source,
        reasonCodes: wallet.reasonCodes,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
      });
    }

    for (const rule of listExitRules()) {
      this.engine.addExitRule(storedRuleToExitRule(rule));
    }
  }

  private syncAccountTradeSubscriptions(): unknown {
    const blockers = this.getAccountTradeSubscriptionBlockers();

    if (!this.pumpPortalProvider || blockers.length > 0) {
      return {
        blocked: blockers.length > 0,
        reasonCodes: blockers
      };
    }

    const wallets = this.engine
      .getWatchedWallets()
      .filter((wallet) => wallet.enabled)
      .slice(0, this.config.maxWatchedWallets)
      .map((wallet) => wallet.address);

    return this.pumpPortalProvider.subscribeAccountTrades(wallets);
  }

  private getAccountTradeSubscriptionBlockers(): string[] {
    const dataWallet = this.dataWalletReadiness?.();
    const providerReady =
      this.providerName === "pumpportal" && this.pumpPortalProvider !== undefined;
    const dataWalletReady =
      !this.config.requireDataWalletReady ||
      Boolean(
        dataWallet?.configured &&
          (dataWallet.subscriptionBlockers?.length ?? 0) === 0
      );

    return uniqueStrings([
      ...(this.config.enabled ? [] : ["EXIT_STRATEGY_DISABLED"]),
      ...(this.config.accountTradesEnabled
        ? []
        : ["EXIT_STRATEGY_ACCOUNT_TRADES_DISABLED"]),
      ...(this.config.accountTradesAcknowledgedMetered
        ? []
        : ["ACCOUNT_TRADE_METERED_NOT_ACKNOWLEDGED"]),
      ...(this.config.apiKeyConfigured ? [] : ["PUMPPORTAL_API_KEY_MISSING"]),
      ...(providerReady ? [] : ["PUMPPORTAL_PROVIDER_REQUIRED"]),
      ...(dataWalletReady
        ? []
        : ["DATA_WALLET_NOT_READY", ...(dataWallet?.subscriptionBlockers ?? [])]),
      ...(this.isBudgetReached() ? ["EXIT_STRATEGY_ACCOUNT_TRADE_BUDGET_REACHED"] : [])
    ]);
  }

  private getOpenPositionSnapshots(): PaperPositionSnapshot[] {
    return this.getOpenPaperPositions()
      .filter((position) => position.status === "open")
      .map((position) =>
        storedPaperPositionToSnapshot(position, this.getCurrentPriceSol)
      );
  }

  private isDataWalletReady(): boolean {
    if (!this.config.requireDataWalletReady) {
      return true;
    }

    const readiness = this.dataWalletReadiness?.();

    return Boolean(
      readiness?.configured &&
        (readiness.subscriptionBlockers?.length ?? 0) === 0
    );
  }

  private isBudgetReached(): boolean {
    const accountStats = this.pumpPortalProvider?.getPumpPortalAccountTradeStats();
    const eventCount =
      accountStats?.totalEventsThisSession ?? this.observedEventsThisSession;
    const estimatedCostSol =
      (eventCount / 10_000) * this.config.eventCostSolPer10000;

    return (
      eventCount >= this.config.maxEventsPerSession ||
      estimatedCostSol >= this.config.maxSessionCostSol ||
      Boolean(accountStats?.budgetReached)
    );
  }
}

function normalizeExitRuleInput(
  input: ExitRuleInputPatch,
  config: WatchedWalletExitConfig
): ExitRule {
  return createDefaultExitRule({
    id: input.id ?? `exit-rule-${Date.now()}`,
    name: input.name ?? "Watched wallet buy take profit",
    enabled: input.enabled ?? true,
    trigger: input.trigger ?? "watched_wallet_buy",
    minProfitPct: input.minProfitPct ?? config.defaultMinProfitPct,
    minProfitSol: input.minProfitSol ?? null,
    sellPct: input.sellPct ?? config.defaultSellPct,
    requirePositionOpenedBeforeWalletTrade:
      input.requirePositionOpenedBeforeWalletTrade ?? true,
    allowedWalletTags: input.allowedWalletTags ?? [],
    blockedWalletTags: input.blockedWalletTags ?? [],
    requireCurrentPrice: input.requireCurrentPrice ?? true,
    maxPositionAgeMs: input.maxPositionAgeMs ?? null,
    cooldownMs: input.cooldownMs ?? config.cooldownMs,
    priority: input.priority ?? 100,
    reasonCodes: input.reasonCodes ?? ["USER_EXIT_RULE"]
  });
}

function normalizeWatchedWalletTradeInput(
  event: WatchedWalletTradeInput
): WatchedWalletTradeEvent {
  return {
    wallet: event.wallet,
    walletAlias: event.walletAlias ?? null,
    mint: event.mint,
    side: event.side,
    priceSol: event.priceSol ?? null,
    volumeSol: event.volumeSol ?? null,
    tokenAmount: event.tokenAmount ?? null,
    signature: event.signature ?? null,
    timestamp: event.timestamp,
    source: event.source,
    confidence: event.confidence,
    usableForExitStrategy: event.usableForExitStrategy,
    reasonCodes: event.reasonCodes,
    raw: event.raw
  };
}

function normalizePaperPositionSnapshotInput(
  position: PaperPositionSnapshotInput
): PaperPositionSnapshot {
  return {
    mint: position.mint,
    symbol: position.symbol ?? null,
    title: position.title ?? null,
    entryPriceSol: position.entryPriceSol ?? null,
    currentPriceSol: position.currentPriceSol ?? null,
    sizeSol: position.sizeSol,
    tokenAmount: position.tokenAmount ?? null,
    openedAt: position.openedAt,
    unrealizedPnlPct: position.unrealizedPnlPct ?? null,
    unrealizedPnlSol: position.unrealizedPnlSol ?? null,
    status: position.status
  };
}

function persistExitRule(rule: ExitRule): StoredExitRule {
  return saveExitRule({
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger,
    minProfitPct: rule.minProfitPct,
    minProfitSol: rule.minProfitSol ?? null,
    sellPct: rule.sellPct,
    requirePositionOpenedBeforeWalletTrade:
      rule.requirePositionOpenedBeforeWalletTrade,
    allowedWalletTags: rule.allowedWalletTags ?? [],
    blockedWalletTags: rule.blockedWalletTags ?? [],
    requireCurrentPrice: rule.requireCurrentPrice,
    maxPositionAgeMs: rule.maxPositionAgeMs ?? null,
    cooldownMs: rule.cooldownMs,
    priority: rule.priority,
    reasonCodes: rule.reasonCodes,
    payload: rule
  });
}

function persistExitSignal(signal: ExitSignal): StoredExitSignal {
  return saveExitSignal({
    id: signal.id,
    mint: signal.mint,
    wallet: signal.wallet,
    walletAlias: signal.walletAlias ?? null,
    ruleId: signal.ruleId,
    action: signal.action,
    sellPct: signal.sellPct,
    blocked: signal.blocked,
    blockers: signal.blockers,
    warnings: signal.warnings,
    reasonCodes: signal.reasonCodes,
    payload: signal,
    createdAt: signal.createdAt
  });
}

function storedRuleToExitRule(rule: StoredExitRule): ExitRule {
  return {
    id: rule.ruleId,
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger as ExitRuleTrigger,
    minProfitPct: rule.minProfitPct,
    minProfitSol: rule.minProfitSol,
    sellPct: rule.sellPct,
    requirePositionOpenedBeforeWalletTrade:
      rule.requirePositionOpenedBeforeWalletTrade,
    allowedWalletTags: rule.allowedWalletTags ?? [],
    blockedWalletTags: rule.blockedWalletTags ?? [],
    requireCurrentPrice: rule.requireCurrentPrice,
    maxPositionAgeMs: rule.maxPositionAgeMs,
    cooldownMs: rule.cooldownMs,
    priority: rule.priority,
    reasonCodes: rule.reasonCodes
  };
}

function accountTradeToWatchedTrade(
  event: AccountTradeEvent
): WatchedWalletTradeEvent {
  return {
    wallet: event.wallet,
    walletAlias: event.walletAlias ?? null,
    mint: event.mint,
    side: event.side,
    priceSol: event.priceSol,
    volumeSol: event.volumeSol,
    tokenAmount: event.tokenAmount,
    signature: event.signature ?? null,
    timestamp: event.timestamp,
    source: "pumpportal_account_trade",
    confidence: event.confidence,
    usableForExitStrategy: event.usableForExitStrategy,
    reasonCodes: event.reasonCodes ?? ["PUMPPORTAL_ACCOUNT_TRADE"],
    raw: event.raw
  };
}

function storedPaperPositionToSnapshot(
  position: StoredPaperPosition,
  getCurrentPriceSol: ((mint: string) => number | null | undefined) | undefined
): PaperPositionSnapshot {
  const payload =
    position.payload && typeof position.payload === "object"
      ? (position.payload as Record<string, unknown>)
      : {};
  const entryPriceSol =
    finiteOrNull(payload.entryPriceSol) ?? finiteOrNull(position.entryPrice);
  const currentPriceSol =
    finiteOrNull(getCurrentPriceSol?.(position.mint)) ??
    finiteOrNull(payload.currentPriceSol) ??
    null;
  const unrealizedPnlPct =
    finiteOrNull(payload.unrealizedPnlPct) ??
    (entryPriceSol !== null && currentPriceSol !== null && entryPriceSol > 0
      ? ((currentPriceSol - entryPriceSol) / entryPriceSol) * 100
      : null);
  const unrealizedPnlSol =
    finiteOrNull(payload.unrealizedPnlSol) ??
    (unrealizedPnlPct !== null
      ? (position.sizeSol * unrealizedPnlPct) / 100
      : null);

  return {
    mint: position.mint,
    symbol: position.symbol,
    title: readString(payload.title) ?? position.symbol,
    entryPriceSol,
    currentPriceSol,
    sizeSol: position.sizeSol,
    tokenAmount: position.tokenAmount,
    openedAt: position.openedAt,
    unrealizedPnlPct,
    unrealizedPnlSol,
    status: position.status
  };
}

function normalizeAddress(address: string): string {
  return address.trim();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}
