import { describe, expect, it } from "vitest";
import { createLiveTokenStateStore } from "../src/index";
import type {
  NormalizedIndexerEvent,
  NormalizedTokenTradeEvent
} from "@axi/indexer-core";

const created: NormalizedIndexerEvent = {
  id: "idx_created",
  schemaVersion: 1,
  source: "mock",
  sourceMode: "mock",
  chain: "solana",
  receivedAt: "2026-01-01T00:00:00.000Z",
  reasonCodes: ["INDEXER_SCHEMA_V1"],
  type: "token_created",
  mint: "Mint111111111111111111111111111111111111",
  name: "Portal Token",
  symbol: "PORTAL",
  metadataUri: null
};

function trade(input: Partial<NormalizedTokenTradeEvent> = {}): NormalizedTokenTradeEvent {
  return {
    id: "idx_trade",
    schemaVersion: 1,
    source: "pumpportal",
    sourceMode: "real",
    chain: "solana",
    receivedAt: "2026-01-01T00:00:02.000Z",
    reasonCodes: ["INDEXER_EVENT_USABLE_FOR_METRICS"],
    type: "token_trade",
    mint: "Mint111111111111111111111111111111111111",
    side: "buy",
    trader: "Trader11111111111111111111111111111111111",
    priceSol: 0.00042,
    priceUsd: null,
    volumeSol: 1.5,
    volumeUsd: null,
    tokenAmount: 3571,
    pool: null,
    bondingCurve: null,
    confidence: "high",
    usableForMetrics: true,
    ...input
  };
}

describe("@axi/live-state", () => {
  it("creates state from token_created", () => {
    const store = createLiveTokenStateStore({
      now: () => new Date("2026-01-01T00:00:03.000Z")
    });

    store.applyIndexerEvent(created);
    const token = store.getToken(created.mint);

    expect(token?.displayName).toBe("PORTAL Portal Token");
    expect(token?.ageSeconds).toBe(3);
    expect(token?.dataCompleteness.label).toBe("discovery_only");
  });

  it("updates latest price and volume from token_trade", () => {
    const store = createLiveTokenStateStore();

    store.applyIndexerEvent(created);
    store.applyIndexerEvent(trade());
    const token = store.getToken(created.mint);

    expect(token?.latestTrade?.priceSol).toBe(0.00042);
    expect(token?.market.volumeSol10s).toBe(1.5);
    expect(token?.flow.buyCount10s).toBe(1);
    expect(token?.dataCompleteness.label).toBe("trade_tracked");
  });

  it("tracks missing fields", () => {
    const store = createLiveTokenStateStore();

    store.applyIndexerEvent({
      ...created,
      name: null,
      symbol: null
    });

    expect(store.getToken(created.mint)?.dataCompleteness.missingFields).toContain(
      "name"
    );
  });

  it("updates event types for migrations", () => {
    const store = createLiveTokenStateStore();

    store.applyIndexerEvent(created);
    store.applyIndexerEvent({
      ...created,
      id: "idx_migration",
      type: "token_migrated",
      pool: "Pool111111111111111111111111111111111111",
      oldBondingCurve: null,
      newPool: null,
      migrationSource: "pumpportal"
    });

    expect(store.getToken(created.mint)?.eventTypes).toEqual([
      "token_created",
      "token_migrated"
    ]);
  });

  it("sorts live cards by lastSeenAt descending", () => {
    const store = createLiveTokenStateStore();

    store.applyIndexerEvent({
      ...created,
      mint: "Mint111111111111111111111111111111111111",
      receivedAt: "2026-01-01T00:00:00.000Z"
    });
    store.applyIndexerEvent({
      ...created,
      id: "idx_later",
      mint: "Mint222222222222222222222222222222222222",
      receivedAt: "2026-01-01T00:00:05.000Z"
    });

    expect(store.getLiveCards().map((card) => card.mint)).toEqual([
      "Mint222222222222222222222222222222222222",
      "Mint111111111111111111111111111111111111"
    ]);
  });

  it("does not emit NaN or Infinity", () => {
    const store = createLiveTokenStateStore();

    store.applyIndexerEvent(created);
    store.applyIndexerEvent(
      trade({
        priceSol: Number.NaN,
        volumeSol: Number.POSITIVE_INFINITY,
        usableForMetrics: false
      })
    );

    expect(JSON.stringify(store.getLiveCards())).not.toMatch(/NaN|Infinity/);
  });
});
