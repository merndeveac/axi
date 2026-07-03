export type TokenIdentityDataSource =
  | "pumpportal"
  | "solana_metadata"
  | "offchain_metadata"
  | "dexscreener"
  | "jupiter_price"
  | "manual"
  | "mock"
  | "unknown";

export type TokenIdentityConfidence = "none" | "low" | "medium" | "high";

export type TokenIdentitySource = {
  source: TokenIdentityDataSource;
  realData: boolean;
  name?: string | null;
  symbol?: string | null;
  metadataUri?: string | null;
  imageUri?: string | null;
  description?: string | null;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  discord?: string | null;
  creator?: string | null;
  confidence: TokenIdentityConfidence;
  reasonCodes: string[];
  fetchedAt: string;
  raw?: unknown;
};

export type TokenIdentity = {
  mint: string;
  name: string | null;
  symbol: string | null;
  title: string;
  displayName: string;
  normalizedName: string | null;
  normalizedSymbol: string | null;
  metadataUri: string | null;
  imageUri: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  creator: string | null;
  sourcePriority: string[];
  sources: TokenIdentitySource[];
  confidence: TokenIdentityConfidence;
  completenessScore: number;
  realData: boolean;
  dataSource: TokenIdentityDataSource;
  reasonCodes: string[];
  firstSeenAt: string;
  updatedAt: string;
  raw?: unknown;
};

export type SolanaMetadataIdentityInput = {
  mint: string;
  name?: string | null;
  symbol?: string | null;
  metadataUri?: string | null;
  uri?: string | null;
  creator?: string | null;
  updateAuthority?: string | null;
  fetchedAt?: string;
  raw?: unknown;
};

const sourceRank: Record<TokenIdentityDataSource, number> = {
  offchain_metadata: 0,
  solana_metadata: 1,
  pumpportal: 2,
  dexscreener: 3,
  manual: 4,
  mock: 5,
  unknown: 6,
  jupiter_price: 7
};

const maxNameLength = 96;
const maxSymbolLength = 24;
const maxDescriptionLength = 2048;

export function createEmptyTokenIdentity(mint: string): TokenIdentity {
  const now = new Date().toISOString();

  return finalizeIdentity({
    mint,
    name: null,
    symbol: null,
    title: shortMint(mint),
    displayName: shortMint(mint),
    normalizedName: null,
    normalizedSymbol: null,
    metadataUri: null,
    imageUri: null,
    description: null,
    website: null,
    twitter: null,
    telegram: null,
    discord: null,
    creator: null,
    sourcePriority: ["unknown"],
    sources: [
      {
        source: "unknown",
        realData: false,
        confidence: "none",
        reasonCodes: ["IDENTITY_UNRESOLVED"],
        fetchedAt: now
      }
    ],
    confidence: "none",
    completenessScore: 0,
    realData: false,
    dataSource: "unknown",
    reasonCodes: ["IDENTITY_UNRESOLVED"],
    firstSeenAt: now,
    updatedAt: now
  });
}

export function normalizeTokenName(value: unknown): string | null {
  return sanitizeText(value, maxNameLength);
}

export function normalizeTokenSymbol(value: unknown): string | null {
  const symbol = sanitizeText(value, maxSymbolLength);
  return symbol ? symbol.toUpperCase() : null;
}

export function createTokenTitle(identity: Pick<TokenIdentity, "mint" | "name" | "symbol">): string {
  if (identity.symbol && identity.name) {
    return `${identity.symbol} - ${identity.name}`;
  }

  if (identity.name) {
    return identity.name;
  }

  if (identity.symbol) {
    return identity.symbol;
  }

  return shortMint(identity.mint);
}

export function createDisplayName(
  identity: Pick<TokenIdentity, "mint" | "name" | "symbol">
): string {
  if (identity.symbol && identity.name) {
    return `${identity.symbol} ${identity.name}`.slice(0, 48);
  }

  return createTokenTitle(identity).slice(0, 48);
}

