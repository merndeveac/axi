import {
  createManagedStreamAdapter,
  type ManagedStreamAdapterStatus,
  type SanitizedStreamEnvelope
} from "@axi/managed-stream-adapter";
import {
  buildLaserStreamSubscriptionRequest,
  buildManagedStreamSubscriptionProfile,
  buildYellowstoneSubscriptionRequest,
  createLaserStreamRealClient,
  createManagedStreamClient,
  createManagedStreamSubscriptionSummary,
  evaluateLaserStreamRealReadiness,
  managedStreamClientReasonCodes,
  type LaserStreamRealConnectionOptions,
  type LaserStreamRealReadiness,
  type ManagedStreamClientKind,
  type ManagedStreamClientStatus,
  type ManagedStreamSubscriptionProfileName,
  type ManagedStreamSubscriptionSummary
} from "@axi/managed-stream-clients";
import type { NormalizedIndexerEvent } from "@axi/indexer-core";
import { createMockManagedStreamProvider } from "@axi/stream-mock";
import {
  createDefaultSubscriptionConfig,
  createDisabledStreamProvider,
  createNotImplementedProvider,
  maskAuthToken,
  maskStreamEndpoint,
  streamReasonCodes,
  type ManagedStreamCommitment,
  type ManagedStreamProvider,
  type ManagedStreamProviderKind,
  type ManagedStreamProviderStatus,
  type ManagedStreamSubscriptionConfig
} from "@axi/stream-core";
import type { IndexerConfig } from "../config";

export type ManagedStreamPreviewProvider = "yellowstone" | "laserstream" | "mock";

