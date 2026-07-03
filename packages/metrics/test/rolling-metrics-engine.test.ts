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

  it("ignores null and unknown chain trade observations safely", () => {
    const engine = createRollingMetricsEngine();
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString();

    engine.ingestTradeObservation({
      mint,
      priceUsd: null,
      side: "unknown",
      timestamp,
      volumeUsd: null
    });
    const metrics = engine.getMetrics(mint);

    expect(metrics?.sampleCount).toBe(0);
    expect(metrics?.latestPriceUsd).toBe(0);
    expect(metrics?.windows["5s"].totalVolumeUsd).toBe(0);
  });

  it("valid chain trade observations update metrics safely", () => {
    const engine = createRollingMetricsEngine();
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString();

    engine.ingestTradeObservation({
      mint,
      priceUsd: 2,
      side: "buy",
      timestamp,
      trader: "chain-trader",
      volumeUsd: 150
    });
    const metrics = engine.getMetrics(mint);

    expect(metrics?.sampleCount).toBe(1);
    expect(metrics?.latestPriceUsd).toBe(2);
    expect(metrics?.windows["5s"].buyVolumeUsd).toBe(150);
  });

  it("ingests SOL-denominated trade events", () => {
    const engine = createRollingMetricsEngine();
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString();

    engine.ingestTradeObservation({
      mint,
      priceSol: 0.2,
      quoteAsset: "SOL",
      side: "buy",
      timestamp,
      trader: "sol-buyer",
      volumeSol: 2
    });
    const metrics = engine.getMetrics(mint);

    expect(metrics?.sampleCount).toBe(1);
    expect(metrics?.latestPriceUsd).toBe(0);
    expect(metrics?.latestPriceSol).toBe(0.2);
    expect(metrics?.windows["5s"].buyVolumeSol).toBe(2);
    expect(metrics?.windows["5s"].totalVolumeUsd).toBe(0);
    expect(metrics?.hasUsdMetrics).toBe(false);
    expect(metrics?.hasSolMetrics).toBe(true);
    expect(metrics?.usedSolMetricsFallback).toBe(true);
  });

  it("computes SOL rolling volume and velocity", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeObservation(createSolObservation({ seconds: 0, volumeSol: 1 }));
    engine.ingestTradeObservation(createSolObservation({ seconds: 1, volumeSol: 2 }));
    engine.ingestTradeObservation(createSolObservation({ seconds: 2, volumeSol: 3 }));
    const metrics = engine.getMetrics(mint);

    expect(metrics?.windows["5s"].totalVolumeSol).toBe(6);
    expect(metrics?.volumeVelocitySolPerSec).toBe(1.2);
    expect(metrics?.volumeAccelerationSolPerSec2).toBeGreaterThanOrEqual(0);
  });

  it("computes SOL price velocity and keeps USD safe when unknown", () => {
    const engine = createRollingMetricsEngine();

    engine.ingestTradeObservation(
      createSolObservation({ priceSol: 0.1, seconds: 0, volumeSol: 1 })
    );
    engine.ingestTradeObservation(
      createSolObservation({ priceSol: 0.12, seconds: 2, volumeSol: 1 })
    );
    const metrics = engine.getMetrics(mint);

    expect(metrics?.priceSolChangePct?.["5s"]).toBeCloseTo(20);
    expect(metrics?.priceSolVelocityPctPerSec).toBeCloseTo(4);
    expect(metrics?.priceVelocityPctPerSec).toBe(0);
    expect(metrics?.windows["5s"].totalVolumeUsd).toBe(0);
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

function createSolObservation(options: {
  priceSol?: number;
  seconds?: number;
  side?: "buy" | "sell";
  trader?: string;
  volumeSol?: number;
}) {
  const seconds = options.seconds ?? 0;
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
  const side = options.side ?? "buy";

  return {
    mint,
    priceSol: options.priceSol ?? 0.2,
    quoteAsset: "SOL" as const,
    side,
    timestamp,
    trader: options.trader ?? `${side}-sol-${seconds}`,
    volumeSol: options.volumeSol ?? 1
  };
}

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
