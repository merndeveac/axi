import type { FeedEvent, TokenTradeEvent } from "@axi/data-feeds";
import type {
  MetricWindow,
  ObservationConfidence,
  QuoteAsset,
  RollingMetricsSnapshot,
  RollingWindowMetrics
} from "@axi/shared";

export const metricWindows = [1, 3, 5, 10, 30, 60] as const;
export const metricWindowLabels = ["1s", "3s", "5s", "10s", "30s", "60s"] as const;

export type MetricWindowSeconds = (typeof metricWindows)[number];

export type RollingMetricsEngineOptions = {
  minSamplesForComplete?: number;
};

export type TradeObservationInput = {
  mint: string;
  symbol?: string;
  side: "buy" | "sell" | "unknown";
  priceUsd?: number | null;
  priceSol?: number | null;
  priceQuote?: number | null;
  timestamp: string;
  trader?: string | null;
  volumeUsd?: number | null;
  volumeSol?: number | null;
  volumeQuote?: number | null;
  quoteAsset?: QuoteAsset;
  quoteMint?: string | null;
  usableForMetrics?: boolean;
  confidence?: ObservationConfidence;
  reasonCodes?: string[];
};

type TradeSample = {
  mint: string;
  symbol?: string;
  side: "buy" | "sell";
  priceUsd: number;
  priceSol: number;
  priceQuote: number;
  timestamp: string;
  timestampMs: number;
  trader?: string;
  volumeUsd: number;
  volumeSol: number;
  volumeQuote: number;
  quoteAsset?: QuoteAsset;
  quoteMint?: string | null;
  usableForMetrics?: boolean;
  confidence?: ObservationConfidence;
  reasonCodes?: string[];
};

type TokenState = {
  firstSeenAt: string;
  mint: string;
  symbol?: string;
  trades: TradeSample[];
};

export class RollingMetricsEngine {
  private readonly minSamplesForComplete: number;
  private readonly tokens = new Map<string, TokenState>();

  constructor(options: RollingMetricsEngineOptions = {}) {
    this.minSamplesForComplete = options.minSamplesForComplete ?? 3;
  }

  ingestFeedEvent(event: FeedEvent): RollingMetricsSnapshot | undefined {
    if (event.type === "token_created") {
      const mint = event.candidate.mint;
      const state = this.ensureState({
        firstSeenAt: event.candidate.firstSeenAt,
        mint,
        symbol: event.candidate.symbol
      });

      state.symbol = event.candidate.symbol;
      state.firstSeenAt = minIsoTimestamp(state.firstSeenAt, event.timestamp);

      return this.getMetrics(mint);
    }

    return this.ingestTradeEvent(event);
  }

  ingestTradeEvent(event: TokenTradeEvent): RollingMetricsSnapshot {
    const mint = getTradeMint(event);
    const timestampMs = parseTimestamp(event.timestamp);
    const stateInput: {
      firstSeenAt: string;
      mint: string;
      symbol?: string;
    } = {
      firstSeenAt: event.timestamp,
      mint
    };

    if (event.symbol) {
      stateInput.symbol = event.symbol;
    }

    const state = this.ensureState(stateInput);

    if (event.side === "unknown") {
      return this.buildSnapshot(state, timestampMs);
    }

    const sample = createTradeSample({
      mint,
      ...(event.confidence ? { confidence: event.confidence } : {}),
      ...(event.priceQuote !== undefined ? { priceQuote: event.priceQuote } : {}),
      ...(event.priceSol !== undefined ? { priceSol: event.priceSol } : {}),
      priceUsd: event.priceUsd,
      ...(event.quoteAsset ? { quoteAsset: event.quoteAsset } : {}),
      ...(event.quoteMint !== undefined ? { quoteMint: event.quoteMint } : {}),
      ...(event.reasonCodes ? { reasonCodes: event.reasonCodes } : {}),
      side: event.side,
      ...(event.symbol ? { symbol: event.symbol } : {}),
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      ...(event.trader ? { trader: event.trader } : {}),
      ...(event.usableForMetrics !== undefined
        ? { usableForMetrics: event.usableForMetrics }
        : {}),
      ...(event.volumeQuote !== undefined ? { volumeQuote: event.volumeQuote } : {}),
      ...(event.volumeSol !== undefined ? { volumeSol: event.volumeSol } : {}),
      volumeUsd: event.volumeUsd
    });

    if (event.symbol) {
      state.symbol = event.symbol;
    }

    if (!sample) {
      return this.buildSnapshot(state, timestampMs);
    }

    state.trades.push(sample);
    state.trades.sort((left, right) => left.timestampMs - right.timestampMs);
    state.firstSeenAt = minIsoTimestamp(state.firstSeenAt, sample.timestamp);
    this.pruneTrades(state, timestampMs);

    return this.buildSnapshot(state, timestampMs);
  }

