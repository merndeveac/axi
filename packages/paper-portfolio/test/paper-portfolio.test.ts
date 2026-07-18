import { describe, expect, it } from "vitest";
import {
  createEntryIntentFromLaunchSignal,
  createExitIntentFromExitSignal,
  createPaperPortfolioEngine,
  paperPortfolioReasonCodes,
  type PaperOrderIntent
} from "../src/index";

const mintA = "PaperPortfolioMint1111111111111111111111111";
const mintB = "PaperPortfolioMint2222222222222222222222222";
const mintC = "PaperPortfolioMint3333333333333333333333333";

describe("@axi/paper-portfolio", () => {
  it("buy fill opens a position", () => {
    const engine = createPaperPortfolioEngine({ now: fixedNow() });
    const intent = entryIntent({ mint: mintA, requestedSizeSol: 0.01 });
    const fill = engine.simulateBuy(intent, 0.001);
    const position = engine.applyFill(fill, intent);

    expect(fill.fillStatus).toBe("filled");
    expect(fill.paperOnly).toBe(true);
    expect(position?.status).toBe("open");
    expect(engine.getOpenPositions()).toHaveLength(1);
    expect(engine.getSnapshot().openPositionCount).toBe(1);
  });

  it("missing price rejects buy", () => {
    const engine = createPaperPortfolioEngine();
    const intent = entryIntent({ mint: mintA });
    const fill = engine.simulateBuy(intent, null);

    engine.applyFill(fill, intent);

    expect(fill.fillStatus).toBe("rejected");
    expect(fill.rejectionReason).toBe(paperPortfolioReasonCodes.priceMissing);
    expect(engine.getOpenPositions()).toHaveLength(0);
  });

  it("max position size blocks", () => {
    const engine = createPaperPortfolioEngine({ maxPositionSizeSol: 0.01 });
    const fill = engine.simulateBuy(
      entryIntent({ mint: mintA, requestedSizeSol: 0.02 }),
      0.001
    );

    expect(fill.fillStatus).toBe("rejected");
    expect(fill.reasonCodes).toContain(
      paperPortfolioReasonCodes.maxPositionSizeExceeded
    );
  });

  it("max open positions blocks", () => {
    const engine = createPaperPortfolioEngine({
      maxOpenPositions: 1,
      maxPositionSizeSol: 0.01
    });
    const first = entryIntent({ mint: mintA });
    engine.applyFill(engine.simulateBuy(first, 0.001), first);

    const secondFill = engine.simulateBuy(entryIntent({ mint: mintB }), 0.001);

    expect(secondFill.fillStatus).toBe("rejected");
    expect(secondFill.reasonCodes).toContain(
      paperPortfolioReasonCodes.maxOpenPositionsExceeded
    );
  });

  it("sell fill closes a position", () => {
    const engine = createPaperPortfolioEngine();
    const entry = entryIntent({ mint: mintA });
    const position = engine.applyFill(engine.simulateBuy(entry, 0.001), entry);
    const exit = exitIntent({ mint: mintA, requestedSellPct: 100 });
    const sellFill = engine.simulateSell(exit, position, 0.0015);
    const closed = engine.applyFill(sellFill, exit);

    expect(sellFill.fillStatus).toBe("filled");
    expect(closed?.status).toBe("closed");
    expect(closed?.realizedPnlSol).toBeGreaterThan(0);
    expect(engine.getClosedPositions()).toHaveLength(1);
  });

  it("partial sell works", () => {
    const engine = createPaperPortfolioEngine();
    const entry = entryIntent({ mint: mintA });
    const position = engine.applyFill(engine.simulateBuy(entry, 0.001), entry);
    const exit = exitIntent({ mint: mintA, requestedSellPct: 50 });
    const sellFill = engine.simulateSell(exit, position, 0.0012);
    const updated = engine.applyFill(sellFill, exit);

    expect(sellFill.fillStatus).toBe("partial");
    expect(updated?.status).toBe("partially_closed");
    expect(updated?.remainingTokenAmount).toBeGreaterThan(0);
  });

  it("PnL updates with mark price", () => {
    const engine = createPaperPortfolioEngine();
    const entry = entryIntent({ mint: mintA });
    engine.applyFill(engine.simulateBuy(entry, 0.001), entry);
    const updated = engine.updateMarkPrice(mintA, 0.0015);

    expect(updated?.unrealizedPnlSol).toBeGreaterThan(0);
    expect(updated?.unrealizedPnlPct).toBeGreaterThan(0);
    expect(engine.getSnapshot().unrealizedPnlSol).toBeGreaterThan(0);
  });

  it("retains the peak mark for trailing-stop evaluation", () => {
    const engine = createPaperPortfolioEngine();
    const entry = entryIntent({ mint: mintA });
    engine.applyFill(engine.simulateBuy(entry, 0.001), entry);
    const peak = engine.updateMarkPrice(mintA, 0.002);
    const pulledBack = engine.updateMarkPrice(mintA, 0.0015);

    expect(peak?.peakPriceSol).toBe(0.002);
    expect(pulledBack?.currentPriceSol).toBe(0.0015);
    expect(pulledBack?.peakPriceSol).toBe(0.002);
    expect(pulledBack?.peakUnrealizedPnlPct).toBe(peak?.peakUnrealizedPnlPct);
  });

  it("applies fee and slippage", () => {
    const engine = createPaperPortfolioEngine({
      feeBps: 100,
      slippageBps: 300
    });
    const fill = engine.simulateBuy(entryIntent({ mint: mintA }), 0.001);

    expect(fill.feeSol).toBeGreaterThan(0);
    expect(fill.slippageSol).toBeGreaterThan(0);
    expect(fill.effectivePriceSol).toBeGreaterThan(fill.priceSol);
  });

  it("snapshot computes win rate, PnL, and drawdown", () => {
    const engine = createPaperPortfolioEngine({ startingCashSol: 1 });
    const firstEntry = entryIntent({ mint: mintA });
    const first = engine.applyFill(engine.simulateBuy(firstEntry, 0.001), firstEntry);
    const firstExit = exitIntent({ mint: mintA });
    engine.applyFill(engine.simulateSell(firstExit, first, 0.0015), firstExit);

    const secondEntry = entryIntent({ mint: mintB });
    const second = engine.applyFill(
      engine.simulateBuy(secondEntry, 0.001),
      secondEntry
    );
    engine.updateMarkPrice(mintB, 0.0005);
    const secondExit = exitIntent({ mint: mintB });
    engine.applyFill(engine.simulateSell(secondExit, second, 0.0005), secondExit);

    const snapshot = engine.getSnapshot();

    expect(snapshot.closedPositionCount).toBe(2);
    expect(snapshot.winCount).toBe(1);
    expect(snapshot.lossCount).toBe(1);
    expect(snapshot.winRate).toBe(50);
    expect(snapshot.maxDrawdownSol).toBeGreaterThan(0);
  });

  it("never emits NaN or Infinity", () => {
    const engine = createPaperPortfolioEngine();
    const rejected = engine.simulateSell(exitIntent({ mint: mintC }), null, null);
    engine.applyFill(rejected, exitIntent({ mint: mintC }));

    expect(JSON.stringify(engine.getSnapshot())).not.toMatch(/NaN|Infinity/);
    expect(JSON.stringify(engine.getFillHistory())).not.toMatch(/NaN|Infinity/);
  });

  it("does no live execution", () => {
    const engine = createPaperPortfolioEngine();
    const fill = engine.simulateBuy(entryIntent({ mint: mintA }), 0.001);

    expect(fill.paperOnly).toBe(true);
    expect(fill.reasonCodes).toContain(
      paperPortfolioReasonCodes.paperOnlyNoLiveExecution
    );
    expect(engine.config.paperOnly).toBe(true);
  });

  it("reconciles cash and daily spend from persisted state", () => {
    const original = createPaperPortfolioEngine({
      startingCashSol: 1,
      maxDailySpendSol: 0.01
    });
    const entry = entryIntent({ mint: mintA, requestedSizeSol: 0.01 });
    const fill = original.simulateBuy(entry, 0.001);
    const position = original.applyFill(fill, entry);
    const expectedCash = original.getSnapshot().cashSol;
    const restarted = createPaperPortfolioEngine({
      startingCashSol: 1,
      maxDailySpendSol: 0.01
    });

    restarted.loadState({
      positions: position ? [position] : [],
      orders: original.getOrderHistory(),
      fills: original.getFillHistory()
    });

    expect(restarted.getSnapshot().cashSol).toBe(expectedCash);
    expect(restarted.getOpenPositions()).toHaveLength(1);
    const next = restarted.simulateBuy(
      entryIntent({ mint: mintB, requestedSizeSol: 0.01 }),
      0.001
    );
    expect(next.reasonCodes).toContain(
      paperPortfolioReasonCodes.maxDailySpendExceeded
    );
  });

  it("creates intents from launch and exit signals", () => {
    const entry = createEntryIntentFromLaunchSignal({
      mint: mintA,
      symbol: "PAPER",
      score: 88,
      riskLevel: "low",
      reasonCodes: ["PAPER_BUY_READY"]
    });
    const exit = createExitIntentFromExitSignal({
      mint: mintA,
      sellPct: 75,
      reasonCodes: ["EXIT_SIGNAL_CREATED"]
    });

    expect(entry.source).toBe("launch_signal");
    expect(entry.signalScore).toBe(88);
    expect(exit.source).toBe("watched_wallet_exit");
    expect(exit.requestedSellPct).toBe(75);
  });
});

