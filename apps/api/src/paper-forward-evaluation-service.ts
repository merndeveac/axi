import { randomUUID } from "node:crypto";
import {
  evaluatePaperForwardEvidence,
  getPaperForwardEvaluationRuntimeContract,
  type PaperForwardEvaluationConfigInput
} from "@axi/paper-forward-evaluation";
import { createPaperOperationsEvidenceReport } from "@axi/paper-operations";
import {
  getLatestPaperAutomationDeployment,
  getLatestPaperForwardEvaluation,
  getPaperAutomationDeployment,
  getPaperForwardEvaluation,
  getStorageStats,
  listPaperAutomationEventsForEvaluation,
  listPaperAutomationOperationsForEvaluation,
  listPaperForwardEvaluations,
  listPaperOperationsAlertsForExport,
  listPaperOperationsSessionsForEvaluation,
  listPaperOperationsSnapshotsForExport,
  savePaperForwardEvaluation,
  type StoredPaperAutomationDeployment,
  type StoredPaperForwardEvaluation
} from "@axi/storage";

export const paperForwardEvaluationConfirmation = (deploymentId: string) =>
  `EVALUATE PAPER FORWARD EVIDENCE ${deploymentId}`;

export class PaperForwardEvaluationServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly reasonCodes: string[];

  constructor(
    code: string,
    message: string,
    options: { statusCode?: number; reasonCodes?: string[] } = {}
  ) {
    super(message);
    this.name = "PaperForwardEvaluationServiceError";
    this.code = code;
    this.statusCode = options.statusCode ?? 400;
    this.reasonCodes = options.reasonCodes ?? [code];
  }
}

export type PaperForwardEvidenceCollection = {
  deployment: StoredPaperAutomationDeployment;
  reports: ReturnType<typeof createPaperOperationsEvidenceReport>[];
  completedSessionIds: string[];
  interruptedSessionIds: string[];
  activeSessionIds: string[];
};

export function createPaperForwardEvaluationService(
  options: {
    now?: () => Date;
    createId?: () => string;
  } = {}
): PaperForwardEvaluationService {
  return new PaperForwardEvaluationService(options);
}