export function mergeTokenIdentities(
  existing: TokenIdentity | null | undefined,
  incoming: TokenIdentity
): TokenIdentity {
  if (!existing) {
    return finalizeIdentity(incoming);
  }

  const incomingCanReplace =
    !(existing.realData && incoming.dataSource === "mock") &&
    !(existing.realData && !incoming.realData);
  const mergedSources = mergeSources(existing.sources, incoming.sources);
  const best = pickBestSource(mergedSources);
  const merged: TokenIdentity = {
    mint: existing.mint || incoming.mint,
    name: chooseIdentityField(existing.name, incoming.name, existing.dataSource, incoming.dataSource, incomingCanReplace),
    symbol: chooseIdentityField(existing.symbol, incoming.symbol, existing.dataSource, incoming.dataSource, incomingCanReplace),
    title: existing.title,
    displayName: existing.displayName,
    normalizedName: null,
    normalizedSymbol: null,
    metadataUri: chooseIdentityField(
      existing.metadataUri,
      incoming.metadataUri,
      existing.dataSource,
      incoming.dataSource,
      incomingCanReplace
    ),
    imageUri: chooseIdentityField(existing.imageUri, incoming.imageUri, existing.dataSource, incoming.dataSource, incomingCanReplace),
    description: chooseIdentityField(
      existing.description,
      incoming.description,
      existing.dataSource,
      incoming.dataSource,
      incomingCanReplace
    ),
    website: chooseIdentityField(existing.website, incoming.website, existing.dataSource, incoming.dataSource, incomingCanReplace),
    twitter: chooseIdentityField(existing.twitter, incoming.twitter, existing.dataSource, incoming.dataSource, incomingCanReplace),
    telegram: chooseIdentityField(existing.telegram, incoming.telegram, existing.dataSource, incoming.dataSource, incomingCanReplace),
    discord: chooseIdentityField(existing.discord, incoming.discord, existing.dataSource, incoming.dataSource, incomingCanReplace),
    creator: chooseIdentityField(existing.creator, incoming.creator, existing.dataSource, incoming.dataSource, incomingCanReplace),
    sourcePriority: [],
    sources: mergedSources,
    confidence: best?.confidence ?? existing.confidence,
    completenessScore: 0,
    realData: existing.realData || incoming.realData,
    dataSource: best?.source ?? existing.dataSource,
    reasonCodes: uniqueReasonCodes([
      ...existing.reasonCodes,
      ...incoming.reasonCodes,
      "IDENTITY_MERGED"
    ]),
    firstSeenAt: minIso(existing.firstSeenAt, incoming.firstSeenAt),
    updatedAt: maxIso(existing.updatedAt, incoming.updatedAt),
    raw: incoming.raw ?? existing.raw
  };

  return finalizeIdentity(merged);
}

export function normalizePumpPortalIdentity(payloadOrEvent: unknown): TokenIdentity {
  const payload = getPayloadRecord(payloadOrEvent);
  const mint =
    readString(payloadOrEvent, ["mint"]) ??
    readString(payloadOrEvent, ["candidate", "mint"]) ??
    readFirstString(payload, ["mint", "tokenMint", "ca", "address", "contractAddress"]) ??
    "UNKNOWN_MINT";
  const fetchedAt =
    readString(payloadOrEvent, ["timestamp"]) ??
    readString(payloadOrEvent, ["receivedAt"]) ??
    readFirstString(payload, ["timestamp", "createdAt"]) ??
    new Date().toISOString();
  const metadataUri = sanitizeMetadataUri(
    readString(payloadOrEvent, ["metadataUri"]) ??
      readFirstString(payload, ["metadataUri", "metadata_uri", "uri", "metadata"])
  );
  const imageUri = sanitizeImageUri(
    readString(payloadOrEvent, ["imageUri"]) ??
      readFirstString(payload, ["imageUri", "image_uri", "image", "logo"])
  );
  const source = createSource({
    source: "pumpportal",
    realData: true,
    name:
      readString(payloadOrEvent, ["name"]) ??
      readString(payloadOrEvent, ["candidate", "name"]) ??
      readFirstString(payload, ["name", "tokenName"]),
    symbol:
      readString(payloadOrEvent, ["symbol"]) ??
      readString(payloadOrEvent, ["candidate", "symbol"]) ??
      readFirstString(payload, ["symbol", "ticker"]),
    metadataUri,
    imageUri,
    description: readFirstString(payload, ["description", "desc"]),
    website: readFirstString(payload, ["website", "external_url", "url"]),
    twitter: readFirstString(payload, ["twitter", "x"]),
    telegram: readFirstString(payload, ["telegram"]),
    creator:
      readString(payloadOrEvent, ["creator"]) ??
      readFirstString(payload, ["creator", "traderPublicKey", "user", "owner"]),
    fetchedAt,
    raw: payload
  });

  return identityFromSource(mint, source, payload);
}

