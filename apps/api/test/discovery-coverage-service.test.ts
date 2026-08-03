import { describe, expect, it } from "vitest";
import type {
  PumpPortalDiscoveryInstrumentation,
  PumpPortalDiscoveryParserObservation,
  TokenCreatedEvent
} from "@axi/data-feeds";
import type {
  DiscoveryCoverageConnectionEvent,
  DiscoveryCoverageEvent,
  DiscoveryCoverageEventQuery,
  DiscoveryCoverageSession
} from "@axi/shared";
import {
  createDiscoveryCoverageService,
  createPumpPortalDiscoverySourceEventKey,
  deterministicPercentile
} from "../src/discovery-coverage-service";

describe("DiscoveryCoverageService", () => {
  it("deduplicates stable creates across different local receive times", () => {
    const persistence = createMemoryPersistence();
    const service = createService(persistence);
    const instrumentation = service.createFeedInstrumentation();
    const event = createEvent("create", "same-signature");
    const first = observeDiscovery(
      instrumentation,
      event,
      "correlation-1",
      "2026-08-02T00:00:01.000Z"
    );
    const second = observeDiscovery(
      instrumentation,
      event,
      "correlation-2",
      "2026-08-02T00:00:09.000Z"
    );

    expect(first.discoveryCoverage?.sourceEventKey).toBe(
      second.discoveryCoverage?.sourceEventKey
    );
    expect(second.duplicate).toBe(true);
    expect(service.getSummary()).toMatchObject({
      normalizationSuccessCount: 2,
      duplicateCount: 1,
      queueAcceptedCount: 0
    });
  });

  it("keeps create and migration keys distinct for one mint", () => {
    const create = createEvent("create", "shared-signature");
    const migration = createEvent("migration", "shared-signature");
    expect(create.candidate.mint).toBe(migration.candidate.mint);
    expect(createPumpPortalDiscoverySourceEventKey(create, null)).not.toBe(
      createPumpPortalDiscoverySourceEventKey(migration, null)
    );
  });

  it("reconciles a completed event with every required downstream stage", () => {
    const persistence = createMemoryPersistence();
    const service = createService(persistence);
    const observed = observeDiscovery(
      service.createFeedInstrumentation(),
      createEvent("create", "success-signature"),
      "correlation-success",
      "2026-08-02T00:00:01.000Z"
    );
    const event = observed.event;
    service.markQueueAccepted(event);
    service.markQueueTransactionStarted(event);
    service.markIdentityCompleted(event, true);
    service.markLiveTokenCompleted(event, true);
    service.markCandidateCompleted(event, true);
    service.markScoreCompleted(event);
    service.markPersistenceCompleted(event);
    service.markScannerProjected(event);
    service.markBroadcastAttempted(event);
    service.markBroadcastCompleted(event, 0);
    service.markQueueCommittedAndPipelineCompleted([event]);

    const summary = service.getSummary();
    expect(summary.pipelineCompletedCount).toBe(1);
    expect(summary.localReconciliationStatus).toBe("LOCALLY_RECONCILED");
    expect(summary.reconciliation.maximumAbsoluteResidual).toBe(0);
    expect(summary.upstreamCoverageStatus).toBe("UNPROVEN");
  });

  it("marks an entire failed batch and cleared pending events terminal", () => {
    const persistence = createMemoryPersistence();
    const service = createService(persistence);
    const instrumentation = service.createFeedInstrumentation();
    const events = ["a", "b", "c"].map((suffix, index) =>
      observeDiscovery(
        instrumentation,
        createEvent("create", `signature-${suffix}`),
        `correlation-${suffix}`,
        `2026-08-02T00:00:0${index + 1}.000Z`
      ).event
    );
    for (const event of events) {
      service.markQueueAccepted(event);
    }
    service.markQueueTransactionStarted(events[0]!);
    service.markQueueTransactionStarted(events[1]!);
    service.markQueueFailedOrDropped(
      events.slice(0, 2),
      "queue_transaction_failed",
      "SQLITE_ERROR"
    );
    service.markQueueFailedOrDropped(
      events.slice(2),
      "pending_queue_cleared",
      "SQLITE_ERROR"
    );

    expect(service.getSummary()).toMatchObject({
      queueAcceptedCount: 3,
      queueFailureCount: 3,
      pipelineFailedOrDroppedCount: 3,
      localReconciliationStatus: "LOCALLY_RECONCILED"
    });
    expect(persistence.events.every((event) => event.completedAt)).toBe(true);
  });

  it("surfaces telemetry persistence failure without throwing discovery", () => {
    const persistence = createMemoryPersistence();
    persistence.failEventWrites = true;
    const service = createService(persistence);
    expect(() =>
      observeDiscovery(
        service.createFeedInstrumentation(),
        createEvent("create", "write-failure"),
        "correlation-write-failure",
        "2026-08-02T00:00:01.000Z"
      )
    ).not.toThrow();
    expect(service.getSummary()).toMatchObject({
      localReconciliationStatus: "LOCAL_RECONCILIATION_FAILED"
    });
    expect(service.getSummary().telemetryFailureCount).toBeGreaterThan(0);
  });

  it("records reconnect duration and never upgrades upstream gap evidence", () => {
    const persistence = createMemoryPersistence();
    const service = createService(persistence);
    const instrumentation = service.createFeedInstrumentation();
    instrumentation.onConnectionEvent({
      eventType: "disconnected",
      connectionId: "connection-1",
      observedAt: "2026-08-02T00:00:01.000Z",
      reconnectAttempt: 0,
      replayAttempted: false,
      replayResult: null,
      gapStatus: "unproven",
      safeReason: "CLOSE_CODE_1006"
    });
    instrumentation.onConnectionEvent({
      eventType: "reconnect_attempt",
      connectionId: "connection-2",
      observedAt: "2026-08-02T00:00:02.000Z",
      reconnectAttempt: 1,
      replayAttempted: true,
      replayResult: null,
      gapStatus: "unproven",
      safeReason: "UPSTREAM_SEQUENCE_UNAVAILABLE"
    });
    instrumentation.onConnectionEvent({
      eventType: "connection_opened",
      connectionId: "connection-2",
      observedAt: "2026-08-02T00:00:04.000Z",
      reconnectAttempt: 1,
      replayAttempted: true,
      replayResult: "subscriptions_replayed",
      gapStatus: "unproven",
      safeReason: "UPSTREAM_SEQUENCE_UNAVAILABLE"
    });
    instrumentation.onConnectionEvent({
      eventType: "reconnect_success",
      connectionId: "connection-2",
      observedAt: "2026-08-02T00:00:04.000Z",
      reconnectAttempt: 1,
      replayAttempted: true,
      replayResult: "subscriptions_replayed",
      gapStatus: "unproven",
      safeReason: "UPSTREAM_SEQUENCE_UNAVAILABLE"
    });

    expect(service.getSummary()).toMatchObject({
      reconnectAttemptCount: 1,
      reconnectSuccessCount: 1,
      disconnectedDurationMs: 3_000,
      upstreamCoverageStatus: "UNPROVEN"
    });
  });

  it("uses deterministic nearest-rank percentiles and rejects negative samples", () => {
    const values = [100, 1, 2, 3, 4, 5, -1, Number.NaN];
    expect(deterministicPercentile(values, 0.5)).toBe(3);
    expect(deterministicPercentile(values, 0.95)).toBe(100);
    expect(deterministicPercentile([], 0.5)).toBeNull();
  });
});

