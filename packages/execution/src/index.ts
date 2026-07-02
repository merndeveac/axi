import type { BotMode, OverlaySignal } from "@axi/shared";

export type PaperPosition = {
  mint: string;
  symbol: string;
  quantity: number;
  avgEntryPriceUsd: number;
  notionalUsd: number;
  openedAt: string;
  updatedAt: string;
  lastReasonCodes: string[];
};

export type PaperTradeResult = {
  accepted: boolean;
  reason: string;
  position?: PaperPosition;
};

export class PaperTradeExecutor {
  private readonly positions = new Map<string, PaperPosition>();

  constructor(private readonly mode: BotMode = "paper") {
    if (mode === "live") {
      throw new Error("PaperTradeExecutor refuses live mode.");
    }
  }

  submitPaperBuy(signal: OverlaySignal): PaperTradeResult {
    this.assertNotLive();

    if (signal.hardReject) {
      return {
        accepted: false,
        reason: "HARD_REJECT_SIGNAL"
      };
    }

    if (signal.action !== "BUY_READY") {
      return {
        accepted: false,
        reason: "SIGNAL_NOT_BUY_READY"
      };
    }

    const price = signal.state.metrics.priceUsd;

    if (price <= 0) {
      return {
        accepted: false,
        reason: "INVALID_PRICE"
      };
    }

    const now = new Date().toISOString();
    const notionalUsd = 100;
    const quantity = notionalUsd / price;
    const existing = this.positions.get(signal.mint);

    if (!existing) {
      const position: PaperPosition = {
        mint: signal.mint,
        symbol: signal.symbol,
        quantity,
        avgEntryPriceUsd: price,
        notionalUsd,
        openedAt: now,
        updatedAt: now,
        lastReasonCodes: signal.reasonCodes
      };

      this.positions.set(signal.mint, position);
      return {
        accepted: true,
        reason: "PAPER_BUY_OPENED",
        position
      };
    }

    const combinedNotional = existing.notionalUsd + notionalUsd;
    const combinedQuantity = existing.quantity + quantity;
    const updated: PaperPosition = {
      ...existing,
      quantity: combinedQuantity,
      avgEntryPriceUsd: combinedNotional / combinedQuantity,
      notionalUsd: combinedNotional,
      updatedAt: now,
      lastReasonCodes: signal.reasonCodes
    };

    this.positions.set(signal.mint, updated);
    return {
      accepted: true,
      reason: "PAPER_BUY_ADDED",
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
}

const defaultPaperExecutor = new PaperTradeExecutor("paper");

export function submitPaperBuy(
  signal: OverlaySignal,
  executor = defaultPaperExecutor
): PaperTradeResult {
  return executor.submitPaperBuy(signal);
}
