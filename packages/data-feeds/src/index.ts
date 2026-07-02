import WebSocket from "ws";
import type {
  RiskFlags,
  RollingMetrics,
  TokenCandidate,
  TokenId
} from "@axi/shared";

export type FeedSource = "mock" | "pumpportal" | (string & {});

export type NormalizedFeedMetadata = {
  bondingCurve?: string | undefined;
  creator?: string | undefined;
  metricsComplete?: boolean;
  raw?: unknown;
  rawSourceEventType?: string | undefined;
  receivedAt?: string | undefined;
  signature?: string | undefined;
  source: FeedSource;
};

export type TokenTradeEvent = NormalizedFeedMetadata & {
  type: "trade";
  token: TokenId;
  mint: string;
  symbol?: string;
  name?: string;
  side: "buy" | "sell";
  priceUsd: number;
  volumeUsd: number;
  tokenAmount?: number;
  trader?: string;
  metrics: RollingMetrics;
  riskFlags: RiskFlags;
  timestamp: string;
};

export type TokenCreatedEvent = NormalizedFeedMetadata & {
  type: "token_created";
  candidate: TokenCandidate;
  metrics: RollingMetrics;
  riskFlags: RiskFlags;
  timestamp: string;
};

export type FeedEvent = TokenTradeEvent | TokenCreatedEvent;

export type FeedEventHandler = (event: FeedEvent) => void;

export interface TokenFeedProvider {
  readonly name: string;
  start(handler: FeedEventHandler): void | Promise<void>;
  stop(): void | Promise<void>;
}

export type MockFeedScenario = "normal" | "momentum" | "rug" | "flat";

export type MockFeedProviderOptions = {
  intervalMs?: number;
  maxEvents?: number | undefined;
  scenario?: MockFeedScenario;
  seed?: number | string | undefined;
};

export type PumpPortalLogger = {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
};

export type WebSocketLike = {
  close: () => void;
  on: (event: string, handler: (...args: unknown[]) => void) => WebSocketLike;
  send: (data: string) => void;
};

export type WebSocketConstructor = new (url: string) => WebSocketLike;

export type PumpPortalFeedProviderOptions = {
  apiKey?: string | undefined;
  logger?: PumpPortalLogger;
  maxEvents?: number | undefined;
  now?: () => Date;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  subscribeMigration?: boolean;
  subscribeNewToken?: boolean;
  webSocketConstructor?: WebSocketConstructor;
  wsUrl?: string | undefined;
};

export const defaultPumpPortalWsUrl = "wss://pumpportal.fun/api/data";

const safeRiskFlags: RiskFlags = {
  mintAuthorityActive: false,
  freezeAuthorityActive: false,
  topHolderConcentrationHigh: false,
  mutableMetadata: false,
  suspiciousName: false,
  lowLiquidity: false,
  washTradingSuspected: false,
  honeypotSuspected: false
};

export class MockFeedProvider implements TokenFeedProvider {
  readonly name = "mock";

  private timer: ReturnType<typeof setInterval> | undefined;
  private sequence = 0;
  private emitted = 0;
  private readonly knownTokens: TokenCandidate[] = [];
  private readonly intervalMs: number;
  private readonly maxEvents: number | undefined;
  private readonly random: () => number;
  private readonly scenario: MockFeedScenario;
  private handler: FeedEventHandler | undefined;

  constructor(options: MockFeedProviderOptions = {}) {
    this.intervalMs = options.intervalMs ?? 2000;
    this.maxEvents = options.maxEvents;
    this.scenario = options.scenario ?? "normal";
    this.random = createRandom(hashSeed(options.seed ?? 1));
  }

