export const paperOperationsVersion = "paper-operations-v1" as const;

export type PaperOperationsSessionStatus =
  "active" | "completed" | "interrupted";

export type PaperOperationsConfig = {
  schemaVersion: 1;
  maximumSessionCostSol: number;
  budgetWarningRatio: number;
  maximumFeedSilenceMs: number;
  maximumTelemetryGapMs: number;
  maximumSignalLatencyMs: number;
  maximumSessionDurationMs: number;
};

export type PaperOperationsConfigInput = Partial<
  Omit<PaperOperationsConfig, "schemaVersion">
>;

export const defaultPaperOperationsConfig: PaperOperationsConfig = {
  schemaVersion: 1,
  maximumSessionCostSol: 0.001,
  budgetWarningRatio: 0.8,
  maximumFeedSilenceMs: 15_000,
  maximumTelemetryGapMs: 30_000,
  maximumSignalLatencyMs: 5_000,
  maximumSessionDurationMs: 86_400_000
};

export type PaperOperationsSession = {
  schemaVersion: 1;
  operationsVersion: typeof paperOperationsVersion;
  sessionId: string;
  deploymentId: string;
  runtimeSessionId: string;
  status: PaperOperationsSessionStatus;
  config: PaperOperationsConfig;
  startedBy: string;
  startingMeteredCostSol: number;
  startingMeteredEventCount: number;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  reasonCodes: string[];
  updatedAt: string;
  automaticMeteredStart: false;
  automaticPaperArm: false;
  automaticLiveExecution: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
};

export type PaperOperationsSnapshotKind =
  | "session_started"
  | "runtime_sample"
  | "signal_latency"
  | "budget_enforced"
  | "session_ended"
  | "restart_reconciled";

export type PaperOperationsSnapshot = {
  schemaVersion: 1;
  operationsVersion: typeof paperOperationsVersion;
  sampleId: string;
  sessionId: string;
  deploymentId: string;
  runtimeSessionId: string;
  kind: PaperOperationsSnapshotKind;
  observedAt: string;
  telemetryGapMs: number | null;
  meteredActive: boolean;
  feedConnected: boolean;
  lastEventAt: string | null;
  feedSilenceMs: number | null;
  trackedMintCount: number;
  meteredEventCount: number;
  estimatedCostSol: number;
  budgetRemainingSol: number;
  budgetReached: boolean;
  dataWalletBalanceSol: number | null;
  dataWalletBalanceStatus:
    "unknown" | "missing_config" | "critical" | "low" | "ok";
  signalMint: string | null;
  signalAt: string | null;
  signalLatencyMs: number | null;
  automationStatus: "approved" | "armed" | "paused" | "revoked" | null;
  automationHealthy: boolean | null;
  pendingOperationCount: number;
  closedTradeCount: number;
  winCount: number;
  totalNetPnlSol: number;
  maximumDrawdownPct: number;
  timeseriesAcceptedEventCount: number;
  timeseriesDuplicateEventCount: number;
  timeseriesInvalidEventCount: number;
  timeseriesLateEventCount: number;
  timeseriesGapCount: number;
  storageWriteHealthy: boolean;
  reasonCodes: string[];
  payload: unknown;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
};

export type PaperOperationsSnapshotInput = Omit<
  PaperOperationsSnapshot,
  | "schemaVersion"
  | "operationsVersion"
  | "telemetryGapMs"
  | "feedSilenceMs"
  | "budgetRemainingSol"
  | "paperOnly"
  | "dataOnly"
  | "tradingDisabled"
  | "liveExecutionDisabled"
> & {
  telemetryGapMs?: number | null;
  feedSilenceMs?: number | null;
};

export type PaperOperationsAlertSeverity = "warning" | "critical";

