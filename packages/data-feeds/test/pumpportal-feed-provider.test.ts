import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPumpPortalWsUrl,
  maskPumpPortalUrl,
  normalizePumpPortalAccountTradePayload,
  normalizePumpPortalTokenTradePayload,
  PumpPortalFeedProvider,
  type FeedEvent,
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
  it("builds WebSocket URL and masks API keys", () => {
    const url = buildPumpPortalWsUrl({
      apiKey: "super-secret-key"
    });

    expect(url).toContain("api-key=super-secret-key");
    expect(maskPumpPortalUrl(url)).not.toContain("super-secret-key");
    expect(maskPumpPortalUrl(url)).toContain("api-key=***");
    expect(buildPumpPortalWsUrl()).not.toContain("api-key=");
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
