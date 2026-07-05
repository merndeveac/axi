import {
  createStreamEnvelopeId,
  maskAuthToken,
  maskStreamEndpoint,
  normalizeProviderError,
  streamReasonCodes,
  type ManagedStreamCommitment,
  type ManagedStreamConnectionState,
  type ManagedStreamEnvelope,
  type ManagedStreamEnvelopeHandler,
  type ManagedStreamProviderKind,
  type ManagedStreamSubscriptionConfig,
  type ManagedStreamTransactionEnvelope
} from "@axi/stream-core";

export {
  buildManagedStreamSubscriptionProfile,
  managedStreamProfileReasonCodes,
  type ManagedStreamProfileBuildOptions,
  type ManagedStreamProfileBuildResult,
  type ManagedStreamProfileReasonCode,
  type ManagedStreamSubscriptionProfileName
} from "./profiles";

export type ManagedStreamClientKind =
  | "yellowstone"
  | "laserstream"
  | "mock"
  | "disabled";

export const managedStreamClientReasonCodes = {
  authMasked: "MANAGED_CLIENT_AUTH_MASKED",
  authMissing: "MANAGED_CLIENT_AUTH_MISSING",
  configValid: "MANAGED_CLIENT_CONFIG_VALID",
  disabled: "MANAGED_CLIENT_DISABLED",
  endpointMasked: "MANAGED_CLIENT_ENDPOINT_MASKED",
  endpointMissing: "MANAGED_CLIENT_ENDPOINT_MISSING",
  error: "MANAGED_CLIENT_ERROR",
  laserstreamSkeleton: "LASERSTREAM_CLIENT_SKELETON",
  messageReceived: "MANAGED_CLIENT_MESSAGE_RECEIVED",
  notImplemented: "MANAGED_CLIENT_NOT_IMPLEMENTED",
  subscriptionBuilt: "MANAGED_CLIENT_SUBSCRIPTION_BUILT",
  transportConnected: "MANAGED_CLIENT_TRANSPORT_CONNECTED",
  transportDisconnected: "MANAGED_CLIENT_TRANSPORT_DISCONNECTED",
  yellowstoneSkeleton: "YELLOWSTONE_CLIENT_SKELETON"
} as const;

export type ManagedStreamClientReasonCode =
  (typeof managedStreamClientReasonCodes)[keyof typeof managedStreamClientReasonCodes] |
    (string & {});

export type ManagedStreamClientOptions = {
  kind?: ManagedStreamClientKind;
  enabled?: boolean;
  endpoint?: string | undefined;
  authToken?: string | undefined;
  apiKey?: string | undefined;
  commitment?: ManagedStreamCommitment;
  subscriptionConfig?: ManagedStreamSubscriptionConfig;
  transport?: ManagedStreamTransport;
  now?: () => Date;
};

export type ManagedStreamTransportStatus = {
  connected: boolean;
  sentCount: number;
  receivedCount: number;
  errorCount: number;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
};

export type ManagedStreamTransport = {
  connect: () => void | Promise<void>;
  disconnect: () => void | Promise<void>;
  send: (message: unknown) => void | Promise<void>;
  onMessage: (handler: (message: unknown) => void | Promise<void>) => () => void;
  onError: (handler: (error: unknown) => void) => () => void;
  onClose: (handler: () => void) => () => void;
  getStatus: () => ManagedStreamTransportStatus;
};

export type MockManagedStreamTransport = ManagedStreamTransport & {
  sentMessages: unknown[];
  emitMessage: (message: unknown) => void;
  emitError: (error: unknown) => void;
  close: () => void;
};

export type ManagedStreamSubscriptionSummary = {
  provider: ManagedStreamProviderKind;
  profile: string | null;
  commitment: ManagedStreamCommitment;
  transactionsEnabled: boolean;
  transactionAccountIncludeCount: number;
  transactionAccountExcludeCount: number;
  transactionAccountRequiredCount: number;
  accountsEnabled: boolean;
  accountOwnerCount: number;
  accountCount: number;
  slotsEnabled: boolean;
  blocksEnabled: boolean;
  maxReconnectAttempts: number;
  reconnectBackoffMs: number;
};

