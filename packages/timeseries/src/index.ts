import {
  getEventTimestamp,
  isTradeUsableForMetrics,
  type NormalizedTokenTradeEvent
} from "@axi/indexer-core";

export const tradeWindowMs = [1000, 5000, 10000, 30000, 60000] as const;
export type TradeWindowMs = (typeof tradeWindowMs)[number];
export type TradeWindowLabel = "1s" | "5s" | "10s" | "30s" | "60s";

export type Ohlcv = {
  openSol: number | null;
  highSol: number | null;
  lowSol: number | null;
  closeSol: number | null;
  volumeSol: number;
  buyVolumeSol: number;
  sellVolumeSol: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  vwapSol: number | null;
};

export type RollingStats = {
  priceVelocityPctPerSec: number;
  priceAccelerationPctPerSec2: number;
  volumeVelocitySolPerSec: number;
  volumeAccelerationSolPerSec2: number;
  buyerVelocityPerSec: number;
  buyerAccelerationPerSec2: number;
};

export type TradeTimeseries = {
  clear: () => void;
  getOhlcv: (mint: string, windowMs: TradeWindowMs | number) => Ohlcv;
  getRollingStats: (mint: string) => RollingStats;
  getWindows: (mint: string) => Record<TradeWindowLabel, Ohlcv>;
  ingestTrade: (event: NormalizedTokenTradeEvent) => boolean;
};

export type TradeTimeseriesOptions = {
  retentionMs?: number;
};

type TradeSample = {
  mint: string;
  side: "buy" | "sell";
  trader: string | null;
  priceSol: number;
  volumeSol: number;
  timestampMs: number;
};

export function createTradeTimeseries(
  options: TradeTimeseriesOptions = {}
): TradeTimeseries {
  const retentionMs = Math.max(60_000, options.retentionMs ?? 60_000);
  const samplesByMint = new Map<string, TradeSample[]>();

  function ingestTrade(event: NormalizedTokenTradeEvent): boolean {
    if (!isTradeUsableForMetrics(event)) {
      return false;
    }

    if (event.side !== "buy" && event.side !== "sell") {
      return false;
    }

    if (!isPositiveFinite(event.priceSol) || !isPositiveFinite(event.volumeSol)) {
      return false;
    }

    const timestampMs = Date.parse(getEventTimestamp(event));

    if (!Number.isFinite(timestampMs)) {
      return false;
    }

    const samples = samplesByMint.get(event.mint) ?? [];
    samples.push({
      mint: event.mint,
      side: event.side,
      trader: event.trader ?? null,
      priceSol: event.priceSol,
      volumeSol: event.volumeSol,
      timestampMs
    });
    samples.sort((left, right) => left.timestampMs - right.timestampMs);
    samplesByMint.set(
      event.mint,
      samples.filter((sample) => sample.timestampMs >= timestampMs - retentionMs)
    );

    return true;
  }

  function getOhlcv(mint: string, windowMs: TradeWindowMs | number): Ohlcv {
    const samples = samplesByMint.get(mint.trim()) ?? [];
    const referenceTimestampMs = latestTimestamp(samples);
    return computeOhlcv(samples, referenceTimestampMs, windowMs);
  }

  function getWindows(mint: string): Record<TradeWindowLabel, Ohlcv> {
    return {
      "1s": getOhlcv(mint, 1000),
      "5s": getOhlcv(mint, 5000),
      "10s": getOhlcv(mint, 10000),
      "30s": getOhlcv(mint, 30000),
      "60s": getOhlcv(mint, 60000)
    };
  }

  function getRollingStats(mint: string): RollingStats {
    const samples = samplesByMint.get(mint.trim()) ?? [];
    const referenceTimestampMs = latestTimestamp(samples);
    const current5s = computeOhlcv(samples, referenceTimestampMs, 5000);
    const previous5s = computeSegmentOhlcv(samples, referenceTimestampMs, 10000, 5000);
    const currentPriceVelocity = priceChangePct(current5s) / 5;
    const previousPriceVelocity = priceChangePct(previous5s) / 5;
    const currentVolumeVelocity = current5s.volumeSol / 5;
    const previousVolumeVelocity = previous5s.volumeSol / 5;
    const currentBuyerVelocity = current5s.uniqueBuyers / 5;
    const previousBuyerVelocity = previous5s.uniqueBuyers / 5;

    return {
      priceVelocityPctPerSec: roundMetric(currentPriceVelocity),
      priceAccelerationPctPerSec2: roundMetric(
        (currentPriceVelocity - previousPriceVelocity) / 5
      ),
      volumeVelocitySolPerSec: roundMetric(currentVolumeVelocity),
      volumeAccelerationSolPerSec2: roundMetric(
        (currentVolumeVelocity - previousVolumeVelocity) / 5
      ),
      buyerVelocityPerSec: roundMetric(currentBuyerVelocity),
      buyerAccelerationPerSec2: roundMetric(
        (currentBuyerVelocity - previousBuyerVelocity) / 5
      )
    };
  }

  return {
    clear: () => samplesByMint.clear(),
    getOhlcv,
    getRollingStats,
    getWindows,
    ingestTrade
  };
}

