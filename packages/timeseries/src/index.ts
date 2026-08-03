import {
  getEventTimestamp,
  isTradeUsableForMetrics,
  type NormalizedTokenTradeEvent
} from "@axi/indexer-core";
import {
  computeCanonicalDerivatives,
  type CanonicalDerivativeSnapshot
} from "@axi/derivatives";

export const canonicalBucketMs = 1_000 as const;
export const defaultTimeseriesRetentionMs = 300_000 as const;
export const tradeWindowMs = [
  1_000, 5_000, 10_000, 30_000, 60_000, 120_000, 300_000
] as const;
export type TradeWindowMs = (typeof tradeWindowMs)[number];
export type TradeWindowLabel =
  "1s" | "5s" | "10s" | "30s" | "60s" | "2m" | "5m";

export type Ohlcv = {
  openSol: number | null;
  highSol: number | null;
  lowSol: number | null;
  closeSol: number | null;
  volumeSol: number;
  buyVolumeSol: number;
  sellVolumeSol: number;
  netVolumeSol: number;
  buySellRatio: number | null;
  netBuyPressure: number | null;
  vwapSol: number | null;
  openUsd: number | null;
  highUsd: number | null;
  lowUsd: number | null;
  closeUsd: number | null;
  volumeUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  vwapUsd: number | null;
  tokenVolume: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  uniqueBuyers: number;
  uniqueSellers: number;
};

export type RollingStats = {
  method: "event_time_finite_difference";
  windowMs: 5_000;
  evaluatedAt: string | null;
  sampleCount: number;
  distinctTimestampCount: number;
  priceVelocityPctPerSec: number | null;
  priceAccelerationPctPerSec2: number | null;
  priceSource: "SOL" | "USD" | "unavailable";
  priceSolVelocityPerSec: number | null;
  priceSolAccelerationPerSec2: number | null;
  volumeVelocitySolPerSec: number | null;
  volumeAccelerationSolPerSec2: number | null;
  volumeVelocityUsdPerSec: number | null;
  volumeAccelerationUsdPerSec2: number | null;
  buyerVelocityPerSec: number | null;
  buyerAccelerationPerSec2: number | null;
  tradeVelocityPerSec: number | null;
  tradeAccelerationPerSec2: number | null;
  buyPressureVelocityPerSec: number | null;
  buyPressureAccelerationPerSec2: number | null;
  reasonCodes: string[];
};

