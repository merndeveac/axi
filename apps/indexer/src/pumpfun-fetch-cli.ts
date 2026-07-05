import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import {
  sanitizeTransactionFixture,
  type FixtureManifest,
  type FixtureManifestEntry,
  type FixtureManifestKind
} from "@axi/pumpfun-decoder";
import { resolvePumpfunFixturePath } from "./sources/pumpfun-fixture-source";

export type PumpfunFetchCliOptions = {
  cluster: "mainnet-beta" | "devnet" | "local" | "unknown";
  json: boolean;
  kind: FixtureManifestKind;
  out?: string;
  rpc?: string;
  signature: string;
  updateManifest: boolean;
};

export type PumpfunFetchCliResult = {
  entry?: FixtureManifestEntry;
  manifestUpdated: boolean;
  outFile: string;
  paperOnly: true;
  rpcUrlConfigured: boolean;
  signature: string;
  tradingDisabled: true;
  transactionFound: boolean;
};

export type PumpfunFetchRuntime = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  readFile?: (path: string) => string;
  writeFile?: (path: string, value: string) => void;
};

type JsonRpcResponse = {
  result?: unknown;
  error?: unknown;
};

export function parsePumpfunFetchArgs(argv: string[]): PumpfunFetchCliOptions {
  const options: Partial<PumpfunFetchCliOptions> = {
    cluster: "mainnet-beta",
    json: true,
    updateManifest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg || arg === "--") {
      continue;
    }

    if (arg.startsWith("--signature=")) {
      options.signature = arg.slice("--signature=".length);
      continue;
    }

    if (arg === "--signature") {
      options.signature = readNextArg(argv, index, "--signature");
      index += 1;
      continue;
    }

    if (arg.startsWith("--kind=")) {
      options.kind = readFixtureKind(arg.slice("--kind=".length));
      continue;
    }

    if (arg === "--kind") {
      options.kind = readFixtureKind(readNextArg(argv, index, "--kind"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--rpc=")) {
      options.rpc = arg.slice("--rpc=".length);
      continue;
    }

    if (arg === "--rpc") {
      options.rpc = readNextArg(argv, index, "--rpc");
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
      continue;
    }

    if (arg === "--out") {
      options.out = readNextArg(argv, index, "--out");
      index += 1;
      continue;
    }

    if (arg.startsWith("--cluster=")) {
      options.cluster = readCluster(arg.slice("--cluster=".length));
      continue;
    }

    if (arg === "--cluster") {
      options.cluster = readCluster(readNextArg(argv, index, "--cluster"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--json=")) {
      options.json = parseBooleanOption(arg.slice("--json=".length), "--json");
      continue;
    }

    if (arg === "--json") {
      options.json = parseBooleanOption(readNextArg(argv, index, "--json"), "--json");
      index += 1;
      continue;
    }

    if (arg.startsWith("--update-manifest=")) {
      options.updateManifest = parseBooleanOption(
        arg.slice("--update-manifest=".length),
        "--update-manifest"
      );
      continue;
    }

    if (arg === "--update-manifest") {
      options.updateManifest = parseBooleanOption(
        readNextArg(argv, index, "--update-manifest"),
        "--update-manifest"
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown fetch:pumpfun-fixture option: ${arg}`);
  }

  if (!options.signature) {
    throw new Error("SIGNATURE_REQUIRED");
  }

  if (!options.kind) {
    throw new Error("KIND_REQUIRED");
  }

  return options as PumpfunFetchCliOptions;
}

export async function runPumpfunFetchFixtureCli(
  argv: string[],
  runtime: PumpfunFetchRuntime = {}
): Promise<PumpfunFetchCliResult> {
  const options = parsePumpfunFetchArgs(argv);
  const env = runtime.env ?? process.env;
  const rpcUrl = options.rpc ?? env.SOLANA_RPC_HTTP;

  if (!rpcUrl) {
    throw new Error("RPC_CONFIG_MISSING");
  }

  const fetchImpl = runtime.fetchImpl ?? fetch;
  const transaction = await fetchTransaction(fetchImpl, rpcUrl, options.signature);
  const sanitized = sanitizeTransactionFixture({
    ...asRecord(transaction),
    signature: readSignature(transaction) ?? options.signature
  });
  const outFile = resolveFixtureOutputPath(options);
  const writeFile =
    runtime.writeFile ?? ((path: string, value: string) => writeFileSync(path, value));

  mkdirSync(dirname(outFile), { recursive: true });
  writeFile(outFile, `${JSON.stringify(sanitized, null, 2)}\n`);

  const entry = options.updateManifest
    ? updateManifest(options, outFile, runtime)
    : undefined;
  const result: PumpfunFetchCliResult = {
    ...(entry ? { entry } : {}),
    manifestUpdated: options.updateManifest,
    outFile,
    paperOnly: true,
    rpcUrlConfigured: true,
    signature: options.signature,
    tradingDisabled: true,
    transactionFound: true
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`fixture=${outFile}`);
  }

  return result;
}

async function fetchTransaction(
  fetchImpl: typeof fetch,
  rpcUrl: string,
  signature: string
): Promise<unknown> {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      id: "axi-pumpfun-fixture-fetch",
      jsonrpc: "2.0",
      method: "getTransaction",
      params: [
        signature,
        {
          commitment: "confirmed",
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0
        }
      ]
    })
  });
  const body = await response.json() as JsonRpcResponse;

  if (body.error) {
    throw new Error(`RPC_ERROR: ${JSON.stringify(body.error)}`);
  }

  if (!body.result) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  return body.result;
}

function updateManifest(
  options: PumpfunFetchCliOptions,
  outFile: string,
  runtime: PumpfunFetchRuntime
): FixtureManifestEntry {
  const readFile =
    runtime.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const writeFile =
    runtime.writeFile ?? ((path: string, value: string) => writeFileSync(path, value));
  const manifestPath = resolvePumpfunFixturePath(
    "packages/pumpfun-decoder/fixtures/manifest.json"
  );
  const manifest = JSON.parse(readFile(manifestPath)) as FixtureManifest;
  const entry = createManifestEntry(options, outFile, runtime.now?.() ?? new Date());
  const existingIndex = manifest.fixtures.findIndex(
    (candidate) => candidate.id === entry.id || candidate.filename === entry.filename
  );

  if (existingIndex >= 0) {
    manifest.fixtures[existingIndex] = entry;
  } else {
    manifest.fixtures.push(entry);
  }

  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return entry;
}

function createManifestEntry(
  options: PumpfunFetchCliOptions,
  outFile: string,
  now: Date
): FixtureManifestEntry {
  const filename = toFixtureRelativePath(outFile);

  return {
    id: `imported-${options.signature}`,
    filename,
    kind: options.kind,
    fixtureType: "imported_public_rpc",
    source: "solana_getTransaction",
    cluster: options.cluster,
    signature: options.signature,
    slot: null,
    blockTime: null,
    expectedMint: null,
    expectedSide: expectedSideForKind(options.kind),
    expectedEventType: expectedEventTypeForKind(options.kind),
    expectedUsableForMetrics:
      options.kind === "buy_trade" || options.kind === "sell_trade",
    notes: "Imported public Solana getTransaction fixture.",
    sanitized: true,
    addedAt: now.toISOString(),
    noExpectedOutput: true
  };
}

function resolveFixtureOutputPath(options: PumpfunFetchCliOptions): string {
  const fixtureRoot = resolvePumpfunFixturePath("packages/pumpfun-decoder/fixtures");
  const outputPath = options.out
    ? resolvePumpfunFixturePath(options.out)
    : resolve(fixtureRoot, "imported", `${options.signature}.json`);
  const relativePath = relative(fixtureRoot, outputPath);

  if (
    relativePath.startsWith("..") ||
    relativePath === "" ||
    relativePath.split(sep).includes("..")
  ) {
    throw new Error("PUMPFUN_FIXTURE_OUTSIDE_FIXTURE_DIR");
  }

  return outputPath;
}

function toFixtureRelativePath(outFile: string): string {
  const fixtureRoot = resolvePumpfunFixturePath("packages/pumpfun-decoder/fixtures");
  return relative(fixtureRoot, outFile).split(sep).join("/");
}

function expectedEventTypeForKind(
  kind: FixtureManifestKind
): FixtureManifestEntry["expectedEventType"] {
  if (kind === "token_created") {
    return "token_created";
  }

  if (kind === "migration") {
    return "token_migrated";
  }

  if (kind === "buy_trade" || kind === "sell_trade") {
    return "token_trade";
  }

  return "unknown";
}

function expectedSideForKind(
  kind: FixtureManifestKind
): "buy" | "sell" | "unknown" | null {
  if (kind === "buy_trade") {
    return "buy";
  }

  if (kind === "sell_trade") {
    return "sell";
  }

  return null;
}

function readFixtureKind(value: string): FixtureManifestKind {
  if (
    value === "token_created" ||
    value === "buy_trade" ||
    value === "sell_trade" ||
    value === "migration" ||
    value === "failed_transaction" ||
    value === "unknown"
  ) {
    return value;
  }

  throw new Error("KIND_INVALID");
}

function readCluster(
  value: string
): PumpfunFetchCliOptions["cluster"] {
  if (
    value === "mainnet-beta" ||
    value === "devnet" ||
    value === "local" ||
    value === "unknown"
  ) {
    return value;
  }

  throw new Error("CLUSTER_INVALID");
}

function readNextArg(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function parseBooleanOption(value: string, name: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} accepts true or false`);
}

function readSignature(value: unknown): string | null {
  const record = asRecord(value);
  const transaction = asRecord(record?.transaction);
  const signatures = transaction?.signatures;

  if (typeof record?.signature === "string") {
    return record.signature;
  }

  if (Array.isArray(signatures) && typeof signatures[0] === "string") {
    return signatures[0];
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}
