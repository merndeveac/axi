import { createHash } from "node:crypto";
import {
  calculatePaperAutomationForwardMetrics,
  type PaperAutomationDeployment,
  type PaperAutomationEvent,
  type PaperAutomationForwardMetrics
} from "@axi/paper-automation";
import type {
  PaperOperationsEvidenceReport,
  PaperOperationsSnapshot
} from "@axi/paper-operations";

export const paperForwardEvaluationVersion =
  "paper-forward-evaluation-v1" as const;

export type PaperForwardEvaluationStatus =
  | "insufficient_evidence"
  | "operational_rejected"
  | "edge_rejected"
  | "manual_live_candidate";

export type PaperForwardEvaluationConfig = {
  schemaVersion: 1;
  minimumCompletedSessions: number;
  minimumDistinctUtcDays: number;
  minimumTotalDurationMs: number;
  minimumClosedTrades: number;
  minimumSignalObservations: number;
  confidenceLevel: 0.95;
  confidenceZScore: 1.96;
  minimumForwardExpectancyPct: 0;
  minimumConfidenceLowerBoundPct: 0;
  maximumMissedFillRate: number;
  maximumDataCostToTradingPnlRatio: number;
  maximumP95SignalLatencyMs: number;
};

export type PaperForwardEvaluationConfigInput = Partial<
  Omit<
    PaperForwardEvaluationConfig,
    | "schemaVersion"
    | "confidenceLevel"
    | "confidenceZScore"
    | "minimumForwardExpectancyPct"
    | "minimumConfidenceLowerBoundPct"
  >
>;

export const defaultPaperForwardEvaluationConfig: PaperForwardEvaluationConfig =
  {
    schemaVersion: 1,
    minimumCompletedSessions: 5,
    minimumDistinctUtcDays: 3,
    minimumTotalDurationMs: 18_000_000,
    minimumClosedTrades: 100,
    minimumSignalObservations: 250,
    confidenceLevel: 0.95,
    confidenceZScore: 1.96,
    minimumForwardExpectancyPct: 0,
    minimumConfidenceLowerBoundPct: 0,
    maximumMissedFillRate: 0.1,
    maximumDataCostToTradingPnlRatio: 0.25,
    maximumP95SignalLatencyMs: 5_000
  };

export type PaperForwardAcceptanceGate = {
  gate: string;
  category: "evidence" | "operational" | "edge";
  passed: boolean;
  actual: number | string | boolean | null;
  required: string;
  reasonCode: string;
};

export type PaperForwardSessionEvaluation = {
  sessionId: string;
  reportId: string;
  runtimeSessionId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  signalObservationCount: number;
  closedTradeCount: number;
  totalNetPnlSol: number;
  dataCostSol: number;
  criticalAlertCount: number;
  telemetryGapCount: number;
  dataGapCount: number;
  p95SignalLatencyMs: number | null;
  boundaryFlat: boolean;
};

export type PaperForwardEvidenceAudit = {
  requestedReportCount: number;
  completedSessionCount: number;
  excludedInterruptedSessionCount: number;
  excludedInterruptedSessionIds: string[];
  distinctUtcDayCount: number;
  duplicateSessionCount: number;
  duplicateReportCount: number;
  duplicateAutomationEventCount: number;
  invalidAutomationEventCount: number;
  outOfBoundaryAutomationEventCount: number;
  overlappingSessionCount: number;
  deploymentMismatchCount: number;
  unsafeEvidenceCount: number;
  manifestMismatchCount: number;
  integrityValid: boolean;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  reasonCodes: string[];
};

export type PaperForwardCohortMetrics = PaperAutomationForwardMetrics & {
  totalSessionDurationMs: number;
  signalObservationCount: number;
  warningAlertCount: number;
  criticalAlertCount: number;
  telemetryGapCount: number;
  dataGapCount: number;
  duplicateTimeseriesEventCount: number;
  invalidTimeseriesEventCount: number;
  lateTimeseriesEventCount: number;
  maximumFeedSilenceMs: number | null;
  maximumTelemetryGapMs: number | null;
  p95SignalLatencyMs: number | null;
  maximumSignalLatencyMs: number | null;
  averageNetReturnStandardDeviationPct: number | null;
  averageNetReturnStandardErrorPct: number | null;
  netReturnConfidenceLowerBoundPct: number | null;
  netReturnConfidenceUpperBoundPct: number | null;
  validationExpectancyPct: number;
  expectancyRetentionRatio: number | null;
  totalDataCostSol: number;
  netPnlAfterDataCostSol: number;
  dataCostToTradingPnlRatio: number | null;
  costPerSignalSol: number | null;
  costPerClosedTradeSol: number | null;
  budgetBreachSessionCount: number;
  openPositionBoundaryViolationCount: number;
};

