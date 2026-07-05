export const launchWindowMs = {
  "5s": 5_000,
  "10s": 10_000,
  "30s": 30_000,
  "2m": 120_000,
  "5m": 300_000
} as const;

export type LaunchWindowLabel = keyof typeof launchWindowMs;

export type LaunchPhase =
  | "discovery_only"
  | "watching"
  | "trade_tracked"
  | "hot"
  | "ripping"
  | "rejected"
  | "expired";

export type LaunchScoreLabel = "none" | "watch" | "hot" | "ripping" | "reject";

export type LaunchTradeSide = "buy" | "sell";

export type LaunchTradeSample = {
  mint: string;
  side: LaunchTradeSide;
  trader: string | null;
  signature: string | null;
  priceSol: number;
  volumeSol: number;
  tokenAmount: number | null;
  timestamp: string;
};

export type LaunchWindowMetrics = {
  volumeSol: number;
  buyVolumeSol: number;
  sellVolumeSol: number;
  netVolumeSol: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  buySellRatio: number | null;
  netBuyPressure: number;
  openSol: number | null;
  highSol: number | null;
  lowSol: number | null;
  closeSol: number | null;
  priceChangePct: number;
};

export type LaunchDerivatives = {
  volumeVelocitySolPerSec: number;
  volumeAccelerationSolPerSec2: number;
  priceVelocityPctPerSec: number;
  priceAccelerationPctPerSec2: number;
  buyerVelocityPerSec: number;
  buyerAccelerationPerSec2: number;
  tradeVelocityPerSec: number;
  tradeAccelerationPerSec2: number;
};

export type LaunchScoreComponents = {
  earlyVolumeScore: number;
  volumeAccelerationScore: number;
  priceActionScore: number;
  buyerGrowthScore: number;
  buyPressureScore: number;
  riskPenalty: number;
  missingDataPenalty: number;
};

