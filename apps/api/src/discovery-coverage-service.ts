import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type {
  FeedEvent,
  PumpPortalDiscoveryConnectionObservation,
  PumpPortalDiscoveryInstrumentation,
  PumpPortalDiscoveryNormalizationObservation,
  PumpPortalDiscoveryNormalizationResult,
  TokenCreatedEvent
} from "@axi/data-feeds";
import {
  DiscoveryCoverageConnectionEventSchema,
  DiscoveryCoverageEventSchema,
  DiscoveryCoverageSessionSchema,
  discoveryCoverageLatencyKeys,
  type DiscoveryCoverageConnectionEvent,
  type DiscoveryCoverageEquation,
  type DiscoveryCoverageEvent,
  type DiscoveryCoverageEventQuery,
  type DiscoveryCoverageLatencyDistribution,
  type DiscoveryCoverageLatencyKey,
  type DiscoveryCoverageSession,
  type DiscoveryCoverageStage
} from "@axi/shared";

type DiscoveryCoveragePersistence = {
  saveSession: (session: DiscoveryCoverageSession) => unknown;
  saveEvent: (event: DiscoveryCoverageEvent) => unknown;
  saveConnectionEvent: (event: DiscoveryCoverageConnectionEvent) => unknown;
  findEventBySourceKey: (
    sourceEventKey: string,
    eventType: "create" | "migration"
  ) => DiscoveryCoverageEvent | null;
  getSession: (sessionId: string) => DiscoveryCoverageSession | null;
  listSessions: (limit: number) => DiscoveryCoverageSession[];
  listEvents: (query: DiscoveryCoverageEventQuery) => DiscoveryCoverageEvent[];
};

type MutableCoverageEvent = DiscoveryCoverageEvent & {
  monotonicStages: Partial<Record<DiscoveryCoverageStage, number>>;
};

export type DiscoveryCoverageServiceOptions = {
  sessionId: string;
  provider: string;
  sourceMode: string;
  startedAt?: string;
  now?: () => Date;
  monotonicNow?: () => number;
  persistence: DiscoveryCoveragePersistence;
};

export class DiscoveryCoverageService {
  private readonly events = new Map<string, MutableCoverageEvent>();
  private readonly connectionEvents: DiscoveryCoverageConnectionEvent[] = [];
  private readonly seenSourceEventKeys = new Set<string>();
  private readonly now: () => Date;
  private readonly monotonicNow: () => number;
  private readonly persistence: DiscoveryCoveragePersistence;
  private readonly sessionId: string;
  private readonly provider: string;
  private readonly sourceMode: string;
  private readonly startedAt: string;
  private stoppedAt: string | null = null;
  private stopReason: string | null = null;
  private connectionEventSequence = 0;
  private telemetryFailureCount = 0;
  private lastTelemetryFailure: string | null = null;
  private lastDisconnectedAtMs: number | null = null;

  constructor(options: DiscoveryCoverageServiceOptions) {
    this.sessionId = options.sessionId;
    this.provider = options.provider;
    this.sourceMode = options.sourceMode;
    this.startedAt = options.startedAt ?? new Date().toISOString();
    this.now = options.now ?? (() => new Date());
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.persistence = options.persistence;
    this.persistSession();
  }

