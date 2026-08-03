import { performance } from "node:perf_hooks";
import {
  createStableTokenTradeEventKey,
  type FeedEvent,
  type PumpPortalTradeInstrumentation,
  type PumpPortalTradeNormalizationObservation,
  type PumpPortalTradeNormalizationResult,
  type TokenTradeEvent
} from "@axi/data-feeds";
import {
  TradeDataCoverageEventSchema,
  TradeDataCoverageSessionSchema,
  TradeDataSubscriptionEventSchema,
  tradeDataCoverageLatencyKeys,
  type TradeDataConsistencyCheck,
  type TradeDataCoverageEvent,
  type TradeDataCoverageEventQuery,
  type TradeDataCoverageLatencyDistribution,
  type TradeDataCoverageLatencyKey,
  type TradeDataCoverageSession,
  type TradeDataChainVerificationStatus,
  type TradeDataCoverageStage,
  type TradeDataSubscriptionEvent,
  type TradeDataSubscriptionEventQuery,
  type TradeDataSubscriptionEventType
} from "@axi/shared";

type TradeDataCoveragePersistence = {
  saveSession: (session: TradeDataCoverageSession) => unknown;
  saveEvent: (event: TradeDataCoverageEvent) => unknown;
  saveSubscriptionEvent: (event: TradeDataSubscriptionEvent) => unknown;
  findEventBySourceKey: (
    sessionId: string,
    sourceEventKey: string
  ) => TradeDataCoverageEvent | null;
  getSession: (sessionId: string) => TradeDataCoverageSession | null;
  listSessions: (limit: number) => TradeDataCoverageSession[];
  listEvents: (query: TradeDataCoverageEventQuery) => TradeDataCoverageEvent[];
  listSubscriptionEvents: (
    query: TradeDataSubscriptionEventQuery
  ) => TradeDataSubscriptionEvent[];
};

type MutableCoverageEvent = TradeDataCoverageEvent & {
  monotonicStages: Partial<Record<TradeDataCoverageStage, number>>;
};

type ActiveCoverageSession = {
  sessionId: string;
  selectedMint: string;
  startedAt: string;
  maxEvents: number;
  maxRuntimeMs: number;
  maxCostSol: number;
  postStopGraceMs: number;
  chainVerify: boolean;
  chainVerifyMaxSignatures: number;
  onStopRequested: ((reason: string) => void) | undefined;
  stopRequestedAt: string | null;
  stoppedAt: string | null;
  stopReason: string | null;
  subscriptionRequestedAt: string | null;
  subscriptionSentAt: string | null;
  subscriptionAcknowledgedAt: string | null;
  firstTradeAt: string | null;
  unsubscribeRequestedAt: string | null;
  unsubscribeSentAt: string | null;
  finalTradeAt: string | null;
  subscriptionSequence: number;
  telemetryFailureCount: number;
  lastTelemetryFailure: string | null;
  oneSecondBucketCount: number;
  completedOneSecondBucketCount: number;
  validSampleCount: number;
  firstDerivativeAvailable: boolean;
  secondDerivativeAvailable: boolean;
};

export type BeginTradeDataCoverageInput = {
  sessionId: string;
  selectedMint: string;
  maxEvents?: number;
  maxRuntimeMs?: number;
  maxCostSol?: number;
  postStopGraceMs?: number;
  chainVerify?: boolean;
  chainVerifyMaxSignatures?: number;
  onStopRequested?: (reason: string) => void;
};

export type TradeDataCoverageServiceOptions = {
  provider: string;
  sourceMode: string;
  persistence: TradeDataCoveragePersistence;
  estimatedCostPerEventSol: number;
  now?: () => Date;
  monotonicNow?: () => number;
};

export type TradeDataCoverageTransactionVerifier = {
  getTransaction: (signature: string) => Promise<unknown>;
};

export type TradeDataTimeseriesObservation = {
  action: "accepted" | "duplicate" | "rejected_invalid" | "rejected_late";
  bucketUpdated: boolean;
  rollingWindowsUpdated: boolean;
  oneSecondBucketCount: number;
  completedOneSecondBucketCount: number;
  validSampleCount: number;
  firstDerivativeAvailable: boolean;
  secondDerivativeAvailable: boolean;
};

export class TradeDataCoverageService {
  private readonly provider: string;
  private readonly sourceMode: string;
  private readonly persistence: TradeDataCoveragePersistence;
  private readonly estimatedCostPerEventSol: number;
  private readonly now: () => Date;
  private readonly monotonicNow: () => number;
  private readonly events = new Map<string, MutableCoverageEvent>();
  private readonly seenSourceEventKeys = new Set<string>();
  private readonly subscriptionEvents: TradeDataSubscriptionEvent[] = [];
  private active: ActiveCoverageSession | null = null;
  private latestFinalized: TradeDataCoverageSession | null = null;

  constructor(options: TradeDataCoverageServiceOptions) {
    this.provider = options.provider;
    this.sourceMode = options.sourceMode;
    this.persistence = options.persistence;
    this.estimatedCostPerEventSol = finiteNonnegative(
      options.estimatedCostPerEventSol
    );
    this.now = options.now ?? (() => new Date());
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
  }

  begin(input: BeginTradeDataCoverageInput): TradeDataCoverageSession {
    if (this.active) {
      throw new Error("A trade data coverage session is already active.");
    }
    const selectedMint = input.selectedMint.trim();
    if (!selectedMint) {
      throw new Error(
        "Trade data coverage requires exactly one selected mint."
      );
    }
    const startedAt = this.now().toISOString();
    this.events.clear();
    this.seenSourceEventKeys.clear();
    this.subscriptionEvents.splice(0);
    this.active = {
      sessionId: input.sessionId,
      selectedMint,
      startedAt,
      maxEvents: positiveInteger(input.maxEvents, 50),
      maxRuntimeMs: positiveInteger(input.maxRuntimeMs, 90_000),
      maxCostSol: positiveFinite(input.maxCostSol, 0.0001),
      postStopGraceMs: nonnegativeInteger(input.postStopGraceMs, 5_000),
      chainVerify: input.chainVerify ?? false,
      chainVerifyMaxSignatures: Math.min(
        5,
        nonnegativeInteger(input.chainVerifyMaxSignatures, 5)
      ),
      onStopRequested: input.onStopRequested,
      stopRequestedAt: null,
      stoppedAt: null,
      stopReason: null,
      subscriptionRequestedAt: startedAt,
      subscriptionSentAt: null,
      subscriptionAcknowledgedAt: null,
      firstTradeAt: null,
      unsubscribeRequestedAt: null,
      unsubscribeSentAt: null,
      finalTradeAt: null,
      subscriptionSequence: 0,
      telemetryFailureCount: 0,
      lastTelemetryFailure: null,
      oneSecondBucketCount: 0,
      completedOneSecondBucketCount: 0,
      validSampleCount: 0,
      firstDerivativeAvailable: false,
      secondDerivativeAvailable: false
    };
    this.recordSubscriptionEvent(
      "track_requested",
      selectedMint,
      "BOUNDED_ONE_MINT_COVERAGE_SESSION",
      ["TRADE_DATA_COVERAGE_TRACK_REQUESTED"]
    );
    this.persistSession();
    return this.getActiveSummary();
  }

