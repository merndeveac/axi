import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPumpPortalWsUrl,
  maskPumpPortalUrl,
  PumpPortalFeedProvider,
  type FeedEvent,
  type PumpPortalFeedProviderOptions,
  type WebSocketLike
} from "../src/index";

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();

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
    expect(event.candidate.mint).toBe("PumpPortalMint111111111111111111111111111");
    expect(event.candidate.symbol).toBe("PORTAL");
    expect(event.metricsComplete).toBe(false);
    expect(event.creator).toBe("creator111");
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
    provider.stop();
  });

  it("unknown payload does not crash", () => {
    const logger = {
      debug: vi.fn(),
      warn: vi.fn()
    };
    const events: FeedEvent[] = [];
    const provider = createProvider({ logger });

    provider.start((event) => events.push(event));
    FakeWebSocket.instances[0]?.emit("message", JSON.stringify({ hello: "world" }));
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
