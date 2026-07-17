import { randomUUID } from "node:crypto";
import {
  buildCalibrationDataset,
  type CalibrationDataset
} from "@axi/session-capture";
import {
  evaluatePaperStrategy,
  getPaperStrategyEvaluationRuntimeContract,
  type PaperStrategyEvaluationConfigInput,
  type PaperStrategyEvaluationStatus
} from "@axi/paper-strategy-evaluation";
import type { CalibrationEvidenceRequirementOverrides } from "@axi/signal-calibration";
import {
  getCalibrationCaptureSession,
  getPaperStrategyEvaluation,
  getStorageStats,
  listCapturedSignalObservationsBySession,
  listPaperStrategyEvaluations,
  savePaperStrategyEvaluation,
  type StoredPaperStrategyEvaluation
} from "@axi/storage";

export type PaperStrategyEvaluationInput = {
  captureSessionIds: string[];
  config?: PaperStrategyEvaluationConfigInput | undefined;
  thresholdCandidates?: number[] | undefined;
  evidenceRequirements?: CalibrationEvidenceRequirementOverrides | undefined;
};

export type PaperStrategyEvaluationStatusView = {
  evaluationCount: number;
  latestEvaluation: StoredPaperStrategyEvaluation | null;
  statusCounts: Record<PaperStrategyEvaluationStatus, number>;
  contract: ReturnType<typeof getPaperStrategyEvaluationRuntimeContract>;
  automaticThresholdActivation: false;
  automaticPaperTradingActivation: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
};

export class PaperStrategyEvaluationServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "PaperStrategyEvaluationServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class PaperStrategyEvaluationService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    options: {
      createId?: (() => string) | undefined;
      now?: (() => Date) | undefined;
    } = {}
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  evaluate(input: PaperStrategyEvaluationInput): StoredPaperStrategyEvaluation {
    const captureSessionIds = uniqueSessionIds(input.captureSessionIds);

    if (captureSessionIds.length !== input.captureSessionIds.length) {
      throw new PaperStrategyEvaluationServiceError(
        "PAPER_STRATEGY_DUPLICATE_CAPTURE_SESSION",
        "Each capture session may appear only once in a paper strategy evaluation.",
        400
      );
    }

    const evaluatedAt = this.now().toISOString();
    const datasets = captureSessionIds.map((sessionId) =>
      this.buildFinalizedDataset(sessionId, evaluatedAt)
    );
    const report = evaluatePaperStrategy({
      evaluationId: `paper-eval-${this.createId()}`,
      evaluatedAt,
      datasets,
      ...(input.config ? { config: input.config } : {}),
      ...(input.thresholdCandidates
        ? { thresholdCandidates: input.thresholdCandidates }
        : {}),
      ...(input.evidenceRequirements
        ? { evidenceRequirements: input.evidenceRequirements }
        : {})
    });

    return savePaperStrategyEvaluation(report);
  }

  getEvaluation(evaluationId: string): StoredPaperStrategyEvaluation | null {
    return getPaperStrategyEvaluation(evaluationId);
  }

  getEvaluations(limit = 50): StoredPaperStrategyEvaluation[] {
    return listPaperStrategyEvaluations(limit);
  }

  getStatus(): PaperStrategyEvaluationStatusView {
    const evaluations = listPaperStrategyEvaluations(1_000);
    const statusCounts: Record<PaperStrategyEvaluationStatus, number> = {
      invalid_dataset: 0,
      data_quality_failed: 0,
      insufficient_evidence: 0,
      holdout_rejected: 0,
      paper_observation_candidate: 0
    };

    for (const evaluation of evaluations) {
      statusCounts[evaluation.evaluationStatus] += 1;
    }

    return {
      evaluationCount: getStorageStats().paperStrategyEvaluationCount,
      latestEvaluation: evaluations[0] ?? null,
      statusCounts,
      contract: getPaperStrategyEvaluationRuntimeContract(),
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    };
  }

  private buildFinalizedDataset(
    sessionId: string,
    generatedAt: string
  ): CalibrationDataset {
    const session = getCalibrationCaptureSession(sessionId);

    if (!session) {
      throw new PaperStrategyEvaluationServiceError(
        "PAPER_STRATEGY_CAPTURE_SESSION_NOT_FOUND",
        `Calibration capture session ${sessionId} was not found.`,
        404
      );
    }

    if (session.status === "interrupted") {
      throw new PaperStrategyEvaluationServiceError(
        "PAPER_STRATEGY_CAPTURE_SESSION_INTERRUPTED",
        `Calibration capture session ${sessionId} was interrupted and is not eligible for evaluation.`,
        409
      );
    }

    if (session.status !== "stopped") {
      throw new PaperStrategyEvaluationServiceError(
        "PAPER_STRATEGY_CAPTURE_SESSION_NOT_FINALIZED",
        `Calibration capture session ${sessionId} must be stopped normally before evaluation.`,
        409
      );
    }

    const observations = listCapturedSignalObservationsBySession(sessionId, {
      limit: session.config.maxObservationsPerSession
    });

    return buildCalibrationDataset({ session, observations, generatedAt });
  }
}

export function createPaperStrategyEvaluationService(
  options: {
    createId?: (() => string) | undefined;
    now?: (() => Date) | undefined;
  } = {}
): PaperStrategyEvaluationService {
  return new PaperStrategyEvaluationService(options);
}

function uniqueSessionIds(sessionIds: readonly string[]): string[] {
  return [...new Set(sessionIds.map((sessionId) => sessionId.trim()))];
}