export type ManagedStreamSubscriptionBuildResult = {
  provider: "yellowstone" | "laserstream";
  request: Record<string, unknown>;
  subscriptionConfig: ManagedStreamSubscriptionConfig;
  subscriptionSummary: ManagedStreamSubscriptionSummary;
  reasonCodes: ManagedStreamClientReasonCode[];
};

export type ManagedStreamClientConfigValidation = {
  kind: ManagedStreamClientKind;
  enabled: boolean;
  configured: boolean;
  authConfigured: boolean;
  endpointMasked: string | null;
  authMasked: string | null;
  ok: boolean;
  errors: string[];
  reasonCodes: ManagedStreamClientReasonCode[];
};

export type ManagedStreamClientStatus = {
  kind: ManagedStreamClientKind;
  provider: ManagedStreamProviderKind;
  enabled: boolean;
  configured: boolean;
  authConfigured: boolean;
  connectionState: ManagedStreamConnectionState;
  commitment: ManagedStreamCommitment;
  subscribed: boolean;
  endpointMasked: string | null;
  authMasked: string | null;
  subscriptionSummary: ManagedStreamSubscriptionSummary | null;
  receivedCount: number;
  transactionCount: number;
  accountCount: number;
  errorCount: number;
  lastMessageAt: string | null;
  lastError: string | null;
  reasonCodes: ManagedStreamClientReasonCode[];
};

export type ManagedStreamClient = {
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
  subscribe: (config: ManagedStreamSubscriptionConfig) => void | Promise<void>;
  onEnvelope: (handler: ManagedStreamEnvelopeHandler) => () => void;
  getStatus: () => ManagedStreamClientStatus;
};

export type ManagedStreamClientFactory = {
  createClient: (options?: ManagedStreamClientOptions) => ManagedStreamClient;
  createYellowstoneClient: (
    options?: Omit<ManagedStreamClientOptions, "kind">
  ) => ManagedStreamClient;
  createLaserStreamClient: (
    options?: Omit<ManagedStreamClientOptions, "kind">
  ) => ManagedStreamClient;
};

type MutableClientState = {
  connectionState: ManagedStreamConnectionState;
  subscribed: boolean;
  subscriptionConfig: ManagedStreamSubscriptionConfig | null;
  receivedCount: number;
  transactionCount: number;
  accountCount: number;
  errorCount: number;
  lastMessageAt: string | null;
  lastError: string | null;
  reasonCodes: ManagedStreamClientReasonCode[];
  cleanups: Array<() => void>;
};

export function createManagedStreamClient(
  options: ManagedStreamClientOptions = {}
): ManagedStreamClient {
  const kind = options.kind ?? "disabled";

  if (kind === "disabled" || !(options.enabled ?? false)) {
    return createDisabledManagedStreamClient(kind, options);
  }

  if (kind === "yellowstone") {
    return createYellowstoneClient(options);
  }

  if (kind === "laserstream") {
    return createLaserStreamClient(options);
  }

  return createTransportBackedClient({ ...options, kind: "mock", enabled: true });
}

export function createYellowstoneClient(
  options: Omit<ManagedStreamClientOptions, "kind"> = {}
): ManagedStreamClient {
  if (!(options.enabled ?? false)) {
    return createDisabledManagedStreamClient("yellowstone", options);
  }

  if (!options.transport) {
    return createNotImplementedManagedStreamClient("yellowstone", options);
  }

  return createTransportBackedClient({
    ...options,
    kind: "yellowstone",
    enabled: true
  });
}

export function createLaserStreamClient(
  options: Omit<ManagedStreamClientOptions, "kind"> = {}
): ManagedStreamClient {
  if (!(options.enabled ?? false)) {
    return createDisabledManagedStreamClient("laserstream", options);
  }

  if (!options.transport) {
    return createNotImplementedManagedStreamClient("laserstream", options);
  }

  return createTransportBackedClient({
    ...options,
    kind: "laserstream",
    enabled: true
  });
}

