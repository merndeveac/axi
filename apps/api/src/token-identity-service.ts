import type { FeedEvent, TokenTradeEvent } from "@axi/data-feeds";
import { isValidSolanaMint } from "@axi/data-feeds";
import { resolveTokenIdentityFromSolana } from "@axi/solana-chain";
import type { TokenIdentitySummary } from "@axi/shared";
import {
  getTokenIdentity as getStoredTokenIdentity,
  listTokenIdentities,
  saveTokenMetadataFetch,
  upsertTokenIdentity
} from "@axi/storage";
import {
  createEmptyTokenIdentity,
  isTokenIdentityResolved,
  mergeTokenIdentities,
  normalizeOffchainMetadataIdentity,
  normalizePumpPortalIdentity,
  sanitizeMetadataUri,
  type TokenIdentity
} from "@axi/token-identity";

export type TokenIdentityServiceConfig = {
  solanaMetadataEnabled: boolean;
  solanaMetadataOnNewToken: boolean;
  solanaMetadataOnDemand: boolean;
  offchainFetchEnabled: boolean;
  offchainTimeoutMs: number;
  offchainCacheTtlMs: number;
  ipfsGateway: string;
  maxMetadataBytes: number;
  rpcHttpUrl?: string | undefined;
};

export type TokenIdentityServiceStatus = {
  enabled: true;
  solanaMetadataEnabled: boolean;
  solanaMetadataOnNewToken: boolean;
  solanaMetadataOnDemand: boolean;
  solanaMetadataConfigured: boolean;
  offchainFetchEnabled: boolean;
  identityCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  lastResolvedAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
  paperOnly: true;
};

export type TokenIdentityService = {
  clear: () => void;
  getAllIdentities: () => TokenIdentity[];
  getIdentity: (mint: string) => TokenIdentity | undefined;
  getStatus: () => TokenIdentityServiceStatus;
  ingestFeedEvent: (event: FeedEvent) => TokenIdentity;
  ingestTradeEvent: (event: TokenTradeEvent) => TokenIdentity;
  resolveIdentity: (mint: string, reason: string) => Promise<TokenIdentity>;
};

export function createTokenIdentityConfig(
  input: Partial<TokenIdentityServiceConfig> = {}
): TokenIdentityServiceConfig {
  return {
    solanaMetadataEnabled: input.solanaMetadataEnabled ?? false,
    solanaMetadataOnNewToken: input.solanaMetadataOnNewToken ?? false,
    solanaMetadataOnDemand: input.solanaMetadataOnDemand ?? true,
    offchainFetchEnabled: input.offchainFetchEnabled ?? false,
    offchainTimeoutMs: input.offchainTimeoutMs ?? 5000,
    offchainCacheTtlMs: input.offchainCacheTtlMs ?? 3_600_000,
    ipfsGateway: input.ipfsGateway ?? "https://ipfs.io/ipfs/",
    maxMetadataBytes: input.maxMetadataBytes ?? 262_144,
    ...(input.rpcHttpUrl ? { rpcHttpUrl: input.rpcHttpUrl } : {})
  };
}

