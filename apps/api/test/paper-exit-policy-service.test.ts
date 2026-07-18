import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStorage, initStorage } from "@axi/storage";
import type { PaperExitPolicyConfigInput } from "@axi/exit-strategy";
import { createPaperPortfolioService } from "../src/paper-portfolio-service";

let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-paper-exit-policy-"));
  initStorage({ databasePath: join(testDirectory, "axi.sqlite") });
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("PaperPortfolioService exit policy", () => {
  it("executes an explicitly enabled trailing stop in paper only", () => {
    let priceSol = 1;
    const service = createService(() => priceSol, {
      trailingActivationPct: 20,
      trailingStopPct: 15
    });
    service.manualEntry({ mint: "trailing-mint", marketPriceSol: priceSol });
    priceSol = 2;
    service.updateMarkPrice("trailing-mint", priceSol);
    priceSol = 1.5;

    const evaluations = service.evaluateExits();

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]).toMatchObject({
      blocked: false,
      fill: { fillStatus: "filled" },
      position: { status: "closed", peakPriceSol: 2 },
      exitPolicyEvaluation: {
        evaluationStatus: "paper_exit_candidate",
        selectedAction: { ruleId: "trailing-stop" },
        automaticLiveExecution: false,
        liveExecutionDisabled: true
      },
      paperOnly: true,
      liveExecutionDisabled: true
    });
    expect(service.getExitPolicyStatus()).toMatchObject({
      enabled: true,
      evaluationCount: 1,
      contract: {
        policyVersion: "paper-exit-policy-v1",
        automaticLiveExecution: false
      }
    });
  });

  it("persists a partial profit stage and does not repeat it", () => {
    let priceSol = 1;
    const service = createService(() => priceSol);
    service.manualEntry({ mint: "profit-mint", marketPriceSol: priceSol });
    priceSol = 1.4;

    const first = service.evaluateExits();
    const second = service.evaluateExits();
    const records = service.getExitPolicyEvaluations();

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      fill: { fillStatus: "partial" },
      position: { status: "partially_closed" },
      exitPolicyEvaluation: {
        selectedAction: {
          ruleId: "take-profit-stage-1",
          sellPct: 50
        }
      }
    });
    expect(first[0]?.position?.exitReasonCodes).toContain(
      "PAPER_EXIT_RULE_COMPLETED_TAKE_PROFIT_STAGE_1"
    );
    expect(second).toEqual([]);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      evaluationStatus: "hold",
      selectedAction: null
    });
  });
});

function createService(
  getPrice: () => number,
  policy: PaperExitPolicyConfigInput = {}
) {
  return createPaperPortfolioService({
    now: () => new Date("2026-01-01T00:01:00.000Z"),
    getCurrentPriceSol: () => getPrice(),
    config: {
      exit: {
        enabled: true,
        allowWatchedWalletSignals: true,
        defaultSellPct: 100,
        requirePrice: true,
        minProfitPct: 25,
        takeProfitPct: 50,
        stopLossPct: -25,
        trailingStopPct: null,
        cooldownMs: 0,
        policy: {
          enableBuyerReversal: false,
          enableDerivativeReversal: false,
          enableLiquidityDeterioration: false,
          enableMaximumHold: false,
          enableMigrationTransition: false,
          enableMomentumDecay: false,
          enableVolumeCollapse: false,
          ...policy
        }
      }
    }
  });
}
