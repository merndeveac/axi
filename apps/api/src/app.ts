import Fastify, { type FastifyInstance } from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  MockFeedProvider,
  PumpPortalFeedProvider,
  type FeedEvent,
  type MockFeedProviderOptions,
  type PumpPortalFeedProviderOptions,
  type TokenTradeEvent,
  type TokenFeedProvider
} from "@axi/data-feeds";
import { PaperTradeExecutor, type PaperTradeResult } from "@axi/execution";
import {
  createRollingMetricsEngine,
  type RollingMetricsEngine
} from "@axi/metrics";
import { scoreCandidate } from "@axi/scoring";
import {
  BotModeSchema,
  type BotMode,
  type OverlaySignal,
  type RiskFlags,
  type RollingMetrics,
  type RollingMetricsSnapshot,
  type ScoreBreakdown,
  type SignalState,
  type TokenCandidate
} from "@axi/shared";
import {
  closeStorage,
  getStorageStats,
  initStorage,
  listPaperOrders,
  listPaperPositions,
  listRecentSignals,
  saveFeedEvent,
  savePaperOrder,
  saveSignal,
  type StorageHandle,
  upsertPaperPosition
} from "@axi/storage";

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
  DATA_FEED: z.enum(["mock", "pumpportal"]).default("mock"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  SIGNAL_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
  STORAGE_DATABASE_PATH: z.string().min(1).optional(),
  MOCK_FEED_SEED: z
    .preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().optional()),
  MOCK_FEED_SCENARIO: z
    .enum(["normal", "momentum", "rug", "flat"])
    .default("normal"),
  MOCK_FEED_MAX_EVENTS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().positive().optional()
  ),
  PUMPPORTAL_WS_URL: z
    .preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
  PUMPPORTAL_API_KEY: z
    .preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  PUMPPORTAL_SUBSCRIBE_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_SUBSCRIBE_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  LOG_LEVEL: logLevelSchema.default("info")
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type ApiLogLevel = z.infer<typeof logLevelSchema>;

export type ApiServerOptions = {
  closeStorageOnClose?: boolean;
  dataFeed?: "mock" | "pumpportal";
  feedProvider?: TokenFeedProvider;
  host?: string;
  logLevel?: ApiLogLevel | false;
  mockFeed?: MockFeedProviderOptions | undefined;
  mode?: BotMode;
  port?: number;
  pumpPortal?: PumpPortalFeedProviderOptions | undefined;
  signalIntervalMs?: number;
  startFeed?: boolean;
  storageDatabasePath?: string;
};

export type ApiServer = {
  app: FastifyInstance;
  close: () => Promise<void>;
  emitFeedEvent: (event: FeedEvent) => void;
  feed: TokenFeedProvider;
  metrics: RollingMetricsEngine;
  getSignals: () => OverlaySignal[];
  startFeed: () => void;
  stopFeed: () => Promise<void>;
  storage: StorageHandle;
};

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(50)
});
const mintParamSchema = z.object({
  mint: z.string().min(32)
});

type TokenLifecycleState = {
  candidate: TokenCandidate;
  metrics: RollingMetrics;
  metricsComplete: boolean;
  rawSourceEventType?: string;
  riskFlags: RiskFlags;
  source: string;
  timestamp: string;
};

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return apiConfigSchema.parse(env);
}

