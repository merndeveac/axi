import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PumpPortalFeedProvider,
  type WebSocketLike
} from "@axi/data-feeds";
import {
  closeStorage,
  findTradeDataCoverageEventBySourceKey,
  getTradeDataCoverageSession,
  initStorage,
  listTradeDataCoverageEvents,
  listTradeDataCoverageSessions,
  listTradeDataSubscriptionEvents,
  saveTradeDataCoverageEvent,
  saveTradeDataCoverageSession,
  saveTradeDataSubscriptionEvent
} from "@axi/storage";
import {
  createActualDataConfig,
  createActualDataService
} from "./actual-data-service";
import {
  createMeteredLaunchDataConfig,
  createMeteredLaunchDataService,
  type MeteredLaunchDataClock,
  type TrackingExpiryOwner
} from "./metered-launch-data-service";
import { createTradeDataCoverageService } from "./trade-data-coverage-service";

const selectedMint = "CoverageMint1111111111111111111111111111111";
const epochMs = Date.parse("2026-08-12T00:00:00.000Z");

export type TradeDataCoverageLifecycleScenario =
  | "zero-trade"
  | "service-owned-control";

export type TradeDataCoverageLifecycleCheckpoint = {
  atMs: number | "finalization";
  tracked: boolean;
  stopRequestedCount: number;
  unsubscribeSentCount: number;
  finalizationCount: number;
  staleReasonObserved: boolean;
};

export type TradeDataCoverageLifecycleCheckResult = {
  success: boolean;
  scenario: TradeDataCoverageLifecycleScenario;
  expiryOwner: TrackingExpiryOwner;
  simulatedRuntimeMs: number;
  staleBoundaryMs: number;
  stopReason: string;
  stopRequestedCount: number;
  unsubscribeSentCount: number;
  unsubscribeAcknowledgedCount: number;
  finalizationCount: number;
  stopRequestedAt: string | null;
  unsubscribeSentAt: string | null;
  stopToUnsubscribeMs: number | null;
  stopBoundaryId: string | null;
  stopSequence: number | null;
  unsubscribeSequence: number | null;
  lifecycleSequenceValid: boolean;
  lifecycleEmbeddedCount: number;
  lifecyclePersistedCount: number;
  lifecycleResidual: number;
  staleTimerSuppressed: boolean;
  ordinaryStaleReasonObserved: boolean;
  activeTrackedMints: number;
  pendingTimerCount: number;
  externalNetworkConnections: 0;
  paidStreamStarted: false;
  postFinalizationMutationCount: number;
  restartSafeRetrieval: boolean;
  cleanupCompleted: boolean;
  checkpoints: TradeDataCoverageLifecycleCheckpoint[];
};

type TimerRecord = {
  id: number;
  atMs: number;
  handler: () => void;
};

class DeterministicClock implements MeteredLaunchDataClock {
  private currentMs = 0;
  private nextTimerId = 1;
  private readonly timers = new Map<number, TimerRecord>();

  now = (): Date => new Date(epochMs + this.currentMs);

  setTimeout = (
    handler: () => void,
    delayMs: number
  ): ReturnType<typeof setTimeout> => {
    const timer = {
      id: this.nextTimerId,
      atMs: this.currentMs + Math.max(0, delayMs),
      handler
    };
    this.nextTimerId += 1;
    this.timers.set(timer.id, timer);
    return timer as unknown as ReturnType<typeof setTimeout>;
  };

  clearTimeout = (handle: ReturnType<typeof setTimeout>): void => {
    const timer = handle as unknown as { id?: number };
    if (timer.id !== undefined) {
      this.timers.delete(timer.id);
    }
  };

  advanceTo(targetMs: number): void {
    if (targetMs < this.currentMs) {
      throw new Error("Deterministic clock cannot move backwards.");
    }
    while (true) {
      const next = [...this.timers.values()]
        .filter((timer) => timer.atMs <= targetMs)
        .sort((left, right) => left.atMs - right.atMs || left.id - right.id)[0];
      if (!next) {
        break;
      }
      this.currentMs = next.atMs;
      this.timers.delete(next.id);
      next.handler();
    }
    this.currentMs = targetMs;
  }