export function normalizeSolanaMetadataIdentity(
  metadata: SolanaMetadataIdentityInput
): TokenIdentity {
  const metadataUri = sanitizeMetadataUri(metadata.metadataUri ?? metadata.uri);
  const source = createSource({
    source: "solana_metadata",
    realData: true,
    name: metadata.name,
    symbol: metadata.symbol,
    metadataUri,
    creator: metadata.creator ?? metadata.updateAuthority,
    fetchedAt: metadata.fetchedAt ?? new Date().toISOString(),
    raw: metadata.raw ?? metadata
  });

  return identityFromSource(metadata.mint, source, metadata.raw ?? metadata);
}

export function normalizeOffchainMetadataIdentity(
  json: unknown,
  uri: string,
  mint?: string
): TokenIdentity {
  const payload = asRecord(json) ?? {};
  const metadataUri = sanitizeMetadataUri(uri);
  const imageUri = sanitizeImageUri(readFirstString(payload, ["image", "image_url", "logoURI", "logo"]));
  const properties = asRecord(payload["properties"]);
  const files = Array.isArray(properties?.["files"]) ? properties?.["files"] : [];
  const fallbackImage =
    imageUri ??
    sanitizeImageUri(readString(files[0], ["uri", "url"])) ??
    null;
  const source = createSource({
    source: "offchain_metadata",
    realData: true,
    name: readString(payload, ["name"]),
    symbol: readFirstString(payload, ["symbol", "ticker"]),
    metadataUri,
    imageUri: fallbackImage,
    description: sanitizeText(readString(payload, ["description"]), maxDescriptionLength),
    website:
      readFirstString(payload, ["external_url", "website", "url"]) ??
      readString(properties, ["website"]),
    twitter:
      readFirstString(payload, ["twitter", "x"]) ??
      readFirstString(properties, ["twitter", "x"]),
    telegram:
      readString(payload, ["telegram"]) ?? readString(properties, ["telegram"]),
    discord:
      readString(payload, ["discord"]) ?? readString(properties, ["discord"]),
    creator:
      readString(payload, ["creator"]) ?? readString(properties, ["creator"]),
    fetchedAt: new Date().toISOString(),
    raw: json
  });

  return identityFromSource(
    mint ?? readFirstString(payload, ["mint", "tokenMint", "address"]) ?? "UNKNOWN_MINT",
    source,
    json
  );
}

export function normalizeDexScreenerIdentity(payload: unknown): TokenIdentity {
  const record = asRecord(payload) ?? {};
  const baseToken = asRecord(record["baseToken"]) ?? record;
  const info = asRecord(record["info"]);
  const source = createSource({
    source: "dexscreener",
    realData: true,
    name: readString(baseToken, ["name"]),
    symbol: readString(baseToken, ["symbol"]),
    imageUri: sanitizeImageUri(readFirstString(info, ["imageUrl", "image"])),
    website: readStringFromLinks(info, "website"),
    twitter: readStringFromLinks(info, "twitter"),
    telegram: readStringFromLinks(info, "telegram"),
    fetchedAt: new Date().toISOString(),
    raw: payload
  });

  return identityFromSource(
    readFirstString(baseToken, ["address", "mint"]) ??
      readFirstString(record, ["mint", "tokenAddress"]) ??
      "UNKNOWN_MINT",
    source,
    payload
  );
}

export function scoreIdentityCompleteness(identity: TokenIdentity): number {
  const weightedFields: Array<[unknown, number]> = [
    [identity.name, 20],
    [identity.symbol, 20],
    [identity.metadataUri, 15],
    [identity.imageUri, 15],
    [identity.description, 10],
    [identity.website, 5],
    [identity.twitter, 5],
    [identity.telegram, 5],
    [identity.creator, 5]
  ];

  return weightedFields.reduce(
    (total, [value, weight]) => total + (value ? weight : 0),
    0
  );
}

export function isTokenIdentityResolved(identity: TokenIdentity): boolean {
  return Boolean(identity.name || identity.symbol);
}

export function sanitizeMetadataUri(uri: unknown): string | null {
  return sanitizeUri(uri);
}

export function sanitizeImageUri(uri: unknown): string | null {
  return sanitizeUri(uri);
}

export function shortMint(mint: string): string {
  if (mint.length <= 14) {
    return mint;
  }

  return `${mint.slice(0, 6)}...${mint.slice(-4)}`;
}

