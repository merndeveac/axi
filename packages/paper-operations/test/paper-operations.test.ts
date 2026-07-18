import { describe, expect, it } from "vitest";
import {
  createPaperOperationsConfig,
  createPaperOperationsEvidenceReport,
  createPaperOperationsSession,
  createPaperOperationsSnapshot,
  defaultPaperOperationsConfig,
  evaluatePaperOperationsAlerts,
  getPaperOperationsRuntimeContract,
  transitionPaperOperationsSession,
  type PaperOperationsSession,
  type PaperOperationsSnapshotInput
} from "../src/index";

const startedAt = "2026-01-01T00:00:00.000Z";

describe("@axi/paper-operations", () => {
  it("only accepts conservative forward-session limits", () => {
    expect(
      createPaperOperationsConfig({
        maximumSessionCostSol: 1,
        budgetWarningRatio: 0.99,
        maximumFeedSilenceMs: 60_000,
        maximumTelemetryGapMs: 60_000,
        maximumSignalLatencyMs: 60_000,
        maximumSessionDurationMs: 999_999_999
      })
    ).toEqual(defaultPaperOperationsConfig);
    expect(
      createPaperOperationsConfig({
        maximumSessionCostSol: 0.0005,
        budgetWarningRatio: 0.5,
        maximumFeedSilenceMs: 5_000
      })
    ).toMatchObject({
      maximumSessionCostSol: 0.0005,
      budgetWarningRatio: 0.5,
      maximumFeedSilenceMs: 5_000
    });
  });

  it("requires an unarmed, non-revoked deployment and keeps activation manual", () => {
    const session = createSession();
    expect(session).toMatchObject({
      status: "active",
      automaticMeteredStart: false,
      automaticPaperArm: false,
      automaticLiveExecution: false,
      paperOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
    expect(() =>
      createPaperOperationsSession({
        sessionId: "revoked-session",
        deploymentId: "deployment-1",
        deploymentStatus: "revoked",
        runtimeSessionId: "runtime-1",
        startedBy: "operator",
        startedAt
      })
    ).toThrow("revoked");
    expect(() =>
      createPaperOperationsSession({
        sessionId: "armed-session",
        deploymentId: "deployment-1",
        deploymentStatus: "armed",
        runtimeSessionId: "runtime-1",
        startedBy: "operator",
        startedAt
      })
    ).toThrow("before paper automation is armed");
  });

  it("fails closed when an active session is interrupted", () => {
    const interrupted = transitionPaperOperationsSession({
      session: createSession(),
      status: "interrupted",
      at: "2026-01-01T00:01:00.000Z",
      reason: "runtime restart",
      reasonCodes: ["PAPER_OPERATIONS_RUNTIME_RESTART"]
    });
    expect(interrupted).toMatchObject({
      status: "interrupted",
      endReason: "runtime restart",
      automaticMeteredStart: false,
      automaticPaperArm: false
    });
    expect(() =>
      transitionPaperOperationsSession({
        session: interrupted,
        status: "completed",
        at: "2026-01-01T00:02:00.000Z",
        reason: "invalid second close",
        reasonCodes: []
      })
    ).toThrow("cannot transition");
  });

  it("alerts and enforces a metered budget breach", () => {
    const session = createSession({ maximumSessionCostSol: 0.0005 });
    const snapshot = createSnapshot(session, {
      estimatedCostSol: 0.0005,
      budgetReached: true,
      meteredActive: true,
      feedConnected: false,
      feedSilenceMs: 20_000,
      telemetryGapMs: 31_000,
      automationHealthy: false
    });
    const result = evaluatePaperOperationsAlerts({ session, snapshot });

    expect(result.alerts.map((alert) => alert.code)).toEqual(
      expect.arrayContaining([
        "PAPER_OPERATIONS_FEED_DISCONNECTED",
        "PAPER_OPERATIONS_FEED_STALE",
        "PAPER_OPERATIONS_TELEMETRY_GAP",
        "PAPER_OPERATIONS_BUDGET_EXCEEDED",
        "PAPER_OPERATIONS_PROVIDER_BUDGET_REACHED",
        "PAPER_OPERATIONS_AUTOMATION_UNHEALTHY"
      ])
    );
    expect(result.pauseAutomation).toBe(true);
    expect(result.stopMeteredData).toBe(true);
  });

  it("finalizes a deterministic evidence manifest only after session close", () => {
    const session = createSession();
    const snapshot = createSnapshot(session, {
      signalMint: "mint-1",
      signalAt: "2026-01-01T00:00:00.500Z",
      signalLatencyMs: 500,
      estimatedCostSol: 0.0002
    });
    expect(() =>
      createPaperOperationsEvidenceReport({
        reportId: "report-active",
        generatedAt: "2026-01-01T00:02:00.000Z",
        session,
        snapshots: [snapshot],
        alerts: [],
        automationEvents: [],
        automationOperations: []
      })
    ).toThrow("active session");

    const completed = transitionPaperOperationsSession({
      session,
      status: "completed",
      at: "2026-01-01T00:01:00.000Z",
      reason: "operator completed",
      reasonCodes: ["PAPER_OPERATIONS_OPERATOR_COMPLETED"]
    });
    const report = createPaperOperationsEvidenceReport({
      reportId: "report-completed",
      generatedAt: "2026-01-01T00:02:00.000Z",
      session: completed,
      snapshots: [snapshot],
      alerts: [],
      automationEvents: [{ kind: "entry_executed" }],
      automationOperations: [{ status: "executed" }]
    });
    expect(report).toMatchObject({
      manifest: {
        finalized: true,
        sampleCount: 1,
        automationEventCount: 1,
        automationOperationCount: 1
      },
      summary: {
        signalObservationCount: 1,
        p95SignalLatencyMs: 500,
        finalEstimatedCostSol: 0.0002
      },
      automaticLiveExecution: false,
      liveExecutionDisabled: true
    });
    expect(getPaperOperationsRuntimeContract()).toMatchObject({
      budgetEnforcement: "stop_metered_and_pause_paper_automation",
      automaticMeteredStart: false,
      automaticLiveExecution: false
    });
  });
});

function createSession(
  config: Parameters<typeof createPaperOperationsSession>[0]["config"] = {}
): PaperOperationsSession {
  return createPaperOperationsSession({
    sessionId: "forward-session-1",
    deploymentId: "deployment-1",
    deploymentStatus: "approved",
    runtimeSessionId: "runtime-1",
    startedBy: "operator",
    startedAt,
    config
  });
}

function createSnapshot(
  session: PaperOperationsSession,
  overrides: Partial<PaperOperationsSnapshotInput> = {}
) {
  return createPaperOperationsSnapshot(session, {
    sampleId: "sample-1",
    sessionId: session.sessionId,
    deploymentId: session.deploymentId,
    runtimeSessionId: session.runtimeSessionId,
    kind: "runtime_sample",
    observedAt: "2026-01-01T00:00:01.000Z",
    meteredActive: false,
    feedConnected: true,
    lastEventAt: "2026-01-01T00:00:00.000Z",
    trackedMintCount: 0,
    meteredEventCount: 0,
    estimatedCostSol: 0,
    budgetReached: false,
    dataWalletBalanceSol: 1,
    dataWalletBalanceStatus: "ok",
    signalMint: null,
    signalAt: null,
    signalLatencyMs: null,
    automationStatus: "approved",
    automationHealthy: true,
    pendingOperationCount: 0,
    closedTradeCount: 0,
    winCount: 0,
    totalNetPnlSol: 0,
    maximumDrawdownPct: 0,
    timeseriesAcceptedEventCount: 0,
    timeseriesDuplicateEventCount: 0,
    timeseriesInvalidEventCount: 0,
    timeseriesLateEventCount: 0,
    timeseriesGapCount: 0,
    storageWriteHealthy: true,
    reasonCodes: [],
    payload: {},
    ...overrides
  });
}