export type PaperOperationsAlert = {
  schemaVersion: 1;
  operationsVersion: typeof paperOperationsVersion;
  alertId: string;
  sessionId: string;
  sampleId: string;
  severity: PaperOperationsAlertSeverity;
  code: string;
  observedAt: string;
  metricValue: number | string | boolean | null;
  threshold: number | string | boolean | null;
  reasonCodes: string[];
  payload: unknown;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
};

export type PaperOperationsAlertCandidate = Omit<
  PaperOperationsAlert,
  "alertId"
>;

export type PaperOperationsSummary = {
  sampleCount: number;
  alertCount: number;
  warningAlertCount: number;
  criticalAlertCount: number;
  signalObservationCount: number;
  maximumSignalLatencyMs: number | null;
  p95SignalLatencyMs: number | null;
  maximumFeedSilenceMs: number | null;
  maximumTelemetryGapMs: number | null;
  peakEstimatedCostSol: number;
  finalEstimatedCostSol: number;
  budgetRemainingSol: number;
  meteredEventsPerSecond: number | null;
  costPerSignalSol: number | null;
  costPerClosedTradeSol: number | null;
  costPerWinningTradeSol: number | null;
  dataGapCount: number;
  duplicateEventCount: number;
  invalidEventCount: number;
  lateEventCount: number;
  latestSampleAt: string | null;
  paperOnly: true;
  liveExecutionDisabled: true;
};

export type PaperOperationsEvidenceReport = {
  schemaVersion: 1;
  operationsVersion: typeof paperOperationsVersion;
  reportId: string;
  generatedAt: string;
  session: PaperOperationsSession;
  summary: PaperOperationsSummary;
  manifest: {
    finalized: boolean;
    sampleCount: number;
    alertCount: number;
    automationEventCount: number;
    automationOperationCount: number;
    firstObservedAt: string | null;
    lastObservedAt: string | null;
    telemetryGapCount: number;
    reasonCodes: string[];
  };
  snapshots: PaperOperationsSnapshot[];
  alerts: PaperOperationsAlert[];
  automationEvents: unknown[];
  automationOperations: unknown[];
  automaticLiveExecution: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
};

export function createPaperOperationsConfig(
  input: PaperOperationsConfigInput = {}
): PaperOperationsConfig {
  return {
    schemaVersion: 1,
    maximumSessionCostSol: stricterMaximum(
      input.maximumSessionCostSol,
      defaultPaperOperationsConfig.maximumSessionCostSol,
      0.000000001
    ),
    budgetWarningRatio: stricterMaximum(
      input.budgetWarningRatio,
      defaultPaperOperationsConfig.budgetWarningRatio,
      0.01
    ),
    maximumFeedSilenceMs: stricterMaximumInteger(
      input.maximumFeedSilenceMs,
      defaultPaperOperationsConfig.maximumFeedSilenceMs,
      1_000
    ),
    maximumTelemetryGapMs: stricterMaximumInteger(
      input.maximumTelemetryGapMs,
      defaultPaperOperationsConfig.maximumTelemetryGapMs,
      1_000
    ),
    maximumSignalLatencyMs: stricterMaximumInteger(
      input.maximumSignalLatencyMs,
      defaultPaperOperationsConfig.maximumSignalLatencyMs,
      1
    ),
    maximumSessionDurationMs: stricterMaximumInteger(
      input.maximumSessionDurationMs,
      defaultPaperOperationsConfig.maximumSessionDurationMs,
      60_000
    )
  };
}