  createFeedInstrumentation(): PumpPortalDiscoveryInstrumentation {
    return {
      onRawFrame: (observation) => {
        const event: MutableCoverageEvent = {
          schemaVersion: "discovery-coverage-v1",
          sessionId: this.sessionId,
          correlationId: observation.correlationId,
          sourceEventKey: null,
          provider: this.provider,
          receivedAt: observation.receivedAt,
          providerTimestamp: null,
          eventType: "unknown",
          mint: null,
          signature: null,
          parserOutcome: "pending",
          normalizationOutcome: "pending",
          pipelineOutcome: "pending",
          duplicateKey: null,
          duplicateReason: null,
          rejectionReason: null,
          failureStage: null,
          failureReason: null,
          safePayloadHash: null,
          topLevelKeys: [],
          stageTimestamps: {
            raw_received: observation.receivedAt
          },
          stageLatenciesMs: {},
          reasonCodes: ["DISCOVERY_FRAME_RECEIVED"],
          completedAt: null,
          createdAt: observation.receivedAt,
          monotonicStages: {
            raw_received: observation.receivedAtMonotonicMs
          }
        };
        this.events.set(event.correlationId, event);
        this.persistEvent(event);
        this.persistSession();
      },
      onParserOutcome: (observation) => {
        const event = this.requireEvent(observation.correlationId);
        if (event.parserOutcome !== "pending") {
          this.recordInvariantFailure(
            event,
            "PARSER_TERMINAL_OUTCOME_ALREADY_RECORDED"
          );
          return;
        }

        event.eventType = observation.eventType;
        event.parserOutcome = observation.parserOutcome;
        event.providerTimestamp = observation.providerTimestamp;
        event.safePayloadHash = observation.safePayloadHash;
        event.topLevelKeys = observation.topLevelKeys;
        event.rejectionReason = observation.rejectionReason;
        const parserStage = parserStageFor(observation.parserOutcome);
        if (observation.parserOutcome !== "parse_failure") {
          this.markStageAt(
            event,
            "parse_succeeded",
            this.now().toISOString(),
            this.monotonicNow()
          );
        }
        this.markStageAt(
          event,
          parserStage,
          this.now().toISOString(),
          this.monotonicNow()
        );
        event.reasonCodes = unique([
          ...event.reasonCodes,
          parserReasonCode(observation.parserOutcome)
        ]);

        if (
          observation.parserOutcome === "parse_failure" ||
          observation.parserOutcome === "recognized_non_discovery" ||
          observation.parserOutcome === "unknown_payload"
        ) {
          event.normalizationOutcome = "not_applicable";
          event.pipelineOutcome = "not_applicable";
          event.completedAt = this.now().toISOString();
        }

        this.refreshLatencies(event);
        this.persistEvent(event);
        this.persistSession();
      },
      onNormalizationOutcome: (observation) =>
        this.observeNormalization(observation),
      onConnectionEvent: (observation) =>
        this.observeConnection(observation),
      onInstrumentationFailure: ({ stage, safeReason }) => {
        this.recordTelemetryFailure(`${stage}:${safeReason}`);
      }
    };
  }

  markQueueAccepted(event: FeedEvent): void {
    this.withDiscoveryEvent(event, (coverageEvent) => {
      this.markStage(coverageEvent, "queue_accepted");
      this.persistEvent(coverageEvent);
      this.persistSession();
    });
  }

  markQueueTransactionStarted(event: FeedEvent): void {
    this.withDiscoveryEvent(event, (coverageEvent) => {
      this.markStage(coverageEvent, "queue_transaction_started");
    });
  }

  markIdentityCompleted(event: FeedEvent, created: boolean): void {
    this.markBusinessStage(
      event,
      "identity_completed",
      created ? "IDENTITY_CREATED" : "IDENTITY_UPDATED"
    );
  }

  markLiveTokenCompleted(event: FeedEvent, created: boolean): void {
    this.markBusinessStage(
      event,
      "live_token_completed",
      created ? "LIVE_TOKEN_CREATED" : "LIVE_TOKEN_UPDATED"
    );
  }

  markCandidateCompleted(event: FeedEvent, created: boolean): void {
    this.markBusinessStage(
      event,
      "candidate_completed",
      created ? "CANDIDATE_CREATED" : "CANDIDATE_UPDATED"
    );
  }

  markScoreCompleted(event: FeedEvent): void {
    this.markBusinessStage(event, "score_completed", "SCORE_PRODUCED");
  }

  markPersistenceCompleted(event: FeedEvent): void {
    this.markBusinessStage(
      event,
      "persistence_completed",
      "DISCOVERY_PERSISTENCE_COMPLETED"
    );
  }

  markScannerProjected(event: FeedEvent): void {
    this.markBusinessStage(
      event,
      "scanner_projected",
      "SCANNER_ROW_PROJECTED"
    );
  }

  markBroadcastAttempted(event: FeedEvent): void {
    this.markBusinessStage(
      event,
      "broadcast_attempted",
      "BROADCAST_ATTEMPTED"
    );
  }

  markBroadcastCompleted(event: FeedEvent, connectedClientCount: number): void {
    this.markBusinessStage(
      event,
      "broadcast_completed",
      connectedClientCount > 0
        ? "BROADCAST_COMPLETED"
        : "BROADCAST_COMPLETED_NO_CONNECTED_CLIENTS"
    );
  }

