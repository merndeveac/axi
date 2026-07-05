import { existsSync, readFileSync } from "node:fs";
import type { NormalizedIndexerEvent } from "@axi/indexer-core";

const fixtureRootUrl = new URL("../fixtures/", import.meta.url);
const manifestUrl = new URL("manifest.json", fixtureRootUrl);
const secretLikeKeys = new Set([
  "apikey",
  "authorization",
  "bearer",
  "mnemonic",
  "privatekey",
  "secret",
  "seed"
]);
const omittedSanitizedKeys = new Set([
  "loadedAddresses",
  "returnData",
  "rewards"
]);

export type FixtureManifestKind =
  | "token_created"
  | "buy_trade"
  | "sell_trade"
  | "migration"
  | "failed_transaction"
  | "unknown";

export type FixtureManifestType =
  | "synthetic"
  | "public_rpc"
  | "imported_public_rpc";

export type FixtureManifestSource =
  | "synthetic"
  | "solana_getTransaction"
  | "manual_public_fixture";

export type FixtureManifestCluster =
  | "mainnet-beta"
  | "devnet"
  | "local"
  | "unknown";

export type FixtureManifestEntry = {
  id: string;
  filename: string;
  expectedFilename?: string;
  noExpectedOutput?: boolean;
  kind: FixtureManifestKind;
  fixtureType: FixtureManifestType;
  source: FixtureManifestSource;
  cluster: FixtureManifestCluster;
  signature?: string | null;
  slot?: number | null;
  blockTime?: number | string | null;
  expectedMint?: string | null;
  expectedSide?: "buy" | "sell" | "unknown" | null;
  expectedEventType: NormalizedIndexerEvent["type"];
  expectedUsableForMetrics: boolean;
  notes: string;
  sanitized: boolean;
  addedAt: string;
};

export type FixtureManifest = {
  schemaVersion: 1;
  fixtures: FixtureManifestEntry[];
};

export type FixtureValidationResult = {
  ok: boolean;
  errors: string[];
};

export type TransactionFixtureSummary = {
  signature: string | null;
  slot: number | null;
  blockTime: number | string | null;
  logCount: number;
  preBalanceCount: number;
  postBalanceCount: number;
  preTokenBalanceCount: number;
  postTokenBalanceCount: number;
  hasError: boolean;
  err: unknown;
};

export type ExpectedOutputComparison = {
  checked: boolean;
  ok: boolean;
  expectedPath?: string;
  missingFields: string[];
  mismatchedFields: Array<{
    field: string;
    expected: unknown;
    actual: unknown;
  }>;
  reasonCodes: string[];
};

type JsonRecord = Record<string, unknown>;

export function loadFixtureManifest(): FixtureManifest {
  const parsed = JSON.parse(readFileSync(manifestUrl, "utf8")) as unknown;
  const record = asRecord(parsed);
  const fixtures = Array.isArray(record?.fixtures) ? record.fixtures : [];

  return {
    schemaVersion: 1,
    fixtures: fixtures.map(parseManifestEntry)
  };
}

export function listPumpfunFixtures(): FixtureManifestEntry[] {
  return loadFixtureManifest().fixtures;
}

export function getFixtureEntry(idOrFilename: string): FixtureManifestEntry {
  const normalized = idOrFilename.trim();
  const entry = listPumpfunFixtures().find(
    (candidate) =>
      candidate.id === normalized ||
      candidate.filename === normalized ||
      candidate.filename.endsWith(`/${normalized}`)
  );

  if (!entry) {
    throw new Error(`PUMPFUN_FIXTURE_NOT_FOUND: ${normalized}`);
  }

  return entry;
}

