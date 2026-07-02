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

export type MockFeedProviderOptions = {
  intervalMs?: number;
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
  private readonly knownTokens: TokenId[] = [];
  private readonly intervalMs: number;
  private handler: FeedEventHandler | undefined;

  constructor(options: MockFeedProviderOptions = {}) {
    this.intervalMs = options.intervalMs ?? 2000;
  }

  start(handler: FeedEventHandler): void {
    this.handler = handler;
    this.emitNext();
    this.timer = setInterval(() => this.emitNext(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private emitNext(): void {
    if (!this.handler) {
      return;
    }

    this.sequence += 1;
    this.handler(this.createEvent());
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
    const mint = `MockMint${String(this.sequence).padStart(4, "0")}111111111111111111111111111111`;
    const timestamp = new Date().toISOString();
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
        source: "mock",
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
      timestamp: new Date().toISOString()
    };
  }

  private createMetrics(riskFlags: RiskFlags): RollingMetrics {
    const wave = this.sequence % 6;
    const rising = wave === 1 || wave === 2 || wave === 5;
    const topHolderPercent = riskFlags.topHolderConcentrationHigh
      ? 32
      : 7 + wave;

    return {
      priceUsd: 0.0001 + this.sequence * 0.000013,
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

  private createRiskFlags(): RiskFlags {
    return {
      ...safeRiskFlags,
      mintAuthorityActive: this.sequence % 13 === 0,
      freezeAuthorityActive: this.sequence % 17 === 0,
      topHolderConcentrationHigh: this.sequence % 11 === 0,
      lowLiquidity: this.sequence % 7 === 0,
      mutableMetadata: this.sequence % 5 === 0
    };
  }
}

// TODO: Add public Solana feed providers here later, such as PumpPortal,
// Birdeye, Helius, or DexScreener adapters.
// TODO: Add Axiom overlay inputs only through user-permitted public surfaces.