  start(handler: FeedEventHandler): void {
    this.handler = handler;

    if (this.intervalMs <= 0) {
      const eventCount = this.maxEvents ?? 1;

      for (let index = 0; index < eventCount; index += 1) {
        this.emitNext();
      }

      return;
    }

    this.emitNext();

    if (this.shouldStop()) {
      return;
    }

    this.timer = setInterval(() => this.emitNext(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private emitNext(): void {
    if (!this.handler || this.shouldStop()) {
      this.stop();
      return;
    }

    this.sequence += 1;
    this.emitted += 1;
    this.handler(this.createEvent());

    if (this.shouldStop()) {
      this.stop();
    }
  }

  private shouldStop(): boolean {
    return this.maxEvents !== undefined && this.emitted >= this.maxEvents;
  }

  private createEvent(): FeedEvent {
    if (this.knownTokens.length > 0 && this.sequence % 5 !== 1) {
      return this.createTradeEvent();
    }

    const event = this.createTokenCreatedEvent();
    this.knownTokens.push(event.candidate);
    return event;
  }

  private createTokenCreatedEvent(): TokenCreatedEvent {
    const mint = this.createMint();
    const timestamp = this.createTimestamp();
    const riskFlags = this.createRiskFlags();
    const metrics = this.createMetrics(riskFlags);

    return {
      type: "token_created",
      candidate: {
        id: {
          chain: "solana",
          mint
        },
        mint,
        symbol: `MOCK${this.sequence}`,
        name: `Mock Token ${this.sequence}`,
        source: `mock:${this.scenario}`,
        ageSeconds: 15 + this.sequence * 4,
        firstSeenAt: timestamp
      },
      metrics,
      metricsComplete: true,
      rawSourceEventType: this.scenario,
      receivedAt: timestamp,
      riskFlags,
      source: "mock",
      timestamp
    };
  }

  private createTradeEvent(): FeedEvent {
    const index = this.sequence % this.knownTokens.length;
    const candidate = this.knownTokens[index];

    if (!candidate) {
      return this.createTokenCreatedEvent();
    }

    const riskFlags = this.createRiskFlags();
    const metrics = this.createMetrics(riskFlags);
    const timestamp = this.createTimestamp();
    const side = this.createTradeSide();
    const volumeUsd = this.createTradeVolumeUsd(metrics, side);
    const tokenAmount = metrics.priceUsd > 0 ? volumeUsd / metrics.priceUsd : 0;

    return {
      type: "trade",
      mint: candidate.mint,
      name: candidate.name,
      side,
      priceUsd: metrics.priceUsd,
      signature: `mock-${this.scenario}-${String(this.sequence).padStart(6, "0")}`,
      symbol: candidate.symbol,
      token: candidate.id,
      tokenAmount,
      trader: this.createTrader(side),
      volumeUsd,
      metrics,
      metricsComplete: true,
      rawSourceEventType: this.scenario,
      receivedAt: timestamp,
      riskFlags,
      source: "mock",
      timestamp
    };
  }

  private createTradeSide(): "buy" | "sell" {
    if (this.scenario === "momentum") {
      return this.sequence % 6 === 0 ? "sell" : "buy";
    }

    if (this.scenario === "rug") {
      const phase = this.sequence % 10;
      return phase === 2 || phase === 3 ? "buy" : "sell";
    }

    if (this.scenario === "flat") {
      return this.sequence % 2 === 0 ? "buy" : "sell";
    }

    return this.sequence % 3 === 0 ? "sell" : "buy";
  }

  private createTradeVolumeUsd(
    metrics: RollingMetrics,
    side: "buy" | "sell"
  ): number {
    const tradeCount = Math.max(metrics.buyCount1m + metrics.sellCount1m, 1);
    const baseVolume = Math.max(metrics.volume1mUsd / tradeCount, 20);

    if (this.scenario === "momentum") {
      return Number((baseVolume * (1 + this.sequence * 0.08)).toFixed(6));
    }

    if (this.scenario === "rug") {
      return Number((baseVolume * (side === "sell" ? 2.4 : 0.9)).toFixed(6));
    }

    if (this.scenario === "flat") {
      return Number((25 + (this.sequence % 3) * 5).toFixed(6));
    }

    return Number((baseVolume * (side === "buy" ? 1.15 : 0.95)).toFixed(6));
  }

  private createTrader(side: "buy" | "sell"): string {
    if (this.scenario === "flat") {
      return `mock-flat-${side}-${this.sequence % 2}`;
    }

    if (this.scenario === "rug" && side === "sell") {
      return `mock-rug-seller-${this.sequence % 3}`;
    }

    return `mock-${this.scenario}-${side}-${this.sequence}`;
  }

  private createMetrics(riskFlags: RiskFlags): RollingMetrics {
    const wave = this.sequence % 6;
    const jitter = Number((this.random() * 0.1).toFixed(4));
    const topHolderPercent = riskFlags.topHolderConcentrationHigh
      ? this.scenario === "rug"
        ? 45 + wave
        : 32
      : 7 + wave;

    if (this.scenario === "momentum") {
      return this.createMomentumMetrics(topHolderPercent, jitter);
    }

    if (this.scenario === "rug") {
      return this.createRugMetrics(topHolderPercent, jitter);
    }

    if (this.scenario === "flat") {
      return this.createFlatMetrics(topHolderPercent, jitter);
    }

    const rising = wave === 1 || wave === 2 || wave === 5;

    return {
      priceUsd: 0.0001 + this.sequence * 0.000013 + jitter * 0.00001,
      marketCapUsd: 25_000 + this.sequence * 1_250,
      liquidityUsd: riskFlags.lowLiquidity ? 1_200 : 12_000 + wave * 1_500,
      volume1mUsd: rising ? 6_000 + wave * 1_400 : 1_800 + wave * 150,
      volume5mUsd: rising ? 18_000 + wave * 2_400 : 7_500 + wave * 200,
      volume15mUsd: 36_000 + wave * 3_500,
      buyCount1m: rising ? 36 + wave * 5 : 12 + wave,
      buyCount5m: rising ? 110 + wave * 8 : 44 + wave * 2,
      sellCount1m: rising ? 12 + wave : 11 + wave,
      sellCount5m: rising ? 40 + wave * 2 : 36 + wave,
      uniqueBuyers1m: rising ? 28 + wave * 4 : 9 + wave,
      uniqueBuyers5m: rising ? 84 + wave * 6 : 31 + wave,
      uniqueSellers1m: rising ? 10 + wave : 8 + wave,
      uniqueSellers5m: rising ? 32 + wave : 28 + wave,
      holderCount: 120 + this.sequence * 7,
      topHolderPercent,
      top10HolderPercent: topHolderPercent + 26,
      priceChange1mPct: rising ? 2 + wave : -1,
      priceChange5mPct: rising ? 9 + wave * 2 : 1,
      volumeVelocity: rising ? 1.8 + wave * 0.25 : 0.9,
      buyerVelocity: rising ? 1.6 + wave * 0.18 : 0.95
    };
  }

  private createMomentumMetrics(
    topHolderPercent: number,
    jitter: number
  ): RollingMetrics {
    return {
      priceUsd: 0.0002 + this.sequence * 0.000025 + jitter * 0.00001,
      marketCapUsd: 45_000 + this.sequence * 2_500,
      liquidityUsd: 20_000 + this.sequence * 350,
      volume1mUsd: 10_000 + this.sequence * 900,
      volume5mUsd: 28_000 + this.sequence * 1_600,
      volume15mUsd: 55_000 + this.sequence * 2_100,
      buyCount1m: 52 + this.sequence * 2,
      buyCount5m: 150 + this.sequence * 5,
      sellCount1m: 12 + (this.sequence % 3),
      sellCount5m: 36 + this.sequence,
      uniqueBuyers1m: 42 + this.sequence * 2,
      uniqueBuyers5m: 120 + this.sequence * 4,
      uniqueSellers1m: 10 + (this.sequence % 3),
      uniqueSellers5m: 30 + this.sequence,
      holderCount: 260 + this.sequence * 12,
      topHolderPercent,
      top10HolderPercent: topHolderPercent + 22,
      priceChange1mPct: 5 + this.sequence * 0.4,
      priceChange5mPct: 18 + this.sequence * 0.7,
      volumeVelocity: 2.4 + this.sequence * 0.04,
      buyerVelocity: 2.1 + this.sequence * 0.03
    };
  }

  private createRugMetrics(
    topHolderPercent: number,
    jitter: number
  ): RollingMetrics {
    return {
      priceUsd: 0.0003 + this.sequence * 0.00001 + jitter * 0.00001,
      marketCapUsd: 80_000 + this.sequence * 1_000,
      liquidityUsd: 900 + this.sequence * 25,
      volume1mUsd: 12_000 + this.sequence * 500,
      volume5mUsd: 45_000 + this.sequence * 800,
      volume15mUsd: 90_000 + this.sequence * 900,
      buyCount1m: 20 + this.sequence,
      buyCount5m: 80 + this.sequence * 2,
      sellCount1m: 35 + this.sequence * 2,
      sellCount5m: 120 + this.sequence * 3,
      uniqueBuyers1m: 12 + this.sequence,
      uniqueBuyers5m: 44 + this.sequence,
      uniqueSellers1m: 26 + this.sequence,
      uniqueSellers5m: 88 + this.sequence * 2,
      holderCount: 80 + this.sequence,
      topHolderPercent,
      top10HolderPercent: Math.min(topHolderPercent + 35, 95),
      priceChange1mPct: -8 - this.sequence * 0.2,
      priceChange5mPct: -18 - this.sequence * 0.4,
      volumeVelocity: 1.7 + this.sequence * 0.02,
      buyerVelocity: 0.8
    };
  }

  private createFlatMetrics(
    topHolderPercent: number,
    jitter: number
  ): RollingMetrics {
    return {
      priceUsd: 0.00015 + jitter * 0.000001,
      marketCapUsd: 30_000 + this.sequence * 50,
      liquidityUsd: 14_000,
      volume1mUsd: 1_500 + this.sequence * 10,
      volume5mUsd: 7_200 + this.sequence * 12,
      volume15mUsd: 21_000 + this.sequence * 15,
      buyCount1m: 10,
      buyCount5m: 42,
      sellCount1m: 10,
      sellCount5m: 41,
      uniqueBuyers1m: 8,
      uniqueBuyers5m: 28,
      uniqueSellers1m: 8,
      uniqueSellers5m: 27,
      holderCount: 150 + this.sequence,
      topHolderPercent,
      top10HolderPercent: topHolderPercent + 20,
      priceChange1mPct: 0.1,
      priceChange5mPct: 0.2,
      volumeVelocity: 1,
      buyerVelocity: 1
    };
  }

  private createRiskFlags(): RiskFlags {
    if (this.scenario === "rug") {
      return {
        ...safeRiskFlags,
        freezeAuthorityActive: this.sequence % 2 === 0,
        honeypotSuspected: this.sequence % 3 === 0,
        lowLiquidity: true,
        mintAuthorityActive: true,
        mutableMetadata: true,
        suspiciousName: true,
        topHolderConcentrationHigh: true,
        washTradingSuspected: true
      };
    }

    if (this.scenario === "momentum" || this.scenario === "flat") {
      return { ...safeRiskFlags };
    }

    return {
      ...safeRiskFlags,
      mintAuthorityActive: this.sequence % 13 === 0,
      freezeAuthorityActive: this.sequence % 17 === 0,
      topHolderConcentrationHigh: this.sequence % 11 === 0,
      lowLiquidity: this.sequence % 7 === 0,
      mutableMetadata: this.sequence % 5 === 0
    };
  }

  private createMint(): string {
    const seedPart = String(Math.abs(hashSeed(this.scenario)) % 10_000).padStart(
      4,
      "0"
    );

    return `MockMint${seedPart}${String(this.sequence).padStart(4, "0")}111111111111111111111111`;
  }

  private createTimestamp(): string {
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.sequence)).toISOString();
  }
}

export class PumpPortalFeedProvider implements TokenFeedProvider {
  readonly name = "pumpportal";