export function createApiServer(options: ApiServerOptions = {}): ApiServer {
  const mode = options.mode ?? "paper";

  if (mode === "live") {
    throw new Error("Live mode is not implemented. Start this service with BOT_MODE=paper.");
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
      dataFeed: options.dataFeed ?? "mock",
      mockFeed: options.mockFeed,
      pumpPortal: options.pumpPortal,
      signalIntervalMs: options.signalIntervalMs ?? 2000
    });
  const executor = new PaperTradeExecutor(mode);
  const metricsEngine = createRollingMetricsEngine();
  const storage = options.storageDatabasePath
    ? initStorage({ databasePath: options.storageDatabasePath })
    : initStorage();
  const signals = new Map<string, OverlaySignal>();
  const tokenLifecycle = new Map<string, TokenLifecycleState>();
  const clients = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });
  const maxSignalCacheSize = 100;
  let feedStarted = false;

  app.addHook("onRequest", (request, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    done();
  });

  app.get("/health", async () => ({
    feedProvider: feed.name,
    metricsEnabled: true,
    status: "ok",
    mode,
    paperOnly: true,
    trackedTokenCount: metricsEngine.getAllMetrics().length,
    uptimeSeconds: Math.round(process.uptime())
  }));

  app.get("/signals", async () => Array.from(signals.values()));

  app.get("/metrics", async () => metricsEngine.getAllMetrics());

  app.get("/metrics/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const metrics = metricsEngine.getMetrics(params.mint);

    if (!metrics) {
      return reply.code(404).send({
        error: "not_found",
        message: `No metrics tracked for mint ${params.mint}`
      });
    }

    return metrics;
  });

  app.get("/positions", async () => executor.getPositions());

  app.get("/storage/stats", async () => getStorageStats());

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
    void feed.start(handleFeedEvent);
  }

  async function stopFeed(): Promise<void> {
    if (!feedStarted) {
      return;
    }

    feedStarted = false;
    await feed.stop();
  }

  function handleFeedEvent(event: FeedEvent): void {
    saveFeedEvent(event);
    const rollingMetrics = metricsEngine.ingestFeedEvent(event);
    const lifecycle = upsertTokenLifecycle(event);

    if (!lifecycle) {
      app.log.trace({ eventType: event.type }, "Ignoring feed event without lifecycle");
      return;
    }

    const signal = createOverlaySignal(
      lifecycle,
      rollingMetrics ?? metricsEngine.getMetrics(lifecycle.candidate.mint)
    );
    const storedSignal = saveSignal(signal);
    cacheSignal(signal);

    if (signal.action === "BUY_READY" && !signal.hardReject) {
      const paperResult = executor.submitPaperBuy(signal);
      persistPaperTradeResult(signal, storedSignal.id, paperResult);
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
  }

  function createOverlaySignal(
    lifecycle: TokenLifecycleState,
    rollingMetrics: RollingMetricsSnapshot | undefined
  ): OverlaySignal {
    const effectiveMetrics = mergeRollingIntoLegacyMetrics(
      lifecycle.metrics,
      rollingMetrics
    );
    const score = scoreFeedCandidate(lifecycle, effectiveMetrics, rollingMetrics);
    const state: SignalState = {
      candidate: lifecycle.candidate,
      metrics: effectiveMetrics,
      riskFlags: lifecycle.riskFlags,
      score,
      updatedAt: rollingMetrics?.lastUpdatedAt ?? lifecycle.timestamp
    };

    const signal: OverlaySignal = {
      mint: lifecycle.candidate.mint,
      symbol: lifecycle.candidate.symbol,
      score: score.total,
      action: score.action,
      hardReject: score.hardReject,
      reasonCodes: score.reasonCodes,
      feedProvider: feed.name,
      insufficientMetrics:
        rollingMetrics?.insufficientMetrics ?? !lifecycle.metricsComplete,
      volumeVelocity: Math.max(
        rollingMetrics?.volumeVelocityUsdPerSec ?? effectiveMetrics.volumeVelocity,
        0
      ),
      buyerVelocity: Math.max(
        rollingMetrics?.buyerVelocityPerSec ?? effectiveMetrics.buyerVelocity,
        0
      ),
      riskFlags: lifecycle.riskFlags,
      state
    };

    if (rollingMetrics) {
      signal.buySellRatio = rollingMetrics.buySellRatio;
      signal.buyerAcceleration = rollingMetrics.buyerAccelerationPerSec2;
      signal.netBuyPressure = rollingMetrics.netBuyPressure;
      signal.priceVelocity = rollingMetrics.priceVelocityPctPerSec;
      signal.rollingMetrics = rollingMetrics;
      signal.volumeAcceleration = rollingMetrics.volumeAccelerationUsdPerSec2;
    }

    return signal;
  }

  function scoreFeedCandidate(
    lifecycle: TokenLifecycleState,
    metrics: RollingMetrics,
    rollingMetrics: RollingMetricsSnapshot | undefined
  ): ScoreBreakdown {
    const score = rollingMetrics
      ? scoreCandidate(lifecycle.candidate, metrics, lifecycle.riskFlags, {
          rollingMetrics
        })
      : scoreCandidate(lifecycle.candidate, metrics, lifecycle.riskFlags);

    if (lifecycle.source !== "pumpportal" || lifecycle.metricsComplete !== false) {
      return score;
    }

    const realFeedReason =
      lifecycle.rawSourceEventType === "migration"
        ? "REAL_FEED_MIGRATION_EVENT"
        : "REAL_FEED_NEW_TOKEN_EVENT";

    return {
      ...score,
      action: score.hardReject ? "HARD_REJECT" : "IGNORE",
      reasonCodes: uniqueReasonCodes([
        "INSUFFICIENT_METRICS",
        "INSUFFICIENT_TRADE_METRICS",
        realFeedReason,
        ...score.reasonCodes
      ]),
      total: score.hardReject ? 0 : Math.min(score.total, 20)
    };
  }

  function upsertTokenLifecycle(event: FeedEvent): TokenLifecycleState {
    if (event.type === "token_created") {
      const lifecycle: TokenLifecycleState = {
        candidate: event.candidate,
        metrics: event.metrics,
        metricsComplete: event.metricsComplete ?? true,
        riskFlags: event.riskFlags,
        source: event.source,
        timestamp: event.timestamp
      };

      if (event.rawSourceEventType) {
        lifecycle.rawSourceEventType = event.rawSourceEventType;
      }

      tokenLifecycle.set(event.candidate.mint, lifecycle);
      return lifecycle;
    }

    const mint = getTradeMint(event);
    const existing = tokenLifecycle.get(mint);
    const lifecycle: TokenLifecycleState = {
      candidate: existing?.candidate ?? createCandidateFromTrade(event),
      metrics: event.metrics,
      metricsComplete: event.metricsComplete ?? true,
      riskFlags: event.riskFlags,
      source: event.source,
      timestamp: event.timestamp
    };

    if (event.rawSourceEventType) {
      lifecycle.rawSourceEventType = event.rawSourceEventType;
    }

    tokenLifecycle.set(mint, lifecycle);
    return lifecycle;
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

  function sendJson(socket: WebSocket, payload: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  if (options.startFeed) {
    startFeed();
  }

  return {
    app,
    close: () => app.close(),
    emitFeedEvent: handleFeedEvent,
    feed,
    getSignals: () => Array.from(signals.values()),
    metrics: metricsEngine,
    startFeed,
    stopFeed,
    storage
  };
}

function getTradeMint(event: TokenTradeEvent): string {
  return event.mint ?? event.token.mint;
}

function createCandidateFromTrade(event: TokenTradeEvent): TokenCandidate {
  const mint = getTradeMint(event);
  const symbol = event.symbol ?? "UNKNOWN";

  return {
    id: {
      chain: "solana",
      mint
    },
    mint,
    symbol,
    name: event.name ?? symbol,
    source: event.source,
    ageSeconds: 0,
    firstSeenAt: event.timestamp
  };
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
    volume1mUsd: window60s.totalVolumeUsd,
    volume5mUsd: Math.max(metrics.volume5mUsd, window60s.totalVolumeUsd),
    volume15mUsd: Math.max(metrics.volume15mUsd, window60s.totalVolumeUsd),
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
    volumeVelocity: Math.max(metrics.volumeVelocity, rollingMetrics.volumeVelocityUsdPerSec),
    buyerVelocity: Math.max(metrics.buyerVelocity, rollingMetrics.buyerVelocityPerSec)
  };
}

function createFeedProvider(options: {
  dataFeed: "mock" | "pumpportal";
  mockFeed?: MockFeedProviderOptions | undefined;
  pumpPortal?: PumpPortalFeedProviderOptions | undefined;
  signalIntervalMs: number;
}): TokenFeedProvider {
  if (options.dataFeed === "pumpportal") {
    return new PumpPortalFeedProvider(options.pumpPortal);
  }

  return new MockFeedProvider({
    intervalMs: options.signalIntervalMs,
    ...options.mockFeed
  });
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