export function createPaperOperationsSession(input: {
  sessionId: string;
  deploymentId: string;
  deploymentStatus: "approved" | "armed" | "paused" | "revoked";
  runtimeSessionId: string;
  startedBy: string;
  startedAt: string;
  startingMeteredCostSol?: number;
  startingMeteredEventCount?: number;
  config?: PaperOperationsConfigInput;
}): PaperOperationsSession {
  const startedAt = requireIso(input.startedAt, "session start");
  if (input.deploymentStatus === "revoked") {
    throw new RangeError(
      "paper operations cannot start for a revoked deployment"
    );
  }
  if (input.deploymentStatus === "armed") {
    throw new RangeError(
      "paper operations must start before paper automation is armed"
    );
  }
  const sessionId = requireText(input.sessionId, "session id");
  const deploymentId = requireText(input.deploymentId, "deployment id");
  const runtimeSessionId = requireText(
    input.runtimeSessionId,
    "runtime session id"
  );
  const startedBy = requireText(input.startedBy, "operator identity");
  return {
    schemaVersion: 1,
    operationsVersion: paperOperationsVersion,
    sessionId,
    deploymentId,
    runtimeSessionId,
    status: "active",
    config: createPaperOperationsConfig(input.config),
    startedBy,
    startingMeteredCostSol: nonnegative(
      input.startingMeteredCostSol ?? 0,
      "starting metered cost"
    ),
    startingMeteredEventCount: nonnegativeInteger(
      input.startingMeteredEventCount ?? 0,
      "starting metered event count"
    ),
    startedAt,
    endedAt: null,
    endReason: null,
    reasonCodes: [
      "PAPER_OPERATIONS_SESSION_STARTED",
      "PAPER_OPERATIONS_METERED_START_REMAINS_MANUAL",
      "PAPER_OPERATIONS_AUTOMATION_ARM_REMAINS_MANUAL",
      "LIVE_EXECUTION_DISABLED"
    ],
    updatedAt: startedAt,
    automaticMeteredStart: false,
    automaticPaperArm: false,
    automaticLiveExecution: false,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true
  };
}

export function transitionPaperOperationsSession(input: {
  session: PaperOperationsSession;
  status: Exclude<PaperOperationsSessionStatus, "active">;
  at: string;
  reason: string;
  reasonCodes: string[];
}): PaperOperationsSession {
  if (input.session.status !== "active") {
    throw new RangeError(
      `paper operations session cannot transition from ${input.session.status}`
    );
  }
  const at = requireIso(input.at, "session end");
  if (Date.parse(at) < Date.parse(input.session.startedAt)) {
    throw new RangeError(
      "paper operations session cannot end before it starts"
    );
  }
  return {
    ...input.session,
    status: input.status,
    endedAt: at,
    endReason: requireText(input.reason, "session end reason"),
    reasonCodes: unique([
      ...input.session.reasonCodes,
      ...input.reasonCodes,
      input.status === "completed"
        ? "PAPER_OPERATIONS_SESSION_COMPLETED"
        : "PAPER_OPERATIONS_RESTART_INTERRUPTED",
      "LIVE_EXECUTION_DISABLED"
    ]),
    updatedAt: at
  };
}

