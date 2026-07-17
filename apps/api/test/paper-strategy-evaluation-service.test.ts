import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCalibrationCaptureSession,
  createCapturedSignalObservation,
  materializeCapturedSignalOutcome,
  stopCalibrationCaptureSession,
  type CalibrationCaptureSession
} from "@axi/session-capture";
import {
  closeStorage,
  initStorage,
  saveCalibrationCaptureSession,
  saveCapturedSignalObservation
} from "@axi/storage";
import {
  PaperStrategyEvaluationServiceError,
  createPaperStrategyEvaluationService
} from "../src/paper-strategy-evaluation-service";

let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-paper-strategy-eval-"));
  initStorage({ databasePath: join(testDirectory, "axi.sqlite") });
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("PaperStrategyEvaluationService", () => {
  it("evaluates finalized training and temporal holdout sessions", () => {
    persistFinalizedSession({
      sessionId: "capture-train",
      partition: "train",
      count: 120,
      startAt: "2026-01-01T00:00:00.000Z"
    });
    persistFinalizedSession({
      sessionId: "capture-validation",
      partition: "validation",
      count: 60,
      startAt: "2026-01-02T00:00:00.000Z"
    });
    const service = createPaperStrategyEvaluationService({
      createId: () => "test-1",
      now: () => new Date("2026-01-03T00:00:00.000Z")
    });

    const report = service.evaluate({
      captureSessionIds: ["capture-train", "capture-validation"],
      thresholdCandidates: [75]
    });

    expect(report).toMatchObject({
      evaluationId: "paper-eval-test-1",
      evaluationStatus: "paper_observation_candidate",
      selectedThreshold: 75,
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      tradingDisabled: true
    });
    expect(service.getEvaluation(report.evaluationId)).toEqual(report);
    expect(service.getEvaluations()).toHaveLength(1);
    expect(service.getStatus()).toMatchObject({
      evaluationCount: 1,
      latestEvaluation: { evaluationId: report.evaluationId },
      statusCounts: { paper_observation_candidate: 1 },
      automaticPaperTradingActivation: false
    });
  });

  it("rejects active, interrupted, missing, and duplicate sessions", () => {
    const active = createSession(
      "capture-active",
      "train",
      "2026-01-01T00:00:00.000Z"
    );
    saveCalibrationCaptureSession(active);
    const interrupted = createSession(
      "capture-interrupted",
      "train",
      "2026-01-01T00:00:00.000Z"
    );
    saveCalibrationCaptureSession(interrupted);
    saveCalibrationCaptureSession(
      stopCalibrationCaptureSession(interrupted, {
        stoppedAt: "2026-01-01T00:01:00.000Z",
        reason: "test_interrupt",
        interrupted: true
      })
    );
    const service = createPaperStrategyEvaluationService({
      createId: () => "test-2",
      now: () => new Date("2026-01-03T00:00:00.000Z")
    });

    expect(() =>
      service.evaluate({ captureSessionIds: ["capture-active"] })
    ).toThrow(PaperStrategyEvaluationServiceError);
    expect(() =>
      service.evaluate({ captureSessionIds: ["capture-interrupted"] })
    ).toThrow("was interrupted");
    expect(() => service.evaluate({ captureSessionIds: ["missing"] })).toThrow(
      "was not found"
    );
    expect(() =>
      service.evaluate({
        captureSessionIds: ["capture-active", "capture-active"]
      })
    ).toThrow("only once");
  });
});

function persistFinalizedSession(input: {
  sessionId: string;
  partition: "train" | "validation";
  count: number;
  startAt: string;
}): void {
  const session = createSession(
    input.sessionId,
    input.partition,
    input.startAt
  );
  const startMs = Date.parse(input.startAt);
  saveCalibrationCaptureSession(session);

  for (let index = 0; index < input.count; index += 1) {
    const highScore = index % 2 === 0;
    const signalAt = new Date(startMs + index * 2_000).toISOString();
    const outcomeAt = new Date(Date.parse(signalAt) + 1_000).toISOString();
    const captured = createCapturedSignalObservation({
      session,
      snapshot: {
        sourceSnapshotId: index + 1,
        mint: `${input.sessionId}-mint-${index}`,
        evaluatedAt: signalAt,
        ageSeconds: index,
        tradeSampleCount: 3,
        priceSol: 100,
        derivativeScore: {
          totalScore: highScore ? 85 : 20,
          strengthLabel: highScore ? "ripping" : "none",
          policySchemaVersion: 1,
          strategyVersion: "launch-derivative-reference-v1",
          policyStatus: "reference_only",
          calibrated: false,
          confidenceAppliedToSignalScore: false
        }
      },
      capturedAt: signalAt
    });

    if (!captured.accepted) {
      throw new Error(captured.reasonCodes.join(","));
    }

    const closeSol = highScore ? 110 : 98;
    saveCapturedSignalObservation(
      materializeCapturedSignalOutcome({
        observation: captured.observation,
        buckets: [
          {
            bucketStart: signalAt,
            bucketEnd: outcomeAt,
            openSol: 100,
            highSol: highScore ? 112 : 101,
            lowSol: highScore ? 99 : 95,
            closeSol,
            synthetic: false
          }
        ],
        asOf: outcomeAt
      })
    );
  }

  const stoppedAt = new Date(
    startMs + (input.count - 1) * 2_000 + 1_000
  ).toISOString();
  saveCalibrationCaptureSession(
    stopCalibrationCaptureSession(session, {
      stoppedAt,
      reason: "test_complete"
    })
  );
}

function createSession(
  sessionId: string,
  partition: "train" | "validation",
  startedAt: string
): CalibrationCaptureSession {
  return createCalibrationCaptureSession({
    sessionId,
    runtimeSessionId: `runtime-${sessionId}`,
    partition,
    config: {
      horizonMs: 1_000,
      targetReturnPct: 5,
      estimatedCostPct: 1,
      samplingIntervalMs: 1_000,
      maxOutcomeLagMs: 0,
      maxObservationsPerSession: 1_000
    },
    startedAt
  });
}
