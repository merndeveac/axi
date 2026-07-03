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
      candidateCount: number;
      candidateLifecycleEnabled: boolean;
      chainEventsConfigured: boolean;
      chainEventsEnabled: boolean;
      chainTradeEventCount: number;
      chainTransactionEventCount: number;
      feedProvider: string;
      metricsEnabled: boolean;
      mode: string;
      paperAutoOrder: boolean;
      paperOnly: boolean;
      riskEnabled: boolean;
      status: string;
      trackedTokenCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.candidateLifecycleEnabled).toBe(true);
    expect(body.chainEventsEnabled).toBe(false);
    expect(body.chainEventsConfigured).toBe(false);
    expect(body.chainTransactionEventCount).toBe(0);
    expect(body.chainTradeEventCount).toBe(0);
    expect(body.candidateCount).toBeGreaterThan(0);
    expect(body.feedProvider).toBe("mock");
    expect(body.metricsEnabled).toBe(true);
    expect(body.status).toBe("ok");
    expect(body.mode).toBe("paper");
    expect(body.paperAutoOrder).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.riskEnabled).toBe(true);
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
      candidateDecisionCount: number;
      chainVerificationCount: number;
      chainTransactionEventCount: number;
      chainTradeEventCount: number;
      paperOrderCount: number;
      paperPositionCount: number;
      riskSnapshotCount: number;
      signalCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.feedEventCount).toBeGreaterThan(0);
    expect(body.signalCount).toBeGreaterThan(0);
    expect(body.chainVerificationCount).toBe(0);
    expect(body.chainTransactionEventCount).toBe(0);
    expect(body.chainTradeEventCount).toBe(0);
    expect(body.riskSnapshotCount).toBeGreaterThan(0);
    expect(body.candidateDecisionCount).toBeGreaterThan(0);
    expect(body.paperOrderCount).toBe(0);
    expect(body.paperPositionCount).toBe(0);
  });

  it("GET /signals returns enriched signals", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/signals"
    });
    const body = response.json() as Array<{
      candidateDecisionAction?: string;
      lifecycleState?: string;
      riskLevel?: string;
      riskSnapshot?: unknown;
    }>;

    expect(response.statusCode).toBe(200);
    expect(body).toEqual(expect.any(Array));
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]?.candidateDecisionAction).toEqual(expect.any(String));
    expect(body[0]?.lifecycleState).toEqual(expect.any(String));
    expect(body[0]?.riskLevel).toEqual(expect.any(String));
    expect(body[0]?.riskSnapshot).toEqual(expect.any(Object));
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

  it("GET /candidates returns tracked candidates", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/candidates"
    });
    const candidates = response.json() as Array<{
      latestDecision?: unknown;
      latestRisk?: unknown;
      lifecycleState: string;
      mint: string;
    }>;

    expect(response.statusCode).toBe(200);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.mint).toEqual(expect.any(String));
    expect(candidates[0]?.lifecycleState).toEqual(expect.any(String));
    expect(candidates[0]?.latestDecision).toEqual(expect.any(Object));
    expect(candidates[0]?.latestRisk).toEqual(expect.any(Object));
  });

  it("GET /candidates/:mint returns 404 for unknown mint", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/candidates/UnknownMint111111111111111111111111111"
    });

    expect(response.statusCode).toBe(404);
  });

  it("GET /risk returns tracked risk snapshots", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/risk"
    });
    const riskSnapshots = response.json() as Array<{
      mint: string;
      reasonCodes: string[];
      riskLevel: string;
    }>;

    expect(response.statusCode).toBe(200);
    expect(riskSnapshots.length).toBeGreaterThan(0);
    expect(riskSnapshots[0]?.mint).toEqual(expect.any(String));
    expect(riskSnapshots[0]?.riskLevel).toEqual(expect.any(String));
    expect(riskSnapshots[0]?.reasonCodes).toEqual(expect.any(Array));
  });

  it("GET /risk/:mint returns 404 for unknown mint", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/risk/UnknownMint111111111111111111111111111"
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
    expect(body).toHaveLength(0);
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
    expect(body).toHaveLength(0);
  });

  it("GET /chain/status reports disabled by default", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/chain/status"
    });
    const body = response.json() as {
      enabled: boolean;
      paperOnly: boolean;
      status: string;
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.status).toBe("disabled");
  });

  it("GET /chain/verifications returns persisted verifier rows", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/chain/verifications"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /chain/events/status reports disabled by default", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/chain/events/status"
    });
    const body = response.json() as {
      enabled: boolean;
      configured: boolean;
      paperOnly: boolean;
      status: string;
      watchedAddressCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.configured).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.status).toBe("disabled");
    expect(body.watchedAddressCount).toBe(0);
  });

  it("POST /chain/events/watch returns clear error when disabled", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/chain/events/watch",
      payload: {
        address: "11111111111111111111111111111111",
        kind: "wallet"
      }
    });
    const body = response.json() as {
      error: string;
      chainEvents: {
        status: string;
      };
    };

    expect(response.statusCode).toBe(409);
    expect(body.error).toBe("CHAIN_EVENTS_DISABLED");
    expect(body.chainEvents.status).toBe("disabled");
  });

  it("GET /chain/events/watches returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/chain/events/watches"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /chain/events/transactions returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/chain/events/transactions"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /chain/events/trades returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/chain/events/trades"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /chain/events/transactions/:signature returns 404 for unknown signature", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/chain/events/transactions/unknown-signature"
    });

    expect(response.statusCode).toBe(404);
  });

  it("POST /chain/verify returns config error when enabled without RPC", async () => {
    server = createApiServer({
      chainVerifier: {
        enabled: true
      },
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/chain/verify",
      payload: {
        mint: "So11111111111111111111111111111111111111112"
      }
    });
    const body = response.json() as {
      error: string;
      chainVerifier: {
        status: string;
      };
    };

    expect(response.statusCode).toBe(409);
    expect(body.error).toBe("CHAIN_VERIFIER_CONFIG_MISSING_RPC");
    expect(body.chainVerifier.status).toBe("config_error");
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
    expect(signals[0]?.reasonCodes).toContain("INSUFFICIENT_RISK_DATA");
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
      maxEvents: 12,
      scenario: "momentum",
      seed: 123
    },
    paperAutoOrder: false,
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
