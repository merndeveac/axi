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
  buildLaserStreamSubscriptionRequest,
  buildManagedStreamSubscriptionProfile,
  buildYellowstoneSubscriptionRequest,
  createManagedStreamClient,
  createManagedStreamSubscriptionSummary,
  managedStreamClientReasonCodes,
  type ManagedStreamClientKind,
  type ManagedStreamClientStatus,
  type ManagedStreamSubscriptionProfileName,
  type ManagedStreamSubscriptionSummary
} from "@axi/managed-stream-clients";
import {
  createLiveTokenStateStore,
  type LiveTokenState,
  type LiveTokenStateStore
} from "@axi/live-state";
import { loadPumpfunFixture } from "@axi/pumpfun-decoder";
import { createMockTransactionEnvelopeFromFixture } from "@axi/stream-mock";
import {
  createDefaultSubscriptionConfig,
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
  apiKey?: string | undefined;
  maxReconnectAttempts?: number;
  reconnectBackoffMs?: number;
  transactionsEnabled?: boolean;
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

export type ManagedStreamPreviewProvider = "yellowstone" | "laserstream" | "mock";

export type ManagedStreamProviderStatusPreview = {
  provider: ManagedStreamProviderKind;
  enabled: boolean;
  configured: boolean;
  authConfigured: boolean;
  connectionState: string;
  commitment: ManagedStreamCommitment;
  subscribed: boolean;
  subscriptions: ManagedStreamSubscriptionConfig | null;
  receivedCount: number;
  transactionCount: number;
  accountCount: number;
  errorCount: number;
  lastMessageAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
};

export type ManagedStreamApiStatus = {
  managedStreamEnabled: boolean;
  provider: ManagedStreamProviderKind;
  clientKind: ManagedStreamClientKind;
  clientStatus: ManagedStreamClientStatus;
  providerStatus: ManagedStreamProviderStatusPreview;
  connectionState: string;
  configured: boolean;
  authConfigured: boolean;
  endpointMasked: string | null;
  authTokenMasked: string | null;
  subscriptionConfig: ManagedStreamSubscriptionConfig;
  subscriptionSummary: ManagedStreamSubscriptionSummary;
  receivedCount: number;
  transactionCount: number;
  errorCount: number;
  lastMessageAt: string | null;
  reasonCodes: string[];
  yellowstoneStatus: ManagedStreamClientStatus;
  laserstreamStatus: ManagedStreamClientStatus;
  paperOnly: true;
  tradingDisabled: true;
};

type NormalizedManagedStreamConfig = {
  enabled: boolean;
  provider: ManagedStreamProviderKind;
  commitment: ManagedStreamCommitment;
  endpoint: string | undefined;
  authToken: string | undefined;
  apiKey: string | undefined;
  maxReconnectAttempts: number;
  reconnectBackoffMs: number;
  transactionsEnabled: boolean;
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

export type ManagedStreamConfigPreview = {
  enabled: boolean;
  provider: ManagedStreamProviderKind;
  clientKind: ManagedStreamClientKind;
  clientStatus: ManagedStreamClientStatus;
  configured: boolean;
  authConfigured: boolean;
  endpointMasked: string | null;
  authTokenMasked: string | null;
  commitment: ManagedStreamCommitment;
  subscriptionSummary: ManagedStreamSubscriptionSummary;
  yellowstoneStatus: ManagedStreamClientStatus;
  laserstreamStatus: ManagedStreamClientStatus;
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

export type ManagedStreamBuildSubscriptionRequest = {
  provider?: ManagedStreamPreviewProvider | undefined;
  profile?: ManagedStreamSubscriptionProfileName | undefined;
  commitment?: ManagedStreamCommitment | undefined;
  includeProgram?: string[] | undefined;
  requiredAccount?: string[] | undefined;
  config?: {
    transactionAccountInclude?: string[] | undefined;
    transactionAccountRequired?: string[] | undefined;
    transactionAccountExclude?: string[] | undefined;
    includeVotes?: boolean | undefined;
    includeFailed?: boolean | undefined;
    transactionsEnabled?: boolean | undefined;
  } | undefined;
};

export type ManagedStreamSubscriptionPreview = {
  provider: ManagedStreamPreviewProvider;
  profile: ManagedStreamSubscriptionProfileName | null;
  request: Record<string, unknown>;
  subscriptionConfig: ManagedStreamSubscriptionConfig;
  subscriptionSummary: ManagedStreamSubscriptionSummary;
  endpointMasked: string | null;
  authConfigured: boolean;
  paperOnly: true;
  tradingDisabled: true;
  networkDisabled: true;
  reasonCodes: string[];
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
  getStreamConfig: () => ManagedStreamConfigPreview;
  buildStreamSubscriptionPreview: (
    request?: ManagedStreamBuildSubscriptionRequest
  ) => ManagedStreamSubscriptionPreview;
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
    getStreamConfig: () => createManagedStreamConfigPreview(streamConfig),
    buildStreamSubscriptionPreview: (request = {}) =>
      buildManagedStreamSubscriptionPreview(streamConfig, request),
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
    apiKey: input.apiKey,
    maxReconnectAttempts: input.maxReconnectAttempts ?? 10,
    reconnectBackoffMs: input.reconnectBackoffMs ?? 1000,
    transactionsEnabled: input.transactionsEnabled ?? true,
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
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config);
  const clientStatus = createClientStatus(config, subscriptionConfig);

  return {
    managedStreamEnabled: config.enabled,
    provider: config.provider,
    clientKind: clientStatus.kind,
    clientStatus,
    providerStatus: createProviderStatusPreview(
      config,
      subscriptionConfig,
      clientStatus
    ),
    connectionState: clientStatus.connectionState,
    configured: clientStatus.configured,
    authConfigured: clientStatus.authConfigured,
    endpointMasked: clientStatus.endpointMasked,
    authTokenMasked: clientStatus.authMasked,
    subscriptionConfig: sanitizeSubscriptionConfig(subscriptionConfig),
    subscriptionSummary: createManagedStreamSubscriptionSummary(subscriptionConfig),
    receivedCount: adapterStatus.envelopesReceived,
    transactionCount: adapterStatus.eventsProduced,
    errorCount: adapterStatus.decodeErrors,
    lastMessageAt: adapterStatus.lastEnvelopeAt,
    reasonCodes: uniqueStrings([
      "MANAGED_STREAM_FOUNDATION",
      "MANAGED_STREAM_CLIENT_SKELETON",
      streamReasonCodes.noNetworkInTests,
      ...(config.enabled ? [] : [streamReasonCodes.providerDisabled]),
      ...(config.provider === "mock" ? [streamReasonCodes.providerMock] : []),
      ...clientStatus.reasonCodes,
      "NO_TRADING"
    ]),
    yellowstoneStatus: createYellowstoneStatus(config),
    laserstreamStatus: createLaserStreamStatus(config),
    paperOnly: true,
    tradingDisabled: true
  };
}

function createManagedStreamConfigPreview(
  config: NormalizedManagedStreamConfig
): ManagedStreamConfigPreview {
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config);
  const clientStatus = createClientStatus(config, subscriptionConfig);

  return {
    enabled: config.enabled,
    provider: config.provider,
    clientKind: clientStatus.kind,
    clientStatus,
    configured: clientStatus.configured,
    authConfigured: clientStatus.authConfigured,
    endpointMasked: clientStatus.endpointMasked,
    authTokenMasked: clientStatus.authMasked,
    commitment: subscriptionConfig.commitment,
    subscriptionSummary: createManagedStreamSubscriptionSummary(subscriptionConfig),
    yellowstoneStatus: createYellowstoneStatus(config),
    laserstreamStatus: createLaserStreamStatus(config),
    paperOnly: true,
    tradingDisabled: true,
    reasonCodes: uniqueStrings([
      "MANAGED_STREAM_CLIENT_SKELETON",
      ...clientStatus.reasonCodes,
      "NO_TRADING"
    ])
  };
}

function buildManagedStreamSubscriptionPreview(
  config: NormalizedManagedStreamConfig,
  request: ManagedStreamBuildSubscriptionRequest = {}
): ManagedStreamSubscriptionPreview {
  const provider = request.provider ?? providerToPreviewProvider(config.provider);
  const baseConfig = createManagedStreamSubscriptionConfig(config, {
    provider,
    commitment: request.commitment,
    transactionAccountInclude:
      request.includeProgram ?? request.config?.transactionAccountInclude,
    transactionAccountExclude: request.config?.transactionAccountExclude,
    transactionAccountRequired:
      request.requiredAccount ?? request.config?.transactionAccountRequired,
    includeVotes: request.config?.includeVotes,
    includeFailed: request.config?.includeFailed,
    transactionsEnabled: request.config?.transactionsEnabled
  });
  const profileResult = request.profile
    ? buildManagedStreamSubscriptionProfile(request.profile, {
        provider,
        commitment: request.commitment ?? baseConfig.commitment,
        programIds:
          request.includeProgram ?? request.config?.transactionAccountInclude,
        watchedAddresses:
          request.requiredAccount ?? request.config?.transactionAccountRequired,
        baseConfig
      })
    : null;
  const subscriptionConfig = profileResult?.subscriptionConfig ?? baseConfig;

  assertManagedStreamFilterLimits(subscriptionConfig);

  const buildResult =
    provider === "yellowstone"
      ? buildYellowstoneSubscriptionRequest(subscriptionConfig)
      : provider === "laserstream"
        ? buildLaserStreamSubscriptionRequest(subscriptionConfig)
        : {
            request: {
              provider: "mock",
              subscription: sanitizeSubscriptionConfig(subscriptionConfig)
            },
            subscriptionConfig: sanitizeSubscriptionConfig(subscriptionConfig),
            subscriptionSummary:
              createManagedStreamSubscriptionSummary(subscriptionConfig),
            reasonCodes: [managedStreamClientReasonCodes.subscriptionBuilt]
          };

  return {
    provider,
    profile: request.profile ?? null,
    request: buildResult.request,
    subscriptionConfig: buildResult.subscriptionConfig,
    subscriptionSummary: profileResult?.subscriptionSummary ?? buildResult.subscriptionSummary,
    endpointMasked: maskStreamEndpoint(resolveManagedStreamEndpoint(config, provider)),
    authConfigured: resolveManagedStreamAuth(config, provider) !== undefined,
    paperOnly: true,
    tradingDisabled: true,
    networkDisabled: true,
    reasonCodes: uniqueStrings([
      ...buildResult.reasonCodes,
      ...(profileResult?.reasonCodes ?? []),
      "NO_NETWORK",
      "NO_TRADING"
    ])
  };
}

function createClientStatus(
  config: NormalizedManagedStreamConfig,
  subscriptionConfig: ManagedStreamSubscriptionConfig
): ManagedStreamClientStatus {
  return createManagedStreamClient({
    kind: providerToClientKind(config.provider),
    enabled: config.enabled,
    endpoint: resolveManagedStreamEndpoint(config, config.provider),
    authToken: resolveManagedStreamAuthToken(config, config.provider),
    apiKey: resolveManagedStreamApiKey(config, config.provider),
    commitment: config.commitment,
    subscriptionConfig
  }).getStatus();
}

function createYellowstoneStatus(
  config: NormalizedManagedStreamConfig
): ManagedStreamClientStatus {
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config, {
    provider: "yellowstone"
  });

  return createManagedStreamClient({
    kind: "yellowstone",
    enabled: config.yellowstoneEnabled,
    endpoint: config.yellowstoneEndpoint,
    authToken: config.yellowstoneAuthToken,
    commitment: subscriptionConfig.commitment,
    subscriptionConfig
  }).getStatus();
}

