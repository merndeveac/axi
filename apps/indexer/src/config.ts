import { z } from "zod";

export const indexerConfigSchema = z.object({
  INDEXER_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  INDEXER_SOURCE: z
    .enum(["mock", "pumpportal", "pumpfun-fixtures", "future_geyser"])
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
  GEYSER_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false)
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
