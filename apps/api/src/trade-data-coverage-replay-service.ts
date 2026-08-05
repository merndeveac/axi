import { createHash } from "node:crypto";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  normalizePumpPortalTokenTradePayload,
  type PumpPortalTradeInstrumentation,
  type TokenTradeEvent
} from "@axi/data-feeds";
import type { NormalizedTokenTradeEvent } from "@axi/indexer-core";
import type { TradeDataCoverageEvent } from "@axi/shared";
import {
  closeStorage,
  findTradeDataCoverageEventBySourceKey,
  getTradeDataCoverageSession,
  initStorage,
  initStorageReadOnly,
  listPumpPortalTokenTradeEventsByMint,
  listTradeDataCoverageEvents,
  listTradeDataCoverageSessions,
  listTradeDataSubscriptionEvents,
  saveMeteredLaunchDataEvent,
  saveMeteredLaunchDataSession,
  saveMeteredLaunchDataSubscription,
  savePumpPortalTokenTradeEvent,
  saveTradeDataCoverageEvent,
  saveTradeDataCoverageSession,
  saveTradeDataSubscriptionEvent,
  type StoredPumpPortalTokenTradeEvent
} from "@axi/storage";
import { createTradeTimeseries } from "@axi/timeseries";
import { createTradeDataCoverageService } from "./trade-data-coverage-service";

const expectedLifecycleSequence = [
  "track_requested",
  "subscribe_sent",
  "subscribe_acknowledged",
  "active",
  "first_trade_received",
  "stop_requested",
  "unsubscribe_sent",
  "grace_started",
  "unsubscribe_acknowledged",
  "finalized"
] as const;

export type TradeDataCoverageReplayFrame = {
  raw: Record<string, unknown>;
  receivedAt: string;
  priorPriceVolumeMismatch: boolean;
};

export type TradeDataCoverageReplayResult = {
  status: "OFFLINE_REPLAY_PASSED" | "OFFLINE_REPLAY_FAILED";
  observedMatchingTrades: number;
  canonicalAdmittedTrades: number;
  postStopEvidenceOnlyTrades: number;
  canonicalBusinessTradeRows: number;
  canonicalTimeSeriesSourceEvents: number;
  postStopCanonicalMutations: number;
  lifecycleEmbeddedEvents: number;
  lifecyclePersistedEvents: number;
  lifecycleResidual: number;
  lifecycleSequenceMatches: boolean;
  telemetryFailures: number;
  estimatedBillableMessages: number;
  estimatedCostSol: number;
  maximumAbsoluteCounterResidual: number;
  sessionSubscriptionCounterResidual: number;
  priceConsistency: {
    priorFailures: number;
    roundingComparisonDefects: number;
    differentPriceSemanticsDefects: number;
    unitUncertainty: number;
    genuineInconsistency: number;
    correctedExecutionIdentityPasses: number;
    correctedExecutionIdentityFailures: number;
    expectedCurveExecutionSpreads: number;
  };
  latency: {
    receiveToScannerP95Ms: number | null;
    receiveToScannerMaxMs: number | null;
    queueWaitP95Ms: number | null;
    databaseWriteP95Ms: number | null;
    processingWallTimeMs: number;
  };
  sourceDatabaseUnchanged: boolean;
  deterministic: boolean;
  networkConnections: 0;
  paidStreamsStarted: 0;
  liveTradingEnabled: false;
};

export type ReplayFramesOptions = {
  frames: TradeDataCoverageReplayFrame[];
  selectedMint: string;
  sourceStartedAt: string;
  targetSessionId?: string;
  maxEvents?: number;
  maxCostSol?: number;
  estimatedCostPerEventSol?: number;
  useRealMonotonicClock?: boolean;
};