export type PaperForwardEvaluationReport = {
  schemaVersion: 1;
  evaluationVersion: typeof paperForwardEvaluationVersion;
  evaluationId: string;
  evaluatedAt: string;
  evaluatedBy: string;
  evaluationPolicy: "all_completed_same_deployment_forward_sessions";
  evidenceDigestSha256: string;
  deploymentProvenance: {
    deploymentId: string;
    automationVersion: "paper-automation-v1";
    deploymentStatus: PaperAutomationDeployment["status"];
    validationId: string;
    strategyEvaluationId: string;
    selectedThreshold: number;
    exitPolicyVersion: "paper-exit-policy-v1";
    validationExpectancyPct: number;
    validationConfidenceLowerBoundPct: number;
    approvedAt: string;
  };
  config: PaperForwardEvaluationConfig;
  sessionIds: string[];
  evidenceReportIds: string[];
  evidenceAudit: PaperForwardEvidenceAudit;
  sessions: PaperForwardSessionEvaluation[];
  cohortMetrics: PaperForwardCohortMetrics;
  acceptanceGates: PaperForwardAcceptanceGate[];
  evaluationStatus: PaperForwardEvaluationStatus;
  manualReviewRequired: true;
  automaticLivePromotion: false;
  automaticLiveExecution: false;
  privateKeyAccess: false;
  transactionSigning: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
  reasonCodes: string[];
};

export type EvaluatePaperForwardEvidenceInput = {
  evaluationId: string;
  evaluatedAt: string;
  evaluatedBy: string;
  deployment: PaperAutomationDeployment;
  reports: readonly PaperOperationsEvidenceReport[];
  excludedInterruptedSessionIds?: readonly string[];
  config?: PaperForwardEvaluationConfigInput;
};

type ClosedTrade = { netPnlSol: number; netReturnPct: number };

export function createPaperForwardEvaluationConfig(
  input: PaperForwardEvaluationConfigInput = {}
): PaperForwardEvaluationConfig {
  return {
    schemaVersion: 1,
    minimumCompletedSessions: stricterMinimumInteger(
      input.minimumCompletedSessions,
      defaultPaperForwardEvaluationConfig.minimumCompletedSessions,
      1_000
    ),
    minimumDistinctUtcDays: stricterMinimumInteger(
      input.minimumDistinctUtcDays,
      defaultPaperForwardEvaluationConfig.minimumDistinctUtcDays,
      365
    ),
    minimumTotalDurationMs: stricterMinimumInteger(
      input.minimumTotalDurationMs,
      defaultPaperForwardEvaluationConfig.minimumTotalDurationMs,
      365 * 86_400_000
    ),
    minimumClosedTrades: stricterMinimumInteger(
      input.minimumClosedTrades,
      defaultPaperForwardEvaluationConfig.minimumClosedTrades,
      1_000_000
    ),
    minimumSignalObservations: stricterMinimumInteger(
      input.minimumSignalObservations,
      defaultPaperForwardEvaluationConfig.minimumSignalObservations,
      10_000_000
    ),
    confidenceLevel: 0.95,
    confidenceZScore: 1.96,
    minimumForwardExpectancyPct: 0,
    minimumConfidenceLowerBoundPct: 0,
    maximumMissedFillRate: stricterMaximumRatio(
      input.maximumMissedFillRate,
      defaultPaperForwardEvaluationConfig.maximumMissedFillRate
    ),
    maximumDataCostToTradingPnlRatio: stricterMaximumRatio(
      input.maximumDataCostToTradingPnlRatio,
      defaultPaperForwardEvaluationConfig.maximumDataCostToTradingPnlRatio
    ),
    maximumP95SignalLatencyMs: stricterMaximumInteger(
      input.maximumP95SignalLatencyMs,
      defaultPaperForwardEvaluationConfig.maximumP95SignalLatencyMs,
      1
    )
  };
}

export function evaluatePaperForwardEvidence(
  input: EvaluatePaperForwardEvidenceInput
): PaperForwardEvaluationReport {
  const evaluationId = requireText(input.evaluationId, "evaluation ID");
  const evaluatedAt = requireIso(input.evaluatedAt, "evaluation timestamp");
  const evaluatedBy = requireText(input.evaluatedBy, "operator identity");
  assertDeploymentSafety(input.deployment);
  const config = createPaperForwardEvaluationConfig(input.config);
  const reports = [...input.reports].sort(
    (left, right) =>
      Date.parse(left.session.startedAt) -
        Date.parse(right.session.startedAt) ||
      left.session.sessionId.localeCompare(right.session.sessionId)
  );
  const excludedInterruptedSessionIds = unique(
    (input.excludedInterruptedSessionIds ?? []).map((value) =>
      requireText(value, "interrupted session ID")
    )
  ).sort();
  const audit = auditEvidence(
    input.deployment,
    reports,
    excludedInterruptedSessionIds
  );
  const validEvents = reports.flatMap((report) =>
    report.automationEvents.filter(isPaperAutomationEvent)
  );
  const metrics = buildCohortMetrics(input.deployment, reports, validEvents);
  const sessions = reports.map((report) =>
    buildSessionEvaluation(report, input.deployment.forwardStartingEquitySol)
  );
  const acceptanceGates = buildAcceptanceGates({
    audit,
    config,
    deployment: input.deployment,
    metrics
  });
  const evaluationStatus = determineStatus(acceptanceGates);
  const evidenceDigestSha256 = digestEvidence(
    input.deployment,
    reports,
    excludedInterruptedSessionIds
  );

  return {
    schemaVersion: 1,
    evaluationVersion: paperForwardEvaluationVersion,
    evaluationId,
    evaluatedAt,
    evaluatedBy,
    evaluationPolicy: "all_completed_same_deployment_forward_sessions",
    evidenceDigestSha256,
    deploymentProvenance: {
      deploymentId: input.deployment.deploymentId,
      automationVersion: input.deployment.automationVersion,
      deploymentStatus: input.deployment.status,
      validationId: input.deployment.validationId,
      strategyEvaluationId: input.deployment.strategyEvaluationId,
      selectedThreshold: input.deployment.selectedThreshold,
      exitPolicyVersion: input.deployment.exitPolicyVersion,
      validationExpectancyPct: input.deployment.validationExpectancyPct,
      validationConfidenceLowerBoundPct:
        input.deployment.validationConfidenceLowerBoundPct,
      approvedAt: input.deployment.approvedAt
    },
    config,
    sessionIds: reports.map((report) => report.session.sessionId),
    evidenceReportIds: reports.map((report) => report.reportId),
    evidenceAudit: audit,
    sessions,
    cohortMetrics: metrics,
    acceptanceGates,
    evaluationStatus,
    manualReviewRequired: true,
    automaticLivePromotion: false,
    automaticLiveExecution: false,
    privateKeyAccess: false,
    transactionSigning: false,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true,
    reasonCodes: unique([
      "PAPER_FORWARD_ALL_COMPLETED_SESSIONS_EVALUATED",
      "PAPER_FORWARD_EVIDENCE_DIGEST_PINNED",
      ...audit.reasonCodes,
      ...acceptanceGates
        .filter((gate) => !gate.passed)
        .map((gate) => gate.reasonCode),
      ...statusReasonCodes(evaluationStatus),
      "PAPER_FORWARD_MANUAL_REVIEW_REQUIRED",
      "LIVE_EXECUTION_DISABLED"
    ])
  };
}

