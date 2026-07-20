import WebSocket from "ws";
import type {
  MarketObservationSummary,
  ObservationConfidence,
  QuoteAsset,
  RiskFlags,
  RollingMetrics,
  TokenCandidate,
  TokenId
} from "@axi/shared";

export type FeedSource = "mock" | "pumpportal" | (string & {});

export type NormalizedFeedMetadata = {
  bondingCurve?: string | undefined;
  creator?: string | undefined;
  dataSource?: FeedSource | undefined;
  dataSourceMode?: "mock" | "real" | "replay" | "unknown" | undefined;
  metricsComplete?: boolean;
  raw?: unknown;
  rawSourceEventType?: string | undefined;
  realData?: boolean | undefined;
  receivedAt?: string | undefined;
  reasonCodes?: string[] | undefined;
  signature?: string | undefined;
  source: FeedSource;
};

export type TokenTradeEvent = NormalizedFeedMetadata & {
  type: "trade";
  token: TokenId;
  mint: string;
  symbol?: string;
  name?: string;
  metadataUri?: string;
  imageUri?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  side: "buy" | "sell" | "unknown";
  priceUsd: number | null;
  volumeUsd: number | null;
  priceSol?: number | null;
  volumeSol?: number | null;
  priceQuote?: number | null;
  volumeQuote?: number | null;
  quoteAsset?: QuoteAsset;
  quoteMint?: string | null;
  usableForMetrics?: boolean;
  confidence?: ObservationConfidence;
  tokenAmount?: number;
  trader?: string;
  metrics: RollingMetrics;
  marketObservation?: MarketObservationSummary;
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

export type AccountTradeEvent = NormalizedFeedMetadata & {
  type: "account_trade";
  wallet: string;
  walletAlias?: string | null;
  mint: string;
  side: "buy" | "sell" | "unknown";
  priceSol: number | null;
  volumeSol: number | null;
  tokenAmount: number | null;
  signature?: string;
  confidence: ObservationConfidence;
  usableForExitStrategy: boolean;
  timestamp: string;
};

export type FeedEvent = TokenTradeEvent | TokenCreatedEvent | AccountTradeEvent;

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
  maxAccountTradeEventsPerSession?: number;
  maxAccountTradeSubscriptions?: number;
  maxTokenTradeEventsPerMint?: number;
  maxTokenTradeEventsPerSession?: number;
  maxTokenTradeSubscriptions?: number;
  now?: () => Date;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  subscribedAccountTradeWallets?: string[];
  subscribedTokenTradeMints?: string[];
  subscribeMigration?: boolean;
  subscribeNewToken?: boolean;
  webSocketConstructor?: WebSocketConstructor;
  wsUrl?: string | undefined;
};

export type PumpPortalTokenTradeStats = {
  budgetReached: boolean;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSubscribedTokens: number;
  perMintEventCounts: Record<string, number>;
  subscribedTokenCount: number;
  totalEventsThisSession: number;
};

export type PumpPortalAccountTradeStats = {
  budgetReached: boolean;
  maxEventsPerSession: number;
  maxSubscribedWallets: number;
  perWalletEventCounts: Record<string, number>;
  subscribedWalletCount: number;
  totalEventsThisSession: number;
};

export type PumpPortalConnectionStatus = {
  accountTradeEventCount: number;
  connected: boolean;
  connecting: boolean;
  disconnected: boolean;
  lastCloseAt: string | null;
  lastError: string | null;
  lastEventAt: string | null;
  lastMessageAt: string | null;
  lastOpenAt: string | null;
  migrationEventCount: number;
  newTokenEventCount: number;
  parseErrorCount: number;
  reasonCodes: string[];
  reconnectAttempts: number;
  subscriptions: string[];
  tokenTradeEventCount: number;
};

