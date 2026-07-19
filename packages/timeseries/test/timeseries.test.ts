import { describe, expect, it } from "vitest";
import type { NormalizedTokenTradeEvent } from "@axi/indexer-core";
import {
  canonicalBucketMs,
  createTradeTimeseries,
  defaultTimeseriesRetentionMs
} from "../src/index";

const mint = "Mint111111111111111111111111111111111111";

describe("@axi/timeseries", () => {
  it("materializes deterministic one-second OHLCV buckets", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(
      trade({ id: "a", millisecond: 100, priceSol: 1, volumeSol: 2 })
    );
    series.ingestTrade(
      trade({
        id: "b",
        millisecond: 900,
        priceSol: 1.5,
        side: "sell",
        volumeSol: 3
      })
    );

    const bucket = series.getBuckets(mint)[0];
    expect(bucket).toMatchObject({
      bucketMs: canonicalBucketMs,
      bucketStart: "2026-01-01T00:00:00.000Z",
      bucketEnd: "2026-01-01T00:00:01.000Z",
      openSol: 1,
      highSol: 1.5,
      lowSol: 1,
      closeSol: 1.5,
      volumeSol: 5,
      tradeCount: 2,
      vwapSol: 1.3,
      synthetic: false
    });
  });

  it("uses event id as a stable tie-breaker for out-of-order trades", () => {
    const first = createTradeTimeseries();
    const second = createTradeTimeseries();
    const events = [
      trade({ id: "b", millisecond: 500, priceSol: 2 }),
      trade({ id: "a", millisecond: 500, priceSol: 1 })
    ];

    for (const event of events) {
      first.ingestTrade(event);
    }

    for (const event of [...events].reverse()) {
      second.ingestTrade(event);
    }

    expect(first.getBuckets(mint)).toEqual(second.getBuckets(mint));
    expect(first.getBuckets(mint)[0]).toMatchObject({
      openSol: 1,
      closeSol: 2
    });
  });

  it("deduplicates normalized event ids", () => {
    const series = createTradeTimeseries();
    const event = trade({ id: "duplicate", volumeSol: 2 });

    expect(series.ingestTradeWithResult(event).action).toBe("accepted");
    expect(series.ingestTradeWithResult(event).action).toBe("duplicate");
    expect(series.getWindows(mint)["1s"].tradeCount).toBe(1);
    expect(series.getStatus().duplicateEventCount).toBe(1);
  });

  it("materializes gap buckets with carried prices and zero activity", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(trade({ id: "first", second: 1, priceSol: 1 }));
    series.ingestTrade(trade({ id: "last", second: 3, priceSol: 2 }));

    const result = series.getSeries(mint, { fillGaps: true });
    expect(result.buckets).toHaveLength(3);
    expect(result.gapBucketCount).toBe(1);
    expect(result.buckets[1]).toMatchObject({
      bucketStart: "2026-01-01T00:00:02.000Z",
      openSol: 1,
      closeSol: 1,
      volumeSol: 0,
      tradeCount: 0,
      synthetic: true
    });
  });

  it("publishes a closed update when the event-time watermark advances", () => {
    const updates: Array<{ bucketStart: string; complete: boolean }> = [];
    const series = createTradeTimeseries({
      onBucketUpdated: (bucket) =>
        updates.push({
          bucketStart: bucket.bucketStart,
          complete: bucket.complete
        })
    });

    series.ingestTrade(trade({ id: "first", second: 1 }));
    series.ingestTrade(trade({ id: "second", second: 3 }));

    expect(updates).toEqual([
      { bucketStart: "2026-01-01T00:00:01.000Z", complete: false },
      { bucketStart: "2026-01-01T00:00:01.000Z", complete: true },
      { bucketStart: "2026-01-01T00:00:03.000Z", complete: false }
    ]);
  });

  it("exposes all target windows through five minutes", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(trade({ id: "old", second: 1, volumeSol: 2 }));
    series.ingestTrade(trade({ id: "new", second: 121, volumeSol: 3 }));

    const windows = series.getWindows(mint);
    expect(windows["60s"].volumeSol).toBe(3);
    expect(windows["2m"].volumeSol).toBe(3);
    expect(windows["5m"].volumeSol).toBe(5);
  });

  it("counts known unique traders without inventing unknown identities", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(trade({ id: "a", trader: "buyer" }));
    series.ingestTrade(trade({ id: "b", trader: "buyer" }));
    series.ingestTrade(trade({ id: "c", side: "sell", trader: "seller" }));
    series.ingestTrade(trade({ id: "d", trader: null }));

    const ohlcv = series.getWindows(mint)["5s"];
    expect(ohlcv.buyCount).toBe(3);
    expect(ohlcv.sellCount).toBe(1);
    expect(ohlcv.uniqueBuyers).toBe(1);
    expect(ohlcv.uniqueSellers).toBe(1);
  });

  it("supports USD-only normalized trades conservatively", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(
      trade({
        id: "usd",
        priceSol: null,
        priceUsd: 2,
        volumeSol: null,
        volumeUsd: 100
      })
    );

    const bucket = series.getBuckets(mint)[0];
    expect(bucket?.closeSol).toBeNull();
    expect(bucket?.closeUsd).toBe(2);
    expect(bucket?.volumeUsd).toBe(100);
    expect(series.getRollingStats(mint).priceSource).toBe("USD");
  });

  it("preserves tiny positive token prices when materializing buckets", () => {
    const updatedBuckets: Array<{ closeSol: number | null }> = [];
    const series = createTradeTimeseries({
      onBucketUpdated: (bucket) => {
        updatedBuckets.push({ closeSol: bucket.closeSol });
      }
    });

    series.ingestTrade(
      trade({
        id: "tiny-price",
        priceSol: 1e-12,
        volumeSol: 0.001
      })
    );

    const bucket = series.getBuckets(mint)[0];
    expect(bucket).toMatchObject({
      openSol: 1e-12,
      highSol: 1e-12,
      lowSol: 1e-12,
      closeSol: 1e-12,
      vwapSol: 1e-12
    });
    expect(updatedBuckets).toEqual([{ closeSol: 1e-12 }]);
  });

  it("rejects events outside bounded retention and prunes old buckets", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(trade({ id: "first", second: 0 }));
    series.ingestTrade(trade({ id: "latest", second: 300 }));
    const late = series.ingestTradeWithResult(
      trade({ id: "late", second: 0, millisecond: 500 })
    );

    expect(late.action).toBe("rejected_late");
    expect(series.getStatus().prunedBucketCount).toBe(1);
    expect(series.getStatus().lateEventCount).toBe(1);
    expect(series.getBuckets(mint).map((bucket) => bucket.bucketStart)).toEqual(
      ["2026-01-01T00:05:00.000Z"]
    );
  });

  it("projects sample-gated canonical derivatives into rolling stats", () => {
    const series = createTradeTimeseries();

    series.ingestTrade(
      trade({ id: "a", second: 1, priceSol: 1, volumeSol: 1 })
    );
    series.ingestTrade(
      trade({ id: "b", second: 3, priceSol: 1, volumeSol: 2 })
    );
    series.ingestTrade(
      trade({ id: "c", second: 5, priceSol: 2, volumeSol: 5 })
    );

    const stats = series.getRollingStats(mint);
    expect(stats).toMatchObject({
      method: "event_time_finite_difference",
      sampleCount: 3,
      priceVelocityPctPerSec: 25,
      priceAccelerationPctPerSec2: 25,
      volumeVelocitySolPerSec: 1.6,
      volumeAccelerationSolPerSec2: 0.96,
      tradeVelocityPerSec: 0.6,
      tradeAccelerationPerSec2: 0.16
    });
    expect(series.getStatus()).toMatchObject({
      derivativeReadyMintCount: 1,
      accelerationReadyMintCount: 1
    });
    expect(series.getSeries(mint).derivatives.primaryWindow).toBe("5s");
    expect(JSON.stringify(stats)).not.toMatch(/NaN|Infinity/);
  });

  it("ignores invalid events and reports canonical status", () => {
    const series = createTradeTimeseries();

    expect(
      series.ingestTrade(
        trade({
          id: "invalid",
          priceSol: Number.NaN,
          volumeSol: Number.POSITIVE_INFINITY,
          usableForMetrics: false
        })
      )
    ).toBe(false);

    expect(series.getStatus()).toMatchObject({
      canonical: true,
      bucketMs: canonicalBucketMs,
      retentionMs: defaultTimeseriesRetentionMs,
      invalidEventCount: 1
    });
    expect(JSON.stringify(series.getSeries(mint))).not.toMatch(/NaN|Infinity/);
  });
});