  private reconnectDelayMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private socket: WebSocketLike | undefined;
  private stopped = true;
  private emitted = 0;
  private handler: FeedEventHandler | undefined;

  private readonly apiKey: string | undefined;
  private readonly logger: PumpPortalLogger;
  private readonly maxEvents: number | undefined;
  private readonly now: () => Date;
  private readonly reconnectInitialDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly subscribeMigration: boolean;
  private readonly subscribeNewToken: boolean;
  private readonly webSocketConstructor: WebSocketConstructor;
  private readonly wsUrl: string;

  constructor(options: PumpPortalFeedProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.logger = options.logger ?? {};
    this.maxEvents = options.maxEvents;
    this.now = options.now ?? (() => new Date());
    this.reconnectInitialDelayMs = options.reconnectInitialDelayMs ?? 1_000;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30_000;
    this.reconnectDelayMs = this.reconnectInitialDelayMs;
    this.subscribeMigration = options.subscribeMigration ?? true;
    this.subscribeNewToken = options.subscribeNewToken ?? true;
    this.webSocketConstructor =
      options.webSocketConstructor ??
      (WebSocket as unknown as WebSocketConstructor);
    this.wsUrl = buildPumpPortalWsUrl({
      apiKey: options.apiKey,
      wsUrl: options.wsUrl
    });
  }

