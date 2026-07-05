import {
  createIndexerEventId,
  indexerReasonCodes,
  type IndexerEventType,
  type NormalizedIndexerEvent,
  type TradeSide
} from "@axi/indexer-core";
import {
  decodeAnchorEventFromProgramData,
  identifyAnchorInstructionByDiscriminator,
  type PumpfunIdl
} from "./idl";

const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_RECEIVED_AT = "1970-01-01T00:00:00.000Z";
const PUMPFUN_DECODER_SOURCE = "pumpfun_decoder";
const PUMPFUN_HINTS = ["pumpfun", "pump.fun", "pump fun"];

export const pumpfunReasonCodes = {
  balanceDeltasFound: "PUMPFUN_BALANCE_DELTAS_FOUND",
  buyInferred: "PUMPFUN_BUY_INFERRED",
  decodeError: "PUMPFUN_DECODE_ERROR",
  decoderStarted: "PUMPFUN_DECODER_STARTED",
  failedTransactionIgnored: "PUMPFUN_FAILED_TRANSACTION_IGNORED",
  idlHintFound: "PUMPFUN_IDL_HINT_FOUND",
  insufficientTradeAmounts: "PUMPFUN_INSUFFICIENT_TRADE_AMOUNTS",
  instructionHintFound: "PUMPFUN_INSTRUCTION_HINT_FOUND",
  logHintFound: "PUMPFUN_LOG_HINT_FOUND",
  migrationDecoded: "PUMPFUN_MIGRATION_DECODED",
  mintMissing: "PUMPFUN_MINT_MISSING",
  priceSolComputed: "PUMPFUN_PRICE_SOL_COMPUTED",
  sellInferred: "PUMPFUN_SELL_INFERRED",
  signatureMissing: "PUMPFUN_SIGNATURE_MISSING",
  tokenCreatedDecoded: "PUMPFUN_TOKEN_CREATED_DECODED",
  tradeDecoded: "PUMPFUN_TRADE_DECODED",
  transactionClassified: "PUMPFUN_TRANSACTION_CLASSIFIED",
  unknownTransaction: "PUMPFUN_UNKNOWN_TRANSACTION",
  unsupportedFixture: "PUMPFUN_UNSUPPORTED_FIXTURE",
  volumeSolComputed: "PUMPFUN_VOLUME_SOL_COMPUTED"
} as const;

export type PumpfunConfidence = "low" | "medium" | "high";
export type PumpfunEventKind =
  | "token_created"
  | "token_trade"
  | "token_migrated"
  | "unknown";

export type PumpfunDecoderOptions = {
  idl?: PumpfunIdl | null;
  includeRaw?: boolean;
  programIds?: string[];
};

export type PumpfunDecodedEventBase = {
  source: typeof PUMPFUN_DECODER_SOURCE;
  kind: PumpfunEventKind;
  signature?: string | null;
  slot?: number;
  blockTime?: number | string | null;
  programId?: string | null;
  mint?: string | null;
  bondingCurve?: string | null;
  associatedBondingCurve?: string | null;
  user?: string | null;
  trader?: string | null;
  confidence: PumpfunConfidence;
  reasonCodes: string[];
  raw?: unknown;
};

export type PumpfunTokenCreatedEvent = PumpfunDecodedEventBase & {
  kind: "token_created";
  mint: string;
  name?: string | null;
  symbol?: string | null;
  metadataUri?: string | null;
  creator?: string | null;
  bondingCurve?: string | null;
  associatedBondingCurve?: string | null;
  initialBuySol?: number | null;
  marketCapSol?: number | null;
};

export type PumpfunTradeEvent = PumpfunDecodedEventBase & {
  kind: "token_trade";
  mint: string;
  side: TradeSide;
  trader?: string | null;
  solAmount?: number | null;
  tokenAmount?: number | null;
  priceSol?: number | null;
  bondingCurve?: string | null;
  associatedBondingCurve?: string | null;
  marketCapSol?: number | null;
  usableForMetrics: boolean;
};

export type PumpfunMigrationEvent = PumpfunDecodedEventBase & {
  kind: "token_migrated";
  mint: string;
  bondingCurve?: string | null;
  pool?: string | null;
  migrationSource?: string | null;
};

export type PumpfunUnknownEvent = PumpfunDecodedEventBase & {
  kind: "unknown";
  signature?: string | null;
};

export type PumpfunDecodedEvent =
  | PumpfunTokenCreatedEvent
  | PumpfunTradeEvent
  | PumpfunMigrationEvent
  | PumpfunUnknownEvent;

export type PumpfunClassificationEvidence = {
  logHints: string[];
  instructionHints: string[];
  balanceDeltaHints: string[];
  idlHints: string[];
};

export type PumpfunTransactionClassification = {
  kind: PumpfunEventKind;
  side: TradeSide;
  likelyPumpfun: boolean;
  confidence: PumpfunConfidence;
  evidence: PumpfunClassificationEvidence;
  blockers: string[];
  reasonCodes: string[];
};
export type PumpfunClassification = PumpfunTransactionClassification;