  ingestTradeObservation(
    event: TradeObservationInput
  ): RollingMetricsSnapshot | undefined {
    const stateInput: {
      firstSeenAt: string;
      mint: string;
      symbol?: string;
    } = {
      firstSeenAt: event.timestamp,
      mint: event.mint
    };

    if (event.symbol) {
      stateInput.symbol = event.symbol;
    }

    const state = this.ensureState(stateInput);
    if (event.side === "unknown") {
      return this.getMetrics(state.mint);
    }

    const trade: TokenTradeEvent = {
      type: "trade",
      mint: event.mint,
      source: "solana_rpc",
      ...(event.symbol ? { symbol: event.symbol } : {}),
      token: {
        chain: "solana",
        mint: event.mint
      },
      side: event.side,
      priceUsd: event.priceUsd ?? null,
      volumeUsd: event.volumeUsd ?? null,
      ...(event.priceSol !== undefined ? { priceSol: event.priceSol } : {}),
      ...(event.volumeSol !== undefined ? { volumeSol: event.volumeSol } : {}),
      ...(event.priceQuote !== undefined ? { priceQuote: event.priceQuote } : {}),
      ...(event.volumeQuote !== undefined ? { volumeQuote: event.volumeQuote } : {}),
      ...(event.quoteAsset ? { quoteAsset: event.quoteAsset } : {}),
      ...(event.quoteMint !== undefined ? { quoteMint: event.quoteMint } : {}),
      tokenAmount:
        safeNonnegative(event.priceQuote) > 0
          ? safeNonnegative(event.volumeQuote) / safeNonnegative(event.priceQuote)
          : 0,
      ...(event.trader ? { trader: event.trader } : {}),
      metrics: {
        priceUsd: safeNonnegative(event.priceUsd),
        ...(event.priceSol !== undefined ? { priceSol: event.priceSol } : {}),
        ...(event.priceQuote !== undefined ? { priceQuote: event.priceQuote } : {}),
        marketCapUsd: 0,
        liquidityUsd: 0,
        volume1mUsd: safeNonnegative(event.volumeUsd),
        volume5mUsd: safeNonnegative(event.volumeUsd),
        volume15mUsd: safeNonnegative(event.volumeUsd),
        ...(event.volumeSol !== undefined ? { volumeSol: event.volumeSol } : {}),
        ...(event.volumeQuote !== undefined ? { volumeQuote: event.volumeQuote } : {}),
        ...(event.quoteAsset ? { quoteAsset: event.quoteAsset } : {}),
        ...(event.quoteMint !== undefined ? { quoteMint: event.quoteMint } : {}),
        ...(event.usableForMetrics !== undefined
          ? { usableForMetrics: event.usableForMetrics }
          : {}),
        ...(event.confidence ? { confidence: event.confidence } : {}),
        ...(event.reasonCodes ? { reasonCodes: event.reasonCodes } : {}),
        buyCount1m: event.side === "buy" ? 1 : 0,
        buyCount5m: event.side === "buy" ? 1 : 0,
        sellCount1m: event.side === "sell" ? 1 : 0,
        sellCount5m: event.side === "sell" ? 1 : 0,
        uniqueBuyers1m: event.side === "buy" ? 1 : 0,
        uniqueBuyers5m: event.side === "buy" ? 1 : 0,
        uniqueSellers1m: event.side === "sell" ? 1 : 0,
        uniqueSellers5m: event.side === "sell" ? 1 : 0,
        holderCount: 0,
        topHolderPercent: 0,
        top10HolderPercent: 0,
        priceChange1mPct: 0,
        priceChange5mPct: 0,
        volumeVelocity: 0,
        buyerVelocity: 0
      },
      metricsComplete: true,
      ...(event.usableForMetrics !== undefined
        ? { usableForMetrics: event.usableForMetrics }
        : {}),
      ...(event.confidence ? { confidence: event.confidence } : {}),
      ...(event.reasonCodes ? { reasonCodes: event.reasonCodes } : {}),
      receivedAt: event.timestamp,
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
      timestamp: event.timestamp
    };

    return this.ingestTradeEvent(trade);
  }

