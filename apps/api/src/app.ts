import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  MockFeedProvider,
  PumpPortalFeedProvider,
  isValidSolanaMint,
  type FeedEvent,
  type MockFeedProviderOptions,
  type PumpPortalFeedProviderOptions,
  type TokenFeedProvider
} from "@axi/data-feeds";
import {
  createCandidateLifecycleEngine,
  type CandidateLifecycleEngine,
  type CandidateState
} from "@axi/candidates";
import { PaperTradeExecutor, type PaperTradeResult } from "@axi/execution";
import {
  createRollingMetricsEngine,
  type RollingMetricsEngine
} from "@axi/metrics";
import { createRiskEngine, type RiskEngine, type RiskInput } from "@axi/risk";
import { scoreCandidate } from "@axi/scoring";
import {
  BotModeSchema,
  type BotMode,
  type ChainVerificationSummary,
  type CandidateDecision,
  type LiveTokenCardViewModel,
  type ObservationConfidence,
  type OverlaySignal,
  type QuoteAsset,
  type RiskFlags,
  type RiskSnapshot,
  type RollingMetrics,
  type RollingMetricsSnapshot,
  type ScoreBreakdown,
  type SignalState,
  type SignalStrength,
  type StrategySignalDriver,
  type StrategySignalExplanation,
  type StrategyStatus,
  type TokenIdentitySummary,
  type TokenCandidate
} from "@axi/shared";
import {
  closeStorage,
  getLatestChainVerification,
  getStorageStats,
  initStorage,
  listChainVerifications,
  saveLiveFeedEvent,
  listPaperOrders,
  listPaperPositions,
  listRecentSignals,
  saveCandidateDecision,
  saveChainVerification,
  saveFeedEvent,
  savePaperOrder,
  saveRiskSnapshot,
  saveSignal,
  listActualDataSubscriptions,
  listPumpPortalTokenTradeEvents,
  listPumpPortalTokenTradeEventsByMint,
  listTokenIdentities,
  listUnresolvedTokenIdentities,
  type StorageHandle,
  upsertPaperPosition
} from "@axi/storage";
import type { WatchOrchestratorOptions } from "@axi/watch-orchestrator";
import {
  ChainVerifierUnavailableError,
  createChainVerifierService,
  type ChainVerificationRecord,
  type ChainVerifierOptions,
  type ChainVerifierService
} from "./chain-verifier";
import {
  ChainEventsUnavailableError,
  createChainEventsService,
  type ChainEventsService,
  type ChainEventsServiceOptions
} from "./chain-events-service";
import type {
  WatchedAddressInput,
  WatchedAddressKind
} from "@axi/chain-events";
import {
  createWatchOrchestrationService,
  createWatchPlanSummary,
  type WatchOrchestrationService
} from "./watch-orchestration-service";
import {
  ActualDataServiceError,
  createActualDataConfig,
  createActualDataService,
  type ActualDataCandidateSummary,
  type ActualDataService,
  type ActualDataServiceConfig
} from "./actual-data-service";
import {
  createTokenIdentityConfig,
  createTokenIdentityService,
  toTokenIdentitySummary,
  type TokenIdentityService,
  type TokenIdentityServiceConfig
} from "./token-identity-service";
import {
  createLiveTokenService,
  type LiveFeedMode,
  type LiveToken,
  type LiveTokenService
} from "./live-token-service";

const logLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent"
]);

export const apiConfigSchema = z.object({
  NODE_ENV: z.string().default("development"),
  BOT_MODE: BotModeSchema.default("paper"),
  DATA_FEED_MODE: z.enum(["live", "none", "mock", "replay"]).default("live"),
  DATA_FEED: z.enum(["none", "mock", "pumpportal"]).default("pumpportal"),
  ALLOW_MOCK_DATA: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  MOCK_FEED_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  MOCK_FEED_REQUIRE_EXPLICIT_ENABLE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  REAL_DATA_REQUIRED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  FAIL_IF_NO_REAL_DATA: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PAPER_AUTO_ORDER: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  CHAIN_VERIFIER_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  SOLANA_RPC_HTTP: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  SOLANA_RPC_COMMITMENT: z
    .enum(["processed", "confirmed", "finalized"])
    .default("confirmed"),
  CHAIN_VERIFIER_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),
  CHAIN_VERIFIER_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(60000),
  CHAIN_VERIFIER_MAX_CONCURRENT: z.coerce.number().int().positive().default(2),
  CHAIN_VERIFIER_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  CHAIN_VERIFIER_ON_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  CHAIN_VERIFIER_ON_MOCK: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  CHAIN_EVENTS_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  SOLANA_RPC_WS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  CHAIN_EVENTS_WATCHED_ADDRESSES: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional()
  ),
  CHAIN_EVENTS_MAX_WATCHED_ADDRESSES: z.coerce
    .number()
    .int()
    .positive()
    .default(25),
  CHAIN_EVENTS_BACKFILL_ON_START: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  CHAIN_EVENTS_BACKFILL_LIMIT_PER_ADDRESS: z.coerce
    .number()
    .int()
    .positive()
    .default(25),
  CHAIN_EVENTS_FETCH_TRANSACTION_ON_LOG: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  CHAIN_EVENTS_MAX_CONCURRENT_FETCHES: z.coerce
    .number()
    .int()
    .positive()
    .default(4),
  CHAIN_EVENTS_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),
  CHAIN_EVENTS_ON_NEW_CANDIDATE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  CHAIN_EVENTS_ON_CHAIN_VERIFIED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MARKET_DATA_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(true),
  MARKET_DATA_MIN_CONFIDENCE_FOR_METRICS: z
    .enum(["low", "medium", "high"])
    .default("medium"),
  MARKET_DATA_SOL_USD_PRICE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().positive().optional()
  ),
  MARKET_DATA_ALLOW_SOL_USD_CONVERSION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MARKET_DATA_ALLOW_USD_FROM_STABLE_QUOTES: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  WATCH_ORCHESTRATOR_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_VERIFY_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_VERIFY_ON_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_WATCH_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_WATCH_ON_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_MAX_TARGETS_PER_CANDIDATE: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  WATCH_ORCHESTRATOR_ALLOW_MINT_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  WATCH_ORCHESTRATOR_ALLOW_BONDING_CURVE_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  WATCH_ORCHESTRATOR_ALLOW_POOL_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  WATCH_ORCHESTRATOR_ALLOW_PROGRAM_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_ALLOW_WALLET_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_MIN_CONFIDENCE_TO_WATCH: z
    .enum(["low", "medium", "high"])
    .default("medium"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  SIGNAL_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
  STORAGE_DATABASE_PATH: z.string().min(1).optional(),
  MOCK_FEED_SEED: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().optional()
  ),
  MOCK_FEED_SCENARIO: z
    .enum(["normal", "momentum", "rug", "flat"])
    .default("normal"),
  MOCK_FEED_MAX_EVENTS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().positive().optional()
  ),
  PUMPPORTAL_WS_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  PUMPPORTAL_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  PUMPPORTAL_SUBSCRIBE_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_SUBSCRIBE_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_TOKEN_TRADES_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_ACK_METERED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_MANUAL_MINTS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional()
  ),
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_QUALIFIED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_MAX_SUBSCRIBED_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_SESSION: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_MINT: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  PUMPPORTAL_TOKEN_TRADES_UNSUBSCRIBE_AFTER_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(300000),
  PUMPPORTAL_TOKEN_TRADES_MIN_SCORE_TO_AUTO_SUBSCRIBE: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(60),
  PUMPPORTAL_TOKEN_TRADES_REQUIRE_API_KEY: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  TOKEN_IDENTITY_SOLANA_METADATA_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  TOKEN_IDENTITY_SOLANA_METADATA_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  TOKEN_IDENTITY_SOLANA_METADATA_ON_DEMAND: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  TOKEN_IDENTITY_OFFCHAIN_FETCH_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  TOKEN_IDENTITY_OFFCHAIN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  TOKEN_IDENTITY_OFFCHAIN_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(3600000),
  TOKEN_IDENTITY_IPFS_GATEWAY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().default("https://ipfs.io/ipfs/")
  ),
  TOKEN_IDENTITY_MAX_METADATA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(262144),
  LOG_LEVEL: logLevelSchema.default("info")
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type ApiLogLevel = z.infer<typeof logLevelSchema>;

export type ApiServerOptions = {
  chainEvents?: ChainEventsServiceOptions;
  closeStorageOnClose?: boolean;
  chainVerifier?: ChainVerifierOptions;
  allowMockData?: boolean;
  dataFeedMode?: LiveFeedMode;
  failIfNoRealData?: boolean;
  dataFeed?: "none" | "mock" | "pumpportal";
  feedProvider?: TokenFeedProvider;
  host?: string;
  logLevel?: ApiLogLevel | false;
  mockFeed?: MockFeedProviderOptions | undefined;
  mode?: BotMode;
  paperAutoOrder?: boolean;
  mockFeedEnabled?: boolean;
  mockFeedRequireExplicitEnable?: boolean;
  port?: number;
  pumpPortal?: PumpPortalFeedProviderOptions | undefined;
  actualData?: ActualDataServiceConfig;
  realDataRequired?: boolean;
  signalIntervalMs?: number;
  startFeed?: boolean;
  storageDatabasePath?: string;
  tokenIdentity?: TokenIdentityServiceConfig;
  watchOrchestrator?: WatchOrchestratorOptions;
};

export type ApiServer = {
  app: FastifyInstance;
  close: () => Promise<void>;
  emitFeedEvent: (event: FeedEvent) => void;
  feed: TokenFeedProvider;
  candidates: CandidateLifecycleEngine;
  metrics: RollingMetricsEngine;
  risk: RiskEngine;
  getSignals: () => OverlaySignal[];
  startFeed: () => void;
  stopFeed: () => Promise<void>;
  storage: StorageHandle;
  chainEvents: ChainEventsService;
  chainVerifier: ChainVerifierService;
  watchOrchestration: WatchOrchestrationService;
  actualData: ActualDataService;
  liveTokens: LiveTokenService;
  tokenIdentity: TokenIdentityService;
};

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(50)
});
const mintParamSchema = z.object({
  mint: z.string().min(32)
});
const chainVerifyBodySchema = z.object({
  mint: z.string().min(1)
});
const chainEventsWatchBodySchema = z.object({
  address: z.string().min(1),
  kind: z
    .enum([
      "mint",
      "pool",
      "bonding_curve",
      "program",
      "token_account",
      "wallet",
      "unknown"
    ])
    .default("unknown"),
  mint: z.string().min(1).optional(),
  label: z.string().min(1).optional()
});
const chainEventsAddressParamSchema = z.object({
  address: z.string().min(1)
});
const signatureParamSchema = z.object({
  signature: z.string().min(1)
});
const watchPlanBodySchema = z.object({
  mint: z.string().min(1),
  event: z.unknown().optional(),
  source: z.string().min(1).optional()
});
const actualDataSubscribeBodySchema = z.object({
  mint: z.string().min(1),
  reason: z.string().min(1).default("manual")
});
const tokenResolveBodySchema = z.object({
  mint: z.string().min(1)
});

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return apiConfigSchema.parse(env);
}