export type PumpPortalTradeSubscriptionResult = {
  reasonCodes: string[];
  rejected: string[];
  subscribed: string[];
  unsubscribed: string[];
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
      dataSource: "mock",
      dataSourceMode: "mock",
      metrics,
      metricsComplete: true,
      rawSourceEventType: this.scenario,
      realData: false,
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
      dataSource: "mock",
      dataSourceMode: "mock",
      metrics,
      metricsComplete: true,
      rawSourceEventType: this.scenario,
      realData: false,
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
    const seedPart = String(
      Math.abs(hashSeed(this.scenario)) % 10_000
    ).padStart(4, "0");

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
  private readonly maxAccountTradeEventsPerSession: number;
  private readonly maxAccountTradeSubscriptions: number;
  private readonly maxTokenTradeEventsPerMint: number;
  private readonly maxTokenTradeEventsPerSession: number;
  private readonly maxTokenTradeSubscriptions: number;
  private readonly accountTradeEventCounts = new Map<string, number>();
  private readonly accountTradeSubscriptions = new Set<string>();
  private readonly tokenTradeEventCounts = new Map<string, number>();
  private readonly tokenTradeSubscriptions = new Set<string>();
  private accountTradeBudgetReached = false;
  private socketOpen = false;
  private tokenTradeBudgetReached = false;
  private tokenTradeSessionEventLimit: number;
  private connecting = false;
  private lastCloseAt: string | null = null;
  private lastError: string | null = null;
  private lastEventAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastOpenAt: string | null = null;
  private migrationEventCount = 0;
  private newTokenEventCount = 0;
  private parseErrorCount = 0;
  private accountTradeEventCount = 0;
  private reconnectAttempts = 0;
  private tokenTradeEventCount = 0;

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
    this.maxAccountTradeEventsPerSession =
      options.maxAccountTradeEventsPerSession ?? Number.POSITIVE_INFINITY;
    this.maxAccountTradeSubscriptions =
      options.maxAccountTradeSubscriptions ?? 25;
    this.maxTokenTradeEventsPerMint =
      options.maxTokenTradeEventsPerMint ?? Number.POSITIVE_INFINITY;
    this.maxTokenTradeEventsPerSession =
      options.maxTokenTradeEventsPerSession ?? Number.POSITIVE_INFINITY;
    this.tokenTradeSessionEventLimit = this.maxTokenTradeEventsPerSession;
    this.maxTokenTradeSubscriptions = options.maxTokenTradeSubscriptions ?? 10;
    this.webSocketConstructor =
      options.webSocketConstructor ??
      (WebSocket as unknown as WebSocketConstructor);
    this.wsUrl = buildPumpPortalWsUrl({
      apiKey: options.apiKey,
      wsUrl: options.wsUrl
    });

    for (const mint of options.subscribedTokenTradeMints ?? []) {
      if (isValidSolanaMint(mint)) {
        this.tokenTradeSubscriptions.add(mint);
      }
    }

    for (const wallet of options.subscribedAccountTradeWallets ?? []) {
      if (isValidSolanaMint(wallet)) {
        this.accountTradeSubscriptions.add(wallet);
      }
    }
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

    this.socketOpen = false;
    this.connecting = false;
    this.socket?.close();
    this.socket = undefined;
  }

  subscribeTokenTrades(mints: string[]): PumpPortalTradeSubscriptionResult {
    const result = createEmptyTradeSubscriptionResult();

    if (this.tokenTradeBudgetReached) {
      result.rejected = normalizeMintList(mints);
      result.reasonCodes.push("PUMPPORTAL_TRADE_BUDGET_REACHED");
      return result;
    }

    for (const mint of normalizeMintList(mints)) {
      if (!isValidSolanaMint(mint)) {
        result.rejected.push(mint);
        continue;
      }

      if (this.tokenTradeSubscriptions.has(mint)) {
        continue;
      }

      if (
        this.tokenTradeSubscriptions.size >= this.maxTokenTradeSubscriptions
      ) {
        result.rejected.push(mint);
        result.reasonCodes.push("PUMPPORTAL_TRADE_MAX_TOKENS_REACHED");
        continue;
      }

      this.tokenTradeSubscriptions.add(mint);
      result.subscribed.push(mint);
    }

    if (result.rejected.length > 0) {
      result.reasonCodes.push("INVALID_OR_REJECTED_MINT");
    }

    if (result.subscribed.length > 0) {
      result.reasonCodes.push(
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "PUMPPORTAL_TRADE_SUBSCRIBED"
      );
      this.sendTokenTradeSubscription(result.subscribed);
    }

    result.reasonCodes = uniqueReasonCodes(result.reasonCodes);
    return result;
  }

  unsubscribeTokenTrades(mints: string[]): PumpPortalTradeSubscriptionResult {
    const result = createEmptyTradeSubscriptionResult();

    for (const mint of normalizeMintList(mints)) {
      if (this.tokenTradeSubscriptions.delete(mint)) {
        result.unsubscribed.push(mint);
      }
    }

    if (result.unsubscribed.length > 0) {
      result.reasonCodes.push("PUMPPORTAL_TRADE_UNSUBSCRIBED");
      this.sendTokenTradeUnsubscription(result.unsubscribed);
    }

    return result;
  }

  subscribeAccountTrades(wallets: string[]): PumpPortalTradeSubscriptionResult {
    const result = createEmptyTradeSubscriptionResult();

    if (this.accountTradeBudgetReached) {
      result.rejected = normalizeMintList(wallets);
      result.reasonCodes.push("PUMPPORTAL_ACCOUNT_TRADE_BUDGET_REACHED");
      return result;
    }

    for (const wallet of normalizeMintList(wallets)) {
      if (!isValidSolanaMint(wallet)) {
        result.rejected.push(wallet);
        continue;
      }

      if (this.accountTradeSubscriptions.has(wallet)) {
        continue;
      }

      if (
        this.accountTradeSubscriptions.size >= this.maxAccountTradeSubscriptions
      ) {
        result.rejected.push(wallet);
        result.reasonCodes.push("ACCOUNT_TRADE_MAX_WALLETS_REACHED");
        continue;
      }

      this.accountTradeSubscriptions.add(wallet);
      result.subscribed.push(wallet);
    }

    if (result.rejected.length > 0) {
      result.reasonCodes.push("INVALID_OR_REJECTED_WALLET");
    }

    if (result.subscribed.length > 0) {
      result.reasonCodes.push(
        "PUMPPORTAL_ACCOUNT_TRADE_METERED",
        "ACCOUNT_TRADE_SUBSCRIBED"
      );
      this.sendAccountTradeSubscription(result.subscribed);
    }

    result.reasonCodes = uniqueReasonCodes(result.reasonCodes);
    return result;
  }

  unsubscribeAccountTrades(
    wallets: string[]
  ): PumpPortalTradeSubscriptionResult {
    const result = createEmptyTradeSubscriptionResult();

    for (const wallet of normalizeMintList(wallets)) {
      if (this.accountTradeSubscriptions.delete(wallet)) {
        result.unsubscribed.push(wallet);
      }
    }

    if (result.unsubscribed.length > 0) {
      result.reasonCodes.push("ACCOUNT_TRADE_UNSUBSCRIBED");
      this.sendAccountTradeUnsubscription(result.unsubscribed);
    }

    return result;
  }

  getTokenTradeSubscriptions(): string[] {
    return Array.from(this.tokenTradeSubscriptions).sort();
  }

  getAccountTradeSubscriptions(): string[] {
    return Array.from(this.accountTradeSubscriptions).sort();
  }

  getPumpPortalTradeStats(): PumpPortalTokenTradeStats {
    return {
      budgetReached: this.tokenTradeBudgetReached,
      maxEventsPerMint: finiteOrZero(this.maxTokenTradeEventsPerMint),
      maxEventsPerSession: finiteOrZero(this.tokenTradeSessionEventLimit),
      maxSubscribedTokens: this.maxTokenTradeSubscriptions,
      perMintEventCounts: Object.fromEntries(this.tokenTradeEventCounts),
      subscribedTokenCount: this.tokenTradeSubscriptions.size,
      totalEventsThisSession: Array.from(
        this.tokenTradeEventCounts.values()
      ).reduce((total, count) => total + count, 0)
    };
  }

  resetTokenTradeSession(): PumpPortalTokenTradeStats {
    if (this.tokenTradeSubscriptions.size > 0) {
      throw new Error(
        "Cannot reset the PumpPortal token-trade session while subscriptions are active."
      );
    }

    this.tokenTradeEventCounts.clear();
    this.tokenTradeBudgetReached = false;
    this.tokenTradeSessionEventLimit = this.maxTokenTradeEventsPerSession;

    return this.getPumpPortalTradeStats();
  }

  setTokenTradeSessionEventLimit(maxEvents: number): PumpPortalTokenTradeStats {
    if (this.tokenTradeSubscriptions.size > 0) {
      throw new Error(
        "Cannot change the PumpPortal token-trade event limit while subscriptions are active."
      );
    }
    if (this.tokenTradeEventCounts.size > 0) {
      throw new Error(
        "Reset the PumpPortal token-trade session before changing its event limit."
      );
    }
    if (
      !Number.isInteger(maxEvents) ||
      maxEvents < 1 ||
      maxEvents > this.maxTokenTradeEventsPerSession
    ) {
      throw new Error(
        "PumpPortal token-trade event limit must be a positive integer within the configured ceiling."
      );
    }

    this.tokenTradeSessionEventLimit = maxEvents;
    return this.getPumpPortalTradeStats();
  }

  getPumpPortalAccountTradeStats(): PumpPortalAccountTradeStats {
    return {
      budgetReached: this.accountTradeBudgetReached,
      maxEventsPerSession: finiteOrZero(this.maxAccountTradeEventsPerSession),
      maxSubscribedWallets: this.maxAccountTradeSubscriptions,
      perWalletEventCounts: Object.fromEntries(this.accountTradeEventCounts),
      subscribedWalletCount: this.accountTradeSubscriptions.size,
      totalEventsThisSession: Array.from(
        this.accountTradeEventCounts.values()
      ).reduce((total, count) => total + count, 0)
    };
  }

  getStatus(): PumpPortalConnectionStatus {
    const reasonCodes: string[] = [];

    if (this.socketOpen) {
      reasonCodes.push("LIVE_FEED_CONNECTED");
    } else if (this.connecting) {
      reasonCodes.push("LIVE_FEED_CONNECTING");
    } else {
      reasonCodes.push("LIVE_FEED_DISCONNECTED");
    }

    if (!this.lastEventAt) {
      reasonCodes.push("LIVE_FEED_NO_EVENTS_YET");
    }

    if (this.lastError) {
      reasonCodes.push("LIVE_FEED_ERROR");

      if (!this.apiKey && looksLikeApiKeyRequirement(this.lastError)) {
        reasonCodes.push("PUMPPORTAL_API_KEY_REQUIRED_BY_PROVIDER");
      }
    }

    return {
      accountTradeEventCount: this.accountTradeEventCount,
      connected: this.socketOpen,
      connecting: this.connecting,
      disconnected: !this.socketOpen && !this.connecting,
      lastCloseAt: this.lastCloseAt,
      lastError: this.lastError,
      lastEventAt: this.lastEventAt,
      lastMessageAt: this.lastMessageAt,
      lastOpenAt: this.lastOpenAt,
      migrationEventCount: this.migrationEventCount,
      newTokenEventCount: this.newTokenEventCount,
      parseErrorCount: this.parseErrorCount,
      reasonCodes: uniqueReasonCodes(reasonCodes),
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: this.getConfiguredSubscriptions(),
      tokenTradeEventCount: this.tokenTradeEventCount
    };
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }

    const socket = new this.webSocketConstructor(this.wsUrl);
    this.socket = socket;
    this.connecting = true;
    this.logger.info?.("PumpPortal websocket connecting", {
      url: maskPumpPortalUrl(this.wsUrl)
    });

    socket.on("open", () => {
      this.socketOpen = true;
      this.connecting = false;
      this.lastOpenAt = this.now().toISOString();
      this.lastError = null;
      this.reconnectDelayMs = this.reconnectInitialDelayMs;
      this.sendSubscriptions(socket);
    });

    socket.on("message", (data) => {
      this.handleMessage(data);
    });

    socket.on("error", (error) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.warn?.("PumpPortal websocket error", {
        error: this.lastError
      });
      this.scheduleReconnect();
    });

    socket.on("close", () => {
      this.socketOpen = false;
      this.connecting = false;
      this.lastCloseAt = this.now().toISOString();
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

    const tokenTradeMints = this.getTokenTradeSubscriptions();

    if (tokenTradeMints.length > 0) {
      socket.send(
        JSON.stringify({
          keys: tokenTradeMints,
          method: "subscribeTokenTrade"
        })
      );
    }

    const accountTradeWallets = this.getAccountTradeSubscriptions();

    if (accountTradeWallets.length > 0) {
      socket.send(
        JSON.stringify({
          keys: accountTradeWallets,
          method: "subscribeAccountTrade"
        })
      );
    }
  }

  private handleMessage(data: unknown): void {
    this.lastMessageAt = this.now().toISOString();
    const payload = this.parsePayload(data);

    if (!payload) {
      return;
    }

    const accountTrade = normalizePumpPortalAccountTradePayload(payload, {
      now: this.now
    });
    const tokenTrade = normalizePumpPortalTokenTradePayload(payload, {
      now: this.now
    });
    const event =
      (accountTrade && this.accountTradeSubscriptions.has(accountTrade.wallet)
        ? accountTrade
        : null) ??
      tokenTrade ??
      accountTrade ??
      this.normalizePayload(payload);

    if (!event) {
      this.logger.debug?.("Skipping unknown PumpPortal payload");
      return;
    }

    this.emitted += 1;
    this.lastEventAt = event.timestamp;

    if (isPumpPortalTokenTradeEvent(event)) {
      this.recordTokenTradeEvent(event);
    } else if (isPumpPortalAccountTradeEvent(event)) {
      this.recordAccountTradeEvent(event);
    } else if (event.rawSourceEventType === "migration") {
      this.migrationEventCount += 1;
    } else if (event.type === "token_created") {
      this.newTokenEventCount += 1;
    }

    this.handler?.(event);

    if (this.maxEvents !== undefined && this.emitted >= this.maxEvents) {
      this.stop();
    }
  }

  private sendTokenTradeSubscription(mints: string[]): void {
    if (!this.socket || !this.socketOpen || mints.length === 0) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        keys: mints,
        method: "subscribeTokenTrade"
      })
    );
  }

  private sendTokenTradeUnsubscription(mints: string[]): void {
    if (!this.socket || !this.socketOpen || mints.length === 0) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        keys: mints,
        method: "unsubscribeTokenTrade"
      })
    );
  }

  private sendAccountTradeSubscription(wallets: string[]): void {
    if (!this.socket || !this.socketOpen || wallets.length === 0) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        keys: wallets,
        method: "subscribeAccountTrade"
      })
    );
  }

  private sendAccountTradeUnsubscription(wallets: string[]): void {
    if (!this.socket || !this.socketOpen || wallets.length === 0) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        keys: wallets,
        method: "unsubscribeAccountTrade"
      })
    );
  }

  private recordTokenTradeEvent(event: TokenTradeEvent): void {
    const previousCount = this.tokenTradeEventCounts.get(event.mint) ?? 0;
    const nextCount = previousCount + 1;

    this.tokenTradeEventCounts.set(event.mint, nextCount);

    const totalEvents = Array.from(this.tokenTradeEventCounts.values()).reduce(
      (total, count) => total + count,
      0
    );
    const reachedMintBudget = nextCount >= this.maxTokenTradeEventsPerMint;
    const reachedSessionBudget =
      totalEvents >= this.tokenTradeSessionEventLimit;

    if (reachedMintBudget) {
      this.unsubscribeTokenTrades([event.mint]);
    }

    if (reachedSessionBudget) {
      this.tokenTradeBudgetReached = true;
      this.unsubscribeTokenTrades(this.getTokenTradeSubscriptions());
    }
  }

  private recordAccountTradeEvent(event: AccountTradeEvent): void {
    const previousCount = this.accountTradeEventCounts.get(event.wallet) ?? 0;
    const nextCount = previousCount + 1;

    this.accountTradeEventCounts.set(event.wallet, nextCount);
    this.accountTradeEventCount += 1;

    const totalEvents = Array.from(
      this.accountTradeEventCounts.values()
    ).reduce((total, count) => total + count, 0);

    if (totalEvents >= this.maxAccountTradeEventsPerSession) {
      this.accountTradeBudgetReached = true;
      this.unsubscribeAccountTrades(this.getAccountTradeSubscriptions());
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
      this.parseErrorCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.warn?.("Failed to parse PumpPortal payload", {
        error: this.lastError
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
    const metadataUri = readString(payload, [
      "metadataUri",
      "metadata_uri",
      "uri",
      "metadata"
    ]);
    const imageUri = readString(payload, [
      "imageUri",
      "image_uri",
      "image",
      "logo"
    ]);
    const description = readString(payload, ["description", "desc"]);
    const website = readString(payload, ["website", "external_url", "url"]);
    const twitter = readString(payload, ["twitter", "x"]);
    const telegram = readString(payload, ["telegram"]);
    const discord = readString(payload, ["discord"]);
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
    const associatedBondingCurve = readString(payload, [
      "associatedBondingCurve",
      "associatedBondingCurveKey",
      "associated_bonding_curve"
    ]);
    const marketCapSol = readNumber(payload, [
      "marketCapSol",
      "market_cap_sol"
    ]);
    const vSolInBondingCurve = readNumber(payload, [
      "vSolInBondingCurve",
      "virtualSolReserves",
      "virtualSolReserve"
    ]);
    const vTokensInBondingCurve = readNumber(payload, [
      "vTokensInBondingCurve",
      "virtualTokenReserves",
      "virtualTokenReserve"
    ]);
    const virtualSolReserves = readNumber(payload, [
      "virtualSolReserves",
      "virtualSolReserve",
      "vSolInBondingCurve"
    ]);
    const virtualTokenReserves = readNumber(payload, [
      "virtualTokenReserves",
      "virtualTokenReserve",
      "vTokensInBondingCurve"
    ]);
    const realSolReserves = readNumber(payload, [
      "realSolReserves",
      "realSolReserve",
      "realSolInBondingCurve"
    ]);
    const realTokenReserves = readNumber(payload, [
      "realTokenReserves",
      "realTokenReserve",
      "realTokensInBondingCurve"
    ]);
    const pool = readString(payload, ["pool", "pair", "newPool"]);
    const raydiumPool = readString(payload, ["raydiumPool", "raydium_pool"]);
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
        ...(metadataUri ? { metadataUri } : {}),
        ...(imageUri ? { imageUri } : {}),
        ...(description ? { description } : {}),
        ...(website ? { website } : {}),
        ...(twitter ? { twitter } : {}),
        ...(telegram ? { telegram } : {}),
        ...(discord ? { discord } : {}),
        ...(creator ? { creator } : {}),
        ...(marketCapSol !== null ? { marketCapSol } : {}),
        ...(vSolInBondingCurve !== null ? { vSolInBondingCurve } : {}),
        ...(vTokensInBondingCurve !== null ? { vTokensInBondingCurve } : {}),
        ...(bondingCurve ? { bondingCurveKey: bondingCurve } : {}),
        ...(associatedBondingCurve ? { associatedBondingCurve } : {}),
        ...(virtualSolReserves !== null ? { virtualSolReserves } : {}),
        ...(virtualTokenReserves !== null ? { virtualTokenReserves } : {}),
        ...(realSolReserves !== null ? { realSolReserves } : {}),
        ...(realTokenReserves !== null ? { realTokenReserves } : {}),
        ...(pool ? { pool } : {}),
        ...(raydiumPool ? { raydiumPool } : {}),
        source: "pumpportal",
        ageSeconds: 0,
        firstSeenAt: timestamp
      },
      creator,
      dataSource: "pumpportal",
      dataSourceMode: "real",
      metrics: createIncompleteMetrics(),
      metricsComplete: false,
      raw: payload,
      rawSourceEventType,
      realData: true,
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
    this.reconnectAttempts += 1;
    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * 2,
      this.reconnectMaxDelayMs
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delayMs);
  }

  private getConfiguredSubscriptions(): string[] {
    const subscriptions: string[] = [];

    if (this.subscribeNewToken) {
      subscriptions.push("subscribeNewToken");
    }

    if (this.subscribeMigration) {
      subscriptions.push("subscribeMigration");
    }

    if (this.tokenTradeSubscriptions.size > 0) {
      subscriptions.push("subscribeTokenTrade");
    }

    if (this.accountTradeSubscriptions.size > 0) {
      subscriptions.push("subscribeAccountTrade");
    }

    return subscriptions;
  }
}

