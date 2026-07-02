import type {
  RiskFlags,
  RollingMetrics,
  TokenCandidate,
  TokenId
} from "@axi/shared";

export type TokenTradeEvent = {
  type: "trade";
  token: TokenId;
  side: "buy" | "sell";
  priceUsd: number;
  volumeUsd: number;
  metrics: RollingMetrics;
  riskFlags: RiskFlags;
  timestamp: string;
};

export type TokenCreatedEvent = {
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
  maxEvents?: number;
  scenario?: MockFeedScenario;
  seed?: number | string;
};

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
  private readonly knownTokens: TokenId[] = [];
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
    if (this.sequence % 4 === 0 && this.knownTokens.length > 0) {
      return this.createTradeEvent();
    }

    const event = this.createTokenCreatedEvent();
    this.knownTokens.push(event.candidate.id);
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
      riskFlags,
      timestamp
    };
  }

  private createTradeEvent(): FeedEvent {
    const index = this.sequence % this.knownTokens.length;
    const token = this.knownTokens[index];

    if (!token) {
      return this.createTokenCreatedEvent();
    }

    const riskFlags = this.createRiskFlags();
    const metrics = this.createMetrics(riskFlags);

    return {
      type: "trade",
      token,
      side: this.sequence % 2 === 0 ? "buy" : "sell",
      priceUsd: metrics.priceUsd,
      volumeUsd: Math.max(metrics.volume1mUsd / 4, 25),
      metrics,
      riskFlags,
      timestamp: this.createTimestamp()
    };
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

// TODO: Add public Solana feed providers here later, such as PumpPortal,
// Birdeye, Helius, or DexScreener adapters.
// TODO: Add Axiom overlay inputs only through user-permitted public surfaces.