export function createApiServer(options: ApiServerOptions = {}): ApiServer {
  const mode = options.mode ?? "paper";

  if (mode === "live") {
    throw new Error(
      "Live mode is not implemented. Start this service with BOT_MODE=paper."
    );
  }

  const app = Fastify({
    logger:
      options.logLevel === false
        ? false
        : {
            level: options.logLevel ?? "info"
          }
  });

  const feed =
    options.feedProvider ??
    createFeedProvider({
      allowMockData: options.allowMockData ?? false,
      dataFeed: options.dataFeed ?? "pumpportal",
      dataFeedMode: options.dataFeedMode ?? "live",
      mockFeedEnabled: options.mockFeedEnabled ?? false,
      mockFeedRequireExplicitEnable:
        options.mockFeedRequireExplicitEnable ?? true,
      mockFeed: options.mockFeed,
      pumpPortal: options.pumpPortal,
      signalIntervalMs: options.signalIntervalMs ?? 2000
    });

  if ((options.failIfNoRealData ?? false) && feed.name !== "pumpportal") {
    throw new Error(
      "No real data feed is configured. Set DATA_FEED=pumpportal or disable FAIL_IF_NO_REAL_DATA."
    );
  }

  const executor = new PaperTradeExecutor(mode);
  const metricsEngine = createRollingMetricsEngine();
  const riskEngine = createRiskEngine();
  const candidateEngine = createCandidateLifecycleEngine();
  const chainVerifier = createChainVerifierService(options.chainVerifier);
  const chainEvents = createChainEventsService({
    ...options.chainEvents,
    onSafeFeedEvent: handleFeedEvent
  });
  const actualData = createActualDataService({
    config: options.actualData ?? createActualDataConfig(),
    providerName: feed.name,
    ...(feed instanceof PumpPortalFeedProvider
      ? { pumpPortalProvider: feed }
      : {})
  });
  const paperAutoOrder = options.paperAutoOrder ?? false;
  const dataFeedMode = options.dataFeedMode ?? "live";
  const storage = options.storageDatabasePath
    ? initStorage({ databasePath: options.storageDatabasePath })
    : initStorage();
  const tokenIdentity = createTokenIdentityService({
    config: options.tokenIdentity ?? createTokenIdentityConfig(),
    logger: {
      warn: (message, context) => {
        app.log.warn(context ?? {}, message);
      }
    }
  });
  const watchOrchestration = createWatchOrchestrationService({
    ...(options.watchOrchestrator ?? {}),
    chainEvents,
    chainVerifier,
    logger: {
      warn: (message, context) => {
        app.log.warn(context ?? {}, message);
      }
    },
    scheduleVerification: (mint, event) => {
      void verifyAndApplyChainResult({
        event,
        mint
      });
    }
  });
  const liveTokens = createLiveTokenService({
    mode: dataFeedMode,
    provider: feed.name
  });
  const signals = new Map<string, OverlaySignal>();
  const riskSnapshots = new Map<string, RiskSnapshot>();
  const clients = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });
  const maxSignalCacheSize = 100;
  let feedStarted = false;

  app.addHook("onRequest", (request, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    done();
  });

  app.get("/health", async () => {
    const stats = getStorageStats();
    const chainEventsStatus = chainEvents.getStatus();
    const marketStatus = chainEvents.getMarketStatus();
    const watchStatus = watchOrchestration.getStatus();
    const feedStatus = getFeedStatus();
    const liveStatus = liveTokens.getStatus();

    return {
      chainEvents: chainEventsStatus,
      chainEventsConfigured: chainEventsStatus.configured,
      chainEventsEnabled: chainEventsStatus.enabled,
      chainTradeEventCount: stats.chainTradeEventCount,
      chainTransactionEventCount: stats.chainTransactionEventCount,
      chainVerifier: chainVerifier.getStatus(),
      chainVerificationCount: stats.chainVerificationCount,
      chainWatchedAddressCount: chainEventsStatus.watchedAddressCount,
      actualData: actualData.getStatus(),
      actualDataSessionCount: stats.actualDataSessionCount,
      actualDataSubscriptionCount: stats.actualDataSubscriptionCount,
      dataFeedMode,
      dataFeed: options.dataFeed ?? "pumpportal",
      dataFeedReasonCodes:
        feed instanceof NoFeedProvider
          ? feed.reasonCodes
          : feedStatus.reasonCodes,
      feed: feedStatus,
      feedProvider: feed.name,
      mockFeedEnabled: feed.name === "mock",
      mockFeedBlocked: feed.name === "mock-blocked",
      mockRuntimeBlocked: feed.name === "mock-blocked",
      liveFeedExpected: dataFeedMode === "live",
      liveFeedConnected: feedStatus.connected,
      liveFeedReady: feedStatus.connected && liveStatus.liveTokenCount > 0,
      liveFeedLastEventAt: feedStatus.lastEventAt ?? liveStatus.lastEventAt,
      liveTokenCount: liveStatus.liveTokenCount,
      historicalMockRowsHidden: true,
      realDataConfigured: (options.dataFeed ?? "pumpportal") === "pumpportal",
      realDataActive: feed.name === "pumpportal",
      realDataRequired: options.realDataRequired ?? false,
      noFeedMode:
        dataFeedMode === "none" ||
        feed.name === "none" ||
        feed.name === "mock-blocked",
      noRealFeedMessage:
        dataFeedMode === "none" ||
        feed.name === "none" ||
        feed.name === "mock-blocked"
          ? "NO REAL FEED CONFIGURED"
          : undefined,
      marketData: marketStatus,
      marketDataEnabled: marketStatus.enabled,
      marketDataMinConfidence: marketStatus.minConfidenceForMetrics,
      marketObservationCount: stats.marketObservationCount,
      liveFeedEventCount: stats.liveFeedEventCount,
      pumpPortalTokenTradeEventCount: stats.pumpPortalTokenTradeEventCount,
      tokenIdentity: tokenIdentity.getStatus(),
      tokenIdentityCount: stats.tokenIdentityCount,
      tokenIdentityResolvedCount: stats.tokenIdentityResolvedCount,
      tokenIdentityUnresolvedCount: stats.tokenIdentityUnresolvedCount,
      tokenMetadataFetchCount: stats.tokenMetadataFetchCount,
      watchOrchestrator: watchStatus,
      watchOrchestratorEnabled: watchStatus.enabled,
      watchPlanCount: stats.watchPlanCount,
      watchActionCount: stats.watchActionCount,
      metricsEnabled: true,
      riskEnabled: true,
      candidateLifecycleEnabled: true,
      status: "ok",
      mode,
      candidateCount: candidateEngine.getAllCandidates().length,
      paperAutoOrder,
      paperOnly: true,
      solUsdConfigured: marketStatus.solUsdConfigured,
      trackedTokenCount: metricsEngine.getAllMetrics().length,
      uptimeSeconds: Math.round(process.uptime())
    };
  });

  app.get("/signals", async () => Array.from(signals.values()));

  app.get("/feed/status", async () => getFeedStatus());

  app.get("/feed/events/live", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return liveTokens.getLiveFeedEvents(query.limit);
  });

  app.get("/live/status", async () => ({
    ...liveTokens.getStatus(),
    feed: getFeedStatus()
  }));

  app.get("/live/tokens", async () => liveTokens.getLiveTokens());

  app.get("/live/tokens/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const token = liveTokens.getLiveToken(params.mint);

    if (!token) {
      return reply.code(404).send({
        error: "not_found",
        message: `No current-session live token tracked for mint ${params.mint}`
      });
    }

    return token;
  });

  app.get("/live/events", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return liveTokens.getLiveFeedEvents(query.limit);
  });

  app.get("/ui/live-token-cards", async () => buildLiveTokenCards());

  app.get("/strategy/status", async () => getStrategyStatus());

  app.get("/metrics", async () =>
    metricsEngine.getAllMetrics().map(enrichMetricsWithIdentity)
  );

  app.get("/metrics/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const metrics = metricsEngine.getMetrics(params.mint);

    if (!metrics) {
      return reply.code(404).send({
        error: "not_found",
        message: `No metrics tracked for mint ${params.mint}`
      });
    }

    return enrichMetricsWithIdentity(metrics);
  });

  app.get("/candidates", async () =>
    candidateEngine.getAllCandidates().map(enrichCandidate)
  );

  app.get("/candidates/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const candidate = candidateEngine.getCandidate(params.mint);

    if (!candidate) {
      return reply.code(404).send({
        error: "not_found",
        message: `No candidate tracked for mint ${params.mint}`
      });
    }

    return enrichCandidate(candidate);
  });

  app.get("/risk", async () => Array.from(riskSnapshots.values()));

  app.get("/risk/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const riskSnapshot = riskSnapshots.get(params.mint);

    if (!riskSnapshot) {
      return reply.code(404).send({
        error: "not_found",
        message: `No risk snapshot tracked for mint ${params.mint}`
      });
    }

    return riskSnapshot;
  });

  app.get("/positions", async () => executor.getPositions());

  app.get("/storage/stats", async () => getStorageStats());

  app.get("/tokens/status", async () => tokenIdentity.getStatus());

  app.get("/tokens", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listTokenIdentities(query.limit);
  });

  app.get("/tokens/unresolved", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listUnresolvedTokenIdentities(query.limit);
  });

  app.get("/tokens/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const identity = tokenIdentity.getIdentity(params.mint);

    if (!identity) {
      return reply.code(404).send({
        error: "not_found",
        message: `No token identity tracked for mint ${params.mint}`
      });
    }

    return identity;
  });

  app.post("/tokens/resolve", async (request, reply) => {
    const body = tokenResolveBodySchema.parse(request.body);

    if (!isValidSolanaMint(body.mint)) {
      return reply.code(400).send({
        error: "INVALID_MINT",
        message: `Invalid Solana mint: ${body.mint}`,
        paperOnly: true
      });
    }

    try {
      return await tokenIdentity.resolveIdentity(body.mint, "manual_http");
    } catch (error) {
      return reply.code(400).send({
        error: "TOKEN_IDENTITY_RESOLVE_FAILED",
        message: error instanceof Error ? error.message : String(error),
        tokenIdentity: tokenIdentity.getStatus(),
        paperOnly: true
      });
    }
  });

  app.get("/actual-data/status", async () => actualData.getStatus());

  app.get("/actual-data/subscriptions", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      current: actualData.getSubscriptions(),
      recent: listActualDataSubscriptions(query.limit),
      status: actualData.getStatus()
    };
  });

  app.post("/actual-data/subscribe", async (request, reply) => {
    const body = actualDataSubscribeBodySchema.parse(request.body);

    try {
      return actualData.subscribeMint(body.mint, body.reason);
    } catch (error) {
      if (error instanceof ActualDataServiceError) {
        return reply.code(error.statusCode).send({
          actualData: actualData.getStatus(),
          error: error.code,
          message: error.message,
          paperOnly: true
        });
      }

      throw error;
    }
  });

  app.delete("/actual-data/subscribe/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);

    return {
      paperOnly: true,
      subscription: actualData.unsubscribeMint(params.mint, "manual_delete")
    };
  });

  app.get("/actual-data/trades", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listPumpPortalTokenTradeEvents(query.limit).map(
      enrichRowWithIdentity
    );
  });

  app.get("/actual-data/trades/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return listPumpPortalTokenTradeEventsByMint(params.mint, query.limit).map(
      enrichRowWithIdentity
    );
  });

  app.get("/chain/status", async () => chainVerifier.getStatus());

  app.get("/chain/verifications", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listChainVerifications(query.limit);
  });

  app.get("/chain/verifications/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const verification = getLatestChainVerification(params.mint);

    if (!verification) {
      return reply.code(404).send({
        error: "not_found",
        message: `No chain verification stored for mint ${params.mint}`
      });
    }

    return verification;
  });

  app.get("/chain/verify/:mint", async (request, reply) => {
    const params = chainVerifyBodySchema.parse(request.params);
    return verifyMintForHttp(params.mint, reply);
  });

  app.post("/chain/verify", async (request, reply) => {
    const body = chainVerifyBodySchema.parse(request.body);
    return verifyMintForHttp(body.mint, reply);
  });

  app.get("/chain/events/status", async () => chainEvents.getStatus());

  app.get("/chain/events/watches", async () =>
    chainEvents.getWatchedAddresses()
  );

  app.post("/chain/events/watch", async (request, reply) => {
    const body = chainEventsWatchBodySchema.parse(request.body);

    try {
      const watchInput: WatchedAddressInput = {
        address: body.address,
        kind: body.kind as WatchedAddressKind,
        reasonCodes: ["MANUAL_READ_ONLY_WATCH"]
      };

      if (body.mint) {
        watchInput.mint = body.mint;
      }

      if (body.label) {
        watchInput.label = body.label;
      }

      return chainEvents.watchAddress(watchInput);
    } catch (error) {
      if (error instanceof ChainEventsUnavailableError) {
        return reply.code(409).send({
          error: error.code,
          message: error.message,
          chainEvents: chainEvents.getStatus()
        });
      }

      if (error instanceof Error) {
        return reply.code(400).send({
          error: "CHAIN_EVENTS_WATCH_REJECTED",
          message: error.message,
          chainEvents: chainEvents.getStatus()
        });
      }

      throw error;
    }
  });

  app.delete("/chain/events/watch/:address", async (request) => {
    const params = chainEventsAddressParamSchema.parse(request.params);
    const removed = await chainEvents.unwatchAddress(params.address);

    return {
      address: params.address,
      removed,
      paperOnly: true
    };
  });

  app.get("/chain/events/transactions", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return chainEvents.getRecentChainEvents(query.limit);
  });

  app.get("/chain/events/trades", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return chainEvents.getRecentChainTradeEvents(query.limit);
  });

  app.get("/chain/events/transactions/:signature", async (request, reply) => {
    const params = signatureParamSchema.parse(request.params);
    const event = chainEvents.getChainTransactionEvent(params.signature);

    if (!event) {
      return reply.code(404).send({
        error: "not_found",
        message: `No chain transaction event stored for signature ${params.signature}`
      });
    }

    return event;
  });

  app.get("/market/status", async () => chainEvents.getMarketStatus());

  app.get("/market/observations", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return chainEvents.getRecentMarketObservations(query.limit);
  });

  app.get(
    "/market/observations/signature/:signature",
    async (request, reply) => {
      const params = signatureParamSchema.parse(request.params);
      const observation = chainEvents.getMarketObservation(params.signature);

      if (!observation) {
        return reply.code(404).send({
          error: "not_found",
          message: `No market observation stored for signature ${params.signature}`
        });
      }

      return observation;
    }
  );

  app.get("/market/observations/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return chainEvents.getMarketObservationsByMint(params.mint, query.limit);
  });

  app.get("/watch/status", async () => watchOrchestration.getStatus());

  app.get("/watch/plans", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return watchOrchestration
      .getWatchPlans(query.limit)
      .map(enrichRowWithIdentity);
  });

  app.get("/watch/plans/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const plan = watchOrchestration.getWatchPlan(params.mint);

    if (!plan) {
      return reply.code(404).send({
        error: "not_found",
        message: `No watch plan stored for mint ${params.mint}`
      });
    }

    return enrichRowWithIdentity(plan);
  });

  app.get("/watch/actions", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return watchOrchestration.getRecentActions(query.limit);
  });

  app.get("/watch/actions/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return watchOrchestration.getRecentActionsByMint(params.mint, query.limit);
  });

  app.post("/watch/plan", async (request) => {
    const body = watchPlanBodySchema.parse(request.body);
    return watchOrchestration.createManualPlan(body);
  });

  app.get("/signals/recent", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listRecentSignals(query.limit);
  });

  app.get("/paper/orders", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listPaperOrders(query.limit);
  });

  app.get("/paper/positions", async () => listPaperPositions());

  app.server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `http://${host}`);

    if (url.pathname !== "/ws/signals") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket) => {
    clients.add(socket);
    sendJson(socket, {
      type: "snapshot",
      signals: Array.from(signals.values())
    });

    socket.on("close", () => {
      clients.delete(socket);
    });
  });

  app.addHook("onClose", async () => {
    await chainEvents.stop();
    await stopFeed();

    for (const client of clients) {
      client.close(1001, "Server shutting down");
    }

    wss.close();

    if (options.closeStorageOnClose ?? true) {
      closeStorage();
    }
  });

  function startFeed(): void {
    if (feedStarted) {
      return;
    }

    feedStarted = true;
    actualData.start();
    void feed.start(handleFeedEvent);
    void chainEvents.start();
  }

  async function stopFeed(): Promise<void> {
    if (!feedStarted) {
      return;
    }

    feedStarted = false;
    actualData.stop();
    await feed.stop();
    await chainEvents.stop();
  }

  function getFeedStatus() {
    const pumpPortalStatus =
      feed instanceof PumpPortalFeedProvider ? feed.getStatus() : undefined;
    const noFeedReasonCodes =
      feed instanceof NoFeedProvider ? feed.reasonCodes : [];
    const reasonCodes = uniqueReasonCodes([
      ...(dataFeedMode === "live" ? ["LIVE_FEED_EXPECTED"] : []),
      ...(dataFeedMode === "none" ? ["NO_FEED_MODE"] : []),
      ...(feed.name === "mock" ? ["MOCK_EXPLICITLY_ENABLED"] : []),
      ...(feed.name === "mock-blocked" ? ["MOCK_RUNTIME_BLOCKED"] : []),
      "HISTORICAL_MOCK_ROWS_HIDDEN",
      ...(pumpPortalStatus?.reasonCodes ?? noFeedReasonCodes)
    ]);

    return {
      mode: dataFeedMode,
      provider: feed.name,
      enabled: dataFeedMode === "live" || dataFeedMode === "mock",
      configured:
        feed.name === "pumpportal" ||
        feed.name === "mock" ||
        dataFeedMode === "none",
      connected: pumpPortalStatus?.connected ?? false,
      connecting: pumpPortalStatus?.connecting ?? false,
      live: dataFeedMode === "live",
      realData: feed.name === "pumpportal",
      subscriptions: pumpPortalStatus?.subscriptions ?? [],
      reconnectAttempts: pumpPortalStatus?.reconnectAttempts ?? 0,
      lastOpenAt: pumpPortalStatus?.lastOpenAt ?? null,
      lastCloseAt: pumpPortalStatus?.lastCloseAt ?? null,
      lastMessageAt: pumpPortalStatus?.lastMessageAt ?? null,
      lastEventAt: pumpPortalStatus?.lastEventAt ?? null,
      newTokenEventCount: pumpPortalStatus?.newTokenEventCount ?? 0,
      migrationEventCount: pumpPortalStatus?.migrationEventCount ?? 0,
      tokenTradeEventCount: pumpPortalStatus?.tokenTradeEventCount ?? 0,
      parseErrorCount: pumpPortalStatus?.parseErrorCount ?? 0,
      lastError: pumpPortalStatus?.lastError ?? null,
      reasonCodes,
      paperOnly: true as const
    };
  }

  function buildLiveTokenCards(): LiveTokenCardViewModel[] {
    const nowMs = Date.now();
    const feedStatus = getFeedStatus();
    const liveEvents = liveTokens.getLiveFeedEvents(1000);

    return liveTokens.getLiveTokens().map((token) => {
      const candidate = candidateEngine.getCandidate(token.mint);
      const identity =
        candidate?.identity ?? getTokenIdentitySummary(token.mint);
      const metrics =
        metricsEngine.getMetrics(token.mint) ?? candidate?.latestMetrics;
      const riskSnapshot =
        riskSnapshots.get(token.mint) ?? candidate?.latestRisk;
      const decision = candidate?.latestDecision;
      const score = candidate?.latestScore;
      const actualDataSummary = actualData.getCandidateSummary(token.mint);
      const marketObservations = chainEvents.getMarketObservationsByMint(
        token.mint,
        1000
      );
      const tokenEvents = liveEvents.filter(
        (event) => event.mint === token.mint
      );
      const metricsAvailable = Boolean(metrics && metrics.sampleCount > 0);
      const window1s = metrics?.windows["1s"];
      const window3s = metrics?.windows["3s"];
      const window5s = metrics?.windows["5s"];
      const window10s = metrics?.windows["10s"];
      const window30s = metrics?.windows["30s"];
      const window60s = metrics?.windows["60s"];
      const latestEventMs = Date.parse(token.latestEventAt);
      const dataFreshnessMs = Number.isFinite(latestEventMs)
        ? Math.max(0, nowMs - latestEventMs)
        : null;
      const unavailableFields = getUnavailableCardFields({
        metrics,
        metricsAvailable,
        riskSnapshot
      });
      const missingFields = getMissingCardFields({ identity, token });
      const dataSourceWarnings = uniqueReasonCodes([
        ...(metricsAvailable ? [] : ["DATA_UNAVAILABLE"]),
        "HOLDER_TIME_SERIES_UNAVAILABLE",
        ...(actualData.getStatus().enabled
          ? []
          : ["ACTUAL_TRADE_DATA_DISABLED"]),
        ...(feedStatus.realData ? [] : ["REAL_FEED_UNAVAILABLE"]),
        ...unavailableFields.map(
          (field) => `${field.toUpperCase()}_UNAVAILABLE`
        )
      ]);
      const calculationReasonCodes = uniqueReasonCodes([
        ...((metrics?.insufficientMetrics ?? true)
          ? ["INSUFFICIENT_TRADE_METRICS"]
          : []),
        ...(metrics?.usedSolMetricsFallback
          ? ["SCORE_USED_SOL_METRICS_FALLBACK"]
          : []),
        "HOLDER_TIME_SERIES_UNAVAILABLE",
        ...dataSourceWarnings
      ]);
      const action = decision?.action ?? token.action ?? "IGNORE";
      const lifecycleState =
        decision?.lifecycleState ?? candidate?.lifecycleState ?? "new";
      const cardScore = decision?.score ?? score?.total ?? token.score ?? 0;
      const hardReject =
        decision?.hardReject ?? riskSnapshot?.hardReject ?? false;
      const insufficientMetrics = metrics?.insufficientMetrics ?? true;
      const signalStrength = getSignalStrength({
        action,
        hardReject,
        riskLevel: riskSnapshot?.riskLevel,
        score: cardScore
      });
      const topRiskWarnings = getTopRiskWarnings(riskSnapshot);
      const rejectReason = hardReject
        ? (topRiskWarnings[0] ?? riskSnapshot?.reasonCodes[0] ?? "HARD_REJECT")
        : insufficientMetrics
          ? "INSUFFICIENT_TRADE_METRICS"
          : null;
      const holderDataSource = getHolderDataSource(candidate, riskSnapshot);
      const holderDataFreshnessMs = getFreshnessMs(
        riskSnapshot?.updatedAt,
        nowMs
      );
      const card: LiveTokenCardViewModel = {
        mint: token.mint,
        shortMint: shortMint(token.mint),
        name: identity?.name ?? token.name ?? null,
        symbol: identity?.symbol ?? token.symbol ?? null,
        title:
          identity?.title ??
          token.title ??
          createTokenTitle(token.symbol, token.name, token.mint),
        displayName:
          identity?.displayName ??
          token.displayName ??
          createTokenTitle(token.symbol, token.name, token.mint),
        imageUri: identity?.imageUri ?? null,
        identityConfidence:
          identity?.confidence ?? token.identityConfidence ?? "none",
        identitySource: identity?.dataSource ?? "unknown",
        identityResolved: identity?.resolved ?? false,
        metadataUri: identity?.metadataUri ?? null,
        source: token.source,
        sourceMode: token.sourceMode,
        realData: token.realData,
        eventTypes: token.eventTypes,
        firstSeenAt: token.firstSeenAt,
        lastSeenAt: token.lastSeenAt,
        ageSeconds: getAgeSeconds(token.firstSeenAt, nowMs),
        latestEventAt: token.latestEventAt,
        latestSignature: token.latestSignature ?? null,
        liveSessionOnly: true,
        stale: dataFreshnessMs !== null && dataFreshnessMs > 30_000,
        dataFreshnessMs,
        priceSol: metricsAvailable
          ? positiveOrNull(metrics?.latestPriceSol)
          : null,
        priceUsd: metricsAvailable
          ? positiveOrNull(metrics?.latestPriceUsd)
          : null,
        priceQuote: null,
        quoteAsset:
          (candidate?.latestMarketObservationSummary?.quoteAsset as
            QuoteAsset | undefined) ?? null,
        marketCapUsd: riskSnapshot?.flags.marketCapUsd ?? null,
        fdvUsd: riskSnapshot?.flags.fdvUsd ?? null,
        liquidityUsd: riskSnapshot?.flags.liquidityUsd ?? null,
        volume1sUsd: metricsAvailable
          ? numberOrNull(window1s?.totalVolumeUsd)
          : null,
        volume3sUsd: metricsAvailable
          ? numberOrNull(window3s?.totalVolumeUsd)
          : null,
        volume5sUsd: metricsAvailable
          ? numberOrNull(window5s?.totalVolumeUsd)
          : null,
        volume10sUsd: metricsAvailable
          ? numberOrNull(window10s?.totalVolumeUsd)
          : null,
        volume30sUsd: metricsAvailable
          ? numberOrNull(window30s?.totalVolumeUsd)
          : null,
        volume60sUsd: metricsAvailable
          ? numberOrNull(window60s?.totalVolumeUsd)
          : null,
        volume1sSol: metricsAvailable
          ? numberOrNull(window1s?.totalVolumeSol)
          : null,
        volume3sSol: metricsAvailable
          ? numberOrNull(window3s?.totalVolumeSol)
          : null,
        volume5sSol: metricsAvailable
          ? numberOrNull(window5s?.totalVolumeSol)
          : null,
        volume10sSol: metricsAvailable
          ? numberOrNull(window10s?.totalVolumeSol)
          : null,
        volume30sSol: metricsAvailable
          ? numberOrNull(window30s?.totalVolumeSol)
          : null,
        volume60sSol: metricsAvailable
          ? numberOrNull(window60s?.totalVolumeSol)
          : null,
        buyVolume10s: metricsAvailable
          ? numberOrNull(
              metrics?.usedSolMetricsFallback
                ? window10s?.buyVolumeSol
                : window10s?.buyVolumeUsd
            )
          : null,
        sellVolume10s: metricsAvailable
          ? numberOrNull(
              metrics?.usedSolMetricsFallback
                ? window10s?.sellVolumeSol
                : window10s?.sellVolumeUsd
            )
          : null,
        netVolume10s: metricsAvailable
          ? numberOrNull(
              metrics?.usedSolMetricsFallback
                ? window10s?.netVolumeSol
                : window10s?.netVolumeUsd
            )
          : null,
        buySellRatio: metricsAvailable
          ? numberOrNull(metrics?.buySellRatio)
          : null,
        netBuyPressure: metricsAvailable
          ? numberOrNull(metrics?.netBuyPressure)
          : null,
        uniqueBuyers1s: metricsAvailable
          ? numberOrNull(window1s?.uniqueBuyers)
          : null,
        uniqueBuyers5s: metricsAvailable
          ? numberOrNull(window5s?.uniqueBuyers)
          : null,
        uniqueBuyers10s: metricsAvailable
          ? numberOrNull(window10s?.uniqueBuyers)
          : null,
        uniqueSellers10s: metricsAvailable
          ? numberOrNull(window10s?.uniqueSellers)
          : null,
        uniqueTraders10s: metricsAvailable
          ? numberOrNull(window10s?.uniqueTraders)
          : null,
        buyTradeCount10s: metricsAvailable
          ? numberOrNull(window10s?.buyTradeCount)
          : null,
        sellTradeCount10s: metricsAvailable
          ? numberOrNull(window10s?.sellTradeCount)
          : null,
        totalTradeCount10s: metricsAvailable
          ? numberOrNull(window10s?.totalTradeCount)
          : null,
        holders: riskSnapshot?.flags.holderCount ?? null,
        holderCount: riskSnapshot?.flags.holderCount ?? null,
        topHolderPct:
          riskSnapshot?.flags.topHolderPct ??
          candidate?.onChainTopHolderPct ??
          null,
        top10HolderPct:
          riskSnapshot?.flags.top10HolderPct ??
          candidate?.onChainTop10HolderPct ??
          null,
        devHolderPct: riskSnapshot?.flags.devHolderPct ?? null,
        holderDataSource,
        holderDataFreshnessMs,
        volumeVelocityUsdPerSec: metricsAvailable
          ? numberOrNull(metrics?.volumeVelocityUsdPerSec)
          : null,
        volumeAccelerationUsdPerSec2: metricsAvailable
          ? numberOrNull(metrics?.volumeAccelerationUsdPerSec2)
          : null,
        volumeVelocitySolPerSec: metricsAvailable
          ? numberOrNull(metrics?.volumeVelocitySolPerSec)
          : null,
        volumeAccelerationSolPerSec2: metricsAvailable
          ? numberOrNull(metrics?.volumeAccelerationSolPerSec2)
          : null,
        priceVelocityPctPerSec: metricsAvailable
          ? numberOrNull(metrics?.priceVelocityPctPerSec)
          : null,
        priceAccelerationPctPerSec2: metricsAvailable
          ? numberOrNull(metrics?.priceAccelerationPctPerSec2)
          : null,
        priceSolVelocityPctPerSec: metricsAvailable
          ? numberOrNull(metrics?.priceSolVelocityPctPerSec)
          : null,
        priceSolAccelerationPctPerSec2: metricsAvailable
          ? numberOrNull(metrics?.priceSolAccelerationPctPerSec2)
          : null,
        buyerVelocityPerSec: metricsAvailable
          ? numberOrNull(metrics?.buyerVelocityPerSec)
          : null,
        buyerAccelerationPerSec2: metricsAvailable
          ? numberOrNull(metrics?.buyerAccelerationPerSec2)
          : null,
        holderVelocityPerSec: null,
        holderAccelerationPerSec2: null,
        sampleCount: metrics?.sampleCount ?? 0,
        validMetricSampleCount: metrics?.sampleCount ?? 0,
        insufficientMetrics,
        calculationConfidence: getCalculationConfidence(metrics),
        calculationReasonCodes,
        riskLevel: riskSnapshot?.riskLevel ?? "unknown",
        riskScore: riskSnapshot?.riskScore ?? null,
        hardReject,
        riskReasonCodes: riskSnapshot?.reasonCodes ?? [],
        topRiskWarnings,
        mintAuthorityActive:
          riskSnapshot?.flags.mintAuthorityActive ??
          candidate?.onChainMintAuthorityActive ??
          null,
        freezeAuthorityActive:
          riskSnapshot?.flags.freezeAuthorityActive ??
          candidate?.onChainFreezeAuthorityActive ??
          null,
        liquidityRisk: getLiquidityRisk(riskSnapshot),
        concentrationRisk: getConcentrationRisk(riskSnapshot),
        washTradingSuspected: riskSnapshot?.flags.washTradingSuspected ?? null,
        honeypotSuspected: riskSnapshot?.flags.honeypotSuspected ?? null,
        action,
        lifecycleState,
        score: cardScore,
        scoreLabel: `${cardScore}/100`,
        signalStrength,
        combinedReasonCodes: uniqueReasonCodes([
          ...(decision?.combinedReasonCodes ?? token.reasonCodes),
          ...calculationReasonCodes
        ]),
        buyReady:
          action === "PAPER_BUY_READY" &&
          !hardReject &&
          !insufficientMetrics &&
          riskSnapshot?.riskLevel !== "critical",
        rejectReason,
        strategyName: "paper-momentum-risk-v1",
        signalUpdatedAt:
          decision?.updatedAt ?? candidate?.lastUpdatedAt ?? null,
        strategy: buildStrategyExplanation({
          action,
          calculationReasonCodes,
          hardReject,
          metrics,
          riskSnapshot,
          score,
          signalStrength,
          updatedAt: decision?.updatedAt ?? candidate?.lastUpdatedAt ?? null
        }),
        rawEventCount: tokenEvents.length,
        actualTradeEventCount: actualDataSummary?.eventCount ?? 0,
        marketObservationCount: marketObservations.length,
        chainVerificationStatus:
          candidate?.chainVerificationStatus ??
          (getLatestChainVerification(token.mint)
            ? "verified"
            : ("not_checked" as const)),
        feedProvider: feed.name,
        dataSourceWarnings,
        missingFields,
        unavailableFields,
        lastUpdatedAt:
          metrics?.lastUpdatedAt ??
          decision?.updatedAt ??
          candidate?.lastUpdatedAt ??
          token.latestEventAt
      };

      return card;
    });
  }

  function getStrategyStatus(): StrategyStatus {
    return {
      strategyName: "paper-momentum-risk-v1",
      thresholds: {
        minScoreForPaperBuyReady: 75,
        minScoreForWatch: 45,
        minSampleCount: 8,
        criticalRiskBlocksBuyReady: true,
        hardRejectBlocksBuyReady: true,
        insufficientMetricsBlocksBuyReady: true
      },
      scoringWeights: {
        rollingMomentumWeight: 0.65,
        legacyMomentumWeight: 0.35,
        momentumMultiplier: 0.55,
        qualityMultiplier: 0.55,
        riskPenaltyMultiplier: 1
      },
      safetyGates: [
        "PAPER_ONLY",
        "HARD_REJECT_BLOCKS_BUY_READY",
        "CRITICAL_RISK_BLOCKS_BUY_READY",
        "INSUFFICIENT_METRICS_BLOCKS_BUY_READY",
        "PAPER_AUTO_ORDER_DEFAULT_FALSE",
        "NO_TRADING_CONTROLS"
      ],
      formula: [
        "total = clamp(momentum * 0.55 + quality * 0.55 - riskPenalty, 0, 100)",
        "rolling momentum blends volume, volume acceleration, buyer velocity, buyer acceleration, price velocity, buy/sell ratio, net pressure, and trade activity",
        "holder derivatives are displayed only when a real holder time series exists"
      ],
      paperOnly: true,
      reasonCodes: [
        "STRATEGY_STATUS_READ_ONLY",
        "PAPER_ONLY",
        "NO_TRADING_CONTROLS"
      ]
    };
  }

  function handleFeedEvent(event: FeedEvent): void {
    const actualDataSummary =
      event.type === "trade" && event.source === "pumpportal"
        ? actualData.handlePumpPortalTradeEvent(event)
        : undefined;
    const identity = tokenIdentity.ingestFeedEvent(event);
    const identitySummary = toTokenIdentitySummary(identity);

    saveFeedEvent(event);
    const rollingMetrics = metricsEngine.ingestFeedEvent(event);
    const ingestedCandidate = candidateEngine.ingestFeedEvent(event);
    const candidate =
      candidateEngine.updateTokenIdentity(
        ingestedCandidate.mint,
        identitySummary
      ) ?? ingestedCandidate;
    const watchPlan = watchOrchestration.handleFeedEvent(event, {
      mint: candidate.mint,
      ...(candidate.symbol ? { symbol: candidate.symbol } : {}),
      ...(candidate.source ? { source: candidate.source } : {})
    });

    if (watchPlan) {
      candidateEngine.updateWatchPlan(
        candidate.mint,
        createWatchPlanSummary(watchPlan)
      );
    }

    if (event.type === "trade" && event.marketObservation) {
      candidateEngine.updateMarketObservation(
        candidate.mint,
        event.marketObservation
      );
    }

    if (!watchOrchestration.getStatus().enabled) {
      chainEvents.maybeWatchCandidate({
        address: candidate.mint,
        kind: "mint",
        mint: candidate.mint,
        ...(candidate.symbol ? { symbol: candidate.symbol } : {}),
        ...(candidate.source ? { source: candidate.source } : {}),
        reasonCodes: ["CHAIN_EVENTS_CANDIDATE_MINT"]
      });
    }
    const latestMetrics =
      rollingMetrics ?? metricsEngine.getMetrics(candidate.mint);
    candidateEngine.updateMetrics(candidate.mint, latestMetrics);

    const effectiveMetrics = mergeRollingIntoLegacyMetrics(
      getLegacyMetrics(event),
      latestMetrics
    );
    const shouldVerifyOnChain =
      !watchOrchestration.getStatus().enabled &&
      chainVerifier.shouldVerifyFeedEvent(event);

    if (shouldVerifyOnChain) {
      candidateEngine.updateChainVerification(
        candidate.mint,
        createPendingChainVerificationSummary(candidate.mint, event.timestamp)
      );
    }

    const riskSnapshot = riskEngine.evaluateRisk(
      createRiskInput({
        candidate,
        event,
        metrics: effectiveMetrics,
        rollingMetrics: latestMetrics
      })
    );
    riskSnapshots.set(candidate.mint, riskSnapshot);
    saveRiskSnapshot(riskSnapshot);
    candidateEngine.updateRisk(candidate.mint, riskSnapshot);

    const score = scoreFeedCandidate({
      candidate,
      event,
      metrics: effectiveMetrics,
      riskSnapshot,
      rollingMetrics: latestMetrics
    });
    candidateEngine.updateScore(candidate.mint, score);
    const decision = candidateEngine.evaluateCandidate(candidate.mint);
    const liveToken = liveTokens.ingestLiveFeedEvent(event, {
      candidate,
      ...(decision ? { decision } : {}),
      identity: identitySummary,
      riskSnapshot,
      score
    });

    if (liveToken) {
      saveLiveFeedEvent({
        sessionId: liveTokens.getStatus().sessionId,
        provider: "pumpportal",
        eventType: getLiveFeedEventType(event),
        mint: liveToken.mint,
        name: liveToken.name ?? null,
        symbol: liveToken.symbol ?? null,
        title: liveToken.title ?? null,
        realData: true,
        reasonCodes: liveToken.reasonCodes,
        payload: event,
        createdAt: event.timestamp
      });
    }

    if (!decision) {
      app.log.trace({ mint: candidate.mint }, "Candidate decision unavailable");
      return;
    }

    saveCandidateDecision(decision);
    actualData.maybeAutoSubscribeForEvent(event, decision);

    const nextActualDataSummary =
      actualDataSummary ?? actualData.getCandidateSummary(candidate.mint);
    const signal = createOverlaySignal({
      ...(nextActualDataSummary
        ? { actualDataSummary: nextActualDataSummary }
        : {}),
      candidate,
      decision,
      metrics: effectiveMetrics,
      riskSnapshot,
      rollingMetrics: latestMetrics,
      score
    });
    const storedSignal = saveSignal(signal);
    cacheSignal(signal);

    if (
      paperAutoOrder &&
      decision.action === "PAPER_BUY_READY" &&
      !signal.hardReject
    ) {
      const paperResult = executor.submitPaperBuy(signal);
      persistPaperTradeResult(signal, storedSignal.id, paperResult);
      const orderDecision = candidateEngine.markPaperOrderSubmitted(
        signal.mint,
        [paperResult.reason]
      );

      if (orderDecision) {
        saveCandidateDecision(orderDecision);
      }

      app.log.info(
        {
          mint: signal.mint,
          action: signal.action,
          paperResult: paperResult.reason
        },
        "Paper execution evaluated signal"
      );
    }

    broadcast({
      type: "signal",
      signal
    });

    if (shouldVerifyOnChain) {
      void verifyAndApplyChainResult({
        event,
        mint: candidate.mint
      });
    }
  }

  async function verifyMintForHttp(
    mint: string,
    reply: FastifyReply
  ): Promise<unknown> {
    try {
      const record = await chainVerifier.verifyMint(mint);
      const stored = saveChainVerification(
        chainVerifier.toStorageInput(record)
      );
      applyChainVerificationToCandidate({
        event: undefined,
        record
      });
      return {
        ...stored,
        summary: record.summary
      };
    } catch (error) {
      if (error instanceof ChainVerifierUnavailableError) {
        return reply.code(409).send({
          error: error.code,
          message: error.message,
          chainVerifier: chainVerifier.getStatus()
        });
      }

      throw error;
    }
  }

  async function verifyAndApplyChainResult(options: {
    event: FeedEvent | undefined;
    mint: string;
  }): Promise<void> {
    try {
      const record = await chainVerifier.verifyMint(options.mint);
      saveChainVerification(chainVerifier.toStorageInput(record));
      applyChainVerificationToCandidate({
        event: options.event,
        record
      });
    } catch (error) {
      app.log.warn(
        {
          error,
          mint: options.mint
        },
        "Read-only chain verification failed"
      );
    }
  }

  function applyChainVerificationToCandidate(options: {
    event: FeedEvent | undefined;
    record: ChainVerificationRecord;
  }): void {
    const candidate = candidateEngine.getCandidate(options.record.mint);

    if (!candidate) {
      return;
    }

    candidateEngine.updateChainVerification(
      options.record.mint,
      options.record.summary
    );
    if (!watchOrchestration.getStatus().enabled) {
      chainEvents.maybeWatchChainVerified({
        address: options.record.mint,
        kind: "mint",
        mint: options.record.mint,
        ...(candidate.symbol ? { symbol: candidate.symbol } : {}),
        ...(candidate.source ? { source: candidate.source } : {}),
        reasonCodes: ["CHAIN_EVENTS_CHAIN_VERIFIED_MINT"]
      });
    }

    const latestMetrics = metricsEngine.getMetrics(options.record.mint);
    const effectiveMetrics = mergeRollingIntoLegacyMetrics(
      options.event
        ? getLegacyMetrics(options.event)
        : fallbackMetricsFromCandidate(candidate),
      latestMetrics
    );
    const riskSnapshot = withChainReasonCodes(
      riskEngine.evaluateRisk(
        createRiskInput({
          candidate,
          event: options.event,
          metrics: effectiveMetrics,
          rollingMetrics: latestMetrics,
          chainRiskPatch: options.record.riskInputPatch
        })
      ),
      options.record.reasonCodes
    );
    riskSnapshots.set(candidate.mint, riskSnapshot);
    saveRiskSnapshot(riskSnapshot);
    candidateEngine.updateRisk(candidate.mint, riskSnapshot);

    const score = scoreFeedCandidate({
      candidate,
      event: options.event,
      metrics: effectiveMetrics,
      riskSnapshot,
      rollingMetrics: latestMetrics
    });
    candidateEngine.updateScore(candidate.mint, score);
    const decision = candidateEngine.evaluateCandidate(candidate.mint);

    if (!decision) {
      return;
    }

    saveCandidateDecision(decision);

    const signal = createOverlaySignal({
      candidate,
      decision,
      metrics: effectiveMetrics,
      riskSnapshot,
      rollingMetrics: latestMetrics,
      score
    });
    saveSignal(signal);
    cacheSignal(signal);
    broadcast({
      type: "signal",
      signal
    });
  }

  function createOverlaySignal(options: {
    actualDataSummary?: ActualDataCandidateSummary;
    candidate: CandidateState;
    decision: CandidateDecision;
    metrics: RollingMetrics;
    riskSnapshot: RiskSnapshot;
    rollingMetrics: RollingMetricsSnapshot | undefined;
    score: ScoreBreakdown;
  }): OverlaySignal {
    const identity =
      options.candidate.identity ??
      getTokenIdentitySummary(options.candidate.mint);
    const state: SignalState = {
      candidate: createTokenCandidateFromState(options.candidate),
      metrics: options.metrics,
      riskFlags: createRiskFlagsFromSnapshot(options.riskSnapshot),
      score: options.score,
      updatedAt:
        options.rollingMetrics?.lastUpdatedAt ?? options.decision.updatedAt
    };
    const actualDataSummary =
      options.actualDataSummary ??
      actualData.getCandidateSummary(options.candidate.mint);

    const signal: OverlaySignal = {
      mint: options.candidate.mint,
      symbol: identity?.symbol ?? options.candidate.symbol ?? "UNKNOWN",
      ...(identity?.name
        ? { name: identity.name }
        : options.candidate.name
          ? { name: options.candidate.name }
          : {}),
      ...(identity?.title
        ? { title: identity.title }
        : options.candidate.title
          ? { title: options.candidate.title }
          : {}),
      ...(identity?.displayName
        ? { displayName: identity.displayName }
        : options.candidate.displayName
          ? { displayName: options.candidate.displayName }
          : {}),
      ...(identity?.imageUri !== undefined
        ? { imageUri: identity.imageUri }
        : options.candidate.imageUri !== undefined
          ? { imageUri: options.candidate.imageUri }
          : {}),
      ...(identity
        ? {
            identity,
            identityConfidence: identity.confidence,
            identityResolved: identity.resolved,
            identityReasonCodes: identity.reasonCodes,
            identitySource: identity.dataSource
          }
        : {}),
      score: options.decision.score,
      action: signalActionFromDecision(options.decision),
      hardReject: options.decision.hardReject,
      reasonCodes: options.decision.combinedReasonCodes,
      feedProvider: feed.name,
      candidateDecision: options.decision,
      candidateDecisionAction: options.decision.action,
      combinedReasonCodes: options.decision.combinedReasonCodes,
      ...(options.decision.chainVerification
        ? { chainVerification: options.decision.chainVerification }
        : {}),
      ...(options.decision.chainVerificationStatus
        ? { chainVerificationStatus: options.decision.chainVerificationStatus }
        : {}),
      insufficientMetrics: options.decision.metricsSummary.insufficientMetrics,
      lifecycleState: options.decision.lifecycleState,
      ...(options.decision.marketObservationSummary
        ? {
            marketObservationSummary: options.decision.marketObservationSummary
          }
        : {}),
      ...(options.decision.marketReasonCodes
        ? { marketReasonCodes: options.decision.marketReasonCodes }
        : {}),
      ...(actualDataSummary ? { actualData: actualDataSummary } : {}),
      ...(options.decision.watchPlanSummary
        ? { watchPlanSummary: options.decision.watchPlanSummary }
        : {}),
      ...(options.decision.watchReasonCodes
        ? { watchReasonCodes: options.decision.watchReasonCodes }
        : {}),
      riskLevel: options.riskSnapshot.riskLevel,
      riskReasonCodes: options.riskSnapshot.reasonCodes,
      riskScore: options.riskSnapshot.riskScore,
      riskSnapshot: options.riskSnapshot,
      scoreReasonCodes: options.score.reasonCodes,
      volumeVelocity: Math.max(
        getEffectiveVolumeVelocity(options.rollingMetrics) ??
          options.metrics.volumeVelocity,
        0
      ),
      buyerVelocity: Math.max(
        options.rollingMetrics?.buyerVelocityPerSec ??
          options.metrics.buyerVelocity,
        0
      ),
      riskFlags: state.riskFlags,
      state
    };

    if (options.rollingMetrics) {
      signal.buySellRatio = options.rollingMetrics.buySellRatio;
      signal.buyerAcceleration =
        options.rollingMetrics.buyerAccelerationPerSec2;
      signal.netBuyPressure = options.rollingMetrics.netBuyPressure;
      signal.priceVelocity = getEffectivePriceVelocity(options.rollingMetrics);
      signal.rollingMetrics = options.rollingMetrics;
      signal.volumeAcceleration = getEffectiveVolumeAcceleration(
        options.rollingMetrics
      );
    }

    return signal;
  }

  function scoreFeedCandidate(options: {
    candidate: CandidateState;
    event: FeedEvent | undefined;
    metrics: RollingMetrics;
    riskSnapshot: RiskSnapshot;
    rollingMetrics: RollingMetricsSnapshot | undefined;
  }): ScoreBreakdown {
    const scoringOptions: {
      minSampleCount: number;
      riskSnapshot: RiskSnapshot;
      rollingMetrics?: RollingMetricsSnapshot;
    } = {
      minSampleCount: 8,
      riskSnapshot: options.riskSnapshot
    };

    if (options.rollingMetrics) {
      scoringOptions.rollingMetrics = options.rollingMetrics;
    }

    const score = scoreCandidate(
      createTokenCandidateFromState(options.candidate),
      options.metrics,
      options.event
        ? getRiskFlags(options.event)
        : createRiskFlagsFromSnapshot(options.riskSnapshot),
      scoringOptions
    );

    if (options.event?.source === "solana_rpc") {
      return {
        ...score,
        reasonCodes: uniqueReasonCodes([
          "CHAIN_TRADE_EVENT",
          ...(options.event.reasonCodes ?? []),
          ...score.reasonCodes
        ])
      };
    }

    if (
      !options.event ||
      options.event.source !== "pumpportal" ||
      options.event.metricsComplete !== false
    ) {
      return score;
    }

    const realFeedReason =
      options.event.rawSourceEventType === "migration"
        ? "REAL_FEED_MIGRATION_EVENT"
        : "REAL_FEED_NEW_TOKEN_EVENT";

    return {
      ...score,
      action: score.hardReject ? "HARD_REJECT" : "IGNORE",
      reasonCodes: uniqueReasonCodes([
        "INSUFFICIENT_METRICS",
        "INSUFFICIENT_TRADE_METRICS",
        "INSUFFICIENT_RISK_DATA",
        realFeedReason,
        ...score.reasonCodes
      ]),
      total: score.hardReject ? 0 : Math.min(score.total, 20)
    };
  }

  function persistPaperTradeResult(
    signal: OverlaySignal,
    signalId: number,
    paperResult: PaperTradeResult
  ): void {
    if (paperResult.order) {
      savePaperOrder({
        ...paperResult.order,
        signalId,
        payload: {
          reason: paperResult.reason,
          signal
        }
      });
    }

    if (paperResult.position) {
      upsertPaperPosition({
        mint: paperResult.position.mint,
        symbol: paperResult.position.symbol,
        sizeSol: paperResult.position.sizeSol,
        tokenAmount: paperResult.position.tokenAmount,
        entryPrice: paperResult.position.entryPrice,
        status: paperResult.position.status,
        payload: paperResult.position,
        openedAt: paperResult.position.openedAt,
        updatedAt: paperResult.position.updatedAt
      });
    }
  }

  function broadcast(payload: unknown): void {
    for (const client of clients) {
      sendJson(client, payload);
    }
  }

  function cacheSignal(signal: OverlaySignal): void {
    signals.delete(signal.mint);
    signals.set(signal.mint, signal);

    while (signals.size > maxSignalCacheSize) {
      const oldestMint = signals.keys().next().value;

      if (!oldestMint) {
        return;
      }

      signals.delete(oldestMint);
    }
  }

  function enrichCandidate(candidate: CandidateState):
    | CandidateState
    | (CandidateState & {
        actualData?: ActualDataCandidateSummary;
        identity?: TokenIdentitySummary;
      }) {
    const actualDataSummary = actualData.getCandidateSummary(candidate.mint);
    const identity =
      candidate.identity ?? getTokenIdentitySummary(candidate.mint);

    return {
      ...candidate,
      ...(actualDataSummary ? { actualData: actualDataSummary } : {}),
      ...(identity ? { identity } : {})
    };
  }

  function enrichMetricsWithIdentity<T extends { mint: string }>(
    metrics: T
  ): T & { identity?: TokenIdentitySummary } {
    const identity = getTokenIdentitySummary(metrics.mint);

    return identity
      ? {
          ...metrics,
          identity
        }
      : metrics;
  }

  function enrichRowWithIdentity<T extends { mint: string }>(
    row: T
  ): T & { identity?: TokenIdentitySummary } {
    const identity = getTokenIdentitySummary(row.mint);

    return identity
      ? {
          ...row,
          identity
        }
      : row;
  }

  function getTokenIdentitySummary(
    mint: string
  ): TokenIdentitySummary | undefined {
    const identity = tokenIdentity.getIdentity(mint);
    return identity ? toTokenIdentitySummary(identity) : undefined;
  }

  function sendJson(socket: WebSocket, payload: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  if (options.startFeed) {
    startFeed();
  }

  return {
    actualData,
    app,
    candidates: candidateEngine,
    chainEvents,
    close: () => app.close(),
    emitFeedEvent: handleFeedEvent,
    feed,
    getSignals: () => Array.from(signals.values()),
    metrics: metricsEngine,
    risk: riskEngine,
    chainVerifier,
    liveTokens,
    watchOrchestration,
    startFeed,
    stopFeed,
    storage,
    tokenIdentity
  };
}

