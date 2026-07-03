import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  type Commitment,
  type ConfirmedSignatureInfo,
  type Logs,
  type ParsedTransactionWithMeta
} from "@solana/web3.js";

export type SolanaRpcCommitment = Commitment;

export type WatchedAddressKind =
  | "mint"
  | "pool"
  | "bonding_curve"
  | "program"
  | "token_account"
  | "wallet"
  | "unknown";

export type WatchedAddress = {
  address: string;
  addedAt: string;
  kind: WatchedAddressKind;
  label?: string;
  mint?: string;
  reasonCodes: string[];
  source?: string;
  symbol?: string;
};

export type WatchedAddressInput = {
  address: string;
  addedAt?: string;
  kind?: WatchedAddressKind;
  label?: string;
  mint?: string;
  reasonCodes?: string[];
  source?: string;
  symbol?: string;
};

export type WatchedAddressRegistryOptions = {
  maxWatchedAddresses?: number;
  now?: () => Date;
  watchedAddresses?: WatchedAddressInput[];
};

export type ChainTransactionEvent = {
  type: "chain_transaction";
  source: "solana_rpc";
  signature: string;
  slot?: number;
  blockTime?: number | null;
  watchedAddress: string;
  watchedAddressKind: WatchedAddressKind;
  mint?: string;
  status: "parsed" | "unclassified" | "errored";
  reasonCodes: string[];
  raw?: unknown;
  receivedAt: string;
};

export type ChainTradeSide = "buy" | "sell" | "unknown";
export type ChainTradeConfidence = "low" | "medium" | "high";

export type NormalizedChainTradeEvent = {
  type: "trade";
  source: "solana_rpc";
  mint: string;
  symbol?: string;
  name?: string;
  side: ChainTradeSide;
  priceUsd?: number | null;
  volumeUsd?: number | null;
  tokenAmount?: number | null;
  trader?: string | null;
  signature: string;
  slot?: number;
  timestamp: string;
  watchedAddress: string;
  confidence: ChainTradeConfidence;
  reasonCodes: string[];
  raw?: unknown;
};

export type TokenBalanceChange = {
  owner?: string | null;
  accountIndex?: number;
  mint: string;
  preAmountRaw: string;
  postAmountRaw: string;
  deltaRaw: string;
  decimals: number;
  preUiAmount: number;
  postUiAmount: number;
  deltaUiAmount: number;
};

export type SolBalanceChange = {
  accountIndex: number;
  account?: string;
  preLamports: number;
  postLamports: number;
  deltaLamports: number;
  deltaSol: number;
};

export type SolanaRpcClient = {
  getParsedTransaction: (
    signature: string,
    config: {
      commitment?: Commitment;
      maxSupportedTransactionVersion: 0;
    }
  ) => Promise<ParsedTransactionWithMeta | null>;
  getSignaturesForAddress: (
    publicKey: PublicKey,
    options?: { limit?: number },
    commitment?: Commitment
  ) => Promise<ConfirmedSignatureInfo[]>;
  onLogs: (
    publicKey: PublicKey,
    callback: (logs: Logs, context: { slot: number }) => void,
    commitment?: Commitment
  ) => Promise<number>;
  removeOnLogsListener: (clientSubscriptionId: number) => Promise<void>;
};

export type ChainEventsLogger = {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
};

export type SolanaTransactionIngestorCallbacks = {
  onChainEvent?: (event: ChainTransactionEvent) => void | Promise<void>;
  onError?: (error: Error, context?: Record<string, unknown>) => void;
  onTradeEvent?: (event: NormalizedChainTradeEvent) => void | Promise<void>;
};

export type SolanaTransactionIngestorOptions =
  SolanaTransactionIngestorCallbacks & {
    backfillLimitPerAddress?: number;
    backfillOnStart?: boolean;
    commitment?: Commitment;
    fetchTransactionOnLog?: boolean;
    logger?: ChainEventsLogger;
    maxConcurrentFetches?: number;
    maxWatchedAddresses?: number;
    reconnectInitialDelayMs?: number;
    reconnectMaxDelayMs?: number;
    requestTimeoutMs?: number;
    rpcClient?: SolanaRpcClient;
    rpcHttpUrl: string;
    rpcWsUrl: string;
    watchedAddresses?: WatchedAddressInput[];
  };