export function createManagedStreamClientFactory(
  defaultOptions: ManagedStreamClientOptions = {}
): ManagedStreamClientFactory {
  return {
    createClient: (options = {}) =>
      createManagedStreamClient({ ...defaultOptions, ...options }),
    createYellowstoneClient: (options = {}) =>
      createYellowstoneClient({ ...defaultOptions, ...options }),
    createLaserStreamClient: (options = {}) =>
      createLaserStreamClient({ ...defaultOptions, ...options })
  };
}

export function createDisabledManagedStreamClient(
  kind: ManagedStreamClientKind = "disabled",
  options: Pick<
    ManagedStreamClientOptions,
    "commitment" | "endpoint" | "authToken" | "apiKey" | "subscriptionConfig"
  > = {}
): ManagedStreamClient {
  return createStaticManagedStreamClient({
    kind,
    connectionState: "disabled",
    enabled: false,
    options
  });
}

export function createNotImplementedManagedStreamClient(
  kind: Exclude<ManagedStreamClientKind, "disabled" | "mock">,
  options: Pick<
    ManagedStreamClientOptions,
    "commitment" | "endpoint" | "authToken" | "apiKey" | "subscriptionConfig"
  > = {}
): ManagedStreamClient {
  return createStaticManagedStreamClient({
    kind,
    connectionState: "not_implemented",
    enabled: true,
    options
  });
}

export function validateManagedStreamClientConfig(
  options: ManagedStreamClientOptions = {}
): ManagedStreamClientConfigValidation {
  const kind = options.kind ?? "disabled";
  const enabled = options.enabled ?? false;
  const auth = resolveClientAuth(options);
  const endpoint = options.endpoint;
  const endpointMasked = maskStreamEndpoint(endpoint);
  const authMasked = maskAuthToken(auth);
  const configured =
    kind === "mock" ||
    kind === "disabled" ||
    (endpoint !== undefined && endpoint.trim().length > 0);
  const authConfigured = auth !== undefined && auth.trim().length > 0;
  const errors: string[] = [];
  const reasonCodes: ManagedStreamClientReasonCode[] = [];

  if (!enabled || kind === "disabled") {
    reasonCodes.push(managedStreamClientReasonCodes.disabled);
  }

  if (isManagedRealClient(kind) && enabled) {
    if (!configured) {
      errors.push("Managed stream endpoint is required for real client skeletons.");
      reasonCodes.push(managedStreamClientReasonCodes.endpointMissing);
    }

    if (!authConfigured) {
      errors.push("Managed stream auth is required for real client skeletons.");
      reasonCodes.push(managedStreamClientReasonCodes.authMissing);
    }
  }

  if (endpointMasked !== null) {
    reasonCodes.push(managedStreamClientReasonCodes.endpointMasked);
  }

  if (authMasked !== null) {
    reasonCodes.push(managedStreamClientReasonCodes.authMasked);
  }

  if (errors.length === 0) {
    reasonCodes.push(managedStreamClientReasonCodes.configValid);
  }

  return {
    kind,
    enabled,
    configured,
    authConfigured,
    endpointMasked,
    authMasked,
    ok: errors.length === 0,
    errors,
    reasonCodes: uniqueStrings(reasonCodes)
  };
}

