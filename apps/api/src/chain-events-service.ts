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
import type { RiskFlags, RollingMetrics } from "@axi/shared";
import {
  getChainTradeEvent,
  getChainTransactionEvent,
  listChainTradeEvents,
  listChainTransactionEvents,
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

  getWatchedAddresses(): WatchedAddress[] {
    return this.registry.list();
  }

  getRecentChainEvents(limit = 50): ReturnType<typeof listChainTransactionEvents> {
    return listChainTransactionEvents(limit);
  }

  getRecentChainTradeEvents(limit = 50): ReturnType<typeof listChainTradeEvents> {
    return listChainTradeEvents(limit);
  }

  getChainTransactionEvent(signature: string): ReturnType<typeof getChainTransactionEvent> {
    return getChainTransactionEvent(signature);
  }

  getChainTradeEvent(signature: string): ReturnType<typeof getChainTradeEvent> {
    return getChainTradeEvent(signature);
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
  }

  private handleTradeEvent(event: NormalizedChainTradeEvent): void {
    saveChainTradeEvent(event);
    const feedEvent = convertChainTradeToFeedEvent(event);

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

function convertChainTradeToFeedEvent(
  event: NormalizedChainTradeEvent
): TokenTradeEvent | null {
  if (event.confidence === "low") {
    return null;
  }

  if (event.side === "unknown") {
    return null;
  }

  if (
    event.priceUsd === null ||
    event.priceUsd === undefined ||
    event.volumeUsd === null ||
    event.volumeUsd === undefined ||
    !Number.isFinite(event.priceUsd) ||
    !Number.isFinite(event.volumeUsd)
  ) {
    return null;
  }

  const priceUsd = event.priceUsd;
  const volumeUsd = event.volumeUsd;
  const side = event.side;
  const metrics = createMetricsFromChainTrade({
    ...event,
    priceUsd,
    volumeUsd,
    side
  });
  const riskFlags = createSafeRiskFlags();

  return {
    type: "trade",
    mint: event.mint,
    source: "solana_rpc",
    ...(event.symbol ? { symbol: event.symbol } : {}),
    ...(event.name ? { name: event.name } : {}),
    token: {
      chain: "solana",
      mint: event.mint
    },
    side: event.side,
    priceUsd,
    volumeUsd,
    ...(event.tokenAmount !== null && event.tokenAmount !== undefined
      ? { tokenAmount: event.tokenAmount }
      : {}),
    ...(event.trader ? { trader: event.trader } : {}),
    signature: event.signature,
    metrics,
    metricsComplete: true,
    raw: event,
    rawSourceEventType: "chain_trade",
    reasonCodes: [
      "CHAIN_TRADE_EVENT",
      event.confidence === "high"
        ? "CHAIN_EVENT_HIGH_CONFIDENCE"
        : "CHAIN_EVENT_MEDIUM_CONFIDENCE",
      ...event.reasonCodes
    ],
    receivedAt: event.timestamp,
    riskFlags,
    timestamp: event.timestamp
  };
}

function createMetricsFromChainTrade(
  event: NormalizedChainTradeEvent & {
    priceUsd: number;
    volumeUsd: number;
    side: "buy" | "sell";
  }
): RollingMetrics {
  return {
    priceUsd: event.priceUsd,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: event.volumeUsd,
    volume5mUsd: event.volumeUsd,
    volume15mUsd: event.volumeUsd,
    buyCount1m: event.side === "buy" ? 1 : 0,
    buyCount5m: event.side === "buy" ? 1 : 0,
    sellCount1m: event.side === "sell" ? 1 : 0,
    sellCount5m: event.side === "sell" ? 1 : 0,
    uniqueBuyers1m: event.side === "buy" ? 1 : 0,
    uniqueBuyers5m: event.side === "buy" ? 1 : 0,
    uniqueSellers1m: event.side === "sell" ? 1 : 0,
    uniqueSellers5m: event.side === "sell" ? 1 : 0,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: 0,
    priceChange5mPct: 0,
    volumeVelocity: 0,
    buyerVelocity: 0
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
