export const canonicalDerivativeWindowMs = {
  "1s": 1_000,
  "5s": 5_000,
  "10s": 10_000,
  "30s": 30_000,
  "60s": 60_000,
  "2m": 120_000,
  "5m": 300_000
} as const;

export type CanonicalDerivativeWindowLabel =
  keyof typeof canonicalDerivativeWindowMs;

export const canonicalDerivativeUnits = {
  volumeVelocitySolPerSec: "SOL/s",
  volumeAccelerationSolPerSec2: "SOL/s^2",
  volumeVelocityUsdPerSec: "USD/s",
  volumeAccelerationUsdPerSec2: "USD/s^2",
  priceVelocityPctPerSec: "%/s",
  priceAccelerationPctPerSec2: "%/s^2",
  priceSolVelocityPerSec: "SOL/token/s",
  priceSolAccelerationPerSec2: "SOL/token/s^2",
  buyerVelocityPerSec: "buyers/s",
  buyerAccelerationPerSec2: "buyers/s^2",
  tradeVelocityPerSec: "trades/s",
  tradeAccelerationPerSec2: "trades/s^2",
  buyPressureVelocityPerSec: "ratio/s",
  buyPressureAccelerationPerSec2: "ratio/s^2"
} as const;

export type DerivativeMetricStatus =
  | "available"
  | "insufficient_samples"
  | "insufficient_span"
  | "source_unavailable"
  | "invalid_result";

export type DerivativeMetric = {
  value: number | null;
  status: DerivativeMetricStatus;
  sampleCount: number;
  distinctTimestampCount: number;
  spanMs: number | null;
  reasonCodes: string[];
};

export type CanonicalDerivativeMetrics = {
  volumeVelocitySolPerSec: DerivativeMetric;
  volumeAccelerationSolPerSec2: DerivativeMetric;
  volumeVelocityUsdPerSec: DerivativeMetric;
  volumeAccelerationUsdPerSec2: DerivativeMetric;
  priceVelocityPctPerSec: DerivativeMetric;
  priceAccelerationPctPerSec2: DerivativeMetric;
  priceSolVelocityPerSec: DerivativeMetric;
  priceSolAccelerationPerSec2: DerivativeMetric;
  buyerVelocityPerSec: DerivativeMetric;
  buyerAccelerationPerSec2: DerivativeMetric;
  tradeVelocityPerSec: DerivativeMetric;
  tradeAccelerationPerSec2: DerivativeMetric;
  buyPressureVelocityPerSec: DerivativeMetric;
  buyPressureAccelerationPerSec2: DerivativeMetric;
};

export type CanonicalDerivativeWindow = {
  label: CanonicalDerivativeWindowLabel;
  windowMs: number;
  startAt: string | null;
  endAt: string | null;
  observationCount: number;
  distinctTimestampCount: number;
  priceSource: "SOL" | "USD" | "unavailable";
  metrics: CanonicalDerivativeMetrics;
  availableMetricCount: number;
  unavailableMetricCount: number;
  reasonCodes: string[];
};

