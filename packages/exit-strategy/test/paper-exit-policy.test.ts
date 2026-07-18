import { describe, expect, it } from "vitest";
import {
  createPaperExitPolicyConfig,
  evaluatePaperExitPolicy,
  getPaperExitPolicyRuntimeContract,
  type EvaluatePaperExitPolicyInput,
  type PaperExitMarketContext,
  type PaperExitPolicyPosition
} from "../src";

describe("paper exit policy", () => {
  it("uses explicit precedence when several rules match", () => {
    const report = evaluate({
      position: position({ unrealizedPnlPct: -40 }),
      market: market({ hardReject: true, riskLevel: "critical" })
    });

    expect(report).toMatchObject({
      policyVersion: "paper-exit-policy-v1",
      evaluationStatus: "paper_exit_candidate",
      selectedAction: {
        ruleId: "emergency-hard-risk",
        trigger: "emergency_hard_risk",
        priority: 10,
        sellPct: 100
      },
      automaticPaperExitActivation: false,
      automaticLiveExecution: false,
      calibrated: false,
      liveExecutionDisabled: true
    });
  });

  it("takes a partial first profit stage only once", () => {
    const first = evaluate({
      position: position({ unrealizedPnlPct: 30 })
    });
    const completed = evaluate({
      position: position({
        completedRuleIds: ["take-profit-stage-1"],
        unrealizedPnlPct: 30
      })
    });

    expect(first.selectedAction).toMatchObject({
      ruleId: "take-profit-stage-1",
      sellPct: 50
    });
    expect(completed).toMatchObject({
      evaluationStatus: "hold",
      selectedAction: null
    });
    expect(
      completed.ruleEvaluations.find(
        (rule) => rule.ruleId === "take-profit-stage-1"
      )
    ).toMatchObject({
      matched: true,
      eligible: false,
      blockers: ["PAPER_EXIT_RULE_ALREADY_COMPLETED"]
    });
  });

  it("selects the second profit stage before the first", () => {
    const report = evaluate({
      position: position({ unrealizedPnlPct: 60 })
    });

    expect(report.selectedAction).toMatchObject({
      ruleId: "take-profit-stage-2",
      sellPct: 100
    });
  });

  it("implements a peak-price trailing stop when explicitly configured", () => {
    const report = evaluate({
      config: {
        trailingActivationPct: 20,
        trailingStopPct: 15
      },
      position: position({
        currentPriceSol: 1.5,
        peakPriceSol: 2,
        peakUnrealizedPnlPct: 100,
        unrealizedPnlPct: 50
      })
    });

    expect(report.trailingDrawdownPct).toBe(25);
    expect(report.selectedAction).toMatchObject({
      ruleId: "trailing-stop",
      trigger: "trailing_stop",
      sellPct: 100
    });
  });

  it("keeps trailing stops disabled when no override is supplied", () => {
    const config = createPaperExitPolicyConfig();
    const report = evaluate({
      position: position({
        currentPriceSol: 1.5,
        peakPriceSol: 2,
        peakUnrealizedPnlPct: 100,
        unrealizedPnlPct: 10
      })
    });

    expect(config.trailingStopPct).toBeNull();
    expect(
      report.ruleEvaluations.find((rule) => rule.ruleId === "trailing-stop")
    ).toMatchObject({ enabled: false, eligible: false });
  });

  it("ignores derivative noise below the configured reversal thresholds", () => {
    const report = evaluate({
      market: market({
        priceAccelerationPctPerSec2: -0.001,
        priceVelocityPctPerSec: -0.01
      })
    });

    expect(
      report.ruleEvaluations.find(
        (rule) => rule.ruleId === "derivative-reversal"
      )
    ).toMatchObject({ matched: false, eligible: false });
  });

  it("can select derivative reversal ahead of later profit rules", () => {
    const report = evaluate({
      market: market({
        priceAccelerationPctPerSec2: -0.1,
        priceVelocityPctPerSec: -1
      }),
      position: position({ unrealizedPnlPct: 60 })
    });

    expect(report.selectedAction).toMatchObject({
      ruleId: "derivative-reversal",
      priority: 60
    });
  });

  it.each([
    {
      name: "emergency hard risk",
      ruleId: "emergency-hard-risk",
      market: { hardReject: true }
    },
    {
      name: "liquidity deterioration",
      ruleId: "liquidity-deterioration",
      market: { estimatedSellSlippagePct: 20 }
    },
    {
      name: "stop loss",
      ruleId: "stop-loss",
      position: { unrealizedPnlPct: -30 }
    },
    {
      name: "watched-wallet sell",
      ruleId: "watched-wallet-sell",
      market: {
        watchedWalletSignal: {
          signalId: "wallet-sell-1",
          side: "sell" as const,
          usable: true,
          blocked: false,
          sellPct: 100
        }
      }
    },
    {
      name: "momentum decay",
      ruleId: "momentum-decay",
      market: { launchScore: 20 }
    },
    {
      name: "buyer reversal",
      ruleId: "buyer-reversal",
      market: {
        buyerAccelerationPerSec2: -0.1,
        netBuyPressure: -0.5
      }
    },
    {
      name: "volume collapse",
      ruleId: "volume-collapse",
      market: {
        volume5sSol: 0.1,
        volume30sSol: 30,
        volumeAccelerationSolPerSec2: 0
      }
    },
    {
      name: "watched-wallet buy",
      ruleId: "watched-wallet-buy",
      position: { unrealizedPnlPct: 30 },
      market: {
        watchedWalletSignal: {
          signalId: "wallet-buy-1",
          side: "buy" as const,
          usable: true,
          blocked: false,
          sellPct: 75
        }
      }
    },
    {
      name: "maximum hold",
      ruleId: "maximum-hold-time",
      config: { maximumHoldMs: 1_000 }
    },
    {
      name: "migration transition",
      ruleId: "migration-transition",
      config: { enableMigrationTransition: true },
      market: { migrationDetected: true }
    }
  ])("evaluates $name deterministically in paper/replay", (fixture) => {
    const report = evaluate({
      ...(fixture.config ? { config: fixture.config } : {}),
      ...(fixture.position ? { position: position(fixture.position) } : {}),
      ...(fixture.market ? { market: market(fixture.market) } : {})
    });

    expect(report.selectedAction?.ruleId).toBe(fixture.ruleId);
    expect(report).toMatchObject({
      evaluationStatus: "paper_exit_candidate",
      policyStatus: "reference_only",
      automaticPaperExitActivation: false,
      automaticLiveExecution: false,
      paperOnly: true,
      liveExecutionDisabled: true
    });
  });

  it("requires a valid open position and fails closed", () => {
    const report = evaluate({
      position: position({ currentPriceSol: 0 })
    });

    expect(report).toMatchObject({
      evaluationStatus: "invalid_input",
      selectedAction: null,
      automaticLiveExecution: false
    });
    expect(report.reasonCodes).toContain("PAPER_EXIT_CURRENT_PRICE_INVALID");
    expect(report.ruleEvaluations.every((rule) => !rule.eligible)).toBe(true);
  });

  it("fails closed on inconsistent peaks and non-finite market inputs", () => {
    const report = evaluate({
      position: position({
        currentPriceSol: 1.2,
        peakPriceSol: 1.1,
        peakUnrealizedPnlPct: 5,
        unrealizedPnlPct: 20
      }),
      market: market({ priceVelocityPctPerSec: Number.NaN })
    });

    expect(report).toMatchObject({
      evaluationStatus: "invalid_input",
      selectedAction: null
    });
    expect(report.reasonCodes).toEqual(
      expect.arrayContaining([
        "PAPER_EXIT_PEAK_PRICE_BELOW_CURRENT",
        "PAPER_EXIT_PEAK_PNL_BELOW_CURRENT",
        "PAPER_EXIT_DERIVATIVE_INVALID"
      ])
    );
  });

  it("bounds configuration and publishes a non-activating contract", () => {
    expect(
      createPaperExitPolicyConfig({
        stopLossPct: -500,
        takeProfitStage1SellPct: 500,
        trailingStopPct: 0
      })
    ).toMatchObject({
      stopLossPct: -100,
      takeProfitStage1SellPct: 100,
      trailingStopPct: 1
    });
    expect(getPaperExitPolicyRuntimeContract()).toMatchObject({
      implementationStatus: "implemented",
      policyStatus: "reference_only",
      automaticPaperExitActivation: false,
      automaticLiveExecution: false,
      operatorConfiguredPaperExecutionRequired: true,
      liveExecutionDisabled: true
    });
  });
});

