import { existsSync, readFileSync } from "node:fs";
import {
  normalizeChainTransactionToMarketObservations,
  type MarketDataNormalizerOptions
} from "@axi/market-data";
import type { WatchedAddressKind } from "@axi/chain-events";

type Args = {
  file?: string;
  json: boolean;
  mint?: string;
  solUsdPrice?: number;
  watchedAddress?: string;
  watchedKind: WatchedAddressKind;
};

try {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    throw new Error("--file is required. This command reads local JSON only.");
  }

  if (!existsSync(args.file)) {
    throw new Error(`FILE_NOT_FOUND: ${args.file}`);
  }

  const raw = JSON.parse(readFileSync(args.file, "utf8")) as unknown;
  const options: MarketDataNormalizerOptions = {};

  if (args.solUsdPrice !== undefined) {
    options.allowSolUsdConversion = true;
    options.solUsdPrice = args.solUsdPrice;
  }

  const transaction = getTransaction(raw);
  const tokenBalanceChanges = getArray(raw, "tokenBalanceChanges");
  const solBalanceChanges = getArray(raw, "solBalanceChanges");
  const watchedAddress = args.watchedAddress ?? getString(raw, "watchedAddress");
  const mint = args.mint ?? getString(raw, "mint");
  const symbol = getString(raw, "symbol");
  const timestamp = getString(raw, "timestamp") ?? getString(raw, "createdAt");
  const observations = normalizeChainTransactionToMarketObservations(
    {
      signature:
        getString(raw, "signature") ??
        getString(raw, "transactionSignature") ??
        "local-file",
      watchedAddressKind: args.watchedKind,
      raw,
      ...(transaction ? { transaction } : {}),
      ...(tokenBalanceChanges ? { tokenBalanceChanges } : {}),
      ...(solBalanceChanges ? { solBalanceChanges } : {}),
      ...(watchedAddress ? { watchedAddress } : {}),
      ...(mint ? { mint } : {}),
      ...(symbol ? { symbol } : {}),
      ...(timestamp ? { timestamp } : {})
    },
    options
  );

  if (args.json) {
    console.log(JSON.stringify(observations, null, 2));
  } else {
    for (const observation of observations) {
      console.log(
        [
          observation.signature,
          observation.mint,
          observation.side,
          observation.quoteAsset,
          observation.confidence,
          observation.usableForMetrics ? "usable" : "observation-only"
        ].join(" ")
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    json: true,
    watchedKind: "unknown"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--file") {
      parsed.file = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--watched-address") {
      parsed.watchedAddress = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--watched-kind") {
      parsed.watchedKind = parseWatchedKind(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--mint") {
      parsed.mint = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--sol-usd-price") {
      parsed.solUsdPrice = Number.parseFloat(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--json") {
      parsed.json = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
  }

  if (
    parsed.solUsdPrice !== undefined &&
    (!Number.isFinite(parsed.solUsdPrice) || parsed.solUsdPrice <= 0)
  ) {
    throw new Error("--sol-usd-price must be a positive number");
  }

  return parsed;
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function parseBoolean(value: string, arg: string): boolean {
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${arg} must be true or false`);
}

function parseWatchedKind(value: string): WatchedAddressKind {
  if (
    value === "wallet" ||
    value === "pool" ||
    value === "bonding_curve" ||
    value === "unknown"
  ) {
    return value;
  }

  throw new Error("--watched-kind must be wallet, pool, bonding_curve, or unknown");
}

function getTransaction(value: unknown): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  if ("transaction" in value) {
    return (value as { transaction?: unknown }).transaction;
  }

  if ("meta" in value) {
    return value;
  }

  return undefined;
}

function getString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  const next = (value as Record<string, unknown>)[key];
  return typeof next === "string" && next.length > 0 ? next : undefined;
}

function getArray<T = never>(value: unknown, key: string): T[] | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  const next = (value as Record<string, unknown>)[key];
  return Array.isArray(next) ? (next as T[]) : undefined;
}