export class PaperForwardEvaluationService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: { now?: () => Date; createId?: () => string } = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  evaluate(input: {
    deploymentId: string;
    evaluatedBy: string;
    confirmation: string;
    config?: PaperForwardEvaluationConfigInput;
  }): StoredPaperForwardEvaluation {
    const deploymentId = input.deploymentId.trim();
    const expectedConfirmation =
      paperForwardEvaluationConfirmation(deploymentId);
    if (input.confirmation !== expectedConfirmation) {
      throw new PaperForwardEvaluationServiceError(
        "PAPER_FORWARD_EVALUATION_CONFIRMATION_REQUIRED",
        `Exact confirmation required: ${expectedConfirmation}`
      );
    }
    const evaluatedBy = input.evaluatedBy.trim();
    if (!evaluatedBy) {
      throw new PaperForwardEvaluationServiceError(
        "PAPER_FORWARD_EVALUATION_OPERATOR_REQUIRED",
        "An operator identity is required to evaluate forward evidence."
      );
    }
    const evidence = collectPaperForwardEvidence(deploymentId);
    if (evidence.deployment.status === "armed") {
      throw new PaperForwardEvaluationServiceError(
        "PAPER_FORWARD_EVALUATION_AUTOMATION_ARMED",
        "Pause paper automation before evaluating the finalized evidence cohort.",
        { statusCode: 409 }
      );
    }
    if (evidence.activeSessionIds.length > 0) {
      throw new PaperForwardEvaluationServiceError(
        "PAPER_FORWARD_EVALUATION_ACTIVE_SESSION",
        "End or interrupt the active forward session before evaluating the immutable cohort.",
        { statusCode: 409 }
      );
    }
    const evaluatedAt = this.now().toISOString();
    const report = evaluatePaperForwardEvidence({
      evaluationId: `paper-forward-evaluation-${safeId(deploymentId)}-${this.createId()}`,
      evaluatedAt,
      evaluatedBy,
      deployment: stripId(evidence.deployment),
      reports: evidence.reports,
      excludedInterruptedSessionIds: evidence.interruptedSessionIds,
      ...(input.config ? { config: input.config } : {})
    });
    return savePaperForwardEvaluation(report);
  }

  getStatus() {
    const deployment = getLatestPaperAutomationDeployment();
    const sessions = deployment
      ? listPaperOperationsSessionsForEvaluation(deployment.deploymentId)
      : [];
    const latestEvaluation = deployment
      ? getLatestPaperForwardEvaluation(deployment.deploymentId)
      : getLatestPaperForwardEvaluation();
    const stats = getStorageStats();
    return {
      deploymentId: deployment?.deploymentId ?? null,
      deploymentStatus: deployment?.status ?? null,
      completedSessionCount: sessions.filter(
        (session) => session.status === "completed"
      ).length,
      interruptedSessionCount: sessions.filter(
        (session) => session.status === "interrupted"
      ).length,
      activeSessionCount: sessions.filter(
        (session) => session.status === "active"
      ).length,
      eligibleSessionIds: sessions
        .filter((session) => session.status === "completed")
        .map((session) => session.sessionId),
      evaluationCount: stats.paperForwardEvaluationCount,
      latestEvaluation,
      contract: getPaperForwardEvaluationRuntimeContract(),
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

  getEvaluations(limit = 50): StoredPaperForwardEvaluation[] {
    return listPaperForwardEvaluations(limit);
  }

  getEvaluation(evaluationId: string): StoredPaperForwardEvaluation {
    const evaluation = getPaperForwardEvaluation(evaluationId);
    if (!evaluation) {
      throw new PaperForwardEvaluationServiceError(
        "PAPER_FORWARD_EVALUATION_NOT_FOUND",
        `Paper forward evaluation ${evaluationId} was not found.`,
        { statusCode: 404 }
      );
    }
    return evaluation;
  }
}

export function collectPaperForwardEvidence(
  deploymentId: string
): PaperForwardEvidenceCollection {
  const normalizedId = deploymentId.trim();
  const deployment = getPaperAutomationDeployment(normalizedId);
  if (!deployment) {
    throw new PaperForwardEvaluationServiceError(
      "PAPER_FORWARD_EVALUATION_DEPLOYMENT_NOT_FOUND",
      `Paper automation deployment ${normalizedId} was not found.`,
      { statusCode: 404 }
    );
  }
  const sessions = listPaperOperationsSessionsForEvaluation(normalizedId);
  const completed = sessions.filter(
    (session) => session.status === "completed"
  );
  const interrupted = sessions.filter(
    (session) => session.status === "interrupted"
  );
  const active = sessions.filter((session) => session.status === "active");
  const automationEvents = listPaperAutomationEventsForEvaluation(normalizedId);
  const automationOperations =
    listPaperAutomationOperationsForEvaluation(normalizedId);
  const reports = completed.map((session) =>
    createPaperOperationsEvidenceReport({
      reportId: `paper-forward-report-${safeId(session.sessionId)}`,
      generatedAt: session.endedAt ?? session.updatedAt,
      session: stripId(session),
      snapshots: listPaperOperationsSnapshotsForExport(session.sessionId).map(
        stripId
      ),
      alerts: listPaperOperationsAlertsForExport(session.sessionId).map(
        stripId
      ),
      automationEvents: automationEvents
        .filter((event) => withinSession(event.observedAt, session))
        .map(stripId),
      automationOperations: automationOperations
        .filter((operation) => withinSession(operation.createdAt, session))
        .map(stripId)
    })
  );
  return {
    deployment,
    reports,
    completedSessionIds: completed.map((session) => session.sessionId),
    interruptedSessionIds: interrupted.map((session) => session.sessionId),
    activeSessionIds: active.map((session) => session.sessionId)
  };
}

function withinSession(
  observedAt: string,
  session: { startedAt: string; endedAt: string | null }
): boolean {
  const observed = Date.parse(observedAt);
  return (
    observed >= Date.parse(session.startedAt) &&
    (session.endedAt === null || observed <= Date.parse(session.endedAt))
  );
}

function stripId<T extends { id: number }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  void _id;
  return rest;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);
}
