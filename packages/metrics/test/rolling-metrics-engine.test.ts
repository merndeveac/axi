import { describe, expect, it } from "vitest";
import type { TokenTradeEvent } from "@axi/data-feeds";
import { createEmptyMetrics, createRollingMetricsEngine } from "../src/index";

const mint = "MetricMint111111111111111111111111111111";

describe("RollingMetricsEngine", () => {
  it("creates empty metrics", () => {
    const metrics = createEmptyMetrics(mint, {
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      symbol: "MET"
    });

    expect(metrics.mint).toBe(mint);
    expect(metrics.symbol).toBe("MET");
    expect(metrics.windows["5s"].totalVolumeUsd).toBe(0);
    expect(metrics.insufficientMetrics).toBe(true);
  });

  it("ingests buy trades", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ side: "buy", volumeUsd: 100 }));
    const metrics = engine.getMetrics(mint);

    expect(metrics?.windows["5s"].buyVolumeUsd).toBe(100);
    expect(metrics?.windows["5s"].buyTradeCount).toBe(1);
    expect(metrics?.netBuyPressure).toBe(1);
  });

  it("ingests sell trades", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ side: "sell", volumeUsd: 70 }));
    const metrics = engine.getMetrics(mint);

    expect(metrics?.windows["5s"].sellVolumeUsd).toBe(70);
    expect(metrics?.windows["5s"].sellTradeCount).toBe(1);
    expect(metrics?.netBuyPressure).toBe(-1);
  });

  it("computes per-window volume", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ seconds: 0, volumeUsd: 100 }));
    engine.ingestTradeEvent(createTrade({ seconds: 4, volumeUsd: 200 }));

    const metrics = engine.getMetrics(mint);

    expect(metrics?.windows["3s"].totalVolumeUsd).toBe(200);
    expect(metrics?.windows["5s"].totalVolumeUsd).toBe(300);
  });

  it("prunes old trades", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ seconds: 0, volumeUsd: 100 }));
    engine.ingestTradeEvent(createTrade({ seconds: 61, volumeUsd: 50 }));

    const metrics = engine.getMetrics(mint);

    expect(metrics?.windows["60s"].totalVolumeUsd).toBe(50);
    expect(metrics?.sampleCount).toBe(1);
  });

  it("computes volume velocity", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ seconds: 0, volumeUsd: 100 }));
    engine.ingestTradeEvent(createTrade({ seconds: 1, volumeUsd: 150 }));
    engine.ingestTradeEvent(createTrade({ seconds: 2, volumeUsd: 250 }));

    const metrics = engine.getMetrics(mint);

    expect(metrics?.volumeVelocityUsdPerSec).toBe(100);
  });

  it("computes volume acceleration", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ seconds: 0, volumeUsd: 50 }));
    engine.ingestTradeEvent(createTrade({ seconds: 6, volumeUsd: 250 }));
    engine.ingestTradeEvent(createTrade({ seconds: 7, volumeUsd: 250 }));

    const metrics = engine.getMetrics(mint);

    expect(metrics?.volumeAccelerationUsdPerSec2).toBeGreaterThan(0);
  });

  it("computes unique buyers and buyer velocity", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ seconds: 0, trader: "a" }));
    engine.ingestTradeEvent(createTrade({ seconds: 1, trader: "b" }));
    engine.ingestTradeEvent(createTrade({ seconds: 2, trader: "c" }));

    const metrics = engine.getMetrics(mint);

    expect(metrics?.windows["5s"].uniqueBuyers).toBe(3);
    expect(metrics?.buyerVelocityPerSec).toBe(0.6);
  });

  it("computes buyer acceleration", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ seconds: 0, trader: "old" }));
    engine.ingestTradeEvent(createTrade({ seconds: 6, trader: "a" }));
    engine.ingestTradeEvent(createTrade({ seconds: 7, trader: "b" }));
    engine.ingestTradeEvent(createTrade({ seconds: 8, trader: "c" }));

    const metrics = engine.getMetrics(mint);

    expect(metrics?.buyerAccelerationPerSec2).toBeGreaterThan(0);
  });

  it("computes price change", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ priceUsd: 1, seconds: 0 }));
    engine.ingestTradeEvent(createTrade({ priceUsd: 1.2, seconds: 2 }));

    const metrics = engine.getMetrics(mint);

    expect(metrics?.windows["5s"].priceChangePct).toBeCloseTo(20);
    expect(metrics?.priceVelocityPctPerSec).toBeCloseTo(4);
  });

  it("handles zero and empty safely", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeEvent(createTrade({ priceUsd: 0, volumeUsd: 0 }));
    const metrics = engine.getMetrics(mint);

    expect(metrics?.buySellRatio).toBe(1);
    expect(metrics?.latestPriceUsd).toBe(0);
    expect(metrics?.priceVelocityPctPerSec).toBe(0);
  });

  it("is deterministic given the same event sequence", () => {
    const first = createRollingMetricsEngine();
    const second = createRollingMetricsEngine();
    const events = [
      createTrade({ seconds: 0, volumeUsd: 100 }),
      createTrade({ seconds: 1, trader: "b", volumeUsd: 150 }),
      createTrade({ seconds: 2, priceUsd: 1.2, volumeUsd: 200 })
    ];

    for (const event of events) {
      first.ingestTradeEvent(event);
      second.ingestTradeEvent(event);
    }

    expect(second.getMetrics(mint)).toEqual(first.getMetrics(mint));
  });
});

function createTrade(options: {
  priceUsd?: number;
  seconds?: number;
  side?: "buy" | "sell";
  trader?: string;
  volumeUsd?: number;
} = {}): TokenTradeEvent {
  const seconds = options.seconds ?? 0;
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
  const side = options.side ?? "buy";
  const priceUsd = options.priceUsd ?? 1;
  const volumeUsd = options.volumeUsd ?? 100;

  return {
    type: "trade",
    mint,
    source: "mock",
    symbol: "MET",
    token: {
      chain: "solana",
      mint
    },
    side,
    priceUsd,
    volumeUsd,
    tokenAmount: priceUsd > 0 ? volumeUsd / priceUsd : 0,
    trader: options.trader ?? `${side}-${seconds}`,
    timestamp,
    metrics: {
      priceUsd,
      marketCapUsd: 0,
      liquidityUsd: 0,
      volume1mUsd: 0,
      volume5mUsd: 0,
      volume15mUsd: 0,
      buyCount1m: 0,
      buyCount5m: 0,
      sellCount1m: 0,
      sellCount5m: 0,
      uniqueBuyers1m: 0,
      uniqueBuyers5m: 0,
      uniqueSellers1m: 0,
      uniqueSellers5m: 0,
      holderCount: 0,
      topHolderPercent: 0,
      top10HolderPercent: 0,
      priceChange1mPct: 0,
      priceChange5mPct: 0,
      volumeVelocity: 0,
      buyerVelocity: 0
    },
    metricsComplete: true,
    receivedAt: timestamp,
    riskFlags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      topHolderConcentrationHigh: false,
      mutableMetadata: false,
      suspiciousName: false,
      lowLiquidity: false,
      washTradingSuspected: false,
      honeypotSuspected: false
    }
  };
}
