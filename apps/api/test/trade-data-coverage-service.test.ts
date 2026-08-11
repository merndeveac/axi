import { describe, expect, it, vi } from "vitest";
import {
  normalizePumpPortalTokenTradePayload,
  type TokenTradeEvent
} from "@axi/data-feeds";
import type {
  TradeDataCoverageEvent,
  TradeDataCoverageSession,
  TradeDataSubscriptionEvent
} from "@axi/shared";
import {
  assessTradeTransaction,
  createTradeDataCoverageService,
  deterministicTradeDataPercentile
} from "../src/trade-data-coverage-service";

const mint = "So11111111111111111111111111111111111111112";
const trader = "11111111111111111111111111111111";

describe("TradeDataCoverageService", () => {
  it("computes deterministic nearest-rank latency percentiles", () => {
    expect(deterministicTradeDataPercentile([40, 10, 30, 20], 0.5)).toBe(20);
    expect(deterministicTradeDataPercentile([40, 10, 30, 20], 0.95)).toBe(40);
    expect(deterministicTradeDataPercentile([], 0.99)).toBeNull();
  });

  it("reconciles classification, deduplication, and the canonical pipeline", () => {
    const harness = createHarness();
    const service = harness.service;
    service.begin({ sessionId: "session-1", selectedMint: mint });
    const instrumentation = service.createFeedInstrumentation();

    const first = observeTrade(instrumentation, "correlation-1", trade());
    expect(first.result.acceptedForPipeline).toBe(true);
    first.event.tradeCoverage = first.result.metadata ?? undefined;
    service.markQueueAccepted(first.event);
    service.markQueueTransactionStarted(first.event);
    service.markDatabaseWriteStarted(first.event);
    service.markPersistenceCompleted(first.event);
    service.markDatabaseCommitted(first.event);
    service.markTimeseries(first.event, {
      action: "accepted",
      bucketUpdated: true,
      rollingWindowsUpdated: true,
      oneSecondBucketCount: 1,
      completedOneSecondBucketCount: 1,
      validSampleCount: 1,
      firstDerivativeAvailable: false,
      secondDerivativeAvailable: false
    });
    service.markDerivativeStrengthUpdated(first.event);
    const decision = {
      decisionId: "candidate-decision:test:1",
      decisionVersion: 1,
      sourceEventKey: first.result.metadata?.sourceEventKey ?? "missing"
    };
    service.markSignalComputed(first.event, decision);
    service.markScannerProjected(first.event, decision);
    service.markBroadcastCompleted(first.event);
    service.markSignalPersisted(first.event, decision);
    service.markQueueCommittedAndPipelineCompleted([first.event]);

    const duplicate = observeTrade(
      instrumentation,
      "correlation-2",
      trade("2026-08-02T00:00:05.000Z")
    );
    expect(duplicate.result).toMatchObject({
      acceptedForPipeline: false,
      duplicate: true
    });

    const summary = service.finalize("test_complete");
    expect(summary).toMatchObject({
      rawFrameCount: 2,
      recognizedTradeCount: 2,
      normalizationSuccessCount: 2,
      duplicateCount: 1,
      pipelineCompletedCount: 1,
      queueCommittedCount: 1,
      timeseriesAcceptedCount: 1,
      localReconciliationStatus: "TRADE_DATA_LOCALLY_RECONCILED",
      upstreamCoverageStatus: "UPSTREAM_TRADE_COMPLETENESS_UNPROVEN"
    });
    expect(summary?.reconciliation.maximumAbsoluteResidual).toBe(0);
    expect(harness.events).toHaveLength(2);
  });

  it("accounts malformed, known non-trade, unknown, and wrong-mint frames", () => {
    const harness = createHarness();
    harness.service.begin({ sessionId: "session-2", selectedMint: mint });
    const instrumentation = harness.service.createFeedInstrumentation();
    for (const [index, outcome] of [
      "parse_failed",
      "recognized_non_trade",
      "unknown_payload"
    ].entries()) {
      const correlationId = `nontrade-${index}`;
      instrumentation.onRawFrame(frame(correlationId));
      instrumentation.onParserOutcome({
        ...frame(correlationId),
        parserOutcome: outcome as
          "parse_failed" | "recognized_non_trade" | "unknown_payload",
        providerTimestamp: null,
        safePayloadHash: null,
        topLevelKeys: [],
        rejectionReason: outcome === "parse_failed" ? "MALFORMED_JSON" : null
      });
    }
    const wrong = observeTrade(
      instrumentation,
      "wrong-mint",
      trade("2026-08-02T00:00:00.000Z", "11111111111111111111111111111111")
    );
    expect(wrong.result).toMatchObject({
      acceptedForPipeline: false,
      rejectionReason: "TRADE_WRONG_MINT"
    });
    const summary = harness.service.finalize("test_complete");
    expect(summary).toMatchObject({
      rawFrameCount: 4,
      parseFailureCount: 1,
      recognizedNonTradeCount: 1,
      unknownPayloadCount: 1,
      wrongMintFrameCount: 1,
      rejectedCount: 1,
      localReconciliationStatus: "TRADE_DATA_LOCALLY_RECONCILED"
    });
  });

  it("fails a genuinely inconsistent execution identity but not curve spread", () => {
    const harness = createHarness();
    harness.service.begin({
      sessionId: "execution-identity",
      selectedMint: mint
    });
    const inconsistent = trade();
    inconsistent.executionAveragePriceSol = 0.2;
    inconsistent.priceSol = 0.2;
    inconsistent.curveMarkPriceSol = 0.05;
    observeTrade(
      harness.service.createFeedInstrumentation(),
      "inconsistent-execution",
      inconsistent
    );
    expect(harness.events[0]?.consistencyChecks).toMatchObject({
      price_volume_consistency: {
        status: "failed",
        reasonCode: "PRICE_VOLUME_IDENTITY_FAILED"
      },
      curve_price_consistency: {
        status: "passed",
        classification: "expected_spread",
        reasonCode: "CURVE_MARK_EXECUTION_SPREAD"
      }
    });
  });

  it("requests a single stop at the event cap and finalizes idempotently", () => {
    const onStop = vi.fn();
    const harness = createHarness();
    harness.service.begin({
      sessionId: "session-3",
      selectedMint: mint,
      maxEvents: 1,
      onStopRequested: onStop
    });
    observeTrade(harness.service.createFeedInstrumentation(), "cap", trade());
    expect(onStop).toHaveBeenCalledOnce();
    expect(harness.service.requestStop("again")).toBe(false);
    harness.service.beginGrace();
    const first = harness.service.finalize("max_events");
    const second = harness.service.finalize("different_reason");
    expect(second).toEqual(first);
    expect(harness.subscriptions.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "track_requested",
        "first_trade_received",
        "stop_requested",
        "grace_started",
        "finalized"
      ])
    );
  });

  it("persists the parent before track_requested and retries lifecycle idempotently", () => {
    const harness = createHarness();
    harness.service.begin({ sessionId: "parent-first", selectedMint: mint });
    expect(harness.persistenceOrder.slice(0, 2)).toEqual([
      "session:parent-first",
      "lifecycle:track_requested"
    ]);
    const instrumentation = harness.service.createFeedInstrumentation();
    const subscription = {
      eventType: "subscribe_sent" as const,
      mint,
      timestamp: "2026-08-02T00:00:00.100Z",
      safeReason: null,
      reasonCodes: ["TEST_SUBSCRIBE_SENT"]
    };
    instrumentation.onSubscriptionEvent(subscription);
    instrumentation.onSubscriptionEvent(subscription);
    expect(
      harness.subscriptions.filter(
        (event) => event.eventType === "subscribe_sent"
      )
    ).toHaveLength(1);
  });

  it("records typed lifecycle persistence failure evidence without false reconciliation", () => {
    const harness = createHarness({ failLifecyclePersistence: true });
    const summary = harness.service.begin({
      sessionId: "lifecycle-foreign-key-failure",
      selectedMint: mint
    });
    expect(summary.telemetryFailureCount).toBe(1);
    expect(summary.lifecycleEmbeddedEventCount).toBe(1);
    expect(summary.lifecyclePersistedEventCount).toBe(0);
    expect(summary.lifecycleResidual).toBe(1);
    expect(summary.localReconciliationStatus).toBe(
      "TRADE_DATA_LOCAL_RECONCILIATION_FAILED"
    );
  });

  it("enforces the bounded runtime cap with an injected clock", () => {
    let now = new Date("2026-08-02T00:00:00.000Z");
    const onStop = vi.fn();
    const harness = createHarness({ now: () => now });
    harness.service.begin({
      sessionId: "runtime-cap",
      selectedMint: mint,
      maxRuntimeMs: 1_000,
      onStopRequested: onStop
    });
    now = new Date("2026-08-02T00:00:00.999Z");
    expect(harness.service.enforceRuntimeCap()).toBe(false);
    now = new Date("2026-08-02T00:00:01.000Z");
    expect(harness.service.enforceRuntimeCap()).toBe(true);
    expect(onStop).toHaveBeenCalledWith("MAX_RUNTIME");
  });

  it("records stop before unsubscribe send and acknowledgement", () => {
    let nowMs = Date.parse("2026-08-02T00:00:00.000Z");
    const harness = createHarness({ now: () => new Date(nowMs++) });
    let unsubscribe = () => undefined;
    harness.service.begin({
      sessionId: "ordered-stop",
      selectedMint: mint,
      onStopRequested: () => unsubscribe()
    });
    const instrumentation = harness.service.createFeedInstrumentation();
    unsubscribe = () => {
      instrumentation.onSubscriptionEvent({
        eventType: "unsubscribe_sent",
        mint,
        timestamp: new Date(nowMs++).toISOString(),
        safeReason: null,
        reasonCodes: ["TEST_UNSUBSCRIBE_SENT"]
      });
    };

    expect(harness.service.requestStop("test_boundary")).toBe(true);
    instrumentation.onSubscriptionEvent({
      eventType: "unsubscribe_acknowledged",
      mint,
      timestamp: new Date(nowMs++).toISOString(),
      safeReason: null,
      reasonCodes: ["TEST_UNSUBSCRIBE_ACKNOWLEDGED"]
    });

    const lifecycle = harness.subscriptions.filter((event) =>
      [
        "stop_requested",
        "unsubscribe_sent",
        "unsubscribe_acknowledged"
      ].includes(event.eventType)
    );
    expect(lifecycle.map((event) => event.eventType)).toEqual([
      "stop_requested",
      "unsubscribe_sent",
      "unsubscribe_acknowledged"
    ]);
    expect(
      Date.parse(lifecycle[1]?.timestamp ?? "") -
        Date.parse(lifecycle[0]?.timestamp ?? "")
    ).toBeGreaterThanOrEqual(0);
  });

  it("issues the hard-cost shutdown callback once during evidence-only grace", () => {
    const onHardCostCapReached = vi.fn();
    const harness = createHarness();
    harness.service.begin({
      sessionId: "hard-cost-grace",
      selectedMint: mint,
      maxEvents: 1,
      maxCostSol: 0.000002,
      onHardCostCapReached
    });
    const instrumentation = harness.service.createFeedInstrumentation();
    observeTrade(instrumentation, "cost-1", trade());
    observeTrade(instrumentation, "cost-2", trade("2026-08-02T00:00:01.000Z"));
    observeTrade(instrumentation, "cost-3", trade("2026-08-02T00:00:02.000Z"));
    expect(onHardCostCapReached).toHaveBeenCalledOnce();
    expect(harness.service.getSummary()).toMatchObject({
      canonicalAdmittedTradeCount: 1,
      postStopObservedTradeCount: 2,
      estimatedBillableMessageCount: 3
    });
  });

  it("creates the max-cost stop boundary before synchronous unsubscribe", () => {
    let nowMs = Date.parse("2026-08-02T00:00:00.000Z");
    const harness = createHarness({ now: () => new Date(nowMs++) });
    const instrumentation = harness.service.createFeedInstrumentation();
    harness.service.begin({
      sessionId: "max-cost-order",
      selectedMint: mint,
      maxEvents: 50,
      maxCostSol: 0.000001,
      onStopRequested: () => {
        instrumentation.onSubscriptionEvent({
          eventType: "unsubscribe_sent",
          mint,
          timestamp: new Date(nowMs++).toISOString(),
          safeReason: null,
          reasonCodes: ["TEST_UNSUBSCRIBE_SENT"]
        });
      }
    });

    observeTrade(instrumentation, "max-cost", trade());
    const lifecycle = harness.subscriptions.filter((event) =>
      ["stop_requested", "unsubscribe_sent"].includes(event.eventType)
    );
    expect(lifecycle.map((event) => event.eventType)).toEqual([
      "stop_requested",
      "unsubscribe_sent"
    ]);
    expect(harness.service.getSummary()?.stopReason).toBe(
      "MAX_ESTIMATED_COST"
    );
  });

  it("keeps provider-error, duplicate-stop, and post-finalization callbacks idempotent", () => {
    const onStop = vi.fn();
    const harness = createHarness();
    harness.service.begin({
      sessionId: "provider-error-idempotency",
      selectedMint: mint,
      onStopRequested: onStop
    });
    const instrumentation = harness.service.createFeedInstrumentation();

    expect(harness.service.requestStop("provider_error")).toBe(true);
    expect(harness.service.requestStop("explicit_validator_stop")).toBe(false);
    const postStop = observeTrade(
      instrumentation,
      "post-stop",
      trade("2026-08-02T00:00:01.000Z")
    );
    expect(postStop.result.acceptedForPipeline).toBe(false);
    expect(harness.events.at(-1)?.canonicalAdmission).toBe(
      "post_stop_evidence_only"
    );
    harness.service.beginGrace("provider_error");
    harness.service.beginGrace("provider_error");
    const first = harness.service.finalize("provider_error");
    const lifecycleCount = first?.subscriptionLifecycle.length;
    const second = harness.service.finalize("late_duplicate");
    instrumentation.onSubscriptionEvent({
      eventType: "unsubscribe_sent",
      mint,
      timestamp: "2026-08-02T00:00:02.000Z",
      safeReason: null,
      reasonCodes: ["LATE_CALLBACK"]
    });

    expect(onStop).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(second?.subscriptionLifecycle).toHaveLength(lifecycleCount ?? 0);
    expect(second).toMatchObject({
      postStopObservedTradeCount: 1,
      canonicalAdmittedTradeCount: 0,
      canonicalBusinessTradeCount: 0,
      canonicalTimeSeriesSourceEventCount: 0,
      postStopCanonicalMutationCount: 0
    });
    expect(
      second?.subscriptionLifecycle.filter(
        (event) => event.eventType === "stop_requested"
      )
    ).toHaveLength(1);
    expect(
      second?.subscriptionLifecycle.filter(
        (event) => event.eventType === "grace_started"
      )
    ).toHaveLength(1);
    expect(
      second?.subscriptionLifecycle.filter(
        (event) => event.eventType === "finalized"
      )
    ).toHaveLength(1);
  });

  it("invalidates reconciliation when telemetry persistence fails", () => {
    const harness = createHarness({ failEventPersistence: true });
    harness.service.begin({ sessionId: "session-4", selectedMint: mint });
    observeTrade(
      harness.service.createFeedInstrumentation(),
      "failed-save",
      trade()
    );
    const summary = harness.service.finalize("test_complete");
    expect(summary?.telemetryFailureCount).toBeGreaterThan(0);
    expect(summary?.localReconciliationStatus).toBe(
      "TRADE_DATA_LOCAL_RECONCILIATION_FAILED"
    );
  });
});

