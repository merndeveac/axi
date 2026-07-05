import {
  listPumpfunFixtures,
  loadPumpfunFixture,
  type FixtureManifestEntry
} from "@axi/pumpfun-decoder";
import {
  createDefaultSubscriptionConfig,
  createStreamEnvelopeId,
  maskStreamEndpoint,
  normalizeProviderError,
  streamReasonCodes,
  type ManagedStreamCommitment,
  type ManagedStreamEnvelope,
  type ManagedStreamEnvelopeHandler,
  type ManagedStreamProvider,
  type ManagedStreamProviderStatus,
  type ManagedStreamSubscriptionConfig,
  type ManagedStreamTransactionEnvelope
} from "@axi/stream-core";

export type MockStreamScenarioName =
  | "pumpfun_basic"
  | "pumpfun_trades"
  | "empty"
  | "error_after_n";

export type MockManagedStreamProviderOptions = {
  scenario?: MockStreamScenarioName;
  intervalMs?: number;
  loop?: boolean;
  maxEvents?: number;
  fixtureDir?: string;
  manifestPath?: string;
  commitment?: ManagedStreamCommitment;
  connectionId?: string;
  errorAfterN?: number;
  now?: () => Date;
};

export type MockStreamScenario = {
  name: MockStreamScenarioName;
  envelopes: ManagedStreamEnvelope[];
  reasonCodes: string[];
};

export function createMockManagedStreamProvider(
  options: MockManagedStreamProviderOptions = {}
): ManagedStreamProvider {
  const scenarioName = options.scenario ?? "pumpfun_basic";
  const scenario = loadMockStreamScenario(scenarioName, options);
  const handlers = new Set<ManagedStreamEnvelopeHandler>();
  const intervalMs = Math.max(0, options.intervalMs ?? 0);
  const loop = options.loop ?? false;
  const maxEvents = options.maxEvents;
  const errorAfterN =
    scenarioName === "error_after_n" ? options.errorAfterN ?? 1 : options.errorAfterN;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let subscriptions: ManagedStreamSubscriptionConfig =
    createDefaultSubscriptionConfig({
      provider: "mock",
      authConfigured: false,
      commitment: options.commitment ?? "confirmed"
    });
  let subscribed = false;
  let connectionState: ManagedStreamProviderStatus["connectionState"] = "configured";
  let stopped = true;
  let receivedCount = 0;
  let transactionCount = 0;
  let accountCount = 0;
  let errorCount = 0;
  let lastMessageAt: string | null = null;
  let lastError: string | null = null;

  function start(): void {
    stopped = false;
    connectionState = "connected";
    emitScenario();
  }

  function stop(): void {
    stopped = true;
    connectionState = "disconnected";

    for (const timer of timers) {
      clearTimeout(timer);
    }

    timers.clear();
  }

  function subscribe(config: ManagedStreamSubscriptionConfig): void {
    subscriptions = cloneSubscriptionConfig(config);
    subscribed = true;
  }

  function onEnvelope(handler: ManagedStreamEnvelopeHandler): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  function getStatus(): ManagedStreamProviderStatus {
    return {
      provider: "mock",
      enabled: true,
      configured: true,
      authConfigured: false,
      connectionState,
      commitment: subscriptions.commitment,
      subscribed,
      subscriptions: cloneSubscriptionConfig(subscriptions),
      receivedCount,
      transactionCount,
      accountCount,
      errorCount,
      lastMessageAt,
      lastError,
      reasonCodes: [
        streamReasonCodes.providerMock,
        streamReasonCodes.noNetworkInTests,
        ...(subscribed ? [streamReasonCodes.subscriptionConfigured] : []),
        ...(connectionState === "connected" ? [streamReasonCodes.connected] : []),
        ...(connectionState === "disconnected"
          ? [streamReasonCodes.disconnected]
          : []),
        ...(errorCount > 0 ? [streamReasonCodes.error] : [])
      ]
    };
  }

  function emitScenario(): void {
    const envelopes = scenario.envelopes.slice(0, maxEvents ?? scenario.envelopes.length);

    if (intervalMs === 0) {
      emitImmediate(envelopes);
      return;
    }

    envelopes.forEach((envelope, index) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        emitEnvelope(envelope);

        if (loop && index === envelopes.length - 1 && !stopped) {
          emitScenario();
        }
      }, index * intervalMs);
      timers.add(timer);
    });
  }

  function emitImmediate(envelopes: ManagedStreamEnvelope[]): void {
    do {
      for (const envelope of envelopes) {
        emitEnvelope(envelope);

        if (stopped) {
          return;
        }
      }
    } while (loop && !stopped);
  }

  function emitEnvelope(envelope: ManagedStreamEnvelope): void {
    if (stopped) {
      return;
    }

    if (errorAfterN !== undefined && receivedCount >= errorAfterN) {
      errorCount += 1;
      lastError = "Mock stream configured error";
      connectionState = "error";
      stopped = true;
      return;
    }

    receivedCount += 1;
    lastMessageAt = envelope.receivedAt;

    if (envelope.streamType === "transaction") {
      transactionCount += 1;
    }

    if (envelope.streamType === "account") {
      accountCount += 1;
    }

    for (const handler of handlers) {
      try {
        const result = handler(envelope);

        if (result instanceof Promise) {
          void result.catch((error) => {
            const normalized = normalizeProviderError(error);
            errorCount += 1;
            lastError = normalized.message;
            connectionState = "error";
          });
        }
      } catch (error) {
        const normalized = normalizeProviderError(error);
        errorCount += 1;
        lastError = normalized.message;
        connectionState = "error";
      }
    }
  }

  return {
    start,
    stop,
    subscribe,
    onEnvelope,
    getStatus
  };
}