  getMetrics(mint: string): RollingMetricsSnapshot | undefined {
    const state = this.tokens.get(mint);

    if (!state) {
      return undefined;
    }

    const latestTimestampMs = latestReferenceTime(state);
    return this.buildSnapshot(state, latestTimestampMs);
  }

  getAllMetrics(): RollingMetricsSnapshot[] {
    return Array.from(this.tokens.values()).map((state) =>
      this.buildSnapshot(state, latestReferenceTime(state))
    );
  }

  resetMetrics(mint: string): void {
    this.tokens.delete(mint);
  }

  clear(): void {
    this.tokens.clear();
  }

  private ensureState(input: {
    firstSeenAt: string;
    mint: string;
    symbol?: string;
  }): TokenState {
    const existing = this.tokens.get(input.mint);

    if (existing) {
      if (input.symbol) {
        existing.symbol = input.symbol;
      }

      existing.firstSeenAt = minIsoTimestamp(existing.firstSeenAt, input.firstSeenAt);
      return existing;
    }

    const state: TokenState = {
      firstSeenAt: normalizeTimestamp(input.firstSeenAt),
      mint: input.mint,
      trades: []
    };

    if (input.symbol) {
      state.symbol = input.symbol;
    }

    this.tokens.set(input.mint, state);
    return state;
  }

  private pruneTrades(state: TokenState, referenceTimestampMs: number): void {
    const cutoff = referenceTimestampMs - 60_000;
    state.trades = state.trades.filter((trade) => trade.timestampMs >= cutoff);
  }