describe("assessTradeTransaction", () => {
  it("returns verified only with compatible token and SOL deltas", () => {
    expect(
      assessTradeTransaction(
        rpcTransaction({ tokenAfter: 10, solAfter: 900 }),
        {
          mint,
          side: "buy",
          trader
        }
      )
    ).toBe("VERIFIED");
  });

  it("distinguishes partial, mismatch, and unavailable", () => {
    expect(
      assessTradeTransaction(
        rpcTransaction({ tokenAfter: 10, omitTrader: true }),
        {
          mint,
          side: "buy",
          trader
        }
      )
    ).toBe("PARTIAL");
    expect(
      assessTradeTransaction(
        rpcTransaction({ tokenAfter: 0, tokenBefore: 10 }),
        {
          mint,
          side: "buy",
          trader
        }
      )
    ).toBe("MISMATCH");
    expect(assessTradeTransaction(null, { mint, side: "buy", trader })).toBe(
      "UNAVAILABLE"
    );
  });
});

function createHarness(
  options: {
    failEventPersistence?: boolean;
    failLifecyclePersistence?: boolean;
    now?: () => Date;
  } = {}
) {
  const sessions = new Map<string, TradeDataCoverageSession>();
  const events: TradeDataCoverageEvent[] = [];
  const subscriptions: TradeDataSubscriptionEvent[] = [];
  const persistenceOrder: string[] = [];
  return {
    events,
    persistenceOrder,
    subscriptions,
    service: createTradeDataCoverageService({
      provider: "pumpportal",
      sourceMode: "live",
      estimatedCostPerEventSol: 0.000001,
      ...(options.now ? { now: options.now } : {}),
      persistence: {
        saveSession: (session) => {
          persistenceOrder.push(`session:${session.sessionId}`);
          sessions.set(session.sessionId, session);
        },
        saveEvent: (event) => {
          if (options.failEventPersistence) {
            throw new Error("SQLITE_BUSY");
          }
          const index = events.findIndex(
            (item) =>
              item.sessionId === event.sessionId &&
              item.correlationId === event.correlationId
          );
          if (index >= 0) events[index] = event;
          else events.push(event);
        },
        saveSubscriptionEvent: (event) => {
          if (options.failLifecyclePersistence) {
            throw new Error("SQLITE_CONSTRAINT_FOREIGNKEY");
          }
          persistenceOrder.push(`lifecycle:${event.eventType}`);
          const index = subscriptions.findIndex(
            (item) => item.subscriptionEventId === event.subscriptionEventId
          );
          if (index >= 0) subscriptions[index] = event;
          else subscriptions.push(event);
        },
        findEventBySourceKey: (sessionId, key) =>
          events.find(
            (event) =>
              event.sessionId === sessionId && event.sourceEventKey === key
          ) ?? null,
        getSession: (sessionId) => sessions.get(sessionId) ?? null,
        listSessions: (limit) => [...sessions.values()].slice(0, limit),
        listEvents: () => events,
        listSubscriptionEvents: () => subscriptions
      }
    })
  };
}