export function loadMockStreamScenario(
  name: MockStreamScenarioName,
  options: MockManagedStreamProviderOptions = {}
): MockStreamScenario {
  if (name === "empty") {
    return {
      name,
      envelopes: [],
      reasonCodes: [streamReasonCodes.providerMock, streamReasonCodes.noNetworkInTests]
    };
  }

  if (name === "pumpfun_trades") {
    return createPumpfunFixtureStreamScenario({
      ...options,
      name,
      kinds: ["buy_trade", "sell_trade"]
    });
  }

  if (name === "error_after_n") {
    return createPumpfunFixtureStreamScenario({
      ...options,
      name,
      kinds: ["token_created", "buy_trade"]
    });
  }

  return createPumpfunFixtureStreamScenario({
    ...options,
    name,
    kinds: [
      "token_created",
      "buy_trade",
      "sell_trade",
      "migration",
      "failed_transaction",
      "unknown"
    ]
  });
}

export function createPumpfunFixtureStreamScenario(
  options: MockManagedStreamProviderOptions & {
    name?: MockStreamScenarioName;
    kinds?: string[];
  } = {}
): MockStreamScenario {
  const fixtureKinds = new Set(options.kinds ?? []);
  const entries = listPumpfunFixtures().filter(
    (entry) => fixtureKinds.size === 0 || fixtureKinds.has(entry.kind)
  );
  const envelopes = entries.map((entry) =>
    createMockTransactionEnvelopeFromFixture(loadPumpfunFixture(entry.filename), {
      entry,
      ...(options.commitment !== undefined
        ? { commitment: options.commitment }
        : {}),
      ...(options.connectionId !== undefined
        ? { connectionId: options.connectionId }
        : {}),
      ...(options.now !== undefined ? { now: options.now } : {})
    })
  );

  return {
    name: options.name ?? "pumpfun_basic",
    envelopes,
    reasonCodes: [streamReasonCodes.providerMock, streamReasonCodes.noNetworkInTests]
  };
}

export function createMockTransactionEnvelopeFromFixture(
  fixture: unknown,
  options: {
    commitment?: ManagedStreamCommitment;
    connectionId?: string;
    entry?: FixtureManifestEntry;
    now?: () => Date;
  } = {}
): ManagedStreamTransactionEnvelope {
  const record = asRecord(fixture);
  const signature =
    readString(record, "signature") ??
    readFirstString(readPath(record, ["transaction", "signatures"]));
  const slot = readNumber(record, "slot");
  const blockTime = readNumber(record, "blockTime");
  const receivedAt = blockTime
    ? new Date(blockTime * 1000).toISOString()
    : (options.now?.() ?? new Date("1970-01-01T00:00:00.000Z")).toISOString();
  const transaction = record.transaction ?? {};
  const meta = record.meta;
  const logs = readStringArray(readPath(record, ["meta", "logMessages"]));
  const err = readPath(record, ["meta", "err"]);
  const accountKeys = extractAccountKeys(record);
  const programIds = extractProgramIds(record, accountKeys);
  const envelopeInput = {
    provider: "mock",
    signature,
    slot,
    blockTime,
    filename: options.entry?.filename
  };

  return {
    id: createStreamEnvelopeId(envelopeInput),
    provider: "mock",
    schemaVersion: 1,
    chain: "solana",
    commitment: options.commitment ?? "confirmed",
    streamType: "transaction",
    blockTime: blockTime ?? null,
    signature,
    programIds,
    accountKeys,
    receivedAt,
    raw: fixture,
    reasonCodes: [
      streamReasonCodes.providerMock,
      streamReasonCodes.transactionReceived,
      streamReasonCodes.noNetworkInTests
    ],
    transaction,
    ...(options.connectionId !== undefined
      ? { connectionId: options.connectionId }
      : {}),
    ...(slot !== null ? { slot } : {}),
    ...(meta !== undefined ? { meta } : {}),
    ...(logs !== undefined ? { logs } : {}),
    ...(err !== undefined ? { err } : {})
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

function extractAccountKeys(record: Record<string, unknown>): string[] {
  const accountKeys = readPath(record, ["transaction", "message", "accountKeys"]);

  if (!Array.isArray(accountKeys)) {
    return [];
  }

  return uniqueStrings(
    accountKeys
      .map((key) => {
        if (typeof key === "string") {
          return key;
        }

        if (isRecord(key)) {
          return readString(key, "pubkey") ?? readString(key, "publicKey");
        }

        return null;
      })
      .filter(Boolean)
  );
}

function extractProgramIds(
  record: Record<string, unknown>,
  accountKeys: string[]
): string[] {
  const instructions = readPath(record, ["transaction", "message", "instructions"]);

  if (!Array.isArray(instructions)) {
    return [];
  }

  return uniqueStrings(
    instructions
      .map((instruction) => {
        if (!isRecord(instruction)) {
          return null;
        }

        const programId = readString(instruction, "programId");
        const programIdIndex = readNumber(instruction, "programIdIndex");

        if (programId) {
          return programId;
        }

        if (programIdIndex !== null) {
          return accountKeys[programIdIndex] ?? null;
        }

        return null;
      })
      .filter(Boolean)
  );
}

function readPath(
  value: Record<string, unknown>,
  path: readonly string[]
): unknown {
  let current: unknown = value;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readFirstString(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string"))
  );
}