export function buildYellowstoneSubscriptionRequest(
  config: ManagedStreamSubscriptionConfig
): ManagedStreamSubscriptionBuildResult {
  const subscriptionConfig = cloneSubscriptionConfig({
    ...config,
    provider: "yellowstone"
  });

  return {
    provider: "yellowstone",
    request: {
      provider: "yellowstone",
      commitment: subscriptionConfig.commitment,
      transactions: subscriptionConfig.transactions.enabled
        ? {
            vote: subscriptionConfig.transactions.vote,
            failed: subscriptionConfig.transactions.failed,
            accountInclude: [...subscriptionConfig.transactions.accountInclude],
            accountExclude: [...subscriptionConfig.transactions.accountExclude],
            accountRequired: [...subscriptionConfig.transactions.accountRequired]
          }
        : {},
      accounts: subscriptionConfig.accounts.enabled
        ? {
            owner: [...subscriptionConfig.accounts.owners],
            account: [...subscriptionConfig.accounts.accounts]
          }
        : {},
      slots: { enabled: subscriptionConfig.slots.enabled },
      blocks: { enabled: subscriptionConfig.blocks.enabled }
    },
    subscriptionConfig: sanitizeSubscriptionConfig(subscriptionConfig),
    subscriptionSummary: createManagedStreamSubscriptionSummary(subscriptionConfig),
    reasonCodes: [managedStreamClientReasonCodes.subscriptionBuilt]
  };
}

export function buildLaserStreamSubscriptionRequest(
  config: ManagedStreamSubscriptionConfig
): ManagedStreamSubscriptionBuildResult {
  const subscriptionConfig = cloneSubscriptionConfig({
    ...config,
    provider: "laserstream"
  });

  return {
    provider: "laserstream",
    request: {
      provider: "laserstream",
      commitment: subscriptionConfig.commitment,
      filters: {
        transactions: {
          enabled: subscriptionConfig.transactions.enabled,
          includeVotes: subscriptionConfig.transactions.vote,
          includeFailed: subscriptionConfig.transactions.failed,
          accountInclude: [...subscriptionConfig.transactions.accountInclude],
          accountExclude: [...subscriptionConfig.transactions.accountExclude],
          accountRequired: [...subscriptionConfig.transactions.accountRequired]
        },
        accounts: {
          enabled: subscriptionConfig.accounts.enabled,
          owners: [...subscriptionConfig.accounts.owners],
          accounts: [...subscriptionConfig.accounts.accounts]
        },
        slots: subscriptionConfig.slots.enabled,
        blocks: subscriptionConfig.blocks.enabled
      },
      reconnect: {
        maxAttempts: subscriptionConfig.maxReconnectAttempts,
        backoffMs: subscriptionConfig.reconnectBackoffMs
      }
    },
    subscriptionConfig: sanitizeSubscriptionConfig(subscriptionConfig),
    subscriptionSummary: createManagedStreamSubscriptionSummary(subscriptionConfig),
    reasonCodes: [managedStreamClientReasonCodes.subscriptionBuilt]
  };
}

export function createMockManagedStreamTransport(
  options: { now?: () => Date } = {}
): MockManagedStreamTransport {
  const now = options.now ?? (() => new Date());
  const messageHandlers = new Set<(message: unknown) => void | Promise<void>>();
  const errorHandlers = new Set<(error: unknown) => void>();
  const closeHandlers = new Set<() => void>();
  const sentMessages: unknown[] = [];
  let connected = false;
  let receivedCount = 0;
  let errorCount = 0;
  let lastConnectedAt: string | null = null;
  let lastDisconnectedAt: string | null = null;
  let lastMessageAt: string | null = null;
  let lastError: string | null = null;

  return {
    sentMessages,
    connect: () => {
      connected = true;
      lastConnectedAt = now().toISOString();
    },
    disconnect: () => {
      connected = false;
      lastDisconnectedAt = now().toISOString();
      for (const handler of closeHandlers) {
        handler();
      }
    },
    send: (message) => {
      sentMessages.push(message);
    },
    onMessage: (handler) => {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },
    onError: (handler) => {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },
    onClose: (handler) => {
      closeHandlers.add(handler);
      return () => {
        closeHandlers.delete(handler);
      };
    },
    getStatus: () => ({
      connected,
      sentCount: sentMessages.length,
      receivedCount,
      errorCount,
      lastConnectedAt,
      lastDisconnectedAt,
      lastMessageAt,
      lastError
    }),
    emitMessage: (message) => {
      receivedCount += 1;
      lastMessageAt = now().toISOString();

      for (const handler of messageHandlers) {
        const result = handler(message);

        if (result instanceof Promise) {
          void result.catch((error) => {
            const normalized = normalizeProviderError(error);
            errorCount += 1;
            lastError = normalized.message;
          });
        }
      }
    },
    emitError: (error) => {
      const normalized = normalizeProviderError(error);
      errorCount += 1;
      lastError = normalized.message;

      for (const handler of errorHandlers) {
        handler(error);
      }
    },
    close: () => {
      connected = false;
      lastDisconnectedAt = now().toISOString();

      for (const handler of closeHandlers) {
        handler();
      }
    }
  };
}