export type ManagedStreamSourceSummary = {
  envelopeCount: number;
  normalizedEventCount: number;
  eventsByType: ManagedStreamAdapterStatus["eventsByType"];
  unknownEvents: number;
  decodeErrors: number;
  clientKind: ManagedStreamClientKind;
  clientStatus: ManagedStreamClientStatus;
  providerStatus: ManagedStreamProviderStatus;
  adapterStatus: ManagedStreamAdapterStatus;
  subscriptionConfig: ManagedStreamSubscriptionConfig;
  subscriptionSummary: ManagedStreamSubscriptionSummary;
  endpointMasked: string | null;
  authTokenMasked: string | null;
  recentEnvelopes: SanitizedStreamEnvelope[];
  yellowstoneStatus: ManagedStreamClientStatus;
  laserstreamStatus: ManagedStreamClientStatus;
  realReadiness: LaserStreamRealReadiness;
  connectionBlockedReasons: string[];
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
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
  realReadiness: LaserStreamRealReadiness;
  connectionBlockedReasons: string[];
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

export type ManagedStreamConnectCheckResult = {
  provider: "laserstream";
  wouldConnect: boolean;
  readiness: LaserStreamRealReadiness;
  paperOnly: true;
  tradingDisabled: true;
  networkConnected: false;
  reasonCodes: string[];
};

export type ManagedStreamLaserStreamConnectResult = {
  provider: "laserstream";
  attempted: boolean;
  connected: boolean;
  messageCount: number;
  decodedEventCount: number;
  liveTokenCount: number;
  errorCount: number;
  lastMessageAt: string | null;
  readiness: LaserStreamRealReadiness;
  clientStatus: ManagedStreamClientStatus;
  adapterStatus: ManagedStreamAdapterStatus;
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

export type ManagedStreamBuildSubscriptionOptions = {
  provider?: ManagedStreamPreviewProvider | undefined;
  json?: boolean | undefined;
  includeProgram?: string[] | undefined;
  requiredAccount?: string[] | undefined;
  commitment?: ManagedStreamCommitment | undefined;
  profile?: ManagedStreamSubscriptionProfileName | undefined;
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

export type ManagedStreamSource = {
  name: "managed-stream";
  getSummary: () => ManagedStreamSourceSummary;
  start: (handler: (event: NormalizedIndexerEvent) => void) => void;
  stop: () => void;
};

const maxManagedStreamFilterValues = 100;

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
  config: IndexerConfig,
  overrides: {
    provider?: ManagedStreamProviderKind | undefined;
    commitment?: ManagedStreamCommitment | undefined;
    includeProgram?: string[] | undefined;
    requiredAccount?: string[] | undefined;
  } = {}
): ManagedStreamSubscriptionConfig {
  const provider = overrides.provider ?? config.MANAGED_STREAM_PROVIDER;
  const endpoint = resolveProviderEndpoint(config, provider);
  const accountInclude =
    overrides.includeProgram ?? resolveTransactionAccountInclude(config, provider);
  const accountRequired =
    overrides.requiredAccount ?? resolveTransactionAccountRequired(config, provider);

  return createDefaultSubscriptionConfig({
    provider,
    authConfigured: resolveProviderAuth(config, provider) !== undefined,
    commitment: overrides.commitment ?? resolveProviderCommitment(config, provider),
    transactions: {
      enabled: resolveTransactionsEnabled(config, provider),
      accountInclude,
      accountExclude: resolveTransactionAccountExclude(config, provider),
      accountRequired,
      vote: resolveIncludeVotes(config, provider),
      failed: resolveIncludeFailed(config, provider)
    },
    maxReconnectAttempts: resolveMaxReconnectAttempts(config, provider),
    reconnectBackoffMs: resolveReconnectBackoffMs(config, provider),
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

export function createManagedStreamConfigPreview(
  config: IndexerConfig
): ManagedStreamConfigPreview {
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config);
  const clientStatus = createClientStatus(config, subscriptionConfig);
  const realReadiness = createLaserStreamRealReadiness(config);

  return {
    enabled: config.MANAGED_STREAM_ENABLED,
    provider: config.MANAGED_STREAM_PROVIDER,
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
    realReadiness,
    connectionBlockedReasons: realReadiness.connectionBlockedReasons,
    paperOnly: true,
    tradingDisabled: true,
    reasonCodes: uniqueStrings([
      "MANAGED_STREAM_CLIENT_SKELETON",
      ...clientStatus.reasonCodes,
      ...realReadiness.reasonCodes,
      "NO_TRADING"
    ])
  };
}

export function buildManagedStreamSubscriptionPreview(
  config: IndexerConfig,
  options: ManagedStreamBuildSubscriptionOptions = {}
): ManagedStreamSubscriptionPreview {
  const provider =
    options.provider ?? providerToPreviewProvider(config.MANAGED_STREAM_PROVIDER);
  const baseConfig = createManagedStreamSubscriptionConfig(config, {
    provider,
    commitment: options.commitment,
    includeProgram: options.includeProgram,
    requiredAccount: options.requiredAccount
  });
  const profileResult = options.profile
    ? buildManagedStreamSubscriptionProfile(options.profile, {
        provider,
        commitment: options.commitment ?? baseConfig.commitment,
        programIds:
          options.includeProgram ?? resolveProfileProgramIds(config, options.profile),
        watchedAddresses: options.requiredAccount,
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
    profile: options.profile ?? null,
    request: buildResult.request,
    subscriptionConfig: buildResult.subscriptionConfig,
    subscriptionSummary: profileResult?.subscriptionSummary ?? buildResult.subscriptionSummary,
    endpointMasked: maskStreamEndpoint(resolveProviderEndpoint(config, provider)),
    authConfigured: resolveProviderAuth(config, provider) !== undefined,
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

export function parseManagedStreamBuildSubscriptionArgs(
  args: string[]
): ManagedStreamBuildSubscriptionOptions {
  const options: ManagedStreamBuildSubscriptionOptions = {
    json: true,
    includeProgram: [],
    requiredAccount: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--provider") {
      options.provider = parsePreviewProvider(readArgValue(args, (index += 1), arg));
      continue;
    }

    if (arg === "--json") {
      options.json = parseBoolean(readArgValue(args, (index += 1), arg));
      continue;
    }

    if (arg === "--include-program") {
      options.includeProgram = [
        ...(options.includeProgram ?? []),
        readArgValue(args, (index += 1), arg)
      ];
      continue;
    }

    if (arg === "--required-account") {
      options.requiredAccount = [
        ...(options.requiredAccount ?? []),
        readArgValue(args, (index += 1), arg)
      ];
      continue;
    }

    if (arg === "--commitment") {
      options.commitment = parseCommitment(readArgValue(args, (index += 1), arg));
      continue;
    }

    if (arg === "--profile") {
      options.profile = parseProfile(readArgValue(args, (index += 1), arg));
      continue;
    }

    throw new Error(`Unknown managed stream option: ${arg ?? ""}`);
  }

  return options;
}

export function runManagedStreamConfigCli(
  config: IndexerConfig,
  args: string[] = []
): ManagedStreamConfigPreview {
  const json = parseJsonOption(args);
  const preview = createManagedStreamConfigPreview(config);

  if (json) {
    console.log(JSON.stringify(preview, null, 2));
  } else {
    console.log(
      [
        `provider=${preview.provider}`,
        `clientKind=${preview.clientKind}`,
        `enabled=${String(preview.enabled)}`,
        `configured=${String(preview.configured)}`,
        `authConfigured=${String(preview.authConfigured)}`,
        `connectionState=${preview.clientStatus.connectionState}`,
        `endpointMasked=${preview.endpointMasked ?? ""}`
      ].join("\n")
    );
  }

  return preview;
}

export function runManagedStreamBuildSubscriptionCli(
  config: IndexerConfig,
  args: string[] = []
): ManagedStreamSubscriptionPreview {
  const options = parseManagedStreamBuildSubscriptionArgs(args);
  const preview = buildManagedStreamSubscriptionPreview(config, options);

  if (options.json ?? true) {
    console.log(JSON.stringify(preview, null, 2));
  } else {
    console.log(
      [
        `provider=${preview.provider}`,
        `profile=${preview.profile ?? ""}`,
        `commitment=${preview.subscriptionSummary.commitment}`,
        `transactions=${String(preview.subscriptionSummary.transactionsEnabled)}`,
        `includePrograms=${String(
          preview.subscriptionSummary.transactionAccountIncludeCount
        )}`,
        `requiredAccounts=${String(
          preview.subscriptionSummary.transactionAccountRequiredCount
        )}`
      ].join("\n")
    );
  }

  return preview;
}

export function runManagedStreamConnectCheckCli(
  config: IndexerConfig,
  args: string[] = []
): ManagedStreamConnectCheckResult {
  const json = parseJsonOption(args);
  const readiness = createLaserStreamRealReadiness(config);
  const result: ManagedStreamConnectCheckResult = {
    provider: "laserstream",
    wouldConnect: readiness.canConnect,
    readiness,
    paperOnly: true,
    tradingDisabled: true,
    networkConnected: false,
    reasonCodes: uniqueStrings([
      ...readiness.reasonCodes,
      ...(readiness.canConnect ? [] : ["NO_NETWORK"])
    ])
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      [
        `provider=${result.provider}`,
        `wouldConnect=${String(result.wouldConnect)}`,
        `endpointMasked=${readiness.endpointMasked ?? ""}`,
        `missing=${readiness.missingRequirements.join(",")}`,
        `reasons=${result.reasonCodes.join(",")}`
      ].join("\n")
    );
  }

  return result;
}

export async function runManagedStreamLaserStreamConnectCli(
  config: IndexerConfig,
  args: string[] = []
): Promise<ManagedStreamLaserStreamConnectResult> {
  const json = parseJsonOption(args);
  const readiness = createLaserStreamRealReadiness(config);
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config, {
    provider: "laserstream"
  });
  const client = createLaserStreamRealClient(
    createLaserStreamRealOptions(config, subscriptionConfig)
  );
  const adapter = createManagedStreamAdapter({
    providerKind: "laserstream",
    routeUnknownTransactions: true,
    enabledDecoders: {
      pumpfun: true
    }
  });
  const liveMints = new Set<string>();

  client.onEnvelope((envelope) => {
    for (const event of adapter.routeEnvelope(envelope)) {
      if ("mint" in event && typeof event.mint === "string") {
        liveMints.add(event.mint);
      }
    }
  });

  if (readiness.canConnect) {
    await client.subscribe(subscriptionConfig);
    await client.start();
    await waitForLaserStreamSession(
      client,
      config.LASERSTREAM_MAX_RUNTIME_MS + 1000
    );
  }

  const clientStatus = client.getStatus();
  const adapterStatus = adapter.getAdapterStatus();
  const result: ManagedStreamLaserStreamConnectResult = {
    provider: "laserstream",
    attempted: readiness.canConnect,
    connected: clientStatus.connectionState === "connected",
    messageCount: clientStatus.receivedCount,
    decodedEventCount: adapterStatus.eventsProduced,
    liveTokenCount: liveMints.size,
    errorCount: clientStatus.errorCount + adapterStatus.decodeErrors,
    lastMessageAt: clientStatus.lastMessageAt,
    readiness,
    clientStatus,
    adapterStatus,
    paperOnly: true,
    tradingDisabled: true,
    reasonCodes: uniqueStrings([
      ...readiness.reasonCodes,
      ...clientStatus.reasonCodes,
      ...(readiness.canConnect ? [] : ["NO_NETWORK"]),
      "NO_TRADING"
    ])
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      [
        `provider=${result.provider}`,
        `attempted=${String(result.attempted)}`,
        `connected=${String(result.connected)}`,
        `messages=${String(result.messageCount)}`,
        `decodedEvents=${String(result.decodedEventCount)}`,
        `liveTokens=${String(result.liveTokenCount)}`,
        `errors=${String(result.errorCount)}`,
        `lastMessageAt=${result.lastMessageAt ?? ""}`,
        `reasons=${result.reasonCodes.join(",")}`
      ].join("\n")
    );
  }

  return result;
}

function createManagedStreamSourceSummary(input: {
  adapterStatus: ManagedStreamAdapterStatus;
  config: IndexerConfig;
  providerStatus: ManagedStreamProviderStatus;
  recentEnvelopes: SanitizedStreamEnvelope[];
  subscriptionConfig: ManagedStreamSubscriptionConfig;
}): ManagedStreamSourceSummary {
  const clientStatus = createClientStatus(input.config, input.subscriptionConfig);
  const realReadiness = createLaserStreamRealReadiness(input.config);
  const endpointMasked = maskStreamEndpoint(
    resolveProviderEndpoint(input.config, input.config.MANAGED_STREAM_PROVIDER)
  );
  const authTokenMasked = maskAuthToken(
    resolveProviderAuth(input.config, input.config.MANAGED_STREAM_PROVIDER)
  );

  return {
    envelopeCount: input.adapterStatus.envelopesReceived,
    normalizedEventCount: input.adapterStatus.eventsProduced,
    eventsByType: input.adapterStatus.eventsByType,
    unknownEvents: input.adapterStatus.unknownEvents,
    decodeErrors: input.adapterStatus.decodeErrors,
    clientKind: clientStatus.kind,
    clientStatus,
    providerStatus: input.providerStatus,
    adapterStatus: input.adapterStatus,
    subscriptionConfig: sanitizeSubscriptionConfig(input.subscriptionConfig),
    subscriptionSummary: createManagedStreamSubscriptionSummary(
      input.subscriptionConfig
    ),
    endpointMasked,
    authTokenMasked,
    recentEnvelopes: input.recentEnvelopes,
    yellowstoneStatus: createYellowstoneStatus(input.config),
    laserstreamStatus: createLaserStreamStatus(input.config),
    realReadiness,
    connectionBlockedReasons: realReadiness.connectionBlockedReasons,
    paperOnly: true,
    tradingDisabled: true,
    reasonCodes: uniqueStrings([
      "MANAGED_STREAM_SOURCE",
      "MANAGED_STREAM_CLIENT_SKELETON",
      streamReasonCodes.noNetworkInTests,
      ...clientStatus.reasonCodes,
      ...input.providerStatus.reasonCodes,
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
        ? [
            streamReasonCodes.providerLaserStream,
            ...(realReadiness.canConnect ? [] : realReadiness.reasonCodes)
          ]
        : []),
      "NO_TRADING"
    ])
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

  if (config.MANAGED_STREAM_PROVIDER === "laserstream") {
    return clientToProvider(
      createLaserStreamRealClient(createLaserStreamRealOptions(config))
    );
  }

  return createNotImplementedProvider(config.MANAGED_STREAM_PROVIDER);
}

function createClientStatus(
  config: IndexerConfig,
  subscriptionConfig: ManagedStreamSubscriptionConfig
): ManagedStreamClientStatus {
  const provider = config.MANAGED_STREAM_PROVIDER;
  const kind = providerToClientKind(provider);

  if (provider === "laserstream") {
    return createLaserStreamRealClient(
      createLaserStreamRealOptions(config, subscriptionConfig)
    ).getStatus();
  }

  return createManagedStreamClient({
    kind,
    enabled: config.MANAGED_STREAM_ENABLED,
    endpoint: resolveProviderEndpoint(config, provider),
    authToken: resolveProviderAuthToken(config, provider),
    apiKey: resolveProviderApiKey(config, provider),
    commitment: config.MANAGED_STREAM_COMMITMENT,
    subscriptionConfig
  }).getStatus();
}

function createYellowstoneStatus(config: IndexerConfig): ManagedStreamClientStatus {
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config, {
    provider: "yellowstone"
  });

  return createManagedStreamClient({
    kind: "yellowstone",
    enabled: config.YELLOWSTONE_ENABLED,
    endpoint: config.YELLOWSTONE_GRPC_URL,
    authToken: config.YELLOWSTONE_GRPC_TOKEN,
    commitment: subscriptionConfig.commitment,
    subscriptionConfig
  }).getStatus();
}

function createLaserStreamStatus(config: IndexerConfig): ManagedStreamClientStatus {
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config, {
    provider: "laserstream"
  });

  return createLaserStreamRealClient(
    createLaserStreamRealOptions(config, subscriptionConfig)
  ).getStatus();
}

export function createLaserStreamRealReadiness(
  config: IndexerConfig
): LaserStreamRealReadiness {
  return evaluateLaserStreamRealReadiness(createLaserStreamRealOptions(config));
}

function createLaserStreamRealOptions(
  config: IndexerConfig,
  subscriptionConfig = createManagedStreamSubscriptionConfig(config, {
    provider: "laserstream"
  })
): LaserStreamRealConnectionOptions {
  return {
    allowRealConnection: config.MANAGED_STREAM_ALLOW_REAL_CONNECTION,
    realConnectionAck: config.MANAGED_STREAM_REAL_CONNECTION_ACK,
    realProvider: config.MANAGED_STREAM_REAL_PROVIDER,
    enabled: config.LASERSTREAM_ENABLED,
    endpoint: config.LASERSTREAM_GRPC_URL,
    apiKey: config.LASERSTREAM_API_KEY,
    region: config.LASERSTREAM_REGION,
    commitment: config.LASERSTREAM_COMMITMENT,
    subscriptionConfig,
    accountInclude: config.LASERSTREAM_ACCOUNT_INCLUDE,
    accountExclude: config.LASERSTREAM_ACCOUNT_EXCLUDE,
    accountRequired: config.LASERSTREAM_ACCOUNT_REQUIRED,
    programInclude: config.LASERSTREAM_PROGRAM_INCLUDE,
    includeVotes: config.LASERSTREAM_INCLUDE_VOTES,
    includeFailed: config.LASERSTREAM_INCLUDE_FAILED,
    transactionsEnabled: config.LASERSTREAM_TRANSACTIONS_ENABLED,
    maxMessagesPerSession: config.LASERSTREAM_MAX_MESSAGES_PER_SESSION,
    maxRuntimeMs: config.LASERSTREAM_MAX_RUNTIME_MS,
    stopOnError: config.LASERSTREAM_STOP_ON_ERROR,
    reconnectEnabled: config.LASERSTREAM_RECONNECT_ENABLED,
    replayEnabled: config.LASERSTREAM_REPLAY_ENABLED,
    replayFromSlot: config.LASERSTREAM_REPLAY_FROM_SLOT
  };
}

function clientToProvider(
  client: ReturnType<typeof createLaserStreamRealClient>
): ManagedStreamProvider {
  let subscriptions: ManagedStreamSubscriptionConfig | null = null;

  return {
    start: client.start,
    stop: client.stop,
    subscribe: async (config) => {
      subscriptions = sanitizeSubscriptionConfig(config);
      await client.subscribe(config);
    },
    onEnvelope: client.onEnvelope,
    getStatus: () => {
      const status = client.getStatus();

      return {
        provider: status.provider,
        enabled: status.enabled,
        configured: status.configured,
        authConfigured: status.authConfigured,
        connectionState: status.connectionState,
        commitment: status.commitment,
        subscribed: status.subscribed,
        subscriptions,
        receivedCount: status.receivedCount,
        transactionCount: status.transactionCount,
        accountCount: status.accountCount,
        errorCount: status.errorCount,
        lastMessageAt: status.lastMessageAt,
        lastError: status.lastError,
        reasonCodes: status.reasonCodes
      };
    }
  };
}

function resolveProviderCommitment(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): ManagedStreamCommitment {
  if (provider === "laserstream") {
    return config.LASERSTREAM_COMMITMENT;
  }

  return config.MANAGED_STREAM_COMMITMENT;
}

function resolveTransactionsEnabled(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): boolean {
  if (provider === "laserstream") {
    return config.LASERSTREAM_TRANSACTIONS_ENABLED;
  }

  return config.MANAGED_STREAM_TRANSACTIONS_ENABLED;
}

function resolveTransactionAccountInclude(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): string[] {
  if (provider === "laserstream") {
    return uniqueStrings([
      ...config.LASERSTREAM_ACCOUNT_INCLUDE,
      ...config.LASERSTREAM_PROGRAM_INCLUDE,
      ...config.MANAGED_STREAM_TRANSACTION_ACCOUNT_INCLUDE
    ]);
  }

  return config.MANAGED_STREAM_TRANSACTION_ACCOUNT_INCLUDE;
}

function resolveTransactionAccountExclude(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): string[] {
  if (provider === "laserstream") {
    return config.LASERSTREAM_ACCOUNT_EXCLUDE.length > 0
      ? config.LASERSTREAM_ACCOUNT_EXCLUDE
      : config.MANAGED_STREAM_TRANSACTION_ACCOUNT_EXCLUDE;
  }

  return config.MANAGED_STREAM_TRANSACTION_ACCOUNT_EXCLUDE;
}

function resolveTransactionAccountRequired(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): string[] {
  if (provider === "laserstream") {
    return config.LASERSTREAM_ACCOUNT_REQUIRED.length > 0
      ? config.LASERSTREAM_ACCOUNT_REQUIRED
      : config.MANAGED_STREAM_TRANSACTION_ACCOUNT_REQUIRED;
  }

  return config.MANAGED_STREAM_TRANSACTION_ACCOUNT_REQUIRED;
}

function resolveIncludeVotes(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): boolean {
  if (provider === "laserstream") {
    return config.LASERSTREAM_INCLUDE_VOTES;
  }

  return config.MANAGED_STREAM_INCLUDE_VOTES;
}

function resolveIncludeFailed(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): boolean {
  if (provider === "laserstream") {
    return config.LASERSTREAM_INCLUDE_FAILED;
  }

  return config.MANAGED_STREAM_INCLUDE_FAILED;
}

function resolveMaxReconnectAttempts(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): number {
  if (provider === "laserstream" && !config.LASERSTREAM_RECONNECT_ENABLED) {
    return 0;
  }

  return config.MANAGED_STREAM_MAX_RECONNECT_ATTEMPTS;
}

function resolveReconnectBackoffMs(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): number {
  if (provider === "laserstream" && !config.LASERSTREAM_RECONNECT_ENABLED) {
    return 0;
  }

  return config.MANAGED_STREAM_RECONNECT_BACKOFF_MS;
}

function resolveProfileProgramIds(
  config: IndexerConfig,
  profile: ManagedStreamSubscriptionProfileName
): string[] {
  if (profile === "pumpfun_and_pumpswap_transactions") {
    return uniqueStrings([config.PUMPFUN_PROGRAM_ID, config.PUMPSWAP_PROGRAM_ID]);
  }

  if (
    profile === "pumpfun_program_transactions" ||
    profile === "laserstream_pumpfun_transactions" ||
    profile === "yellowstone_pumpfun_transactions"
  ) {
    return uniqueStrings([config.PUMPFUN_PROGRAM_ID]);
  }

  return [];
}

function resolveProviderEndpoint(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): string | undefined {
  if (provider === "yellowstone" || provider === "geyser") {
    return config.MANAGED_STREAM_ENDPOINT ?? config.YELLOWSTONE_GRPC_URL;
  }

  if (provider === "laserstream") {
    return config.MANAGED_STREAM_ENDPOINT ?? config.LASERSTREAM_GRPC_URL;
  }

  return config.MANAGED_STREAM_ENDPOINT;
}

function resolveProviderAuth(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): string | undefined {
  return (
    resolveProviderAuthToken(config, provider) ?? resolveProviderApiKey(config, provider)
  );
}

function resolveProviderAuthToken(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): string | undefined {
  if (provider === "yellowstone" || provider === "geyser") {
    return config.MANAGED_STREAM_AUTH_TOKEN ?? config.YELLOWSTONE_GRPC_TOKEN;
  }

  if (provider === "laserstream") {
    return config.MANAGED_STREAM_AUTH_TOKEN;
  }

  return config.MANAGED_STREAM_AUTH_TOKEN;
}

function resolveProviderApiKey(
  config: IndexerConfig,
  provider: ManagedStreamProviderKind
): string | undefined {
  if (provider === "laserstream") {
    return config.MANAGED_STREAM_API_KEY ?? config.LASERSTREAM_API_KEY;
  }

  return config.MANAGED_STREAM_API_KEY;
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
    if (values.length > maxManagedStreamFilterValues) {
      throw new Error("MANAGED_STREAM_FILTER_LIMIT_EXCEEDED");
    }
  }
}