export type NormalizeTransactionInput = {
  error?: Error | string;
  raw?: unknown;
  receivedAt?: string;
  signature: string;
  transaction?: ParsedTransactionWithMeta | null;
  watchedAddress: WatchedAddress;
};

export type BackfillScannerOptions = {
  commitment?: Commitment;
  logger?: ChainEventsLogger;
  requestTimeoutMs?: number;
  rpcClient?: Pick<
    SolanaRpcClient,
    "getParsedTransaction" | "getSignaturesForAddress"
  >;
  rpcHttpUrl?: string;
};

export type BackfillScanOptions = {
  address: string;
  limit?: number;
  watchedAddress?: WatchedAddressInput;
};

export type BackfillRecord = {
  signature: string;
  transactionEvent: ChainTransactionEvent;
  tradeEvents: NormalizedChainTradeEvent[];
};

export class WatchedAddressRegistryError extends Error {
  readonly code: string;
  readonly reasonCodes: string[];

  constructor(code: string, message: string, reasonCodes: string[]) {
    super(message);
    this.name = "WatchedAddressRegistryError";
    this.code = code;
    this.reasonCodes = reasonCodes;
  }
}

const defaultCommitment: Commitment = "confirmed";
const defaultMaxWatchedAddresses = 25;
const defaultBackfillLimitPerAddress = 25;
const defaultRequestTimeoutMs = 10_000;
const defaultMaxConcurrentFetches = 4;

export class WatchedAddressRegistry {
  private readonly addresses = new Map<string, WatchedAddress>();
  private readonly maxWatchedAddresses: number;
  private readonly now: () => Date;

  constructor(options: WatchedAddressRegistryOptions = {}) {
    this.maxWatchedAddresses = Math.max(
      1,
      options.maxWatchedAddresses ?? defaultMaxWatchedAddresses
    );
    this.now = options.now ?? (() => new Date());

    for (const address of options.watchedAddresses ?? []) {
      this.add(address);
    }
  }

  add(input: WatchedAddressInput): WatchedAddress {
    if (!isValidSolanaAddress(input.address)) {
      throw new WatchedAddressRegistryError(
        "INVALID_SOLANA_ADDRESS",
        `${input.address} is not a valid Solana address.`,
        ["INVALID_SOLANA_ADDRESS"]
      );
    }

    const existing = this.addresses.get(input.address);

    if (!existing && this.addresses.size >= this.maxWatchedAddresses) {
      throw new WatchedAddressRegistryError(
        "WATCH_LIMIT_REACHED",
        `Cannot watch more than ${this.maxWatchedAddresses} addresses.`,
        ["WATCH_LIMIT_REACHED"]
      );
    }

    const watched: WatchedAddress = {
      address: input.address,
      addedAt: input.addedAt ?? existing?.addedAt ?? this.now().toISOString(),
      kind: input.kind ?? existing?.kind ?? "unknown",
      reasonCodes: uniqueReasonCodes([
        ...(existing?.reasonCodes ?? []),
        ...(input.reasonCodes ?? ["WATCHED_ADDRESS_ADDED"])
      ])
    };

    const label = input.label ?? existing?.label;
    const mint = input.mint ?? existing?.mint;
    const source = input.source ?? existing?.source;
    const symbol = input.symbol ?? existing?.symbol;

    if (label) {
      watched.label = label;
    }

    if (mint) {
      watched.mint = mint;
    }

    if (source) {
      watched.source = source;
    }

    if (symbol) {
      watched.symbol = symbol;
    }

    this.addresses.set(watched.address, watched);
    return watched;
  }

  remove(address: string): boolean {
    return this.addresses.delete(address);
  }

