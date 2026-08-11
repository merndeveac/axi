import { describe, expect, it } from "vitest";
import { runTradeDataCoverageLifecycleCheck } from "../src/trade-data-coverage-lifecycle-check-service";

describe("trade-data coverage expiry ownership", () => {
  it("keeps a zero-trade coverage mint tracked through every pre-runtime checkpoint", async () => {
    const result = await runTradeDataCoverageLifecycleCheck({
      scenario: "zero-trade",
      runtimeMs: 90_000,
      staleNoTradesMs: 30_000,
      graceMs: 5_000
    });

    expect(result).toMatchObject({
      success: true,
      expiryOwner: "coverage_validator",
      stopReason: "MAX_RUNTIME",
      stopRequestedCount: 1,
      unsubscribeSentCount: 1,
      unsubscribeAcknowledgedCount: 1,
      finalizationCount: 1,
      stopToUnsubscribeMs: 0,
      stopSequence: 5,
      unsubscribeSequence: 6,
      lifecycleSequenceValid: true,
      lifecycleResidual: 0,
      staleTimerSuppressed: true,
      ordinaryStaleReasonObserved: true,
      activeTrackedMints: 0,
      pendingTimerCount: 0,
      externalNetworkConnections: 0,
      paidStreamStarted: false,
      postFinalizationMutationCount: 0,
      restartSafeRetrieval: true,
      cleanupCompleted: true
    });
    expect(result.checkpoints).toEqual([
      expect.objectContaining({ atMs: 29_999, tracked: true }),
      expect.objectContaining({ atMs: 30_000, tracked: true }),
      expect.objectContaining({ atMs: 30_001, tracked: true }),
      expect.objectContaining({ atMs: 60_000, tracked: true }),
      expect.objectContaining({ atMs: 89_999, tracked: true }),
      expect.objectContaining({
        atMs: 90_000,
        tracked: false,
        stopRequestedCount: 1,
        unsubscribeSentCount: 1
      }),
      expect.objectContaining({
        atMs: "finalization",
        finalizationCount: 1
      })
    ]);
    expect(
      result.checkpoints
        .slice(0, 5)
        .every(
          (checkpoint) =>
            checkpoint.stopRequestedCount === 0 &&
            checkpoint.unsubscribeSentCount === 0 &&
            checkpoint.finalizationCount === 0 &&
            !checkpoint.staleReasonObserved
        )
    ).toBe(true);
  });

  it("preserves the ordinary service-owned 30-second stale policy", async () => {
    const result = await runTradeDataCoverageLifecycleCheck({
      scenario: "service-owned-control",
      runtimeMs: 90_000,
      staleNoTradesMs: 30_000,
      graceMs: 5_000
    });

    expect(result).toMatchObject({
      success: true,
      expiryOwner: "metered_service",
      staleTimerSuppressed: false,
      ordinaryStaleReasonObserved: true,
      unsubscribeSentCount: 1,
      activeTrackedMints: 0,
      pendingTimerCount: 0,
      cleanupCompleted: true
    });
    expect(result.checkpoints).toEqual([
      expect.objectContaining({ atMs: 0, tracked: true }),
      expect.objectContaining({ atMs: 29_999, tracked: true }),
      expect.objectContaining({
        atMs: 30_000,
        tracked: false,
        staleReasonObserved: true,
        unsubscribeSentCount: 1
      })
    ]);
  });
});