  markQueueCommittedAndPipelineCompleted(events: FeedEvent[]): void {
    for (const event of events) {
      this.withDiscoveryEvent(event, (coverageEvent) => {
        this.markStage(coverageEvent, "queue_committed");
        const missingStages = requiredPipelineStages.filter(
          (stage) => coverageEvent.stageTimestamps[stage] === undefined
        );
        if (missingStages.length === 0) {
          coverageEvent.pipelineOutcome = "completed";
          this.markStage(coverageEvent, "pipeline_completed");
          coverageEvent.reasonCodes = unique([
            ...coverageEvent.reasonCodes,
            "DISCOVERY_PIPELINE_COMPLETED"
          ]);
        } else {
          coverageEvent.pipelineOutcome = "failed_or_dropped";
          coverageEvent.failureStage = "pipeline_failed_or_dropped";
          coverageEvent.failureReason = `MISSING_REQUIRED_STAGES:${missingStages.join(",")}`;
          this.markStage(coverageEvent, "pipeline_failed_or_dropped");
          coverageEvent.reasonCodes = unique([
            ...coverageEvent.reasonCodes,
            "DISCOVERY_PIPELINE_REQUIRED_STAGE_MISSING",
            "DISCOVERY_PIPELINE_FAILED_OR_DROPPED"
          ]);
        }
        coverageEvent.completedAt = this.now().toISOString();
        this.refreshLatencies(coverageEvent);
        this.persistEvent(coverageEvent);
      });
    }
    this.persistSession();
  }

  markQueueFailedOrDropped(
    events: FeedEvent[],
    failureStage: string,
    safeReason: string
  ): void {
    for (const event of events) {
      this.withDiscoveryEvent(event, (coverageEvent) => {
        this.markStage(coverageEvent, "queue_failed");
        coverageEvent.pipelineOutcome = "failed_or_dropped";
        coverageEvent.failureStage = "queue_failed";
        coverageEvent.failureReason = `${failureStage}:${safeReason}`;
        this.markStage(coverageEvent, "pipeline_failed_or_dropped");
        coverageEvent.completedAt = this.now().toISOString();
        coverageEvent.reasonCodes = unique([
          ...coverageEvent.reasonCodes,
          "DISCOVERY_QUEUE_FAILED",
          "DISCOVERY_PIPELINE_FAILED_OR_DROPPED"
        ]);
        this.refreshLatencies(coverageEvent);
        this.persistEvent(coverageEvent);
      });
    }
    this.persistSession();
  }

  finalize(stopReason: string, stoppedAt = this.now().toISOString()): DiscoveryCoverageSession {
    if (this.stoppedAt) {
      return this.getSummary();
    }
    this.stoppedAt = stoppedAt;
    this.stopReason = stopReason;
    this.persistSession();
    return this.getSummary();
  }

  getSummary(): DiscoveryCoverageSession {
    const events = [...this.events.values()];
    const now = this.stoppedAt ?? this.now().toISOString();
    const startedMs = Date.parse(this.startedAt);
    const endedMs = Date.parse(now);
    const latencyDistributions = Object.fromEntries(
      discoveryCoverageLatencyKeys.map((key) => [
        key,
        aggregateLatency(events, key)
      ])
    ) as Record<DiscoveryCoverageLatencyKey, DiscoveryCoverageLatencyDistribution>;
    const counts = countEvents(events);
    const equations = buildReconciliationEquations(counts);
    const maximumAbsoluteResidual = equations.reduce(
      (maximum, equation) => Math.max(maximum, Math.abs(equation.residual)),
      0
    );
    const locallyReconciled =
      maximumAbsoluteResidual === 0 &&
      this.telemetryFailureCount === 0 &&
      events.every((event) => event.parserOutcome !== "pending") &&
      events
        .filter((event) => event.normalizationOutcome === "succeeded")
        .every((event) => event.pipelineOutcome !== "pending");
    const connectionCount = this.connectionEvents.filter(
      (event) => event.eventType === "connection_opened"
    ).length;
    const reconnectAttemptCount = this.connectionEvents.filter(
      (event) => event.eventType === "reconnect_attempt"
    ).length;
    const reconnectSuccessCount = this.connectionEvents.filter(
      (event) => event.eventType === "reconnect_success"
    ).length;
    const disconnectedDurationMs = this.connectionEvents.reduce(
      (total, event) => total + (event.disconnectedDurationMs ?? 0),
      0
    );

    return DiscoveryCoverageSessionSchema.parse({
      schemaVersion: "discovery-coverage-v1",
      sessionId: this.sessionId,
      provider: this.provider,
      sourceMode: this.sourceMode,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      stopReason: this.stopReason,
      observationDurationMs:
        Number.isFinite(startedMs) && Number.isFinite(endedMs)
          ? Math.max(0, endedMs - startedMs)
          : 0,
      connectionCount,
      reconnectAttemptCount,
      reconnectSuccessCount,
      disconnectedDurationMs,
      ...counts,
      telemetryFailureCount: this.telemetryFailureCount,
      latencyDistributions,
      reconciliation: {
        equations,
        maximumAbsoluteResidual
      },
      localReconciliationStatus: locallyReconciled
        ? "LOCALLY_RECONCILED"
        : "LOCAL_RECONCILIATION_FAILED",
      upstreamCoverageStatus: "UNPROVEN",
      reasonCodes: unique([
        locallyReconciled
          ? "LOCAL_DISCOVERY_PIPELINE_RECONCILED"
          : "LOCAL_DISCOVERY_PIPELINE_RECONCILIATION_FAILED",
        "UPSTREAM_PROVIDER_COMPLETENESS_UNPROVEN",
        "PUMPPORTAL_SEQUENCE_OR_CURSOR_UNAVAILABLE",
        ...(this.lastTelemetryFailure
          ? [`TELEMETRY_FAILURE_${this.lastTelemetryFailure}`]
          : [])
      ]),
      updatedAt: now,
      paperOnly: true,
      paidStreamsActive: false,
      liveTradingEnabled: false
    });
  }