  start(handler: FeedEventHandler): void {
    this.handler = handler;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.socket?.close();
    this.socket = undefined;
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }

    const socket = new this.webSocketConstructor(this.wsUrl);
    this.socket = socket;
    this.logger.info?.("PumpPortal websocket connecting", {
      url: maskPumpPortalUrl(this.wsUrl)
    });

    socket.on("open", () => {
      this.reconnectDelayMs = this.reconnectInitialDelayMs;
      this.sendSubscriptions(socket);
    });

    socket.on("message", (data) => {
      this.handleMessage(data);
    });

    socket.on("error", (error) => {
      this.logger.warn?.("PumpPortal websocket error", {
        error: error instanceof Error ? error.message : String(error)
      });
      this.scheduleReconnect();
    });

    socket.on("close", () => {
      this.logger.debug?.("PumpPortal websocket closed");
      this.scheduleReconnect();
    });
  }

  private sendSubscriptions(socket: WebSocketLike): void {
    if (this.subscribeNewToken) {
      socket.send(
        JSON.stringify({
          method: "subscribeNewToken"
        })
      );
    }

    if (this.subscribeMigration) {
      socket.send(
        JSON.stringify({
          method: "subscribeMigration"
        })
      );
    }
  }

  private handleMessage(data: unknown): void {
    const payload = this.parsePayload(data);

    if (!payload) {
      return;
    }

    const event = this.normalizePayload(payload);

    if (!event) {
      this.logger.debug?.("Skipping unknown PumpPortal payload");
      return;
    }

    this.emitted += 1;
    this.handler?.(event);

    if (this.maxEvents !== undefined && this.emitted >= this.maxEvents) {
      this.stop();
    }
  }

