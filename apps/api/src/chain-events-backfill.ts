import {
  createBackfillScanner,
  isValidSolanaAddress,
  type SolanaRpcCommitment
} from "@axi/chain-events";

type BackfillArgs = {
  address?: string;
  commitment: SolanaRpcCommitment;
  limit: number;
  rpc?: string;
};

const args = parseArgs(process.argv.slice(2));

if (!args.address) {
  writeError("MISSING_ADDRESS", "Pass --address <ADDRESS> to backfill read-only chain events.");
  process.exitCode = 1;
} else if (!isValidSolanaAddress(args.address)) {
  writeError("INVALID_SOLANA_ADDRESS", `${args.address} is not a valid Solana address.`);
  process.exitCode = 1;
} else if (!args.rpc) {
  writeError(
    "CHAIN_EVENTS_CONFIG_MISSING_RPC",
    "Set SOLANA_RPC_HTTP or pass --rpc for read-only chain event backfill."
  );
  process.exitCode = 1;
} else {
  const scanner = createBackfillScanner({
    commitment: args.commitment,
    requestTimeoutMs: parsePositiveIntegerEnv(
      process.env.CHAIN_EVENTS_REQUEST_TIMEOUT_MS,
      10_000
    ),
    rpcHttpUrl: args.rpc
  });
  const records = await scanner.scanAddress({
    address: args.address,
    limit: args.limit,
    watchedAddress: {
      address: args.address,
      kind: "unknown",
      source: "cli",
      reasonCodes: ["CHAIN_EVENTS_CLI_BACKFILL"]
    }
  });

  for (const record of records) {
    console.log(
      JSON.stringify({
        payload: record.transactionEvent,
        paperOnly: true,
        source: "chain_transaction_event"
      })
    );

    for (const tradeEvent of record.tradeEvents) {
      console.log(
        JSON.stringify({
          payload: tradeEvent,
          paperOnly: true,
          source: "chain_trade_event"
        })
      );
    }
  }
}

function parseArgs(argv: string[]): BackfillArgs {
  const parsed: BackfillArgs = {
    commitment: parseCommitment(process.env.SOLANA_RPC_COMMITMENT),
    limit: 10
  };

  if (process.env.SOLANA_RPC_HTTP) {
    parsed.rpc = process.env.SOLANA_RPC_HTTP;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--address") {
      parsed.address = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--rpc") {
      parsed.rpc = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      parsed.limit = parsePositiveInteger(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--commitment") {
      parsed.commitment = parseCommitment(readValue(argv, index, arg));
      index += 1;
    }
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

function parseCommitment(value: string | undefined): SolanaRpcCommitment {
  if (value === "processed" || value === "confirmed" || value === "finalized") {
    return value;
  }

  return "confirmed";
}

function parsePositiveInteger(value: string, arg: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${arg} must be a positive integer`);
  }

  return parsed;
}

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function writeError(code: string, message: string): void {
  console.error(`${code}: ${message}`);
}
