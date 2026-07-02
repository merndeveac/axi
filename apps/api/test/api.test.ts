import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TokenCreatedEvent } from "@axi/data-feeds";
import type { ApiServer } from "../src/app";
import { createApiServer } from "../src/app";

let server: ApiServer | undefined;
let testDirectory: string;
let databasePath: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-api-"));
  databasePath = join(testDirectory, "axi.sqlite");
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("@axi/api", () => {
  it("GET /health returns paper-mode status", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/health"
    });
    const body = response.json() as {
      feedProvider: string;
      metricsEnabled: boolean;
      mode: string;
      paperOnly: boolean;
      status: string;
      trackedTokenCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.feedProvider).toBe("mock");
    expect(body.metricsEnabled).toBe(true);
    expect(body.status).toBe("ok");
    expect(body.mode).toBe("paper");
    expect(body.paperOnly).toBe(true);
    expect(body.trackedTokenCount).toBeGreaterThan(0);
  });

  it("GET /storage/stats returns valid counts", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/storage/stats"
    });
    const body = response.json() as {
      feedEventCount: number;
      paperOrderCount: number;
      paperPositionCount: number;
      signalCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.feedEventCount).toBeGreaterThan(0);
    expect(body.signalCount).toBeGreaterThan(0);
    expect(body.paperOrderCount).toBeGreaterThan(0);
    expect(body.paperPositionCount).toBeGreaterThan(0);
  });

  it("GET /signals returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/signals"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.any(Array));
  });

  it("GET /metrics returns tracked rolling metrics", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/metrics"
    });
    const body = response.json() as Array<{
      mint: string;
      sampleCount: number;
      windows: Record<string, { totalVolumeUsd: number }>;
    }>;

    expect(response.statusCode).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.some((metrics) => metrics.sampleCount > 0)).toBe(true);
    expect(body[0]?.windows["5s"]).toBeDefined();
  });

  it("GET /metrics/:mint returns 404 for unknown mint", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/metrics/UnknownMint111111111111111111111111111"
    });

    expect(response.statusCode).toBe(404);
  });

  it("GET /signals/recent returns persisted recent signals", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/signals/recent?limit=2"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(2);
  });

  it("GET /paper/orders returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/paper/orders"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual(expect.any(Array));
    expect(body.length).toBeGreaterThan(0);
  });

  it("GET /paper/positions returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/paper/positions"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual(expect.any(Array));
    expect(body.length).toBeGreaterThan(0);
  });

  it("unknown route returns 404", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/not-found"
    });

    expect(response.statusCode).toBe(404);
  });

  it("live mode is rejected", () => {
    expect(() =>
      createApiServer({
        logLevel: false,
        mode: "live",
        startFeed: false,
        storageDatabasePath: databasePath
      })
    ).toThrow("Live mode is not implemented");
  });

  it("keeps incomplete PumpPortal events conservative", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(createPumpPortalEvent());

    const signalsResponse = await server.app.inject({
      method: "GET",
      url: "/signals"
    });
    const ordersResponse = await server.app.inject({
      method: "GET",
      url: "/paper/orders"
    });
    const signals = signalsResponse.json() as Array<{
      action: string;
      reasonCodes: string[];
    }>;
    const orders = ordersResponse.json() as unknown[];

    expect(signals[0]?.action).toBe("IGNORE");
    expect(signals[0]?.reasonCodes).toContain("INSUFFICIENT_METRICS");
    expect(signals[0]?.reasonCodes).toContain("REAL_FEED_NEW_TOKEN_EVENT");
    expect(orders).toHaveLength(0);
  });

  // TODO: Add a WebSocket integration test after the test harness grows a
  // lightweight real-port helper. Fastify injection keeps HTTP tests port-free.
});

function createTestServer(): ApiServer {
  return createApiServer({
    logLevel: false,
    mockFeed: {
      intervalMs: 0,
      maxEvents: 8,
      scenario: "momentum",
      seed: 123
    },
    startFeed: true,
    storageDatabasePath: databasePath
  });
}

function createPumpPortalEvent(): TokenCreatedEvent {
  const mint = "PumpPortalMint111111111111111111111111111";

  return {
    type: "token_created",
    candidate: {
      id: {
        chain: "solana",
        mint
      },
      mint,
      symbol: "PORTAL",
      name: "Portal Token",
      source: "pumpportal",
      ageSeconds: 0,
      firstSeenAt: "2026-01-01T00:00:00.000Z"
    },
    metrics: {
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
    },
    metricsComplete: false,
    rawSourceEventType: "new_token",
    receivedAt: "2026-01-01T00:00:00.000Z",
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
    source: "pumpportal",
    timestamp: "2026-01-01T00:00:00.000Z"
  };
}
