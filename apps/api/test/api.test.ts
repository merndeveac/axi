import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TokenCreatedEvent, TokenTradeEvent } from "@axi/data-feeds";
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
      paperOnly: boolean;
      reasonCodes: string[];
    };

    expect(response.statusCode).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.acknowledgedMetered).toBe(false);
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
    startFeed: false,
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