  createFeedInstrumentation(): PumpPortalTradeInstrumentation {
    return {
      onRawFrame: (observation) => {
        const active = this.active;
        if (!active) {
          return;
        }
        const postStop = active.stopRequestedAt !== null;
        const event: MutableCoverageEvent = {
          schemaVersion: "trade-data-coverage-v1",
          sessionId: active.sessionId,
          correlationId: observation.correlationId,
          sourceEventKey: null,
          provider: this.provider,
          subscribedMint: active.selectedMint,
          observedMint: null,
          signature: null,
          eventIndex: null,
          receivedAt: observation.receivedAt,
          providerTimestamp: null,
          side: null,
          trader: null,
          rawSolAmount: null,
          rawTokenAmount: null,
          normalizedVolumeSol: null,
          normalizedTokenAmount: null,
          normalizedPriceSol: null,
          marketCapSol: null,
          virtualTokenReserves: null,
          virtualSolReserves: null,
          amountNormalizationMode: "unknown",
          confidence: "low",
          usableForMetrics: false,
          parserOutcome: "pending",
          normalizationOutcome: "pending",
          pipelineOutcome: "pending",
          duplicateKey: null,
          duplicateReason: null,
          rejectionReason: null,
          failureStage: null,
          failureReason: null,
          postStop,
          postStopClassification: postStop
            ? active.unsubscribeSentAt
              ? "unexpected_after_unsubscribe"
              : "expected_in_flight"
            : "not_applicable",
          stageTimestamps: { raw_received: observation.receivedAt },
          stageLatenciesMs: {},
          consistencyChecks: {},
          chainVerificationStatus: "NOT_REQUESTED",
          reasonCodes: [
            "TRADE_SESSION_FRAME_RECEIVED",
            ...(postStop ? ["TRADE_SESSION_POST_STOP_FRAME"] : [])
          ],
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
        const event = this.events.get(observation.correlationId);
        if (!event || !this.active) {
          return;
        }
        if (event.parserOutcome !== "pending") {
          this.recordTelemetryFailure("TRADE_PARSER_OUTCOME_ALREADY_TERMINAL");
          return;
        }
        event.parserOutcome = observation.parserOutcome;
        event.providerTimestamp = observation.providerTimestamp;
        event.rejectionReason = observation.rejectionReason;
        if (observation.parserOutcome !== "parse_failed") {
          this.markStage(event, "parse_succeeded");
        }
        const stage = parserStage(observation.parserOutcome);
        this.markStage(event, stage);
        event.reasonCodes = unique([
          ...event.reasonCodes,
          parserReasonCode(observation.parserOutcome)
        ]);
        if (observation.parserOutcome !== "recognized_trade") {
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
      onSubscriptionEvent: (observation) => {
        const active = this.active;
        if (!active) {
          return;
        }
        const mint = observation.mint ?? active.selectedMint;
        if (mint !== active.selectedMint) {
          return;
        }
        this.recordSubscriptionEvent(
          observation.eventType,
          mint,
          observation.safeReason,
          observation.reasonCodes,
          observation.timestamp
        );
      },
      onInstrumentationFailure: ({ stage, safeReason }) => {
        this.recordTelemetryFailure(`${stage}:${safeReason}`);
      }
    };
  }

  markQueueAccepted(event: FeedEvent): void {
    this.withEvent(event, (coverageEvent) => {
      this.markStage(coverageEvent, "queue_accepted");
      this.persistEvent(coverageEvent);
      this.persistSession();
    });
  }

  markQueueTransactionStarted(event: FeedEvent): void {
    this.withEvent(event, (coverageEvent) => {
      this.markStage(coverageEvent, "queue_transaction_started");
    });
  }

  markPersistenceCompleted(event: FeedEvent): void {
    this.markBusinessStage(event, "persistence_completed", "TRADE_PERSISTED");
  }

  markTimeseries(
    event: FeedEvent,
    observation: TradeDataTimeseriesObservation
  ): void {
    this.withEvent(event, (coverageEvent) => {
      const active = this.active;
      if (!active) {
        return;
      }
      active.oneSecondBucketCount = Math.max(
        active.oneSecondBucketCount,
        observation.oneSecondBucketCount
      );
      active.completedOneSecondBucketCount = Math.max(
        active.completedOneSecondBucketCount,
        observation.completedOneSecondBucketCount
      );
      active.validSampleCount = Math.max(
        active.validSampleCount,
        observation.validSampleCount
      );
      active.firstDerivativeAvailable =
        active.firstDerivativeAvailable || observation.firstDerivativeAvailable;
      active.secondDerivativeAvailable =
        active.secondDerivativeAvailable ||
        observation.secondDerivativeAvailable;

      if (observation.action === "accepted") {
        this.markStage(coverageEvent, "timeseries_accepted");
        if (observation.bucketUpdated) {
          this.markStage(coverageEvent, "snapshot_updated");
        }
        if (observation.rollingWindowsUpdated) {
          this.markStage(coverageEvent, "rolling_windows_updated");
        }
        this.markStage(coverageEvent, "derivatives_updated");
        coverageEvent.reasonCodes = unique([
          ...coverageEvent.reasonCodes,
          "TRADE_TIMESERIES_ACCEPTED"
        ]);
      } else {
        this.markStage(coverageEvent, "timeseries_rejected");
        coverageEvent.reasonCodes = unique([
          ...coverageEvent.reasonCodes,
          observation.action === "duplicate"
            ? "TRADE_TIMESERIES_DUPLICATE_REJECTED"
            : "TRADE_TIMESERIES_REJECTED"
        ]);
      }
      this.refreshLatencies(coverageEvent);
      this.persistEvent(coverageEvent);
      this.persistSession();
    });
  }

  markDerivativeStrengthUpdated(event: FeedEvent): void {
    this.markBusinessStage(
      event,
      "derivative_strength_updated",
      "TRADE_DERIVATIVE_STRENGTH_UPDATED"
    );
  }

  markSignalUpdated(event: FeedEvent): void {
    this.markBusinessStage(event, "signal_updated", "TRADE_SIGNAL_UPDATED");
  }

  markScannerProjected(event: FeedEvent): void {
    this.markBusinessStage(
      event,
      "scanner_projected",
      "TRADE_SCANNER_ROW_PROJECTED"
    );
  }

  markBroadcastCompleted(event: FeedEvent): void {
    this.markBusinessStage(
      event,
      "broadcast_completed",
      "TRADE_BROADCAST_COMPLETED"
    );
  }

  markQueueCommittedAndPipelineCompleted(events: FeedEvent[]): void {
    for (const event of events) {
      this.withEvent(event, (coverageEvent) => {
        this.markStage(coverageEvent, "queue_committed");
        const timeseriesRejected =
          coverageEvent.stageTimestamps.timeseries_rejected !== undefined;
        const missing = requiredPipelineStages.filter(
          (stage) => coverageEvent.stageTimestamps[stage] === undefined
        );
        if (timeseriesRejected) {
          coverageEvent.pipelineOutcome = "rejected";
          coverageEvent.rejectionReason = "TIMESERIES_REJECTED";
          this.markStage(coverageEvent, "pipeline_rejected");
          coverageEvent.reasonCodes = unique([
            ...coverageEvent.reasonCodes,
            "TRADE_PIPELINE_REJECTED"
          ]);
        } else if (missing.length === 0) {
          coverageEvent.pipelineOutcome = "completed";
          this.markStage(coverageEvent, "pipeline_completed");
          coverageEvent.reasonCodes = unique([
            ...coverageEvent.reasonCodes,
            "TRADE_PIPELINE_COMPLETED"
          ]);
        } else {
          coverageEvent.pipelineOutcome = "failed_or_dropped";
          coverageEvent.failureStage = "pipeline_failed_or_dropped";
          coverageEvent.failureReason = `MISSING_REQUIRED_STAGES:${missing.join(",")}`;
          this.markStage(coverageEvent, "pipeline_failed_or_dropped");
          coverageEvent.reasonCodes = unique([
            ...coverageEvent.reasonCodes,
            "TRADE_PIPELINE_REQUIRED_STAGE_MISSING",
            "TRADE_PIPELINE_FAILED_OR_DROPPED"
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
      this.withEvent(event, (coverageEvent) => {
        this.markStage(coverageEvent, "queue_failed");
        coverageEvent.pipelineOutcome = "failed_or_dropped";
        coverageEvent.failureStage = "queue_failed";
        coverageEvent.failureReason = `${sanitizeReason(failureStage)}:${sanitizeReason(safeReason)}`;
        this.markStage(coverageEvent, "pipeline_failed_or_dropped");
        coverageEvent.completedAt = this.now().toISOString();
        coverageEvent.reasonCodes = unique([
          ...coverageEvent.reasonCodes,
          "TRADE_QUEUE_FAILED",
          "TRADE_PIPELINE_FAILED_OR_DROPPED"
        ]);
        this.refreshLatencies(coverageEvent);
        this.persistEvent(coverageEvent);
      });
    }
    this.persistSession();
  }

  requestStop(reason: string): boolean {
    const active = this.active;
    if (!active || active.stopRequestedAt) {
      return false;
    }
    const now = this.now().toISOString();
    active.stopRequestedAt = now;
    active.unsubscribeRequestedAt = now;
    active.stopReason = sanitizeReason(reason);
    this.recordSubscriptionEvent(
      "stop_requested",
      active.selectedMint,
      active.stopReason,
      ["TRADE_DATA_COVERAGE_STOP_REQUESTED"],
      now
    );
    this.persistSession();
    try {
      active.onStopRequested?.(active.stopReason);
    } catch (error) {
      this.recordTelemetryFailure(`STOP_HANDLER:${safeErrorClass(error)}`);
    }
    return true;
  }

  enforceRuntimeCap(): boolean {
    const active = this.active;
    if (!active || active.stopRequestedAt) {
      return false;
    }
    const elapsedMs = durationMs(active.startedAt, this.now().toISOString());
    return elapsedMs >= active.maxRuntimeMs
      ? this.requestStop("max_runtime")
      : false;
  }

  beginGrace(reason = "post_stop_grace"): void {
    const active = this.active;
    if (!active) {
      return;
    }
    if (!active.stopRequestedAt) {
      this.requestStop(reason);
    }
    if (
      !this.subscriptionEvents.some(
        (event) => event.eventType === "grace_started"
      )
    ) {
      this.recordSubscriptionEvent(
        "grace_started",
        active.selectedMint,
        reason,
        ["TRADE_DATA_COVERAGE_POST_STOP_GRACE_STARTED"]
      );
    }
  }

  finalize(
    reason: string,
    stoppedAt = this.now().toISOString()
  ): TradeDataCoverageSession | null {
    const active = this.active;
    if (!active) {
      return (
        this.latestFinalized ?? this.persistence.listSessions(1)[0] ?? null
      );
    }
    if (!active.stopRequestedAt) {
      this.requestStop(reason);
    }
    active.stoppedAt = stoppedAt;
    active.stopReason = active.stopReason ?? sanitizeReason(reason);
    this.recordSubscriptionEvent(
      "finalized",
      active.selectedMint,
      active.stopReason,
      ["TRADE_DATA_COVERAGE_FINALIZED"],
      stoppedAt
    );
    const summary = this.buildSummary(active);
    this.persistSafely(active, "save_session_final", () =>
      this.persistence.saveSession(summary)
    );
    this.latestFinalized = this.buildSummary(active);
    this.active = null;
    return this.latestFinalized;
  }

  async verifySampledSignatures(
    verifier: TradeDataCoverageTransactionVerifier | null
  ): Promise<void> {
    const active = this.active;
    if (!active || !active.chainVerify) {
      return;
    }
    const sampled = unique(
      [...this.events.values()]
        .filter(
          (event) =>
            event.normalizationOutcome === "succeeded" &&
            event.observedMint === active.selectedMint &&
            event.signature !== null
        )
        .map((event) => event.signature as string)
    ).slice(0, active.chainVerifyMaxSignatures);

    for (const signature of sampled) {
      const matching = [...this.events.values()].filter(
        (event) => event.signature === signature
      );
      let status: TradeDataChainVerificationStatus = "UNAVAILABLE";
      if (verifier) {
        try {
          const transaction = await verifier.getTransaction(signature);
          status = assessTradeTransaction(transaction, {
            mint: active.selectedMint,
            side: matching[0]?.side ?? null,
            trader: matching[0]?.trader ?? null
          });
        } catch {
          status = "UNAVAILABLE";
        }
      }
      for (const event of matching) {
        event.chainVerificationStatus = status;
        event.reasonCodes = unique([
          ...event.reasonCodes,
          `TRADE_CHAIN_${status}`
        ]);
        this.persistEvent(event);
      }
    }
    this.persistSession();
  }

  getSummary(): TradeDataCoverageSession | null {
    return this.active
      ? this.getActiveSummary()
      : (this.latestFinalized ?? this.persistence.listSessions(1)[0] ?? null);
  }

  getSession(sessionId: string): TradeDataCoverageSession | null {
    if (this.active?.sessionId === sessionId) {
      return this.getActiveSummary();
    }
    return this.persistence.getSession(sessionId);
  }

  listSessions(limit: number): TradeDataCoverageSession[] {
    const persisted = this.persistence.listSessions(limit);
    if (!this.active) {
      return persisted;
    }
    return [
      this.getActiveSummary(),
      ...persisted.filter((item) => item.sessionId !== this.active?.sessionId)
    ].slice(0, limit);
  }

  listEvents(query: TradeDataCoverageEventQuery): TradeDataCoverageEvent[] {
    return this.persistence.listEvents(query);
  }

  listSubscriptionEvents(
    query: TradeDataSubscriptionEventQuery
  ): TradeDataSubscriptionEvent[] {
    return this.persistence.listSubscriptionEvents(query);
  }

  private observeNormalization(
    observation: PumpPortalTradeNormalizationObservation
  ): PumpPortalTradeNormalizationResult | null {
    const active = this.active;
    const coverageEvent = this.events.get(observation.correlationId);
    if (!active || !coverageEvent) {
      return null;
    }
    if (coverageEvent.normalizationOutcome !== "pending") {
      this.recordTelemetryFailure(
        "TRADE_NORMALIZATION_OUTCOME_ALREADY_TERMINAL"
      );
      return null;
    }
    const trade = observation.event;
    if (!trade) {
      coverageEvent.normalizationOutcome = "rejected";
      coverageEvent.pipelineOutcome = "not_applicable";
      coverageEvent.rejectionReason =
        observation.rejectionReason ?? "TRADE_NORMALIZATION_REJECTED";
      this.markStageAt(
        coverageEvent,
        "normalization_rejected",
        observation.normalizedAt,
        observation.normalizedAtMonotonicMs
      );
      coverageEvent.completedAt = observation.normalizedAt;
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        "TRADE_NORMALIZATION_REJECTED"
      ]);
      this.refreshLatencies(coverageEvent);
      this.persistEvent(coverageEvent);
      this.persistSession();
      return rejectedNormalizationResult("TRADE_NORMALIZATION_REJECTED");
    }

    this.applyNormalizedTrade(coverageEvent, trade);
    const sourceEventKey = createStableTokenTradeEventKey(trade);
    coverageEvent.sourceEventKey = sourceEventKey;
    coverageEvent.consistencyChecks = createConsistencyChecks(
      trade,
      active.selectedMint,
      coverageEvent.receivedAt
    );
    if (
      Object.values(coverageEvent.consistencyChecks).some(
        (check) => check.status === "failed"
      )
    ) {
      coverageEvent.confidence = "low";
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        "TRADE_CONSISTENCY_CHECK_FAILED",
        "TRADE_COVERAGE_CONFIDENCE_REDUCED"
      ]);
    }
    const normalizationRejection = getNormalizationRejection(trade);
    if (normalizationRejection) {
      coverageEvent.normalizationOutcome = "rejected";
      coverageEvent.pipelineOutcome = "not_applicable";
      coverageEvent.rejectionReason = normalizationRejection;
      coverageEvent.usableForMetrics = false;
      this.markStageAt(
        coverageEvent,
        "normalization_rejected",
        observation.normalizedAt,
        observation.normalizedAtMonotonicMs
      );
      coverageEvent.completedAt = observation.normalizedAt;
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        normalizationRejection,
        "TRADE_NORMALIZATION_REJECTED"
      ]);
      this.observeMatchingTradeForCaps(coverageEvent);
      this.refreshLatencies(coverageEvent);
      this.persistEvent(coverageEvent);
      this.persistSession();
      return rejectedNormalizationResult(normalizationRejection);
    }

    coverageEvent.normalizationOutcome = "succeeded";
    this.markStageAt(
      coverageEvent,
      "normalization_succeeded",
      observation.normalizedAt,
      observation.normalizedAtMonotonicMs
    );
    const persisted = this.persistence.findEventBySourceKey(
      active.sessionId,
      sourceEventKey
    );
    const duplicate =
      this.seenSourceEventKeys.has(sourceEventKey) ||
      (persisted !== null &&
        persisted.correlationId !== coverageEvent.correlationId);
    if (duplicate) {
      coverageEvent.pipelineOutcome = "duplicate";
      coverageEvent.duplicateKey = sourceEventKey;
      coverageEvent.duplicateReason = "SOURCE_EVENT_KEY_ALREADY_SEEN";
      coverageEvent.usableForMetrics = false;
      this.markStage(coverageEvent, "duplicate_detected");
      coverageEvent.completedAt = this.now().toISOString();
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        "TRADE_DUPLICATE_SUPPRESSED"
      ]);
      this.observeMatchingTradeForCaps(coverageEvent);
      this.refreshLatencies(coverageEvent);
      this.persistEvent(coverageEvent);
      this.persistSession();
      return {
        acceptedForPipeline: false,
        duplicate: true,
        duplicateKey: sourceEventKey,
        duplicateReason: coverageEvent.duplicateReason,
        rejectionReason: null,
        metadata: null
      };
    }
    this.seenSourceEventKeys.add(sourceEventKey);
    const mintMatches = coverageEvent.observedMint === active.selectedMint;
    coverageEvent.usableForMetrics =
      mintMatches && trade.usableForMetrics === true;
    if (!mintMatches || !coverageEvent.usableForMetrics) {
      coverageEvent.pipelineOutcome = "rejected";
      coverageEvent.rejectionReason = !mintMatches
        ? "TRADE_WRONG_MINT"
        : "TRADE_UNUSABLE_FOR_METRICS";
      this.markStage(coverageEvent, "pipeline_rejected");
      coverageEvent.completedAt = this.now().toISOString();
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        coverageEvent.rejectionReason
      ]);
    } else {
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        "TRADE_NORMALIZATION_SUCCEEDED",
        "TRADE_SELECTED_MINT_MATCHED"
      ]);
    }
    this.observeMatchingTradeForCaps(coverageEvent);
    this.refreshLatencies(coverageEvent);
    this.persistEvent(coverageEvent);
    this.persistSession();
    return {
      acceptedForPipeline: coverageEvent.pipelineOutcome === "pending",
      duplicate: false,
      duplicateKey: null,
      duplicateReason: null,
      rejectionReason: coverageEvent.rejectionReason,
      metadata:
        coverageEvent.pipelineOutcome === "pending"
          ? {
              schemaVersion: "trade-data-coverage-v1",
              sessionId: active.sessionId,
              correlationId: coverageEvent.correlationId,
              sourceEventKey,
              receivedAtMonotonicMs:
                coverageEvent.monotonicStages.raw_received ??
                observation.receivedAtMonotonicMs,
              normalizedAtMonotonicMs: observation.normalizedAtMonotonicMs
            }
          : null
    };
  }

  private applyNormalizedTrade(
    event: MutableCoverageEvent,
    trade: TokenTradeEvent
  ): void {
    event.observedMint = trade.mint === "UNKNOWN_MINT" ? null : trade.mint;
    event.signature = trade.signature ?? null;
    event.eventIndex = trade.eventIndex ?? null;
    event.providerTimestamp = trade.providerTimestamp ?? null;
    event.side = trade.side;
    event.trader = trade.trader ?? null;
    event.rawSolAmount = finiteOrNull(
      trade.rawSolAmount ?? trade.volumeSol ?? null
    );
    event.rawTokenAmount = finiteOrNull(
      trade.rawTokenAmount ?? trade.tokenAmount ?? null
    );
    event.normalizedVolumeSol = finiteOrNull(trade.volumeSol ?? null);
    event.normalizedTokenAmount = finiteOrNull(trade.tokenAmount ?? null);
    event.normalizedPriceSol = finiteOrNull(trade.priceSol ?? null);
    event.marketCapSol = finiteOrNull(trade.marketCapSol ?? null);
    event.virtualTokenReserves = finiteOrNull(
      trade.virtualTokenReserves ?? null
    );
    event.virtualSolReserves = finiteOrNull(trade.virtualSolReserves ?? null);
    event.amountNormalizationMode = trade.amountNormalizationMode ?? "unknown";
    event.confidence = trade.confidence ?? "low";
    event.reasonCodes = unique([
      ...event.reasonCodes,
      ...(trade.reasonCodes ?? [])
    ]);
  }

  private observeMatchingTradeForCaps(event: MutableCoverageEvent): void {
    const active = this.active;
    if (!active || event.observedMint !== active.selectedMint) {
      return;
    }
    const observedAt = this.now().toISOString();
    active.firstTradeAt ??= observedAt;
    active.finalTradeAt = observedAt;
    if (
      !this.subscriptionEvents.some(
        (item) => item.eventType === "first_trade_received"
      )
    ) {
      this.recordSubscriptionEvent(
        "first_trade_received",
        active.selectedMint,
        null,
        ["TRADE_DATA_COVERAGE_FIRST_TRADE_RECEIVED"],
        observedAt
      );
    }
    const matchingTradeCount = [...this.events.values()].filter(
      (item) =>
        item.parserOutcome === "recognized_trade" &&
        item.observedMint === active.selectedMint
    ).length;
    const estimatedCost = matchingTradeCount * this.estimatedCostPerEventSol;
    if (matchingTradeCount >= active.maxEvents) {
      this.requestStop("max_events");
    } else if (estimatedCost >= active.maxCostSol) {
      this.requestStop("max_estimated_cost");
    }
  }

  private recordSubscriptionEvent(
    eventType: TradeDataSubscriptionEventType,
    mint: string,
    safeReason: string | null,
    reasonCodes: string[],
    timestamp = this.now().toISOString()
  ): void {
    const active = this.active;
    if (!active) {
      return;
    }
    if (eventType === "subscribe_sent") {
      active.subscriptionSentAt ??= timestamp;
    } else if (eventType === "subscribe_acknowledged") {
      active.subscriptionAcknowledgedAt ??= timestamp;
    } else if (eventType === "unsubscribe_sent") {
      active.unsubscribeSentAt ??= timestamp;
    }
    const event = TradeDataSubscriptionEventSchema.parse({
      schemaVersion: "trade-data-coverage-v1",
      subscriptionEventId: `${active.sessionId}:subscription-${++active.subscriptionSequence}`,
      sessionId: active.sessionId,
      mint,
      eventType,
      timestamp,
      safeReason,
      reasonCodes: unique(reasonCodes),
      payload: {},
      createdAt: timestamp
    });
    this.subscriptionEvents.push(event);
    this.persistSafely(active, "save_subscription_event", () =>
      this.persistence.saveSubscriptionEvent(event)
    );
  }

  private markBusinessStage(
    event: FeedEvent,
    stage: TradeDataCoverageStage,
    reasonCode: string
  ): void {
    this.withEvent(event, (coverageEvent) => {
      this.markStage(coverageEvent, stage);
      coverageEvent.reasonCodes = unique([
        ...coverageEvent.reasonCodes,
        reasonCode
      ]);
      this.refreshLatencies(coverageEvent);
      this.persistEvent(coverageEvent);
      this.persistSession();
    });
  }

  private withEvent(
    event: FeedEvent,
    operation: (coverageEvent: MutableCoverageEvent) => void
  ): void {
    const correlationId = event.tradeCoverage?.correlationId;
    if (!correlationId || !this.active) {
      return;
    }
    const coverageEvent = this.events.get(correlationId);
    if (!coverageEvent) {
      this.recordTelemetryFailure("TRADE_COVERAGE_CORRELATION_NOT_FOUND");
      return;
    }
    operation(coverageEvent);
  }

  private markStage(
    event: MutableCoverageEvent,
    stage: TradeDataCoverageStage
  ): void {
    this.markStageAt(
      event,
      stage,
      this.now().toISOString(),
      this.monotonicNow()
    );
  }

  private markStageAt(
    event: MutableCoverageEvent,
    stage: TradeDataCoverageStage,
    timestamp: string,
    monotonicTimestamp: number
  ): void {
    event.stageTimestamps[stage] = timestamp;
    event.monotonicStages[stage] = monotonicTimestamp;
  }

  private refreshLatencies(event: MutableCoverageEvent): void {
    event.stageLatenciesMs = calculateLatencies(event);
  }

  private recordTelemetryFailure(reason: string): void {
    const active = this.active;
    if (!active) {
      return;
    }
    active.telemetryFailureCount += 1;
    active.lastTelemetryFailure = sanitizeReason(reason);
  }

  private persistEvent(event: MutableCoverageEvent): void {
    const active = this.active;
    if (!active) {
      return;
    }
    this.persistSafely(active, "save_event", () =>
      this.persistence.saveEvent(stripMutableFields(event))
    );
  }

  private persistSession(): void {
    const active = this.active;
    if (!active) {
      return;
    }
    this.persistSafely(active, "save_session", () =>
      this.persistence.saveSession(this.buildSummary(active))
    );
  }

  private persistSafely(
    active: ActiveCoverageSession,
    stage: string,
    operation: () => unknown
  ): void {
    try {
      operation();
    } catch (error) {
      active.telemetryFailureCount += 1;
      active.lastTelemetryFailure = `${stage}:${safeErrorClass(error)}`;
    }
  }

  private getActiveSummary(): TradeDataCoverageSession {
    if (!this.active) {
      throw new Error("No active trade data coverage session.");
    }
    return this.buildSummary(this.active);
  }

  private buildSummary(
    active: ActiveCoverageSession
  ): TradeDataCoverageSession {
    const events = [...this.events.values()];
    const counts = countEvents(events);
    const equations = buildEquations(counts);
    const maximumAbsoluteResidual = equations.reduce(
      (maximum, equation) => Math.max(maximum, Math.abs(equation.residual)),
      0
    );
    const latencyDistributions = Object.fromEntries(
      tradeDataCoverageLatencyKeys.map((key) => [
        key,
        aggregateLatency(events, key)
      ])
    ) as Record<
      TradeDataCoverageLatencyKey,
      TradeDataCoverageLatencyDistribution
    >;
    const consistencyChecks = events.flatMap((event) =>
      Object.values(event.consistencyChecks)
    );
    const stoppedOrNow = active.stoppedAt ?? this.now().toISOString();
    const activeEnd =
      active.unsubscribeSentAt ?? active.stopRequestedAt ?? stoppedOrNow;
    const locallyReconciled =
      maximumAbsoluteResidual === 0 &&
      active.telemetryFailureCount === 0 &&
      events.every((event) => event.parserOutcome !== "pending") &&
      events
        .filter((event) => event.normalizationOutcome === "succeeded")
        .every((event) => event.pipelineOutcome !== "pending");
    const chainStatuses = events.map((event) => event.chainVerificationStatus);
    return TradeDataCoverageSessionSchema.parse({
      schemaVersion: "trade-data-coverage-v1",
      sessionId: active.sessionId,
      provider: this.provider,
      sourceMode: this.sourceMode,
      startedAt: active.startedAt,
      stoppedAt: active.stoppedAt,
      stopReason: active.stopReason,
      selectedMint: active.selectedMint,
      subscriptionRequestedAt: active.subscriptionRequestedAt,
      subscriptionSentAt: active.subscriptionSentAt,
      subscriptionAcknowledgedAt: active.subscriptionAcknowledgedAt,
      firstTradeAt: active.firstTradeAt,
      unsubscribeRequestedAt: active.unsubscribeRequestedAt,
      unsubscribeSentAt: active.unsubscribeSentAt,
      finalTradeAt: active.finalTradeAt,
      activeDurationMs: durationMs(active.startedAt, activeEnd),
      observationDurationMs: durationMs(active.startedAt, stoppedOrNow),
      postStopGraceMs: active.postStopGraceMs,
      maxEvents: active.maxEvents,
      maxRuntimeMs: active.maxRuntimeMs,
      maxCostSol: active.maxCostSol,
      ...counts,
      oneSecondBucketCount: active.oneSecondBucketCount,
      completedOneSecondBucketCount: active.completedOneSecondBucketCount,
      validSampleCount: active.validSampleCount,
      firstDerivativeAvailable: active.firstDerivativeAvailable,
      secondDerivativeAvailable: active.secondDerivativeAvailable,
      telemetryFailureCount: active.telemetryFailureCount,
      estimatedCostSol: roundSol(
        counts.matchingSelectedTradeCount * this.estimatedCostPerEventSol
      ),
      estimatedCostPerEventSol: this.estimatedCostPerEventSol,
      costIsEstimated: true,
      consistencySummary: {
        passed: consistencyChecks.filter((check) => check.status === "passed")
          .length,
        failed: consistencyChecks.filter((check) => check.status === "failed")
          .length,
        unavailable: consistencyChecks.filter(
          (check) => check.status === "unavailable"
        ).length
      },
      latencyDistributions,
      reconciliation: { equations, maximumAbsoluteResidual },
      chainVerification: {
        enabled: active.chainVerify,
        maxSignatures: active.chainVerifyMaxSignatures,
        sampledSignatures: chainStatuses.filter(
          (status) => status !== "NOT_REQUESTED"
        ).length,
        verified: chainStatuses.filter((status) => status === "VERIFIED")
          .length,
        partial: chainStatuses.filter((status) => status === "PARTIAL").length,
        mismatch: chainStatuses.filter((status) => status === "MISMATCH")
          .length,
        unavailable: chainStatuses.filter((status) => status === "UNAVAILABLE")
          .length
      },
      subscriptionLifecycle: this.subscriptionEvents,
      localReconciliationStatus: locallyReconciled
        ? "TRADE_DATA_LOCALLY_RECONCILED"
        : "TRADE_DATA_LOCAL_RECONCILIATION_FAILED",
      upstreamCoverageStatus: "UPSTREAM_TRADE_COMPLETENESS_UNPROVEN",
      reasonCodes: unique([
        locallyReconciled
          ? "TRADE_DATA_LOCAL_PIPELINE_RECONCILED"
          : "TRADE_DATA_LOCAL_PIPELINE_RECONCILIATION_FAILED",
        "UPSTREAM_TRADE_COMPLETENESS_UNPROVEN",
        "PUMPPORTAL_SEQUENCE_OR_INDEPENDENT_COMPARATOR_UNAVAILABLE",
        "TRADE_DATA_COST_ESTIMATED",
        ...(active.lastTelemetryFailure
          ? [`TRADE_DATA_TELEMETRY_FAILURE_${active.lastTelemetryFailure}`]
          : []),
        ...(active.chainVerify
          ? []
          : ["TRADE_DATA_CHAIN_VERIFICATION_DISABLED"]),
        "PAPER_ONLY",
        "ACCOUNT_TRADES_DISABLED",
        "PAPER_AUTOMATION_DISABLED",
        "LIGHTNING_DISABLED",
        "SIGNING_DISABLED",
        "TRANSACTION_SENDING_DISABLED",
        "LIVE_TRADING_DISABLED"
      ]),
      updatedAt: stoppedOrNow,
      paperOnly: true,
      accountTradesActive: false,
      paperAutomationActive: false,
      lightningActive: false,
      signingActive: false,
      transactionSendingActive: false,
      liveTradingEnabled: false
    });
  }
}

