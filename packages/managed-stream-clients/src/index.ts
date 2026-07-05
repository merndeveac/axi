import {
  createDefaultSubscriptionConfig,
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
  laserstreamBlockedByDefault: "LASERSTREAM_CONNECTION_BLOCKED_BY_DEFAULT",
  laserstreamConfigMissingApiKey: "LASERSTREAM_CONFIG_MISSING_API_KEY",
  laserstreamConfigMissingEndpoint: "LASERSTREAM_CONFIG_MISSING_ENDPOINT",
  laserstreamConnected: "LASERSTREAM_CONNECTED",
  laserstreamConnectionAttempted: "LASERSTREAM_CONNECTION_ATTEMPTED",
  laserstreamDisconnected: "LASERSTREAM_DISCONNECTED",
  laserstreamEnabled: "LASERSTREAM_ENABLED",
  laserstreamSkeleton: "LASERSTREAM_CLIENT_SKELETON",
  laserstreamMessageReceived: "LASERSTREAM_MESSAGE_RECEIVED",
  laserstreamReadyToConnect: "LASERSTREAM_READY_TO_CONNECT",
  laserstreamRuntimeLimitReached: "LASERSTREAM_RUNTIME_LIMIT_REACHED",
  laserstreamSecretMasked: "LASERSTREAM_SECRET_MASKED",
  laserstreamSessionLimitReached: "LASERSTREAM_SESSION_LIMIT_REACHED",
  messageReceived: "MANAGED_CLIENT_MESSAGE_RECEIVED",
  notImplemented: "MANAGED_CLIENT_NOT_IMPLEMENTED",
  realStreamAckMissing: "REAL_STREAM_ACK_MISSING",
  realStreamDisabled: "REAL_STREAM_DISABLED",
  realStreamProviderNotSelected: "REAL_STREAM_PROVIDER_NOT_SELECTED",
  sdkNotInstalledOrNotImplemented: "SDK_NOT_INSTALLED_OR_NOT_IMPLEMENTED",
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

export type LaserStreamRealConnectionOptions = Omit<
  ManagedStreamClientOptions,
  "kind" | "authToken"
> & {
  allowRealConnection?: boolean;
  realConnectionAck?: boolean;
  realProvider?: ManagedStreamProviderKind | string | undefined;
  region?: string | undefined;
  accountInclude?: string[] | undefined;
  accountExclude?: string[] | undefined;
  accountRequired?: string[] | undefined;
  programInclude?: string[] | undefined;
  includeVotes?: boolean;
  includeFailed?: boolean;
  transactionsEnabled?: boolean;
  maxMessagesPerSession?: number;
  maxRuntimeMs?: number;
  stopOnError?: boolean;
  reconnectEnabled?: boolean;
  replayEnabled?: boolean;
  replayFromSlot?: number | undefined;
  sdkLoader?: (() => Promise<unknown>) | undefined;
  setTimeout?: ((handler: () => void, ms: number) => unknown) | undefined;
  clearTimeout?: ((handle: unknown) => void) | undefined;
};

export type LaserStreamMaskedConfig = {
  endpointMasked: string | null;
  apiKeyMasked: string | null;
  region: string | null;
  commitment: ManagedStreamCommitment;
  transactionsEnabled: boolean;
  accountIncludeCount: number;
  accountExcludeCount: number;
  accountRequiredCount: number;
  programIncludeCount: number;
  includeVotes: boolean;
  includeFailed: boolean;
  maxMessagesPerSession: number;
  maxRuntimeMs: number;
  stopOnError: boolean;
  reconnectEnabled: boolean;
  replayEnabled: boolean;
  replayFromSlot: number | null;
};

export type LaserStreamRealReadiness = {
  provider: "laserstream";
  canConnect: boolean;
  realConnectionAllowed: boolean;
  realConnectionAck: boolean;
  realProvider: string;
  laserstreamEnabled: boolean;
  configured: boolean;
  apiKeyConfigured: boolean;
  endpointMasked: string | null;
  maskedConfig: LaserStreamMaskedConfig;
  missingRequirements: string[];
  connectionBlockedReasons: string[];
  reasonCodes: ManagedStreamClientReasonCode[];
  safeNextSteps: string[];
  paperOnly: true;
  tradingDisabled: true;
  secretsExposed: false;
};

export type LaserStreamSdkSubscriptionRequest = {
  accounts: Record<string, unknown>;
  slots: Record<string, unknown>;
  transactions: Record<string, unknown>;
  transactionsStatus: Record<string, unknown>;
  blocks: Record<string, unknown>;
  blocksMeta: Record<string, unknown>;
  entry: Record<string, unknown>;
  accountsDataSlice: unknown[];
  commitment: ManagedStreamCommitment;
  fromSlot?: number;
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

type LaserStreamSubscribe = (
  config: Record<string, unknown>,
  request: LaserStreamSdkSubscriptionRequest,
  onData: (message: unknown) => void,
  onError: (error: unknown) => void
) => unknown;

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

export function evaluateLaserStreamRealReadiness(
  options: LaserStreamRealConnectionOptions = {}
): LaserStreamRealReadiness {
  const endpointMasked = maskStreamEndpoint(options.endpoint);
  const apiKeyMasked = maskAuthToken(options.apiKey);
  const realConnectionAllowed = options.allowRealConnection ?? false;
  const realConnectionAck = options.realConnectionAck ?? false;
  const realProvider = options.realProvider ?? "mock";
  const laserstreamEnabled = options.enabled ?? false;
  const configured =
    options.endpoint !== undefined && options.endpoint.trim().length > 0;
  const apiKeyConfigured =
    options.apiKey !== undefined && options.apiKey.trim().length > 0;
  const missingRequirements: string[] = [];
  const connectionBlockedReasons: string[] = [];
  const reasonCodes: ManagedStreamClientReasonCode[] = [];

  if (!realConnectionAllowed) {
    missingRequirements.push("MANAGED_STREAM_ALLOW_REAL_CONNECTION=true");
    connectionBlockedReasons.push(
      managedStreamClientReasonCodes.realStreamDisabled
    );
    reasonCodes.push(
      managedStreamClientReasonCodes.realStreamDisabled,
      managedStreamClientReasonCodes.laserstreamBlockedByDefault
    );
  }

  if (!realConnectionAck) {
    missingRequirements.push("MANAGED_STREAM_REAL_CONNECTION_ACK=true");
    connectionBlockedReasons.push(
      managedStreamClientReasonCodes.realStreamAckMissing
    );
    reasonCodes.push(managedStreamClientReasonCodes.realStreamAckMissing);
  }

  if (realProvider !== "laserstream") {
    missingRequirements.push("MANAGED_STREAM_REAL_PROVIDER=laserstream");
    connectionBlockedReasons.push(
      managedStreamClientReasonCodes.realStreamProviderNotSelected
    );
    reasonCodes.push(
      managedStreamClientReasonCodes.realStreamProviderNotSelected
    );
  }

  if (!laserstreamEnabled) {
    missingRequirements.push("LASERSTREAM_ENABLED=true");
    connectionBlockedReasons.push(managedStreamClientReasonCodes.laserstreamEnabled);
    reasonCodes.push(managedStreamClientReasonCodes.laserstreamEnabled);
  }

  if (!configured) {
    missingRequirements.push("LASERSTREAM_GRPC_URL");
    connectionBlockedReasons.push(
      managedStreamClientReasonCodes.laserstreamConfigMissingEndpoint
    );
    reasonCodes.push(
      managedStreamClientReasonCodes.laserstreamConfigMissingEndpoint
    );
  }

  if (!apiKeyConfigured) {
    missingRequirements.push("LASERSTREAM_API_KEY");
    connectionBlockedReasons.push(
      managedStreamClientReasonCodes.laserstreamConfigMissingApiKey
    );
    reasonCodes.push(
      managedStreamClientReasonCodes.laserstreamConfigMissingApiKey
    );
  }

  if (endpointMasked !== null || apiKeyMasked !== null) {
    reasonCodes.push(managedStreamClientReasonCodes.laserstreamSecretMasked);
  }

  const canConnect = missingRequirements.length === 0;

  if (canConnect) {
    reasonCodes.push(managedStreamClientReasonCodes.laserstreamReadyToConnect);
  }

  return {
    provider: "laserstream",
    canConnect,
    realConnectionAllowed,
    realConnectionAck,
    realProvider,
    laserstreamEnabled,
    configured,
    apiKeyConfigured,
    endpointMasked,
    maskedConfig: {
      endpointMasked,
      apiKeyMasked,
      region: options.region ?? null,
      commitment: options.commitment ?? "confirmed",
      transactionsEnabled: options.transactionsEnabled ?? true,
      accountIncludeCount: uniqueStrings(options.accountInclude ?? []).length,
      accountExcludeCount: uniqueStrings(options.accountExclude ?? []).length,
      accountRequiredCount: uniqueStrings(options.accountRequired ?? []).length,
      programIncludeCount: uniqueStrings(options.programInclude ?? []).length,
      includeVotes: options.includeVotes ?? false,
      includeFailed: options.includeFailed ?? false,
      maxMessagesPerSession: normalizePositiveInt(
        options.maxMessagesPerSession,
        10000
      ),
      maxRuntimeMs: normalizePositiveInt(options.maxRuntimeMs, 300000),
      stopOnError: options.stopOnError ?? false,
      reconnectEnabled: options.reconnectEnabled ?? true,
      replayEnabled: options.replayEnabled ?? false,
      replayFromSlot: options.replayFromSlot ?? null
    },
    missingRequirements: uniqueStrings(missingRequirements),
    connectionBlockedReasons: uniqueStrings(connectionBlockedReasons),
    reasonCodes: uniqueStrings(reasonCodes),
    safeNextSteps: canConnect
      ? [
          "Run a short stream:connect:laserstream session with low max runtime and message limits."
        ]
      : [
          "Set all real connection gates explicitly.",
          "Keep credentials in a gitignored local environment file.",
          "Run stream:connect:check before any real stream command."
        ],
    paperOnly: true,
    tradingDisabled: true,
    secretsExposed: false
  };
}

export function createLaserStreamRealClient(
  options: LaserStreamRealConnectionOptions = {}
): ManagedStreamClient {
  const readiness = evaluateLaserStreamRealReadiness(options);
  const validation = validateManagedStreamClientConfig({
    ...options,
    kind: "laserstream",
    enabled: options.enabled ?? false
  });
  const now = options.now ?? (() => new Date());
  const handlers = new Set<ManagedStreamEnvelopeHandler>();
  const maxMessagesPerSession = readiness.maskedConfig.maxMessagesPerSession;
  const maxRuntimeMs = readiness.maskedConfig.maxRuntimeMs;
  const setRuntimeTimeout = options.setTimeout ?? setTimeout;
  const clearRuntimeTimeout =
    options.clearTimeout ??
    ((handle: unknown) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    });
  const state: MutableClientState = {
    connectionState: readiness.canConnect ? "configured" : "blocked",
    subscribed: false,
    subscriptionConfig: options.subscriptionConfig
      ? cloneSubscriptionConfig(options.subscriptionConfig)
      : createDefaultLaserStreamSubscriptionConfig(options),
    receivedCount: 0,
    transactionCount: 0,
    accountCount: 0,
    errorCount: 0,
    lastMessageAt: null,
    lastError: null,
    reasonCodes: uniqueStrings([
      ...validation.reasonCodes,
      ...readiness.reasonCodes
    ]),
    cleanups: []
  };
  let runtimeTimer: unknown = null;
  let sdkHandle: unknown = null;
  let started = false;

  function clearRuntimeTimer(): void {
    if (runtimeTimer !== null) {
      clearRuntimeTimeout(runtimeTimer);
      runtimeTimer = null;
    }
  }

  async function stopForLimit(
    reasonCode: ManagedStreamClientReasonCode
  ): Promise<void> {
    state.reasonCodes = uniqueStrings([...state.reasonCodes, reasonCode]);
    await stopClient();
  }

  function handleMessage(message: unknown): void {
    const envelope = messageToEnvelope(message, {
      provider: "laserstream",
      commitment:
        state.subscriptionConfig?.commitment ?? options.commitment ?? "confirmed",
      now
    });
    state.receivedCount += 1;
    state.lastMessageAt = envelope.receivedAt;
    state.reasonCodes = uniqueStrings([
      ...state.reasonCodes,
      managedStreamClientReasonCodes.messageReceived,
      managedStreamClientReasonCodes.laserstreamMessageReceived
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

        if (isPromiseLike(result)) {
          void Promise.resolve(result).catch((error: unknown) => {
            recordLaserStreamError(error);
          });
        }
      } catch (error) {
        recordLaserStreamError(error);
      }
    }

    if (state.receivedCount >= maxMessagesPerSession) {
      void stopForLimit(managedStreamClientReasonCodes.laserstreamSessionLimitReached);
    }
  }

  function recordLaserStreamError(error: unknown): void {
    const normalized = normalizeProviderError(error);
    state.errorCount += 1;
    state.lastError = normalized.message;
    state.reasonCodes = uniqueStrings([
      ...state.reasonCodes,
      managedStreamClientReasonCodes.error
    ]);

    if (options.stopOnError ?? false) {
      state.connectionState = "error";
      void stopClient();
    }
  }

  function startRuntimeTimer(): void {
    clearRuntimeTimer();
    runtimeTimer = setRuntimeTimeout(() => {
      void stopForLimit(managedStreamClientReasonCodes.laserstreamRuntimeLimitReached);
    }, maxRuntimeMs);
  }

  async function stopClient(): Promise<void> {
    clearRuntimeTimer();

    if (options.transport) {
      await options.transport.disconnect();
    }

    if (sdkHandle !== null) {
      await closeSdkHandle(sdkHandle);
      sdkHandle = null;
    }

    state.connectionState = readiness.canConnect ? "disconnected" : "blocked";
    state.reasonCodes = uniqueStrings([
      ...state.reasonCodes,
      managedStreamClientReasonCodes.laserstreamDisconnected
    ]);
    started = false;
  }

  if (options.transport) {
    state.cleanups.push(options.transport.onMessage(handleMessage));
    state.cleanups.push(options.transport.onError(recordLaserStreamError));
    state.cleanups.push(
      options.transport.onClose(() => {
        clearRuntimeTimer();
        state.connectionState = "disconnected";
        state.reasonCodes = uniqueStrings([
          ...state.reasonCodes,
          managedStreamClientReasonCodes.laserstreamDisconnected
        ]);
        started = false;
      })
    );
  }

  return createClientFacade({
    kind: "laserstream",
    provider: "laserstream",
    enabled: options.enabled ?? false,
    validation,
    state,
    start: async () => {
      if (!readiness.canConnect) {
        state.connectionState = "blocked";
        return;
      }

      if (started) {
        return;
      }

      state.connectionState = "connecting";
      state.reasonCodes = uniqueStrings([
        ...state.reasonCodes,
        managedStreamClientReasonCodes.laserstreamConnectionAttempted
      ]);

      if (options.transport) {
        await options.transport.connect();
        state.connectionState = "connected";
        state.reasonCodes = uniqueStrings([
          ...state.reasonCodes,
          managedStreamClientReasonCodes.laserstreamConnected
        ]);

        if (state.subscriptionConfig) {
          await options.transport.send(
            buildLaserStreamSdkSubscriptionRequest(
              state.subscriptionConfig,
              createReplayOptions(readiness)
            )
          );
          state.subscribed = true;
          state.reasonCodes = uniqueStrings([
            ...state.reasonCodes,
            managedStreamClientReasonCodes.subscriptionBuilt
          ]);
        }

        started = true;
        startRuntimeTimer();
        return;
      }

      let sdk: unknown;

      try {
        sdk = await loadLaserStreamSdk(options.sdkLoader);
      } catch (error) {
        const normalized = normalizeProviderError(error);
        state.connectionState = "not_implemented";
        state.lastError = normalized.message;
        state.errorCount += 1;
        state.reasonCodes = uniqueStrings([
          ...state.reasonCodes,
          managedStreamClientReasonCodes.sdkNotInstalledOrNotImplemented
        ]);
        return;
      }

      const subscribe = readLaserStreamSubscribe(sdk);

      if (!subscribe) {
        state.connectionState = "not_implemented";
        state.lastError = managedStreamClientReasonCodes.sdkNotInstalledOrNotImplemented;
        state.reasonCodes = uniqueStrings([
          ...state.reasonCodes,
          managedStreamClientReasonCodes.sdkNotInstalledOrNotImplemented
        ]);
        return;
      }

      const request = buildLaserStreamSdkSubscriptionRequest(
        state.subscriptionConfig ?? createDefaultLaserStreamSubscriptionConfig(options),
        createReplayOptions(readiness)
      );
      const subscribeResult = subscribe(
        createLaserStreamSdkConfig(options),
        request,
        handleMessage,
        recordLaserStreamError
      );

      if (isPromiseLike(subscribeResult)) {
        void Promise.resolve(subscribeResult)
          .then((handle) => {
            sdkHandle = handle;
          })
          .catch((error: unknown) => {
            recordLaserStreamError(error);
            state.connectionState = "not_implemented";
            state.reasonCodes = uniqueStrings([
              ...state.reasonCodes,
              managedStreamClientReasonCodes.sdkNotInstalledOrNotImplemented
            ]);
          });
      } else {
        sdkHandle = subscribeResult;
      }

      state.subscribed = true;
      state.connectionState = "connected";
      state.reasonCodes = uniqueStrings([
        ...state.reasonCodes,
        managedStreamClientReasonCodes.subscriptionBuilt,
        managedStreamClientReasonCodes.laserstreamConnected
      ]);
      started = true;
      startRuntimeTimer();
    },
    stop: stopClient,
    subscribe: async (config) => {
      state.subscriptionConfig = cloneSubscriptionConfig({
        ...config,
        provider: "laserstream"
      });
      state.subscribed = true;

      if (readiness.canConnect && state.connectionState === "connected") {
        const request = buildLaserStreamSdkSubscriptionRequest(
          state.subscriptionConfig,
          createReplayOptions(readiness)
        );

        if (options.transport) {
          await options.transport.send(request);
        }
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

export function buildLaserStreamSdkSubscriptionRequest(
  config: ManagedStreamSubscriptionConfig,
  options: { replayFromSlot?: number | undefined } = {}
): LaserStreamSdkSubscriptionRequest {
  const subscriptionConfig = cloneSubscriptionConfig({
    ...config,
    provider: "laserstream"
  });
  const request: LaserStreamSdkSubscriptionRequest = {
    accounts: subscriptionConfig.accounts.enabled
      ? {
          axi_accounts: {
            owner: [...subscriptionConfig.accounts.owners],
            account: [...subscriptionConfig.accounts.accounts]
          }
        }
      : {},
    slots: subscriptionConfig.slots.enabled ? { axi_slots: {} } : {},
    transactions: subscriptionConfig.transactions.enabled
      ? {
          axi_pumpfun_transactions: {
            vote: subscriptionConfig.transactions.vote,
            failed: subscriptionConfig.transactions.failed,
            accountInclude: [...subscriptionConfig.transactions.accountInclude],
            accountExclude: [...subscriptionConfig.transactions.accountExclude],
            accountRequired: [...subscriptionConfig.transactions.accountRequired]
          }
        }
      : {},
    transactionsStatus: {},
    blocks: subscriptionConfig.blocks.enabled ? { axi_blocks: {} } : {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    commitment: subscriptionConfig.commitment,
    ...(options.replayFromSlot !== undefined
      ? { fromSlot: options.replayFromSlot }
      : {})
  };

  return request;
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
  const transactionRecord = readRecord(record, "transaction");
  const innerTransactionRecord = transactionRecord
    ? readRecord(transactionRecord, "transaction")
    : null;
  const transactionMessageRecord =
    (innerTransactionRecord
      ? readRecord(innerTransactionRecord, "message")
      : null) ??
    (transactionRecord ? readRecord(transactionRecord, "message") : null);
  const metaRecord =
    readRecord(record, "meta") ??
    (transactionRecord ? readRecord(transactionRecord, "meta") : null) ??
    (innerTransactionRecord ? readRecord(innerTransactionRecord, "meta") : null);
  const streamType = readStreamType(record);
  const receivedAt =
    typeof record.receivedAt === "string"
      ? record.receivedAt
      : options.now().toISOString();
  const signature = readFirstString([
    record.signature,
    transactionRecord?.signature,
    innerTransactionRecord?.signature
  ]);
  const slot = readFirstNumber([
    record.slot,
    transactionRecord?.slot,
    innerTransactionRecord?.slot
  ]);
  const blockTime = readFirstStringOrNumber([
    record.blockTime,
    transactionRecord?.blockTime,
    innerTransactionRecord?.blockTime
  ]);
  const programIds = uniqueStrings([
    ...readStringArray(record, "programIds"),
    ...(transactionRecord ? readStringArray(transactionRecord, "programIds") : []),
    ...(innerTransactionRecord
      ? readStringArray(innerTransactionRecord, "programIds")
      : [])
  ]);
  const accountKeys = uniqueStrings([
    ...readStringArray(record, "accountKeys"),
    ...(transactionRecord ? readStringArray(transactionRecord, "accountKeys") : []),
    ...(innerTransactionRecord
      ? readStringArray(innerTransactionRecord, "accountKeys")
      : []),
    ...(transactionMessageRecord
      ? readStringArray(transactionMessageRecord, "accountKeys")
      : [])
  ]);
  const logs = uniqueStrings([
    ...readStringArray(record, "logs"),
    ...(transactionRecord ? readStringArray(transactionRecord, "logs") : []),
    ...(metaRecord ? readStringArray(metaRecord, "logMessages") : [])
  ]);
  const err =
    record.err ??
    transactionRecord?.err ??
    innerTransactionRecord?.err ??
    metaRecord?.err;
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
      ...(streamType === "transaction"
        ? [streamReasonCodes.transactionReceived]
        : streamType === "account"
          ? [streamReasonCodes.accountReceived]
          : [])
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
      transaction:
        innerTransactionRecord ??
        transactionRecord?.transaction ??
        record.transaction ??
        message,
      ...(metaRecord !== null ? { meta: metaRecord } : {}),
      ...(logs.length > 0 ? { logs } : {}),
      ...(err !== undefined ? { err } : {})
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

function createDefaultLaserStreamSubscriptionConfig(
  options: LaserStreamRealConnectionOptions
): ManagedStreamSubscriptionConfig {
  const accountInclude = uniqueStrings([
    ...(options.accountInclude ?? []),
    ...(options.programInclude ?? [])
  ]);

  return createDefaultSubscriptionConfig({
    provider: "laserstream",
    authConfigured:
      options.apiKey !== undefined && options.apiKey.trim().length > 0,
    commitment: options.commitment ?? "confirmed",
    transactions: {
      enabled: options.transactionsEnabled ?? true,
      accountInclude,
      accountExclude: uniqueStrings(options.accountExclude ?? []),
      accountRequired: uniqueStrings(options.accountRequired ?? []),
      vote: options.includeVotes ?? false,
      failed: options.includeFailed ?? false
    },
    maxReconnectAttempts: options.reconnectEnabled === false ? 0 : 10,
    reconnectBackoffMs: options.reconnectEnabled === false ? 0 : 1000,
    ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {})
  });
}

function createReplayOptions(
  readiness: LaserStreamRealReadiness
): { replayFromSlot?: number } {
  if (
    readiness.maskedConfig.replayEnabled &&
    readiness.maskedConfig.replayFromSlot !== null
  ) {
    return { replayFromSlot: readiness.maskedConfig.replayFromSlot };
  }

  return {};
}

async function loadLaserStreamSdk(
  sdkLoader: (() => Promise<unknown>) | undefined
): Promise<unknown> {
  if (sdkLoader) {
    return sdkLoader();
  }

  try {
    const moduleName = "helius-laserstream";
    return await import(moduleName);
  } catch (error) {
    const normalized = normalizeProviderError(error);
    throw new Error(
      `${managedStreamClientReasonCodes.sdkNotInstalledOrNotImplemented}: ${normalized.message}`
    );
  }
}

function readLaserStreamSubscribe(sdk: unknown): LaserStreamSubscribe | null {
  if (isRecord(sdk) && typeof sdk.subscribe === "function") {
    return sdk.subscribe as LaserStreamSubscribe;
  }

  return null;
}

function createLaserStreamSdkConfig(
  options: LaserStreamRealConnectionOptions
): Record<string, unknown> {
  return {
    endpoint: options.endpoint,
    apiKey: options.apiKey,
    ...(options.region !== undefined ? { region: options.region } : {}),
    reconnect: options.reconnectEnabled ?? true
  };
}

async function closeSdkHandle(handle: unknown): Promise<void> {
  if (!isRecord(handle)) {
    return;
  }

  for (const method of ["close", "stop", "unsubscribe", "cancel"] as const) {
    const candidate = handle[method];

    if (typeof candidate === "function") {
      const result = candidate.call(handle);

      if (isPromiseLike(result)) {
        await result;
      }

      return;
    }
  }
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
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

function readRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function readFirstString(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readFirstNumber(values: readonly unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function readFirstStringOrNumber(
  values: readonly unknown[]
): number | string | null | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (value === null) {
      return null;
    }
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
