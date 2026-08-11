import { describe, expect, it } from "vitest";
import {
  getCoverageOwnedSubscriptionWindowMs,
  tradeDataCoverageTrackingExpiryOwner
} from "../src/trade-data-coverage-lifecycle";

describe("trade data coverage lifecycle ownership", () => {
  it("explicitly assigns tracking expiry to the coverage validator", () => {
    expect(tradeDataCoverageTrackingExpiryOwner).toBe("coverage_validator");
  });

  it("keeps provider and metered expiry strictly after the coverage stop boundary", () => {
    expect(
      getCoverageOwnedSubscriptionWindowMs({
        maxRuntimeMs: 90_000,
        postStopGraceMs: 5_000
      })
    ).toBe(95_001);
    expect(
      getCoverageOwnedSubscriptionWindowMs({
        maxRuntimeMs: 1_000,
        postStopGraceMs: 0
      })
    ).toBeGreaterThan(1_000);
  });
});