export type PumpfunAccounts = {
  accountKeys: string[];
  instructionAccounts: string[];
  programs: string[];
};

export type PumpfunSolBalanceDelta = {
  accountIndex: number;
  account?: string;
  preLamports: number;
  postLamports: number;
  deltaLamports: number;
  deltaSol: number;
};

export type PumpfunTokenBalanceDelta = {
  accountIndex?: number;
  mint: string;
  owner?: string | null;
  preUiAmount: number;
  postUiAmount: number;
  deltaUiAmount: number;
};

export type PumpfunBalanceDeltas = {
  solDeltas: PumpfunSolBalanceDelta[];
  tokenDeltas: PumpfunTokenBalanceDelta[];
};

export type PumpfunDecoder = {
  decodePumpfunTransaction: (input: unknown) => PumpfunDecodedEvent;
  decodePumpfunTransactionBatch: (inputs: unknown[]) => PumpfunDecodedEvent[];
  classifyPumpfunTransaction: (
    input: unknown
  ) => PumpfunTransactionClassification;
};

type JsonRecord = Record<string, unknown>;

type PumpfunHints = {
  values: Map<string, string>;
  texts: string[];
};

export function createPumpfunDecoder(
  options: PumpfunDecoderOptions = {}
): PumpfunDecoder {
  return {
    decodePumpfunTransaction: (input) => decodePumpfunTransaction(input, options),
    decodePumpfunTransactionBatch: (inputs) =>
      decodePumpfunTransactionBatch(inputs, options),
    classifyPumpfunTransaction: (input) => classifyPumpfunTransaction(input, options)
  };
}

export function decodePumpfunTransaction(
  input: unknown,
  options: PumpfunDecoderOptions = {}
): PumpfunDecodedEvent {
  try {
    const classification = classifyPumpfunTransaction(input, options);

    if (isFailedTransaction(input)) {
      return decodeUnknown(input, {
        confidence: "high",
        options,
        reasonCodes: [
          ...classification.reasonCodes,
          pumpfunReasonCodes.failedTransactionIgnored
        ]
      });
    }

    if (classification.kind === "token_created") {
      return decodePumpfunTokenCreated(input, options);
    }

    if (classification.kind === "token_trade") {
      return decodePumpfunTrade(input, options);
    }

    if (classification.kind === "token_migrated") {
      return decodePumpfunMigration(input, options);
    }

    return decodeUnknown(input, {
      confidence: classification.confidence,
      options,
      reasonCodes: classification.reasonCodes
    });
  } catch (error) {
    return decodeUnknown(input, {
      confidence: "low",
      options,
      reasonCodes: [
        pumpfunReasonCodes.decoderStarted,
        pumpfunReasonCodes.decodeError,
        error instanceof Error ? error.name : "UNKNOWN_DECODE_ERROR"
      ]
    });
  }
}

export function decodePumpfunTransactionBatch(
  inputs: unknown[],
  options: PumpfunDecoderOptions = {}
): PumpfunDecodedEvent[] {
  return inputs.map((input) => decodePumpfunTransaction(input, options));
}

