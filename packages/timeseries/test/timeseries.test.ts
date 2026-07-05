import { describe, expect, it } from "vitest";
import { createTradeTimeseries } from "../src/index";
import type { NormalizedTokenTradeEvent } from "@axi/indexer-core";

function trade(input: {
  id: string;
  side: "buy" | "sell" | "unknown";
  second: number;
  priceSol: number | null;
  volumeSol: number | null;
  trader?: string;
  usableForMetrics?: boolean;
}): NormalizedTokenTradeEvent {
  return {
    id: input.id,
    schemaVersion: 1,
    source: "mock",
    sourceMode: "mock",
    chain: "solana",
    receivedAt: `2026-01-01T00:00:${String(input.second).padStart(2, "0")}.000Z`,
    reasonCodes: [],
    type: "token_trade",
    mint: "Mint111111111111111111111111111111111111",
    side: input.side,
    trader: input.trader ?? null,
    priceSol: input.priceSol,
    priceUsd: null,
    volumeSol: input.volumeSol,
    volumeUsd: null,
    tokenAmount: 1000,
    pool: null,
    bondingCurve: null,
    confidence: "high",
    usableForMetrics: input.usableForMetrics ?? true
  };
}

describe("@axi/timeseries", () => {
  it("aggregates OHLCV", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(
      trade({ id: "a", side: "buy", second: 1, priceSol: 1, volumeSol: 2 })
    );
    series.ingestTrade(
      trade({ id: "b", side: "sell", second: 2, priceSol: 1.5, volumeSol: 3 })
    );

    expect(series.getOhlcv("Mint111111111111111111111111111111111111", 5000)).toMatchObject({
      openSol: 1,
      highSol: 1.5,
      lowSol: 1,
      closeSol: 1.5,
      volumeSol: 5,
      tradeCount: 2,
      vwapSol: 1.3
    });
  });

  it("calculates volume windows", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(
      trade({ id: "old", side: "buy", second: 1, priceSol: 1, volumeSol: 2 })
    );
    series.ingestTrade(
      trade({ id: "new", side: "buy", second: 7, priceSol: 1, volumeSol: 3 })
    );

    const windows = series.getWindows("Mint111111111111111111111111111111111111");
    expect(windows["5s"].volumeSol).toBe(3);
    expect(windows["10s"].volumeSol).toBe(5);
  });

  it("counts buy/sell and unique traders", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(
      trade({ id: "a", side: "buy", second: 1, priceSol: 1, volumeSol: 1, trader: "buyer" })
    );
    series.ingestTrade(
      trade({ id: "b", side: "buy", second: 2, priceSol: 1, volumeSol: 1, trader: "buyer" })
    );
    series.ingestTrade(
      trade({ id: "c", side: "sell", second: 3, priceSol: 1, volumeSol: 1, trader: "seller" })
    );

    const ohlcv = series.getOhlcv("Mint111111111111111111111111111111111111", 10000);
    expect(ohlcv.buyCount).toBe(2);
    expect(ohlcv.sellCount).toBe(1);
    expect(ohlcv.uniqueBuyers).toBe(1);
    expect(ohlcv.uniqueSellers).toBe(1);
  });

  it("derives price velocity and volume acceleration", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(
      trade({ id: "a", side: "buy", second: 1, priceSol: 1, volumeSol: 1 })
    );
    series.ingestTrade(
      trade({ id: "b", side: "buy", second: 6, priceSol: 2, volumeSol: 5 })
    );

    const stats = series.getRollingStats("Mint111111111111111111111111111111111111");
    expect(stats.priceVelocityPctPerSec).toBe(0);
    expect(stats.volumeAccelerationSolPerSec2).toBe(0.16);
  });

  it("ignores invalid events and never emits NaN or Infinity", () => {
    const series = createTradeTimeseries();

    expect(
      series.ingestTrade(
        trade({
          id: "invalid",
          side: "buy",
          second: 1,
          priceSol: Number.NaN,
          volumeSol: Number.POSITIVE_INFINITY,
          usableForMetrics: false
        })
      )
    ).toBe(false);
    expect(JSON.stringify(series.getWindows("Mint111111111111111111111111111111111111"))).not.toMatch(
      /NaN|Infinity/
    );
  });
});