  listEvents(query: DiscoveryCoverageEventQuery): DiscoveryCoverageEvent[] {
    return this.persistence.listEvents(query);
  }

  listSessions(limit: number): DiscoveryCoverageSession[] {
    return this.persistence.listSessions(limit);
  }

  getSession(sessionId: string): DiscoveryCoverageSession | null {
    if (sessionId === this.sessionId) {
      return this.getSummary();
    }
    return this.persistence.getSession(sessionId);
  }

  private observeNormalization(
    observation: PumpPortalDiscoveryNormalizationObservation
  ): PumpPortalDiscoveryNormalizationResult | null {
    const coverageEvent = this.requireEvent(observation.correlationId);
    if (coverageEvent.normalizationOutcome !== "pending") {
      this.recordInvariantFailure(
        coverageEvent,
        "NORMALIZATION_TERMINAL_OUTCOME_ALREADY_RECORDED"
      );
      return null;
    }

    if (!observation.event) {
      coverageEvent.normalizationOutcome = "rejected";
      coverageEvent.pipelineOutcome = "rejected";
      coverageEvent.rejectionReason =
        observation.rejectionReason ?? "DISCOVERY_NORMALIZATION_REJECTED";
      this.markStageAt(
        coverageEvent,
        "normalization_rejected",
        observation.normalizedAt,
        observation.normalizedAtMonotonicMs
      );
      coverageEvent.completedAt = observation.normalizedAt;
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        "DISCOVERY_NORMALIZATION_REJECTED"
      ]);
      this.refreshLatencies(coverageEvent);
      this.persistEvent(coverageEvent);
      this.persistSession();
      return null;
    }

    const sourceEventKey = createPumpPortalDiscoverySourceEventKey(
      observation.event,
      observation.providerTimestamp
    );
    coverageEvent.sourceEventKey = sourceEventKey;
    coverageEvent.mint = observation.event.candidate.mint;
    coverageEvent.signature = observation.event.signature ?? null;
    coverageEvent.normalizationOutcome = "succeeded";
    this.markStageAt(
      coverageEvent,
      "normalization_succeeded",
      observation.normalizedAt,
      observation.normalizedAtMonotonicMs
    );
    const persistedDuplicate = this.persistence.findEventBySourceKey(
      sourceEventKey,
      coverageEvent.eventType as "create" | "migration"
    );
    const duplicate =
      this.seenSourceEventKeys.has(sourceEventKey) ||
      (persistedDuplicate !== null &&
        persistedDuplicate.correlationId !== coverageEvent.correlationId);

    if (duplicate) {
      coverageEvent.duplicateKey = sourceEventKey;
      coverageEvent.duplicateReason = "SOURCE_EVENT_KEY_ALREADY_SEEN";
      coverageEvent.pipelineOutcome = "duplicate";
      this.markStage(coverageEvent, "duplicate_detected");
      coverageEvent.completedAt = this.now().toISOString();
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        "DISCOVERY_DUPLICATE_SUPPRESSED"
      ]);
      this.refreshLatencies(coverageEvent);
      this.persistEvent(coverageEvent);
      this.persistSession();
    } else {
      this.seenSourceEventKeys.add(sourceEventKey);
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        "DISCOVERY_NORMALIZATION_SUCCEEDED"
      ]);
      this.refreshLatencies(coverageEvent);
      this.persistEvent(coverageEvent);
      this.persistSession();
    }

    return {
      duplicate,
      duplicateKey: duplicate ? sourceEventKey : null,
      duplicateReason: duplicate ? "SOURCE_EVENT_KEY_ALREADY_SEEN" : null,
      metadata: {
        schemaVersion: "discovery-coverage-v1",
        sessionId: this.sessionId,
        correlationId: coverageEvent.correlationId,
        sourceEventKey,
        receivedAtMonotonicMs:
          coverageEvent.monotonicStages.raw_received ??
          observation.receivedAtMonotonicMs,
        normalizedAtMonotonicMs: observation.normalizedAtMonotonicMs
      }
    };
  }

  private observeConnection(
    observation: PumpPortalDiscoveryConnectionObservation
  ): void {
    const observedMs = Date.parse(observation.observedAt);
    let disconnectedDurationMs: number | null = null;
    if (observation.eventType === "disconnected") {
      this.lastDisconnectedAtMs = observedMs;
    } else if (
      observation.eventType === "connection_opened" &&
      this.lastDisconnectedAtMs !== null &&
      Number.isFinite(observedMs)
    ) {
      disconnectedDurationMs = Math.max(0, observedMs - this.lastDisconnectedAtMs);
      this.lastDisconnectedAtMs = null;
    }

    const event = DiscoveryCoverageConnectionEventSchema.parse({
      schemaVersion: "discovery-coverage-v1",
      connectionEventId: `${this.sessionId}:connection-event-${++this.connectionEventSequence}`,
      sessionId: this.sessionId,
      eventType: observation.eventType,
      connectionId: observation.connectionId,
      attemptedAt:
        observation.eventType === "connection_attempt"
          ? observation.observedAt
          : null,
      connectedAt:
        observation.eventType === "connection_opened"
          ? observation.observedAt
          : null,
      disconnectedAt:
        observation.eventType === "disconnected"
          ? observation.observedAt
          : null,
      disconnectedDurationMs,
      reconnectAttempt: observation.reconnectAttempt,
      replayAttempted: observation.replayAttempted,
      replayResult: observation.replayResult,
      gapStatus: observation.gapStatus,
      safeReason: observation.safeReason,
      adjacentCorrelationId: observation.adjacentCorrelationId ?? null,
      createdAt: observation.observedAt
    });
    this.connectionEvents.push(event);
    this.persistConnectionEvent(event);
    this.persistSession();
  }

  private markBusinessStage(
    event: FeedEvent,
    stage: DiscoveryCoverageStage,
    reasonCode: string
  ): void {
    this.withDiscoveryEvent(event, (coverageEvent) => {
      this.markStage(coverageEvent, stage);
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        reasonCode
      ]);
    });
  }

  private markStage(event: MutableCoverageEvent, stage: DiscoveryCoverageStage): void {
    this.markStageAt(
      event,
      stage,
      this.now().toISOString(),
      this.monotonicNow()
    );
  }

  private markStageAt(
    event: MutableCoverageEvent,
    stage: DiscoveryCoverageStage,
    wallTimestamp: string,
    monotonicTimestamp: number
  ): void {
    event.stageTimestamps[stage] = wallTimestamp;
    event.monotonicStages[stage] = monotonicTimestamp;
  }

  private withDiscoveryEvent(
    event: FeedEvent,
    operation: (coverageEvent: MutableCoverageEvent) => void
  ): void {
    const correlationId = event.discoveryCoverage?.correlationId;
    if (!correlationId) {
      return;
    }
    const coverageEvent = this.events.get(correlationId);
    if (!coverageEvent) {
      this.recordTelemetryFailure("DISCOVERY_CORRELATION_NOT_FOUND");
      return;
    }
    operation(coverageEvent);
  }

  private requireEvent(correlationId: string): MutableCoverageEvent {
    const event = this.events.get(correlationId);
    if (!event) {
      throw new Error(`Unknown discovery correlation: ${correlationId}`);
    }
    return event;
  }

  private refreshLatencies(event: MutableCoverageEvent): void {
    event.stageLatenciesMs = calculateEventLatencies(event);
  }

  private recordInvariantFailure(
    event: MutableCoverageEvent,
    reason: string
  ): void {
    event.failureReason = reason;
    event.reasonCodes = unique([...event.reasonCodes, reason]);
    this.recordTelemetryFailure(reason);
    this.persistEvent(event);
  }

  private recordTelemetryFailure(reason: string): void {
    this.telemetryFailureCount += 1;
    this.lastTelemetryFailure = sanitizeReason(reason);
  }

  private persistEvent(event: MutableCoverageEvent): void {
    this.persistSafely("save_event", () =>
      this.persistence.saveEvent(stripMutableFields(event))
    );
  }

  private persistConnectionEvent(event: DiscoveryCoverageConnectionEvent): void {
    this.persistSafely("save_connection_event", () =>
      this.persistence.saveConnectionEvent(event)
    );
  }

  private persistSession(): void {
    this.persistSafely("save_session", () =>
      this.persistence.saveSession(this.getSummary())
    );
  }

  private persistSafely(stage: string, operation: () => unknown): void {
    try {
      operation();
    } catch (error) {
      this.telemetryFailureCount += 1;
      this.lastTelemetryFailure = `${stage}:${safeErrorClass(error)}`;
    }
  }
}

