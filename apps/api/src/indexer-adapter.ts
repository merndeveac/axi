import type { FeedEvent, TokenCreatedEvent, TokenTradeEvent } from "@axi/data-feeds";
import { createInMemoryEventBus, type EventBus } from "@axi/event-bus";
import {
  createIndexerEventId,
  indexerReasonCodes,
  type NormalizedIndexerEvent,
  type NormalizedTokenTradeEvent
} from "@axi/indexer-core";
import {
  createManagedStreamAdapter,
  type ManagedStreamAdapter,
  type SanitizedStreamEnvelope
} from "@axi/managed-stream-adapter";
import {
  createLiveTokenStateStore,
  type LiveTokenState,
  type LiveTokenStateStore
} from "@axi/live-state";
import { loadPumpfunFixture } from "@axi/pumpfun-decoder";
import { createMockTransactionEnvelopeFromFixture } from "@axi/stream-mock";
import {
  createDefaultSubscriptionConfig,
  maskAuthToken,
  maskStreamEndpoint,
  streamReasonCodes,
  type ManagedStreamCommitment,
  type ManagedStreamProviderKind,
  type ManagedStreamSubscriptionConfig
} from "@axi/stream-core";
import { createTradeTimeseries, type TradeTimeseries } from "@axi/timeseries";

export type IndexerAdapterOptions = {
  enabled?: boolean;
  liveStateEnabled?: boolean;
  preferLiveStateCards?: boolean;
  recentEventLimit?: number;
  managedStream?: ManagedStreamAdapterConfig;
};

export type ManagedStreamAdapterConfig = {
  enabled?: boolean;
  provider?: ManagedStreamProviderKind;
  commitment?: ManagedStreamCommitment;
  endpoint?: string | undefined;
  authToken?: string | undefined;
  maxReconnectAttempts?: number;
  reconnectBackoffMs?: number;
  transactionAccountInclude?: string[];
  transactionAccountExclude?: string[];
  transactionAccountRequired?: string[];
  includeVotes?: boolean;
  includeFailed?: boolean;
  yellowstoneEnabled?: boolean;
  yellowstoneEndpoint?: string | undefined;
  yellowstoneAuthToken?: string | undefined;
  laserstreamEnabled?: boolean;
  laserstreamEndpoint?: string | undefined;
  laserstreamAuthToken?: string | undefined;
};

export type ManagedStreamApiStatus = {
  managedStreamEnabled: boolean;
  provider: ManagedStreamProviderKind;
  connectionState: string;
  configured: boolean;
  authConfigured: boolean;
  endpointMasked: string | null;
  authTokenMasked: string | null;
  subscriptionConfig: ManagedStreamSubscriptionConfig;
  receivedCount: number;
  transactionCount: number;
  errorCount: number;
  lastMessageAt: string | null;
  reasonCodes: string[];
  yellowstoneStatus: {
    enabled: boolean;
    configured: boolean;
    connectionState: "not_implemented";
    endpointMasked: string | null;
    authConfigured: boolean;
  };
  laserstreamStatus: {
    enabled: boolean;
    configured: boolean;
    connectionState: "not_implemented";
    endpointMasked: string | null;
    authConfigured: boolean;
  };
  paperOnly: true;
  tradingDisabled: true;
};

type NormalizedManagedStreamConfig = {
  enabled: boolean;
  provider: ManagedStreamProviderKind;
  commitment: ManagedStreamCommitment;
  endpoint: string | undefined;
  authToken: string | undefined;
  maxReconnectAttempts: number;
  reconnectBackoffMs: number;
  transactionAccountInclude: string[];
  transactionAccountExclude: string[];
  transactionAccountRequired: string[];
  includeVotes: boolean;
  includeFailed: boolean;
  yellowstoneEnabled: boolean;
  yellowstoneEndpoint: string | undefined;
  yellowstoneAuthToken: string | undefined;
  laserstreamEnabled: boolean;
  laserstreamEndpoint: string | undefined;
  laserstreamAuthToken: string | undefined;
};

