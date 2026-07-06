import {
  simulateLaunchMomentumFixture,
  type LaunchMomentumSnapshot,
  type LaunchSimulationFixture
} from "@axi/launch-momentum";
import {
  createEntryIntentFromLaunchSignal,
  createExitIntentFromExitSignal,
  createPaperPortfolioEngine,
  paperPortfolioReasonCodes,
  type PaperFill,
  type PaperPortfolioConfig,
  type PaperPortfolioSnapshot,
  type PaperPosition
} from "@axi/paper-portfolio";

export type PaperBacktestSnapshotInput = {
  mint: string;
  score: number;
  label: string;
  phase: string;
  tradeSampleCount: number;
  priceSol: number | null;
  volumeSol: number;
  reasonCodes: string[];
  payload?: unknown;
  evaluatedAt: string;
};

export type PaperBacktestInput = {
  fixture?: LaunchSimulationFixture;
  snapshots?: PaperBacktestSnapshotInput[];
  startingCashSol?: number;
  positionSizeSol?: number;
  minScore?: number;
  minTradeSamples?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
};

export type PaperBacktestTradeResult = {
  mint: string;
  entered: boolean;
  exited: boolean;
  entryFill: PaperFill | null;
  exitFill: PaperFill | null;
  position: PaperPosition | null;
  reasonCodes: string[];
};

export type PaperBacktestResult = {
  source: "launch-fixture" | "launch-snapshots";
  fixture: LaunchSimulationFixture | null;
  tradeCount: number;
  entryCount: number;
  exitCount: number;
  rejectedCount: number;
  bestTrade: PaperPosition | null;
  worstTrade: PaperPosition | null;
  snapshot: PaperPortfolioSnapshot;
  trades: PaperBacktestTradeResult[];
  paperOnly: true;
  liveExecutionDisabled: true;
};

const defaultBacktestConfig: PaperPortfolioConfig = {
  startingCashSol: 1,
  maxPositionSizeSol: 0.01,
  maxOpenPositions: 5,
  maxDailySpendSol: 0.05,
  feeBps: 100,
  slippageBps: 300,
  requirePriceForEntry: true,
  requirePriceForExit: true,
  allowPartialExits: true,
  fallbackPriceSol: null,
  paperOnly: true
};

