export const derivativeStrengthNormalizationMethod =
  "hybrid_absolute_robust_age_cohort" as const;

export const derivativeStrengthAgeBuckets = [
  { label: "0-10s", minimumAgeSeconds: 0, maximumAgeSeconds: 10 },
  { label: "10-30s", minimumAgeSeconds: 10, maximumAgeSeconds: 30 },
  { label: "30-60s", minimumAgeSeconds: 30, maximumAgeSeconds: 60 },
  { label: "60-120s", minimumAgeSeconds: 60, maximumAgeSeconds: 120 },
  { label: "120-300s", minimumAgeSeconds: 120, maximumAgeSeconds: 300 },
  {
    label: "300s+",
    minimumAgeSeconds: 300,
    maximumAgeSeconds: Number.POSITIVE_INFINITY
  }
] as const;

export type DerivativeStrengthAgeBucket =
  (typeof derivativeStrengthAgeBuckets)[number]["label"];

export type DerivativeStrengthMetricName =
  | "volume_velocity_sol"
  | "volume_acceleration_sol"
  | "volume_velocity_usd"
  | "volume_acceleration_usd"
  | "price_velocity_pct"
  | "price_acceleration_pct"
  | "price_velocity_sol"
  | "price_acceleration_sol"
  | "buyer_velocity"
  | "buyer_acceleration"
  | "trade_velocity"
  | "trade_acceleration"
  | "buy_pressure_velocity"
  | "buy_pressure_acceleration"
  | "market_cap_velocity_sol"
  | "liquidity_velocity_sol";

export type DerivativeDirection = "up" | "down" | "flat" | "unavailable";

export type DerivativeStrengthLabel =
  "none" | "weak" | "moderate" | "strong" | "explosive";

export type DerivativeAvailabilityStatus =
  | "available"
  | "insufficient_samples"
  | "insufficient_span"
  | "source_unavailable"
  | "invalid_result";

export type DerivativeStrengthMetricConfig = {
  derivativeOrder: 1 | 2;
  unit: string;
  noiseFloor: number;
  weakAt: number;
  moderateAt: number;
  strongAt: number;
  explosiveAt: number;
  unavailableCode: string;
};

export const derivativeStrengthMetricConfig: Record<
  DerivativeStrengthMetricName,
  DerivativeStrengthMetricConfig
