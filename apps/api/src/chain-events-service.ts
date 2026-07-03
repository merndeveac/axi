import type {
  ChainTransactionEvent,
  NormalizedChainTradeEvent,
  SolanaRpcCommitment,
  SolanaTransactionIngestor,
  WatchedAddress,
  WatchedAddressInput,
  WatchedAddressRegistry
} from "@axi/chain-events";
import {
  WatchedAddressRegistryError,
  createSolanaTransactionIngestor,
  createWatchedAddressRegistry
} from "@axi/chain-events";
import type { FeedEvent, TokenTradeEvent } from "@axi/data-feeds";
import {
  createMarketDataNormalizer,
  createMarketObservationSummary,
  marketObservationToMetricsTradeEvent,
  type MarketDataNormalizer,
  type MarketDataNormalizerOptions,
  type MarketObservation,
  type MarketObservationConfidence
} from "@axi/market-data";
import type { RiskFlags, RollingMetrics } from "@axi/shared";
import {
  getChainTradeEvent,
  getChainTransactionEvent,
  getMarketObservation,
  getStorageStats,
  listChainTradeEvents,
  listChainTransactionEvents,
  listMarketObservations,
  listMarketObservationsByMint,
  saveMarketObservation,
  saveChainTradeEvent,
  saveChainTransactionEvent
} from "@axi/storage";

export type ChainEventsRuntimeStatus =
  | "disabled"
  | "config_error"
  | "ready"
  | "running";

export type ChainEventsStatus = {
  backfillOnStart: boolean;
  configured: boolean;
  enabled: boolean;
  fetchTransactionOnLog: boolean;
  lastError: string | null;
  maxWatchedAddresses: number;
  paperOnly: true;
  rpcHttpConfigured: boolean;
  rpcWsConfigured: boolean;
  status: ChainEventsRuntimeStatus;
  subscriptions: number;
  watchedAddressCount: number;
};

export type MarketDataServiceOptions = MarketDataNormalizerOptions & {
  enabled?: boolean;
};

export type MarketDataStatus = {
  allowSolUsdConversion: boolean;
  allowUsdFromStableQuotes: boolean;
  enabled: boolean;
  minConfidenceForMetrics: MarketObservationConfidence;
  observationCount: number;
  paperOnly: true;
  solUsdConfigured: boolean;
};

export type ChainEventsServiceOptions = {
  backfillLimitPerAddress?: number;
  backfillOnStart?: boolean;
  commitment?: SolanaRpcCommitment;
  enabled?: boolean;
  fetchTransactionOnLog?: boolean;
  logger?: {
    debug?: (message: string, context?: Record<string, unknown>) => void;
    error?: (message: string, context?: Record<string, unknown>) => void;
    info?: (message: string, context?: Record<string, unknown>) => void;
    warn?: (message: string, context?: Record<string, unknown>) => void;
  };
  maxConcurrentFetches?: number;
  maxWatchedAddresses?: number;
  marketData?: MarketDataServiceOptions;
  onChainVerified?: boolean;
  onNewCandidate?: boolean;
  onSafeFeedEvent?: (event: FeedEvent) => void;
  requestTimeoutMs?: number;
  rpcHttpUrl?: string;
  rpcWsUrl?: string;
  watchedAddresses?: WatchedAddressInput[];
};

export class ChainEventsUnavailableError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ChainEventsUnavailableError";
    this.code = code;
  }
}

const defaultMaxWatchedAddresses = 25;