const requiredPipelineStages: TradeDataCoverageStage[] = [
  "persistence_completed",
  "timeseries_accepted",
  "snapshot_updated",
  "rolling_windows_updated",
  "derivatives_updated",
  "derivative_strength_updated",
  "signal_updated",
  "scanner_projected",
  "broadcast_completed"
];

export function createTradeDataCoverageService(
  options: TradeDataCoverageServiceOptions
): TradeDataCoverageService {
  return new TradeDataCoverageService(options);
}

export function deterministicTradeDataPercentile(
  values: number[],
  percentile: number
): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const rank = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1)
  );
  return sorted[rank] ?? null;
}

function getNormalizationRejection(event: TokenTradeEvent): string | null {
  if (!event.mint || event.mint === "UNKNOWN_MINT") {
    return "TRADE_MINT_MISSING";
  }
  if (event.side !== "buy" && event.side !== "sell") {
    return "TRADE_SIDE_UNKNOWN";
  }
  const rawSol = event.rawSolAmount ?? event.volumeSol;
  const rawToken = event.rawTokenAmount ?? event.tokenAmount;
  if (
    rawSol === undefined ||
    rawSol === null ||
    rawToken === undefined ||
    rawToken === null
  ) {
    return "TRADE_AMOUNTS_MISSING";
  }
  if (!Number.isFinite(rawSol) || !Number.isFinite(rawToken)) {
    return "TRADE_AMOUNTS_NONFINITE";
  }
  if (rawSol < 0 || rawToken < 0) {
    return "TRADE_AMOUNTS_NEGATIVE";
  }
  if (rawSol === 0 || rawToken === 0) {
    return "TRADE_AMOUNTS_ZERO";
  }
  if (
    event.amountNormalizationMode === "unknown" ||
    event.amountNormalizationMode === "raw"
  ) {
    return "TRADE_TOKEN_AMOUNT_UNITS_UNDERSTOOD_REQUIRED";
  }
  if (
    !isPositiveFinite(event.volumeSol) ||
    !isPositiveFinite(event.tokenAmount) ||
    !isPositiveFinite(event.priceSol)
  ) {
    return "TRADE_NORMALIZED_METRICS_INVALID";
  }
  return null;
}

