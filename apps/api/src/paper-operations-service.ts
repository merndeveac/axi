import { randomUUID } from "node:crypto";
import {
  createPaperOperationsEvidenceReport,
  createPaperOperationsSession,
  createPaperOperationsSnapshot,
  evaluatePaperOperationsAlerts,
  getPaperOperationsRuntimeContract,
  summarizePaperOperations,
  transitionPaperOperationsSession,
  type PaperOperationsConfigInput,
  type PaperOperationsEvidenceReport,
  type PaperOperationsSnapshotKind
} from "@axi/paper-operations";
import type { OverlaySignal } from "@axi/shared";
import {
  getActivePaperOperationsSession,
  getLatestPaperOperationsSession,
  getLatestPaperOperationsSnapshotForSession,
  getPaperAutomationDeployment,
  getPaperOperationsSession,
  getStorageStats,
  listPaperAutomationEventsForEvaluation,
  listPaperAutomationOperationsForEvaluation,
  listPaperOperationsAlerts,
  listPaperOperationsAlertsForExport,
  listPaperOperationsSessions,
  listPaperOperationsSnapshots,
  listPaperOperationsSnapshotsForExport,
  savePaperOperationsAlert,
  savePaperOperationsSession,
  savePaperOperationsSnapshot,
  type StoredPaperOperationsAlert,
  type StoredPaperOperationsSession,
  type StoredPaperOperationsSnapshot
} from "@axi/storage";
import type { TradeTimeseriesStatus } from "@axi/timeseries";
import type { MeteredLaunchDataService } from "./metered-launch-data-service";
import type { PaperAutomationService } from "./paper-automation-service";

export const paperOperationsConfirmation = {
  start: (deploymentId: string) =>
    `START PAPER FORWARD SESSION ${deploymentId}`,
  end: (sessionId: string) => `END PAPER FORWARD SESSION ${sessionId}`
} as const;

export type PaperOperationsFeedStatus = {
  connected: boolean;
  lastEventAt: string | null;
  reconnectAttempts: number;
  parseErrorCount: number;
  lastError: string | null;
};

export type PaperOperationsServiceOptions = {
  runtimeSessionId: string;
  paperAutomation: PaperAutomationService;
  meteredLaunchData: MeteredLaunchDataService;
  getFeedStatus: () => PaperOperationsFeedStatus;
  getTimeseriesStatus: () => TradeTimeseriesStatus;
  getTimeseriesGapCount: () => number;
  now?: () => Date;
  createId?: () => string;
  sampleIntervalMs?: number;
  automaticSampling?: boolean;
};

export class PaperOperationsServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly reasonCodes: string[];

  constructor(
    code: string,
    message: string,
    options: { statusCode?: number; reasonCodes?: string[] } = {}
  ) {
    super(message);
    this.name = "PaperOperationsServiceError";
    this.code = code;
    this.statusCode = options.statusCode ?? 400;
    this.reasonCodes = options.reasonCodes ?? [code];
  }
}

export function createPaperOperationsService(
  options: PaperOperationsServiceOptions
): PaperOperationsService {
  return new PaperOperationsService(options);
}

export class PaperOperationsService {
  private readonly runtimeSessionId: string;
  private readonly paperAutomation: PaperAutomationService;
  private readonly meteredLaunchData: MeteredLaunchDataService;
  private readonly getFeedStatus: () => PaperOperationsFeedStatus;
  private readonly getTimeseriesStatus: () => TradeTimeseriesStatus;
  private readonly getTimeseriesGapCount: () => number;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly sampleIntervalMs: number;
  private readonly automaticSampling: boolean;
  private activeSession: StoredPaperOperationsSession | null = null;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private lastSamplingError: string | null = null;

  constructor(options: PaperOperationsServiceOptions) {
    this.runtimeSessionId = options.runtimeSessionId;
    this.paperAutomation = options.paperAutomation;
    this.meteredLaunchData = options.meteredLaunchData;
    this.getFeedStatus = options.getFeedStatus;
    this.getTimeseriesStatus = options.getTimeseriesStatus;
    this.getTimeseriesGapCount = options.getTimeseriesGapCount;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.sampleIntervalMs = Math.max(
      1_000,
      Math.min(10_000, Math.floor(options.sampleIntervalMs ?? 5_000))
    );
    this.automaticSampling = options.automaticSampling ?? true;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const active = getActivePaperOperationsSession();
    if (active) {
      const interrupted = transitionPaperOperationsSession({
        session: stripId(active),
        status: "interrupted",
        at: this.now().toISOString(),
        reason: "runtime process restarted",
        reasonCodes: [
          "PAPER_OPERATIONS_RUNTIME_RESTART",
          "PAPER_OPERATIONS_REARM_REQUIRED"
        ]
      });
      this.activeSession = savePaperOperationsSession(interrupted);
      this.recordSnapshot(this.activeSession, "restart_reconciled", {
        reasonCodes: ["PAPER_OPERATIONS_RESTART_RECONCILED"]
      });
      this.activeSession = null;
    }
  }