export function buildPumpPortalWsUrl(
  options: {
    apiKey?: string | undefined;
    wsUrl?: string | undefined;
  } = {}
): string {
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

export function normalizePumpPortalTokenTradePayload(
  payload: Record<string, unknown>,
  options: {
    now?: () => Date;
  } = {}
): TokenTradeEvent | null {
  if (!looksLikePumpPortalTokenTradePayload(payload)) {
    return null;
  }

  const now = options.now ?? (() => new Date());
  const receivedAt = now().toISOString();
  const rawMint = readString(payload, [
    "mint",
    "tokenMint",
    "ca",
    "address",
    "contractAddress"
  ]);
  const mint = rawMint ?? "UNKNOWN_MINT";
  const side = normalizeTradeSide(
    readString(payload, ["txType", "type", "side"])
  );
  const solAmount = readNumber(payload, ["solAmount", "sol_amount", "sol"]);
  const tokenAmount = readNumber(payload, [
    "tokenAmount",
    "tokensAmount",
    "token_amount",
    "amount"
  ]);
  const priceSol =
    solAmount !== null &&
    tokenAmount !== null &&
    solAmount > 0 &&
    tokenAmount > 0
      ? roundMetric(solAmount / tokenAmount)
      : null;
  const volumeSol = solAmount !== null && solAmount > 0 ? solAmount : null;
  const validMint = rawMint !== undefined && isValidSolanaMint(rawMint);
  const usableForMetrics =
    validMint &&
    (side === "buy" || side === "sell") &&
    tokenAmount !== null &&
    tokenAmount > 0 &&
    solAmount !== null &&
    solAmount > 0 &&
    priceSol !== null &&
    Number.isFinite(priceSol) &&
    volumeSol !== null &&
    Number.isFinite(volumeSol);
  const reasonCodes = createPumpPortalTradeReasonCodes({
    priceSol,
    rawMint,
    side,
    solAmount,
    tokenAmount,
    usableForMetrics,
    validMint,
    volumeSol
  });
  const timestamp =
    readTimestamp(payload) ??
    readTimestampFromReceivedAt(payload) ??
    receivedAt;
  const signature = readString(payload, [
    "signature",
    "txSignature",
    "transactionSignature"
  ]);
  const trader = readString(payload, ["traderPublicKey", "trader", "user"]);
  const symbol = readString(payload, ["symbol", "ticker"]);
  const name = readString(payload, ["name", "tokenName"]);
  const metadataUri = readString(payload, [
    "metadataUri",
    "metadata_uri",
    "uri",
    "metadata"
  ]);
  const imageUri = readString(payload, [
    "imageUri",
    "image_uri",
    "image",
    "logo"
  ]);
  const description = readString(payload, ["description", "desc"]);
  const website = readString(payload, ["website", "external_url", "url"]);
  const twitter = readString(payload, ["twitter", "x"]);
  const telegram = readString(payload, ["telegram"]);
  const discord = readString(payload, ["discord"]);
  const metrics = createPumpPortalTradeMetrics({
    priceSol,
    reasonCodes,
    side,
    tokenAmount,
    usableForMetrics,
    volumeSol
  });

  const event: TokenTradeEvent = {
    type: "trade",
    mint,
    source: "pumpportal",
    dataSource: "pumpportal",
    dataSourceMode: "real",
    token: {
      chain: "solana",
      mint
    },
    side,
    priceUsd: null,
    volumeUsd: null,
    priceSol,
    volumeSol,
    priceQuote: priceSol,
    volumeQuote: volumeSol,
    quoteAsset: "SOL",
    quoteMint: null,
    usableForMetrics,
    confidence: createPumpPortalTradeConfidence({
      signature,
      trader,
      usableForMetrics
    }),
    metrics,
    metricsComplete: usableForMetrics,
    raw: payload,
    rawSourceEventType: "token_trade",
    realData: true,
    reasonCodes,
    receivedAt,
    riskFlags: { ...safeRiskFlags },
    timestamp
  };

  if (tokenAmount !== null) {
    event.tokenAmount = tokenAmount;
  }

  if (trader) {
    event.trader = trader;
  }

  if (signature) {
    event.signature = signature;
  }

  const bondingCurve = readString(payload, [
    "bondingCurve",
    "bondingCurveKey",
    "bondingCurveAddress"
  ]);
  const pool = readString(payload, ["pool"]);

  if (symbol) {
    event.symbol = symbol;
  }

  if (name) {
    event.name = name;
  }

  if (metadataUri) {
    event.metadataUri = metadataUri;
  }

  if (imageUri) {
    event.imageUri = imageUri;
  }

  if (description) {
    event.description = description;
  }

  if (website) {
    event.website = website;
  }

  if (twitter) {
    event.twitter = twitter;
  }

  if (telegram) {
    event.telegram = telegram;
  }

  if (discord) {
    event.discord = discord;
  }

  if (bondingCurve) {
    event.bondingCurve = bondingCurve;
  }

  if (pool) {
    event.marketObservation = {
      signature: signature ?? `pumpportal:${mint}:${timestamp}`,
      side,
      quoteAsset: "SOL",
      confidence: event.confidence ?? "low",
      usableForMetrics,
      reasonCodes,
      priceSol,
      priceUsd: null,
      volumeSol,
      volumeUsd: null,
      createdAt: timestamp
    };
  }

  return event;
}

export function normalizePumpPortalAccountTradePayload(
  payload: Record<string, unknown>,
  options: {
    now?: () => Date;
  } = {}
): AccountTradeEvent | null {
  const now = options.now ?? (() => new Date());
  const receivedAt = now().toISOString();
  const rawType = readString(payload, ["txType", "type", "side"]);
  const rawTypeLower = rawType?.toLowerCase();

  if (
    rawTypeLower?.includes("create") ||
    rawTypeLower?.includes("migr") ||
    rawTypeLower === "new_token"
  ) {
    return null;
  }

  const wallet = readString(payload, [
    "wallet",
    "account",
    "trader",
    "user",
    "traderPublicKey"
  ]);
  const mint = readString(payload, [
    "mint",
    "tokenMint",
    "ca",
    "contractAddress"
  ]);
  const side = normalizeTradeSide(rawType);

  if (!wallet && !mint && side === "unknown") {
    return null;
  }

  const solAmount = readNumber(payload, ["solAmount", "sol_amount", "sol"]);
  const tokenAmount = readNumber(payload, [
    "tokenAmount",
    "tokensAmount",
    "token_amount",
    "amount"
  ]);
  const priceSol =
    solAmount !== null &&
    tokenAmount !== null &&
    solAmount > 0 &&
    tokenAmount > 0
      ? roundMetric(solAmount / tokenAmount)
      : null;
  const volumeSol = solAmount !== null && solAmount > 0 ? solAmount : null;
  const timestamp =
    readTimestamp(payload) ??
    readTimestampFromReceivedAt(payload) ??
    receivedAt;
  const validWallet = wallet !== undefined && isValidSolanaMint(wallet);
  const validMint = mint !== undefined && isValidSolanaMint(mint);
  const usableForExitStrategy =
    validWallet &&
    validMint &&
    (side === "buy" || side === "sell") &&
    Number.isFinite(Date.parse(timestamp));
  const signature = readString(payload, [
    "signature",
    "txSignature",
    "transactionSignature"
  ]);
  const reasonCodes = createPumpPortalAccountTradeReasonCodes({
    mint,
    side,
    usableForExitStrategy,
    validMint,
    validWallet,
    wallet
  });

  const event: AccountTradeEvent = {
    type: "account_trade",
    wallet: wallet ?? "UNKNOWN_WALLET",
    walletAlias: null,
    mint: mint ?? "UNKNOWN_MINT",
    side,
    priceSol,
    volumeSol,
    tokenAmount,
    source: "pumpportal",
    dataSource: "pumpportal",
    dataSourceMode: "real",
    confidence:
      usableForExitStrategy && signature
        ? "high"
        : usableForExitStrategy
          ? "medium"
          : "low",
    usableForExitStrategy,
    raw: payload,
    rawSourceEventType: "account_trade",
    realData: true,
    reasonCodes,
    receivedAt,
    timestamp
  };

  if (signature) {
    event.signature = signature;
  }

  return event;
}

export function isValidSolanaMint(mint: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint.trim());
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

function readTimestampFromReceivedAt(
  payload: Record<string, unknown>
): string | undefined {
  const value = payload["receivedAt"];

  if (typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readNumber(
  payload: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function looksLikePumpPortalTokenTradePayload(
  payload: Record<string, unknown>
): boolean {
  const rawType = readString(payload, ["txType", "type", "side"]);
  const normalizedType = rawType?.trim().toLowerCase();
  const side = normalizeTradeSide(rawType);

  if (
    normalizedType === "create" ||
    normalizedType === "created" ||
    normalizedType === "new_token" ||
    normalizedType === "migrate" ||
    normalizedType === "migration"
  ) {
    return false;
  }

  if (side === "buy" || side === "sell") {
    return true;
  }

  if (normalizedType?.includes("trade")) {
    return true;
  }

  return (
    readNumber(payload, ["solAmount", "sol_amount", "sol"]) !== null ||
    readNumber(payload, [
      "tokenAmount",
      "tokensAmount",
      "token_amount",
      "amount"
    ]) !== null
  );
}

function normalizeTradeSide(
  value: string | undefined
): "buy" | "sell" | "unknown" {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "buy" || normalized === "sell") {
    return normalized;
  }

  if (normalized === "purchase") {
    return "buy";
  }

  return "unknown";
}

function createPumpPortalTradeReasonCodes(input: {
  priceSol: number | null;
  rawMint: string | undefined;
  side: "buy" | "sell" | "unknown";
  solAmount: number | null;
  tokenAmount: number | null;
  usableForMetrics: boolean;
  validMint: boolean;
  volumeSol: number | null;
}): string[] {
  const reasonCodes = [
    "PUMPPORTAL_TOKEN_TRADE",
    "PUMPPORTAL_TRADE_STREAM_METERED",
    "PUMPPORTAL_TRADE_PAYLOAD_NORMALIZED"
  ];

  if (!input.rawMint || !input.validMint) {
    reasonCodes.push("PUMPPORTAL_TRADE_MISSING_MINT");
  }

  if (input.side === "unknown") {
    reasonCodes.push("PUMPPORTAL_TRADE_UNKNOWN_SIDE");
  }

  if (
    input.solAmount === null ||
    input.solAmount <= 0 ||
    input.tokenAmount === null ||
    input.tokenAmount <= 0
  ) {
    reasonCodes.push("PUMPPORTAL_TRADE_MISSING_AMOUNT");
  }

  if (input.priceSol !== null) {
    reasonCodes.push("PUMPPORTAL_TRADE_PRICE_SOL_COMPUTED");
  }

  if (input.volumeSol !== null) {
    reasonCodes.push("PUMPPORTAL_TRADE_VOLUME_SOL_COMPUTED");
  }

  reasonCodes.push(
    input.usableForMetrics
      ? "PUMPPORTAL_TRADE_USABLE_FOR_METRICS"
      : "PUMPPORTAL_TRADE_UNUSABLE_FOR_METRICS"
  );

  return uniqueReasonCodes(reasonCodes);
}

function createPumpPortalAccountTradeReasonCodes(input: {
  mint: string | undefined;
  side: "buy" | "sell" | "unknown";
  usableForExitStrategy: boolean;
  validMint: boolean;
  validWallet: boolean;
  wallet: string | undefined;
}): string[] {
  const reasonCodes = [
    "PUMPPORTAL_ACCOUNT_TRADE",
    "PUMPPORTAL_ACCOUNT_TRADE_METERED",
    "ACCOUNT_TRADE_PAYLOAD_NORMALIZED"
  ];

  if (!input.wallet || !input.validWallet) {
    reasonCodes.push("ACCOUNT_TRADE_MISSING_WALLET");
  }

  if (!input.mint || !input.validMint) {
    reasonCodes.push("ACCOUNT_TRADE_MISSING_MINT");
  }

  if (input.side === "unknown") {
    reasonCodes.push("ACCOUNT_TRADE_UNKNOWN_SIDE");
  }

  reasonCodes.push(
    input.usableForExitStrategy
      ? "ACCOUNT_TRADE_USABLE_FOR_EXIT"
      : "ACCOUNT_TRADE_UNUSABLE_FOR_EXIT"
  );

  return uniqueReasonCodes(reasonCodes);
}

function createPumpPortalTradeConfidence(input: {
  signature: string | undefined;
  trader: string | undefined;
  usableForMetrics: boolean;
}): ObservationConfidence {
  if (!input.usableForMetrics) {
    return "low";
  }

  return input.signature && input.trader ? "high" : "medium";
}

function createPumpPortalTradeMetrics(input: {
  priceSol: number | null;
  reasonCodes: string[];
  side: "buy" | "sell" | "unknown";
  tokenAmount: number | null;
  usableForMetrics: boolean;
  volumeSol: number | null;
}): RollingMetrics {
  const isBuy = input.side === "buy";
  const isSell = input.side === "sell";

  return {
    priceUsd: 0,
    priceSol: input.priceSol,
    priceQuote: input.priceSol,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: 0,
    volume5mUsd: 0,
    volume15mUsd: 0,
    volumeSol: input.volumeSol,
    volumeQuote: input.volumeSol,
    quoteAsset: "SOL",
    quoteMint: null,
    usableForMetrics: input.usableForMetrics,
    confidence: input.usableForMetrics ? "medium" : "low",
    reasonCodes: input.reasonCodes,
    buyCount1m: isBuy ? 1 : 0,
    buyCount5m: isBuy ? 1 : 0,
    sellCount1m: isSell ? 1 : 0,
    sellCount5m: isSell ? 1 : 0,
    uniqueBuyers1m: isBuy ? 1 : 0,
    uniqueBuyers5m: isBuy ? 1 : 0,
    uniqueSellers1m: isSell ? 1 : 0,
    uniqueSellers5m: isSell ? 1 : 0,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: 0,
    priceChange5mPct: 0,
    volumeVelocity: 0,
    buyerVelocity: 0
  };
}

function isPumpPortalTokenTradeEvent(
  event: FeedEvent
): event is TokenTradeEvent {
  return (
    event.type === "trade" &&
    event.source === "pumpportal" &&
    event.reasonCodes?.includes("PUMPPORTAL_TOKEN_TRADE") === true
  );
}

function isPumpPortalAccountTradeEvent(
  event: FeedEvent
): event is AccountTradeEvent {
  return (
    event.type === "account_trade" &&
    event.source === "pumpportal" &&
    event.reasonCodes?.includes("PUMPPORTAL_ACCOUNT_TRADE") === true
  );
}

function normalizeMintList(mints: string[]): string[] {
  return Array.from(
    new Set(mints.map((mint) => mint.trim()).filter((mint) => mint.length > 0))
  );
}

function createEmptyTradeSubscriptionResult(): PumpPortalTradeSubscriptionResult {
  return {
    reasonCodes: [],
    rejected: [],
    subscribed: [],
    unsubscribed: []
  };
}

function uniqueReasonCodes(values: string[]): string[] {
  return Array.from(new Set(values));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(12));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeApiKeyRequirement(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("key") ||
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  );
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
