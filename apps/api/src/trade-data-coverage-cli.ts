import { isValidSolanaMint } from "@axi/data-feeds";
import { tradeDataCoverageLimits } from "./trade-data-coverage-readiness";

export type TradeDataCoverageCliArgs = {
  mint: string | null;
  select: "newest";
  maxEvents: number;
  maxRuntimeMs: number;
  maxCostSol: number;
  postStopGraceMs: number;
  ackMetered: boolean;
  chainVerify: boolean;
  json: boolean;
};

export function parseTradeDataCoverageArgs(
  argv: readonly string[],
  defaults: Partial<
    Pick<
      TradeDataCoverageCliArgs,
      | "maxEvents"
      | "maxRuntimeMs"
      | "maxCostSol"
      | "postStopGraceMs"
      | "chainVerify"
    >
  > = {}
): TradeDataCoverageCliArgs {
  const parsed: TradeDataCoverageCliArgs = {
    mint: null,
    select: "newest",
    maxEvents: defaults.maxEvents ?? tradeDataCoverageLimits.defaultMaxEvents,
    maxRuntimeMs:
      defaults.maxRuntimeMs ?? tradeDataCoverageLimits.defaultMaxRuntimeMs,
    maxCostSol:
      defaults.maxCostSol ?? tradeDataCoverageLimits.defaultMaxCostSol,
    postStopGraceMs:
      defaults.postStopGraceMs ??
      tradeDataCoverageLimits.defaultPostStopGraceMs,
    ackMetered: false,
    chainVerify: defaults.chainVerify ?? false,
    json: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--ack-metered") {
      parsed.ackMetered = true;
      continue;
    }
    if (arg === "--mint") {
      parsed.mint = readValue(argv, index, arg).trim();
      index += 1;
      continue;
    }
    if (arg === "--select") {
      const value = readValue(argv, index, arg);
      if (value !== "newest") {
        throw new Error("--select must be newest");
      }
      parsed.select = value;
      index += 1;
      continue;
    }
    if (arg === "--max-events") {
      parsed.maxEvents = readInteger(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-runtime-ms") {
      parsed.maxRuntimeMs = readInteger(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-cost-sol") {
      parsed.maxCostSol = readNumber(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--post-stop-grace-ms") {
      parsed.postStopGraceMs = readInteger(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--chain-verify") {
      parsed.chainVerify = readBoolean(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      parsed.json = readBoolean(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown trade-data coverage argument: ${arg}`);
  }

  if (parsed.mint !== null && !isValidSolanaMint(parsed.mint)) {
    throw new Error(`Invalid Solana mint: ${parsed.mint}`);
  }
  if (!Number.isInteger(parsed.maxEvents)) {
    throw new Error("--max-events must be an integer");
  }
  if (!Number.isInteger(parsed.maxRuntimeMs)) {
    throw new Error("--max-runtime-ms must be an integer");
  }
  if (!Number.isFinite(parsed.maxCostSol)) {
    throw new Error("--max-cost-sol must be finite");
  }
  if (!Number.isInteger(parsed.postStopGraceMs)) {
    throw new Error("--post-stop-grace-ms must be an integer");
  }
  return parsed;
}

function readValue(
  argv: readonly string[],
  index: number,
  arg: string
): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function readInteger(
  argv: readonly string[],
  index: number,
  arg: string
): number {
  return Number.parseInt(readValue(argv, index, arg), 10);
}

function readNumber(
  argv: readonly string[],
  index: number,
  arg: string
): number {
  return Number(readValue(argv, index, arg));
}

function readBoolean(
  argv: readonly string[],
  index: number,
  arg: string
): boolean {
  const value = readValue(argv, index, arg).toLowerCase();
  if (["true", "1", "yes", "on"].includes(value)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(value)) {
    return false;
  }
  throw new Error(`${arg} must be true or false`);
}
