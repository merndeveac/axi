import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FeedEvent } from "@axi/data-feeds";
import type {
  ChainTransactionEvent,
  NormalizedChainTradeEvent
} from "@axi/chain-events";
import type { MarketObservation } from "@axi/market-data";
import type {
  CandidateDecision,
  OverlaySignal,
  RiskSnapshot
} from "@axi/shared";
import type { CalibrationDataset } from "@axi/session-capture";
import {
  createCalibrationCaptureSession,
  createCapturedSignalObservation,
  materializeCapturedSignalOutcome,
  stopCalibrationCaptureSession
} from "@axi/session-capture";
import { evaluatePaperStrategy } from "@axi/paper-strategy-evaluation";
import {
  defaultPaperLifecycleValidationConfig,
  evaluatePaperLifecycleValidation
} from "@axi/paper-lifecycle-validation";
import {
  createPaperExitPolicyConfig,
  evaluatePaperExitPolicy
} from "@axi/exit-strategy";
import {
  createPaperAutomationForwardConfig,
  transitionPaperAutomationDeployment,
  type PaperAutomationDeployment,
  type PaperAutomationEvent,
  type PaperAutomationOperation
} from "@axi/paper-automation";
import {
  createPaperOperationsSession,
  createPaperOperationsSnapshot,
  evaluatePaperOperationsAlerts,
  transitionPaperOperationsSession
} from "@axi/paper-operations";
import { normalizePumpPortalIdentity } from "@axi/token-identity";
import {
  closeStorage,
  createReplayStream,
  deleteExitRule,
  deleteWatchedWallet,
  getExitRule,
  getPumpPortalTokenTradeEvent,
  getTokenIdentity,
  getChainTradeEvent,
  getChainTransactionEvent,
  getLatestChainVerification,
  getActiveCalibrationCaptureSessionForRuntime,
  getCalibrationCaptureSession,
  getCalibrationCaptureObservationCounts,
  getCapturedSignalObservation,
  getLatestCapturedSignalObservationByMint,
  getPaperStrategyEvaluation,
  getPaperLifecycleValidation,
  getLatestPaperAutomationDeployment,
  getPaperAutomationEvent,
  getPaperAutomationOperation,
  getActivePaperOperationsSession,
  getPaperOperationsAlert,
  getPaperOperationsSession,
  getPaperOperationsSnapshot,
  getPaperExitPolicyEvaluation,
  getLatestCandidateDecision,
  getLatestMarketObservation,
  getMarketObservation,
  getLatestRiskSnapshot,
  getLatestWatchPlan,
  getLightningTradePlan,
  listLiveFeedEvents,
  listLiveFeedEventsByMint,
  listLiveFeedEventsBySession,
  listLightningTradePlans,
  listLightningTradePlansByMint,
  listLaunchCandidates,
  listLaunchScoreSnapshots,
  listLaunchScoreSnapshotsByMint,
  listLaunchTimeseriesBucketsByMint,
  listLaunchTimeseriesBucketsByMintBetween,
  listLaunchTrackingEvents,
  listLaunchTrackingSessions,
  listCalibrationCaptureSessions,
  listCapturedSignalObservationsBySession,
  listPaperStrategyEvaluations,
  listPaperLifecycleValidations,
  listPaperAutomationEvents,
  listPaperAutomationOperations,
  listPaperOperationsAlerts,
  listPaperOperationsSessions,
  listPaperOperationsSnapshots,
  listPaperExitPolicyEvaluations,
  listPaperExitPolicyEvaluationsByMint,
  listLaunchTradeSamplesByMint,
  listMeteredLaunchDataEvents,
  listMeteredLaunchDataEventsByMint,
  listMeteredLaunchDataSessions,
  listMeteredLaunchDataSubscriptions,
  listMeteredLaunchDataSubscriptionsByMint,
  listOperatorActions,
  listPumpPortalWalletStatusSnapshots,
  listExitRules,
  listExitSignals,
  listExitSignalsByMint,
  getStorageStats,
  getLaunchCandidate,
  initStorage,
  initStorageReadOnly,
  listCandidateDecisionsForReplay,
  listCapacitySnapshots,
  listChainVerifications,
  listChainVerificationsForReplay,
  listChainTradeEvents,
  listChainTradeEventsForReplay,
  listChainTransactionEvents,
  listChainTransactionEventsForReplay,
  listCandidateDecisions,
  listFeedEvents,
  listMarketObservations,
  listMarketObservationsByMint,
  listMarketObservationsForReplay,
  listActualDataSessions,
  listActualDataSubscriptions,
  listActualDataSubscriptionsByMint,
  listPumpPortalTokenTradeEvents,
  listPumpPortalTokenTradeEventsByMint,
  listPumpPortalTokenTradeEventsForReplay,
  listPaperOrders,
  listPaperPortfolioFills,
  listPaperPortfolioOrders,
  listPaperPortfolioPositions,
  listPaperPortfolioSnapshots,
  listPaperPositions,
  listRecentSignals,
  listRiskSnapshotsForReplay,
  listRiskSnapshots,
  listRuntimeSessions,
  listSignalsForReplay,
  listTokenIdentities,
  listTokenIdentitiesForReplay,
  listTokenMetadataFetches,
  listTokenMetadataFetchesByMint,
  listTokenMetadataFetchesForReplay,
  listUnresolvedTokenIdentities,
  listWatchActions,
  listWatchActionsByMint,
  listWatchActionsForReplay,
  listWatchedWallets,
  listWatchedWalletTradeEvents,
  listWatchedWalletTradeEventsByMint,
  listWatchedWalletTradeEventsByWallet,
  listWatchPlans,
  listWatchPlansForReplay,
  saveCandidateDecision,
  saveCalibrationCaptureSession,
  saveCapturedSignalObservation,
  savePaperStrategyEvaluation,
  savePaperLifecycleValidation,
  savePaperAutomationDeployment,
  savePaperAutomationEvent,
  savePaperAutomationOperation,
  savePaperOperationsAlert,
  savePaperOperationsSession,
  savePaperOperationsSnapshot,
  savePaperExitPolicyEvaluation,
  saveCapacitySnapshot,
  saveChainVerification,
  saveChainTradeEvent,
  saveChainTransactionEvent,
  saveFeedEvent,
  saveLiveFeedEvent,
  saveLightningTradePlan,
  saveExitRule,
  saveExitSignal,
  saveLaunchCandidate,
  saveLaunchScoreSnapshot,
  upsertLaunchTimeseriesBucket,
  saveLaunchTrackingEvent,
  saveLaunchTrackingSession,
  saveLaunchTradeSample,
  saveMarketObservation,
  saveMeteredLaunchDataEvent,
  saveMeteredLaunchDataSession,
  saveMeteredLaunchDataSubscription,
  saveOperatorAction,
  saveRuntimeSession,
  saveActualDataSession,
  saveActualDataSubscription,
  savePaperOrder,
  savePaperPortfolioFill,
  savePaperPortfolioOrder,
  savePaperPortfolioSnapshot,
  savePumpPortalWalletStatusSnapshot,
  savePumpPortalTokenTradeEvent,
  saveRiskSnapshot,
  saveSignal,
  saveWatchedWallet,
  saveWatchedWalletTradeEvent,
  saveTokenIdentity,
  saveTokenMetadataFetch,
  saveWatchAction,
  saveWatchPlan,
  upsertTokenIdentity,
  getPaperPortfolioPosition,
  upsertPaperPortfolioPosition,
  upsertPaperPosition
} from "../src/index";

const mint = "MockMint9999111111111111111111111111111111";