const requiredPipelineStages: DiscoveryCoverageStage[] = [
  "identity_completed",
  "live_token_completed",
  "candidate_completed",
  "score_completed",
  "persistence_completed",
  "scanner_projected"
];

export function createDiscoveryCoverageService(
  options: DiscoveryCoverageServiceOptions
): DiscoveryCoverageService {
  return new DiscoveryCoverageService(options);
}

export function createPumpPortalDiscoverySourceEventKey(
  event: TokenCreatedEvent,
  providerTimestamp: string | null
): string {
  const eventType =
    event.rawSourceEventType === "migration" ? "migration" : "create";
  const instructionIndex = readFiniteIndex(event.raw, [
    "instructionIndex",
    "instruction_index",
    "eventIndex",
    "event_index",
    "index"
  ]);
  if (event.signature) {
    return `pumpportal:${eventType}:signature:${event.signature}:index:${
      instructionIndex ?? "unknown"
    }`;
  }

  const canonical = {
    eventType,
    mint: event.candidate.mint,
    creator: event.creator ?? event.candidate.creator ?? null,
    bondingCurve:
      event.bondingCurve ?? event.candidate.bondingCurveKey ?? null,
    pool: event.candidate.pool ?? event.candidate.raydiumPool ?? null,
    metadataUri: event.candidate.metadataUri ?? null,
    providerTimestamp
  };
  return `pumpportal:${eventType}:canonical:${createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")}`;
}