export function getPaperForwardEvaluationRuntimeContract() {
  return {
    schemaVersion: 1,
    evaluationVersion: paperForwardEvaluationVersion,
    implementationStatus: "implemented" as const,
    activationMode: "offline_or_explicit_local_operator" as const,
    evidencePolicy: "all_completed_same_deployment_forward_sessions" as const,
    interruptedSessionPolicy: "excluded_and_disclosed" as const,
    integrityPolicy: "immutable_evidence_sha256_manifest" as const,
    confidenceMethod: "normal_approximation_95pct" as const,
    candidateMeaning: "manual_review_only_no_activation" as const,
    defaultConfig: defaultPaperForwardEvaluationConfig,
    manualReviewRequired: true as const,
    automaticLivePromotion: false as const,
    automaticLiveExecution: false as const,
    privateKeyAccess: false as const,
    transactionSigning: false as const,
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const,
    liveExecutionDisabled: true as const
  };
}

function auditEvidence(
  deployment: PaperAutomationDeployment,
  reports: readonly PaperOperationsEvidenceReport[],
  excludedInterruptedSessionIds: readonly string[]
): PaperForwardEvidenceAudit {
  const sessionIds = reports.map((report) => report.session.sessionId);
  const reportIds = reports.map((report) => report.reportId);
  const events = reports.flatMap((report) => report.automationEvents);
  const validEvents = events.filter(isPaperAutomationEvent);
  const duplicateSessionCount = duplicateCount(sessionIds);
  const duplicateReportCount = duplicateCount(reportIds);
  const duplicateAutomationEventCount = duplicateCount(
    validEvents.map((event) => event.eventId)
  );
  const invalidAutomationEventCount = events.length - validEvents.length;
  let outOfBoundaryAutomationEventCount = 0;
  let deploymentMismatchCount = 0;
  let unsafeEvidenceCount = 0;
  let manifestMismatchCount = 0;
  let overlappingSessionCount = 0;

  for (const report of reports) {
    const start = Date.parse(report.session.startedAt);
    const end = Date.parse(report.session.endedAt ?? "");
    deploymentMismatchCount +=
      report.session.deploymentId === deployment.deploymentId ? 0 : 1;
    unsafeEvidenceCount +=
      report.session.status === "completed" &&
      report.manifest.finalized === true &&
      report.paperOnly === true &&
      report.dataOnly === true &&
      report.tradingDisabled === true &&
      report.liveExecutionDisabled === true &&
      report.automaticLiveExecution === false &&
      report.session.paperOnly === true &&
      report.session.tradingDisabled === true &&
      report.session.liveExecutionDisabled === true &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end >= start &&
      start >= Date.parse(deployment.approvedAt)
        ? 0
        : 1;
    manifestMismatchCount +=
      report.manifest.sampleCount === report.snapshots.length &&
      report.manifest.alertCount === report.alerts.length &&
      report.manifest.automationEventCount === report.automationEvents.length &&
      report.manifest.automationOperationCount ===
        report.automationOperations.length
        ? 0
        : 1;
    outOfBoundaryAutomationEventCount += report.automationEvents.filter(
      (event) =>
        isPaperAutomationEvent(event) &&
        (event.deploymentId !== deployment.deploymentId ||
          Date.parse(event.observedAt) < start ||
          Date.parse(event.observedAt) > end)
    ).length;
  }

  for (let index = 1; index < reports.length; index += 1) {
    const prior = reports[index - 1];
    const current = reports[index];
    if (
      prior &&
      current &&
      Date.parse(current.session.startedAt) <
        Date.parse(prior.session.endedAt ?? "")
    ) {
      overlappingSessionCount += 1;
    }
  }

  const distinctUtcDayCount = new Set(
    reports.map((report) => report.session.startedAt.slice(0, 10))
  ).size;
  const integrityValid =
    duplicateSessionCount === 0 &&
    duplicateReportCount === 0 &&
    duplicateAutomationEventCount === 0 &&
    invalidAutomationEventCount === 0 &&
    outOfBoundaryAutomationEventCount === 0 &&
    overlappingSessionCount === 0 &&
    deploymentMismatchCount === 0 &&
    unsafeEvidenceCount === 0 &&
    manifestMismatchCount === 0;
  const reasonCodes = unique([
    ...(reports.length === 0
      ? ["PAPER_FORWARD_COMPLETED_SESSION_REQUIRED"]
      : []),
    ...(duplicateSessionCount > 0 ? ["PAPER_FORWARD_DUPLICATE_SESSION"] : []),
    ...(duplicateReportCount > 0 ? ["PAPER_FORWARD_DUPLICATE_REPORT"] : []),
    ...(duplicateAutomationEventCount > 0
      ? ["PAPER_FORWARD_DUPLICATE_AUTOMATION_EVENT"]
      : []),
    ...(invalidAutomationEventCount > 0
      ? ["PAPER_FORWARD_INVALID_AUTOMATION_EVENT"]
      : []),
    ...(outOfBoundaryAutomationEventCount > 0
      ? ["PAPER_FORWARD_EVENT_OUTSIDE_SESSION_BOUNDARY"]
      : []),
    ...(overlappingSessionCount > 0
      ? ["PAPER_FORWARD_OVERLAPPING_SESSIONS"]
      : []),
    ...(deploymentMismatchCount > 0
      ? ["PAPER_FORWARD_DEPLOYMENT_MISMATCH"]
      : []),
    ...(unsafeEvidenceCount > 0 ? ["PAPER_FORWARD_UNSAFE_EVIDENCE"] : []),
    ...(manifestMismatchCount > 0 ? ["PAPER_FORWARD_MANIFEST_MISMATCH"] : []),
    ...(excludedInterruptedSessionIds.length > 0
      ? ["PAPER_FORWARD_INTERRUPTED_SESSIONS_EXCLUDED"]
      : []),
    ...(integrityValid ? ["PAPER_FORWARD_EVIDENCE_INTEGRITY_VALID"] : [])
  ]);

  return {
    requestedReportCount: reports.length,
    completedSessionCount: reports.length,
    excludedInterruptedSessionCount: excludedInterruptedSessionIds.length,
    excludedInterruptedSessionIds: [...excludedInterruptedSessionIds],
    distinctUtcDayCount,
    duplicateSessionCount,
    duplicateReportCount,
    duplicateAutomationEventCount,
    invalidAutomationEventCount,
    outOfBoundaryAutomationEventCount,
    overlappingSessionCount,
    deploymentMismatchCount,
    unsafeEvidenceCount,
    manifestMismatchCount,
    integrityValid,
    firstSessionAt: reports.at(0)?.session.startedAt ?? null,
    lastSessionAt: reports.at(-1)?.session.endedAt ?? null,
    reasonCodes
  };
}

