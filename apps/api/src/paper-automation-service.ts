import { randomUUID } from "node:crypto";
import { createPaperExitPolicyConfig } from "@axi/exit-strategy";
import {
  createPaperAutomationDeployment,
  deterministicPaperAutomationMiss,
  evaluatePaperAutomationHealth,
  getPaperAutomationCompatibilityBlockers,
  getPaperAutomationRuntimeContract,
  transitionPaperAutomationDeployment,
  type PaperAutomationDeployment,
  type PaperAutomationEvent,
  type PaperAutomationEventKind,
  type PaperAutomationForwardConfigInput,
  type PaperAutomationOperation,
  type PaperAutomationOperationKind
} from "@axi/paper-automation";
import type { OverlaySignal } from "@axi/shared";
import {
  getLatestPaperAutomationDeployment,
  getPaperAutomationDeployment,
  getPaperLifecycleValidation,
  listPaperAutomationDeployments,
  listPaperAutomationEvents,
  listPaperAutomationEventsForEvaluation,
  listPaperAutomationOperations,
  savePaperAutomationDeployment,
  savePaperAutomationEvent,
  savePaperAutomationOperation,
  type StoredPaperAutomationDeployment,
  type StoredPaperAutomationEvent,
  type StoredPaperAutomationOperation
} from "@axi/storage";
import type {
  PaperPortfolioEvaluation,
  PaperPortfolioService
} from "./paper-portfolio-service";

export const paperAutomationConfirmation = {
  approve: (validationId: string) => `APPROVE PAPER AUTOMATION ${validationId}`,
  arm: (deploymentId: string) => `ARM PAPER AUTOMATION ${deploymentId}`,
  revoke: (deploymentId: string) => `REVOKE PAPER AUTOMATION ${deploymentId}`
} as const;

export type PaperAutomationServiceOptions = {
  paperPortfolio: PaperPortfolioService;
  now?: () => Date;
  createId?: () => string;
};

export class PaperAutomationServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly reasonCodes: string[];

  constructor(
    code: string,
    message: string,
    options: { statusCode?: number; reasonCodes?: string[] } = {}
  ) {
    super(message);
    this.name = "PaperAutomationServiceError";
    this.code = code;
    this.statusCode = options.statusCode ?? 400;
    this.reasonCodes = options.reasonCodes ?? [code];
  }
}

export function createPaperAutomationService(
  options: PaperAutomationServiceOptions
): PaperAutomationService {
  return new PaperAutomationService(options);
}

export class PaperAutomationService {
  private readonly paperPortfolio: PaperPortfolioService;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private deployment: StoredPaperAutomationDeployment | null = null;
  private started = false;

  constructor(options: PaperAutomationServiceOptions) {
    this.paperPortfolio = options.paperPortfolio;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.deployment = getLatestPaperAutomationDeployment();
    if (this.deployment?.status === "armed") {
      this.deployment = this.transition(
        this.deployment,
        "paused",
        ["PAPER_AUTOMATION_RESTART_REARM_REQUIRED"],
        "restart_reconciled"
      );
      this.cancelPendingOperations(
        this.deployment,
        "PAPER_AUTOMATION_RESTART_RECONCILED"
      );
    }
    this.reconcilePendingOperations();
  }

  stop(): void {
    if (this.started && this.deployment?.status === "armed") {
      this.deployment = this.transition(
        this.deployment,
        "paused",
        ["PAPER_AUTOMATION_RUNTIME_STOPPED"],
        "paused"
      );
      this.cancelPendingOperations(
        this.deployment,
        "PAPER_AUTOMATION_RUNTIME_STOPPED"
      );
    }
    this.started = false;
  }

