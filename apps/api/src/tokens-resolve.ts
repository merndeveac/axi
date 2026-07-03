import { isValidSolanaMint } from "@axi/data-feeds";
import { resolveTokenIdentityFromSolana } from "@axi/solana-chain";
import {
  createEmptyTokenIdentity,
  mergeTokenIdentities,
  normalizeOffchainMetadataIdentity,
  sanitizeMetadataUri
} from "@axi/token-identity";
import { loadApiConfig } from "./app";

type Args = {
  json: boolean;
  mint: string;
  offchain: boolean;
  solanaMetadata: boolean;
};

const args = parseArgs(process.argv.slice(2));

if (!isValidSolanaMint(args.mint)) {
  throw new Error(`Invalid Solana mint: ${args.mint}`);
}

const config = loadApiConfig();
let identity = createEmptyTokenIdentity(args.mint);

if (args.solanaMetadata) {
  if (!config.SOLANA_RPC_HTTP) {
    throw new Error("SOLANA_RPC_HTTP is required for Solana metadata resolution");
  }

  identity = mergeTokenIdentities(
    identity,
    await resolveTokenIdentityFromSolana(args.mint, {
      rpcHttpUrl: config.SOLANA_RPC_HTTP
    })
  );
}

if (args.offchain) {
  const metadataUri = sanitizeMetadataUri(identity.metadataUri);

  if (!metadataUri) {
    identity = {
      ...identity,
      reasonCodes: unique([
        ...identity.reasonCodes,
        "TOKEN_IDENTITY_OFFCHAIN_URI_MISSING"
      ]),
      updatedAt: new Date().toISOString()
    };
  } else {
    const metadata = await fetchOffchainMetadata(
      toFetchableMetadataUri(metadataUri, config.TOKEN_IDENTITY_IPFS_GATEWAY),
      config.TOKEN_IDENTITY_OFFCHAIN_TIMEOUT_MS,
      config.TOKEN_IDENTITY_MAX_METADATA_BYTES
    );
    identity = mergeTokenIdentities(
      identity,
      normalizeOffchainMetadataIdentity(metadata, metadataUri, args.mint)
    );
  }
}

if (args.json) {
  console.log(JSON.stringify(identity, null, 2));
} else {
  console.log(`${identity.title} ${identity.confidence} ${identity.dataSource}`);
}

function parseArgs(argv: string[]): Args {
  const parsed: Partial<Args> = {
    json: true,
    offchain: false,
    solanaMetadata: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mint") {
      parsed.mint = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--solana-metadata") {
      parsed.solanaMetadata = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--offchain") {
      parsed.offchain = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--json") {
      parsed.json = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
    }
  }

  if (!parsed.mint) {
    throw new Error("--mint is required");
  }

  return parsed as Args;
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

async function fetchOffchainMetadata(
  url: string,
  timeoutMs: number,
  maxBytes: number
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`metadata fetch failed with HTTP ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");

    if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
      throw new Error("metadata response exceeds byte limit");
    }

    const text = await response.text();

    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error("metadata response exceeds byte limit");
    }

    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function toFetchableMetadataUri(uri: string, ipfsGateway: string): string {
  if (uri.startsWith("ipfs://")) {
    const path = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
    return `${ipfsGateway.replace(/\/+$/, "")}/${path}`;
  }

  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice("ar://".length)}`;
  }

  return uri;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
