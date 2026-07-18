import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaperExitPolicyConfig } from "@axi/exit-strategy";
import { defaultPaperLifecycleValidationConfig } from "@axi/paper-lifecycle-validation";
import {
  createPaperAutomationForwardConfig,
  type PaperAutomationDeployment
} from "@axi/paper-automation";
import type { TradeTimeseriesStatus } from "@axi/timeseries";
import {
  closeStorage,
  getLatestPaperOperationsSession,
  initStorage,
  listPaperOperationsAlerts,
  listPaperOperationsSnapshots,
  savePaperAutomationDeployment
} from "@axi/storage";
import type { MeteredLaunchDataService } from "../src/metered-launch-data-service";
import type { PaperAutomationService } from "../src/paper-automation-service";
import {
  createPaperOperationsService,
  paperOperationsConfirmation
} from "../src/paper-operations-service";

let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-paper-operations-"));
  initStorage({ databasePath: join(testDirectory, "axi.sqlite") });
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("PaperOperationsService", () => {
  it("requires exact start/end confirmations and exports finalized evidence", () => {
    const deployment = savePaperAutomationDeployment(deploymentFixture());
    let now = new Date("2026-01-05T00:00:00.000Z");
    const harness = createHarness(deployment, () => now);
    harness.service.start();

    expect(() =>
      harness.service.startSession({
        deploymentId: deployment.deploymentId,
        startedBy: "operator",
        confirmation: "wrong"
      })
    ).toThrow("Exact confirmation required");
    const session = harness.service.startSession({
      deploymentId: deployment.deploymentId,
      startedBy: "operator",
      confirmation: paperOperationsConfirmation.start(deployment.deploymentId)
    });

    expect(session).toMatchObject({
      status: "active",
      automaticMeteredStart: false,
      automaticPaperArm: false,
      automaticLiveExecution: false
    });
    expect(harness.meteredStartCount).toBe(0);
    expect(() =>
      harness.service.buildEvidenceReport(session.sessionId)
    ).toThrow("active session");

    now = new Date("2026-01-05T00:01:00.000Z");
    const completed = harness.service.endSession({
      sessionId: session.sessionId,
      confirmation: paperOperationsConfirmation.end(session.sessionId)
    });
    expect(completed.status).toBe("completed");
    expect(
      harness.service.buildEvidenceReport(session.sessionId)
    ).toMatchObject({
      manifest: { finalized: true, sampleCount: 2 },
      session: { status: "completed" },
      liveExecutionDisabled: true
    });
  });

  it("stops metered tracking and pauses armed automation on budget breach", () => {
    const deployment = savePaperAutomationDeployment(deploymentFixture());
    const harness = createHarness(
      deployment,
      () => new Date("2026-01-05T00:00:01.000Z")
    );
    harness.service.start();
    const session = harness.service.startSession({
      deploymentId: deployment.deploymentId,
      startedBy: "operator",
      confirmation: paperOperationsConfirmation.start(deployment.deploymentId),
      config: { maximumSessionCostSol: 0.0005 }
    });
    harness.setAutomationStatus("armed");
    harness.setMetered({ active: true, estimatedCostSol: 0.0005 });
    harness.service.sampleNow();

    expect(harness.meteredStopCount).toBe(1);
    expect(harness.pauseReasonCodes).toEqual(
      expect.arrayContaining([
        "PAPER_OPERATIONS_FAIL_CLOSED_PAUSE",
        "PAPER_OPERATIONS_BUDGET_EXCEEDED"
      ])
    );
    expect(
      listPaperOperationsAlerts(session.sessionId).map((alert) => alert.code)
    ).toContain("PAPER_OPERATIONS_BUDGET_EXCEEDED");
  });

  it("accounts for only cost and events incurred inside the evidence boundary", () => {
    const deployment = savePaperAutomationDeployment(deploymentFixture());
    const harness = createHarness(
      deployment,
      () => new Date("2026-01-05T00:00:01.000Z")
    );
    harness.setMetered({
      estimatedCostSol: 0.0002,
      totalEventsThisSession: 200
    });
    harness.service.start();
    const session = harness.service.startSession({
      deploymentId: deployment.deploymentId,
      startedBy: "operator",
      confirmation: paperOperationsConfirmation.start(deployment.deploymentId)
    });
    harness.setMetered({
      estimatedCostSol: 0.0004,
      totalEventsThisSession: 450
    });
    const sample = harness.service.sampleNow();

    expect(session).toMatchObject({
      startingMeteredCostSol: 0.0002,
      startingMeteredEventCount: 200
    });
    expect(sample).toMatchObject({
      estimatedCostSol: 0.0002,
      meteredEventCount: 250
    });
  });

  it("marks an active session interrupted on restart without auto-resuming", () => {
    const deployment = savePaperAutomationDeployment(deploymentFixture());
    const now = () => new Date("2026-01-05T00:00:00.000Z");
    const first = createHarness(deployment, now);
    first.service.start();
    const session = first.service.startSession({
      deploymentId: deployment.deploymentId,
      startedBy: "operator",
      confirmation: paperOperationsConfirmation.start(deployment.deploymentId)
    });

    const restarted = createHarness(
      deployment,
      () => new Date("2026-01-05T00:02:00.000Z")
    );
    restarted.service.start();

    expect(restarted.service.getStatus()).toMatchObject({
      active: false,
      session: {
        sessionId: session.sessionId,
        status: "interrupted",
        automaticMeteredStart: false,
        automaticPaperArm: false
      }
    });
    expect(getLatestPaperOperationsSession()?.status).toBe("interrupted");
    expect(
      listPaperOperationsSnapshots(session.sessionId).map(
        (snapshot) => snapshot.kind
      )
    ).toEqual(
      expect.arrayContaining(["session_started", "restart_reconciled"])
    );
  });
});