export type IndexerAdapterStatus = {
  enabled: boolean;
  liveStateEnabled: boolean;
  preferLiveStateCards: boolean;
  source: "api_adapter";
  sourceMode: "local";
  eventBus: ReturnType<EventBus["getStats"]>;
  liveState: ReturnType<LiveTokenStateStore["getStats"]>;
  futureGeyser: {
    enabled: false;
    implemented: false;
    status: "not_implemented";
  };
  managedStream: ManagedStreamApiStatus;
  streamProvider: ManagedStreamProviderKind;
  streamEnabled: boolean;
  streamConnectionState: string;
  streamEnvelopeCount: number;
  streamEventCount: number;
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

export type IndexerAdapter = {
  ingestFeedEvent: (event: FeedEvent) => NormalizedIndexerEvent | undefined;
  ingestIndexerEvent: (event: NormalizedIndexerEvent) => void;
  publishMockStreamFixture: (fixture: string) => NormalizedIndexerEvent[];
  getLiveCards: () => LiveTokenState[];
  getRecentEvents: (limit?: number) => NormalizedIndexerEvent[];
  getRecentStreamEnvelopes: (limit?: number) => SanitizedStreamEnvelope[];
  getStatus: () => IndexerAdapterStatus;
  getStreamStatus: () => ManagedStreamApiStatus;
  getTimeseries: (mint: string) => {
    mint: string;
    windows: ReturnType<TradeTimeseries["getWindows"]>;
    rollingStats: ReturnType<TradeTimeseries["getRollingStats"]>;
  };
};

export function createIndexerAdapter(
  options: IndexerAdapterOptions = {}
): IndexerAdapter {
  const enabled = options.enabled ?? true;
  const liveStateEnabled = options.liveStateEnabled ?? true;
  const preferLiveStateCards = options.preferLiveStateCards ?? false;
  const bus = createInMemoryEventBus({
    recentEventLimit: options.recentEventLimit ?? 1000
  });
  const liveState = createLiveTokenStateStore();
  const timeseries = createTradeTimeseries();
  const streamConfig = normalizeManagedStreamConfig(options.managedStream);
  const streamAdapter = createManagedStreamAdapter({
    providerKind: streamConfig.provider,
    eventBus: bus,
    timeseries,
    maxRecentEvents: options.recentEventLimit ?? 1000,
    routeUnknownTransactions: true,
    enabledDecoders: {
      pumpfun: true
    },
    ...(liveStateEnabled ? { liveState } : {})
  });

  function ingestIndexerEvent(event: NormalizedIndexerEvent): void {
    if (!enabled) {
      return;
    }

    bus.publish(event);

    if (liveStateEnabled) {
      liveState.applyIndexerEvent(event);
    }

    if (event.type === "token_trade") {
      timeseries.ingestTrade(event);
    }
  }

  function publishMockStreamFixture(fixture: string): NormalizedIndexerEvent[] {
    const envelope = createMockTransactionEnvelopeFromFixture(
      loadPumpfunFixture(fixture),
      {
        commitment: streamConfig.commitment
      }
    );

    return streamAdapter.routeEnvelope(envelope);
  }

  return {
    ingestFeedEvent: (event) => {
      const indexerEvent = feedEventToIndexerEvent(event);

      if (indexerEvent) {
        ingestIndexerEvent(indexerEvent);
      }

      return indexerEvent;
    },
    ingestIndexerEvent,
    publishMockStreamFixture,
    getLiveCards: () => liveState.getLiveCards(),
    getRecentEvents: (limit) => bus.getRecentEvents(limit),
    getRecentStreamEnvelopes: (limit) => streamAdapter.getRecentEnvelopes(limit),
    getStatus: () => ({
      enabled,
      liveStateEnabled,
      preferLiveStateCards,
      source: "api_adapter",
      sourceMode: "local",
      eventBus: bus.getStats(),
      liveState: liveState.getStats(),
      futureGeyser: {
        enabled: false,
        implemented: false,
        status: "not_implemented"
      },
      managedStream: createManagedStreamApiStatus(streamConfig, streamAdapter),
      streamProvider: streamConfig.provider,
      streamEnabled: streamConfig.enabled,
      streamConnectionState: createManagedStreamApiStatus(streamConfig, streamAdapter)
        .connectionState,
      streamEnvelopeCount: streamAdapter.getAdapterStatus().envelopesReceived,
      streamEventCount: streamAdapter.getAdapterStatus().eventsProduced,
      paperOnly: true,
      tradingDisabled: true,
      reasonCodes: [
        "INDEXER_API_ADAPTER",
        "INDEXER_FOUNDATION_ONLY",
        "NO_GEYSER_CONNECTION",
        "MANAGED_STREAM_FOUNDATION",
        "NO_TRADING",
        ...(enabled ? [] : ["INDEXER_ADAPTER_DISABLED"]),
        ...(liveStateEnabled ? [] : ["INDEXER_LIVE_STATE_DISABLED"])
      ]
    }),
    getStreamStatus: () => createManagedStreamApiStatus(streamConfig, streamAdapter),
    getTimeseries: (mint) => ({
      mint,
      windows: timeseries.getWindows(mint),
      rollingStats: timeseries.getRollingStats(mint)
    })
  };
}

function normalizeManagedStreamConfig(
  input: ManagedStreamAdapterConfig = {}
): NormalizedManagedStreamConfig {
  return {
    enabled: input.enabled ?? false,
    provider: input.provider ?? "mock",
    commitment: input.commitment ?? "confirmed",
    endpoint: input.endpoint,
    authToken: input.authToken,
    maxReconnectAttempts: input.maxReconnectAttempts ?? 10,
    reconnectBackoffMs: input.reconnectBackoffMs ?? 1000,
    transactionAccountInclude: input.transactionAccountInclude ?? [],
    transactionAccountExclude: input.transactionAccountExclude ?? [],
    transactionAccountRequired: input.transactionAccountRequired ?? [],
    includeVotes: input.includeVotes ?? false,
    includeFailed: input.includeFailed ?? false,
    yellowstoneEnabled: input.yellowstoneEnabled ?? false,
    yellowstoneEndpoint: input.yellowstoneEndpoint,
    yellowstoneAuthToken: input.yellowstoneAuthToken,
    laserstreamEnabled: input.laserstreamEnabled ?? false,
    laserstreamEndpoint: input.laserstreamEndpoint,
    laserstreamAuthToken: input.laserstreamAuthToken
  };
}

function createManagedStreamApiStatus(
  config: NormalizedManagedStreamConfig,
  adapter: ManagedStreamAdapter
): ManagedStreamApiStatus {
  const adapterStatus = adapter.getAdapterStatus();
  const endpoint = resolveManagedStreamEndpoint(config);
  const authToken = resolveManagedStreamAuthToken(config);
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config);
  const placeholder =
    config.provider === "yellowstone" ||
    config.provider === "laserstream" ||
    config.provider === "geyser";

  return {
    managedStreamEnabled: config.enabled,
    provider: config.provider,
    connectionState: config.enabled
      ? placeholder
        ? "not_implemented"
        : "configured"
      : "disabled",
    configured: endpoint !== undefined || config.provider === "mock",
    authConfigured: authToken !== undefined,
    endpointMasked: maskStreamEndpoint(endpoint),
    authTokenMasked: maskAuthToken(authToken),
    subscriptionConfig: sanitizeSubscriptionConfig(subscriptionConfig),
    receivedCount: adapterStatus.envelopesReceived,
    transactionCount: adapterStatus.eventsProduced,
    errorCount: adapterStatus.decodeErrors,
    lastMessageAt: adapterStatus.lastEnvelopeAt,
    reasonCodes: [
      "MANAGED_STREAM_FOUNDATION",
      streamReasonCodes.noNetworkInTests,
      ...(config.enabled ? [] : [streamReasonCodes.providerDisabled]),
      ...(config.provider === "mock" ? [streamReasonCodes.providerMock] : []),
      ...(placeholder ? [streamReasonCodes.notImplemented] : []),
      "NO_TRADING"
    ],
    yellowstoneStatus: {
      enabled: config.yellowstoneEnabled,
      configured: config.yellowstoneEndpoint !== undefined,
      connectionState: "not_implemented",
      endpointMasked: maskStreamEndpoint(config.yellowstoneEndpoint),
      authConfigured: config.yellowstoneAuthToken !== undefined
    },
    laserstreamStatus: {
      enabled: config.laserstreamEnabled,
      configured: config.laserstreamEndpoint !== undefined,
      connectionState: "not_implemented",
      endpointMasked: maskStreamEndpoint(config.laserstreamEndpoint),
      authConfigured: config.laserstreamAuthToken !== undefined
    },
    paperOnly: true,
    tradingDisabled: true
  };
}

