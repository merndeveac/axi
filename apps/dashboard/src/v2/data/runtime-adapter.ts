import type { RuntimePhaseV2, RuntimeSummaryV2 } from "@axi/shared";
import { uiField } from "../contracts/ui-field";

export type CanonicalRuntimeStatus = {
  paperOnly: true;
  tradingDisabled: true;
  api: { online: boolean; wsOnline: boolean; lastUpdatedAt: string };
  liveDiscovery: {
    connected: boolean;
    connecting: boolean;
    stopped: boolean;
  };
  meteredPriceAction: {
    state: RuntimePhaseV2;
    canArm: boolean;
    canStart: boolean;
    canStop: boolean;
    acknowledgedCost: boolean;
    trackedMintCount: number;
    estimatedCostSol: number;
    sessionCostCapSol: number;
    budgetRemainingSol: number;
    maxConcurrentMints: number;
    maxEventsPerSession: number;
    blockers: string[];
    warnings: string[];
  };
  dataWallet: {
    balanceSol: number | null;
    lastBalanceCheckAt: string | null;
  };
  process: { pid: number; startedAt: string };
  safety: {
    accountTradesEnabled: false;
    lightningExecutionEnabled: false;
    localTransactionApiEnabled: false;
    privateKeysLoaded: false;
    liveTradingEnabled: false;
  };
};

function capability(allowed: boolean, blockers: string[], fallback: string) {
  return { allowed, blocker: allowed ? null : (blockers[0] ?? fallback) };
}

export function adaptRuntimeStatusV2(
  status: CanonicalRuntimeStatus
): RuntimeSummaryV2 {
  const metered = status.meteredPriceAction;
  const observedAt = status.api.lastUpdatedAt;
  return {
    phase: metered.state,
    paperOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true,
    apiOnline: status.api.online,
    websocketOnline: status.api.wsOnline,
    discovery: status.liveDiscovery.connected
      ? "active"
      : status.liveDiscovery.connecting
        ? "starting"
        : status.liveDiscovery.stopped
          ? "stopped"
          : "offline",
    acknowledged: metered.acknowledgedCost,
    canArm: capability(metered.canArm, metered.blockers, "Arming unavailable"),
    canStart: capability(metered.canStart, metered.blockers, "Start unavailable"),
    canStop: capability(metered.canStop, metered.blockers, "Stop unavailable"),
    spendSol: uiField(metered.estimatedCostSol, { source: "runtime", observedAt }),
    capSol: uiField(metered.sessionCostCapSol, { source: "runtime", observedAt }),
    remainingSol: uiField(metered.budgetRemainingSol, { source: "runtime", observedAt }),
    walletBalanceSol:
      status.dataWallet.balanceSol === null
        ? uiField<number>(null, {
            availability: "unproven",
            source: "runtime",
            observedAt: status.dataWallet.lastBalanceCheckAt,
            reason: "Data-wallet balance unknown"
          })
        : uiField(status.dataWallet.balanceSol, {
            source: "runtime",
            observedAt: status.dataWallet.lastBalanceCheckAt
          }),
    trackedMintCount: uiField(metered.trackedMintCount, {
      source: "runtime",
      observedAt
    }),
    maximumConcurrentMints: metered.maxConcurrentMints || 3,
    maximumEvents: metered.maxEventsPerSession || 1_000,
    durationSeconds: null,
    warning: metered.warnings[0] ?? metered.blockers[0] ?? null,
    processSessionId: `${status.process.pid}:${status.process.startedAt}`,
    updatedAt: observedAt
  };
}