function createConsistencyChecks(
  event: TokenTradeEvent,
  selectedMint: string,
  receivedAt: string
): Record<string, TradeDataConsistencyCheck> {
  const check = (
    status: TradeDataConsistencyCheck["status"],
    reasonCode: string,
    values: Partial<
      Omit<TradeDataConsistencyCheck, "status" | "reasonCode">
    > = {}
  ): TradeDataConsistencyCheck => ({ status, reasonCode, ...values });
  const finiteAmounts =
    Number.isFinite(event.rawSolAmount ?? event.volumeSol) &&
    Number.isFinite(event.rawTokenAmount ?? event.tokenAmount);
  const unitsUnderstood =
    event.amountNormalizationMode === "ui" ||
    event.amountNormalizationMode === "decimals_normalized";
  const expectedVolume =
    isPositiveFinite(event.priceSol) && isPositiveFinite(event.tokenAmount)
      ? (event.priceSol ?? 0) * (event.tokenAmount ?? 0)
      : null;
  const observedVolume = finiteOrNull(event.volumeSol ?? null);
  const priceTolerance = 1e-8;
  const priceMatches =
    expectedVolume !== null && observedVolume !== null
      ? approximatelyEqual(expectedVolume, observedVolume, priceTolerance)
      : null;
  const curvePrice =
    isPositiveFinite(event.virtualSolReserves) &&
    isPositiveFinite(event.virtualTokenReserves)
      ? (event.virtualSolReserves ?? 0) / (event.virtualTokenReserves ?? 1)
      : null;
  const curveMatches =
    curvePrice !== null && isPositiveFinite(event.priceSol)
      ? approximatelyEqual(curvePrice, event.priceSol ?? 0, 0.1)
      : null;
  const providerTimeMs = event.providerTimestamp
    ? Date.parse(event.providerTimestamp)
    : NaN;
  const receivedAtMs = Date.parse(receivedAt);
  const plausibleTimestamp =
    Number.isFinite(providerTimeMs) && Number.isFinite(receivedAtMs)
      ? Math.abs(receivedAtMs - providerTimeMs) <= 86_400_000
      : null;
  return {
    mint_matches_subscription: check(
      event.mint === selectedMint ? "passed" : "failed",
      event.mint === selectedMint ? "TRADE_MINT_MATCHED" : "TRADE_WRONG_MINT"
    ),
    amount_fields_finite: check(
      finiteAmounts ? "passed" : "failed",
      finiteAmounts ? "TRADE_AMOUNTS_FINITE" : "TRADE_AMOUNTS_NONFINITE"
    ),
    amount_units_understood: check(
      unitsUnderstood ? "passed" : "failed",
      unitsUnderstood
        ? "TRADE_AMOUNT_UNITS_UNDERSTOOD"
        : "TRADE_AMOUNT_UNITS_UNKNOWN"
    ),
    side_recognized: check(
      event.side === "buy" || event.side === "sell" ? "passed" : "failed",
      event.side === "buy" || event.side === "sell"
        ? "TRADE_SIDE_RECOGNIZED"
        : "TRADE_SIDE_UNKNOWN"
    ),
    signature_present: check(
      event.signature ? "passed" : "failed",
      event.signature ? "TRADE_SIGNATURE_PRESENT" : "TRADE_SIGNATURE_MISSING"
    ),
    timestamp_plausible: check(
      plausibleTimestamp === null
        ? "unavailable"
        : plausibleTimestamp
          ? "passed"
          : "failed",
      plausibleTimestamp === null
        ? "TRADE_PROVIDER_TIMESTAMP_UNAVAILABLE"
        : plausibleTimestamp
          ? "TRADE_PROVIDER_TIMESTAMP_PLAUSIBLE"
          : "TRADE_PROVIDER_TIMESTAMP_IMPLAUSIBLE"
    ),
    price_volume_consistency: check(
      priceMatches === null
        ? "unavailable"
        : priceMatches
          ? "passed"
          : "failed",
      priceMatches === null
        ? "TRADE_PRICE_VOLUME_CHECK_UNAVAILABLE"
        : priceMatches
          ? "TRADE_PRICE_VOLUME_CONSISTENT"
          : "TRADE_PRICE_VOLUME_MISMATCH",
      {
        expected: expectedVolume,
        observed: observedVolume,
        tolerance: priceTolerance
      }
    ),
    curve_price_consistency: check(
      curveMatches === null
        ? "unavailable"
        : curveMatches
          ? "passed"
          : "failed",
      curveMatches === null
        ? "TRADE_CURVE_PRICE_CHECK_UNAVAILABLE"
        : curveMatches
          ? "TRADE_CURVE_PRICE_CONSISTENT"
          : "TRADE_CURVE_PRICE_MISMATCH",
      {
        expected: curvePrice,
        observed: finiteOrNull(event.priceSol ?? null),
        tolerance: curvePrice === null ? null : Math.abs(curvePrice) * 0.1
      }
    )
  };
}