  private buildSnapshot(
    state: TokenState,
    referenceTimestampMs: number
  ): RollingMetricsSnapshot {
    this.pruneTrades(state, referenceTimestampMs);

    const windows = createWindowRecord((seconds) =>
      computeWindowMetrics(state.trades, referenceTimestampMs, seconds)
    );
    const priceChangePct = createWindowRecord(
      (_seconds, label) => windows[label].priceChangePct
    );
    const priceSolChangePct = createWindowRecord(
      (_seconds, label) => windows[label].priceSolChangePct ?? 0
    );
    const highPriceUsd = createWindowRecord(
      (_seconds, label) => windows[label].highPriceUsd
    );
    const lowPriceUsd = createWindowRecord(
      (_seconds, label) => windows[label].lowPriceUsd
    );
    const highPriceSol = createWindowRecord(
      (_seconds, label) => windows[label].highPriceSol ?? 0
    );
    const lowPriceSol = createWindowRecord(
      (_seconds, label) => windows[label].lowPriceSol ?? 0
    );
    const window5s = windows["5s"];
    const currentVolumeVelocity = window5s.totalVolumeUsd / 5;
    const previousVolumeVelocity =
      computeSegmentVolume(state.trades, referenceTimestampMs, 10, 5, "usd") / 5;
    const currentVolumeVelocitySol = (window5s.totalVolumeSol ?? 0) / 5;
    const previousVolumeVelocitySol =
      computeSegmentVolume(state.trades, referenceTimestampMs, 10, 5, "sol") / 5;
    const currentBuyerVelocity = window5s.uniqueBuyers / 5;
    const previousBuyerVelocity =
      computeSegmentUniqueBuyers(state.trades, referenceTimestampMs, 10, 5) / 5;
    const currentPriceVelocity = window5s.priceChangePct / 5;
    const previousPriceVelocity =
      computeSegmentPriceChange(state.trades, referenceTimestampMs, 10, 5, "usd") / 5;
    const currentPriceVelocitySol = (window5s.priceSolChangePct ?? 0) / 5;
    const previousPriceVelocitySol =
      computeSegmentPriceChange(state.trades, referenceTimestampMs, 10, 5, "sol") / 5;
    const sampleCount = state.trades.length;
    const largestTradeUsd = state.trades.reduce(
      (largest, trade) => Math.max(largest, trade.volumeUsd),
      0
    );
    const largestTradeSol = state.trades.reduce(
      (largest, trade) => Math.max(largest, trade.volumeSol),
      0
    );
    const totalVolume60s = windows["60s"].totalVolumeUsd;
    const totalVolume60sSol = windows["60s"].totalVolumeSol ?? 0;
    const latestTrade = state.trades.at(-1);
    const lastUpdatedAt = latestTrade?.timestamp ?? state.firstSeenAt;
    const hasUsdMetrics = state.trades.some(
      (trade) => trade.priceUsd > 0 && trade.volumeUsd > 0
    );
    const hasSolMetrics = state.trades.some(
      (trade) => trade.priceSol > 0 && trade.volumeSol > 0
    );
    const usedSolMetricsFallback = !hasUsdMetrics && hasSolMetrics;
    const effectiveLargestTrade = hasUsdMetrics ? largestTradeUsd : largestTradeSol;
    const effectiveTotalVolume60s = hasUsdMetrics
      ? totalVolume60s
      : totalVolume60sSol;

    const snapshot: RollingMetricsSnapshot = {
      mint: state.mint,
      windows,
      volumeVelocityUsdPerSec: roundMetric(currentVolumeVelocity),
      volumeAccelerationUsdPerSec2: roundMetric(
        (currentVolumeVelocity - previousVolumeVelocity) / 5
      ),
      volumeVelocitySolPerSec: roundMetric(currentVolumeVelocitySol),
      volumeAccelerationSolPerSec2: roundMetric(
        (currentVolumeVelocitySol - previousVolumeVelocitySol) / 5
      ),
      tradesPerSecond: roundMetric(window5s.totalTradeCount / 5),
      largestTradeUsd: roundMetric(largestTradeUsd),
      largestTradeSol: roundMetric(largestTradeSol),
      largestTradeShare: roundMetric(
        safeRatio(effectiveLargestTrade, effectiveTotalVolume60s)
      ),
      buyerVelocityPerSec: roundMetric(currentBuyerVelocity),
      buyerAccelerationPerSec2: roundMetric(
        (currentBuyerVelocity - previousBuyerVelocity) / 5
      ),
      latestPriceUsd: latestTrade?.priceUsd ?? 0,
      latestPriceSol: latestTrade?.priceSol ?? 0,
      priceChangePct,
      priceSolChangePct,
      priceVelocityPctPerSec: roundMetric(currentPriceVelocity),
      priceAccelerationPctPerSec2: roundMetric(
        (currentPriceVelocity - previousPriceVelocity) / 5
      ),
      priceSolVelocityPctPerSec: roundMetric(currentPriceVelocitySol),
      priceSolAccelerationPctPerSec2: roundMetric(
        (currentPriceVelocitySol - previousPriceVelocitySol) / 5
      ),
      highPriceUsd,
      lowPriceUsd,
      highPriceSol,
      lowPriceSol,
      buySellRatio: roundMetric(
        boundedRatio(
          hasUsdMetrics ? window5s.buyVolumeUsd : window5s.buyVolumeSol ?? 0,
          hasUsdMetrics ? window5s.sellVolumeUsd : window5s.sellVolumeSol ?? 0
        )
      ),
      netBuyPressure: roundMetric(
        (hasUsdMetrics ? window5s.totalVolumeUsd : window5s.totalVolumeSol ?? 0) > 0
          ? (hasUsdMetrics ? window5s.netVolumeUsd : window5s.netVolumeSol ?? 0) /
              (hasUsdMetrics ? window5s.totalVolumeUsd : window5s.totalVolumeSol ?? 0)
          : 0
      ),
      organicBuyerScore: roundMetric(
        computeOrganicBuyerScore(window5s, effectiveLargestTrade, hasUsdMetrics)
      ),
      hasUsdMetrics,
      hasSolMetrics,
      usedSolMetricsFallback,
      insufficientMetrics: sampleCount < this.minSamplesForComplete,
      sampleCount,
      firstSeenAt: state.firstSeenAt,
      lastUpdatedAt
    };

    if (state.symbol) {
      snapshot.symbol = state.symbol;
    }

    return snapshot;
  }
}