function identityFromSource(
  mint: string,
  source: TokenIdentitySource,
  raw?: unknown
): TokenIdentity {
  const firstSeenAt = source.fetchedAt;
  const identity: TokenIdentity = {
    mint,
    name: source.name ?? null,
    symbol: source.symbol ?? null,
    title: shortMint(mint),
    displayName: shortMint(mint),
    normalizedName: source.name ?? null,
    normalizedSymbol: source.symbol ?? null,
    metadataUri: source.metadataUri ?? null,
    imageUri: source.imageUri ?? null,
    description: source.description ?? null,
    website: source.website ?? null,
    twitter: source.twitter ?? null,
    telegram: source.telegram ?? null,
    discord: source.discord ?? null,
    creator: source.creator ?? null,
    sourcePriority: [source.source],
    sources: [source],
    confidence: source.confidence,
    completenessScore: 0,
    realData: source.realData,
    dataSource: source.source,
    reasonCodes: uniqueReasonCodes(source.reasonCodes),
    firstSeenAt,
    updatedAt: source.fetchedAt,
    raw
  };

  return finalizeIdentity(identity);
}

function finalizeIdentity(identity: TokenIdentity): TokenIdentity {
  const normalizedName = normalizeTokenName(identity.name);
  const normalizedSymbol = normalizeTokenSymbol(identity.symbol);
  const next: TokenIdentity = {
    ...identity,
    name: normalizedName,
    symbol: normalizedSymbol,
    normalizedName,
    normalizedSymbol,
    title: "",
    displayName: "",
    metadataUri: sanitizeMetadataUri(identity.metadataUri),
    imageUri: sanitizeImageUri(identity.imageUri),
    website: sanitizeMetadataUri(identity.website),
    twitter: sanitizeMetadataUri(identity.twitter),
    telegram: sanitizeMetadataUri(identity.telegram),
    discord: sanitizeMetadataUri(identity.discord),
    sourcePriority: sortSourcePriority(identity.sources),
    reasonCodes: uniqueReasonCodes(identity.reasonCodes)
  };
  const completenessScore = scoreIdentityCompleteness(next);
  const resolved = isTokenIdentityResolved(next);

  next.title = createTokenTitle(next);
  next.displayName = createDisplayName(next);
  next.completenessScore = completenessScore;
  next.confidence = pickConfidence(next, completenessScore);
  next.reasonCodes = uniqueReasonCodes([
    ...next.reasonCodes,
    ...(next.name ? ["IDENTITY_NAME_FOUND"] : []),
    ...(next.symbol ? ["IDENTITY_SYMBOL_FOUND"] : []),
    ...(next.metadataUri ? ["IDENTITY_METADATA_URI_FOUND"] : []),
    ...(next.imageUri ? ["IDENTITY_IMAGE_FOUND"] : []),
    ...(next.description ? ["IDENTITY_DESCRIPTION_FOUND"] : []),
    ...(next.website || next.twitter || next.telegram || next.discord
      ? ["IDENTITY_SOCIAL_FOUND"]
      : []),
    resolved ? (completenessScore >= 70 ? "IDENTITY_COMPLETE" : "IDENTITY_PARTIAL") : "IDENTITY_UNRESOLVED"
  ]);

  return next;
}

function createSource(input: {
  source: TokenIdentityDataSource;
  realData: boolean;
  name?: unknown;
  symbol?: unknown;
  metadataUri?: string | null;
  imageUri?: string | null;
  description?: unknown;
  website?: unknown;
  twitter?: unknown;
  telegram?: unknown;
  discord?: unknown;
  creator?: unknown;
  fetchedAt: string;
  raw?: unknown;
}): TokenIdentitySource {
  const name = normalizeTokenName(input.name);
  const symbol = normalizeTokenSymbol(input.symbol);
  const description = sanitizeText(input.description, maxDescriptionLength);
  const source: TokenIdentitySource = {
    source: input.source,
    realData: input.realData,
    name,
    symbol,
    metadataUri: input.metadataUri ?? null,
    imageUri: input.imageUri ?? null,
    description,
    website: sanitizeMetadataUri(input.website),
    twitter: sanitizeMetadataUri(input.twitter),
    telegram: sanitizeMetadataUri(input.telegram),
    discord: sanitizeMetadataUri(input.discord),
    creator: sanitizeText(input.creator, 96),
    confidence: "none",
    reasonCodes: [`IDENTITY_FROM_${input.source.toUpperCase()}`],
    fetchedAt: input.fetchedAt,
    raw: input.raw
  };
  const temp = identityFromSourceShallow("UNKNOWN_MINT", source);
  source.confidence = pickConfidence(temp, scoreIdentityCompleteness(temp));

  return source;
}