export function validateFixtureAgainstManifest(
  entry: FixtureManifestEntry,
  json: unknown
): FixtureValidationResult {
  const errors = [...validateTransactionFixtureShape(json).errors];
  const summary = summarizeTransactionFixture(json);

  if (entry.signature && summary.signature !== entry.signature) {
    errors.push("fixture signature does not match manifest");
  }

  if (entry.slot !== undefined && entry.slot !== null && summary.slot !== entry.slot) {
    errors.push("fixture slot does not match manifest");
  }

  if (entry.expectedEventType.trim().length === 0) {
    errors.push("manifest expectedEventType is required");
  }

  if (entry.fixtureType === "synthetic" && entry.source !== "synthetic") {
    errors.push("synthetic fixtures must use synthetic source");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function preventFixturePathTraversal(name: string): string {
  const normalized = name.trim();

  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.split("/").includes("..") ||
    !normalized.endsWith(".json")
  ) {
    throw new Error("PUMPFUN_FIXTURE_PATH_INVALID");
  }

  return normalized;
}

export function loadPumpfunFixture(name: string): unknown {
  const entry = tryGetFixtureEntry(name);
  const filename = entry?.filename ?? name;
  return readFixtureJson(filename);
}

export function loadPumpfunFixtureByManifestId(id: string): unknown {
  return readFixtureJson(getFixtureEntry(id).filename);
}

export function loadExpectedOutputForFixture(
  entry: FixtureManifestEntry
): unknown | null {
  if (entry.noExpectedOutput || !entry.expectedFilename) {
    return null;
  }

  return readFixtureJson(entry.expectedFilename);
}

export function compareExpectedNormalizedOutput(
  entry: FixtureManifestEntry,
  actual: NormalizedIndexerEvent
): ExpectedOutputComparison {
  const expected = loadExpectedOutputForFixture(entry);

  if (!expected) {
    return {
      checked: false,
      ok: true,
      missingFields: [],
      mismatchedFields: [],
      reasonCodes: ["PUMPFUN_EXPECTED_OUTPUT_NOT_CONFIGURED"]
    };
  }

  const expectedRecord = asRecord(expected);

  if (!expectedRecord) {
    return {
      checked: true,
      ok: false,
      ...(entry.expectedFilename ? { expectedPath: entry.expectedFilename } : {}),
      missingFields: [],
      mismatchedFields: [
        {
          field: "$",
          expected: "object",
          actual: typeof expected
        }
      ],
      reasonCodes: ["PUMPFUN_EXPECTED_OUTPUT_INVALID"]
    };
  }

  const missingFields: string[] = [];
  const mismatchedFields: ExpectedOutputComparison["mismatchedFields"] = [];
  const actualRecord = actual as unknown as JsonRecord;

  for (const [field, expectedValue] of Object.entries(expectedRecord)) {
    if (!(field in actualRecord)) {
      missingFields.push(field);
      continue;
    }

    const actualValue = actualRecord[field];

    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      mismatchedFields.push({
        field,
        expected: expectedValue,
        actual: actualValue
      });
    }
  }

  return {
    checked: true,
    ok: missingFields.length === 0 && mismatchedFields.length === 0,
    ...(entry.expectedFilename ? { expectedPath: entry.expectedFilename } : {}),
    missingFields,
    mismatchedFields,
    reasonCodes:
      missingFields.length === 0 && mismatchedFields.length === 0
        ? ["PUMPFUN_EXPECTED_OUTPUT_MATCHED"]
        : ["PUMPFUN_EXPECTED_OUTPUT_MISMATCH"]
  };
}