function createRiskInput(options: {
  candidate: CandidateState;
  chainRiskPatch?: ChainVerificationRecord["riskInputPatch"];
  event: FeedEvent | undefined;
  metrics: RollingMetrics;
  rollingMetrics: RollingMetricsSnapshot | undefined;
}): RiskInput {
  const riskFlags = options.event
    ? getRiskFlags(options.event)
    : options.candidate.latestRisk
      ? createRiskFlagsFromSnapshot(options.candidate.latestRisk)
      : createFallbackRiskFlags();
  const rolling = options.rollingMetrics;
  const source = options.candidate.source ?? options.event?.source ?? "unknown";
  const scenario = getMockScenario(source);
  const incompleteRealFeed =
    options.event?.source === "pumpportal" &&
    (options.event.metricsComplete === false ||
      options.event.reasonCodes?.includes("PUMPPORTAL_TOKEN_TRADE") === true);

  const input: RiskInput = {
    mint: options.candidate.mint,
    source,
    mintAuthorityActive: incompleteRealFeed
      ? null
      : riskFlags.mintAuthorityActive,
    freezeAuthorityActive: incompleteRealFeed
      ? null
      : riskFlags.freezeAuthorityActive,
    metadataMutable: incompleteRealFeed ? null : riskFlags.mutableMetadata,
    holderCount: incompleteRealFeed ? null : options.metrics.holderCount,
    topHolderPct: incompleteRealFeed ? null : options.metrics.topHolderPercent,
    top10HolderPct: incompleteRealFeed
      ? null
      : options.metrics.top10HolderPercent,
    devHolderPct: incompleteRealFeed ? null : mockDevHolderPct(scenario),
    insiderHolderPct: incompleteRealFeed
      ? null
      : mockInsiderHolderPct(scenario),
    devSoldPct: incompleteRealFeed ? null : mockDevSoldPct(scenario),
    devNetFlowUsd: incompleteRealFeed ? null : mockDevNetFlowUsd(scenario),
    priorLaunchCount: incompleteRealFeed
      ? null
      : mockPriorLaunchCount(scenario),
    priorRugCount: incompleteRealFeed ? null : mockPriorRugCount(scenario),
    buySellRatio: rolling?.buySellRatio ?? null,
    netBuyPressure: rolling?.netBuyPressure ?? null,
    uniqueBuyers: rolling?.windows["10s"].uniqueBuyers ?? null,
    uniqueSellers: rolling?.windows["10s"].uniqueSellers ?? null,
    volumeVelocity: getEffectiveVolumeVelocity(rolling) ?? null,
    volumeAcceleration: getEffectiveVolumeAcceleration(rolling) ?? null,
    buyerVelocity: rolling?.buyerVelocityPerSec ?? null,
    buyerAcceleration: rolling?.buyerAccelerationPerSec2 ?? null,
    priceVelocity: getEffectivePriceVelocity(rolling) ?? null,
    priceAcceleration: getEffectivePriceAcceleration(rolling) ?? null,
    largestTradeShare: rolling?.largestTradeShare ?? null,
    sampleCount: rolling?.sampleCount ?? null,
    insufficientMetrics:
      rolling?.insufficientMetrics ??
      (options.event?.metricsComplete === false ? true : null),
    liquidityUsd: incompleteRealFeed ? null : options.metrics.liquidityUsd,
    marketCapUsd: incompleteRealFeed ? null : options.metrics.marketCapUsd,
    fdvUsd: incompleteRealFeed ? null : options.metrics.marketCapUsd,
    estimatedSellSlippagePct: incompleteRealFeed
      ? null
      : mockSellSlippagePct(scenario, riskFlags),
    sniperPct: incompleteRealFeed ? null : mockSniperPct(scenario),
    bundlerPct: incompleteRealFeed ? null : mockBundlerPct(scenario),
    washTradingSuspected: incompleteRealFeed
      ? null
      : riskFlags.washTradingSuspected,
    honeypotSuspected: incompleteRealFeed ? null : riskFlags.honeypotSuspected
  };

  if (options.candidate.symbol) {
    input.symbol = options.candidate.symbol;
  }

  if (options.candidate.name) {
    input.name = options.candidate.name;
  }

  return mergeChainRiskPatch(input, options.chainRiskPatch);
}