function identityFromSourceShallow(
  mint: string,
  source: TokenIdentitySource
): TokenIdentity {
  return {
    mint,
    name: source.name ?? null,
    symbol: source.symbol ?? null,
    title: shortMint(mint),
    displayName: shortMint(mint),
    normalizedName: source.name ?? null,
    normalizedSymbol: source.symbol ?? null,
    metadataUri: source.metadataUri ?? null,
    imageUri: source.imageUri ?? null,
    description: source.description ?? null,
    website: source.website ?? null,
    twitter: source.twitter ?? null,
    telegram: source.telegram ?? null,
    discord: source.discord ?? null,
    creator: source.creator ?? null,
    sourcePriority: [source.source],
    sources: [source],
    confidence: source.confidence,
    completenessScore: 0,
    realData: source.realData,
    dataSource: source.source,
    reasonCodes: source.reasonCodes,
    firstSeenAt: source.fetchedAt,
    updatedAt: source.fetchedAt
  };
}

function chooseIdentityField<T extends string | null>(
  existing: T,
  incoming: T,
  existingSource: TokenIdentityDataSource,
  incomingSource: TokenIdentityDataSource,
  incomingCanReplace: boolean
): T {
  if (!incoming) {
    return existing;
  }

  if (!existing) {
    return incoming;
  }

  if (!incomingCanReplace) {
    return existing;
  }

  return sourceRank[incomingSource] <= sourceRank[existingSource]
    ? incoming
    : existing;
}

function pickBestSource(sources: TokenIdentitySource[]): TokenIdentitySource | undefined {
  return [...sources]
    .filter((source) => source.source !== "jupiter_price")
    .sort((left, right) => {
      const rank = sourceRank[left.source] - sourceRank[right.source];
      if (rank !== 0) {
        return rank;
      }

      return confidenceRank(right.confidence) - confidenceRank(left.confidence);
    })[0];
}

function mergeSources(
  existing: TokenIdentitySource[],
  incoming: TokenIdentitySource[]
): TokenIdentitySource[] {
  const byKey = new Map<string, TokenIdentitySource>();

  for (const source of [...existing, ...incoming]) {
    const key = `${source.source}:${source.fetchedAt}`;
    byKey.set(key, source);
  }

  return Array.from(byKey.values()).sort(
    (left, right) => sourceRank[left.source] - sourceRank[right.source]
  );
}

function sortSourcePriority(sources: TokenIdentitySource[]): string[] {
  return Array.from(new Set(sources.map((source) => source.source))).sort(
    (left, right) =>
      sourceRank[left as TokenIdentityDataSource] -
      sourceRank[right as TokenIdentityDataSource]
  );
}

function pickConfidence(
  identity: TokenIdentity,
  completenessScore: number
): TokenIdentityConfidence {
  if (!identity.name && !identity.symbol) {
    return completenessScore > 0 ? "low" : "none";
  }

  if (identity.name && identity.symbol && completenessScore >= 50) {
    return "high";
  }

  if (identity.name || identity.symbol) {
    return "medium";
  }

  return "low";
}

function confidenceRank(confidence: TokenIdentityConfidence): number {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    case "none":
      return 0;
  }
}

function sanitizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sanitized = value
    .replace(/\0/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  return sanitized.length > 0 ? sanitized : null;
}

function sanitizeUri(value: unknown): string | null {
  const raw = sanitizeText(value, 1024);

  if (!raw) {
    return null;
  }

  if (raw.startsWith("ipfs://") || raw.startsWith("ar://")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      parsed.username = "";
      parsed.password = "";
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function getPayloadRecord(value: unknown): Record<string, unknown> {
  const eventRecord = asRecord(value);

  return asRecord(eventRecord?.["raw"]) ?? eventRecord ?? {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown, path: string[]): string | null {
  let current: unknown = value;

  for (const key of path) {
    const record = asRecord(current);

    if (!record || !(key in record)) {
      return null;
    }

    current = record[key];
  }

  return typeof current === "string" ? current : null;
}

function readFirstString(value: unknown, keys: string[]): string | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  for (const key of keys) {
    const current = record[key];

    if (typeof current === "string") {
      return current;
    }
  }

  return null;
}

function readStringFromLinks(value: unknown, type: string): string | null {
  const record = asRecord(value);
  const links = record?.["websites"] ?? record?.["socials"];

  if (!Array.isArray(links)) {
    return null;
  }

  for (const link of links) {
    if (readString(link, ["type"])?.toLowerCase() === type) {
      return readString(link, ["url"]);
    }
  }

  return null;
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes.filter(Boolean)));
}

function minIso(left: string, right: string): string {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function maxIso(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}