function entryIntent(input: Partial<PaperOrderIntent> = {}): PaperOrderIntent {
  return {
    id: input.id ?? `entry-${input.mint ?? mintA}`,
    type: "entry",
    side: "buy",
    mint: input.mint ?? mintA,
    symbol: input.symbol ?? "PAPER",
    title: input.title ?? "Paper Token",
    reason: input.reason ?? "test entry",
    source: input.source ?? "manual_paper",
    requestedSizeSol: input.requestedSizeSol ?? 0.01,
    requestedSellPct: null,
    signalScore: input.signalScore ?? 90,
    riskLevel: input.riskLevel ?? "low",
    reasonCodes: input.reasonCodes ?? ["TEST_ENTRY"],
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z"
  };
}

function exitIntent(input: Partial<PaperOrderIntent> = {}): PaperOrderIntent {
  return {
    id: input.id ?? `exit-${input.mint ?? mintA}`,
    type: "exit",
    side: "sell",
    mint: input.mint ?? mintA,
    symbol: input.symbol ?? "PAPER",
    title: input.title ?? "Paper Token",
    reason: input.reason ?? "test exit",
    source: input.source ?? "manual_paper",
    requestedSizeSol: null,
    requestedSellPct: input.requestedSellPct ?? 100,
    signalScore: null,
    riskLevel: null,
    reasonCodes: input.reasonCodes ?? ["TEST_EXIT"],
    createdAt: input.createdAt ?? "2026-01-01T00:01:00.000Z"
  };
}

function fixedNow() {
  return () => new Date("2026-01-01T00:00:00.000Z");
}
