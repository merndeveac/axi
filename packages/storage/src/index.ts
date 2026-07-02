import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { cwd } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { FeedEvent } from "@axi/data-feeds";
import {
  OverlaySignalSchema,
  type OverlaySignal,
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

export type ReplaySource = "feed_events" | "signals";

export type ReplayItem = {
  createdAt: string;
  payload: FeedEvent | OverlaySignal;
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
  paperOrderCount: number;
  paperPositionCount: number;
  lastSignalAt: string | null;
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

export async function* createReplayStream(options: {
  limit?: number;
  speed?: number;
  type?: ReplaySource;
} = {}): AsyncGenerator<ReplayItem> {
  const type = options.type ?? "feed_events";
  const speed = options.speed ?? 0;
  const records =
    type === "signals"
      ? listSignalsForReplay(options.limit)
      : listFeedEvents(options.limit);
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
      payload: record.payload,
      sequence: index + 1,
      source: type
    };
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

  if (hasMigration(db, 1)) {
    return;
  }

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

function toRowId(rowId: number | bigint): number {
  return typeof rowId === "bigint" ? Number(rowId) : rowId;
}