export function createManagedStreamSubscriptionSummary(
  config: ManagedStreamSubscriptionConfig,
  profile: string | null = null
): ManagedStreamSubscriptionSummary {
  return {
    provider: config.provider,
    profile,
    commitment: config.commitment,
    transactionsEnabled: config.transactions.enabled,
    transactionAccountIncludeCount: config.transactions.accountInclude.length,
    transactionAccountExcludeCount: config.transactions.accountExclude.length,
    transactionAccountRequiredCount: config.transactions.accountRequired.length,
    accountsEnabled: config.accounts.enabled,
    accountOwnerCount: config.accounts.owners.length,
    accountCount: config.accounts.accounts.length,
    slotsEnabled: config.slots.enabled,
    blocksEnabled: config.blocks.enabled,
    maxReconnectAttempts: config.maxReconnectAttempts,
    reconnectBackoffMs: config.reconnectBackoffMs
  };
}

export function cloneSubscriptionConfig(
  config: ManagedStreamSubscriptionConfig
): ManagedStreamSubscriptionConfig {
  return {
    provider: config.provider,
    authConfigured: config.authConfigured,
    commitment: config.commitment,
    transactions: {
      enabled: config.transactions.enabled,
      accountInclude: [...config.transactions.accountInclude],
      accountExclude: [...config.transactions.accountExclude],
      accountRequired: [...config.transactions.accountRequired],
      vote: config.transactions.vote,
      failed: config.transactions.failed
    },
    accounts: {
      enabled: config.accounts.enabled,
      owners: [...config.accounts.owners],
      accounts: [...config.accounts.accounts]
    },
    slots: {
      enabled: config.slots.enabled
    },
    blocks: {
      enabled: config.blocks.enabled
    },
    maxReconnectAttempts: config.maxReconnectAttempts,
    reconnectBackoffMs: config.reconnectBackoffMs,
    ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {})
  };
}

export function uniqueStrings(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string"))
  );
}