export class ChainEventsService {
  private readonly options: Required<
    Pick<
      ChainEventsServiceOptions,
      | "backfillLimitPerAddress"
      | "backfillOnStart"
      | "enabled"
      | "fetchTransactionOnLog"
      | "maxConcurrentFetches"
      | "maxWatchedAddresses"
      | "onChainVerified"
      | "onNewCandidate"
      | "requestTimeoutMs"
    >
  > & {
    commitment: SolanaRpcCommitment;
    logger?: ChainEventsServiceOptions["logger"];
    onSafeFeedEvent?: (event: FeedEvent) => void;
    rpcHttpUrl?: string;
    rpcWsUrl?: string;
  };
  private readonly marketDataEnabled: boolean;
  private readonly marketDataOptions: MarketDataNormalizerOptions;
  private readonly marketDataNormalizer: MarketDataNormalizer;
  private readonly registry: WatchedAddressRegistry;
  private ingestor: SolanaTransactionIngestor | undefined;
  private lastError: string | null = null;
  private running = false;

  constructor(options: ChainEventsServiceOptions = {}) {
    this.options = {
      backfillLimitPerAddress: options.backfillLimitPerAddress ?? 25,
      backfillOnStart: options.backfillOnStart ?? false,
      commitment: options.commitment ?? "confirmed",
      enabled: options.enabled ?? false,
      fetchTransactionOnLog: options.fetchTransactionOnLog ?? true,
      maxConcurrentFetches: options.maxConcurrentFetches ?? 4,
      maxWatchedAddresses:
        options.maxWatchedAddresses ?? defaultMaxWatchedAddresses,
      onChainVerified: options.onChainVerified ?? false,
      onNewCandidate: options.onNewCandidate ?? false,
      requestTimeoutMs: options.requestTimeoutMs ?? 10_000
    };

    if (options.logger) {
      this.options.logger = options.logger;
    }

    if (options.onSafeFeedEvent) {
      this.options.onSafeFeedEvent = options.onSafeFeedEvent;
    }

    if (options.rpcHttpUrl) {
      this.options.rpcHttpUrl = options.rpcHttpUrl;
    }

    if (options.rpcWsUrl) {
      this.options.rpcWsUrl = options.rpcWsUrl;
    }

    this.marketDataEnabled = options.marketData?.enabled ?? true;
    this.marketDataOptions = {
      allowSolUsdConversion:
        options.marketData?.allowSolUsdConversion ?? false,
      allowUsdFromStableQuotes:
        options.marketData?.allowUsdFromStableQuotes ?? true,
      maxReasonCodes: options.marketData?.maxReasonCodes ?? 20,
      minConfidenceForMetrics:
        options.marketData?.minConfidenceForMetrics ?? "medium",
      solUsdPrice: options.marketData?.solUsdPrice ?? null
    };

    if (options.marketData?.quoteTokenRegistry) {
      this.marketDataOptions.quoteTokenRegistry =
        options.marketData.quoteTokenRegistry;
    }
    this.marketDataNormalizer = createMarketDataNormalizer(
      this.marketDataOptions
    );

    this.registry = createWatchedAddressRegistry({
      maxWatchedAddresses: this.options.maxWatchedAddresses
    });

    for (const watchedAddress of options.watchedAddresses ?? []) {
      try {
        this.registry.add(watchedAddress);
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (this.getRuntimeStatus() === "ready") {
      this.ingestor = this.createIngestor();
    }
  }

  async start(): Promise<void> {
    if (this.running || this.getRuntimeStatus() !== "ready") {
      return;
    }

    this.ingestor ??= this.createIngestor();
    this.running = true;
    await this.ingestor.start();
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    await this.ingestor?.stop();
  }

  getStatus(): ChainEventsStatus {
    return {
      backfillOnStart: this.options.backfillOnStart,
      configured: this.isConfigured(),
      enabled: this.options.enabled,
      fetchTransactionOnLog: this.options.fetchTransactionOnLog,
      lastError: this.lastError,
      maxWatchedAddresses: this.options.maxWatchedAddresses,
      paperOnly: true,
      rpcHttpConfigured: Boolean(this.options.rpcHttpUrl),
      rpcWsConfigured: Boolean(this.options.rpcWsUrl),
      status: this.getRuntimeStatus(),
      subscriptions: this.ingestor?.getSubscriptionCount() ?? 0,
      watchedAddressCount: this.registry.size()
    };
  }

  getMarketStatus(): MarketDataStatus {
    const stats = getStorageStats();

    return {
      allowSolUsdConversion:
        this.marketDataOptions.allowSolUsdConversion ?? false,
      allowUsdFromStableQuotes:
        this.marketDataOptions.allowUsdFromStableQuotes ?? true,
      enabled: this.marketDataEnabled,
      minConfidenceForMetrics:
        this.marketDataOptions.minConfidenceForMetrics ?? "medium",
      observationCount: stats.marketObservationCount,
      paperOnly: true,
      solUsdConfigured:
        this.marketDataOptions.solUsdPrice !== null &&
        this.marketDataOptions.solUsdPrice !== undefined
    };
  }

  getWatchedAddresses(): WatchedAddress[] {
    return this.registry.list();
  }

  getRecentChainEvents(limit = 50): ReturnType<typeof listChainTransactionEvents> {
    return listChainTransactionEvents(limit);
  }

  getRecentChainTradeEvents(limit = 50): ReturnType<typeof listChainTradeEvents> {
    return listChainTradeEvents(limit);
  }

  getRecentMarketObservations(limit = 50): ReturnType<typeof listMarketObservations> {
    return listMarketObservations(limit);
  }

  getMarketObservationsByMint(
    mint: string,
    limit = 50
  ): ReturnType<typeof listMarketObservationsByMint> {
    return listMarketObservationsByMint(mint, limit);
  }

  getChainTransactionEvent(signature: string): ReturnType<typeof getChainTransactionEvent> {
    return getChainTransactionEvent(signature);
  }

  getChainTradeEvent(signature: string): ReturnType<typeof getChainTradeEvent> {
    return getChainTradeEvent(signature);
  }

  getMarketObservation(signature: string): ReturnType<typeof getMarketObservation> {
    return getMarketObservation(signature);
  }

  watchAddress(input: WatchedAddressInput): WatchedAddress {
    this.assertCanMutateWatches();

    try {
      const watched = this.ingestor
        ? this.ingestor.watchAddress(input)
        : this.registry.add(input);

      if (!this.ingestor) {
        this.registry.add(watched);
      }

      return watched;
    } catch (error) {
      if (error instanceof WatchedAddressRegistryError) {
        this.lastError = error.message;
      }

      throw error;
    }
  }

  async unwatchAddress(address: string): Promise<boolean> {
    const removedFromIngestor = await this.ingestor?.unwatchAddress(address);
    const removedFromRegistry = this.registry.remove(address);
    return Boolean(removedFromIngestor || removedFromRegistry);
  }

  maybeWatchCandidate(input: WatchedAddressInput): WatchedAddress | undefined {
    if (!this.options.onNewCandidate) {
      return undefined;
    }

    if (this.getRuntimeStatus() !== "running" && this.getRuntimeStatus() !== "ready") {
      return undefined;
    }

    try {
      return this.watchAddress({
        ...input,
        reasonCodes: [
          ...(input.reasonCodes ?? []),
          "CHAIN_EVENTS_ON_NEW_CANDIDATE"
        ]
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return undefined;
    }
  }

  maybeWatchChainVerified(input: WatchedAddressInput): WatchedAddress | undefined {
    if (!this.options.onChainVerified) {
      return undefined;
    }

    try {
      return this.watchAddress({
        ...input,
        reasonCodes: [
          ...(input.reasonCodes ?? []),
          "CHAIN_EVENTS_ON_CHAIN_VERIFIED"
        ]
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return undefined;
    }
  }

  private createIngestor(): SolanaTransactionIngestor {
    if (!this.options.rpcHttpUrl || !this.options.rpcWsUrl) {
      throw new ChainEventsUnavailableError(
        "CHAIN_EVENTS_CONFIG_MISSING_RPC",
        "Set SOLANA_RPC_HTTP and SOLANA_RPC_WS to use chain event ingestion."
      );
    }

    return createSolanaTransactionIngestor({
      backfillLimitPerAddress: this.options.backfillLimitPerAddress,
      backfillOnStart: this.options.backfillOnStart,
      commitment: this.options.commitment,
      fetchTransactionOnLog: this.options.fetchTransactionOnLog,
      ...(this.options.logger ? { logger: this.options.logger } : {}),
      maxConcurrentFetches: this.options.maxConcurrentFetches,
      maxWatchedAddresses: this.options.maxWatchedAddresses,
      onChainEvent: (event) => {
        this.handleChainEvent(event);
      },
      onError: (error) => {
        this.lastError = error.message;
      },
      onTradeEvent: (event) => {
        this.handleTradeEvent(event);
      },
      requestTimeoutMs: this.options.requestTimeoutMs,
      rpcHttpUrl: this.options.rpcHttpUrl,
      rpcWsUrl: this.options.rpcWsUrl,
      watchedAddresses: this.registry.list()
    });
  }

  private handleChainEvent(event: ChainTransactionEvent): void {
    saveChainTransactionEvent(event);

    if (!this.marketDataEnabled) {
      return;
    }

    for (const observation of this.marketDataNormalizer.normalizeChainTransactionToMarketObservations({
      chainTransactionEvent: event
    })) {
      this.persistAndMaybeEmitMarketObservation(observation);
    }
  }

  private handleTradeEvent(event: NormalizedChainTradeEvent): void {
    saveChainTradeEvent(event);

    if (!this.marketDataEnabled || getMarketObservation(event.signature)) {
      return;
    }

    const observation =
      this.marketDataNormalizer.normalizeChainTradeEventToMarketObservation(event);
    this.persistAndMaybeEmitMarketObservation(observation);
  }

  private persistAndMaybeEmitMarketObservation(
    observation: MarketObservation
  ): void {
    const existing = getMarketObservation(observation.signature);

    if (existing) {
      return;
    }

    const enrichedObservation = observation.usableForMetrics
      ? appendReasonCodes(observation, ["CHAIN_MARKET_METRICS_READY"])
      : appendReasonCodes(observation, ["CHAIN_MARKET_OBSERVATION_ONLY"]);

    const stored = saveMarketObservation(enrichedObservation);
    const feedEvent = convertMarketObservationToFeedEvent(stored);

    if (feedEvent) {
      this.options.onSafeFeedEvent?.(feedEvent);
    }
  }

  private getRuntimeStatus(): ChainEventsRuntimeStatus {
    if (!this.options.enabled) {
      return "disabled";
    }

    if (!this.isConfigured() || this.lastError) {
      return "config_error";
    }

    return this.running ? "running" : "ready";
  }

  private isConfigured(): boolean {
    return Boolean(this.options.rpcHttpUrl && this.options.rpcWsUrl);
  }

  private assertCanMutateWatches(): void {
    const status = this.getRuntimeStatus();

    if (status === "disabled") {
      throw new ChainEventsUnavailableError(
        "CHAIN_EVENTS_DISABLED",
        "Chain event ingestion is disabled."
      );
    }

    if (status === "config_error") {
      throw new ChainEventsUnavailableError(
        "CHAIN_EVENTS_CONFIG_MISSING_RPC",
        "Set SOLANA_RPC_HTTP and SOLANA_RPC_WS to watch read-only chain events."
      );
    }
  }
}

export function createChainEventsService(
  options: ChainEventsServiceOptions = {}
): ChainEventsService {
  return new ChainEventsService(options);
}

function convertMarketObservationToFeedEvent(
  observation: MarketObservation
): TokenTradeEvent | null {
  const metricsEvent = marketObservationToMetricsTradeEvent(observation);

  if (!metricsEvent) {
    return null;
  }

  const metrics = createMetricsFromMarketObservation(observation);
  const riskFlags = createSafeRiskFlags();

  return {
    type: "trade",
    mint: observation.mint,
    source: "solana_rpc",
    ...(observation.symbol ? { symbol: observation.symbol } : {}),
    token: {
      chain: "solana",
      mint: observation.mint
    },
    side: metricsEvent.side,
    priceUsd: observation.priceUsd,
    volumeUsd: observation.volumeUsd,
    ...(observation.priceSol !== null ? { priceSol: observation.priceSol } : {}),
    ...(observation.volumeSol !== null ? { volumeSol: observation.volumeSol } : {}),
    ...(observation.priceQuote !== null
      ? { priceQuote: observation.priceQuote }
      : {}),
    ...(observation.volumeQuote !== null
      ? { volumeQuote: observation.volumeQuote }
      : {}),
    quoteAsset: observation.quoteAsset,
    quoteMint: observation.quoteMint,
    ...(observation.baseTokenAmount !== null
      ? { tokenAmount: observation.baseTokenAmount }
      : {}),
    ...(observation.watchedAddress ? { trader: observation.watchedAddress } : {}),
    signature: observation.signature,
    metrics,
    marketObservation: createMarketObservationSummary(observation),
    metricsComplete: true,
    raw: observation,
    rawSourceEventType: "market_observation",
    reasonCodes: uniqueReasonCodes([
      "CHAIN_TRADE_EVENT",
      "MARKET_OBSERVATION",
      ...observation.reasonCodes
    ]),
    receivedAt: observation.timestamp,
    riskFlags,
    timestamp: observation.timestamp,
    usableForMetrics: observation.usableForMetrics,
    confidence: observation.confidence
  };
}

function createMetricsFromMarketObservation(
  observation: MarketObservation
): RollingMetrics {
  return {
    priceUsd: observation.priceUsd ?? 0,
    ...(observation.priceSol !== null ? { priceSol: observation.priceSol } : {}),
    ...(observation.priceQuote !== null
      ? { priceQuote: observation.priceQuote }
      : {}),
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: observation.volumeUsd ?? 0,
    volume5mUsd: observation.volumeUsd ?? 0,
    volume15mUsd: observation.volumeUsd ?? 0,
    ...(observation.volumeSol !== null
      ? { volumeSol: observation.volumeSol }
      : {}),
    ...(observation.volumeQuote !== null
      ? { volumeQuote: observation.volumeQuote }
      : {}),
    quoteAsset: observation.quoteAsset,
    quoteMint: observation.quoteMint,
    usableForMetrics: observation.usableForMetrics,
    confidence: observation.confidence,
    reasonCodes: observation.reasonCodes,
    buyCount1m: observation.side === "buy" ? 1 : 0,
    buyCount5m: observation.side === "buy" ? 1 : 0,
    sellCount1m: observation.side === "sell" ? 1 : 0,
    sellCount5m: observation.side === "sell" ? 1 : 0,
    uniqueBuyers1m: observation.side === "buy" ? 1 : 0,
    uniqueBuyers5m: observation.side === "buy" ? 1 : 0,
    uniqueSellers1m: observation.side === "sell" ? 1 : 0,
    uniqueSellers5m: observation.side === "sell" ? 1 : 0,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: 0,
    priceChange5mPct: 0,
    volumeVelocity: 0,
    buyerVelocity: 0
  };
}

function appendReasonCodes(
  observation: MarketObservation,
  reasonCodes: string[]
): MarketObservation {
  return {
    ...observation,
    reasonCodes: uniqueReasonCodes([...observation.reasonCodes, ...reasonCodes])
  };
}

function createSafeRiskFlags(): RiskFlags {
  return {
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    topHolderConcentrationHigh: false,
    mutableMetadata: false,
    suspiciousName: false,
    lowLiquidity: false,
    washTradingSuspected: false,
    honeypotSuspected: false
  };
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes));
}