function createTokenCandidateFromState(state: CandidateState): TokenCandidate {
  return {
    id: {
      chain: "solana",
      mint: state.mint
    },
    mint: state.mint,
    symbol: state.symbol ?? "UNKNOWN",
    name: state.name ?? state.symbol ?? "Unknown Token",
    source: state.source ?? "unknown",
    ageSeconds: state.ageSeconds,
    firstSeenAt: state.firstSeenAt,
    ...(state.title ? { title: state.title } : {}),
    ...(state.displayName ? { displayName: state.displayName } : {}),
    ...(state.metadataUri !== undefined
      ? { metadataUri: state.metadataUri }
      : {}),
    ...(state.imageUri !== undefined ? { imageUri: state.imageUri } : {}),
    ...(state.description !== undefined
      ? { description: state.description }
      : {}),
    ...(state.website !== undefined ? { website: state.website } : {}),
    ...(state.twitter !== undefined ? { twitter: state.twitter } : {}),
    ...(state.telegram !== undefined ? { telegram: state.telegram } : {}),
    ...(state.discord !== undefined ? { discord: state.discord } : {}),
    ...(state.creator !== undefined ? { creator: state.creator } : {})
  };
}

function getLegacyMetrics(event: FeedEvent): RollingMetrics {
  return event.metrics;
}

