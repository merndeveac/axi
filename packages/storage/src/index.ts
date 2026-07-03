import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { cwd } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { FeedEvent } from "@axi/data-feeds";
import type {
  ChainTransactionEvent,
  NormalizedChainTradeEvent
} from "@axi/chain-events";
import {
  CandidateDecisionSchema,
  ChainVerificationStatusSchema,
  type ChainVerificationStatus,
  OverlaySignalSchema,
  RiskSnapshotSchema,
  type CandidateDecision,
  type OverlaySignal,
  type RiskLevel,
  type RiskSnapshot,
  type SignalAction
} from "@axi/shared";

export const defaultDatabaseRelativePath = ".data/axi.sqlite";

export type StorageOptions = {
  databasePath?: string;
};

export type StorageHandle = {
  databasePath: string;
};

export type StoredFeedEvent = {
  id: number;
  eventType: string;
  mint: string;
  payload: FeedEvent;
  createdAt: string;
};

export type StoredSignal = {
  id: number;
  mint: string;
  symbol: string;
  action: SignalAction;
  score: number;
  hardReject: boolean;
  reasonCodes: string[];
  payload: OverlaySignal;
  createdAt: string;
};

export type ReplaySource =
  | "candidate_decisions"
  | "chain_transaction_events"
  | "chain_trade_events"
  | "feed_events"
  | "chain_verifications"
  | "risk_snapshots"
  | "signals";

export type ReplayItem = {
  createdAt: string;
  payload: unknown;
  sequence: number;
  source: ReplaySource;
};

export type PaperOrderSide = "buy" | "sell";
export type PaperOrderStatus = "accepted" | "rejected";

export type PaperOrderInput = {
  mint: string;
  symbol: string;
  side: PaperOrderSide;
  status: PaperOrderStatus;
  sizeSol: number;
  simulatedPrice: number;
  reasonCodes: string[];
  signalId?: number | null;
  payload: unknown;
  createdAt?: string;
};

export type StoredPaperOrder = Omit<PaperOrderInput, "createdAt" | "signalId"> & {
  id: number;
  signalId: number | null;
  createdAt: string;
};

export type PaperPositionInput = {
  mint: string;
  symbol: string;
  sizeSol: number;
  tokenAmount: number;
  entryPrice: number;
  status: "open" | "closed";
  payload: unknown;
  openedAt?: string;
  updatedAt?: string;
};

export type StoredPaperPosition = PaperPositionInput & {
  id: number;
  openedAt: string;
  updatedAt: string;
};

export type StorageStats = {
  databasePath: string;
  feedEventCount: number;
  signalCount: number;
  chainVerificationCount: number;
  chainTransactionEventCount: number;
  chainTradeEventCount: number;
  riskSnapshotCount: number;
  candidateDecisionCount: number;
  paperOrderCount: number;
  paperPositionCount: number;
  lastSignalAt: string | null;
};

export type StoredRiskSnapshot = {
  id: number;
  mint: string;
  riskLevel: RiskLevel;
  hardReject: boolean;
  riskScore: number;
  reasonCodes: string[];
  payload: RiskSnapshot;
  createdAt: string;
};

export type StoredCandidateDecision = {
  id: number;
  mint: string;
  symbol: string;
  lifecycleState: CandidateDecision["lifecycleState"];
  action: CandidateDecision["action"];
  score: number;
  riskLevel: RiskLevel;
  hardReject: boolean;
  combinedReasonCodes: string[];
  payload: CandidateDecision;
  createdAt: string;
};

export type ChainVerificationInput = {
  mint: string;
  status: ChainVerificationStatus;
  reasonCodes: string[];
  mintAuthorityActive?: boolean | null;
  freezeAuthorityActive?: boolean | null;
  supplyUi?: number | null;
  topHolderPct?: number | null;
  top10HolderPct?: number | null;
  payload: unknown;
  inspectedAt?: string;
  createdAt?: string;
};

export type StoredChainVerification = Omit<
  ChainVerificationInput,
  "createdAt" | "inspectedAt"
> & {
  id: number;
  inspectedAt: string;
  createdAt: string;
};

export type ChainTransactionEventInput = ChainTransactionEvent;

export type StoredChainTransactionEvent = ChainTransactionEventInput & {
  id: number;
  createdAt: string;
};

export type ChainTradeEventInput = NormalizedChainTradeEvent;