export function deterministicPercentile(
  values: number[],
  percentile: number
): number | null {
  const finite = values.filter(
    (value) => Number.isFinite(value) && value >= 0
  );
  if (finite.length === 0) {
    return null;
  }
  const sorted = [...finite].sort((left, right) => left - right);
  const rank = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1)
  );
  return sorted[rank] ?? null;
}

function calculateEventLatencies(
  event: MutableCoverageEvent
): Partial<Record<DiscoveryCoverageLatencyKey, number | null>> {
  const duration = (
    from: DiscoveryCoverageStage,
    to: DiscoveryCoverageStage
  ): number | null => {
    const start = event.monotonicStages[from];
    const end = event.monotonicStages[to];
    if (
      start === undefined ||
      end === undefined ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start
    ) {
      return null;
    }
    return roundMs(end - start);
  };
  const parserStage = parserStageFor(event.parserOutcome);
  const terminalPipelineStage =
    event.pipelineOutcome === "completed"
      ? "pipeline_completed"
      : event.pipelineOutcome === "failed_or_dropped"
        ? "pipeline_failed_or_dropped"
        : null;
  const providerToReceive = wallDuration(
    event.providerTimestamp,
    event.receivedAt
  );
  const providerToPipeline = wallDuration(
    event.providerTimestamp,
    event.completedAt
  );

  return {
    provider_to_receive: providerToReceive,
    receive_to_parse: duration("raw_received", parserStage),
    receive_to_normalize:
      duration("raw_received", "normalization_succeeded") ??
      duration("raw_received", "normalization_rejected"),
    normalize_to_queue_accept: duration(
      "normalization_succeeded",
      "queue_accepted"
    ),
    normalize_to_queue_commit: duration(
      "normalization_succeeded",
      "queue_committed"
    ),
    queue_accept_to_queue_commit: duration("queue_accepted", "queue_committed"),
    queue_transaction_start_to_identity: duration(
      "queue_transaction_started",
      "identity_completed"
    ),
    queue_transaction_start_to_live_token: duration(
      "queue_transaction_started",
      "live_token_completed"
    ),
    queue_transaction_start_to_candidate: duration(
      "queue_transaction_started",
      "candidate_completed"
    ),
    queue_transaction_start_to_score: duration(
      "queue_transaction_started",
      "score_completed"
    ),
    queue_transaction_start_to_persistence: duration(
      "queue_transaction_started",
      "persistence_completed"
    ),
    queue_transaction_start_to_scanner: duration(
      "queue_transaction_started",
      "scanner_projected"
    ),
    queue_transaction_start_to_broadcast: duration(
      "queue_transaction_started",
      "broadcast_completed"
    ),
    queue_commit_to_identity: duration("queue_committed", "identity_completed"),
    queue_commit_to_live_token: duration(
      "queue_committed",
      "live_token_completed"
    ),
    queue_commit_to_candidate: duration(
      "queue_committed",
      "candidate_completed"
    ),
    queue_commit_to_score: duration("queue_committed", "score_completed"),
    queue_commit_to_persistence: duration(
      "queue_committed",
      "persistence_completed"
    ),
    queue_commit_to_scanner: duration("queue_committed", "scanner_projected"),
    queue_commit_to_broadcast: duration(
      "queue_committed",
      "broadcast_completed"
    ),
    receive_to_scanner: duration("raw_received", "scanner_projected"),
    receive_to_broadcast: duration("raw_received", "broadcast_completed"),
    receive_to_pipeline_complete: terminalPipelineStage
      ? duration("raw_received", terminalPipelineStage)
      : null,
    provider_to_pipeline_complete: providerToPipeline
  };
}

