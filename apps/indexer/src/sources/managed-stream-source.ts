import {
  createManagedStreamAdapter,
  type ManagedStreamAdapterStatus,
  type SanitizedStreamEnvelope
} from "@axi/managed-stream-adapter";
import type { NormalizedIndexerEvent } from "@axi/indexer-core";
import {
  createMockManagedStreamProvider
} from "@axi/stream-mock";
import {
  createDefaultSubscriptionConfig,
  createDisabledStreamProvider,
  createNotImplementedProvider,
  maskAuthToken,
  maskStreamEndpoint,
  streamReasonCodes,
  type ManagedStreamProvider,
  type ManagedStreamProviderStatus,
  type ManagedStreamSubscriptionConfig
} from "@axi/stream-core";
import type { IndexerConfig } from "../config";

export type ManagedStreamSourceSummary = {
  envelopeCount: number;
  normalizedEventCount: number;
  eventsByType: ManagedStreamAdapterStatus["eventsByType"];
  unknownEvents: number;
  decodeErrors: number;
  providerStatus: ManagedStreamProviderStatus;
  adapterStatus: ManagedStreamAdapterStatus;
  subscriptionConfig: ManagedStreamSubscriptionConfig;
  endpointMasked: string | null;
  authTokenMasked: string | null;
  recentEnvelopes: SanitizedStreamEnvelope[];
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
  reasonCodes: string[];
};

export type ManagedStreamSource = {
  name: "managed-stream";
  getSummary: () => ManagedStreamSourceSummary;
  start: (handler: (event: NormalizedIndexerEvent) => void) => void;
  stop: () => void;
};

export function createManagedStreamSource(config: IndexerConfig): ManagedStreamSource {
  const provider = createProvider(config);
  const adapter = createManagedStreamAdapter({
    providerKind: config.MANAGED_STREAM_PROVIDER,
    maxRecentEvents: config.INDEXER_RECENT_EVENT_LIMIT,
    routeUnknownTransactions: true,
    enabledDecoders: {
      pumpfun: true
    }
  });
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config);
  let unsubscribe: (() => void) | null = null;

  return {
    name: "managed-stream",
    getSummary: () =>
      createManagedStreamSourceSummary({
        adapterStatus: adapter.getAdapterStatus(),
        config,
        providerStatus: provider.getStatus(),
        recentEnvelopes: adapter.getRecentEnvelopes(),
        subscriptionConfig
      }),
    start: (handler) => {
      unsubscribe?.();
      unsubscribe = provider.onEnvelope((envelope) => {
        for (const event of adapter.routeEnvelope(envelope)) {
          handler(event);
        }
      });
      provider.subscribe(subscriptionConfig);
      provider.start();
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = null;
      provider.stop();
    }
  };
}

export function createManagedStreamSubscriptionConfig(
  config: IndexerConfig
): ManagedStreamSubscriptionConfig {
  const endpoint = resolveProviderEndpoint(config);

  return createDefaultSubscriptionConfig({
    provider: config.MANAGED_STREAM_PROVIDER,
    authConfigured: isAuthConfigured(config),
    commitment: config.MANAGED_STREAM_COMMITMENT,
    transactions: {
      enabled: config.MANAGED_STREAM_TRANSACTIONS_ENABLED,
      accountInclude: config.MANAGED_STREAM_TRANSACTION_ACCOUNT_INCLUDE,
      accountExclude: config.MANAGED_STREAM_TRANSACTION_ACCOUNT_EXCLUDE,
      accountRequired: config.MANAGED_STREAM_TRANSACTION_ACCOUNT_REQUIRED,
      vote: config.MANAGED_STREAM_INCLUDE_VOTES,
      failed: config.MANAGED_STREAM_INCLUDE_FAILED
    },
    maxReconnectAttempts: config.MANAGED_STREAM_MAX_RECONNECT_ATTEMPTS,
    reconnectBackoffMs: config.MANAGED_STREAM_RECONNECT_BACKOFF_MS,
    ...(endpoint !== undefined ? { endpoint } : {})
  });
}

export function createManagedStreamStatusFromConfig(
  config: IndexerConfig
): ManagedStreamSourceSummary {
  const provider = createProvider(config);
  const adapterStatus = createManagedStreamAdapter({
    providerKind: config.MANAGED_STREAM_PROVIDER
  }).getAdapterStatus();
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config);

  return createManagedStreamSourceSummary({
    adapterStatus,
    config,
    providerStatus: provider.getStatus(),
    recentEnvelopes: [],
    subscriptionConfig
  });
}