  get(address: string): WatchedAddress | undefined {
    return this.addresses.get(address);
  }

  list(): WatchedAddress[] {
    return Array.from(this.addresses.values());
  }

  size(): number {
    return this.addresses.size;
  }

  max(): number {
    return this.maxWatchedAddresses;
  }
}

export function createWatchedAddressRegistry(
  options: WatchedAddressRegistryOptions = {}
): WatchedAddressRegistry {
  return new WatchedAddressRegistry(options);
}

export class SolanaTransactionIngestor {
  private readonly backfillLimitPerAddress: number;
  private readonly backfillOnStart: boolean;
  private readonly callbacks: SolanaTransactionIngestorCallbacks;
  private readonly commitment: Commitment;
  private readonly fetchTransactionOnLog: boolean;
  private readonly logger: ChainEventsLogger;
  private readonly maxConcurrentFetches: number;
  private readonly registry: WatchedAddressRegistry;
  private readonly requestTimeoutMs: number;
  private readonly rpcClient: SolanaRpcClient;
  private activeFetchCount = 0;
  private fetchQueue: Array<() => void> = [];
  private running = false;
  private readonly subscriptions = new Map<string, number>();

  constructor(options: SolanaTransactionIngestorOptions) {
    this.commitment = options.commitment ?? defaultCommitment;
    this.fetchTransactionOnLog = options.fetchTransactionOnLog ?? true;
    this.backfillOnStart = options.backfillOnStart ?? false;
    this.backfillLimitPerAddress =
      options.backfillLimitPerAddress ?? defaultBackfillLimitPerAddress;
    this.maxConcurrentFetches = Math.max(
      1,
      options.maxConcurrentFetches ?? defaultMaxConcurrentFetches
    );
    this.requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
    this.logger = options.logger ?? {};
    this.callbacks = {
      ...(options.onChainEvent ? { onChainEvent: options.onChainEvent } : {}),
      ...(options.onError ? { onError: options.onError } : {}),
      ...(options.onTradeEvent ? { onTradeEvent: options.onTradeEvent } : {})
    };
    this.registry = createWatchedAddressRegistry({
      maxWatchedAddresses:
        options.maxWatchedAddresses ?? defaultMaxWatchedAddresses,
      ...(options.watchedAddresses
        ? { watchedAddresses: options.watchedAddresses }
        : {})
    });
    this.rpcClient =
      options.rpcClient ??
      (new Connection(options.rpcHttpUrl, {
        commitment: this.commitment,
        wsEndpoint: options.rpcWsUrl
      }) as unknown as SolanaRpcClient);
  }