export function createRollingMetricsEngine(
  options: RollingMetricsEngineOptions = {}
): RollingMetricsEngine {
  return new RollingMetricsEngine(options);
}

export function createEmptyMetrics(
  mint: string,
  options: {
    firstSeenAt?: string;
    symbol?: string;
  } = {}
): RollingMetricsSnapshot {
  const firstSeenAt = normalizeTimestamp(
    options.firstSeenAt ?? "1970-01-01T00:00:00.000Z"
  );
  const windows = createWindowRecord(() => createEmptyWindowMetrics());
  const snapshot: RollingMetricsSnapshot = {
    mint,
    windows,
    volumeVelocityUsdPerSec: 0,
    volumeAccelerationUsdPerSec2: 0,
    volumeVelocitySolPerSec: 0,
    volumeAccelerationSolPerSec2: 0,
    tradesPerSecond: 0,
    largestTradeUsd: 0,
    largestTradeSol: 0,
    largestTradeShare: 0,
    buyerVelocityPerSec: 0,
    buyerAccelerationPerSec2: 0,
    latestPriceUsd: 0,
    latestPriceSol: 0,
    priceChangePct: createWindowRecord(() => 0),
    priceSolChangePct: createWindowRecord(() => 0),
    priceVelocityPctPerSec: 0,
    priceAccelerationPctPerSec2: 0,
    priceSolVelocityPctPerSec: 0,
    priceSolAccelerationPctPerSec2: 0,
    highPriceUsd: createWindowRecord(() => 0),
    lowPriceUsd: createWindowRecord(() => 0),
    highPriceSol: createWindowRecord(() => 0),
    lowPriceSol: createWindowRecord(() => 0),
    buySellRatio: 1,
    netBuyPressure: 0,
    organicBuyerScore: 0,
    hasUsdMetrics: false,
    hasSolMetrics: false,
    usedSolMetricsFallback: false,
    insufficientMetrics: true,
    sampleCount: 0,
    firstSeenAt,
    lastUpdatedAt: firstSeenAt
  };

  if (options.symbol) {
    snapshot.symbol = options.symbol;
  }

  return snapshot;
}