function createPaperAutomationDeploymentFixture(): PaperAutomationDeployment {
  return {
    schemaVersion: 1,
    automationVersion: "paper-automation-v1",
    deploymentId: "paper-automation-storage-test",
    validationId: "paper-lifecycle-candidate-test",
    validationVersion: "paper-lifecycle-validation-v1",
    strategyEvaluationId: "paper-evaluation-candidate-test",
    strategyEvaluationVersion: "paper-strategy-evaluation-v1",
    selectedThreshold: 75,
    exitPolicyVersion: "paper-exit-policy-v1",
    executionConfig: defaultPaperLifecycleValidationConfig,
    exitPolicyConfig: createPaperExitPolicyConfig(),
    validationExpectancyPct: 10,
    validationConfidenceLowerBoundPct: 5,
    forwardStartingEquitySol: 1,
    forwardConfig: createPaperAutomationForwardConfig(),
    approvedBy: "storage-test-operator",
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

function createPaperAutomationEventFixture(): PaperAutomationEvent {
  return {
    schemaVersion: 1,
    eventId: "paper-automation-event-storage-test",
    deploymentId: "paper-automation-storage-test",
    operationId: null,
    kind: "approved",
    mint: null,
    observedAt: "2026-01-04T00:00:00.000Z",
    orderId: null,
    fillId: null,
    entryFeeSol: null,
    positionSizeSol: null,
    realizedPnlSol: null,
    positionClosed: null,
    reasonCodes: ["PAPER_AUTOMATION_OPERATOR_APPROVED"],
    payload: {},
    paperOnly: true,
    liveExecutionDisabled: true
  };
}

function createPaperAutomationOperationFixture(): PaperAutomationOperation {
  return {
    schemaVersion: 1,
    operationId: "paper-automation-operation-storage-test",
    deploymentId: "paper-automation-storage-test",
    kind: "entry",
    status: "pending",
    mint,
    signalScore: 80,
    signalHardReject: false,
    signalAt: "2026-01-04T00:01:00.000Z",
    executeAfter: "2026-01-04T00:01:01.000Z",
    expiresAt: "2026-01-04T00:01:06.000Z",
    exitEvaluationId: null,
    reasonCodes: ["PAPER_AUTOMATION_ENTRY_SCHEDULED"],
    createdAt: "2026-01-04T00:01:00.000Z",
    updatedAt: "2026-01-04T00:01:00.000Z",
    paperOnly: true,
    liveExecutionDisabled: true
  };
}

let testDirectory: string;
let databasePath: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-storage-"));
  databasePath = join(testDirectory, "axi.sqlite");
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("@axi/storage", () => {
  it("database initializes", () => {
    const handle = initStorage({ databasePath });
    const stats = getStorageStats();

    expect(handle.databasePath).toBe(databasePath);
    expect(stats.databasePath).toBe(databasePath);
    expect(stats.signalCount).toBe(0);
    expect(stats.liveFeedEventCount).toBe(0);
    expect(stats.chainVerificationCount).toBe(0);
    expect(stats.chainTransactionEventCount).toBe(0);
    expect(stats.chainTradeEventCount).toBe(0);
    expect(stats.marketObservationCount).toBe(0);
    expect(stats.watchPlanCount).toBe(0);
    expect(stats.watchActionCount).toBe(0);
    expect(stats.lightningTradePlanCount).toBe(0);
    expect(stats.runtimeSessionCount).toBe(0);
    expect(stats.operatorActionCount).toBe(0);
    expect(stats.capacitySnapshotCount).toBe(0);
    expect(stats.calibrationCaptureSessionCount).toBe(0);
    expect(stats.calibrationSignalObservationCount).toBe(0);
    expect(stats.paperStrategyEvaluationCount).toBe(0);
    expect(stats.paperLifecycleValidationCount).toBe(0);
    expect(stats.paperExitPolicyEvaluationCount).toBe(0);
    expect(stats.pumpPortalWalletStatusSnapshotCount).toBe(0);
    expect(stats.meteredLaunchDataSessionCount).toBe(0);
    expect(stats.meteredLaunchDataSubscriptionCount).toBe(0);
    expect(stats.meteredLaunchDataEventCount).toBe(0);
    expect(stats.launchCandidateCount).toBe(0);
    expect(stats.launchTradeSampleCount).toBe(0);
    expect(stats.launchTimeseriesBucketCount).toBe(0);
    expect(stats.launchScoreSnapshotCount).toBe(0);
    expect(stats.launchTrackingEventCount).toBe(0);
    expect(stats.launchTrackingSessionCount).toBe(0);
    expect(stats.riskSnapshotCount).toBe(0);
    expect(stats.candidateDecisionCount).toBe(0);
    expect(stats.paperPortfolioOrderCount).toBe(0);
    expect(stats.paperPortfolioFillCount).toBe(0);
    expect(stats.paperPortfolioPositionCount).toBe(0);
    expect(stats.paperPortfolioSnapshotCount).toBe(0);
    expect(stats.watchedWalletCount).toBe(0);
    expect(stats.watchedWalletTradeEventCount).toBe(0);
    expect(stats.exitRuleCount).toBe(0);
    expect(stats.exitSignalCount).toBe(0);
  });

  it("persists idempotent runtime sessions and sanitized operator actions", () => {
    initStorage({ databasePath });
    const startedAt = "2026-07-16T00:00:00.000Z";

    saveRuntimeSession({
      sessionId: "runtime-test",
      runtimeMode: "live",
      paidDataArmed: false,
      startedAt,
      configFingerprint: "safe-fingerprint"
    });
    saveRuntimeSession({
      sessionId: "runtime-test",
      runtimeMode: "live",
      paidDataArmed: true,
      startedAt,
      configFingerprint: "safe-fingerprint"
    });
    saveOperatorAction({
      actionId: "runtime-test:1",
      action: "POST",
      target: "/runtime/metered-launch-data/start",
      safeParameters: {
        mint,
        apiKey: "must-not-persist",
        nested: { privateKey: "must-not-persist" }
      },
      outcome: "succeeded",
      reasonCodes: ["LOCAL_MUTATION_ALLOWED"]
    });
    saveOperatorAction({
      actionId: "runtime-test:1",
      action: "POST",
      target: "/runtime/metered-launch-data/start",
      outcome: "failed",
      reasonCodes: ["DUPLICATE_ATTEMPT"]
    });

    expect(listRuntimeSessions()).toEqual([
      expect.objectContaining({
        sessionId: "runtime-test",
        paidDataArmed: true
      })
    ]);
    expect(listOperatorActions()).toEqual([
      expect.objectContaining({
        actionId: "runtime-test:1",
        outcome: "succeeded",
        safeParameters: {
          mint,
          apiKey: "[redacted]",
          nested: { privateKey: "[redacted]" }
        }
      })
    ]);

    closeStorage();
    initStorage({ databasePath });
    expect(getStorageStats()).toEqual(
      expect.objectContaining({
        runtimeSessionCount: 1,
        operatorActionCount: 1
      })
    );
  });

  it("persists capture sessions and immutable forward observations", () => {
    initStorage({ databasePath });
    const session = createCalibrationCaptureSession({
      sessionId: "capture-storage-test",
      runtimeSessionId: "runtime-storage-test",
      partition: "train",
      config: {
        horizonMs: 1_000,
        maxOutcomeLagMs: 1_000,
        samplingIntervalMs: 1_000
      },
      startedAt: "2026-01-01T00:00:00.000Z"
    });
    saveCalibrationCaptureSession(session);
    saveCalibrationCaptureSession(session);

    const captured = createCapturedSignalObservation({
      session,
      snapshot: {
        sourceSnapshotId: 91,
        mint,
        evaluatedAt: "2026-01-01T00:00:00.000Z",
        ageSeconds: 10,
        tradeSampleCount: 3,
        priceSol: 100,
        derivativeScore: {
          totalScore: 65,
          strengthLabel: "hot",
          policySchemaVersion: 1,
          strategyVersion: "launch-derivative-reference-v1",
          policyStatus: "reference_only",
          calibrated: false,
          confidenceAppliedToSignalScore: false
        }
      },
      capturedAt: "2026-01-01T00:00:00.500Z"
    });

    if (!captured.accepted) {
      throw new Error(captured.reasonCodes.join(","));
    }

    saveCapturedSignalObservation(captured.observation);
    saveCapturedSignalObservation(captured.observation);
    const completed = materializeCapturedSignalOutcome({
      observation: captured.observation,
      buckets: [
        {
          bucketStart: "2026-01-01T00:00:00.000Z",
          bucketEnd: "2026-01-01T00:00:01.000Z",
          openSol: 100,
          highSol: 130,
          lowSol: 90,
          closeSol: 125,
          synthetic: false
        }
      ],
      asOf: "2026-01-01T00:00:01.000Z"
    });
    saveCapturedSignalObservation(completed);

    expect(getCalibrationCaptureSession(session.sessionId)).toMatchObject({
      status: "active",
      partition: "train"
    });
    expect(
      getActiveCalibrationCaptureSessionForRuntime(session.runtimeSessionId)
    ).toMatchObject({ sessionId: session.sessionId });
    expect(listCalibrationCaptureSessions()).toHaveLength(1);
    expect(getCapturedSignalObservation(completed.observationId)).toMatchObject(
      {
        status: "complete",
        outcomePriceSol: 125,
        forwardReturnPct: 25
      }
    );
    expect(
      getLatestCapturedSignalObservationByMint(session.sessionId, mint)
    ).toMatchObject({ observationId: completed.observationId });
    expect(
      listCapturedSignalObservationsBySession(session.sessionId, {
        status: "complete"
      })
    ).toHaveLength(1);
    expect(getCalibrationCaptureObservationCounts(session.sessionId)).toEqual({
      observationCount: 1,
      completedCount: 1,
      pendingCount: 0,
      unavailableCount: 0
    });
    expect(() =>
      saveCapturedSignalObservation({
        ...completed,
        mint: "DifferentMint111111111111111111111111111111"
      })
    ).toThrow("immutable fields do not match");
    expect(() =>
      saveCapturedSignalObservation({
        ...completed,
        score: completed.score + 1
      })
    ).toThrow("immutable fields do not match");
    expect(() =>
      saveCalibrationCaptureSession({
        ...session,
        partition: "validation"
      })
    ).toThrow("immutable fields do not match");

    saveCalibrationCaptureSession(
      stopCalibrationCaptureSession(session, {
        stoppedAt: "2026-01-01T00:01:00.000Z",
        reason: "test_complete"
      })
    );
    expect(() => saveCalibrationCaptureSession(session)).toThrow(
      "cannot change after it is closed"
    );
    expect(
      getActiveCalibrationCaptureSessionForRuntime(session.runtimeSessionId)
    ).toBeNull();
    expect(getStorageStats()).toMatchObject({
      calibrationCaptureSessionCount: 1,
      calibrationSignalObservationCount: 1
    });

    closeStorage();
    initStorageReadOnly({ databasePath });
    expect(getCapturedSignalObservation(completed.observationId)).toMatchObject(
      {
        status: "complete",
        targetReached: false
      }
    );
    expect(() =>
      saveCalibrationCaptureSession({
        ...session,
        sessionId: "capture-readonly-test"
      })
    ).toThrow();
  });

  it("persists immutable paper strategy evaluation reports", () => {
    initStorage({ databasePath });
    const report = evaluatePaperStrategy({
      evaluationId: "paper-evaluation-storage-test",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      datasets: [
        createPaperEvaluationDataset("train", "2026-01-01T00:00:00.000Z"),
        createPaperEvaluationDataset("validation", "2026-01-02T00:00:00.000Z")
      ],
      thresholdCandidates: [75]
    });

    savePaperStrategyEvaluation(report);
    savePaperStrategyEvaluation(report);

    expect(getPaperStrategyEvaluation(report.evaluationId)).toMatchObject({
      evaluationStatus: "insufficient_evidence",
      selectedThreshold: null,
      automaticPaperTradingActivation: false
    });
    expect(listPaperStrategyEvaluations()).toHaveLength(1);
    expect(getStorageStats().paperStrategyEvaluationCount).toBe(1);
    expect(() =>
      savePaperStrategyEvaluation({
        ...report,
        evaluatedAt: "2026-01-03T00:00:01.000Z"
      })
    ).toThrow("immutable");

    closeStorage();
    initStorageReadOnly({ databasePath });
    expect(getPaperStrategyEvaluation(report.evaluationId)).toMatchObject({
      evaluationVersion: "paper-strategy-evaluation-v1",
      tradingDisabled: true
    });
  });

  it("persists immutable paper lifecycle validation reports", () => {
    initStorage({ databasePath });
    const report = evaluatePaperLifecycleValidation({
      validationId: "paper-lifecycle-storage-test",
      evaluatedAt: "2026-01-03T00:00:00.000Z",
      strategyProvenance: {
        evaluationId: "paper-evaluation-upstream-test",
        evaluationVersion: "paper-strategy-evaluation-v1",
        evaluationStatus: "paper_observation_candidate",
        selectedThreshold: 75,
        captureSessionIds: ["capture-train", "capture-validation"],
        expectedObservationCount: 0
      },
      cases: []
    });

    savePaperLifecycleValidation(report);
    savePaperLifecycleValidation(report);

    expect(getPaperLifecycleValidation(report.validationId)).toMatchObject({
      validationStatus: "invalid_input",
      selectedThreshold: 75,
      automaticPaperTradingActivation: false
    });
    expect(listPaperLifecycleValidations()).toHaveLength(1);
    expect(getStorageStats().paperLifecycleValidationCount).toBe(1);
    expect(() =>
      savePaperLifecycleValidation({
        ...report,
        evaluatedAt: "2026-01-03T00:00:01.000Z"
      })
    ).toThrow("immutable");

    closeStorage();
    initStorageReadOnly({ databasePath });
    expect(getPaperLifecycleValidation(report.validationId)).toMatchObject({
      validationVersion: "paper-lifecycle-validation-v1",
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
  });

  it("persists restart-safe paper automation state and immutable audit events", () => {
    initStorage({ databasePath });
    const approved = createPaperAutomationDeploymentFixture();
    savePaperAutomationDeployment(approved);
    const armed = transitionPaperAutomationDeployment({
      deployment: approved,
      status: "armed",
      at: "2026-01-04T00:01:00.000Z",
      reasonCodes: ["PAPER_AUTOMATION_OPERATOR_ARMED"]
    });
    savePaperAutomationDeployment(armed);

    const event = createPaperAutomationEventFixture();
    savePaperAutomationEvent(event);
    savePaperAutomationEvent(event);
    expect(() =>
      savePaperAutomationEvent({
        ...event,
        reasonCodes: ["MUTATED"]
      })
    ).toThrow("immutable");

    const pending = createPaperAutomationOperationFixture();
    savePaperAutomationOperation(pending);
    savePaperAutomationOperation({
      ...pending,
      status: "executed",
      updatedAt: "2026-01-04T00:01:02.000Z",
      reasonCodes: [...pending.reasonCodes, "PAPER_AUTOMATION_ENTRY_EXECUTED"]
    });
    expect(() => savePaperAutomationOperation(pending)).toThrow(
      "cannot transition"
    );
    expect(() =>
      savePaperAutomationDeployment({
        ...armed,
        selectedThreshold: 99,
        updatedAt: "2026-01-04T00:02:00.000Z"
      })
    ).toThrow("immutable pinned fields");

    expect(getStorageStats()).toMatchObject({
      paperAutomationDeploymentCount: 1,
      paperAutomationEventCount: 1,
      paperAutomationOperationCount: 1
    });
    expect(listPaperAutomationEvents(approved.deploymentId)).toHaveLength(1);
    expect(listPaperAutomationOperations(approved.deploymentId)).toHaveLength(
      1
    );
    expect(getPaperAutomationEvent(event.eventId)).toMatchObject(event);
    expect(getPaperAutomationOperation(pending.operationId)).toMatchObject({
      status: "executed"
    });

    closeStorage();
    initStorageReadOnly({ databasePath });
    expect(getLatestPaperAutomationDeployment()).toMatchObject({
      deploymentId: approved.deploymentId,
      status: "armed",
      liveExecutionDisabled: true
    });
  });

  it("persists immutable paper operations evidence and restart-safe sessions", () => {
    initStorage({ databasePath });
    const deployment = createPaperAutomationDeploymentFixture();
    savePaperAutomationDeployment(deployment);
    const session = createPaperOperationsSession({
      sessionId: "paper-forward-storage-test",
      deploymentId: deployment.deploymentId,
      deploymentStatus: deployment.status,
      runtimeSessionId: "runtime-storage-test",
      startedBy: "storage-test-operator",
      startedAt: "2026-01-05T00:00:00.000Z"
    });
    savePaperOperationsSession(session);
    expect(getActivePaperOperationsSession()?.sessionId).toBe(session.sessionId);

    const snapshot = createPaperOperationsSnapshot(session, {
      sampleId: "paper-operations-snapshot-storage-test",
      sessionId: session.sessionId,
      deploymentId: session.deploymentId,
      runtimeSessionId: session.runtimeSessionId,
      kind: "runtime_sample",
      observedAt: "2026-01-05T00:00:01.000Z",
      meteredActive: true,
      feedConnected: true,
      lastEventAt: "2026-01-05T00:00:00.000Z",
      trackedMintCount: 1,
      meteredEventCount: 100,
      estimatedCostSol: 0.001,
      budgetReached: true,
      dataWalletBalanceSol: 1,
      dataWalletBalanceStatus: "ok",
      signalMint: null,
      signalAt: null,
      signalLatencyMs: null,
      automationStatus: "approved",
      automationHealthy: true,
      pendingOperationCount: 0,
      closedTradeCount: 0,
      winCount: 0,
      totalNetPnlSol: 0,
      maximumDrawdownPct: 0,
      timeseriesAcceptedEventCount: 100,
      timeseriesDuplicateEventCount: 0,
      timeseriesInvalidEventCount: 0,
      timeseriesLateEventCount: 0,
      timeseriesGapCount: 0,
      storageWriteHealthy: true,
      reasonCodes: [],
      payload: {}
    });
    savePaperOperationsSnapshot(snapshot);
    savePaperOperationsSnapshot(snapshot);
    const alertCandidate = evaluatePaperOperationsAlerts({
      session,
      snapshot
    }).alerts.find(
      (alert) => alert.code === "PAPER_OPERATIONS_BUDGET_EXCEEDED"
    );
    expect(alertCandidate).toBeDefined();
    const alert = {
      ...alertCandidate!,
      alertId: "paper-operations-alert-storage-test"
    };
    savePaperOperationsAlert(alert);
    expect(() =>
      savePaperOperationsSnapshot({
        ...snapshot,
        estimatedCostSol: 0
      })
    ).toThrow("immutable");

    const completed = transitionPaperOperationsSession({
      session,
      status: "completed",
      at: "2026-01-05T00:01:00.000Z",
      reason: "storage test complete",
      reasonCodes: ["PAPER_OPERATIONS_OPERATOR_COMPLETED"]
    });
    savePaperOperationsSession(completed);
    expect(() =>
      savePaperOperationsSession({
        ...completed,
        startedBy: "mutated"
      })
    ).toThrow("immutable pinned fields");

    expect(getStorageStats()).toMatchObject({
      paperOperationsSessionCount: 1,
      paperOperationsSnapshotCount: 1,
      paperOperationsAlertCount: 1
    });
    expect(listPaperOperationsSessions()).toHaveLength(1);
    expect(listPaperOperationsSnapshots(session.sessionId)).toHaveLength(1);
    expect(listPaperOperationsAlerts(session.sessionId)).toHaveLength(1);
    expect(getPaperOperationsSession(session.sessionId)?.status).toBe(
      "completed"
    );
    expect(getPaperOperationsSnapshot(snapshot.sampleId)).toMatchObject(snapshot);
    expect(getPaperOperationsAlert(alert.alertId)).toMatchObject(alert);

    closeStorage();
    initStorageReadOnly({ databasePath });
    expect(getPaperOperationsSession(session.sessionId)).toMatchObject({
      status: "completed",
      automaticMeteredStart: false,
      automaticPaperArm: false,
      liveExecutionDisabled: true
    });
  });

  it("persists immutable paper exit policy evaluations", () => {
    initStorage({ databasePath });
    const evaluation = evaluatePaperExitPolicy({
      evaluationId: "paper-exit-storage-test",
      evaluatedAt: "2026-01-01T00:01:00.000Z",
      position: {
        mint,
        status: "open",
        openedAt: "2026-01-01T00:00:00.000Z",
        entryPriceSol: 1,
        currentPriceSol: 1.6,
        peakPriceSol: 1.6,
        unrealizedPnlPct: 60,
        peakUnrealizedPnlPct: 60,
        remainingSizeSol: 0.005,
        remainingTokenAmount: 0.005,
        completedRuleIds: []
      },
      market: {
        launchScore: 80,
        launchPhase: "ripping",
        priceVelocityPctPerSec: 1,
        priceAccelerationPctPerSec2: 0.1,
        volume5sSol: 5,
        volume30sSol: 20,
        volumeAccelerationSolPerSec2: 0.1,
        buyerAccelerationPerSec2: 0.1,
        netBuyPressure: 0.5,
        liquidityVelocitySolPerSec: null,
        estimatedSellSlippagePct: null,
        riskLevel: "low",
        hardReject: false,
        migrationDetected: false,
        watchedWalletSignal: null,
        reasonCodes: []
      }
    });

    savePaperExitPolicyEvaluation(evaluation);
    savePaperExitPolicyEvaluation(evaluation);

    expect(getPaperExitPolicyEvaluation(evaluation.evaluationId)).toMatchObject(
      {
        evaluationStatus: "paper_exit_candidate",
        selectedAction: { ruleId: "take-profit-stage-2" },
        automaticLiveExecution: false
      }
    );
    expect(listPaperExitPolicyEvaluations()).toHaveLength(1);
    expect(listPaperExitPolicyEvaluationsByMint(mint)).toHaveLength(1);
    expect(getStorageStats().paperExitPolicyEvaluationCount).toBe(1);
    expect(() =>
      savePaperExitPolicyEvaluation({
        ...evaluation,
        evaluatedAt: "2026-01-01T00:01:01.000Z"
      })
    ).toThrow("immutable");

    closeStorage();
    initStorageReadOnly({ databasePath });
    expect(getPaperExitPolicyEvaluation(evaluation.evaluationId)).toMatchObject(
      {
        policyVersion: "paper-exit-policy-v1",
        liveExecutionDisabled: true
      }
    );
  });

  it("persists idempotent sanitized capacity snapshots", () => {
    initStorage({ databasePath });
    const input = {
      snapshotId: "capacity-test:1",
      runtimeSessionId: "runtime-test",
      observationWindowMs: 60_000,
      launchCount: 6,
      launchRatePerMinute: 6,
      trackedMintCount: 3,
      protectedMintCount: 1,
      requiredInitialSlots: 3,
      availableNewestSlots: 2,
      initialCoverageRatio: 2 / 3,
      observedEventsPerSecond: 2,
      projectedHourlyEvents: 21_600,
      projectedHourlyCostSol: 0.0216,
      reasonCodes: ["INITIAL_COVERAGE_CAPACITY_SHORTFALL"],
      payload: {
        apiKey: "must-not-persist",
        safe: true
      },
      createdAt: "2026-07-16T00:00:00.000Z"
    };

    saveCapacitySnapshot(input);
    saveCapacitySnapshot(input);

    expect(listCapacitySnapshots()).toEqual([
      expect.objectContaining({
        snapshotId: "capacity-test:1",
        initialCoverageRatio: 2 / 3,
        payload: {
          apiKey: "[redacted]",
          safe: true
        }
      })
    ]);
    expect(getStorageStats().capacitySnapshotCount).toBe(1);
  });

  it("signal can be saved and read", () => {
    initStorage({ databasePath });
    const saved = saveSignal(createSignal());
    const recent = listRecentSignals(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.mint).toBe(mint);
    expect(recent[0]?.reasonCodes).toEqual(["STRONG_MOMENTUM"]);
  });

  it("paper order can be saved and read", () => {
    initStorage({ databasePath });
    const signal = saveSignal(createSignal());
    const order = savePaperOrder({
      mint,
      symbol: "MOCK",
      side: "buy",
      status: "accepted",
      sizeSol: 0.25,
      simulatedPrice: 0.00042,
      reasonCodes: ["STRONG_MOMENTUM"],
      signalId: signal.id,
      payload: {
        source: "test"
      }
    });

    const orders = listPaperOrders(10);

    expect(order.id).toBeGreaterThan(0);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.signalId).toBe(signal.id);
    expect(orders[0]?.side).toBe("buy");
  });

  it("paper position can be upserted and listed", () => {
    initStorage({ databasePath });
    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.25,
      tokenAmount: 595.23,
      entryPrice: 0.00042,
      status: "open",
      payload: {
        source: "first"
      }
    });

    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.5,
      tokenAmount: 1190.46,
      entryPrice: 0.00042,
      status: "open",
      payload: {
        source: "second"
      }
    });

    const positions = listPaperPositions();

    expect(positions).toHaveLength(1);
    expect(positions[0]?.sizeSol).toBe(0.5);
    expect(positions[0]?.tokenAmount).toBe(1190.46);
  });

  it("paper portfolio records can be saved, listed, fetched, and counted", () => {
    initStorage({ databasePath });
    const order = savePaperPortfolioOrder({
      orderId: "paper-order-1",
      type: "entry",
      side: "buy",
      mint,
      symbol: "MOCK",
      title: "Mock Token",
      source: "launch_signal",
      requestedSizeSol: 0.005,
      requestedSellPct: null,
      signalScore: 91,
      riskLevel: "low",
      reasonCodes: ["PAPER_ENTRY_INTENT_CREATED"],
      payload: {
        paperOnly: true
      },
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const fill = savePaperPortfolioFill({
      fillId: "paper-fill-1",
      orderId: order.orderId,
      side: "buy",
      mint,
      priceSol: 0.0005,
      effectivePriceSol: 0.000515,
      sizeSol: 0.005,
      tokenAmount: 9.708737864,
      feeSol: 0.00005,
      slippageSol: 0.00015,
      fillStatus: "filled",
      rejectionReason: null,
      reasonCodes: ["PAPER_BUY_FILLED"],
      payload: {
        paperOnly: true
      },
      createdAt: "2026-01-01T00:00:01.000Z"
    });
    const position = upsertPaperPortfolioPosition({
      positionId: "paper-position-1",
      mint,
      symbol: "MOCK",
      title: "Mock Token",
      status: "open",
      entryPriceSol: 0.000515,
      averageEntryPriceSol: 0.000515,
      currentPriceSol: null,
      sizeSol: 0.005,
      remainingSizeSol: 0.005,
      tokenAmount: 9.708737864,
      remainingTokenAmount: 9.708737864,
      realizedPnlSol: 0,
      unrealizedPnlSol: 0,
      realizedPnlPct: 0,
      unrealizedPnlPct: 0,
      totalFeesSol: 0.00005,
      payload: {
        paperOnly: true
      },
      openedAt: "2026-01-01T00:00:01.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      closedAt: null
    });
    const snapshot = savePaperPortfolioSnapshot({
      cashSol: 0.99495,
      deployedSol: 0.005,
      equitySol: 0.99995,
      realizedPnlSol: 0,
      unrealizedPnlSol: 0,
      totalPnlSol: 0,
      totalPnlPct: -0.005,
      openPositionCount: 1,
      closedPositionCount: 0,
      winRate: 0,
      maxDrawdownSol: 0.00005,
      maxDrawdownPct: 0.005,
      totalFeesSol: 0.00005,
      totalTrades: 1,
      payload: {
        paperOnly: true
      },
      createdAt: "2026-01-01T00:00:02.000Z"
    });

    const stats = getStorageStats();

    expect(order.id).toBeGreaterThan(0);
    expect(fill.id).toBeGreaterThan(0);
    expect(position.id).toBeGreaterThan(0);
    expect(snapshot.id).toBeGreaterThan(0);
    expect(listPaperPortfolioOrders()).toHaveLength(1);
    expect(listPaperPortfolioFills()).toHaveLength(1);
    expect(listPaperPortfolioPositions()).toHaveLength(1);
    expect(listPaperPortfolioSnapshots()).toHaveLength(1);
    expect(getPaperPortfolioPosition(mint)?.positionId).toBe(
      "paper-position-1"
    );
    expect(getPaperPortfolioPosition(mint)?.currentPriceSol).toBeNull();
    expect(stats.paperPortfolioOrderCount).toBe(1);
    expect(stats.paperPortfolioFillCount).toBe(1);
    expect(stats.paperPortfolioPositionCount).toBe(1);
    expect(stats.paperPortfolioSnapshotCount).toBe(1);
  });

  it("risk snapshot can be saved, listed, and fetched by mint", () => {
    initStorage({ databasePath });
    const saved = saveRiskSnapshot(createRiskSnapshot());
    const listed = listRiskSnapshots(10);
    const latest = getLatestRiskSnapshot(mint);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(latest?.mint).toBe(mint);
    expect(latest?.reasonCodes).toContain("BASELINE_RISK");
  });

  it("candidate decision can be saved, listed, and fetched by mint", () => {
    initStorage({ databasePath });
    const saved = saveCandidateDecision(createCandidateDecision());
    const listed = listCandidateDecisions(10);
    const latest = getLatestCandidateDecision(mint);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(latest?.mint).toBe(mint);
    expect(latest?.action).toBe("PAPER_BUY_READY");
  });

  it("chain verification can be saved, listed, and fetched by mint", () => {
    initStorage({ databasePath });
    const saved = saveChainVerification(createChainVerification());
    const listed = listChainVerifications(10);
    const latest = getLatestChainVerification(mint);

    expect(saved.id).toBeGreaterThan(0);
    expect(saved.status).toBe("verified");
    expect(listed).toHaveLength(1);
    expect(latest?.mint).toBe(mint);
    expect(latest?.reasonCodes).toContain("ON_CHAIN_MINT_VERIFIED");
    expect(latest?.topHolderPct).toBe(12.5);
  });

  it("chain transaction event can be saved, listed, and fetched by signature", () => {
    initStorage({ databasePath });
    const saved = saveChainTransactionEvent(createChainTransactionEvent());
    const listed = listChainTransactionEvents(10);
    const fetched = getChainTransactionEvent(saved.signature);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe("parsed");
    expect(fetched?.signature).toBe(saved.signature);
    expect(fetched?.reasonCodes).toContain("WATCHED_ADDRESS_LOG");
  });

  it("chain trade event can be saved, listed, and fetched by signature", () => {
    initStorage({ databasePath });
    const saved = saveChainTradeEvent(createChainTradeEvent());
    const listed = listChainTradeEvents(10);
    const fetched = getChainTradeEvent(saved.signature);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.side).toBe("buy");
    expect(fetched?.signature).toBe(saved.signature);
    expect(fetched?.confidence).toBe("medium");
  });

  it("market observation can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveMarketObservation(createMarketObservation());
    const listed = listMarketObservations(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
    expect(listed[0]?.quoteAsset).toBe("SOL");
  });

  it("market observations can be listed by mint", () => {
    initStorage({ databasePath });
    saveMarketObservation(createMarketObservation());
    saveMarketObservation({
      ...createMarketObservation(),
      signature:
        "OtherSignature111111111111111111111111111111111111111111111111111",
      mint: "OtherMint111111111111111111111111111111111"
    });

    const listed = listMarketObservationsByMint(mint, 10);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
  });

  it("latest market observation can be fetched by mint", () => {
    initStorage({ databasePath });
    saveMarketObservation(createMarketObservation("2026-01-01T00:00:01.000Z"));
    saveMarketObservation({
      ...createMarketObservation("2026-01-01T00:00:02.000Z"),
      signature:
        "LatestSignature111111111111111111111111111111111111111111111111"
    });

    const latest = getLatestMarketObservation(mint);

    expect(latest?.signature).toBe(
      "LatestSignature111111111111111111111111111111111111111111111111"
    );
  });

  it("market observation can be fetched by signature", () => {
    initStorage({ databasePath });
    const saved = saveMarketObservation(createMarketObservation());
    const fetched = getMarketObservation(saved.signature);

    expect(fetched?.signature).toBe(saved.signature);
    expect(fetched?.usableForMetrics).toBe(true);
  });

  it("market observation preserves null price and volume fields", () => {
    initStorage({ databasePath });
    saveMarketObservation({
      ...createMarketObservation(),
      priceQuote: null,
      priceSol: null,
      priceUsd: null,
      volumeQuote: null,
      volumeSol: null,
      volumeUsd: null,
      usableForMetrics: false,
      reasonCodes: ["MARKET_OBSERVATION_UNUSABLE"]
    });

    const listed = listMarketObservations(10);

    expect(listed[0]?.priceUsd).toBeNull();
    expect(listed[0]?.volumeSol).toBeNull();
    expect(listed[0]?.usableForMetrics).toBe(false);
  });

  it("pumpportal token trade event can be saved, listed, and fetched by signature", () => {
    initStorage({ databasePath });
    const saved = savePumpPortalTokenTradeEvent(createPumpPortalTradeEvent());
    const listed = listPumpPortalTokenTradeEvents(10);
    const fetched = getPumpPortalTokenTradeEvent("pumpportal-signature-1");

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
    expect(fetched?.signature).toBe("pumpportal-signature-1");
    expect(fetched?.usableForMetrics).toBe(true);
  });

  it("pumpportal token trade events can be listed by mint", () => {
    initStorage({ databasePath });
    savePumpPortalTokenTradeEvent(createPumpPortalTradeEvent());
    savePumpPortalTokenTradeEvent({
      ...createPumpPortalTradeEvent(),
      mint: "So11111111111111111111111111111111111111112",
      signature: "pumpportal-signature-2"
    });

    const listed = listPumpPortalTokenTradeEventsByMint(mint, 10);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
  });

  it("pumpportal token trade event preserves null price fields", () => {
    initStorage({ databasePath });
    savePumpPortalTokenTradeEvent({
      ...createPumpPortalTradeEvent(),
      priceSol: null,
      volumeSol: null,
      usableForMetrics: false,
      reasonCodes: ["PUMPPORTAL_TRADE_UNUSABLE_FOR_METRICS"]
    });

    const listed = listPumpPortalTokenTradeEvents(10);

    expect(listed[0]?.priceSol).toBeNull();
    expect(listed[0]?.volumeSol).toBeNull();
    expect(listed[0]?.usableForMetrics).toBe(false);
  });

  it("live feed event can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveLiveFeedEvent(createLiveFeedEvent());
    const listed = listLiveFeedEvents(10);
    const bySession = listLiveFeedEventsBySession("test-session", 10);
    const byMint = listLiveFeedEventsByMint(mint, 10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(bySession).toHaveLength(1);
    expect(byMint).toHaveLength(1);
    expect(listed[0]?.sessionId).toBe("test-session");
    expect(listed[0]?.provider).toBe("pumpportal");
    expect(listed[0]?.eventType).toBe("new_token");
    expect(listed[0]?.realData).toBe(true);
    expect(listed[0]?.reasonCodes).toContain("LIVE_FEED_EVENT");
  });

  it("actual data subscription can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveActualDataSubscription(createActualDataSubscription());
    const listed = listActualDataSubscriptions(10);
    const byMint = listActualDataSubscriptionsByMint(mint, 10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(byMint[0]?.status).toBe("subscribed");
    expect(byMint[0]?.reasonCodes).toContain("PUMPPORTAL_TRADE_SUBSCRIBED");
  });

  it("actual data session can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveActualDataSession(createActualDataSession());
    const listed = listActualDataSessions(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.provider).toBe("pumpportal");
    expect(listed[0]?.budgetEventLimit).toBe(5000);
  });

  it("metered launch data records can be saved, listed, and counted", () => {
    initStorage({ databasePath });
    const session = saveMeteredLaunchDataSession(
      createMeteredLaunchDataSession()
    );
    const subscription = saveMeteredLaunchDataSubscription(
      createMeteredLaunchDataSubscription()
    );
    const event = saveMeteredLaunchDataEvent(createMeteredLaunchDataEvent());
    const stats = getStorageStats();

    expect(session.id).toBeGreaterThan(0);
    expect(subscription.id).toBeGreaterThan(0);
    expect(event.id).toBeGreaterThan(0);
    expect(listMeteredLaunchDataSessions(10)).toHaveLength(1);
    expect(listMeteredLaunchDataSubscriptions(10)).toHaveLength(1);
    expect(listMeteredLaunchDataSubscriptionsByMint(mint, 10)[0]?.status).toBe(
      "subscribed"
    );
    expect(listMeteredLaunchDataEvents(10)).toHaveLength(1);
    expect(listMeteredLaunchDataEventsByMint(mint, 10)[0]?.signature).toBe(
      "metered-launch-signature-1"
    );
    expect(stats.meteredLaunchDataSessionCount).toBe(1);
    expect(stats.meteredLaunchDataSubscriptionCount).toBe(1);
    expect(stats.meteredLaunchDataEventCount).toBe(1);
    expect(JSON.stringify(event.payload).toLowerCase()).not.toContain(
      "secret-api-key"
    );
  });

  it("upserts canonical launch buckets and exposes them for replay", async () => {
    initStorage({ databasePath });
    upsertLaunchTimeseriesBucket(createLaunchTimeseriesBucket());
    upsertLaunchTimeseriesBucket({
      ...createLaunchTimeseriesBucket(),
      closeSol: 0.0005,
      highSol: 0.0005,
      tradeCount: 2,
      buyCount: 2,
      volumeSol: 3,
      buyVolumeSol: 3,
      updatedAt: "2026-01-01T00:00:00.900Z"
    });

    const buckets = listLaunchTimeseriesBucketsByMint(mint, 10);
    const boundedBuckets = listLaunchTimeseriesBucketsByMintBetween(
      mint,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:01.000Z"
    );
    const replayItems = [];

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "launch_timeseries_buckets"
    })) {
      replayItems.push(item);
    }

    expect(buckets).toHaveLength(1);
    expect(boundedBuckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      bucketMs: 1000,
      closeSol: 0.0005,
      tradeCount: 2,
      volumeSol: 3
    });
    expect(getStorageStats().launchTimeseriesBucketCount).toBe(1);
    expect(replayItems).toHaveLength(1);
    expect(replayItems[0]?.source).toBe("launch_timeseries_buckets");
  });

  it("token identity can be saved, listed, and fetched by mint", () => {
    initStorage({ databasePath });
    const saved = saveTokenIdentity(createTokenIdentity());
    const listed = listTokenIdentities(10);
    const fetched = getTokenIdentity(mint);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(fetched?.mint).toBe(mint);
    expect(fetched?.title).toBe("MOCK - Mock Token");
    expect(fetched?.reasonCodes).toContain("IDENTITY_FROM_PUMPPORTAL");
  });

  it("token identity can be upserted", () => {
    initStorage({ databasePath });
    upsertTokenIdentity(createTokenIdentity());
    upsertTokenIdentity({
      ...createTokenIdentity(),
      name: "Updated Token",
      title: "MOCK - Updated Token",
      displayName: "MOCK Updated Token",
      updatedAt: "2026-01-01T00:00:09.000Z"
    });

    const fetched = getTokenIdentity(mint);

    expect(listTokenIdentities(10)).toHaveLength(1);
    expect(fetched?.name).toBe("Updated Token");
    expect(fetched?.updatedAt).toBe("2026-01-01T00:00:09.000Z");
  });

  it("unresolved token identities can be listed", () => {
    initStorage({ databasePath });
    saveTokenIdentity({
      ...createTokenIdentity(),
      name: null,
      symbol: null,
      title: "MockMi...1111",
      displayName: "MockMi...1111",
      confidence: "none",
      completenessScore: 0,
      reasonCodes: ["IDENTITY_UNRESOLVED"]
    });

    const unresolved = listUnresolvedTokenIdentities(10);

    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.mint).toBe(mint);
  });

  it("token metadata fetch can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveTokenMetadataFetch(createTokenMetadataFetch());
    const listed = listTokenMetadataFetches(10);
    const byMint = listTokenMetadataFetchesByMint(mint, 10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(byMint[0]?.uri).toBe("https://example.test/meta.json");
    expect(byMint[0]?.reasonCodes).toContain("IDENTITY_FROM_OFFCHAIN_METADATA");
  });

  it("watch plan can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveWatchPlan(createWatchPlanFixture());
    const listed = listWatchPlans(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
    expect(listed[0]?.watchTargets[0]?.kind).toBe("mint");
  });

  it("latest watch plan can be fetched by mint", () => {
    initStorage({ databasePath });
    saveWatchPlan(createWatchPlanFixture("2026-01-01T00:00:07.000Z"));
    saveWatchPlan(createWatchPlanFixture("2026-01-01T00:00:08.000Z"));

    const latest = getLatestWatchPlan(mint);

    expect(latest?.createdAt).toBe("2026-01-01T00:00:08.000Z");
  });

  it("watch action can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveWatchAction(createWatchActionFixture());
    const listed = listWatchActions(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.action).toBe("verify_mint");
  });

  it("watch actions can be listed by mint", () => {
    initStorage({ databasePath });
    saveWatchAction(createWatchActionFixture());
    saveWatchAction({
      ...createWatchActionFixture(),
      mint: "OtherMint111111111111111111111111111111111",
      address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    });

    const listed = listWatchActionsByMint(mint, 10);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
  });

  it("lightning trade plans can be saved, listed, and fetched by plan id", () => {
    initStorage({ databasePath });
    const saved = saveLightningTradePlan({
      planId: "plan-1",
      mint,
      action: "buy",
      amountSol: 0.001,
      mode: "dry_run",
      blocked: false,
      blockers: [],
      warnings: ["LIGHTNING_LIVE_TRADING_DISABLED"],
      request: {
        action: "buy",
        mint,
        amount: 0.001,
        apiKey: "api-key-value"
      },
      payload: {
        privateKey: "private-key-value",
        note: "dry run"
      },
      createdAt: "2026-01-01T00:00:09.000Z"
    });
    saveLightningTradePlan({
      planId: "plan-2",
      mint: "So11111111111111111111111111111111111111112",
      action: "buy",
      amountSol: 0.002,
      mode: "dry_run",
      blocked: true,
      blockers: ["LIGHTNING_AMOUNT_EXCEEDS_MAX_BUY"],
      warnings: [],
      request: {},
      payload: {},
      createdAt: "2026-01-01T00:00:10.000Z"
    });

    const listed = listLightningTradePlans(10);
    const byMint = listLightningTradePlansByMint(mint, 10);
    const fetched = getLightningTradePlan("plan-1");
    const serialized = JSON.stringify(fetched).toLowerCase();

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(2);
    expect(byMint).toHaveLength(1);
    expect(fetched?.planId).toBe("plan-1");
    expect(serialized).not.toContain("api-key-value");
    expect(serialized).not.toContain("private-key-value");
    expect(serialized).toContain("[redacted]");
  });

  it("pumpportal wallet status snapshots can be saved and listed without secrets", () => {
    initStorage({ databasePath });
    const saved = savePumpPortalWalletStatusSnapshot({
      dataWalletPublicKey: "So11111111111111111111111111111111111111112",
      tradingWalletPublicKey: "11111111111111111111111111111111",
      sameWallet: false,
      dataWalletBalanceSol: 0.05,
      tradingWalletBalanceSol: 0.03,
      dataWalletStatus: "ok",
      tradingWalletStatus: "low",
      reasonCodes: ["LIGHTNING_LIVE_TRADING_DISABLED"],
      payload: {
        apiKey: "api-key-value",
        privateKey: "private-key-value",
        publicOnly: true
      },
      createdAt: "2026-01-01T00:00:11.000Z"
    });

    const listed = listPumpPortalWalletStatusSnapshots(10);
    const serialized = JSON.stringify(listed).toLowerCase();

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.sameWallet).toBe(false);
    expect(listed[0]?.dataWalletBalanceSol).toBe(0.05);
    expect(serialized).not.toContain("api-key-value");
    expect(serialized).not.toContain("private-key-value");
  });

  it("watched wallet exit strategy records can be saved, listed, counted, and sanitized", () => {
    initStorage({ databasePath });
    const walletAddress = "WatchWallet111111111111111111111111111111";
    const otherWalletAddress = "OtherWallet111111111111111111111111111111";
    const wallet = saveWatchedWallet({
      address: walletAddress,
      alias: "paper watcher",
      tags: ["smart_money", "exit_liquidity"],
      enabled: true,
      source: "manual",
      reasonCodes: ["WATCHED_WALLET_ADDED"],
      payload: {
        apiKey: "api-key-value",
        publicNote: "safe"
      },
      createdAt: "2026-01-01T00:00:12.000Z",
      updatedAt: "2026-01-01T00:00:12.000Z"
    });
    saveWatchedWallet({
      address: otherWalletAddress,
      alias: null,
      tags: ["other"],
      enabled: false,
      source: "test",
      reasonCodes: ["WATCHED_WALLET_ADDED"],
      createdAt: "2026-01-01T00:00:13.000Z",
      updatedAt: "2026-01-01T00:00:13.000Z"
    });

    const event = saveWatchedWalletTradeEvent({
      wallet: walletAddress,
      walletAlias: "paper watcher",
      mint,
      side: "buy",
      priceSol: 0.00042,
      volumeSol: 0.25,
      tokenAmount: 595.23,
      signature: "exit-sig-1",
      confidence: "high",
      usableForExitStrategy: true,
      reasonCodes: ["PUMPPORTAL_ACCOUNT_TRADE"],
      payload: {
        privateKey: "private-key-value",
        source: "test"
      },
      createdAt: "2026-01-01T00:00:14.000Z"
    });
    saveWatchedWalletTradeEvent({
      wallet: otherWalletAddress,
      mint: "OtherMint111111111111111111111111111111111",
      side: "sell",
      confidence: "medium",
      usableForExitStrategy: true,
      reasonCodes: ["PUMPPORTAL_ACCOUNT_TRADE"],
      createdAt: "2026-01-01T00:00:15.000Z"
    });

    const rule = saveExitRule({
      id: "watched-wallet-buy-take-profit",
      name: "Watched wallet buy take profit",
      enabled: true,
      trigger: "watched_wallet_buy",
      minProfitPct: 25,
      minProfitSol: null,
      sellPct: 100,
      requirePositionOpenedBeforeWalletTrade: true,
      allowedWalletTags: ["smart_money"],
      blockedWalletTags: ["blocked"],
      requireCurrentPrice: true,
      maxPositionAgeMs: null,
      cooldownMs: 60_000,
      priority: 100,
      reasonCodes: ["DEFAULT_EXIT_RULE"],
      payload: {
        seedPhrase: "seed phrase value",
        paperOnly: true
      },
      createdAt: "2026-01-01T00:00:16.000Z",
      updatedAt: "2026-01-01T00:00:16.000Z"
    });

    const signal = saveExitSignal({
      id: "exit-signal-1",
      mint,
      wallet: walletAddress,
      walletAlias: "paper watcher",
      ruleId: rule.ruleId,
      action: "paper_sell",
      sellPct: 100,
      blocked: false,
      blockers: [],
      warnings: ["PAPER_SELL_PLAN_ONLY"],
      reasonCodes: ["EXIT_SIGNAL_CREATED", "LIVE_EXECUTION_DISABLED"],
      payload: {
        keypair: "secret-keypair",
        triggerEventId: event.id
      },
      createdAt: "2026-01-01T00:00:17.000Z"
    });

    const wallets = listWatchedWallets();
    const events = listWatchedWalletTradeEvents(10);
    const eventsByWallet = listWatchedWalletTradeEventsByWallet(
      walletAddress,
      10
    );
    const eventsByMint = listWatchedWalletTradeEventsByMint(mint, 10);
    const rules = listExitRules();
    const fetchedRule = getExitRule(rule.ruleId);
    const signals = listExitSignals(10);
    const signalsByMint = listExitSignalsByMint(mint, 10);
    const stats = getStorageStats();
    const serialized = JSON.stringify({
      wallets,
      events,
      rules,
      signals
    }).toLowerCase();

    expect(wallet.id).toBeGreaterThan(0);
    expect(event.id).toBeGreaterThan(0);
    expect(signal.id).toBeGreaterThan(0);
    expect(wallets).toHaveLength(2);
    expect(wallets[0]?.enabled).toBe(false);
    expect(events).toHaveLength(2);
    expect(eventsByWallet).toHaveLength(1);
    expect(eventsByMint).toHaveLength(1);
    expect(rules).toHaveLength(1);
    expect(fetchedRule?.ruleId).toBe("watched-wallet-buy-take-profit");
    expect(fetchedRule?.allowedWalletTags).toEqual(["smart_money"]);
    expect(fetchedRule?.blockedWalletTags).toEqual(["blocked"]);
    expect(fetchedRule?.requireCurrentPrice).toBe(true);
    expect(signals).toHaveLength(1);
    expect(signalsByMint).toHaveLength(1);
    expect(stats.watchedWalletCount).toBe(2);
    expect(stats.watchedWalletTradeEventCount).toBe(2);
    expect(stats.exitRuleCount).toBe(1);
    expect(stats.exitSignalCount).toBe(1);
    expect(serialized).not.toContain("api-key-value");
    expect(serialized).not.toContain("private-key-value");
    expect(serialized).not.toContain("seed phrase value");
    expect(serialized).not.toContain("secret-keypair");
    expect(deleteExitRule(rule.ruleId)).toBe(true);
    expect(deleteWatchedWallet(walletAddress)).toBe(true);
    expect(listExitRules()).toHaveLength(0);
    expect(listWatchedWallets()).toHaveLength(1);
  });

  it("launch scanner records can be saved, listed, and counted", () => {
    initStorage({ databasePath });
    const candidate = saveLaunchCandidate({
      mint,
      source: "pumpportal",
      eventType: "new_token",
      name: "Mock Token",
      symbol: "MOCK",
      title: "MOCK - Mock Token",
      status: "discovery_only",
      reasonCodes: ["LAUNCH_DISCOVERED", "LAUNCH_DISCOVERY_ONLY"],
      payload: { phase: "discovery_only" },
      discoveredAt: "2026-01-01T00:00:00.000Z",
      latestEventAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const sample = saveLaunchTradeSample({
      mint,
      signature: "launch-sig-1",
      side: "buy",
      trader: "Buyer1111111111111111111111111111111111111",
      priceSol: 0.00042,
      volumeSol: 1.5,
      tokenAmount: 3571.42,
      confidence: "high",
      usableForMetrics: true,
      reasonCodes: ["PUMPPORTAL_TOKEN_TRADE", "LAUNCH_TRADE_SAMPLE"],
      payload: { source: "pumpportal" },
      createdAt: "2026-01-01T00:00:02.000Z"
    });
    const snapshot = saveLaunchScoreSnapshot({
      mint,
      score: 76,
      label: "ripping",
      phase: "ripping",
      tradeSampleCount: 8,
      priceSol: 0.0005,
      volumeSol: 5.5,
      reasonCodes: ["LAUNCH_RIPPING"],
      payload: { score: 76 },
      evaluatedAt: "2026-01-01T00:00:10.000Z",
      createdAt: "2026-01-01T00:00:10.000Z"
    });
    const trackingEvent = saveLaunchTrackingEvent({
      mint,
      action: "track",
      status: "subscribed",
      reason: "manual",
      reasonCodes: ["PUMPPORTAL_LAUNCH_TRACKING_SUBSCRIBED"],
      payload: { mint },
      createdAt: "2026-01-01T00:00:01.000Z"
    });
    const session = saveLaunchTrackingSession({
      provider: "pumpportal",
      status: "running",
      trackedTokenCount: 1,
      totalEventCount: 8,
      estimatedCostSol: 0.000008,
      budgetLimitSol: 0.001,
      reasonCodes: ["RUNTIME_PUMPPORTAL_FIRST"],
      payload: { provider: "pumpportal" },
      startedAt: "2026-01-01T00:00:00.000Z",
      stoppedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const stats = getStorageStats();

    expect(candidate.id).toBeGreaterThan(0);
    expect(getLaunchCandidate(mint)?.status).toBe("discovery_only");
    expect(listLaunchCandidates(10)[0]?.mint).toBe(mint);
    expect(sample.id).toBeGreaterThan(0);
    expect(listLaunchTradeSamplesByMint(mint, 10)[0]?.signature).toBe(
      "launch-sig-1"
    );
    expect(snapshot.id).toBeGreaterThan(0);
    expect(listLaunchScoreSnapshots(10)[0]?.score).toBe(76);
    expect(listLaunchScoreSnapshotsByMint(mint, 10)[0]?.phase).toBe("ripping");
    expect(trackingEvent.id).toBeGreaterThan(0);
    expect(listLaunchTrackingEvents(10)[0]?.action).toBe("track");
    expect(session.id).toBeGreaterThan(0);
    expect(listLaunchTrackingSessions(10)[0]?.provider).toBe("pumpportal");
    expect(stats.launchCandidateCount).toBe(1);
    expect(stats.launchTradeSampleCount).toBe(1);
    expect(stats.launchScoreSnapshotCount).toBe(1);
    expect(stats.launchTrackingEventCount).toBe(1);
    expect(stats.launchTrackingSessionCount).toBe(1);
  });

  it("storage stats return counts", () => {
    initStorage({ databasePath });
    saveChainVerification(createChainVerification());
    saveChainTransactionEvent(createChainTransactionEvent());
    saveChainTradeEvent(createChainTradeEvent());
    saveMarketObservation(createMarketObservation());
    savePumpPortalTokenTradeEvent(createPumpPortalTradeEvent());
    saveActualDataSubscription(createActualDataSubscription());
    saveActualDataSession(createActualDataSession());
    saveMeteredLaunchDataSession(createMeteredLaunchDataSession());
    saveMeteredLaunchDataSubscription(createMeteredLaunchDataSubscription());
    saveMeteredLaunchDataEvent(createMeteredLaunchDataEvent());
    saveTokenIdentity(createTokenIdentity());
    saveTokenMetadataFetch(createTokenMetadataFetch());
    saveWatchPlan(createWatchPlanFixture());
    saveWatchAction(createWatchActionFixture());
    saveLightningTradePlan({
      planId: "stats-plan",
      mint,
      action: "buy",
      amountSol: 0.001,
      mode: "dry_run",
      blocked: false,
      blockers: [],
      warnings: [],
      request: {},
      payload: {}
    });
    savePumpPortalWalletStatusSnapshot({
      dataWalletPublicKey: "So11111111111111111111111111111111111111112",
      tradingWalletPublicKey: "11111111111111111111111111111111",
      sameWallet: false,
      dataWalletBalanceSol: 0.05,
      tradingWalletBalanceSol: 0.03,
      dataWalletStatus: "ok",
      tradingWalletStatus: "low",
      reasonCodes: ["LIGHTNING_LIVE_TRADING_DISABLED"],
      payload: {}
    });
    saveFeedEvent(createFeedEvent());
    saveLiveFeedEvent(createLiveFeedEvent());
    saveRiskSnapshot(createRiskSnapshot());
    saveCandidateDecision(createCandidateDecision());
    const signal = saveSignal(createSignal());
    savePaperOrder({
      mint,
      symbol: "MOCK",
      side: "buy",
      status: "accepted",
      sizeSol: 0.25,
      simulatedPrice: 0.00042,
      reasonCodes: ["STRONG_MOMENTUM"],
      signalId: signal.id,
      payload: {}
    });
    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.25,
      tokenAmount: 595.23,
      entryPrice: 0.00042,
      status: "open",
      payload: {}
    });
    savePaperPortfolioOrder({
      orderId: "stats-paper-order",
      type: "entry",
      side: "buy",
      mint,
      symbol: "MOCK",
      title: "Mock Token",
      source: "launch_signal",
      requestedSizeSol: 0.005,
      requestedSellPct: null,
      signalScore: 90,
      riskLevel: "low",
      reasonCodes: ["PAPER_ENTRY_INTENT_CREATED"],
      payload: {}
    });
    savePaperPortfolioFill({
      fillId: "stats-paper-fill",
      orderId: "stats-paper-order",
      side: "buy",
      mint,
      priceSol: 0.00042,
      effectivePriceSol: 0.0004326,
      sizeSol: 0.005,
      tokenAmount: 11.558,
      feeSol: 0.00005,
      slippageSol: 0.00015,
      fillStatus: "filled",
      rejectionReason: null,
      reasonCodes: ["PAPER_BUY_FILLED"],
      payload: {}
    });
    upsertPaperPortfolioPosition({
      positionId: "stats-paper-position",
      mint,
      symbol: "MOCK",
      title: "Mock Token",
      status: "open",
      entryPriceSol: 0.0004326,
      averageEntryPriceSol: 0.0004326,
      currentPriceSol: 0.00042,
      sizeSol: 0.005,
      remainingSizeSol: 0.005,
      tokenAmount: 11.558,
      remainingTokenAmount: 11.558,
      realizedPnlSol: 0,
      unrealizedPnlSol: -0.00015,
      realizedPnlPct: 0,
      unrealizedPnlPct: -3,
      totalFeesSol: 0.00005,
      payload: {},
      openedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      closedAt: null
    });
    savePaperPortfolioSnapshot({
      cashSol: 0.99495,
      deployedSol: 0.005,
      equitySol: 0.9998,
      realizedPnlSol: 0,
      unrealizedPnlSol: -0.00015,
      totalPnlSol: -0.00015,
      totalPnlPct: -0.015,
      openPositionCount: 1,
      closedPositionCount: 0,
      winRate: 0,
      maxDrawdownSol: 0.0002,
      maxDrawdownPct: 0.02,
      totalFeesSol: 0.00005,
      totalTrades: 1,
      payload: {}
    });
    saveWatchedWallet({
      address: "StatsWallet111111111111111111111111111111",
      alias: "stats wallet",
      tags: ["stats"],
      enabled: true,
      source: "test",
      reasonCodes: ["WATCHED_WALLET_ADDED"],
      payload: {}
    });
    saveWatchedWalletTradeEvent({
      wallet: "StatsWallet111111111111111111111111111111",
      mint,
      side: "buy",
      confidence: "high",
      usableForExitStrategy: true,
      reasonCodes: ["WATCHED_WALLET_TRADE_OBSERVED"],
      payload: {}
    });
    saveExitRule({
      id: "stats-rule",
      name: "Stats rule",
      enabled: true,
      trigger: "watched_wallet_buy",
      minProfitPct: 25,
      sellPct: 100,
      requirePositionOpenedBeforeWalletTrade: true,
      requireCurrentPrice: true,
      cooldownMs: 60_000,
      priority: 100,
      reasonCodes: ["DEFAULT_EXIT_RULE"],
      payload: {}
    });
    saveExitSignal({
      id: "stats-signal",
      mint,
      wallet: "StatsWallet111111111111111111111111111111",
      ruleId: "stats-rule",
      action: "paper_sell",
      sellPct: 100,
      blocked: false,
      blockers: [],
      warnings: ["PAPER_SELL_PLAN_ONLY"],
      reasonCodes: ["EXIT_SIGNAL_CREATED"],
      payload: {}
    });

    const stats = getStorageStats();

    expect(stats.feedEventCount).toBe(1);
    expect(stats.liveFeedEventCount).toBe(1);
    expect(stats.signalCount).toBe(1);
    expect(stats.chainVerificationCount).toBe(1);
    expect(stats.chainTransactionEventCount).toBe(1);
    expect(stats.chainTradeEventCount).toBe(1);
    expect(stats.marketObservationCount).toBe(1);
    expect(stats.pumpPortalTokenTradeEventCount).toBe(1);
    expect(stats.actualDataSubscriptionCount).toBe(1);
    expect(stats.actualDataSessionCount).toBe(1);
    expect(stats.meteredLaunchDataSessionCount).toBe(1);
    expect(stats.meteredLaunchDataSubscriptionCount).toBe(1);
    expect(stats.meteredLaunchDataEventCount).toBe(1);
    expect(stats.tokenIdentityCount).toBe(1);
    expect(stats.tokenIdentityResolvedCount).toBe(1);
    expect(stats.tokenIdentityUnresolvedCount).toBe(0);
    expect(stats.tokenMetadataFetchCount).toBe(1);
    expect(stats.watchPlanCount).toBe(1);
    expect(stats.watchActionCount).toBe(1);
    expect(stats.lightningTradePlanCount).toBe(1);
    expect(stats.pumpPortalWalletStatusSnapshotCount).toBe(1);
    expect(stats.riskSnapshotCount).toBe(1);
    expect(stats.candidateDecisionCount).toBe(1);
    expect(stats.paperOrderCount).toBe(1);
    expect(stats.paperPositionCount).toBe(1);
    expect(stats.paperPortfolioOrderCount).toBe(1);
    expect(stats.paperPortfolioFillCount).toBe(1);
    expect(stats.paperPortfolioPositionCount).toBe(1);
    expect(stats.paperPortfolioSnapshotCount).toBe(1);
    expect(stats.watchedWalletCount).toBe(1);
    expect(stats.watchedWalletTradeEventCount).toBe(1);
    expect(stats.exitRuleCount).toBe(1);
    expect(stats.exitSignalCount).toBe(1);
    expect(stats.lastSignalAt).toEqual(expect.any(String));
  });

  it("lists replay records in chronological order", async () => {
    initStorage({ databasePath });
    saveFeedEvent(createFeedEvent("2026-01-01T00:00:02.000Z"));
    saveFeedEvent(createFeedEvent("2026-01-01T00:00:01.000Z"));
    saveSignal(createSignal());

    const feedEvents = listFeedEvents(10);
    const signals = listSignalsForReplay(10);
    const riskSnapshot = saveRiskSnapshot(createRiskSnapshot());
    const candidateDecision = saveCandidateDecision(createCandidateDecision());
    const chainVerification = saveChainVerification(createChainVerification());
    const chainTransactionEvent = saveChainTransactionEvent(
      createChainTransactionEvent()
    );
    const chainTradeEvent = saveChainTradeEvent(createChainTradeEvent());
    const marketObservation = saveMarketObservation(createMarketObservation());
    const pumpPortalTrade = savePumpPortalTokenTradeEvent(
      createPumpPortalTradeEvent()
    );
    const actualDataSubscription = saveActualDataSubscription(
      createActualDataSubscription()
    );
    const actualDataSession = saveActualDataSession(createActualDataSession());
    const tokenIdentity = saveTokenIdentity(createTokenIdentity());
    const tokenMetadataFetch = saveTokenMetadataFetch(
      createTokenMetadataFetch()
    );
    const watchPlan = saveWatchPlan(createWatchPlanFixture());
    const watchAction = saveWatchAction(createWatchActionFixture());
    const riskSnapshots = listRiskSnapshotsForReplay(10);
    const candidateDecisions = listCandidateDecisionsForReplay(10);
    const chainVerifications = listChainVerificationsForReplay(10);
    const chainTransactionEvents = listChainTransactionEventsForReplay(10);
    const chainTradeEvents = listChainTradeEventsForReplay(10);
    const marketObservations = listMarketObservationsForReplay(10);
    const pumpPortalTrades = listPumpPortalTokenTradeEventsForReplay(10);
    const tokenIdentities = listTokenIdentitiesForReplay(10);
    const tokenMetadataFetches = listTokenMetadataFetchesForReplay(10);
    const watchPlans = listWatchPlansForReplay(10);
    const watchActions = listWatchActionsForReplay(10);
    const replayItems = [];
    const riskReplayItems = [];
    const candidateReplayItems = [];
    const chainReplayItems = [];
    const chainTransactionReplayItems = [];
    const chainTradeReplayItems = [];
    const marketReplayItems = [];
    const pumpPortalTradeReplayItems = [];
    const actualDataSubscriptionReplayItems = [];
    const actualDataSessionReplayItems = [];
    const tokenIdentityReplayItems = [];
    const tokenMetadataFetchReplayItems = [];
    const watchPlanReplayItems = [];
    const watchActionReplayItems = [];

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "feed_events"
    })) {
      replayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "risk_snapshots"
    })) {
      riskReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "candidate_decisions"
    })) {
      candidateReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "chain_verifications"
    })) {
      chainReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "chain_transaction_events"
    })) {
      chainTransactionReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "chain_trade_events"
    })) {
      chainTradeReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "market_observations"
    })) {
      marketReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "pumpportal_token_trade_events"
    })) {
      pumpPortalTradeReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "actual_data_subscriptions"
    })) {
      actualDataSubscriptionReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "actual_data_sessions"
    })) {
      actualDataSessionReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "token_identities"
    })) {
      tokenIdentityReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "token_metadata_fetches"
    })) {
      tokenMetadataFetchReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "watch_plans"
    })) {
      watchPlanReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "watch_actions"
    })) {
      watchActionReplayItems.push(item);
    }

    expect(feedEvents.map((event) => event.createdAt)).toEqual([
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:02.000Z"
    ]);
    expect(signals).toHaveLength(1);
    expect(riskSnapshots[0]?.id).toBe(riskSnapshot.id);
    expect(candidateDecisions[0]?.id).toBe(candidateDecision.id);
    expect(chainVerifications[0]?.id).toBe(chainVerification.id);
    expect(chainTransactionEvents[0]?.id).toBe(chainTransactionEvent.id);
    expect(chainTradeEvents[0]?.id).toBe(chainTradeEvent.id);
    expect(marketObservations[0]?.id).toBe(marketObservation.id);
    expect(pumpPortalTrades[0]?.id).toBe(pumpPortalTrade.id);
    expect(tokenIdentities[0]?.id).toBe(tokenIdentity.id);
    expect(tokenMetadataFetches[0]?.id).toBe(tokenMetadataFetch.id);
    expect(actualDataSubscription.id).toBeGreaterThan(0);
    expect(actualDataSession.id).toBeGreaterThan(0);
    expect(tokenIdentity.id).toBeGreaterThan(0);
    expect(tokenMetadataFetch.id).toBeGreaterThan(0);
    expect(watchPlans[0]?.id).toBe(watchPlan.id);
    expect(watchActions[0]?.id).toBe(watchAction.id);
    expect(replayItems).toHaveLength(2);
    expect(replayItems[0]?.source).toBe("feed_events");
    expect(riskReplayItems[0]?.source).toBe("risk_snapshots");
    expect(candidateReplayItems[0]?.source).toBe("candidate_decisions");
    expect(chainReplayItems[0]?.source).toBe("chain_verifications");
    expect(chainTransactionReplayItems[0]?.source).toBe(
      "chain_transaction_events"
    );
    expect(chainTradeReplayItems[0]?.source).toBe("chain_trade_events");
    expect(marketReplayItems[0]?.source).toBe("market_observations");
    expect(pumpPortalTradeReplayItems[0]?.source).toBe(
      "pumpportal_token_trade_events"
    );
    expect(actualDataSubscriptionReplayItems[0]?.source).toBe(
      "actual_data_subscriptions"
    );
    expect(actualDataSessionReplayItems[0]?.source).toBe(
      "actual_data_sessions"
    );
    expect(tokenIdentityReplayItems[0]?.source).toBe("token_identities");
    expect(tokenMetadataFetchReplayItems[0]?.source).toBe(
      "token_metadata_fetches"
    );
    expect(watchPlanReplayItems[0]?.source).toBe("watch_plans");
    expect(watchActionReplayItems[0]?.source).toBe("watch_actions");
  });
});