function calculateLatencies(
  event: MutableCoverageEvent
): Partial<Record<TradeDataCoverageLatencyKey, number | null>> {
  const duration = (
    from: TradeDataCoverageStage,
    to: TradeDataCoverageStage
  ): number | null => {
    const start = event.monotonicStages[from];
    const end = event.monotonicStages[to];
    return start !== undefined &&
      end !== undefined &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end >= start
      ? roundMs(end - start)
      : null;
  };
  const terminal =
    event.pipelineOutcome === "completed"
      ? "pipeline_completed"
      : event.pipelineOutcome === "failed_or_dropped"
        ? "pipeline_failed_or_dropped"
        : event.pipelineOutcome === "rejected"
          ? "pipeline_rejected"
          : null;
  return {
    provider_to_receive: wallDuration(
      event.providerTimestamp,
      event.receivedAt
    ),
    receive_to_normalize:
      duration("raw_received", "normalization_succeeded") ??
      duration("raw_received", "normalization_rejected"),
    normalize_to_persist: duration(
      "normalization_succeeded",
      "persistence_completed"
    ),
    persist_to_timeseries:
      duration("persistence_completed", "timeseries_accepted") ??
      duration("persistence_completed", "timeseries_rejected"),
    timeseries_to_scanner: duration("timeseries_accepted", "scanner_projected"),
    receive_to_scanner: duration("raw_received", "scanner_projected"),
    receive_to_pipeline_complete: terminal
      ? duration("raw_received", terminal)
      : null
  };
}