function createHarness(deployment: PaperAutomationDeployment, now: () => Date) {
  let automationStatus = deployment.status;
  let metered = {
    active: false,
    estimatedCostSol: 0,
    budgetReached: false,
    totalEventsThisSession: 0
  };
  let pauseReasonCodes: string[] = [];
  let meteredStopCount = 0;
  const paperAutomation = {
    getStatus: () => ({
      started: true,
      deployment: { ...deployment, status: automationStatus },
      health: {
        healthy: true,
        metrics: {
          closedTradeCount: 0,
          winCount: 0,
          totalNetPnlSol: 0,
          maximumDrawdownPct: 0
        }
      },
      pendingOperations: []
    }),
    pause: (reasonCodes: string[]) => {
      pauseReasonCodes = reasonCodes;
      automationStatus = "paused";
    }
  } as unknown as PaperAutomationService;
  const meteredLaunchData = {
    getStatus: () => ({
      ...metered,
      maxSessionCostSol: 0.001,
      maxUiSessionCostSol: 0.001,
      remainingBudgetSol: 0.001,
      trackedMintCount: metered.active ? 1 : 0,
      totalEventsThisSession: metered.totalEventsThisSession,
      dataWalletBalanceSol: 1,
      dataWalletBalanceStatus: "ok"
    }),
    stop: () => {
      meteredStopCount += 1;
      metered = { ...metered, active: false };
    }
  } as unknown as MeteredLaunchDataService;
  let sequence = 0;
  const service = createPaperOperationsService({
    runtimeSessionId: "runtime-test",
    paperAutomation,
    meteredLaunchData,
    getFeedStatus: () => ({
      connected: true,
      lastEventAt: "2026-01-05T00:00:00.000Z",
      reconnectAttempts: 0,
      parseErrorCount: 0,
      lastError: null
    }),
    getTimeseriesStatus: timeseriesStatus,
    getTimeseriesGapCount: () => 0,
    now,
    createId: () => `test-${++sequence}`,
    sampleIntervalMs: 10_000,
    automaticSampling: false
  });
  return {
    service,
    setAutomationStatus: (status: PaperAutomationDeployment["status"]) => {
      automationStatus = status;
    },
    setMetered: (input: Partial<typeof metered>) => {
      metered = { ...metered, ...input };
    },
    get meteredStopCount() {
      return meteredStopCount;
    },
    get meteredStartCount() {
      return 0;
    },
    get pauseReasonCodes() {
      return pauseReasonCodes;
    }
  };
}

function timeseriesStatus(): TradeTimeseriesStatus {
  return {
    implemented: true,
    canonical: true,
    bucketMs: 1_000,
    retentionMs: 300_000,
    bucketCapacityPerMint: 300,
    mintCount: 0,
    bucketCount: 0,
    acceptedEventCount: 0,
    duplicateEventCount: 0,
    invalidEventCount: 0,
    lateEventCount: 0,
    prunedBucketCount: 0,
    derivativeReadyMintCount: 0,
    accelerationReadyMintCount: 0,
    derivativeMethod: "event_time_finite_difference",
    earliestBucketStart: null,
    latestBucketStart: null,
    lastEventAt: null,
    reasonCodes: [],
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  };
}

function deploymentFixture(): PaperAutomationDeployment {
  return {
    schemaVersion: 1,
    automationVersion: "paper-automation-v1",
    deploymentId: "paper-automation-operations-test",
    validationId: "lifecycle-operations-test",
    validationVersion: "paper-lifecycle-validation-v1",
    strategyEvaluationId: "strategy-operations-test",
    strategyEvaluationVersion: "paper-strategy-evaluation-v1",
    selectedThreshold: 75,
    exitPolicyVersion: "paper-exit-policy-v1",
    executionConfig: defaultPaperLifecycleValidationConfig,
    exitPolicyConfig: createPaperExitPolicyConfig(),
    validationExpectancyPct: 10,
    validationConfidenceLowerBoundPct: 5,
    forwardStartingEquitySol: 1,
    forwardConfig: createPaperAutomationForwardConfig(),
    approvedBy: "test-operator",
    approvedAt: "2026-01-04T00:00:00.000Z",
    status: "approved",
    statusReasonCodes: ["PAPER_AUTOMATION_OPERATOR_APPROVED"],
    armedAt: null,
    pausedAt: null,
    revokedAt: null,
    updatedAt: "2026-01-04T00:00:00.000Z",
    automaticLiveExecution: false,
    paperOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true
  };
}