  approve(input: {
    validationId: string;
    approvedBy: string;
    confirmation: string;
    forwardConfig?: PaperAutomationForwardConfigInput | undefined;
  }): StoredPaperAutomationDeployment {
    this.assertStarted();
    const validationId = input.validationId.trim();
    this.requireConfirmation(
      input.confirmation,
      paperAutomationConfirmation.approve(validationId)
    );
    const latest = getLatestPaperAutomationDeployment();
    if (latest && latest.status !== "revoked") {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_ACTIVE_DEPLOYMENT_EXISTS",
        `Revoke deployment ${latest.deploymentId} before approving another lifecycle report.`,
        { statusCode: 409 }
      );
    }
    const validation = getPaperLifecycleValidation(validationId);
    if (!validation) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_VALIDATION_NOT_FOUND",
        `Lifecycle validation ${validationId} was not found.`,
        { statusCode: 404 }
      );
    }
    const approvedAt = this.now().toISOString();
    let candidate: PaperAutomationDeployment;
    try {
      candidate = createPaperAutomationDeployment({
        deploymentId: `paper-auto-${safeId(validationId)}-${this.createId()}`,
        validation,
        approvedBy: input.approvedBy,
        approvedAt,
        forwardStartingEquitySol: this.paperPortfolio.getSnapshot().equitySol,
        ...(input.forwardConfig ? { forwardConfig: input.forwardConfig } : {})
      });
    } catch (error) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_VALIDATION_NOT_PROMOTABLE",
        error instanceof Error
          ? error.message
          : "Lifecycle validation is not promotable.",
        { statusCode: 409 }
      );
    }
    this.deployment = savePaperAutomationDeployment(candidate);
    this.recordEvent(this.deployment, "approved", {
      reasonCodes: candidate.statusReasonCodes,
      payload: { validationId, approvedBy: candidate.approvedBy }
    });
    return this.deployment;
  }

  arm(input: {
    deploymentId: string;
    confirmation: string;
  }): StoredPaperAutomationDeployment {
    this.assertStarted();
    this.requireConfirmation(
      input.confirmation,
      paperAutomationConfirmation.arm(input.deploymentId)
    );
    const deployment = this.requireDeployment(input.deploymentId);
    const blockers = getPaperAutomationCompatibilityBlockers({
      deployment,
      portfolio: this.paperPortfolio.getAutomationCompatibilityConfig()
    });
    if (blockers.length > 0) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_PORTFOLIO_INCOMPATIBLE",
        "The paper portfolio does not match the approved lifecycle assumptions.",
        { statusCode: 409, reasonCodes: blockers }
      );
    }
    const health = evaluatePaperAutomationHealth({
      deployment,
      events: listPaperAutomationEventsForEvaluation(deployment.deploymentId)
    });
    if (health.automaticPauseRequired) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_FORWARD_HEALTH_BLOCKED",
        "Forward validation health must be restored before re-arming.",
        { statusCode: 409, reasonCodes: health.blockers }
      );
    }
    this.deployment = this.transition(
      deployment,
      "armed",
      ["PAPER_AUTOMATION_OPERATOR_ARMED"],
      "armed"
    );
    return this.deployment;
  }

  pause(
    reasonCodes = ["PAPER_AUTOMATION_OPERATOR_PAUSED"]
  ): StoredPaperAutomationDeployment {
    this.assertStarted();
    const deployment = this.requireDeployment();
    if (deployment.status === "revoked") return deployment;
    this.deployment = this.transition(
      deployment,
      "paused",
      reasonCodes,
      "paused"
    );
    this.cancelPendingOperations(
      this.deployment,
      "PAPER_AUTOMATION_DEPLOYMENT_PAUSED"
    );
    return this.deployment;
  }

  revoke(input: {
    deploymentId: string;
    confirmation: string;
  }): StoredPaperAutomationDeployment {
    this.assertStarted();
    this.requireConfirmation(
      input.confirmation,
      paperAutomationConfirmation.revoke(input.deploymentId)
    );
    const deployment = this.requireDeployment(input.deploymentId);
    this.deployment = this.transition(
      deployment,
      "revoked",
      ["PAPER_AUTOMATION_OPERATOR_REVOKED"],
      "revoked"
    );
    this.cancelPendingOperations(
      this.deployment,
      "PAPER_AUTOMATION_DEPLOYMENT_REVOKED"
    );
    return this.deployment;
  }

  observeSignal(signal: OverlaySignal): void {
    if (!this.started || this.deployment?.status !== "armed") return;
    const deployment = this.deployment;
    const now = this.now();
    const signalAtMs = Date.parse(signal.state.updatedAt);
    if (
      !Number.isFinite(signalAtMs) ||
      now.getTime() - signalAtMs >
        deployment.forwardConfig.maximumSignalAgeMs ||
      signalAtMs > now.getTime() + 1_000
    ) {
      this.recordEvent(deployment, "signal_rejected", {
        mint: signal.mint,
        reasonCodes: ["PAPER_AUTOMATION_SIGNAL_STALE"],
        payload: {
          signalAt: signal.state.updatedAt,
          receivedAt: now.toISOString()
        }
      });
      this.applyHealthKillSwitch();
      return;
    }

    this.recordEvent(deployment, "signal_accepted", {
      mint: signal.mint,
      reasonCodes: ["PAPER_AUTOMATION_SIGNAL_FRESH"],
      payload: {
        signalAt: signal.state.updatedAt,
        receivedAt: now.toISOString()
      }
    });
    this.paperPortfolio.updateMarkPrice(signal.mint);
    this.processPendingForMint(deployment, signal, now);
    if (this.deployment?.status !== "armed") return;

    const pending = listPaperAutomationOperations(deployment.deploymentId, {
      status: "pending"
    }).some((operation) => operation.mint === signal.mint);
    if (pending) return;

    const position = this.paperPortfolio.getPositionSummaryForMint(signal.mint);
    if (!position.hasPosition && signal.score >= deployment.selectedThreshold) {
      const operation = this.scheduleOperation(
        deployment,
        "entry",
        signal,
        null
      );
      if (deployment.executionConfig.entryLatencyMs === 0) {
        this.executeOperation(deployment, operation, signal, now);
      }
    } else if (position.hasPosition) {
      const evaluation = this.paperPortfolio.evaluateApprovedAutomationExit(
        signal.mint,
        createPaperExitPolicyConfig(deployment.exitPolicyConfig)
      );
      if (evaluation?.selectedAction) {
        const operation = this.scheduleOperation(
          deployment,
          "exit",
          signal,
          evaluation.evaluationId
        );
        if (deployment.executionConfig.exitLatencyMs === 0) {
          this.executeOperation(deployment, operation, signal, now);
        }
      }
    }
  }

  reconcilePendingOperations(): StoredPaperAutomationOperation[] {
    if (!this.deployment) return [];
    const now = this.now();
    const pending = listPaperAutomationOperations(
      this.deployment.deploymentId,
      {
        status: "pending"
      }
    );
    return pending.map((operation) => {
      if (Date.parse(operation.expiresAt) >= now.getTime()) return operation;
      const expired = savePaperAutomationOperation({
        ...stripId(operation),
        status: "expired",
        updatedAt: now.toISOString(),
        reasonCodes: unique([
          ...operation.reasonCodes,
          "PAPER_AUTOMATION_OPERATION_EXPIRED"
        ])
      });
      this.recordEvent(
        this.deployment as StoredPaperAutomationDeployment,
        operation.kind === "entry" ? "entry_expired" : "exit_expired",
        {
          operationId: operation.operationId,
          mint: operation.mint,
          reasonCodes: expired.reasonCodes,
          payload: { expiresAt: operation.expiresAt }
        }
      );
      return expired;
    });
  }

  getStatus() {
    const deployment = this.deployment ?? getLatestPaperAutomationDeployment();
    const events = deployment
      ? listPaperAutomationEventsForEvaluation(deployment.deploymentId)
      : [];
    const health = deployment
      ? evaluatePaperAutomationHealth({ deployment, events })
      : null;
    return {
      started: this.started,
      deployment,
      armed: deployment?.status === "armed",
      compatibilityBlockers: deployment
        ? getPaperAutomationCompatibilityBlockers({
            deployment,
            portfolio: this.paperPortfolio.getAutomationCompatibilityConfig()
          })
        : [],
      pendingOperations: deployment
        ? listPaperAutomationOperations(deployment.deploymentId, {
            status: "pending"
          })
        : [],
      eventCount: events.length,
      health,
      contract: getPaperAutomationRuntimeContract(),
      automaticLiveExecution: false as const,
      paperOnly: true as const,
      tradingDisabled: true as const,
      liveExecutionDisabled: true as const
    };
  }

  getDeployments(limit = 50) {
    return listPaperAutomationDeployments(limit);
  }

  getEvents(limit = 500): StoredPaperAutomationEvent[] {
    const deployment = this.deployment ?? getLatestPaperAutomationDeployment();
    return deployment
      ? listPaperAutomationEvents(deployment.deploymentId, limit)
      : [];
  }

  getOperations(limit = 500): StoredPaperAutomationOperation[] {
    const deployment = this.deployment ?? getLatestPaperAutomationDeployment();
    return deployment
      ? listPaperAutomationOperations(deployment.deploymentId, { limit })
      : [];
  }

  private processPendingForMint(
    deployment: StoredPaperAutomationDeployment,
    signal: OverlaySignal,
    now: Date
  ): void {
    const operations = listPaperAutomationOperations(deployment.deploymentId, {
      status: "pending"
    }).filter((operation) => operation.mint === signal.mint);
    for (const operation of operations) {
      if (Date.parse(operation.expiresAt) < now.getTime()) {
        this.expireOperation(deployment, operation, now);
      } else if (Date.parse(operation.executeAfter) <= now.getTime()) {
        this.executeOperation(deployment, operation, signal, now);
      }
      if (this.deployment?.status !== "armed") return;
    }
  }

  private executeOperation(
    deployment: StoredPaperAutomationDeployment,
    operation: StoredPaperAutomationOperation,
    signal: OverlaySignal,
    now: Date
  ): void {
    const missRate =
      operation.kind === "entry"
        ? deployment.executionConfig.entryMissedFillRate
        : deployment.executionConfig.exitMissedFillRate;
    if (
      deterministicPaperAutomationMiss(
        `${operation.operationId}:${now.toISOString()}`,
        missRate
      )
    ) {
      this.recordEvent(
        deployment,
        operation.kind === "entry" ? "entry_missed" : "exit_missed",
        {
          operationId: operation.operationId,
          mint: operation.mint,
          reasonCodes: ["PAPER_AUTOMATION_DETERMINISTIC_MISSED_FILL"],
          payload: { attemptedAt: now.toISOString(), missRate }
        }
      );
      return;
    }

    const beforePosition = this.paperPortfolio.getPosition(operation.mint);
    let result: PaperPortfolioEvaluation;
    if (operation.kind === "entry") {
      result = this.paperPortfolio.executeApprovedAutomationEntry(
        {
          ...signal,
          score: operation.signalScore,
          hardReject: operation.signalHardReject
        },
        {
          deploymentId: deployment.deploymentId,
          operationId: operation.operationId,
          selectedThreshold: deployment.selectedThreshold,
          positionSizeSol: deployment.executionConfig.positionSizeSol,
          maximumVolumeParticipationRatio:
            deployment.executionConfig.maximumVolumeParticipationRatio,
          maximumMarketImpactBps:
            deployment.executionConfig.maximumMarketImpactBps
        }
      );
    } else {
      const evaluation = operation.exitEvaluationId
        ? this.paperPortfolio.getExitPolicyEvaluation(
            operation.exitEvaluationId
          )
        : null;
      result = evaluation
        ? this.paperPortfolio.executeApprovedAutomationExit(evaluation, {
            deploymentId: deployment.deploymentId,
            operationId: operation.operationId,
            positionSizeSol: deployment.executionConfig.positionSizeSol,
            maximumVolumeParticipationRatio:
              deployment.executionConfig.maximumVolumeParticipationRatio,
            maximumMarketImpactBps:
              deployment.executionConfig.maximumMarketImpactBps
          })
        : blockedEvaluation(this.paperPortfolio, [
            "PAPER_AUTOMATION_EXIT_EVALUATION_MISSING"
          ]);
    }
    const rejected =
      result.fill?.fillStatus === "rejected" || result.fill === null;
    const status = rejected ? "rejected" : "executed";
    const stored = savePaperAutomationOperation({
      ...stripId(operation),
      status,
      updatedAt: now.toISOString(),
      reasonCodes: unique([...operation.reasonCodes, ...result.reasonCodes])
    });
    const after = this.paperPortfolio.getPositionSummaryForMint(operation.mint);
    const kind: PaperAutomationEventKind =
      operation.kind === "entry"
        ? rejected
          ? "entry_rejected"
          : "entry_executed"
        : rejected
          ? "exit_rejected"
          : "exit_executed";
    this.recordEvent(deployment, kind, {
      operationId: operation.operationId,
      mint: operation.mint,
      orderId: result.intent?.id ?? null,
      fillId: result.fill?.id ?? null,
      entryFeeSol:
        operation.kind === "entry" ? (result.fill?.feeSol ?? null) : null,
      positionSizeSol: beforePosition?.sizeSol ?? result.fill?.sizeSol ?? null,
      realizedPnlSol:
        operation.kind === "exit" ? (after.realizedPnlSol ?? 0) : null,
      positionClosed:
        operation.kind === "exit" ? after.status === "closed" : null,
      reasonCodes: stored.reasonCodes,
      payload: result
    });
    this.applyHealthKillSwitch();
  }

  private scheduleOperation(
    deployment: StoredPaperAutomationDeployment,
    kind: PaperAutomationOperationKind,
    signal: OverlaySignal,
    exitEvaluationId: string | null
  ): StoredPaperAutomationOperation {
    const createdAt = this.now();
    const latencyMs =
      kind === "entry"
        ? deployment.executionConfig.entryLatencyMs
        : deployment.executionConfig.exitLatencyMs;
    const executeAfter = new Date(createdAt.getTime() + latencyMs);
    const operation: PaperAutomationOperation = {
      schemaVersion: 1,
      operationId: `paper-auto-op-${this.createId()}`,
      deploymentId: deployment.deploymentId,
      kind,
      status: "pending",
      mint: signal.mint,
      signalScore: signal.score,
      signalHardReject: signal.hardReject,
      signalAt: signal.state.updatedAt,
      executeAfter: executeAfter.toISOString(),
      expiresAt: new Date(
        executeAfter.getTime() + deployment.executionConfig.maximumFillDelayMs
      ).toISOString(),
      exitEvaluationId,
      reasonCodes: [
        kind === "entry"
          ? "PAPER_AUTOMATION_ENTRY_SCHEDULED"
          : "PAPER_AUTOMATION_EXIT_SCHEDULED",
        "LIVE_EXECUTION_DISABLED"
      ],
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
    const stored = savePaperAutomationOperation(operation);
    this.recordEvent(
      deployment,
      kind === "entry" ? "entry_scheduled" : "exit_scheduled",
      {
        operationId: stored.operationId,
        mint: stored.mint,
        reasonCodes: stored.reasonCodes,
        payload: {
          signalAt: stored.signalAt,
          signalScore: stored.signalScore,
          signalHardReject: stored.signalHardReject,
          executeAfter: stored.executeAfter,
          expiresAt: stored.expiresAt,
          exitEvaluationId
        }
      }
    );
    return stored;
  }

  private expireOperation(
    deployment: StoredPaperAutomationDeployment,
    operation: StoredPaperAutomationOperation,
    now: Date
  ): void {
    const expired = savePaperAutomationOperation({
      ...stripId(operation),
      status: "expired",
      updatedAt: now.toISOString(),
      reasonCodes: unique([
        ...operation.reasonCodes,
        "PAPER_AUTOMATION_OPERATION_EXPIRED"
      ])
    });
    this.recordEvent(
      deployment,
      operation.kind === "entry" ? "entry_expired" : "exit_expired",
      {
        operationId: operation.operationId,
        mint: operation.mint,
        reasonCodes: expired.reasonCodes,
        payload: { expiresAt: operation.expiresAt }
      }
    );
    this.applyHealthKillSwitch();
  }

  private applyHealthKillSwitch(): void {
    const deployment = this.deployment;
    if (!deployment || deployment.status !== "armed") return;
    const health = evaluatePaperAutomationHealth({
      deployment,
      events: listPaperAutomationEventsForEvaluation(deployment.deploymentId)
    });
    if (!health.automaticPauseRequired) return;
    this.recordEvent(deployment, "drift_detected", {
      reasonCodes: health.blockers,
      payload: health.metrics
    });
    this.deployment = this.transition(
      deployment,
      "paused",
      ["PAPER_AUTOMATION_AUTOMATIC_KILL_SWITCH", ...health.blockers],
      "kill_switch_triggered"
    );
    this.cancelPendingOperations(
      this.deployment,
      "PAPER_AUTOMATION_KILL_SWITCH_TRIGGERED"
    );
  }

  private cancelPendingOperations(
    deployment: StoredPaperAutomationDeployment,
    reasonCode: string
  ): void {
    const at = this.now().toISOString();
    for (const operation of listPaperAutomationOperations(
      deployment.deploymentId,
      { status: "pending" }
    )) {
      const cancelled = savePaperAutomationOperation({
        ...stripId(operation),
        status: "cancelled",
        updatedAt: at,
        reasonCodes: unique([...operation.reasonCodes, reasonCode])
      });
      this.recordEvent(
        deployment,
        operation.kind === "entry" ? "entry_cancelled" : "exit_cancelled",
        {
          operationId: operation.operationId,
          mint: operation.mint,
          reasonCodes: cancelled.reasonCodes,
          payload: { reasonCode }
        }
      );
    }
  }

  private transition(
    deployment: StoredPaperAutomationDeployment,
    status: PaperAutomationDeployment["status"],
    reasonCodes: string[],
    eventKind: PaperAutomationEventKind
  ): StoredPaperAutomationDeployment {
    let transitioned: PaperAutomationDeployment;
    try {
      transitioned = transitionPaperAutomationDeployment({
        deployment: stripId(deployment),
        status,
        at: this.now().toISOString(),
        reasonCodes
      });
    } catch (error) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_INVALID_STATE_TRANSITION",
        error instanceof Error
          ? error.message
          : "Invalid automation state transition.",
        { statusCode: 409 }
      );
    }
    const stored = savePaperAutomationDeployment(transitioned);
    this.recordEvent(stored, eventKind, { reasonCodes, payload: { status } });
    return stored;
  }

  private recordEvent(
    deployment: StoredPaperAutomationDeployment,
    kind: PaperAutomationEventKind,
    input: Partial<
      Pick<
        PaperAutomationEvent,
        | "operationId"
        | "mint"
        | "orderId"
        | "fillId"
        | "entryFeeSol"
        | "positionSizeSol"
        | "realizedPnlSol"
        | "positionClosed"
      >
    > & { reasonCodes: string[]; payload: unknown }
  ): StoredPaperAutomationEvent {
    return savePaperAutomationEvent({
      schemaVersion: 1,
      eventId: `paper-auto-event-${this.createId()}`,
      deploymentId: deployment.deploymentId,
      operationId: input.operationId ?? null,
      kind,
      mint: input.mint ?? null,
      observedAt: this.now().toISOString(),
      orderId: input.orderId ?? null,
      fillId: input.fillId ?? null,
      entryFeeSol: input.entryFeeSol ?? null,
      positionSizeSol: input.positionSizeSol ?? null,
      realizedPnlSol: input.realizedPnlSol ?? null,
      positionClosed: input.positionClosed ?? null,
      reasonCodes: unique([...input.reasonCodes, "LIVE_EXECUTION_DISABLED"]),
      payload: input.payload,
      paperOnly: true,
      liveExecutionDisabled: true
    });
  }

  private requireDeployment(
    deploymentId?: string
  ): StoredPaperAutomationDeployment {
    const deployment = deploymentId
      ? getPaperAutomationDeployment(deploymentId)
      : this.deployment;
    if (!deployment) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_DEPLOYMENT_NOT_FOUND",
        "No paper automation deployment was found.",
        { statusCode: 404 }
      );
    }
    if (
      this.deployment &&
      deployment.deploymentId !== this.deployment.deploymentId
    ) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_DEPLOYMENT_NOT_CURRENT",
        "Only the current paper automation deployment can be controlled.",
        { statusCode: 409 }
      );
    }
    return deployment;
  }

  private requireConfirmation(actual: string, expected: string): void {
    if (actual !== expected) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_CONFIRMATION_REQUIRED",
        `Exact confirmation required: ${expected}`,
        { statusCode: 409 }
      );
    }
  }

  private assertStarted(): void {
    if (!this.started) {
      throw new PaperAutomationServiceError(
        "PAPER_AUTOMATION_NOT_STARTED",
        "Paper automation service is not started.",
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

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 80);
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function blockedEvaluation(
  portfolio: PaperPortfolioService,
  reasonCodes: string[]
): PaperPortfolioEvaluation {
  return {
    intent: null,
    fill: null,
    position: null,
    snapshot: portfolio.getSnapshot(),
    blocked: true,
    reasonCodes,
    paperOnly: true,
    liveExecutionDisabled: true
  };
}
