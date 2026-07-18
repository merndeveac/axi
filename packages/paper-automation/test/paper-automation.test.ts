import { describe, expect, it } from "vitest";
import {
  evaluatePaperLifecycleValidation,
  type PaperLifecycleReplayCase
} from "@axi/paper-lifecycle-validation";
import {
  calculatePaperAutomationForwardMetrics,
  createPaperAutomationDeployment,
  createPaperAutomationForwardConfig,
  deterministicPaperAutomationMiss,
  evaluatePaperAutomationHealth,
  getPaperAutomationCompatibilityBlockers,
  getPaperAutomationRuntimeContract,
  paperAutomationMarketImpactBps,
  transitionPaperAutomationDeployment,
  type PaperAutomationEvent
} from "../src";

describe("@axi/paper-automation", () => {
  it("creates a non-activating deployment only from a passing lifecycle report", () => {
    const deployment = createDeployment();

    expect(deployment).toMatchObject({
      automationVersion: "paper-automation-v1",
      validationId: "lifecycle-candidate",
      selectedThreshold: 75,
      status: "approved",
      armedAt: null,
      automaticLiveExecution: false,
      paperOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
    expect(() =>
      createPaperAutomationDeployment({
        deploymentId: "deployment-rejected",
        validation: {
          ...candidateReport(),
          validationStatus: "holdout_rejected"
        },
        approvedBy: "operator",
        approvedAt: "2026-01-04T00:00:00.000Z"
      })
    ).toThrow("every promotion gate passed");
  });

  it("requires valid state transitions and fail-closed portfolio compatibility", () => {
    const deployment = createDeployment();
    const armed = transitionPaperAutomationDeployment({
      deployment,
      status: "armed",
      at: "2026-01-04T00:01:00.000Z",
      reasonCodes: ["PAPER_AUTOMATION_OPERATOR_ARMED"]
    });
    const paused = transitionPaperAutomationDeployment({
      deployment: armed,
      status: "paused",
      at: "2026-01-04T00:02:00.000Z",
      reasonCodes: ["PAPER_AUTOMATION_OPERATOR_PAUSED"]
    });

    expect(armed.status).toBe("armed");
    expect(paused.status).toBe("paused");
    expect(() =>
      transitionPaperAutomationDeployment({
        deployment: armed,
        status: "approved",
        at: "2026-01-04T00:03:00.000Z",
        reasonCodes: []
      })
    ).toThrow("cannot transition");
    expect(
      getPaperAutomationCompatibilityBlockers({
        deployment,
        portfolio: {
          enabled: true,
          legacyEntryEnabled: false,
          legacyExitEnabled: false,
          startingCashSol: 1,
          maxPositionSizeSol: 0.01,
          maxOpenPositions: 3,
          maxDailySpendSol: 1,
          feeBps: 100,
          slippageBps: 300,
          allowPartialExits: true
        }
      })
    ).toEqual([]);
    expect(
      getPaperAutomationCompatibilityBlockers({
        deployment,
        portfolio: {
          enabled: true,
          legacyEntryEnabled: true,
          legacyExitEnabled: false,
          startingCashSol: 2,
          maxPositionSizeSol: 0.001,
          maxOpenPositions: 1,
          maxDailySpendSol: 0.01,
          feeBps: 0,
          slippageBps: 0,
          allowPartialExits: false
        }
      })
    ).toEqual(
      expect.arrayContaining([
        "PAPER_AUTOMATION_LEGACY_ENTRY_LOOP_ENABLED",
        "PAPER_AUTOMATION_STARTING_CAPITAL_MISMATCH",
        "PAPER_AUTOMATION_POSITION_LIMIT_MISMATCH",
        "PAPER_AUTOMATION_OPEN_POSITION_LIMIT_MISMATCH"
      ])
    );
  });

  it("calculates forward outcomes and triggers drift and stale-data kill switches", () => {
    const deployment = {
      ...createDeployment(),
      forwardConfig: createPaperAutomationForwardConfig({
        minimumClosedTradesForDrift: 30
      })
    };
    const losingEvents = Array.from({ length: 30 }, (_, index) => [
      event(`entry-${index}`, "entry_executed", {
        mint: `mint-${index}`,
        entryFeeSol: 0.00005,
        positionSizeSol: 0.005
      }),
      event(`exit-${index}`, "exit_executed", {
        mint: `mint-${index}`,
        realizedPnlSol: -0.0005,
        positionSizeSol: 0.005,
        positionClosed: true,
        observedAt: new Date(
          Date.parse("2026-01-05T00:00:00.000Z") + index * 2_000 + 1_000
        ).toISOString()
      })
    ]).flat();
    const health = evaluatePaperAutomationHealth({
      deployment,
      events: losingEvents
    });

    expect(health).toMatchObject({
      healthy: false,
      sufficientForDriftEvaluation: true,
      automaticPauseRequired: true,
      metrics: { closedTradeCount: 30, maximumConsecutiveLosses: 30 }
    });
    expect(health.blockers).toEqual(
      expect.arrayContaining([
        "PAPER_AUTOMATION_EXPECTANCY_DRIFT",
        "PAPER_AUTOMATION_CONSECUTIVE_LOSSES_EXCEEDED"
      ])
    );

    const staleHealth = evaluatePaperAutomationHealth({
      deployment,
      events: [0, 1, 2].map((index) =>
        event(`stale-${index}`, "signal_rejected", {
          reasonCodes: ["PAPER_AUTOMATION_SIGNAL_STALE"]
        })
      )
    });
    expect(staleHealth.blockers).toContain(
      "PAPER_AUTOMATION_STALE_SIGNAL_LIMIT_EXCEEDED"
    );

    const missedFillHealth = evaluatePaperAutomationHealth({
      deployment,
      events: Array.from({ length: 10 }, (_, index) =>
        event(`miss-${index}`, "entry_missed")
      )
    });
    expect(missedFillHealth.blockers).toContain(
      "PAPER_AUTOMATION_MISSED_FILL_RATE_EXCEEDED"
    );
  });

  it("bounds forward gates and models deterministic misses, liquidity, and impact", () => {
    expect(
      createPaperAutomationForwardConfig({
        maximumSignalAgeMs: 50_000,
        minimumClosedTradesForDrift: 1,
        minimumExpectancyRetentionRatio: 0.1,
        maximumForwardDrawdownPct: 50,
        maximumConsecutiveLosses: 50,
        maximumRejectedEntryRate: 0.9
      })
    ).toEqual({
      ...createPaperAutomationForwardConfig(),
      schemaVersion: 1
    });
    expect(deterministicPaperAutomationMiss("same-key", 1)).toBe(true);
    expect(deterministicPaperAutomationMiss("same-key", 0)).toBe(false);
    expect(
      paperAutomationMarketImpactBps({
        sizeSol: 0.005,
        volumeSol: 1,
        maximumVolumeParticipationRatio: 0.1,
        maximumMarketImpactBps: 1_000
      })
    ).toBe(50);
    expect(
      paperAutomationMarketImpactBps({
        sizeSol: 1,
        volumeSol: 1,
        maximumVolumeParticipationRatio: 0.1,
        maximumMarketImpactBps: 1_000
      })
    ).toBeNull();
    expect(getPaperAutomationRuntimeContract()).toMatchObject({
      implementationStatus: "implemented",
      restartPolicy: "fail_closed_rearm_required",
      driftKillSwitch: true,
      automaticLiveExecution: false,
      liveExecutionDisabled: true
    });
  });

  it("counts rejected entry rates and net returns after entry fees", () => {
    const events = [
      event("entry-win", "entry_executed", {
        mint: "mint-win",
        entryFeeSol: 0.00005,
        positionSizeSol: 0.005
      }),
      event("entry-reject", "entry_rejected", { mint: "mint-reject" }),
      event("exit-win", "exit_executed", {
        mint: "mint-win",
        realizedPnlSol: 0.00055,
        positionSizeSol: 0.005,
        positionClosed: true
      })
    ];
    expect(calculatePaperAutomationForwardMetrics(events, 1)).toMatchObject({
      entryDecisionCount: 2,
      filledEntryCount: 1,
      rejectedEntryCount: 1,
      rejectedEntryRate: 0.5,
      closedTradeCount: 1,
      averageNetReturnPct: 10,
      totalNetPnlSol: 0.0005
    });
  });
});

function createDeployment() {
  return createPaperAutomationDeployment({
    deploymentId: "deployment-1",
    validation: candidateReport(),
    approvedBy: "local-operator",
    approvedAt: "2026-01-04T00:00:00.000Z"
  });
}

function candidateReport() {
  return evaluatePaperLifecycleValidation({
    validationId: "lifecycle-candidate",
    evaluatedAt: "2026-01-03T00:00:00.000Z",
    strategyProvenance: {
      evaluationId: "paper-eval-upstream",
      evaluationVersion: "paper-strategy-evaluation-v1",
      evaluationStatus: "paper_observation_candidate",
      selectedThreshold: 75,
      captureSessionIds: ["capture-train", "capture-validation"],
      expectedObservationCount: 60
    },
    cases: [
      ...replayCases("train", "2026-01-01T00:00:00.000Z", 30),
      ...replayCases("validation", "2026-01-02T00:00:00.000Z", 30)
    ],
    config: { maxDailySpendSol: 1 }
  });
}

function replayCases(
  partition: "train" | "validation",
  startedAt: string,
  count: number
): PaperLifecycleReplayCase[] {
  const startedAtMs = Date.parse(startedAt);
  return Array.from({ length: count }, (_, caseIndex) => {
    const signalAt = new Date(startedAtMs + caseIndex * 70_000).toISOString();
    const signalAtMs = Date.parse(signalAt);
    return {
      observationId: `${partition}-${caseIndex}`,
      captureSessionId:
        partition === "train" ? "capture-train" : "capture-validation",
      partition,
      mint: `mint-${partition}-${caseIndex}`,
      signalAt,
      outcomeAt: new Date(signalAtMs + 60_000).toISOString(),
      score: 80,
      entryPriceSol: 1,
      points: Array.from({ length: 60 }, (_, pointIndex) => {
        const second = pointIndex + 1;
        const priceSol =
          second <= 15 ? 1 + second * 0.03 : 1.45 - ((second - 15) / 45) * 0.45;
        return {
          at: new Date(signalAtMs + second * 1_000).toISOString(),
          priceSol,
          volumeSol: 10,
          buyVolumeSol: second <= 15 ? 7 : 4,
          sellVolumeSol: second <= 15 ? 3 : 6,
          buyCount: second <= 15 ? 7 : 4,
          sellCount: second <= 15 ? 3 : 6,
          synthetic: false,
          source: "canonical_one_second_bucket" as const
        };
      })
    };
  });
}

function event(
  eventId: string,
  kind: PaperAutomationEvent["kind"],
  overrides: Partial<PaperAutomationEvent> = {}
): PaperAutomationEvent {
  return {
    schemaVersion: 1,
    eventId,
    deploymentId: "deployment-1",
    operationId: null,
    kind,
    mint: null,
    observedAt: "2026-01-05T00:00:00.000Z",
    orderId: null,
    fillId: null,
    entryFeeSol: null,
    positionSizeSol: null,
    realizedPnlSol: null,
    positionClosed: null,
    reasonCodes: [],
    payload: {},
    paperOnly: true,
    liveExecutionDisabled: true,
    ...overrides
  };
}