  get pendingTimerCount(): number {
    return this.timers.size;
  }
}

class OfflineWebSocket implements WebSocketLike {
  static instances: OfflineWebSocket[] = [];
  readonly sent: string[] = [];
  private readonly handlers = new Map<
    string,
    Array<(...args: unknown[]) => void>
  >();

  constructor(readonly url: string) {
    OfflineWebSocket.instances.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => void): WebSocketLike {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit("close");
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

export async function runTradeDataCoverageLifecycleCheck(input: {
  scenario: TradeDataCoverageLifecycleScenario;
  runtimeMs: number;
  staleNoTradesMs: number;
  graceMs: number;
}): Promise<TradeDataCoverageLifecycleCheckResult> {
  const ordinaryControl = runServiceOwnedControl(input.staleNoTradesMs);
  if (input.scenario === "service-owned-control") {
    return ordinaryControl;
  }
  return runCoverageOwnedZeroTrade(input, ordinaryControl.success);
}

function runCoverageOwnedZeroTrade(
  input: {
    runtimeMs: number;
    staleNoTradesMs: number;
    graceMs: number;
  },
  ordinaryStaleReasonObserved: boolean
): TradeDataCoverageLifecycleCheckResult {
  const directory = mkdtempSync(join(tmpdir(), "axi-coverage-lifecycle-"));
  const databasePath = join(directory, "lifecycle.sqlite");
  const clock = new DeterministicClock();
  OfflineWebSocket.instances = [];
  initStorage({ databasePath });
  const provider = createOfflineProvider(clock);
  const actualData = createOfflineActualData(provider);
  const metered = createOfflineMeteredService({
    actualData,
    clock,
    expiryOwner: "coverage_validator",
    staleNoTradesMs: input.staleNoTradesMs,
    runtimeMs: input.runtimeMs,
    graceMs: input.graceMs
  });
  const coverage = createTradeDataCoverageService({
    provider: "pumpportal",
    sourceMode: "offline_lifecycle_check",
    estimatedCostPerEventSol: 0.000001,
    now: clock.now,
    monotonicNow: () => clock.now().getTime() - epochMs,
    persistence: {
      saveSession: saveTradeDataCoverageSession,
      saveEvent: saveTradeDataCoverageEvent,
      saveSubscriptionEvent: saveTradeDataSubscriptionEvent,
      findEventBySourceKey: findTradeDataCoverageEventBySourceKey,
      getSession: getTradeDataCoverageSession,
      listSessions: listTradeDataCoverageSessions,
      listEvents: listTradeDataCoverageEvents,
      listSubscriptionEvents: listTradeDataSubscriptionEvents
    }
  });
  provider.setTradeInstrumentation(coverage.createFeedInstrumentation());
  provider.start(() => undefined);
  const socket = requireOfflineSocket();
  socket.emit("open");
  actualData.start();
  metered.prepare();
  const sessionId = "offline-zero-trade-coverage-lifecycle";
  const checkpoints: TradeDataCoverageLifecycleCheckpoint[] = [];
  let summary = coverage.begin({
    sessionId,
    selectedMint,
    maxEvents: 50,
    maxRuntimeMs: input.runtimeMs,
    maxCostSol: 0.0001,
    postStopGraceMs: input.graceMs,
    onStopRequested: (reason) => {
      metered.stopCoverageOwnedMint(selectedMint, reason);
    }
  });
  metered.trackMint(selectedMint, "trade_data_coverage");
  socket.emit("message", JSON.stringify({ message: "subscribed" }));

  for (const atMs of checkpointTimes(input.runtimeMs)) {
    clock.advanceTo(atMs);
    coverage.enforceRuntimeCap();
    summary = coverage.getSummary() ?? summary;
    checkpoints.push(
      checkpoint(atMs, metered.getTrackedMints().length > 0, summary)
    );
  }

  socket.emit("message", JSON.stringify({ message: "unsubscribed" }));
  coverage.beginGrace("max_runtime");
  clock.advanceTo(input.runtimeMs + input.graceMs);
  const finalized = coverage.finalize("max_runtime");
  if (!finalized) {
    throw new Error("Offline zero-trade lifecycle did not finalize.");
  }
  checkpoints.push(
    checkpoint("finalization", metered.getTrackedMints().length > 0, finalized)
  );
  const lifecycleCountBeforePostFinalizeAdvance =
    finalized.subscriptionLifecycle.length;
  clock.advanceTo(input.runtimeMs + input.graceMs + input.staleNoTradesMs + 1);
  const afterFinalization = coverage.getSummary() ?? finalized;
  const postFinalizationMutationCount = Math.abs(
    afterFinalization.subscriptionLifecycle.length -
      lifecycleCountBeforePostFinalizeAdvance
  );
  const persistedLifecycle = listTradeDataSubscriptionEvents({
    sessionId,
    limit: 100,
    offset: 0
  }).reverse();
  const lifecycleEmbedded = finalized.subscriptionLifecycle;
  const lifecycleSequenceValid = lifecycleOrderIsValid(lifecycleEmbedded);
  const stopRequestedAt = lifecycleTimestamp(
    lifecycleEmbedded,
    "stop_requested"
  );
  const unsubscribeSentAt = lifecycleTimestamp(
    lifecycleEmbedded,
    "unsubscribe_sent"
  );
  const stopToUnsubscribeMs = timestampDifference(
    stopRequestedAt,
    unsubscribeSentAt
  );
  const stopSequence = lifecycleSequence(
    lifecycleEmbedded,
    "stop_requested"
  );
  const unsubscribeSequence = lifecycleSequence(
    lifecycleEmbedded,
    "unsubscribe_sent"
  );
  const stopBoundaryId = lifecycleEmbedded.find(
    (event) => event.eventType === "stop_requested"
  )?.subscriptionEventId ?? null;
  const expiryDiagnostics = metered.getExpiryDiagnostics(selectedMint);
  metered.stop();
  actualData.stop();
  provider.stop();
  const pendingTimerCount =
    clock.pendingTimerCount +
    metered.getExpiryDiagnostics(selectedMint).pendingTimerCount;
  const activeTrackedMints = metered.getTrackedMints().length;
  const cleanupCompleted =
    activeTrackedMints === 0 && pendingTimerCount === 0;
  const result: TradeDataCoverageLifecycleCheckResult = {
    success: false,
    scenario: "zero-trade",
    expiryOwner: "coverage_validator",
    simulatedRuntimeMs: input.runtimeMs,
    staleBoundaryMs: input.staleNoTradesMs,
    stopReason: finalized.stopReason ?? "UNKNOWN",
    stopRequestedCount: lifecycleEventCount(
      lifecycleEmbedded,
      "stop_requested"
    ),
    unsubscribeSentCount: lifecycleEventCount(
      lifecycleEmbedded,
      "unsubscribe_sent"
    ),
    unsubscribeAcknowledgedCount: lifecycleEventCount(
      lifecycleEmbedded,
      "unsubscribe_acknowledged"
    ),
    finalizationCount: lifecycleEventCount(lifecycleEmbedded, "finalized"),
    stopRequestedAt,
    unsubscribeSentAt,
    stopToUnsubscribeMs,
    stopBoundaryId,
    stopSequence,
    unsubscribeSequence,
    lifecycleSequenceValid,
    lifecycleEmbeddedCount: lifecycleEmbedded.length,
    lifecyclePersistedCount: persistedLifecycle.length,
    lifecycleResidual: lifecycleEmbedded.length - persistedLifecycle.length,
    staleTimerSuppressed: expiryDiagnostics.staleTimerSuppressed,
    ordinaryStaleReasonObserved,
    activeTrackedMints,
    pendingTimerCount,
    externalNetworkConnections: 0,
    paidStreamStarted: false,
    postFinalizationMutationCount,
    restartSafeRetrieval: false,
    cleanupCompleted,
    checkpoints
  };
  closeStorage();
  initStorage({ databasePath });
  result.restartSafeRetrieval =
    getTradeDataCoverageSession(sessionId)?.sessionId === sessionId;
  closeStorage();
  const runtimeCheckpoint = checkpoints.find(
    (item) => item.atMs === input.runtimeMs
  );
  result.success =
    result.stopReason === "MAX_RUNTIME" &&
    result.stopRequestedCount === 1 &&
    result.unsubscribeSentCount === 1 &&
    result.finalizationCount === 1 &&
    result.stopToUnsubscribeMs !== null &&
    result.stopToUnsubscribeMs >= 0 &&
    result.stopSequence !== null &&
    result.unsubscribeSequence !== null &&
    result.stopSequence < result.unsubscribeSequence &&
    result.lifecycleSequenceValid &&
    result.lifecycleResidual === 0 &&
    result.staleTimerSuppressed &&
    result.ordinaryStaleReasonObserved &&
    result.activeTrackedMints === 0 &&
    result.pendingTimerCount === 0 &&
    result.postFinalizationMutationCount === 0 &&
    result.restartSafeRetrieval &&
    result.cleanupCompleted &&
    runtimeCheckpoint?.tracked === false &&
    runtimeCheckpoint.stopRequestedCount === 1 &&
    runtimeCheckpoint.unsubscribeSentCount === 1 &&
    runtimeCheckpoint.finalizationCount === 0 &&
    checkpoints
      .filter((item) => item.atMs !== input.runtimeMs)
      .every(
        (item) =>
          item.atMs === "finalization" ||
          (item.tracked &&
            item.stopRequestedCount === 0 &&
            item.unsubscribeSentCount === 0 &&
            item.finalizationCount === 0 &&
            !item.staleReasonObserved)
      );
  rmSync(directory, { recursive: true, force: true });
  return result;
}

function runServiceOwnedControl(
  staleNoTradesMs: number
): TradeDataCoverageLifecycleCheckResult {
  const directory = mkdtempSync(join(tmpdir(), "axi-service-expiry-"));
  const databasePath = join(directory, "control.sqlite");
  const clock = new DeterministicClock();
  OfflineWebSocket.instances = [];
  initStorage({ databasePath });
  const provider = createOfflineProvider(clock);
  const actualData = createOfflineActualData(provider);
  const metered = createOfflineMeteredService({
    actualData,
    clock,
    expiryOwner: "metered_service",
    staleNoTradesMs,
    runtimeMs: 90_000,
    graceMs: 5_000
  });
  provider.start(() => undefined);
  const socket = requireOfflineSocket();
  socket.emit("open");
  actualData.start();
  metered.prepare();
  metered.trackMint(selectedMint, "ordinary_runtime_control");
  const checkpoints = [
    checkpointForMetered(0, metered, socket),
    advanceMeteredCheckpoint(clock, staleNoTradesMs - 1, metered, socket),
    advanceMeteredCheckpoint(clock, staleNoTradesMs, metered, socket)
  ];
  const tracked = metered.getTrackedMint(selectedMint);
  const ordinaryStaleReasonObserved =
    tracked?.reasonCodes.includes("METERED_LAUNCH_DATA_STALE_NO_TRADES") ===
    true;
  const unsubscribeSentCount = sentMethodCount(
    socket,
    "unsubscribeTokenTrade"
  );
  metered.stop();
  actualData.stop();
  provider.stop();
  const pendingTimerCount =
    clock.pendingTimerCount +
    metered.getExpiryDiagnostics(selectedMint).pendingTimerCount;
  const activeTrackedMints = metered.getTrackedMints().length;
  const cleanupCompleted =
    activeTrackedMints === 0 && pendingTimerCount === 0;
  const success =
    checkpoints[0]?.tracked === true &&
    checkpoints[1]?.tracked === true &&
    checkpoints[2]?.tracked === false &&
    unsubscribeSentCount === 1 &&
    ordinaryStaleReasonObserved &&
    cleanupCompleted;
  closeStorage();
  rmSync(directory, { recursive: true, force: true });
  return {
    success,
    scenario: "service-owned-control",
    expiryOwner: "metered_service",
    simulatedRuntimeMs: staleNoTradesMs,
    staleBoundaryMs: staleNoTradesMs,
    stopReason: "STALE_NO_TRADES",
    stopRequestedCount: 0,
    unsubscribeSentCount,
    unsubscribeAcknowledgedCount: 0,
    finalizationCount: 0,
    stopRequestedAt: null,
    unsubscribeSentAt: null,
    stopToUnsubscribeMs: null,
    stopBoundaryId: null,
    stopSequence: null,
    unsubscribeSequence: null,
    lifecycleSequenceValid: true,
    lifecycleEmbeddedCount: 0,
    lifecyclePersistedCount: 0,
    lifecycleResidual: 0,
    staleTimerSuppressed: false,
    ordinaryStaleReasonObserved,
    activeTrackedMints,
    pendingTimerCount,
    externalNetworkConnections: 0,
    paidStreamStarted: false,
    postFinalizationMutationCount: 0,
    restartSafeRetrieval: true,
    cleanupCompleted,
    checkpoints
  };
}

function createOfflineProvider(clock: DeterministicClock): PumpPortalFeedProvider {
  return new PumpPortalFeedProvider({
    maxAccountTradeSubscriptions: 0,
    maxTokenTradeEventsPerMint: 1_000,
    maxTokenTradeEventsPerSession: 1_000,
    maxTokenTradeSubscriptions: 1,
    now: clock.now,
    subscribeMigration: false,
    subscribeNewToken: false,
    webSocketConstructor: OfflineWebSocket,
    wsUrl: "wss://offline.invalid/pumpportal"
  });
}

function createOfflineActualData(provider: PumpPortalFeedProvider) {
  return createActualDataService({
    config: createActualDataConfig({
      acknowledgedMetered: true,
      apiKeyConfigured: true,
      enabled: true,
      maxEventsPerMint: 1_000,
      maxEventsPerSession: 1_000,
      maxSubscribedTokens: 1,
      requireApiKey: false,
      unsubscribeAfterMs: 0
    }),
    dataWalletReadiness: () => ({
      balanceSol: null,
      balanceStatus: "unknown",
      configured: true,
      estimatedEventsRemaining: null,
      reasonCodes: ["OFFLINE_FIXTURE"],
      subscriptionBlockers: []
    }),
    providerName: "pumpportal",
    pumpPortalProvider: provider
  });
}

function createOfflineMeteredService(input: {
  actualData: ReturnType<typeof createActualDataService>;
  clock: DeterministicClock;
  expiryOwner: TrackingExpiryOwner;
  staleNoTradesMs: number;
  runtimeMs: number;
  graceMs: number;
}) {
  return createMeteredLaunchDataService({
    actualData: input.actualData,
    clock: input.clock,
    config: createMeteredLaunchDataConfig({
      acknowledgedCost: true,
      apiKeyConfigured: true,
      autoUnsubscribeOnHardReject: true,
      autoUnsubscribeOnLowScore: true,
      controlsEnabled: true,
      dataWalletPublicKeyConfigured: true,
      enabled: true,
      extendedTrackMs: input.runtimeMs + input.graceMs + 1,
      initialTrackMs: input.runtimeMs + input.graceMs + 1,
      maxConcurrentMints: 1,
      maxEventsPerMint: 50,
      maxEventsPerSession: 50,
      maxSessionCostSol: 0.0001,
      maxUiSessionCostSol: 0.0001,
      mode: "manual",
      requireDataWalletReady: false,
      requireUiAck: false,
      rollingTrackerEnabled: false,
      staleNoTradesMs: input.staleNoTradesMs,
      startActive: true,
      trackingExpiryOwner: input.expiryOwner
    }),
    dataWalletReadiness: () => ({
      balanceSol: null,
      balanceStatus: "unknown",
      configured: true,
      estimatedEventsRemaining: null,
      reasonCodes: ["OFFLINE_FIXTURE"],
      subscriptionBlockers: []
    }),
    providerName: "pumpportal"
  });
}

function requireOfflineSocket(): OfflineWebSocket {
  const socket = OfflineWebSocket.instances.at(-1);
  if (!socket) {
    throw new Error("Offline lifecycle socket was not constructed.");
  }
  return socket;
}

function checkpointTimes(runtimeMs: number): number[] {
  return [29_999, 30_000, 30_001, 60_000, 89_999, runtimeMs].filter(
    (value, index, values) =>
      value >= 0 && value <= runtimeMs && values.indexOf(value) === index
  );
}

function checkpoint(
  atMs: number | "finalization",
  tracked: boolean,
  summary: {
    subscriptionLifecycle: Array<{ eventType: string }>;
  }
): TradeDataCoverageLifecycleCheckpoint {
  return {
    atMs,
    tracked,
    stopRequestedCount: lifecycleEventCount(
      summary.subscriptionLifecycle,
      "stop_requested"
    ),
    unsubscribeSentCount: lifecycleEventCount(
      summary.subscriptionLifecycle,
      "unsubscribe_sent"
    ),
    finalizationCount: lifecycleEventCount(
      summary.subscriptionLifecycle,
      "finalized"
    ),
    staleReasonObserved: false
  };
}

function checkpointForMetered(
  atMs: number,
  metered: ReturnType<typeof createMeteredLaunchDataService>,
  socket: OfflineWebSocket
): TradeDataCoverageLifecycleCheckpoint {
  const tracked = metered.getTrackedMint(selectedMint);
  return {
    atMs,
    tracked: tracked?.status === "tracking",
    stopRequestedCount: 0,
    unsubscribeSentCount: sentMethodCount(socket, "unsubscribeTokenTrade"),
    finalizationCount: 0,
    staleReasonObserved:
      tracked?.reasonCodes.includes("METERED_LAUNCH_DATA_STALE_NO_TRADES") ===
      true
  };
}

function advanceMeteredCheckpoint(
  clock: DeterministicClock,
  atMs: number,
  metered: ReturnType<typeof createMeteredLaunchDataService>,
  socket: OfflineWebSocket
): TradeDataCoverageLifecycleCheckpoint {
  clock.advanceTo(atMs);
  return checkpointForMetered(atMs, metered, socket);
}

function lifecycleEventCount(
  lifecycle: Array<{ eventType: string }>,
  eventType: string
): number {
  return lifecycle.filter((event) => event.eventType === eventType).length;
}

function lifecycleTimestamp(
  lifecycle: Array<{ eventType: string; timestamp?: string }>,
  eventType: string
): string | null {
  return lifecycle.find((event) => event.eventType === eventType)?.timestamp ?? null;
}

function lifecycleSequence(
  lifecycle: Array<{ eventType: string }>,
  eventType: string
): number | null {
  const index = lifecycle.findIndex((event) => event.eventType === eventType);
  return index >= 0 ? index + 1 : null;
}

function timestampDifference(
  start: string | null,
  end: string | null
): number | null {
  if (!start || !end) {
    return null;
  }
  return Date.parse(end) - Date.parse(start);
}

function lifecycleOrderIsValid(
  lifecycle: Array<{ eventType: string }>
): boolean {
  const stop = lifecycle.findIndex((event) => event.eventType === "stop_requested");
  const unsubscribe = lifecycle.findIndex(
    (event) => event.eventType === "unsubscribe_sent"
  );
  const acknowledgement = lifecycle.findIndex(
    (event) => event.eventType === "unsubscribe_acknowledged"
  );
  return (
    stop >= 0 &&
    unsubscribe > stop &&
    (acknowledgement < 0 || acknowledgement >= unsubscribe)
  );
}

function sentMethodCount(socket: OfflineWebSocket, method: string): number {
  return socket.sent.filter((item) => {
    try {
      return (JSON.parse(item) as { method?: string }).method === method;
    } catch {
      return false;
    }
  }).length;
}