export function runPaperBacktest(
  input: PaperBacktestInput = {}
): PaperBacktestResult {
  const fixture = input.fixture ?? null;
  const snapshots =
    input.snapshots ??
    (fixture ? [fromLaunchSnapshot(simulateLaunchMomentumFixture(fixture))] : []);
  const positionSizeSol = input.positionSizeSol ?? 0.005;
  const minScore = input.minScore ?? 75;
  const minTradeSamples = input.minTradeSamples ?? 3;
  const takeProfitPct = input.takeProfitPct ?? 50;
  const stopLossPct = input.stopLossPct ?? -25;
  const engine = createPaperPortfolioEngine({
    ...defaultBacktestConfig,
    startingCashSol: input.startingCashSol ?? defaultBacktestConfig.startingCashSol,
    now: () => new Date("2026-01-01T00:00:00.000Z")
  });
  const trades: PaperBacktestTradeResult[] = [];

  for (const snapshot of snapshots) {
    const marketPrice = positiveOrNull(snapshot.priceSol);
    const payload = snapshot.payload;
    const launchSnapshot = isLaunchSnapshot(payload) ? payload : null;
    const entryPrice =
      positiveOrNull(launchSnapshot?.windows["5m"].openSol) ?? marketPrice;
    const reasonCodes = uniqueStrings([
      "PAPER_BACKTEST_REPLAY",
      ...snapshot.reasonCodes
    ]);

    if (
      snapshot.score < minScore ||
      snapshot.tradeSampleCount < minTradeSamples ||
      !["hot", "ripping"].includes(snapshot.phase) ||
      !marketPrice ||
      !entryPrice
    ) {
      trades.push({
        mint: snapshot.mint,
        entered: false,
        exited: false,
        entryFill: null,
        exitFill: null,
        position: null,
        reasonCodes: uniqueStrings([
          ...reasonCodes,
          ...(marketPrice ? [] : [paperPortfolioReasonCodes.priceMissing]),
          ...(snapshot.score >= minScore ? [] : ["PAPER_BACKTEST_SCORE_TOO_LOW"]),
          ...(snapshot.tradeSampleCount >= minTradeSamples
            ? []
            : ["PAPER_BACKTEST_INSUFFICIENT_SAMPLES"]),
          ...(["hot", "ripping"].includes(snapshot.phase)
            ? []
            : ["PAPER_BACKTEST_PHASE_BLOCKED"])
        ])
      });
      continue;
    }

    const entryIntent = createEntryIntentFromLaunchSignal(
      {
        mint: snapshot.mint,
        score: snapshot.score,
        riskLevel: "unknown",
        reasonCodes
      },
      {
        id: `backtest-entry-${safeId(snapshot.mint)}-${snapshot.evaluatedAt}`,
        source: "replay",
        requestedSizeSol: positionSizeSol,
        reason: "paper backtest entry",
        createdAt: snapshot.evaluatedAt
      }
    );
    const entryFill = engine.simulateBuy(entryIntent, entryPrice);
    let position = engine.applyFill(entryFill, entryIntent);
    let exitFill: PaperFill | null = null;

    if (position && marketPrice) {
      position = engine.updateMarkPrice(snapshot.mint, marketPrice) ?? position;
      const shouldExit =
        position.unrealizedPnlPct >= takeProfitPct ||
        position.unrealizedPnlPct <= stopLossPct;

      if (shouldExit) {
        const exitIntent = createExitIntentFromExitSignal(
          {
            mint: snapshot.mint,
            sellPct: 100,
            sellReason:
              position.unrealizedPnlPct >= takeProfitPct
                ? "backtest take profit"
                : "backtest stop loss",
            reasonCodes: [
              position.unrealizedPnlPct >= takeProfitPct
                ? paperPortfolioReasonCodes.takeProfitTriggered
                : paperPortfolioReasonCodes.stopLossTriggered
            ]
          },
          {
            id: `backtest-exit-${safeId(snapshot.mint)}-${snapshot.evaluatedAt}`,
            source:
              position.unrealizedPnlPct >= takeProfitPct
                ? "take_profit"
                : "stop_loss",
            createdAt: snapshot.evaluatedAt
          }
        );
        exitFill = engine.simulateSell(exitIntent, position, marketPrice);
        position = engine.applyFill(exitFill, exitIntent);
      }
    }

    trades.push({
      mint: snapshot.mint,
      entered: entryFill.fillStatus !== "rejected",
      exited: exitFill?.fillStatus === "filled",
      entryFill,
      exitFill,
      position,
      reasonCodes: uniqueStrings([...reasonCodes, ...entryFill.reasonCodes])
    });
  }

  const closed = engine.getClosedPositions();
  const ranked = [...closed].sort(
    (left, right) => right.realizedPnlSol - left.realizedPnlSol
  );

  return {
    source: fixture ? "launch-fixture" : "launch-snapshots",
    fixture,
    tradeCount: trades.length,
    entryCount: trades.filter((trade) => trade.entered).length,
    exitCount: trades.filter((trade) => trade.exited).length,
    rejectedCount: trades.filter(
      (trade) => trade.entryFill?.fillStatus === "rejected"
    ).length,
    bestTrade: ranked[0] ?? null,
    worstTrade: ranked.at(-1) ?? null,
    snapshot: engine.getSnapshot(),
    trades,
    paperOnly: true,
    liveExecutionDisabled: true
  };
}

export function fromLaunchSnapshot(
  snapshot: LaunchMomentumSnapshot
): PaperBacktestSnapshotInput {
  return {
    mint: snapshot.mint,
    score: snapshot.score,
    label: snapshot.label,
    phase: snapshot.phase,
    tradeSampleCount: snapshot.tradeSampleCount,
    priceSol: snapshot.priceSol,
    volumeSol: snapshot.volumeSol,
    reasonCodes: snapshot.reasonCodes,
    payload: snapshot,
    evaluatedAt: snapshot.evaluatedAt
  };
}

function isLaunchSnapshot(value: unknown): value is LaunchMomentumSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "windows" in value &&
    "priceSol" in value
  );
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "unknown";
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}