export function validateTransactionFixtureShape(
  json: unknown
): FixtureValidationResult {
  const errors: string[] = [];

  if (!asRecord(json)) {
    errors.push("fixture must be a JSON object");
  }

  if (!extractSignature(json)) {
    errors.push("fixture must include signature or transaction.signatures[0]");
  }

  const meta = findMetaRecord(json);

  if (meta) {
    for (const key of [
      "logMessages",
      "preBalances",
      "postBalances",
      "preTokenBalances",
      "postTokenBalances"
    ]) {
      if (meta[key] !== undefined && !Array.isArray(meta[key])) {
        errors.push(`meta.${key} must be an array when present`);
      }
    }
  }

  try {
    scanForSecretLikeKeys(json);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "secret-like key found");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function sanitizeTransactionFixture(json: unknown): unknown {
  scanForSecretLikeKeys(json);
  return sanitizeJsonValue(json);
}

export function summarizeTransactionFixture(
  json: unknown
): TransactionFixtureSummary {
  const meta = findMetaRecord(json);

  return {
    signature: extractSignature(json) ?? null,
    slot: extractSlot(json) ?? null,
    blockTime: extractBlockTime(json) ?? null,
    logCount: arrayLength(meta?.logMessages),
    preBalanceCount: arrayLength(meta?.preBalances),
    postBalanceCount: arrayLength(meta?.postBalances),
    preTokenBalanceCount: arrayLength(meta?.preTokenBalances),
    postTokenBalanceCount: arrayLength(meta?.postTokenBalances),
    hasError: meta?.err !== undefined && meta.err !== null,
    err: meta?.err ?? null
  };
}

function readFixtureJson(filename: string): unknown {
  const safeName = preventFixturePathTraversal(filename);
  const fileUrl = new URL(safeName, fixtureRootUrl);

  if (!existsSync(fileUrl)) {
    throw new Error(`PUMPFUN_FIXTURE_FILE_NOT_FOUND: ${safeName}`);
  }

  return JSON.parse(readFileSync(fileUrl, "utf8")) as unknown;
}

function tryGetFixtureEntry(value: string): FixtureManifestEntry | null {
  try {
    return getFixtureEntry(value);
  } catch {
    return null;
  }
}

function parseManifestEntry(value: unknown): FixtureManifestEntry {
  const record = asRecord(value);

  if (!record) {
    throw new Error("PUMPFUN_MANIFEST_ENTRY_INVALID");
  }

  return {
    id: readRequiredString(record, "id"),
    filename: preventFixturePathTraversal(readRequiredString(record, "filename")),
    ...(typeof record.expectedFilename === "string"
      ? { expectedFilename: preventFixturePathTraversal(record.expectedFilename) }
      : {}),
    ...(typeof record.noExpectedOutput === "boolean"
      ? { noExpectedOutput: record.noExpectedOutput }
      : {}),
    kind: readFixtureKind(record.kind),
    fixtureType: readFixtureType(record.fixtureType),
    source: readFixtureSource(record.source),
    cluster: readFixtureCluster(record.cluster),
    signature: readNullableString(record.signature),
    slot: readNullableNumber(record.slot),
    blockTime: readNullableNumberOrString(record.blockTime),
    expectedMint: readNullableString(record.expectedMint),
    expectedSide: readExpectedSide(record.expectedSide),
    expectedEventType: readRequiredString(record, "expectedEventType") as
      NormalizedIndexerEvent["type"],
    expectedUsableForMetrics: record.expectedUsableForMetrics === true,
    notes: readRequiredString(record, "notes"),
    sanitized: record.sanitized === true,
    addedAt: readRequiredString(record, "addedAt")
  };
}

function readFixtureKind(value: unknown): FixtureManifestKind {
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

  throw new Error("PUMPFUN_MANIFEST_KIND_INVALID");
}

function readFixtureType(value: unknown): FixtureManifestType {
  if (
    value === "synthetic" ||
    value === "public_rpc" ||
    value === "imported_public_rpc"
  ) {
    return value;
  }

  throw new Error("PUMPFUN_MANIFEST_FIXTURE_TYPE_INVALID");
}

function readFixtureSource(value: unknown): FixtureManifestSource {
  if (
    value === "synthetic" ||
    value === "solana_getTransaction" ||
    value === "manual_public_fixture"
  ) {
    return value;
  }

  throw new Error("PUMPFUN_MANIFEST_SOURCE_INVALID");
}

function readFixtureCluster(value: unknown): FixtureManifestCluster {
  if (
    value === "mainnet-beta" ||
    value === "devnet" ||
    value === "local" ||
    value === "unknown"
  ) {
    return value;
  }

  throw new Error("PUMPFUN_MANIFEST_CLUSTER_INVALID");
}

function readExpectedSide(
  value: unknown
): "buy" | "sell" | "unknown" | null {
  if (value === "buy" || value === "sell" || value === "unknown") {
    return value;
  }

  return null;
}

function readRequiredString(record: JsonRecord, key: string): string {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`PUMPFUN_MANIFEST_${key.toUpperCase()}_MISSING`);
  }

  return value.trim();
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNullableNumberOrString(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function sanitizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry));
  }

  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const sanitized: JsonRecord = {};

  for (const [key, entry] of Object.entries(record)) {
    if (omittedSanitizedKeys.has(key)) {
      continue;
    }

    sanitized[key] = sanitizeJsonValue(entry);
  }

  JSON.stringify(sanitized);
  return sanitized;
}