function sanitizeSubscriptionConfig(
  config: ManagedStreamSubscriptionConfig
): ManagedStreamSubscriptionConfig {
  const endpointMasked = maskStreamEndpoint(config.endpoint);

  return {
    ...config,
    transactions: {
      ...config.transactions,
      accountInclude: [...config.transactions.accountInclude],
      accountExclude: [...config.transactions.accountExclude],
      accountRequired: [...config.transactions.accountRequired]
    },
    accounts: {
      ...config.accounts,
      owners: [...config.accounts.owners],
      accounts: [...config.accounts.accounts]
    },
    slots: { ...config.slots },
    blocks: { ...config.blocks },
    ...(endpointMasked !== null ? { endpoint: endpointMasked } : {})
  };
}

function createManagedStreamSubscriptionConfig(
  config: NormalizedManagedStreamConfig
): ManagedStreamSubscriptionConfig {
  const endpoint = resolveManagedStreamEndpoint(config);

  return createDefaultSubscriptionConfig({
    provider: config.provider,
    authConfigured: resolveManagedStreamAuthToken(config) !== undefined,
    commitment: config.commitment,
    transactions: {
      enabled: true,
      accountInclude: config.transactionAccountInclude,
      accountExclude: config.transactionAccountExclude,
      accountRequired: config.transactionAccountRequired,
      vote: config.includeVotes,
      failed: config.includeFailed
    },
    maxReconnectAttempts: config.maxReconnectAttempts,
    reconnectBackoffMs: config.reconnectBackoffMs,
    ...(endpoint !== undefined ? { endpoint } : {})
  });
}

