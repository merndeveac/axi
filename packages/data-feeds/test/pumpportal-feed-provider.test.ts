import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPumpPortalWsUrl,
  createStableTokenTradeEventKey,
  maskPumpPortalUrl,
  normalizePumpPortalAccountTradePayload,
  normalizePumpPortalTokenTradePayload,
  PumpPortalFeedProvider,
  type FeedEvent,
  type PumpPortalDiscoveryInstrumentation,
  type PumpPortalTradeInstrumentation,
  type PumpPortalFeedProviderOptions,
  type WebSocketLike
} from "../src/index";

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  private readonly handlers = new Map<
    string,
    Array<(...args: unknown[]) => void>
  >();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => void): WebSocketLike {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
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

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.useRealTimers();
});

describe("PumpPortalFeedProvider", () => {
  it("accounts every raw frame in exactly one sanitized parser outcome", () => {
    const parserOutcomes: string[] = [];
    const normalizationOutcomes: string[] = [];
    const rawFrames: string[] = [];
    const instrumentation: PumpPortalDiscoveryInstrumentation = {
      onRawFrame: (frame) => rawFrames.push(frame.correlationId),
      onParserOutcome: (outcome) => parserOutcomes.push(outcome.parserOutcome),
      onNormalizationOutcome: (outcome) => {
        normalizationOutcomes.push(outcome.event ? "succeeded" : "rejected");
        return outcome.event
          ? {
              duplicate: false,
              duplicateKey: null,
              duplicateReason: null,
              metadata: {
                schemaVersion: "discovery-coverage-v1",
                sessionId: "test-session",
                correlationId: outcome.correlationId,
                sourceEventKey: `key:${outcome.correlationId}`,
                receivedAtMonotonicMs: outcome.receivedAtMonotonicMs,
                normalizedAtMonotonicMs: outcome.normalizedAtMonotonicMs
              }
            }
          : null;
      },
      onConnectionEvent: () => undefined
    };
    const emitted: FeedEvent[] = [];
    const provider = createProvider({
      discoveryInstrumentation: instrumentation
    });

    provider.start((event) => emitted.push(event));
    const socket = FakeWebSocket.instances[0];
    socket?.emit("message", '{"secret":"not-closed"');
    socket?.emit("message", JSON.stringify(["not", "an", "object"]));
    socket?.emit("message", JSON.stringify({ status: "ok" }));
    socket?.emit("message", JSON.stringify({ unsupported: true }));
    socket?.emit("message", JSON.stringify({ txType: "create" }));
    socket?.emit(
      "message",
      JSON.stringify({
        mint: "CreateMint11111111111111111111111111111111",
        signature: "create-signature",
        txType: "create"
      })
    );
    socket?.emit(
      "message",
      JSON.stringify({
        mint: "MigrationMint11111111111111111111111111111",
        signature: "migration-signature",
        txType: "migrate"
      })
    );
    socket?.emit(
      "message",
      JSON.stringify({
        mint: "So11111111111111111111111111111111111111112",
        signature: "trade-signature",
        solAmount: 1,
        tokenAmount: 10,
        txType: "buy"
      })
    );

    expect(rawFrames).toHaveLength(8);
    expect(parserOutcomes).toEqual([
      "parse_failure",
      "unknown_payload",
      "recognized_non_discovery",
      "unknown_payload",
      "recognized_create",
      "recognized_create",
      "recognized_migration",
      "recognized_non_discovery"
    ]);
    expect(normalizationOutcomes).toEqual([
      "rejected",
      "succeeded",
      "succeeded"
    ]);
    expect(
      emitted.filter((event) => event.type === "token_created")
    ).toHaveLength(2);
    expect(provider.getStatus().lastError).not.toContain("not-closed");
    provider.stop();
  });

  it("builds WebSocket URL and masks API keys", () => {
    const url = buildPumpPortalWsUrl({
      apiKey: "super-secret-key"
    });

    expect(url).toContain("api-key=super-secret-key");
    expect(maskPumpPortalUrl(url)).not.toContain("super-secret-key");
    expect(maskPumpPortalUrl(url)).toContain("api-key=***");
    expect(buildPumpPortalWsUrl()).not.toContain("api-key=");
  });

  it("records reconnect and subscription replay while leaving gaps unproven", async () => {
    vi.useFakeTimers();
    const connectionEvents: Array<{ eventType: string; gapStatus: string }> =
      [];
    const provider = createProvider({
      discoveryInstrumentation: {
        onRawFrame: () => undefined,
        onParserOutcome: () => undefined,
        onNormalizationOutcome: () => null,
        onConnectionEvent: (event) => connectionEvents.push(event)
      },
      reconnectInitialDelayMs: 1,
      reconnectMaxDelayMs: 1,
      subscribeMigration: true,
      subscribeNewToken: true
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({ status: "ok" })
    );
    FakeWebSocket.instances[0]?.emit("close", 1006, "private provider text");
    await vi.advanceTimersByTimeAsync(1);
    FakeWebSocket.instances[1]?.emit("open");
    FakeWebSocket.instances[1]?.emit(
      "message",
      JSON.stringify({ status: "ok" })
    );

    expect(connectionEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "disconnected",
        "reconnect_attempt",
        "connection_opened",
        "reconnect_success",
        "subscription_replay_attempted",
        "subscription_replay_completed",
        "event_before_disconnect",
        "event_after_reconnect"
      ])
    );
    expect(
      connectionEvents
        .filter((event) => event.eventType.includes("reconnect"))
        .every((event) => event.gapStatus === "unproven")
    ).toBe(true);
    provider.stop();
  });

  it("sends subscribeNewToken on open when enabled", () => {
    const provider = createProvider({
      subscribeMigration: false,
      subscribeNewToken: true
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");

    expect(sentMethods()).toEqual(["subscribeNewToken"]);
    provider.stop();
  });

  it("sends subscribeMigration on open when enabled", () => {
    const provider = createProvider({
      subscribeMigration: true,
      subscribeNewToken: false
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");

    expect(sentMethods()).toEqual(["subscribeMigration"]);
    provider.stop();
  });

  it("does not send disabled subscriptions", () => {
    const provider = createProvider({
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");

    expect(sentMethods()).toEqual([]);
    provider.stop();
  });

  it("does not account or emit frames delivered after provider stop", async () => {
    const rawFrames: string[] = [];
    const events: FeedEvent[] = [];
    const provider = createProvider({
      discoveryInstrumentation: {
        onRawFrame: (frame) => rawFrames.push(frame.correlationId),
        onParserOutcome: () => undefined,
        onNormalizationOutcome: () => null,
        onConnectionEvent: () => undefined
      }
    });
    await provider.start((event) => events.push(event));
    const socket = FakeWebSocket.instances[0];
    await provider.stop();
    socket?.emit(
      "message",
      JSON.stringify({
        mint: "LateMint111111111111111111111111111111111",
        txType: "create"
      })
    );
    expect(rawFrames).toEqual([]);
    expect(events).toEqual([]);
  });

  it("subscribes and unsubscribes token trades on the existing websocket", () => {
    const provider = createProvider({
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");
    const subscribed = provider.subscribeTokenTrades([
      "So11111111111111111111111111111111111111112"
    ]);
    const unsubscribed = provider.unsubscribeTokenTrades([
      "So11111111111111111111111111111111111111112"
    ]);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(subscribed.subscribed).toEqual([
      "So11111111111111111111111111111111111111112"
    ]);
    expect(unsubscribed.unsubscribed).toEqual([
      "So11111111111111111111111111111111111111112"
    ]);
    expect(sentPayloads()).toContainEqual({
      keys: ["So11111111111111111111111111111111111111112"],
      method: "subscribeTokenTrade"
    });
    expect(sentPayloads()).toContainEqual({
      keys: ["So11111111111111111111111111111111111111112"],
      method: "unsubscribeTokenTrade"
    });
    provider.stop();
  });

  it("de-duplicates token trade mints and enforces max subscriptions", () => {
    const provider = createProvider({
      maxTokenTradeSubscriptions: 1,
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");
    const result = provider.subscribeTokenTrades([
      "So11111111111111111111111111111111111111112",
      "So11111111111111111111111111111111111111112",
      "11111111111111111111111111111111"
    ]);

    expect(result.subscribed).toEqual([
      "So11111111111111111111111111111111111111112"
    ]);
    expect(result.rejected).toEqual(["11111111111111111111111111111111"]);
    expect(result.reasonCodes).toContain("PUMPPORTAL_TRADE_MAX_TOKENS_REACHED");
    expect(provider.getTokenTradeSubscriptions()).toEqual([
      "So11111111111111111111111111111111111111112"
    ]);
    provider.stop();
  });

  it("resets a completed token-trade budget only after subscriptions stop", () => {
    const events: FeedEvent[] = [];
    const mint = "So11111111111111111111111111111111111111112";
    const provider = createProvider({
      maxTokenTradeEventsPerSession: 1,
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start((event) => events.push(event));
    FakeWebSocket.instances[0]?.emit("open");
    provider.subscribeTokenTrades([mint]);
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({
        mint,
        signature: "sig-budget",
        solAmount: 1,
        tokenAmount: 10,
        txType: "buy"
      })
    );

    expect(events).toHaveLength(1);
    expect(provider.getPumpPortalTradeStats().budgetReached).toBe(true);
    expect(provider.getPumpPortalTradeStats().totalEventsThisSession).toBe(1);

    const reset = provider.resetTokenTradeSession();

    expect(reset.budgetReached).toBe(false);
    expect(reset.totalEventsThisSession).toBe(0);
    expect(provider.subscribeTokenTrades([mint]).subscribed).toEqual([mint]);
    provider.unsubscribeTokenTrades([mint]);
    provider.stop();
  });

  it("enforces a smaller acknowledged token-trade session limit at ingress", () => {
    const mint = "So11111111111111111111111111111111111111112";
    const provider = createProvider({
      maxTokenTradeEventsPerSession: 10,
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");
    expect(provider.setTokenTradeSessionEventLimit(2).maxEventsPerSession).toBe(
      2
    );
    provider.subscribeTokenTrades([mint]);

    for (const signature of ["sig-1", "sig-2"]) {
      FakeWebSocket.instances[0]?.emit(
        "message",
        JSON.stringify({
          mint,
          signature,
          solAmount: 1,
          tokenAmount: 10,
          txType: "buy"
        })
      );
    }

    expect(provider.getPumpPortalTradeStats()).toMatchObject({
      budgetReached: true,
      maxEventsPerSession: 2,
      subscribedTokenCount: 0,
      totalEventsThisSession: 2
    });
    provider.stop();
  });

  it("normalizes a token-creation payload", () => {
    const events: FeedEvent[] = [];
    const provider = createProvider();

    provider.start((event) => events.push(event));
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({
        mint: "PumpPortalMint111111111111111111111111111",
        name: "Portal Token",
        signature: "sig111",
        symbol: "PORTAL",
        traderPublicKey: "creator111",
        txType: "create"
      })
    );

    const event = events[0];
    expect(event?.type).toBe("token_created");

    if (event?.type !== "token_created") {
      throw new Error("Expected token_created event");
    }

    expect(event.source).toBe("pumpportal");
    expect(event.candidate.mint).toBe(
      "PumpPortalMint111111111111111111111111111"
    );
    expect(event.candidate.symbol).toBe("PORTAL");
    expect(event.metricsComplete).toBe(false);
    expect(event.creator).toBe("creator111");
    expect(provider.getStatus().newTokenEventCount).toBe(1);
    expect(provider.getStatus().tokenTradeEventCount).toBe(0);
    provider.stop();
  });

  it("normalizes a migration payload", () => {
    const events: FeedEvent[] = [];
    const provider = createProvider();

    provider.start((event) => events.push(event));
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({
        bondingCurveKey: "curve111",
        mint: "MigratedMint1111111111111111111111111111",
        symbol: "MIG",
        txType: "migrate"
      })
    );

    const event = events[0];
    expect(event?.rawSourceEventType).toBe("migration");

    if (event?.type !== "token_created") {
      throw new Error("Expected token_created event");
    }

    expect(event.bondingCurve).toBe("curve111");
    expect(event.candidate.source).toBe("pumpportal");
    expect(provider.getStatus().migrationEventCount).toBe(1);
    provider.stop();
  });

  it("normalizes buy token trade payloads with SOL metrics", () => {
    const event = normalizePumpPortalTokenTradePayload(
      {
        mint: "So11111111111111111111111111111111111111112",
        signature: "sig-buy",
        solAmount: 2,
        tokenAmount: 100,
        traderPublicKey: "11111111111111111111111111111111",
        txType: "buy"
      },
      {
        now: () => new Date("2026-01-01T00:00:00.000Z")
      }
    );

    expect(event?.type).toBe("trade");
    expect(event?.side).toBe("buy");
    expect(event?.priceSol).toBe(0.02);
    expect(event?.volumeSol).toBe(2);
    expect(event?.usableForMetrics).toBe(true);
    expect(event?.confidence).toBe("high");
    expect(event?.reasonCodes).toContain("PUMPPORTAL_TRADE_USABLE_FOR_METRICS");
  });

  it("normalizes sell token trade payloads", () => {
    const event = normalizePumpPortalTokenTradePayload(
      {
        mint: "So11111111111111111111111111111111111111112",
        solAmount: "1.5",
        tokenAmount: "50",
        txSignature: "sig-sell",
        txType: "sell"
      },
      {
        now: () => new Date("2026-01-01T00:00:00.000Z")
      }
    );

    expect(event?.side).toBe("sell");
    expect(event?.priceSol).toBe(0.03);
    expect(event?.volumeSol).toBe(1.5);
    expect(event?.usableForMetrics).toBe(true);
  });

  it("normalizes raw token amounts only when decimals are known", () => {
    const normalized = normalizePumpPortalTokenTradePayload({
      mint: "So11111111111111111111111111111111111111112",
      signature: "sig-raw",
      solAmount: 2,
      rawTokenAmount: 1_000_000,
      tokenDecimals: 6,
      txType: "buy"
    });
    const unknownUnits = normalizePumpPortalTokenTradePayload({
      mint: "So11111111111111111111111111111111111111112",
      signature: "sig-unknown",
      solAmount: 2,
      amount: 1_000_000,
      txType: "buy"
    });

    expect(normalized).toMatchObject({
      amountNormalizationMode: "decimals_normalized",
      rawTokenAmount: 1_000_000,
      tokenAmount: 1,
      priceSol: 2,
      usableForMetrics: true
    });
    expect(unknownUnits).toMatchObject({
      amountNormalizationMode: "unknown",
      rawTokenAmount: 1_000_000,
      priceSol: null,
      usableForMetrics: false
    });
    expect(unknownUnits?.tokenAmount).toBeUndefined();
  });

  it("uses immutable trade identity across local replay times", () => {
    const first = normalizePumpPortalTokenTradePayload(
      {
        mint: "So11111111111111111111111111111111111111112",
        signature: "stable-signature",
        solAmount: 1,
        tokenAmount: 10,
        txType: "buy"
      },
      { now: () => new Date("2026-01-01T00:00:00.000Z") }
    );
    const replay = normalizePumpPortalTokenTradePayload(
      {
        mint: "So11111111111111111111111111111111111111112",
        signature: "stable-signature",
        solAmount: 1,
        tokenAmount: 10,
        txType: "buy"
      },
      { now: () => new Date("2026-01-01T00:01:00.000Z") }
    );
    if (!first || !replay) throw new Error("Expected normalized trades");
    expect(createStableTokenTradeEventKey(first)).toBe(
      createStableTokenTradeEventKey(replay)
    );
    first.eventIndex = "0";
    replay.eventIndex = "1";
    expect(createStableTokenTradeEventKey(first)).not.toBe(
      createStableTokenTradeEventKey(replay)
    );
  });

  it("classifies every active trade-session frame and records lifecycle sends", () => {
    const parserOutcomes: string[] = [];
    const lifecycle: string[] = [];
    const instrumentation: PumpPortalTradeInstrumentation = {
      onRawFrame: () => undefined,
      onParserOutcome: (observation) =>
        parserOutcomes.push(observation.parserOutcome),
      onNormalizationOutcome: (observation) => ({
        acceptedForPipeline: observation.event !== null,
        duplicate: false,
        duplicateKey: null,
        duplicateReason: null,
        rejectionReason: observation.rejectionReason,
        metadata: observation.event
          ? {
              schemaVersion: "trade-data-coverage-v1",
              sessionId: "session",
              correlationId: observation.correlationId,
              sourceEventKey: `key:${observation.correlationId}`,
              receivedAtMonotonicMs: observation.receivedAtMonotonicMs,
              normalizedAtMonotonicMs: observation.normalizedAtMonotonicMs
            }
          : null
      }),
      onSubscriptionEvent: (observation) =>
        lifecycle.push(observation.eventType)
    };
    const mint = "So11111111111111111111111111111111111111112";
    const provider = createProvider({
      subscribeMigration: false,
      subscribeNewToken: false,
      tradeInstrumentation: instrumentation
    });
    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");
    provider.subscribeTokenTrades([mint]);
    FakeWebSocket.instances[0]?.emit("message", "{bad-json");
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({ status: "ok" })
    );
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({ mystery: true })
    );
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({
        mint,
        signature: "instrumented",
        solAmount: 1,
        tokenAmount: 10,
        txType: "buy"
      })
    );
    provider.unsubscribeTokenTrades([mint]);

    expect(parserOutcomes).toEqual([
      "parse_failed",
      "recognized_non_trade",
      "unknown_payload",
      "recognized_trade"
    ]);
    expect(lifecycle).toEqual(
      expect.arrayContaining(["subscribe_sent", "active", "unsubscribe_sent"])
    );
    provider.stop();
  });

  it("handles unknown trade payloads safely", () => {
    const event = normalizePumpPortalTokenTradePayload(
      {
        mint: "So11111111111111111111111111111111111111112",
        type: "trade"
      },
      {
        now: () => new Date("2026-01-01T00:00:00.000Z")
      }
    );

    expect(event?.side).toBe("unknown");
    expect(event?.usableForMetrics).toBe(false);
    expect(event?.reasonCodes).toContain("PUMPPORTAL_TRADE_UNKNOWN_SIDE");
    expect(event?.reasonCodes).toContain("PUMPPORTAL_TRADE_MISSING_AMOUNT");
  });

  it("missing amounts produce unusable metrics events", () => {
    const event = normalizePumpPortalTokenTradePayload(
      {
        mint: "So11111111111111111111111111111111111111112",
        txType: "buy"
      },
      {
        now: () => new Date("2026-01-01T00:00:00.000Z")
      }
    );

    expect(event?.usableForMetrics).toBe(false);
    expect(event?.metrics.usableForMetrics).toBe(false);
    expect(event?.reasonCodes).toContain("PUMPPORTAL_TRADE_MISSING_AMOUNT");
  });

  it("unknown payload does not crash", () => {
    const logger = {
      debug: vi.fn(),
      warn: vi.fn()
    };
    const events: FeedEvent[] = [];
    const provider = createProvider({ logger });

    provider.start((event) => events.push(event));
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({ hello: "world" })
    );
    FakeWebSocket.instances[0]?.emit("message", "{not-json");

    expect(events).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
    provider.stop();
  });

  it("close triggers reconnect with backoff", () => {
    vi.useFakeTimers();
    const provider = createProvider({
      reconnectInitialDelayMs: 10,
      reconnectMaxDelayMs: 20
    });

    provider.start(() => undefined);
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]?.emit("close");
    vi.advanceTimersByTime(9);
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    provider.stop();
  });

  it("does not leak API keys into logger URL context", () => {
    const logger = {
      info: vi.fn()
    };
    const provider = createProvider({
      apiKey: "do-not-log",
      logger
    });

    provider.start(() => undefined);

    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("do-not-log");
    provider.stop();
  });

  it("does not subscribe to account trades", () => {
    const provider = createProvider({
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");
    provider.subscribeTokenTrades([
      "So11111111111111111111111111111111111111112"
    ]);

    expect(sentMethods()).not.toContain("subscribeAccountTrade");
    provider.stop();
  });

  it("subscribes and unsubscribes account trades on the existing websocket", () => {
    const provider = createProvider({
      maxAccountTradeSubscriptions: 2,
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");
    const subscribed = provider.subscribeAccountTrades([
      "So11111111111111111111111111111111111111112"
    ]);
    const unsubscribed = provider.unsubscribeAccountTrades([
      "So11111111111111111111111111111111111111112"
    ]);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(subscribed.subscribed).toEqual([
      "So11111111111111111111111111111111111111112"
    ]);
    expect(unsubscribed.unsubscribed).toEqual([
      "So11111111111111111111111111111111111111112"
    ]);
    expect(sentPayloads()).toContainEqual({
      keys: ["So11111111111111111111111111111111111111112"],
      method: "subscribeAccountTrade"
    });
    expect(sentPayloads()).toContainEqual({
      keys: ["So11111111111111111111111111111111111111112"],
      method: "unsubscribeAccountTrade"
    });
    provider.stop();
  });

  it("rejects invalid account-trade wallets and enforces max watched wallets", () => {
    const provider = createProvider({
      maxAccountTradeSubscriptions: 1,
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start(() => undefined);
    FakeWebSocket.instances[0]?.emit("open");
    const result = provider.subscribeAccountTrades([
      "So11111111111111111111111111111111111111112",
      "invalid-wallet",
      "11111111111111111111111111111111"
    ]);

    expect(result.subscribed).toEqual([
      "So11111111111111111111111111111111111111112"
    ]);
    expect(result.rejected).toEqual([
      "invalid-wallet",
      "11111111111111111111111111111111"
    ]);
    expect(result.reasonCodes).toContain("ACCOUNT_TRADE_MAX_WALLETS_REACHED");
    provider.stop();
  });

  it("normalizes account-trade buy and sell payloads", () => {
    const buy = normalizePumpPortalAccountTradePayload({
      mint: "So11111111111111111111111111111111111111112",
      solAmount: 2,
      tokenAmount: 4000,
      traderPublicKey: "So11111111111111111111111111111111111111112",
      txSignature: "sig-buy",
      txType: "buy"
    });
    const sell = normalizePumpPortalAccountTradePayload({
      mint: "So11111111111111111111111111111111111111112",
      solAmount: 1,
      tokenAmount: 2000,
      traderPublicKey: "So11111111111111111111111111111111111111112",
      txSignature: "sig-sell",
      txType: "sell"
    });

    expect(buy?.type).toBe("account_trade");
    expect(buy?.side).toBe("buy");
    expect(buy?.priceSol).toBe(0.0005);
    expect(buy?.usableForExitStrategy).toBe(true);
    expect(buy?.reasonCodes).toContain("ACCOUNT_TRADE_USABLE_FOR_EXIT");
    expect(sell?.side).toBe("sell");
  });

  it("emits subscribed account trades without opening another websocket", () => {
    const events: FeedEvent[] = [];
    const provider = createProvider({
      subscribeMigration: false,
      subscribeNewToken: false
    });

    provider.start((event) => events.push(event));
    FakeWebSocket.instances[0]?.emit("open");
    provider.subscribeAccountTrades([
      "So11111111111111111111111111111111111111112"
    ]);
    FakeWebSocket.instances[0]?.emit(
      "message",
      JSON.stringify({
        mint: "So11111111111111111111111111111111111111112",
        solAmount: 2,
        tokenAmount: 4000,
        traderPublicKey: "So11111111111111111111111111111111111111112",
        txSignature: "sig-buy",
        txType: "buy"
      })
    );

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(events[0]?.type).toBe("account_trade");
    expect(provider.getStatus().accountTradeEventCount).toBe(1);
    provider.stop();
  });

  it("reports connection status without token-trade subscriptions", () => {
    const provider = createProvider({
      subscribeMigration: true,
      subscribeNewToken: true
    });

    provider.start(() => undefined);
    expect(provider.getStatus().connecting).toBe(true);
    FakeWebSocket.instances[0]?.emit("open");

    const status = provider.getStatus();

    expect(status.connected).toBe(true);
    expect(status.subscriptions).toEqual([
      "subscribeNewToken",
      "subscribeMigration"
    ]);
    expect(status.subscriptions).not.toContain("subscribeTokenTrade");
    provider.stop();
  });
});

function createProvider(
  options: PumpPortalFeedProviderOptions = {}
): PumpPortalFeedProvider {
  return new PumpPortalFeedProvider({
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    webSocketConstructor: FakeWebSocket,
    wsUrl: "wss://example.test/pumpportal",
    ...options
  });
}

function sentMethods(): string[] {
  return (
    FakeWebSocket.instances[0]?.sent.map(
      (message) => (JSON.parse(message) as { method: string }).method
    ) ?? []
  );
}

function sentPayloads(): unknown[] {
  return (
    FakeWebSocket.instances[0]?.sent.map((message) => JSON.parse(message)) ?? []
  );
}
