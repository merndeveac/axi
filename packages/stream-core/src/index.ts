export type ManagedStreamProviderKind =
  | "mock"
  | "yellowstone"
  | "laserstream"
  | "geyser"
  | "unknown";

export type ManagedStreamConnectionState =
  | "disabled"
  | "blocked"
  | "configured"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "not_implemented";

export type ManagedStreamCommitment =
  | "processed"
  | "confirmed"
  | "finalized";

export type ManagedStreamType =
  | "transaction"
  | "account"
  | "slot"
  | "block"
  | "block_meta"
  | "unknown";

export const streamReasonCodes = {
  accountReceived: "STREAM_ACCOUNT_RECEIVED",
  authMissing: "STREAM_PROVIDER_AUTH_MISSING",
  connected: "STREAM_CONNECTED",
  disconnected: "STREAM_DISCONNECTED",
  endpointMasked: "STREAM_ENDPOINT_MASKED",
  error: "STREAM_ERROR",
  noNetworkInTests: "STREAM_NO_NETWORK_IN_TESTS",
  notImplemented: "STREAM_PROVIDER_NOT_IMPLEMENTED",
  providerDisabled: "STREAM_PROVIDER_DISABLED",
  providerLaserStream: "STREAM_PROVIDER_LASERSTREAM",
  providerMock: "STREAM_PROVIDER_MOCK",
  providerYellowstone: "STREAM_PROVIDER_YELLOWSTONE",
  subscriptionConfigured: "STREAM_SUBSCRIPTION_CONFIGURED",
  transactionReceived: "STREAM_TRANSACTION_RECEIVED"
} as const;

export type StreamReasonCode =
  (typeof streamReasonCodes)[keyof typeof streamReasonCodes] | (string & {});

export type ManagedStreamEnvelope = {
  id: string;
  provider: ManagedStreamProviderKind;
  connectionId?: string;
  schemaVersion: 1;
  chain: "solana";
  commitment: ManagedStreamCommitment;
  streamType: ManagedStreamType;
  slot?: number;
  blockTime?: number | string | null;
  signature?: string | null;
  programIds?: string[];
  accountKeys?: string[];
  receivedAt: string;
  raw: unknown;
  reasonCodes: string[];
};

export type ManagedStreamTransactionEnvelope = ManagedStreamEnvelope & {
  streamType: "transaction";
  transaction: unknown;
  meta?: unknown;
  logs?: string[];
  err?: unknown;
};

export type ManagedStreamSubscriptionConfig = {
  provider: ManagedStreamProviderKind;
  endpoint?: string;
  authConfigured: boolean;
  commitment: ManagedStreamCommitment;
  transactions: {
    enabled: boolean;
    accountInclude: string[];
    accountExclude: string[];
    accountRequired: string[];
    vote: boolean;
    failed: boolean;
  };
  accounts: {
    enabled: boolean;
    owners: string[];
    accounts: string[];
  };
  slots: {
    enabled: boolean;
  };
  blocks: {
    enabled: boolean;
  };
  maxReconnectAttempts: number;
  reconnectBackoffMs: number;
};

export type ManagedStreamProviderStatus = {
  provider: ManagedStreamProviderKind;
  enabled: boolean;
  configured: boolean;
  authConfigured: boolean;
  connectionState: ManagedStreamConnectionState;
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

export type ManagedStreamEnvelopeHandler = (
  envelope: ManagedStreamEnvelope
) => void | Promise<void>;

export type ManagedStreamProvider = {
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
  subscribe: (config: ManagedStreamSubscriptionConfig) => void | Promise<void>;
  onEnvelope: (handler: ManagedStreamEnvelopeHandler) => () => void;
  getStatus: () => ManagedStreamProviderStatus;
};

export type NormalizedProviderError = {
  name: string;
  message: string;
};

export function createStreamEnvelopeId(input: unknown): string {
  return `stream_${hashStable(stableStringify(input))}`;
}

export function maskStreamEndpoint(endpoint: string | undefined): string | null {
  if (!endpoint || endpoint.trim().length === 0) {
    return null;
  }

  const trimmed = endpoint.trim();

  try {
    const url = new URL(trimmed);
    url.username = url.username ? "user" : "";
    url.password = url.password ? "****" : "";

    for (const key of Array.from(url.searchParams.keys())) {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, "****");
      }
    }

    return url.toString();
  } catch {
    return trimmed.replace(/[?].*$/u, "?****");
  }
}

export function maskAuthToken(token: string | undefined): string | null {
  if (!token || token.trim().length === 0) {
    return null;
  }

  return `configured:${token.trim().length}`;
}

export function getEnvelopeSignature(
  envelope: ManagedStreamEnvelope
): string | null {
  if (typeof envelope.signature === "string" && envelope.signature.length > 0) {
    return envelope.signature;
  }

  if (isRecord(envelope.raw)) {
    const rawSignature = envelope.raw.signature;

    if (typeof rawSignature === "string" && rawSignature.length > 0) {
      return rawSignature;
    }
  }

  return null;
}