function aggregateLatency(
  events: MutableCoverageEvent[],
  key: DiscoveryCoverageLatencyKey
): DiscoveryCoverageLatencyDistribution {
  const eligible = eligibleLatencyEvents(events, key);
  const values = eligible
    .map((event) => event.stageLatenciesMs[key])
    .filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value >= 0
    );
  return {
    availableCount: values.length,
    unavailableCount: eligible.length - values.length,
    min: values.length > 0 ? Math.min(...values) : null,
    p50: deterministicPercentile(values, 0.5),
    p95: deterministicPercentile(values, 0.95),
    p99: deterministicPercentile(values, 0.99),
    max: values.length > 0 ? Math.max(...values) : null
  };
}

function eligibleLatencyEvents(
  events: MutableCoverageEvent[],
  key: DiscoveryCoverageLatencyKey
): MutableCoverageEvent[] {
  if (key === "provider_to_receive" || key === "receive_to_parse") {
    return events;
  }
  if (key === "receive_to_normalize") {
    return events.filter((event) =>
      event.parserOutcome === "recognized_create" ||
      event.parserOutcome === "recognized_migration"
    );
  }
  return events.filter(
    (event) => event.normalizationOutcome === "succeeded"
  );
}

function countEvents(events: MutableCoverageEvent[]) {
  const count = (predicate: (event: MutableCoverageEvent) => boolean) =>
    events.filter(predicate).length;
  const reasonCount = (reason: string) =>
    count((event) => event.reasonCodes.includes(reason));
  return {
    rawFrameCount: events.length,
    parsedFrameCount: count((event) => event.parserOutcome !== "parse_failure" && event.parserOutcome !== "pending"),
    parseFailureCount: count((event) => event.parserOutcome === "parse_failure"),
    recognizedCreateCount: count((event) => event.parserOutcome === "recognized_create"),
    recognizedMigrationCount: count((event) => event.parserOutcome === "recognized_migration"),
    recognizedNonDiscoveryCount: count((event) => event.parserOutcome === "recognized_non_discovery"),
    unknownPayloadCount: count((event) => event.parserOutcome === "unknown_payload"),
    normalizationSuccessCount: count((event) => event.normalizationOutcome === "succeeded"),
    normalizationRejectCount: count((event) => event.normalizationOutcome === "rejected"),
    duplicateCount: count((event) => event.pipelineOutcome === "duplicate"),
    rejectedCount: count((event) => event.pipelineOutcome === "rejected" && event.normalizationOutcome === "succeeded"),
    queueAcceptedCount: count((event) => event.stageTimestamps.queue_accepted !== undefined),
    queueCommittedCount: count((event) => event.stageTimestamps.queue_committed !== undefined),
    queueFailureCount: count((event) => event.stageTimestamps.queue_failed !== undefined),
    pipelineCompletedCount: count((event) => event.pipelineOutcome === "completed"),
    pipelineFailedOrDroppedCount: count((event) => event.pipelineOutcome === "failed_or_dropped"),
    identityCreatedCount: reasonCount("IDENTITY_CREATED"),
    identityUpdatedCount: reasonCount("IDENTITY_UPDATED"),
    liveTokenCreatedCount: reasonCount("LIVE_TOKEN_CREATED"),
    liveTokenUpdatedCount: reasonCount("LIVE_TOKEN_UPDATED"),
    candidateCreatedCount: reasonCount("CANDIDATE_CREATED"),
    candidateUpdatedCount: reasonCount("CANDIDATE_UPDATED"),
    scoreProducedCount: reasonCount("SCORE_PRODUCED"),
    persistenceCompletedCount: reasonCount("DISCOVERY_PERSISTENCE_COMPLETED"),
    scannerProjectedCount: reasonCount("SCANNER_ROW_PROJECTED"),
    broadcastAttemptedCount: reasonCount("BROADCAST_ATTEMPTED"),
    broadcastCompletedCount:
      reasonCount("BROADCAST_COMPLETED") +
      reasonCount("BROADCAST_COMPLETED_NO_CONNECTED_CLIENTS")
  };
}

