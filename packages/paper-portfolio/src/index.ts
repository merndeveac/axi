export type PaperOrderType = "entry" | "exit";
export type PaperOrderSide = "buy" | "sell";
export type PaperOrderSource =
  | "launch_signal"
  | "watched_wallet_exit"
  | "take_profit"
  | "stop_loss"
  | "paper_exit_policy"
  | "manual_paper"
  | "replay";
export type PaperFillStatus = "filled" | "rejected" | "partial";
export type PaperPositionStatus = "open" | "partially_closed" | "closed";
export type PaperRiskLevel = "unknown" | "low" | "medium" | "high" | "critical";

export type PaperPortfolioConfig = {
  startingCashSol: number;
  maxPositionSizeSol: number;
  maxOpenPositions: number;
  maxDailySpendSol: number;
  feeBps: number;
  slippageBps: number;
  requirePriceForEntry: boolean;
  requirePriceForExit: boolean;
  allowPartialExits: boolean;
  fallbackPriceSol?: number | null;
  paperOnly: true;
};

export type PaperOrderIntent = {
  id: string;
  type: PaperOrderType;
  side: PaperOrderSide;
  mint: string;
  symbol?: string | null;
  title?: string | null;
  reason: string;
  source: PaperOrderSource;
  requestedSizeSol?: number | null;
  requestedSellPct?: number | null;
  signalScore?: number | null;
  riskLevel?: PaperRiskLevel | null;
  reasonCodes: string[];
  createdAt: string;
};

export type PaperFill = {
  id: string;
  orderIntentId: string;
  side: PaperOrderSide;
  mint: string;
  priceSol: number;
  sizeSol: number;
  tokenAmount: number;
  feeSol: number;
  slippageSol: number;
  effectivePriceSol: number;
  fillStatus: PaperFillStatus;
  rejectionReason?: string | null;
  reasonCodes: string[];
  paperOnly: true;
  createdAt: string;
};

export type PaperPosition = {
  id: string;
  mint: string;
  symbol?: string | null;
  title?: string | null;
  status: PaperPositionStatus;
  entryPriceSol: number;
  averageEntryPriceSol: number;
  currentPriceSol?: number | null;
  peakPriceSol?: number | null;
  peakUnrealizedPnlPct?: number | null;
  sizeSol: number;
  remainingSizeSol: number;
  tokenAmount: number;
  remainingTokenAmount: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  realizedPnlPct: number;
  unrealizedPnlPct: number;
  totalFeesSol: number;
  openedAt: string;
  updatedAt: string;
  closedAt?: string | null;
  entryReasonCodes: string[];
  exitReasonCodes: string[];
};

export type PaperPortfolioSnapshot = {
  cashSol: number;
  deployedSol: number;
  equitySol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  totalPnlPct: number;
  openPositionCount: number;
  closedPositionCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  maxDrawdownSol: number;
  maxDrawdownPct: number;
  totalFeesSol: number;
  totalTrades: number;
  updatedAt: string;
};

export type PaperPortfolioEngine = {
  readonly config: PaperPortfolioConfig;
  simulateBuy: (intent: PaperOrderIntent, marketPrice?: number | null) => PaperFill;
  simulateSell: (
    intent: PaperOrderIntent,
    position: PaperPosition | null | undefined,
    marketPrice?: number | null
  ) => PaperFill;
  applyFill: (fill: PaperFill, intent?: PaperOrderIntent) => PaperPosition | null;
  updateMarkPrice: (mint: string, priceSol?: number | null) => PaperPosition | null;
  getPosition: (mint: string) => PaperPosition | null;
  getOpenPositions: () => PaperPosition[];
  getClosedPositions: () => PaperPosition[];
  getSnapshot: () => PaperPortfolioSnapshot;
  getOrderHistory: () => PaperOrderIntent[];
  getFillHistory: () => PaperFill[];
  loadPositions: (positions: PaperPosition[]) => void;
  loadState: (input: {
    positions: PaperPosition[];
    orders: PaperOrderIntent[];
    fills: PaperFill[];
  }) => void;
  reset: () => void;
};