export function createPaperOperationsSnapshot(
  session: PaperOperationsSession,
  input: PaperOperationsSnapshotInput
): PaperOperationsSnapshot {
  if (
    input.sessionId !== session.sessionId ||
    input.deploymentId !== session.deploymentId
  ) {
    throw new RangeError(
      "paper operations snapshot does not match its session"
    );
  }
  const observedAt = requireIso(input.observedAt, "snapshot timestamp");
  const lastEventAt = input.lastEventAt
    ? requireIso(input.lastEventAt, "last event timestamp")
    : null;
  const feedSilenceMs =
    input.feedSilenceMs === undefined
      ? lastEventAt
        ? Math.max(0, Date.parse(observedAt) - Date.parse(lastEventAt))
        : null
      : nullableNonnegative(input.feedSilenceMs);
  const maximumCost = session.config.maximumSessionCostSol;
  const cost = nonnegative(input.estimatedCostSol, "estimated cost");
  return {
    ...input,
    schemaVersion: 1,
    operationsVersion: paperOperationsVersion,
    sampleId: requireText(input.sampleId, "sample id"),
    runtimeSessionId: requireText(input.runtimeSessionId, "runtime session id"),
    observedAt,
    lastEventAt,
    telemetryGapMs: nullableNonnegative(input.telemetryGapMs ?? null),
    feedSilenceMs,
    trackedMintCount: nonnegativeInteger(
      input.trackedMintCount,
      "tracked mint count"
    ),
    meteredEventCount: nonnegativeInteger(
      input.meteredEventCount,
      "metered event count"
    ),
    estimatedCostSol: cost,
    budgetRemainingSol: rounded(Math.max(0, maximumCost - cost), 12),
    pendingOperationCount: nonnegativeInteger(
      input.pendingOperationCount,
      "pending operation count"
    ),
    closedTradeCount: nonnegativeInteger(
      input.closedTradeCount,
      "closed trade count"
    ),
    winCount: nonnegativeInteger(input.winCount, "win count"),
    totalNetPnlSol: finiteNumber(input.totalNetPnlSol, "total net PnL"),
    maximumDrawdownPct: nonnegative(
      input.maximumDrawdownPct,
      "maximum drawdown"
    ),
    dataWalletBalanceSol: nullableNonnegative(input.dataWalletBalanceSol),
    timeseriesAcceptedEventCount: nonnegativeInteger(
      input.timeseriesAcceptedEventCount,
      "accepted event count"
    ),
    timeseriesDuplicateEventCount: nonnegativeInteger(
      input.timeseriesDuplicateEventCount,
      "duplicate event count"
    ),
    timeseriesInvalidEventCount: nonnegativeInteger(
      input.timeseriesInvalidEventCount,
      "invalid event count"
    ),
    timeseriesLateEventCount: nonnegativeInteger(
      input.timeseriesLateEventCount,
      "late event count"
    ),
    timeseriesGapCount: nonnegativeInteger(
      input.timeseriesGapCount,
      "gap count"
    ),
    signalLatencyMs: nullableNonnegative(input.signalLatencyMs),
    reasonCodes: unique([
      ...input.reasonCodes,
      "PAPER_ONLY",
      "LIVE_EXECUTION_DISABLED"
    ]),
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true
  };
}