export function loadReplayFramesFromDatabase(input: {
  databasePath: string;
  sessionId: string;
}): {
  frames: TradeDataCoverageReplayFrame[];
  selectedMint: string;
  sourceStartedAt: string;
} {
  const handle = initStorageReadOnly({ databasePath: input.databasePath });
  try {
    const session = getTradeDataCoverageSession(input.sessionId);
    if (!session) {
      throw new Error("Requested trade coverage session was not found.");
    }
    const coverageEvents = listTradeDataCoverageEvents({
      sessionId: input.sessionId,
      limit: 1000,
      offset: 0
    })
      .filter(
        (event) =>
          event.parserOutcome === "recognized_trade" &&
          event.observedMint === session.selectedMint
      )
      .sort(compareCoverageEvents);
    const storedTrades = listPumpPortalTokenTradeEventsByMint(
      session.selectedMint,
      1000
    );
    const tradesBySignature = new Map(
      storedTrades
        .filter((trade) => trade.signature)
        .map((trade) => [trade.signature as string, trade])
    );
    const frames = coverageEvents.map((event) => {
      const stored = event.signature
        ? tradesBySignature.get(event.signature)
        : undefined;
      const raw = getStoredRawPayload(stored);
      if (!raw) {
        throw new Error(
          "Captured session does not contain replayable raw trade evidence."
        );
      }
      return {
        raw,
        receivedAt: event.receivedAt,
        priorPriceVolumeMismatch:
          event.consistencyChecks.price_volume_consistency?.status === "failed"
      };
    });
    return {
      frames,
      selectedMint: session.selectedMint,
      sourceStartedAt: session.startedAt
    };
  } finally {
    closeStorage(handle);
  }
}