function createService(persistence: ReturnType<typeof createMemoryPersistence>) {
  let monotonicMs = 10;
  return createDiscoveryCoverageService({
    sessionId: "coverage-session",
    provider: "pumpportal",
    sourceMode: "live",
    startedAt: "2026-08-02T00:00:00.000Z",
    now: () => new Date("2026-08-02T00:00:10.000Z"),
    monotonicNow: () => (monotonicMs += 10),
    persistence
  });
}

function observeDiscovery(
  instrumentation: PumpPortalDiscoveryInstrumentation,
  event: TokenCreatedEvent,
  correlationId: string,
  receivedAt: string
) {
  const eventType =
    event.rawSourceEventType === "migration" ? "migration" : "create";
  const parserOutcome =
    eventType === "migration" ? "recognized_migration" : "recognized_create";
  instrumentation.onRawFrame({
    correlationId,
    receivedAt,
    receivedAtMonotonicMs: 10
  });
  const parserObservation: PumpPortalDiscoveryParserObservation = {
    correlationId,
    receivedAt,
    receivedAtMonotonicMs: 10,
    eventType,
    parserOutcome,
    providerTimestamp: event.timestamp,
    safePayloadHash: "safe-shape-hash",
    topLevelKeys: ["mint", "signature", "txType"],
    rejectionReason: null
  };
  instrumentation.onParserOutcome(parserObservation);
  const result = instrumentation.onNormalizationOutcome({
    ...parserObservation,
    event,
    normalizedAt: "2026-08-02T00:00:03.000Z",
    normalizedAtMonotonicMs: 30
  });
  if (!result) {
    throw new Error("Expected discovery normalization result");
  }
  return {
    duplicate: result.duplicate,
    discoveryCoverage: result.metadata,
    event: { ...event, discoveryCoverage: result.metadata }
  };
}