function getLiveFeedEventType(event: FeedEvent): string {
  return event.type === "token_created" &&
    event.rawSourceEventType?.toLowerCase().includes("migr")
    ? "migration"
    : "new_token";
}

function getRiskFlags(event: FeedEvent): RiskFlags {
  return event.riskFlags;
}

function createPendingChainVerificationSummary(
  mint: string,
  inspectedAt: string
): ChainVerificationSummary {
  return {
    mint,
    status: "pending",
    reasonCodes: ["CHAIN_VERIFICATION_PENDING"],
    inspectedAt
  };
}

function withChainReasonCodes(
  snapshot: RiskSnapshot,
  reasonCodes: string[]
): RiskSnapshot {
  return {
    ...snapshot,
    reasonCodes: uniqueReasonCodes([...snapshot.reasonCodes, ...reasonCodes])
  };
}

function fallbackMetricsFromCandidate(
  candidate: CandidateState
): RollingMetrics {
  const metrics = candidate.latestMetrics;

  if (!metrics) {
    return createEmptyLegacyMetrics();
  }

  return {
    priceUsd: metrics.latestPriceUsd,
    priceSol: metrics.latestPriceSol ?? null,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: metrics.windows["60s"].totalVolumeUsd,
    volume5mUsd: metrics.windows["60s"].totalVolumeUsd,
    volume15mUsd: metrics.windows["60s"].totalVolumeUsd,
    volumeSol: metrics.windows["60s"].totalVolumeSol ?? null,
    buyCount1m: metrics.windows["60s"].buyTradeCount,
    buyCount5m: metrics.windows["60s"].buyTradeCount,
    sellCount1m: metrics.windows["60s"].sellTradeCount,
    sellCount5m: metrics.windows["60s"].sellTradeCount,
    uniqueBuyers1m: metrics.windows["60s"].uniqueBuyers,
    uniqueBuyers5m: metrics.windows["60s"].uniqueBuyers,
    uniqueSellers1m: metrics.windows["60s"].uniqueSellers,
    uniqueSellers5m: metrics.windows["60s"].uniqueSellers,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: metrics.windows["60s"].priceChangePct,
    priceChange5mPct: metrics.windows["10s"].priceChangePct,
    volumeVelocity: Math.max(0, metrics.volumeVelocityUsdPerSec),
    buyerVelocity: Math.max(0, metrics.buyerVelocityPerSec)
  };
}

