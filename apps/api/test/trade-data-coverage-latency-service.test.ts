import { describe, expect, it } from "vitest";
import { runProductionTradeDataLatencyCheck } from "../src/trade-data-coverage-latency-service";

describe("production trade-data latency check", () => {
  it("preserves canonical output while bounding the loaded production queue", async () => {
    const result = await runProductionTradeDataLatencyCheck();

    expect(result.status).toBe("PRODUCTION_LATENCY_CHECK_PASSED");
    expect(result.candidateFixtureCount).toBe(500);
    expect(result.outputEquivalent).toBe(true);
    expect(result.networkConnections).toBe(0);
    expect(result.paidStreamsStarted).toBe(0);

    for (const scenario of [result.sequential21, result.stress65]) {
      expect(scenario.candidateRowsLoaded).toBeGreaterThanOrEqual(500);
      expect(scenario.exactlyOnce).toBe(true);
      expect(scenario.decisionScannerParity).toBe(true);
      expect(scenario.scannerDeltaCount).toBe(scenario.canonicalTradeCount);
      expect(scenario.lifecycleOrdered).toBe(true);
      expect(scenario.stopToUnsubscribeMs).toBeGreaterThanOrEqual(0);
      expect(scenario.latency.receiveToScannerP95Ms).toBeLessThanOrEqual(1_000);
      expect(scenario.latency.receiveToScannerMaxMs).toBeLessThanOrEqual(2_000);
    }
  }, 30_000);
});