export function classifyPumpfunTransaction(
  input: unknown,
  options: PumpfunDecoderOptions = {}
): PumpfunTransactionClassification {
  const logs = extractPumpfunLogs(input);
  const accounts = extractPumpfunAccounts(input);
  const instructionTexts = extractInstructionTexts(input);
  const idlHints = extractIdlHints(input, options.idl);
  const configuredProgramHints = accounts.programs.filter((program) =>
    options.programIds?.includes(program)
  );
  const haystack = [
    ...logs,
    ...instructionTexts,
    ...accounts.programs,
    ...idlHints
  ]
    .join("\n")
    .toLowerCase();
  const logHints = logs.filter(
    (log) =>
      hasPumpfunHint(log) ||
      containsWord(log, "create") ||
      containsWord(log, "buy") ||
      containsWord(log, "sell") ||
      containsWord(log, "migrate")
  );
  const instructionHints = [...instructionTexts, ...accounts.programs].filter((text) =>
    hasPumpfunHint(text) ||
    containsWord(text, "create") ||
    containsWord(text, "buy") ||
    containsWord(text, "sell") ||
    containsWord(text, "migrate")
  );
  const deltas = extractPumpfunBalanceDeltas(input);
  const hasDeltas = deltas.solDeltas.length > 0 || deltas.tokenDeltas.length > 0;
  const balanceDeltaHints = hasDeltas
    ? [
        `solDeltas=${deltas.solDeltas.length}`,
        `tokenDeltas=${deltas.tokenDeltas.length}`
      ]
    : [];
  const evidence: PumpfunClassificationEvidence = {
    logHints,
    instructionHints: [...instructionHints, ...configuredProgramHints],
    balanceDeltaHints,
    idlHints
  };
  const reasonCodes = uniqueReasonCodes([
    pumpfunReasonCodes.decoderStarted,
    pumpfunReasonCodes.transactionClassified,
    ...(logHints.length > 0 ? [pumpfunReasonCodes.logHintFound] : []),
    ...(instructionHints.length > 0 || configuredProgramHints.length > 0
      ? [pumpfunReasonCodes.instructionHintFound]
      : []),
    ...(balanceDeltaHints.length > 0 ? [pumpfunReasonCodes.balanceDeltasFound] : []),
    ...(idlHints.length > 0 ? [pumpfunReasonCodes.idlHintFound] : [])
  ]);

  if (isFailedTransaction(input)) {
    return {
      kind: "unknown",
      side: "unknown",
      likelyPumpfun:
        logHints.length > 0 ||
        instructionHints.length > 0 ||
        configuredProgramHints.length > 0 ||
        idlHints.length > 0,
      confidence: "high",
      evidence,
      blockers: ["transaction_failed"],
      reasonCodes: uniqueReasonCodes([
        ...reasonCodes,
        pumpfunReasonCodes.failedTransactionIgnored
      ])
    };
  }

  const likelyPumpfun =
    logHints.length > 0 ||
    instructionHints.length > 0 ||
    configuredProgramHints.length > 0 ||
    idlHints.length > 0;

  if (!likelyPumpfun) {
    return {
      kind: "unknown",
      side: "unknown",
      likelyPumpfun: false,
      confidence: "low",
      evidence,
      blockers: ["insufficient_pumpfun_evidence"],
      reasonCodes: uniqueReasonCodes([
        ...reasonCodes,
        pumpfunReasonCodes.unknownTransaction
      ])
    };
  }

  if (containsWord(haystack, "migrate") || containsWord(haystack, "migration")) {
    return {
      kind: "token_migrated",
      side: "unknown",
      likelyPumpfun,
      confidence: idlHints.length > 0 ? "high" : "high",
      evidence,
      blockers: [],
      reasonCodes
    };
  }

  if (containsWord(haystack, "create") || containsWord(haystack, "initialize")) {
    return {
      kind: "token_created",
      side: "unknown",
      likelyPumpfun,
      confidence: idlHints.length > 0 ? "high" : "high",
      evidence,
      blockers: [],
      reasonCodes
    };
  }

  const side = inferTradeSide(haystack, deltas);

  if (side !== "unknown" || containsWord(haystack, "trade")) {
    return {
      kind: "token_trade",
      side,
      likelyPumpfun,
      confidence: side === "unknown" ? "medium" : idlHints.length > 0 ? "high" : "high",
      evidence,
      blockers: side === "unknown" ? ["trade_side_unknown"] : [],
      reasonCodes
    };
  }

  return {
    kind: "unknown",
    side: "unknown",
    likelyPumpfun,
    confidence: "medium",
    evidence,
    blockers: ["insufficient_event_type_evidence"],
    reasonCodes: uniqueReasonCodes([
      ...reasonCodes,
      pumpfunReasonCodes.unknownTransaction
    ])
  };
}

export function isLikelyPumpfunTransaction(input: unknown): boolean {
  return classifyPumpfunTransaction(input).likelyPumpfun;
}

export function extractPumpfunAccounts(input: unknown): PumpfunAccounts {
  const accountKeys = uniqueStrings(
    collectArraysByKey(input, "accountKeys")
      .flatMap((value) => value)
      .map((value) => normalizeAccountKey(value))
      .filter(isString)
  );
  const instructionRecords = collectInstructions(input);
  const instructionAccounts = uniqueStrings(
    instructionRecords.flatMap((instruction) => {
      const accounts = asArray(instruction.accounts);

      if (!accounts) {
        return [];
      }

      return accounts
        .map((account) => {
          if (typeof account === "number") {
            return accountKeys[account];
          }

          return normalizeAccountKey(account);
        })
        .filter(isString);
    })
  );
  const programs = uniqueStrings(
    instructionRecords
      .map((instruction) =>
        readFirstString(instruction, ["programId", "program", "programIdIndex"])
      )
      .filter(isString)
  );

  return {
    accountKeys,
    instructionAccounts,
    programs
  };
}

export function extractPumpfunLogs(input: unknown): string[] {
  return uniqueStrings(
    collectArraysByKey(input, "logMessages")
      .flatMap((value) => value)
      .filter((value): value is string => typeof value === "string")
  );
}

export function extractPumpfunBalanceDeltas(
  input: unknown
): PumpfunBalanceDeltas {
  const meta = findMetaRecord(input);
  const accounts = extractPumpfunAccounts(input).accountKeys;

  if (!meta) {
    return {
      solDeltas: [],
      tokenDeltas: []
    };
  }

  return {
    solDeltas: extractSolDeltas(meta, accounts),
    tokenDeltas: extractTokenDeltas(meta)
  };
}

