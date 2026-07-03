import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  MockFeedProvider,
  PumpPortalFeedProvider,
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
  type OverlaySignal,
  type RiskFlags,
  type RiskSnapshot,
  type RollingMetrics,
  type RollingMetricsSnapshot,
  type ScoreBreakdown,
  type SignalState,
  type TokenCandidate
} from "@axi/shared";
import {
  closeStorage,
  getLatestChainVerification,
  getStorageStats,
  initStorage,
  listChainVerifications,
  listPaperOrders,
  listPaperPositions,
  listRecentSignals,
  saveCandidateDecision,
  saveChainVerification,
  saveFeedEvent,
  savePaperOrder,
  saveRiskSnapshot,
  saveSignal,
  type StorageHandle,
  upsertPaperPosition
} from "@axi/storage";
import {
  ChainVerifierUnavailableError,
  createChainVerifierService,
  type ChainVerificationRecord,
  type ChainVerifierOptions,
  type ChainVerifierService
} from "./chain-verifier";

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
  PAPER_AUTO_ORDER: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  CHAIN_VERIFIER_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  SOLANA_RPC_HTTP: z
    .preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
  SOLANA_RPC_COMMITMENT: z
    .enum(["processed", "confirmed", "finalized"])
    .default("confirmed"),
  CHAIN_VERIFIER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  CHAIN_VERIFIER_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(60000),
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
  chainVerifier?: ChainVerifierOptions;
  dataFeed?: "mock" | "pumpportal";
  feedProvider?: TokenFeedProvider;
  host?: string;
  logLevel?: ApiLogLevel | false;
  mockFeed?: MockFeedProviderOptions | undefined;
  mode?: BotMode;
  paperAutoOrder?: boolean;
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
  candidates: CandidateLifecycleEngine;
  metrics: RollingMetricsEngine;
  risk: RiskEngine;
  getSignals: () => OverlaySignal[];
  startFeed: () => void;
  stopFeed: () => Promise<void>;
  storage: StorageHandle;
  chainVerifier: ChainVerifierService;
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
  const riskEngine = createRiskEngine();
  const candidateEngine = createCandidateLifecycleEngine();
  const chainVerifier = createChainVerifierService(options.chainVerifier);
  const paperAutoOrder = options.paperAutoOrder ?? false;
  const storage = options.storageDatabasePath
    ? initStorage({ databasePath: options.storageDatabasePath })
    : initStorage();
  const signals = new Map<string, OverlaySignal>();
  const riskSnapshots = new Map<string, RiskSnapshot>();
  const clients = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });
  const maxSignalCacheSize = 100;
  let feedStarted = false;

  app.addHook("onRequest", (request, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    done();
  });

  app.get("/health", async () => ({
    chainVerifier: chainVerifier.getStatus(),
    chainVerificationCount: getStorageStats().chainVerificationCount,
    feedProvider: feed.name,
    metricsEnabled: true,
    riskEnabled: true,
    candidateLifecycleEnabled: true,
    status: "ok",
    mode,
    candidateCount: candidateEngine.getAllCandidates().length,
    paperAutoOrder,
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

  app.get("/candidates", async () => candidateEngine.getAllCandidates());

  app.get("/candidates/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const candidate = candidateEngine.getCandidate(params.mint);

    if (!candidate) {
      return reply.code(404).send({
        error: "not_found",
        message: `No candidate tracked for mint ${params.mint}`
      });
    }

    return candidate;
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
    const candidate = candidateEngine.ingestFeedEvent(event);
    const latestMetrics =
      rollingMetrics ?? metricsEngine.getMetrics(candidate.mint);
    candidateEngine.updateMetrics(candidate.mint, latestMetrics);

    const effectiveMetrics = mergeRollingIntoLegacyMetrics(
      getLegacyMetrics(event),
      latestMetrics
    );
    const shouldVerifyOnChain = chainVerifier.shouldVerifyFeedEvent(event);

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

    if (!decision) {
      app.log.trace({ mint: candidate.mint }, "Candidate decision unavailable");
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
      const stored = saveChainVerification(chainVerifier.toStorageInput(record));
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
    event: FeedEvent;
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

    const latestMetrics = metricsEngine.getMetrics(options.record.mint);
    const effectiveMetrics = mergeRollingIntoLegacyMetrics(
      options.event ? getLegacyMetrics(options.event) : fallbackMetricsFromCandidate(candidate),
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
    candidate: CandidateState;
    decision: CandidateDecision;
    metrics: RollingMetrics;
    riskSnapshot: RiskSnapshot;
    rollingMetrics: RollingMetricsSnapshot | undefined;
    score: ScoreBreakdown;
  }): OverlaySignal {
    const state: SignalState = {
      candidate: createTokenCandidateFromState(options.candidate),
      metrics: options.metrics,
      riskFlags: createRiskFlagsFromSnapshot(options.riskSnapshot),
      score: options.score,
      updatedAt:
        options.rollingMetrics?.lastUpdatedAt ?? options.decision.updatedAt
    };

    const signal: OverlaySignal = {
      mint: options.candidate.mint,
      symbol: options.candidate.symbol ?? "UNKNOWN",
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
      riskLevel: options.riskSnapshot.riskLevel,
      riskReasonCodes: options.riskSnapshot.reasonCodes,
      riskScore: options.riskSnapshot.riskScore,
      riskSnapshot: options.riskSnapshot,
      scoreReasonCodes: options.score.reasonCodes,
      volumeVelocity: Math.max(
        options.rollingMetrics?.volumeVelocityUsdPerSec ??
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
      signal.buyerAcceleration = options.rollingMetrics.buyerAccelerationPerSec2;
      signal.netBuyPressure = options.rollingMetrics.netBuyPressure;
      signal.priceVelocity = options.rollingMetrics.priceVelocityPctPerSec;
      signal.rollingMetrics = options.rollingMetrics;
      signal.volumeAcceleration =
        options.rollingMetrics.volumeAccelerationUsdPerSec2;
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
    candidates: candidateEngine,
    close: () => app.close(),
    emitFeedEvent: handleFeedEvent,
    feed,
    getSignals: () => Array.from(signals.values()),
    metrics: metricsEngine,
    risk: riskEngine,
    chainVerifier,
    startFeed,
    stopFeed,
    storage
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
    options.event?.source === "pumpportal" && options.event.metricsComplete === false;

  const input: RiskInput = {
    mint: options.candidate.mint,
    source,
    mintAuthorityActive: incompleteRealFeed ? null : riskFlags.mintAuthorityActive,
    freezeAuthorityActive: incompleteRealFeed ? null : riskFlags.freezeAuthorityActive,
    metadataMutable: incompleteRealFeed ? null : riskFlags.mutableMetadata,
    holderCount: incompleteRealFeed ? null : options.metrics.holderCount,
    topHolderPct: incompleteRealFeed ? null : options.metrics.topHolderPercent,
    top10HolderPct: incompleteRealFeed ? null : options.metrics.top10HolderPercent,
    devHolderPct: incompleteRealFeed ? null : mockDevHolderPct(scenario),
    insiderHolderPct: incompleteRealFeed ? null : mockInsiderHolderPct(scenario),
    devSoldPct: incompleteRealFeed ? null : mockDevSoldPct(scenario),
    devNetFlowUsd: incompleteRealFeed ? null : mockDevNetFlowUsd(scenario),
    priorLaunchCount: incompleteRealFeed ? null : mockPriorLaunchCount(scenario),
    priorRugCount: incompleteRealFeed ? null : mockPriorRugCount(scenario),
    buySellRatio: rolling?.buySellRatio ?? null,
    netBuyPressure: rolling?.netBuyPressure ?? null,
    uniqueBuyers: rolling?.windows["10s"].uniqueBuyers ?? null,
    uniqueSellers: rolling?.windows["10s"].uniqueSellers ?? null,
    volumeVelocity: rolling?.volumeVelocityUsdPerSec ?? null,
    volumeAcceleration: rolling?.volumeAccelerationUsdPerSec2 ?? null,
    buyerVelocity: rolling?.buyerVelocityPerSec ?? null,
    buyerAcceleration: rolling?.buyerAccelerationPerSec2 ?? null,
    priceVelocity: rolling?.priceVelocityPctPerSec ?? null,
    priceAcceleration: rolling?.priceAccelerationPctPerSec2 ?? null,
    largestTradeShare: rolling?.largestTradeShare ?? null,
    sampleCount: rolling?.sampleCount ?? null,
    insufficientMetrics:
      rolling?.insufficientMetrics ?? (options.event?.metricsComplete === false ? true : null),
    liquidityUsd: incompleteRealFeed ? null : options.metrics.liquidityUsd,
    marketCapUsd: incompleteRealFeed ? null : options.metrics.marketCapUsd,
    fdvUsd: incompleteRealFeed ? null : options.metrics.marketCapUsd,
    estimatedSellSlippagePct: incompleteRealFeed
      ? null
      : mockSellSlippagePct(scenario, riskFlags),
    sniperPct: incompleteRealFeed ? null : mockSniperPct(scenario),
    bundlerPct: incompleteRealFeed ? null : mockBundlerPct(scenario),
    washTradingSuspected: incompleteRealFeed ? null : riskFlags.washTradingSuspected,
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
    firstSeenAt: state.firstSeenAt
  };
}

function getLegacyMetrics(event: FeedEvent): RollingMetrics {
  return event.metrics;
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
    reasonCodes: uniqueReasonCodes([
      ...snapshot.reasonCodes,
      ...reasonCodes
    ])
  };
}

function fallbackMetricsFromCandidate(candidate: CandidateState): RollingMetrics {
  const metrics = candidate.latestMetrics;

  if (!metrics) {
    return createEmptyLegacyMetrics();
  }

  return {
    priceUsd: metrics.latestPriceUsd,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: metrics.windows["60s"].totalVolumeUsd,
    volume5mUsd: metrics.windows["60s"].totalVolumeUsd,
    volume15mUsd: metrics.windows["60s"].totalVolumeUsd,
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
    mintAuthorityActive:
      patch.mintAuthorityActive ?? input.mintAuthorityActive,
    top10HolderPct: patch.top10HolderPct ?? input.top10HolderPct,
    topHolderPct: patch.topHolderPct ?? input.topHolderPct
  };
}

function signalActionFromDecision(decision: CandidateDecision): OverlaySignal["action"] {
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

function getMockScenario(source: string): "normal" | "momentum" | "rug" | "flat" | "unknown" {
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

function mockDevHolderPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 18 : scenario === "momentum" ? 3 : 6;
}

function mockInsiderHolderPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 28 : scenario === "momentum" ? 5 : 9;
}

function mockDevSoldPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 65 : 0;
}

function mockDevNetFlowUsd(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? -8_000 : 500;
}

function mockPriorLaunchCount(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 8 : 2;
}

function mockPriorRugCount(scenario: ReturnType<typeof getMockScenario>): number | null {
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

function mockSniperPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 30 : scenario === "momentum" ? 4 : 9;
}

function mockBundlerPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 26 : scenario === "momentum" ? 3 : 7;
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