function buildCohortMetrics(
  deployment: PaperAutomationDeployment,
  reports: readonly PaperOperationsEvidenceReport[],
  events: readonly PaperAutomationEvent[]
): PaperForwardCohortMetrics {
  const automation = calculatePaperAutomationForwardMetrics(
    events,
    deployment.forwardStartingEquitySol
  );
  const trades = extractClosedTrades(events);
  const returns = trades.map((trade) => trade.netReturnPct);
  const standardDeviation = sampleStandardDeviation(returns);
  const standardError =
    standardDeviation === null || returns.length === 0
      ? null
      : standardDeviation / Math.sqrt(returns.length);
  const averageNetReturnPct = average(returns);
  const margin = standardError === null ? null : 1.96 * standardError;
  const snapshots = reports.flatMap((report) => report.snapshots);
  const latencies = snapshots
    .flatMap((snapshot) =>
      snapshot.signalLatencyMs === null ? [] : [snapshot.signalLatencyMs]
    )
    .sort((left, right) => left - right);
  const totalDataCostSol = rounded(
    sum(reports.map((report) => report.summary.finalEstimatedCostSol)),
    12
  );
  const totalNetPnlSol = rounded(
    sum(trades.map((trade) => trade.netPnlSol)),
    9
  );
  const telemetryGapCount = sum(
    reports.map((report) => report.manifest.telemetryGapCount)
  );
  const dataGapCount = sum(
    reports.map((report) =>
      counterDelta(report.snapshots, "timeseriesGapCount")
    )
  );
  const duplicateTimeseriesEventCount = sum(
    reports.map((report) =>
      counterDelta(report.snapshots, "timeseriesDuplicateEventCount")
    )
  );
  const invalidTimeseriesEventCount = sum(
    reports.map((report) =>
      counterDelta(report.snapshots, "timeseriesInvalidEventCount")
    )
  );
  const lateTimeseriesEventCount = sum(
    reports.map((report) =>
      counterDelta(report.snapshots, "timeseriesLateEventCount")
    )
  );
  const expectancyRetentionRatio =
    averageNetReturnPct === null || deployment.validationExpectancyPct <= 0
      ? null
      : rounded(averageNetReturnPct / deployment.validationExpectancyPct);
  const dataCostToTradingPnlRatio =
    totalNetPnlSol <= 0 ? null : rounded(totalDataCostSol / totalNetPnlSol);

  return {
    ...automation,
    closedTradeCount: trades.length,
    winCount: trades.filter((trade) => trade.netPnlSol > 0).length,
    lossCount: trades.filter((trade) => trade.netPnlSol < 0).length,
    averageNetReturnPct,
    totalNetPnlSol,
    totalSessionDurationMs: sum(
      reports.map((report) =>
        Math.max(
          0,
          Date.parse(report.session.endedAt ?? report.session.startedAt) -
            Date.parse(report.session.startedAt)
        )
      )
    ),
    signalObservationCount: latencies.length,
    warningAlertCount: sum(
      reports.map((report) => report.summary.warningAlertCount)
    ),
    criticalAlertCount: sum(
      reports.map((report) => report.summary.criticalAlertCount)
    ),
    telemetryGapCount,
    dataGapCount,
    duplicateTimeseriesEventCount,
    invalidTimeseriesEventCount,
    lateTimeseriesEventCount,
    maximumFeedSilenceMs: maximumOrNull(
      reports.flatMap((report) =>
        report.summary.maximumFeedSilenceMs === null
          ? []
          : [report.summary.maximumFeedSilenceMs]
      )
    ),
    maximumTelemetryGapMs: maximumOrNull(
      reports.flatMap((report) =>
        report.summary.maximumTelemetryGapMs === null
          ? []
          : [report.summary.maximumTelemetryGapMs]
      )
    ),
    p95SignalLatencyMs: percentile(latencies, 0.95),
    maximumSignalLatencyMs: maximumOrNull(latencies),
    averageNetReturnStandardDeviationPct: standardDeviation,
    averageNetReturnStandardErrorPct: standardError,
    netReturnConfidenceLowerBoundPct:
      averageNetReturnPct === null || margin === null
        ? null
        : rounded(averageNetReturnPct - margin),
    netReturnConfidenceUpperBoundPct:
      averageNetReturnPct === null || margin === null
        ? null
        : rounded(averageNetReturnPct + margin),
    validationExpectancyPct: deployment.validationExpectancyPct,
    expectancyRetentionRatio,
    totalDataCostSol,
    netPnlAfterDataCostSol: rounded(totalNetPnlSol - totalDataCostSol, 9),
    dataCostToTradingPnlRatio,
    costPerSignalSol: costPer(totalDataCostSol, latencies.length),
    costPerClosedTradeSol: costPer(totalDataCostSol, trades.length),
    budgetBreachSessionCount: reports.filter(
      (report) =>
        report.summary.peakEstimatedCostSol >
          report.session.config.maximumSessionCostSol + 1e-12 ||
        report.alerts.some((alert) =>
          [
            "PAPER_OPERATIONS_BUDGET_EXCEEDED",
            "PAPER_OPERATIONS_PROVIDER_BUDGET_REACHED"
          ].includes(alert.code)
        )
    ).length,
    openPositionBoundaryViolationCount: reports.filter((report) => {
      const sessionEvents = report.automationEvents.filter(
        isPaperAutomationEvent
      );
      const sessionMetrics = calculatePaperAutomationForwardMetrics(
        sessionEvents,
        deployment.forwardStartingEquitySol
      );
      return (
        sessionMetrics.filledEntryCount !== sessionMetrics.closedTradeCount
      );
    }).length
  };
}

