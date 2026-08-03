import { isValidSolanaMint } from "@axi/data-feeds";

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

export type TradeDataCoveragePreflightInput = {
  args: TradeDataCoverageCliArgs;
  liveAck: boolean;
  apiKeyConfigured: boolean;
  dataWalletPublicKey: string | undefined;
  balanceSol: number | null;
  minimumBalanceSol: number;
  solanaRpcConfigured: boolean;
  estimatedCostPerEventSol?: number;
};

export type TradeDataCoveragePreflight = {
  readyForLiveSession: boolean;
  missingRequirements: string[];
  selectedMintMode: "explicit" | "newest_free_discovery";
  balancePolicy: "known_acceptable" | "known_insufficient" | "unknown_allowed";
  caps: {
    maxMints: 1;
    maxEvents: number;
    maxRuntimeMs: number;
    maxCostSol: number;
    postStopGraceMs: number;
  };
  safety: {
    subscribeTokenTradeOnly: true;
    accountTradesActive: false;
    paperAutomationActive: false;
    lightningActive: false;
    signingActive: false;
    transactionSendingActive: false;
    liveTradingEnabled: false;
  };
  reasonCodes: string[];
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
    maxEvents: defaults.maxEvents ?? 50,
    maxRuntimeMs: defaults.maxRuntimeMs ?? 90_000,
    maxCostSol: defaults.maxCostSol ?? 0.0001,
    postStopGraceMs: defaults.postStopGraceMs ?? 5_000,
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
  if (
    !Number.isInteger(parsed.maxEvents) ||
    parsed.maxEvents < 1 ||
    parsed.maxEvents > 50
  ) {
    throw new Error("--max-events must be an integer from 1 through 50");
  }
  if (
    !Number.isInteger(parsed.maxRuntimeMs) ||
    parsed.maxRuntimeMs < 1 ||
    parsed.maxRuntimeMs > 90_000
  ) {
    throw new Error("--max-runtime-ms must be an integer from 1 through 90000");
  }
  if (
    !Number.isFinite(parsed.maxCostSol) ||
    parsed.maxCostSol <= 0 ||
    parsed.maxCostSol > 0.0001
  ) {
    throw new Error("--max-cost-sol must be greater than 0 and at most 0.0001");
  }
  if (!Number.isInteger(parsed.postStopGraceMs) || parsed.postStopGraceMs < 0) {
    throw new Error("--post-stop-grace-ms must be a nonnegative integer");
  }
  return parsed;
}

export function evaluateTradeDataCoveragePreflight(
  input: TradeDataCoveragePreflightInput
): TradeDataCoveragePreflight {
  const publicKey = input.dataWalletPublicKey?.trim();
  const publicKeyValid = publicKey ? isValidSolanaMint(publicKey) : false;
  const balancePolicy =
    input.balanceSol === null
      ? "unknown_allowed"
      : input.balanceSol >= input.minimumBalanceSol
        ? "known_acceptable"
        : "known_insufficient";
  const estimatedCostPerEventSol = input.estimatedCostPerEventSol ?? 0;
  const costEventLimit =
    estimatedCostPerEventSol > 0
      ? Math.floor(input.args.maxCostSol / estimatedCostPerEventSol)
      : input.args.maxEvents;
  const effectiveMaxEvents = Math.min(input.args.maxEvents, costEventLimit);
  const missingRequirements = unique([
    ...(input.args.ackMetered ? [] : ["--ack-metered"]),
    ...(input.liveAck ? [] : ["TRADE_DATA_COVERAGE_LIVE_ACK=true"]),
    ...(input.apiKeyConfigured ? [] : ["PUMPPORTAL_DATA_API_KEY"]),
    ...(publicKey ? [] : ["PUMPPORTAL_DATA_WALLET_PUBLIC_KEY"]),
    ...(publicKey && !publicKeyValid
      ? ["PUMPPORTAL_DATA_WALLET_PUBLIC_KEY_VALID"]
      : []),
    ...(balancePolicy === "known_insufficient"
      ? ["DATA_WALLET_BALANCE_AT_OR_ABOVE_MINIMUM"]
      : []),
    ...(input.args.chainVerify && !input.solanaRpcConfigured
      ? ["SOLANA_RPC_HTTP_FOR_CHAIN_VERIFY"]
      : []),
    ...(effectiveMaxEvents < 1 ? ["MAX_COST_COVERS_AT_LEAST_ONE_EVENT"] : [])
  ]);

  return {
    readyForLiveSession: missingRequirements.length === 0,
    missingRequirements,
    selectedMintMode: input.args.mint ? "explicit" : "newest_free_discovery",
    balancePolicy,
    caps: {
      maxMints: 1,
      maxEvents: effectiveMaxEvents,
      maxRuntimeMs: input.args.maxRuntimeMs,
      maxCostSol: input.args.maxCostSol,
      postStopGraceMs: input.args.postStopGraceMs
    },
    safety: {
      subscribeTokenTradeOnly: true,
      accountTradesActive: false,
      paperAutomationActive: false,
      lightningActive: false,
      signingActive: false,
      transactionSendingActive: false,
      liveTradingEnabled: false
    },
    reasonCodes: unique([
      "TRADE_DATA_COVERAGE_PREFLIGHT",
      balancePolicy === "unknown_allowed"
        ? "BALANCE_UNKNOWN_ALLOWED_BY_REPOSITORY_POLICY"
        : balancePolicy === "known_acceptable"
          ? "DATA_WALLET_BALANCE_ACCEPTABLE"
          : "DATA_WALLET_BALANCE_INSUFFICIENT",
      ...(input.args.ackMetered
        ? ["METERED_COST_ACKNOWLEDGED"]
        : ["PREFLIGHT_ONLY"]),
      "PAPER_ONLY",
      "ACCOUNT_TRADES_DISABLED",
      "LIVE_TRADING_DISABLED"
    ])
  };
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