function frame(correlationId: string) {
  return {
    correlationId,
    receivedAt: "2026-08-02T00:00:00.000Z",
    receivedAtMonotonicMs: 100
  };
}

function observeTrade(
  instrumentation: ReturnType<
    ReturnType<
      typeof createTradeDataCoverageService
    >["createFeedInstrumentation"]
  >,
  correlationId: string,
  event: TokenTradeEvent
) {
  const observation = {
    ...frame(correlationId),
    parserOutcome: "recognized_trade" as const,
    providerTimestamp: event.providerTimestamp ?? null,
    safePayloadHash: "hash",
    topLevelKeys: ["mint", "signature", "solAmount", "tokenAmount", "txType"],
    rejectionReason: null
  };
  instrumentation.onRawFrame(frame(correlationId));
  instrumentation.onParserOutcome(observation);
  const result = instrumentation.onNormalizationOutcome({
    ...observation,
    event,
    normalizedAt: "2026-08-02T00:00:00.010Z",
    normalizedAtMonotonicMs: 110
  });
  if (!result) throw new Error("Expected coverage result");
  return { event, result };
}

function trade(
  receivedAt = "2026-08-02T00:00:00.000Z",
  tradeMint = mint
): TokenTradeEvent {
  const event = normalizePumpPortalTokenTradePayload(
    {
      mint: tradeMint,
      signature: "signature-1",
      solAmount: 1,
      tokenAmount: 10,
      traderPublicKey: trader,
      timestamp: "2026-08-02T00:00:00.000Z",
      txType: "buy"
    },
    { now: () => new Date(receivedAt) }
  );
  if (!event) throw new Error("Expected normalized trade");
  return event;
}

function rpcTransaction(input: {
  tokenBefore?: number;
  tokenAfter: number;
  solAfter?: number;
  omitTrader?: boolean;
}) {
  const owner = input.omitTrader ? "other-owner" : trader;
  return {
    meta: {
      err: null,
      preBalances: [1_000],
      postBalances: [input.solAfter ?? 900],
      preTokenBalances: [
        {
          accountIndex: 1,
          mint,
          owner,
          uiTokenAmount: { uiAmount: input.tokenBefore ?? 0 }
        }
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint,
          owner,
          uiTokenAmount: { uiAmount: input.tokenAfter }
        }
      ]
    },
    transaction: { message: { accountKeys: [trader] } }
  };
}