function computeWindowMetrics(
  trades: TradeSample[],
  referenceTimestampMs: number,
  seconds: MetricWindowSeconds
): RollingWindowMetrics {
  const windowTrades = filterWindow(trades, referenceTimestampMs, seconds);
  const buyerSet = new Set<string>();
  const sellerSet = new Set<string>();
  const traderSet = new Set<string>();
  let buyVolumeUsd = 0;
  let sellVolumeUsd = 0;
  let buyVolumeSol = 0;
  let sellVolumeSol = 0;
  let buyTradeCount = 0;
  let sellTradeCount = 0;
  let highPriceUsd = 0;
  let lowPriceUsd = 0;
  let highPriceSol = 0;
  let lowPriceSol = 0;

  for (const trade of windowTrades) {
    const effectiveVolume =
      trade.volumeUsd > 0 ? trade.volumeUsd : trade.volumeSol;
    const traderId =
      trade.trader ?? `${trade.side}:${trade.timestamp}:${effectiveVolume}`;
    traderSet.add(traderId);

    if (trade.side === "buy") {
      buyVolumeUsd += trade.volumeUsd;
      buyVolumeSol += trade.volumeSol;
      buyTradeCount += 1;
      buyerSet.add(traderId);
    } else {
      sellVolumeUsd += trade.volumeUsd;
      sellVolumeSol += trade.volumeSol;
      sellTradeCount += 1;
      sellerSet.add(traderId);
    }

    if (trade.priceUsd > 0) {
      highPriceUsd = Math.max(highPriceUsd, trade.priceUsd);
      lowPriceUsd =
        lowPriceUsd === 0 ? trade.priceUsd : Math.min(lowPriceUsd, trade.priceUsd);
    }

    if (trade.priceSol > 0) {
      highPriceSol = Math.max(highPriceSol, trade.priceSol);
      lowPriceSol =
        lowPriceSol === 0 ? trade.priceSol : Math.min(lowPriceSol, trade.priceSol);
    }
  }

  const totalVolumeUsd = buyVolumeUsd + sellVolumeUsd;
  const totalVolumeSol = buyVolumeSol + sellVolumeSol;

  return {
    buyVolumeUsd: roundMetric(buyVolumeUsd),
    sellVolumeUsd: roundMetric(sellVolumeUsd),
    totalVolumeUsd: roundMetric(totalVolumeUsd),
    netVolumeUsd: roundMetric(buyVolumeUsd - sellVolumeUsd),
    buyVolumeSol: roundMetric(buyVolumeSol),
    sellVolumeSol: roundMetric(sellVolumeSol),
    totalVolumeSol: roundMetric(totalVolumeSol),
    netVolumeSol: roundMetric(buyVolumeSol - sellVolumeSol),
    buyTradeCount,
    sellTradeCount,
    totalTradeCount: buyTradeCount + sellTradeCount,
    uniqueBuyers: buyerSet.size,
    uniqueSellers: sellerSet.size,
    uniqueTraders: traderSet.size,
    priceChangePct: roundMetric(computePriceChangePct(windowTrades, "usd")),
    priceSolChangePct: roundMetric(computePriceChangePct(windowTrades, "sol")),
    highPriceUsd: roundMetric(highPriceUsd),
    lowPriceUsd: roundMetric(lowPriceUsd),
    highPriceSol: roundMetric(highPriceSol),
    lowPriceSol: roundMetric(lowPriceSol)
  };
}

function computeSegmentVolume(
  trades: TradeSample[],
  referenceTimestampMs: number,
  olderSeconds: number,
  newerSeconds: number,
  currency: "usd" | "sol"
): number {
  return trades
    .filter((trade) => isInSegment(trade, referenceTimestampMs, olderSeconds, newerSeconds))
    .reduce(
      (total, trade) =>
        total + (currency === "usd" ? trade.volumeUsd : trade.volumeSol),
      0
    );
}

function computeSegmentUniqueBuyers(
  trades: TradeSample[],
  referenceTimestampMs: number,
  olderSeconds: number,
  newerSeconds: number
): number {
  const buyers = new Set<string>();

  for (const trade of trades) {
    if (
      trade.side === "buy" &&
      isInSegment(trade, referenceTimestampMs, olderSeconds, newerSeconds)
    ) {
      buyers.add(trade.trader ?? `${trade.timestamp}:${trade.volumeUsd}`);
    }
  }

  return buyers.size;
}

