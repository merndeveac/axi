import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TokenCreatedEvent, TokenTradeEvent } from "@axi/data-feeds";
import type { NormalizedIndexerEvent } from "@axi/indexer-core";
import type { SolanaChainClient } from "@axi/solana-chain";
import type { LiveTokenCardViewModel, StrategyStatus } from "@axi/shared";
import type { ApiServer } from "../src/app";
import { createApiServer } from "../src/app";
import { createActualDataConfig } from "../src/actual-data-service";

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
      actualData: {
        enabled: boolean;
        paperOnly: boolean;
        reasonCodes: string[];
      };
      actualDataSessionCount: number;
      actualDataSubscriptionCount: number;
      candidateCount: number;
      candidateLifecycleEnabled: boolean;
      chainEventsConfigured: boolean;
      chainEventsEnabled: boolean;
      chainTradeEventCount: number;
      chainTransactionEventCount: number;
      dataFeedMode: string;
      dataFeed: string;
      feedProvider: string;
      mockFeedEnabled: boolean;
      noFeedMode: boolean;
      realDataActive: boolean;
      realDataConfigured: boolean;
      marketDataEnabled: boolean;
      marketDataMinConfidence: string;
      marketObservationCount: number;
      liveFeedEventCount: number;
      pumpPortalTokenTradeEventCount: number;
      tokenIdentityCount: number;
      tokenIdentityResolvedCount: number;
      tokenIdentityUnresolvedCount: number;
      watchOrchestratorEnabled: boolean;
      watchPlanCount: number;
      watchActionCount: number;
      metricsEnabled: boolean;
      mode: string;
      paperAutoOrder: boolean;
      paperOnly: boolean;
      riskEnabled: boolean;
      status: string;
      trackedTokenCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.actualData.enabled).toBe(false);
    expect(body.actualData.paperOnly).toBe(true);
    expect(body.actualData.reasonCodes).toContain("ACTUAL_DATA_DISABLED");
    expect(body.actualDataSessionCount).toBe(0);
    expect(body.actualDataSubscriptionCount).toBe(0);
    expect(body.candidateLifecycleEnabled).toBe(true);
    expect(body.chainEventsEnabled).toBe(false);
    expect(body.chainEventsConfigured).toBe(false);
    expect(body.chainTransactionEventCount).toBe(0);
    expect(body.chainTradeEventCount).toBe(0);
    expect(body.marketDataEnabled).toBe(true);
    expect(body.marketDataMinConfidence).toBe("medium");
    expect(body.marketObservationCount).toBe(0);
    expect(body.liveFeedEventCount).toBe(0);
    expect(body.pumpPortalTokenTradeEventCount).toBe(0);
    expect(body.watchOrchestratorEnabled).toBe(false);
    expect(body.watchPlanCount).toBe(0);
    expect(body.watchActionCount).toBe(0);
    expect(body.candidateCount).toBeGreaterThan(0);
    expect(body.dataFeedMode).toBe("mock");
    expect(body.dataFeed).toBe("mock");
    expect(body.feedProvider).toBe("mock");
    expect(body.mockFeedEnabled).toBe(true);
    expect(body.realDataConfigured).toBe(false);
    expect(body.realDataActive).toBe(false);
    expect(body.noFeedMode).toBe(false);
    expect(body.tokenIdentityCount).toBeGreaterThan(0);
    expect(body.tokenIdentityResolvedCount).toBeGreaterThan(0);
    expect(body.tokenIdentityUnresolvedCount).toBe(0);
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
      liveFeedEventCount: number;
      candidateDecisionCount: number;
      chainVerificationCount: number;
      chainTransactionEventCount: number;
      chainTradeEventCount: number;
      marketObservationCount: number;
      pumpPortalTokenTradeEventCount: number;
      actualDataSubscriptionCount: number;
      actualDataSessionCount: number;
      tokenIdentityCount: number;
      tokenIdentityResolvedCount: number;
      tokenIdentityUnresolvedCount: number;
      tokenMetadataFetchCount: number;
      watchPlanCount: number;
      watchActionCount: number;
      lightningTradePlanCount: number;
      pumpPortalWalletStatusSnapshotCount: number;
      paperOrderCount: number;
      paperPositionCount: number;
      riskSnapshotCount: number;
      signalCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.feedEventCount).toBeGreaterThan(0);
    expect(body.liveFeedEventCount).toBe(0);
    expect(body.signalCount).toBeGreaterThan(0);
    expect(body.chainVerificationCount).toBe(0);
    expect(body.chainTransactionEventCount).toBe(0);
    expect(body.chainTradeEventCount).toBe(0);
    expect(body.marketObservationCount).toBe(0);
    expect(body.pumpPortalTokenTradeEventCount).toBe(0);
    expect(body.actualDataSubscriptionCount).toBe(0);
    expect(body.actualDataSessionCount).toBe(0);
    expect(body.tokenIdentityCount).toBeGreaterThan(0);
    expect(body.tokenIdentityResolvedCount).toBeGreaterThan(0);
    expect(body.tokenIdentityUnresolvedCount).toBe(0);
    expect(body.tokenMetadataFetchCount).toBe(0);
    expect(body.watchPlanCount).toBe(0);
    expect(body.watchActionCount).toBe(0);
    expect(body.lightningTradePlanCount).toBe(0);
    expect(body.pumpPortalWalletStatusSnapshotCount).toBe(0);
    expect(body.riskSnapshotCount).toBeGreaterThan(0);
    expect(body.candidateDecisionCount).toBeGreaterThan(0);
    expect(body.paperOrderCount).toBe(0);
    expect(body.paperPositionCount).toBe(0);
  });

  it("default config is live PumpPortal and does not start mock runtime data", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/health"
    });
    const body = response.json() as {
      dataFeedMode: string;
      dataFeed: string;
      feedProvider: string;
      liveFeedConnected: boolean;
      liveFeedExpected: boolean;
      liveTokenCount: number;
      mockFeedEnabled: boolean;
      noFeedMode: boolean;
      noRealFeedMessage?: string;
      candidateCount: number;
      trackedTokenCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.dataFeedMode).toBe("live");
    expect(body.dataFeed).toBe("pumpportal");
    expect(body.feedProvider).toBe("pumpportal");
    expect(body.liveFeedExpected).toBe(true);
    expect(body.liveFeedConnected).toBe(false);
    expect(body.liveTokenCount).toBe(0);
    expect(body.mockFeedEnabled).toBe(false);
    expect(body.noFeedMode).toBe(false);
    expect(body.noRealFeedMessage).toBeUndefined();
    expect(body.candidateCount).toBe(0);
    expect(body.trackedTokenCount).toBe(0);
  });

  it("DATA_FEED=mock without ALLOW_MOCK_DATA=true is blocked", async () => {
    server = createApiServer({
      dataFeed: "mock",
      dataFeedMode: "mock",
      logLevel: false,
      mockFeedEnabled: true,
      startFeed: true,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/health"
    });
    const body = response.json() as {
      dataFeedReasonCodes: string[];
      feedProvider: string;
      mockFeedBlocked: boolean;
      candidateCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.feedProvider).toBe("mock-blocked");
    expect(body.mockFeedBlocked).toBe(true);
    expect(body.dataFeedReasonCodes).toContain(
      "MOCK_FEED_BLOCKED_NOT_EXPLICITLY_ALLOWED"
    );
    expect(body.candidateCount).toBe(0);
  });

  it("DATA_FEED=mock with ALLOW_MOCK_DATA=true works in tests", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/health"
    });
    const body = response.json() as {
      feedProvider: string;
      mockFeedEnabled: boolean;
      candidateCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.feedProvider).toBe("mock");
    expect(body.mockFeedEnabled).toBe(true);
    expect(body.candidateCount).toBeGreaterThan(0);
  });

  it("GET /signals returns enriched signals", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/signals"
    });
    const body = response.json() as Array<{
      candidateDecisionAction?: string;
      identity?: {
        displayName: string;
        resolved: boolean;
        title: string;
      };
      lifecycleState?: string;
      riskLevel?: string;
      riskSnapshot?: unknown;
    }>;

    expect(response.statusCode).toBe(200);
    expect(body).toEqual(expect.any(Array));
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]?.candidateDecisionAction).toEqual(expect.any(String));
    expect(body[0]?.identity?.title).toEqual(expect.any(String));
    expect(body[0]?.identity?.resolved).toBe(true);
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
      identity?: {
        displayName: string;
        resolved: boolean;
      };
      latestDecision?: unknown;
      latestRisk?: unknown;
      lifecycleState: string;
      mint: string;
    }>;

    expect(response.statusCode).toBe(200);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.mint).toEqual(expect.any(String));
    expect(candidates[0]?.identity?.displayName).toEqual(expect.any(String));
    expect(candidates[0]?.identity?.resolved).toBe(true);
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

  it("GET /actual-data/status is disabled by default", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/actual-data/status"
    });
    const body = response.json() as {
      enabled: boolean;
      acknowledgedMetered: boolean;
      dataWalletBalanceStatus: string;
      dataWalletReasonCodes: string[];
      paperOnly: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.acknowledgedMetered).toBe(false);
    expect(body.dataWalletBalanceStatus).toBe("missing_config");
    expect(body.dataWalletReasonCodes).toContain(
      "DATA_WALLET_PUBLIC_KEY_MISSING"
    );
    expect(body.paperOnly).toBe(true);
    expect(body.reasonCodes).toContain("ACTUAL_DATA_DISABLED");
  });

  it("GET /actual-data/status reports metered not acknowledged", async () => {
    server = createActualDataTestServer({
      acknowledgedMetered: false,
      enabled: true
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/actual-data/status"
    });
    const body = response.json() as {
      enabled: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.reasonCodes).toContain("METERED_STREAM_NOT_ACKNOWLEDGED");
  });

  it("POST /actual-data/subscribe rejects when disabled", async () => {
    server = createActualDataTestServer({
      acknowledgedMetered: true,
      enabled: false
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/actual-data/subscribe",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        reason: "manual"
      }
    });
    const body = response.json() as {
      error: string;
    };

    expect(response.statusCode).toBe(409);
    expect(body.error).toBe("ACTUAL_DATA_DISABLED");
  });

  it("POST /actual-data/subscribe rejects when ack is missing", async () => {
    server = createActualDataTestServer({
      acknowledgedMetered: false,
      enabled: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/actual-data/subscribe",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        reason: "manual"
      }
    });
    const body = response.json() as {
      error: string;
    };

    expect(response.statusCode).toBe(409);
    expect(body.error).toBe("METERED_STREAM_NOT_ACKNOWLEDGED");
  });

  it("POST /actual-data/subscribe rejects invalid mint", async () => {
    server = createActualDataTestServer({
      acknowledgedMetered: true,
      enabled: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/actual-data/subscribe",
      payload: {
        mint: "INVALID_MINT",
        reason: "manual"
      }
    });
    const body = response.json() as {
      error: string;
    };

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe("INVALID_MINT");
  });

  it("POST /actual-data/subscribe rejects verified insufficient data-wallet balance", async () => {
    server = createActualDataTestServer({
      acknowledgedMetered: true,
      dataWalletBalanceSol: 0.005,
      enabled: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/actual-data/subscribe",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        reason: "manual"
      }
    });
    const body = response.json() as {
      actualData: {
        dataWalletBalanceSol: number | null;
        dataWalletBalanceStatus: string;
        dataWalletReasonCodes: string[];
      };
      error: string;
    };

    expect(response.statusCode).toBe(409);
    expect(body.error).toBe("DATA_WALLET_FUNDS_REQUIRED_FOR_METERED_STREAM");
    expect(body.actualData.dataWalletBalanceSol).toBe(0.005);
    expect(body.actualData.dataWalletBalanceStatus).toBe("critical");
    expect(body.actualData.dataWalletReasonCodes).toContain(
      "DATA_WALLET_BALANCE_CRITICAL"
    );
  });

  it("GET /actual-data/trades returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/actual-data/trades"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /pumpportal/data-wallet/status works with no config and no secrets", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/pumpportal/data-wallet/status"
    });
    const body = response.json() as {
      apiKeyConfigured: boolean;
      balanceStatus: string;
      paperOnly: boolean;
      publicKey: string | null;
      reasonCodes: string[];
    };
    const serialized = JSON.stringify(body).toLowerCase();

    expect(response.statusCode).toBe(200);
    expect(body.apiKeyConfigured).toBe(false);
    expect(body.publicKey).toBeNull();
    expect(body.balanceStatus).toBe("missing_config");
    expect(body.paperOnly).toBe(true);
    expect(body.reasonCodes).toContain("DATA_WALLET_PUBLIC_KEY_MISSING");
    expect(serialized).not.toContain("privatekey");
    expect(serialized).not.toContain("api-key-value");
  });

  it("GET /pumpportal/data-wallet/status flags invalid public keys", async () => {
    server = createApiServer({
      logLevel: false,
      pumpPortalDataWallet: {
        apiKeyConfigured: true,
        publicKey: "INVALID_PUBLIC_KEY"
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/pumpportal/data-wallet/status"
    });
    const body = response.json() as {
      publicKeyValid: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.publicKeyValid).toBe(false);
    expect(body.reasonCodes).toContain("DATA_WALLET_PUBLIC_KEY_INVALID");
  });

  it("POST /pumpportal/data-wallet/refresh returns mocked read-only balance", async () => {
    server = createApiServer({
      logLevel: false,
      pumpPortalDataWallet: {
        apiKeyConfigured: true,
        publicKey: "So11111111111111111111111111111111111111112",
        rpcHttpUrl: "http://localhost:8899",
        solanaClient: createDataWalletSolanaClient(0.05)
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/pumpportal/data-wallet/refresh"
    });
    const body = response.json() as {
      balanceSol: number;
      balanceStatus: string;
      estimatedEventsRemaining: number;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.balanceSol).toBe(0.05);
    expect(body.balanceStatus).toBe("ok");
    expect(body.estimatedEventsRemaining).toBe(50_000);
    expect(body.reasonCodes).toContain("DATA_WALLET_BALANCE_OK");
  });

  it("GET /pumpportal/data-wallet/funding returns public funding instructions only", async () => {
    server = createApiServer({
      logLevel: false,
      pumpPortalDataWallet: {
        apiKeyConfigured: true,
        publicKey: "So11111111111111111111111111111111111111112"
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/pumpportal/data-wallet/funding"
    });
    const body = response.json() as {
      publicKey: string;
      instructions: string;
      warnings: string[];
    };
    const serialized = JSON.stringify(body).toLowerCase();

    expect(response.statusCode).toBe(200);
    expect(body.publicKey).toBe("So11111111111111111111111111111111111111112");
    expect(body.instructions).toContain("metered data streams");
    expect(body.warnings.join(" ")).toContain("private key");
    expect(serialized).not.toContain("api-key-value");
  });

  it("GET /pumpportal/wallets/status returns data and trading readiness without secrets", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/pumpportal/wallets/status"
    });
    const body = response.json() as {
      dataWallet: {
        apiKeyConfigured: boolean;
        publicKey: string | null;
      };
      tradingWallet: {
        apiKeyConfigured: boolean;
        publicKey: string | null;
      };
      paperOnly: boolean;
      secretFieldsExposed: boolean;
      tradingDisabled: boolean;
      reasonCodes: string[];
    };
    const serialized = JSON.stringify(body).toLowerCase();

    expect(response.statusCode).toBe(200);
    expect(body.dataWallet.apiKeyConfigured).toBe(false);
    expect(body.tradingWallet.apiKeyConfigured).toBe(false);
    expect(body.dataWallet.publicKey).toBeNull();
    expect(body.tradingWallet.publicKey).toBeNull();
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.secretFieldsExposed).toBe(false);
    expect(body.reasonCodes).toContain("LIGHTNING_API_KEY_MISSING");
    expect(serialized).not.toContain("api-key-value");
    expect(serialized).not.toContain("privatekey");
  });

  it("GET /pumpportal/wallets/status flags invalid trading public keys", async () => {
    server = createApiServer({
      logLevel: false,
      pumpPortalWallets: {
        dataWallet: {
          role: "data",
          apiKeyConfigured: true,
          publicKey: "So11111111111111111111111111111111111111112"
        },
        tradingWallet: {
          role: "trading",
          apiKeyConfigured: true,
          publicKey: "INVALID_PUBLIC_KEY"
        }
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/pumpportal/wallets/status"
    });
    const body = response.json() as {
      tradingWallet: {
        publicKeyValid: boolean;
        reasonCodes: string[];
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.tradingWallet.publicKeyValid).toBe(false);
    expect(body.tradingWallet.reasonCodes).toContain(
      "LIGHTNING_PUBLIC_KEY_INVALID"
    );
  });

  it("POST /pumpportal/wallets/refresh returns mocked balances and stores a snapshot", async () => {
    server = createLightningTestServer({
      tradingWalletBalanceSol: 0.05
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/pumpportal/wallets/refresh"
    });
    const body = response.json() as {
      dataWallet: {
        balanceSol: number | null;
      };
      tradingWallet: {
        balanceSol: number | null;
        balanceStatus: string;
      };
      snapshotSaved: boolean;
    };
    const statsResponse = await server.app.inject({
      method: "GET",
      url: "/storage/stats"
    });
    const stats = statsResponse.json() as {
      pumpPortalWalletStatusSnapshotCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.dataWallet.balanceSol).toBe(0.05);
    expect(body.tradingWallet.balanceSol).toBe(0.05);
    expect(body.tradingWallet.balanceStatus).toBe("ok");
    expect(body.snapshotSaved).toBe(true);
    expect(stats.pumpPortalWalletStatusSnapshotCount).toBe(1);
  });

  it("GET /pumpportal/wallets/funding returns only public instructions", async () => {
    server = createLightningTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/pumpportal/wallets/funding"
    });
    const body = response.json() as {
      dataWallet: {
        publicKey: string | null;
      };
      tradingWallet: {
        publicKey: string | null;
      };
      warnings: string[];
      secretFieldsExposed: boolean;
    };
    const serialized = JSON.stringify(body).toLowerCase();

    expect(response.statusCode).toBe(200);
    expect(body.dataWallet.publicKey).toBe(
      "So11111111111111111111111111111111111111112"
    );
    expect(body.tradingWallet.publicKey).toBe(
      "So11111111111111111111111111111111111111112"
    );
    expect(body.warnings.join(" ")).toContain("private keys");
    expect(body.secretFieldsExposed).toBe(false);
    expect(serialized).not.toContain("api-key-value");
  });

  it("GET /execution/lightning/status is live-disabled by default", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/execution/lightning/status"
    });
    const body = response.json() as {
      liveTradingAllowed: boolean;
      manualArmRequired: boolean;
      manualArmed: boolean;
      paperOnly: boolean;
      tradingDisabled: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.liveTradingAllowed).toBe(false);
    expect(body.manualArmRequired).toBe(true);
    expect(body.manualArmed).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.reasonCodes).toContain("LIGHTNING_LIVE_TRADING_DISABLED");
  });

  it("POST /execution/lightning/plan-buy creates and stores a plan without execution", async () => {
    server = createLightningTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/execution/lightning/plan-buy",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        amountSol: 0.001,
        reason: "manual_test"
      }
    });
    const body = response.json() as {
      request: {
        action: string;
        amount: number;
      };
      blocked: boolean;
      blockers: string[];
      noTransactionSent: boolean;
      paperOnly: boolean;
      tradingDisabled: boolean;
    };
    const statsResponse = await server.app.inject({
      method: "GET",
      url: "/storage/stats"
    });
    const stats = statsResponse.json() as {
      lightningTradePlanCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.request.action).toBe("buy");
    expect(body.request.amount).toBe(0.001);
    expect(body.blocked).toBe(true);
    expect(body.blockers).toContain("LIGHTNING_LIVE_TRADING_DISABLED");
    expect(body.noTransactionSent).toBe(true);
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(stats.lightningTradePlanCount).toBe(1);
  });

  it("POST /execution/lightning/plan-buy blocks amounts above the max", async () => {
    server = createLightningTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/execution/lightning/plan-buy",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        amountSol: 0.02,
        reason: "manual_test"
      }
    });
    const body = response.json() as {
      blockers: string[];
      safetyChecks: Array<{ code: string; passed: boolean }>;
    };

    expect(response.statusCode).toBe(200);
    expect(body.blockers).toContain("LIGHTNING_AMOUNT_EXCEEDS_MAX_BUY");
    expect(body.safetyChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "LIGHTNING_ENDPOINT_NOT_CALLED",
          passed: true
        })
      ])
    );
  });

  it("POST /execution/lightning/plan-buy blocks hard-rejected candidates", async () => {
    server = createLightningTestServer();
    const event = createPumpPortalEvent();
    server.emitFeedEvent({
      ...event,
      candidate: {
        ...event.candidate,
        id: {
          chain: "solana",
          mint: "So11111111111111111111111111111111111111112"
        },
        mint: "So11111111111111111111111111111111111111112"
      },
      riskFlags: {
        ...event.riskFlags,
        mintAuthorityActive: true
      }
    });
    const hardReject = server.risk.evaluateRisk({
      mint: "So11111111111111111111111111111111111111112",
      source: "manual",
      mintAuthorityActive: true,
      freezeAuthorityActive: null,
      metadataMutable: null,
      holderCount: null,
      topHolderPct: null,
      top10HolderPct: null,
      devHolderPct: null,
      insiderHolderPct: null,
      devSoldPct: null,
      devNetFlowUsd: null,
      priorLaunchCount: null,
      priorRugCount: null,
      buySellRatio: null,
      netBuyPressure: null,
      uniqueBuyers: null,
      uniqueSellers: null,
      volumeVelocity: null,
      volumeAcceleration: null,
      buyerVelocity: null,
      buyerAcceleration: null,
      priceVelocity: null,
      priceAcceleration: null,
      largestTradeShare: null,
      sampleCount: null,
      insufficientMetrics: null,
      liquidityUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      estimatedSellSlippagePct: null,
      sniperPct: null,
      bundlerPct: null,
      washTradingSuspected: null,
      honeypotSuspected: null
    });
    server.candidates.updateRisk(
      "So11111111111111111111111111111111111111112",
      hardReject
    );

    const response = await server.app.inject({
      method: "POST",
      url: "/execution/lightning/plan-buy",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        amountSol: 0.001,
        reason: "manual_test"
      }
    });
    const body = response.json() as {
      blockers: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.blockers).toContain("LIGHTNING_HARD_REJECT_BLOCKED");
    expect(body.blockers).toContain("LIGHTNING_RISK_BLOCKED");
  });

  it("POST /execution/lightning/execute hard-refuses without execution", async () => {
    server = createLightningTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/execution/lightning/execute",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        amountSol: 0.001
      }
    });
    const body = response.json() as {
      error: string;
      noTransactionSent: boolean;
      refusal: {
        endpointCalled: boolean;
        executed: boolean;
        reasonCodes: string[];
      };
    };

    expect(response.statusCode).toBe(409);
    expect(body.error).toBe("LIGHTNING_LIVE_TRADING_DISABLED");
    expect(body.noTransactionSent).toBe(true);
    expect(body.refusal.executed).toBe(false);
    expect(body.refusal.endpointCalled).toBe(false);
    expect(body.refusal.reasonCodes).toContain("LIGHTNING_ENDPOINT_NOT_CALLED");
  });

  it("GET /live/trade-tracking/status is disabled by default", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/live/trade-tracking/status"
    });
    const body = response.json() as {
      acknowledgedMetered: boolean;
      enabled: boolean;
      maxSubscribedTokens: number;
      paperOnly: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.acknowledgedMetered).toBe(false);
    expect(body.maxSubscribedTokens).toBe(3);
    expect(body.paperOnly).toBe(true);
    expect(body.reasonCodes).toContain("LIVE_TRADE_TRACKING_DISABLED");
  });

  it("POST /live/trade-tracking/track rejects when live ack is missing", async () => {
    server = createActualDataTestServer({
      acknowledgedMetered: true,
      enabled: true,
      liveTradeTrackingAcknowledged: false,
      liveTradeTrackingEnabled: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/live/trade-tracking/track",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        reason: "test"
      }
    });
    const body = response.json() as {
      error: string;
    };

    expect(response.statusCode).toBe(409);
    expect(body.error).toBe("LIVE_TRADE_TRACKING_METERED_NOT_ACKNOWLEDGED");
  });

  it("POST /live/trade-tracking/track subscribes through the guarded PumpPortal stream", async () => {
    server = createActualDataTestServer({
      acknowledgedMetered: true,
      enabled: true,
      liveTradeTrackingAcknowledged: true,
      liveTradeTrackingEnabled: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/live/trade-tracking/track",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        reason: "test"
      }
    });
    const body = response.json() as {
      paperOnly: boolean;
      status: {
        subscribedTokenCount: number;
        trackedMints: string[];
      };
      subscription: {
        mint: string;
        reasonCodes: string[];
        status: string;
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.paperOnly).toBe(true);
    expect(body.subscription.status).toBe("subscribed");
    expect(body.subscription.reasonCodes).toContain(
      "PUMPPORTAL_TRADE_STREAM_METERED"
    );
    expect(body.status.subscribedTokenCount).toBe(1);
    expect(body.status.trackedMints).toContain(
      "So11111111111111111111111111111111111111112"
    );
  });

  it("GET /enrichment/status is disabled by default", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/enrichment/status"
    });
    const body = response.json() as {
      enabled: boolean;
      paperOnly: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.reasonCodes).toContain("LIVE_CARD_ENRICHMENT_DISABLED");
  });

  it("GET /feed/status reports live defaults", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/feed/status"
    });
    const body = response.json() as {
      mode: string;
      provider: string;
      connected: boolean;
      live: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.mode).toBe("live");
    expect(body.provider).toBe("pumpportal");
    expect(body.connected).toBe(false);
    expect(body.live).toBe(true);
    expect(body.reasonCodes).toContain("LIVE_FEED_EXPECTED");
    expect(body.reasonCodes).toContain("HISTORICAL_MOCK_ROWS_HIDDEN");
  });

  it("GET /live/status and /live/tokens start empty for current session", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const statusResponse = await server.app.inject({
      method: "GET",
      url: "/live/status"
    });
    const tokensResponse = await server.app.inject({
      method: "GET",
      url: "/live/tokens"
    });
    const status = statusResponse.json() as {
      liveTokenCount: number;
      historicalMockRowsHidden: boolean;
    };
    const tokens = tokensResponse.json() as unknown[];

    expect(statusResponse.statusCode).toBe(200);
    expect(tokensResponse.statusCode).toBe(200);
    expect(status.liveTokenCount).toBe(0);
    expect(status.historicalMockRowsHidden).toBe(true);
    expect(tokens).toEqual([]);
  });

  it("GET /ui/live-token-cards returns an empty array with no live tokens", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/live-token-cards"
    });
    const body = response.json() as LiveTokenCardViewModel[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /indexer/status reports the API adapter", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/indexer/status"
    });
    const body = response.json() as {
      enabled: boolean;
      liveStateEnabled: boolean;
      futureGeyser: { status: string };
      managedStream: {
        managedStreamEnabled: boolean;
        provider: string;
        connectionState: string;
      };
      streamProvider: string;
      streamEnabled: boolean;
      streamConnectionState: string;
      streamEnvelopeCount: number;
      streamEventCount: number;
      paperOnly: boolean;
      tradingDisabled: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.liveStateEnabled).toBe(true);
    expect(body.futureGeyser.status).toBe("not_implemented");
    expect(body.managedStream.managedStreamEnabled).toBe(false);
    expect(body.managedStream.provider).toBe("mock");
    expect(body.streamProvider).toBe("mock");
    expect(body.streamEnabled).toBe(false);
    expect(body.streamConnectionState).toBe("disabled");
    expect(body.streamEnvelopeCount).toBe(0);
    expect(body.streamEventCount).toBe(0);
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.reasonCodes).toContain("NO_GEYSER_CONNECTION");
    expect(body.reasonCodes).toContain("MANAGED_STREAM_FOUNDATION");
  });

  it("GET /indexer/stream/status reports disabled safe defaults", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath,
      indexer: {
        managedStream: {
          provider: "yellowstone",
          endpoint: "https://yellowstone.example.invalid?token=super-secret",
          authToken: "not-a-real-token",
          yellowstoneEnabled: true,
          yellowstoneEndpoint: "https://yellowstone.example.invalid",
          yellowstoneAuthToken: "not-a-real-token"
        }
      }
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/indexer/stream/status"
    });
    const body = response.json() as {
      managedStreamEnabled: boolean;
      provider: string;
      connectionState: string;
      endpointMasked: string | null;
      authTokenMasked: string | null;
      yellowstoneStatus: { connectionState: string };
      paperOnly: boolean;
      tradingDisabled: boolean;
      reasonCodes: string[];
    };
    const serialized = JSON.stringify(body);

    expect(response.statusCode).toBe(200);
    expect(body.managedStreamEnabled).toBe(false);
    expect(body.provider).toBe("yellowstone");
    expect(body.connectionState).toBe("disabled");
    expect(body.endpointMasked).toContain("token=****");
    expect(body.authTokenMasked).toBe("configured:16");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("not-a-real-token");
    expect(body.yellowstoneStatus.connectionState).toBe("not_implemented");
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.reasonCodes).toContain("STREAM_NO_NETWORK_IN_TESTS");
  });

  it("POST /indexer/stream/mock/publish-fixture updates stream, live-state, and timeseries", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath,
      indexer: {
        managedStream: {
          enabled: true,
          provider: "mock"
        }
      }
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/indexer/stream/mock/publish-fixture",
      payload: {
        fixture: "buy-trade.json"
      }
    });
    const body = response.json() as {
      normalizedEvent: { type: string; mint: string; side: string };
      streamStatus: { receivedCount: number; transactionCount: number };
      liveState: { tokenCount: number };
      paperOnly: boolean;
      tradingDisabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.normalizedEvent.type).toBe("token_trade");
    expect(body.normalizedEvent.side).toBe("buy");
    expect(body.streamStatus.receivedCount).toBe(1);
    expect(body.streamStatus.transactionCount).toBe(1);
    expect(body.liveState.tokenCount).toBe(1);
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);

    const liveStateResponse = await server.app.inject({
      method: "GET",
      url: "/indexer/live-state"
    });
    const liveStateBody = liveStateResponse.json() as {
      stats: { tokenCount: number };
      tokens: Array<{ mint: string; latestTrade: { side: string } | null }>;
    };
    expect(liveStateBody.stats.tokenCount).toBe(1);
    expect(liveStateBody.tokens[0]?.latestTrade?.side).toBe("buy");

    const timeseriesResponse = await server.app.inject({
      method: "GET",
      url: `/indexer/timeseries/${body.normalizedEvent.mint}`
    });
    const timeseriesBody = timeseriesResponse.json() as {
      windows: { "10s": { tradeCount: number; volumeSol: number } };
    };
    expect(timeseriesBody.windows["10s"].tradeCount).toBe(1);
    expect(timeseriesBody.windows["10s"].volumeSol).toBe(1.5);

    const recentResponse = await server.app.inject({
      method: "GET",
      url: "/indexer/stream/recent"
    });
    const recentBody = recentResponse.json() as Array<{
      signature: string | null;
      raw?: unknown;
    }>;
    expect(recentBody[0]?.signature).toBe("pumpfun_fixture_buy_trade_sig");
    expect(recentBody[0]?.raw).toBeUndefined();
  });

  it("GET /indexer/decoders reports local Pump.fun decoder availability", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/indexer/decoders"
    });
    const body = response.json() as {
      pumpfun: {
        available: boolean;
        fixtureCount: number;
        fixtureManifestLoaded: boolean;
        fixtures: string[];
        idlStatus: string;
      };
      geyser: { status: string };
      paperOnly: boolean;
      tradingDisabled: boolean;
      networkDisabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.pumpfun.available).toBe(true);
    expect(body.pumpfun.fixtureCount).toBeGreaterThanOrEqual(6);
    expect(body.pumpfun.fixtureManifestLoaded).toBe(true);
    expect(body.pumpfun.fixtures).toContain("buy-trade.json");
    expect(body.pumpfun.idlStatus).toBe("unavailable");
    expect(body.geyser.status).toBe("not_implemented");
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.networkDisabled).toBe(true);
  });

  it("POST /indexer/decoders/pumpfun/decode returns unknown for unknown payloads", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/indexer/decoders/pumpfun/decode",
      payload: {
        transaction: {
          signature: "api_unknown_fixture_sig",
          meta: {
            err: null,
            logMessages: ["Program log: unrelated local debug payload"]
          }
        }
      }
    });
    const body = response.json() as {
      decodedEvent: { kind: string };
      normalizedEvent: { type: string };
      persisted: boolean;
      tradingDisabled: boolean;
      networkDisabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.decodedEvent.kind).toBe("unknown");
    expect(body.normalizedEvent.type).toBe("unknown");
    expect(body.persisted).toBe(false);
    expect(body.tradingDisabled).toBe(true);
    expect(body.networkDisabled).toBe(true);
  });

  it("POST /indexer/decoders/pumpfun/decode-fixture decodes buy fixtures", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/indexer/decoders/pumpfun/decode-fixture",
      payload: {
        fixture: "buy-trade.json"
      }
    });
    const body = response.json() as {
      manifestEntry: { id: string; fixtureType: string };
      fixtureSummary: { signature: string | null; logCount: number };
      expectedComparison: { checked: boolean; ok: boolean };
      normalizedEvent: {
        type: string;
        side?: string;
        priceSol?: number | null;
        usableForMetrics?: boolean;
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.manifestEntry.id).toBe("buy-trade");
    expect(body.manifestEntry.fixtureType).toBe("synthetic");
    expect(body.fixtureSummary.signature).toBe("pumpfun_fixture_buy_trade_sig");
    expect(body.fixtureSummary.logCount).toBeGreaterThan(0);
    expect(body.expectedComparison).toMatchObject({
      checked: true,
      ok: true
    });
    expect(body.normalizedEvent.type).toBe("token_trade");
    expect(body.normalizedEvent.side).toBe("buy");
    expect(body.normalizedEvent.priceSol).toBe(0.0005);
    expect(body.normalizedEvent.usableForMetrics).toBe(true);
  });

  it("POST /indexer/decoders/pumpfun/decode-fixture blocks path traversal", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/indexer/decoders/pumpfun/decode-fixture",
      payload: {
        fixture: "../buy-trade.json"
      }
    });
    const body = response.json() as { error: string };

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe("invalid_fixture");
  });

  it("ingesting a normalized token_created creates indexer live state", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    server.indexerAdapter.ingestIndexerEvent(createIndexerTokenCreatedEvent());

    const response = await server.app.inject({
      method: "GET",
      url: "/indexer/live-state"
    });
    const body = response.json() as {
      stats: { tokenCount: number };
      tokens: Array<{ mint: string; displayName: string }>;
    };

    expect(response.statusCode).toBe(200);
    expect(body.stats.tokenCount).toBe(1);
    expect(body.tokens[0]?.displayName).toBe("IDX Indexer Token");
  });

  it("GET /indexer/live-cards returns live-state cards", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    server.indexerAdapter.ingestIndexerEvent(createIndexerTokenCreatedEvent());

    const response = await server.app.inject({
      method: "GET",
      url: "/indexer/live-cards"
    });
    const cards = response.json() as Array<{ mint: string; eventTypes: string[] }>;

    expect(response.statusCode).toBe(200);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.eventTypes).toContain("token_created");
  });

  it("does not leak historical mock rows into indexer live state", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/indexer/live-state"
    });
    const body = response.json() as {
      stats: { tokenCount: number; eventCount: number };
      tokens: unknown[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.stats.tokenCount).toBe(0);
    expect(body.stats.eventCount).toBe(0);
    expect(body.tokens).toEqual([]);
  });

  it("GET /ui/live-token-cards returns a live PumpPortal token card", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(createPumpPortalEvent());

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/live-token-cards"
    });
    const cards = response.json() as LiveTokenCardViewModel[];

    expect(response.statusCode).toBe(200);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.mint).toBe(createPumpPortalEvent().candidate.mint);
    expect(cards[0]?.title).toBe("PORTAL - Portal Token");
    expect(cards[0]?.displayName).toBe("PORTAL Portal Token");
    expect(cards[0]?.source).toBe("pumpportal");
    expect(cards[0]?.sourceMode).toBe("real");
    expect(cards[0]?.realData).toBe(true);
    expect(cards[0]?.liveSessionOnly).toBe(true);
    expect(cards[0]?.priceSol).toBeNull();
    expect(cards[0]?.holders).toBeNull();
    expect(cards[0]?.unavailableFields).toContain("priceSol");
    expect(cards[0]?.unavailableFields).toContain("holderVelocityPerSec");
    expect(cards[0]?.calculationReasonCodes).toContain(
      "HOLDER_TIME_SERIES_UNAVAILABLE"
    );
    expect(cards[0]?.dataCompleteness.dataQualityLabel).toBe("discovery_only");
    expect(cards[0]?.dataCompleteness.missingCriticalFields).toContain("price");
    expect(cards[0]?.tradeTrackingState).toBe("not_tracked");
    expect(cards[0]?.tradeTrackingReasonCodes).toContain(
      "LIVE_TRADE_TRACKING_DISABLED"
    );
    expect(cards[0]?.tradeEventCount).toBe(0);
    expect(cards[0]?.latestTradeAt).toBeNull();
    expect(cards[0]?.enrichmentStatus).toBe("disabled");
    expect(cards[0]?.action).toBe("IGNORE");
    expect(cards[0]?.strategy.signalStrength).toBe("none");
  });

  it("GET /ui/live-token-cards includes metrics when available", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    const event = createPumpPortalEvent();
    server.emitFeedEvent(event);
    server.metrics.ingestTradeObservation({
      mint: event.candidate.mint,
      priceSol: 0.00042,
      quoteAsset: "SOL",
      side: "buy",
      symbol: event.candidate.symbol,
      timestamp: "2026-01-01T00:00:02.000Z",
      trader: "Buyer1111111111111111111111111111111111111",
      usableForMetrics: true,
      volumeSol: 1.5
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/live-token-cards"
    });
    const cards = response.json() as LiveTokenCardViewModel[];

    expect(response.statusCode).toBe(200);
    expect(cards[0]?.priceSol).toBe(0.00042);
    expect(cards[0]?.volume10sSol).toBe(1.5);
    expect(cards[0]?.uniqueBuyers10s).toBe(1);
    expect(cards[0]?.buyTradeCount10s).toBe(1);
    expect(cards[0]?.sampleCount).toBe(1);
    expect(cards[0]?.strategy.calculationInputs.volumeVelocity).toBe(0.3);
  });

  it("GET /ui/live-token-cards includes actual PumpPortal token trade summaries", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    const event = createPumpPortalEvent();
    server.emitFeedEvent(event);
    server.emitFeedEvent(createPumpPortalTradeEvent(event.candidate.mint));

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/live-token-cards"
    });
    const cards = response.json() as LiveTokenCardViewModel[];

    expect(response.statusCode).toBe(200);
    expect(cards[0]?.tradeEventCount).toBe(1);
    expect(cards[0]?.actualTradeEventCount).toBe(1);
    expect(cards[0]?.latestTradeAt).toBe("2026-01-01T00:00:02.000Z");
    expect(cards[0]?.priceSol).toBe(0.00042);
    expect(cards[0]?.volume10sSol).toBe(1.5);
    expect(cards[0]?.dataCompleteness.dataQualityLabel).toBe("trade_tracked");
    expect(cards[0]?.dataCompleteness.reasonCodes).toContain(
      "DATA_QUALITY_TRADE_TRACKED"
    );
  });

  it("GET /strategy/status returns read-only paper strategy details", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/strategy/status"
    });
    const body = response.json() as StrategyStatus;

    expect(response.statusCode).toBe(200);
    expect(body.paperOnly).toBe(true);
    expect(body.thresholds.minScoreForPaperBuyReady).toBe(75);
    expect(body.thresholds.minSampleCount).toBe(8);
    expect(body.safetyGates).toContain("NO_TRADING_CONTROLS");
  });

  it("GET /tokens/status works", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/tokens/status"
    });
    const body = response.json() as {
      identityCount: number;
      paperOnly: boolean;
      resolvedCount: number;
    };

    expect(response.statusCode).toBe(200);
    expect(body.paperOnly).toBe(true);
    expect(body.identityCount).toBeGreaterThan(0);
    expect(body.resolvedCount).toBeGreaterThan(0);
  });

  it("GET /tokens returns identities", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/tokens"
    });
    const body = response.json() as Array<{
      displayName: string;
      mint: string;
      title: string;
    }>;

    expect(response.statusCode).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]?.title).toEqual(expect.any(String));
    expect(body[0]?.displayName).toEqual(expect.any(String));
  });

  it("GET /tokens/:mint returns 404 for unknown mint", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/tokens/UnknownMint111111111111111111111111111"
    });

    expect(response.statusCode).toBe(404);
  });

  it("GET /tokens/unresolved works", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/tokens/unresolved"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("POST /tokens/resolve rejects invalid mint", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/tokens/resolve",
      payload: {
        mint: "INVALID_MINT"
      }
    });
    const body = response.json() as {
      error: string;
    };

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe("INVALID_MINT");
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

  it("GET /market/status reports safe defaults", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/market/status"
    });
    const body = response.json() as {
      enabled: boolean;
      minConfidenceForMetrics: string;
      observationCount: number;
      paperOnly: boolean;
      solUsdConfigured: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.minConfidenceForMetrics).toBe("medium");
    expect(body.observationCount).toBe(0);
    expect(body.paperOnly).toBe(true);
    expect(body.solUsdConfigured).toBe(false);
  });

  it("GET /market/observations returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/market/observations"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /market/observations/:mint returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/market/observations/UnknownMint111111111111111111111111111"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /market/observations/signature/:signature returns 404 for unknown signature", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/market/observations/signature/unknown-signature"
    });

    expect(response.statusCode).toBe(404);
  });

  it("GET /watch/status reports disabled defaults", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/watch/status"
    });
    const body = response.json() as {
      enabled: boolean;
      paperOnly: boolean;
      watchPlanCount: number;
      watchActionCount: number;
      chainVerifierEnabled: boolean;
      chainEventsEnabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.watchPlanCount).toBe(0);
    expect(body.watchActionCount).toBe(0);
    expect(body.chainVerifierEnabled).toBe(false);
    expect(body.chainEventsEnabled).toBe(false);
  });

  it("GET /watch/plans returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/watch/plans"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /watch/actions returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/watch/actions"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("GET /watch/plans/:mint returns 404 for unknown mint", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/watch/plans/So11111111111111111111111111111111111111112"
    });

    expect(response.statusCode).toBe(404);
  });

  it("GET /watch/actions/:mint returns an array", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/watch/actions/So11111111111111111111111111111111111111112"
    });
    const body = response.json() as unknown[];

    expect(response.statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it("POST /watch/plan validates input and returns a dry-run plan", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/watch/plan",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        event: {
          mint: "So11111111111111111111111111111111111111112",
          bondingCurve: "11111111111111111111111111111111"
        }
      }
    });
    const body = response.json() as {
      shouldVerifyMint: boolean;
      shouldWatchEvents: boolean;
      skippedTargets: unknown[];
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.shouldVerifyMint).toBe(false);
    expect(body.shouldWatchEvents).toBe(false);
    expect(body.skippedTargets.length).toBeGreaterThan(0);
    expect(body.reasonCodes).toContain("WATCH_ORCHESTRATOR_DISABLED");
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
      identity?: {
        dataSource: string;
        title: string;
      };
      reasonCodes: string[];
    }>;
    const orders = ordersResponse.json() as unknown[];

    expect(signals[0]?.action).toBe("IGNORE");
    expect(signals[0]?.reasonCodes).toContain("INSUFFICIENT_METRICS");
    expect(signals[0]?.reasonCodes).toContain("INSUFFICIENT_RISK_DATA");
    expect(signals[0]?.reasonCodes).toContain("REAL_FEED_NEW_TOKEN_EVENT");
    expect(signals[0]?.identity?.title).toBe("PORTAL - Portal Token");
    expect(signals[0]?.identity?.dataSource).toBe("pumpportal");
    expect(orders).toHaveLength(0);

    const tokensResponse = await server.app.inject({
      method: "GET",
      url: "/tokens"
    });
    const tokens = tokensResponse.json() as Array<{
      mint: string;
      title: string;
    }>;

    expect(
      tokens.some((token) => token.title === "PORTAL - Portal Token")
    ).toBe(true);

    const liveTokensResponse = await server.app.inject({
      method: "GET",
      url: "/live/tokens"
    });
    const liveTokens = liveTokensResponse.json() as Array<{
      displayName: string;
      eventTypes: string[];
      mint: string;
      realData: boolean;
      source: string;
      sourceMode: string;
    }>;

    expect(liveTokensResponse.statusCode).toBe(200);
    expect(liveTokens).toHaveLength(1);
    expect(liveTokens[0]?.mint).toBe(createPumpPortalEvent().candidate.mint);
    expect(liveTokens[0]?.realData).toBe(true);
    expect(liveTokens[0]?.source).toBe("pumpportal");
    expect(liveTokens[0]?.sourceMode).toBe("real");
    expect(liveTokens[0]?.eventTypes).toContain("new_token");
    expect(liveTokens[0]?.displayName).toBe("PORTAL Portal Token");

    const liveEventsResponse = await server.app.inject({
      method: "GET",
      url: "/live/events"
    });
    const liveEvents = liveEventsResponse.json() as Array<{
      eventType: string;
      realData: boolean;
    }>;

    expect(liveEventsResponse.statusCode).toBe(200);
    expect(liveEvents[0]?.eventType).toBe("new_token");
    expect(liveEvents[0]?.realData).toBe(true);
  });

  it("historical mock runtime rows do not appear in /live/tokens", async () => {
    server = createTestServer();

    const liveTokensResponse = await server.app.inject({
      method: "GET",
      url: "/live/tokens"
    });
    const liveCardsResponse = await server.app.inject({
      method: "GET",
      url: "/ui/live-token-cards"
    });
    const liveTokens = liveTokensResponse.json() as unknown[];
    const liveCards = liveCardsResponse.json() as unknown[];

    expect(liveTokensResponse.statusCode).toBe(200);
    expect(liveCardsResponse.statusCode).toBe(200);
    expect(liveTokens).toEqual([]);
    expect(liveCards).toEqual([]);
  });

  // TODO: Add a WebSocket integration test after the test harness grows a
  // lightweight real-port helper. Fastify injection keeps HTTP tests port-free.
});

