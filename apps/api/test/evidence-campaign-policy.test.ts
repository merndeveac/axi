import { describe, expect, it } from "vitest";
import {
  createEvidenceCampaignBudgetPlan,
  createEvidenceCampaignRequestInit,
  createEvidenceCampaignSubsessionPlan,
  isEvidenceCampaignReadOnlyRequest,
  isEvidenceCampaignRetryableStatus,
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

  it("retries only safe read requests on transient failures", () => {
    expect(isEvidenceCampaignReadOnlyRequest()).toBe(true);
    expect(isEvidenceCampaignReadOnlyRequest({ method: "HEAD" })).toBe(true);
    expect(isEvidenceCampaignReadOnlyRequest({ method: "POST" })).toBe(false);
    expect(isEvidenceCampaignRetryableStatus(503)).toBe(true);
    expect(isEvidenceCampaignRetryableStatus(409)).toBe(false);
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