> = {
  volume_velocity_sol: firstOrder(
    "SOL/s",
    0.001,
    0.03,
    0.1,
    0.3,
    0.75,
    "VOLUME_VELOCITY_UNAVAILABLE"
  ),
  volume_acceleration_sol: secondOrder(
    "SOL/s^2",
    0.0005,
    0.005,
    0.02,
    0.05,
    0.12,
    "VOLUME_ACCELERATION_UNAVAILABLE"
  ),
  volume_velocity_usd: firstOrder(
    "USD/s",
    1,
    10,
    50,
    200,
    500,
    "VOLUME_USD_VELOCITY_UNAVAILABLE"
  ),
  volume_acceleration_usd: secondOrder(
    "USD/s^2",
    0.5,
    5,
    20,
    75,
    200,
    "VOLUME_USD_ACCELERATION_UNAVAILABLE"
  ),
  price_velocity_pct: firstOrder(
    "%/s",
    0.005,
    0.05,
    0.2,
    0.65,
    1.4,
    "PRICE_VELOCITY_UNAVAILABLE"
  ),
  price_acceleration_pct: secondOrder(
    "%/s^2",
    0.001,
    0.01,
    0.05,
    0.15,
    0.35,
    "PRICE_ACCELERATION_UNAVAILABLE"
  ),
  price_velocity_sol: firstOrder(
    "SOL/token/s",
    0.0000001,
    0.000001,
    0.00001,
    0.00005,
    0.0002,
    "PRICE_SOL_VELOCITY_UNAVAILABLE"
  ),
  price_acceleration_sol: secondOrder(
    "SOL/token/s^2",
    0.00000001,
    0.0000001,
    0.000001,
    0.000005,
    0.00002,
    "PRICE_SOL_ACCELERATION_UNAVAILABLE"
  ),
  buyer_velocity: firstOrder(
    "buyers/s",
    0.003,
    0.03,
    0.1,
    0.25,
    0.5,
    "BUYER_VELOCITY_UNAVAILABLE"
  ),
  buyer_acceleration: secondOrder(
    "buyers/s^2",
    0.0003,
    0.003,
    0.015,
    0.04,
    0.1,
    "BUYER_ACCELERATION_UNAVAILABLE"
  ),
  trade_velocity: firstOrder(
    "trades/s",
    0.008,
    0.08,
    0.2,
    0.45,
    0.8,
    "TRADE_VELOCITY_UNAVAILABLE"
  ),
  trade_acceleration: secondOrder(
    "trades/s^2",
    0.0005,
    0.005,
    0.02,
    0.06,
    0.15,
    "TRADE_ACCELERATION_UNAVAILABLE"
  ),
  buy_pressure_velocity: firstOrder(
    "ratio/s",
    0.0005,
    0.005,
    0.02,
    0.06,
    0.12,
    "BUY_PRESSURE_DERIVATIVE_UNAVAILABLE"
  ),
  buy_pressure_acceleration: secondOrder(
    "ratio/s^2",
    0.0001,
    0.001,
    0.005,
    0.02,
    0.05,
    "BUY_PRESSURE_ACCELERATION_UNAVAILABLE"
  ),
  market_cap_velocity_sol: firstOrder(
    "SOL/s",
    0.005,
    0.05,
    0.2,
    0.6,
    1.5,
    "MARKET_CAP_DERIVATIVE_UNAVAILABLE"
  ),
  liquidity_velocity_sol: firstOrder(
    "SOL/s",
    0.005,
    0.05,
    0.2,
    0.6,
    1.5,
    "LIQUIDITY_DERIVATIVE_UNAVAILABLE"
  )
};

export const minimumRobustCohortSize = 5 as const;

export type DerivativeStrengthConfidence = {
  overall: number;
  sample: number;
  distinctTimestamp: number;
  span: number;
  freshness: number;
};

export type NormalizedDerivativeStrength = {
  schemaVersion: 1;
  method: typeof derivativeStrengthNormalizationMethod;
  metric: DerivativeStrengthMetricName;
  unit: string;
  rawValue: number | null;
  normalizedScore: number;
  confidenceAdjustedScore: number;
  positiveScore: number;
  adverseScore: number;
  absoluteScore: number;
  cohortScore: number | null;
  cohortPercentile: number | null;
  robustZScore: number | null;
  cohortMedian: number | null;
  cohortMad: number | null;
  cohortSampleCount: number;
  cohortReady: boolean;
  ageBucket: DerivativeStrengthAgeBucket;
  direction: DerivativeDirection;
  strength: DerivativeStrengthLabel;
  confidence: DerivativeStrengthConfidence;
  reasonCodes: string[];
};

export type NormalizeDerivativeStrengthInput = {
  metric: DerivativeStrengthMetricName;
  rawValue: number | null | undefined;
  ageSeconds: number;
  cohortValues?: readonly number[];
  availabilityStatus?: DerivativeAvailabilityStatus;
  sampleCount?: number;
  distinctTimestampCount?: number;
  spanMs?: number | null;
  windowMs?: number;
  freshnessMs?: number | null;
};

export type DerivativeStrengthCohort = Partial<
  Record<DerivativeStrengthMetricName, readonly number[]>
>;

export function getDerivativeStrengthAgeBucket(
  ageSeconds: number
): DerivativeStrengthAgeBucket {
  const safeAge = Number.isFinite(ageSeconds) ? Math.max(0, ageSeconds) : 0;
  return (
    derivativeStrengthAgeBuckets.find(
      (bucket) =>
        safeAge >= bucket.minimumAgeSeconds &&
        safeAge < bucket.maximumAgeSeconds
    )?.label ?? "300s+"
  );
}