export function evaluatePaperOperationsAlerts(input: {
  session: PaperOperationsSession;
  snapshot: PaperOperationsSnapshot;
}): {
  alerts: PaperOperationsAlertCandidate[];
  pauseAutomation: boolean;
  stopMeteredData: boolean;
} {
  const { session, snapshot } = input;
  const candidates: Array<{
    severity: PaperOperationsAlertSeverity;
    code: string;
    metricValue: number | string | boolean | null;
    threshold: number | string | boolean | null;
  }> = [];
  const add = (
    condition: boolean,
    severity: PaperOperationsAlertSeverity,
    code: string,
    metricValue: number | string | boolean | null,
    threshold: number | string | boolean | null
  ) => {
    if (condition) candidates.push({ severity, code, metricValue, threshold });
  };
  const config = session.config;
  const elapsedMs =
    Date.parse(snapshot.observedAt) - Date.parse(session.startedAt);
  add(
    snapshot.meteredActive && !snapshot.feedConnected,
    "critical",
    "PAPER_OPERATIONS_FEED_DISCONNECTED",
    snapshot.feedConnected,
    true
  );
  add(
    snapshot.meteredActive &&
      snapshot.feedSilenceMs !== null &&
      snapshot.feedSilenceMs > config.maximumFeedSilenceMs,
    "critical",
    "PAPER_OPERATIONS_FEED_STALE",
    snapshot.feedSilenceMs,
    config.maximumFeedSilenceMs
  );
  add(
    snapshot.telemetryGapMs !== null &&
      snapshot.telemetryGapMs > config.maximumTelemetryGapMs,
    "critical",
    "PAPER_OPERATIONS_TELEMETRY_GAP",
    snapshot.telemetryGapMs,
    config.maximumTelemetryGapMs
  );
  add(
    snapshot.signalLatencyMs !== null &&
      snapshot.signalLatencyMs > config.maximumSignalLatencyMs,
    "warning",
    "PAPER_OPERATIONS_SIGNAL_LATENCY_HIGH",
    snapshot.signalLatencyMs,
    config.maximumSignalLatencyMs
  );
  add(
    snapshot.estimatedCostSol >= config.maximumSessionCostSol,
    "critical",
    "PAPER_OPERATIONS_BUDGET_EXCEEDED",
    snapshot.estimatedCostSol,
    config.maximumSessionCostSol
  );
  add(
    snapshot.estimatedCostSol < config.maximumSessionCostSol &&
      snapshot.estimatedCostSol >=
        config.maximumSessionCostSol * config.budgetWarningRatio,
    "warning",
    "PAPER_OPERATIONS_BUDGET_WARNING",
    snapshot.estimatedCostSol,
    config.maximumSessionCostSol * config.budgetWarningRatio
  );
  add(
    snapshot.budgetReached,
    "critical",
    "PAPER_OPERATIONS_PROVIDER_BUDGET_REACHED",
    true,
    false
  );
  add(
    snapshot.meteredActive && snapshot.dataWalletBalanceStatus === "critical",
    "critical",
    "PAPER_OPERATIONS_DATA_WALLET_CRITICAL",
    snapshot.dataWalletBalanceSol,
    "non-critical"
  );
  add(
    snapshot.meteredActive && snapshot.dataWalletBalanceStatus === "low",
    "warning",
    "PAPER_OPERATIONS_DATA_WALLET_LOW",
    snapshot.dataWalletBalanceSol,
    "ok"
  );
  add(
    snapshot.automationHealthy === false,
    "critical",
    "PAPER_OPERATIONS_AUTOMATION_UNHEALTHY",
    false,
    true
  );
  add(
    session.status === "active" && snapshot.automationStatus === "paused",
    "warning",
    "PAPER_OPERATIONS_AUTOMATION_PAUSED",
    "paused",
    "armed"
  );
  add(
    session.status === "active" && snapshot.automationStatus === "revoked",
    "critical",
    "PAPER_OPERATIONS_AUTOMATION_REVOKED",
    "revoked",
    "armed"
  );
  add(
    elapsedMs > config.maximumSessionDurationMs,
    "critical",
    "PAPER_OPERATIONS_SESSION_DURATION_EXCEEDED",
    elapsedMs,
    config.maximumSessionDurationMs
  );
  add(
    snapshot.timeseriesGapCount > 0,
    "warning",
    "PAPER_OPERATIONS_DATA_GAPS_OBSERVED",
    snapshot.timeseriesGapCount,
    0
  );
  add(
    snapshot.storageWriteHealthy === false,
    "critical",
    "PAPER_OPERATIONS_STORAGE_WRITE_FAILED",
    false,
    true
  );

  const alerts = candidates.map((candidate) => ({
    schemaVersion: 1 as const,
    operationsVersion: paperOperationsVersion,
    sessionId: session.sessionId,
    sampleId: snapshot.sampleId,
    severity: candidate.severity,
    code: candidate.code,
    observedAt: snapshot.observedAt,
    metricValue: candidate.metricValue,
    threshold: candidate.threshold,
    reasonCodes: [candidate.code, "PAPER_ONLY", "LIVE_EXECUTION_DISABLED"],
    payload: { kind: snapshot.kind },
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const,
    liveExecutionDisabled: true as const
  }));
  const criticalCodes = new Set(
    alerts
      .filter((alert) => alert.severity === "critical")
      .map((alert) => alert.code)
  );
  return {
    alerts,
    pauseAutomation: criticalCodes.size > 0,
    stopMeteredData:
      criticalCodes.has("PAPER_OPERATIONS_BUDGET_EXCEEDED") ||
      criticalCodes.has("PAPER_OPERATIONS_PROVIDER_BUDGET_REACHED") ||
      criticalCodes.has("PAPER_OPERATIONS_DATA_WALLET_CRITICAL")
  };
}