function createTransportBackedClient(
  options: ManagedStreamClientOptions & {
    kind: Exclude<ManagedStreamClientKind, "disabled">;
    enabled: true;
    transport?: ManagedStreamTransport;
  }
): ManagedStreamClient {
  const provider = clientKindToProvider(options.kind);
  const transport = options.transport;
  const validation = validateManagedStreamClientConfig(options);
  const now = options.now ?? (() => new Date());
  const handlers = new Set<ManagedStreamEnvelopeHandler>();
  const state: MutableClientState = {
    connectionState: transport ? "configured" : "not_implemented",
    subscribed: false,
    subscriptionConfig: options.subscriptionConfig
      ? cloneSubscriptionConfig(options.subscriptionConfig)
      : null,
    receivedCount: 0,
    transactionCount: 0,
    accountCount: 0,
    errorCount: 0,
    lastMessageAt: null,
    lastError: null,
    reasonCodes: [
      ...validation.reasonCodes,
      ...(options.kind === "yellowstone"
        ? [managedStreamClientReasonCodes.yellowstoneSkeleton]
        : []),
      ...(options.kind === "laserstream"
        ? [managedStreamClientReasonCodes.laserstreamSkeleton]
        : [])
    ],
    cleanups: []
  };

  if (!transport) {
    state.reasonCodes.push(managedStreamClientReasonCodes.notImplemented);
    return createClientFacade({
      kind: options.kind,
      provider,
      enabled: true,
      validation,
      state,
      start: () => {
        state.connectionState = "not_implemented";
      },
      stop: () => {
        state.connectionState = "not_implemented";
      },
      subscribe: (config) => {
        state.subscriptionConfig = cloneSubscriptionConfig(config);
        state.subscribed = true;
      },
      onEnvelope: (handler) => {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      }
    });
  }

  state.cleanups.push(
    transport.onMessage((message) => {
      const envelope = messageToEnvelope(message, {
        provider,
        commitment:
          state.subscriptionConfig?.commitment ?? options.commitment ?? "confirmed",
        now
      });
      state.receivedCount += 1;
      state.lastMessageAt = envelope.receivedAt;
      state.reasonCodes = uniqueStrings([
        ...state.reasonCodes,
        managedStreamClientReasonCodes.messageReceived
      ]);

      if (envelope.streamType === "transaction") {
        state.transactionCount += 1;
      }

      if (envelope.streamType === "account") {
        state.accountCount += 1;
      }

      for (const handler of handlers) {
        try {
          const result = handler(envelope);

          if (result instanceof Promise) {
            void result.catch((error) => {
              recordClientError(state, error);
            });
          }
        } catch (error) {
          recordClientError(state, error);
        }
      }
    })
  );
  state.cleanups.push(
    transport.onError((error) => {
      recordClientError(state, error);
    })
  );
  state.cleanups.push(
    transport.onClose(() => {
      state.connectionState = "disconnected";
      state.reasonCodes = uniqueStrings([
        ...state.reasonCodes,
        managedStreamClientReasonCodes.transportDisconnected
      ]);
    })
  );

  return createClientFacade({
    kind: options.kind,
    provider,
    enabled: true,
    validation,
    state,
    start: async () => {
      state.connectionState = "connecting";
      await transport.connect();
      state.connectionState = "connected";
      state.reasonCodes = uniqueStrings([
        ...state.reasonCodes,
        managedStreamClientReasonCodes.transportConnected
      ]);

      if (state.subscriptionConfig) {
        await sendSubscriptionRequest(options.kind, transport, state.subscriptionConfig);
        state.subscribed = true;
        state.reasonCodes = uniqueStrings([
          ...state.reasonCodes,
          managedStreamClientReasonCodes.subscriptionBuilt
        ]);
      }
    },
    stop: async () => {
      await transport.disconnect();
      state.connectionState = "disconnected";
      state.reasonCodes = uniqueStrings([
        ...state.reasonCodes,
        managedStreamClientReasonCodes.transportDisconnected
      ]);

      for (const cleanup of state.cleanups) {
        cleanup();
      }

      state.cleanups = [];
    },
    subscribe: async (config) => {
      state.subscriptionConfig = cloneSubscriptionConfig(config);
      state.subscribed = true;

      if (state.connectionState === "connected") {
        await sendSubscriptionRequest(options.kind, transport, state.subscriptionConfig);
      }

      state.reasonCodes = uniqueStrings([
        ...state.reasonCodes,
        managedStreamClientReasonCodes.subscriptionBuilt
      ]);
    },
    onEnvelope: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    }
  });
}