function computeSegmentPriceChange(
  trades: TradeSample[],
  referenceTimestampMs: number,
  olderSeconds: number,
  newerSeconds: number,
  currency: "usd" | "sol"
): number {
  return computePriceChangePct(
    trades.filter((trade) =>
      isInSegment(trade, referenceTimestampMs, olderSeconds, newerSeconds)
    ),
    currency
  );
}

function computePriceChangePct(
  trades: TradeSample[],
  currency: "usd" | "sol"
): number {
  const pricedTrades = trades.filter((trade) =>
    currency === "usd" ? trade.priceUsd > 0 : trade.priceSol > 0
  );
  const first = pricedTrades[0];
  const last = pricedTrades.at(-1);

  if (!first || !last) {
    return 0;
  }

  const firstPrice = currency === "usd" ? first.priceUsd : first.priceSol;
  const lastPrice = currency === "usd" ? last.priceUsd : last.priceSol;

  if (firstPrice <= 0) {
    return 0;
  }

  return ((lastPrice - firstPrice) / firstPrice) * 100;
}

function computeOrganicBuyerScore(
  windowMetrics: RollingWindowMetrics,
  largestTrade: number,
  useUsd: boolean
): number {
  if (windowMetrics.totalTradeCount === 0) {
    return 0;
  }

  const totalVolume = useUsd
    ? windowMetrics.totalVolumeUsd
    : windowMetrics.totalVolumeSol ?? 0;
  const traderDiversity =
    windowMetrics.uniqueTraders / Math.max(windowMetrics.totalTradeCount, 1);
  const largestTradePenalty = 1 - safeRatio(largestTrade, totalVolume);
  const buyerMix =
    windowMetrics.uniqueBuyers /
    Math.max(windowMetrics.uniqueBuyers + windowMetrics.uniqueSellers, 1);

  return clamp((traderDiversity * 0.4 + largestTradePenalty * 0.3 + buyerMix * 0.3) * 100, 0, 100);
}

function filterWindow(
  trades: TradeSample[],
  referenceTimestampMs: number,
  seconds: number
): TradeSample[] {
  const cutoff = referenceTimestampMs - seconds * 1000;
  return trades.filter(
    (trade) => trade.timestampMs > cutoff && trade.timestampMs <= referenceTimestampMs
  );
}

function isInSegment(
  trade: TradeSample,
  referenceTimestampMs: number,
  olderSeconds: number,
  newerSeconds: number
): boolean {
  const olderCutoff = referenceTimestampMs - olderSeconds * 1000;
  const newerCutoff = referenceTimestampMs - newerSeconds * 1000;
  return trade.timestampMs > olderCutoff && trade.timestampMs <= newerCutoff;
}

function createWindowRecord<T>(
  createValue: (seconds: MetricWindowSeconds, label: MetricWindow) => T
): Record<MetricWindow, T> {
  return metricWindows.reduce(
    (record, seconds, index) => {
      const label = metricWindowLabels[index];

      if (!label) {
        return record;
      }

      record[label] = createValue(seconds, label);
      return record;
    },
    {} as Record<MetricWindow, T>
  );
}

function createEmptyWindowMetrics(): RollingWindowMetrics {
  return {
    buyVolumeUsd: 0,
    sellVolumeUsd: 0,
    totalVolumeUsd: 0,
    netVolumeUsd: 0,
    buyVolumeSol: 0,
    sellVolumeSol: 0,
    totalVolumeSol: 0,
    netVolumeSol: 0,
    buyTradeCount: 0,
    sellTradeCount: 0,
    totalTradeCount: 0,
    uniqueBuyers: 0,
    uniqueSellers: 0,
    uniqueTraders: 0,
    priceChangePct: 0,
    priceSolChangePct: 0,
    highPriceUsd: 0,
    lowPriceUsd: 0,
    highPriceSol: 0,
    lowPriceSol: 0
  };
}

