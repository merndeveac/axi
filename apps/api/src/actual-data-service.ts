import {
  isValidSolanaMint,
  type FeedEvent,
  type PumpPortalFeedProvider,
  type TokenTradeEvent
} from "@axi/data-feeds";
import {
  saveActualDataSession,
  saveActualDataSubscription,
  savePumpPortalTokenTradeEvent,
  type StoredActualDataSubscription,
  type StoredPumpPortalTokenTradeEvent
} from "@axi/storage";
import type { CandidateDecision } from "@axi/shared";

export type ActualDataServiceConfig = {
  acknowledgedMetered: boolean;
  apiKeyConfigured: boolean;
  autoSubscribe: boolean;
  autoSubscribeOnMigration: boolean;
  autoSubscribeOnNewToken: boolean;
  autoSubscribeOnQualified: boolean;
  enabled: boolean;
  manualMints: string[];
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSubscribedTokens: number;
  minScoreToAutoSubscribe: number;
  requireApiKey: boolean;
  unsubscribeAfterMs: number;
};

export type ActualDataDataWalletBalanceStatus =
  | "unknown"
  | "missing_config"
  | "critical"
  | "low"
  | "ok";

export type ActualDataDataWalletReadiness = {
  configured: boolean;
  balanceSol: number | null;
  balanceStatus: ActualDataDataWalletBalanceStatus;
  estimatedEventsRemaining: number | null;
  reasonCodes: string[];
  subscriptionBlockers: string[];
};

export type ActualDataStatus = {
  acknowledgedMetered: boolean;
  apiKeyConfigured: boolean;
  autoSubscribe: boolean;
  autoSubscribeOnMigration: boolean;
  autoSubscribeOnNewToken: boolean;
  autoSubscribeOnQualified: boolean;
  budgetReached: boolean;
  compatibleProvider: boolean;
  dataWalletBalanceSol: number | null;
  dataWalletBalanceStatus: ActualDataDataWalletBalanceStatus;
  dataWalletConfigured: boolean;
  dataWalletEstimatedEventsRemaining: number | null;
  dataWalletReasonCodes: string[];
  enabled: boolean;
  estimatedMeteredCostSol: number | null;
  manualMintCount: number;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSubscribedTokens: number;
  paperOnly: true;
  provider: string;
  reasonCodes: string[];
  subscribedTokenCount: number;
  totalEventsThisSession: number;
};

export type ActualDataEventCounters = {
  perMint: Record<string, number>;
  totalEventsThisSession: number;
};

export type ActualDataCandidateSummary = {
  eventCount: number;
  latestPriceSol: number | null;
  latestRealTradeAt: string | null;
  latestVolumeSol: number | null;
  observationOnly: true;
  paperOnly: true;
  provider: "pumpportal";
  reasonCodes: string[];
  subscriptionStatus: string;
};

export type ActualDataSubscriptionState = {
  eventCount: number;
  maxEvents: number;
  mint: string;
  provider: "pumpportal";
  reason: string;
  reasonCodes: string[];
  status: "subscribed" | "unsubscribed";
  subscribedAt: string | null;
  unsubscribedAt: string | null;
};

export type ActualDataServiceOptions = {
  config: ActualDataServiceConfig;
  dataWalletReadiness?: () => ActualDataDataWalletReadiness;
  providerName: string;
  pumpPortalProvider?: PumpPortalFeedProvider;
};

export class ActualDataServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 409) {
    super(message);
    this.name = "ActualDataServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function createActualDataService(
  options: ActualDataServiceOptions
): ActualDataService {
  return new ActualDataService(options);
}

export class ActualDataService {
  private readonly candidateSummaries = new Map<
    string,
    ActualDataCandidateSummary
  >();
  private readonly config: ActualDataServiceConfig;
  private readonly dataWalletReadiness:
    | (() => ActualDataDataWalletReadiness)
    | undefined;
  private readonly perMintEventCounts = new Map<string, number>();
  private readonly providerName: string;
  private readonly pumpPortalProvider: PumpPortalFeedProvider | undefined;
  private readonly recentTrades: StoredPumpPortalTokenTradeEvent[] = [];
  private readonly subscriptions = new Map<string, ActualDataSubscriptionState>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private budgetReached = false;
  private sessionAcknowledgedMetered = false;
  private startedAt: string | null = null;
  private totalEventsThisSession = 0;