function createStaticManagedStreamClient(input: {
  kind: ManagedStreamClientKind;
  connectionState: "disabled" | "not_implemented";
  enabled: boolean;
  options: Pick<
    ManagedStreamClientOptions,
    "commitment" | "endpoint" | "authToken" | "apiKey" | "subscriptionConfig"
  >;
}): ManagedStreamClient {
  const provider = clientKindToProvider(input.kind);
  const validation = validateManagedStreamClientConfig({
    ...input.options,
    kind: input.kind,
    enabled: input.enabled
  });
  const state: MutableClientState = {
    connectionState: input.connectionState,
    subscribed: input.options.subscriptionConfig !== undefined,
    subscriptionConfig: input.options.subscriptionConfig
      ? cloneSubscriptionConfig(input.options.subscriptionConfig)
      : null,
    receivedCount: 0,
    transactionCount: 0,
    accountCount: 0,
    errorCount: 0,
    lastMessageAt: null,
    lastError: null,
    reasonCodes: [
      ...validation.reasonCodes,
      ...(input.connectionState === "disabled"
        ? [managedStreamClientReasonCodes.disabled]
        : [managedStreamClientReasonCodes.notImplemented]),
      ...(input.kind === "yellowstone"
        ? [managedStreamClientReasonCodes.yellowstoneSkeleton]
        : []),
      ...(input.kind === "laserstream"
        ? [managedStreamClientReasonCodes.laserstreamSkeleton]
        : [])
    ],
    cleanups: []
  };
  const handlers = new Set<ManagedStreamEnvelopeHandler>();

  return createClientFacade({
    kind: input.kind,
    provider,
    enabled: input.enabled,
    validation,
    state,
    start: () => {
      state.connectionState = input.connectionState;
    },
    stop: () => {
      state.connectionState = input.connectionState;
    },
    subscribe: (config) => {
      state.subscriptionConfig = cloneSubscriptionConfig(config);
      state.subscribed = true;
    },
    onEnvelope: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    }
  });
}

function createClientFacade(input: {
  kind: ManagedStreamClientKind;
  provider: ManagedStreamProviderKind;
  enabled: boolean;
  validation: ManagedStreamClientConfigValidation;
  state: MutableClientState;
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
  subscribe: (config: ManagedStreamSubscriptionConfig) => void | Promise<void>;
  onEnvelope: (handler: ManagedStreamEnvelopeHandler) => () => void;
}): ManagedStreamClient {
  return {
    start: input.start,
    stop: input.stop,
    subscribe: input.subscribe,
    onEnvelope: input.onEnvelope,
    getStatus: () => ({
      kind: input.kind,
      provider: input.provider,
      enabled: input.enabled,
      configured: input.validation.configured,
      authConfigured: input.validation.authConfigured,
      connectionState: input.state.connectionState,
      commitment: input.state.subscriptionConfig?.commitment ?? "confirmed",
      subscribed: input.state.subscribed,
      endpointMasked: input.validation.endpointMasked,
      authMasked: input.validation.authMasked,
      subscriptionSummary: input.state.subscriptionConfig
        ? createManagedStreamSubscriptionSummary(input.state.subscriptionConfig)
        : null,
      receivedCount: input.state.receivedCount,
      transactionCount: input.state.transactionCount,
      accountCount: input.state.accountCount,
      errorCount: input.state.errorCount,
      lastMessageAt: input.state.lastMessageAt,
      lastError: input.state.lastError,
      reasonCodes: uniqueStrings(input.state.reasonCodes)
    })
  };
}

async function sendSubscriptionRequest(
  kind: Exclude<ManagedStreamClientKind, "disabled">,
  transport: ManagedStreamTransport,
  config: ManagedStreamSubscriptionConfig
): Promise<void> {
  if (kind === "laserstream") {
    await transport.send(buildLaserStreamSubscriptionRequest(config).request);
    return;
  }

  if (kind === "yellowstone") {
    await transport.send(buildYellowstoneSubscriptionRequest(config).request);
    return;
  }

  await transport.send({
    provider: "mock",
    subscription: sanitizeSubscriptionConfig(config)
  });
}