async function waitForLaserStreamSession(
  client: ReturnType<typeof createLaserStreamRealClient>,
  timeoutMs: number
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = client.getStatus().connectionState;

    if (
      state === "blocked" ||
      state === "disabled" ||
      state === "disconnected" ||
      state === "error" ||
      state === "not_implemented"
    ) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  if (client.getStatus().connectionState === "connected") {
    await client.stop();
  }
}

function parseJsonOption(args: string[]): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      return parseBoolean(readArgValue(args, index + 1, arg));
    }

    throw new Error(`Unknown managed stream option: ${arg ?? ""}`);
  }

  return true;
}

function parsePreviewProvider(value: string): ManagedStreamPreviewProvider {
  if (value === "yellowstone" || value === "laserstream" || value === "mock") {
    return value;
  }

  throw new Error(`Invalid managed stream provider: ${value}`);
}

function parseCommitment(value: string): ManagedStreamCommitment {
  if (value === "processed" || value === "confirmed" || value === "finalized") {
    return value;
  }

  throw new Error(`Invalid managed stream commitment: ${value}`);
}

function parseProfile(value: string): ManagedStreamSubscriptionProfileName {
  if (
    value === "pumpfun_program_transactions" ||
    value === "pumpfun_and_pumpswap_transactions" ||
    value === "laserstream_pumpfun_transactions" ||
    value === "yellowstone_pumpfun_transactions" ||
    value === "watched_addresses" ||
    value === "minimal_healthcheck"
  ) {
    return value;
  }

  throw new Error(`Invalid managed stream profile: ${value}`);
}

function parseBoolean(value: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid boolean option: ${value}`);
}

function readArgValue(args: string[], index: number, flag: string): string {
  const value = args[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string"))
  );
}