  getWatchedAddresses(): WatchedAddress[] {
    return this.registry.list();
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  watchAddress(input: WatchedAddressInput): WatchedAddress {
    const watched = this.registry.add(input);

    if (this.running) {
      void this.subscribeAddress(watched);
    }

    return watched;
  }

  async unwatchAddress(address: string): Promise<boolean> {
    const removed = this.registry.remove(address);
    const subscription = this.subscriptions.get(address);

    if (subscription !== undefined) {
      this.subscriptions.delete(address);
      await this.rpcClient.removeOnLogsListener(subscription);
    }

    return removed;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    for (const watched of this.registry.list()) {
      await this.subscribeAddress(watched);
    }

    if (this.backfillOnStart) {
      const scanner = createBackfillScanner({
        commitment: this.commitment,
        logger: this.logger,
        requestTimeoutMs: this.requestTimeoutMs,
        rpcClient: this.rpcClient
      });

      for (const watched of this.registry.list()) {
        void scanner
          .scanAddress({
            address: watched.address,
            limit: this.backfillLimitPerAddress,
            watchedAddress: watched
          })
          .then((records) => this.emitBackfillRecords(records))
          .catch((error: unknown) => this.handleError(error, { watchedAddress: watched.address }));
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    const subscriptions = Array.from(this.subscriptions.entries());
    this.subscriptions.clear();

    await Promise.all(
      subscriptions.map(([, subscriptionId]) =>
        this.rpcClient.removeOnLogsListener(subscriptionId).catch((error: unknown) => {
          this.handleError(error, { subscriptionId });
        })
      )
    );
  }

  private async subscribeAddress(watched: WatchedAddress): Promise<void> {
    if (this.subscriptions.has(watched.address)) {
      return;
    }

    const publicKey = new PublicKey(watched.address);
    const subscriptionId = await this.rpcClient.onLogs(
      publicKey,
      (logs, context) => {
        void this.handleLogs(watched, logs, context.slot);
      },
      this.commitment
    );
    this.subscriptions.set(watched.address, subscriptionId);
    this.logger.info?.("Solana logs subscription connected", {
      address: watched.address,
      reasonCodes: ["SUBSCRIPTION_CONNECTED"]
    });
  }

  private async handleLogs(
    watched: WatchedAddress,
    logs: Logs,
    slot: number
  ): Promise<void> {
    if (!this.running) {
      return;
    }

    if (!this.fetchTransactionOnLog) {
      await this.emitChainEvent({
        type: "chain_transaction",
        source: "solana_rpc",
        signature: logs.signature,
        slot,
        watchedAddress: watched.address,
        watchedAddressKind: watched.kind,
        ...(watched.mint ? { mint: watched.mint } : {}),
        status: "unclassified",
        reasonCodes: ["WATCHED_ADDRESS_LOG", "UNCLASSIFIED_TRANSACTION"],
        raw: logs,
        receivedAt: new Date().toISOString()
      });
      return;
    }

    await this.enqueueFetch(async () => {
      try {
        const transaction = await this.rpcClient.getParsedTransaction(logs.signature, {
          commitment: this.commitment,
          maxSupportedTransactionVersion: 0
        });
        const input: NormalizeTransactionInput = {
          raw: logs,
          signature: logs.signature,
          transaction,
          watchedAddress: watched
        };
        const event = normalizeTransactionToChainEvents(input)[0];

        if (!event) {
          return;
        }

        const transactionEvent = {
          ...event,
          slot: event.slot ?? slot,
          reasonCodes: uniqueReasonCodes([
            "WATCHED_ADDRESS_LOG",
            ...event.reasonCodes
          ])
        };
        await this.emitChainEvent(transactionEvent);

        for (const tradeEvent of normalizeTransactionToTradeEvents(input)) {
          await this.emitTradeEvent({
            ...tradeEvent,
            slot: tradeEvent.slot ?? slot
          });
        }
      } catch (error) {
        await this.emitChainEvent({
          type: "chain_transaction",
          source: "solana_rpc",
          signature: logs.signature,
          slot,
          watchedAddress: watched.address,
          watchedAddressKind: watched.kind,
          ...(watched.mint ? { mint: watched.mint } : {}),
          status: "errored",
          reasonCodes: [
            "WATCHED_ADDRESS_LOG",
            "TRANSACTION_FETCH_FAILED"
          ],
          raw: {
            error: error instanceof Error ? error.message : String(error),
            logs
          },
          receivedAt: new Date().toISOString()
        });
        this.handleError(error, {
          signature: logs.signature,
          watchedAddress: watched.address
        });
      }
    });
  }

  private async enqueueFetch(task: () => Promise<void>): Promise<void> {
    if (this.activeFetchCount >= this.maxConcurrentFetches) {
      await new Promise<void>((resolve) => {
        this.fetchQueue.push(resolve);
      });
    }

    this.activeFetchCount += 1;

    try {
      await task();
    } finally {
      this.activeFetchCount -= 1;
      const next = this.fetchQueue.shift();
      next?.();
    }
  }

  private async emitBackfillRecords(records: BackfillRecord[]): Promise<void> {
    for (const record of records) {
      await this.emitChainEvent(record.transactionEvent);

      for (const tradeEvent of record.tradeEvents) {
        await this.emitTradeEvent(tradeEvent);
      }
    }
  }

  private async emitChainEvent(event: ChainTransactionEvent): Promise<void> {
    await this.callbacks.onChainEvent?.(event);
  }

  private async emitTradeEvent(event: NormalizedChainTradeEvent): Promise<void> {
    await this.callbacks.onTradeEvent?.(event);
  }

  private handleError(error: unknown, context?: Record<string, unknown>): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.logger.warn?.("Solana transaction ingestor error", {
      ...context,
      error: normalized.message
    });
    this.callbacks.onError?.(normalized, context);
  }
}

export function createSolanaTransactionIngestor(
  options: SolanaTransactionIngestorOptions
): SolanaTransactionIngestor {
  return new SolanaTransactionIngestor(options);
}

export class BackfillScanner {
  private readonly commitment: Commitment;
  private readonly logger: ChainEventsLogger;
  private readonly requestTimeoutMs: number;
  private readonly rpcClient: Pick<
    SolanaRpcClient,
    "getParsedTransaction" | "getSignaturesForAddress"
  >;

  constructor(options: BackfillScannerOptions = {}) {
    this.commitment = options.commitment ?? defaultCommitment;
    this.logger = options.logger ?? {};
    this.requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;

    if (options.rpcClient) {
      this.rpcClient = options.rpcClient;
      return;
    }

    if (!options.rpcHttpUrl) {
      throw new Error("rpcHttpUrl is required when rpcClient is not provided.");
    }

    this.rpcClient = new Connection(options.rpcHttpUrl, {
      commitment: this.commitment
    }) as unknown as Pick<
      SolanaRpcClient,
      "getParsedTransaction" | "getSignaturesForAddress"
    >;
  }

  async scanAddress(options: BackfillScanOptions): Promise<BackfillRecord[]> {
    if (!isValidSolanaAddress(options.address)) {
      throw new WatchedAddressRegistryError(
        "INVALID_SOLANA_ADDRESS",
        `${options.address} is not a valid Solana address.`,
        ["INVALID_SOLANA_ADDRESS"]
      );
    }

    const watched = normalizeWatchedAddressInput(
      options.watchedAddress ?? {
        address: options.address,
        kind: "unknown",
        reasonCodes: ["BACKFILL_WATCHED_ADDRESS"]
      }
    );
    const publicKey = new PublicKey(options.address);
    const signatures = await this.withTimeout(
      this.rpcClient.getSignaturesForAddress(
        publicKey,
        { limit: options.limit ?? defaultBackfillLimitPerAddress },
        this.commitment
      ),
      "getSignaturesForAddress"
    );
    const records: BackfillRecord[] = [];

    for (const signatureInfo of signatures) {
      const transaction = await this.withTimeout(
        this.rpcClient.getParsedTransaction(signatureInfo.signature, {
          commitment: this.commitment,
          maxSupportedTransactionVersion: 0
        }),
        "getParsedTransaction"
      );
      const input: NormalizeTransactionInput = {
        signature: signatureInfo.signature,
        transaction,
        watchedAddress: watched
      };
      const transactionEvent = normalizeTransactionToChainEvents(input)[0];

      if (!transactionEvent) {
        continue;
      }

      records.push({
        signature: signatureInfo.signature,
        transactionEvent,
        tradeEvents: normalizeTransactionToTradeEvents(input)
      });
    }

    return records;
  }

  private async withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`${operation} timed out after ${this.requestTimeoutMs}ms`));
          }, this.requestTimeoutMs);
        })
      ]);
    } catch (error) {
      this.logger.warn?.("Solana backfill RPC call failed", {
        error: error instanceof Error ? error.message : String(error),
        operation
      });
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

export function createBackfillScanner(
  options: BackfillScannerOptions = {}
): BackfillScanner {
  return new BackfillScanner(options);
}

export function normalizeTransactionToChainEvents(
  input: NormalizeTransactionInput
): ChainTransactionEvent[] {
  const receivedAt = input.receivedAt ?? new Date().toISOString();

  if (input.error || !input.transaction) {
    return [
      {
        type: "chain_transaction",
        source: "solana_rpc",
        signature: input.signature,
        watchedAddress: input.watchedAddress.address,
        watchedAddressKind: input.watchedAddress.kind,
        ...(input.watchedAddress.mint ? { mint: input.watchedAddress.mint } : {}),
        status: input.error ? "errored" : "unclassified",
        reasonCodes: input.error
          ? ["TRANSACTION_FETCH_FAILED"]
          : ["UNCLASSIFIED_TRANSACTION"],
        raw: input.raw ?? {
          error:
            typeof input.error === "string"
              ? input.error
              : input.error?.message
        },
        receivedAt
      }
    ];
  }

  const tokenChanges = extractTokenBalanceChanges(input.transaction);
  const solChanges = extractSolBalanceChanges(input.transaction);
  const reasonCodes = ["TRANSACTION_FETCHED"];

  if (tokenChanges.length > 0) {
    reasonCodes.push("TOKEN_BALANCE_CHANGES_FOUND");
  }

  if (solChanges.length > 0) {
    reasonCodes.push("SOL_BALANCE_CHANGES_FOUND");
  }

  if (tokenChanges.length === 0 && solChanges.length === 0) {
    reasonCodes.push("UNCLASSIFIED_TRANSACTION");
  }

  const mint = input.watchedAddress.mint ?? tokenChanges[0]?.mint;

  return [
    {
      type: "chain_transaction",
      source: "solana_rpc",
      signature: input.signature,
      ...(input.transaction.slot !== undefined ? { slot: input.transaction.slot } : {}),
      blockTime: input.transaction.blockTime ?? null,
      watchedAddress: input.watchedAddress.address,
      watchedAddressKind: input.watchedAddress.kind,
      ...(mint ? { mint } : {}),
      status:
        tokenChanges.length > 0 || solChanges.length > 0
          ? "parsed"
          : "unclassified",
      reasonCodes: uniqueReasonCodes(reasonCodes),
      raw: input.raw ?? input.transaction,
      receivedAt
    }
  ];
}

export function normalizeTransactionToTradeEvents(
  input: NormalizeTransactionInput
): NormalizedChainTradeEvent[] {
  const trade = classifyPossibleTrade(input);
  return trade ? [trade] : [];
}

export function classifyPossibleTrade(
  input: NormalizeTransactionInput
): NormalizedChainTradeEvent | null {
  if (!input.transaction) {
    return null;
  }

  const tokenChanges = extractTokenBalanceChanges(input.transaction);
  const solChanges = extractSolBalanceChanges(input.transaction);

  if (tokenChanges.length === 0) {
    return null;
  }

  const primaryTokenChange = tokenChanges
    .filter((change) => change.deltaUiAmount !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.deltaUiAmount) - Math.abs(left.deltaUiAmount)
    )[0];

  if (!primaryTokenChange) {
    return null;
  }

  const negativeSol = solChanges.some((change) => change.deltaLamports < 0);
  const positiveSol = solChanges.some((change) => change.deltaLamports > 0);
  const tokenDelta = primaryTokenChange.deltaUiAmount;
  let side: ChainTradeSide = "unknown";
  const reasonCodes = [
    "CHAIN_TRADE_EVENT",
    "TOKEN_BALANCE_CHANGES_FOUND",
    "INSUFFICIENT_PRICE_DATA",
    "CHAIN_EVENT_PRICE_UNKNOWN",
    "CHAIN_EVENT_VOLUME_UNKNOWN",
    "CHAIN_EVENT_INSUFFICIENT_METRICS"
  ];

  if (solChanges.length > 0) {
    reasonCodes.push("SOL_BALANCE_CHANGES_FOUND");
  }

  const watchedSolChange = solChanges.find(
    (change) => change.account === input.watchedAddress.address
  );
  const watchedAddressOwnsToken =
    input.watchedAddress.kind === "wallet" ||
    primaryTokenChange.owner === input.watchedAddress.address;

  if (
    watchedAddressOwnsToken &&
    watchedSolChange &&
    tokenDelta > 0 &&
    watchedSolChange.deltaLamports < 0
  ) {
    side = "buy";
    reasonCodes.push("POSSIBLE_TOKEN_BUY");
  } else if (
    watchedAddressOwnsToken &&
    watchedSolChange &&
    tokenDelta < 0 &&
    watchedSolChange.deltaLamports > 0
  ) {
    side = "sell";
    reasonCodes.push("POSSIBLE_TOKEN_SELL");
  } else if (tokenDelta > 0 && negativeSol && !positiveSol) {
    side = "buy";
    reasonCodes.push("POSSIBLE_TOKEN_BUY");
  } else if (tokenDelta < 0 && positiveSol && !negativeSol) {
    side = "sell";
    reasonCodes.push("POSSIBLE_TOKEN_SELL");
  } else {
    reasonCodes.push("TRADE_SIDE_UNKNOWN");
  }

  const confidence: ChainTradeConfidence = side === "unknown" ? "low" : "medium";
  reasonCodes.push(
    confidence === "low"
      ? "CHAIN_EVENT_LOW_CONFIDENCE"
      : "CHAIN_EVENT_MEDIUM_CONFIDENCE"
  );

  const event: NormalizedChainTradeEvent = {
    type: "trade",
    source: "solana_rpc",
    mint: input.watchedAddress.mint ?? primaryTokenChange.mint,
    side,
    priceUsd: null,
    volumeUsd: null,
    tokenAmount: Math.abs(primaryTokenChange.deltaUiAmount),
    trader: inferTrader(input, primaryTokenChange, solChanges),
    signature: input.signature,
    ...(input.transaction.slot !== undefined ? { slot: input.transaction.slot } : {}),
    timestamp: blockTimeToIso(input.transaction.blockTime) ?? input.receivedAt ?? new Date().toISOString(),
    watchedAddress: input.watchedAddress.address,
    confidence,
    reasonCodes: uniqueReasonCodes(reasonCodes),
    raw: input.raw ?? {
      solBalanceChanges: solChanges,
      tokenBalanceChanges: tokenChanges
    }
  };

  if (input.watchedAddress.symbol) {
    event.symbol = input.watchedAddress.symbol;
  }

  return event;
}

