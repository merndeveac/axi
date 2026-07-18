import { describe, expect, it } from "vitest";
import { createPaperExitPolicyConfig } from "@axi/exit-strategy";
import { defaultPaperLifecycleValidationConfig } from "@axi/paper-lifecycle-validation";
import {
  createPaperAutomationForwardConfig,
  type PaperAutomationDeployment,
  type PaperAutomationEvent
} from "@axi/paper-automation";
import {
  createPaperOperationsEvidenceReport,
  createPaperOperationsSession,
  createPaperOperationsSnapshot,
  transitionPaperOperationsSession,
  type PaperOperationsEvidenceReport,
  type PaperOperationsSession
} from "@axi/paper-operations";
import {
  createPaperForwardEvaluationConfig,
  evaluatePaperForwardEvidence,
  getPaperForwardEvaluationRuntimeContract
} from "../src";

describe("@axi/paper-forward-evaluation", () => {
  it("produces only a manual candidate when the complete cohort passes", () => {
    const reports = [
      createReport(1, "2026-01-05T00:00:00.000Z"),
      createReport(2, "2026-01-05T08:00:00.000Z"),
      createReport(3, "2026-01-06T00:00:00.000Z"),
      createReport(4, "2026-01-06T08:00:00.000Z"),
      createReport(5, "2026-01-07T00:00:00.000Z")
    ];
    const report = evaluate(reports);

    expect(report).toMatchObject({
      evaluationVersion: "paper-forward-evaluation-v1",
      evaluationStatus: "manual_live_candidate",
      evidenceAudit: {
        integrityValid: true,
        completedSessionCount: 5,
        distinctUtcDayCount: 3
      },
      cohortMetrics: {
        closedTradeCount: 100,
        signalObservationCount: 250,
        totalNetPnlSol: 0.01,
        totalDataCostSol: 0.0005,
        netPnlAfterDataCostSol: 0.0095,
        dataCostToTradingPnlRatio: 0.05,
        averageNetReturnPct: 2,
        netReturnConfidenceLowerBoundPct: 2
      },
      manualReviewRequired: true,
      automaticLivePromotion: false,
      automaticLiveExecution: false,
      privateKeyAccess: false,
      transactionSigning: false,
      liveExecutionDisabled: true
    });
    expect(report.acceptanceGates.every((gate) => gate.passed)).toBe(true);
    expect(report.evidenceDigestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports insufficient evidence without weakening conservative defaults", () => {
    const report = evaluate([createReport(1, "2026-01-05T00:00:00.000Z")]);

    expect(report.evaluationStatus).toBe("insufficient_evidence");
    expect(
      report.acceptanceGates.find((gate) => gate.gate === "completed_sessions")
    ).toMatchObject({ passed: false, actual: 1, required: ">= 5" });
    expect(
      createPaperForwardEvaluationConfig({
        minimumCompletedSessions: 1,
        maximumMissedFillRate: 0.9,
        maximumP95SignalLatencyMs: 30_000
      })
    ).toMatchObject({
      minimumCompletedSessions: 5,
      maximumMissedFillRate: 0.1,
      maximumP95SignalLatencyMs: 5_000
    });
  });

  it("rejects operationally invalid or mixed-boundary evidence", () => {
    const valid = createReport(1, "2026-01-05T00:00:00.000Z");
    const event = valid.automationEvents[0] as PaperAutomationEvent;
    const invalid = {
      ...valid,
      automationEvents: [
        {
          ...event,
          observedAt: "2026-01-04T00:00:00.000Z"
        },
        ...valid.automationEvents.slice(1)
      ]
    };
    const report = evaluate([invalid]);

    expect(report.evaluationStatus).toBe("operational_rejected");
    expect(report.evidenceAudit).toMatchObject({
      integrityValid: false,
      outOfBoundaryAutomationEventCount: 1
    });
  });

  it("rejects a sufficiently large cohort when forward edge is negative", () => {
    const reports = [
      createReport(1, "2026-01-05T00:00:00.000Z", -0.0001),
      createReport(2, "2026-01-05T08:00:00.000Z", -0.0001),
      createReport(3, "2026-01-06T00:00:00.000Z", -0.0001),
      createReport(4, "2026-01-06T08:00:00.000Z", -0.0001),
      createReport(5, "2026-01-07T00:00:00.000Z", -0.0001)
    ];
    const report = evaluate(reports);

    expect(report.evaluationStatus).toBe("edge_rejected");
    expect(
      report.acceptanceGates.find((gate) => gate.gate === "forward_expectancy")
    ).toMatchObject({ passed: false, actual: -2 });
    expect(report.automaticLivePromotion).toBe(false);
  });

  it("cannot qualify evidence from a revoked deployment", () => {
    const reports = [
      createReport(1, "2026-01-05T00:00:00.000Z"),
      createReport(2, "2026-01-05T08:00:00.000Z"),
      createReport(3, "2026-01-06T00:00:00.000Z"),
      createReport(4, "2026-01-06T08:00:00.000Z"),
      createReport(5, "2026-01-07T00:00:00.000Z")
    ];
    const report = evaluatePaperForwardEvidence({
      evaluationId: "revoked-evaluation",
      evaluatedAt: "2026-01-08T00:00:00.000Z",
      evaluatedBy: "operator",
      deployment: { ...deploymentFixture(), status: "revoked" },
      reports
    });

    expect(report.evaluationStatus).toBe("operational_rejected");
    expect(
      report.acceptanceGates.find((gate) => gate.gate === "deployment_inactive")
    ).toMatchObject({ passed: false, actual: "revoked" });
    expect(report.evidenceDigestSha256).toBe(
      evaluate(reports).evidenceDigestSha256
    );
    expect(report.automaticLivePromotion).toBe(false);
  });

  it("discloses excluded interrupted sessions and pins a deterministic digest", () => {
    const reports = [
      createReport(1, "2026-01-05T00:00:00.000Z"),
      createReport(2, "2026-01-05T08:00:00.000Z")
    ];
    const first = evaluatePaperForwardEvidence({
      evaluationId: "evaluation-a",
      evaluatedAt: "2026-01-08T00:00:00.000Z",
      evaluatedBy: "operator",
      deployment: deploymentFixture(),
      reports,
      excludedInterruptedSessionIds: ["interrupted-1"]
    });
    const second = evaluatePaperForwardEvidence({
      evaluationId: "evaluation-b",
      evaluatedAt: "2026-01-09T00:00:00.000Z",
      evaluatedBy: "another-operator",
      deployment: deploymentFixture(),
      reports: reports.map((report) => ({
        ...report,
        automationEvents: report.automationEvents.map((event, index) => ({
          ...(event as object),
          id: index + 100
        }))
      })),
      excludedInterruptedSessionIds: ["interrupted-1"]
    });

    expect(first.evidenceAudit).toMatchObject({
      excludedInterruptedSessionCount: 1,
      excludedInterruptedSessionIds: ["interrupted-1"]
    });
    expect(first.evaluationStatus).toBe("operational_rejected");
    expect(
      first.acceptanceGates.find((gate) => gate.gate === "interrupted_sessions")
    ).toMatchObject({ passed: false, actual: 1, required: "= 0" });
    expect(first.evidenceDigestSha256).toBe(second.evidenceDigestSha256);
    expect(getPaperForwardEvaluationRuntimeContract()).toMatchObject({
      candidateMeaning: "manual_review_only_no_activation",
      automaticLivePromotion: false,
      privateKeyAccess: false,
      transactionSigning: false,
      liveExecutionDisabled: true
    });
  });
});

function evaluate(reports: PaperOperationsEvidenceReport[]) {
  return evaluatePaperForwardEvidence({
    evaluationId: "forward-evaluation-test",
    evaluatedAt: "2026-01-08T00:00:00.000Z",
    evaluatedBy: "test-operator",
    deployment: deploymentFixture(),
    reports
  });
}

function createReport(
  sequence: number,
  startedAt: string,
  realizedPnlSol = 0.0001
): PaperOperationsEvidenceReport {
  const session = createSession(sequence, startedAt);
  const startMs = Date.parse(startedAt);
  const endedAt = new Date(startMs + 3_600_000).toISOString();
  const snapshots = Array.from({ length: 50 }, (_, index) =>
    createPaperOperationsSnapshot(session, {
      sampleId: `sample-${sequence}-${index}`,
      sessionId: session.sessionId,
      deploymentId: session.deploymentId,
      runtimeSessionId: session.runtimeSessionId,
      kind: "signal_latency",
      observedAt: new Date(startMs + 1_000 + index * 1_000).toISOString(),
      meteredActive: true,
      feedConnected: true,
      lastEventAt: new Date(startMs + index * 1_000).toISOString(),
      trackedMintCount: 1,
      meteredEventCount: index * 10,
      estimatedCostSol: index === 49 ? 0.0001 : 0,
      budgetReached: false,
      dataWalletBalanceSol: 1,
      dataWalletBalanceStatus: "ok",
      signalMint: `signal-mint-${sequence}-${index}`,
      signalAt: new Date(startMs + 900 + index * 1_000).toISOString(),
      signalLatencyMs: 100,
      automationStatus: "armed",
      automationHealthy: true,
      pendingOperationCount: 0,
      closedTradeCount: Math.min(index, 20),
      winCount: realizedPnlSol > 0 ? Math.min(index, 20) : 0,
      totalNetPnlSol: realizedPnlSol * Math.min(index, 20),
      maximumDrawdownPct: realizedPnlSol < 0 ? 2 : 0,
      timeseriesAcceptedEventCount: index * 10,
      timeseriesDuplicateEventCount: 0,
      timeseriesInvalidEventCount: 0,
      timeseriesLateEventCount: 0,
      timeseriesGapCount: 0,
      storageWriteHealthy: true,
      reasonCodes: ["TEST_FORWARD_SIGNAL"],
      payload: {}
    })
  );
  const events = Array.from({ length: 20 }, (_, index) => {
    const mint = `trade-mint-${sequence}-${index}`;
    return [
      automationEvent({
        eventId: `entry-${sequence}-${index}`,
        kind: "entry_executed",
        mint,
        observedAt: new Date(startMs + 120_000 + index * 5_000).toISOString(),
        entryFeeSol: 0,
        positionSizeSol: 0.005
      }),
      automationEvent({
        eventId: `exit-${sequence}-${index}`,
        kind: "exit_executed",
        mint,
        observedAt: new Date(startMs + 180_000 + index * 5_000).toISOString(),
        positionSizeSol: 0.005,
        realizedPnlSol,
        positionClosed: true
      })
    ];
  }).flat();
  const completed = transitionPaperOperationsSession({
    session,
    status: "completed",
    at: endedAt,
    reason: "test session completed",
    reasonCodes: ["PAPER_OPERATIONS_OPERATOR_COMPLETED"]
  });
  return createPaperOperationsEvidenceReport({
    reportId: `report-${sequence}`,
    generatedAt: endedAt,
    session: completed,
    snapshots,
    alerts: [],
    automationEvents: events,
    automationOperations: []
  });
}

function createSession(
  sequence: number,
  startedAt: string
): PaperOperationsSession {
  return createPaperOperationsSession({
    sessionId: `session-${sequence}`,
    deploymentId: "deployment-forward-evaluation-test",
    deploymentStatus: "approved",
    runtimeSessionId: `runtime-${sequence}`,
    startedBy: "test-operator",
    startedAt
  });
}

function automationEvent(
  input: Pick<
    PaperAutomationEvent,
    "eventId" | "kind" | "mint" | "observedAt"
  > &
    Partial<
      Pick<
        PaperAutomationEvent,
        "entryFeeSol" | "positionSizeSol" | "realizedPnlSol" | "positionClosed"
      >
    >
): PaperAutomationEvent {
  return {
    schemaVersion: 1,
    eventId: input.eventId,
    deploymentId: "deployment-forward-evaluation-test",
    operationId: null,
    kind: input.kind,
    mint: input.mint,
    observedAt: input.observedAt,
    orderId: null,
    fillId: null,
    entryFeeSol: input.entryFeeSol ?? null,
    positionSizeSol: input.positionSizeSol ?? null,
    realizedPnlSol: input.realizedPnlSol ?? null,
    positionClosed: input.positionClosed ?? null,
    reasonCodes: ["TEST_FORWARD_EVENT"],
    payload: {},
    paperOnly: true,
    liveExecutionDisabled: true
  };
}

function deploymentFixture(): PaperAutomationDeployment {
  return {
    schemaVersion: 1,
    automationVersion: "paper-automation-v1",
    deploymentId: "deployment-forward-evaluation-test",
    validationId: "validation-forward-evaluation-test",
    validationVersion: "paper-lifecycle-validation-v1",
    strategyEvaluationId: "strategy-forward-evaluation-test",
    strategyEvaluationVersion: "paper-strategy-evaluation-v1",
    selectedThreshold: 75,
    exitPolicyVersion: "paper-exit-policy-v1",
    executionConfig: defaultPaperLifecycleValidationConfig,
    exitPolicyConfig: createPaperExitPolicyConfig(),
    validationExpectancyPct: 1,
    validationConfidenceLowerBoundPct: 0.5,
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