export const paperPortfolioReasonCodes = {
  created: "PAPER_PORTFOLIO_CREATED",
  entryIntentCreated: "PAPER_ENTRY_INTENT_CREATED",
  exitIntentCreated: "PAPER_EXIT_INTENT_CREATED",
  buyFilled: "PAPER_BUY_FILLED",
  sellFilled: "PAPER_SELL_FILLED",
  fillRejected: "PAPER_FILL_REJECTED",
  priceMissing: "PAPER_PRICE_MISSING",
  maxPositionSizeExceeded: "PAPER_MAX_POSITION_SIZE_EXCEEDED",
  maxOpenPositionsExceeded: "PAPER_MAX_OPEN_POSITIONS_EXCEEDED",
  maxDailySpendExceeded: "PAPER_MAX_DAILY_SPEND_EXCEEDED",
  noPosition: "PAPER_NO_POSITION",
  partialExit: "PAPER_PARTIAL_EXIT",
  fullExit: "PAPER_FULL_EXIT",
  pnlUpdated: "PAPER_PNL_UPDATED",
  stopLossTriggered: "PAPER_STOP_LOSS_TRIGGERED",
  takeProfitTriggered: "PAPER_TAKE_PROFIT_TRIGGERED",
  exitPolicyTriggered: "PAPER_EXIT_POLICY_TRIGGERED",
  paperOnlyNoLiveExecution: "PAPER_ONLY_NO_LIVE_EXECUTION",
  duplicatePosition: "PAPER_DUPLICATE_POSITION_BLOCKED",
  insufficientCash: "PAPER_INSUFFICIENT_CASH",
  partialExitBlocked: "PAPER_PARTIAL_EXIT_BLOCKED",
  priceFallbackUsed: "PAPER_PRICE_FALLBACK_USED"
} as const;

type EngineOptions = Partial<PaperPortfolioConfig> & {
  now?: () => Date;
};

type IntentSourceShape = Record<string, unknown>;

const epsilon = 0.000000001;

export function createPaperPortfolioEngine(
  config: EngineOptions = {}
): PaperPortfolioEngine {
  return new DefaultPaperPortfolioEngine(config);
}

export function createDefaultPaperPortfolioConfig(
  input: Partial<PaperPortfolioConfig> = {}
): PaperPortfolioConfig {
  return {
    startingCashSol: sanitizePositive(input.startingCashSol, 1),
    maxPositionSizeSol: sanitizePositive(input.maxPositionSizeSol, 0.01),
    maxOpenPositions: sanitizePositiveInteger(input.maxOpenPositions, 3),
    maxDailySpendSol: sanitizePositive(input.maxDailySpendSol, 0.05),
    feeBps: sanitizeNonnegative(input.feeBps, 100),
    slippageBps: sanitizeNonnegative(input.slippageBps, 300),
    requirePriceForEntry: input.requirePriceForEntry ?? true,
    requirePriceForExit: input.requirePriceForExit ?? true,
    allowPartialExits: input.allowPartialExits ?? true,
    fallbackPriceSol:
      input.fallbackPriceSol !== undefined
        ? positiveOrNull(input.fallbackPriceSol)
        : null,
    paperOnly: true
  };
}

export function createEntryIntentFromLaunchSignal(
  signal: IntentSourceShape,
  input: Partial<PaperOrderIntent> = {}
): PaperOrderIntent {
  const mint = readString(signal, "mint") ?? input.mint ?? "UNKNOWN_MINT";
  const now = input.createdAt ?? new Date().toISOString();
  const score = readNumber(signal, "score") ?? input.signalScore ?? null;
  const riskLevel = readRiskLevel(signal, "riskLevel") ?? input.riskLevel ?? null;

  return normalizeIntent({
    id: input.id ?? createIntentId("paper-entry", mint, now),
    type: "entry",
    side: "buy",
    mint,
    symbol: input.symbol ?? readString(signal, "symbol") ?? null,
    title:
      input.title ??
      readString(signal, "title") ??
      readString(signal, "displayName") ??
      null,
    reason: input.reason ?? "launch scanner paper entry",
    source: input.source ?? "launch_signal",
    requestedSizeSol: input.requestedSizeSol ?? null,
    requestedSellPct: null,
    signalScore: score,
    riskLevel,
    reasonCodes: uniqueReasonCodes([
      paperPortfolioReasonCodes.entryIntentCreated,
      paperPortfolioReasonCodes.paperOnlyNoLiveExecution,
      ...readStringArray(signal, "reasonCodes"),
      ...(input.reasonCodes ?? [])
    ]),
    createdAt: now
  });
}