function buildSessionEvaluation(
  report: PaperOperationsEvidenceReport,
  startingCapitalSol: number
): PaperForwardSessionEvaluation {
  const events = report.automationEvents.filter(isPaperAutomationEvent);
  const metrics = calculatePaperAutomationForwardMetrics(
    events,
    startingCapitalSol
  );
  const endedAt = report.session.endedAt ?? report.session.startedAt;
  return {
    sessionId: report.session.sessionId,
    reportId: report.reportId,
    runtimeSessionId: report.session.runtimeSessionId,
    startedAt: report.session.startedAt,
    endedAt,
    durationMs: Math.max(
      0,
      Date.parse(endedAt) - Date.parse(report.session.startedAt)
    ),
    signalObservationCount: report.summary.signalObservationCount,
    closedTradeCount: metrics.closedTradeCount,
    totalNetPnlSol: metrics.totalNetPnlSol,
    dataCostSol: report.summary.finalEstimatedCostSol,
    criticalAlertCount: report.summary.criticalAlertCount,
    telemetryGapCount: report.manifest.telemetryGapCount,
    dataGapCount: counterDelta(report.snapshots, "timeseriesGapCount"),
    p95SignalLatencyMs: report.summary.p95SignalLatencyMs,
    boundaryFlat: metrics.filledEntryCount === metrics.closedTradeCount
  };
}