export function decodePumpfunTokenCreated(
  input: unknown,
  options: PumpfunDecoderOptions = {}
): PumpfunTokenCreatedEvent | PumpfunUnknownEvent {
  const hints = extractHints(input);
  const mint = readHintString(hints, ["mint", "tokenMint"]);
  const classification = classifyPumpfunTransaction(input, options);
  const reasonCodes = uniqueReasonCodes([
    ...classification.reasonCodes,
    pumpfunReasonCodes.tokenCreatedDecoded,
    ...(mint ? [] : [pumpfunReasonCodes.mintMissing])
  ]);

  if (!mint) {
    return decodeUnknown(input, {
      confidence: "medium",
      options,
      reasonCodes
    });
  }

  return {
    ...createBaseEvent(input, {
      confidence: classification.confidence,
      options,
      reasonCodes
    }),
    kind: "token_created",
    mint,
    name: readHintString(hints, ["name"]) ?? null,
    symbol: readHintString(hints, ["symbol"]) ?? null,
    metadataUri:
      readHintString(hints, ["metadataUri", "metadataURI", "uri"]) ?? null,
    creator: readHintString(hints, ["creator", "user"]) ?? null,
    bondingCurve: readHintString(hints, ["bondingCurve"]) ?? null,
    associatedBondingCurve:
      readHintString(hints, ["associatedBondingCurve"]) ?? null,
    initialBuySol: readHintNumber(hints, ["initialBuySol"]),
    marketCapSol: readHintNumber(hints, ["marketCapSol"])
  };
}

export function decodePumpfunTrade(
  input: unknown,
  options: PumpfunDecoderOptions = {}
): PumpfunTradeEvent | PumpfunUnknownEvent {
  const classification = classifyPumpfunTransaction(input, options);
  const hints = extractHints(input);
  const deltas = extractPumpfunBalanceDeltas(input);
  const mint =
    readHintString(hints, ["mint", "tokenMint"]) ?? inferMintFromDeltas(deltas);
  const side = readTradeSide(readHintString(hints, ["side"])) ?? classification.side;
  const solAmount =
    readHintNumber(hints, ["solAmount", "volumeSol"]) ??
    inferSolAmountFromDeltas(deltas);
  const tokenAmount =
    readHintNumber(hints, ["tokenAmount", "amount"]) ??
    inferTokenAmountFromDeltas(deltas, mint);
  const priceSol =
    isPositiveFinite(solAmount) && isPositiveFinite(tokenAmount)
      ? roundMetric(solAmount / tokenAmount)
      : null;
  const usableForMetrics =
    Boolean(mint) &&
    (side === "buy" || side === "sell") &&
    isPositiveFinite(solAmount) &&
    isPositiveFinite(tokenAmount) &&
    isPositiveFinite(priceSol);
  const reasonCodes = uniqueReasonCodes([
    ...classification.reasonCodes,
    pumpfunReasonCodes.tradeDecoded,
    ...(side === "buy" ? [pumpfunReasonCodes.buyInferred] : []),
    ...(side === "sell" ? [pumpfunReasonCodes.sellInferred] : []),
    ...(isPositiveFinite(solAmount) ? [pumpfunReasonCodes.volumeSolComputed] : []),
    ...(isPositiveFinite(priceSol) ? [pumpfunReasonCodes.priceSolComputed] : []),
    ...(usableForMetrics ? [] : [pumpfunReasonCodes.insufficientTradeAmounts]),
    ...(mint ? [] : [pumpfunReasonCodes.mintMissing])
  ]);

  if (!mint) {
    return decodeUnknown(input, {
      confidence: "medium",
      options,
      reasonCodes
    });
  }

  return {
    ...createBaseEvent(input, {
      confidence: usableForMetrics ? "high" : classification.confidence,
      options,
      reasonCodes
    }),
    kind: "token_trade",
    mint,
    side,
    trader: readHintString(hints, ["trader", "user", "buyer", "seller"]) ?? null,
    solAmount: finiteOrNull(solAmount),
    tokenAmount: finiteOrNull(tokenAmount),
    priceSol: finiteOrNull(priceSol),
    bondingCurve: readHintString(hints, ["bondingCurve"]) ?? null,
    associatedBondingCurve:
      readHintString(hints, ["associatedBondingCurve"]) ?? null,
    marketCapSol: readHintNumber(hints, ["marketCapSol"]),
    usableForMetrics
  };
}

export function decodePumpfunMigration(
  input: unknown,
  options: PumpfunDecoderOptions = {}
): PumpfunMigrationEvent | PumpfunUnknownEvent {
  const classification = classifyPumpfunTransaction(input, options);
  const hints = extractHints(input);
  const mint = readHintString(hints, ["mint", "tokenMint"]);
  const reasonCodes = uniqueReasonCodes([
    ...classification.reasonCodes,
    pumpfunReasonCodes.migrationDecoded,
    ...(mint ? [] : [pumpfunReasonCodes.mintMissing])
  ]);

  if (!mint) {
    return decodeUnknown(input, {
      confidence: "medium",
      options,
      reasonCodes
    });
  }

  return {
    ...createBaseEvent(input, {
      confidence: classification.confidence,
      options,
      reasonCodes
    }),
    kind: "token_migrated",
    mint,
    bondingCurve: readHintString(hints, ["bondingCurve"]) ?? null,
    pool: readHintString(hints, ["pool", "newPool"]) ?? null,
    migrationSource: readHintString(hints, ["migrationSource"]) ?? "pumpfun"
  };
}

