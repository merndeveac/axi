import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  TokenCreatedEvent,
  TokenTradeEvent,
  WebSocketLike
} from "@axi/data-feeds";
import type { ExitSignal } from "@axi/exit-strategy";
import type { NormalizedIndexerEvent } from "@axi/indexer-core";
import type { SolanaChainClient } from "@axi/solana-chain";
import type {
  LiveTokenCardViewModel,
  MomentumDiagnostics,
  MomentumScannerRow,
  StrategyStatus
} from "@axi/shared";
import type { ApiServer } from "../src/app";
import { createApiServer, loadApiConfig } from "../src/app";
import { createActualDataConfig } from "../src/actual-data-service";

let server: ApiServer | undefined;
let testDirectory: string;
let databasePath: string;

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
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
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

beforeEach(() => {
  FakeWebSocket.instances = [];
  testDirectory = mkdtempSync(join(tmpdir(), "axi-api-"));
  databasePath = join(testDirectory, "axi.sqlite");
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("@axi/api", () => {
  it("uses one conservative local runtime configuration by default", () => {
    const config = loadApiConfig({});

    expect(config.API_HOST).toBe("127.0.0.1");
    expect(config.API_ALLOWED_ORIGINS).toEqual([
      "http://127.0.0.1:5173",
      "http://localhost:5173"
    ]);
    expect(config.METERED_LAUNCH_DATA_CONTROLS_ENABLED).toBe(true);
    expect(config.METERED_LAUNCH_DATA_START_ACTIVE).toBe(false);
    expect(config.METERED_LAUNCH_DATA_REQUIRE_UI_ACK).toBe(true);
    expect(config.METERED_LAUNCH_DATA_ACK_COST).toBe(false);
    expect(config.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS).toBe(3);
    expect(config.ROLLING_TRACKER_RESERVED_NEWEST_SLOTS).toBe(1);
    expect(config.ROLLING_TRACKER_MAX_PROTECTED_MINTS).toBe(2);
    expect(config.ROLLING_TRACKER_QUEUE_LIMIT).toBe(50);
    expect(config.ROLLING_TRACKER_QUEUE_MAX_AGE_MS).toBe(30_000);
    expect(config.TIMESERIES_RETENTION_MS).toBe(300_000);
    expect(config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT).toBe(250);
    expect(config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION).toBe(1000);
    expect(config.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL).toBe(0.001);
    expect(config.METERED_LAUNCH_DATA_MAX_UI_SESSION_COST_SOL).toBe(0.001);
    expect(config.PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING).toBe(false);
    expect(config.PUMPPORTAL_LIGHTNING_MANUAL_ARMED).toBe(false);
  });

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

  it("GET /paper-portfolio/status is paper-only with policies disabled by default", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/paper-portfolio/status"
    });
    const body = response.json() as {
      enabled: boolean;
      entryPolicyEnabled: boolean;
      exitPolicyEnabled: boolean;
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.entryPolicyEnabled).toBe(false);
    expect(body.exitPolicyEnabled).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
    expect(body.reasonCodes).toContain("PAPER_ENTRY_POLICY_DISABLED");
    expect(body.reasonCodes).toContain("PAPER_EXIT_POLICY_DISABLED");
  });

  it("paper portfolio manual entry rejects missing prices and fills with explicit prices", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const rejectedResponse = await server.app.inject({
      method: "POST",
      url: "/paper-portfolio/manual-entry",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        sizeSol: 0.005,
        reason: "manual_test"
      }
    });
    const rejected = rejectedResponse.json() as {
      blocked: boolean;
      fill: {
        fillStatus: string;
        reasonCodes: string[];
      };
    };

    expect(rejectedResponse.statusCode).toBe(200);
    expect(rejected.blocked).toBe(true);
    expect(rejected.fill.fillStatus).toBe("rejected");
    expect(rejected.fill.reasonCodes).toContain("PAPER_PRICE_MISSING");

    const filledResponse = await server.app.inject({
      method: "POST",
      url: "/paper-portfolio/manual-entry",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        sizeSol: 0.005,
        marketPriceSol: 0.001,
        reason: "manual_test"
      }
    });
    const filled = filledResponse.json() as {
      blocked: boolean;
      fill: {
        fillStatus: string;
      };
      position: {
        mint: string;
        status: string;
        remainingSizeSol: number;
      };
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
    };
    const positionsResponse = await server.app.inject({
      method: "GET",
      url: "/paper-portfolio/positions"
    });
    const positions = positionsResponse.json() as {
      positions: unknown[];
      status: {
        openPositionCount: number;
      };
    };

    expect(filledResponse.statusCode).toBe(200);
    expect(filled.blocked).toBe(false);
    expect(filled.fill.fillStatus).toBe("filled");
    expect(filled.position.status).toBe("open");
    expect(filled.position.remainingSizeSol).toBe(0.005);
    expect(filled.paperOnly).toBe(true);
    expect(filled.liveExecutionDisabled).toBe(true);
    expect(positionsResponse.statusCode).toBe(200);
    expect(positions.positions).toHaveLength(1);
    expect(positions.status.openPositionCount).toBe(1);
  });

  it("paper portfolio manual exit updates realized PnL without live execution", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    await server.app.inject({
      method: "POST",
      url: "/paper-portfolio/manual-entry",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        sizeSol: 0.005,
        marketPriceSol: 0.001,
        reason: "manual_test"
      }
    });

    const exitResponse = await server.app.inject({
      method: "POST",
      url: "/paper-portfolio/manual-exit",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        sellPct: 50,
        marketPriceSol: 0.002,
        reason: "manual_test"
      }
    });
    const body = exitResponse.json() as {
      blocked: boolean;
      fill: {
        fillStatus: string;
        side: string;
      };
      position: {
        realizedPnlSol: number;
        status: string;
      };
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
    };

    expect(exitResponse.statusCode).toBe(200);
    expect(body.blocked).toBe(false);
    expect(body.fill.side).toBe("sell");
    expect(body.fill.fillStatus).toBe("partial");
    expect(body.position.status).toBe("partially_closed");
    expect(body.position.realizedPnlSol).toBeGreaterThan(0);
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
  });

  it("enabled paper entry policy can create a simulated launch entry", async () => {
    const mint = "PumpPortalMint111111111111111111111111111";
    server = createApiServer({
      logLevel: false,
      paperPortfolio: {
        entry: {
          enabled: true,
          allowedLabels: ["trade_tracked", "watching", "watch", "none"],
          blockHardReject: false,
          cooldownByMintMs: 0,
          maxAgeSeconds: 600,
          maxRiskLevel: "critical",
          minBuySellRatio: 0,
          minLaunchScore: 0,
          minUniqueBuyers10s: 1,
          minValidTradeSamples: 1,
          positionSizeSol: 0.005,
          requirePrice: true,
          requireTradeTracked: true
        }
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    server.emitFeedEvent(createPumpPortalEvent());
    server.emitFeedEvent(createPumpPortalTradeEvent(mint));

    const response = await server.app.inject({
      method: "GET",
      url: `/paper-portfolio/positions/${mint}`
    });
    const body = response.json() as {
      position: {
        mint: string;
        status: string;
      };
      summary: {
        hasPosition: boolean;
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.position.mint).toBe(mint);
    expect(body.position.status).toBe("open");
    expect(body.summary.hasPosition).toBe(true);
  });

  it("enabled paper exit policy can consume a watched-wallet exit signal", async () => {
    const mint = "So11111111111111111111111111111111111111112";
    server = createApiServer({
      logLevel: false,
      paperPortfolio: {
        exit: {
          allowWatchedWalletSignals: true,
          cooldownMs: 0,
          defaultSellPct: 100,
          enabled: true,
          minProfitPct: 25,
          requirePrice: true,
          stopLossPct: -25,
          takeProfitPct: 50,
          trailingStopPct: null
        }
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    server.paperPortfolio.manualEntry({
      marketPriceSol: 0.001,
      mint,
      reason: "manual_test",
      sizeSol: 0.005
    });
    server.paperPortfolio.updateMarkPrice(mint, 0.002);

    const evaluations = server.paperPortfolio.ingestExitSignals([
      createExitSignal(mint)
    ]);

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]?.blocked).toBe(false);
    expect(evaluations[0]?.fill?.fillStatus).toBe("filled");
    expect(evaluations[0]?.position?.status).toBe("closed");
    expect(evaluations[0]?.paperOnly).toBe(true);
    expect(evaluations[0]?.liveExecutionDisabled).toBe(true);
  });

  it("POST /paper-portfolio/backtest replays launch fixtures locally", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/paper-portfolio/backtest",
      payload: {
        fixture: "strong-ripper"
      }
    });
    const body = response.json() as {
      entryCount: number;
      fixture: string;
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
      snapshot: {
        totalTrades: number;
      };
      source: string;
    };

    expect(response.statusCode).toBe(200);
    expect(body.source).toBe("launch-fixture");
    expect(body.fixture).toBe("strong-ripper");
    expect(body.entryCount).toBeGreaterThanOrEqual(1);
    expect(body.snapshot.totalTrades).toBeGreaterThanOrEqual(1);
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
  });

  it("GET /exit/status is disabled by default", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/exit/status"
    });
    const body = response.json() as {
      accountTradeMonitoringEnabled: boolean;
      accountTradesEnabled: boolean;
      enabled: boolean;
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.accountTradesEnabled).toBe(false);
    expect(body.accountTradeMonitoringEnabled).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
    expect(body.reasonCodes).toContain("EXIT_STRATEGY_DISABLED");
  });

  it("POST /exit/wallets adds a watched wallet", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/exit/wallets",
      payload: {
        address: "So11111111111111111111111111111111111111112",
        alias: "paper watcher",
        tags: ["smart_money", "exit_liquidity"]
      }
    });
    const body = response.json() as {
      wallet: {
        address: string;
        alias: string | null;
        tags: string[];
      };
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.wallet.address).toBe(
      "So11111111111111111111111111111111111111112"
    );
    expect(body.wallet.alias).toBe("paper watcher");
    expect(body.wallet.tags).toContain("smart_money");
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
  });

  it("POST /exit/wallets rejects an invalid wallet", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/exit/wallets",
      payload: {
        address: "InvalidWallet000000000000000000000000000",
        tags: []
      }
    });
    const body = response.json() as {
      error: string;
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
    };

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe("INVALID_WATCHED_WALLET_ADDRESS");
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
  });

  it("POST /exit/rules adds an exit rule", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/exit/rules",
      payload: {
        id: "test-exit-rule",
        name: "Test exit rule",
        enabled: true,
        trigger: "watched_wallet_buy",
        minProfitPct: 25,
        sellPct: 50,
        requireCurrentPrice: true
      }
    });
    const body = response.json() as {
      rule: {
        id: string;
        enabled: boolean;
        sellPct: number;
      };
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.rule.id).toBe("test-exit-rule");
    expect(body.rule.enabled).toBe(true);
    expect(body.rule.sellPct).toBe(50);
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
  });

  it("POST /exit/simulate returns a paper exit signal", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/exit/simulate",
      payload: {
        event: {
          wallet: "So11111111111111111111111111111111111111112",
          mint: "So11111111111111111111111111111111111111112",
          side: "buy",
          priceSol: 0.00075,
          volumeSol: 3,
          tokenAmount: 4000,
          timestamp: "2026-01-01T00:01:00.000Z",
          source: "test",
          confidence: "high",
          usableForExitStrategy: true,
          reasonCodes: ["WATCHED_WALLET_TRADE_OBSERVED"]
        },
        position: {
          mint: "So11111111111111111111111111111111111111112",
          symbol: "EXIT",
          entryPriceSol: 0.0005,
          currentPriceSol: 0.00075,
          sizeSol: 1,
          tokenAmount: 2000,
          openedAt: "2026-01-01T00:00:00.000Z",
          unrealizedPnlPct: 50,
          unrealizedPnlSol: 0.5,
          status: "open"
        },
        rule: {
          id: "simulate-rule",
          enabled: true,
          minProfitPct: 25,
          sellPct: 100
        }
      }
    });
    const body = response.json() as {
      signal: {
        action: string;
        blocked: boolean;
        sellPct: number;
      } | null;
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.signal?.action).toBe("paper_sell");
    expect(body.signal?.blocked).toBe(false);
    expect(body.signal?.sellPct).toBe(100);
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
  });

  it("POST /exit/evaluate with no position returns no actionable signal", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "POST",
      url: "/exit/evaluate"
    });
    const body = response.json() as {
      openPositionCount: number;
      signals: unknown[];
      liveExecutionDisabled: boolean;
      paperOnly: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.openPositionCount).toBe(0);
    expect(body.signals).toHaveLength(0);
    expect(body.paperOnly).toBe(true);
    expect(body.liveExecutionDisabled).toBe(true);
  });

  it("account trade subscription is blocked without metered acknowledgement", async () => {
    server = createExitTestServer({
      accountTradesAcknowledgedMetered: false,
      accountTradesEnabled: true,
      enabled: true
    });

    const addWalletResponse = await server.app.inject({
      method: "POST",
      url: "/exit/wallets",
      payload: {
        address: "So11111111111111111111111111111111111111112",
        tags: ["smart_money"]
      }
    });
    const statusResponse = await server.app.inject({
      method: "GET",
      url: "/exit/status"
    });
    const status = statusResponse.json() as {
      accountTradeMonitoringEnabled: boolean;
      reasonCodes: string[];
    };

    expect(addWalletResponse.statusCode).toBe(200);
    expect(statusResponse.statusCode).toBe(200);
    expect(status.accountTradeMonitoringEnabled).toBe(false);
    expect(status.reasonCodes).toContain(
      "ACCOUNT_TRADE_METERED_NOT_ACKNOWLEDGED"
    );
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

  it("POST /actual-data/subscribe is deprecated when disabled", async () => {
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

    expect(response.statusCode).toBe(410);
    expect(body.error).toBe("TRACKING_ROUTE_DEPRECATED");
  });

  it("POST /actual-data/subscribe cannot bypass the canonical ACK gate", async () => {
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

    expect(response.statusCode).toBe(410);
    expect(body.error).toBe("TRACKING_ROUTE_DEPRECATED");
  });

  it("POST /actual-data/subscribe is deprecated before payload policy", async () => {
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

    expect(response.statusCode).toBe(410);
    expect(body.error).toBe("TRACKING_ROUTE_DEPRECATED");
  });

  it("POST /actual-data/subscribe cannot bypass wallet gates", async () => {
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
    const body = response.json() as { error: string };

    expect(response.statusCode).toBe(410);
    expect(body.error).toBe("TRACKING_ROUTE_DEPRECATED");
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

  it("status endpoints expose only API key configured booleans", async () => {
    const secret = "test-secret-api-key-value";
    server = createApiServer({
      actualData: createActualDataConfig({
        acknowledgedMetered: true,
        apiKeyConfigured: true,
        enabled: true,
        maxEventsPerMint: 200,
        maxEventsPerSession: 500,
        maxSubscribedTokens: 3,
        requireApiKey: true
      }),
      dataFeed: "pumpportal",
      logLevel: false,
      meteredLaunchData: {
        acknowledgedCost: true,
        apiKeyConfigured: true,
        dataWalletPublicKeyConfigured: true,
        enabled: true,
        maxConcurrentMints: 3,
        maxEventsPerMint: 250,
        maxEventsPerSession: 1000,
        maxSessionCostSol: 0.001
      },
      pumpPortal: {
        apiKey: secret,
        maxTokenTradeEventsPerMint: 250,
        maxTokenTradeEventsPerSession: 1000,
        maxTokenTradeSubscriptions: 3,
        subscribeMigration: false,
        subscribeNewToken: false,
        wsUrl: "wss://example.test/pumpportal"
      },
      pumpPortalDataWallet: {
        apiKeyConfigured: true,
        publicKey: "So11111111111111111111111111111111111111112",
        rpcHttpUrl: "http://localhost:8899",
        solanaClient: createDataWalletSolanaClient(0.05)
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    for (const url of [
      "/health",
      "/actual-data/status",
      "/metered-launch-data/status",
      "/pumpportal/data-wallet/status"
    ]) {
      const response = await server.app.inject({
        method: "GET",
        url
      });
      const body = response.json() as unknown;

      expect(response.statusCode).toBe(200);
      expect(JSON.stringify(body)).not.toContain(secret);
      expect(findDisallowedApiKeyFields(body)).toEqual([]);
    }
  });

  it("GET /runtime/status reports local paper-only controls without secrets", async () => {
    const secret = "test-secret-api-key-value";
    server = createApiServer({
      dataFeed: "pumpportal",
      logLevel: false,
      pumpPortal: {
        apiKey: secret,
        subscribeMigration: true,
        subscribeNewToken: true,
        wsUrl: "wss://example.test/pumpportal"
      },
      pumpPortalDataWallet: {
        apiKeyConfigured: true,
        publicKey: "So11111111111111111111111111111111111111112"
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/runtime/status"
    });
    const body = response.json() as {
      api: { online: boolean; wsOnline: boolean };
      controlPlaneEnabled: boolean;
      dataWallet: { apiKeyConfigured: boolean; publicKey: string | null };
      meteredPriceAction: {
        blockers: string[];
        state: string;
      };
      liveDiscovery: { connected: boolean; reasonCodes: string[] };
      localOnly: boolean;
      paperOnly: boolean;
      runtime: { paperOnly: boolean; tradingDisabled: boolean };
      safety: {
        accountTradesEnabled: boolean;
        lightningExecutionEnabled: boolean;
        liveTradingEnabled: boolean;
        privateKeysLoaded: boolean;
      };
      tradingWallet: {
        liveTradingAllowed: boolean;
        manualArmed: boolean;
        purpose: string;
      };
      tradingDisabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.controlPlaneEnabled).toBe(true);
    expect(body.localOnly).toBe(true);
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.api.online).toBe(true);
    expect(body.api.wsOnline).toBe(true);
    expect(body.runtime.paperOnly).toBe(true);
    expect(body.runtime.tradingDisabled).toBe(true);
    expect(body.dataWallet.apiKeyConfigured).toBe(true);
    expect(body.dataWallet.publicKey).toBe(
      "So11111111111111111111111111111111111111112"
    );
    expect(body.meteredPriceAction.state).toEqual(expect.any(String));
    expect(body.tradingWallet.purpose).toBe("future_lightning_execution");
    expect(body.tradingWallet.liveTradingAllowed).toBe(false);
    expect(body.tradingWallet.manualArmed).toBe(false);
    expect(body.safety.accountTradesEnabled).toBe(false);
    expect(body.safety.lightningExecutionEnabled).toBe(false);
    expect(body.safety.liveTradingEnabled).toBe(false);
    expect(body.safety.privateKeysLoaded).toBe(false);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(findDisallowedApiKeyFields(body)).toEqual([]);
  });

  it("runtime POST controls reject non-local requests", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      headers: {
        "x-forwarded-for": "203.0.113.10"
      },
      method: "POST",
      url: "/runtime/live-discovery/stop"
    });
    const body = response.json() as {
      error: string;
      paperOnly: boolean;
      tradingDisabled: boolean;
    };

    expect(response.statusCode).toBe(403);
    expect(body.error).toBe("CONTROL_REQUEST_DENIED_NON_LOCAL");
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
  });

  it("central guard rejects every non-local mutation while keeping reads available", async () => {
    server = createTestServer();

    const readResponse = await server.app.inject({
      headers: { origin: "https://unapproved.example" },
      method: "GET",
      url: "/health"
    });
    const nonLocalMutation = await server.app.inject({
      headers: { "x-forwarded-for": "203.0.113.10" },
      method: "POST",
      url: "/tokens/resolve",
      payload: { mint: "INVALID_MINT" }
    });
    const unapprovedOriginMutation = await server.app.inject({
      headers: { origin: "https://unapproved.example" },
      method: "POST",
      url: "/tokens/resolve",
      payload: { mint: "INVALID_MINT" }
    });

    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.headers["access-control-allow-origin"]).toBeUndefined();
    expect(nonLocalMutation.statusCode).toBe(403);
    expect(unapprovedOriginMutation.statusCode).toBe(403);
    expect(unapprovedOriginMutation.json()).toMatchObject({
      error: "UNAPPROVED_CONTROL_ORIGIN"
    });

    const auditResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/operator-actions?limit=10"
    });
    const audit = auditResponse.json() as {
      actions: Array<{
        outcome: string;
        safeParameters: Record<string, unknown>;
        target: string;
      }>;
    };

    expect(
      audit.actions.filter((action) => action.outcome === "blocked")
    ).toHaveLength(2);
    expect(
      audit.actions.every((action) => action.target === "/tokens/resolve")
    ).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("INVALID_MINT");
  });

  it("GET /runtime/contracts publishes ownership and conservative caps", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/runtime/contracts"
    });
    const body = response.json() as {
      configuration: { driftDetected: boolean };
      ownership: Record<string, string>;
      roadmap: {
        canonicalOneSecondTimeseries: string;
        calibrationSessionCapture: string;
        derivativeCorrectness: string;
        derivativeStrengthNormalization: string;
        signalCalibrationFramework: string;
        rollingNewestTokenScheduler: string;
        schedulerMutationApplied: boolean;
      };
      safety: { apiHost: string; tradingDisabled: boolean };
      subscriptionPolicy: {
        configured: {
          maxConcurrentMints: number;
          maxProtectedMints: number;
          maxEventsPerMint: number;
          maxEventsPerSession: number;
          maxSessionCostSol: number;
          maxUiSessionCostSol: number;
          reservedNewestSlots: number;
          schedulerQueueLimit: number;
          schedulerQueueMaxAgeMs: number;
        };
      };
      timeseries: {
        bucketMs: number;
        canonical: boolean;
        retentionMs: number;
      };
      derivatives: {
        canonical: boolean;
        method: string;
        firstDerivativeMinSamples: number;
        secondDerivativeMinSamples: number;
      };
      derivativeStrength: {
        canonical: boolean;
        method: string;
        minimumRobustCohortSize: number;
        confidenceAppliedToSignalScore: boolean;
        calibrationStatus: string;
      };
      signalCalibration: {
        strategyVersion: string;
        policyStatus: string;
        evaluatorStatus: string;
        outcomeCaptureStatus: string;
        outcomeCaptureOwner: string;
        automaticThresholdActivation: boolean;
      };
      sessionCapture: {
        implementationStatus: string;
        activationMode: string;
        defaultActive: boolean;
        outcomePolicy: string;
        futureDataRejected: boolean;
        automaticThresholdActivation: boolean;
        tradingDisabled: boolean;
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.ownership).toMatchObject({
      discoveryAndLaunchScoring: "LaunchScannerService",
      canonicalDerivatives: "@axi/derivatives",
      canonicalDerivativeStrength: "@axi/derivative-strength",
      signalCalibration: "@axi/signal-calibration",
      calibrationSessionCapture: "@axi/session-capture",
      canonicalTimeseries: "@axi/timeseries",
      subscriptionTransport: "ActualDataService",
      subscriptionPolicy: "MeteredLaunchDataService",
      trackingScheduler: "@axi/tracking-scheduler",
      trackingCommandRoute: "/metered-launch-data/track"
    });
    expect(body.subscriptionPolicy.configured).toEqual({
      maxConcurrentMints: 3,
      reservedNewestSlots: 1,
      maxProtectedMints: 2,
      schedulerQueueLimit: 50,
      schedulerQueueMaxAgeMs: 30_000,
      maxEventsPerMint: 250,
      maxEventsPerSession: 1000,
      maxSessionCostSol: 0.001,
      maxUiSessionCostSol: 0.001
    });
    expect(body.configuration.driftDetected).toBe(false);
    expect(body.roadmap.canonicalOneSecondTimeseries).toBe("implemented");
    expect(body.roadmap.derivativeCorrectness).toBe("implemented");
    expect(body.roadmap.derivativeStrengthNormalization).toBe("implemented");
    expect(body.roadmap.signalCalibrationFramework).toBe("implemented");
    expect(body.roadmap.calibrationSessionCapture).toBe("implemented");
    expect(body.roadmap.rollingNewestTokenScheduler).toBe("implemented");
    expect(body.roadmap.schedulerMutationApplied).toBe(false);
    expect(body.timeseries).toMatchObject({
      bucketMs: 1000,
      canonical: true,
      retentionMs: 300_000
    });
    expect(body.derivatives).toMatchObject({
      canonical: true,
      method: "event_time_finite_difference",
      firstDerivativeMinSamples: 2,
      secondDerivativeMinSamples: 3
    });
    expect(body.derivativeStrength).toMatchObject({
      canonical: true,
      method: "hybrid_absolute_robust_age_cohort",
      minimumRobustCohortSize: 5,
      confidenceAppliedToSignalScore: false,
      calibrationStatus: "pending"
    });
    expect(body.signalCalibration).toMatchObject({
      strategyVersion: "launch-derivative-reference-v1",
      policyStatus: "reference_only",
      evaluatorStatus: "implemented",
      outcomeCaptureStatus: "implemented",
      outcomeCaptureOwner: "@axi/session-capture",
      automaticThresholdActivation: false,
      tradingDisabled: true
    });
    expect(body.sessionCapture).toMatchObject({
      implementationStatus: "implemented",
      activationMode: "manual_local_only",
      defaultActive: false,
      outcomePolicy: "first_real_bucket_at_horizon_with_bounded_lag",
      futureDataRejected: true,
      automaticThresholdActivation: false,
      tradingDisabled: true
    });
    expect(body.safety.apiHost).toBe("127.0.0.1");
    expect(body.safety.tradingDisabled).toBe(true);
  });

  it("evaluates versioned calibration observations without activating thresholds", async () => {
    server = createTestServer();

    const runtimeResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/signal-calibration"
    });
    expect(runtimeResponse.json()).toMatchObject({
      canonicalPolicy: true,
      strategyVersion: "launch-derivative-reference-v1",
      policyStatus: "reference_only",
      evaluatorStatus: "implemented",
      outcomeCaptureStatus: "implemented",
      outcomeCaptureOwner: "@axi/session-capture",
      automaticThresholdActivation: false,
      tradingDisabled: true
    });

    const evaluationResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/signal-calibration/evaluate",
      payload: {
        observations: [
          {
            observationId: "train-1",
            partition: "train",
            signalAt: "2026-01-01T00:00:00.000Z",
            outcomeAt: "2026-01-01T00:01:00.000Z",
            score: 80,
            targetReached: true,
            forwardReturnPct: 5,
            estimatedCostPct: 1
          },
          {
            observationId: "validation-1",
            partition: "validation",
            signalAt: "2026-01-01T00:02:00.000Z",
            outcomeAt: "2026-01-01T00:03:00.000Z",
            score: 80,
            targetReached: true,
            forwardReturnPct: 4,
            estimatedCostPct: 1
          }
        ],
        thresholdCandidates: [75]
      }
    });
    expect(evaluationResponse.statusCode).toBe(200);
    expect(evaluationResponse.json()).toMatchObject({
      evaluationStatus: "insufficient_evidence",
      trainingCandidate: null,
      candidateValidation: null,
      automaticThresholdActivation: false,
      calibrated: false,
      tradingDisabled: true
    });
  });

  it("runs a manual calibration capture session and exports its manifest", async () => {
    server = createApiServer({
      allowMockData: true,
      dataFeed: "mock",
      dataFeedMode: "mock",
      logLevel: false,
      mockFeedEnabled: true,
      paperAutoOrder: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const initialStatus = await server.app.inject({
      method: "GET",
      url: "/runtime/session-capture"
    });
    expect(initialStatus.json()).toMatchObject({
      active: false,
      observationCount: 0,
      contract: {
        activationMode: "manual_local_only",
        defaultActive: false,
        automaticThresholdActivation: false
      },
      tradingDisabled: true
    });

    const startResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/session-capture/start",
      payload: {
        partition: "validation",
        config: { horizonMs: 10_000, maxOutcomeLagMs: 1_000 }
      }
    });
    const started = startResponse.json() as {
      created: boolean;
      session: { sessionId: string };
    };
    expect(startResponse.statusCode).toBe(200);
    expect(started).toMatchObject({
      created: true,
      session: {
        partition: "validation",
        status: "active",
        tradingDisabled: true
      }
    });

    const conflictingStartResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/session-capture/start",
      payload: { partition: "train" }
    });
    expect(conflictingStartResponse.statusCode).toBe(409);
    expect(conflictingStartResponse.json()).toMatchObject({
      error: "CALIBRATION_CAPTURE_SESSION_ALREADY_ACTIVE",
      tradingDisabled: true
    });

    const observationsResponse = await server.app.inject({
      method: "GET",
      url: `/runtime/session-capture/sessions/${started.session.sessionId}/observations`
    });
    expect(observationsResponse.json()).toMatchObject({
      sessionId: started.session.sessionId,
      observations: [],
      tradingDisabled: true
    });

    const exportResponse = await server.app.inject({
      method: "GET",
      url: `/runtime/session-capture/sessions/${started.session.sessionId}/export?format=json`
    });
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers["content-disposition"]).toContain(
      `${started.session.sessionId}.json`
    );
    expect(exportResponse.json()).toMatchObject({
      manifest: {
        captureSessionId: started.session.sessionId,
        partition: "validation",
        observationCount: 0,
        automaticThresholdActivation: false,
        tradingDisabled: true
      },
      observations: []
    });

    const stopResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/session-capture/stop",
      payload: { reason: "api_test_complete" }
    });
    expect(stopResponse.json()).toMatchObject({
      stopped: true,
      session: { status: "stopped", stopReason: "api_test_complete" }
    });

    const missingResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/session-capture/sessions/missing"
    });
    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toMatchObject({
      error: "CALIBRATION_CAPTURE_SESSION_NOT_FOUND",
      tradingDisabled: true
    });
  });

  it("reports the rolling scheduler policy and current-session decisions", async () => {
    server = createTestServer();

    const response = await server.app.inject({
      method: "GET",
      url: "/runtime/scheduler"
    });
    const body = response.json() as {
      decisions: unknown[];
      scheduler: {
        active: boolean;
        enabled: boolean;
        implemented: boolean;
        queuedCandidateCount: number;
        reservedNewestSlots: number;
        trackingMutationCount: number;
      };
      tradingDisabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.scheduler.implemented).toBe(true);
    expect(body.scheduler.enabled).toBe(true);
    expect(body.scheduler.active).toBe(false);
    expect(body.scheduler.reservedNewestSlots).toBe(1);
    expect(body.scheduler.queuedCandidateCount).toBe(0);
    expect(body.scheduler.trackingMutationCount).toBe(0);
    expect(body.decisions).toEqual([]);
    expect(body.tradingDisabled).toBe(true);

    const decisionsResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/scheduler/decisions?limit=10"
    });

    expect(decisionsResponse.statusCode).toBe(200);
    expect(decisionsResponse.json()).toMatchObject({ decisions: [] });
  });

  it("reports capacity without changing scheduler policy and persists explicit snapshots", async () => {
    server = createTestServer();

    const reportResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/capacity"
    });
    const report = reportResponse.json() as {
      observation: { launchCount: number; windowMs: number };
      policy: { schedulerMutationApplied: boolean };
      scenarios: unknown[];
      slots: {
        concurrentSlots: number;
        initialCoverageRatio: number;
      };
      tradingDisabled: boolean;
    };

    expect(reportResponse.statusCode).toBe(200);
    expect(report.observation.windowMs).toBeGreaterThan(0);
    expect(report.slots.concurrentSlots).toBe(3);
    expect(report.slots.initialCoverageRatio).toBeGreaterThanOrEqual(0);
    expect(report.scenarios).toHaveLength(9);
    expect(report.policy.schedulerMutationApplied).toBe(false);
    expect(report.tradingDisabled).toBe(true);

    const snapshotResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/capacity/snapshot"
    });
    expect(snapshotResponse.statusCode).toBe(200);

    const snapshotsResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/capacity/snapshots"
    });
    const snapshots = snapshotsResponse.json() as {
      snapshots: Array<{
        runtimeSessionId: string;
        initialCoverageRatio: number;
      }>;
    };

    expect(snapshots.snapshots).toHaveLength(1);
    expect(snapshots.snapshots[0]?.initialCoverageRatio).toBe(
      report.slots.initialCoverageRatio
    );
  });

  it("a new runtime session never restores a previous paid-data ACK", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      dataWalletBalanceSol: 0.05,
      enabled: true
    });

    const ackResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/ack-session",
      payload: {
        ackCost: true,
        maxSessionCostSol: 0.001,
        maxConcurrentMints: 3,
        maxEventsPerSession: 1000
      }
    });
    expect(ackResponse.statusCode).toBe(200);
    expect(server.meteredLaunchData.getStatus().sessionAcknowledgedCost).toBe(
      true
    );

    await server.close();
    server = undefined;
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      dataWalletBalanceSol: 0.05,
      enabled: true
    });

    expect(server.meteredLaunchData.getStatus()).toMatchObject({
      acknowledgedCost: false,
      sessionAcknowledgedCost: false
    });
    const sessionsResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/sessions"
    });
    const sessionsBody = sessionsResponse.json() as {
      currentSessionId: string;
      sessions: Array<{ sessionId: string; paidDataArmed: boolean }>;
    };
    const current = sessionsBody.sessions.find(
      (session) => session.sessionId === sessionsBody.currentSessionId
    );
    expect(current?.paidDataArmed).toBe(false);
  });

  it("runtime live discovery stop is idempotent", async () => {
    server = createApiServer({
      dataFeed: "pumpportal",
      logLevel: false,
      pumpPortal: {
        subscribeMigration: true,
        subscribeNewToken: true,
        wsUrl: "wss://example.test/pumpportal"
      },
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const first = await server.app.inject({
      method: "POST",
      url: "/runtime/live-discovery/stop"
    });
    const second = await server.app.inject({
      method: "POST",
      url: "/runtime/live-discovery/stop"
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      ok: true,
      paperOnly: true,
      tradingDisabled: true
    });
    expect(second.json()).toMatchObject({
      ok: true,
      paperOnly: true,
      tradingDisabled: true
    });
  });

  it("runtime metered launch data start refuses without ACK", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      dataWalletBalanceSol: 0.05,
      enabled: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/start"
    });
    const body = response.json() as {
      ok: boolean;
      reasonCodes: string[];
      paperOnly: boolean;
      tradingDisabled: boolean;
    };

    expect(response.statusCode).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.reasonCodes).toContain("METERED_DATA_ACK_MISSING");
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
  });

  it("runtime status reports ACK missing without inventing wallet blockers", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      dataWalletBalanceSol: 0.05,
      enabled: true,
      liveDiscoveryConnected: true
    });

    await server.app.inject({
      method: "POST",
      url: "/runtime/data-wallet/refresh"
    });
    const response = await server.app.inject({
      method: "GET",
      url: "/runtime/status"
    });
    const body = response.json() as {
      meteredPriceAction: {
        blockers: string[];
        state: string;
        warnings: string[];
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.meteredPriceAction.state).toBe("ARM_REQUIRED");
    expect(body.meteredPriceAction.blockers).toEqual([
      "METERED_DATA_ACK_MISSING"
    ]);
    expect(body.meteredPriceAction.warnings).toEqual([]);
  });

  it("runtime status treats unknown data-wallet balance as a warning", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      enabled: true,
      liveDiscoveryConnected: true
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/runtime/status"
    });
    const body = response.json() as {
      meteredPriceAction: {
        blockers: string[];
        warnings: string[];
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.meteredPriceAction.blockers).not.toContain(
      "METERED_DATA_WALLET_NOT_READY"
    );
    expect(body.meteredPriceAction.blockers).not.toContain(
      "METERED_DATA_WALLET_LOW"
    );
    expect(body.meteredPriceAction.warnings).toContain(
      "METERED_DATA_BALANCE_UNKNOWN"
    );
  });

  it("runtime session ACK arms then starts metered launch data with mocked gates", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      dataWalletBalanceSol: 0.05,
      enabled: true,
      liveDiscoveryConnected: true
    });

    const ackResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/ack-session",
      payload: {
        ackCost: true,
        maxSessionCostSol: 0.001,
        maxConcurrentMints: 2,
        maxEventsPerSession: 100
      }
    });
    const ackBody = ackResponse.json() as {
      status: {
        meteredPriceAction: {
          canStart: boolean;
          sessionAck: boolean;
          state: string;
        };
      };
    };
    const startResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/start"
    });
    const startBody = startResponse.json() as {
      status: {
        meteredPriceAction: {
          active: boolean;
          maxConcurrentMints: number;
          maxEventsPerSession: number;
          sessionCostCapSol: number;
          state: string;
        };
      };
    };

    expect(ackResponse.statusCode).toBe(200);
    expect(ackBody.status.meteredPriceAction.sessionAck).toBe(true);
    expect(ackBody.status.meteredPriceAction.canStart).toBe(true);
    expect(ackBody.status.meteredPriceAction.state).toBe("READY");
    expect(startResponse.statusCode).toBe(200);
    expect(startBody.status.meteredPriceAction.state).toBe("ACTIVE");
    expect(startBody.status.meteredPriceAction.active).toBe(true);
    expect(startBody.status.meteredPriceAction.maxConcurrentMints).toBe(2);
    expect(startBody.status.meteredPriceAction.maxEventsPerSession).toBe(100);
    expect(startBody.status.meteredPriceAction.sessionCostCapSol).toBe(0.001);
  });

  it("runtime session ACK rejects caps above configured ceilings", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      dataWalletBalanceSol: 0.05,
      enabled: true,
      liveDiscoveryConnected: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/ack-session",
      payload: {
        ackCost: true,
        maxSessionCostSol: 0.01,
        maxConcurrentMints: 2,
        maxEventsPerSession: 100
      }
    });
    const body = response.json() as {
      error: string;
      status: {
        meteredPriceAction: {
          sessionAck: boolean;
        };
      };
    };

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe("METERED_LAUNCH_DATA_SESSION_COST_EXCEEDS_CONFIG");
    expect(body.status.meteredPriceAction.sessionAck).toBe(false);
    expect(server.actualData.getStatus().acknowledgedMetered).toBe(false);
  });

  it("runtime clear session ACK resets metered start readiness", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      dataWalletBalanceSol: 0.05,
      enabled: true,
      liveDiscoveryConnected: true
    });

    await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/ack-session",
      payload: {
        ackCost: true,
        maxSessionCostSol: 0.001,
        maxConcurrentMints: 2,
        maxEventsPerSession: 100
      }
    });

    const clearResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/clear-session-ack"
    });
    const body = clearResponse.json() as {
      status: {
        meteredPriceAction: {
          canStart: boolean;
          sessionAck: boolean;
          state: string;
        };
      };
    };

    expect(clearResponse.statusCode).toBe(200);
    expect(body.status.meteredPriceAction.sessionAck).toBe(false);
    expect(body.status.meteredPriceAction.canStart).toBe(false);
    expect(body.status.meteredPriceAction.state).toBe("ARM_REQUIRED");
  });

  it("runtime stop unsubscribes metered launch-data subscriptions", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      dataWalletBalanceSol: 0.05,
      enabled: true,
      liveDiscoveryConnected: true
    });
    const event = createPumpPortalEvent({
      mint: "So11111111111111111111111111111111111111112"
    });

    server.emitFeedEvent(event);
    await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/ack-session",
      payload: {
        ackCost: true,
        maxSessionCostSol: 0.001,
        maxConcurrentMints: 2,
        maxEventsPerSession: 100
      }
    });
    const startResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/start"
    });
    const trackResponse = await server.app.inject({
      method: "POST",
      url: "/metered-launch-data/track",
      payload: {
        mint: event.candidate.mint,
        reason: "test"
      }
    });

    expect(startResponse.statusCode).toBe(200);
    expect(trackResponse.statusCode).toBe(200);
    expect(server.meteredLaunchData.getTrackedMints()).toContain(
      event.candidate.mint
    );

    const stopResponse = await server.app.inject({
      method: "POST",
      url: "/runtime/metered-launch-data/stop"
    });
    const stopBody = stopResponse.json() as {
      status: {
        meteredPriceAction: {
          state: string;
          trackedMintCount: number;
        };
      };
    };

    expect(stopResponse.statusCode).toBe(200);
    expect(stopBody.status.meteredPriceAction.state).toBe("ARM_REQUIRED");
    expect(stopBody.status.meteredPriceAction.trackedMintCount).toBe(0);
    expect(server.meteredLaunchData.getTrackedMints()).toEqual([]);
    expect(
      server.actualData
        .getSubscriptions()
        .filter((subscription) => subscription.status === "subscribed")
    ).toEqual([]);
  });

  it("runtime data-wallet refresh returns public status only", async () => {
    const secret = "test-secret-api-key-value";
    server = createApiServer({
      dataFeed: "pumpportal",
      logLevel: false,
      pumpPortal: {
        apiKey: secret,
        subscribeMigration: false,
        subscribeNewToken: false,
        wsUrl: "wss://example.test/pumpportal"
      },
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
      url: "/runtime/data-wallet/refresh"
    });
    const body = response.json() as {
      status: {
        dataWallet: {
          apiKeyConfigured: boolean;
          balanceSol: number | null;
          publicKey: string | null;
        };
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.status.dataWallet.apiKeyConfigured).toBe(true);
    expect(body.status.dataWallet.balanceSol).toBe(0.05);
    expect(body.status.dataWallet.publicKey).toBe(
      "So11111111111111111111111111111111111111112"
    );
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(findDisallowedApiKeyFields(body)).toEqual([]);
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

  it("POST /live/trade-tracking/track is deprecated when ACK is missing", async () => {
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

    expect(response.statusCode).toBe(410);
    expect(body.error).toBe("TRACKING_ROUTE_DEPRECATED");
  });

  it("POST /live/trade-tracking/track cannot mutate the PumpPortal stream", async () => {
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
    const body = response.json() as { error: string; paperOnly: boolean };

    expect(response.statusCode).toBe(410);
    expect(body.error).toBe("TRACKING_ROUTE_DEPRECATED");
    expect(body.paperOnly).toBe(true);
    expect(server.actualData.getSubscriptions()).toEqual([]);
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

  it("GET /launch/status reports PumpPortal-first disabled tracking defaults", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/launch/status"
    });
    const body = response.json() as {
      runtimeMode: string;
      liveDiscoveryEnabled: boolean;
      launchTrackingEnabled: boolean;
      launchTrackingAcknowledgedMetered: boolean;
      paperOnly: boolean;
      reasonCodes: string[];
      tradingDisabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.runtimeMode).toBe("pumpportal_first");
    expect(body.liveDiscoveryEnabled).toBe(true);
    expect(body.launchTrackingEnabled).toBe(false);
    expect(body.launchTrackingAcknowledgedMetered).toBe(false);
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.reasonCodes).toContain("RUNTIME_PUMPPORTAL_FIRST");
    expect(body.reasonCodes).toContain("PUMPPORTAL_LAUNCH_TRACKING_DISABLED");
  });

  it("PumpPortal discovery immediately creates launch candidates and score snapshots", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(createPumpPortalEvent());

    const cardsResponse = await server.app.inject({
      method: "GET",
      url: "/launch/cards"
    });
    const candidatesResponse = await server.app.inject({
      method: "GET",
      url: "/launch/candidates"
    });
    const statsResponse = await server.app.inject({
      method: "GET",
      url: "/storage/stats"
    });
    const cards = cardsResponse.json() as Array<{
      mint: string;
      snapshot: {
        phase: string;
        reasonCodes: string[];
        score: number;
      };
    }>;
    const candidates = candidatesResponse.json() as {
      current: unknown[];
      persisted: unknown[];
    };
    const stats = statsResponse.json() as {
      launchCandidateCount: number;
      launchScoreSnapshotCount: number;
    };

    expect(cardsResponse.statusCode).toBe(200);
    expect(candidatesResponse.statusCode).toBe(200);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.snapshot.phase).toBe("discovery_only");
    expect(cards[0]?.snapshot.score).toBe(0);
    expect(cards[0]?.snapshot.reasonCodes).toContain("LAUNCH_DISCOVERY_ONLY");
    expect(candidates.current).toHaveLength(1);
    expect(candidates.persisted).toHaveLength(1);
    expect(stats.launchCandidateCount).toBe(1);
    expect(stats.launchScoreSnapshotCount).toBe(1);
  });

  it("GET /launch/cost estimates metered tracking budgets", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/launch/cost?tokensPerHour=500&avgEventsPerToken=20"
    });
    const body = response.json() as {
      estimatedHourlyCostSol: number;
      estimatedSessionCostSol: number;
      paperOnly: boolean;
      reasonCodes: string[];
      tradingDisabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.estimatedHourlyCostSol).toBeGreaterThan(0);
    expect(body.estimatedSessionCostSol).toBeGreaterThan(0);
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.reasonCodes).toContain("PUMPPORTAL_LAUNCH_COST_ESTIMATE");
  });

  it("POST /launch/track is deprecated in favor of canonical metered tracking", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/launch/track",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        reason: "test"
      }
    });
    const body = response.json() as { error: string; paperOnly: boolean };

    expect(response.statusCode).toBe(410);
    expect(body.error).toBe("TRACKING_ROUTE_DEPRECATED");
    expect(body.paperOnly).toBe(true);
  });

  it("GET /metered-launch-data/status is disabled by default", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/metered-launch-data/status"
    });
    const body = response.json() as {
      enabled: boolean;
      ready: boolean;
      reasonCodes: string[];
      tradingDisabled: boolean;
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.ready).toBe(false);
    expect(body.reasonCodes).toContain("METERED_LAUNCH_DATA_DISABLED");
    expect(body.tradingDisabled).toBe(true);
  });

  it("POST /metered-launch-data/track blocks without ACK", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: false,
      enabled: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/metered-launch-data/track",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        reason: "test"
      }
    });
    const body = response.json() as {
      error: string;
      status: {
        acknowledgedCost: boolean;
        reasonCodes: string[];
      };
    };

    expect(response.statusCode).toBe(409);
    expect(body.error).toBe("METERED_LAUNCH_DATA_ACK_MISSING");
    expect(body.status.acknowledgedCost).toBe(false);
    expect(body.status.reasonCodes).toContain(
      "METERED_LAUNCH_DATA_ACK_MISSING"
    );
  });

  it("POST /metered-launch-data/track accepts mocked gates", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: true,
      enabled: true
    });

    const response = await server.app.inject({
      method: "POST",
      url: "/metered-launch-data/track",
      payload: {
        mint: "So11111111111111111111111111111111111111112",
        reason: "test"
      }
    });
    const body = response.json() as {
      tracking: {
        status: string;
      };
      status: {
        trackedMintCount: number;
      };
    };

    expect(response.statusCode).toBe(200);
    expect(body.tracking.status).toBe("tracking");
    expect(body.status.trackedMintCount).toBe(1);
  });

  it("token trades update metered launch data on live cards", async () => {
    server = createMeteredLaunchDataTestServer({
      acknowledgedCost: true,
      enabled: true
    });
    const trackedMint = "So11111111111111111111111111111111111111112";
    const baseEvent = createPumpPortalEvent();
    const event: TokenCreatedEvent = {
      ...baseEvent,
      candidate: {
        ...baseEvent.candidate,
        id: {
          chain: "solana",
          mint: trackedMint
        },
        mint: trackedMint
      }
    };

    server.emitFeedEvent(event);
    const trackResponse = await server.app.inject({
      method: "POST",
      url: "/metered-launch-data/track",
      payload: {
        mint: event.candidate.mint,
        reason: "test"
      }
    });
    server.emitFeedEvent(createPumpPortalTradeEvent(event.candidate.mint));

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/live-token-cards"
    });
    const cards = response.json() as LiveTokenCardViewModel[];
    const card = cards.find((item) => item.mint === event.candidate.mint);

    expect(trackResponse.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(card?.meteredLaunchDataState).toBe("tracking");
    expect(card?.priceActionSource).toBe("PumpPortal subscribeTokenTrade");
    expect(card?.realTradeEventCount).toBe(1);
    expect(card?.realPriceActionReady).toBe(true);
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

  it("GET /ui/momentum-rows returns an empty array with no live tokens", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const rows = response.json() as MomentumScannerRow[];

    expect(response.statusCode).toBe(200);
    expect(rows).toEqual([]);
  });

  it("GET /ui/momentum-rows returns a discovery-only scanner row", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(createPumpPortalEvent());

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const rows = response.json() as MomentumScannerRow[];
    const row = rows[0];

    expect(response.statusCode).toBe(200);
    expect(rows).toHaveLength(1);
    expect(row?.mint).toBe(createPumpPortalEvent().candidate.mint);
    expect(row?.displayName).toBe("PORTAL Portal Token");
    expect(row?.dataQualityLabel).toBe("discovery_only");
    expect(row?.sparkline.direction).toBe("unavailable");
    expect(row?.sparkline.source).toBe("unavailable");
    expect(row?.sparkline.label).toBe("unavailable");
    expect(row?.sparkline.reasonCodes).toContain("INSUFFICIENT_PRICE_SAMPLES");
    expect(row?.priceSol).toBeNull();
    expect(row?.volume10sSol).toBeNull();
    expect(row?.marketCapUsd).toBeNull();
    expect(row?.liquidityUsd).toBeNull();
    expect(row?.missingCriticalFields).toContain("price");
    expect(row?.unavailableFields).toContain("MARKET_CAP_UNAVAILABLE");
    expect(row?.unavailableFields).toContain("LIQUIDITY_UNAVAILABLE");
    expect(row?.unavailableFields).toContain(
      "INSUFFICIENT_SAMPLES_FOR_DERIVATIVE"
    );
    expect(row?.missingFieldReasons.price).toContain(
      "TOKEN_TRADE_TRACKING_DISABLED"
    );
    expect(row?.signalDisplay.label).toBe("DISCOVERY");
    expect(row?.signalDisplay.buyReadyPaper).toBe(false);
    expect(row?.dataQuality.discoveryOnly).toBe(true);
  });

  it("GET /ui/momentum-rows includes price, volume, and flow for trade-tracked tokens", async () => {
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
      url: "/ui/momentum-rows"
    });
    const rows = response.json() as MomentumScannerRow[];
    const row = rows[0];

    expect(response.statusCode).toBe(200);
    expect(row?.priceSol).toBe(0.00042);
    expect(row?.volume10sSol).toBe(1.5);
    expect(row?.buyCount10s).toBe(1);
    expect(row?.sellCount10s).toBe(0);
    expect(row?.uniqueBuyers10s).toBe(1);
    expect(row?.realTradeEventCount).toBe(1);
    expect(row?.dataQualityLabel).toBe("metered_tracking");
  });

  it("GET /ui/momentum-rows exposes a normalized hard-reject signal display", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(
      createPumpPortalEvent({
        mint: "So11111111111111111111111111111111111111112"
      })
    );
    const hardReject = createHardRejectRiskSnapshot(
      server,
      "So11111111111111111111111111111111111111112"
    );
    server.candidates.updateRisk(
      "So11111111111111111111111111111111111111112",
      hardReject
    );
    server.candidates.evaluateCandidate(
      "So11111111111111111111111111111111111111112"
    );

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const row = (response.json() as MomentumScannerRow[])[0];

    expect(response.statusCode).toBe(200);
    expect(row?.hardReject).toBe(true);
    expect(row?.signalDisplay.label).toBe("REJECT");
    expect(row?.signalDisplay.color).toBe("danger");
    expect(row?.signalDisplay.buyReadyPaper).toBe(false);
  });

  it("GET /ui/momentum-rows exposes d1 but keeps d2 unavailable with two samples", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    const event = createPumpPortalEvent();
    server.emitFeedEvent(event);
    server.metrics.ingestTradeObservation({
      mint: event.candidate.mint,
      priceSol: 0.0004,
      quoteAsset: "SOL",
      side: "buy",
      symbol: event.candidate.symbol,
      timestamp: "2026-01-01T00:00:02.000Z",
      trader: "Buyer1111111111111111111111111111111111111",
      usableForMetrics: true,
      volumeSol: 1
    });
    server.metrics.ingestTradeObservation({
      mint: event.candidate.mint,
      priceSol: 0.0005,
      quoteAsset: "SOL",
      side: "buy",
      symbol: event.candidate.symbol,
      timestamp: "2026-01-01T00:00:04.000Z",
      trader: "Buyer2222222222222222222222222222222222222",
      usableForMetrics: true,
      volumeSol: 2
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const rows = response.json() as MomentumScannerRow[];
    const row = rows[0];

    expect(response.statusCode).toBe(200);
    expect(row?.sparkline.direction).toBe("up");
    expect(row?.sparkline.source).toBe("trade_samples");
    expect(row?.sparkline.label).toBe("trade samples");
    expect(row?.sparkline.points).toHaveLength(2);
    expect(row?.sparkline.priceChangePct).toBeGreaterThan(0);
    expect(row?.volumeVelocitySolPerSec).toEqual(expect.any(Number));
    expect(row?.volumeAccelerationSolPerSec2).toBeNull();
    expect(row?.priceVelocityPctPerSec).toEqual(expect.any(Number));
    expect(row?.buyerVelocityPerSec).toEqual(expect.any(Number));
    expect(row?.derivativeStrength.volume).toMatchObject({
      schemaVersion: 1,
      method: "hybrid_absolute_robust_age_cohort",
      cohortReady: false
    });
    expect(row?.derivativeStrength.volume.confidence.overall).toBeGreaterThan(
      0
    );
    expect(row?.unavailableFields).not.toContain(
      "INSUFFICIENT_SAMPLES_FOR_DERIVATIVE"
    );
    expect(row?.unavailableFields).toContain(
      "INSUFFICIENT_SAMPLES_FOR_SECOND_DERIVATIVE"
    );
    expect(findNonFiniteNumbers(row)).toEqual([]);
  });

  it("GET /ui/momentum-rows reports down and flat sparkline directions", async () => {
    const cases: Array<{
      expected: MomentumScannerRow["sparkline"]["direction"];
      mint: string;
      prices: [number, number];
    }> = [
      {
        expected: "down",
        mint: "PumpPortalDown1111111111111111111111111111",
        prices: [0.0005, 0.0004]
      },
      {
        expected: "flat",
        mint: "PumpPortalFlat1111111111111111111111111111",
        prices: [0.0004, 0.0004]
      }
    ];

    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });

    for (const testCase of cases) {
      server.emitFeedEvent(createPumpPortalEvent({ mint: testCase.mint }));
      server.metrics.ingestTradeObservation({
        mint: testCase.mint,
        priceSol: testCase.prices[0],
        quoteAsset: "SOL",
        side: "buy",
        symbol: "PORTAL",
        timestamp: "2026-01-01T00:00:02.000Z",
        trader: `${testCase.expected}-buyer-1`,
        usableForMetrics: true,
        volumeSol: 1
      });
      server.metrics.ingestTradeObservation({
        mint: testCase.mint,
        priceSol: testCase.prices[1],
        quoteAsset: "SOL",
        side: "buy",
        symbol: "PORTAL",
        timestamp: "2026-01-01T00:00:04.000Z",
        trader: `${testCase.expected}-buyer-2`,
        usableForMetrics: true,
        volumeSol: 1
      });
    }

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const rows = response.json() as MomentumScannerRow[];

    expect(response.statusCode).toBe(200);
    for (const testCase of cases) {
      expect(
        rows.find((row) => row.mint === testCase.mint)?.sparkline.direction
      ).toBe(testCase.expected);
    }
  });

  it("GET /ui/momentum-rows exposes PumpPortal SOL market fields without inventing USD", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(
      createPumpPortalEvent({
        candidate: {
          bondingCurveKey: "Curve1111111111111111111111111111111111",
          marketCapSol: 42,
          pool: "Pool11111111111111111111111111111111111",
          vSolInBondingCurve: 12.5,
          vTokensInBondingCurve: 1_000_000
        },
        raw: {
          bondingCurveKey: "Curve1111111111111111111111111111111111",
          marketCapSol: 42,
          pool: "Pool11111111111111111111111111111111111",
          vSolInBondingCurve: 12.5,
          vTokensInBondingCurve: 1_000_000
        }
      })
    );

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const row = (response.json() as MomentumScannerRow[])[0];

    expect(response.statusCode).toBe(200);
    expect(row?.marketCapSol).toBe(42);
    expect(row?.marketCapUsd).toBeNull();
    expect(row?.priceSol).toBe(0.0000125);
    expect(row?.priceSource).toBe("curve_marks");
    expect(row?.curve.curvePriceSol).toBe(0.0000125);
    expect(row?.curve.curveLiquiditySol).toBe(12.5);
    expect(row?.curve.curveMarketCapSol).toBe(42);
    expect(row?.curve.curveReasonCodes).toContain("CURVE_PRICE_DERIVED");
    expect(row?.curve.curveReasonCodes).toContain("CURVE_LIQUIDITY_DERIVED");
    expect(row?.curve.curveReasonCodes).toContain(
      "CURVE_MARKET_CAP_FROM_PAYLOAD"
    );
    expect(row?.vSolInBondingCurve).toBe(12.5);
    expect(row?.vTokensInBondingCurve).toBe(1_000_000);
    expect(row?.bondingCurveKey).toBe(
      "Curve1111111111111111111111111111111111"
    );
    expect(row?.poolAddress).toBe("Pool11111111111111111111111111111111111");
    expect(row?.unavailableFields).not.toContain("MARKET_CAP_UNAVAILABLE");
    expect(row?.unavailableFields).not.toContain("LIQUIDITY_UNAVAILABLE");
  });

  it("GET /ui/momentum-rows derives curve sparkline from reserve marks", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    const mint = "PumpPortalCurve111111111111111111111111111";
    server.emitFeedEvent(
      createPumpPortalEvent({
        mint,
        candidate: {
          marketCapSol: 30,
          vSolInBondingCurve: 10,
          vTokensInBondingCurve: 1_000_000
        },
        raw: {
          marketCapSol: 30,
          vSolInBondingCurve: 10,
          vTokensInBondingCurve: 1_000_000
        },
        timestamp: "2026-01-01T00:00:00.000Z"
      })
    );
    server.emitFeedEvent(
      createPumpPortalEvent({
        mint,
        candidate: {
          marketCapSol: 33,
          vSolInBondingCurve: 12,
          vTokensInBondingCurve: 1_000_000
        },
        raw: {
          marketCapSol: 33,
          vSolInBondingCurve: 12,
          vTokensInBondingCurve: 1_000_000
        },
        timestamp: "2026-01-01T00:00:08.000Z"
      })
    );

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const row = (response.json() as MomentumScannerRow[])[0];

    expect(response.statusCode).toBe(200);
    expect(row?.sparkline.source).toBe("curve_marks");
    expect(row?.sparkline.direction).toBe("up");
    expect(row?.sparkline.points).toHaveLength(2);
    expect(row?.dataQuality.hasCurveData).toBe(true);
    expect(findNonFiniteNumbers(row)).toEqual([]);
  });

  it("GET /ui/momentum-rows keeps invalid curve reserves unavailable", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(
      createPumpPortalEvent({
        candidate: {
          vSolInBondingCurve: 12.5,
          vTokensInBondingCurve: 10_000_000_000_000
        },
        raw: {
          vSolInBondingCurve: 12.5,
          vTokensInBondingCurve: 10_000_000_000_000
        }
      })
    );

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const row = (response.json() as MomentumScannerRow[])[0];

    expect(response.statusCode).toBe(200);
    expect(row?.curve.curvePriceSol).toBeNull();
    expect(row?.priceSol).toBeNull();
    expect(row?.curve.curveReasonCodes).toContain("CURVE_DECIMALS_UNKNOWN");
    expect(row?.curve.curveReasonCodes).toContain("CURVE_RESERVES_INVALID");
    expect(findNonFiniteNumbers(row)).toEqual([]);
  });

  it("GET /ui/momentum-rows passes safe imageUri and blocks unsafe imageUri", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(
      createPumpPortalEvent({
        candidate: {
          imageUri: "https://example.test/token.png"
        },
        mint: "PumpPortalImage111111111111111111111111111"
      })
    );
    server.emitFeedEvent(
      createPumpPortalEvent({
        candidate: {
          imageUri: "javascript:alert(1)"
        },
        mint: "PumpPortalUnsafe11111111111111111111111111"
      })
    );

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const rows = response.json() as MomentumScannerRow[];

    expect(response.statusCode).toBe(200);
    expect(rows.find((row) => row.mint.includes("Image"))?.imageUri).toBe(
      "https://example.test/token.png"
    );
    expect(
      rows.find((row) => row.mint.includes("Unsafe"))?.imageUri
    ).toBeNull();
  });

  it("GET /ui/momentum-rows preserves a migrated token as one row", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    const event = createPumpPortalEvent();
    server.emitFeedEvent(event);
    server.metrics.ingestTradeObservation({
      mint: event.candidate.mint,
      priceSol: 0.0004,
      quoteAsset: "SOL",
      side: "buy",
      symbol: event.candidate.symbol,
      timestamp: "2026-01-01T00:00:02.000Z",
      trader: "Buyer1111111111111111111111111111111111111",
      usableForMetrics: true,
      volumeSol: 1
    });
    server.emitFeedEvent(
      createPumpPortalEvent({
        mint: event.candidate.mint,
        raw: {
          newPool: "MigratedPool11111111111111111111111111111",
          txType: "migration"
        },
        rawSourceEventType: "migration",
        timestamp: "2026-01-01T00:00:20.000Z"
      })
    );

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const rows = response.json() as MomentumScannerRow[];
    const row = rows[0];

    expect(response.statusCode).toBe(200);
    expect(rows).toHaveLength(1);
    expect(row?.eventTypes).toEqual(["new_token", "migration"]);
    expect(row?.migrationStatus).toBe("migrated");
    expect(row?.migrationPool).toBe(
      "MigratedPool11111111111111111111111111111"
    );
    expect(row?.volume10sSol).toBe(1);
    expect(row?.adaptiveTrackingReasonCodes).toContain(
      "MIGRATED_TOKEN_VISIBLE"
    );
  });

  it("GET /ui/momentum-diagnostics explains missing scanner fields", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(createPumpPortalEvent());

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-diagnostics"
    });
    const diagnostics = response.json() as MomentumDiagnostics;

    expect(response.statusCode).toBe(200);
    expect(diagnostics.liveTokenCount).toBe(1);
    expect(diagnostics.rowsReturned).toBe(1);
    expect(diagnostics.tokensWithPrice).toBe(0);
    expect(diagnostics.tokensWithTradeData).toBe(0);
    expect(diagnostics.tokensWithMarketCap).toBe(0);
    expect(diagnostics.unavailableFieldCounts.MARKET_CAP_UNAVAILABLE).toBe(1);
    expect(diagnostics.missingCriticalFieldCounts.price).toBe(1);
    expect(diagnostics.topMissingReasons[0]?.reasonCode).toBe(
      "TOKEN_TRADE_TRACKING_DISABLED"
    );
    expect(diagnostics.recommendedNextActions).toContain(
      "ENABLE_METERED_TOKEN_TRADES_FOR_PRICE_ACTION"
    );
    expect(diagnostics.recommendedNextActions).toContain(
      "ENABLE_ENRICHMENT_FOR_MCAP_LIQUIDITY"
    );
  });

  it("GET /ui/momentum-diagnostics counts curve and SOL market fields", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.emitFeedEvent(
      createPumpPortalEvent({
        candidate: {
          marketCapSol: 50,
          vSolInBondingCurve: 20,
          vTokensInBondingCurve: 2_000_000
        },
        raw: {
          marketCapSol: 50,
          vSolInBondingCurve: 20,
          vTokensInBondingCurve: 2_000_000
        }
      })
    );

    const response = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-diagnostics"
    });
    const diagnostics = response.json() as MomentumDiagnostics;

    expect(response.statusCode).toBe(200);
    expect(diagnostics.rowsWithCurvePrice).toBe(1);
    expect(diagnostics.rowsWithCurveLiquidity).toBe(1);
    expect(diagnostics.rowsWithDexLiquidity).toBe(0);
    expect(diagnostics.rowsWithMarketCapSol).toBe(1);
    expect(diagnostics.rowsWithMarketCapUsd).toBe(0);
    expect(diagnostics.rowsWithDerivedCurveData).toBe(1);
    expect(diagnostics.topUnavailableReasons.length).toBeGreaterThan(0);
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
      clientKind: string;
      clientStatus: { connectionState: string; authMasked: string | null };
      providerStatus: { connectionState: string };
      connectionState: string;
      endpointMasked: string | null;
      authTokenMasked: string | null;
      subscriptionSummary: { transactionsEnabled: boolean };
      yellowstoneStatus: { connectionState: string };
      paperOnly: boolean;
      tradingDisabled: boolean;
      reasonCodes: string[];
    };
    const serialized = JSON.stringify(body);

    expect(response.statusCode).toBe(200);
    expect(body.managedStreamEnabled).toBe(false);
    expect(body.provider).toBe("yellowstone");
    expect(body.clientKind).toBe("yellowstone");
    expect(body.clientStatus.connectionState).toBe("disabled");
    expect(body.providerStatus.connectionState).toBe("disabled");
    expect(body.connectionState).toBe("disabled");
    expect(body.endpointMasked).toContain("token=****");
    expect(body.authTokenMasked).toBe("configured:16");
    expect(body.subscriptionSummary.transactionsEnabled).toBe(true);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("not-a-real-token");
    expect(body.yellowstoneStatus.connectionState).toBe("not_implemented");
    expect(body.paperOnly).toBe(true);
    expect(body.tradingDisabled).toBe(true);
    expect(body.reasonCodes).toContain("STREAM_NO_NETWORK_IN_TESTS");
  });

  it("GET /indexer/stream/config returns sanitized managed stream config", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath,
      indexer: {
        managedStream: {
          enabled: true,
          provider: "laserstream",
          laserstreamEndpoint:
            "https://laserstream.example.invalid?api_key=super-secret",
          laserstreamAuthToken: "not-a-real-key"
        }
      }
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/indexer/stream/config"
    });
    const body = response.json() as {
      provider: string;
      clientKind: string;
      configured: boolean;
      authConfigured: boolean;
      endpointMasked: string | null;
      authTokenMasked: string | null;
      reasonCodes: string[];
    };
    const serialized = JSON.stringify(body);

    expect(response.statusCode).toBe(200);
    expect(body.provider).toBe("laserstream");
    expect(body.clientKind).toBe("laserstream");
    expect(body.configured).toBe(true);
    expect(body.authConfigured).toBe(true);
    expect(body.endpointMasked).toContain("api_key=****");
    expect(body.authTokenMasked).toBe("configured:14");
    expect(body.reasonCodes).toContain("MANAGED_STREAM_CLIENT_SKELETON");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("not-a-real-key");
  });

  it("GET /indexer/stream/real-readiness reports LaserStream gates safely", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath,
      indexer: {
        managedStream: {
          provider: "laserstream",
          allowRealConnection: true,
          realConnectionAck: true,
          realProvider: "laserstream",
          laserstreamEnabled: true,
          laserstreamEndpoint:
            "https://laserstream.example.invalid?api-key=super-secret",
          laserstreamAuthToken: "not-a-real-key",
          laserstreamMaxMessagesPerSession: 5,
          laserstreamMaxRuntimeMs: 1000
        }
      }
    });

    const statusResponse = await server.app.inject({
      method: "GET",
      url: "/indexer/stream/status"
    });
    const readinessResponse = await server.app.inject({
      method: "GET",
      url: "/indexer/stream/real-readiness"
    });
    const status = statusResponse.json() as {
      realConnectionAllowed: boolean;
      realConnectionAck: boolean;
      realProvider: string;
      laserstream: {
        readyToConnect: boolean;
        maxMessagesPerSession: number;
        maxRuntimeMs: number;
        endpointMasked: string | null;
      };
      secretsExposed: boolean;
    };
    const readiness = readinessResponse.json() as {
      canConnect: boolean;
      maskedConfig: {
        endpointMasked: string | null;
        maxMessagesPerSession: number;
        maxRuntimeMs: number;
      };
      paperOnly: boolean;
      tradingDisabled: boolean;
      secretsExposed: boolean;
      reasonCodes: string[];
    };
    const serialized = JSON.stringify({ status, readiness });

    expect(statusResponse.statusCode).toBe(200);
    expect(readinessResponse.statusCode).toBe(200);
    expect(status.realConnectionAllowed).toBe(true);
    expect(status.realConnectionAck).toBe(true);
    expect(status.realProvider).toBe("laserstream");
    expect(status.laserstream.readyToConnect).toBe(true);
    expect(status.laserstream.maxMessagesPerSession).toBe(5);
    expect(status.laserstream.maxRuntimeMs).toBe(1000);
    expect(status.secretsExposed).toBe(false);
    expect(readiness.canConnect).toBe(true);
    expect(readiness.reasonCodes).toContain("LASERSTREAM_READY_TO_CONNECT");
    expect(readiness.maskedConfig.endpointMasked).toContain("api-key=****");
    expect(readiness.paperOnly).toBe(true);
    expect(readiness.tradingDisabled).toBe(true);
    expect(readiness.secretsExposed).toBe(false);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("not-a-real-key");
  });

  it("POST /indexer/stream/build-subscription builds safe previews", async () => {
    server = createApiServer({
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath,
      indexer: {
        managedStream: {
          provider: "yellowstone",
          endpoint: "https://yellowstone.example.invalid?token=super-secret",
          authToken: "not-a-real-token"
        }
      }
    });

    const yellowstoneResponse = await server.app.inject({
      method: "POST",
      url: "/indexer/stream/build-subscription",
      payload: {
        provider: "yellowstone",
        profile: "pumpfun_program_transactions",
        includeProgram: ["FakeProgram111111111111111111111111111111111"],
        requiredAccount: ["FakeRequired1111111111111111111111111111111"]
      }
    });
    const laserstreamResponse = await server.app.inject({
      method: "POST",
      url: "/indexer/stream/build-subscription",
      payload: {
        provider: "laserstream",
        commitment: "processed",
        config: {
          transactionAccountInclude: [
            "FakeLaserProgram111111111111111111111111111"
          ],
          transactionAccountRequired: [
            "FakeLaserRequired1111111111111111111111111"
          ]
        }
      }
    });
    const yellowstone = yellowstoneResponse.json() as {
      provider: string;
      request: { provider: string };
      subscriptionSummary: { transactionAccountIncludeCount: number };
      reasonCodes: string[];
    };
    const laserstream = laserstreamResponse.json() as {
      provider: string;
      request: { provider: string };
      subscriptionSummary: { commitment: string };
    };
    const serialized = JSON.stringify({ yellowstone, laserstream });

    expect(yellowstoneResponse.statusCode).toBe(200);
    expect(yellowstone.provider).toBe("yellowstone");
    expect(yellowstone.request.provider).toBe("yellowstone");
    expect(yellowstone.subscriptionSummary.transactionAccountIncludeCount).toBe(
      1
    );
    expect(yellowstone.reasonCodes).toContain("STREAM_PROFILE_BUILT");
    expect(laserstreamResponse.statusCode).toBe(200);
    expect(laserstream.provider).toBe("laserstream");
    expect(laserstream.request.provider).toBe("laserstream");
    expect(laserstream.subscriptionSummary.commitment).toBe("processed");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("not-a-real-token");
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
      actualBucketCount: number;
      buckets: Array<{
        bucketMs: number;
        bucketStart: string;
        synthetic: boolean;
        tradeCount: number;
      }>;
      status: { canonical: boolean };
      windows: { "10s": { tradeCount: number; volumeSol: number } };
    };
    expect(timeseriesBody.actualBucketCount).toBe(1);
    expect(timeseriesBody.buckets[0]).toMatchObject({
      bucketMs: 1000,
      synthetic: false,
      tradeCount: 1
    });
    expect(timeseriesBody.status.canonical).toBe(true);
    expect(timeseriesBody.windows["10s"].tradeCount).toBe(1);
    expect(timeseriesBody.windows["10s"].volumeSol).toBe(1.5);

    const derivativesResponse = await server.app.inject({
      method: "GET",
      url: `/indexer/derivatives/${body.normalizedEvent.mint}`
    });
    expect(derivativesResponse.statusCode).toBe(200);
    expect(derivativesResponse.json()).toMatchObject({
      canonical: true,
      method: "event_time_finite_difference",
      observationCount: 1,
      primary: {
        metrics: {
          priceVelocityPctPerSec: {
            status: "insufficient_samples",
            value: null
          }
        }
      }
    });

    const historyResponse = await server.app.inject({
      method: "GET",
      url: `/indexer/timeseries/${body.normalizedEvent.mint}/history`
    });
    const historyBody = historyResponse.json() as {
      buckets: Array<{ bucketMs: number; tradeCount: number }>;
      persisted: boolean;
    };
    expect(historyResponse.statusCode).toBe(200);
    expect(historyBody.persisted).toBe(true);
    expect(historyBody.buckets).toHaveLength(1);
    expect(historyBody.buckets[0]).toMatchObject({
      bucketMs: 1000,
      tradeCount: 1
    });

    const runtimeTimeseriesResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/timeseries"
    });
    expect(runtimeTimeseriesResponse.json()).toMatchObject({
      persistedBucketCount: 1,
      timeseries: {
        bucketCount: 1,
        canonical: true
      },
      tradingDisabled: true
    });

    const runtimeDerivativesResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/derivatives"
    });
    expect(runtimeDerivativesResponse.json()).toMatchObject({
      canonical: true,
      method: "event_time_finite_difference",
      derivativeReadyMintCount: 0,
      accelerationReadyMintCount: 0,
      unavailableValue: null,
      tradingDisabled: true
    });

    const runtimeStrengthResponse = await server.app.inject({
      method: "GET",
      url: "/runtime/derivative-strength"
    });
    expect(runtimeStrengthResponse.json()).toMatchObject({
      canonical: true,
      method: "hybrid_absolute_robust_age_cohort",
      onlineCohortPolicy: "same_age_prior_snapshots_only",
      minimumRobustCohortSize: 5,
      signalCalibrationRequired: true,
      calibrationStatus: "pending",
      tradingDisabled: true
    });

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
    const cards = response.json() as Array<{
      mint: string;
      eventTypes: string[];
    }>;

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
    expect(cards[0]?.dataCompletenessLabel).toBe("discovery_only");
    expect(cards[0]?.missingCriticalFields).toContain("price");
    expect(cards[0]?.tradeTrackingState).toBe("not_tracked");
    expect(cards[0]?.tradeTrackingReasonCodes).toContain(
      "LIVE_TRADE_TRACKING_DISABLED"
    );
    expect(cards[0]?.tradeEventCount).toBe(0);
    expect(cards[0]?.launchPhase).toBe("discovery_only");
    expect(cards[0]?.launchScore).toBe(0);
    expect(cards[0]?.launchBuyReadyPaper).toBe(false);
    expect(cards[0]?.launchTrackingState).toBe("blocked");
    expect(cards[0]?.launchWindows?.["5s"].volumeSol).toBe(0);
    expect(cards[0]?.launchWindows?.["60s"].volumeSol).toBe(0);
    expect(cards[0]?.launchDerivatives?.volumeVelocitySolPerSec).toBeNull();
    expect(cards[0]?.launchDerivativeScore?.totalScore).toBe(0);
    expect(cards[0]?.launchTradeSampleCount).toBe(0);
    expect(cards[0]?.launchReasonCodes).toContain("LAUNCH_DISCOVERY_ONLY");
    expect(cards[0]?.launchMissingDataReasons).toContain(
      "PRICE_ACTION_REQUIRES_METERED_TOKEN_TRADES"
    );
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
    expect(cards[0]?.launchTradeSampleCount).toBe(1);
    expect(cards[0]?.launchBuyReadyPaper).toBe(false);
    expect(cards[0]?.launchTrackingState).toBe("blocked");
    expect(cards[0]?.launchVolume5mSol).toBe(1.5);
    expect(cards[0]?.launchWindows?.["5m"].volumeSol).toBe(1.5);
    expect(cards[0]?.launchDerivatives?.volumeVelocitySolPerSec).toBeNull();
    expect(cards[0]?.launchDerivativeStrength?.volume.direction).toBe(
      "unavailable"
    );
    expect(cards[0]?.launchBuyCount10s).toBe(1);
    expect(cards[0]?.launchReasonCodes).toContain("LAUNCH_TRADE_TRACKED");
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
    const momentumRowsResponse = await server.app.inject({
      method: "GET",
      url: "/ui/momentum-rows"
    });
    const liveTokens = liveTokensResponse.json() as unknown[];
    const liveCards = liveCardsResponse.json() as unknown[];
    const momentumRows = momentumRowsResponse.json() as unknown[];

    expect(liveTokensResponse.statusCode).toBe(200);
    expect(liveCardsResponse.statusCode).toBe(200);
    expect(momentumRowsResponse.statusCode).toBe(200);
    expect(liveTokens).toEqual([]);
    expect(liveCards).toEqual([]);
    expect(momentumRows).toEqual([]);
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