function evaluate(overrides: Partial<EvaluatePaperExitPolicyInput> = {}) {
  return evaluatePaperExitPolicy({
    evaluationId: "paper-exit-evaluation-1",
    evaluatedAt: "2026-01-01T00:01:00.000Z",
    position: position(),
    market: market(),
    ...overrides
  });
}

function position(
  overrides: Partial<PaperExitPolicyPosition> = {}
): PaperExitPolicyPosition {
  const currentPriceSol = overrides.currentPriceSol ?? 1.1;
  const unrealizedPnlPct = overrides.unrealizedPnlPct ?? 10;

  return {
    mint: "ExitPolicyMint11111111111111111111111111111",
    status: "open",
    openedAt: "2026-01-01T00:00:30.000Z",
    entryPriceSol: 1,
    currentPriceSol,
    peakPriceSol: Math.max(1.1, currentPriceSol),
    unrealizedPnlPct,
    peakUnrealizedPnlPct: Math.max(10, unrealizedPnlPct),
    remainingSizeSol: 0.005,
    remainingTokenAmount: 0.005,
    completedRuleIds: [],
    ...overrides
  };
}

function market(
  overrides: Partial<PaperExitMarketContext> = {}
): PaperExitMarketContext {
  return {
    launchScore: 70,
    launchPhase: "hot",
    priceVelocityPctPerSec: 1,
    priceAccelerationPctPerSec2: 0.1,
    volume5sSol: 5,
    volume30sSol: 15,
    volumeAccelerationSolPerSec2: 0.1,
    buyerAccelerationPerSec2: 0.1,
    netBuyPressure: 0.5,
    liquidityVelocitySolPerSec: 0.1,
    estimatedSellSlippagePct: 1,
    riskLevel: "low",
    hardReject: false,
    migrationDetected: false,
    watchedWalletSignal: null,
    reasonCodes: [],
    ...overrides
  };
}