function aggregateLatency(
  events: MutableCoverageEvent[],
  key: TradeDataCoverageLatencyKey
): TradeDataCoverageLatencyDistribution {
  const eligible = events.filter((event) =>
    key === "provider_to_receive"
      ? true
      : event.parserOutcome === "recognized_trade"
  );
  const values = eligible
    .map((event) => event.stageLatenciesMs[key])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0
    );
  return {
    availableCount: values.length,
    unavailableCount: eligible.length - values.length,
    min: values.length > 0 ? Math.min(...values) : null,
    p50: deterministicTradeDataPercentile(values, 0.5),
    p95: deterministicTradeDataPercentile(values, 0.95),
    p99: deterministicTradeDataPercentile(values, 0.99),
    max: values.length > 0 ? Math.max(...values) : null
  };
}

function countEvents(events: MutableCoverageEvent[]) {
  const count = (predicate: (event: MutableCoverageEvent) => boolean) =>
    events.filter(predicate).length;
  const stage = (name: TradeDataCoverageStage) =>
    count((event) => event.stageTimestamps[name] !== undefined);
  const matchingSelectedTradeCount = count(
    (event) =>
      event.parserOutcome === "recognized_trade" &&
      event.observedMint === event.subscribedMint
  );
  return {
    rawFrameCount: events.length,
    parsedFrameCount: count(
      (event) =>
        event.parserOutcome !== "parse_failed" &&
        event.parserOutcome !== "pending"
    ),
    parseFailureCount: count((event) => event.parserOutcome === "parse_failed"),
    recognizedTradeCount: count(
      (event) => event.parserOutcome === "recognized_trade"
    ),
    recognizedNonTradeCount: count(
      (event) => event.parserOutcome === "recognized_non_trade"
    ),
    unknownPayloadCount: count(
      (event) => event.parserOutcome === "unknown_payload"
    ),
    normalizationSuccessCount: count(
      (event) => event.normalizationOutcome === "succeeded"
    ),
    normalizationRejectCount: count(
      (event) => event.normalizationOutcome === "rejected"
    ),
    duplicateCount: count((event) => event.pipelineOutcome === "duplicate"),
    rejectedCount: count((event) => event.pipelineOutcome === "rejected"),
    pipelineCompletedCount: count(
      (event) => event.pipelineOutcome === "completed"
    ),
    pipelineFailedOrDroppedCount: count(
      (event) => event.pipelineOutcome === "failed_or_dropped"
    ),
    queueAcceptedCount: stage("queue_accepted"),
    queueCommittedCount: stage("queue_committed"),
    queueFailureCount: stage("queue_failed"),
    persistenceCompletedCount: stage("persistence_completed"),
    timeseriesAcceptedCount: stage("timeseries_accepted"),
    timeseriesRejectedCount: stage("timeseries_rejected"),
    snapshotUpdatedCount: stage("snapshot_updated"),
    rollingWindowsUpdatedCount: stage("rolling_windows_updated"),
    derivativeUpdatedCount: stage("derivatives_updated"),
    derivativeStrengthUpdatedCount: stage("derivative_strength_updated"),
    signalUpdatedCount: stage("signal_updated"),
    scannerProjectedCount: stage("scanner_projected"),
    broadcastCompletedCount: stage("broadcast_completed"),
    postStopFrameCount: count((event) => event.postStop),
    postStopTradeCount: count(
      (event) => event.postStop && event.parserOutcome === "recognized_trade"
    ),
    unexpectedPostStopTradeCount: count(
      (event) =>
        event.postStopClassification === "unexpected_after_unsubscribe" &&
        event.parserOutcome === "recognized_trade"
    ),
    usableTradeCount: count(
      (event) =>
        event.normalizationOutcome === "succeeded" && event.usableForMetrics
    ),
    unusableTradeCount: count(
      (event) =>
        event.parserOutcome === "recognized_trade" && !event.usableForMetrics
    ),
    wrongMintFrameCount: count(
      (event) =>
        event.observedMint !== null &&
        event.observedMint !== event.subscribedMint
    ),
    missingSignatureCount: count(
      (event) =>
        event.parserOutcome === "recognized_trade" && event.signature === null
    ),
    missingAmountCount: count(
      (event) =>
        event.parserOutcome === "recognized_trade" &&
        (event.rawSolAmount === null || event.rawTokenAmount === null)
    ),
    consistencyMismatchCount: count((event) =>
      Object.values(event.consistencyChecks).some(
        (check) => check.status === "failed"
      )
    ),
    matchingSelectedTradeCount
  };
}