export function createExitIntentFromExitSignal(
  signal: IntentSourceShape,
  input: Partial<PaperOrderIntent> = {}
): PaperOrderIntent {
  const mint = readString(signal, "mint") ?? input.mint ?? "UNKNOWN_MINT";
  const now = input.createdAt ?? new Date().toISOString();

  return normalizeIntent({
    id: input.id ?? createIntentId("paper-exit", mint, now),
    type: "exit",
    side: "sell",
    mint,
    symbol: input.symbol ?? readString(signal, "symbol") ?? null,
    title: input.title ?? readString(signal, "title") ?? null,
    reason: input.reason ?? readString(signal, "sellReason") ?? "paper exit",
    source: input.source ?? "watched_wallet_exit",
    requestedSizeSol: null,
    requestedSellPct:
      input.requestedSellPct ?? readNumber(signal, "sellPct") ?? 100,
    signalScore: input.signalScore ?? readNumber(signal, "score") ?? null,
    riskLevel: input.riskLevel ?? null,
    reasonCodes: uniqueReasonCodes([
      paperPortfolioReasonCodes.exitIntentCreated,
      paperPortfolioReasonCodes.paperOnlyNoLiveExecution,
      ...readStringArray(signal, "reasonCodes"),
      ...(input.reasonCodes ?? [])
    ]),
    createdAt: now
  });
}

class DefaultPaperPortfolioEngine implements PaperPortfolioEngine {
  readonly config: PaperPortfolioConfig;
  private readonly now: () => Date;
  private cashSol: number;
  private readonly positions = new Map<string, PaperPosition>();
  private readonly closedPositions: PaperPosition[] = [];
  private readonly orders: PaperOrderIntent[] = [];
  private readonly fills: PaperFill[] = [];
  private readonly equityHistory: Array<{ equitySol: number; createdAt: string }> = [];

  constructor(options: EngineOptions = {}) {
    this.config = createDefaultPaperPortfolioConfig(options);
    this.now = options.now ?? (() => new Date());
    this.cashSol = this.config.startingCashSol;
    this.recordEquity(this.now().toISOString());
  }

  simulateBuy(intent: PaperOrderIntent, marketPrice?: number | null): PaperFill {
    const normalized = normalizeIntent(intent);
    const createdAt = normalized.createdAt;
    const price = this.resolvePrice(
      marketPrice,
      this.config.requirePriceForEntry
    );
    const requestedSizeSol = sanitizePositive(
      normalized.requestedSizeSol,
      this.config.maxPositionSizeSol
    );
    const feeSol = roundSol(requestedSizeSol * bpsToRatio(this.config.feeBps));
    const rejectionReason =
      price.reason ??
      (requestedSizeSol > this.config.maxPositionSizeSol + epsilon
        ? paperPortfolioReasonCodes.maxPositionSizeExceeded
        : null) ??
      (this.getOpenPositions().length >= this.config.maxOpenPositions
        ? paperPortfolioReasonCodes.maxOpenPositionsExceeded
        : null) ??
      (this.hasOpenPosition(normalized.mint)
        ? paperPortfolioReasonCodes.duplicatePosition
        : null) ??
      (this.getDailySpendSol(createdAt) + requestedSizeSol >
      this.config.maxDailySpendSol + epsilon
        ? paperPortfolioReasonCodes.maxDailySpendExceeded
        : null) ??
      (requestedSizeSol + feeSol > this.cashSol + epsilon
        ? paperPortfolioReasonCodes.insufficientCash
        : null);

    if (rejectionReason || price.value === null) {
      return this.createRejectedFill(normalized, rejectionReason ?? paperPortfolioReasonCodes.priceMissing);
    }

    const effectivePriceSol = roundPrice(
      price.value * (1 + bpsToRatio(this.config.slippageBps))
    );
    const tokenAmount = roundToken(requestedSizeSol / effectivePriceSol);
    const slippageSol = roundSol(requestedSizeSol * bpsToRatio(this.config.slippageBps));

    return {
      id: createFillId(normalized, createdAt),
      orderIntentId: normalized.id,
      side: "buy",
      mint: normalized.mint,
      priceSol: roundPrice(price.value),
      sizeSol: roundSol(requestedSizeSol),
      tokenAmount,
      feeSol,
      slippageSol,
      effectivePriceSol,
      fillStatus: "filled",
      rejectionReason: null,
      reasonCodes: uniqueReasonCodes([
        paperPortfolioReasonCodes.buyFilled,
        paperPortfolioReasonCodes.paperOnlyNoLiveExecution,
        ...(price.usedFallback ? [paperPortfolioReasonCodes.priceFallbackUsed] : []),
        ...normalized.reasonCodes
      ]),
      paperOnly: true,
      createdAt
    };
  }