function createEmptyLegacyMetrics(): RollingMetrics {
  return {
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
  };
}

function createFallbackRiskFlags(): RiskFlags {
  return {
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    topHolderConcentrationHigh: false,
    mutableMetadata: false,
    suspiciousName: false,
    lowLiquidity: false,
    washTradingSuspected: false,
    honeypotSuspected: false
  };
}

function createRiskFlagsFromSnapshot(snapshot: RiskSnapshot): RiskFlags {
  return {
    mintAuthorityActive: snapshot.flags.mintAuthorityActive === true,
    freezeAuthorityActive: snapshot.flags.freezeAuthorityActive === true,
    topHolderConcentrationHigh:
      snapshot.reasonCodes.includes("TOP_HOLDER_TOO_HIGH") ||
      snapshot.reasonCodes.includes("TOP10_HOLDER_TOO_HIGH") ||
      snapshot.reasonCodes.includes("HOLDER_CONCENTRATION_ELEVATED"),
    mutableMetadata: snapshot.flags.metadataMutable === true,
    suspiciousName: false,
    lowLiquidity: snapshot.reasonCodes.includes("LIQUIDITY_TOO_LOW"),
    washTradingSuspected: snapshot.flags.washTradingSuspected === true,
    honeypotSuspected: snapshot.flags.honeypotSuspected === true
  };
}