export function extractTokenBalanceChanges(
  transaction: ParsedTransactionWithMeta
): TokenBalanceChange[] {
  const preBalances = transaction.meta?.preTokenBalances ?? [];
  const postBalances = transaction.meta?.postTokenBalances ?? [];
  const records = new Map<string, {
    accountIndex?: number;
    mint: string;
    owner?: string | null;
    pre?: (typeof preBalances)[number];
    post?: (typeof postBalances)[number];
  }>();

  for (const balance of preBalances) {
    const key = createTokenBalanceKey(balance);
    records.set(key, {
      accountIndex: balance.accountIndex,
      mint: balance.mint,
      owner: balance.owner ?? null,
      pre: balance
    });
  }

  for (const balance of postBalances) {
    const key = createTokenBalanceKey(balance);
    const existing = records.get(key);

    records.set(key, {
      accountIndex: balance.accountIndex,
      mint: balance.mint,
      owner: balance.owner ?? existing?.owner ?? null,
      ...(existing?.pre ? { pre: existing.pre } : {}),
      post: balance
    });
  }

  const changes: TokenBalanceChange[] = [];

  for (const record of records.values()) {
    const preAmountRaw = record.pre?.uiTokenAmount.amount ?? "0";
    const postAmountRaw = record.post?.uiTokenAmount.amount ?? "0";
    const decimals =
      record.post?.uiTokenAmount.decimals ??
      record.pre?.uiTokenAmount.decimals ??
      0;
    const preUiAmount = getUiAmount(record.pre?.uiTokenAmount);
    const postUiAmount = getUiAmount(record.post?.uiTokenAmount);
    const deltaRaw = bigintToString(
      parseAmountRaw(postAmountRaw) - parseAmountRaw(preAmountRaw)
    );
    const deltaUiAmount = roundNumber(postUiAmount - preUiAmount);

    if (deltaRaw === "0" && deltaUiAmount === 0) {
      continue;
    }

    const change: TokenBalanceChange = {
      mint: record.mint,
      preAmountRaw,
      postAmountRaw,
      deltaRaw,
      decimals,
      preUiAmount,
      postUiAmount,
      deltaUiAmount
    };

    if (record.accountIndex !== undefined) {
      change.accountIndex = record.accountIndex;
    }

    if (record.owner !== undefined) {
      change.owner = record.owner;
    }

    changes.push(change);
  }

  return changes;
}

