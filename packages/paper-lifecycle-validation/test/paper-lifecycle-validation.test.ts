import { describe, expect, it } from "vitest";
import {
  createPaperLifecycleValidationConfig,
  evaluatePaperLifecycleValidation,
  getPaperLifecycleValidationRuntimeContract,
  type PaperLifecycleReplayCase,
  type PaperLifecycleReplayPoint
} from "../src";

describe("@axi/paper-lifecycle-validation", () => {
  it("passes a profitable temporal holdout without activating paper trading", () => {
    const report = evaluatePaperLifecycleValidation({
      validationId: "lifecycle-positive",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      strategyProvenance: provenance(60),
      cases: [
        ...cases("train", "2026-01-01T00:00:00.000Z", 30),
        ...cases("validation", "2026-01-02T00:00:00.000Z", 30)
      ],
      config: { maxDailySpendSol: 1 }
    });

    expect(report).toMatchObject({
      validationVersion: "paper-lifecycle-validation-v1",
      validationStatus: "paper_automation_candidate",
      policyStatus: "reference_only",
      selectedThreshold: 75,
      dataAudit: {
        integrityValid: true,
        qualitySufficient: true,
        temporalHoldoutValid: true,
        noLookAheadValid: true
      },
      validationPerformance: {
        closedTradeCount: 30,
        unresolvedPositionCount: 0,
        missedFillRate: 0,
        profitFactorStatus: "no_losses"
      },
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      automaticLiveExecution: false,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
    expect(report.validationPerformance?.averageNetReturnPct).toBeGreaterThan(
      0
    );
    expect(report.validationPerformance?.totalMarketImpactSol).toBeGreaterThan(
      0
    );
    expect(report.benchmarkOutperformancePct).toBeGreaterThan(0);
    expect(report.acceptanceGates.every((gate) => gate.passed)).toBe(true);
    expect(report.trades[0]?.selectedExitRuleIds).toContain(
      "derivative-reversal"
    );
  });

  it("fails closed on future, synthetic, and incomplete paths", () => {
    const training = replayCase(
      "train-invalid",
      "train",
      "2026-01-01T00:00:00.000Z"
    );
    const validation = replayCase(
      "validation-invalid",
      "validation",
      "2026-01-02T00:00:00.000Z"
    );
    const last = validation.points.at(-1);

    if (!last) {
      throw new Error("validation fixture requires a final point");
    }

    validation.points = [
      ...validation.points.slice(0, -1),
      {
        ...last,
        at: "2026-01-02T00:01:01.000Z",
        synthetic: true,
        source: "fixture"
      }
    ];

    const report = evaluatePaperLifecycleValidation({
      validationId: "lifecycle-invalid",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      strategyProvenance: provenance(2),
      cases: [training, validation]
    });

    expect(report).toMatchObject({
      validationStatus: "invalid_input",
      dataAudit: {
        integrityValid: false,
        noLookAheadValid: false,
        syntheticPointCount: 1,
        invalidCaseCount: 1
      },
      trades: [],
      automaticPaperTradingActivation: false
    });
    expect(report.reasonCodes).toEqual(
      expect.arrayContaining([
        "PAPER_LIFECYCLE_LOOKAHEAD_VIOLATION",
        "PAPER_LIFECYCLE_SYNTHETIC_POINT_REJECTED",
        "PAPER_LIFECYCLE_NON_CANONICAL_POINT_REJECTED",
        "PAPER_LIFECYCLE_OUTCOME_POINT_MISSING"
      ])
    );
  });

  it("enforces shared portfolio concurrency in global event time", () => {
    const validationStart = "2026-01-02T00:00:00.000Z";
    const first = replayCase(
      "validation-concurrent-a",
      "validation",
      validationStart
    );
    const second = replayCase(
      "validation-concurrent-b",
      "validation",
      validationStart
    );
    const report = evaluatePaperLifecycleValidation({
      validationId: "lifecycle-concurrency",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      strategyProvenance: provenance(3),
      cases: [
        replayCase("train-concurrency", "train", "2026-01-01T00:00:00.000Z"),
        first,
        second
      ],
      config: { maxDailySpendSol: 1, maxOpenPositions: 1 }
    });

    const validationTrades = report.trades.filter(
      (trade) => trade.partition === "validation"
    );
    expect(report.peakOpenPositionCount).toBe(1);
    expect(
      validationTrades.filter((trade) => trade.status === "closed")
    ).toHaveLength(1);
    expect(
      validationTrades.filter((trade) => trade.status === "entry_rejected")
    ).toHaveLength(1);
    expect(
      validationTrades.find((trade) => trade.status === "entry_rejected")
        ?.entryFillAt
    ).toBeNull();
    expect(report.validationPerformance?.tradeCount).toBe(1);
    expect(report.validationPerformance?.entryFillRate).toBe(0.5);
  });

  it("models deterministic missed fills and rejects insufficient evidence", () => {
    const report = evaluatePaperLifecycleValidation({
      validationId: "lifecycle-missed",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      strategyProvenance: provenance(2),
      cases: [
        replayCase("train-missed", "train", "2026-01-01T00:00:00.000Z"),
        replayCase(
          "validation-missed",
          "validation",
          "2026-01-02T00:00:00.000Z"
        )
      ],
      config: { entryMissedFillRate: 1, maxDailySpendSol: 1 }
    });

    expect(report.validationStatus).toBe("insufficient_evidence");
    expect(report.validationPerformance).toMatchObject({
      tradeCount: 0,
      closedTradeCount: 0,
      rejectedEntryCount: 1
    });
    expect(report.trades.at(-1)?.missedEntryFillCount).toBeGreaterThan(0);
  });

  it("bounds simulation assumptions and publishes a non-activating contract", () => {
    expect(
      createPaperLifecycleValidationConfig({
        startingCapitalSol: -1,
        positionSizeSol: 100,
        maximumVolumeParticipationRatio: 2,
        entryMissedFillRate: -1
      })
    ).toMatchObject({
      startingCapitalSol: 0.01,
      positionSizeSol: 0.01,
      maximumVolumeParticipationRatio: 1,
      entryMissedFillRate: 0,
      minimumValidationTrades: 30
    });
    expect(getPaperLifecycleValidationRuntimeContract()).toMatchObject({
      implementationStatus: "implemented",
      noLookAhead: true,
      sharedCapitalModeled: true,
      overlappingPositionsModeled: true,
      missedFillsModeled: true,
      automaticPaperTradingActivation: false,
      automaticLiveExecution: false,
      liveExecutionDisabled: true
    });
  });
});

function provenance(expectedObservationCount: number) {
  return {
    evaluationId: "paper-eval-upstream",
    evaluationVersion: "paper-strategy-evaluation-v1" as const,
    evaluationStatus: "paper_observation_candidate" as const,
    selectedThreshold: 75,
    captureSessionIds: ["capture-train", "capture-validation"],
    expectedObservationCount
  };
}

function cases(
  partition: "train" | "validation",
  startedAt: string,
  count: number
): PaperLifecycleReplayCase[] {
  const startedAtMs = Date.parse(startedAt);
  return Array.from({ length: count }, (_, index) =>
    replayCase(
      `${partition}-${String(index).padStart(3, "0")}`,
      partition,
      new Date(startedAtMs + index * 70_000).toISOString()
    )
  );
}

function replayCase(
  observationId: string,
  partition: "train" | "validation",
  signalAt: string
): PaperLifecycleReplayCase {
  const signalAtMs = Date.parse(signalAt);
  const points: PaperLifecycleReplayPoint[] = Array.from(
    { length: 60 },
    (_, index) => {
      const second = index + 1;
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
    }
  );

  return {
    observationId,
    captureSessionId:
      partition === "train" ? "capture-train" : "capture-validation",
    partition,
    mint: `mint-${observationId}`,
    signalAt,
    outcomeAt: new Date(signalAtMs + 60_000).toISOString(),
    score: 80,
    entryPriceSol: 1,
    points
  };
}