function createLaserStreamStatus(
  config: NormalizedManagedStreamConfig
): ManagedStreamClientStatus {
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config, {
    provider: "laserstream"
  });

  return createManagedStreamClient({
    kind: "laserstream",
    enabled: config.laserstreamEnabled,
    endpoint: config.laserstreamEndpoint,
    apiKey: config.laserstreamAuthToken,
    commitment: subscriptionConfig.commitment,
    subscriptionConfig
  }).getStatus();
}

function createProviderStatusPreview(
  config: NormalizedManagedStreamConfig,
  subscriptionConfig: ManagedStreamSubscriptionConfig,
  clientStatus: ManagedStreamClientStatus
): ManagedStreamProviderStatusPreview {
  return {
    provider: config.provider,
    enabled: config.enabled,
    configured: clientStatus.configured,
    authConfigured: clientStatus.authConfigured,
    connectionState: clientStatus.connectionState,
    commitment: subscriptionConfig.commitment,
    subscribed: clientStatus.subscribed,
    subscriptions: sanitizeSubscriptionConfig(subscriptionConfig),
    receivedCount: clientStatus.receivedCount,
    transactionCount: clientStatus.transactionCount,
    accountCount: clientStatus.accountCount,
    errorCount: clientStatus.errorCount,
    lastMessageAt: clientStatus.lastMessageAt,
    lastError: clientStatus.lastError,
    reasonCodes: clientStatus.reasonCodes
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
  config: NormalizedManagedStreamConfig,
  overrides: {
    provider?: ManagedStreamProviderKind | undefined;
    commitment?: ManagedStreamCommitment | undefined;
    transactionAccountInclude?: string[] | undefined;
    transactionAccountExclude?: string[] | undefined;
    transactionAccountRequired?: string[] | undefined;
    includeVotes?: boolean | undefined;
    includeFailed?: boolean | undefined;
    transactionsEnabled?: boolean | undefined;
  } = {}
): ManagedStreamSubscriptionConfig {
  const provider = overrides.provider ?? config.provider;
  const endpoint = resolveManagedStreamEndpoint(config, provider);

  return createDefaultSubscriptionConfig({
    provider,
    authConfigured: resolveManagedStreamAuth(config, provider) !== undefined,
    commitment: overrides.commitment ?? config.commitment,
    transactions: {
      enabled: overrides.transactionsEnabled ?? config.transactionsEnabled,
      accountInclude:
        overrides.transactionAccountInclude ?? config.transactionAccountInclude,
      accountExclude:
        overrides.transactionAccountExclude ?? config.transactionAccountExclude,
      accountRequired:
        overrides.transactionAccountRequired ?? config.transactionAccountRequired,
      vote: overrides.includeVotes ?? config.includeVotes,
      failed: overrides.includeFailed ?? config.includeFailed
    },
    maxReconnectAttempts: config.maxReconnectAttempts,
    reconnectBackoffMs: config.reconnectBackoffMs,
    ...(endpoint !== undefined ? { endpoint } : {})
  });
}

function resolveManagedStreamEndpoint(
  config: NormalizedManagedStreamConfig,
  provider: ManagedStreamProviderKind
): string | undefined {
  if (provider === "yellowstone" || provider === "geyser") {
    return config.endpoint ?? config.yellowstoneEndpoint;
  }

  if (provider === "laserstream") {
    return config.endpoint ?? config.laserstreamEndpoint;
  }

  return config.endpoint;
}

function resolveManagedStreamAuth(
  config: NormalizedManagedStreamConfig,
  provider: ManagedStreamProviderKind
): string | undefined {
  return (
    resolveManagedStreamAuthToken(config, provider) ??
    resolveManagedStreamApiKey(config, provider)
  );
}

function resolveManagedStreamAuthToken(
  config: NormalizedManagedStreamConfig,
  provider: ManagedStreamProviderKind
): string | undefined {
  if (provider === "yellowstone" || provider === "geyser") {
    return config.authToken ?? config.yellowstoneAuthToken;
  }

  if (provider === "laserstream") {
    return config.authToken;
  }

  return config.authToken;
}

function resolveManagedStreamApiKey(
  config: NormalizedManagedStreamConfig,
  provider: ManagedStreamProviderKind
): string | undefined {
  if (provider === "laserstream") {
    return config.apiKey ?? config.laserstreamAuthToken;
  }

  return config.apiKey;
}

function providerToClientKind(
  provider: ManagedStreamProviderKind
): ManagedStreamClientKind {
  if (provider === "yellowstone" || provider === "geyser") {
    return "yellowstone";
  }

  if (provider === "laserstream") {
    return "laserstream";
  }

  if (provider === "mock") {
    return "mock";
  }

  return "disabled";
}

function providerToPreviewProvider(
  provider: ManagedStreamProviderKind
): ManagedStreamPreviewProvider {
  if (provider === "laserstream") {
    return "laserstream";
  }

  if (provider === "mock") {
    return "mock";
  }

  return "yellowstone";
}

function assertManagedStreamFilterLimits(
  config: ManagedStreamSubscriptionConfig
): void {
  const filters = [
    config.transactions.accountInclude,
    config.transactions.accountExclude,
    config.transactions.accountRequired,
    config.accounts.owners,
    config.accounts.accounts
  ];

  for (const values of filters) {
    if (values.length > 100) {
      throw new Error("MANAGED_STREAM_FILTER_LIMIT_EXCEEDED");
    }
  }
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string"))
  );
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
