import type { BotMode, OverlaySignal } from "@axi/shared";

export type PaperPosition = {
  mint: string;
  symbol: string;
  sizeSol: number;
  tokenAmount: number;
  entryPrice: number;
  quantity: number;
  avgEntryPriceUsd: number;
  notionalUsd: number;
  status: "open";
  openedAt: string;
  updatedAt: string;
  lastReasonCodes: string[];
};

export type PaperOrder = {
  mint: string;
  symbol: string;
  side: "buy";
  status: "accepted" | "rejected";
  sizeSol: number;
  simulatedPrice: number;
  reasonCodes: string[];
  createdAt: string;
};

export type PaperTradeResult = {
  accepted: boolean;
  reason: string;
  order?: PaperOrder;
  position?: PaperPosition;
};

export class PaperTradeExecutor {
  private readonly positions = new Map<string, PaperPosition>();

  constructor(
    private readonly mode: BotMode = "paper",
    private readonly paperOrderSizeSol = 0.25
  ) {
    if (mode === "live") {
      throw new Error("PaperTradeExecutor refuses live mode.");
    }
  }

  submitPaperBuy(signal: OverlaySignal): PaperTradeResult {
    this.assertNotLive();

    if (signal.hardReject) {
      return {
        accepted: false,
        reason: "HARD_REJECT_SIGNAL",
        order: this.createRejectedOrder(signal, "HARD_REJECT_SIGNAL")
      };
    }

    if (signal.action !== "BUY_READY") {
      return {
        accepted: false,
        reason: "SIGNAL_NOT_BUY_READY",
        order: this.createRejectedOrder(signal, "SIGNAL_NOT_BUY_READY")
      };
    }

    const price = signal.state.metrics.priceUsd;

    if (price <= 0) {
      return {
        accepted: false,
        reason: "INVALID_PRICE",
        order: this.createRejectedOrder(signal, "INVALID_PRICE")
      };
    }

    const now = new Date().toISOString();
    const notionalUsd = 100;
    const quantity = notionalUsd / price;
    const order = this.createAcceptedOrder(signal, now);
    const existing = this.positions.get(signal.mint);

    if (!existing) {
      const position: PaperPosition = {
        mint: signal.mint,
        symbol: signal.symbol,
        sizeSol: this.paperOrderSizeSol,
        tokenAmount: quantity,
        entryPrice: price,
        quantity,
        avgEntryPriceUsd: price,
        notionalUsd,
        status: "open",
        openedAt: now,
        updatedAt: now,
        lastReasonCodes: signal.reasonCodes
      };

      this.positions.set(signal.mint, position);
      return {
        accepted: true,
        reason: "PAPER_BUY_OPENED",
        order,
        position
      };
    }

    const combinedNotional = existing.notionalUsd + notionalUsd;
    const combinedQuantity = existing.quantity + quantity;
    const updated: PaperPosition = {
      ...existing,
      sizeSol: existing.sizeSol + this.paperOrderSizeSol,
      tokenAmount: combinedQuantity,
      quantity: combinedQuantity,
      entryPrice: combinedNotional / combinedQuantity,
      avgEntryPriceUsd: combinedNotional / combinedQuantity,
      notionalUsd: combinedNotional,
      updatedAt: now,
      lastReasonCodes: signal.reasonCodes
    };

    this.positions.set(signal.mint, updated);
    return {
      accepted: true,
      reason: "PAPER_BUY_ADDED",
      order,
      position: updated
    };
  }

  getPositions(): PaperPosition[] {
    return Array.from(this.positions.values());
  }

  private assertNotLive(): void {
    if (this.mode === "live") {
      throw new Error("Live execution is not implemented in this paper-mode build.");
    }
  }

  private createAcceptedOrder(signal: OverlaySignal, createdAt: string): PaperOrder {
    return {
      mint: signal.mint,
      symbol: signal.symbol,
      side: "buy",
      status: "accepted",
      sizeSol: this.paperOrderSizeSol,
      simulatedPrice: signal.state.metrics.priceUsd,
      reasonCodes: signal.reasonCodes,
      createdAt
    };
  }

  private createRejectedOrder(signal: OverlaySignal, reason: string): PaperOrder {
    return {
      mint: signal.mint,
      symbol: signal.symbol,
      side: "buy",
      status: "rejected",
      sizeSol: 0,
      simulatedPrice: Math.max(signal.state.metrics.priceUsd, 0),
      reasonCodes: [reason, ...signal.reasonCodes],
      createdAt: new Date().toISOString()
    };
  }
}

const defaultPaperExecutor = new PaperTradeExecutor("paper");

export function submitPaperBuy(
  signal: OverlaySignal,
  executor = defaultPaperExecutor
): PaperTradeResult {
  return executor.submitPaperBuy(signal);
}
