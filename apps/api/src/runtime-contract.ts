import type { TradeTimeseriesStatus } from "@axi/timeseries";
import { getDerivativeStrengthRuntimeContract } from "@axi/derivative-strength";
import { getSignalCalibrationRuntimeContract } from "@axi/signal-calibration";
import { getSessionCaptureRuntimeContract } from "@axi/session-capture";
import { getPaperStrategyEvaluationRuntimeContract } from "@axi/paper-strategy-evaluation";
import { getPaperLifecycleValidationRuntimeContract } from "@axi/paper-lifecycle-validation";
import { getPaperExitPolicyRuntimeContract } from "@axi/exit-strategy";
import { getPaperAutomationRuntimeContract } from "@axi/paper-automation";
import type { ActualDataService } from "./actual-data-service";
import type { MeteredLaunchDataService } from "./metered-launch-data-service";

export const safeMeteredRuntimeDefaults = {
  maxConcurrentMints: 3,
  reservedNewestSlots: 1,
  maxProtectedMints: 2,
  schedulerQueueLimit: 50,
  schedulerQueueMaxAgeMs: 30_000,
  maxEventsPerMint: 250,
  maxEventsPerSession: 1_000,
  maxSessionCostSol: 0.001,
  maxUiSessionCostSol: 0.001
} as const;

export type RuntimeContract = ReturnType<typeof createRuntimeContract>;

export function createRuntimeContract(input: {
  actualData: ActualDataService;
  allowedControlOrigins: readonly string[];
  apiHost: string;
  meteredLaunchData: MeteredLaunchDataService;
  runtimeSessionId: string;
  timeseries: TradeTimeseriesStatus;
}) {
  const actualDataStatus = input.actualData.getStatus();
  const meteredStatus = input.meteredLaunchData.getStatus();
  const configured = {
    maxConcurrentMints: meteredStatus.maxConcurrentMints,
    reservedNewestSlots: meteredStatus.scheduler.reservedNewestSlots,
    maxProtectedMints: meteredStatus.scheduler.configuredMaxProtectedMints,
    schedulerQueueLimit: meteredStatus.scheduler.queueLimit,
    schedulerQueueMaxAgeMs: meteredStatus.scheduler.queueMaxAgeMs,
    maxEventsPerMint: meteredStatus.maxEventsPerMint,
    maxEventsPerSession: meteredStatus.maxEventsPerSession,
    maxSessionCostSol: meteredStatus.maxSessionCostSol,
    maxUiSessionCostSol: meteredStatus.maxUiSessionCostSol
  };
  const drift = Object.entries(safeMeteredRuntimeDefaults).flatMap(
    ([key, expected]) =>
      configured[key as keyof typeof configured] === expected
        ? []
        : [
            {
              code: "SAFE_DEFAULT_DRIFT",
              key,
              expected,
              actual: configured[key as keyof typeof configured]
            }
          ]
  );

  return {
    version: 11,
    runtimeSessionId: input.runtimeSessionId,
    safety: {
      paperOnly: true,
      dataOnly: true,
      liveExecution: "disabled",
      tradingDisabled: true,
      localMutationGuard: true,
      apiHost: input.apiHost,
      allowedControlOrigins: input.allowedControlOrigins
    },
    ownership: {
      discoveryAndLaunchScoring: "LaunchScannerService",
      subscriptionTransport: "ActualDataService",
      subscriptionPolicy: "MeteredLaunchDataService",
      providerConnection: "PumpPortalFeedProvider",
      rollingMetrics: "@axi/metrics",
      canonicalTimeseries: "@axi/timeseries",
      canonicalDerivatives: "@axi/derivatives",
      canonicalDerivativeStrength: "@axi/derivative-strength",
      signalCalibration: "@axi/signal-calibration",
      calibrationSessionCapture: "@axi/session-capture",
      paperStrategyEvaluation: "@axi/paper-strategy-evaluation",
      paperLifecycleValidation: "@axi/paper-lifecycle-validation",
      paperAutomation: "@axi/paper-automation",
      paperExitPolicy: "@axi/exit-strategy",
      capacityModel: "@axi/capacity-model",
      trackingScheduler: "@axi/tracking-scheduler",
      paperPortfolio: "@axi/paper-portfolio",
      trackingCommandRoute: "/metered-launch-data/track"
    },
    subscriptionPolicy: {
      controlsEnabled: meteredStatus.controlsEnabled,
      enabled: meteredStatus.enabled,
      active: meteredStatus.active,
      acknowledgedCost: meteredStatus.acknowledgedCost,
      requireUiAck: meteredStatus.requireUiAck,
      configured,
      scheduler: meteredStatus.scheduler,
      transport: {
        provider: actualDataStatus.provider,
        subscriptionCount: actualDataStatus.subscribedTokenCount,
        sessionEventCount: actualDataStatus.totalEventsThisSession
      }
    },
    configuration: {
      expected: safeMeteredRuntimeDefaults,
      drift,
      driftDetected: drift.length > 0
    },
    timeseries: input.timeseries,
    derivatives: {
      canonical: true,
      method: input.timeseries.derivativeMethod,
      primaryWindowMs: 5_000,
      firstDerivativeMinSamples: 2,
      secondDerivativeMinSamples: 3,
      derivativeReadyMintCount: input.timeseries.derivativeReadyMintCount,
      accelerationReadyMintCount: input.timeseries.accelerationReadyMintCount,
      unavailableValue: null,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    },
    derivativeStrength: {
      ...getDerivativeStrengthRuntimeContract(),
      onlineCohortPolicy: "same_age_prior_snapshots_only" as const
    },
    signalCalibration: getSignalCalibrationRuntimeContract(),
    sessionCapture: getSessionCaptureRuntimeContract(),
    paperStrategyEvaluation: getPaperStrategyEvaluationRuntimeContract(),
    paperLifecycleValidation: getPaperLifecycleValidationRuntimeContract(),
    paperAutomation: getPaperAutomationRuntimeContract(),
    paperExitPolicy: getPaperExitPolicyRuntimeContract(),
    roadmap: {
      coverageCapacityInstrumentation: "implemented",
      rollingNewestTokenScheduler: "implemented",
      canonicalOneSecondTimeseries: "implemented",
      derivativeCorrectness: "implemented",
      derivativeStrengthNormalization: "implemented",
      signalCalibrationFramework: "implemented",
      calibrationSessionCapture: "implemented",
      paperStrategyEvaluation: "implemented",
      paperLifecycleValidation: "implemented",
      paperAutomationForwardValidation: "implemented",
      paperExitPolicy: "implemented",
      schedulerMutationApplied:
        meteredStatus.scheduler.trackingMutationCount > 0
    },
    deprecatedMutationRoutes: [
      "/actual-data/subscribe",
      "/launch/track",
      "/live/trade-tracking/track"
    ]
  };
}