type CoverageCounts = ReturnType<typeof countEvents>;

function buildReconciliationEquations(
  counts: CoverageCounts
): DiscoveryCoverageEquation[] {
  return [
    equation(
      "raw_parser_terminal",
      counts.rawFrameCount,
      counts.parseFailureCount +
        counts.recognizedCreateCount +
        counts.recognizedMigrationCount +
        counts.recognizedNonDiscoveryCount +
        counts.unknownPayloadCount,
      "raw_received = parse_failed + recognized_create + recognized_migration + recognized_non_discovery + unknown_payload"
    ),
    equation(
      "raw_parse",
      counts.rawFrameCount,
      counts.parsedFrameCount + counts.parseFailureCount,
      "raw_received = parse_succeeded + parse_failed"
    ),
    equation(
      "parsed_classification",
      counts.parsedFrameCount,
      counts.recognizedCreateCount +
        counts.recognizedMigrationCount +
        counts.recognizedNonDiscoveryCount +
        counts.unknownPayloadCount,
      "parse_succeeded = recognized_create + recognized_migration + recognized_non_discovery + unknown_payload"
    ),
    equation(
      "discovery_normalization",
      counts.recognizedCreateCount + counts.recognizedMigrationCount,
      counts.normalizationSuccessCount + counts.normalizationRejectCount,
      "recognized_discovery = normalization_succeeded + normalization_rejected"
    ),
    equation(
      "normalized_pipeline",
      counts.normalizationSuccessCount,
      counts.pipelineCompletedCount +
        counts.duplicateCount +
        counts.rejectedCount +
        counts.pipelineFailedOrDroppedCount,
      "normalization_succeeded = pipeline_completed + duplicate + rejected + failed_or_dropped"
    ),
    equation(
      "queue_terminal",
      counts.queueAcceptedCount,
      counts.queueCommittedCount + counts.queueFailureCount,
      "queue_accepted = queue_committed + queue_failed"
    )
  ];
}

function equation(
  name: string,
  left: number,
  right: number,
  expression: string
): DiscoveryCoverageEquation {
  const residual = left - right;
  return { name, left, right, residual, holds: residual === 0, expression };
}

function parserStageFor(
  outcome: DiscoveryCoverageEvent["parserOutcome"]
): DiscoveryCoverageStage {
  switch (outcome) {
    case "parse_failure":
      return "parse_failed";
    case "recognized_create":
      return "create_recognized";
    case "recognized_migration":
      return "migration_recognized";
    case "recognized_non_discovery":
      return "non_discovery_recognized";
    case "unknown_payload":
    case "pending":
      return "unknown_payload";
  }
}

function parserReasonCode(
  outcome: DiscoveryCoverageEvent["parserOutcome"]
): string {
  return `DISCOVERY_PARSER_${outcome.toUpperCase()}`;
}

function stripMutableFields(event: MutableCoverageEvent): DiscoveryCoverageEvent {
  const persisted: Partial<MutableCoverageEvent> = { ...event };
  delete persisted.monotonicStages;
  return DiscoveryCoverageEventSchema.parse(persisted);
}

function wallDuration(
  start: string | null,
  end: string | null
): number | null {
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return roundMs(endMs - startMs);
}

function readFiniteIndex(raw: unknown, keys: string[]): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }
  }
  return null;
}

function roundMs(value: number): number {
  return Number(value.toFixed(3));
}

function safeErrorClass(error: unknown): string {
  return error instanceof Error && error.name
    ? error.name.toUpperCase()
    : "UNKNOWN_ERROR";
}

function sanitizeReason(value: string): string {
  return value
    .replace(/[^A-Za-z0-9:_-]/g, "_")
    .slice(0, 160)
    .toUpperCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
