import { describe, expect, it } from "vitest";
import {
  createEvidenceCampaignBudgetPlan,
  createEvidenceCampaignRequestInit,
  createEvidenceCampaignSubsessionPlan,
  evidenceCampaignMaximumConcurrentMints,
  evidenceCampaignReadAttemptTimeoutMs,
  evidenceCampaignReadRetryDelaysMs,
  isEvidenceCampaignReadOnlyRequest,
  isEvidenceCampaignRetryableStatus,
  reconcileEvidenceCampaignSubsessionUsage,
  resolveEvidenceCampaignRepositoryRoot
} from "../src/evidence-campaign-policy";

describe("evidence campaign policy", () => {
  it("preserves the provider reserve when the requested budget equals the wallet", () => {
    const plan = createEvidenceCampaignBudgetPlan({
      requestedBudgetSol: 0.25,
      initialBalanceSol: 0.250001,
      eventCostSolPer10000: 0.01
    });

    expect(plan.effectiveBudgetSol).toBe(0.229001);
    expect(plan.limitedByWalletReserve).toBe(true);
    expect(plan.reasonCodes).toContain(
      "EVIDENCE_CAMPAIGN_BUDGET_LIMITED_BY_WALLET_RESERVE"
    );
    expect(
      plan.initialBalanceSol - plan.effectiveBudgetSol
    ).toBeGreaterThanOrEqual(plan.minimumWalletReserveSol);
    expect(plan.collectionBudgetSol).toBeLessThan(plan.effectiveBudgetSol);
    expect(plan.providerInFlightReserveSol).toBe(0.0005);
  });

  it("reserves both outcome tails and provider in-flight delivery below the hard ceiling", () => {
    const plan = createEvidenceCampaignBudgetPlan({
      requestedBudgetSol: 0.005,
      initialBalanceSol: 0.250001,
      eventCostSolPer10000: 0.01
    });

    expect(plan).toMatchObject({
      effectiveBudgetSol: 0.005,
      collectionBudgetSol: 0.0045,
      providerInFlightReserveSol: 0.0005,
      outcomeTailReserveSol: 0.0009,
      trainSpendTargetSol: 0.00162,
      validationSpendTargetSol: 0.00108
    });
    expect(
      plan.trainSpendTargetSol +
        plan.validationSpendTargetSol +
        plan.outcomeTailReserveSol * 2 +
        plan.providerInFlightReserveSol
    ).toBeCloseTo(plan.effectiveBudgetSol, 12);
    expect(evidenceCampaignMaximumConcurrentMints).toBe(3);
  });

  it("rejects campaigns above the absolute quarter-SOL ceiling", () => {
    expect(() =>
      createEvidenceCampaignBudgetPlan({
        requestedBudgetSol: 0.250001,
        initialBalanceSol: 1,
        eventCostSolPer10000: 0.01
      })
    ).toThrow("cannot exceed 0.25 SOL");
  });

  it("uses bounded sub-sessions and shrinks the final session", () => {
    expect(
      createEvidenceCampaignSubsessionPlan({
        remainingBudgetSol: 0.25,
        configuredCostCapSol: 0.01,
        configuredEventCap: 50_000,
        eventCostSolPer10000: 0.01
      })
    ).toMatchObject({ costCapSol: 0.0005, eventCap: 500 });

    expect(
      createEvidenceCampaignSubsessionPlan({
        remainingBudgetSol: 0.000123,
        configuredCostCapSol: 0.001,
        configuredEventCap: 1000,
        eventCostSolPer10000: 0.01
      })
    ).toMatchObject({ costCapSol: 0.000123, eventCap: 123 });
  });

  it("does not label bodyless control requests as JSON", () => {
    expect(
      createEvidenceCampaignRequestInit({ method: "POST" }).headers
    ).toEqual({});
    expect(
      createEvidenceCampaignRequestInit({ method: "POST", body: "{}" }).headers
    ).toEqual({ "content-type": "application/json" });
  });

  it("does not replay a stopped provider counter after the final subsession was committed", () => {
    expect(
      reconcileEvidenceCampaignSubsessionUsage({
        checkpoint: {
          currentSubsessionCostSol: 0,
          currentSubsessionEventCount: 0
        },
        runtime: {
          currentSubsessionCostSol: 0.000705,
          currentSubsessionEventCount: 705
        },
        alreadyCommitted: true
      })
    ).toEqual({
      currentSubsessionCostSol: 0,
      currentSubsessionEventCount: 0
    });
  });

  it("reconciles in-flight provider usage when the current subsession is not committed", () => {
    expect(
      reconcileEvidenceCampaignSubsessionUsage({
        checkpoint: {
          currentSubsessionCostSol: 0.0004,
          currentSubsessionEventCount: 400
        },
        runtime: {
          currentSubsessionCostSol: 0.00047,
          currentSubsessionEventCount: 470
        },
        alreadyCommitted: false
      })
    ).toEqual({
      currentSubsessionCostSol: 0.00047,
      currentSubsessionEventCount: 470
    });
  });

  it("retries only safe read requests on transient failures", () => {
    expect(isEvidenceCampaignReadOnlyRequest()).toBe(true);
    expect(isEvidenceCampaignReadOnlyRequest({ method: "HEAD" })).toBe(true);
    expect(isEvidenceCampaignReadOnlyRequest({ method: "POST" })).toBe(false);
    expect(isEvidenceCampaignRetryableStatus(503)).toBe(true);
    expect(isEvidenceCampaignRetryableStatus(409)).toBe(false);
    expect(evidenceCampaignReadAttemptTimeoutMs).toBe(5_000);
    expect(evidenceCampaignReadRetryDelaysMs).toEqual([
      250, 500, 1_000, 2_000, 4_000, 8_000
    ]);
  });

  it("resolves campaign artifacts from the repository rather than package cwd", () => {
    const runnerModuleUrl = new URL(
      "../src/evidence-campaign-runner.ts",
      import.meta.url
    ).href;

    expect(resolveEvidenceCampaignRepositoryRoot(runnerModuleUrl)).toMatch(
      /\/axi$/
    );
  });
});