  stop(reason = "runtime process stopped"): void {
    if (this.activeSession?.status === "active") {
      const interrupted = transitionPaperOperationsSession({
        session: stripId(this.activeSession),
        status: "interrupted",
        at: this.now().toISOString(),
        reason,
        reasonCodes: ["PAPER_OPERATIONS_RUNTIME_STOPPED"]
      });
      this.activeSession = savePaperOperationsSession(interrupted);
      this.recordSnapshot(this.activeSession, "session_ended", {
        reasonCodes: ["PAPER_OPERATIONS_SESSION_INTERRUPTED"]
      });
    }
    this.activeSession = null;
    this.clearSampleTimer();
    this.started = false;
  }

  startSession(input: {
    deploymentId: string;
    startedBy: string;
    confirmation: string;
    config?: PaperOperationsConfigInput;
  }): StoredPaperOperationsSession {
    this.assertStarted();
    const deploymentId = input.deploymentId.trim();
    this.requireConfirmation(
      input.confirmation,
      paperOperationsConfirmation.start(deploymentId)
    );
    if (getActivePaperOperationsSession()) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_ACTIVE_SESSION_EXISTS",
        "End the active paper forward session before starting another.",
        { statusCode: 409 }
      );
    }
    const deployment = getPaperAutomationDeployment(deploymentId);
    if (!deployment) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_DEPLOYMENT_NOT_FOUND",
        `Paper automation deployment ${deploymentId} was not found.`,
        { statusCode: 404 }
      );
    }
    const currentDeployment = this.paperAutomation.getStatus().deployment;
    if (currentDeployment?.deploymentId !== deployment.deploymentId) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_DEPLOYMENT_NOT_CURRENT",
        "Only the current paper automation deployment can be observed.",
        { statusCode: 409 }
      );
    }
    if (deployment.status === "armed") {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_AUTOMATION_ALREADY_ARMED",
        "Pause paper automation before starting the forward evidence boundary.",
        { statusCode: 409 }
      );
    }
    const metered = this.meteredLaunchData.getStatus();
    if (metered.active) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_METERED_ALREADY_ACTIVE",
        "Stop metered launch tracking before starting the forward evidence boundary.",
        { statusCode: 409 }
      );
    }
    if (metered.budgetReached || metered.remainingBudgetSol <= 0) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_METERED_BUDGET_UNAVAILABLE",
        "A positive metered session budget must be available before starting forward operations.",
        { statusCode: 409 }
      );
    }
    const maximumSessionCostSol = Math.min(
      input.config?.maximumSessionCostSol ?? metered.maxSessionCostSol,
      metered.maxSessionCostSol,
      metered.maxUiSessionCostSol,
      metered.remainingBudgetSol
    );
    const startedAt = this.now().toISOString();
    const session = createPaperOperationsSession({
      sessionId: `paper-forward-${safeId(deploymentId)}-${this.createId()}`,
      deploymentId,
      deploymentStatus: deployment.status,
      runtimeSessionId: this.runtimeSessionId,
      startedBy: input.startedBy,
      startedAt,
      startingMeteredCostSol: metered.estimatedCostSol,
      startingMeteredEventCount: metered.totalEventsThisSession,
      config: {
        ...input.config,
        maximumSessionCostSol
      }
    });
    this.activeSession = savePaperOperationsSession(session);
    this.recordSnapshot(this.activeSession, "session_started", {
      reasonCodes: [
        "PAPER_OPERATIONS_SESSION_STARTED",
        "PAPER_OPERATIONS_METERED_START_REMAINS_MANUAL",
        "PAPER_OPERATIONS_AUTOMATION_ARM_REMAINS_MANUAL"
      ]
    });
    this.startSampleTimer();
    return this.activeSession;
  }

  endSession(input: {
    sessionId: string;
    confirmation: string;
    reason?: string;
  }): StoredPaperOperationsSession {
    this.assertStarted();
    this.requireConfirmation(
      input.confirmation,
      paperOperationsConfirmation.end(input.sessionId)
    );
    const session = this.requireActiveSession(input.sessionId);
    const automationStatus = this.paperAutomation.getStatus();
    const pendingOperations = automationStatus.pendingOperations;
    if (pendingOperations.length > 0) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_PENDING_OPERATIONS",
        "Pause/reconcile paper automation and resolve pending operations before ending the evidence session.",
        { statusCode: 409 }
      );
    }
    if (this.meteredLaunchData.getStatus().active) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_METERED_STILL_ACTIVE",
        "Stop metered launch tracking before ending the evidence session.",
        { statusCode: 409 }
      );
    }
    if (automationStatus.deployment?.status === "armed") {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_AUTOMATION_STILL_ARMED",
        "Pause paper automation before ending the evidence session.",
        { statusCode: 409 }
      );
    }
    const completed = transitionPaperOperationsSession({
      session: stripId(session),
      status: "completed",
      at: this.now().toISOString(),
      reason: input.reason?.trim() || "operator completed forward session",
      reasonCodes: ["PAPER_OPERATIONS_OPERATOR_COMPLETED"]
    });
    this.activeSession = savePaperOperationsSession(completed);
    this.recordSnapshot(this.activeSession, "session_ended", {
      reasonCodes: ["PAPER_OPERATIONS_SESSION_COMPLETED"]
    });
    const stored = this.activeSession;
    this.activeSession = null;
    this.clearSampleTimer();
    return stored;
  }

  sampleNow(): StoredPaperOperationsSnapshot {
    this.assertStarted();
    const session = this.requireActiveSession();
    return this.recordSnapshot(session, "runtime_sample");
  }

  observeSignal(signal: OverlaySignal): StoredPaperOperationsSnapshot | null {
    if (!this.started || !this.activeSession) return null;
    const observedAt = this.now();
    const signalAtMs = Date.parse(signal.state.updatedAt);
    return this.recordSnapshot(this.activeSession, "signal_latency", {
      observedAt,
      signalMint: signal.mint,
      signalAt: Number.isFinite(signalAtMs)
        ? new Date(signalAtMs).toISOString()
        : null,
      signalLatencyMs: Number.isFinite(signalAtMs)
        ? Math.max(0, observedAt.getTime() - signalAtMs)
        : null,
      reasonCodes: [
        Number.isFinite(signalAtMs)
          ? "PAPER_OPERATIONS_SIGNAL_LATENCY_OBSERVED"
          : "PAPER_OPERATIONS_SIGNAL_TIMESTAMP_INVALID"
      ]
    });
  }

  getStatus() {
    const session =
      this.activeSession ??
      getActivePaperOperationsSession() ??
      getLatestPaperOperationsSession();
    const snapshots = session
      ? listPaperOperationsSnapshotsForExport(session.sessionId)
      : [];
    const alerts = session
      ? listPaperOperationsAlertsForExport(session.sessionId)
      : [];
    const latestSample = snapshots.at(-1) ?? null;
    return {
      started: this.started,
      session,
      active: session?.status === "active",
      summary: session
        ? summarizePaperOperations(session, snapshots, alerts)
        : null,
      latestSample,
      activeAlerts: latestSample
        ? alerts.filter((alert) => alert.sampleId === latestSample.sampleId)
        : [],
      alertCount: alerts.length,
      lastSamplingError: this.lastSamplingError,
      contract: getPaperOperationsRuntimeContract(),
      automaticMeteredStart: false as const,
      automaticPaperArm: false as const,
      automaticLiveExecution: false as const,
      paperOnly: true as const,
      dataOnly: true as const,
      tradingDisabled: true as const,
      liveExecutionDisabled: true as const
    };
  }

  getSessions(limit = 50): StoredPaperOperationsSession[] {
    return listPaperOperationsSessions(limit);
  }

  getSnapshots(
    sessionId: string,
    limit = 500
  ): StoredPaperOperationsSnapshot[] {
    return listPaperOperationsSnapshots(sessionId, limit);
  }

  getAlerts(sessionId: string, limit = 500): StoredPaperOperationsAlert[] {
    return listPaperOperationsAlerts(sessionId, limit);
  }

  buildEvidenceReport(sessionId: string): PaperOperationsEvidenceReport {
    const session = getPaperOperationsSession(sessionId);
    if (!session) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_SESSION_NOT_FOUND",
        `Paper forward session ${sessionId} was not found.`,
        { statusCode: 404 }
      );
    }
    try {
      return createPaperOperationsEvidenceReport({
        reportId: `paper-forward-report-${safeId(sessionId)}`,
        generatedAt: session.endedAt ?? this.now().toISOString(),
        session: stripId(session),
        snapshots:
          listPaperOperationsSnapshotsForExport(sessionId).map(stripId),
        alerts: listPaperOperationsAlertsForExport(sessionId).map(stripId),
        automationEvents: listPaperAutomationEventsForEvaluation(
          session.deploymentId
        ).filter(
          (event) =>
            Date.parse(event.observedAt) >= Date.parse(session.startedAt) &&
            (session.endedAt === null ||
              Date.parse(event.observedAt) <= Date.parse(session.endedAt))
        ),
        automationOperations: listPaperAutomationOperationsForEvaluation(
          session.deploymentId
        ).filter(
          (operation) =>
            Date.parse(operation.createdAt) >= Date.parse(session.startedAt) &&
            (session.endedAt === null ||
              Date.parse(operation.createdAt) <= Date.parse(session.endedAt))
        )
      });
    } catch (error) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_REPORT_NOT_FINALIZED",
        error instanceof Error ? error.message : "Evidence report failed.",
        { statusCode: 409 }
      );
    }
  }

  private recordSnapshot(
    session: StoredPaperOperationsSession,
    kind: PaperOperationsSnapshotKind,
    overrides: {
      observedAt?: Date;
      signalMint?: string | null;
      signalAt?: string | null;
      signalLatencyMs?: number | null;
      reasonCodes?: string[];
    } = {}
  ): StoredPaperOperationsSnapshot {
    const now = overrides.observedAt ?? this.now();
    const automation = this.paperAutomation.getStatus();
    const metered = this.meteredLaunchData.getStatus();
    const feed = this.getFeedStatus();
    const timeseries = this.getTimeseriesStatus();
    const prior = getLatestPaperOperationsSnapshotForSession(session.sessionId);
    const telemetryGapMs = prior
      ? Math.max(0, now.getTime() - Date.parse(prior.observedAt))
      : null;
    const lastEventAt = latestIso(feed.lastEventAt, timeseries.lastEventAt);
    const storageStats = getStorageStats();
    const snapshot = createPaperOperationsSnapshot(stripId(session), {
      sampleId: `paper-ops-sample-${this.createId()}`,
      sessionId: session.sessionId,
      deploymentId: session.deploymentId,
      runtimeSessionId: this.runtimeSessionId,
      kind,
      observedAt: now.toISOString(),
      telemetryGapMs,
      meteredActive: metered.active,
      feedConnected: feed.connected,
      lastEventAt,
      trackedMintCount: metered.trackedMintCount,
      meteredEventCount: Math.max(
        0,
        metered.totalEventsThisSession - session.startingMeteredEventCount
      ),
      estimatedCostSol: Math.max(
        0,
        metered.estimatedCostSol - session.startingMeteredCostSol
      ),
      budgetReached: metered.budgetReached,
      dataWalletBalanceSol: metered.dataWalletBalanceSol,
      dataWalletBalanceStatus: metered.dataWalletBalanceStatus,
      signalMint: overrides.signalMint ?? null,
      signalAt: overrides.signalAt ?? null,
      signalLatencyMs: overrides.signalLatencyMs ?? null,
      automationStatus: automation.deployment?.status ?? null,
      automationHealthy: automation.health?.healthy ?? null,
      pendingOperationCount: automation.pendingOperations.length,
      closedTradeCount: automation.health?.metrics.closedTradeCount ?? 0,
      winCount: automation.health?.metrics.winCount ?? 0,
      totalNetPnlSol: automation.health?.metrics.totalNetPnlSol ?? 0,
      maximumDrawdownPct: automation.health?.metrics.maximumDrawdownPct ?? 0,
      timeseriesAcceptedEventCount: timeseries.acceptedEventCount,
      timeseriesDuplicateEventCount: timeseries.duplicateEventCount,
      timeseriesInvalidEventCount: timeseries.invalidEventCount,
      timeseriesLateEventCount: timeseries.lateEventCount,
      timeseriesGapCount: this.getTimeseriesGapCount(),
      storageWriteHealthy: true,
      reasonCodes: unique([
        ...(overrides.reasonCodes ?? []),
        ...(metered.active
          ? ["PAPER_OPERATIONS_METERED_ACTIVE"]
          : ["PAPER_OPERATIONS_METERED_INACTIVE"]),
        ...(lastEventAt ? [] : ["PAPER_OPERATIONS_NO_FEED_EVENT_YET"]),
        ...(feed.reconnectAttempts > 0
          ? ["PAPER_OPERATIONS_FEED_RECONNECTS_OBSERVED"]
          : []),
        ...(feed.parseErrorCount > 0
          ? ["PAPER_OPERATIONS_FEED_PARSE_ERRORS_OBSERVED"]
          : [])
      ]),
      payload: {
        feedReconnectAttempts: feed.reconnectAttempts,
        feedParseErrorCount: feed.parseErrorCount,
        feedLastError: feed.lastError,
        providerMeteredEventCount: metered.totalEventsThisSession,
        providerEstimatedCostSol: metered.estimatedCostSol,
        storage: {
          paperAutomationEventCount: storageStats.paperAutomationEventCount,
          paperAutomationOperationCount:
            storageStats.paperAutomationOperationCount,
          paperPortfolioFillCount: storageStats.paperPortfolioFillCount
        }
      }
    });
    const stored = savePaperOperationsSnapshot(snapshot);
    const evaluation = evaluatePaperOperationsAlerts({
      session: stripId(session),
      snapshot
    });
    for (const candidate of evaluation.alerts) {
      savePaperOperationsAlert({
        ...candidate,
        alertId: `paper-ops-alert-${safeId(candidate.code)}-${this.createId()}`
      });
    }
    this.enforce(evaluation, snapshot);
    this.lastSamplingError = null;
    return stored;
  }

  private enforce(
    evaluation: ReturnType<typeof evaluatePaperOperationsAlerts>,
    snapshot:
      | StoredPaperOperationsSnapshot
      | ReturnType<typeof createPaperOperationsSnapshot>
  ): void {
    if (
      evaluation.stopMeteredData &&
      this.meteredLaunchData.getStatus().active
    ) {
      this.meteredLaunchData.stop();
    }
    if (
      evaluation.pauseAutomation &&
      this.paperAutomation.getStatus().started &&
      this.paperAutomation.getStatus().deployment?.status === "armed"
    ) {
      this.paperAutomation.pause([
        "PAPER_OPERATIONS_FAIL_CLOSED_PAUSE",
        ...evaluation.alerts
          .filter((alert) => alert.severity === "critical")
          .map((alert) => alert.code),
        `PAPER_OPERATIONS_SAMPLE_${safeId(snapshot.sampleId)}`
      ]);
    }
  }

  private startSampleTimer(): void {
    this.clearSampleTimer();
    if (!this.automaticSampling) return;
    this.sampleTimer = setInterval(() => {
      try {
        if (this.activeSession)
          this.recordSnapshot(this.activeSession, "runtime_sample");
      } catch (error) {
        this.lastSamplingError =
          error instanceof Error
            ? error.message
            : "paper operations sampling failed";
        if (this.meteredLaunchData.getStatus().active) {
          this.meteredLaunchData.stop();
        }
        if (
          this.paperAutomation.getStatus().started &&
          this.paperAutomation.getStatus().deployment?.status === "armed"
        ) {
          this.paperAutomation.pause([
            "PAPER_OPERATIONS_STORAGE_OR_SAMPLING_FAILURE",
            "PAPER_OPERATIONS_FAIL_CLOSED_PAUSE"
          ]);
        }
      }
    }, this.sampleIntervalMs);
    this.sampleTimer.unref?.();
  }

  private clearSampleTimer(): void {
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    this.sampleTimer = null;
  }

  private requireActiveSession(
    sessionId?: string
  ): StoredPaperOperationsSession {
    const session = this.activeSession ?? getActivePaperOperationsSession();
    if (!session || (sessionId && session.sessionId !== sessionId)) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_ACTIVE_SESSION_NOT_FOUND",
        "No matching active paper forward session was found.",
        { statusCode: 404 }
      );
    }
    this.activeSession = session;
    return session;
  }

  private requireConfirmation(actual: string, expected: string): void {
    if (actual !== expected) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_CONFIRMATION_REQUIRED",
        `Exact confirmation required: ${expected}`,
        { statusCode: 409 }
      );
    }
  }

  private assertStarted(): void {
    if (!this.started) {
      throw new PaperOperationsServiceError(
        "PAPER_OPERATIONS_NOT_STARTED",
        "Paper operations service is not started.",
        { statusCode: 409 }
      );
    }
  }
}

function stripId<T extends { id: number }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  void _id;
  return rest;
}

function latestIso(...values: Array<string | null>): string | null {
  const valid = values.filter(
    (value): value is string =>
      value !== null && Number.isFinite(Date.parse(value))
  );
  return (
    valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 80);
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
