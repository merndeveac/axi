import {
  evaluateCapacityModel,
  evaluateCapacityScenarios,
  type CapacityModelInput,
  type CapacityModelResult,
  type CapacityScenarioResult
} from "@axi/capacity-model";
import type {
  MeteredLaunchDataCost,
  MeteredLaunchDataRateObservation,
  MeteredLaunchDataStatus
} from "./metered-launch-data-service";

export type RuntimeCapacityReport = CapacityModelResult & {
  generatedAt: string;
  runtimeSessionId: string;
  scenarios: CapacityScenarioResult[];
  sources: {
    discovery: "LaunchScannerService";
    eventRate: "MeteredLaunchDataService";
    policy: "MeteredLaunchDataService";
    model: "@axi/capacity-model";
  };
};

export function createRuntimeCapacityReport(input: {
  runtimeSessionId: string;
  runtimeStartedAt: string;
  launchDiscoveryTimestamps: string[];
  meteredStatus: MeteredLaunchDataStatus;
  meteredCost: MeteredLaunchDataCost;
  rateObservation: MeteredLaunchDataRateObservation;
  now?: string | Date;
}): RuntimeCapacityReport {
  const nowMs = toFiniteTime(input.now ?? new Date(), Date.now());
  const runtimeStartedAtMs = toFiniteTime(input.runtimeStartedAt, nowMs);
  const configuredWindowMs = Math.max(1_000, input.rateObservation.windowMs);
  const runtimeAgeMs = Math.max(1_000, nowMs - runtimeStartedAtMs);
  const observationWindowMs = Math.min(configuredWindowMs, runtimeAgeMs);
  const cutoffMs = nowMs - observationWindowMs;
  const launchCount = input.launchDiscoveryTimestamps.flatMap((timestamp) => {
    const timestampMs = Date.parse(timestamp);
    return Number.isFinite(timestampMs) && timestampMs >= cutoffMs
      ? [timestamp]
      : [];
  }).length;
  const modelInput: CapacityModelInput = {
    observationWindowMs,
    launchCount,
    tradeEventCount: input.rateObservation.eventCount,
    concurrentSlots: input.meteredStatus.maxConcurrentMints,
    trackedMintCount: input.meteredStatus.trackedMintCount,
    protectedMintCount: input.meteredStatus.protectedMintCount,
    initialObservationMs: input.meteredStatus.initialTrackMs,
    extendedObservationMs: input.meteredStatus.extendedTrackMs,
    staleNoTradesMs: input.meteredStatus.staleNoTradesMs,
    totalEventsThisSession: input.meteredCost.totalEventsThisSession,
    maxEventsPerSession: input.meteredCost.maxEventsPerSession,
    estimatedSessionCostSol: input.meteredCost.estimatedCostSol,
    maxSessionCostSol: input.meteredCost.maxSessionCostSol,
    eventCostSolPer10000: input.meteredCost.eventCostSolPer10000,
    schedulerMutationApplied:
      input.meteredStatus.scheduler.trackingMutationCount > 0
  };
  const result = evaluateCapacityModel(modelInput);

  return {
    ...result,
    generatedAt: new Date(nowMs).toISOString(),
    runtimeSessionId: input.runtimeSessionId,
    scenarios: evaluateCapacityScenarios(modelInput),
    sources: {
      discovery: "LaunchScannerService",
      eventRate: "MeteredLaunchDataService",
      policy: "MeteredLaunchDataService",
      model: "@axi/capacity-model"
    }
  };
}

function toFiniteTime(value: string | Date, fallback: number): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
