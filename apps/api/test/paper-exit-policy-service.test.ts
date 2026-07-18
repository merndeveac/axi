import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStorage, initStorage } from "@axi/storage";
import {
  createPaperExitPolicyConfig,
  type PaperExitPolicyConfigInput
} from "@axi/exit-strategy";
import type { OverlaySignal } from "@axi/shared";
import {
  createPaperPortfolioService,
  createPaperPortfolioServiceConfig
} from "../src/paper-portfolio-service";

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

  it("executes approved paper automation with legacy loops disabled and modeled impact", () => {
    let priceSol = 1;
    const service = createPaperPortfolioService({
      now: () => new Date("2026-01-01T00:01:00.000Z"),
      getCurrentPriceSol: () => priceSol,
      getCurrentVolumeSol: () => 10,
      config: createPaperPortfolioServiceConfig()
    });
    const signal = {
      mint: "approved-paper-automation-mint",
      symbol: "AUTO",
      score: 80,
      hardReject: false,
      reasonCodes: [],
      riskLevel: "low"
    } as unknown as OverlaySignal;
    const entry = service.executeApprovedAutomationEntry(signal, {
      deploymentId: "deployment-test",
      operationId: "entry-operation-test",
      selectedThreshold: 75,
      positionSizeSol: 0.005,
      maximumVolumeParticipationRatio: 0.1,
      maximumMarketImpactBps: 1_000
    });

    expect(entry).toMatchObject({
      blocked: false,
      fill: { fillStatus: "filled" },
      position: { status: "open" },
      paperOnly: true,
      liveExecutionDisabled: true
    });
    expect(entry.intent?.reasonCodes).toContain(
      "PAPER_AUTOMATION_APPROVED_ENTRY"
    );

    priceSol = 0.5;
    const evaluation = service.evaluateApprovedAutomationExit(
      signal.mint,
      createPaperExitPolicyConfig()
    );
    expect(evaluation?.selectedAction?.ruleId).toBe("stop-loss");
    const exit = service.executeApprovedAutomationExit(
      evaluation as NonNullable<typeof evaluation>,
      {
        deploymentId: "deployment-test",
        operationId: "exit-operation-test",
        positionSizeSol: 0.005,
        maximumVolumeParticipationRatio: 0.1,
        maximumMarketImpactBps: 1_000
      }
    );
    expect(exit).toMatchObject({
      blocked: false,
      fill: { fillStatus: "filled" },
      position: { status: "closed" },
      paperOnly: true,
      liveExecutionDisabled: true
    });
    expect(exit.intent?.reasonCodes).toContain(
      "PAPER_AUTOMATION_APPROVED_EXIT"
    );
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