export function normalizeDerivativeStrength(
  input: NormalizeDerivativeStrengthInput
): NormalizedDerivativeStrength {
  const config = derivativeStrengthMetricConfig[input.metric];
  const ageBucket = getDerivativeStrengthAgeBucket(input.ageSeconds);
  const confidence = computeConfidence(input, config.derivativeOrder);
  const invalidAge = !Number.isFinite(input.ageSeconds) || input.ageSeconds < 0;
  const partialConfidenceContext =
    input.sampleCount === undefined ||
    input.distinctTimestampCount === undefined ||
    input.spanMs === undefined ||
    input.windowMs === undefined ||
    input.freshnessMs === undefined;
  const rawValue = finiteOrNull(input.rawValue);
  const unavailable =
    rawValue === null ||
    (input.availabilityStatus !== undefined &&
      input.availabilityStatus !== "available");

  if (unavailable) {
    return unavailableStrength({
      metric: input.metric,
      ageBucket,
      config,
      reasonCodes: [
        config.unavailableCode,
        ...(input.availabilityStatus
          ? [`DERIVATIVE_STATUS_${input.availabilityStatus.toUpperCase()}`]
          : []),
        ...(invalidAge ? ["DERIVATIVE_STRENGTH_INVALID_AGE_FALLBACK"] : [])
      ]
    });
  }

  const magnitude = Math.abs(rawValue);
  const absoluteScore =
    magnitude < config.noiseFloor
      ? 0
      : clamp((magnitude / config.explosiveAt) * 100, 0, 100);
  const cohort = computeCohort(magnitude, input.cohortValues ?? [], config);
  const normalizedScore = cohort.ready
    ? clamp(absoluteScore * 0.75 + (cohort.score ?? 0) * 0.25, 0, 100)
    : absoluteScore;
  const direction =
    rawValue > 0 ? "up" : rawValue < 0 ? "down" : ("flat" as const);
  const strength = strengthForNormalizedScore(normalizedScore, config);
  const roundedNormalizedScore = round(normalizedScore);
  const confidenceAdjustedScore = round(
    roundedNormalizedScore * confidence.overall
  );

  return {
    schemaVersion: 1,
    method: derivativeStrengthNormalizationMethod,
    metric: input.metric,
    unit: config.unit,
    rawValue: round(rawValue),
    normalizedScore: roundedNormalizedScore,
    confidenceAdjustedScore,
    positiveScore: direction === "up" ? roundedNormalizedScore : 0,
    adverseScore: direction === "down" ? roundedNormalizedScore : 0,
    absoluteScore: round(absoluteScore),
    cohortScore: nullableRound(cohort.score),
    cohortPercentile: nullableRound(cohort.percentile),
    robustZScore: nullableRound(cohort.robustZScore),
    cohortMedian: nullableRound(cohort.median),
    cohortMad: nullableRound(cohort.mad),
    cohortSampleCount: cohort.sampleCount,
    cohortReady: cohort.ready,
    ageBucket,
    direction,
    strength,
    confidence,
    reasonCodes: unique([
      "DERIVATIVE_STRENGTH_CANONICAL_NORMALIZATION",
      `DERIVATIVE_STRENGTH_AGE_BUCKET_${ageBucket.replaceAll(/[^A-Za-z0-9]/gu, "_").toUpperCase()}`,
      cohort.ready
        ? "DERIVATIVE_STRENGTH_ROBUST_COHORT_APPLIED"
        : "DERIVATIVE_STRENGTH_ABSOLUTE_FALLBACK",
      ...(cohort.ready && cohort.mad === 0
        ? ["DERIVATIVE_STRENGTH_ZERO_MAD_PERCENTILE_ONLY"]
        : []),
      ...(magnitude < config.noiseFloor
        ? ["DERIVATIVE_STRENGTH_BELOW_NOISE_FLOOR"]
        : []),
      ...(direction === "down"
        ? ["DERIVATIVE_STRENGTH_ADVERSE_DIRECTION"]
        : []),
      ...(invalidAge ? ["DERIVATIVE_STRENGTH_INVALID_AGE_FALLBACK"] : []),
      strength === "none"
        ? "DERIVATIVE_STRENGTH_NONE"
        : `DERIVATIVE_STRENGTH_${strength.toUpperCase()}`,
      confidence.overall < 0.5
        ? "DERIVATIVE_STRENGTH_LOW_CONFIDENCE"
        : "DERIVATIVE_STRENGTH_CONFIDENCE_AVAILABLE",
      ...(partialConfidenceContext
        ? ["DERIVATIVE_STRENGTH_PARTIAL_CONFIDENCE_CONTEXT"]
        : []),
      "DERIVATIVE_STRENGTH_NOT_SIGNAL_CALIBRATED"
    ])
  };
}