export type TradeBucket1s = Ohlcv & {
  schemaVersion: 1;
  bucketMs: typeof canonicalBucketMs;
  mint: string;
  bucketStart: string;
  bucketEnd: string;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  sourceCount: number;
  sourceEventCount: number;
  duplicateExcludedCount: number;
  lateEventCount: number;
  sources: string[];
  confidence: "low" | "medium" | "high";
  complete: boolean;
  synthetic: boolean;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type TradeTimeseriesStatus = {
  implemented: true;
  canonical: true;
  bucketMs: typeof canonicalBucketMs;
  retentionMs: number;
  bucketCapacityPerMint: number;
  mintCount: number;
  bucketCount: number;
  acceptedEventCount: number;
  duplicateEventCount: number;
  invalidEventCount: number;
  lateEventCount: number;
  prunedBucketCount: number;
  derivativeReadyMintCount: number;
  accelerationReadyMintCount: number;
  derivativeMethod: "event_time_finite_difference";
  earliestBucketStart: string | null;
  latestBucketStart: string | null;
  lastEventAt: string | null;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type TradeTimeseriesSeries = {
  mint: string;
  bucketMs: typeof canonicalBucketMs;
  retentionMs: number;
  actualBucketCount: number;
  gapBucketCount: number;
  available: boolean;
  transactionCount: number | null;
  buckets: TradeBucket1s[];
  windows: Record<TradeWindowLabel, Ohlcv>;
  rollingStats: RollingStats;
  derivatives: CanonicalDerivativeSnapshot;
  status: TradeTimeseriesStatus;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type TradeIngestResult = {
  accepted: boolean;
  action: "accepted" | "duplicate" | "rejected_invalid" | "rejected_late";
  eventId: string;
  mint: string;
  bucket: TradeBucket1s | null;
  reasonCodes: string[];
};

export type TradeBucketQuery = {
  fillGaps?: boolean;
  limit?: number;
};

export type TradeTimeseries = {
  clear: () => void;
  getBuckets: (mint: string, query?: TradeBucketQuery) => TradeBucket1s[];
  getDerivatives: (mint: string) => CanonicalDerivativeSnapshot;
  getOhlcv: (mint: string, windowMs: TradeWindowMs | number) => Ohlcv;
  getRollingStats: (mint: string) => RollingStats;
  getSeries: (mint: string, query?: TradeBucketQuery) => TradeTimeseriesSeries;
  getStatus: (mint?: string) => TradeTimeseriesStatus;
  getWindows: (mint: string) => Record<TradeWindowLabel, Ohlcv>;
  ingestTrade: (event: NormalizedTokenTradeEvent) => boolean;
  ingestTradeWithResult: (
    event: NormalizedTokenTradeEvent
  ) => TradeIngestResult;
  trackMint: (mint: string) => void;
};

export type TradeTimeseriesOptions = {
  retentionMs?: number;
  onBucketUpdated?: (bucket: TradeBucket1s) => void;
};

type TradeSample = {
  id: string;
  mint: string;
  side: "buy" | "sell";
  trader: string | null;
  source: string;
  confidence: "low" | "medium" | "high";
  priceSol: number | null;
  priceUsd: number | null;
  volumeSol: number | null;
  volumeUsd: number | null;
  tokenAmount: number | null;
  timestampMs: number;
  reasonCodes: string[];
};

type TokenTimeseriesState = {
  buckets: Map<number, TradeSample[]>;
  duplicateExcludedCounts: Map<number, number>;
  lateEventCounts: Map<number, number>;
  eventTimestamps: Map<string, number>;
  maxTimestampMs: number;
};

export function createTradeTimeseries(
  options: TradeTimeseriesOptions = {}
): TradeTimeseries {
  const retentionMs = normalizeRetentionMs(options.retentionMs);
  const bucketCapacityPerMint = Math.ceil(retentionMs / canonicalBucketMs);
  const states = new Map<string, TokenTimeseriesState>();
  let acceptedEventCount = 0;
  let duplicateEventCount = 0;
  let invalidEventCount = 0;
  let lateEventCount = 0;
  let prunedBucketCount = 0;
  let lastEventAt: string | null = null;

  function clear(): void {
    states.clear();
    acceptedEventCount = 0;
    duplicateEventCount = 0;
    invalidEventCount = 0;
    lateEventCount = 0;
    prunedBucketCount = 0;
    lastEventAt = null;
  }

  function ingestTrade(event: NormalizedTokenTradeEvent): boolean {
    return ingestTradeWithResult(event).accepted;
  }

  function ingestTradeWithResult(
    event: NormalizedTokenTradeEvent
  ): TradeIngestResult {
    const sample = normalizeSample(event);

    if (!sample) {
      invalidEventCount += 1;
      return ingestResult(event, "rejected_invalid", null, [
        "TIMESERIES_EVENT_REJECTED_INVALID"
      ]);
    }

    const state = states.get(sample.mint) ?? createTokenState();
    const existingTimestamp = state.eventTimestamps.get(sample.id);

    if (existingTimestamp !== undefined) {
      duplicateEventCount += 1;
      const existingBucketStart = toBucketStart(existingTimestamp);
      state.duplicateExcludedCounts.set(
        existingBucketStart,
        (state.duplicateExcludedCounts.get(existingBucketStart) ?? 0) + 1
      );
      const existingSamples = state.buckets.get(existingBucketStart) ?? [];
      if (existingSamples.length > 0) {
        options.onBucketUpdated?.(
          buildActualBucket(
            sample.mint,
            existingBucketStart,
            existingSamples,
            getLatestBucketStart(state),
            state.duplicateExcludedCounts.get(existingBucketStart) ?? 0,
            state.lateEventCounts.get(existingBucketStart) ?? 0
          )
        );
      }
      return ingestResult(event, "duplicate", null, [
        "TIMESERIES_EVENT_DUPLICATE"
      ]);
    }

    const sampleBucketStart = toBucketStart(sample.timestampMs);
    const previousLatestBucketStart =
      state.buckets.size > 0 ? getLatestBucketStart(state) : null;
    const previousBucketToClose =
      previousLatestBucketStart !== null &&
      sampleBucketStart > previousLatestBucketStart
        ? buildActualBucket(
            sample.mint,
            previousLatestBucketStart,
            state.buckets.get(previousLatestBucketStart) ?? [],
            sampleBucketStart
          )
        : null;
    const nextMaxTimestampMs = Math.max(
      state.maxTimestampMs,
      sample.timestampMs
    );
    const earliestRetainedBucketStart = getEarliestRetainedBucketStart(
      nextMaxTimestampMs,
      bucketCapacityPerMint
    );

    if (sampleBucketStart < earliestRetainedBucketStart) {
      lateEventCount += 1;
      return ingestResult(event, "rejected_late", null, [
        "TIMESERIES_EVENT_OUTSIDE_RETENTION"
      ]);
    }

    const acceptedLate =
      Number.isFinite(state.maxTimestampMs) &&
      sample.timestampMs < state.maxTimestampMs;
    if (acceptedLate) {
      lateEventCount += 1;
      state.lateEventCounts.set(
        sampleBucketStart,
        (state.lateEventCounts.get(sampleBucketStart) ?? 0) + 1
      );
    }

    state.maxTimestampMs = nextMaxTimestampMs;
    state.eventTimestamps.set(sample.id, sample.timestampMs);
    const bucketSamples = state.buckets.get(sampleBucketStart) ?? [];
    bucketSamples.push(sample);
    bucketSamples.sort(compareSamples);
    state.buckets.set(sampleBucketStart, bucketSamples);
    states.set(sample.mint, state);
    prunedBucketCount += pruneState(state, earliestRetainedBucketStart);
    acceptedEventCount += 1;
    lastEventAt = maxIso(
      lastEventAt,
      new Date(sample.timestampMs).toISOString()
    );

    const bucket = buildActualBucket(
      sample.mint,
      sampleBucketStart,
      bucketSamples,
      getLatestBucketStart(state),
      state.duplicateExcludedCounts.get(sampleBucketStart) ?? 0,
      state.lateEventCounts.get(sampleBucketStart) ?? 0
    );

    if (previousBucketToClose && previousBucketToClose.tradeCount > 0) {
      options.onBucketUpdated?.(previousBucketToClose);
    }

    options.onBucketUpdated?.(bucket);

    return ingestResult(event, "accepted", bucket, [
      "TIMESERIES_EVENT_ACCEPTED",
      "TIMESERIES_BUCKET_UPDATED",
      ...(acceptedLate ? ["TIMESERIES_LATE_EVENT_ACCEPTED_WITH_EVIDENCE"] : [])
    ]);
  }

  function getBuckets(
    mint: string,
    query: TradeBucketQuery = {}
  ): TradeBucket1s[] {
    const normalizedMint = mint.trim();
    const state = states.get(normalizedMint);

    if (!state || state.buckets.size === 0) {
      return [];
    }

    const limit = normalizeLimit(query.limit, bucketCapacityPerMint);
    const starts = Array.from(state.buckets.keys()).sort(
      (left, right) => left - right
    );
    const latestBucketStart = starts.at(-1);

    if (latestBucketStart === undefined) {
      return [];
    }

    if (query.fillGaps !== true) {
      return starts
        .slice(-limit)
        .map((start) =>
          buildActualBucket(
            normalizedMint,
            start,
            state.buckets.get(start) ?? [],
            latestBucketStart,
            state.duplicateExcludedCounts.get(start) ?? 0,
            state.lateEventCounts.get(start) ?? 0
          )
        );
    }

    const earliestActualStart = starts[0] ?? latestBucketStart;
    const firstBucketStart = Math.max(
      earliestActualStart,
      latestBucketStart - (limit - 1) * canonicalBucketMs
    );
    let carrySol = getCarryPrice(state, firstBucketStart, "SOL");
    let carryUsd = getCarryPrice(state, firstBucketStart, "USD");
    const buckets: TradeBucket1s[] = [];

    for (
      let start = firstBucketStart;
      start <= latestBucketStart;
      start += canonicalBucketMs
    ) {
      const samples = state.buckets.get(start);

      if (samples && samples.length > 0) {
        const bucket = buildActualBucket(
          normalizedMint,
          start,
          samples,
          latestBucketStart,
          state.duplicateExcludedCounts.get(start) ?? 0,
          state.lateEventCounts.get(start) ?? 0
        );
        carrySol = bucket.closeSol ?? carrySol;
        carryUsd = bucket.closeUsd ?? carryUsd;
        buckets.push(bucket);
      } else {
        buckets.push(
          buildSyntheticBucket(
            normalizedMint,
            start,
            carrySol,
            carryUsd,
            latestBucketStart
          )
        );
      }
    }

    return buckets;
  }

  function getOhlcv(mint: string, windowMs: TradeWindowMs | number): Ohlcv {
    const state = states.get(mint.trim());

    if (!state || state.buckets.size === 0) {
      return emptyOhlcv();
    }

    const latestBucketStart = getLatestBucketStart(state);
    const bucketCount = Math.max(
      1,
      Math.ceil(normalizeWindowMs(windowMs) / canonicalBucketMs)
    );
    return computeBucketRangeOhlcv(state, latestBucketStart, bucketCount, 0);
  }

  function getWindows(mint: string): Record<TradeWindowLabel, Ohlcv> {
    return {
      "1s": getOhlcv(mint, 1_000),
      "5s": getOhlcv(mint, 5_000),
      "10s": getOhlcv(mint, 10_000),
      "30s": getOhlcv(mint, 30_000),
      "60s": getOhlcv(mint, 60_000),
      "2m": getOhlcv(mint, 120_000),
      "5m": getOhlcv(mint, 300_000)
    };
  }

  function getRollingStats(mint: string): RollingStats {
    const snapshot = getDerivatives(mint);
    const window = snapshot.primary;
    const metrics = window.metrics;

    return {
      method: snapshot.method,
      windowMs: 5_000,
      evaluatedAt: snapshot.evaluatedAt,
      sampleCount: window.observationCount,
      distinctTimestampCount: window.distinctTimestampCount,
      priceVelocityPctPerSec: metrics.priceVelocityPctPerSec.value,
      priceAccelerationPctPerSec2: metrics.priceAccelerationPctPerSec2.value,
      priceSource: window.priceSource,
      priceSolVelocityPerSec: metrics.priceSolVelocityPerSec.value,
      priceSolAccelerationPerSec2: metrics.priceSolAccelerationPerSec2.value,
      volumeVelocitySolPerSec: metrics.volumeVelocitySolPerSec.value,
      volumeAccelerationSolPerSec2: metrics.volumeAccelerationSolPerSec2.value,
      volumeVelocityUsdPerSec: metrics.volumeVelocityUsdPerSec.value,
      volumeAccelerationUsdPerSec2: metrics.volumeAccelerationUsdPerSec2.value,
      buyerVelocityPerSec: metrics.buyerVelocityPerSec.value,
      buyerAccelerationPerSec2: metrics.buyerAccelerationPerSec2.value,
      tradeVelocityPerSec: metrics.tradeVelocityPerSec.value,
      tradeAccelerationPerSec2: metrics.tradeAccelerationPerSec2.value,
      buyPressureVelocityPerSec: metrics.buyPressureVelocityPerSec.value,
      buyPressureAccelerationPerSec2:
        metrics.buyPressureAccelerationPerSec2.value,
      reasonCodes: unique([
        ...snapshot.reasonCodes,
        ...window.reasonCodes,
        ...Object.values(metrics).flatMap((metric) => metric.reasonCodes)
      ])
    };
  }

  function getDerivatives(mint: string): CanonicalDerivativeSnapshot {
    const normalizedMint = mint.trim();
    const state = states.get(normalizedMint);
    const samples = state ? getAllSamples(state) : [];

    return computeCanonicalDerivatives({
      mint: normalizedMint,
      observations: samples.map((sample) => ({
        id: sample.id,
        timestamp: sample.timestampMs,
        side: sample.side,
        trader: sample.trader,
        priceSol: sample.priceSol,
        priceUsd: sample.priceUsd,
        volumeSol: sample.volumeSol,
        volumeUsd: sample.volumeUsd
      })),
      ...(state && Number.isFinite(state.maxTimestampMs)
        ? { evaluatedAt: state.maxTimestampMs }
        : {})
    });
  }

  function getStatus(mint?: string): TradeTimeseriesStatus {
    const selectedStates = mint
      ? [states.get(mint.trim())].filter(
          (state): state is TokenTimeseriesState => state !== undefined
        )
      : Array.from(states.values());
    const starts = selectedStates.flatMap((state) =>
      Array.from(state.buckets.keys())
    );
    const earliest = starts.length > 0 ? Math.min(...starts) : null;
    const latest = starts.length > 0 ? Math.max(...starts) : null;

    return {
      implemented: true,
      canonical: true,
      bucketMs: canonicalBucketMs,
      retentionMs,
      bucketCapacityPerMint,
      mintCount: selectedStates.length,
      bucketCount: starts.length,
      acceptedEventCount,
      duplicateEventCount,
      invalidEventCount,
      lateEventCount,
      prunedBucketCount,
      derivativeReadyMintCount: selectedStates.filter((state) =>
        hasMinimumDerivativeSamples(state, 2)
      ).length,
      accelerationReadyMintCount: selectedStates.filter((state) =>
        hasMinimumDerivativeSamples(state, 3)
      ).length,
      derivativeMethod: "event_time_finite_difference",
      earliestBucketStart:
        earliest === null ? null : new Date(earliest).toISOString(),
      latestBucketStart:
        latest === null ? null : new Date(latest).toISOString(),
      lastEventAt,
      reasonCodes: [
        "TIMESERIES_CANONICAL_ONE_SECOND_BUCKETS",
        "TIMESERIES_EVENT_TIME_ALIGNED",
        "TIMESERIES_DUPLICATE_SAFE",
        "TIMESERIES_RETENTION_BOUNDED",
        ...(lateEventCount > 0 ? ["TIMESERIES_LATE_EVENTS_REJECTED"] : []),
        "PAPER_ONLY",
        "TRADING_DISABLED"
      ],
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  function getSeries(
    mint: string,
    query: TradeBucketQuery = {}
  ): TradeTimeseriesSeries {
    const buckets = getBuckets(mint, {
      ...query,
      fillGaps: query.fillGaps ?? true
    });
    const actualBucketCount = buckets.filter(
      (bucket) => !bucket.synthetic
    ).length;
    const derivatives = getDerivatives(mint);

    return {
      mint: mint.trim(),
      bucketMs: canonicalBucketMs,
      retentionMs,
      actualBucketCount,
      gapBucketCount: buckets.length - actualBucketCount,
      available: states.has(mint.trim()),
      transactionCount: states.has(mint.trim())
        ? getWindows(mint)["5m"].tradeCount
        : null,
      buckets,
      windows: getWindows(mint),
      rollingStats: getRollingStats(mint),
      derivatives,
      status: getStatus(mint),
      reasonCodes: [
        "TIMESERIES_CANONICAL_ONE_SECOND_BUCKETS",
        ...(buckets.some((bucket) => bucket.synthetic)
          ? ["TIMESERIES_GAPS_MATERIALIZED"]
          : []),
        "PAPER_ONLY",
        "TRADING_DISABLED"
      ],
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  return {
    clear,
    getBuckets,
    getDerivatives,
    getOhlcv,
    getRollingStats,
    getSeries,
    getStatus,
    getWindows,
    ingestTrade,
    ingestTradeWithResult,
    trackMint: (mint) => {
      const normalizedMint = mint.trim();
      if (normalizedMint && !states.has(normalizedMint)) {
        states.set(normalizedMint, createTokenState());
      }
    }
  };
}

function normalizeSample(event: NormalizedTokenTradeEvent): TradeSample | null {
  if (!isTradeUsableForMetrics(event)) {
    return null;
  }

  if (event.side !== "buy" && event.side !== "sell") {
    return null;
  }

  const mint = event.mint.trim();
  const id = event.id.trim();
  const timestampMs = Date.parse(getEventTimestamp(event));
  const hasSol =
    isPositiveFinite(event.priceSol) && isPositiveFinite(event.volumeSol);
  const hasUsd =
    isPositiveFinite(event.priceUsd) && isPositiveFinite(event.volumeUsd);

  if (!mint || !id || !Number.isFinite(timestampMs) || (!hasSol && !hasUsd)) {
    return null;
  }

  return {
    id,
    mint,
    side: event.side,
    trader: event.trader?.trim() || null,
    source: event.source,
    confidence: event.confidence,
    priceSol: hasSol ? (event.priceSol ?? null) : null,
    priceUsd: hasUsd ? (event.priceUsd ?? null) : null,
    volumeSol: hasSol ? (event.volumeSol ?? null) : null,
    volumeUsd: hasUsd ? (event.volumeUsd ?? null) : null,
    tokenAmount: isNonnegativeFinite(event.tokenAmount)
      ? event.tokenAmount
      : null,
    timestampMs,
    reasonCodes: event.reasonCodes
  };
}

function createTokenState(): TokenTimeseriesState {
  return {
    buckets: new Map(),
    duplicateExcludedCounts: new Map(),
    lateEventCounts: new Map(),
    eventTimestamps: new Map(),
    maxTimestampMs: Number.NEGATIVE_INFINITY
  };
}

function ingestResult(
  event: NormalizedTokenTradeEvent,
  action: TradeIngestResult["action"],
  bucket: TradeBucket1s | null,
  reasonCodes: string[]
): TradeIngestResult {
  return {
    accepted: action === "accepted",
    action,
    eventId: event.id,
    mint: event.mint,
    bucket,
    reasonCodes
  };
}

function pruneState(
  state: TokenTimeseriesState,
  earliestRetainedBucketStart: number
): number {
  let pruned = 0;

  for (const start of state.buckets.keys()) {
    if (start < earliestRetainedBucketStart) {
      state.buckets.delete(start);
      state.duplicateExcludedCounts.delete(start);
      state.lateEventCounts.delete(start);
      pruned += 1;
    }
  }

  for (const [id, timestamp] of state.eventTimestamps) {
    if (toBucketStart(timestamp) < earliestRetainedBucketStart) {
      state.eventTimestamps.delete(id);
    }
  }

  return pruned;
}

function getEarliestRetainedBucketStart(
  maxTimestampMs: number,
  bucketCapacityPerMint: number
): number {
  return (
    toBucketStart(maxTimestampMs) -
    (bucketCapacityPerMint - 1) * canonicalBucketMs
  );
}

function getLatestBucketStart(state: TokenTimeseriesState): number {
  return Math.max(...state.buckets.keys());
}

function getAllSamples(state: TokenTimeseriesState): TradeSample[] {
  return Array.from(state.buckets.values()).flat().sort(compareSamples);
}

function hasMinimumDerivativeSamples(
  state: TokenTimeseriesState,
  minimum: number
): boolean {
  const cutoff = state.maxTimestampMs - 5_000;
  const recentTimestamps = new Set(
    getAllSamples(state)
      .filter(
        (sample) =>
          sample.timestampMs > cutoff &&
          sample.timestampMs <= state.maxTimestampMs
      )
      .map((sample) => sample.timestampMs)
  );
  return recentTimestamps.size >= minimum;
}

function getCarryPrice(
  state: TokenTimeseriesState,
  beforeBucketStart: number,
  denomination: "SOL" | "USD"
): number | null {
  const priorStarts = Array.from(state.buckets.keys())
    .filter((start) => start < beforeBucketStart)
    .sort((left, right) => right - left);

  for (const start of priorStarts) {
    const samples = state.buckets.get(start) ?? [];
    const value = getClose(samples, denomination);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function buildActualBucket(
  mint: string,
  bucketStartMs: number,
  samples: TradeSample[],
  latestBucketStart: number,
  duplicateExcludedCount = 0,
  lateEventCount = 0
): TradeBucket1s {
  const ohlcv = computeFromSamples(samples);
  const first = samples[0];
  const last = samples.at(-1);
  const sources = unique(samples.map((sample) => sample.source)).sort();

  return {
    schemaVersion: 1,
    bucketMs: canonicalBucketMs,
    mint,
    bucketStart: new Date(bucketStartMs).toISOString(),
    bucketEnd: new Date(bucketStartMs + canonicalBucketMs).toISOString(),
    firstTradeAt: first ? new Date(first.timestampMs).toISOString() : null,
    lastTradeAt: last ? new Date(last.timestampMs).toISOString() : null,
    ...ohlcv,
    sourceCount: sources.length,
    sourceEventCount: samples.length,
    duplicateExcludedCount,
    lateEventCount,
    sources,
    confidence: lowestConfidence(samples),
    complete: bucketStartMs < latestBucketStart,
    synthetic: false,
    reasonCodes: unique([
      "TIMESERIES_BUCKET_1S",
      "TIMESERIES_BUCKET_EVENT_TIME_ALIGNED",
      ...(duplicateExcludedCount > 0
        ? ["TIMESERIES_BUCKET_DUPLICATES_EXCLUDED"]
        : []),
      ...(lateEventCount > 0 ? ["TIMESERIES_BUCKET_LATE_EVENT_EVIDENCE"] : []),
      ...samples.flatMap((sample) => sample.reasonCodes)
    ]),
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  };
}

function buildSyntheticBucket(
  mint: string,
  bucketStartMs: number,
  carrySol: number | null,
  carryUsd: number | null,
  latestBucketStart: number
): TradeBucket1s {
  return {
    schemaVersion: 1,
    bucketMs: canonicalBucketMs,
    mint,
    bucketStart: new Date(bucketStartMs).toISOString(),
    bucketEnd: new Date(bucketStartMs + canonicalBucketMs).toISOString(),
    firstTradeAt: null,
    lastTradeAt: null,
    ...emptyOhlcv({ carrySol, carryUsd }),
    sourceCount: 0,
    sourceEventCount: 0,
    duplicateExcludedCount: 0,
    lateEventCount: 0,
    sources: [],
    confidence: "low",
    complete: bucketStartMs < latestBucketStart,
    synthetic: true,
    reasonCodes: [
      "TIMESERIES_BUCKET_1S",
      "TIMESERIES_GAP_BUCKET",
      ...(carrySol !== null || carryUsd !== null
        ? ["TIMESERIES_PRICE_CARRIED_FORWARD"]
        : []),
      "PAPER_ONLY",
      "TRADING_DISABLED"
    ],
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  };
}

function computeBucketRangeOhlcv(
  state: TokenTimeseriesState,
  referenceBucketStart: number,
  bucketCount: number,
  offsetBuckets: number
): Ohlcv {
  const end = referenceBucketStart - offsetBuckets * canonicalBucketMs;
  const start = end - (bucketCount - 1) * canonicalBucketMs;
  const samples = Array.from(state.buckets.entries())
    .filter(([bucketStart]) => bucketStart >= start && bucketStart <= end)
    .flatMap(([, bucketSamples]) => bucketSamples)
    .sort(compareSamples);
  return computeFromSamples(samples);
}

function computeFromSamples(samples: TradeSample[]): Ohlcv {
  if (samples.length === 0) {
    return emptyOhlcv();
  }

  const solSamples = samples.filter(
    (sample) => sample.priceSol !== null && sample.volumeSol !== null
  );
  const usdSamples = samples.filter(
    (sample) => sample.priceUsd !== null && sample.volumeUsd !== null
  );
  const sol = computeDenomination(solSamples, "SOL");
  const usd = computeDenomination(usdSamples, "USD");
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  let buyCount = 0;
  let sellCount = 0;
  let tokenVolume = 0;

  for (const sample of samples) {
    tokenVolume += sample.tokenAmount ?? 0;

    if (sample.side === "buy") {
      buyCount += 1;
      if (sample.trader) {
        buyers.add(sample.trader);
      }
    } else {
      sellCount += 1;
      if (sample.trader) {
        sellers.add(sample.trader);
      }
    }
  }

  return sanitizeOhlcv({
    openSol: sol.open,
    highSol: sol.high,
    lowSol: sol.low,
    closeSol: sol.close,
    volumeSol: sol.volume,
    buyVolumeSol: sol.buyVolume,
    sellVolumeSol: sol.sellVolume,
    netVolumeSol: sol.buyVolume - sol.sellVolume,
    buySellRatio: sellCount > 0 ? buyCount / sellCount : null,
    netBuyPressure:
      sol.volume > 0 ? (sol.buyVolume - sol.sellVolume) / sol.volume : null,
    vwapSol: sol.vwap,
    openUsd: usd.open,
    highUsd: usd.high,
    lowUsd: usd.low,
    closeUsd: usd.close,
    volumeUsd: usd.volume,
    buyVolumeUsd: usd.buyVolume,
    sellVolumeUsd: usd.sellVolume,
    vwapUsd: usd.vwap,
    tokenVolume,
    tradeCount: samples.length,
    buyCount,
    sellCount,
    uniqueBuyers: buyers.size,
    uniqueSellers: sellers.size
  });
}

function computeDenomination(
  samples: TradeSample[],
  denomination: "SOL" | "USD"
): {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  vwap: number | null;
} {
  if (samples.length === 0) {
    return {
      open: null,
      high: null,
      low: null,
      close: null,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
      vwap: null
    };
  }

  const prices = samples.map((sample) =>
    denomination === "SOL" ? (sample.priceSol ?? 0) : (sample.priceUsd ?? 0)
  );
  let volume = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let weightedPrice = 0;

  for (const sample of samples) {
    const price =
      denomination === "SOL" ? (sample.priceSol ?? 0) : (sample.priceUsd ?? 0);
    const sampleVolume =
      denomination === "SOL"
        ? (sample.volumeSol ?? 0)
        : (sample.volumeUsd ?? 0);
    volume += sampleVolume;
    weightedPrice += price * sampleVolume;

    if (sample.side === "buy") {
      buyVolume += sampleVolume;
    } else {
      sellVolume += sampleVolume;
    }
  }

  return {
    open: prices[0] ?? null,
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: prices.at(-1) ?? null,
    volume,
    buyVolume,
    sellVolume,
    vwap: volume > 0 ? weightedPrice / volume : null
  };
}

function emptyOhlcv(
  carry: { carrySol?: number | null; carryUsd?: number | null } = {}
): Ohlcv {
  const carrySol = finiteOrNull(carry.carrySol ?? null);
  const carryUsd = finiteOrNull(carry.carryUsd ?? null);

  return {
    openSol: carrySol,
    highSol: carrySol,
    lowSol: carrySol,
    closeSol: carrySol,
    volumeSol: 0,
    buyVolumeSol: 0,
    sellVolumeSol: 0,
    netVolumeSol: 0,
    buySellRatio: null,
    netBuyPressure: null,
    vwapSol: null,
    openUsd: carryUsd,
    highUsd: carryUsd,
    lowUsd: carryUsd,
    closeUsd: carryUsd,
    volumeUsd: 0,
    buyVolumeUsd: 0,
    sellVolumeUsd: 0,
    vwapUsd: null,
    tokenVolume: 0,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    uniqueBuyers: 0,
    uniqueSellers: 0
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
    netVolumeSol: roundMetric(input.netVolumeSol),
    buySellRatio: finiteOrNull(input.buySellRatio),
    netBuyPressure: finiteOrNull(input.netBuyPressure),
    vwapSol: finiteOrNull(input.vwapSol),
    openUsd: finiteOrNull(input.openUsd),
    highUsd: finiteOrNull(input.highUsd),
    lowUsd: finiteOrNull(input.lowUsd),
    closeUsd: finiteOrNull(input.closeUsd),
    volumeUsd: roundMetric(input.volumeUsd),
    buyVolumeUsd: roundMetric(input.buyVolumeUsd),
    sellVolumeUsd: roundMetric(input.sellVolumeUsd),
    vwapUsd: finiteOrNull(input.vwapUsd),
    tokenVolume: roundMetric(input.tokenVolume),
    tradeCount: input.tradeCount,
    buyCount: input.buyCount,
    sellCount: input.sellCount,
    uniqueBuyers: input.uniqueBuyers,
    uniqueSellers: input.uniqueSellers
  };
}

function getClose(
  samples: TradeSample[],
  denomination: "SOL" | "USD"
): number | null {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    const price = denomination === "SOL" ? sample?.priceSol : sample?.priceUsd;

    if (price !== null && price !== undefined) {
      return price;
    }
  }

  return null;
}

function lowestConfidence(samples: TradeSample[]): "low" | "medium" | "high" {
  return samples.reduce<"low" | "medium" | "high">(
    (lowest, sample) =>
      confidenceRank(sample.confidence) < confidenceRank(lowest)
        ? sample.confidence
        : lowest,
    "high"
  );
}

function confidenceRank(value: "low" | "medium" | "high"): number {
  return value === "high" ? 2 : value === "medium" ? 1 : 0;
}

function compareSamples(left: TradeSample, right: TradeSample): number {
  return (
    left.timestampMs - right.timestampMs || left.id.localeCompare(right.id)
  );
}

function toBucketStart(timestampMs: number): number {
  return Math.floor(timestampMs / canonicalBucketMs) * canonicalBucketMs;
}

function normalizeRetentionMs(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return defaultTimeseriesRetentionMs;
  }

  return Math.max(
    defaultTimeseriesRetentionMs,
    Math.ceil(value / canonicalBucketMs) * canonicalBucketMs
  );
}

function normalizeWindowMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : canonicalBucketMs;
}

function normalizeLimit(value: number | undefined, maximum: number): number {
  if (!Number.isFinite(value) || value === undefined) {
    return maximum;
  }

  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? roundMetric(value)
    : null;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonnegativeFinite(
  value: number | null | undefined
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function maxIso(left: string | null, right: string): string {
  if (left === null) {
    return right;
  }

  return Date.parse(right) > Date.parse(left) ? right : left;
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(15)) : 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