function buildEquations(counts: ReturnType<typeof countEvents>) {
  const equation = (
    name: string,
    left: number,
    right: number,
    expression: string
  ) => ({
    name,
    left,
    right,
    residual: left - right,
    holds: left === right,
    expression
  });
  return [
    equation(
      "trade_frame_classification",
      counts.rawFrameCount,
      counts.parseFailureCount +
        counts.recognizedTradeCount +
        counts.recognizedNonTradeCount +
        counts.unknownPayloadCount,
      "trade_session_frames = parse_failed + recognized_trade + recognized_non_trade + unknown_payload"
    ),
    equation(
      "recognized_trade_normalization",
      counts.recognizedTradeCount,
      counts.normalizationSuccessCount + counts.normalizationRejectCount,
      "recognized_trade = normalization_succeeded + normalization_rejected"
    ),
    equation(
      "normalization_terminal",
      counts.normalizationSuccessCount,
      counts.pipelineCompletedCount +
        counts.duplicateCount +
        counts.rejectedCount +
        counts.pipelineFailedOrDroppedCount,
      "normalization_succeeded = pipeline_completed + duplicate + rejected + failed_or_dropped"
    ),
    equation(
      "usable_committed_timeseries",
      counts.queueCommittedCount,
      counts.timeseriesAcceptedCount + counts.timeseriesRejectedCount,
      "usable_committed_trade = timeseries_accepted + timeseries_rejected"
    )
  ];
}