export function getEnvelopeProgramIds(envelope: ManagedStreamEnvelope): string[] {
  if (Array.isArray(envelope.programIds)) {
    return uniqueStrings(envelope.programIds);
  }

  return [];
}

export function getEnvelopeAccountKeys(envelope: ManagedStreamEnvelope): string[] {
  if (Array.isArray(envelope.accountKeys)) {
    return uniqueStrings(envelope.accountKeys);
  }

  return [];
}

export function isTransactionEnvelope(
  envelope: ManagedStreamEnvelope
): envelope is ManagedStreamTransactionEnvelope {
  return envelope.streamType === "transaction" && "transaction" in envelope;
}

export function normalizeProviderError(error: unknown): NormalizedProviderError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeErrorMessage(error.message)
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: sanitizeErrorMessage(error)
    };
  }

  return {
    name: "UnknownError",
    message: "Unknown managed stream provider error"
  };
}

export function createDisabledStreamProvider(
  kind: ManagedStreamProviderKind
): ManagedStreamProvider {
  return createStaticProvider(kind, "disabled", false);
}

export function createNotImplementedProvider(
  kind: ManagedStreamProviderKind
): ManagedStreamProvider {
  return createStaticProvider(kind, "not_implemented", true);
}

export function createDefaultSubscriptionConfig(
  input: Partial<ManagedStreamSubscriptionConfig> & {
    provider: ManagedStreamProviderKind;
  }
): ManagedStreamSubscriptionConfig {
  return {
    provider: input.provider,
    authConfigured: input.authConfigured ?? false,
    commitment: input.commitment ?? "confirmed",
    transactions: {
      enabled: input.transactions?.enabled ?? true,
      accountInclude: [...(input.transactions?.accountInclude ?? [])],
      accountExclude: [...(input.transactions?.accountExclude ?? [])],
      accountRequired: [...(input.transactions?.accountRequired ?? [])],
      vote: input.transactions?.vote ?? false,
      failed: input.transactions?.failed ?? false
    },
    accounts: {
      enabled: input.accounts?.enabled ?? false,
      owners: [...(input.accounts?.owners ?? [])],
      accounts: [...(input.accounts?.accounts ?? [])]
    },
    slots: {
      enabled: input.slots?.enabled ?? false
    },
    blocks: {
      enabled: input.blocks?.enabled ?? false
    },
    maxReconnectAttempts: input.maxReconnectAttempts ?? 10,
    reconnectBackoffMs: input.reconnectBackoffMs ?? 1000,
    ...(input.endpoint !== undefined ? { endpoint: input.endpoint } : {})
  };
}

function createStaticProvider(
  kind: ManagedStreamProviderKind,
  state: "disabled" | "not_implemented",
  enabled: boolean
): ManagedStreamProvider {
  const handlers = new Set<ManagedStreamEnvelopeHandler>();
  let subscriptions: ManagedStreamSubscriptionConfig | null = null;
  let subscribed = false;
  let stopped = state === "disabled";
  const reasonCodes = uniqueStrings([
    providerReasonCode(kind),
    state === "disabled"
      ? streamReasonCodes.providerDisabled
      : streamReasonCodes.notImplemented,
    streamReasonCodes.noNetworkInTests
  ]);

  return {
    start: () => {
      stopped = false;
    },
    stop: () => {
      stopped = true;
    },
    subscribe: (config) => {
      subscriptions = cloneSubscriptionConfig(config);
      subscribed = true;
    },
    onEnvelope: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    getStatus: () => ({
      provider: kind,
      enabled,
      configured: false,
      authConfigured: false,
      connectionState: stopped && state !== "not_implemented" ? "disabled" : state,
      commitment: subscriptions?.commitment ?? "confirmed",
      subscribed,
      subscriptions,
      receivedCount: 0,
      transactionCount: 0,
      accountCount: 0,
      errorCount: 0,
      lastMessageAt: null,
      lastError: null,
      reasonCodes
    })
  };
}

function cloneSubscriptionConfig(
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

function providerReasonCode(kind: ManagedStreamProviderKind): string {
  if (kind === "mock") {
    return streamReasonCodes.providerMock;
  }

  if (kind === "yellowstone" || kind === "geyser") {
    return streamReasonCodes.providerYellowstone;
  }

  if (kind === "laserstream") {
    return streamReasonCodes.providerLaserStream;
  }

  return streamReasonCodes.notImplemented;
}

function isSensitiveKey(key: string): boolean {
  return /token|key|secret|auth|password|bearer/u.test(key.toLowerCase());
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/([?&](?:token|key|secret|auth|password|bearer)=)[^&\s]+/giu, "$1****")
    .replace(/bearer\s+[a-z0-9._-]+/giu, "bearer ****")
    .replace(/api[_-]?key\s*[:=]\s*[a-z0-9._-]+/giu, "apiKey=****");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function hashStable(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36).padStart(7, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string"))
  );
}
