import { z } from "zod";

export const indexerConfigSchema = z.object({
  INDEXER_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  INDEXER_SOURCE: z
    .enum([
      "mock",
      "pumpportal",
      "pumpfun-fixtures",
      "future_geyser",
      "managed-stream"
    ])
    .default("mock"),
  INDEXER_MODE: z.enum(["local", "paper", "replay"]).default("local"),
  INDEXER_LOG_LEVEL: z.enum(["silent", "error", "warn", "info", "debug"]).default("info"),
  INDEXER_RECENT_EVENT_LIMIT: z.coerce.number().int().positive().default(1000),
  INDEXER_FIXTURE_DIR: z
    .string()
    .min(1)
    .default("packages/pumpfun-decoder/fixtures"),
  GEYSER_GRPC_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  GEYSER_GRPC_TOKEN: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  GEYSER_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  MANAGED_STREAM_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  MANAGED_STREAM_PROVIDER: z
    .enum(["mock", "yellowstone", "laserstream", "geyser", "unknown"])
    .default("mock"),
  MANAGED_STREAM_COMMITMENT: z
    .enum(["processed", "confirmed", "finalized"])
    .default("confirmed"),
  MANAGED_STREAM_ENDPOINT: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional()
  ),
  MANAGED_STREAM_AUTH_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  MANAGED_STREAM_API_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  MANAGED_STREAM_MAX_RECONNECT_ATTEMPTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(10),
  MANAGED_STREAM_RECONNECT_BACKOFF_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(1000),
  MANAGED_STREAM_TRANSACTIONS_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  MANAGED_STREAM_TRANSACTION_ACCOUNT_INCLUDE: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  MANAGED_STREAM_TRANSACTION_ACCOUNT_EXCLUDE: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  MANAGED_STREAM_TRANSACTION_ACCOUNT_REQUIRED: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  MANAGED_STREAM_INCLUDE_VOTES: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MANAGED_STREAM_INCLUDE_FAILED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  YELLOWSTONE_GRPC_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional()
  ),
  YELLOWSTONE_GRPC_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  YELLOWSTONE_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  LASERSTREAM_GRPC_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional()
  ),
  LASERSTREAM_API_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  LASERSTREAM_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false)
});

export type IndexerConfig = z.infer<typeof indexerConfigSchema>;

export function loadIndexerConfig(
  env: NodeJS.ProcessEnv = process.env
): IndexerConfig {
  return indexerConfigSchema.parse(env);
}

function parseBooleanEnv(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  return value;
}

function emptyStringToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value;
}

function parseStringListEnv(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