function buildAcceptanceGates(input: {
  audit: PaperForwardEvidenceAudit;
  config: PaperForwardEvaluationConfig;
  deployment: PaperAutomationDeployment;
  metrics: PaperForwardCohortMetrics;
}): PaperForwardAcceptanceGate[] {
  const { audit, config, deployment, metrics } = input;
  const gate = (
    name: string,
    category: PaperForwardAcceptanceGate["category"],
    passed: boolean,
    actual: PaperForwardAcceptanceGate["actual"],
    required: string,
    reasonCode: string
  ): PaperForwardAcceptanceGate => ({
    gate: name,
    category,
    passed,
    actual,
    required,
    reasonCode
  });
  const latencyLimit = Math.min(
    config.maximumP95SignalLatencyMs,
    deployment.forwardConfig.maximumSignalAgeMs
  );

  return [
    gate(
      "evidence_integrity",
      "operational",
      audit.integrityValid,
      audit.integrityValid,
      "true",
      "PAPER_FORWARD_EVIDENCE_INTEGRITY_FAILED"
    ),
    gate(
      "deployment_inactive",
      "operational",
      deployment.status === "approved" || deployment.status === "paused",
      deployment.status,
      "approved or paused",
      "PAPER_FORWARD_DEPLOYMENT_NOT_INACTIVE"
    ),
    gate(
      "completed_sessions",
      "evidence",
      audit.completedSessionCount >= config.minimumCompletedSessions,
      audit.completedSessionCount,
      `>= ${config.minimumCompletedSessions}`,
      "PAPER_FORWARD_MINIMUM_SESSIONS_NOT_MET"
    ),
    gate(
      "distinct_utc_days",
      "evidence",
      audit.distinctUtcDayCount >= config.minimumDistinctUtcDays,
      audit.distinctUtcDayCount,
      `>= ${config.minimumDistinctUtcDays}`,
      "PAPER_FORWARD_MINIMUM_DAYS_NOT_MET"
    ),
    gate(
      "total_session_duration",
      "evidence",
      metrics.totalSessionDurationMs >= config.minimumTotalDurationMs,
      metrics.totalSessionDurationMs,
      `>= ${config.minimumTotalDurationMs}ms`,
      "PAPER_FORWARD_MINIMUM_DURATION_NOT_MET"
    ),
    gate(
      "closed_trades",
      "evidence",
      metrics.closedTradeCount >= config.minimumClosedTrades,
      metrics.closedTradeCount,
      `>= ${config.minimumClosedTrades}`,
      "PAPER_FORWARD_MINIMUM_TRADES_NOT_MET"
    ),
    gate(
      "signal_observations",
      "evidence",
      metrics.signalObservationCount >= config.minimumSignalObservations,
      metrics.signalObservationCount,
      `>= ${config.minimumSignalObservations}`,
      "PAPER_FORWARD_MINIMUM_SIGNALS_NOT_MET"
    ),
    gate(
      "critical_alerts",
      "operational",
      metrics.criticalAlertCount === 0,
      metrics.criticalAlertCount,
      "= 0",
      "PAPER_FORWARD_CRITICAL_ALERTS_PRESENT"
    ),
    gate(
      "interrupted_sessions",
      "operational",
      audit.excludedInterruptedSessionCount === 0,
      audit.excludedInterruptedSessionCount,
      "= 0",
      "PAPER_FORWARD_INTERRUPTED_SESSIONS_PRESENT"
    ),
    gate(
      "telemetry_gaps",
      "operational",
      metrics.telemetryGapCount === 0,
      metrics.telemetryGapCount,
      "= 0",
      "PAPER_FORWARD_TELEMETRY_GAPS_PRESENT"
    ),
    gate(
      "timeseries_gaps",
      "operational",
      metrics.dataGapCount === 0,
      metrics.dataGapCount,
      "= 0",
      "PAPER_FORWARD_TIMESERIES_GAPS_PRESENT"
    ),
    gate(
      "session_budget_compliance",
      "operational",
      metrics.budgetBreachSessionCount === 0,
      metrics.budgetBreachSessionCount,
      "= 0",
      "PAPER_FORWARD_SESSION_BUDGET_BREACH"
    ),
    gate(
      "flat_session_boundaries",
      "operational",
      metrics.openPositionBoundaryViolationCount === 0,
      metrics.openPositionBoundaryViolationCount,
      "= 0",
      "PAPER_FORWARD_OPEN_POSITION_AT_BOUNDARY"
    ),
    gate(
      "signal_latency_p95",
      "operational",
      metrics.p95SignalLatencyMs !== null &&
        metrics.p95SignalLatencyMs <= latencyLimit,
      metrics.p95SignalLatencyMs,
      `<= ${latencyLimit}ms`,
      "PAPER_FORWARD_SIGNAL_LATENCY_REJECTED"
    ),
    gate(
      "rejected_entry_rate",
      "operational",
      metrics.rejectedEntryRate !== null &&
        metrics.rejectedEntryRate <=
          deployment.forwardConfig.maximumRejectedEntryRate,
      metrics.rejectedEntryRate,
      `<= ${deployment.forwardConfig.maximumRejectedEntryRate}`,
      "PAPER_FORWARD_REJECTED_ENTRY_RATE_REJECTED"
    ),
    gate(
      "missed_fill_rate",
      "operational",
      metrics.missedFillRate !== null &&
        metrics.missedFillRate <= config.maximumMissedFillRate,
      metrics.missedFillRate,
      `<= ${config.maximumMissedFillRate}`,
      "PAPER_FORWARD_MISSED_FILL_RATE_REJECTED"
    ),
    gate(
      "maximum_drawdown",
      "edge",
      metrics.maximumDrawdownPct <=
        deployment.forwardConfig.maximumForwardDrawdownPct,
      metrics.maximumDrawdownPct,
      `<= ${deployment.forwardConfig.maximumForwardDrawdownPct}%`,
      "PAPER_FORWARD_DRAWDOWN_REJECTED"
    ),
    gate(
      "maximum_consecutive_losses",
      "edge",
      metrics.maximumConsecutiveLosses <=
        deployment.forwardConfig.maximumConsecutiveLosses,
      metrics.maximumConsecutiveLosses,
      `<= ${deployment.forwardConfig.maximumConsecutiveLosses}`,
      "PAPER_FORWARD_CONSECUTIVE_LOSSES_REJECTED"
    ),
    gate(
      "forward_expectancy",
      "edge",
      metrics.averageNetReturnPct !== null &&
        metrics.averageNetReturnPct > config.minimumForwardExpectancyPct,
      metrics.averageNetReturnPct,
      `> ${config.minimumForwardExpectancyPct}%`,
      "PAPER_FORWARD_EXPECTANCY_REJECTED"
    ),
    gate(
      "expectancy_confidence_lower_bound",
      "edge",
      metrics.netReturnConfidenceLowerBoundPct !== null &&
        metrics.netReturnConfidenceLowerBoundPct >
          config.minimumConfidenceLowerBoundPct,
      metrics.netReturnConfidenceLowerBoundPct,
      `> ${config.minimumConfidenceLowerBoundPct}% at 95% confidence`,
      "PAPER_FORWARD_CONFIDENCE_REJECTED"
    ),
    gate(
      "validation_expectancy_retention",
      "edge",
      metrics.expectancyRetentionRatio !== null &&
        metrics.expectancyRetentionRatio >=
          deployment.forwardConfig.minimumExpectancyRetentionRatio,
      metrics.expectancyRetentionRatio,
      `>= ${deployment.forwardConfig.minimumExpectancyRetentionRatio}`,
      "PAPER_FORWARD_EXPECTANCY_RETENTION_REJECTED"
    ),
    gate(
      "net_pnl_after_data_cost",
      "edge",
      metrics.netPnlAfterDataCostSol > 0,
      metrics.netPnlAfterDataCostSol,
      "> 0 SOL",
      "PAPER_FORWARD_DATA_COST_ADJUSTED_PNL_REJECTED"
    ),
    gate(
      "data_cost_to_trading_pnl",
      "edge",
      metrics.dataCostToTradingPnlRatio !== null &&
        metrics.dataCostToTradingPnlRatio <=
          config.maximumDataCostToTradingPnlRatio,
      metrics.dataCostToTradingPnlRatio,
      `<= ${config.maximumDataCostToTradingPnlRatio}`,
      "PAPER_FORWARD_DATA_COST_RATIO_REJECTED"
    )
  ];
}