function scanForSecretLikeKeys(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForSecretLikeKeys(entry, `${path}[${index}]`));
    return;
  }

  const record = asRecord(value);

  if (!record) {
    return;
  }

  for (const [key, entry] of Object.entries(record)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (secretLikeKeys.has(normalized)) {
      throw new Error(`PUMPFUN_FIXTURE_SECRET_KEY_REJECTED: ${path}.${key}`);
    }

    scanForSecretLikeKeys(entry, `${path}.${key}`);
  }
}

function findMetaRecord(input: unknown): JsonRecord | undefined {
  return [
    readRecordPath(input, ["meta"]),
    readRecordPath(input, ["transaction", "meta"]),
    readRecordPath(input, ["transaction", "transaction", "meta"])
  ].find(
    (candidate): candidate is JsonRecord =>
      candidate !== undefined &&
      (Array.isArray(candidate.preBalances) ||
        Array.isArray(candidate.postBalances) ||
        Array.isArray(candidate.preTokenBalances) ||
        Array.isArray(candidate.postTokenBalances) ||
        Array.isArray(candidate.logMessages) ||
        "err" in candidate)
  );
}

function extractSignature(input: unknown): string | undefined {
  return [
    readStringPath(input, ["signature"]),
    readStringPath(input, ["transaction", "signature"]),
    readStringPath(input, ["transaction", "signatures", 0]),
    readStringPath(input, ["transaction", "transaction", "signature"]),
    readStringPath(input, ["transaction", "transaction", "signatures", 0])
  ].find((value): value is string => value !== undefined);
}

function extractSlot(input: unknown): number | undefined {
  return [
    readNumberPath(input, ["slot"]),
    readNumberPath(input, ["transaction", "slot"]),
    readNumberPath(input, ["transaction", "transaction", "slot"])
  ].find(
    (value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value >= 0
  );
}

function extractBlockTime(input: unknown): number | string | undefined {
  return (
    readNumberPath(input, ["blockTime"]) ??
    readStringPath(input, ["blockTime"]) ??
    readNumberPath(input, ["transaction", "blockTime"]) ??
    readStringPath(input, ["transaction", "blockTime"]) ??
    readNumberPath(input, ["transaction", "transaction", "blockTime"]) ??
    readStringPath(input, ["transaction", "transaction", "blockTime"])
  );
}

function readStringPath(
  input: unknown,
  path: Array<string | number>
): string | undefined {
  const value = readPath(input, path);
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumberPath(
  input: unknown,
  path: Array<string | number>
): number | undefined {
  const value = readPath(input, path);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readRecordPath(
  input: unknown,
  path: Array<string | number>
): JsonRecord | undefined {
  return asRecord(readPath(input, path)) ?? undefined;
}

function readPath(input: unknown, path: Array<string | number>): unknown {
  let current = input;

  for (const part of path) {
    if (typeof part === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }

      current = current[part];
      continue;
    }

    const record = asRecord(current);

    if (!record) {
      return undefined;
    }

    current = record[part];
  }

  return current;
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
