import { randomUUID } from "node:crypto";
import type { PaperExitPolicyConfigInput } from "@axi/exit-strategy";
import {
  evaluatePaperLifecycleValidation,
  getPaperLifecycleValidationRuntimeContract,
  type PaperLifecycleReplayCase,
  type PaperLifecycleValidationConfigInput,
  type PaperLifecycleValidationStatus
} from "@axi/paper-lifecycle-validation";
import {
  getCalibrationCaptureSession,
  getPaperLifecycleValidation,
  getPaperStrategyEvaluation,
  getStorageStats,
  listCapturedSignalObservationsBySession,
  listLaunchTimeseriesBucketsByMintBetween,
  listPaperLifecycleValidations,
  savePaperLifecycleValidation,
  type StoredPaperLifecycleValidation,
  type StoredPaperStrategyEvaluation
} from "@axi/storage";

export type PaperLifecycleValidationInput = {
  paperStrategyEvaluationId: string;
  config?: PaperLifecycleValidationConfigInput | undefined;
  exitPolicyConfig?: PaperExitPolicyConfigInput | undefined;
};

export type PaperLifecycleValidationStatusView = {
  validationCount: number;
  latestValidation: StoredPaperLifecycleValidation | null;
  statusCounts: Record<PaperLifecycleValidationStatus, number>;
  contract: ReturnType<typeof getPaperLifecycleValidationRuntimeContract>;
  automaticThresholdActivation: false;
  automaticPaperTradingActivation: false;
  automaticLiveExecution: false;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
};

export class PaperLifecycleValidationServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "PaperLifecycleValidationServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class PaperLifecycleValidationService {
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

  evaluate(
    input: PaperLifecycleValidationInput
  ): StoredPaperLifecycleValidation {
    const upstream = requireEligibleStrategyEvaluation(
      input.paperStrategyEvaluationId
    );
    const evaluatedAt = this.now().toISOString();
    const report = evaluatePaperLifecycleValidation({
      validationId: `paper-lifecycle-${this.createId()}`,
      evaluatedAt,
      strategyProvenance: {
        evaluationId: upstream.evaluationId,
        evaluationVersion: upstream.evaluationVersion,
        evaluationStatus: upstream.evaluationStatus,
        selectedThreshold: upstream.selectedThreshold,
        captureSessionIds: upstream.captureSessionIds,
        expectedObservationCount:
          upstream.datasetAudit.completedObservationCount
      },
      cases: buildPaperLifecycleReplayCases(upstream),
      ...(input.config ? { config: input.config } : {}),
      ...(input.exitPolicyConfig
        ? { exitPolicyConfig: input.exitPolicyConfig }
        : {})
    });

    return savePaperLifecycleValidation(report);
  }

  getValidation(validationId: string): StoredPaperLifecycleValidation | null {
    return getPaperLifecycleValidation(validationId);
  }

  getValidations(limit = 50): StoredPaperLifecycleValidation[] {
    return listPaperLifecycleValidations(limit);
  }

  getStatus(): PaperLifecycleValidationStatusView {
    const validations = listPaperLifecycleValidations(1_000);
    const statusCounts: Record<PaperLifecycleValidationStatus, number> = {
      invalid_input: 0,
      data_quality_failed: 0,
      insufficient_evidence: 0,
      holdout_rejected: 0,
      paper_automation_candidate: 0
    };

    for (const validation of validations) {
      statusCounts[validation.validationStatus] += 1;
    }

    return {
      validationCount: getStorageStats().paperLifecycleValidationCount,
      latestValidation: validations[0] ?? null,
      statusCounts,
      contract: getPaperLifecycleValidationRuntimeContract(),
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      automaticLiveExecution: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    };
  }
}

export function createPaperLifecycleValidationService(
  options: {
    createId?: (() => string) | undefined;
    now?: (() => Date) | undefined;
  } = {}
): PaperLifecycleValidationService {
  return new PaperLifecycleValidationService(options);
}

