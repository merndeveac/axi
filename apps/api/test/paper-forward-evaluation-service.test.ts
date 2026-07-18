import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaperExitPolicyConfig } from "@axi/exit-strategy";
import { defaultPaperLifecycleValidationConfig } from "@axi/paper-lifecycle-validation";
import {
  createPaperAutomationForwardConfig,
  type PaperAutomationDeployment
} from "@axi/paper-automation";
import {
  createPaperOperationsSession,
  transitionPaperOperationsSession
} from "@axi/paper-operations";
import {
  closeStorage,
  initStorage,
  savePaperAutomationDeployment,
  savePaperOperationsSession
} from "@axi/storage";
import {
  createPaperForwardEvaluationService,
  paperForwardEvaluationConfirmation
} from "../src/paper-forward-evaluation-service";

let testDirectory: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-forward-evaluation-"));
  initStorage({ databasePath: join(testDirectory, "axi.sqlite") });
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("PaperForwardEvaluationService", () => {
  it("requires exact confirmation and evaluates every completed session", () => {
    const deployment = savePaperAutomationDeployment(deploymentFixture());
    saveClosedSession(deployment, 1, "completed");
    saveClosedSession(deployment, 2, "completed");
    saveClosedSession(deployment, 3, "interrupted");
    const service = createPaperForwardEvaluationService({
      now: () => new Date("2026-01-08T00:00:00.000Z"),
      createId: () => "test-id"
    });

    expect(() =>
      service.evaluate({
        deploymentId: deployment.deploymentId,
        evaluatedBy: "operator",
        confirmation: "wrong"
      })
    ).toThrow("Exact confirmation required");

    const evaluation = service.evaluate({
      deploymentId: deployment.deploymentId,
      evaluatedBy: "operator",
      confirmation: paperForwardEvaluationConfirmation(deployment.deploymentId)
    });

    expect(evaluation).toMatchObject({
      evaluationId: `paper-forward-evaluation-${deployment.deploymentId}-test-id`,
      evaluationStatus: "operational_rejected",
      sessionIds: ["forward-session-1", "forward-session-2"],
      evidenceAudit: {
        completedSessionCount: 2,
        excludedInterruptedSessionCount: 1,
        excludedInterruptedSessionIds: ["forward-session-3"]
      },
      automaticLivePromotion: false,
      automaticLiveExecution: false,
      privateKeyAccess: false,
      transactionSigning: false,
      liveExecutionDisabled: true
    });
    expect(service.getStatus()).toMatchObject({
      completedSessionCount: 2,
      interruptedSessionCount: 1,
      activeSessionCount: 0,
      evaluationCount: 1,
      latestEvaluation: {
        evaluationId: evaluation.evaluationId
      }
    });
  });

  it("refuses to evaluate while the deployment has an active session", () => {
    const deployment = savePaperAutomationDeployment(deploymentFixture());
    const active = createPaperOperationsSession({
      sessionId: "forward-active",
      deploymentId: deployment.deploymentId,
      deploymentStatus: deployment.status,
      runtimeSessionId: "runtime-active",
      startedBy: "operator",
      startedAt: "2026-01-05T00:00:00.000Z"
    });
    savePaperOperationsSession(active);
    const service = createPaperForwardEvaluationService();

    expect(() =>
      service.evaluate({
        deploymentId: deployment.deploymentId,
        evaluatedBy: "operator",
        confirmation: paperForwardEvaluationConfirmation(
          deployment.deploymentId
        )
      })
    ).toThrow("End or interrupt the active forward session");
  });
});

function saveClosedSession(
  deployment: PaperAutomationDeployment,
  sequence: number,
  status: "completed" | "interrupted"
) {
  const startedAt = `2026-01-0${sequence + 4}T00:00:00.000Z`;
  const session = createPaperOperationsSession({
    sessionId: `forward-session-${sequence}`,
    deploymentId: deployment.deploymentId,
    deploymentStatus: deployment.status,
    runtimeSessionId: `runtime-${sequence}`,
    startedBy: "operator",
    startedAt
  });
  savePaperOperationsSession(session);
  return savePaperOperationsSession(
    transitionPaperOperationsSession({
      session,
      status,
      at: `2026-01-0${sequence + 4}T01:00:00.000Z`,
      reason: "test closed",
      reasonCodes: ["TEST_SESSION_CLOSED"]
    })
  );
}

function deploymentFixture(): PaperAutomationDeployment {
  return {
    schemaVersion: 1,
    automationVersion: "paper-automation-v1",
    deploymentId: "deployment-forward-service-test",
    validationId: "validation-forward-service-test",
    validationVersion: "paper-lifecycle-validation-v1",
    strategyEvaluationId: "strategy-forward-service-test",
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