export function summarizePaperOperations(
  session: PaperOperationsSession,
  snapshots: readonly PaperOperationsSnapshot[],
  alerts: readonly PaperOperationsAlert[]
): PaperOperationsSummary {
  const ordered = [...snapshots].sort(compareObserved);
  const latencies = ordered
    .map((snapshot) => snapshot.signalLatencyMs)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const latest = ordered.at(-1);
  const finalCost = latest?.estimatedCostSol ?? 0;
  const durationSeconds = latest
    ? Math.max(
        0,
        Date.parse(latest.observedAt) - Date.parse(session.startedAt)
      ) / 1_000
    : 0;
  return {
    sampleCount: ordered.length,
    alertCount: alerts.length,
    warningAlertCount: alerts.filter((alert) => alert.severity === "warning")
      .length,
    criticalAlertCount: alerts.filter((alert) => alert.severity === "critical")
      .length,
    signalObservationCount: latencies.length,
    maximumSignalLatencyMs: maximumOrNull(latencies),
    p95SignalLatencyMs: percentile(latencies, 0.95),
    maximumFeedSilenceMs: maximumOrNull(
      ordered.flatMap((snapshot) =>
        snapshot.feedSilenceMs === null ? [] : [snapshot.feedSilenceMs]
      )
    ),
    maximumTelemetryGapMs: maximumOrNull(
      ordered.flatMap((snapshot) =>
        snapshot.telemetryGapMs === null ? [] : [snapshot.telemetryGapMs]
      )
    ),
    peakEstimatedCostSol: maximumOrZero(
      ordered.map((snapshot) => snapshot.estimatedCostSol)
    ),
    finalEstimatedCostSol: finalCost,
    budgetRemainingSol:
      latest?.budgetRemainingSol ?? session.config.maximumSessionCostSol,
    meteredEventsPerSecond:
      latest && durationSeconds > 0
        ? rounded(latest.meteredEventCount / durationSeconds)
        : null,
    costPerSignalSol: costPer(finalCost, latencies.length),
    costPerClosedTradeSol: costPer(finalCost, latest?.closedTradeCount ?? 0),
    costPerWinningTradeSol: costPer(finalCost, latest?.winCount ?? 0),
    dataGapCount: maximumOrZero(
      ordered.map((snapshot) => snapshot.timeseriesGapCount)
    ),
    duplicateEventCount: maximumOrZero(
      ordered.map((snapshot) => snapshot.timeseriesDuplicateEventCount)
    ),
    invalidEventCount: maximumOrZero(
      ordered.map((snapshot) => snapshot.timeseriesInvalidEventCount)
    ),
    lateEventCount: maximumOrZero(
      ordered.map((snapshot) => snapshot.timeseriesLateEventCount)
    ),
    latestSampleAt: latest?.observedAt ?? null,
    paperOnly: true,
    liveExecutionDisabled: true
  };
}