export function requireEligibleStrategyEvaluation(
  evaluationId: string
): StoredPaperStrategyEvaluation & {
  evaluationStatus: "paper_observation_candidate";
  selectedThreshold: number;
} {
  const evaluation = getPaperStrategyEvaluation(evaluationId);

  if (!evaluation) {
    throw new PaperLifecycleValidationServiceError(
      "PAPER_LIFECYCLE_STRATEGY_EVALUATION_NOT_FOUND",
      `Paper strategy evaluation ${evaluationId} was not found.`,
      404
    );
  }

  if (
    evaluation.evaluationStatus !== "paper_observation_candidate" ||
    evaluation.selectedThreshold === null
  ) {
    throw new PaperLifecycleValidationServiceError(
      "PAPER_LIFECYCLE_UPSTREAM_NOT_ELIGIBLE",
      `Paper strategy evaluation ${evaluationId} has not passed its temporal holdout.`,
      409
    );
  }

  return evaluation as StoredPaperStrategyEvaluation & {
    evaluationStatus: "paper_observation_candidate";
    selectedThreshold: number;
  };
}

export function buildPaperLifecycleReplayCases(
  upstream: StoredPaperStrategyEvaluation
): PaperLifecycleReplayCase[] {
  const cases: PaperLifecycleReplayCase[] = [];

  for (const sessionId of upstream.captureSessionIds) {
    const session = getCalibrationCaptureSession(sessionId);

    if (!session) {
      throw new PaperLifecycleValidationServiceError(
        "PAPER_LIFECYCLE_CAPTURE_SESSION_NOT_FOUND",
        `Calibration capture session ${sessionId} was not found.`,
        404
      );
    }

    if (session.status !== "stopped") {
      throw new PaperLifecycleValidationServiceError(
        "PAPER_LIFECYCLE_CAPTURE_SESSION_NOT_FINALIZED",
        `Calibration capture session ${sessionId} must be stopped normally before lifecycle validation.`,
        409
      );
    }

    const observations = listCapturedSignalObservationsBySession(sessionId, {
      limit: session.config.maxObservationsPerSession
    });

    for (const observation of observations) {
      if (observation.partition !== session.partition) {
        throw new PaperLifecycleValidationServiceError(
          "PAPER_LIFECYCLE_PARTITION_MISMATCH",
          `Captured observation ${observation.observationId} does not match session ${sessionId}'s partition.`,
          409
        );
      }
      if (
        observation.status !== "complete" ||
        !observation.outcomeAt ||
        observation.outcomePriceSol === null
      ) {
        throw new PaperLifecycleValidationServiceError(
          "PAPER_LIFECYCLE_OBSERVATION_NOT_FINALIZED",
          `Captured observation ${observation.observationId} is not complete and cannot be replayed.`,
          409
        );
      }

      const buckets = listLaunchTimeseriesBucketsByMintBetween(
        observation.mint,
        observation.signalAt,
        observation.outcomeAt
      );

      cases.push({
        observationId: observation.observationId,
        captureSessionId: sessionId,
        partition: observation.partition,
        mint: observation.mint,
        signalAt: observation.signalAt,
        outcomeAt: observation.outcomeAt,
        score: observation.score,
        entryPriceSol: observation.entryPriceSol,
        points: buckets.map((bucket) => ({
          at: bucket.bucketEnd,
          priceSol: bucket.closeSol ?? Number.NaN,
          volumeSol: bucket.volumeSol,
          buyVolumeSol: bucket.buyVolumeSol,
          sellVolumeSol: bucket.sellVolumeSol,
          buyCount: bucket.buyCount,
          sellCount: bucket.sellCount,
          synthetic: bucket.synthetic,
          source: "canonical_one_second_bucket"
        }))
      });
    }
  }

  return cases.sort(
    (left, right) =>
      Date.parse(left.signalAt) - Date.parse(right.signalAt) ||
      left.observationId.localeCompare(right.observationId)
  );
}