export type StoredChainTradeEvent = ChainTradeEventInput & {
  id: number;
  createdAt: string;
};

type SignalRow = {
  id: number;
  mint: string;
  symbol: string;
  action: SignalAction;
  score: number;
  hard_reject: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type FeedEventRow = {
  id: number;
  event_type: string;
  mint: string;
  payload_json: string;
  created_at: string;
};

type PaperOrderRow = {
  id: number;
  mint: string;
  symbol: string;
  side: PaperOrderSide;
  status: PaperOrderStatus;
  size_sol: number;
  simulated_price: number;
  reason_codes_json: string;
  signal_id: number | null;
  payload_json: string;
  created_at: string;
};

type PaperPositionRow = {
  id: number;
  mint: string;
  symbol: string;
  size_sol: number;
  token_amount: number;
  entry_price: number;
  status: "open" | "closed";
  payload_json: string;
  opened_at: string;
  updated_at: string;
};

type RiskSnapshotRow = {
  id: number;
  mint: string;
  risk_level: RiskLevel;
  hard_reject: number;
  risk_score: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type CandidateDecisionRow = {
  id: number;
  mint: string;
  symbol: string;
  lifecycle_state: CandidateDecision["lifecycleState"];
  action: CandidateDecision["action"];
  score: number;
  risk_level: RiskLevel;
  hard_reject: number;
  combined_reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type ChainVerificationRow = {
  id: number;
  mint: string;
  status: ChainVerificationStatus;
  reason_codes_json: string;
  mint_authority_active: number | null;
  freeze_authority_active: number | null;
  supply_ui: number | null;
  top_holder_pct: number | null;
  top10_holder_pct: number | null;
  payload_json: string;
  inspected_at: string;
  created_at: string;
};

type ChainTransactionEventRow = {
  id: number;
  signature: string;
  watched_address: string;
  watched_address_kind: ChainTransactionEvent["watchedAddressKind"];
  mint: string | null;
  status: ChainTransactionEvent["status"];
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type ChainTradeEventRow = {
  id: number;
  signature: string;
  mint: string;
  side: NormalizedChainTradeEvent["side"];
  confidence: NormalizedChainTradeEvent["confidence"];
  price_usd: number | null;
  volume_usd: number | null;
  token_amount: number | null;
  watched_address: string;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type CountRow = {
  count: number;
};

type LastSignalRow = {
  last_signal_at: string | null;
};

const feedEventSchema = z
  .object({
    type: z.string().min(1)
  })
  .passthrough();

const paperOrderInputSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  status: z.enum(["accepted", "rejected"]),
  sizeSol: z.number().nonnegative(),
  simulatedPrice: z.number().nonnegative(),
  reasonCodes: z.array(z.string().min(1)),
  signalId: z.number().int().positive().nullable().optional(),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const paperPositionInputSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1),
  sizeSol: z.number().nonnegative(),
  tokenAmount: z.number().nonnegative(),
  entryPrice: z.number().nonnegative(),
  status: z.enum(["open", "closed"]),
  payload: z.unknown(),
  openedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

const chainVerificationInputSchema = z.object({
  mint: z.string().min(32),
  status: ChainVerificationStatusSchema,
  reasonCodes: z.array(z.string().min(1)),
  mintAuthorityActive: z.boolean().nullable().optional(),
  freezeAuthorityActive: z.boolean().nullable().optional(),
  supplyUi: z.number().nonnegative().nullable().optional(),
  topHolderPct: z.number().min(0).max(100).nullable().optional(),
  top10HolderPct: z.number().min(0).max(100).nullable().optional(),
  payload: z.unknown(),
  inspectedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional()
});

const chainTransactionEventInputSchema = z.object({
  type: z.literal("chain_transaction"),
  source: z.literal("solana_rpc"),
  signature: z.string().min(1),
  slot: z.number().int().nonnegative().optional(),
  blockTime: z.number().int().nonnegative().nullable().optional(),
  watchedAddress: z.string().min(1),
  watchedAddressKind: z.enum([
    "mint",
    "pool",
    "bonding_curve",
    "program",
    "token_account",
    "wallet",
    "unknown"
  ]),
  mint: z.string().min(1).optional(),
  status: z.enum(["parsed", "unclassified", "errored"]),
  reasonCodes: z.array(z.string().min(1)),
  raw: z.unknown().optional(),
  receivedAt: z.string().datetime()
});

const chainTradeEventInputSchema = z.object({
  type: z.literal("trade"),
  source: z.literal("solana_rpc"),
  mint: z.string().min(1),
  symbol: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  side: z.enum(["buy", "sell", "unknown"]),
  priceUsd: z.number().nonnegative().nullable().optional(),
  volumeUsd: z.number().nonnegative().nullable().optional(),
  tokenAmount: z.number().nonnegative().nullable().optional(),
  trader: z.string().min(1).nullable().optional(),
  signature: z.string().min(1),
  slot: z.number().int().nonnegative().optional(),
  timestamp: z.string().datetime(),
  watchedAddress: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  reasonCodes: z.array(z.string().min(1)),
  raw: z.unknown().optional()
});

const limitSchema = z.number().int().positive().max(1000);

let activeStorage: {
  db: DatabaseSync;
  databasePath: string;
} | null = null;

export function initStorage(options: StorageOptions = {}): StorageHandle {
  if (activeStorage) {
    return {
      databasePath: activeStorage.databasePath
    };
  }

  const databasePath = resolveDatabasePath(options.databasePath);
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);
  activeStorage = {
    db,
    databasePath
  };

  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  runMigrations(db);

  return {
    databasePath
  };
}

export function closeStorage(): void {
  activeStorage?.db.close();
  activeStorage = null;
}

export function saveFeedEvent(event: FeedEvent): StoredFeedEvent {
  const parsed = feedEventSchema.parse(event) as FeedEvent;
  const mint = getFeedEventMint(parsed);
  const createdAt = getFeedEventTimestamp(parsed);
  const db = getDb();

  const result = db
    .prepare(
      `insert into feed_events (event_type, mint, payload_json, created_at)
       values (?, ?, ?, ?)`
    )
    .run(parsed.type, mint, stringifyJson(parsed), createdAt);

  return {
    id: toRowId(result.lastInsertRowid),
    eventType: parsed.type,
    mint,
    payload: parsed,
    createdAt
  };
}

export function saveSignal(signal: OverlaySignal): StoredSignal {
  const parsed = OverlaySignalSchema.parse(signal);
  const createdAt = new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into signals (
        mint,
        symbol,
        action,
        score,
        hard_reject,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.symbol,
      parsed.action,
      parsed.score,
      parsed.hardReject ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    symbol: parsed.symbol,
    action: parsed.action,
    score: parsed.score,
    hardReject: parsed.hardReject,
    reasonCodes: parsed.reasonCodes,
    payload: parsed,
    createdAt
  };
}

export function listRecentSignals(limit = 50): StoredSignal[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from signals
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as SignalRow[];

  return rows.map(mapSignalRow);
}

export function saveRiskSnapshot(snapshot: RiskSnapshot): StoredRiskSnapshot {
  const parsed = RiskSnapshotSchema.parse(snapshot);
  const createdAt = parsed.updatedAt;
  const db = getDb();

  const result = db
    .prepare(
      `insert into risk_snapshots (
        mint,
        risk_level,
        hard_reject,
        risk_score,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.riskLevel,
      parsed.hardReject ? 1 : 0,
      parsed.riskScore,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    riskLevel: parsed.riskLevel,
    hardReject: parsed.hardReject,
    riskScore: parsed.riskScore,
    reasonCodes: parsed.reasonCodes,
    payload: parsed,
    createdAt
  };
}

export function listRiskSnapshots(limit = 50): StoredRiskSnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from risk_snapshots
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as RiskSnapshotRow[];

  return rows.map(mapRiskSnapshotRow);
}

export function getLatestRiskSnapshot(
  mint: string
): StoredRiskSnapshot | null {
  const row = getDb()
    .prepare(
      `select *
       from risk_snapshots
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(mint) as RiskSnapshotRow | undefined;

  return row ? mapRiskSnapshotRow(row) : null;
}

export function saveCandidateDecision(
  decision: CandidateDecision
): StoredCandidateDecision {
  const parsed = CandidateDecisionSchema.parse(decision);
  const createdAt = parsed.updatedAt;
  const db = getDb();

  const result = db
    .prepare(
      `insert into candidate_decisions (
        mint,
        symbol,
        lifecycle_state,
        action,
        score,
        risk_level,
        hard_reject,
        combined_reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.symbol ?? "UNKNOWN",
      parsed.lifecycleState,
      parsed.action,
      parsed.score,
      parsed.riskLevel,
      parsed.hardReject ? 1 : 0,
      stringifyJson(parsed.combinedReasonCodes),
      stringifyJson(parsed),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    symbol: parsed.symbol ?? "UNKNOWN",
    lifecycleState: parsed.lifecycleState,
    action: parsed.action,
    score: parsed.score,
    riskLevel: parsed.riskLevel,
    hardReject: parsed.hardReject,
    combinedReasonCodes: parsed.combinedReasonCodes,
    payload: parsed,
    createdAt
  };
}

export function listCandidateDecisions(
  limit = 50
): StoredCandidateDecision[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from candidate_decisions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as CandidateDecisionRow[];

  return rows.map(mapCandidateDecisionRow);
}

export function getLatestCandidateDecision(
  mint: string
): StoredCandidateDecision | null {
  const row = getDb()
    .prepare(
      `select *
       from candidate_decisions
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(mint) as CandidateDecisionRow | undefined;

  return row ? mapCandidateDecisionRow(row) : null;
}

export function listFeedEvents(limit = 50): StoredFeedEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from feed_events
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as FeedEventRow[];

  return rows.map(mapFeedEventRow);
}

export function listSignalsForReplay(limit = 50): StoredSignal[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from signals
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as SignalRow[];

  return rows.map(mapSignalRow);
}

export function listRiskSnapshotsForReplay(
  limit = 50
): StoredRiskSnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from risk_snapshots
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as RiskSnapshotRow[];

  return rows.map(mapRiskSnapshotRow);
}

export function listCandidateDecisionsForReplay(
  limit = 50
): StoredCandidateDecision[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from candidate_decisions
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as CandidateDecisionRow[];

  return rows.map(mapCandidateDecisionRow);
}

export function saveChainVerification(
  verification: ChainVerificationInput
): StoredChainVerification {
  const parsed = chainVerificationInputSchema.parse(verification);
  const now = new Date().toISOString();
  const inspectedAt = parsed.inspectedAt ?? now;
  const createdAt = parsed.createdAt ?? inspectedAt;
  const db = getDb();

  const result = db
    .prepare(
      `insert into chain_verifications (
        mint,
        status,
        reason_codes_json,
        mint_authority_active,
        freeze_authority_active,
        supply_ui,
        top_holder_pct,
        top10_holder_pct,
        payload_json,
        inspected_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.status,
      stringifyJson(parsed.reasonCodes),
      boolToNullableInt(parsed.mintAuthorityActive),
      boolToNullableInt(parsed.freezeAuthorityActive),
      parsed.supplyUi ?? null,
      parsed.topHolderPct ?? null,
      parsed.top10HolderPct ?? null,
      stringifyJson(parsed.payload),
      inspectedAt,
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    status: parsed.status,
    reasonCodes: parsed.reasonCodes,
    mintAuthorityActive: parsed.mintAuthorityActive ?? null,
    freezeAuthorityActive: parsed.freezeAuthorityActive ?? null,
    supplyUi: parsed.supplyUi ?? null,
    topHolderPct: parsed.topHolderPct ?? null,
    top10HolderPct: parsed.top10HolderPct ?? null,
    payload: parsed.payload,
    inspectedAt,
    createdAt
  };
}

export function listChainVerifications(
  limit = 50
): StoredChainVerification[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_verifications
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ChainVerificationRow[];

  return rows.map(mapChainVerificationRow);
}

export function listChainVerificationsForReplay(
  limit = 50
): StoredChainVerification[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_verifications
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as ChainVerificationRow[];

  return rows.map(mapChainVerificationRow);
}

export function getLatestChainVerification(
  mint: string
): StoredChainVerification | null {
  const row = getDb()
    .prepare(
      `select *
       from chain_verifications
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(mint) as ChainVerificationRow | undefined;

  return row ? mapChainVerificationRow(row) : null;
}

export function saveChainTransactionEvent(
  event: ChainTransactionEventInput
): StoredChainTransactionEvent {
  const parsed = chainTransactionEventInputSchema.parse(
    event
  ) as ChainTransactionEvent;
  const db = getDb();

  const result = db
    .prepare(
      `insert into chain_transaction_events (
        signature,
        watched_address,
        watched_address_kind,
        mint,
        status,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.signature,
      parsed.watchedAddress,
      parsed.watchedAddressKind,
      parsed.mint ?? null,
      parsed.status,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      parsed.receivedAt
    );

  return {
    ...parsed,
    id: toRowId(result.lastInsertRowid),
    createdAt: parsed.receivedAt
  };
}

export function listChainTransactionEvents(
  limit = 50
): StoredChainTransactionEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_transaction_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ChainTransactionEventRow[];

  return rows.map(mapChainTransactionEventRow);
}

export function listChainTransactionEventsForReplay(
  limit = 50
): StoredChainTransactionEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_transaction_events
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as ChainTransactionEventRow[];

  return rows.map(mapChainTransactionEventRow);
}

export function getChainTransactionEvent(
  signature: string
): StoredChainTransactionEvent | null {
  const row = getDb()
    .prepare(
      `select *
       from chain_transaction_events
       where signature = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(signature) as ChainTransactionEventRow | undefined;

  return row ? mapChainTransactionEventRow(row) : null;
}

export function saveChainTradeEvent(
  event: ChainTradeEventInput
): StoredChainTradeEvent {
  const parsed = chainTradeEventInputSchema.parse(
    event
  ) as NormalizedChainTradeEvent;
  const db = getDb();

  const result = db
    .prepare(
      `insert into chain_trade_events (
        signature,
        mint,
        side,
        confidence,
        price_usd,
        volume_usd,
        token_amount,
        watched_address,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.signature,
      parsed.mint,
      parsed.side,
      parsed.confidence,
      parsed.priceUsd ?? null,
      parsed.volumeUsd ?? null,
      parsed.tokenAmount ?? null,
      parsed.watchedAddress,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      parsed.timestamp
    );

  return {
    ...parsed,
    id: toRowId(result.lastInsertRowid),
    createdAt: parsed.timestamp
  };
}

export function listChainTradeEvents(limit = 50): StoredChainTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_trade_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ChainTradeEventRow[];

  return rows.map(mapChainTradeEventRow);
}

export function listChainTradeEventsForReplay(
  limit = 50
): StoredChainTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_trade_events
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as ChainTradeEventRow[];

  return rows.map(mapChainTradeEventRow);
}

export function getChainTradeEvent(
  signature: string
): StoredChainTradeEvent | null {
  const row = getDb()
    .prepare(
      `select *
       from chain_trade_events
       where signature = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(signature) as ChainTradeEventRow | undefined;

  return row ? mapChainTradeEventRow(row) : null;
}

export async function* createReplayStream(options: {
  limit?: number;
  speed?: number;
  type?: ReplaySource;
} = {}): AsyncGenerator<ReplayItem> {
  const type = options.type ?? "feed_events";
  const speed = options.speed ?? 0;
  const records = getReplayRecords(type, options.limit);
  let previousTimestamp: number | undefined;

  for (const [index, record] of records.entries()) {
    const currentTimestamp = Date.parse(record.createdAt);

    if (
      speed > 0 &&
      previousTimestamp !== undefined &&
      Number.isFinite(currentTimestamp) &&
      Number.isFinite(previousTimestamp)
    ) {
      const waitMs = Math.max(0, (currentTimestamp - previousTimestamp) / speed);

      if (waitMs > 0) {
        await delay(waitMs);
      }
    }

    previousTimestamp = currentTimestamp;

    yield {
      createdAt: record.createdAt,
      payload: getReplayPayload(record),
      sequence: index + 1,
      source: type
    };
  }
}

function getReplayPayload(
  record:
    | StoredCandidateDecision
    | StoredChainTransactionEvent
    | StoredChainTradeEvent
    | StoredChainVerification
    | StoredFeedEvent
    | StoredRiskSnapshot
    | StoredSignal
): unknown {
  if ("payload" in record) {
    return record.payload;
  }

  const payload = { ...record } as Record<string, unknown>;
  delete payload.createdAt;
  delete payload.id;
  return payload;
}

function getReplayRecords(
  type: ReplaySource,
  limit: number | undefined
): Array<
  | StoredCandidateDecision
  | StoredChainTransactionEvent
  | StoredChainTradeEvent
  | StoredChainVerification
  | StoredFeedEvent
  | StoredRiskSnapshot
  | StoredSignal
> {
  switch (type) {
    case "candidate_decisions":
      return listCandidateDecisionsForReplay(limit);
    case "chain_transaction_events":
      return listChainTransactionEventsForReplay(limit);
    case "chain_trade_events":
      return listChainTradeEventsForReplay(limit);
    case "chain_verifications":
      return listChainVerificationsForReplay(limit);
    case "risk_snapshots":
      return listRiskSnapshotsForReplay(limit);
    case "signals":
      return listSignalsForReplay(limit);
    case "feed_events":
      return listFeedEvents(limit);
  }
}

export function savePaperOrder(order: PaperOrderInput): StoredPaperOrder {
  const parsed = paperOrderInputSchema.parse(order);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into paper_orders (
        mint,
        symbol,
        side,
        status,
        size_sol,
        simulated_price,
        reason_codes_json,
        signal_id,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.symbol,
      parsed.side,
      parsed.status,
      parsed.sizeSol,
      parsed.simulatedPrice,
      stringifyJson(parsed.reasonCodes),
      parsed.signalId ?? null,
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    symbol: parsed.symbol,
    side: parsed.side,
    status: parsed.status,
    sizeSol: parsed.sizeSol,
    simulatedPrice: parsed.simulatedPrice,
    reasonCodes: parsed.reasonCodes,
    signalId: parsed.signalId ?? null,
    payload: parsed.payload,
    createdAt
  };
}

export function listPaperOrders(limit = 50): StoredPaperOrder[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from paper_orders
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperOrderRow[];

  return rows.map(mapPaperOrderRow);
}

export function upsertPaperPosition(
  position: PaperPositionInput
): StoredPaperPosition {
  const parsed = paperPositionInputSchema.parse(position);
  const now = new Date().toISOString();
  const openedAt = parsed.openedAt ?? now;
  const updatedAt = parsed.updatedAt ?? now;
  const db = getDb();

  db.prepare(
    `insert into paper_positions (
      mint,
      symbol,
      size_sol,
      token_amount,
      entry_price,
      status,
      payload_json,
      opened_at,
      updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(mint) do update set
      symbol = excluded.symbol,
      size_sol = excluded.size_sol,
      token_amount = excluded.token_amount,
      entry_price = excluded.entry_price,
      status = excluded.status,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`
  ).run(
    parsed.mint,
    parsed.symbol,
    parsed.sizeSol,
    parsed.tokenAmount,
    parsed.entryPrice,
    parsed.status,
    stringifyJson(parsed.payload),
    openedAt,
    updatedAt
  );

  const row = db
    .prepare("select * from paper_positions where mint = ?")
    .get(parsed.mint) as PaperPositionRow | undefined;

  if (!row) {
    throw new Error(`Failed to upsert paper position for ${parsed.mint}`);
  }

  return mapPaperPositionRow(row);
}

export function listPaperPositions(): StoredPaperPosition[] {
  const rows = getDb()
    .prepare(
      `select *
       from paper_positions
       order by datetime(updated_at) desc, id desc`
    )
    .all() as PaperPositionRow[];

  return rows.map(mapPaperPositionRow);
}

export function getStorageStats(): StorageStats {
  const db = getDb();
  const lastSignal = db
    .prepare("select max(created_at) as last_signal_at from signals")
    .get() as LastSignalRow;

  return {
    databasePath: getStoragePath(),
    feedEventCount: countRows(db, "feed_events"),
    signalCount: countRows(db, "signals"),
    chainVerificationCount: countRows(db, "chain_verifications"),
    chainTransactionEventCount: countRows(db, "chain_transaction_events"),
    chainTradeEventCount: countRows(db, "chain_trade_events"),
    riskSnapshotCount: countRows(db, "risk_snapshots"),
    candidateDecisionCount: countRows(db, "candidate_decisions"),
    paperOrderCount: countRows(db, "paper_orders"),
    paperPositionCount: countRows(db, "paper_positions"),
    lastSignalAt: lastSignal.last_signal_at
  };
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    create table if not exists storage_migrations (
      id integer primary key,
      name text not null,
      applied_at text not null
    )
  `);

  if (!hasMigration(db, 1)) {
    db.exec(`
      create table if not exists feed_events (
        id integer primary key autoincrement,
        event_type text not null,
        mint text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_feed_events_created_at
        on feed_events(created_at);

      create index if not exists idx_feed_events_mint
        on feed_events(mint);

      create table if not exists signals (
        id integer primary key autoincrement,
        mint text not null,
        symbol text not null,
        action text not null,
        score real not null,
        hard_reject integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_signals_created_at
        on signals(created_at);

      create index if not exists idx_signals_mint
        on signals(mint);

      create table if not exists paper_orders (
        id integer primary key autoincrement,
        mint text not null,
        symbol text not null,
        side text not null,
        status text not null,
        size_sol real not null,
        simulated_price real not null,
        reason_codes_json text not null,
        signal_id integer,
        payload_json text not null,
        created_at text not null,
        foreign key(signal_id) references signals(id)
      );

      create index if not exists idx_paper_orders_created_at
        on paper_orders(created_at);

      create index if not exists idx_paper_orders_mint
        on paper_orders(mint);

      create table if not exists paper_positions (
        id integer primary key autoincrement,
        mint text not null unique,
        symbol text not null,
        size_sol real not null,
        token_amount real not null,
        entry_price real not null,
        status text not null,
        payload_json text not null,
        opened_at text not null,
        updated_at text not null
      );

      create index if not exists idx_paper_positions_updated_at
        on paper_positions(updated_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(1, "initial_paper_storage", new Date().toISOString());
  }

  if (!hasMigration(db, 2)) {
    db.exec(`
      create table if not exists risk_snapshots (
        id integer primary key autoincrement,
        mint text not null,
        risk_level text not null,
        hard_reject integer not null,
        risk_score real not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_risk_snapshots_created_at
        on risk_snapshots(created_at);

      create index if not exists idx_risk_snapshots_mint
        on risk_snapshots(mint);

      create table if not exists candidate_decisions (
        id integer primary key autoincrement,
        mint text not null,
        symbol text not null,
        lifecycle_state text not null,
        action text not null,
        score real not null,
        risk_level text not null,
        hard_reject integer not null,
        combined_reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_candidate_decisions_created_at
        on candidate_decisions(created_at);

      create index if not exists idx_candidate_decisions_mint
        on candidate_decisions(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(2, "risk_and_candidate_decisions", new Date().toISOString());
  }

  if (!hasMigration(db, 3)) {
    db.exec(`
      create table if not exists chain_verifications (
        id integer primary key autoincrement,
        mint text not null,
        status text not null,
        reason_codes_json text not null,
        mint_authority_active integer,
        freeze_authority_active integer,
        supply_ui real,
        top_holder_pct real,
        top10_holder_pct real,
        payload_json text not null,
        inspected_at text not null,
        created_at text not null
      );

      create index if not exists idx_chain_verifications_created_at
        on chain_verifications(created_at);

      create index if not exists idx_chain_verifications_mint
        on chain_verifications(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
      values (?, ?, ?)`
    ).run(3, "chain_verifications", new Date().toISOString());
  }

  if (!hasMigration(db, 4)) {
    db.exec(`
      create table if not exists chain_transaction_events (
        id integer primary key autoincrement,
        signature text not null,
        watched_address text not null,
        watched_address_kind text not null,
        mint text,
        status text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_chain_transaction_events_created_at
        on chain_transaction_events(created_at);

      create index if not exists idx_chain_transaction_events_signature
        on chain_transaction_events(signature);

      create index if not exists idx_chain_transaction_events_watched_address
        on chain_transaction_events(watched_address);

      create table if not exists chain_trade_events (
        id integer primary key autoincrement,
        signature text not null,
        mint text not null,
        side text not null,
        confidence text not null,
        price_usd real,
        volume_usd real,
        token_amount real,
        watched_address text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_chain_trade_events_created_at
        on chain_trade_events(created_at);

      create index if not exists idx_chain_trade_events_signature
        on chain_trade_events(signature);

      create index if not exists idx_chain_trade_events_mint
        on chain_trade_events(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(4, "chain_transaction_events", new Date().toISOString());
  }
}

function hasMigration(db: DatabaseSync, id: number): boolean {
  const row = db
    .prepare("select id from storage_migrations where id = ?")
    .get(id) as { id: number } | undefined;

  return Boolean(row);
}

function countRows(db: DatabaseSync, tableName: string): number {
  const row = db.prepare(`select count(*) as count from ${tableName}`).get() as
    | CountRow
    | undefined;

  return row?.count ?? 0;
}

function getDb(): DatabaseSync {
  if (!activeStorage) {
    initStorage();
  }

  if (!activeStorage) {
    throw new Error("Storage failed to initialize.");
  }

  return activeStorage.db;
}

function getStoragePath(): string {
  if (!activeStorage) {
    initStorage();
  }

  if (!activeStorage) {
    throw new Error("Storage failed to initialize.");
  }

  return activeStorage.databasePath;
}

function resolveDatabasePath(databasePath?: string): string {
  if (databasePath) {
    return isAbsolute(databasePath)
      ? databasePath
      : join(findWorkspaceRoot(cwd()), databasePath);
  }

  return join(findWorkspaceRoot(cwd()), defaultDatabaseRelativePath);
}

function findWorkspaceRoot(startDirectory: string): string {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    if (existsSync(join(currentDirectory, "pnpm-workspace.yaml"))) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
}

function getFeedEventMint(event: FeedEvent): string {
  if (event.type === "token_created") {
    return event.candidate.mint;
  }

  return event.token.mint;
}

function getFeedEventTimestamp(event: FeedEvent): string {
  return event.timestamp || new Date().toISOString();
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function mapFeedEventRow(row: FeedEventRow): StoredFeedEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    mint: row.mint,
    payload: JSON.parse(row.payload_json) as FeedEvent,
    createdAt: row.created_at
  };
}

function mapSignalRow(row: SignalRow): StoredSignal {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    action: row.action,
    score: row.score,
    hardReject: Boolean(row.hard_reject),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: OverlaySignalSchema.parse(JSON.parse(row.payload_json)),
    createdAt: row.created_at
  };
}

function mapPaperOrderRow(row: PaperOrderRow): StoredPaperOrder {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    side: row.side,
    status: row.status,
    sizeSol: row.size_sol,
    simulatedPrice: row.simulated_price,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    signalId: row.signal_id,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapPaperPositionRow(row: PaperPositionRow): StoredPaperPosition {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    sizeSol: row.size_sol,
    tokenAmount: row.token_amount,
    entryPrice: row.entry_price,
    status: row.status,
    payload: JSON.parse(row.payload_json),
    openedAt: row.opened_at,
    updatedAt: row.updated_at
  };
}

function mapChainVerificationRow(
  row: ChainVerificationRow
): StoredChainVerification {
  return {
    id: row.id,
    mint: row.mint,
    status: row.status,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    mintAuthorityActive: nullableIntToBool(row.mint_authority_active),
    freezeAuthorityActive: nullableIntToBool(row.freeze_authority_active),
    supplyUi: row.supply_ui,
    topHolderPct: row.top_holder_pct,
    top10HolderPct: row.top10_holder_pct,
    payload: JSON.parse(row.payload_json),
    inspectedAt: row.inspected_at,
    createdAt: row.created_at
  };
}

function mapChainTransactionEventRow(
  row: ChainTransactionEventRow
): StoredChainTransactionEvent {
  const payload = chainTransactionEventInputSchema.parse(
    JSON.parse(row.payload_json)
  ) as ChainTransactionEvent;

  return {
    ...payload,
    id: row.id,
    createdAt: row.created_at
  };
}

function mapChainTradeEventRow(
  row: ChainTradeEventRow
): StoredChainTradeEvent {
  const payload = chainTradeEventInputSchema.parse(
    JSON.parse(row.payload_json)
  ) as NormalizedChainTradeEvent;

  return {
    ...payload,
    id: row.id,
    createdAt: row.created_at
  };
}

function mapRiskSnapshotRow(row: RiskSnapshotRow): StoredRiskSnapshot {
  return {
    id: row.id,
    mint: row.mint,
    riskLevel: row.risk_level,
    hardReject: Boolean(row.hard_reject),
    riskScore: row.risk_score,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: RiskSnapshotSchema.parse(JSON.parse(row.payload_json)),
    createdAt: row.created_at
  };
}

function mapCandidateDecisionRow(
  row: CandidateDecisionRow
): StoredCandidateDecision {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    lifecycleState: row.lifecycle_state,
    action: row.action,
    score: row.score,
    riskLevel: row.risk_level,
    hardReject: Boolean(row.hard_reject),
    combinedReasonCodes: JSON.parse(
      row.combined_reason_codes_json
    ) as string[],
    payload: CandidateDecisionSchema.parse(JSON.parse(row.payload_json)),
    createdAt: row.created_at
  };
}

function toRowId(rowId: number | bigint): number {
  return typeof rowId === "bigint" ? Number(rowId) : rowId;
}

function boolToNullableInt(value: boolean | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return value ? 1 : 0;
}

function nullableIntToBool(value: number | null): boolean | null {
  if (value === null) {
    return null;
  }

  return value === 1;
}
