import { z } from "zod";

export const indexerSchemaVersion = 1 as const;

export const indexerReasonCodes = {
  eventNormalized: "INDEXER_EVENT_NORMALIZED",
  eventUnknown: "INDEXER_EVENT_UNKNOWN",
  eventUnusableForMetrics: "INDEXER_EVENT_UNUSABLE_FOR_METRICS",
  eventUsableForMetrics: "INDEXER_EVENT_USABLE_FOR_METRICS",
  sourceMock: "INDEXER_SOURCE_MOCK",
  sourcePumpPortal: "INDEXER_SOURCE_PUMPPORTAL",
  sourceFutureGeyser: "INDEXER_SOURCE_FUTURE_GEYSER",
  schemaV1: "INDEXER_SCHEMA_V1"
} as const;

export type IndexerReasonCode =
  (typeof indexerReasonCodes)[keyof typeof indexerReasonCodes] | (string & {});

export const IndexerEventTypeSchema = z.enum([
  "token_created",
  "token_migrated",
  "token_trade",
  "pool_created",
  "pool_updated",
  "account_update",
  "holder_snapshot",
  "token_metadata",
  "token_enrichment",
  "unknown"
]);
export type IndexerEventType = z.infer<typeof IndexerEventTypeSchema>;

export const IndexerSourceModeSchema = z.enum([
  "mock",
  "real",
  "replay",
  "local",
  "unknown"
]);
export type IndexerSourceMode = z.infer<typeof IndexerSourceModeSchema>;

export const IndexerChainSchema = z.literal("solana");
export type IndexerChain = z.infer<typeof IndexerChainSchema>;

const reasonCodesSchema = z.array(z.string().min(1)).default([]);
const nullableStringSchema = z.string().min(1).nullable().optional();
const nullableNumberSchema = z.number().finite().nullable().optional();

export const IndexerEventBaseSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(indexerSchemaVersion),
  source: z.string().min(1),
  sourceMode: IndexerSourceModeSchema,
  chain: IndexerChainSchema,
  slot: z.number().int().nonnegative().nullable().optional(),
  blockTime: z.union([z.string().datetime(), z.number().finite()]).nullable().optional(),
  signature: nullableStringSchema,
  receivedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable().optional(),
  program: nullableStringSchema,
  raw: z.unknown().optional(),
  reasonCodes: reasonCodesSchema
});
export type IndexerEventBase = z.infer<typeof IndexerEventBaseSchema>;

export const NormalizedTokenCreatedEventSchema = IndexerEventBaseSchema.extend({
  type: z.literal("token_created"),
  mint: z.string().min(1),
  name: nullableStringSchema,
  symbol: nullableStringSchema,
  metadataUri: nullableStringSchema,
  creator: nullableStringSchema,
  bondingCurve: nullableStringSchema,
  associatedBondingCurve: nullableStringSchema,
  initialBuySol: nullableNumberSchema,
  marketCapSol: nullableNumberSchema
});
export type NormalizedTokenCreatedEvent = z.infer<
  typeof NormalizedTokenCreatedEventSchema
>;

export const NormalizedTokenMigratedEventSchema = IndexerEventBaseSchema.extend({
  type: z.literal("token_migrated"),
  mint: z.string().min(1),
  pool: nullableStringSchema,
  oldBondingCurve: nullableStringSchema,
  newPool: nullableStringSchema,
  migrationSource: nullableStringSchema
});
export type NormalizedTokenMigratedEvent = z.infer<
  typeof NormalizedTokenMigratedEventSchema
>;

export const TradeSideSchema = z.enum(["buy", "sell", "unknown"]);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const NormalizedTokenTradeEventSchema = IndexerEventBaseSchema.extend({
  type: z.literal("token_trade"),
  mint: z.string().min(1),
  side: TradeSideSchema,
  trader: nullableStringSchema,
  priceSol: nullableNumberSchema,
  priceUsd: nullableNumberSchema,
  volumeSol: nullableNumberSchema,
  volumeUsd: nullableNumberSchema,
  tokenAmount: nullableNumberSchema,
  pool: nullableStringSchema,
  bondingCurve: nullableStringSchema,
  confidence: z.enum(["low", "medium", "high"]).default("low"),
  usableForMetrics: z.boolean(),
  reasonCodes: reasonCodesSchema
});
export type NormalizedTokenTradeEvent = z.infer<
  typeof NormalizedTokenTradeEventSchema
>;

export const NormalizedHolderSnapshotEventSchema = IndexerEventBaseSchema.extend({
  type: z.literal("holder_snapshot"),
  mint: z.string().min(1),
  holderCount: z.number().int().nonnegative().nullable().optional(),
  topHolderPct: z.number().min(0).max(100).nullable().optional(),
  top10HolderPct: z.number().min(0).max(100).nullable().optional(),
  source: z.string().min(1)
});
export type NormalizedHolderSnapshotEvent = z.infer<
  typeof NormalizedHolderSnapshotEventSchema