function createEvent(
  eventType: "create" | "migration",
  signature: string
): TokenCreatedEvent {
  const mint = "CoverageMint1111111111111111111111111111111";
  return {
    type: "token_created",
    source: "pumpportal",
    timestamp: "2026-08-02T00:00:00.000Z",
    receivedAt: "2026-08-02T00:00:01.000Z",
    rawSourceEventType: eventType === "migration" ? "migration" : "new_token",
    signature,
    candidate: {
      id: { chain: "solana", mint },
      mint,
      symbol: "COVER",
      name: "Coverage Token",
      source: "pumpportal",
      ageSeconds: 0,
      firstSeenAt: "2026-08-02T00:00:00.000Z"
    },
    metrics: emptyMetrics(),
    metricsComplete: false,
    riskFlags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      topHolderConcentrationHigh: false,
      mutableMetadata: false,
      suspiciousName: false,
      lowLiquidity: true,
      washTradingSuspected: false,
      honeypotSuspected: false
    },
    raw: { instructionIndex: 1 }
  };
}

function emptyMetrics(): TokenCreatedEvent["metrics"] {
  return {
    priceUsd: 0,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: 0,
    volume5mUsd: 0,
    volume15mUsd: 0,
    buyCount1m: 0,
    buyCount5m: 0,
    sellCount1m: 0,
    sellCount5m: 0,
    uniqueBuyers1m: 0,
    uniqueBuyers5m: 0,
    uniqueSellers1m: 0,
    uniqueSellers5m: 0,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: 0,
    priceChange5mPct: 0,
    volumeVelocity: 0,
    buyerVelocity: 0
  };
}

function createMemoryPersistence() {
  const sessions = new Map<string, DiscoveryCoverageSession>();
  const events: DiscoveryCoverageEvent[] = [];
  const connections: DiscoveryCoverageConnectionEvent[] = [];
  return {
    sessions,
    events,
    connections,
    failEventWrites: false,
    saveSession(session: DiscoveryCoverageSession) {
      sessions.set(session.sessionId, session);
    },
    saveEvent(event: DiscoveryCoverageEvent) {
      if (this.failEventWrites) {
        throw new Error("simulated persistence failure");
      }
      const index = events.findIndex(
        (current) =>
          current.sessionId === event.sessionId &&
          current.correlationId === event.correlationId
      );
      if (index >= 0) {
        events[index] = event;
      } else {
        events.push(event);
      }
    },
    saveConnectionEvent(event: DiscoveryCoverageConnectionEvent) {
      connections.push(event);
    },
    findEventBySourceKey(sourceEventKey: string, eventType: "create" | "migration") {
      return (
        events.find(
          (event) =>
            event.sourceEventKey === sourceEventKey &&
            event.eventType === eventType
        ) ?? null
      );
    },
    getSession(sessionId: string) {
      return sessions.get(sessionId) ?? null;
    },
    listSessions(limit: number) {
      return [...sessions.values()].slice(0, limit);
    },
    listEvents(query: DiscoveryCoverageEventQuery) {
      return events.slice(query.offset, query.offset + query.limit);
    }
  };
}