export function getDerivativeStrengthRuntimeContract() {
  return {
    schemaVersion: 1 as const,
    canonical: true as const,
    method: derivativeStrengthNormalizationMethod,
    ageBuckets: derivativeStrengthAgeBuckets.map((bucket) => ({
      label: bucket.label,
      minimumAgeSeconds: bucket.minimumAgeSeconds,
      maximumAgeSeconds: Number.isFinite(bucket.maximumAgeSeconds)
        ? bucket.maximumAgeSeconds
        : null
    })),
    minimumRobustCohortSize,
    absoluteWeight: 0.75,
    cohortWeight: 0.25,
    confidenceReportedSeparately: true as const,
    confidenceAppliedToSignalScore: false as const,
    calibrationStatus: "pending" as const,
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const
  };
}

function firstOrder(
  unit: string,
  noiseFloor: number,
  weakAt: number,
  moderateAt: number,
  strongAt: number,
  explosiveAt: number,
  unavailableCode: string
): DerivativeStrengthMetricConfig {
  return {
    derivativeOrder: 1,
    unit,
    noiseFloor,
    weakAt,
    moderateAt,
    strongAt,
    explosiveAt,
    unavailableCode
  };
}

function secondOrder(
  unit: string,
  noiseFloor: number,
  weakAt: number,
  moderateAt: number,
  strongAt: number,
  explosiveAt: number,
  unavailableCode: string
): DerivativeStrengthMetricConfig {
  return {
    ...firstOrder(
      unit,
      noiseFloor,
      weakAt,
      moderateAt,
      strongAt,
      explosiveAt,
      unavailableCode
    ),
    derivativeOrder: 2
  };
}

function computeConfidence(
  input: NormalizeDerivativeStrengthInput,
  derivativeOrder: 1 | 2
): DerivativeStrengthConfidence {
  if (
    input.availabilityStatus !== undefined &&
    input.availabilityStatus !== "available"
  ) {
    return zeroConfidence();
  }

  const minimum = derivativeOrder === 1 ? 2 : 3;
  const target = minimum + 3;
  const sample = confidenceRatio(input.sampleCount, target);
  const distinctTimestamp = confidenceRatio(
    input.distinctTimestampCount,
    target
  );
  const span =
    input.spanMs === undefined || input.windowMs === undefined
      ? 0.5
      : input.spanMs === null || input.windowMs <= 0
        ? 0
        : clamp(input.spanMs / input.windowMs, 0, 1);
  const freshness =
    input.freshnessMs === undefined || input.windowMs === undefined
      ? 0.5
      : input.freshnessMs === null || input.windowMs <= 0
        ? 0
        : clamp(1 - input.freshnessMs / input.windowMs, 0, 1);
  const overall =
    sample * 0.35 + distinctTimestamp * 0.25 + span * 0.2 + freshness * 0.2;

  return {
    overall: round(overall),
    sample: round(sample),
    distinctTimestamp: round(distinctTimestamp),
    span: round(span),
    freshness: round(freshness)
  };
}

function confidenceRatio(value: number | undefined, target: number): number {
  return value === undefined || !Number.isFinite(value)
    ? 0.5
    : clamp(Math.floor(Math.max(0, value)) / target, 0, 1);
}

