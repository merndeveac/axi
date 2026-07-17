import { describe, expect, it } from "vitest";
import {
  defaultCapacityScenarios,
  evaluateCapacityModel,
  evaluateCapacityScenarios,
  type CapacityModelInput
} from "../src/index";

const baseInput: CapacityModelInput = {
  observationWindowMs: 60_000,
  launchCount: 2,
  tradeEventCount: 120,
  concurrentSlots: 3,
  trackedMintCount: 2,
  protectedMintCount: 0,
  initialObservationMs: 30_000,
  extendedObservationMs: 300_000,
  staleNoTradesMs: 30_000,
  totalEventsThisSession: 100,
  maxEventsPerSession: 1_000,
  estimatedSessionCostSol: 0.0001,
  maxSessionCostSol: 0.001,
  eventCostSolPer10000: 0.01
};

describe("@axi/capacity-model", () => {
  it("quantifies full initial coverage for one launch every 30 seconds", () => {
    const result = evaluateCapacityModel(baseInput);

    expect(result.observation.launchRatePerMinute).toBe(2);
    expect(result.slots.requiredInitialSlots).toBe(1);
    expect(result.slots.initialCoverageRatio).toBe(1);
    expect(result.slots.allLaunchesCanReceiveInitialWindow).toBe(true);
    expect(result.policy.schedulerMutationApplied).toBe(false);
  });

  it("shows that three slots cannot cover one launch every five seconds for 30 seconds", () => {
    const result = evaluateCapacityModel({
      ...baseInput,
      launchCount: 12
    });

    expect(result.slots.requiredInitialSlots).toBe(6);
    expect(result.slots.requiredInitialSlotsRoundedUp).toBe(6);
    expect(result.slots.initialCoverageRatio).toBe(0.5);
    expect(result.slots.maximumFullyObservedLaunchesPerMinute).toBe(6);
    expect(result.budget.bindingConstraint).toBe("concurrency");
    expect(result.reasonCodes).toContain("INITIAL_COVERAGE_CAPACITY_SHORTFALL");
  });

  it("accounts for protected slots before estimating newest-token coverage", () => {
    const result = evaluateCapacityModel({
      ...baseInput,
      launchCount: 6,
      protectedMintCount: 2
    });

    expect(result.slots.availableNewestSlots).toBe(1);
    expect(result.slots.requiredInitialSlots).toBe(3);
    expect(result.slots.initialCoverageRatio).toBeCloseTo(1 / 3);
    expect(result.slots.minimumTotalSlotsForFullInitialCoverage).toBe(5);
  });

  it("projects activity cost and identifies the binding session cap", () => {
    const result = evaluateCapacityModel(baseInput);

    expect(result.activity.projectedEventsPerSecondAtCapacity).toBe(3);
    expect(result.activity.projectedHourlyEventsAtCapacity).toBe(10_800);
    expect(result.activity.projectedHourlyCostSolAtCapacity).toBe(0.0108);
    expect(result.budget.remainingEventsByEventCap).toBe(900);
    expect(result.budget.remainingEventsByCostCap).toBe(900);
    expect(result.budget.effectiveRemainingEvents).toBe(900);
    expect(result.budget.bindingConstraint).toBe("cost_cap");
  });

  it("never emits NaN or Infinity for empty observations", () => {
    const result = evaluateCapacityModel({
      ...baseInput,
      observationWindowMs: 0,
      launchCount: 0,
      tradeEventCount: 0,
      concurrentSlots: 0,
      trackedMintCount: 0,
      maxEventsPerSession: 0,
      maxSessionCostSol: 0,
      eventCostSolPer10000: 0
    });

    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
    expect(result.observation.launchConfidence).toBe("none");
    expect(result.observation.eventRateConfidence).toBe("none");
  });

  it("covers the required launch-rate and token-activity scenarios", () => {
    const results = evaluateCapacityScenarios(baseInput);

    expect(defaultCapacityScenarios).toHaveLength(9);
    expect(results.map((scenario) => scenario.id)).toEqual(
      expect.arrayContaining([
        "launch-30s-quiet",
        "launch-10s-average",
        "launch-5s-viral"
      ])
    );
    expect(
      results.find((scenario) => scenario.id === "launch-5s-average")
        ?.initialCoverageRatio
    ).toBe(0.5);
  });
});