export function createTokenIdentityService(options: {
  config?: Partial<TokenIdentityServiceConfig>;
  fetchImpl?: typeof fetch;
  logger?: {
    warn?: (message: string, context?: Record<string, unknown>) => void;
  };
} = {}): TokenIdentityService {
  const config = createTokenIdentityConfig(options.config);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const logger = options.logger ?? {};
  const identities = new Map<string, TokenIdentity>();
  const offchainCache = new Map<
    string,
    {
      expiresAt: number;
      identity: TokenIdentity;
    }
  >();
  const inFlight = new Set<string>();
  let lastResolvedAt: string | null = null;
  let lastError: string | null = null;

  for (const stored of listTokenIdentities(1000)) {
    identities.set(stored.mint, stored);
  }

  function ingestFeedEvent(event: FeedEvent): TokenIdentity {
    const identity = normalizeIdentityFromEvent(event);
    const merged = persistMergedIdentity(identity);

    if (
      event.type === "token_created" &&
      config.solanaMetadataEnabled &&
      config.solanaMetadataOnNewToken &&
      needsResolution(merged)
    ) {
      void resolveIdentity(merged.mint, "new_token").catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn?.("Token identity background resolution failed", {
          error: lastError,
          mint: merged.mint
        });
      });
    }

    return merged;
  }

  function ingestTradeEvent(event: TokenTradeEvent): TokenIdentity {
    return ingestFeedEvent(event);
  }

  async function resolveIdentity(
    mint: string,
    reason: string
  ): Promise<TokenIdentity> {
    if (!isValidSolanaMint(mint)) {
      throw new Error(`Invalid Solana mint: ${mint}`);
    }

    if (inFlight.has(mint)) {
      return getIdentity(mint) ?? createEmptyTokenIdentity(mint);
    }

    inFlight.add(mint);

    try {
      let identity = getIdentity(mint) ?? createEmptyTokenIdentity(mint);

      if (!config.solanaMetadataEnabled) {
        identity = persistMergedIdentity({
          ...identity,
          reasonCodes: unique([
            ...identity.reasonCodes,
            "TOKEN_IDENTITY_SOLANA_METADATA_DISABLED"
          ]),
          updatedAt: new Date().toISOString()
        });
      } else if (!config.rpcHttpUrl) {
        identity = persistMergedIdentity({
          ...identity,
          reasonCodes: unique([
            ...identity.reasonCodes,
            "TOKEN_IDENTITY_SOLANA_METADATA_CONFIG_MISSING"
          ]),
          updatedAt: new Date().toISOString()
        });
      } else {
        const solanaIdentity = await resolveTokenIdentityFromSolana(mint, {
          rpcHttpUrl: config.rpcHttpUrl
        });
        saveTokenMetadataFetch({
          mint,
          source: "solana_metadata",
          status: isTokenIdentityResolved(solanaIdentity)
            ? "success"
            : "unresolved",
          reasonCodes: solanaIdentity.reasonCodes,
          payload: solanaIdentity,
          fetchedAt: solanaIdentity.updatedAt
        });
        identity = persistMergedIdentity(solanaIdentity);
      }

      if (!config.offchainFetchEnabled) {
        identity = persistMergedIdentity({
          ...identity,
          reasonCodes: unique([
            ...identity.reasonCodes,
            "TOKEN_IDENTITY_OFFCHAIN_DISABLED"
          ]),
          updatedAt: new Date().toISOString()
        });
      } else if (identity.metadataUri) {
        identity = await resolveOffchainMetadata(identity, reason);
      }

      lastResolvedAt = new Date().toISOString();
      return identity;
    } finally {
      inFlight.delete(mint);
    }
  }

  function getIdentity(mint: string): TokenIdentity | undefined {
    const cached = identities.get(mint);

    if (cached) {
      return cached;
    }

    const stored = getStoredTokenIdentity(mint);

    if (stored) {
      identities.set(mint, stored);
      return stored;
    }

    return undefined;
  }

  function getAllIdentities(): TokenIdentity[] {
    return Array.from(identities.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  function getStatus(): TokenIdentityServiceStatus {
    const all = getAllIdentities();
    const resolvedCount = all.filter(isTokenIdentityResolved).length;
    const reasonCodes = [
      "TOKEN_IDENTITY_ENABLED",
      ...(config.solanaMetadataEnabled
        ? []
        : ["TOKEN_IDENTITY_SOLANA_METADATA_DISABLED"]),
      ...(config.offchainFetchEnabled
        ? []
        : ["TOKEN_IDENTITY_OFFCHAIN_DISABLED"]),
      ...(config.solanaMetadataEnabled && !config.rpcHttpUrl
        ? ["TOKEN_IDENTITY_SOLANA_METADATA_CONFIG_MISSING"]
        : [])
    ];

    return {
      enabled: true,
      solanaMetadataEnabled: config.solanaMetadataEnabled,
      solanaMetadataOnNewToken: config.solanaMetadataOnNewToken,
      solanaMetadataOnDemand: config.solanaMetadataOnDemand,
      solanaMetadataConfigured: Boolean(config.rpcHttpUrl),
      offchainFetchEnabled: config.offchainFetchEnabled,
      identityCount: all.length,
      resolvedCount,
      unresolvedCount: all.length - resolvedCount,
      lastResolvedAt,
      lastError,
      reasonCodes,
      paperOnly: true
    };
  }

  function clear(): void {
    identities.clear();
    offchainCache.clear();
    inFlight.clear();
    lastResolvedAt = null;
    lastError = null;
  }

  async function resolveOffchainMetadata(
    identity: TokenIdentity,
    reason: string
  ): Promise<TokenIdentity> {
    const sanitizedUri = sanitizeMetadataUri(identity.metadataUri);

    if (!sanitizedUri) {
      const failed = {
        ...identity,
        reasonCodes: unique([...identity.reasonCodes, "IDENTITY_URI_INVALID"]),
        updatedAt: new Date().toISOString()
      };
      saveTokenMetadataFetch({
        mint: identity.mint,
        uri: identity.metadataUri,
        source: "offchain_metadata",
        status: "invalid_uri",
        reasonCodes: ["IDENTITY_URI_INVALID", reason],
        payload: {
          uri: identity.metadataUri
        }
      });
      return persistMergedIdentity(failed);
    }

    const cached = offchainCache.get(sanitizedUri);

    if (cached && cached.expiresAt > Date.now()) {
      return persistMergedIdentity(cached.identity);
    }

    try {
      const response = await fetchWithTimeout(
        toFetchableMetadataUri(sanitizedUri, config.ipfsGateway),
        config.offchainTimeoutMs,
        fetchImpl
      );
      const contentLength = response.headers.get("content-length");

      if (
        contentLength &&
        Number.parseInt(contentLength, 10) > config.maxMetadataBytes
      ) {
        throw new Error("metadata response exceeds byte limit");
      }

      const text = await response.text();

      if (Buffer.byteLength(text, "utf8") > config.maxMetadataBytes) {
        throw new Error("metadata response exceeds byte limit");
      }

      const json = JSON.parse(text) as unknown;
      const offchainIdentity = normalizeOffchainMetadataIdentity(
        json,
        sanitizedUri,
        identity.mint
      );
      saveTokenMetadataFetch({
        mint: identity.mint,
        uri: sanitizedUri,
        source: "offchain_metadata",
        status: "success",
        reasonCodes: offchainIdentity.reasonCodes,
        payload: json
      });
      offchainCache.set(sanitizedUri, {
        expiresAt: Date.now() + config.offchainCacheTtlMs,
        identity: offchainIdentity
      });
      return persistMergedIdentity(offchainIdentity);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      saveTokenMetadataFetch({
        mint: identity.mint,
        uri: sanitizedUri,
        source: "offchain_metadata",
        status: "failed",
        reasonCodes: ["IDENTITY_JSON_FETCH_FAILED", reason],
        payload: {
          error: message,
          uri: sanitizedUri
        }
      });

      return persistMergedIdentity({
        ...identity,
        reasonCodes: unique([
          ...identity.reasonCodes,
          "TOKEN_IDENTITY_OFFCHAIN_FETCH_FAILED"
        ]),
        updatedAt: new Date().toISOString()
      });
    }
  }

  function persistMergedIdentity(incoming: TokenIdentity): TokenIdentity {
    const existing = getIdentity(incoming.mint);
    const merged = mergeTokenIdentities(existing, incoming);

    identities.set(merged.mint, merged);
    upsertTokenIdentity(merged);
    return merged;
  }

  return {
    clear,
    getAllIdentities,
    getIdentity,
    getStatus,
    ingestFeedEvent,
    ingestTradeEvent,
    resolveIdentity
  };
}

export function toTokenIdentitySummary(
  identity: TokenIdentity
): TokenIdentitySummary {
  return {
    mint: identity.mint,
    name: identity.name,
    symbol: identity.symbol,
    title: identity.title,
    displayName: identity.displayName,
    metadataUri: identity.metadataUri,
    imageUri: identity.imageUri,
    description: identity.description,
    website: identity.website,
    twitter: identity.twitter,
    telegram: identity.telegram,
    discord: identity.discord,
    creator: identity.creator,
    confidence: identity.confidence,
    completenessScore: identity.completenessScore,
    realData: identity.realData,
    dataSource: identity.dataSource,
    resolved: isTokenIdentityResolved(identity),
    reasonCodes: identity.reasonCodes,
    sourcePriority: identity.sourcePriority,
    firstSeenAt: identity.firstSeenAt,
    updatedAt: identity.updatedAt
  };
}

function normalizeIdentityFromEvent(event: FeedEvent): TokenIdentity {
  const identity = normalizePumpPortalIdentity(event);

  if (event.source === "mock") {
    return {
      ...identity,
      realData: false,
      dataSource: "mock",
      reasonCodes: unique([
        "IDENTITY_FROM_MOCK",
        "MOCK_DATA",
        ...identity.reasonCodes.filter(
          (reasonCode) => reasonCode !== "IDENTITY_FROM_PUMPPORTAL"
        )
      ]),
      sources: identity.sources.map((source) => ({
        ...source,
        realData: false,
        source: "mock",
        reasonCodes: ["IDENTITY_FROM_MOCK", "MOCK_DATA"]
      }))
    };
  }

  if (event.source !== "pumpportal") {
    const empty = createEmptyTokenIdentity(identity.mint);
    return {
      ...empty,
      reasonCodes: unique([...empty.reasonCodes, "TOKEN_IDENTITY_CREATED"])
    };
  }

  return {
    ...identity,
    reasonCodes: unique([...identity.reasonCodes, "TOKEN_IDENTITY_CREATED"])
  };
}

function needsResolution(identity: TokenIdentity): boolean {
  return !identity.name || !identity.symbol || !identity.metadataUri;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`metadata fetch failed with HTTP ${response.status}`);
    }

    return response;
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