  constructor(options: ActualDataServiceOptions) {
    this.config = options.config;
    this.dataWalletReadiness = options.dataWalletReadiness;
    this.providerName = options.providerName;
    this.pumpPortalProvider = options.pumpPortalProvider;
  }

  start(): void {
    if (this.startedAt) {
      return;
    }

    this.startedAt = new Date().toISOString();

    if (this.config.enabled) {
      saveActualDataSession({
        provider: this.providerName,
        status: this.canSubscribe() ? "running" : "blocked",
        totalEventCount: this.totalEventsThisSession,
        subscribedTokenCount: this.subscriptions.size,
        budgetEventLimit: this.config.maxEventsPerSession,
        startedAt: this.startedAt,
        stoppedAt: null,
        reasonCodes: this.getStatus().reasonCodes,
        payload: this.getStatus(),
        createdAt: this.startedAt
      });
    }

    for (const mint of this.config.manualMints) {
      try {
        this.subscribeMint(mint, "manual_env");
      } catch {
        // Status endpoints expose the gate reason; startup stays non-fatal.
      }
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();

    for (const mint of Array.from(this.subscriptions.keys())) {
      this.unsubscribeMint(mint, "service_stop");
    }

    if (this.startedAt && this.config.enabled) {
      const stoppedAt = new Date().toISOString();

      saveActualDataSession({
        provider: this.providerName,
        status: "stopped",
        totalEventCount: this.totalEventsThisSession,
        subscribedTokenCount: this.subscriptions.size,
        budgetEventLimit: this.config.maxEventsPerSession,
        startedAt: this.startedAt,
        stoppedAt,
        reasonCodes: this.getStatus().reasonCodes,
        payload: this.getStatus(),
        createdAt: stoppedAt
      });
    }

    this.startedAt = null;
  }

  acknowledgeMeteredSession(): ActualDataStatus {
    this.sessionAcknowledgedMetered = true;
    return this.getStatus();
  }

  subscribeMint(
    mint: string,
    reason: string
  ): ActualDataSubscriptionState {
    const normalizedMint = mint.trim();

    if (!isValidSolanaMint(normalizedMint)) {
      throw new ActualDataServiceError(
        "INVALID_MINT",
        `Invalid Solana mint for actual-data subscription: ${normalizedMint}`,
        400
      );
    }

    const blockers = this.getSubscriptionBlockers();

    if (blockers.length > 0) {
      throw new ActualDataServiceError(
        blockers[0] ?? "ACTUAL_DATA_SUBSCRIPTION_BLOCKED",
        "Actual-data subscription is blocked by current safety gates."
      );
    }

    const existing = this.subscriptions.get(normalizedMint);

    if (existing?.status === "subscribed") {
      return existing;
    }

    if (this.getSubscribedTokenCount() >= this.config.maxSubscribedTokens) {
      throw new ActualDataServiceError(
        "PUMPPORTAL_TRADE_MAX_TOKENS_REACHED",
        "Maximum PumpPortal token trade subscriptions reached."
      );
    }

    const result = this.pumpPortalProvider?.subscribeTokenTrades([
      normalizedMint
    ]);

    if (!result || !result.subscribed.includes(normalizedMint)) {
      throw new ActualDataServiceError(
        result?.reasonCodes[0] ?? "PUMPPORTAL_TRADE_SUBSCRIBE_FAILED",
        "PumpPortal token trade subscription was not accepted."
      );
    }

    const now = new Date().toISOString();
    const state: ActualDataSubscriptionState = {
      eventCount: this.perMintEventCounts.get(normalizedMint) ?? 0,
      maxEvents: this.config.maxEventsPerMint,
      mint: normalizedMint,
      provider: "pumpportal",
      reason,
      reasonCodes: uniqueReasonCodes([
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "PUMPPORTAL_TRADE_SUBSCRIBED",
        ...result.reasonCodes
      ]),
      status: "subscribed",
      subscribedAt: now,
      unsubscribedAt: null
    };

    this.subscriptions.set(normalizedMint, state);
    this.scheduleUnsubscribe(normalizedMint);
    this.persistSubscription(state);
    this.updateCandidateSummary(normalizedMint, state.reasonCodes);
    return state;
  }

  unsubscribeMint(
    mint: string,
    reason: string
  ): ActualDataSubscriptionState | null {
    const normalizedMint = mint.trim();
    const existing = this.subscriptions.get(normalizedMint);

    if (!existing) {
      return null;
    }

    const timer = this.timers.get(normalizedMint);

    if (timer) {
      clearTimeout(timer);
      this.timers.delete(normalizedMint);
    }

    this.pumpPortalProvider?.unsubscribeTokenTrades([normalizedMint]);

    const state: ActualDataSubscriptionState = {
      ...existing,
      eventCount: this.perMintEventCounts.get(normalizedMint) ?? existing.eventCount,
      reason,
      reasonCodes: uniqueReasonCodes([
        ...existing.reasonCodes,
        "PUMPPORTAL_TRADE_UNSUBSCRIBED"
      ]),
      status: "unsubscribed",
      unsubscribedAt: new Date().toISOString()
    };

    this.subscriptions.set(normalizedMint, state);
    this.persistSubscription(state);
    this.updateCandidateSummary(normalizedMint, state.reasonCodes);
    return state;
  }

  getStatus(): ActualDataStatus {
    const providerStats = this.pumpPortalProvider?.getPumpPortalTradeStats();
    const dataWallet = this.getDataWalletReadiness();
    const reasonCodes = uniqueReasonCodes([
      ...this.getSubscriptionBlockers(),
      ...dataWallet.reasonCodes,
      ...(this.config.enabled ? [] : ["ACTUAL_DATA_DISABLED"]),
      "OBSERVATION_ONLY",
      "PAPER_ONLY"
    ]);

    return {
      acknowledgedMetered: this.isMeteredAcknowledged(),
      apiKeyConfigured: this.config.apiKeyConfigured,
      autoSubscribe: this.config.autoSubscribe,
      autoSubscribeOnMigration: this.config.autoSubscribeOnMigration,
      autoSubscribeOnNewToken: this.config.autoSubscribeOnNewToken,
      autoSubscribeOnQualified: this.config.autoSubscribeOnQualified,
      budgetReached: this.budgetReached || providerStats?.budgetReached === true,
      compatibleProvider: this.isCompatibleProvider(),
      dataWalletBalanceSol: dataWallet.balanceSol,
      dataWalletBalanceStatus: dataWallet.balanceStatus,
      dataWalletConfigured: dataWallet.configured,
      dataWalletEstimatedEventsRemaining: dataWallet.estimatedEventsRemaining,
      dataWalletReasonCodes: dataWallet.reasonCodes,
      enabled: this.config.enabled,
      estimatedMeteredCostSol: null,
      manualMintCount: this.config.manualMints.length,
      maxEventsPerMint: this.config.maxEventsPerMint,
      maxEventsPerSession: this.config.maxEventsPerSession,
      maxSubscribedTokens: this.config.maxSubscribedTokens,
      paperOnly: true,
      provider: this.providerName,
      reasonCodes,
      subscribedTokenCount: this.getSubscribedTokenCount(),
      totalEventsThisSession: this.totalEventsThisSession
    };
  }

  getSubscriptions(): ActualDataSubscriptionState[] {
    return Array.from(this.subscriptions.values()).sort((left, right) =>
      left.mint.localeCompare(right.mint)
    );
  }

  getRecentTrades(): StoredPumpPortalTokenTradeEvent[] {
    return [...this.recentTrades];
  }

  getEventCounters(): ActualDataEventCounters {
    return {
      perMint: Object.fromEntries(this.perMintEventCounts),
      totalEventsThisSession: this.totalEventsThisSession
    };
  }

  getCandidateSummary(mint: string): ActualDataCandidateSummary | undefined {
    return this.candidateSummaries.get(mint);
  }

  getCandidateSummaries(): Record<string, ActualDataCandidateSummary> {
    return Object.fromEntries(this.candidateSummaries);
  }

  handlePumpPortalTradeEvent(
    event: TokenTradeEvent
  ): ActualDataCandidateSummary | undefined {
    if (!isPumpPortalTokenTradeEvent(event)) {
      return undefined;
    }

    const stored = savePumpPortalTokenTradeEvent({
      mint: event.mint,
      signature: event.signature ?? null,
      side: event.side,
      trader: event.trader ?? null,
      priceSol: event.priceSol ?? null,
      volumeSol: event.volumeSol ?? null,
      tokenAmount: event.tokenAmount ?? null,
      confidence: event.confidence ?? "low",
      usableForMetrics: event.usableForMetrics === true,
      reasonCodes: event.reasonCodes ?? [],
      payload: event,
      createdAt: event.timestamp
    });

    this.recentTrades.unshift(stored);
    this.recentTrades.splice(100);
    this.totalEventsThisSession += 1;

    const mintCount = (this.perMintEventCounts.get(event.mint) ?? 0) + 1;
    this.perMintEventCounts.set(event.mint, mintCount);

    const subscription = this.subscriptions.get(event.mint);

    if (subscription) {
      subscription.eventCount = mintCount;
    }

    const summary = this.updateCandidateSummary(event.mint, event.reasonCodes ?? [], {
      latestPriceSol: event.priceSol ?? null,
      latestRealTradeAt: event.timestamp,
      latestVolumeSol: event.volumeSol ?? null
    });

    if (mintCount >= this.config.maxEventsPerMint) {
      this.unsubscribeMint(event.mint, "max_events_per_mint");
    }

    if (this.totalEventsThisSession >= this.config.maxEventsPerSession) {
      this.budgetReached = true;

      for (const mint of Array.from(this.subscriptions.keys())) {
        this.unsubscribeMint(mint, "max_events_per_session");
      }
    }

    return summary;
  }

  maybeAutoSubscribeForEvent(
    event: FeedEvent,
    decision: CandidateDecision | undefined
  ): ActualDataSubscriptionState | undefined {
    if (!this.config.autoSubscribe || !this.config.enabled) {
      return undefined;
    }

    const mint = event.type === "token_created" ? event.candidate.mint : event.mint;
    const rawType = event.rawSourceEventType ?? event.type;
    const shouldSubscribeForNewToken =
      event.type === "token_created" &&
      rawType !== "migration" &&
      this.config.autoSubscribeOnNewToken;
    const shouldSubscribeForMigration =
      event.type === "token_created" &&
      rawType === "migration" &&
      this.config.autoSubscribeOnMigration;
    const shouldSubscribeForQualified =
      decision !== undefined &&
      this.config.autoSubscribeOnQualified &&
      decision.score >= this.config.minScoreToAutoSubscribe &&
      !decision.hardReject;

    if (
      !shouldSubscribeForNewToken &&
      !shouldSubscribeForMigration &&
      !shouldSubscribeForQualified
    ) {
      return undefined;
    }

    try {
      return this.subscribeMint(mint, "auto");
    } catch {
      return undefined;
    }
  }

  private canSubscribe(): boolean {
    return this.getSubscriptionBlockers().length === 0;
  }

  private getSubscriptionBlockers(): string[] {
    const reasonCodes: string[] = [];

    if (!this.config.enabled) {
      return ["ACTUAL_DATA_DISABLED"];
    }

    if (!this.isCompatibleProvider()) {
      reasonCodes.push("ACTUAL_DATA_INCOMPATIBLE_PROVIDER");
    }

    if (!this.isMeteredAcknowledged()) {
      reasonCodes.push("METERED_STREAM_NOT_ACKNOWLEDGED");
    }

    if (this.config.requireApiKey && !this.config.apiKeyConfigured) {
      reasonCodes.push("PUMPPORTAL_API_KEY_MISSING");
    }

    reasonCodes.push(...this.getDataWalletReadiness().subscriptionBlockers);

    if (this.budgetReached) {
      reasonCodes.push("PUMPPORTAL_TRADE_BUDGET_REACHED");
    }

    return uniqueReasonCodes(reasonCodes);
  }

  private getSubscribedTokenCount(): number {
    return this.getSubscriptions().filter(
      (subscription) => subscription.status === "subscribed"
    ).length;
  }

  private isCompatibleProvider(): boolean {
    return this.providerName === "pumpportal";
  }

  private isMeteredAcknowledged(): boolean {
    return this.config.acknowledgedMetered || this.sessionAcknowledgedMetered;
  }

  private getDataWalletReadiness(): ActualDataDataWalletReadiness {
    return (
      this.dataWalletReadiness?.() ?? {
        balanceSol: null,
        balanceStatus: "unknown",
        configured: false,
        estimatedEventsRemaining: null,
        reasonCodes: [],
        subscriptionBlockers: []
      }
    );
  }

  private persistSubscription(state: ActualDataSubscriptionState) {
    const input = {
      mint: state.mint,
      provider: state.provider,
      status: state.status,
      reason: state.reason,
      eventCount: state.eventCount,
      maxEvents: state.maxEvents,
      subscribedAt: state.subscribedAt,
      unsubscribedAt: state.unsubscribedAt,
      reasonCodes: state.reasonCodes,
      payload: state
    };
    const createdAt = state.unsubscribedAt ?? state.subscribedAt;

    return saveActualDataSubscription({
      ...input,
      ...(createdAt ? { createdAt } : {})
    }) as StoredActualDataSubscription;
  }

  private scheduleUnsubscribe(mint: string): void {
    if (this.config.unsubscribeAfterMs <= 0) {
      return;
    }

    const existing = this.timers.get(mint);

    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.unsubscribeMint(mint, "unsubscribe_after_ms");
    }, this.config.unsubscribeAfterMs);