function trade(input: {
  id: string;
  side?: "buy" | "sell" | "unknown";
  second?: number;
  millisecond?: number;
  priceSol?: number | null;
  priceUsd?: number | null;
  volumeSol?: number | null;
  volumeUsd?: number | null;
  trader?: string | null;
  usableForMetrics?: boolean;
}): NormalizedTokenTradeEvent {
  const second = input.second ?? 0;
  const millisecond = input.millisecond ?? 0;

  return {
    id: input.id,
    schemaVersion: 1,
    source: "mock",
    sourceMode: "mock",
    chain: "solana",
    receivedAt: new Date(
      Date.UTC(2026, 0, 1, 0, 0, second, millisecond)
    ).toISOString(),
    reasonCodes: ["TEST_TRADE"],
    type: "token_trade",
    mint,
    side: input.side ?? "buy",
    trader: input.trader === undefined ? `trader-${input.id}` : input.trader,
    priceSol: input.priceSol === undefined ? 1 : input.priceSol,
    priceUsd: input.priceUsd ?? null,
    volumeSol: input.volumeSol === undefined ? 1 : input.volumeSol,
    volumeUsd: input.volumeUsd ?? null,
    tokenAmount: 1_000,
    pool: null,
    bondingCurve: null,
    confidence: "high",
    usableForMetrics: input.usableForMetrics ?? true
  };
}
