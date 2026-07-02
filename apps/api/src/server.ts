import Fastify from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { MockFeedProvider } from "@axi/data-feeds";
import type { FeedEvent, TokenCreatedEvent } from "@axi/data-feeds";
import { PaperTradeExecutor, type PaperTradeResult } from "@axi/execution";
import { scoreCandidate } from "@axi/scoring";
import {
  BotModeSchema,
  type OverlaySignal,
  type SignalState
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
  upsertPaperPosition
} from "@axi/storage";

const configSchema = z.object({
  NODE_ENV: z.string().default("development"),
  BOT_MODE: BotModeSchema.default("paper"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  SIGNAL_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),
  STORAGE_DATABASE_PATH: z.string().min(1).optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info")
});

type ApiConfig = z.infer<typeof configSchema>;

const config: ApiConfig = configSchema.parse(process.env);

if (config.BOT_MODE === "live") {
  throw new Error("Live mode is not implemented. Start this service with BOT_MODE=paper.");
}

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL
  }
});

const feed = new MockFeedProvider({
  intervalMs: config.SIGNAL_INTERVAL_MS
});
const executor = new PaperTradeExecutor(config.BOT_MODE);
const storage = config.STORAGE_DATABASE_PATH
  ? initStorage({ databasePath: config.STORAGE_DATABASE_PATH })
  : initStorage();
const signals = new Map<string, OverlaySignal>();
const clients = new Set<WebSocket>();
const wss = new WebSocketServer({ noServer: true });
const maxSignalCacheSize = 100;
const limitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(50)
});

app.get("/health", async () => ({
  status: "ok",
  mode: config.BOT_MODE,
  paperOnly: true,
  uptimeSeconds: Math.round(process.uptime())
}));

app.get("/signals", async () => Array.from(signals.values()));

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

function handleFeedEvent(event: FeedEvent): void {
  saveFeedEvent(event);

  if (event.type !== "token_created") {
    app.log.trace({ eventType: event.type }, "Ignoring non-candidate mock event");
    return;
  }

  const signal = createOverlaySignal(event);
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

function createOverlaySignal(event: TokenCreatedEvent): OverlaySignal {
  const score = scoreCandidate(
    event.candidate,
    event.metrics,
    event.riskFlags
  );
  const state: SignalState = {
    candidate: event.candidate,
    metrics: event.metrics,
    riskFlags: event.riskFlags,
    score,
    updatedAt: event.timestamp
  };

  return {
    mint: event.candidate.mint,
    symbol: event.candidate.symbol,
    score: score.total,
    action: score.action,
    hardReject: score.hardReject,
    reasonCodes: score.reasonCodes,
    volumeVelocity: event.metrics.volumeVelocity,
    buyerVelocity: event.metrics.buyerVelocity,
    riskFlags: event.riskFlags,
    state
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

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  feed.stop();

  for (const client of clients) {
    client.close(1001, "Server shutting down");
  }

  wss.close();
  closeStorage();
  await app.close();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({
  host: config.API_HOST,
  port: config.API_PORT
});

feed.start(handleFeedEvent);

app.log.info(
  {
    mode: config.BOT_MODE,
    storagePath: storage.databasePath,
    port: config.API_PORT,
    signalIntervalMs: config.SIGNAL_INTERVAL_MS
  },
  "AXI API started in paper mode"
);