function createFeedEvent(timestamp = "2026-01-01T00:00:00.000Z"): FeedEvent {
  return {
    type: "token_created",
    candidate: createSignal().state.candidate,
    metrics: createSignal().state.metrics,
    metricsComplete: true,
    receivedAt: timestamp,
    riskFlags: createSignal().riskFlags,
    source: "mock",
    timestamp
  };
}

function createRiskSnapshot(): RiskSnapshot {
  return {
    mint,
    symbol: "MOCK",
    source: "mock",
    riskLevel: "low",
    hardReject: false,
    riskScore: 10,
    flags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      metadataMutable: false,
      holderCount: 260,
      topHolderPct: 8,
      top10HolderPct: 36,
      devHolderPct: 2,
      insiderHolderPct: 3,
      devSoldPct: 0,
      devNetFlowUsd: 100,
      priorLaunchCount: 1,
      priorRugCount: 0,
      buySellRatio: 2,
      netBuyPressure: 0.4,
      uniqueBuyers: 30,
      uniqueSellers: 12,
      volumeVelocity: 150,
      volumeAcceleration: 20,
      buyerVelocity: 0.5,
      buyerAcceleration: 0.1,
      priceVelocity: 1,
      priceAcceleration: 0.1,
      largestTradeShare: 0.12,
      sampleCount: 12,
      insufficientMetrics: false,
      liquidityUsd: 12_000,
      marketCapUsd: 50_000,
      fdvUsd: 50_000,
      estimatedSellSlippagePct: 4,
      sniperPct: 3,
      bundlerPct: 2,
      washTradingSuspected: false,
      honeypotSuspected: false
    },
    reasonCodes: ["BASELINE_RISK"],
    humanSummary: "low risk",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createChainVerification() {
  return {
    mint,
    status: "verified" as const,
    reasonCodes: ["ON_CHAIN_MINT_VERIFIED", "ON_CHAIN_SUPPLY_VERIFIED"],
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    supplyUi: 1_000_000,
    topHolderPct: 12.5,
    top10HolderPct: 34.2,
    payload: {
      mint,
      source: "test"
    },
    inspectedAt: "2026-01-01T00:00:03.000Z",
    createdAt: "2026-01-01T00:00:03.000Z"
  };
}

function createChainTransactionEvent(): ChainTransactionEvent {
  return {
    type: "chain_transaction",
    source: "solana_rpc",
    signature:
      "5NfL6eiYVQhnL5rtZJkR2Jqg7YbNLsC6Gc8a5YVwWnSb1E4qMvERqE1mUu3PF4aZ75xMwHj7pFaGgQ8z7R5dHnNU",
    slot: 123,
    blockTime: 1_767_225_600,
    watchedAddress: "11111111111111111111111111111111",
    watchedAddressKind: "wallet",
    mint,
    status: "parsed",
    reasonCodes: [
      "WATCHED_ADDRESS_LOG",
      "TRANSACTION_FETCHED",
      "TOKEN_BALANCE_CHANGES_FOUND"
    ],
    raw: {
      source: "test"
    },
    receivedAt: "2026-01-01T00:00:04.000Z"
  };
}

function createChainTradeEvent(): NormalizedChainTradeEvent {
  return {
    type: "trade",
    source: "solana_rpc",
    mint,
    symbol: "MOCK",
    side: "buy",
    priceUsd: null,
    volumeUsd: null,
    tokenAmount: 42,
    trader: "11111111111111111111111111111111",
    signature:
      "5NfL6eiYVQhnL5rtZJkR2Jqg7YbNLsC6Gc8a5YVwWnSb1E4qMvERqE1mUu3PF4aZ75xMwHj7pFaGgQ8z7R5dHnNU",
    slot: 123,
    timestamp: "2026-01-01T00:00:05.000Z",
    watchedAddress: "11111111111111111111111111111111",
    confidence: "medium",
    reasonCodes: [
      "CHAIN_TRADE_EVENT",
      "POSSIBLE_TOKEN_BUY",
      "INSUFFICIENT_PRICE_DATA"
    ],
    raw: {
      source: "test"
    }
  };
}

function createMarketObservation(
  createdAt = "2026-01-01T00:00:06.000Z"
): MarketObservation {
  return {
    type: "market_observation",
    source: "solana_rpc",
    mint,
    symbol: "MOCK",
    signature:
      "5NfL6eiYVQhnL5rtZJkR2Jqg7YbNLsC6Gc8a5YVwWnSb1E4qMvERqE1mUu3PF4aZ75xMwHj7pFaGgQ8z7R5dHnNU",
    slot: 123,
    timestamp: createdAt,
    watchedAddress: "11111111111111111111111111111111",
    watchedAddressKind: "wallet",
    perspective: "wallet",
    side: "buy",
    baseTokenAmount: 42,
    quoteAsset: "SOL",
    quoteMint: null,
    quoteAmount: 1.5,
    priceQuote: 0.035714285714,
    priceSol: 0.035714285714,
    priceUsd: null,
    volumeQuote: 1.5,
    volumeSol: 1.5,
    volumeUsd: null,
    confidence: "medium",
    usableForMetrics: true,
    reasonCodes: [
      "MARKET_OBSERVATION_CREATED",
      "QUOTE_ASSET_SOL",
      "MARKET_OBSERVATION_USABLE"
    ],
    raw: {
      source: "test"
    },
    createdAt
  };
}

function createPumpPortalTradeEvent() {
  return {
    mint,
    signature: "pumpportal-signature-1",
    side: "buy" as const,
    trader: "11111111111111111111111111111111",
    priceSol: 0.02,
    volumeSol: 1.5,
    tokenAmount: 75,
    confidence: "high" as const,
    usableForMetrics: true,
    reasonCodes: [
      "PUMPPORTAL_TOKEN_TRADE",
      "PUMPPORTAL_TRADE_USABLE_FOR_METRICS"
    ],
    payload: {
      type: "trade",
      source: "pumpportal",
      mint
    },
    createdAt: "2026-01-01T00:00:06.500Z"
  };
}

function createLiveFeedEvent() {
  return {
    sessionId: "test-session",
    provider: "pumpportal",
    eventType: "new_token",
    mint,
    name: "Mock Token",
    symbol: "MOCK",
    title: "MOCK - Mock Token",
    realData: true,
    reasonCodes: ["LIVE_FEED_EVENT", "REAL_FEED_NEW_TOKEN_EVENT"],
    payload: {
      type: "token_created",
      source: "pumpportal",
      mint
    },
    createdAt: "2026-01-01T00:00:06.750Z"
  };
}

function createActualDataSubscription() {
  return {
    mint,
    provider: "pumpportal",
    status: "subscribed",
    reason: "manual",
    eventCount: 2,
    maxEvents: 1000,
    subscribedAt: "2026-01-01T00:00:06.500Z",
    unsubscribedAt: null,
    reasonCodes: [
      "PUMPPORTAL_TRADE_STREAM_METERED",
      "PUMPPORTAL_TRADE_SUBSCRIBED"
    ],
    payload: {
      mint,
      status: "subscribed"
    },
    createdAt: "2026-01-01T00:00:06.500Z"
  };
}

function createActualDataSession() {
  return {
    provider: "pumpportal",
    status: "running",
    totalEventCount: 2,
    subscribedTokenCount: 1,
    budgetEventLimit: 5000,
    startedAt: "2026-01-01T00:00:06.000Z",
    stoppedAt: null,
    reasonCodes: ["PUMPPORTAL_TRADE_STREAM_METERED", "PAPER_ONLY"],
    payload: {
      status: "running"
    },
    createdAt: "2026-01-01T00:00:06.000Z"
  };
}

function createMeteredLaunchDataSession() {
  return {
    status: "running",
    mode: "newest",
    trackedMintCount: 1,
    totalEvents: 2,
    estimatedCostSol: 0.000002,
    budgetReached: false,
    reasonCodes: [
      "METERED_LAUNCH_DATA_READY",
      "METERED_LAUNCH_DATA_ONLY_NO_TRADING"
    ],
    payload: {
      status: "running"
    },
    startedAt: "2026-01-01T00:00:07.000Z",
    stoppedAt: null,
    createdAt: "2026-01-01T00:00:07.000Z"
  };
}

function createMeteredLaunchDataSubscription() {
  return {
    mint,
    status: "subscribed",
    reason: "manual",
    eventCount: 2,
    estimatedCostSol: 0.000002,
    subscribedAt: "2026-01-01T00:00:07.000Z",
    unsubscribedAt: null,
    reasonCodes: ["METERED_LAUNCH_DATA_TRACKING_STARTED"],
    payload: {
      mint,
      status: "tracking"
    },
    createdAt: "2026-01-01T00:00:07.000Z"
  };
}

function createMeteredLaunchDataEvent() {
  return {
    mint,
    signature: "metered-launch-signature-1",
    side: "buy" as const,
    trader: "11111111111111111111111111111111",
    priceSol: 0.02,
    volumeSol: 1.5,
    tokenAmount: 75,
    usableForMetrics: true,
    reasonCodes: ["METERED_LAUNCH_DATA_TOKEN_TRADE"],
    payload: {
      apiKey: "secret-api-key",
      mint,
      type: "trade"
    },
    createdAt: "2026-01-01T00:00:07.500Z"
  };
}

function createTokenIdentity() {
  return {
    ...normalizePumpPortalIdentity({
      image: "https://example.test/mock.png",
      metadataUri: "https://example.test/meta.json",
      mint,
      name: "Mock Token",
      symbol: "MOCK"
    }),
    firstSeenAt: "2026-01-01T00:00:06.700Z",
    updatedAt: "2026-01-01T00:00:06.700Z"
  };
}

function createTokenMetadataFetch() {
  return {
    mint,
    uri: "https://example.test/meta.json",
    source: "offchain_metadata",
    status: "success",
    reasonCodes: ["IDENTITY_FROM_OFFCHAIN_METADATA"],
    payload: {
      name: "Mock Token",
      symbol: "MOCK"
    },
    fetchedAt: "2026-01-01T00:00:06.800Z",
    createdAt: "2026-01-01T00:00:06.800Z"
  };
}

function createWatchPlanFixture(createdAt = "2026-01-01T00:00:07.000Z") {
  const target = {
    address: "11111111111111111111111111111111",
    kind: "mint" as const,
    mint,
    symbol: "MOCK",
    source: "pumpportal" as const,
    confidence: "medium" as const,
    reasonCodes: [
      "WATCH_TARGET_MINT",
      "WATCH_TARGET_MEDIUM_CONFIDENCE",
      "WATCH_TARGET_SELECTED"
    ],
    createdAt
  };

  return {
    mint,
    symbol: "MOCK",
    source: "pumpportal" as const,
    shouldVerifyMint: true,
    shouldWatchEvents: true,
    watchTargets: [target],
    skippedTargets: [],
    reasonCodes: [
      "WATCH_PLAN_CREATED",
      "VERIFY_ON_NEW_TOKEN",
      "WATCH_ON_NEW_TOKEN"
    ],
    payload: {
      source: "test"
    },
    createdAt
  };
}

function createWatchActionFixture(createdAt = "2026-01-01T00:00:08.000Z") {
  return {
    mint,
    action: "verify_mint",
    address: "11111111111111111111111111111111",
    addressKind: "mint" as const,
    status: "scheduled",
    reasonCodes: ["ORCHESTRATION_VERIFICATION_SCHEDULED"],
    payload: {
      source: "test"
    },
    createdAt
  };
}

function createCandidateDecision(): CandidateDecision {
  return {
    mint,
    symbol: "MOCK",
    source: "mock",
    lifecycleState: "qualified",
    action: "PAPER_BUY_READY",
    score: 88,
    riskLevel: "low",
    hardReject: false,
    riskReasonCodes: ["BASELINE_RISK"],
    scoreReasonCodes: ["STRONG_MOMENTUM"],
    combinedReasonCodes: [
      "PAPER_BUY_READY",
      "BASELINE_RISK",
      "STRONG_MOMENTUM"
    ],
    metricsSummary: {
      sampleCount: 12,
      insufficientMetrics: false,
      volume10sUsd: 5_000,
      volumeVelocity: 150,
      volumeAcceleration: 20,
      buyerVelocity: 0.5,
      buyerAcceleration: 0.1,
      priceVelocity: 1,
      buySellRatio: 2,
      netBuyPressure: 0.4,
      lastUpdatedAt: "2026-01-01T00:00:00.000Z"
    },
    riskSnapshotSummary: {
      riskLevel: "low",
      riskScore: 10,
      hardReject: false,
      humanSummary: "low risk"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createLaunchTimeseriesBucket() {
  return {
    schemaVersion: 1 as const,
    bucketMs: 1000 as const,
    mint,
    bucketStart: "2026-01-01T00:00:00.000Z",
    bucketEnd: "2026-01-01T00:00:01.000Z",
    firstTradeAt: "2026-01-01T00:00:00.100Z",
    lastTradeAt: "2026-01-01T00:00:00.500Z",
    openSol: 0.0004,
    highSol: 0.0004,
    lowSol: 0.0004,
    closeSol: 0.0004,
    volumeSol: 1,
    buyVolumeSol: 1,
    sellVolumeSol: 0,
    vwapSol: 0.0004,
    openUsd: null,
    highUsd: null,
    lowUsd: null,
    closeUsd: null,
    volumeUsd: 0,
    buyVolumeUsd: 0,
    sellVolumeUsd: 0,
    vwapUsd: null,
    tokenVolume: 1000,
    tradeCount: 1,
    buyCount: 1,
    sellCount: 0,
    uniqueBuyers: 1,
    uniqueSellers: 0,
    sourceCount: 1,
    sources: ["pumpportal"],
    confidence: "high" as const,
    complete: false,
    synthetic: false,
    reasonCodes: ["TIMESERIES_BUCKET_1S"],
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const
  };
}

function createPaperEvaluationDataset(
  partition: "train" | "validation",
  signalAt: string
): CalibrationDataset {
  const captureSessionId = `paper-evaluation-${partition}`;
  const outcomeAt = new Date(Date.parse(signalAt) + 60_000).toISOString();

  return {
    manifest: {
      schemaVersion: 1,
      captureVersion: "calibration-session-capture-v1",
      datasetId: `${captureSessionId}:launch-derivative-reference-v1:60000`,
      captureSessionId,
      runtimeSessionId: `runtime-${partition}`,
      strategyVersion: "launch-derivative-reference-v1",
      partition,
      generatedAt: "2026-01-03T00:00:00.000Z",
      horizonMs: 60_000,
      targetReturnPct: 5,
      estimatedCostPct: 1,
      observationCount: 1,
      completedObservationCount: 1,
      pendingObservationCount: 0,
      unavailableObservationCount: 0,
      excludedObservationCount: 0,
      automaticThresholdActivation: false,
      calibrated: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      reasonCodes: ["CALIBRATION_DATASET_FORWARD_ONLY"]
    },
    observations: [
      {
        observationId: `${captureSessionId}-1`,
        partition,
        strategyVersion: "launch-derivative-reference-v1",
        signalAt,
        outcomeAt,
        score: 85,
        targetReached: true,
        forwardReturnPct: 10,
        estimatedCostPct: 1,
        maxFavorableExcursionPct: 12,
        maxAdverseExcursionPct: -2
      }
    ]
  };
}

function createSignal(): OverlaySignal {
  return {
    mint,
    symbol: "MOCK",
    score: 88,
    action: "BUY_READY",
    hardReject: false,
    reasonCodes: ["STRONG_MOMENTUM"],
    volumeVelocity: 2.1,
    buyerVelocity: 1.9,
    riskFlags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      topHolderConcentrationHigh: false,
      mutableMetadata: false,
      suspiciousName: false,
      lowLiquidity: false,
      washTradingSuspected: false,
      honeypotSuspected: false
    },
    state: {
      candidate: {
        id: {
          chain: "solana",
          mint
        },
        mint,
        symbol: "MOCK",
        name: "Mock Token",
        source: "test",
        ageSeconds: 90,
        firstSeenAt: "2026-01-01T00:00:00.000Z"
      },
      metrics: {
        priceUsd: 0.00042,
        marketCapUsd: 50_000,
        liquidityUsd: 12_000,
        volume1mUsd: 7_500,
        volume5mUsd: 21_000,
        volume15mUsd: 38_000,
        buyCount1m: 42,
        buyCount5m: 120,
        sellCount1m: 18,
        sellCount5m: 64,
        uniqueBuyers1m: 33,
        uniqueBuyers5m: 90,
        uniqueSellers1m: 14,
        uniqueSellers5m: 42,
        holderCount: 260,
        topHolderPercent: 8,
        top10HolderPercent: 36,
        priceChange1mPct: 4,
        priceChange5mPct: 14,
        volumeVelocity: 2.1,
        buyerVelocity: 1.9
      },
      riskFlags: {
        mintAuthorityActive: false,
        freezeAuthorityActive: false,
        topHolderConcentrationHigh: false,
        mutableMetadata: false,
        suspiciousName: false,
        lowLiquidity: false,
        washTradingSuspected: false,
        honeypotSuspected: false
      },
      score: {
        total: 88,
        momentum: 82,
        quality: 79,
        riskPenalty: 0,
        hardReject: false,
        action: "BUY_READY",
        reasonCodes: ["STRONG_MOMENTUM"]
      },
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  };
}