export function replayTradeDataCoverageFrames(
  options: ReplayFramesOptions
): TradeDataCoverageReplayResult {
  const maxEvents = options.maxEvents ?? 50;
  const estimatedCostPerEventSol = options.estimatedCostPerEventSol ?? 0.000001;
  let wallClockMs = Date.parse(options.sourceStartedAt);
  if (!Number.isFinite(wallClockMs)) {
    throw new Error("Replay source start timestamp is invalid.");
  }
  let deterministicMonotonicMs = 0;
  const monotonicNow = options.useRealMonotonicClock
    ? () => performance.now()
    : () => deterministicMonotonicMs;
  const now = () => new Date(wallClockMs);
  const tick = (milliseconds = 1) => {
    wallClockMs += milliseconds;
    if (!options.useRealMonotonicClock) {
      deterministicMonotonicMs += milliseconds;
    }
  };
  const service = createTradeDataCoverageService({
    provider: "pumpportal-offline-replay",
    sourceMode: "offline_replay",
    estimatedCostPerEventSol,
    now,
    monotonicNow,
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
  const instrumentation: PumpPortalTradeInstrumentation =
    service.createFeedInstrumentation();
  let unsubscribeCount = 0;
  const sessionId =
    options.targetSessionId ?? "trade-data-coverage-offline-replay";
  service.begin({
    sessionId,
    selectedMint: options.selectedMint,
    maxEvents,
    maxRuntimeMs: 90_000,
    maxCostSol: options.maxCostSol ?? 0.001,
    postStopGraceMs: 5_000,
    onStopRequested: () => {
      unsubscribeCount += 1;
      instrumentation.onSubscriptionEvent({
        eventType: "unsubscribe_sent",
        mint: options.selectedMint,
        timestamp: now().toISOString(),
        safeReason: null,
        reasonCodes: ["OFFLINE_REPLAY_UNSUBSCRIBE_SENT"]
      });
      service.beginGrace("offline_replay_boundary");
    }
  });
  appendOpeningLifecycle(instrumentation, options.selectedMint, now);
  const timeseries = createTradeTimeseries();
  timeseries.trackMint(options.selectedMint);
  const replayStartedAt = performance.now();

  for (const [index, frame] of options.frames.entries()) {
    const receivedAtMs = Date.parse(frame.receivedAt);
    if (Number.isFinite(receivedAtMs)) {
      wallClockMs = Math.max(wallClockMs, receivedAtMs);
    }
    const correlationId = `offline-replay-frame-${String(index + 1).padStart(4, "0")}`;
    const receivedAtMonotonicMs = monotonicNow();
    instrumentation.onRawFrame({
      correlationId,
      receivedAt: frame.receivedAt,
      receivedAtMonotonicMs
    });
    tick();
    const trade = normalizePumpPortalTokenTradePayload(frame.raw, { now });
    if (trade) {
      trade.receivedAt = frame.receivedAt;
    }
    const parserObservation = {
      correlationId,
      receivedAt: frame.receivedAt,
      receivedAtMonotonicMs,
      parserOutcome: trade
        ? ("recognized_trade" as const)
        : ("unknown_payload" as const),
      providerTimestamp: trade?.providerTimestamp ?? null,
      safePayloadHash: safeShapeHash(frame.raw),
      topLevelKeys: Object.keys(frame.raw).sort().slice(0, 100),
      rejectionReason: trade ? null : "OFFLINE_REPLAY_NORMALIZATION_UNAVAILABLE"
    };
    instrumentation.onParserOutcome(parserObservation);
    tick();
    const normalization = instrumentation.onNormalizationOutcome({
      ...parserObservation,
      event: trade,
      normalizedAt: now().toISOString(),
      normalizedAtMonotonicMs: monotonicNow()
    });
    if (
      !trade ||
      !normalization?.acceptedForPipeline ||
      !normalization.metadata
    ) {
      continue;
    }
    trade.tradeCoverage = normalization.metadata;
    processCanonicalReplayTrade({
      index,
      service,
      tick,
      timeseries,
      trade
    });
  }

  service.requestStop("offline_replay_input_exhausted");
  tick();
  instrumentation.onSubscriptionEvent({
    eventType: "unsubscribe_acknowledged",
    mint: options.selectedMint,
    timestamp: now().toISOString(),
    safeReason: "OFFLINE_REPLAY_ACKNOWLEDGEMENT",
    reasonCodes: ["OFFLINE_REPLAY_UNSUBSCRIBE_ACKNOWLEDGED"]
  });
  tick();
  const summary = service.finalize("offline_replay_complete");
  if (!summary) {
    throw new Error("Offline replay did not produce a coverage summary.");
  }
  const processingWallTimeMs = options.useRealMonotonicClock
    ? roundMs(performance.now() - replayStartedAt)
    : roundMs(deterministicMonotonicMs);
  const finalAt = summary.stoppedAt ?? now().toISOString();
  const meteredSubscription = saveMeteredLaunchDataSubscription({
    mint: options.selectedMint,
    status: "unsubscribed",
    reason: "offline_replay_complete",
    eventCount: summary.canonicalAdmittedTradeCount,
    postStopEventCount: summary.postStopObservedTradeCount,
    billableEventCount: summary.estimatedBillableMessageCount,
    estimatedCostSol: summary.estimatedCostSol,
    subscribedAt: summary.startedAt,
    unsubscribedAt: finalAt,
    reasonCodes: ["OFFLINE_REPLAY_COUNTERS_RECONCILED"],
    payload: { offlineReplay: true },
    createdAt: finalAt
  });
  const meteredSession = saveMeteredLaunchDataSession({
    status: "stopped",
    mode: "offline_replay",
    trackedMintCount: 0,
    totalEvents: summary.estimatedBillableMessageCount,
    estimatedCostSol: summary.estimatedCostSol,
    budgetReached: summary.canonicalAdmittedTradeCount >= maxEvents,
    reasonCodes: ["OFFLINE_REPLAY_COUNTERS_RECONCILED"],
    payload: { offlineReplay: true },
    startedAt: summary.startedAt,
    stoppedAt: finalAt,
    createdAt: finalAt
  });
  const replayEvents = listTradeDataCoverageEvents({
    sessionId,
    limit: 1000,
    offset: 0
  });
  const lifecycle = [...summary.subscriptionLifecycle].map(
    (event) => event.eventType
  );
  const priceConsistency = classifyPriceConsistency(
    options.frames,
    replayEvents
  );
  const sessionSubscriptionCounterResidual = Math.max(
    Math.abs(
      meteredSubscription.eventCount - summary.canonicalAdmittedTradeCount
    ),
    Math.abs(
      meteredSubscription.postStopEventCount -
        summary.postStopObservedTradeCount
    ),
    Math.abs(
      meteredSubscription.billableEventCount -
        summary.estimatedBillableMessageCount
    ),
    Math.abs(meteredSession.totalEvents - summary.estimatedBillableMessageCount)
  );
  const lifecycleSequenceMatches = arraysEqual(
    lifecycle,
    expectedLifecycleSequence
  );
  const latency = summary.latencyDistributions;
  const passed =
    summary.recognizedMatchingTradeFrameCount === options.frames.length &&
    summary.canonicalAdmittedTradeCount ===
      Math.min(maxEvents, options.frames.length) &&
    summary.postStopObservedTradeCount ===
      Math.max(0, options.frames.length - maxEvents) &&
    summary.canonicalBusinessTradeCount ===
      summary.canonicalAdmittedTradeCount &&
    summary.canonicalTimeSeriesSourceEventCount ===
      summary.canonicalAdmittedTradeCount &&
    summary.postStopCanonicalMutationCount === 0 &&
    summary.lifecycleResidual === 0 &&
    lifecycleSequenceMatches &&
    summary.telemetryFailureCount === 0 &&
    summary.maximumAbsoluteCounterResidual === 0 &&
    sessionSubscriptionCounterResidual === 0 &&
    unsubscribeCount === 1 &&
    priceConsistency.correctedExecutionIdentityFailures === 0;

  return {
    status: passed ? "OFFLINE_REPLAY_PASSED" : "OFFLINE_REPLAY_FAILED",
    observedMatchingTrades: summary.recognizedMatchingTradeFrameCount,
    canonicalAdmittedTrades: summary.canonicalAdmittedTradeCount,
    postStopEvidenceOnlyTrades: summary.postStopEvidencePersistedCount,
    canonicalBusinessTradeRows: summary.canonicalBusinessTradeCount,
    canonicalTimeSeriesSourceEvents:
      summary.canonicalTimeSeriesSourceEventCount,
    postStopCanonicalMutations: summary.postStopCanonicalMutationCount,
    lifecycleEmbeddedEvents: summary.lifecycleEmbeddedEventCount,
    lifecyclePersistedEvents: summary.lifecyclePersistedEventCount,
    lifecycleResidual: summary.lifecycleResidual,
    lifecycleSequenceMatches,
    telemetryFailures: summary.telemetryFailureCount,
    estimatedBillableMessages: summary.estimatedBillableMessageCount,
    estimatedCostSol: summary.estimatedCostSol,
    maximumAbsoluteCounterResidual: summary.maximumAbsoluteCounterResidual,
    sessionSubscriptionCounterResidual,
    priceConsistency,
    latency: {
      receiveToScannerP95Ms: latency.receive_to_scanner?.p95 ?? null,
      receiveToScannerMaxMs: latency.receive_to_scanner?.max ?? null,
      queueWaitP95Ms: latency.queue_wait?.p95 ?? null,
      databaseWriteP95Ms: latency.database_write?.p95 ?? null,
      processingWallTimeMs
    },
    sourceDatabaseUnchanged: true,
    deterministic: !options.useRealMonotonicClock,
    networkConnections: 0,
    paidStreamsStarted: 0,
    liveTradingEnabled: false
  };
}

export function runOfflineTradeDataCoverageReplay(input: {
  fromDatabase: string;
  sessionId: string;
  outputDatabase?: string;
}): TradeDataCoverageReplayResult {
  const sourcePath = resolve(input.fromDatabase);
  const outputPath = input.outputDatabase
    ? resolve(input.outputDatabase)
    : null;
  if (outputPath === sourcePath) {
    throw new Error(
      "Replay output database must differ from the source database."
    );
  }
  const sourceFingerprintBefore = fingerprintFile(sourcePath);
  const source = loadReplayFramesFromDatabase({
    databasePath: sourcePath,
    sessionId: input.sessionId
  });
  const temporaryDirectory = outputPath
    ? null
    : mkdtempSync(join(tmpdir(), "axi-trade-coverage-replay-"));
  const targetPath =
    outputPath ?? join(temporaryDirectory as string, "replay.sqlite");
  const targetHandle = initStorage({ databasePath: targetPath });
  let result: TradeDataCoverageReplayResult;
  try {
    result = replayTradeDataCoverageFrames({
      ...source,
      targetSessionId: "trade-data-coverage-offline-replay",
      maxEvents: 50,
      estimatedCostPerEventSol: 0.000001
    });
  } finally {
    closeStorage(targetHandle);
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  const sourceDatabaseUnchanged =
    sourceFingerprintBefore === fingerprintFile(sourcePath);
  return {
    ...result,
    sourceDatabaseUnchanged,
    status:
      result.status === "OFFLINE_REPLAY_PASSED" && sourceDatabaseUnchanged
        ? "OFFLINE_REPLAY_PASSED"
        : "OFFLINE_REPLAY_FAILED"
  };
}

export function runDeterministicTradeDataCoverageBurstBenchmark(): {
  status: "BURST_BENCHMARK_PASSED" | "BURST_BENCHMARK_FAILED";
  frameCount: 65;
  maximumQueueDepth: 1;
  allCanonicalPersistenceCompleted: boolean;
  result: TradeDataCoverageReplayResult;
} {
  const directory = mkdtempSync(join(tmpdir(), "axi-trade-coverage-burst-"));
  const databasePath = join(directory, "benchmark.sqlite");
  const handle = initStorage({ databasePath });
  let result: TradeDataCoverageReplayResult;
  try {
    result = replayTradeDataCoverageFrames({
      frames: createDeterministicBurstFrames(65),
      selectedMint: "So11111111111111111111111111111111111111112",
      sourceStartedAt: "2026-08-04T00:00:00.000Z",
      targetSessionId: "trade-data-coverage-burst-benchmark",
      maxEvents: 50,
      estimatedCostPerEventSol: 0.000001,
      useRealMonotonicClock: true
    });
  } finally {
    closeStorage(handle);
    rmSync(directory, { recursive: true, force: true });
  }
  const p95 = result.latency.receiveToScannerP95Ms;
  const maximum = result.latency.receiveToScannerMaxMs;
  const allCanonicalPersistenceCompleted =
    result.canonicalBusinessTradeRows === 50 &&
    result.canonicalTimeSeriesSourceEvents === 50;
  const passed =
    result.status === "OFFLINE_REPLAY_PASSED" &&
    p95 !== null &&
    p95 <= 1_000 &&
    maximum !== null &&
    maximum <= 2_000 &&
    allCanonicalPersistenceCompleted;
  return {
    status: passed ? "BURST_BENCHMARK_PASSED" : "BURST_BENCHMARK_FAILED",
    frameCount: 65,
    maximumQueueDepth: 1,
    allCanonicalPersistenceCompleted,
    result
  };
}

function processCanonicalReplayTrade(input: {
  index: number;
  service: ReturnType<typeof createTradeDataCoverageService>;
  tick: (milliseconds?: number) => void;
  timeseries: ReturnType<typeof createTradeTimeseries>;
  trade: TokenTradeEvent;
}): void {
  const { index, service, tick, timeseries, trade } = input;
  tick();
  service.markQueueAccepted(trade);
  tick();
  service.markQueueTransactionStarted(trade);
  tick();
  service.markDatabaseWriteStarted(trade);
  savePumpPortalTokenTradeEvent({
    mint: trade.mint,
    signature: trade.signature ?? null,
    side: trade.side,
    trader: trade.trader ?? null,
    priceSol: trade.priceSol ?? null,
    volumeSol: trade.volumeSol ?? null,
    tokenAmount: trade.tokenAmount ?? null,
    confidence: trade.confidence ?? "low",
    usableForMetrics: trade.usableForMetrics === true,
    reasonCodes: trade.reasonCodes ?? [],
    payload: trade,
    createdAt: trade.timestamp
  });
  saveMeteredLaunchDataEvent({
    mint: trade.mint,
    signature: trade.signature ?? null,
    side: trade.side,
    trader: trade.trader ?? null,
    priceSol: trade.priceSol ?? null,
    volumeSol: trade.volumeSol ?? null,
    tokenAmount: trade.tokenAmount ?? null,
    usableForMetrics: trade.usableForMetrics === true,
    reasonCodes: ["OFFLINE_REPLAY_CANONICAL_METERED_EVENT"],
    payload: { offlineReplay: true },
    createdAt: trade.timestamp
  });
  tick();
  service.markPersistenceCompleted(trade);
  service.markDatabaseCommitted(trade);
  tick();
  const normalized = toTimeseriesTrade(trade);
  const ingest = timeseries.ingestTradeWithResult(normalized);
  const series = timeseries.getSeries(trade.mint, { fillGaps: false });
  const derivativeMetrics = series.derivatives.primary.metrics;
  service.markTimeseries(trade, {
    action: ingest.action,
    bucketUpdated: ingest.bucket !== null,
    rollingWindowsUpdated: ingest.accepted,
    oneSecondBucketCount: series.actualBucketCount,
    completedOneSecondBucketCount: series.buckets.filter(
      (bucket) => !bucket.synthetic && bucket.complete
    ).length,
    validSampleCount: series.derivatives.observationCount,
    firstDerivativeAvailable: [
      derivativeMetrics.volumeVelocitySolPerSec,
      derivativeMetrics.priceSolVelocityPerSec,
      derivativeMetrics.buyerVelocityPerSec,
      derivativeMetrics.tradeVelocityPerSec,
      derivativeMetrics.buyPressureVelocityPerSec
    ].some((metric) => metric.status === "available"),
    secondDerivativeAvailable: [
      derivativeMetrics.volumeAccelerationSolPerSec2,
      derivativeMetrics.priceSolAccelerationPerSec2,
      derivativeMetrics.buyerAccelerationPerSec2,
      derivativeMetrics.tradeAccelerationPerSec2,
      derivativeMetrics.buyPressureAccelerationPerSec2
    ].some((metric) => metric.status === "available")
  });
  tick();
  service.markDerivativeStrengthUpdated(trade);
  const sourceEventKey = trade.tradeCoverage?.sourceEventKey;
  if (!sourceEventKey) {
    throw new Error("Admitted replay trade is missing its source event key.");
  }
  const decision = {
    decisionId: `offline-replay-decision-${index + 1}`,
    decisionVersion: index + 1,
    sourceEventKey
  };
  tick();
  service.markSignalComputed(trade, decision);
  tick();
  service.markScannerProjected(trade, decision);
  tick();
  service.markBroadcastCompleted(trade);
  tick();
  service.markSignalPersisted(trade, decision);
  tick();
  service.markQueueCommittedAndPipelineCompleted([trade]);
}

function createDeterministicBurstFrames(
  count: number
): TradeDataCoverageReplayFrame[] {
  const mint = "So11111111111111111111111111111111111111112";
  return Array.from({ length: count }, (_, index) => {
    const receivedAt = new Date(
      Date.parse("2026-08-04T00:00:00.000Z") + index * 75
    ).toISOString();
    const tokenAmount = 100_000 + index * 100;
    const solAmount = 0.25 + index * 0.001;
    return {
      raw: {
        mint,
        signature: `offline-signature-${String(index + 1).padStart(4, "0")}`,
        traderPublicKey: "11111111111111111111111111111111",
        txType: index % 3 === 0 ? "sell" : "buy",
        solAmount,
        tokenAmount,
        newTokenBalance: 2_000_000 + tokenAmount,
        vSolInBondingCurve: 30 + index * 0.25,
        vTokensInBondingCurve: 10_000_000 - index * 1_000,
        marketCapSol: 30 + index * 0.5,
        timestamp: receivedAt
      },
      receivedAt,
      priorPriceVolumeMismatch: false
    };
  });
}

function appendOpeningLifecycle(
  instrumentation: PumpPortalTradeInstrumentation,
  mint: string,
  now: () => Date
): void {
  for (const eventType of [
    "subscribe_sent",
    "subscribe_acknowledged",
    "active"
  ] as const) {
    instrumentation.onSubscriptionEvent({
      eventType,
      mint,
      timestamp: now().toISOString(),
      safeReason: "OFFLINE_REPLAY_LIFECYCLE",
      reasonCodes: [`OFFLINE_REPLAY_${eventType.toUpperCase()}`]
    });
  }
}

function toTimeseriesTrade(trade: TokenTradeEvent): NormalizedTokenTradeEvent {
  const receivedAt =
    trade.receivedAt ?? trade.timestamp ?? new Date(0).toISOString();
  return {
    id:
      trade.tradeCoverage?.sourceEventKey ??
      `offline-replay:${trade.signature ?? trade.timestamp}`,
    schemaVersion: 1,
    source: "pumpportal-offline-replay",
    sourceMode: "replay",
    chain: "solana",
    signature: trade.signature ?? null,
    receivedAt,
    processedAt: receivedAt,
    raw: undefined,
    reasonCodes: trade.reasonCodes ?? [],
    type: "token_trade",
    mint: trade.mint,
    side: trade.side,
    trader: trade.trader ?? null,
    priceSol: trade.priceSol ?? null,
    priceUsd: trade.priceUsd ?? null,
    volumeSol: trade.volumeSol ?? null,
    volumeUsd: trade.volumeUsd ?? null,
    tokenAmount: trade.tokenAmount ?? null,
    pool: trade.marketObservation ? "pump-fun" : null,
    bondingCurve: trade.bondingCurve ?? null,
    confidence: trade.confidence ?? "low",
    usableForMetrics: trade.usableForMetrics === true
  };
}

function classifyPriceConsistency(
  frames: TradeDataCoverageReplayFrame[],
  replayEvents: TradeDataCoverageEvent[]
): TradeDataCoverageReplayResult["priceConsistency"] {
  const byCorrelation = new Map(
    replayEvents.map((event) => [event.correlationId, event])
  );
  let roundingComparisonDefects = 0;
  let differentPriceSemanticsDefects = 0;
  let unitUncertainty = 0;
  let genuineInconsistency = 0;
  for (const [index, frame] of frames.entries()) {
    if (!frame.priorPriceVolumeMismatch) {
      continue;
    }
    const event = byCorrelation.get(
      `offline-replay-frame-${String(index + 1).padStart(4, "0")}`
    );
    const identity = event?.consistencyChecks.price_volume_consistency;
    const units = event?.consistencyChecks.amount_units_understood;
    if (units?.classification === "unit_unproven") {
      unitUncertainty += 1;
    } else if (identity?.status === "passed") {
      roundingComparisonDefects += 1;
    } else if (
      event?.consistencyChecks.curve_price_consistency?.classification ===
      "expected_spread"
    ) {
      differentPriceSemanticsDefects += 1;
    } else {
      genuineInconsistency += 1;
    }
  }
  return {
    priorFailures: frames.filter((frame) => frame.priorPriceVolumeMismatch)
      .length,
    roundingComparisonDefects,
    differentPriceSemanticsDefects,
    unitUncertainty,
    genuineInconsistency,
    correctedExecutionIdentityPasses: replayEvents.filter(
      (event) =>
        event.consistencyChecks.price_volume_consistency?.status === "passed"
    ).length,
    correctedExecutionIdentityFailures: replayEvents.filter(
      (event) =>
        event.consistencyChecks.price_volume_consistency?.status === "failed"
    ).length,
    expectedCurveExecutionSpreads: replayEvents.filter(
      (event) =>
        event.consistencyChecks.curve_price_consistency?.classification ===
        "expected_spread"
    ).length
  };
}

function getStoredRawPayload(
  stored: StoredPumpPortalTokenTradeEvent | undefined
): Record<string, unknown> | null {
  const payload = asRecord(stored?.payload);
  return asRecord(payload?.raw);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function compareCoverageEvents(
  left: TradeDataCoverageEvent,
  right: TradeDataCoverageEvent
): number {
  return (
    Date.parse(left.receivedAt) - Date.parse(right.receivedAt) ||
    left.correlationId.localeCompare(right.correlationId)
  );
}

function safeShapeHash(payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(Object.keys(payload).sort().join("\n"))
    .digest("hex");
}

function fingerprintFile(path: string): string {
  const stat = statSync(path, { bigint: true });
  const sampleSize = Number(stat.size < 65_536n ? stat.size : 65_536n);
  const first = Buffer.alloc(sampleSize);
  const last = Buffer.alloc(sampleSize);
  const descriptor = openSync(path, "r");
  try {
    readSync(descriptor, first, 0, sampleSize, 0);
    readSync(
      descriptor,
      last,
      0,
      sampleSize,
      Number(stat.size - BigInt(sampleSize))
    );
  } finally {
    closeSync(descriptor);
  }
  return createHash("sha256")
    .update(String(stat.size))
    .update(String(stat.mtimeNs))
    .update(first)
    .update(last)
    .digest("hex");
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}