  private parsePayload(data: unknown): Record<string, unknown> | null {
    try {
      const text =
        typeof data === "string" || data instanceof Buffer
          ? data.toString()
          : String(data);
      const parsed = JSON.parse(text) as unknown;

      if (isRecord(parsed)) {
        return parsed;
      }

      this.logger.debug?.("Skipping non-object PumpPortal payload");
      return null;
    } catch (error) {
      this.logger.warn?.("Failed to parse PumpPortal payload", {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private normalizePayload(
    payload: Record<string, unknown>
  ): TokenCreatedEvent | null {
    const mint = readString(payload, [
      "mint",
      "tokenMint",
      "ca",
      "address",
      "contractAddress"
    ]);

    if (!mint) {
      return null;
    }

    const receivedAt = this.now().toISOString();
    const rawSourceEventType = inferPumpPortalEventType(payload);
    const symbol = readString(payload, ["symbol", "ticker"]) ?? "UNKNOWN";
    const name = readString(payload, ["name", "tokenName"]) ?? symbol;
    const creator = readString(payload, [
      "creator",
      "traderPublicKey",
      "user",
      "owner"
    ]);
    const bondingCurve = readString(payload, [
      "bondingCurve",
      "bondingCurveKey",
      "bondingCurveAddress"
    ]);
    const signature = readString(payload, [
      "signature",
      "txSignature",
      "transactionSignature"
    ]);
    const timestamp = readTimestamp(payload) ?? receivedAt;

    return {
      type: "token_created",
      bondingCurve,
      candidate: {
        id: {
          chain: "solana",
          mint
        },
        mint,
        symbol,
        name,
        source: "pumpportal",
        ageSeconds: 0,
        firstSeenAt: timestamp
      },
      creator,
      metrics: createIncompleteMetrics(),
      metricsComplete: false,
      raw: payload,
      rawSourceEventType,
      receivedAt,
      riskFlags: {
        ...safeRiskFlags,
        lowLiquidity: true
      },
      signature,
      source: "pumpportal",
      timestamp
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const delayMs = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      this.reconnectMaxDelayMs
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delayMs);
  }
}

export function buildPumpPortalWsUrl(options: {
  apiKey?: string | undefined;
  wsUrl?: string | undefined;
} = {}): string {
  const url = new URL(options.wsUrl ?? defaultPumpPortalWsUrl);

  if (options.apiKey) {
    url.searchParams.set("api-key", options.apiKey);
  }

  return url.toString();
}

export function maskPumpPortalUrl(url: string): string {
  const parsed = new URL(url);

  if (parsed.searchParams.has("api-key")) {
    parsed.searchParams.set("api-key", "***");
  }

  return parsed.toString();
}

function createIncompleteMetrics(): RollingMetrics {
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

function inferPumpPortalEventType(payload: Record<string, unknown>): string {
  const explicit = readString(payload, ["event", "method", "type", "txType"]);

  if (explicit) {
    return explicit.toLowerCase().includes("migr") ? "migration" : explicit;
  }

  if (readString(payload, ["pool", "newPool", "bondingCurve"])) {
    return "migration";
  }

  return "new_token";
}

function readTimestamp(payload: Record<string, unknown>): string | undefined {
  const value = payload["timestamp"] ?? payload["createdAt"] ?? payload["time"];

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof value === "number") {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  return undefined;
}

function readString(
  payload: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    return seed;
  }

  let hash = 2166136261;

  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// TODO: Add more public Solana feed providers later, such as Birdeye, Helius,
// or DexScreener adapters, only after they are explicitly requested.
// TODO: Keep Axiom overlay inputs limited to user-permitted public surfaces.