>;

export const NormalizedTokenMetadataEventSchema = IndexerEventBaseSchema.extend({
  type: z.literal("token_metadata"),
  mint: z.string().min(1),
  name: nullableStringSchema,
  symbol: nullableStringSchema,
  title: nullableStringSchema,
  displayName: nullableStringSchema,
  metadataUri: nullableStringSchema,
  imageUri: nullableStringSchema,
  description: nullableStringSchema,
  source: z.string().min(1)
});
export type NormalizedTokenMetadataEvent = z.infer<
  typeof NormalizedTokenMetadataEventSchema
>;

export const GenericMintIndexerEventSchema = IndexerEventBaseSchema.extend({
  type: z.enum([
    "pool_created",
    "pool_updated",
    "account_update",
    "token_enrichment"
  ]),
  mint: nullableStringSchema
}).passthrough();
export type GenericMintIndexerEvent = z.infer<typeof GenericMintIndexerEventSchema>;

export const UnknownIndexerEventSchema = IndexerEventBaseSchema.extend({
  type: z.literal("unknown"),
  mint: nullableStringSchema
}).passthrough();
export type UnknownIndexerEvent = z.infer<typeof UnknownIndexerEventSchema>;

export const NormalizedIndexerEventSchema = z.union([
  NormalizedTokenCreatedEventSchema,
  NormalizedTokenMigratedEventSchema,
  NormalizedTokenTradeEventSchema,
  NormalizedHolderSnapshotEventSchema,
  NormalizedTokenMetadataEventSchema,
  GenericMintIndexerEventSchema,
  UnknownIndexerEventSchema
]);

export type NormalizedIndexerEvent =
  | NormalizedTokenCreatedEvent
  | NormalizedTokenMigratedEvent
  | NormalizedTokenTradeEvent
  | NormalizedHolderSnapshotEvent
  | NormalizedTokenMetadataEvent
  | GenericMintIndexerEvent
  | UnknownIndexerEvent;

export type IndexerEventIdInput = {
  type: IndexerEventType;
  mint?: string | null;
  source?: string | null;
  signature?: string | null;
  slot?: number | null;
  blockTime?: string | number | null;
  receivedAt?: string | null;
  sequence?: number | string | null;
};

export function createIndexerEventId(input: IndexerEventIdInput): string {
  return `idx_${hashStable(stableStringify({
    blockTime: input.blockTime ?? null,
    mint: normalizeMint(input.mint),
    receivedAt: input.receivedAt ?? null,
    sequence: input.sequence ?? null,
    signature: input.signature ?? null,
    slot: input.slot ?? null,
    source: input.source ?? null,
    type: input.type
  }))}`;
}

export function normalizeMint(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function shortMint(value: unknown): string {
  const mint = normalizeMint(value);

  if (!mint) {
    return "unknown";
  }

  if (mint.length <= 14) {
    return mint;
  }

  return `${mint.slice(0, 8)}...${mint.slice(-6)}`;
}

export function isTradeUsableForMetrics(
  event: NormalizedIndexerEvent
): event is NormalizedTokenTradeEvent {
  if (event.type !== "token_trade") {
    return false;
  }

  const hasSolMetrics =
    isPositiveFinite(event.priceSol) && isPositiveFinite(event.volumeSol);
  const hasUsdMetrics =
    isPositiveFinite(event.priceUsd) && isPositiveFinite(event.volumeUsd);

  return (
    event.usableForMetrics &&
    (event.side === "buy" || event.side === "sell") &&
    (hasSolMetrics || hasUsdMetrics)
  );
}

export function getEventMint(event: NormalizedIndexerEvent): string | null {
  if ("mint" in event) {
    return normalizeMint(event.mint);
  }

  return null;
}

export function getEventTimestamp(event: NormalizedIndexerEvent): string {
  const candidates = [event.processedAt, event.blockTime, event.receivedAt];

  for (const candidate of candidates) {
    const timestamp = normalizeTimestamp(candidate);

    if (timestamp) {
      return timestamp;
    }
  }

  return new Date(0).toISOString();
}

export function eventToReasonSummary(event: NormalizedIndexerEvent): string {
  const mint = shortMint(getEventMint(event));
  const reasons = event.reasonCodes.length > 0
    ? event.reasonCodes.join(",")
    : indexerReasonCodes.eventUnknown;
  return `${event.type}:${mint}:${reasons}`;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeTimestamp(value: string | number | null | undefined): string | null {
  if (typeof value === "number") {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function hashStable(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