function createTradeSample(input: {
  confidence?: ObservationConfidence;
  mint: string;
  priceQuote?: number | null;
  priceSol?: number | null;
  priceUsd?: number | null;
  quoteAsset?: QuoteAsset;
  quoteMint?: string | null;
  reasonCodes?: string[];
  side: "buy" | "sell";
  symbol?: string;
  timestamp: string;
  timestampMs: number;
  trader?: string;
  usableForMetrics?: boolean;
  volumeQuote?: number | null;
  volumeSol?: number | null;
  volumeUsd?: number | null;
}): TradeSample | null {
  const priceUsd = safeNonnegative(input.priceUsd);
  const volumeUsd = safeNonnegative(input.volumeUsd);
  const priceSol = safeNonnegative(
    input.priceSol ??
      (input.quoteAsset === "SOL" || input.quoteAsset === "WSOL"
        ? input.priceQuote
        : null)
  );
  const volumeSol = safeNonnegative(
    input.volumeSol ??
      (input.quoteAsset === "SOL" || input.quoteAsset === "WSOL"
        ? input.volumeQuote
        : null)
  );
  const priceQuote = safeNonnegative(input.priceQuote);
  const volumeQuote = safeNonnegative(input.volumeQuote);
  const hasUsdPair = priceUsd > 0 && volumeUsd > 0;
  const hasSolPair = priceSol > 0 && volumeSol > 0;
  const hasQuotePair = priceQuote > 0 && volumeQuote > 0;

  if (
    input.usableForMetrics === false ||
    (!hasUsdPair && !hasSolPair && !hasQuotePair)
  ) {
    return null;
  }

  const sample: TradeSample = {
    mint: input.mint,
    side: input.side,
    priceUsd: hasUsdPair ? priceUsd : 0,
    priceSol: hasSolPair ? priceSol : 0,
    priceQuote: hasQuotePair ? priceQuote : 0,
    timestamp: input.timestamp,
    timestampMs: input.timestampMs,
    volumeUsd: hasUsdPair ? volumeUsd : 0,
    volumeSol: hasSolPair ? volumeSol : 0,
    volumeQuote: hasQuotePair ? volumeQuote : 0
  };

  if (input.symbol) {
    sample.symbol = input.symbol;
  }

  if (input.trader) {
    sample.trader = input.trader;
  }

  if (input.quoteAsset) {
    sample.quoteAsset = input.quoteAsset;
  }

  if (input.quoteMint !== undefined) {
    sample.quoteMint = input.quoteMint;
  }

  if (input.usableForMetrics !== undefined) {
    sample.usableForMetrics = input.usableForMetrics;
  }

  if (input.confidence) {
    sample.confidence = input.confidence;
  }

  if (input.reasonCodes) {
    sample.reasonCodes = input.reasonCodes;
  }

  return sample;
}

function getTradeMint(event: TokenTradeEvent): string {
  return event.mint ?? event.token.mint;
}

function latestReferenceTime(state: TokenState): number {
  const latestTrade = state.trades.at(-1);
  return latestTrade?.timestampMs ?? parseTimestamp(state.firstSeenAt);
}

function parseTimestamp(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTimestamp(timestamp: string): string {
  return new Date(parseTimestamp(timestamp)).toISOString();
}

function minIsoTimestamp(left: string, right: string): string {
  return new Date(Math.min(parseTimestamp(left), parseTimestamp(right))).toISOString();
}

function boundedRatio(numerator: number, denominator: number): number {
  if (numerator === 0 && denominator === 0) {
    return 1;
  }

  return clamp(numerator / Math.max(denominator, 1), 0, 50);
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? clamp(numerator / denominator, 0, 1) : 0;
}

function safeNonnegative(value: number | null | undefined): number {
  return value !== null && value !== undefined && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(8));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
