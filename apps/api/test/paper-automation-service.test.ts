import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  evaluatePaperLifecycleValidation,
  type PaperLifecycleReplayCase
} from "@axi/paper-lifecycle-validation";
import type { OverlaySignal } from "@axi/shared";
import {
  closeStorage,
  initStorage,
  listPaperAutomationEvents,
  savePaperLifecycleValidation
} from "@axi/storage";
import {
  createPaperPortfolioService,
  createPaperPortfolioServiceConfig,
  type PaperPortfolioService
} from "../src/paper-portfolio-service";
import {
  createPaperAutomationService,
  paperAutomationConfirmation
} from "../src/paper-automation-service";

let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-paper-automation-"));
  initStorage({ databasePath: join(testDirectory, "axi.sqlite") });
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("PaperAutomationService", () => {
  it("requires separate approval and arming, then pauses fail-closed on restart", () => {
    const validation = candidateReport();
    savePaperLifecycleValidation(validation);
    let now = new Date("2026-01-04T00:00:00.000Z");
    let sequence = 0;
    const service = createPaperAutomationService({
      paperPortfolio: compatiblePortfolio(),
      now: () => now,
      createId: () => `test-${++sequence}`
    });
    service.start();

    expect(() =>
      service.approve({
        validationId: validation.validationId,
        approvedBy: "operator",
        confirmation: "wrong"
      })
    ).toThrow("Exact confirmation required");
    const approved = service.approve({
      validationId: validation.validationId,
      approvedBy: "operator",
      confirmation: paperAutomationConfirmation.approve(validation.validationId)
    });
    expect(approved).toMatchObject({
      status: "approved",
      selectedThreshold: 75,
      automaticLiveExecution: false,
      liveExecutionDisabled: true
    });

    now = new Date("2026-01-04T00:01:00.000Z");
    const armed = service.arm({
      deploymentId: approved.deploymentId,
      confirmation: paperAutomationConfirmation.arm(approved.deploymentId)
    });
    expect(armed.status).toBe("armed");

    now = new Date("2026-01-04T00:02:00.000Z");
    const restarted = createPaperAutomationService({
      paperPortfolio: compatiblePortfolio(),
      now: () => now,
      createId: () => `restart-${++sequence}`
    });
    restarted.start();
    expect(restarted.getStatus()).toMatchObject({
      armed: false,
      deployment: {
        deploymentId: approved.deploymentId,
        status: "paused"
      }
    });
    expect(
      listPaperAutomationEvents(approved.deploymentId).map(
        (event) => event.kind
      )
    ).toEqual(
      expect.arrayContaining(["approved", "armed", "restart_reconciled"])
    );
  });

  it("blocks incompatible legacy loops and trips the stale-signal kill switch", () => {
    const validation = candidateReport();
    savePaperLifecycleValidation(validation);
    let now = new Date("2026-01-04T00:00:00.000Z");
    let sequence = 0;
    const incompatible = compatiblePortfolio(true);
    const service = createPaperAutomationService({
      paperPortfolio: incompatible,
      now: () => now,
      createId: () => `stale-${++sequence}`
    });
    service.start();
    const approved = service.approve({
      validationId: validation.validationId,
      approvedBy: "operator",
      confirmation: paperAutomationConfirmation.approve(validation.validationId)
    });
    expect(() =>
      service.arm({
        deploymentId: approved.deploymentId,
        confirmation: paperAutomationConfirmation.arm(approved.deploymentId)
      })
    ).toThrow("does not match");

    const compatibility = incompatible.getAutomationCompatibilityConfig();
    compatibility.legacyEntryEnabled = false;
    now = new Date("2026-01-04T00:01:00.000Z");
    service.arm({
      deploymentId: approved.deploymentId,
      confirmation: paperAutomationConfirmation.arm(approved.deploymentId)
    });
    const staleSignal = {
      mint: "StaleMint111111111111111111111111111111111",
      state: { updatedAt: "2026-01-03T00:00:00.000Z" }
    } as OverlaySignal;
    service.observeSignal(staleSignal);
    service.observeSignal(staleSignal);
    service.observeSignal(staleSignal);

    expect(service.getStatus()).toMatchObject({
      armed: false,
      deployment: { status: "paused" },
      health: {
        healthy: false,
        blockers: ["PAPER_AUTOMATION_STALE_SIGNAL_LIMIT_EXCEEDED"]
      }
    });
  });

  it("persists latency before executing an approved paper entry", () => {
    const validation = candidateReport();
    savePaperLifecycleValidation(validation);
    let now = new Date("2026-01-04T00:00:00.000Z");
    let sequence = 0;
    const portfolio = createPaperPortfolioService({
      now: () => now,
      getCurrentPriceSol: () => 1,
      getCurrentVolumeSol: () => 10,
      config: createPaperPortfolioServiceConfig({ maxDailySpendSol: 1 })
    });
    portfolio.start();
    const service = createPaperAutomationService({
      paperPortfolio: portfolio,
      now: () => now,
      createId: () => `execution-${++sequence}`
    });
    service.start();
    const approved = service.approve({
      validationId: validation.validationId,
      approvedBy: "operator",
      confirmation: paperAutomationConfirmation.approve(validation.validationId)
    });
    service.arm({
      deploymentId: approved.deploymentId,
      confirmation: paperAutomationConfirmation.arm(approved.deploymentId)
    });
    const signal = {
      mint: "AutomationMint111111111111111111111111111111",
      symbol: "AUTO",
      score: 80,
      hardReject: false,
      reasonCodes: [],
      riskLevel: "low",
      state: { updatedAt: now.toISOString() }
    } as unknown as OverlaySignal;

    service.observeSignal(signal);
    expect(service.getStatus().pendingOperations).toHaveLength(1);
    expect(portfolio.getPositionSummaryForMint(signal.mint).hasPosition).toBe(
      false
    );

    now = new Date("2026-01-04T00:00:01.000Z");
    signal.state.updatedAt = now.toISOString();
    service.observeSignal(signal);

    expect(service.getStatus().pendingOperations).toHaveLength(0);
    expect(portfolio.getPositionSummaryForMint(signal.mint)).toMatchObject({
      hasPosition: true,
      status: "open"
    });
    expect(service.getEvents().map((event) => event.kind)).toEqual(
      expect.arrayContaining(["entry_scheduled", "entry_executed"])
    );
  });
});

function compatiblePortfolio(
  legacyEntryEnabled = false
): PaperPortfolioService {
  const compatibility = {
    enabled: true,
    legacyEntryEnabled,
    legacyExitEnabled: false,
    startingCashSol: 1,
    maxPositionSizeSol: 0.01,
    maxOpenPositions: 3,
    maxDailySpendSol: 1,
    feeBps: 100,
    slippageBps: 300,
    allowPartialExits: true
  };
  return {
    getAutomationCompatibilityConfig: () => compatibility,
    getSnapshot: () => ({ equitySol: 1 })
  } as unknown as PaperPortfolioService;
}

function candidateReport() {
  return evaluatePaperLifecycleValidation({
    validationId: "lifecycle-automation-candidate",
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