function createManagedStreamSourceSummary(input: {
  adapterStatus: ManagedStreamAdapterStatus;
  config: IndexerConfig;
  providerStatus: ManagedStreamProviderStatus;
  recentEnvelopes: SanitizedStreamEnvelope[];
  subscriptionConfig: ManagedStreamSubscriptionConfig;
}): ManagedStreamSourceSummary {
  return {
    envelopeCount: input.adapterStatus.envelopesReceived,
    normalizedEventCount: input.adapterStatus.eventsProduced,
    eventsByType: input.adapterStatus.eventsByType,
    unknownEvents: input.adapterStatus.unknownEvents,
    decodeErrors: input.adapterStatus.decodeErrors,
    providerStatus: input.providerStatus,
    adapterStatus: input.adapterStatus,
    subscriptionConfig: sanitizeSubscriptionConfig(input.subscriptionConfig),
    endpointMasked: maskStreamEndpoint(resolveProviderEndpoint(input.config)),
    authTokenMasked: maskAuthToken(resolveProviderAuthToken(input.config)),
    recentEnvelopes: input.recentEnvelopes,
    yellowstoneStatus: {
      enabled: input.config.YELLOWSTONE_ENABLED,
      configured: input.config.YELLOWSTONE_GRPC_URL !== undefined,
      connectionState: "not_implemented",
      endpointMasked: maskStreamEndpoint(input.config.YELLOWSTONE_GRPC_URL),
      authConfigured: input.config.YELLOWSTONE_GRPC_TOKEN !== undefined
    },
    laserstreamStatus: {
      enabled: input.config.LASERSTREAM_ENABLED,
      configured: input.config.LASERSTREAM_GRPC_URL !== undefined,
      connectionState: "not_implemented",
      endpointMasked: maskStreamEndpoint(input.config.LASERSTREAM_GRPC_URL),
      authConfigured: input.config.LASERSTREAM_API_KEY !== undefined
    },
    paperOnly: true,
    tradingDisabled: true,
    reasonCodes: [
      "MANAGED_STREAM_SOURCE",
      streamReasonCodes.noNetworkInTests,
      ...(input.config.MANAGED_STREAM_ENABLED
        ? []
        : [streamReasonCodes.providerDisabled]),
      ...(input.config.MANAGED_STREAM_PROVIDER === "mock"
        ? [streamReasonCodes.providerMock]
        : []),
      ...(input.config.MANAGED_STREAM_PROVIDER === "yellowstone" ||
      input.config.MANAGED_STREAM_PROVIDER === "geyser"
        ? [streamReasonCodes.providerYellowstone, streamReasonCodes.notImplemented]
        : []),
      ...(input.config.MANAGED_STREAM_PROVIDER === "laserstream"
        ? [streamReasonCodes.providerLaserStream, streamReasonCodes.notImplemented]
        : []),
      "NO_TRADING"
    ]
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

function createProvider(config: IndexerConfig): ManagedStreamProvider {
  if (!config.MANAGED_STREAM_ENABLED) {
    return createDisabledStreamProvider(config.MANAGED_STREAM_PROVIDER);
  }

  if (config.MANAGED_STREAM_PROVIDER === "mock") {
    return createMockManagedStreamProvider({
      scenario: "pumpfun_basic",
      commitment: config.MANAGED_STREAM_COMMITMENT
    });
  }

  return createNotImplementedProvider(config.MANAGED_STREAM_PROVIDER);
}

function resolveProviderEndpoint(config: IndexerConfig): string | undefined {
  if (config.MANAGED_STREAM_PROVIDER === "yellowstone") {
    return config.MANAGED_STREAM_ENDPOINT ?? config.YELLOWSTONE_GRPC_URL;
  }

  if (config.MANAGED_STREAM_PROVIDER === "laserstream") {
    return config.MANAGED_STREAM_ENDPOINT ?? config.LASERSTREAM_GRPC_URL;
  }

  return config.MANAGED_STREAM_ENDPOINT;
}

function resolveProviderAuthToken(config: IndexerConfig): string | undefined {
  if (config.MANAGED_STREAM_PROVIDER === "yellowstone") {
    return config.MANAGED_STREAM_AUTH_TOKEN ?? config.YELLOWSTONE_GRPC_TOKEN;
  }

  if (config.MANAGED_STREAM_PROVIDER === "laserstream") {
    return config.MANAGED_STREAM_AUTH_TOKEN ?? config.LASERSTREAM_API_KEY;
  }

  return config.MANAGED_STREAM_AUTH_TOKEN;
}

function isAuthConfigured(config: IndexerConfig): boolean {
  return resolveProviderAuthToken(config) !== undefined;
}