  simulateSell(
    intent: PaperOrderIntent,
    position: PaperPosition | null | undefined,
    marketPrice?: number | null
  ): PaperFill {
    const normalized = normalizeIntent(intent);
    const createdAt = normalized.createdAt;
    const openPosition =
      position && position.status !== "closed" ? position : this.getPosition(normalized.mint);
    const price = this.resolvePrice(
      marketPrice,
      this.config.requirePriceForExit
    );

    if (!openPosition || openPosition.remainingTokenAmount <= epsilon) {
      return this.createRejectedFill(normalized, paperPortfolioReasonCodes.noPosition);
    }

    const sellPct = clamp(
      sanitizePositive(normalized.requestedSellPct, 100),
      0,
      100
    );

    if (!this.config.allowPartialExits && sellPct < 100) {
      return this.createRejectedFill(
        normalized,
        paperPortfolioReasonCodes.partialExitBlocked
      );
    }

    if (price.reason || price.value === null) {
      return this.createRejectedFill(normalized, price.reason ?? paperPortfolioReasonCodes.priceMissing);
    }

    const sellRatio = sellPct / 100;
    const tokenAmount = roundToken(openPosition.remainingTokenAmount * sellRatio);
    const effectivePriceSol = roundPrice(
      price.value * (1 - bpsToRatio(this.config.slippageBps))
    );
    const grossSol = roundSol(tokenAmount * effectivePriceSol);
    const feeSol = roundSol(grossSol * bpsToRatio(this.config.feeBps));
    const slippageSol = roundSol(
      tokenAmount * Math.max(0, price.value - effectivePriceSol)
    );
    const fillStatus: PaperFillStatus =
      tokenAmount + epsilon < openPosition.remainingTokenAmount
        ? "partial"
        : "filled";

    return {
      id: createFillId(normalized, createdAt),
      orderIntentId: normalized.id,
      side: "sell",
      mint: normalized.mint,
      priceSol: roundPrice(price.value),
      sizeSol: grossSol,
      tokenAmount,
      feeSol,
      slippageSol,
      effectivePriceSol,
      fillStatus,
      rejectionReason: null,
      reasonCodes: uniqueReasonCodes([
        paperPortfolioReasonCodes.sellFilled,
        fillStatus === "partial"
          ? paperPortfolioReasonCodes.partialExit
          : paperPortfolioReasonCodes.fullExit,
        paperPortfolioReasonCodes.paperOnlyNoLiveExecution,
        ...(price.usedFallback ? [paperPortfolioReasonCodes.priceFallbackUsed] : []),
        ...normalized.reasonCodes
      ]),
      paperOnly: true,
      createdAt
    };
  }

  applyFill(fill: PaperFill, intent?: PaperOrderIntent): PaperPosition | null {
    const normalizedIntent = intent ? normalizeIntent(intent) : undefined;

    if (
      normalizedIntent &&
      !this.orders.some((order) => order.id === normalizedIntent.id)
    ) {
      this.orders.push(normalizedIntent);
    }

    if (!this.fills.some((item) => item.id === fill.id)) {
      this.fills.push(normalizeFill(fill));
    }

    if (fill.fillStatus === "rejected") {
      this.recordEquity(fill.createdAt);
      return null;
    }

    const updated =
      fill.side === "buy"
        ? this.applyBuy(fill, normalizedIntent)
        : this.applySell(fill, normalizedIntent);

    this.recordEquity(fill.createdAt);
    return updated;
  }

  updateMarkPrice(mint: string, priceSol?: number | null): PaperPosition | null {
    const price = positiveOrNull(priceSol);
    const existing = this.positions.get(mint);

    if (!existing || existing.status === "closed" || price === null) {
      return existing ?? null;
    }

    const updated = recalculatePositionPnl({
      ...existing,
      currentPriceSol: price,
      updatedAt: this.now().toISOString(),
      entryReasonCodes: uniqueReasonCodes([
        ...existing.entryReasonCodes,
        paperPortfolioReasonCodes.pnlUpdated
      ])
    });

    this.positions.set(mint, updated);
    this.recordEquity(updated.updatedAt);
    return clonePosition(updated);
  }

  getPosition(mint: string): PaperPosition | null {
    const position = this.positions.get(mint);
    return position ? clonePosition(position) : null;
  }