export function pumpfunEventToIndexerEvent(
  event: PumpfunDecodedEvent
): NormalizedIndexerEvent {
  const receivedAt = normalizeReceivedAt(event.blockTime);
  const common = {
    schemaVersion: 1 as const,
    source: event.source,
    sourceMode: "replay" as const,
    chain: "solana" as const,
    receivedAt,
    signature: event.signature ?? null,
    reasonCodes: normalizedReasonCodes(event),
    ...(event.slot !== undefined ? { slot: event.slot } : {}),
    ...(event.blockTime !== undefined ? { blockTime: event.blockTime } : {}),
    ...(event.programId ? { program: event.programId } : {}),
    ...(event.raw !== undefined ? { raw: event.raw } : {})
  };

  if (event.kind === "token_created") {
    return {
      ...common,
      id: createEventId("token_created", event, receivedAt),
      type: "token_created",
      mint: event.mint,
      name: event.name ?? null,
      symbol: event.symbol ?? null,
      metadataUri: event.metadataUri ?? null,
      creator: event.creator ?? null,
      bondingCurve: event.bondingCurve ?? null,
      associatedBondingCurve: event.associatedBondingCurve ?? null,
      initialBuySol: finiteOrNull(event.initialBuySol),
      marketCapSol: finiteOrNull(event.marketCapSol)
    };
  }

  if (event.kind === "token_trade") {
    return {
      ...common,
      id: createEventId("token_trade", event, receivedAt),
      type: "token_trade",
      mint: event.mint,
      side: event.side,
      trader: event.trader ?? null,
      priceSol: finiteOrNull(event.priceSol),
      priceUsd: null,
      volumeSol: finiteOrNull(event.solAmount),
      volumeUsd: null,
      tokenAmount: finiteOrNull(event.tokenAmount),
      pool: null,
      bondingCurve: event.bondingCurve ?? null,
      confidence: event.confidence,
      usableForMetrics: event.usableForMetrics
    };
  }

  if (event.kind === "token_migrated") {
    return {
      ...common,
      id: createEventId("token_migrated", event, receivedAt),
      type: "token_migrated",
      mint: event.mint,
      pool: event.pool ?? null,
      oldBondingCurve: event.bondingCurve ?? null,
      newPool: event.pool ?? null,
      migrationSource: event.migrationSource ?? "pumpfun"
    };
  }

  return {
    ...common,
    id: createEventId("unknown", event, receivedAt),
    type: "unknown",
    mint: event.mint ?? null
  };
}

function decodeUnknown(
  input: unknown,
  options: {
    confidence: PumpfunConfidence;
    options: PumpfunDecoderOptions;
    reasonCodes: string[];
  }
): PumpfunUnknownEvent {
  return {
    ...createBaseEvent(input, {
      confidence: options.confidence,
      options: options.options,
      reasonCodes: uniqueReasonCodes([
        ...options.reasonCodes,
        pumpfunReasonCodes.unknownTransaction
      ])
    }),
    kind: "unknown"
  };
}

function createBaseEvent(
  input: unknown,
  options: {
    confidence: PumpfunConfidence;
    options: PumpfunDecoderOptions;
    reasonCodes: string[];
  }
): Omit<PumpfunDecodedEventBase, "kind"> {
  const signature = extractSignature(input);
  const slot = extractSlot(input);
  const blockTime = extractBlockTime(input);
  const programId = extractPumpfunAccounts(input).programs.find((program) =>
    hasPumpfunHint(program)
  );
  const reasonCodes = uniqueReasonCodes([
    ...options.reasonCodes,
    ...(signature ? [] : [pumpfunReasonCodes.signatureMissing])
  ]);

  return {
    source: PUMPFUN_DECODER_SOURCE,
    signature: signature ?? null,
    confidence: options.confidence,
    reasonCodes,
    ...(slot !== undefined ? { slot } : {}),
    ...(blockTime !== undefined ? { blockTime } : {}),
    ...(programId ? { programId } : {}),
    ...(options.options.includeRaw === false ? {} : { raw: input })
  };
}

function createEventId(
  type: IndexerEventType,
  event: PumpfunDecodedEvent,
  receivedAt: string
): string {
  return createIndexerEventId({
    type,
    mint: event.mint ?? null,
    source: event.source,
    signature: event.signature ?? null,
    slot: event.slot ?? null,
    blockTime: event.blockTime ?? null,
    receivedAt
  });
}

function normalizedReasonCodes(event: PumpfunDecodedEvent): string[] {
  return uniqueReasonCodes([
    indexerReasonCodes.schemaV1,
    indexerReasonCodes.eventNormalized,
    ...(event.kind === "unknown" ? [indexerReasonCodes.eventUnknown] : []),
    ...(event.kind === "token_trade" && event.usableForMetrics
      ? [indexerReasonCodes.eventUsableForMetrics]
      : []),
    ...(event.kind === "token_trade" && !event.usableForMetrics
      ? [indexerReasonCodes.eventUnusableForMetrics]
      : []),
    ...event.reasonCodes
  ]);
}