export type LaunchMomentumSnapshot = {
  mint: string;
  launchedAt: string;
  evaluatedAt: string;
  ageSeconds: number;
  phase: LaunchPhase;
  tradeSampleCount: number;
  priceSol: number | null;
  volumeSol: number;
  windows: Record<LaunchWindowLabel, LaunchWindowMetrics>;
  derivatives: LaunchDerivatives;
  score: number;
  label: LaunchScoreLabel;
  components: LaunchScoreComponents;
  blockers: string[];
  drivers: string[];
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

export type EvaluateLaunchMomentumInput = {
  mint: string;
  launchedAt: string;
  now?: string | Date | undefined;
  trades?: LaunchTradeSample[] | undefined;
  hardReject?: boolean | undefined;
  riskLevel?: "unknown" | "low" | "medium" | "high" | "critical" | undefined;
};

export type LaunchSimulationFixture =
  | "strong-ripper"
  | "weak-launch"
  | "sell-pressure"
  | "no-trades";

const launchReasonCodes = {
  discovered: "LAUNCH_DISCOVERED",
  discoveryOnly: "LAUNCH_DISCOVERY_ONLY",
  tradeTracked: "LAUNCH_TRADE_TRACKED",
  volumeSpike: "LAUNCH_VOLUME_SPIKE",
  volumeAcceleration: "LAUNCH_VOLUME_ACCELERATION",
  priceSpike: "LAUNCH_PRICE_SPIKE",
  priceAcceleration: "LAUNCH_PRICE_ACCELERATION",
  buyerGrowth: "LAUNCH_BUYER_GROWTH",
  buyerAcceleration: "LAUNCH_BUYER_ACCELERATION",
  buyPressure: "LAUNCH_BUY_PRESSURE",
  sellPressure: "LAUNCH_SELL_PRESSURE",
  insufficientTradeData: "LAUNCH_INSUFFICIENT_TRADE_DATA",
  hot: "LAUNCH_HOT",
  ripping: "LAUNCH_RIPPING",
  rejected: "LAUNCH_REJECTED",
  expired: "LAUNCH_EXPIRED"
} as const;

export function evaluateLaunchMomentum(
  input: EvaluateLaunchMomentumInput
): LaunchMomentumSnapshot {
  const evaluatedAtMs = parseTime(input.now ?? new Date());
  const launchedAtMs = parseTime(input.launchedAt);
  const evaluatedAt = new Date(evaluatedAtMs).toISOString();
  const launchedAt = new Date(launchedAtMs).toISOString();
  const ageSeconds = sanitizeNumber((evaluatedAtMs - launchedAtMs) / 1000);
  const trades = sanitizeTrades(input.trades ?? [], input.mint);
  const windows = createWindowRecord(trades, evaluatedAtMs);
  const derivatives = computeDerivatives(trades, evaluatedAtMs);
  const components = computeScoreComponents({
    derivatives,
    hardReject: input.hardReject === true,
    riskLevel: input.riskLevel ?? "unknown",
    tradeSampleCount: trades.length,
    windows
  });
  const latestTrade = trades.at(-1);
  const reasonCodes: string[] = [launchReasonCodes.discovered];
  const blockers: string[] = [];
  const drivers: string[] = [];

  if (trades.length === 0) {
    reasonCodes.push(launchReasonCodes.discoveryOnly);
    blockers.push("PRICE_ACTION_REQUIRES_METERED_TOKEN_TRADES");
  } else {
    reasonCodes.push(launchReasonCodes.tradeTracked);
  }

  if (trades.length > 0 && trades.length < 3) {
    reasonCodes.push(launchReasonCodes.insufficientTradeData);
    blockers.push("LAUNCH_REQUIRES_MORE_TRADE_SAMPLES");
  }

  if (windows["10s"].volumeSol >= 2 || windows["30s"].volumeSol >= 4) {
    reasonCodes.push(launchReasonCodes.volumeSpike);
    drivers.push("early volume");
  }

  if (derivatives.volumeAccelerationSolPerSec2 > 0.03) {
    reasonCodes.push(launchReasonCodes.volumeAcceleration);
    drivers.push("volume acceleration");
  }

  if (windows["10s"].priceChangePct >= 8 || windows["30s"].priceChangePct >= 15) {
    reasonCodes.push(launchReasonCodes.priceSpike);
    drivers.push("price action");
  }

  if (derivatives.priceAccelerationPctPerSec2 > 0.1) {
    reasonCodes.push(launchReasonCodes.priceAcceleration);
    drivers.push("price acceleration");
  }

  if (windows["10s"].uniqueBuyers >= 3 || windows["30s"].uniqueBuyers >= 5) {
    reasonCodes.push(launchReasonCodes.buyerGrowth);
    drivers.push("buyer growth");
  }

  if (derivatives.buyerAccelerationPerSec2 > 0.03) {
    reasonCodes.push(launchReasonCodes.buyerAcceleration);
    drivers.push("buyer acceleration");
  }

  if (windows["10s"].netBuyPressure >= 0.45 || windows["30s"].netBuyPressure >= 0.35) {
    reasonCodes.push(launchReasonCodes.buyPressure);
    drivers.push("buy pressure");
  }

  if (windows["10s"].netBuyPressure <= -0.2 || windows["30s"].netBuyPressure <= -0.25) {
    reasonCodes.push(launchReasonCodes.sellPressure);
    blockers.push("SELL_PRESSURE");
  }

  if (input.hardReject === true) {
    reasonCodes.push(launchReasonCodes.rejected);
    blockers.push("HARD_REJECT");
  }

  if (ageSeconds >= 300) {
    reasonCodes.push(launchReasonCodes.expired);
  }

  const rawScore =
    components.earlyVolumeScore +
    components.volumeAccelerationScore +
    components.priceActionScore +
    components.buyerGrowthScore +
    components.buyPressureScore -
    components.riskPenalty -
    components.missingDataPenalty;
  const score = input.hardReject === true ? 0 : round(clamp(rawScore, 0, 100));
  const label = scoreToLabel(score, {
    hardReject: input.hardReject === true,
    tradeSampleCount: trades.length
  });
  const phase = scoreToPhase(label, {
    ageSeconds,
    hardReject: input.hardReject === true,
    tradeSampleCount: trades.length
  });

  if (phase === "hot") {
    reasonCodes.push(launchReasonCodes.hot);
  }

  if (phase === "ripping") {
    reasonCodes.push(launchReasonCodes.hot, launchReasonCodes.ripping);
  }

  return {
    mint: input.mint,
    launchedAt,
    evaluatedAt,
    ageSeconds: round(ageSeconds),
    phase,
    tradeSampleCount: trades.length,
    priceSol: latestTrade?.priceSol ?? null,
    volumeSol: windows["5m"].volumeSol,
    windows,
    derivatives,
    score,
    label,
    components,
    blockers: uniqueStrings(blockers),
    drivers: uniqueStrings(drivers),
    reasonCodes: uniqueStrings(reasonCodes),
    paperOnly: true,
    tradingDisabled: true
  };
}

export function simulateLaunchMomentumFixture(
  fixture: LaunchSimulationFixture
): LaunchMomentumSnapshot {
  const launchedAt = "2026-01-01T00:00:00.000Z";
  const now = "2026-01-01T00:00:25.000Z";

  return evaluateLaunchMomentum({
    mint: `Simulated${fixture.replace(/-/gu, "")}111111111111111111111111`,
    launchedAt,
    now,
    trades: createFixtureTrades(fixture, launchedAt)
  });
}

function createWindowRecord(
  trades: LaunchTradeSample[],
  evaluatedAtMs: number
): Record<LaunchWindowLabel, LaunchWindowMetrics> {
  return {
    "5s": computeWindow(trades, evaluatedAtMs, launchWindowMs["5s"]),
    "10s": computeWindow(trades, evaluatedAtMs, launchWindowMs["10s"]),
    "30s": computeWindow(trades, evaluatedAtMs, launchWindowMs["30s"]),
    "2m": computeWindow(trades, evaluatedAtMs, launchWindowMs["2m"]),
    "5m": computeWindow(trades, evaluatedAtMs, launchWindowMs["5m"])
  };
}

function computeWindow(
  trades: LaunchTradeSample[],
  evaluatedAtMs: number,
  windowMs: number
): LaunchWindowMetrics {
  const windowTrades = trades.filter((trade) => {
    const timestampMs = parseTime(trade.timestamp);
    return timestampMs > evaluatedAtMs - windowMs && timestampMs <= evaluatedAtMs;
  });

  return computeFromTrades(windowTrades);
}

function computeSegment(
  trades: LaunchTradeSample[],
  evaluatedAtMs: number,
  olderMs: number,
  newerMs: number
): LaunchWindowMetrics {
  return computeFromTrades(
    trades.filter((trade) => {
      const timestampMs = parseTime(trade.timestamp);
      return timestampMs > evaluatedAtMs - olderMs && timestampMs <= evaluatedAtMs - newerMs;
    })
  );
}

function computeFromTrades(trades: LaunchTradeSample[]): LaunchWindowMetrics {
  const first = trades[0];
  const last = trades.at(-1);

  if (!first || !last) {
    return emptyWindow();
  }

  let volumeSol = 0;
  let buyVolumeSol = 0;
  let sellVolumeSol = 0;
  const buyers = new Set<string>();
  const sellers = new Set<string>();

  for (const trade of trades) {
    volumeSol += trade.volumeSol;

    if (trade.side === "buy") {
      buyVolumeSol += trade.volumeSol;
      buyers.add(trade.trader ?? `buy:${trade.signature ?? trade.timestamp}`);
    } else {
      sellVolumeSol += trade.volumeSol;
      sellers.add(trade.trader ?? `sell:${trade.signature ?? trade.timestamp}`);
    }
  }

  const buyCount = trades.filter((trade) => trade.side === "buy").length;
  const sellCount = trades.length - buyCount;
  const netVolumeSol = buyVolumeSol - sellVolumeSol;
  const priceChangePct =
    first.priceSol > 0 ? ((last.priceSol - first.priceSol) / first.priceSol) * 100 : 0;

  return sanitizeWindow({
    volumeSol,
    buyVolumeSol,
    sellVolumeSol,
    netVolumeSol,
    tradeCount: trades.length,
    buyCount,
    sellCount,
    uniqueBuyers: buyers.size,
    uniqueSellers: sellers.size,
    buySellRatio: sellCount === 0 ? (buyCount > 0 ? buyCount : null) : buyCount / sellCount,
    netBuyPressure: volumeSol > 0 ? netVolumeSol / volumeSol : 0,
    openSol: first.priceSol,
    highSol: Math.max(...trades.map((trade) => trade.priceSol)),
    lowSol: Math.min(...trades.map((trade) => trade.priceSol)),
    closeSol: last.priceSol,
    priceChangePct
  });
}

function computeDerivatives(
  trades: LaunchTradeSample[],
  evaluatedAtMs: number
): LaunchDerivatives {
  const current = computeWindow(trades, evaluatedAtMs, 5_000);
  const previous = computeSegment(trades, evaluatedAtMs, 10_000, 5_000);
  const currentPriceVelocity = current.priceChangePct / 5;
  const previousPriceVelocity = previous.priceChangePct / 5;
  const currentVolumeVelocity = current.volumeSol / 5;
  const previousVolumeVelocity = previous.volumeSol / 5;
  const currentBuyerVelocity = current.uniqueBuyers / 5;
  const previousBuyerVelocity = previous.uniqueBuyers / 5;
  const currentTradeVelocity = current.tradeCount / 5;
  const previousTradeVelocity = previous.tradeCount / 5;

  return {
    volumeVelocitySolPerSec: round(currentVolumeVelocity),
    volumeAccelerationSolPerSec2: round((currentVolumeVelocity - previousVolumeVelocity) / 5),
    priceVelocityPctPerSec: round(currentPriceVelocity),
    priceAccelerationPctPerSec2: round((currentPriceVelocity - previousPriceVelocity) / 5),
    buyerVelocityPerSec: round(currentBuyerVelocity),
    buyerAccelerationPerSec2: round((currentBuyerVelocity - previousBuyerVelocity) / 5),
    tradeVelocityPerSec: round(currentTradeVelocity),
    tradeAccelerationPerSec2: round((currentTradeVelocity - previousTradeVelocity) / 5)
  };
}

function computeScoreComponents(input: {
  derivatives: LaunchDerivatives;
  hardReject: boolean;
  riskLevel: string;
  tradeSampleCount: number;
  windows: Record<LaunchWindowLabel, LaunchWindowMetrics>;
}): LaunchScoreComponents {
  const window10 = input.windows["10s"];
  const window30 = input.windows["30s"];
  const earlyVolumeScore = clamp(window10.volumeSol * 7 + window30.volumeSol * 2, 0, 24);
  const volumeAccelerationScore = clamp(input.derivatives.volumeAccelerationSolPerSec2 * 240, 0, 18);
  const priceActionScore = clamp(Math.max(window10.priceChangePct, window30.priceChangePct) * 0.75, 0, 18);
  const buyerGrowthScore = clamp(window10.uniqueBuyers * 3 + window30.uniqueBuyers, 0, 18);
  const buyPressureScore = clamp((Math.max(window10.netBuyPressure, window30.netBuyPressure) + 0.1) * 22, 0, 16);
  const riskPenalty = riskPenaltyFor(input.riskLevel, input.hardReject);
  const missingDataPenalty = input.tradeSampleCount === 0 ? 35 : input.tradeSampleCount < 3 ? 18 : 0;

  return {
    earlyVolumeScore: round(earlyVolumeScore),
    volumeAccelerationScore: round(volumeAccelerationScore),
    priceActionScore: round(priceActionScore),
    buyerGrowthScore: round(buyerGrowthScore),
    buyPressureScore: round(buyPressureScore),
    riskPenalty,
    missingDataPenalty
  };
}

function scoreToLabel(
  score: number,
  options: { hardReject: boolean; tradeSampleCount: number }
): LaunchScoreLabel {
  if (options.hardReject) {
    return "reject";
  }

  if (options.tradeSampleCount < 3) {
    return score >= 25 ? "watch" : "none";
  }

  if (score >= 75) {
    return "ripping";
  }

  if (score >= 55) {
    return "hot";
  }

  if (score >= 25) {
    return "watch";
  }

  return "none";
}

function scoreToPhase(
  label: LaunchScoreLabel,
  options: { ageSeconds: number; hardReject: boolean; tradeSampleCount: number }
): LaunchPhase {
  if (options.hardReject || label === "reject") {
    return "rejected";
  }

  if (options.ageSeconds >= 300) {
    return "expired";
  }

  if (label === "ripping") {
    return "ripping";
  }

  if (label === "hot") {
    return "hot";
  }

  if (options.tradeSampleCount > 0) {
    return "trade_tracked";
  }

  if (label === "watch") {
    return "watching";
  }

  return "discovery_only";
}

function sanitizeTrades(
  trades: LaunchTradeSample[],
  mint: string
): LaunchTradeSample[] {
  return trades
    .filter(
      (trade) =>
        trade.mint === mint &&
        (trade.side === "buy" || trade.side === "sell") &&
        isPositiveFinite(trade.priceSol) &&
        isPositiveFinite(trade.volumeSol) &&
        Number.isFinite(parseTime(trade.timestamp))
    )
    .sort((left, right) => parseTime(left.timestamp) - parseTime(right.timestamp));
}

function emptyWindow(): LaunchWindowMetrics {
  return {
    volumeSol: 0,
    buyVolumeSol: 0,
    sellVolumeSol: 0,
    netVolumeSol: 0,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    uniqueBuyers: 0,
    uniqueSellers: 0,
    buySellRatio: null,
    netBuyPressure: 0,
    openSol: null,
    highSol: null,
    lowSol: null,
    closeSol: null,
    priceChangePct: 0
  };
}

function sanitizeWindow(window: LaunchWindowMetrics): LaunchWindowMetrics {
  return {
    volumeSol: round(window.volumeSol),
    buyVolumeSol: round(window.buyVolumeSol),
    sellVolumeSol: round(window.sellVolumeSol),
    netVolumeSol: round(window.netVolumeSol),
    tradeCount: window.tradeCount,
    buyCount: window.buyCount,
    sellCount: window.sellCount,
    uniqueBuyers: window.uniqueBuyers,
    uniqueSellers: window.uniqueSellers,
    buySellRatio: nullableRound(window.buySellRatio),
    netBuyPressure: round(window.netBuyPressure),
    openSol: nullableRound(window.openSol),
    highSol: nullableRound(window.highSol),
    lowSol: nullableRound(window.lowSol),
    closeSol: nullableRound(window.closeSol),
    priceChangePct: round(window.priceChangePct)
  };
}

function createFixtureTrades(
  fixture: LaunchSimulationFixture,
  launchedAt: string
): LaunchTradeSample[] {
  if (fixture === "no-trades") {
    return [];
  }

  const mint = `Simulated${fixture.replace(/-/gu, "")}111111111111111111111111`;
  const sideSequence: LaunchTradeSide[] =
    fixture === "sell-pressure"
      ? ["buy", "sell", "sell", "sell", "sell", "sell"]
      : fixture === "weak-launch"
        ? ["buy", "sell", "buy"]
        : ["buy", "buy", "buy", "sell", "buy", "buy", "buy", "buy"];
  const basePrice =
    fixture === "sell-pressure" ? 0.0008 : fixture === "weak-launch" ? 0.0004 : 0.0005;

  return sideSequence.map((side, index) => {
    const multiplier =
      fixture === "strong-ripper"
        ? 1 + index * 0.08
        : fixture === "sell-pressure"
          ? 1 - index * 0.04
          : 1 + index * 0.01;
    const volumeSol =
      fixture === "strong-ripper"
        ? 0.6 + index * 0.25
        : fixture === "sell-pressure"
          ? 0.45 + index * 0.3
          : 0.08 + index * 0.02;
    const priceSol = basePrice * multiplier;

    return {
      mint,
      side,
      trader: `${side}-trader-${index}`,
      signature: `${fixture}-${index}`,
      priceSol,
      volumeSol,
      tokenAmount: volumeSol / priceSol,
      timestamp: new Date(Date.parse(launchedAt) + (index + 1) * 3_000).toISOString()
    };
  });
}

function riskPenaltyFor(riskLevel: string, hardReject: boolean): number {
  if (hardReject || riskLevel === "critical") {
    return 100;
  }

  if (riskLevel === "high") {
    return 28;
  }

  if (riskLevel === "medium") {
    return 12;
  }

  return 0;
}

function parseTime(value: string | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function nullableRound(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? round(value) : null;
}

function sanitizeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, min), max);
}

function round(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(10)) : 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
