import { describe, expect, it } from "vitest";
import {
  computeCanonicalDerivatives,
  type DerivativeObservation
} from "../src";

const mint = "Derivative111111111111111111111111111111111";

describe("@axi/derivatives", () => {
  it("computes first and second derivatives with explicit units", () => {
    const snapshot = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [
        trade("a", 1, { priceSol: 1, volumeSol: 1 }),
        trade("b", 3, { priceSol: 2, volumeSol: 2 }),
        trade("c", 5, { priceSol: 4, volumeSol: 5 })
      ]
    });
    const metrics = snapshot.windows["5s"].metrics;

    expect(metrics.volumeVelocitySolPerSec.value).toBe(1.6);
    expect(metrics.volumeAccelerationSolPerSec2.value).toBe(0.96);
    expect(metrics.priceVelocityPctPerSec.value).toBe(75);
    expect(metrics.priceAccelerationPctPerSec2.value).toBe(0);
    expect(metrics.priceSolVelocityPerSec.value).toBe(0.75);
    expect(metrics.priceSolAccelerationPerSec2.value).toBe(0.25);
    expect(metrics.buyerVelocityPerSec.value).toBe(0.6);
    expect(metrics.buyerAccelerationPerSec2.value).toBe(0.16);
    expect(metrics.tradeVelocityPerSec.value).toBe(0.6);
    expect(metrics.tradeAccelerationPerSec2.value).toBe(0.16);
    expect(metrics.buyPressureVelocityPerSec.value).toBe(0);
    expect(metrics.buyPressureAccelerationPerSec2.value).toBe(0);
  });

  it("distinguishes unavailable derivatives from a valid flat zero", () => {
    const one = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [trade("one", 5, { priceSol: 2 })]
    });
    const flat = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [
        trade("a", 1, { priceSol: 2 }),
        trade("b", 3, { priceSol: 2 }),
        trade("c", 5, { priceSol: 2 })
      ]
    });

    expect(one.primary.metrics.priceVelocityPctPerSec).toMatchObject({
      value: null,
      status: "insufficient_samples"
    });
    expect(flat.primary.metrics.priceVelocityPctPerSec).toMatchObject({
      value: 0,
      status: "available"
    });
    expect(flat.primary.metrics.priceAccelerationPctPerSec2).toMatchObject({
      value: 0,
      status: "available"
    });
  });

  it("requires two distinct timestamps for d1 and three for d2", () => {
    const sameTime = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [trade("a", 5), trade("b", 5), trade("c", 5)]
    });
    const twoTimes = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [trade("a", 1), trade("b", 5)]
    });

    expect(sameTime.primary.metrics.tradeVelocityPerSec.status).toBe(
      "insufficient_span"
    );
    expect(twoTimes.primary.metrics.tradeVelocityPerSec.status).toBe(
      "available"
    );
    expect(twoTimes.primary.metrics.tradeAccelerationPerSec2.status).toBe(
      "insufficient_samples"
    );
  });

  it("deduplicates ids and is invariant to ingestion order", () => {
    const observations = [
      trade("b", 3, { priceSol: 2 }),
      trade("a", 1, { priceSol: 1 }),
      trade("b", 3, { priceSol: 2 })
    ];
    const first = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations
    });
    const second = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [...observations].reverse()
    });

    expect(first).toEqual(second);
    expect(first.observationCount).toBe(2);
    expect(first.duplicateObservationCount).toBe(1);
  });

  it("resolves conflicting duplicate ids deterministically", () => {
    const observations = [
      trade("duplicate", 3, { priceSol: 3 }),
      trade("duplicate", 3, { priceSol: 2 }),
      trade("anchor", 1, { priceSol: 1 })
    ];
    const first = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations
    });
    const second = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [...observations].reverse()
    });

    expect(first).toEqual(second);
    expect(first.duplicateObservationCount).toBe(1);
  });

  it("falls back to USD without fabricating SOL derivatives", () => {
    const snapshot = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [
        trade("a", 1, {
          priceSol: null,
          priceUsd: 2,
          volumeSol: null,
          volumeUsd: 10
        }),
        trade("b", 5, {
          priceSol: null,
          priceUsd: 3,
          volumeSol: null,
          volumeUsd: 20
        })
      ]
    });

    expect(snapshot.primary.priceSource).toBe("USD");
    expect(snapshot.primary.metrics.priceVelocityPctPerSec.value).toBe(12.5);
    expect(snapshot.primary.metrics.volumeVelocityUsdPerSec.value).toBe(6);
    expect(snapshot.primary.metrics.volumeVelocitySolPerSec.value).toBeNull();
  });

  it("does not invent buyer identities", () => {
    const snapshot = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [
        trade("a", 1, { trader: null }),
        trade("b", 5, { trader: null })
      ]
    });

    expect(snapshot.primary.metrics.buyerVelocityPerSec).toMatchObject({
      value: null,
      status: "source_unavailable"
    });
    expect(snapshot.primary.metrics.buyerVelocityPerSec.reasonCodes).toContain(
      "DERIVATIVE_TRADER_IDENTITIES_UNAVAILABLE"
    );
  });

  it("counts each buyer only at their first arrival", () => {
    const snapshot = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [
        trade("a", 1, { trader: "buyer-a" }),
        trade("b", 3, { trader: "buyer-a" }),
        trade("c", 5, { trader: "buyer-b" })
      ]
    });

    expect(snapshot.primary.metrics.buyerVelocityPerSec.value).toBe(0.4);
    expect(snapshot.primary.metrics.buyerAccelerationPerSec2.value).toBe(0);
  });

  it("rejects invalid observations and never emits NaN or Infinity", () => {
    const snapshot = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [
        trade("valid", 1),
        { ...trade("invalid", 2), timestamp: "not-a-date" },
        trade("nan", 3, { priceSol: Number.NaN }),
        trade("future", 6)
      ]
    });

    expect(snapshot.invalidObservationCount).toBe(2);
    expect(snapshot.futureObservationCount).toBe(1);
    expect(snapshot.observationCount).toBe(1);
    expect(snapshot.reasonCodes).toContain(
      "DERIVATIVE_INVALID_OBSERVATIONS_REJECTED"
    );
    expect(snapshot.reasonCodes).toContain(
      "DERIVATIVE_FUTURE_OBSERVATIONS_REJECTED"
    );
    expect(JSON.stringify(snapshot)).not.toMatch(/NaN|Infinity/);
  });

  it("marks overflowing calculations unavailable instead of returning zero", () => {
    const snapshot = computeCanonicalDerivatives({
      mint,
      evaluatedAt: at(5),
      observations: [
        trade("a", 1, { volumeSol: Number.MAX_VALUE }),
        trade("b", 5, { volumeSol: Number.MAX_VALUE })
      ]
    });

    expect(snapshot.primary.metrics.volumeVelocitySolPerSec).toMatchObject({
      value: null,
      status: "invalid_result",
      reasonCodes: ["DERIVATIVE_NONFINITE_RESULT_REJECTED"]
    });
  });
});

function trade(
  id: string,
  second: number,
  overrides: Partial<DerivativeObservation> = {}
): DerivativeObservation {
  return {
    id,
    timestamp: at(second),
    side: "buy",
    trader: `trader-${id}`,
    priceSol: 1,
    priceUsd: null,
    volumeSol: 1,
    volumeUsd: null,
    ...overrides
  };
}

function at(second: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
}