function resolveManagedStreamEndpoint(
  config: NormalizedManagedStreamConfig
): string | undefined {
  if (config.provider === "yellowstone" || config.provider === "geyser") {
    return config.endpoint ?? config.yellowstoneEndpoint;
  }

  if (config.provider === "laserstream") {
    return config.endpoint ?? config.laserstreamEndpoint;
  }

  return config.endpoint;
}

function resolveManagedStreamAuthToken(
  config: NormalizedManagedStreamConfig
): string | undefined {
  if (config.provider === "yellowstone" || config.provider === "geyser") {
    return config.authToken ?? config.yellowstoneAuthToken;
  }

  if (config.provider === "laserstream") {
    return config.authToken ?? config.laserstreamAuthToken;
  }

  return config.authToken;
}

export function feedEventToIndexerEvent(
  event: FeedEvent
): NormalizedIndexerEvent | undefined {
  if (event.type === "token_created") {
    return tokenCreatedFeedEventToIndexerEvent(event);
  }

  if (event.type === "trade") {
    return tokenTradeFeedEventToIndexerEvent(event);
  }

  return undefined;
}

function tokenCreatedFeedEventToIndexerEvent(
  event: TokenCreatedEvent
): NormalizedIndexerEvent {
  const receivedAt = event.receivedAt ?? event.timestamp;
  const sourceMode = normalizeSourceMode(event.dataSourceMode);
  const common = {
    schemaVersion: 1 as const,
    source: event.source,
    sourceMode,
    chain: "solana" as const,
    receivedAt,
    signature: event.signature ?? null,
    raw: event.raw,
    reasonCodes: [
      indexerReasonCodes.schemaV1,
      indexerReasonCodes.eventNormalized,
      ...sourceReasonCodes(event.source),
      ...(event.reasonCodes ?? [])
    ]
  };

  if (event.rawSourceEventType === "migration") {
    return {
      ...common,
      id: createIndexerEventId({
        type: "token_migrated",
        mint: event.candidate.mint,
        source: event.source,
        signature: event.signature ?? null,
        receivedAt
      }),
      type: "token_migrated",
      mint: event.candidate.mint,
      pool: readString(event.raw, "pool"),
      oldBondingCurve: event.bondingCurve ?? null,
      newPool: readString(event.raw, "newPool"),
      migrationSource: event.source
    };
  }

  return {
    ...common,
    id: createIndexerEventId({
      type: "token_created",
      mint: event.candidate.mint,
      source: event.source,
      signature: event.signature ?? null,
      receivedAt
    }),
    type: "token_created",
    mint: event.candidate.mint,
    name: event.candidate.name ?? null,
    symbol: event.candidate.symbol ?? null,
    metadataUri: event.candidate.metadataUri ?? null,
    creator: event.creator ?? event.candidate.creator ?? null,
    bondingCurve: event.bondingCurve ?? null,
    associatedBondingCurve: readString(event.raw, "associatedBondingCurve"),
    initialBuySol: readNumber(event.raw, "initialBuySol"),
    marketCapSol: readNumber(event.raw, "marketCapSol")
  };
}