function determineStatus(
  gates: readonly PaperForwardAcceptanceGate[]
): PaperForwardEvaluationStatus {
  const integrity = gates.find((gate) => gate.gate === "evidence_integrity");
  if (integrity && !integrity.passed) {
    return "operational_rejected";
  }
  if (
    gates.some(
      (gate) =>
        gate.category === "operational" &&
        gate.gate !== "evidence_integrity" &&
        !gate.passed &&
        gate.actual !== null
    )
  ) {
    return "operational_rejected";
  }
  if (gates.some((gate) => gate.category === "evidence" && !gate.passed)) {
    return "insufficient_evidence";
  }
  if (gates.some((gate) => gate.category === "operational" && !gate.passed)) {
    return "operational_rejected";
  }
  if (gates.some((gate) => gate.category === "edge" && !gate.passed)) {
    return "edge_rejected";
  }
  return "manual_live_candidate";
}

function extractClosedTrades(
  events: readonly PaperAutomationEvent[]
): ClosedTrade[] {
  const sorted = [...events].sort(
    (left, right) =>
      Date.parse(left.observedAt) - Date.parse(right.observedAt) ||
      left.eventId.localeCompare(right.eventId)
  );
  const feesByMint = new Map<string, number[]>();
  for (const event of sorted) {
    if (event.kind === "entry_executed" && event.mint) {
      const fees = feesByMint.get(event.mint) ?? [];
      fees.push(event.entryFeeSol ?? 0);
      feesByMint.set(event.mint, fees);
    }
  }
  return sorted.flatMap((event) => {
    if (
      event.kind !== "exit_executed" ||
      event.positionClosed !== true ||
      event.realizedPnlSol === null ||
      event.positionSizeSol === null ||
      event.positionSizeSol <= 0
    ) {
      return [];
    }
    const fees = event.mint ? feesByMint.get(event.mint) : undefined;
    const netPnlSol = event.realizedPnlSol - (fees?.shift() ?? 0);
    return [
      {
        netPnlSol,
        netReturnPct: (netPnlSol / event.positionSizeSol) * 100
      }
    ];
  });
}