function parserStage(
  outcome: Exclude<TradeDataCoverageEvent["parserOutcome"], "pending">
): TradeDataCoverageStage {
  switch (outcome) {
    case "parse_failed":
      return "parse_failed";
    case "recognized_trade":
      return "trade_recognized";
    case "recognized_non_trade":
      return "non_trade_recognized";
    case "unknown_payload":
      return "unknown_payload";
  }
}

function parserReasonCode(
  outcome: Exclude<TradeDataCoverageEvent["parserOutcome"], "pending">
): string {
  return `TRADE_SESSION_${outcome.toUpperCase()}`;
}

function rejectedNormalizationResult(
  reason: string
): PumpPortalTradeNormalizationResult {
  return {
    acceptedForPipeline: false,
    duplicate: false,
    duplicateKey: null,
    duplicateReason: null,
    rejectionReason: reason,
    metadata: null
  };
}

export function assessTradeTransaction(
  value: unknown,
  expected: {
    mint: string;
    side: "buy" | "sell" | "unknown" | null;
    trader: string | null;
  }
): TradeDataChainVerificationStatus {
  const transaction = asRecord(value);
  const meta = asRecord(transaction?.meta);
  const message = asRecord(asRecord(transaction?.transaction)?.message);
  if (!transaction || !meta || !message) {
    return "UNAVAILABLE";
  }
  if (meta.err !== null && meta.err !== undefined) {
    return "MISMATCH";
  }

  const preTokenBalances = readRecordArray(meta.preTokenBalances);
  const postTokenBalances = readRecordArray(meta.postTokenBalances);
  const mintBalances = [...preTokenBalances, ...postTokenBalances].filter(
    (balance) => balance.mint === expected.mint
  );
  if (mintBalances.length === 0) {
    return "MISMATCH";
  }
  if (expected.side !== "buy" && expected.side !== "sell") {
    return "PARTIAL";
  }

  const tokenDeltas = tokenBalanceDeltas(
    preTokenBalances,
    postTokenBalances,
    expected.mint,
    expected.trader
  );
  if (tokenDeltas.length === 0) {
    return "PARTIAL";
  }
  const expectedTokenSign = expected.side === "buy" ? 1 : -1;
  if (!tokenDeltas.some((delta) => Math.sign(delta) === expectedTokenSign)) {
    return tokenDeltas.some((delta) => delta !== 0) ? "MISMATCH" : "PARTIAL";
  }

  if (!expected.trader) {
    return "PARTIAL";
  }
  const accountKeys = readAccountKeys(message.accountKeys);
  const traderIndex = accountKeys.indexOf(expected.trader);
  const preBalances = readNumberArray(meta.preBalances);
  const postBalances = readNumberArray(meta.postBalances);
  if (
    traderIndex < 0 ||
    preBalances[traderIndex] === undefined ||
    postBalances[traderIndex] === undefined
  ) {
    return "PARTIAL";
  }
  const solDelta =
    (postBalances[traderIndex] as number) -
    (preBalances[traderIndex] as number);
  const expectedSolSign = expected.side === "buy" ? -1 : 1;
  return Math.sign(solDelta) === expectedSolSign ? "VERIFIED" : "MISMATCH";
}

function tokenBalanceDeltas(
  pre: Record<string, unknown>[],
  post: Record<string, unknown>[],
  mint: string,
  trader: string | null
): number[] {
  const identities = new Set<string>();
  for (const balance of [...pre, ...post]) {
    if (balance.mint !== mint) {
      continue;
    }
    const owner = typeof balance.owner === "string" ? balance.owner : "";
    if (trader && owner !== trader) {
      continue;
    }
    identities.add(`${String(balance.accountIndex)}:${owner}`);
  }
  return [...identities]
    .map((identity) => {
      const [accountIndex, owner = ""] = identity.split(":");
      const find = (balances: Record<string, unknown>[]) =>
        balances.find(
          (balance) =>
            balance.mint === mint &&
            String(balance.accountIndex) === accountIndex &&
            (typeof balance.owner === "string" ? balance.owner : "") === owner
        );
      return tokenUiAmount(find(post)) - tokenUiAmount(find(pre));
    })
    .filter(Number.isFinite);
}

function tokenUiAmount(balance: Record<string, unknown> | undefined): number {
  if (!balance) {
    return 0;
  }
  const ui = asRecord(balance.uiTokenAmount);
  const candidate = ui?.uiAmount ?? ui?.uiAmountString;
  const parsed = typeof candidate === "string" ? Number(candidate) : candidate;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function readAccountKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry];
    }
    const record = asRecord(entry);
    return typeof record?.pubkey === "string" ? [record.pubkey] : [];
  });
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const record = asRecord(entry);
        return record ? [record] : [];
      })
    : [];
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((entry) =>
        typeof entry === "number" && Number.isFinite(entry) ? entry : Number.NaN
      )
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stripMutableFields(
  event: MutableCoverageEvent
): TradeDataCoverageEvent {
  const { monotonicStages: _monotonicStages, ...immutable } = event;
  void _monotonicStages;
  return TradeDataCoverageEventSchema.parse(immutable);
}

function wallDuration(from: string | null, to: string | null): number | null {
  if (!from || !to) {
    return null;
  }
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? end - start
    : null;
}

function durationMs(from: string, to: string): number {
  const duration = wallDuration(from, to);
  return duration ?? 0;
}

function approximatelyEqual(
  left: number,
  right: number,
  relativeTolerance: number
): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= relativeTolerance * scale;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPositiveFinite(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteNonnegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function nonnegativeInteger(
  value: number | undefined,
  fallback: number
): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundSol(value: number): number {
  return Number(value.toFixed(12));
}

function safeErrorClass(error: unknown): string {
  return error instanceof Error && error.name
    ? error.name.toUpperCase()
    : "UNKNOWN_ERROR";
}

function sanitizeReason(value: string): string {
  return value
    .replace(/[^A-Za-z0-9:_-]/gu, "_")
    .slice(0, 200)
    .toUpperCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