function mergeChainRiskPatch(
  input: RiskInput,
  patch: ChainVerificationRecord["riskInputPatch"] | undefined
): RiskInput {
  if (!patch) {
    return input;
  }

  return {
    ...input,
    estimatedSellSlippagePct:
      patch.estimatedSellSlippagePct ?? input.estimatedSellSlippagePct,
    freezeAuthorityActive:
      patch.freezeAuthorityActive ?? input.freezeAuthorityActive,
    holderCount: patch.holderCount ?? input.holderCount,
    liquidityUsd: patch.liquidityUsd ?? input.liquidityUsd,
    mintAuthorityActive: patch.mintAuthorityActive ?? input.mintAuthorityActive,
    top10HolderPct: patch.top10HolderPct ?? input.top10HolderPct,
    topHolderPct: patch.topHolderPct ?? input.topHolderPct
  };
}

function signalActionFromDecision(
  decision: CandidateDecision
): OverlaySignal["action"] {
  if (decision.action === "REJECT") {
    return "HARD_REJECT";
  }

  if (
    decision.action === "PAPER_BUY_READY" ||
    decision.action === "PAPER_ORDER_SUBMITTED"
  ) {
    return "BUY_READY";
  }

  return decision.action;
}

function getMockScenario(
  source: string
): "normal" | "momentum" | "rug" | "flat" | "unknown" {
  if (source.includes("momentum")) {
    return "momentum";
  }

  if (source.includes("rug")) {
    return "rug";
  }

  if (source.includes("flat")) {
    return "flat";
  }

  if (source.includes("normal") || source === "mock") {
    return "normal";
  }

  return "unknown";
}

function mockDevHolderPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 18 : scenario === "momentum" ? 3 : 6;
}

function mockInsiderHolderPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 28 : scenario === "momentum" ? 5 : 9;
}

function mockDevSoldPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 65 : 0;
}

function mockDevNetFlowUsd(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? -8_000 : 500;
}

function mockPriorLaunchCount(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 8 : 2;
}

function mockPriorRugCount(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 3 : 0;
}

function mockSellSlippagePct(
  scenario: ReturnType<typeof getMockScenario>,
  riskFlags: RiskFlags
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  if (scenario === "rug" || riskFlags.lowLiquidity) {
    return 22;
  }

  return scenario === "momentum" ? 3 : 6;
}

function mockSniperPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 30 : scenario === "momentum" ? 4 : 9;
}

function mockBundlerPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 26 : scenario === "momentum" ? 3 : 7;
}

function getEffectiveVolumeVelocity(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? (metrics.volumeVelocitySolPerSec ?? 0)
    : metrics.volumeVelocityUsdPerSec;
}

function getEffectiveVolumeAcceleration(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? (metrics.volumeAccelerationSolPerSec2 ?? 0)
    : metrics.volumeAccelerationUsdPerSec2;
}

function getEffectivePriceVelocity(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? (metrics.priceSolVelocityPctPerSec ?? 0)
    : metrics.priceVelocityPctPerSec;
}

function getEffectivePriceAcceleration(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? (metrics.priceSolAccelerationPctPerSec2 ?? 0)
    : metrics.priceAccelerationPctPerSec2;
}

function mergeRollingIntoLegacyMetrics(
  metrics: RollingMetrics,
  rollingMetrics: RollingMetricsSnapshot | undefined
): RollingMetrics {
  if (!rollingMetrics || rollingMetrics.sampleCount === 0) {
    return metrics;
  }

  const window60s = rollingMetrics.windows["60s"];
  const window10s = rollingMetrics.windows["10s"];

  return {
    ...metrics,
    priceUsd: rollingMetrics.latestPriceUsd || metrics.priceUsd,
    priceSol: rollingMetrics.latestPriceSol ?? metrics.priceSol ?? null,
    volume1mUsd: window60s.totalVolumeUsd,
    volume5mUsd: Math.max(metrics.volume5mUsd, window60s.totalVolumeUsd),
    volume15mUsd: Math.max(metrics.volume15mUsd, window60s.totalVolumeUsd),
    volumeSol: window60s.totalVolumeSol ?? metrics.volumeSol ?? null,
    buyCount1m: window60s.buyTradeCount,
    buyCount5m: Math.max(metrics.buyCount5m, window60s.buyTradeCount),
    sellCount1m: window60s.sellTradeCount,
    sellCount5m: Math.max(metrics.sellCount5m, window60s.sellTradeCount),
    uniqueBuyers1m: window60s.uniqueBuyers,
    uniqueBuyers5m: Math.max(metrics.uniqueBuyers5m, window60s.uniqueBuyers),
    uniqueSellers1m: window60s.uniqueSellers,
    uniqueSellers5m: Math.max(metrics.uniqueSellers5m, window60s.uniqueSellers),
    priceChange1mPct: window60s.priceChangePct,
    priceChange5mPct: window10s.priceChangePct,
    volumeVelocity: Math.max(
      metrics.volumeVelocity,
      rollingMetrics.volumeVelocityUsdPerSec
    ),
    buyerVelocity: Math.max(
      metrics.buyerVelocity,
      rollingMetrics.buyerVelocityPerSec
    )
  };
}

function getUnavailableCardFields(options: {
  metrics: RollingMetricsSnapshot | undefined;
  metricsAvailable: boolean;
  riskSnapshot: RiskSnapshot | undefined;
}): string[] {
  const fields: string[] = [];

  if (!options.metricsAvailable) {
    fields.push(
      "priceSol",
      "priceUsd",
      "priceQuote",
      "quoteAsset",
      "volume1sUsd",
      "volume3sUsd",
      "volume5sUsd",
      "volume10sUsd",
      "volume30sUsd",
      "volume60sUsd",
      "volume1sSol",
      "volume3sSol",
      "volume5sSol",
      "volume10sSol",
      "volume30sSol",
      "volume60sSol",
      "buyVolume10s",
      "sellVolume10s",
      "netVolume10s",
      "buySellRatio",
      "netBuyPressure",
      "uniqueBuyers1s",
      "uniqueBuyers5s",
      "uniqueBuyers10s",
      "uniqueSellers10s",
      "uniqueTraders10s",
      "buyTradeCount10s",
      "sellTradeCount10s",
      "totalTradeCount10s",
      "volumeVelocityUsdPerSec",
      "volumeAccelerationUsdPerSec2",
      "volumeVelocitySolPerSec",
      "volumeAccelerationSolPerSec2",
      "priceVelocityPctPerSec",
      "priceAccelerationPctPerSec2",
      "priceSolVelocityPctPerSec",
      "priceSolAccelerationPctPerSec2",
      "buyerVelocityPerSec",
      "buyerAccelerationPerSec2"
    );
  }

  if (!options.metrics?.hasUsdMetrics) {
    fields.push(
      "priceUsd",
      "volume1sUsd",
      "volume3sUsd",
      "volume5sUsd",
      "volume10sUsd",
      "volume30sUsd",
      "volume60sUsd",
      "volumeVelocityUsdPerSec",
      "volumeAccelerationUsdPerSec2",
      "priceVelocityPctPerSec",
      "priceAccelerationPctPerSec2"
    );
  }

  if (!options.metrics?.hasSolMetrics) {
    fields.push(
      "priceSol",
      "volume1sSol",
      "volume3sSol",
      "volume5sSol",
      "volume10sSol",
      "volume30sSol",
      "volume60sSol",
      "volumeVelocitySolPerSec",
      "volumeAccelerationSolPerSec2",
      "priceSolVelocityPctPerSec",
      "priceSolAccelerationPctPerSec2"
    );
  }

  if (options.riskSnapshot?.flags.marketCapUsd == null) {
    fields.push("marketCapUsd");
  }

  if (options.riskSnapshot?.flags.fdvUsd == null) {
    fields.push("fdvUsd");
  }

  if (options.riskSnapshot?.flags.liquidityUsd == null) {
    fields.push("liquidityUsd");
  }

  if (options.riskSnapshot?.flags.holderCount == null) {
    fields.push("holderCount", "holders");
  }

  if (options.riskSnapshot?.flags.topHolderPct == null) {
    fields.push("topHolderPct");
  }

  if (options.riskSnapshot?.flags.top10HolderPct == null) {
    fields.push("top10HolderPct");
  }

  fields.push("holderVelocityPerSec", "holderAccelerationPerSec2");

  return uniqueReasonCodes(fields);
}

function getMissingCardFields(options: {
  identity: TokenIdentitySummary | undefined;
  token: LiveToken;
}): string[] {
  const fields: string[] = [];

  if (!options.identity?.metadataUri) {
    fields.push("metadataUri");
  }

  if (!options.identity?.imageUri) {
    fields.push("imageUri");
  }

  if (!options.identity?.name && !options.token.name) {
    fields.push("name");
  }

  if (!options.identity?.symbol && !options.token.symbol) {
    fields.push("symbol");
  }

  if (!options.token.latestSignature) {
    fields.push("latestSignature");
  }

  return fields;
}