function tokenTradeFeedEventToIndexerEvent(
  event: TokenTradeEvent
): NormalizedTokenTradeEvent {
  const receivedAt = event.receivedAt ?? event.timestamp;
  const usableForMetrics = event.usableForMetrics === true;

  return {
    id: createIndexerEventId({
      type: "token_trade",
      mint: event.mint,
      source: event.source,
      signature: event.signature ?? null,
      receivedAt
    }),
    schemaVersion: 1,
    source: event.source,
    sourceMode: normalizeSourceMode(event.dataSourceMode),
    chain: "solana",
    receivedAt,
    signature: event.signature ?? null,
    raw: event.raw,
    reasonCodes: [
      indexerReasonCodes.schemaV1,
      indexerReasonCodes.eventNormalized,
      ...(usableForMetrics
        ? [indexerReasonCodes.eventUsableForMetrics]
        : [indexerReasonCodes.eventUnusableForMetrics]),
      ...sourceReasonCodes(event.source),
      ...(event.reasonCodes ?? [])
    ],
    type: "token_trade",
    mint: event.mint,
    side: event.side,
    trader: event.trader ?? null,
    priceSol: event.priceSol ?? null,
    priceUsd: event.priceUsd ?? null,
    volumeSol: event.volumeSol ?? null,
    volumeUsd: event.volumeUsd ?? null,
    tokenAmount: event.tokenAmount ?? null,
    pool: readString(event.raw, "pool"),
    bondingCurve: event.bondingCurve ?? null,
    confidence: event.confidence ?? "low",
    usableForMetrics
  };
}

function normalizeSourceMode(value: unknown): "mock" | "real" | "replay" | "local" | "unknown" {
  return value === "mock" || value === "real" || value === "replay"
    ? value
    : "unknown";
}

function sourceReasonCodes(source: string): string[] {
  if (source === "mock") {
    return [indexerReasonCodes.sourceMock];
  }

  if (source === "pumpportal") {
    return [indexerReasonCodes.sourcePumpPortal];
  }

  return [];
}

function readString(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumber(raw: unknown, key: string): number | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = (raw as Record<string, unknown>)[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