function computeCohort(
  magnitude: number,
  values: readonly number[],
  config: DerivativeStrengthMetricConfig
): {
  ready: boolean;
  sampleCount: number;
  percentile: number | null;
  score: number | null;
  median: number | null;
  mad: number | null;
  robustZScore: number | null;
} {
  const magnitudes = values
    .filter(Number.isFinite)
    .map((value) => Math.abs(value))
    .sort((left, right) => left - right);
  const sampleCount = magnitudes.length;

  if (sampleCount < minimumRobustCohortSize) {
    return {
      ready: false,
      sampleCount,
      percentile: null,
      score: null,
      median: null,
      mad: null,
      robustZScore: null
    };
  }

  const cohortMedian = median(magnitudes);
  const deviations = magnitudes
    .map((value) => Math.abs(value - cohortMedian))
    .sort((left, right) => left - right);
  const mad = median(deviations);
  const less = magnitudes.filter((value) => value < magnitude).length;
  const equal = magnitudes.filter((value) => value === magnitude).length;
  const percentile = ((less + equal * 0.5) / sampleCount) * 100;
  const score = clamp((percentile - 50) * 2, 0, 100);
  const rawRobustZScore =
    mad > Math.max(config.noiseFloor, Number.EPSILON)
      ? (0.6745 * (magnitude - cohortMedian)) / mad
      : null;
  const robustZScore =
    rawRobustZScore !== null && Number.isFinite(rawRobustZScore)
      ? clamp(rawRobustZScore, -1_000, 1_000)
      : null;

  return {
    ready: true,
    sampleCount,
    percentile,
    score,
    median: cohortMedian,
    mad,
    robustZScore
  };
}

function unavailableStrength(input: {
  metric: DerivativeStrengthMetricName;
  ageBucket: DerivativeStrengthAgeBucket;
  config: DerivativeStrengthMetricConfig;
  reasonCodes: string[];
}): NormalizedDerivativeStrength {
  return {
    schemaVersion: 1,
    method: derivativeStrengthNormalizationMethod,
    metric: input.metric,
    unit: input.config.unit,
    rawValue: null,
    normalizedScore: 0,
    confidenceAdjustedScore: 0,
    positiveScore: 0,
    adverseScore: 0,
    absoluteScore: 0,
    cohortScore: null,
    cohortPercentile: null,
    robustZScore: null,
    cohortMedian: null,
    cohortMad: null,
    cohortSampleCount: 0,
    cohortReady: false,
    ageBucket: input.ageBucket,
    direction: "unavailable",
    strength: "none",
    confidence: zeroConfidence(),
    reasonCodes: unique([
      "DERIVATIVE_STRENGTH_CANONICAL_NORMALIZATION",
      ...input.reasonCodes,
      "DERIVATIVE_STRENGTH_UNAVAILABLE",
      "DERIVATIVE_STRENGTH_NOT_SIGNAL_CALIBRATED"
    ])
  };
}

function strengthForNormalizedScore(
  score: number,
  config: DerivativeStrengthMetricConfig
): DerivativeStrengthLabel {
  const weakScore = (config.weakAt / config.explosiveAt) * 100;
  const moderateScore = (config.moderateAt / config.explosiveAt) * 100;
  const strongScore = (config.strongAt / config.explosiveAt) * 100;

  return score >= 100
    ? "explosive"
    : score >= strongScore
      ? "strong"
      : score >= moderateScore
        ? "moderate"
        : score >= weakScore
          ? "weak"
          : "none";
}

function median(values: number[]): number {
  const midpoint = Math.floor(values.length / 2);
  const upper = values[midpoint] ?? 0;

  if (values.length % 2 === 1) {
    return upper;
  }

  const lower = values[midpoint - 1] ?? upper;
  return lower + (upper - lower) / 2;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function zeroConfidence(): DerivativeStrengthConfidence {
  return {
    overall: 0,
    sample: 0,
    distinctTimestamp: 0,
    span: 0,
    freshness: 0
  };
}

function nullableRound(value: number | null): number | null {
  return value === null ? null : round(value);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