function createTestServer(): ApiServer {
  return createApiServer({
    allowMockData: true,
    dataFeed: "mock",
    dataFeedMode: "mock",
    logLevel: false,
    mockFeedEnabled: true,
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

function createActualDataTestServer(options: {
  acknowledgedMetered: boolean;
  dataWalletBalanceSol?: number;
  enabled: boolean;
  liveTradeTrackingAcknowledged?: boolean;
  liveTradeTrackingEnabled?: boolean;
}): ApiServer {
  return createApiServer({
    actualData: createActualDataConfig({
      acknowledgedMetered: options.acknowledgedMetered,
      apiKeyConfigured: true,
      enabled: options.enabled,
      maxEventsPerMint: 200,
      maxEventsPerSession: 500,
      maxSubscribedTokens: 3,
      requireApiKey: true
    }),
    dataFeed: "pumpportal",
    liveTradeTracking: {
      acknowledgedMetered: options.liveTradeTrackingAcknowledged ?? false,
      enabled: options.liveTradeTrackingEnabled ?? false,
      maxEventsPerMint: 200,
      maxEventsPerSession: 500,
      maxSubscribedTokens: 3,
      unsubscribeAfterMs: 0
    },
    logLevel: false,
    pumpPortal: {
      apiKey: "test-api-key",
      maxTokenTradeEventsPerMint: 200,
      maxTokenTradeEventsPerSession: 500,
      maxTokenTradeSubscriptions: 3,
      subscribeMigration: false,
      subscribeNewToken: false,
      wsUrl: "wss://example.test/pumpportal"
    },
    pumpPortalDataWallet: {
      apiKeyConfigured: true,
      publicKey: "So11111111111111111111111111111111111111112",
      ...(options.dataWalletBalanceSol !== undefined
        ? {
            rpcHttpUrl: "http://localhost:8899",
            solanaClient: createDataWalletSolanaClient(
              options.dataWalletBalanceSol
            )
          }
        : {})
    },
    startFeed: false,
    storageDatabasePath: databasePath
  });
}

function createLightningTestServer(
  options: {
    tradingWalletBalanceSol?: number;
  } = {}
): ApiServer {
  return createApiServer({
    dataFeed: "pumpportal",
    lightning: {
      enabled: true,
      liveTradingAllowed: false,
      manualArmRequired: true,
      manualArmed: false,
      limits: {
        maxBuySol: 0.005,
        maxDailySol: 0.02,
        maxOpenPositions: 1,
        maxSlippagePct: 10,
        priorityFeeSol: 0.00005,
        pool: "auto",
        skipPreflight: false,
        jitoOnly: false
      }
    },
    logLevel: false,
    pumpPortalWallets: {
      dataWallet: {
        role: "data",
        apiKeyConfigured: true,
        publicKey: "So11111111111111111111111111111111111111112"
      },
      tradingWallet: {
        role: "trading",
        apiKeyConfigured: true,
        publicKey: "So11111111111111111111111111111111111111112"
      },
      ...(options.tradingWalletBalanceSol !== undefined
        ? {
            rpcHttpUrl: "http://localhost:8899",
            solanaClient: createDataWalletSolanaClient(
              options.tradingWalletBalanceSol
            )
          }
        : {})
    },
    startFeed: false,
    storageDatabasePath: databasePath
  });
}

function createDataWalletSolanaClient(balanceSol: number) {
  return {
    getSolBalance: async (publicKey: string) => ({
      publicKey,
      balanceLamports: Math.round(balanceSol * 1_000_000_000),
      balanceSol,
      inspectedAt: "2026-01-01T00:00:00.000Z"
    })
  } as unknown as SolanaChainClient;
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

function createIndexerTokenCreatedEvent(): NormalizedIndexerEvent {
  return {
    id: "idx_api_test_created",
    schemaVersion: 1,
    source: "mock",
    sourceMode: "mock",
    chain: "solana",
    receivedAt: "2026-01-01T00:00:00.000Z",
    reasonCodes: ["INDEXER_SCHEMA_V1"],
    type: "token_created",
    mint: "IndexerMint11111111111111111111111111111111",
    name: "Indexer Token",
    symbol: "IDX",
    metadataUri: null,
    creator: null,
    bondingCurve: null,
    associatedBondingCurve: null,
    initialBuySol: null,
    marketCapSol: null
  };
}

function createPumpPortalTradeEvent(mint: string): TokenTradeEvent {
  return {
    type: "trade",
    mint,
    source: "pumpportal",
    token: {
      chain: "solana",
      mint
    },
    symbol: "PORTAL",
    name: "Portal Token",
    side: "buy",
    priceUsd: 0,
    volumeUsd: 0,
    priceSol: 0.00042,
    volumeSol: 1.5,
    quoteAsset: "SOL",
    tokenAmount: 3571.428571,
    trader: "Buyer1111111111111111111111111111111111111",
    usableForMetrics: true,
    confidence: "medium",
    metrics: {
      priceUsd: 0,
      priceSol: 0.00042,
      marketCapUsd: 0,
      liquidityUsd: 0,
      volume1mUsd: 0,
      volume5mUsd: 0,
      volume15mUsd: 0,
      volumeSol: 1.5,
      usableForMetrics: true,
      buyCount1m: 1,
      buyCount5m: 1,
      sellCount1m: 0,
      sellCount5m: 0,
      uniqueBuyers1m: 1,
      uniqueBuyers5m: 1,
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
    metricsComplete: true,
    rawSourceEventType: "token_trade",
    realData: true,
    reasonCodes: ["PUMPPORTAL_TOKEN_TRADE", "PUMPPORTAL_TRADE_STREAM_METERED"],
    receivedAt: "2026-01-01T00:00:02.000Z",
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
    signature: "TradeSig111111111111111111111111111111111",
    timestamp: "2026-01-01T00:00:02.000Z"
  };
}
