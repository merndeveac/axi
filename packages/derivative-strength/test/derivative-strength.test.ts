import { describe, expect, it } from "vitest";
import {
  derivativeStrengthMetricConfig,
  getDerivativeStrengthAgeBucket,
  getDerivativeStrengthRuntimeContract,
  normalizeDerivativeStrength
} from "../src";

describe("@axi/derivative-strength", () => {
  it("uses the absolute reference when the age cohort is too small", () => {
    const strength = normalizeDerivativeStrength({
      metric: "volume_velocity_sol",
      rawValue: 0.75,
      ageSeconds: 8,
      cohortValues: [0.1, 0.2],
      ...completeContext(1)
    });

    expect(strength).toMatchObject({
      method: "hybrid_absolute_robust_age_cohort",
      normalizedScore: 100,
      positiveScore: 100,
      adverseScore: 0,
      direction: "up",
      strength: "explosive",
      ageBucket: "0-10s",
      cohortReady: false
    });
    expect(strength.reasonCodes).toContain(
      "DERIVATIVE_STRENGTH_ABSOLUTE_FALLBACK"
    );
  });

  it("keeps adverse magnitude out of the positive score", () => {
    const strength = normalizeDerivativeStrength({
      metric: "price_velocity_pct",
      rawValue: -1.4,
      ageSeconds: 20,
      ...completeContext(1)
    });

    expect(strength.normalizedScore).toBe(100);
    expect(strength.positiveScore).toBe(0);
    expect(strength.adverseScore).toBe(100);
    expect(strength.direction).toBe("down");
    expect(strength.reasonCodes).toContain(
      "DERIVATIVE_STRENGTH_ADVERSE_DIRECTION"
    );
  });

  it("applies robust same-age cohort normalization deterministically", () => {
    const input = {
      metric: "buyer_velocity" as const,
      rawValue: 0.2,
      ageSeconds: 45,
      cohortValues: [0.05, 0.08, 0.1, 0.12, 0.15],
      ...completeContext(1)
    };
    const first = normalizeDerivativeStrength(input);
    const second = normalizeDerivativeStrength({
      ...input,
      cohortValues: [...input.cohortValues].reverse()
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ageBucket: "30-60s",
      cohortReady: true,
      cohortSampleCount: 5,
      cohortPercentile: 100,
      cohortMedian: 0.1
    });
    expect(first.normalizedScore).toBeGreaterThan(first.absoluteScore);
  });

  it("reports confidence separately from normalized magnitude", () => {
    const low = normalizeDerivativeStrength({
      metric: "trade_velocity",
      rawValue: 0.8,
      ageSeconds: 25,
      availabilityStatus: "available",
      sampleCount: 2,
      distinctTimestampCount: 2,
      spanMs: 1_000,
      windowMs: 10_000,
      freshnessMs: 8_000
    });
    const high = normalizeDerivativeStrength({
      metric: "trade_velocity",
      rawValue: 0.8,
      ageSeconds: 25,
      ...completeContext(1)
    });

    expect(low.normalizedScore).toBe(100);
    expect(low.confidence.overall).toBeLessThan(high.confidence.overall);
    expect(low.confidenceAdjustedScore).toBeLessThan(
      high.confidenceAdjustedScore
    );
  });

  it("preserves unavailable states instead of fabricating zero strength", () => {
    const strength = normalizeDerivativeStrength({
      metric: "volume_acceleration_sol",
      rawValue: null,
      ageSeconds: 5,
      availabilityStatus: "insufficient_samples",
      sampleCount: 2,
      distinctTimestampCount: 2,
      spanMs: 1_000,
      windowMs: 5_000,
      freshnessMs: 0
    });

    expect(strength).toMatchObject({
      rawValue: null,
      normalizedScore: 0,
      direction: "unavailable",
      strength: "none",
      confidence: { overall: 0 }
    });
    expect(strength.reasonCodes).toContain(
      "DERIVATIVE_STATUS_INSUFFICIENT_SAMPLES"
    );
  });

  it("filters non-finite cohort values and never emits non-finite JSON", () => {
    const strength = normalizeDerivativeStrength({
      metric: "buy_pressure_velocity",
      rawValue: 0.06,
      ageSeconds: 90,
      cohortValues: [0.01, 0.02, 0.03, 0.04, 0.05, Number.NaN, Infinity],
      ...completeContext(1)
    });

    expect(strength.cohortSampleCount).toBe(5);
    expect(JSON.stringify(strength)).not.toMatch(/NaN|Infinity/);
  });

  it("keeps extreme finite cohorts numerically bounded", () => {
    const strength = normalizeDerivativeStrength({
      metric: "volume_velocity_usd",
      rawValue: Number.MAX_VALUE,
      ageSeconds: 15,
      cohortValues: Array.from({ length: 6 }, () => Number.MAX_VALUE),
      ...completeContext(1)
    });

    expect(strength.normalizedScore).toBe(75);
    expect(strength.strength).toBe("strong");
    expect(strength.cohortMedian).toBe(Number.MAX_VALUE);
    expect(strength.robustZScore).toBeNull();
    expect(JSON.stringify(strength)).not.toMatch(/NaN|Infinity/);
  });

  it("uses explicit non-overlapping age buckets", () => {
    expect(getDerivativeStrengthAgeBucket(0)).toBe("0-10s");
    expect(getDerivativeStrengthAgeBucket(10)).toBe("10-30s");
    expect(getDerivativeStrengthAgeBucket(30)).toBe("30-60s");
    expect(getDerivativeStrengthAgeBucket(300)).toBe("300s+");
    expect(getDerivativeStrengthAgeBucket(Number.NaN)).toBe("0-10s");
  });

  it("publishes ordered thresholds and a paper-only runtime contract", () => {
    for (const config of Object.values(derivativeStrengthMetricConfig)) {
      expect(config.noiseFloor).toBeLessThan(config.weakAt);
      expect(config.weakAt).toBeLessThan(config.moderateAt);
      expect(config.moderateAt).toBeLessThan(config.strongAt);
      expect(config.strongAt).toBeLessThan(config.explosiveAt);
    }

    expect(getDerivativeStrengthRuntimeContract()).toMatchObject({
      canonical: true,
      minimumRobustCohortSize: 5,
      confidenceAppliedToSignalScore: false,
      calibrationStatus: "pending",
      tradingDisabled: true
    });
  });
});

function completeContext(order: 1 | 2) {
  return {
    availabilityStatus: "available" as const,
    sampleCount: order === 1 ? 8 : 9,
    distinctTimestampCount: order === 1 ? 8 : 9,
    spanMs: 10_000,
    windowMs: 10_000,
    freshnessMs: 0
  };
}