function extractSignature(input: unknown): string | undefined {
  const candidates = [
    readStringPath(input, ["signature"]),
    readStringPath(input, ["transaction", "signature"]),
    readStringPath(input, ["transaction", "transaction", "signature"]),
    readStringPath(input, ["transaction", "signatures", 0]),
    readStringPath(input, ["transaction", "transaction", "signatures", 0])
  ];

  return candidates.find(isString);
}

function extractSlot(input: unknown): number | undefined {
  return [
    readNumberPath(input, ["slot"]),
    readNumberPath(input, ["transaction", "slot"]),
    readNumberPath(input, ["transaction", "transaction", "slot"])
  ].find(
    (value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value >= 0
  );
}

function extractBlockTime(input: unknown): number | string | undefined {
  const value =
    readNumberPath(input, ["blockTime"]) ??
    readStringPath(input, ["blockTime"]) ??
    readNumberPath(input, ["transaction", "blockTime"]) ??
    readStringPath(input, ["transaction", "blockTime"]) ??
    readNumberPath(input, ["transaction", "transaction", "blockTime"]) ??
    readStringPath(input, ["transaction", "transaction", "blockTime"]);

  return value;
}

function isFailedTransaction(input: unknown): boolean {
  const meta = findMetaRecord(input);

  if (!meta || !("err" in meta)) {
    return false;
  }

  return meta.err !== null && meta.err !== undefined;
}

function findMetaRecord(input: unknown): JsonRecord | undefined {
  const candidates = [
    readRecordPath(input, ["meta"]),
    readRecordPath(input, ["transaction", "meta"]),
    readRecordPath(input, ["transaction", "transaction", "meta"])
  ];

  return candidates.find(
    (candidate): candidate is JsonRecord =>
      Boolean(
        candidate &&
          (Array.isArray(candidate.preBalances) ||
            Array.isArray(candidate.postBalances) ||
            Array.isArray(candidate.preTokenBalances) ||
            Array.isArray(candidate.postTokenBalances) ||
            "err" in candidate)
      )
  );
}

function extractSolDeltas(
  meta: JsonRecord,
  accountKeys: string[]
): PumpfunSolBalanceDelta[] {
  const preBalances = asArray(meta.preBalances) ?? [];
  const postBalances = asArray(meta.postBalances) ?? [];
  const maxLength = Math.max(preBalances.length, postBalances.length);
  const deltas: PumpfunSolBalanceDelta[] = [];

  for (let accountIndex = 0; accountIndex < maxLength; accountIndex += 1) {
    const preLamports = readFiniteNumber(preBalances[accountIndex]) ?? 0;
    const postLamports = readFiniteNumber(postBalances[accountIndex]) ?? 0;
    const deltaLamports = postLamports - preLamports;

    if (deltaLamports === 0) {
      continue;
    }

    const account = accountKeys[accountIndex];

    deltas.push({
      accountIndex,
      ...(account ? { account } : {}),
      preLamports,
      postLamports,
      deltaLamports,
      deltaSol: roundMetric(deltaLamports / LAMPORTS_PER_SOL)
    });
  }

  return deltas;
}

function extractTokenDeltas(meta: JsonRecord): PumpfunTokenBalanceDelta[] {
  const preBalances = asArray(meta.preTokenBalances) ?? [];
  const postBalances = asArray(meta.postTokenBalances) ?? [];
  const records = new Map<
    string,
    {
      accountIndex?: number;
      mint: string;
      owner?: string | null;
      pre?: JsonRecord;
      post?: JsonRecord;
    }
  >();

  for (const balance of preBalances) {
    const record = parseTokenBalance(balance);

    if (!record) {
      continue;
    }

    records.set(createTokenBalanceKey(record), {
      ...(record.accountIndex !== undefined
        ? { accountIndex: record.accountIndex }
        : {}),
      mint: record.mint,
      owner: record.owner ?? null,
      pre: record.raw
    });
  }

  for (const balance of postBalances) {
    const record = parseTokenBalance(balance);

    if (!record) {
      continue;
    }

    const key = createTokenBalanceKey(record);
    const existing = records.get(key);
    records.set(key, {
      ...(record.accountIndex !== undefined
        ? { accountIndex: record.accountIndex }
        : {}),
      mint: record.mint,
      owner: record.owner ?? existing?.owner ?? null,
      ...(existing?.pre ? { pre: existing.pre } : {}),
      post: record.raw
    });
  }

  return Array.from(records.values()).flatMap((record) => {
    const preUiAmount = parseUiTokenAmount(record.pre);
    const postUiAmount = parseUiTokenAmount(record.post);
    const deltaUiAmount = roundMetric(postUiAmount - preUiAmount);

    if (deltaUiAmount === 0) {
      return [];
    }

    return [
      {
        ...(record.accountIndex !== undefined
          ? { accountIndex: record.accountIndex }
          : {}),
        mint: record.mint,
        owner: record.owner ?? null,
        preUiAmount,
        postUiAmount,
        deltaUiAmount
      }
    ];
  });
}

function parseTokenBalance(value: unknown):
  | {
      accountIndex?: number;
      mint: string;
      owner?: string | null;
      raw: JsonRecord;
    }
  | undefined {
  const record = asRecord(value);
  const mint = readFirstString(record, ["mint"]);

  if (!record || !mint) {
    return undefined;
  }

  const accountIndex = readFiniteNumber(record.accountIndex);
  const owner = readFirstString(record, ["owner"]);
  const validAccountIndex =
    typeof accountIndex === "number" &&
    Number.isInteger(accountIndex) &&
    accountIndex >= 0;

  return {
    ...(validAccountIndex
      ? { accountIndex }
      : {}),
    mint,
    owner: owner ?? null,
    raw: record
  };
}

function parseUiTokenAmount(balance: JsonRecord | undefined): number {
  if (!balance) {
    return 0;
  }

  const uiTokenAmount = asRecord(balance.uiTokenAmount);

  if (!uiTokenAmount) {
    return 0;
  }

  const uiAmount = readFiniteNumber(uiTokenAmount.uiAmount);

  if (uiAmount !== undefined) {
    return uiAmount;
  }

  const uiAmountString = readFiniteNumber(uiTokenAmount.uiAmountString);

  if (uiAmountString !== undefined) {
    return uiAmountString;
  }

  const amount = readFiniteNumber(uiTokenAmount.amount);
  const decimals = readFiniteNumber(uiTokenAmount.decimals);

  if (amount === undefined || decimals === undefined) {
    return 0;
  }

  return amount / 10 ** decimals;
}

function createTokenBalanceKey(record: {
  accountIndex?: number;
  mint: string;
  owner?: string | null;
}): string {
  return `${record.accountIndex ?? "unknown"}:${record.mint}:${record.owner ?? ""}`;
}

function inferTradeSide(
  haystack: string,
  deltas: PumpfunBalanceDeltas
): TradeSide {
  if (containsWord(haystack, "buy")) {
    return "buy";
  }

  if (containsWord(haystack, "sell")) {
    return "sell";
  }

  const largestTokenDelta = deltas.tokenDeltas
    .slice()
    .sort(
      (left, right) =>
        Math.abs(right.deltaUiAmount) - Math.abs(left.deltaUiAmount)
    )[0];

  if (!largestTokenDelta) {
    return "unknown";
  }

  return largestTokenDelta.deltaUiAmount > 0 ? "buy" : "sell";
}

function inferSolAmountFromDeltas(deltas: PumpfunBalanceDeltas): number | null {
  const largestDelta = deltas.solDeltas
    .slice()
    .sort(
      (left, right) =>
        Math.abs(right.deltaSol) - Math.abs(left.deltaSol)
    )[0];

  if (!largestDelta) {
    return null;
  }

  return roundMetric(Math.abs(largestDelta.deltaSol));
}

function inferTokenAmountFromDeltas(
  deltas: PumpfunBalanceDeltas,
  mint: string | null | undefined
): number | null {
  const tokenDeltas = mint
    ? deltas.tokenDeltas.filter((delta) => delta.mint === mint)
    : deltas.tokenDeltas;
  const largestDelta = tokenDeltas
    .slice()
    .sort(
      (left, right) =>
        Math.abs(right.deltaUiAmount) - Math.abs(left.deltaUiAmount)
    )[0];

  if (!largestDelta) {
    return null;
  }

  return roundMetric(Math.abs(largestDelta.deltaUiAmount));
}

function inferMintFromDeltas(deltas: PumpfunBalanceDeltas): string | undefined {
  return deltas.tokenDeltas.find((delta) => delta.mint.trim().length > 0)?.mint;
}

function extractHints(input: unknown): PumpfunHints {
  const texts = [
    ...extractPumpfunLogs(input),
    ...extractInstructionTexts(input)
  ];
  const values = new Map<string, string>();

  for (const text of texts) {
    for (const [key, value] of parseKeyValues(text)) {
      const normalizedKey = key.toLowerCase();

      if (!values.has(normalizedKey)) {
        values.set(normalizedKey, value);
      }
    }
  }

  for (const record of collectInfoRecords(input)) {
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "string" || typeof value === "number") {
        values.set(key.toLowerCase(), String(value));
      }
    }
  }

  return {
    values,
    texts
  };
}