  getOpenPositions(): PaperPosition[] {
    return Array.from(this.positions.values())
      .filter((position) => position.status !== "closed")
      .map(clonePosition)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getClosedPositions(): PaperPosition[] {
    const closed = [
      ...this.closedPositions,
      ...Array.from(this.positions.values()).filter(
        (position) => position.status === "closed"
      )
    ];
    const byId = new Map(closed.map((position) => [position.id, position]));

    return Array.from(byId.values())
      .map(clonePosition)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getSnapshot(): PaperPortfolioSnapshot {
    return this.buildSnapshot(this.now().toISOString());
  }

  getOrderHistory(): PaperOrderIntent[] {
    return this.orders.map((order) => ({ ...order, reasonCodes: [...order.reasonCodes] }));
  }

  getFillHistory(): PaperFill[] {
    return this.fills.map((fill) => ({ ...fill, reasonCodes: [...fill.reasonCodes] }));
  }

  loadPositions(positions: PaperPosition[]): void {
    this.positions.clear();
    this.closedPositions.length = 0;

    for (const position of positions) {
      const normalized = recalculatePositionPnl({
        ...position,
        entryReasonCodes: uniqueReasonCodes(position.entryReasonCodes),
        exitReasonCodes: uniqueReasonCodes(position.exitReasonCodes)
      });
      this.positions.set(normalized.mint, normalized);

      if (normalized.status === "closed") {
        this.closedPositions.push(normalized);
      }
    }

    this.recordEquity(this.now().toISOString());
  }

  loadState(input: {
    positions: PaperPosition[];
    orders: PaperOrderIntent[];
    fills: PaperFill[];
  }): void {
    this.positions.clear();
    this.closedPositions.length = 0;
    this.orders.length = 0;
    this.fills.length = 0;
    this.equityHistory.length = 0;
    this.cashSol = this.config.startingCashSol;

    for (const order of input.orders) {
      const normalized = normalizeIntent(order);
      if (!this.orders.some((candidate) => candidate.id === normalized.id)) {
        this.orders.push(normalized);
      }
    }
    for (const fill of input.fills) {
      const normalized = normalizeFill(fill);
      if (this.fills.some((candidate) => candidate.id === normalized.id)) {
        continue;
      }
      this.fills.push(normalized);
      if (normalized.fillStatus !== "rejected") {
        this.cashSol = roundSol(
          this.cashSol +
            (normalized.side === "buy"
              ? -normalized.sizeSol - normalized.feeSol
              : normalized.sizeSol - normalized.feeSol)
        );
      }
    }
    for (const position of input.positions) {
      const normalized = recalculatePositionPnl({
        ...position,
        entryReasonCodes: uniqueReasonCodes(position.entryReasonCodes),
        exitReasonCodes: uniqueReasonCodes(position.exitReasonCodes)
      });
      this.positions.set(normalized.mint, normalized);
      if (normalized.status === "closed") this.closedPositions.push(normalized);
    }
    this.recordEquity(this.now().toISOString());
  }

  reset(): void {
    this.cashSol = this.config.startingCashSol;
    this.positions.clear();
    this.closedPositions.length = 0;
    this.orders.length = 0;
    this.fills.length = 0;
    this.equityHistory.length = 0;
    this.recordEquity(this.now().toISOString());
  }

  private applyBuy(
    fill: PaperFill,
    intent: PaperOrderIntent | undefined
  ): PaperPosition {
    const position: PaperPosition = recalculatePositionPnl({
      id: createPositionId(fill.mint, fill.createdAt),
      mint: fill.mint,
      symbol: intent?.symbol ?? null,
      title: intent?.title ?? null,
      status: "open",
      entryPriceSol: fill.effectivePriceSol,
      averageEntryPriceSol: fill.effectivePriceSol,
      currentPriceSol: fill.priceSol,
      peakPriceSol: fill.priceSol,
      peakUnrealizedPnlPct: 0,
      sizeSol: fill.sizeSol,
      remainingSizeSol: fill.sizeSol,
      tokenAmount: fill.tokenAmount,
      remainingTokenAmount: fill.tokenAmount,
      realizedPnlSol: 0,
      unrealizedPnlSol: 0,
      realizedPnlPct: 0,
      unrealizedPnlPct: 0,
      totalFeesSol: fill.feeSol,
      openedAt: fill.createdAt,
      updatedAt: fill.createdAt,
      closedAt: null,
      entryReasonCodes: uniqueReasonCodes([
        ...(intent?.reasonCodes ?? []),
        ...fill.reasonCodes
      ]),
      exitReasonCodes: []
    });

    this.cashSol = roundSol(this.cashSol - fill.sizeSol - fill.feeSol);
    this.positions.set(fill.mint, position);
    return clonePosition(position);
  }

  private applySell(
    fill: PaperFill,
    intent: PaperOrderIntent | undefined
  ): PaperPosition | null {
    const existing = this.positions.get(fill.mint);

    if (!existing || existing.status === "closed") {
      return null;
    }

    const tokenAmount = Math.min(fill.tokenAmount, existing.remainingTokenAmount);
    const costBasis = roundSol(tokenAmount * existing.averageEntryPriceSol);
    const proceeds = roundSol(fill.sizeSol - fill.feeSol);
    const realizedPnlSol = roundSol(proceeds - costBasis);
    const remainingTokenAmount = roundToken(
      existing.remainingTokenAmount - tokenAmount
    );
    const remainingSizeSol = roundSol(
      remainingTokenAmount * existing.averageEntryPriceSol
    );
    const closed = remainingTokenAmount <= epsilon;
    const status: PaperPositionStatus = closed ? "closed" : "partially_closed";
    const updated: PaperPosition = recalculatePositionPnl({
      ...existing,
      status,
      currentPriceSol: fill.priceSol,
      remainingTokenAmount: closed ? 0 : remainingTokenAmount,
      remainingSizeSol: closed ? 0 : remainingSizeSol,
      realizedPnlSol: roundSol(existing.realizedPnlSol + realizedPnlSol),
      realizedPnlPct: pct(existing.realizedPnlSol + realizedPnlSol, existing.sizeSol),
      totalFeesSol: roundSol(existing.totalFeesSol + fill.feeSol),
      updatedAt: fill.createdAt,
      closedAt: closed ? fill.createdAt : null,
      exitReasonCodes: uniqueReasonCodes([
        ...existing.exitReasonCodes,
        ...(intent?.reasonCodes ?? []),
        ...fill.reasonCodes
      ])
    });

    this.cashSol = roundSol(this.cashSol + proceeds);
    this.positions.set(fill.mint, updated);

    if (closed && !this.closedPositions.some((position) => position.id === updated.id)) {
      this.closedPositions.push(updated);
    }

    return clonePosition(updated);
  }

  private createRejectedFill(
    intent: PaperOrderIntent,
    reason: string
  ): PaperFill {
    return {
      id: createFillId(intent, intent.createdAt),
      orderIntentId: intent.id,
      side: intent.side,
      mint: intent.mint,
      priceSol: 0,
      sizeSol: 0,
      tokenAmount: 0,
      feeSol: 0,
      slippageSol: 0,
      effectivePriceSol: 0,
      fillStatus: "rejected",
      rejectionReason: reason,
      reasonCodes: uniqueReasonCodes([
        paperPortfolioReasonCodes.fillRejected,
        reason,
        paperPortfolioReasonCodes.paperOnlyNoLiveExecution,
        ...intent.reasonCodes
      ]),
      paperOnly: true,
      createdAt: intent.createdAt
    };
  }

  private resolvePrice(
    marketPrice: number | null | undefined,
    required: boolean
  ): { value: number | null; reason: string | null; usedFallback: boolean } {
    const price = positiveOrNull(marketPrice);

    if (price !== null) {
      return { value: price, reason: null, usedFallback: false };
    }

    if (!required && this.config.fallbackPriceSol && this.config.fallbackPriceSol > 0) {
      return {
        value: this.config.fallbackPriceSol,
        reason: null,
        usedFallback: true
      };
    }

    return {
      value: null,
      reason: paperPortfolioReasonCodes.priceMissing,
      usedFallback: false
    };
  }

  private hasOpenPosition(mint: string): boolean {
    const existing = this.positions.get(mint);
    return Boolean(existing && existing.status !== "closed");
  }

  private getDailySpendSol(at: string): number {
    const day = at.slice(0, 10);

    return roundSol(
      this.fills
        .filter(
          (fill) =>
            fill.side === "buy" &&
            fill.fillStatus !== "rejected" &&
            fill.createdAt.slice(0, 10) === day
        )
        .reduce((total, fill) => total + fill.sizeSol + fill.feeSol, 0)
    );
  }

  private buildSnapshot(updatedAt: string): PaperPortfolioSnapshot {
    const positions = Array.from(this.positions.values());
    const open = positions.filter((position) => position.status !== "closed");
    const closed = this.getClosedPositions();
    const realizedPnlSol = roundSol(
      positions.reduce((total, position) => total + position.realizedPnlSol, 0)
    );
    const unrealizedPnlSol = roundSol(
      open.reduce((total, position) => total + position.unrealizedPnlSol, 0)
    );
    const deployedSol = roundSol(
      open.reduce((total, position) => total + position.remainingSizeSol, 0)
    );
    const markedOpenValue = roundSol(
      open.reduce(
        (total, position) =>
          total +
          position.remainingTokenAmount *
            (positiveOrNull(position.currentPriceSol) ??
              position.averageEntryPriceSol),
        0
      )
    );
    const equitySol = roundSol(this.cashSol + markedOpenValue);
    const totalPnlSol = roundSol(realizedPnlSol + unrealizedPnlSol);
    const winCount = closed.filter((position) => position.realizedPnlSol > 0).length;
    const lossCount = closed.filter((position) => position.realizedPnlSol < 0).length;
    const tradeCount = this.fills.filter((fill) => fill.fillStatus !== "rejected").length;
    const drawdown = calculateDrawdown([
      ...this.equityHistory,
      { equitySol, createdAt: updatedAt }
    ]);

    return {
      cashSol: roundSol(this.cashSol),
      deployedSol,
      equitySol,
      realizedPnlSol,
      unrealizedPnlSol,
      totalPnlSol,
      totalPnlPct: pct(equitySol - this.config.startingCashSol, this.config.startingCashSol),
      openPositionCount: open.length,
      closedPositionCount: closed.length,
      winCount,
      lossCount,
      winRate: closed.length > 0 ? roundPct((winCount / closed.length) * 100) : 0,
      maxDrawdownSol: drawdown.maxDrawdownSol,
      maxDrawdownPct: drawdown.maxDrawdownPct,
      totalFeesSol: roundSol(
        positions.reduce((total, position) => total + position.totalFeesSol, 0)
      ),
      totalTrades: tradeCount,
      updatedAt
    };
  }

  private recordEquity(createdAt: string): void {
    const snapshot = this.buildSnapshot(createdAt);
    this.equityHistory.push({
      equitySol: snapshot.equitySol,
      createdAt
    });
  }
}

function recalculatePositionPnl(position: PaperPosition): PaperPosition {
  const currentPrice = positiveOrNull(position.currentPriceSol);
  const unrealizedValue =
    currentPrice === null ? position.remainingSizeSol : position.remainingTokenAmount * currentPrice;
  const unrealizedPnlSol = roundSol(unrealizedValue - position.remainingSizeSol);
  const unrealizedPnlPct = pct(unrealizedPnlSol, position.remainingSizeSol);
  const priorPeakPrice = positiveOrNull(position.peakPriceSol);
  const peakPriceSol =
    currentPrice === null
      ? priorPeakPrice
      : Math.max(priorPeakPrice ?? currentPrice, currentPrice);
  const priorPeakPnlPct = finiteOrNull(position.peakUnrealizedPnlPct);
  const peakUnrealizedPnlPct = Math.max(
    priorPeakPnlPct ?? unrealizedPnlPct,
    unrealizedPnlPct
  );

  return {
    ...position,
    entryPriceSol: roundPrice(position.entryPriceSol),
    averageEntryPriceSol: roundPrice(position.averageEntryPriceSol),
    currentPriceSol: currentPrice,
    peakPriceSol: peakPriceSol === null ? null : roundPrice(peakPriceSol),
    peakUnrealizedPnlPct: roundPct(peakUnrealizedPnlPct),
    sizeSol: roundSol(position.sizeSol),
    remainingSizeSol: roundSol(position.remainingSizeSol),
    tokenAmount: roundToken(position.tokenAmount),
    remainingTokenAmount: roundToken(position.remainingTokenAmount),
    realizedPnlSol: roundSol(position.realizedPnlSol),
    unrealizedPnlSol,
    realizedPnlPct: pct(position.realizedPnlSol, position.sizeSol),
    unrealizedPnlPct,
    totalFeesSol: roundSol(position.totalFeesSol),
    entryReasonCodes: uniqueReasonCodes(position.entryReasonCodes),
    exitReasonCodes: uniqueReasonCodes(position.exitReasonCodes)
  };
}

function normalizeIntent(intent: PaperOrderIntent): PaperOrderIntent {
  return {
    id: safeId(intent.id, createIntentId(intent.type, intent.mint, intent.createdAt)),
    type: intent.type,
    side: intent.side,
    mint: intent.mint.trim(),
    symbol: normalizeNullableString(intent.symbol),
    title: normalizeNullableString(intent.title),
    reason: intent.reason.trim() || "paper portfolio",
    source: intent.source,
    requestedSizeSol:
      intent.requestedSizeSol === undefined
        ? null
        : positiveOrNull(intent.requestedSizeSol),
    requestedSellPct:
      intent.requestedSellPct === undefined
        ? null
        : sanitizeNonnegative(intent.requestedSellPct, 0),
    signalScore:
      intent.signalScore === undefined ? null : finiteOrNull(intent.signalScore),
    riskLevel: intent.riskLevel ?? null,
    reasonCodes: uniqueReasonCodes(intent.reasonCodes),
    createdAt: normalizeDateString(intent.createdAt)
  };
}

function normalizeFill(fill: PaperFill): PaperFill {
  return {
    ...fill,
    priceSol: roundPrice(fill.priceSol),
    sizeSol: roundSol(fill.sizeSol),
    tokenAmount: roundToken(fill.tokenAmount),
    feeSol: roundSol(fill.feeSol),
    slippageSol: roundSol(fill.slippageSol),
    effectivePriceSol: roundPrice(fill.effectivePriceSol),
    rejectionReason: fill.rejectionReason ?? null,
    reasonCodes: uniqueReasonCodes(fill.reasonCodes),
    paperOnly: true,
    createdAt: normalizeDateString(fill.createdAt)
  };
}

function clonePosition(position: PaperPosition): PaperPosition {
  return {
    ...position,
    entryReasonCodes: [...position.entryReasonCodes],
    exitReasonCodes: [...position.exitReasonCodes]
  };
}

function createIntentId(prefix: string, mint: string, createdAt: string): string {
  return safeId(`${prefix}_${short(mint)}_${createdAt.replace(/\D/g, "")}`);
}

function createFillId(intent: PaperOrderIntent, createdAt: string): string {
  return safeId(`fill_${intent.id}_${createdAt.replace(/\D/g, "")}`);
}

function createPositionId(mint: string, createdAt: string): string {
  return safeId(`position_${short(mint)}_${createdAt.replace(/\D/g, "")}`);
}

function safeId(value: string, fallback = "paper-id"): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
  return normalized || fallback;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDateString(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date(0).toISOString();
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizePositive(value: number | null | undefined, fallback: number): number {
  return positiveOrNull(value) ?? fallback;
}

function sanitizeNonnegative(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function sanitizePositiveInteger(
  value: number | null | undefined,
  fallback: number
): number {
  return Number.isInteger(value) && value !== null && value !== undefined && value > 0
    ? value
    : fallback;
}

function bpsToRatio(value: number): number {
  return sanitizeNonnegative(value, 0) / 10_000;
}

function pct(value: number, basis: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(basis) || Math.abs(basis) <= epsilon) {
    return 0;
  }

  return roundPct((value / basis) * 100);
}

function roundSol(value: number): number {
  return round(value, 9);
}

function roundPrice(value: number): number {
  return round(value, 12);
}

function roundPct(value: number): number {
  return round(value, 6);
}

function roundToken(value: number): number {
  return round(value, 9);
}

function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function uniqueReasonCodes(values: readonly string[] = []): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function short(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || "unknown";
}

function readString(input: IntentSourceShape, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(input: IntentSourceShape, key: string): number | null {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRiskLevel(
  input: IntentSourceShape,
  key: string
): PaperRiskLevel | null {
  const value = readString(input, key);

  return value === "unknown" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
    ? value
    : null;
}

function readStringArray(input: IntentSourceShape, key: string): string[] {
  const value = input[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function calculateDrawdown(
  history: Array<{ equitySol: number; createdAt: string }>
): { maxDrawdownSol: number; maxDrawdownPct: number } {
  let peak = history[0]?.equitySol ?? 0;
  let maxDrawdownSol = 0;
  let maxDrawdownPct = 0;

  for (const item of history) {
    peak = Math.max(peak, item.equitySol);
    const drawdownSol = Math.max(0, peak - item.equitySol);
    const drawdownPct = peak > 0 ? (drawdownSol / peak) * 100 : 0;
    maxDrawdownSol = Math.max(maxDrawdownSol, drawdownSol);
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
  }

  return {
    maxDrawdownSol: roundSol(maxDrawdownSol),
    maxDrawdownPct: roundPct(maxDrawdownPct)
  };
}