function findDisallowedApiKeyFields(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findDisallowedApiKeyFields(item, `${path}[${index}]`)
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => {
      const currentPath = `${path}.${key}`;
      const offenders =
        /apiKey/i.test(key) && !/ApiKeyConfigured$/i.test(key)
          ? [currentPath]
          : [];

      return [...offenders, ...findDisallowedApiKeyFields(child, currentPath)];
    }
  );
}

function findNonFiniteNumbers(value: unknown, path = "$"): string[] {
  if (typeof value === "number") {
    return Number.isFinite(value) ? [] : [path];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findNonFiniteNumbers(item, `${path}[${index}]`)
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => findNonFiniteNumbers(child, `${path}.${key}`)
  );
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

function createMeteredLaunchDataTestServer(options: {
  acknowledgedCost: boolean;
  dataWalletBalanceSol?: number;
  enabled: boolean;
  liveDiscoveryConnected?: boolean;
}): ApiServer {
  const apiServer = createApiServer({
    actualData: createActualDataConfig({
      acknowledgedMetered: options.acknowledgedCost,
      apiKeyConfigured: true,
      enabled: options.enabled,
      maxEventsPerMint: 250,
      maxEventsPerSession: 1000,
      maxSubscribedTokens: 3,
      requireApiKey: true,
      unsubscribeAfterMs: 0
    }),
    dataFeed: "pumpportal",
    logLevel: false,
    meteredLaunchData: {
      acknowledgedCost: options.acknowledgedCost,
      apiKeyConfigured: true,
      dataWalletPublicKeyConfigured: true,
      enabled: options.enabled,
      maxConcurrentMints: 3,
      maxEventsPerMint: 250,
      maxEventsPerSession: 1000,
      maxSessionCostSol: 0.001,
      requireUiAck: !options.acknowledgedCost,
      startActive: options.acknowledgedCost
    },
    pumpPortal: {
      apiKey: "test-api-key",
      maxTokenTradeEventsPerMint: 250,
      maxTokenTradeEventsPerSession: 1000,
      maxTokenTradeSubscriptions: 3,
      subscribeMigration: false,
      subscribeNewToken: true,
      ...(options.liveDiscoveryConnected
        ? { webSocketConstructor: FakeWebSocket }
        : {}),
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
    startFeed: options.liveDiscoveryConnected ?? false,
    storageDatabasePath: databasePath
  });

  if (options.liveDiscoveryConnected) {
    FakeWebSocket.instances[0]?.emit("open");
  }

  return apiServer;
}

function createExitTestServer(options: {
  accountTradesAcknowledgedMetered: boolean;
  accountTradesEnabled: boolean;
  enabled: boolean;
}): ApiServer {
  return createApiServer({
    dataFeed: "pumpportal",
    logLevel: false,
    pumpPortal: {
      apiKey: "test-api-key",
      maxAccountTradeEventsPerSession: 100,
      maxAccountTradeSubscriptions: 2,
      subscribeMigration: false,
      subscribeNewToken: false,
      wsUrl: "wss://example.test/pumpportal"
    },
    watchedWalletExit: {
      accountTradesAcknowledgedMetered:
        options.accountTradesAcknowledgedMetered,
      accountTradesEnabled: options.accountTradesEnabled,
      apiKeyConfigured: true,
      enabled: options.enabled,
      requireDataWalletReady: false
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

function createHardRejectRiskSnapshot(server: ApiServer, mint: string) {
  return server.risk.evaluateRisk({
    mint,
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
}

function createExitSignal(mint: string): ExitSignal {
  return {
    id: "exit-signal-test-1",
    mint,
    wallet: "So11111111111111111111111111111111111111112",
    walletAlias: "paper watcher",
    ruleId: "paper-exit-rule",
    action: "paper_sell",
    sellPct: 100,
    sellReason: "watched wallet buy",
    blocked: false,
    blockers: [],
    warnings: [],
    positionSnapshot: {
      mint,
      symbol: "SOL",
      title: "Solana",
      entryPriceSol: 0.001,
      currentPriceSol: 0.002,
      sizeSol: 0.005,
      tokenAmount: 5,
      openedAt: "2026-01-01T00:00:00.000Z",
      unrealizedPnlPct: 100,
      unrealizedPnlSol: 0.005,
      status: "open"
    },
    triggerEvent: {
      wallet: "So11111111111111111111111111111111111111112",
      walletAlias: "paper watcher",
      mint,
      side: "buy",
      priceSol: 0.002,
      volumeSol: 1,
      tokenAmount: 500,
      signature: "ExitTradeSig111111111111111111111111111111",
      timestamp: "2026-01-01T00:01:00.000Z",
      source: "test",
      confidence: "high",
      usableForExitStrategy: true,
      reasonCodes: ["WATCHED_WALLET_TRADE_OBSERVED"],
      raw: null
    },
    reasonCodes: ["WATCHED_WALLET_BUY_TRIGGER"],
    createdAt: "2026-01-01T00:01:00.000Z"
  };
}

function createPumpPortalEvent(
  options: {
    candidate?: Partial<TokenCreatedEvent["candidate"]>;
    mint?: string;
    raw?: Record<string, unknown>;
    rawSourceEventType?: string;
    riskFlags?: Partial<TokenCreatedEvent["riskFlags"]>;
    timestamp?: string;
  } = {}
): TokenCreatedEvent {
  const mint = options.mint ?? "PumpPortalMint111111111111111111111111111";
  const timestamp = options.timestamp ?? "2026-01-01T00:00:00.000Z";

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
      ...options.candidate,
      source: "pumpportal",
      ageSeconds: 0,
      firstSeenAt: timestamp
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
    ...(options.raw ? { raw: options.raw } : {}),
    rawSourceEventType: options.rawSourceEventType ?? "new_token",
    receivedAt: timestamp,
    riskFlags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      topHolderConcentrationHigh: false,
      mutableMetadata: false,
      suspiciousName: false,
      lowLiquidity: true,
      washTradingSuspected: false,
      honeypotSuspected: false,
      ...options.riskFlags
    },
    source: "pumpportal",
    timestamp
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