function buildStrategyExplanation(options: {
  action: string;
  calculationReasonCodes: string[];
  hardReject: boolean;
  metrics: RollingMetricsSnapshot | undefined;
  riskSnapshot: RiskSnapshot | undefined;
  score: ScoreBreakdown | undefined;
  signalStrength: SignalStrength;
  updatedAt: string | null;
}): StrategySignalExplanation {
  const volumeVelocity = getEffectiveVolumeVelocity(options.metrics) ?? null;
  const volumeAcceleration =
    getEffectiveVolumeAcceleration(options.metrics) ?? null;
  const priceVelocity = getEffectivePriceVelocity(options.metrics) ?? null;
  const priceAcceleration =
    getEffectivePriceAcceleration(options.metrics) ?? null;
  const positiveDrivers = createPositiveDrivers({
    metrics: options.metrics,
    volumeAcceleration,
    volumeVelocity,
    priceVelocity
  });
  const negativeDrivers = createNegativeDrivers({
    calculationReasonCodes: options.calculationReasonCodes,
    riskSnapshot: options.riskSnapshot
  });
  const blockers = createStrategyBlockers({
    hardReject: options.hardReject,
    metrics: options.metrics,
    riskSnapshot: options.riskSnapshot
  });
  const concentrationPenalty =
    options.riskSnapshot?.reasonCodes.some((code) =>
      [
        "HOLDER_CONCENTRATION_ELEVATED",
        "TOP_HOLDER_TOO_HIGH",
        "TOP10_HOLDER_TOO_HIGH"
      ].includes(code)
    ) === true
      ? 18
      : 0;
  const liquidityPenalty =
    options.riskSnapshot?.reasonCodes.includes("LIQUIDITY_TOO_LOW") === true
      ? 12
      : 0;
  const missingDataPenalty =
    options.metrics === undefined || options.metrics.insufficientMetrics
      ? 10
      : 0;

  return {
    strategyName: "paper-momentum-risk-v1",
    score: options.score?.total ?? 0,
    action: options.action,
    signalStrength: options.signalStrength,
    components: {
      momentumScore: options.score?.momentum ?? 0,
      qualityScore: options.score?.quality ?? 0,
      riskPenalty: options.score?.riskPenalty ?? 0,
      liquidityPenalty,
      concentrationPenalty,
      missingDataPenalty
    },
    positiveDrivers,
    negativeDrivers,
    blockers,
    calculationInputs: {
      volumeVelocity,
      volumeAcceleration,
      priceVelocity,
      priceAcceleration,
      buyerVelocity: options.metrics?.buyerVelocityPerSec ?? null,
      buyerAcceleration: options.metrics?.buyerAccelerationPerSec2 ?? null,
      holderVelocity: null,
      holderAcceleration: null
    },
    lastUpdatedAt: options.updatedAt
  };
}

function createPositiveDrivers(options: {
  metrics: RollingMetricsSnapshot | undefined;
  priceVelocity: number | null;
  volumeAcceleration: number | null;
  volumeVelocity: number | null;
}): StrategySignalDriver[] {
  const drivers: StrategySignalDriver[] = [];

  if (options.volumeVelocity !== null && options.volumeVelocity > 0) {
    drivers.push({
      reasonCode: "VOLUME_VELOCITY",
      label: "Volume velocity",
      value: options.volumeVelocity
    });
  }

  if (options.volumeAcceleration !== null && options.volumeAcceleration > 0) {
    drivers.push({
      reasonCode: "VOLUME_ACCELERATION",
      label: "Volume acceleration",
      value: options.volumeAcceleration
    });
  }

  if (
    options.metrics?.buyerVelocityPerSec !== undefined &&
    options.metrics.buyerVelocityPerSec > 0
  ) {
    drivers.push({
      reasonCode: "BUYER_VELOCITY",
      label: "Buyer velocity",
      value: options.metrics.buyerVelocityPerSec
    });
  }

  if (
    options.metrics?.buyerAccelerationPerSec2 !== undefined &&
    options.metrics.buyerAccelerationPerSec2 > 0
  ) {
    drivers.push({
      reasonCode: "BUYER_ACCELERATION",
      label: "Buyer acceleration",
      value: options.metrics.buyerAccelerationPerSec2
    });
  }

  if (options.priceVelocity !== null && options.priceVelocity > 0) {
    drivers.push({
      reasonCode: "PRICE_VELOCITY",
      label: "Price velocity",
      value: options.priceVelocity
    });
  }

  return drivers;
}

function createNegativeDrivers(options: {
  calculationReasonCodes: string[];
  riskSnapshot: RiskSnapshot | undefined;
}): StrategySignalDriver[] {
  return uniqueReasonCodes([
    ...(options.riskSnapshot?.reasonCodes ?? []),
    ...options.calculationReasonCodes.filter(
      (code) => code.includes("UNAVAILABLE") || code.includes("INSUFFICIENT")
    )
  ])
    .slice(0, 12)
    .map((reasonCode) => ({
      reasonCode,
      label: getReasonLabel(reasonCode),
      value: null
    }));
}

function createStrategyBlockers(options: {
  hardReject: boolean;
  metrics: RollingMetricsSnapshot | undefined;
  riskSnapshot: RiskSnapshot | undefined;
}): StrategySignalDriver[] {
  const blockers: StrategySignalDriver[] = [];

  if (options.hardReject) {
    blockers.push({
      reasonCode: "HARD_REJECT",
      label: "Hard reject",
      value: true
    });
  }

  if (options.riskSnapshot?.riskLevel === "critical") {
    blockers.push({
      reasonCode: "RISK_LEVEL_CRITICAL",
      label: "Critical risk",
      value: options.riskSnapshot.riskLevel
    });
  }

  if (!options.metrics || options.metrics.insufficientMetrics) {
    blockers.push({
      reasonCode: "INSUFFICIENT_TRADE_METRICS",
      label: "Insufficient trade metrics",
      value: options.metrics?.sampleCount ?? 0
    });
  }

  return blockers;
}

function getSignalStrength(options: {
  action: string;
  hardReject: boolean;
  riskLevel: RiskSnapshot["riskLevel"] | undefined;
  score: number;
}): SignalStrength {
  if (
    options.hardReject ||
    options.riskLevel === "critical" ||
    options.action === "REJECT"
  ) {
    return "reject";
  }

  if (options.score >= 75) {
    return "strong";
  }

  if (options.score >= 60) {
    return "moderate";
  }

  if (options.score >= 35) {
    return "weak";
  }

  return "none";
}

function getCalculationConfidence(
  metrics: RollingMetricsSnapshot | undefined
): ObservationConfidence {
  if (!metrics || metrics.sampleCount === 0) {
    return "low";
  }

  if (metrics.sampleCount >= 8) {
    return "high";
  }

  if (metrics.sampleCount >= 3) {
    return "medium";
  }

  return "low";
}

function getTopRiskWarnings(riskSnapshot: RiskSnapshot | undefined): string[] {
  if (!riskSnapshot) {
    return ["RISK_DATA_UNAVAILABLE"];
  }

  return riskSnapshot.reasonCodes
    .filter(
      (code) =>
        code.includes("RISK") ||
        code.includes("AUTHORITY") ||
        code.includes("LIQUIDITY") ||
        code.includes("HOLDER") ||
        code.includes("HONEYPOT") ||
        code.includes("WASH")
    )
    .slice(0, 4);
}

function getLiquidityRisk(riskSnapshot: RiskSnapshot | undefined): string {
  if (!riskSnapshot || riskSnapshot.flags.liquidityUsd === null) {
    return "unknown";
  }

  return riskSnapshot.reasonCodes.includes("LIQUIDITY_TOO_LOW")
    ? "high"
    : "low";
}

function getConcentrationRisk(riskSnapshot: RiskSnapshot | undefined): string {
  if (
    !riskSnapshot ||
    (riskSnapshot.flags.topHolderPct === null &&
      riskSnapshot.flags.top10HolderPct === null)
  ) {
    return "unknown";
  }

  return riskSnapshot.reasonCodes.some((code) =>
    [
      "HOLDER_CONCENTRATION_ELEVATED",
      "TOP_HOLDER_TOO_HIGH",
      "TOP10_HOLDER_TOO_HIGH"
    ].includes(code)
  )
    ? "high"
    : "low";
}

function getHolderDataSource(
  candidate: CandidateState | undefined,
  riskSnapshot: RiskSnapshot | undefined
): string | null {
  if (
    candidate?.onChainTopHolderPct !== null &&
    candidate?.onChainTopHolderPct !== undefined
  ) {
    return "chain_verification";
  }

  if (
    riskSnapshot?.flags.holderCount !== null &&
    riskSnapshot?.flags.holderCount !== undefined
  ) {
    return "risk_snapshot";
  }

  return null;
}

function getAgeSeconds(firstSeenAt: string, nowMs: number): number {
  const firstSeenMs = Date.parse(firstSeenAt);

  if (!Number.isFinite(firstSeenMs)) {
    return 0;
  }

  return Math.max(0, Math.round((nowMs - firstSeenMs) / 1000));
}

function getFreshnessMs(
  timestamp: string | null | undefined,
  nowMs: number
): number | null {
  if (!timestamp) {
    return null;
  }

  const timestampMs = Date.parse(timestamp);

  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return Math.max(0, nowMs - timestampMs);
}

function createTokenTitle(
  symbol: string | undefined,
  name: string | undefined,
  mint: string
): string {
  if (symbol && name) {
    return `${symbol} - ${name}`;
  }

  return name ?? symbol ?? shortMint(mint);
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 8)}...${mint.slice(-6)}`;
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getReasonLabel(reasonCode: string): string {
  return reasonCode
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function createFeedProvider(options: {
  allowMockData: boolean;
  dataFeed: "none" | "mock" | "pumpportal";
  dataFeedMode: LiveFeedMode;
  mockFeedEnabled: boolean;
  mockFeedRequireExplicitEnable: boolean;
  mockFeed?: MockFeedProviderOptions | undefined;
  pumpPortal?: PumpPortalFeedProviderOptions | undefined;
  signalIntervalMs: number;
}): TokenFeedProvider {
  if (options.dataFeedMode === "live") {
    return new PumpPortalFeedProvider(options.pumpPortal);
  }

  if (options.dataFeedMode === "none" || options.dataFeed === "none") {
    return new NoFeedProvider("none", ["NO_REAL_FEED_CONFIGURED"]);
  }

  if (options.dataFeedMode === "replay") {
    return new NoFeedProvider("none", ["NO_FEED_MODE", "REPLAY_MODE"]);
  }

  if (
    (options.dataFeedMode === "mock" || options.dataFeed === "mock") &&
    options.mockFeedRequireExplicitEnable &&
    (!options.allowMockData || !options.mockFeedEnabled)
  ) {
    return new NoFeedProvider("mock-blocked", [
      "MOCK_FEED_BLOCKED_NOT_EXPLICITLY_ALLOWED",
      "NO_REAL_FEED_CONFIGURED"
    ]);
  }

  if (options.dataFeedMode !== "mock" && options.dataFeed !== "mock") {
    return new NoFeedProvider("none", ["NO_REAL_FEED_CONFIGURED"]);
  }

  return new MockFeedProvider({
    intervalMs: options.signalIntervalMs,
    ...options.mockFeed
  });
}

class NoFeedProvider implements TokenFeedProvider {
  readonly reasonCodes: string[];

  constructor(
    readonly name: "none" | "mock-blocked",
    reasonCodes: string[]
  ) {
    this.reasonCodes = reasonCodes;
  }

  start(): void {
    // Intentionally empty: no-feed mode keeps the API alive without fake data.
  }

  stop(): void {
    // Intentionally empty.
  }
}

function parseBooleanEnv(value: unknown): boolean | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }

  return undefined;
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes));
}

export async function startApiServer(
  options: ApiServerOptions = {}
): Promise<ApiServer> {
  const server = createApiServer(options);

  await server.app.listen({
    host: options.host ?? "0.0.0.0",
    port: options.port ?? 8787
  });

  server.startFeed();

  return server;
}