function messageToEnvelope(
  message: unknown,
  options: {
    provider: ManagedStreamProviderKind;
    commitment: ManagedStreamCommitment;
    now: () => Date;
  }
): ManagedStreamEnvelope {
  if (isManagedStreamEnvelope(message)) {
    return {
      ...message,
      provider: options.provider,
      reasonCodes: uniqueStrings([
        ...message.reasonCodes,
        managedStreamClientReasonCodes.messageReceived
      ])
    };
  }

  const record = isRecord(message) ? message : {};
  const streamType = readStreamType(record);
  const receivedAt =
    typeof record.receivedAt === "string"
      ? record.receivedAt
      : options.now().toISOString();
  const signature = readString(record, "signature");
  const slot = readNumber(record, "slot");
  const blockTime = readStringOrNumber(record, "blockTime");
  const programIds = readStringArray(record, "programIds");
  const accountKeys = readStringArray(record, "accountKeys");
  const base = {
    id: createStreamEnvelopeId({
      provider: options.provider,
      receivedAt,
      slot,
      signature,
      message
    }),
    provider: options.provider,
    schemaVersion: 1 as const,
    chain: "solana" as const,
    commitment: options.commitment,
    streamType,
    receivedAt,
    raw: message,
    reasonCodes: [
      managedStreamClientReasonCodes.messageReceived,
      streamType === "transaction"
        ? streamReasonCodes.transactionReceived
        : streamReasonCodes.accountReceived
    ],
    ...(slot !== undefined ? { slot } : {}),
    ...(blockTime !== undefined ? { blockTime } : {}),
    ...(signature !== null ? { signature } : {}),
    ...(programIds.length > 0 ? { programIds } : {}),
    ...(accountKeys.length > 0 ? { accountKeys } : {})
  };

  if (streamType === "transaction") {
    const envelope: ManagedStreamTransactionEnvelope = {
      ...base,
      streamType: "transaction",
      transaction: record.transaction ?? message,
      ...(record.meta !== undefined ? { meta: record.meta } : {}),
      ...(Array.isArray(record.logs) ? { logs: readStringArray(record, "logs") } : {}),
      ...(record.err !== undefined ? { err: record.err } : {})
    };

    return envelope;
  }

  return base;
}

function sanitizeSubscriptionConfig(
  config: ManagedStreamSubscriptionConfig
): ManagedStreamSubscriptionConfig {
  const maskedEndpoint = maskStreamEndpoint(config.endpoint);
  const cloned = cloneSubscriptionConfig(config);

  if (maskedEndpoint !== null) {
    return {
      ...cloned,
      endpoint: maskedEndpoint
    };
  }

  return {
    provider: cloned.provider,
    authConfigured: cloned.authConfigured,
    commitment: cloned.commitment,
    transactions: cloned.transactions,
    accounts: cloned.accounts,
    slots: cloned.slots,
    blocks: cloned.blocks,
    maxReconnectAttempts: cloned.maxReconnectAttempts,
    reconnectBackoffMs: cloned.reconnectBackoffMs
  };
}

function recordClientError(state: MutableClientState, error: unknown): void {
  const normalized = normalizeProviderError(error);
  state.errorCount += 1;
  state.lastError = normalized.message;
  state.connectionState = "error";
  state.reasonCodes = uniqueStrings([
    ...state.reasonCodes,
    managedStreamClientReasonCodes.error
  ]);
}

function resolveClientAuth(options: ManagedStreamClientOptions): string | undefined {
  return options.authToken ?? options.apiKey;
}

function clientKindToProvider(kind: ManagedStreamClientKind): ManagedStreamProviderKind {
  if (kind === "disabled") {
    return "unknown";
  }

  return kind;
}

function isManagedRealClient(kind: ManagedStreamClientKind): boolean {
  return kind === "yellowstone" || kind === "laserstream";
}

function isManagedStreamEnvelope(value: unknown): value is ManagedStreamEnvelope {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.chain === "solana" &&
    typeof value.id === "string" &&
    typeof value.provider === "string" &&
    typeof value.streamType === "string" &&
    typeof value.receivedAt === "string" &&
    Array.isArray(value.reasonCodes)
  );
}

function readStreamType(
  record: Record<string, unknown>
): ManagedStreamEnvelope["streamType"] {
  if (
    record.streamType === "transaction" ||
    record.streamType === "account" ||
    record.streamType === "slot" ||
    record.streamType === "block" ||
    record.streamType === "block_meta"
  ) {
    return record.streamType;
  }

  if ("transaction" in record || "signature" in record) {
    return "transaction";
  }

  return "unknown";
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function readStringOrNumber(
  record: Record<string, unknown>,
  key: string
): number | string | null | undefined {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (value === null) {
    return null;
  }

  return undefined;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