export function createPaperOperationsEvidenceReport(input: {
  reportId: string;
  generatedAt: string;
  session: PaperOperationsSession;
  snapshots: PaperOperationsSnapshot[];
  alerts: PaperOperationsAlert[];
  automationEvents: unknown[];
  automationOperations: unknown[];
}): PaperOperationsEvidenceReport {
  if (input.session.status === "active") {
    throw new RangeError(
      "paper operations evidence cannot finalize an active session"
    );
  }
  const generatedAt = requireIso(
    input.generatedAt,
    "report generation timestamp"
  );
  const snapshots = [...input.snapshots].sort(compareObserved);
  const alerts = [...input.alerts].sort(compareObserved);
  const telemetryGapCount = snapshots.filter(
    (snapshot) =>
      snapshot.telemetryGapMs !== null &&
      snapshot.telemetryGapMs > input.session.config.maximumTelemetryGapMs
  ).length;
  return {
    schemaVersion: 1,
    operationsVersion: paperOperationsVersion,
    reportId: requireText(input.reportId, "report id"),
    generatedAt,
    session: input.session,
    summary: summarizePaperOperations(input.session, snapshots, alerts),
    manifest: {
      finalized: true,
      sampleCount: snapshots.length,
      alertCount: alerts.length,
      automationEventCount: input.automationEvents.length,
      automationOperationCount: input.automationOperations.length,
      firstObservedAt: snapshots.at(0)?.observedAt ?? null,
      lastObservedAt: snapshots.at(-1)?.observedAt ?? null,
      telemetryGapCount,
      reasonCodes: unique([
        "PAPER_OPERATIONS_EVIDENCE_FINALIZED",
        ...(telemetryGapCount > 0
          ? ["PAPER_OPERATIONS_EVIDENCE_HAS_GAPS"]
          : []),
        "LIVE_EXECUTION_DISABLED"
      ])
    },
    snapshots,
    alerts,
    automationEvents: input.automationEvents,
    automationOperations: input.automationOperations,
    automaticLiveExecution: false,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true
  };
}

export function getPaperOperationsRuntimeContract() {
  return {
    schemaVersion: 1,
    operationsVersion: paperOperationsVersion,
    implementationStatus: "implemented" as const,
    activationMode: "explicit_local_operator_session" as const,
    restartPolicy: "active_session_interrupted_fail_closed" as const,
    meteredStartPolicy: "manual_only" as const,
    paperAutomationArmPolicy: "manual_only" as const,
    budgetEnforcement: "stop_metered_and_pause_paper_automation" as const,
    storageRetentionPolicy: "retain_forward_evidence_until_archived" as const,
    backupPolicy: "sqlite_consistent_backup_required" as const,
    evidenceExports: ["json", "jsonl", "csv"] as const,
    automaticMeteredStart: false as const,
    automaticPaperArm: false as const,
    automaticLiveExecution: false as const,
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const,
    liveExecutionDisabled: true as const,
    defaultConfig: defaultPaperOperationsConfig
  };
}

function compareObserved(
  left: { observedAt: string },
  right: { observedAt: string }
): number {
  return Date.parse(left.observedAt) - Date.parse(right.observedAt);
}

function stricterMaximum(
  value: number | undefined,
  fallback: number,
  minimum: number
): number {
  const candidate =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(minimum, Math.min(fallback, candidate));
}

function stricterMaximumInteger(
  value: number | undefined,
  fallback: number,
  minimum: number
): number {
  return Math.round(stricterMaximum(value, fallback, minimum));
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized)
    throw new RangeError(`paper operations ${label} is required`);
  return normalized;
}

function requireIso(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new RangeError(`paper operations ${label} is invalid`);
  return new Date(parsed).toISOString();
}

function nonnegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`paper operations ${label} is invalid`);
  }
  return value;
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`paper operations ${label} is invalid`);
  }
  return value;
}

function nonnegativeInteger(value: number, label: string): number {
  const checked = nonnegative(value, label);
  if (!Number.isInteger(checked)) {
    throw new RangeError(`paper operations ${label} must be an integer`);
  }
  return checked;
}

function nullableNonnegative(value: number | null | undefined): number | null {
  return value === null || value === undefined
    ? null
    : nonnegative(value, "metric");
}

function maximumOrNull(values: readonly number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null;
}

function maximumOrZero(values: readonly number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
}

function percentile(
  values: readonly number[],
  quantile: number
): number | null {
  if (values.length === 0) return null;
  const index = Math.min(
    values.length - 1,
    Math.ceil(values.length * quantile) - 1
  );
  return values[index] ?? null;
}

function rounded(value: number, precision = 6): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function costPer(cost: number, count: number): number | null {
  return count > 0 ? rounded(cost / count, 12) : null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
