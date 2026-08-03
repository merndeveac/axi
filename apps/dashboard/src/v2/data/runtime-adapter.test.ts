import { describe, expect, it } from "vitest";
import { adaptRuntimeStatusV2, type CanonicalRuntimeStatus } from "./runtime-adapter";

function canonical(): CanonicalRuntimeStatus {
  return {
    paperOnly: true,
    tradingDisabled: true,
    api: { online: true, wsOnline: true, lastUpdatedAt: "2025-06-14T12:00:00.000Z" },
    liveDiscovery: { connected: true, connecting: false, stopped: false },
    meteredPriceAction: {
      state: "READY",
      canArm: false,
      canStart: true,
      canStop: false,
      acknowledgedCost: true,
      trackedMintCount: 0,
      estimatedCostSol: 0,
      sessionCostCapSol: 0.0001,
      budgetRemainingSol: 0.0001,
      maxConcurrentMints: 3,
      maxEventsPerSession: 1_000,
      blockers: [],
      warnings: []
    },
    dataWallet: { balanceSol: null, lastBalanceCheckAt: null },
    process: { pid: 42, startedAt: "2025-06-14T11:59:00.000Z" },
    safety: {
      accountTradesEnabled: false,
      lightningExecutionEnabled: false,
      localTransactionApiEnabled: false,
      privateKeysLoaded: false,
      liveTradingEnabled: false
    }
  };
}

describe("canonical runtime adapter", () => {
  it("uses backend capability fields without recreating gates", () => {
    const adapted = adaptRuntimeStatusV2(canonical());
    expect(adapted.canStart.allowed).toBe(true);
    expect(adapted.canArm.allowed).toBe(false);
    expect(adapted.acknowledged).toBe(true);
    expect(adapted.walletBalanceSol.availability).toBe("unproven");
  });
});