function computeOhlcv(
  samples: TradeSample[],
  referenceTimestampMs: number,
  windowMs: number
): Ohlcv {
  if (!Number.isFinite(referenceTimestampMs)) {
    return emptyOhlcv();
  }

  const windowSamples = samples.filter(
    (sample) =>
      sample.timestampMs > referenceTimestampMs - windowMs &&
      sample.timestampMs <= referenceTimestampMs
  );

  return computeFromSamples(windowSamples);
}

function computeSegmentOhlcv(
  samples: TradeSample[],
  referenceTimestampMs: number,
  olderMs: number,
  newerMs: number
): Ohlcv {
  if (!Number.isFinite(referenceTimestampMs)) {
    return emptyOhlcv();
  }

  return computeFromSamples(
    samples.filter(
      (sample) =>
        sample.timestampMs > referenceTimestampMs - olderMs &&
        sample.timestampMs <= referenceTimestampMs - newerMs
    )
  );
}

function computeFromSamples(samples: TradeSample[]): Ohlcv {
  const first = samples[0];
  const last = samples.at(-1);

  if (!first || !last) {
    return emptyOhlcv();
  }

  let volumeSol = 0;
  let buyVolumeSol = 0;
  let sellVolumeSol = 0;
  let weightedPrice = 0;
  const buyers = new Set<string>();
  const sellers = new Set<string>();

  for (const sample of samples) {
    volumeSol += sample.volumeSol;
    weightedPrice += sample.priceSol * sample.volumeSol;

    if (sample.side === "buy") {
      buyVolumeSol += sample.volumeSol;
      buyers.add(sample.trader ?? `buy:${sample.timestampMs}:${sample.volumeSol}`);
    } else {
      sellVolumeSol += sample.volumeSol;
      sellers.add(sample.trader ?? `sell:${sample.timestampMs}:${sample.volumeSol}`);
    }
  }

  return sanitizeOhlcv({
    openSol: first.priceSol,
    highSol: Math.max(...samples.map((sample) => sample.priceSol)),
    lowSol: Math.min(...samples.map((sample) => sample.priceSol)),
    closeSol: last.priceSol,
    volumeSol,
    buyVolumeSol,
    sellVolumeSol,
    tradeCount: samples.length,
    buyCount: samples.filter((sample) => sample.side === "buy").length,
    sellCount: samples.filter((sample) => sample.side === "sell").length,
    uniqueBuyers: buyers.size,
    uniqueSellers: sellers.size,
    vwapSol: volumeSol > 0 ? weightedPrice / volumeSol : null
  });
}

function emptyOhlcv(): Ohlcv {
  return {
    openSol: null,
    highSol: null,
    lowSol: null,
    closeSol: null,
    volumeSol: 0,
    buyVolumeSol: 0,
    sellVolumeSol: 0,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    uniqueBuyers: 0,
    uniqueSellers: 0,
    vwapSol: null
  };
}

function sanitizeOhlcv(input: Ohlcv): Ohlcv {
  return {
    openSol: finiteOrNull(input.openSol),
    highSol: finiteOrNull(input.highSol),
    lowSol: finiteOrNull(input.lowSol),
    closeSol: finiteOrNull(input.closeSol),
    volumeSol: roundMetric(input.volumeSol),
    buyVolumeSol: roundMetric(input.buyVolumeSol),
    sellVolumeSol: roundMetric(input.sellVolumeSol),
    tradeCount: input.tradeCount,
    buyCount: input.buyCount,
    sellCount: input.sellCount,
    uniqueBuyers: input.uniqueBuyers,
    uniqueSellers: input.uniqueSellers,
    vwapSol: finiteOrNull(input.vwapSol)
  };
}

function latestTimestamp(samples: TradeSample[]): number {
  return samples.at(-1)?.timestampMs ?? Number.NaN;
}

function priceChangePct(ohlcv: Ohlcv): number {
  if (!ohlcv.openSol || !ohlcv.closeSol || ohlcv.openSol <= 0) {
    return 0;
  }

  return ((ohlcv.closeSol - ohlcv.openSol) / ohlcv.openSol) * 100;
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? roundMetric(value)
    : null;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(10)) : 0;
}