function readHintString(
  hints: PumpfunHints,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = hints.values.get(key.toLowerCase())?.trim();

    if (value) {
      return unquote(value);
    }
  }

  return undefined;
}

function readHintNumber(
  hints: PumpfunHints,
  keys: string[]
): number | null {
  const value = readHintString(hints, keys);

  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseKeyValues(text: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const pattern = /([A-Za-z][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|[^,\s]+)/g;
  let match = pattern.exec(text);

  while (match) {
    const key = match[1];
    const value = match[2];

    if (key && value) {
      pairs.push([key, unquote(value)]);
    }

    match = pattern.exec(text);
  }

  return pairs;
}

function extractInstructionTexts(input: unknown): string[] {
  return collectInstructions(input).flatMap((instruction) => {
    const texts: string[] = [];
    const programId = readFirstString(instruction, ["programId", "program"]);

    if (programId) {
      texts.push(programId);
    }

    const parsed = asRecord(instruction.parsed);
    const parsedType = readFirstString(parsed, ["type"]);

    if (parsedType) {
      texts.push(parsedType);
    }

    const info = asRecord(parsed?.info);

    if (info) {
      texts.push(
        Object.entries(info)
          .filter((entry): entry is [string, string | number] =>
            typeof entry[1] === "string" || typeof entry[1] === "number"
          )
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(" ")
      );
    }

    const data = readFirstString(instruction, ["data"]);

    if (data) {
      texts.push(data);
    }

    return texts;
  });
}

function extractIdlHints(input: unknown, idl: PumpfunIdl | null | undefined): string[] {
  if (!idl) {
    return [];
  }

  const instructionHints = collectInstructions(input).flatMap((instruction) => {
    const data = readFirstString(instruction, ["data"]);

    if (!data) {
      return [];
    }

    const identified = identifyAnchorInstructionByDiscriminator(data, idl);
    return identified.matched && identified.name
      ? [`idl_instruction=${identified.name}`]
      : [];
  });
  const eventHints = extractPumpfunLogs(input).flatMap((log) => {
    const decoded = decodeAnchorEventFromProgramData(log, idl);
    return decoded.ok && decoded.eventName
      ? [`idl_event=${decoded.eventName}`]
      : [];
  });

  return uniqueStrings([...instructionHints, ...eventHints]);
}

function collectInstructions(input: unknown): JsonRecord[] {
  return collectArraysByKey(input, "instructions")
    .flatMap((value) => value)
    .map((value) => asRecord(value))
    .filter((value): value is JsonRecord => value !== null);
}

function collectInfoRecords(input: unknown): JsonRecord[] {
  return collectRecordsByKey(input, "info");
}

function collectArraysByKey(
  input: unknown,
  key: string,
  depth = 0
): unknown[][] {
  if (depth > 6) {
    return [];
  }

  const record = asRecord(input);

  if (!record) {
    return [];
  }

  const arrays: unknown[][] = [];

  for (const [entryKey, value] of Object.entries(record)) {
    if (entryKey === key && Array.isArray(value)) {
      arrays.push(value);
      continue;
    }

    if (typeof value === "object" && value !== null) {
      arrays.push(...collectArraysByKey(value, key, depth + 1));
    }
  }

  return arrays;
}

function collectRecordsByKey(
  input: unknown,
  key: string,
  depth = 0
): JsonRecord[] {
  if (depth > 6) {
    return [];
  }

  const record = asRecord(input);

  if (!record) {
    return [];
  }

  const records: JsonRecord[] = [];

  for (const [entryKey, value] of Object.entries(record)) {
    const child = asRecord(value);

    if (entryKey === key && child) {
      records.push(child);
    }

    if (child) {
      records.push(...collectRecordsByKey(child, key, depth + 1));
    }
  }

  return records;
}

function normalizeAccountKey(value: unknown): string | undefined {
  if (typeof value === "string") {
    return nonEmpty(value);
  }

  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  return readFirstString(record, ["pubkey", "publicKey", "address"]);
}

function readFirstString(
  record: JsonRecord | null,
  keys: string[]
): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function readStringPath(
  input: unknown,
  path: Array<string | number>
): string | undefined {
  const value = readPath(input, path);
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumberPath(
  input: unknown,
  path: Array<string | number>
): number | undefined {
  return readFiniteNumber(readPath(input, path));
}

function readRecordPath(
  input: unknown,
  path: Array<string | number>
): JsonRecord | undefined {
  return asRecord(readPath(input, path)) ?? undefined;
}

function readPath(input: unknown, path: Array<string | number>): unknown {
  let current = input;

  for (const part of path) {
    if (typeof part === "number") {
      const values = asArray(current);

      if (!values) {
        return undefined;
      }

      current = values[part];
      continue;
    }

    const record = asRecord(current);

    if (!record) {
      return undefined;
    }

    current = record[part];
  }

  return current;
}

function readTradeSide(value: string | undefined): TradeSide | undefined {
  if (value === "buy" || value === "sell" || value === "unknown") {
    return value;
  }

  return undefined;
}

function normalizeReceivedAt(value: number | string | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return DEFAULT_RECEIVED_AT;
}

function hasPumpfunHint(value: string): boolean {
  const normalized = value.toLowerCase();
  return PUMPFUN_HINTS.some((hint) => normalized.includes(hint));
}

function containsWord(value: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(12));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueReasonCodes(values: string[]): string[] {
  return uniqueStrings(values);
}

function unquote(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export * from "./fixtures";
export * from "./idl";