    this.timers.set(mint, timer);
  }

  private updateCandidateSummary(
    mint: string,
    reasonCodes: string[],
    latest?: {
      latestPriceSol: number | null;
      latestRealTradeAt: string | null;
      latestVolumeSol: number | null;
    }
  ): ActualDataCandidateSummary {
    const existing = this.candidateSummaries.get(mint);
    const subscription = this.subscriptions.get(mint);
    const summary: ActualDataCandidateSummary = {
      eventCount: this.perMintEventCounts.get(mint) ?? existing?.eventCount ?? 0,
      latestPriceSol:
        latest?.latestPriceSol ?? existing?.latestPriceSol ?? null,
      latestRealTradeAt:
        latest?.latestRealTradeAt ?? existing?.latestRealTradeAt ?? null,
      latestVolumeSol:
        latest?.latestVolumeSol ?? existing?.latestVolumeSol ?? null,
      observationOnly: true,
      paperOnly: true,
      provider: "pumpportal",
      reasonCodes: uniqueReasonCodes([
        ...(existing?.reasonCodes ?? []),
        ...reasonCodes
      ]),
      subscriptionStatus: subscription?.status ?? "none"
    };

    this.candidateSummaries.set(mint, summary);
    return summary;
  }
}

export function createActualDataConfig(input: {
  acknowledgedMetered?: boolean;
  apiKeyConfigured?: boolean;
  autoSubscribe?: boolean;
  autoSubscribeOnMigration?: boolean;
  autoSubscribeOnNewToken?: boolean;
  autoSubscribeOnQualified?: boolean;
  enabled?: boolean;
  manualMints?: string[];
  maxEventsPerMint?: number;
  maxEventsPerSession?: number;
  maxSubscribedTokens?: number;
  minScoreToAutoSubscribe?: number;
  requireApiKey?: boolean;
  unsubscribeAfterMs?: number;
} = {}): ActualDataServiceConfig {
  return {
    acknowledgedMetered: input.acknowledgedMetered ?? false,
    apiKeyConfigured: input.apiKeyConfigured ?? false,
    autoSubscribe: input.autoSubscribe ?? false,
    autoSubscribeOnMigration: input.autoSubscribeOnMigration ?? false,
    autoSubscribeOnNewToken: input.autoSubscribeOnNewToken ?? false,
    autoSubscribeOnQualified: input.autoSubscribeOnQualified ?? false,
    enabled: input.enabled ?? false,
    manualMints: uniqueReasonCodes(input.manualMints ?? []),
    maxEventsPerMint: input.maxEventsPerMint ?? 1000,
    maxEventsPerSession: input.maxEventsPerSession ?? 5000,
    maxSubscribedTokens: input.maxSubscribedTokens ?? 10,
    minScoreToAutoSubscribe: input.minScoreToAutoSubscribe ?? 60,
    requireApiKey: input.requireApiKey ?? true,
    unsubscribeAfterMs: input.unsubscribeAfterMs ?? 300_000
  };
}

export function parseManualMints(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((mint) => mint.trim())
        .filter(Boolean)
    )
  );
}

function isPumpPortalTokenTradeEvent(
  event: TokenTradeEvent
): event is TokenTradeEvent {
  return (
    event.type === "trade" &&
    event.source === "pumpportal" &&
    event.reasonCodes?.includes("PUMPPORTAL_TOKEN_TRADE") === true
  );
}

function uniqueReasonCodes(values: string[]): string[] {
  return Array.from(new Set(values));
}
