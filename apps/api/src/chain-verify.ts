import {
  createSolanaChainClient,
  isValidSolanaAddress,
  type SolanaRpcCommitment
} from "@axi/solana-chain";

type ChainVerifyArgs = {
  commitment: SolanaRpcCommitment;
  json: boolean;
  mint?: string;
  rpc?: string;
};

const args = parseArgs(process.argv.slice(2));

if (!args.mint) {
  writeError({
    code: "MISSING_MINT",
    message: "Pass --mint <MINT> to run read-only chain verification.",
    json: args.json
  });
  process.exitCode = 1;
} else if (!isValidSolanaAddress(args.mint)) {
  writeError({
    code: "INVALID_SOLANA_ADDRESS",
    message: `${args.mint} is not a valid Solana address.`,
    json: args.json
  });
  process.exitCode = 1;
} else if (!args.rpc) {
  writeError({
    code: "CHAIN_VERIFIER_CONFIG_MISSING_RPC",
    message: "Set SOLANA_RPC_HTTP or pass --rpc for read-only RPC verification.",
    json: args.json
  });
  process.exitCode = 1;
} else {
  const client = createSolanaChainClient({
    commitment: args.commitment,
    requestTimeoutMs: parsePositiveIntegerEnv(
      process.env.CHAIN_VERIFIER_REQUEST_TIMEOUT_MS,
      10_000
    ),
    rpcHttpUrl: args.rpc
  });
  const result = await client.verifyTokenOnChain(args.mint);

  if (args.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`mint=${result.mint}`);
    console.log(`status=${result.error ? "failed" : "verified"}`);
    console.log(`reasonCodes=${result.reasonCodes.join(",")}`);
  }

  if (result.error) {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): ChainVerifyArgs {
  const parsed: ChainVerifyArgs = {
    commitment: parseCommitment(process.env.SOLANA_RPC_COMMITMENT),
    json: false
  };

  if (process.env.SOLANA_RPC_HTTP) {
    parsed.rpc = process.env.SOLANA_RPC_HTTP;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mint") {
      parsed.mint = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--rpc") {
      parsed.rpc = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--commitment") {
      parsed.commitment = parseCommitment(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
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

function writeError(options: {
  code: string;
  json: boolean;
  message: string;
}): void {
  if (options.json) {
    console.log(
      JSON.stringify({
        error: options.code,
        message: options.message,
        paperOnly: true
      })
    );
    return;
  }

  console.error(`${options.code}: ${options.message}`);
}