export type CanonicalDerivativeSnapshot = {
  schemaVersion: 1;
  canonical: true;
  method: "event_time_finite_difference";
  mint: string;
  evaluatedAt: string | null;
  primaryWindow: "5s";
  primary: CanonicalDerivativeWindow;
  windows: Record<CanonicalDerivativeWindowLabel, CanonicalDerivativeWindow>;
  observationCount: number;
  duplicateObservationCount: number;
  invalidObservationCount: number;
  futureObservationCount: number;
  firstDerivativeMinSamples: 2;
  secondDerivativeMinSamples: 3;
  units: typeof canonicalDerivativeUnits;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type DerivativeObservation = {
  id: string;
  timestamp: string | number;
  side: "buy" | "sell";
  trader?: string | null;
  priceSol?: number | null;
  priceUsd?: number | null;
  volumeSol?: number | null;
  volumeUsd?: number | null;
};

export type ComputeCanonicalDerivativesInput = {
  mint: string;
  observations: readonly DerivativeObservation[];
  evaluatedAt?: string | number;
};

type NormalizedObservation = {
  id: string;
  timestampMs: number;
  side: "buy" | "sell";
  trader: string | null;
  priceSol: number | null;
  priceUsd: number | null;
  volumeSol: number | null;
  volumeUsd: number | null;
};

type NumericPoint = {
  timestampMs: number;
  value: number;
};

type NormalizedObservations = {
  observations: NormalizedObservation[];
  duplicateCount: number;
  invalidCount: number;
};

const derivativeMetricNames: Array<keyof CanonicalDerivativeMetrics> = [
  "volumeVelocitySolPerSec",
  "volumeAccelerationSolPerSec2",
  "volumeVelocityUsdPerSec",
  "volumeAccelerationUsdPerSec2",
  "priceVelocityPctPerSec",
  "priceAccelerationPctPerSec2",
  "priceSolVelocityPerSec",
  "priceSolAccelerationPerSec2",
  "buyerVelocityPerSec",
  "buyerAccelerationPerSec2",
  "tradeVelocityPerSec",
  "tradeAccelerationPerSec2",
  "buyPressureVelocityPerSec",
  "buyPressureAccelerationPerSec2"
];

export function computeCanonicalDerivatives(
  input: ComputeCanonicalDerivativesInput
): CanonicalDerivativeSnapshot {
  const normalized = normalizeObservations(input.observations);
  const evaluatedAtMs = resolveEvaluationTime(
    input.evaluatedAt,
    normalized.observations
  );
  const observations =
    evaluatedAtMs === null
      ? normalized.observations
      : normalized.observations.filter(
          (observation) => observation.timestampMs <= evaluatedAtMs
        );
  const futureObservationCount =
    normalized.observations.length - observations.length;
  const windows = createWindowRecord((label, windowMs) =>
    computeWindow(label, windowMs, evaluatedAtMs, observations)
  );
  const primary = windows["5s"];
  const reasonCodes = unique([
    "DERIVATIVES_EVENT_TIME_FINITE_DIFFERENCE",
    "DERIVATIVES_FIRST_ORDER_MIN_TWO_SAMPLES",
    "DERIVATIVES_SECOND_ORDER_MIN_THREE_SAMPLES",
    ...(normalized.duplicateCount > 0
      ? ["DERIVATIVE_DUPLICATE_OBSERVATIONS_REMOVED"]
      : []),
    ...(normalized.invalidCount > 0
      ? ["DERIVATIVE_INVALID_OBSERVATIONS_REJECTED"]
      : []),
    ...(futureObservationCount > 0
      ? ["DERIVATIVE_FUTURE_OBSERVATIONS_REJECTED"]
      : []),
    ...(observations.length === 0
      ? ["DERIVATIVE_OBSERVATIONS_UNAVAILABLE"]
      : []),
    "PAPER_ONLY",
    "TRADING_DISABLED"
  ]);

  return {
    schemaVersion: 1,
    canonical: true,
    method: "event_time_finite_difference",
    mint: input.mint.trim(),
    evaluatedAt:
      evaluatedAtMs === null ? null : new Date(evaluatedAtMs).toISOString(),
    primaryWindow: "5s",
    primary,
    windows,
    observationCount: observations.length,
    duplicateObservationCount: normalized.duplicateCount,
    invalidObservationCount: normalized.invalidCount,
    futureObservationCount,
    firstDerivativeMinSamples: 2,
    secondDerivativeMinSamples: 3,
    units: canonicalDerivativeUnits,
    reasonCodes,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  };
}

function computeWindow(
  label: CanonicalDerivativeWindowLabel,
  windowMs: number,
  evaluatedAtMs: number | null,
  observations: NormalizedObservation[]
): CanonicalDerivativeWindow {
  if (evaluatedAtMs === null) {
    const metrics = emptyMetrics();
    return {
      label,
      windowMs,
      startAt: null,
      endAt: null,
      observationCount: 0,
      distinctTimestampCount: 0,
      priceSource: "unavailable",
      metrics,
      availableMetricCount: 0,
      unavailableMetricCount: derivativeMetricNames.length,
      reasonCodes: [
        "DERIVATIVE_WINDOW_EMPTY",
        "DERIVATIVE_OBSERVATIONS_UNAVAILABLE"
      ]
    };
  }

  const startMs = evaluatedAtMs - windowMs;
  const selected = observations.filter(
    (observation) =>
      observation.timestampMs > startMs &&
      observation.timestampMs <= evaluatedAtMs
  );
  const solPricePoints = createPricePoints(selected, "SOL");
  const usdPricePoints = createPricePoints(selected, "USD");
  const priceSource = selectPriceSource(solPricePoints, usdPricePoints);
  const pricePoints =
    priceSource === "SOL"
      ? solPricePoints
      : priceSource === "USD"
        ? usdPricePoints
        : [];
  const pressureSource = selectPressureSource(selected);
  const pressurePoints =
    pressureSource === "unavailable"
      ? []
      : createPressurePoints(selected, pressureSource);
  const metrics: CanonicalDerivativeMetrics = {
    volumeVelocitySolPerSec: computeFlowVelocity(selected, windowMs, "SOL"),
    volumeAccelerationSolPerSec2: computeFlowAcceleration(
      selected,
      startMs,
      evaluatedAtMs,
      "SOL"
    ),
    volumeVelocityUsdPerSec: computeFlowVelocity(selected, windowMs, "USD"),
    volumeAccelerationUsdPerSec2: computeFlowAcceleration(
      selected,
      startMs,
      evaluatedAtMs,
      "USD"
    ),
    priceVelocityPctPerSec: computePriceVelocity(pricePoints, true),
    priceAccelerationPctPerSec2: computePriceAcceleration(pricePoints, true),
    priceSolVelocityPerSec: computePriceVelocity(solPricePoints, false),
    priceSolAccelerationPerSec2: computePriceAcceleration(
      solPricePoints,
      false
    ),
    buyerVelocityPerSec: computeBuyerVelocity(selected, windowMs),
    buyerAccelerationPerSec2: computeBuyerAcceleration(
      selected,
      startMs,
      evaluatedAtMs
    ),
    tradeVelocityPerSec: computeTradeVelocity(selected, windowMs),
    tradeAccelerationPerSec2: computeTradeAcceleration(
      selected,
      startMs,
      evaluatedAtMs
    ),
    buyPressureVelocityPerSec: computePointVelocity(pressurePoints),
    buyPressureAccelerationPerSec2: computePointAcceleration(pressurePoints)
  };
  const availableMetricCount = derivativeMetricNames.filter(
    (name) => metrics[name].status === "available"
  ).length;
  const reasonCodes = unique([
    ...(selected.length === 0 ? ["DERIVATIVE_WINDOW_EMPTY"] : []),
    ...(selected.length === 1 ? ["INSUFFICIENT_SAMPLES_FOR_DERIVATIVE"] : []),
    ...(selected.length === 2
      ? ["INSUFFICIENT_SAMPLES_FOR_SECOND_DERIVATIVE"]
      : []),
    ...(priceSource === "unavailable"
      ? ["DERIVATIVE_PRICE_SOURCE_UNAVAILABLE"]
      : [`DERIVATIVE_PRICE_SOURCE_${priceSource}`]),
    ...(selected.some(
      (observation) => observation.side === "buy" && !observation.trader
    )
      ? ["DERIVATIVE_PARTIAL_TRADER_IDENTITIES"]
      : []),
    ...(availableMetricCount > 0 ? ["DERIVATIVE_WINDOW_PARTIALLY_READY"] : [])
  ]);

  return {
    label,
    windowMs,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(evaluatedAtMs).toISOString(),
    observationCount: selected.length,
    distinctTimestampCount: countDistinctTimestamps(selected),
    priceSource,
    metrics,
    availableMetricCount,
    unavailableMetricCount: derivativeMetricNames.length - availableMetricCount,
    reasonCodes
  };
}

function computeFlowVelocity(
  observations: NormalizedObservation[],
  windowMs: number,
  denomination: "SOL" | "USD"
): DerivativeMetric {
  const selected = withVolume(observations, denomination);
  const unavailable = checkAvailability(selected, 2);

  if (unavailable) {
    return unavailable;
  }

  const volume = selected.reduce(
    (total, observation) =>
      total +
      (denomination === "SOL"
        ? (observation.volumeSol ?? 0)
        : (observation.volumeUsd ?? 0)),
    0
  );
  return availableMetric(
    volume / (windowMs / 1_000),
    selected,
    observationSpan(selected) ?? windowMs
  );
}

function computeFlowAcceleration(
  observations: NormalizedObservation[],
  startMs: number,
  endMs: number,
  denomination: "SOL" | "USD"
): DerivativeMetric {
  const selected = withVolume(observations, denomination);
  const unavailable = checkAvailability(selected, 3);

  if (unavailable) {
    return unavailable;
  }

  const midpointMs = startMs + (endMs - startMs) / 2;
  const halfSeconds = (endMs - startMs) / 2_000;
  const olderVolume = sumVolume(
    selected.filter((observation) => observation.timestampMs <= midpointMs),
    denomination
  );
  const newerVolume = sumVolume(
    selected.filter((observation) => observation.timestampMs > midpointMs),
    denomination
  );
  const olderRate = olderVolume / halfSeconds;
  const newerRate = newerVolume / halfSeconds;
  return availableMetric(
    (newerRate - olderRate) / halfSeconds,
    selected,
    observationSpan(selected) ?? endMs - startMs
  );
}

function computeTradeVelocity(
  observations: NormalizedObservation[],
  windowMs: number
): DerivativeMetric {
  const unavailable = checkAvailability(observations, 2);

  if (unavailable) {
    return unavailable;
  }

  return availableMetric(
    observations.length / (windowMs / 1_000),
    observations,
    observationSpan(observations) ?? windowMs
  );
}

function computeTradeAcceleration(
  observations: NormalizedObservation[],
  startMs: number,
  endMs: number
): DerivativeMetric {
  const unavailable = checkAvailability(observations, 3);

  if (unavailable) {
    return unavailable;
  }

  const midpointMs = startMs + (endMs - startMs) / 2;
  const halfSeconds = (endMs - startMs) / 2_000;
  const olderRate =
    observations.filter((observation) => observation.timestampMs <= midpointMs)
      .length / halfSeconds;
  const newerRate =
    observations.filter((observation) => observation.timestampMs > midpointMs)
      .length / halfSeconds;
  return availableMetric(
    (newerRate - olderRate) / halfSeconds,
    observations,
    observationSpan(observations) ?? endMs - startMs
  );
}

function computeBuyerVelocity(
  observations: NormalizedObservation[],
  windowMs: number
): DerivativeMetric {
  const unavailable = checkAvailability(observations, 2);

  if (unavailable) {
    return unavailable;
  }

  const identityStatus = checkBuyerIdentityAvailability(observations);

  if (identityStatus) {
    return identityStatus;
  }

  const buyers = knownBuyers(observations);
  return availableMetric(
    buyers.size / (windowMs / 1_000),
    observations,
    observationSpan(observations) ?? windowMs,
    partialTraderReason(observations)
  );
}

function computeBuyerAcceleration(
  observations: NormalizedObservation[],
  startMs: number,
  endMs: number
): DerivativeMetric {
  const unavailable = checkAvailability(observations, 3);

  if (unavailable) {
    return unavailable;
  }

  const identityStatus = checkBuyerIdentityAvailability(observations);

  if (identityStatus) {
    return identityStatus;
  }

  const midpointMs = startMs + (endMs - startMs) / 2;
  const halfSeconds = (endMs - startMs) / 2_000;
  const arrivals = firstBuyerArrivals(observations);
  const olderRate =
    arrivals.filter((timestampMs) => timestampMs <= midpointMs).length /
    halfSeconds;
  const newerRate =
    arrivals.filter((timestampMs) => timestampMs > midpointMs).length /
    halfSeconds;
  return availableMetric(
    (newerRate - olderRate) / halfSeconds,
    observations,
    observationSpan(observations) ?? endMs - startMs,
    partialTraderReason(observations)
  );
}

function computePriceVelocity(
  points: NumericPoint[],
  percent: boolean
): DerivativeMetric {
  const unavailable = checkPointAvailability(points, 2);

  if (unavailable) {
    return unavailable;
  }

  const first = points[0];
  const last = points.at(-1);

  if (!first || !last) {
    return unavailableMetric("source_unavailable", points.length, 0, null);
  }

  const spanMs = last.timestampMs - first.timestampMs;
  const value = percent ? percentRate(first, last) : numericRate(first, last);

  if (value === null) {
    return unavailableMetric(
      "insufficient_span",
      points.length,
      countDistinctPointTimestamps(points),
      spanMs
    );
  }

  return availablePointMetric(value, points, spanMs);
}

function computePriceAcceleration(
  points: NumericPoint[],
  percent: boolean
): DerivativeMetric {
  const unavailable = checkPointAvailability(points, 3);

  if (unavailable) {
    return unavailable;
  }

  const selected = selectThreePoints(points);

  if (!selected) {
    return unavailableMetric(
      "insufficient_span",
      points.length,
      countDistinctPointTimestamps(points),
      pointSpan(points)
    );
  }

  const [first, middle, last] = selected;
  const olderRate = percent
    ? percentRate(first, middle)
    : numericRate(first, middle);
  const newerRate = percent
    ? percentRate(middle, last)
    : numericRate(middle, last);
  const centerDistanceSeconds = (last.timestampMs - first.timestampMs) / 2_000;

  if (olderRate === null || newerRate === null || centerDistanceSeconds <= 0) {
    return unavailableMetric(
      "insufficient_span",
      points.length,
      countDistinctPointTimestamps(points),
      last.timestampMs - first.timestampMs
    );
  }

  return availablePointMetric(
    (newerRate - olderRate) / centerDistanceSeconds,
    points,
    last.timestampMs - first.timestampMs
  );
}

function computePointVelocity(points: NumericPoint[]): DerivativeMetric {
  return computePriceVelocity(points, false);
}

function computePointAcceleration(points: NumericPoint[]): DerivativeMetric {
  return computePriceAcceleration(points, false);
}

function createPricePoints(
  observations: NormalizedObservation[],
  denomination: "SOL" | "USD"
): NumericPoint[] {
  const points = new Map<number, number>();

  for (const observation of observations) {
    const price =
      denomination === "SOL" ? observation.priceSol : observation.priceUsd;

    if (price !== null) {
      points.set(observation.timestampMs, price);
    }
  }

  return Array.from(points, ([timestampMs, value]) => ({
    timestampMs,
    value
  })).sort((left, right) => left.timestampMs - right.timestampMs);
}

function createPressurePoints(
  observations: NormalizedObservation[],
  denomination: "SOL" | "USD"
): NumericPoint[] {
  const points: NumericPoint[] = [];
  let buyVolume = 0;
  let sellVolume = 0;
  let index = 0;

  while (index < observations.length) {
    const timestampMs = observations[index]?.timestampMs;
    let groupHadVolume = false;

    if (timestampMs === undefined) {
      break;
    }

    while (observations[index]?.timestampMs === timestampMs) {
      const observation = observations[index];

      if (!observation) {
        break;
      }

      const volume =
        denomination === "SOL" ? observation.volumeSol : observation.volumeUsd;

      if (volume !== null) {
        groupHadVolume = true;
        if (observation.side === "buy") {
          buyVolume += volume;
        } else {
          sellVolume += volume;
        }
      }

      index += 1;
    }

    const totalVolume = buyVolume + sellVolume;

    if (groupHadVolume && totalVolume > 0) {
      points.push({
        timestampMs,
        value: (buyVolume - sellVolume) / totalVolume
      });
    }
  }

  return points;
}

function selectPriceSource(
  solPoints: NumericPoint[],
  usdPoints: NumericPoint[]
): CanonicalDerivativeWindow["priceSource"] {
  if (solPoints.length >= 2) {
    return "SOL";
  }

  if (usdPoints.length >= 2) {
    return "USD";
  }

  if (solPoints.length > 0) {
    return "SOL";
  }

  if (usdPoints.length > 0) {
    return "USD";
  }

  return "unavailable";
}

function selectPressureSource(
  observations: NormalizedObservation[]
): "SOL" | "USD" | "unavailable" {
  if (withVolume(observations, "SOL").length >= 2) {
    return "SOL";
  }

  if (withVolume(observations, "USD").length >= 2) {
    return "USD";
  }

  return "unavailable";
}

function withVolume(
  observations: NormalizedObservation[],
  denomination: "SOL" | "USD"
): NormalizedObservation[] {
  return observations.filter((observation) =>
    denomination === "SOL"
      ? observation.volumeSol !== null
      : observation.volumeUsd !== null
  );
}

function sumVolume(
  observations: NormalizedObservation[],
  denomination: "SOL" | "USD"
): number {
  return observations.reduce(
    (total, observation) =>
      total +
      (denomination === "SOL"
        ? (observation.volumeSol ?? 0)
        : (observation.volumeUsd ?? 0)),
    0
  );
}

function knownBuyers(observations: NormalizedObservation[]): Set<string> {
  return new Set(
    observations
      .filter(
        (observation) =>
          observation.side === "buy" && observation.trader !== null
      )
      .map((observation) => observation.trader as string)
  );
}

function firstBuyerArrivals(observations: NormalizedObservation[]): number[] {
  const firstSeen = new Map<string, number>();

  for (const observation of observations) {
    if (
      observation.side === "buy" &&
      observation.trader &&
      !firstSeen.has(observation.trader)
    ) {
      firstSeen.set(observation.trader, observation.timestampMs);
    }
  }

  return Array.from(firstSeen.values());
}

function checkBuyerIdentityAvailability(
  observations: NormalizedObservation[]
): DerivativeMetric | null {
  const buys = observations.filter((observation) => observation.side === "buy");

  if (buys.length > 0 && buys.every((observation) => !observation.trader)) {
    return unavailableMetric(
      "source_unavailable",
      observations.length,
      countDistinctTimestamps(observations),
      observationSpan(observations),
      ["DERIVATIVE_TRADER_IDENTITIES_UNAVAILABLE"]
    );
  }

  return null;
}

function partialTraderReason(observations: NormalizedObservation[]): string[] {
  return observations.some(
    (observation) => observation.side === "buy" && !observation.trader
  )
    ? ["DERIVATIVE_PARTIAL_TRADER_IDENTITIES"]
    : [];
}

function checkAvailability(
  observations: NormalizedObservation[],
  minimumSamples: number
): DerivativeMetric | null {
  const distinctTimestampCount = countDistinctTimestamps(observations);

  if (observations.length < minimumSamples) {
    return unavailableMetric(
      observations.length === 0 ? "source_unavailable" : "insufficient_samples",
      observations.length,
      distinctTimestampCount,
      observationSpan(observations)
    );
  }

  if (distinctTimestampCount < minimumSamples) {
    return unavailableMetric(
      "insufficient_span",
      observations.length,
      distinctTimestampCount,
      observationSpan(observations)
    );
  }

  return null;
}

function checkPointAvailability(
  points: NumericPoint[],
  minimumSamples: number
): DerivativeMetric | null {
  const distinctTimestampCount = countDistinctPointTimestamps(points);

  if (points.length < minimumSamples) {
    return unavailableMetric(
      points.length === 0 ? "source_unavailable" : "insufficient_samples",
      points.length,
      distinctTimestampCount,
      pointSpan(points)
    );
  }

  if (distinctTimestampCount < minimumSamples) {
    return unavailableMetric(
      "insufficient_span",
      points.length,
      distinctTimestampCount,
      pointSpan(points)
    );
  }

  return null;
}

function availableMetric(
  value: number,
  observations: NormalizedObservation[],
  spanMs: number,
  extraReasonCodes: string[] = []
): DerivativeMetric {
  if (!Number.isFinite(value)) {
    return unavailableMetric(
      "invalid_result",
      observations.length,
      countDistinctTimestamps(observations),
      spanMs
    );
  }

  return {
    value: round(value),
    status: "available",
    sampleCount: observations.length,
    distinctTimestampCount: countDistinctTimestamps(observations),
    spanMs,
    reasonCodes: unique(["DERIVATIVE_AVAILABLE", ...extraReasonCodes])
  };
}

function availablePointMetric(
  value: number,
  points: NumericPoint[],
  spanMs: number
): DerivativeMetric {
  if (!Number.isFinite(value)) {
    return unavailableMetric(
      "invalid_result",
      points.length,
      countDistinctPointTimestamps(points),
      spanMs
    );
  }

  return {
    value: round(value),
    status: "available",
    sampleCount: points.length,
    distinctTimestampCount: countDistinctPointTimestamps(points),
    spanMs,
    reasonCodes: ["DERIVATIVE_AVAILABLE"]
  };
}

function unavailableMetric(
  status: Exclude<DerivativeMetricStatus, "available">,
  sampleCount: number,
  distinctTimestampCount: number,
  spanMs: number | null,
  extraReasonCodes: string[] = []
): DerivativeMetric {
  const reasonCode =
    status === "source_unavailable"
      ? "DERIVATIVE_SOURCE_UNAVAILABLE"
      : status === "invalid_result"
        ? "DERIVATIVE_NONFINITE_RESULT_REJECTED"
        : status === "insufficient_span"
          ? "DERIVATIVE_INSUFFICIENT_TIME_SPAN"
          : "DERIVATIVE_INSUFFICIENT_SAMPLES";

  return {
    value: null,
    status,
    sampleCount,
    distinctTimestampCount,
    spanMs,
    reasonCodes: unique([reasonCode, ...extraReasonCodes])
  };
}

function emptyMetrics(): CanonicalDerivativeMetrics {
  const unavailable = () => unavailableMetric("source_unavailable", 0, 0, null);

  return {
    volumeVelocitySolPerSec: unavailable(),
    volumeAccelerationSolPerSec2: unavailable(),
    volumeVelocityUsdPerSec: unavailable(),
    volumeAccelerationUsdPerSec2: unavailable(),
    priceVelocityPctPerSec: unavailable(),
    priceAccelerationPctPerSec2: unavailable(),
    priceSolVelocityPerSec: unavailable(),
    priceSolAccelerationPerSec2: unavailable(),
    buyerVelocityPerSec: unavailable(),
    buyerAccelerationPerSec2: unavailable(),
    tradeVelocityPerSec: unavailable(),
    tradeAccelerationPerSec2: unavailable(),
    buyPressureVelocityPerSec: unavailable(),
    buyPressureAccelerationPerSec2: unavailable()
  };
}

function selectThreePoints(
  points: NumericPoint[]
): [NumericPoint, NumericPoint, NumericPoint] | null {
  const first = points[0];
  const last = points.at(-1);

  if (!first || !last || points.length < 3) {
    return null;
  }

  const target = first.timestampMs + (last.timestampMs - first.timestampMs) / 2;
  const middle = points
    .slice(1, -1)
    .sort(
      (left, right) =>
        Math.abs(left.timestampMs - target) -
          Math.abs(right.timestampMs - target) ||
        left.timestampMs - right.timestampMs
    )[0];

  return middle ? [first, middle, last] : null;
}

function percentRate(first: NumericPoint, last: NumericPoint): number | null {
  if (first.value <= 0) {
    return null;
  }

  const seconds = (last.timestampMs - first.timestampMs) / 1_000;
  return seconds > 0
    ? (((last.value - first.value) / first.value) * 100) / seconds
    : null;
}

function numericRate(first: NumericPoint, last: NumericPoint): number | null {
  const seconds = (last.timestampMs - first.timestampMs) / 1_000;
  return seconds > 0 ? (last.value - first.value) / seconds : null;
}

function normalizeObservations(
  input: readonly DerivativeObservation[]
): NormalizedObservations {
  const valid: NormalizedObservation[] = [];
  let invalidCount = 0;

  for (const observation of input) {
    const normalized = normalizeObservation(observation);

    if (normalized) {
      valid.push(normalized);
    } else {
      invalidCount += 1;
    }
  }

  valid.sort(compareObservations);
  const seen = new Set<string>();
  const observations: NormalizedObservation[] = [];
  let duplicateCount = 0;

  for (const observation of valid) {
    if (seen.has(observation.id)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(observation.id);
    observations.push(observation);
  }

  return { observations, duplicateCount, invalidCount };
}

function normalizeObservation(
  observation: DerivativeObservation
): NormalizedObservation | null {
  const id = observation.id.trim();
  const timestampMs = parseTimestamp(observation.timestamp);
  const priceSol = positiveOrNull(observation.priceSol);
  const priceUsd = positiveOrNull(observation.priceUsd);
  const volumeSol = positiveOrNull(observation.volumeSol);
  const volumeUsd = positiveOrNull(observation.volumeUsd);
  const hasSolPair = priceSol !== null && volumeSol !== null;
  const hasUsdPair = priceUsd !== null && volumeUsd !== null;

  if (
    !id ||
    timestampMs === null ||
    (observation.side !== "buy" && observation.side !== "sell") ||
    (!hasSolPair && !hasUsdPair)
  ) {
    return null;
  }

  return {
    id,
    timestampMs,
    side: observation.side,
    trader: observation.trader?.trim() || null,
    priceSol,
    priceUsd,
    volumeSol,
    volumeUsd
  };
}

function resolveEvaluationTime(
  input: string | number | undefined,
  observations: NormalizedObservation[]
): number | null {
  if (input !== undefined) {
    const parsed = parseTimestamp(input);

    if (parsed === null) {
      throw new RangeError("evaluatedAt must be a valid timestamp");
    }

    return parsed;
  }

  return observations.at(-1)?.timestampMs ?? null;
}

function parseTimestamp(value: string | number): number | null {
  const parsed =
    typeof value === "number"
      ? value > 10_000_000_000
        ? value
        : value * 1_000
      : Date.parse(value);
  return Number.isFinite(parsed) && Number.isFinite(new Date(parsed).getTime())
    ? parsed
    : null;
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function observationSpan(observations: NormalizedObservation[]): number | null {
  const first = observations[0];
  const last = observations.at(-1);
  return first && last ? last.timestampMs - first.timestampMs : null;
}

function pointSpan(points: NumericPoint[]): number | null {
  const first = points[0];
  const last = points.at(-1);
  return first && last ? last.timestampMs - first.timestampMs : null;
}

function countDistinctTimestamps(
  observations: NormalizedObservation[]
): number {
  return new Set(observations.map((observation) => observation.timestampMs))
    .size;
}

function countDistinctPointTimestamps(points: NumericPoint[]): number {
  return new Set(points.map((point) => point.timestampMs)).size;
}

function compareObservations(
  left: NormalizedObservation,
  right: NormalizedObservation
): number {
  return (
    left.timestampMs - right.timestampMs ||
    left.id.localeCompare(right.id) ||
    left.side.localeCompare(right.side) ||
    (left.trader ?? "").localeCompare(right.trader ?? "") ||
    compareNullableNumber(left.priceSol, right.priceSol) ||
    compareNullableNumber(left.priceUsd, right.priceUsd) ||
    compareNullableNumber(left.volumeSol, right.volumeSol) ||
    compareNullableNumber(left.volumeUsd, right.volumeUsd)
  );
}

function compareNullableNumber(
  left: number | null,
  right: number | null
): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return -1;
  }

  if (right === null) {
    return 1;
  }

  return left < right ? -1 : 1;
}

function createWindowRecord<T>(
  create: (label: CanonicalDerivativeWindowLabel, windowMs: number) => T
): Record<CanonicalDerivativeWindowLabel, T> {
  return Object.entries(canonicalDerivativeWindowMs).reduce(
    (record, [label, windowMs]) => {
      const typedLabel = label as CanonicalDerivativeWindowLabel;
      record[typedLabel] = create(typedLabel, windowMs);
      return record;
    },
    {} as Record<CanonicalDerivativeWindowLabel, T>
  );
}

function round(value: number): number {
  return Number(value.toFixed(10));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
