import type { ActualDataService } from "./actual-data-service";
import type { MeteredLaunchDataService } from "./metered-launch-data-service";

export const safeMeteredRuntimeDefaults = {
  maxConcurrentMints: 3,
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
}) {
  const actualDataStatus = input.actualData.getStatus();
  const meteredStatus = input.meteredLaunchData.getStatus();
  const configured = {
    maxConcurrentMints: meteredStatus.maxConcurrentMints,
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
    version: 1,
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
      capacityModel: "@axi/capacity-model",
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
    roadmap: {
      coverageCapacityInstrumentation: "implemented",
      rollingNewestTokenScheduler: "not_implemented",
      schedulerMutationApplied: false
    },
    deprecatedMutationRoutes: [
      "/actual-data/subscribe",
      "/launch/track",
      "/live/trade-tracking/track"
    ]
  };
}