function isPaperAutomationEvent(value: unknown): value is PaperAutomationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<PaperAutomationEvent>;
  return (
    event.schemaVersion === 1 &&
    typeof event.eventId === "string" &&
    event.eventId.length > 0 &&
    typeof event.deploymentId === "string" &&
    typeof event.kind === "string" &&
    typeof event.observedAt === "string" &&
    Number.isFinite(Date.parse(event.observedAt)) &&
    event.paperOnly === true &&
    event.liveExecutionDisabled === true &&
    Array.isArray(event.reasonCodes)
  );
}

function counterDelta(
  snapshots: readonly PaperOperationsSnapshot[],
  key:
    | "timeseriesGapCount"
    | "timeseriesDuplicateEventCount"
    | "timeseriesInvalidEventCount"
    | "timeseriesLateEventCount"
): number {
  const ordered = [...snapshots].sort(
    (left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt)
  );
  const first = ordered.at(0)?.[key] ?? 0;
  const last = ordered.at(-1)?.[key] ?? first;
  return Math.max(0, last - first);
}

function digestEvidence(
  deployment: PaperAutomationDeployment,
  reports: readonly PaperOperationsEvidenceReport[],
  excludedInterruptedSessionIds: readonly string[]
): string {
  return createHash("sha256")
    .update(
      canonicalStringify(
        stripStorageIds({
          deployment: pinnedDeploymentEvidence(deployment),
          reports,
          excludedInterruptedSessionIds
        })
      )
    )
    .digest("hex");
}

function pinnedDeploymentEvidence(
  deployment: PaperAutomationDeployment
): Record<string, unknown> {
  return {
    schemaVersion: deployment.schemaVersion,
    automationVersion: deployment.automationVersion,
    deploymentId: deployment.deploymentId,
    validationId: deployment.validationId,
    validationVersion: deployment.validationVersion,
    strategyEvaluationId: deployment.strategyEvaluationId,
    strategyEvaluationVersion: deployment.strategyEvaluationVersion,
    selectedThreshold: deployment.selectedThreshold,
    exitPolicyVersion: deployment.exitPolicyVersion,
    executionConfig: deployment.executionConfig,
    exitPolicyConfig: deployment.exitPolicyConfig,
    validationExpectancyPct: deployment.validationExpectancyPct,
    validationConfidenceLowerBoundPct:
      deployment.validationConfidenceLowerBoundPct,
    forwardStartingEquitySol: deployment.forwardStartingEquitySol,
    forwardConfig: deployment.forwardConfig,
    approvedBy: deployment.approvedBy,
    approvedAt: deployment.approvedAt,
    automaticLiveExecution: deployment.automaticLiveExecution,
    paperOnly: deployment.paperOnly,
    tradingDisabled: deployment.tradingDisabled,
    liveExecutionDisabled: deployment.liveExecutionDisabled
  };
}

function stripStorageIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripStorageIds);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "id")
      .map(([key, item]) => [key, stripStorageIds(item)])
  );
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function assertDeploymentSafety(deployment: PaperAutomationDeployment): void {
  if (
    deployment.paperOnly !== true ||
    deployment.tradingDisabled !== true ||
    deployment.liveExecutionDisabled !== true ||
    deployment.automaticLiveExecution !== false
  ) {
    throw new RangeError("paper forward deployment safety flags are invalid");
  }
  requireText(deployment.deploymentId, "deployment ID");
  requireIso(deployment.approvedAt, "deployment approval timestamp");
}

function statusReasonCodes(status: PaperForwardEvaluationStatus): string[] {
  if (status === "manual_live_candidate") {
    return ["PAPER_FORWARD_MANUAL_LIVE_REVIEW_CANDIDATE"];
  }
  if (status === "operational_rejected") {
    return ["PAPER_FORWARD_OPERATIONAL_EVIDENCE_REJECTED"];
  }
  if (status === "edge_rejected") {
    return ["PAPER_FORWARD_EDGE_EVIDENCE_REJECTED"];
  }
  return ["PAPER_FORWARD_EVIDENCE_INSUFFICIENT"];
}

function stricterMinimumInteger(
  value: number | undefined,
  baseline: number,
  maximum: number
): number {
  if (value === undefined || !Number.isFinite(value)) return baseline;
  return Math.min(maximum, Math.max(baseline, Math.floor(value)));
}

function stricterMaximumInteger(
  value: number | undefined,
  baseline: number,
  minimum: number
): number {
  if (value === undefined || !Number.isFinite(value)) return baseline;
  return Math.max(minimum, Math.min(baseline, Math.floor(value)));
}

function stricterMaximumRatio(
  value: number | undefined,
  baseline: number
): number {
  if (value === undefined || !Number.isFinite(value)) return baseline;
  return Math.max(0, Math.min(baseline, value));
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${label} is required`);
  return normalized;
}

function requireIso(value: string, label: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new RangeError(`${label} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

function duplicateCount(values: readonly string[]): number {
  return values.length - new Set(values).size;
}

function costPer(cost: number, count: number): number | null {
  return count > 0 ? rounded(cost / count, 12) : null;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? rounded(sum(values) / values.length) : null;
}

function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = sum(values) / values.length;
  const variance =
    sum(values.map((value) => (value - mean) ** 2)) / (values.length - 1);
  return rounded(Math.sqrt(variance));
}

function percentile(values: readonly number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const index = Math.max(0, Math.ceil(values.length * ratio) - 1);
  return values[index] ?? null;
}

function maximumOrNull(values: readonly number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null;
}

function rounded(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
