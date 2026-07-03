import type { FeedEvent, TokenTradeEvent } from "@axi/data-feeds";
import type {
  MetricWindow,
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
  timestamp: string;
  trader?: string | null;
  volumeUsd?: number | null;
};

type TradeSample = {
  mint: string;
  symbol?: string;
  side: "buy" | "sell";
  priceUsd: number;
  timestamp: string;
  timestampMs: number;
  trader?: string;
  volumeUsd: number;
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
    const sample: TradeSample = {
      mint,
      side: event.side,
      priceUsd: safeNonnegative(event.priceUsd),
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      volumeUsd: safeNonnegative(event.volumeUsd)
    };

    if (event.symbol) {
      sample.symbol = event.symbol;
      state.symbol = event.symbol;
    }

    if (event.trader) {
      sample.trader = event.trader;
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
    const priceUsd = event.priceUsd;
    const volumeUsd = event.volumeUsd;

    if (
      event.side === "unknown" ||
      priceUsd === null ||
      priceUsd === undefined ||
      volumeUsd === null ||
      volumeUsd === undefined ||
      !Number.isFinite(priceUsd) ||
      !Number.isFinite(volumeUsd)
    ) {
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
      priceUsd,
      volumeUsd,
      tokenAmount: priceUsd > 0 ? volumeUsd / priceUsd : 0,
      ...(event.trader ? { trader: event.trader } : {}),
      metrics: {
        priceUsd,
        marketCapUsd: 0,
        liquidityUsd: 0,
        volume1mUsd: volumeUsd,
        volume5mUsd: volumeUsd,
        volume15mUsd: volumeUsd,
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
    const highPriceUsd = createWindowRecord(
      (_seconds, label) => windows[label].highPriceUsd
    );
    const lowPriceUsd = createWindowRecord(
      (_seconds, label) => windows[label].lowPriceUsd
    );
    const window5s = windows["5s"];
    const currentVolumeVelocity = window5s.totalVolumeUsd / 5;
    const previousVolumeVelocity =
      computeSegmentVolume(state.trades, referenceTimestampMs, 10, 5) / 5;
    const currentBuyerVelocity = window5s.uniqueBuyers / 5;
    const previousBuyerVelocity =
      computeSegmentUniqueBuyers(state.trades, referenceTimestampMs, 10, 5) / 5;
    const currentPriceVelocity = window5s.priceChangePct / 5;
    const previousPriceVelocity =
      computeSegmentPriceChange(state.trades, referenceTimestampMs, 10, 5) / 5;
    const sampleCount = state.trades.length;
    const largestTradeUsd = state.trades.reduce(
      (largest, trade) => Math.max(largest, trade.volumeUsd),
      0
    );
    const totalVolume60s = windows["60s"].totalVolumeUsd;
    const latestTrade = state.trades.at(-1);
    const lastUpdatedAt = latestTrade?.timestamp ?? state.firstSeenAt;

    const snapshot: RollingMetricsSnapshot = {
      mint: state.mint,
      windows,
      volumeVelocityUsdPerSec: roundMetric(currentVolumeVelocity),
      volumeAccelerationUsdPerSec2: roundMetric(
        (currentVolumeVelocity - previousVolumeVelocity) / 5
      ),
      tradesPerSecond: roundMetric(window5s.totalTradeCount / 5),
      largestTradeUsd: roundMetric(largestTradeUsd),
      largestTradeShare: roundMetric(safeRatio(largestTradeUsd, totalVolume60s)),
      buyerVelocityPerSec: roundMetric(currentBuyerVelocity),
      buyerAccelerationPerSec2: roundMetric(
        (currentBuyerVelocity - previousBuyerVelocity) / 5
      ),
      latestPriceUsd: latestTrade?.priceUsd ?? 0,
      priceChangePct,
      priceVelocityPctPerSec: roundMetric(currentPriceVelocity),
      priceAccelerationPctPerSec2: roundMetric(
        (currentPriceVelocity - previousPriceVelocity) / 5
      ),
      highPriceUsd,
      lowPriceUsd,
      buySellRatio: roundMetric(
        boundedRatio(window5s.buyVolumeUsd, window5s.sellVolumeUsd)
      ),
      netBuyPressure: roundMetric(
        window5s.totalVolumeUsd > 0
          ? window5s.netVolumeUsd / window5s.totalVolumeUsd
          : 0
      ),
      organicBuyerScore: roundMetric(computeOrganicBuyerScore(window5s, largestTradeUsd)),
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
    tradesPerSecond: 0,
    largestTradeUsd: 0,
    largestTradeShare: 0,
    buyerVelocityPerSec: 0,
    buyerAccelerationPerSec2: 0,
    latestPriceUsd: 0,
    priceChangePct: createWindowRecord(() => 0),
    priceVelocityPctPerSec: 0,
    priceAccelerationPctPerSec2: 0,
    highPriceUsd: createWindowRecord(() => 0),
    lowPriceUsd: createWindowRecord(() => 0),
    buySellRatio: 1,
    netBuyPressure: 0,
    organicBuyerScore: 0,
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
  let buyTradeCount = 0;
  let sellTradeCount = 0;
  let highPriceUsd = 0;
  let lowPriceUsd = 0;

  for (const trade of windowTrades) {
    const traderId = trade.trader ?? `${trade.side}:${trade.timestamp}:${trade.volumeUsd}`;
    traderSet.add(traderId);

    if (trade.side === "buy") {
      buyVolumeUsd += trade.volumeUsd;
      buyTradeCount += 1;
      buyerSet.add(traderId);
    } else {
      sellVolumeUsd += trade.volumeUsd;
      sellTradeCount += 1;
      sellerSet.add(traderId);
    }

    highPriceUsd = Math.max(highPriceUsd, trade.priceUsd);
    lowPriceUsd = lowPriceUsd === 0 ? trade.priceUsd : Math.min(lowPriceUsd, trade.priceUsd);
  }

  const totalVolumeUsd = buyVolumeUsd + sellVolumeUsd;

  return {
    buyVolumeUsd: roundMetric(buyVolumeUsd),
    sellVolumeUsd: roundMetric(sellVolumeUsd),
    totalVolumeUsd: roundMetric(totalVolumeUsd),
    netVolumeUsd: roundMetric(buyVolumeUsd - sellVolumeUsd),
    buyTradeCount,
    sellTradeCount,
    totalTradeCount: buyTradeCount + sellTradeCount,
    uniqueBuyers: buyerSet.size,
    uniqueSellers: sellerSet.size,
    uniqueTraders: traderSet.size,
    priceChangePct: roundMetric(computePriceChangePct(windowTrades)),
    highPriceUsd: roundMetric(highPriceUsd),
    lowPriceUsd: roundMetric(lowPriceUsd)
  };
}

function computeSegmentVolume(
  trades: TradeSample[],
  referenceTimestampMs: number,
  olderSeconds: number,
  newerSeconds: number
): number {
  return trades
    .filter((trade) => isInSegment(trade, referenceTimestampMs, olderSeconds, newerSeconds))
    .reduce((total, trade) => total + trade.volumeUsd, 0);
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
  newerSeconds: number
): number {
  return computePriceChangePct(
    trades.filter((trade) =>
      isInSegment(trade, referenceTimestampMs, olderSeconds, newerSeconds)
    )
  );
}

function computePriceChangePct(trades: TradeSample[]): number {
  const first = trades[0];
  const last = trades.at(-1);

  if (!first || !last || first.priceUsd <= 0) {
    return 0;
  }

  return ((last.priceUsd - first.priceUsd) / first.priceUsd) * 100;
}

function computeOrganicBuyerScore(
  windowMetrics: RollingWindowMetrics,
  largestTradeUsd: number
): number {
  if (windowMetrics.totalTradeCount === 0) {
    return 0;
  }

  const traderDiversity =
    windowMetrics.uniqueTraders / Math.max(windowMetrics.totalTradeCount, 1);
  const largestTradePenalty = 1 - safeRatio(largestTradeUsd, windowMetrics.totalVolumeUsd);
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
    buyTradeCount: 0,
    sellTradeCount: 0,
    totalTradeCount: 0,
    uniqueBuyers: 0,
    uniqueSellers: 0,
    uniqueTraders: 0,
    priceChangePct: 0,
    highPriceUsd: 0,
    lowPriceUsd: 0
  };
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

function safeNonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
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
