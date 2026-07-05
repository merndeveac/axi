import {
  createManagedStreamAdapter,
  type ManagedStreamAdapterStatus,
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
    overrides.includeProgram ?? config.MANAGED_STREAM_TRANSACTION_ACCOUNT_INCLUDE;
  const accountRequired =
    overrides.requiredAccount ?? config.MANAGED_STREAM_TRANSACTION_ACCOUNT_REQUIRED;

  return createDefaultSubscriptionConfig({
    provider,
    authConfigured: resolveProviderAuth(config, provider) !== undefined,
    commitment: overrides.commitment ?? config.MANAGED_STREAM_COMMITMENT,
    transactions: {
      enabled: config.MANAGED_STREAM_TRANSACTIONS_ENABLED,
      accountInclude,
      accountExclude: config.MANAGED_STREAM_TRANSACTION_ACCOUNT_EXCLUDE,
      accountRequired,
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

export function createManagedStreamConfigPreview(
  config: IndexerConfig
): ManagedStreamConfigPreview {
  const subscriptionConfig = createManagedStreamSubscriptionConfig(config);
  const clientStatus = createClientStatus(config, subscriptionConfig);

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
    paperOnly: true,
    tradingDisabled: true,
    reasonCodes: uniqueStrings([
      "MANAGED_STREAM_CLIENT_SKELETON",
      ...clientStatus.reasonCodes,
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
        programIds: options.includeProgram,
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

function createManagedStreamSourceSummary(input: {
  adapterStatus: ManagedStreamAdapterStatus;
  config: IndexerConfig;
  providerStatus: ManagedStreamProviderStatus;
  recentEnvelopes: SanitizedStreamEnvelope[];
  subscriptionConfig: ManagedStreamSubscriptionConfig;
}): ManagedStreamSourceSummary {
  const clientStatus = createClientStatus(input.config, input.subscriptionConfig);
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
        ? [streamReasonCodes.providerLaserStream, streamReasonCodes.notImplemented]
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

  return createNotImplementedProvider(config.MANAGED_STREAM_PROVIDER);
}

function createClientStatus(
  config: IndexerConfig,
  subscriptionConfig: ManagedStreamSubscriptionConfig
): ManagedStreamClientStatus {
  const provider = config.MANAGED_STREAM_PROVIDER;
  const kind = providerToClientKind(provider);

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

  return createManagedStreamClient({
    kind: "laserstream",
    enabled: config.LASERSTREAM_ENABLED,
    endpoint: config.LASERSTREAM_GRPC_URL,
    apiKey: config.LASERSTREAM_API_KEY,
    commitment: subscriptionConfig.commitment,
    subscriptionConfig
  }).getStatus();
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