export function extractSolBalanceChanges(
  transaction: ParsedTransactionWithMeta
): SolBalanceChange[] {
  const preBalances = transaction.meta?.preBalances ?? [];
  const postBalances = transaction.meta?.postBalances ?? [];
  const maxLength = Math.max(preBalances.length, postBalances.length);
  const changes: SolBalanceChange[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const preLamports = preBalances[index] ?? 0;
    const postLamports = postBalances[index] ?? 0;
    const deltaLamports = postLamports - preLamports;

    if (deltaLamports === 0) {
      continue;
    }

    const change: SolBalanceChange = {
      accountIndex: index,
      preLamports,
      postLamports,
      deltaLamports,
      deltaSol: roundNumber(deltaLamports / LAMPORTS_PER_SOL)
    };
    const account = getAccountKeyAt(transaction, index);

    if (account) {
      change.account = account;
    }

    changes.push(change);
  }

  return changes;
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

function normalizeWatchedAddressInput(input: WatchedAddressInput): WatchedAddress {
  return createWatchedAddressRegistry({
    maxWatchedAddresses: 1,
    watchedAddresses: [input]
  }).list()[0] as WatchedAddress;
}

function createTokenBalanceKey(balance: {
  accountIndex?: number;
  mint: string;
  owner?: string;
}): string {
  return `${balance.accountIndex ?? "unknown"}:${balance.mint}:${balance.owner ?? ""}`;
}

function getUiAmount(
  uiTokenAmount:
    | {
        uiAmount: number | null;
        uiAmountString?: string;
      }
    | undefined
): number {
  if (!uiTokenAmount) {
    return 0;
  }

  if (uiTokenAmount.uiAmount !== null) {
    return uiTokenAmount.uiAmount;
  }

  const parsed = Number(uiTokenAmount.uiAmountString ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAmountRaw(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function bigintToString(value: bigint): string {
  return value.toString();
}

function getAccountKeyAt(
  transaction: ParsedTransactionWithMeta,
  index: number
): string | undefined {
  const accountKeys = transaction.transaction.message.accountKeys;
  const accountKey = accountKeys[index];

  if (!accountKey) {
    return undefined;
  }

  if (typeof accountKey === "string") {
    return accountKey;
  }

  if ("pubkey" in accountKey) {
    return accountKey.pubkey.toString();
  }

  return String(accountKey as unknown);
}

function inferTrader(
  input: NormalizeTransactionInput,
  tokenChange: TokenBalanceChange,
  solChanges: SolBalanceChange[]
): string | null {
  if (input.watchedAddress.kind === "wallet") {
    return input.watchedAddress.address;
  }

  if (tokenChange.owner) {
    return tokenChange.owner;
  }

  const largestSolChange = solChanges
    .slice()
    .sort(
      (left, right) =>
        Math.abs(right.deltaLamports) - Math.abs(left.deltaLamports)
    )[0];

  return largestSolChange?.account ?? null;
}

function blockTimeToIso(blockTime: number | null | undefined): string | undefined {
  return typeof blockTime === "number"
    ? new Date(blockTime * 1000).toISOString()
    : undefined;
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes));
}

function roundNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(12));
}
