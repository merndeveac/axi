import { describe, expect, it } from "vitest";
import { createRuntimeCapacityReport } from "../src/runtime-capacity";
import type {
  MeteredLaunchDataCost,
  MeteredLaunchDataRateObservation,
  MeteredLaunchDataStatus
} from "../src/metered-launch-data-service";

const now = "2026-07-16T12:01:00.000Z";

describe("runtime capacity report", () => {
  it("uses only discovery samples inside the effective runtime window", () => {
    const report = createRuntimeCapacityReport({
      runtimeSessionId: "runtime-capacity-test",
      runtimeStartedAt: "2026-07-16T12:00:00.000Z",
      launchDiscoveryTimestamps: [
        "2026-07-16T12:00:01.000Z",
        "2026-07-16T12:00:31.000Z",
        "2026-07-16T11:59:59.000Z"
      ],
      meteredStatus,
      meteredCost,
      rateObservation,
      now
    });

    expect(report.observation.launchCount).toBe(2);
    expect(report.observation.launchRatePerMinute).toBe(2);
    expect(report.slots.requiredInitialSlots).toBe(1);
    expect(report.sources.model).toBe("@axi/capacity-model");
    expect(report.scenarios).toHaveLength(9);
    expect(report.policy.schedulerMutationApplied).toBe(false);
  });

  it("does not divide a new runtime by a full configured window", () => {
    const report = createRuntimeCapacityReport({
      runtimeSessionId: "runtime-capacity-test",
      runtimeStartedAt: "2026-07-16T12:00:50.000Z",
      launchDiscoveryTimestamps: ["2026-07-16T12:00:55.000Z"],
      meteredStatus,
      meteredCost,
      rateObservation: { ...rateObservation, eventCount: 10 },
      now
    });

    expect(report.observation.windowMs).toBe(10_000);
    expect(report.observation.launchRatePerMinute).toBe(6);
    expect(report.observation.observedEventsPerSecond).toBe(1);
  });
});

const meteredStatus: MeteredLaunchDataStatus = {
  enabled: true,
  controlsEnabled: true,
  capabilityConfigured: true,
  active: false,
  acknowledgedCost: false,
  envAcknowledgedCost: false,
  sessionAcknowledgedCost: false,
  ackSource: "none",
  requireUiAck: true,
  requireDataWalletReady: true,
  ready: false,
  canArm: true,
  canStart: false,
  canStop: false,
  mode: "newest",
  provider: "pumpportal",
  liveDiscoveryEnabled: true,
  liveDiscoveryActive: true,
  apiKeyConfigured: true,
  dataWalletConfigured: true,
  dataWalletBalanceSol: 0.05,
  dataWalletBalanceStatus: "ok",
  dataWalletEstimatedEventsRemaining: 50_000,
  maxConcurrentMints: 3,
  trackedMintCount: 2,
  protectedMintCount: 0,
  initialTrackMs: 30_000,
  extendedTrackMs: 300_000,
  protectedMaxAgeMs: 900_000,
  staleNoTradesMs: 30_000,
  projectRateWindowMs: 60_000,
  eventCostSolPer10000: 0.01,
  maxEventsPerMint: 250,
  maxEventsPerSession: 1_000,
  maxUiSessionCostSol: 0.001,
  totalEventsThisSession: 120,
  estimatedCostSol: 0.00012,
  maxSessionCostSol: 0.001,
  remainingBudgetSol: 0.00088,
  projectedCostPerHourSol: 0.0072,
  budgetReached: false,
  reasonCodes: [],
  blockers: [],
  warnings: [],
  trackedMints: [],
  lastStopReason: null,
  startedAt: null,
  paperOnly: true,
  dataOnly: true,
  tradingDisabled: true
};

const meteredCost: MeteredLaunchDataCost = {
  eventCostSolPer10000: 0.01,
  estimatedCostPerEventSol: 0.000001,
  estimatedCostSol: 0.00012,
  maxSessionCostSol: 0.001,
  remainingBudgetSol: 0.00088,
  remainingEventsByBudget: 880,
  projectedCostPerHourSol: 0.0072,
  totalEventsThisSession: 120,
  maxEventsPerSession: 1_000,
  budgetReached: false,
  reasonCodes: [],
  paperOnly: true,
  dataOnly: true,
  tradingDisabled: true
};

const rateObservation: MeteredLaunchDataRateObservation = {
  eventCount: 120,
  eventsPerSecond: 2,
  windowMs: 60_000
};
