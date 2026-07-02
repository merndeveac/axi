import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FeedEvent } from "@axi/data-feeds";
import type { OverlaySignal } from "@axi/shared";
import {
  closeStorage,
  createReplayStream,
  getStorageStats,
  initStorage,
  listFeedEvents,
  listPaperOrders,
  listPaperPositions,
  listRecentSignals,
  listSignalsForReplay,
  saveFeedEvent,
  savePaperOrder,
  saveSignal,
  upsertPaperPosition
} from "../src/index";

const mint = "MockMint9999111111111111111111111111111111";

let testDirectory: string;
let databasePath: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-storage-"));
  databasePath = join(testDirectory, "axi.sqlite");
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("@axi/storage", () => {
  it("database initializes", () => {
    const handle = initStorage({ databasePath });
    const stats = getStorageStats();

    expect(handle.databasePath).toBe(databasePath);
    expect(stats.databasePath).toBe(databasePath);
    expect(stats.signalCount).toBe(0);
  });

  it("signal can be saved and read", () => {
    initStorage({ databasePath });
    const saved = saveSignal(createSignal());
    const recent = listRecentSignals(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.mint).toBe(mint);
    expect(recent[0]?.reasonCodes).toEqual(["STRONG_MOMENTUM"]);
  });

  it("paper order can be saved and read", () => {
    initStorage({ databasePath });
    const signal = saveSignal(createSignal());
    const order = savePaperOrder({
      mint,
      symbol: "MOCK",
      side: "buy",
      status: "accepted",
      sizeSol: 0.25,
      simulatedPrice: 0.00042,
      reasonCodes: ["STRONG_MOMENTUM"],
      signalId: signal.id,
      payload: {
        source: "test"
      }
    });

    const orders = listPaperOrders(10);

    expect(order.id).toBeGreaterThan(0);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.signalId).toBe(signal.id);
    expect(orders[0]?.side).toBe("buy");
  });

  it("paper position can be upserted and listed", () => {
    initStorage({ databasePath });
    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.25,
      tokenAmount: 595.23,
      entryPrice: 0.00042,
      status: "open",
      payload: {
        source: "first"
      }
    });

    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.5,
      tokenAmount: 1190.46,
      entryPrice: 0.00042,
      status: "open",
      payload: {
        source: "second"
      }
    });

    const positions = listPaperPositions();

    expect(positions).toHaveLength(1);
    expect(positions[0]?.sizeSol).toBe(0.5);
    expect(positions[0]?.tokenAmount).toBe(1190.46);
  });

  it("storage stats return counts", () => {
    initStorage({ databasePath });
    saveFeedEvent(createFeedEvent());
    const signal = saveSignal(createSignal());
    savePaperOrder({
      mint,
      symbol: "MOCK",
      side: "buy",
      status: "accepted",
      sizeSol: 0.25,
      simulatedPrice: 0.00042,
      reasonCodes: ["STRONG_MOMENTUM"],
      signalId: signal.id,
      payload: {}
    });
    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.25,
      tokenAmount: 595.23,
      entryPrice: 0.00042,
      status: "open",
      payload: {}
    });

    const stats = getStorageStats();

    expect(stats.feedEventCount).toBe(1);
    expect(stats.signalCount).toBe(1);
    expect(stats.paperOrderCount).toBe(1);
    expect(stats.paperPositionCount).toBe(1);
    expect(stats.lastSignalAt).toEqual(expect.any(String));
  });

  it("lists replay records in chronological order", async () => {
    initStorage({ databasePath });
    saveFeedEvent(createFeedEvent("2026-01-01T00:00:02.000Z"));
    saveFeedEvent(createFeedEvent("2026-01-01T00:00:01.000Z"));
    saveSignal(createSignal());

    const feedEvents = listFeedEvents(10);
    const signals = listSignalsForReplay(10);
    const replayItems = [];

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "feed_events"
    })) {
      replayItems.push(item);
    }

    expect(feedEvents.map((event) => event.createdAt)).toEqual([
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:02.000Z"
    ]);
    expect(signals).toHaveLength(1);
    expect(replayItems).toHaveLength(2);
    expect(replayItems[0]?.source).toBe("feed_events");
  });
});

function createFeedEvent(timestamp = "2026-01-01T00:00:00.000Z"): FeedEvent {
  return {
    type: "token_created",
    candidate: createSignal().state.candidate,
    metrics: createSignal().state.metrics,
    metricsComplete: true,
    receivedAt: timestamp,
    riskFlags: createSignal().riskFlags,
    source: "mock",
    timestamp
  };
}

function createSignal(): OverlaySignal {
  return {
    mint,
    symbol: "MOCK",
    score: 88,
    action: "BUY_READY",
    hardReject: false,
    reasonCodes: ["STRONG_MOMENTUM"],
    volumeVelocity: 2.1,
    buyerVelocity: 1.9,
    riskFlags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      topHolderConcentrationHigh: false,
      mutableMetadata: false,
      suspiciousName: false,
      lowLiquidity: false,
      washTradingSuspected: false,
      honeypotSuspected: false
    },
    state: {
      candidate: {
        id: {
          chain: "solana",
          mint
        },
        mint,
        symbol: "MOCK",
        name: "Mock Token",
        source: "test",
        ageSeconds: 90,
        firstSeenAt: "2026-01-01T00:00:00.000Z"
      },
      metrics: {
        priceUsd: 0.00042,
        marketCapUsd: 50_000,
        liquidityUsd: 12_000,
        volume1mUsd: 7_500,
        volume5mUsd: 21_000,
        volume15mUsd: 38_000,
        buyCount1m: 42,
        buyCount5m: 120,
        sellCount1m: 18,
        sellCount5m: 64,
        uniqueBuyers1m: 33,
        uniqueBuyers5m: 90,
        uniqueSellers1m: 14,
        uniqueSellers5m: 42,
        holderCount: 260,
        topHolderPercent: 8,
        top10HolderPercent: 36,
        priceChange1mPct: 4,
        priceChange5mPct: 14,
        volumeVelocity: 2.1,
        buyerVelocity: 1.9
      },
      riskFlags: {
        mintAuthorityActive: false,
        freezeAuthorityActive: false,
        topHolderConcentrationHigh: false,
        mutableMetadata: false,
        suspiciousName: false,
        lowLiquidity: false,
        washTradingSuspected: false,
        honeypotSuspected: false
      },
      score: {
        total: 88,
        momentum: 82,
        quality: 79,
        riskPenalty: 0,
        hardReject: false,
        action: "BUY_READY",
        reasonCodes: ["STRONG_MOMENTUM"]
      },
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  };
}
