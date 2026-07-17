import { computeCanonicalDerivatives } from "@axi/derivatives";

export const launchWindowMs = {
  "5s": 5_000,
  "10s": 10_000,
  "30s": 30_000,
  "60s": 60_000,
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

export type DerivativeDirection = "up" | "down" | "flat" | "unavailable";

export type DerivativeStrengthLabel =
  | "none"
  | "weak"
  | "moderate"
  | "strong"
  | "explosive";

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
  priceOpenSol: number | null;
  priceHighSol: number | null;
  priceLowSol: number | null;
  priceCloseSol: number | null;
  priceChangePct: number;
};

export type LaunchDerivatives = {
  volumeVelocitySolPerSec: number | null;
  volumeAccelerationSolPerSec2: number | null;
  priceVelocityPctPerSec: number | null;
  priceAccelerationPctPerSec2: number | null;
  priceSolVelocityPerSec: number | null;
  priceSolAccelerationPerSec2: number | null;
  buyerVelocityPerSec: number | null;
  buyerAccelerationPerSec2: number | null;
  tradeVelocityPerSec: number | null;
  tradeAccelerationPerSec2: number | null;
  buyPressureVelocityPerSec: number | null;
  buyPressureAccelerationPerSec2: number | null;
  marketCapSolVelocityPerSec: number | null;
  marketCapSolAccelerationPerSec2: number | null;
  liquiditySolVelocityPerSec: number | null;
  liquiditySolAccelerationPerSec2: number | null;
  dVol5sSolPerSec: number | null;
  dVol10sSolPerSec: number | null;
  dVol30sSolPerSec: number | null;
  d2VolSolPerSec2: number | null;
  dPricePctPerSec: number | null;
  d2PricePctPerSec2: number | null;
  dPriceSolPerSec: number | null;
  d2PriceSolPerSec2: number | null;
  dBuyersPerSec: number | null;
  d2BuyersPerSec2: number | null;
  dTradesPerSec: number | null;
  d2TradesPerSec2: number | null;
  dBuyPressurePerSec: number | null;
  d2BuyPressurePerSec2: number | null;
  dMarketCapSolPerSec: number | null;
  d2MarketCapSolPerSec2: number | null;
  dLiquiditySolPerSec: number | null;
  d2LiquiditySolPerSec2: number | null;
};

export type DerivativeStrength = {
  rawValue: number | null;
  normalizedScore: number;
  direction: DerivativeDirection;
  strength: DerivativeStrengthLabel;
  reasonCodes: string[];
};

export type MomentumDerivativeScore = {
  totalScore: number;
  strengthLabel: LaunchScoreLabel;
  components: {
    volumeVelocityScore: number;
    volumeAccelerationScore: number;
    priceVelocityScore: number;
    priceAccelerationScore: number;
    buyerVelocityScore: number;
    buyerAccelerationScore: number;
    tradeVelocityScore: number;
    buyPressureScore: number;
    sellPressurePenalty: number;
    missingDataPenalty: number;
    riskPenalty: number;
  };
  reasonCodes: string[];
};

export type LaunchDerivativeStrengths = {
  volume: DerivativeStrength;
  volumeAcceleration: DerivativeStrength;
  price: DerivativeStrength;
  priceAcceleration: DerivativeStrength;
  priceSol: DerivativeStrength;
  buyers: DerivativeStrength;
  buyerAcceleration: DerivativeStrength;
  trades: DerivativeStrength;
  buyPressure: DerivativeStrength;
  marketCap: DerivativeStrength;
  liquidity: DerivativeStrength;
  combinedDerivativeScore: MomentumDerivativeScore;
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
  derivativeStrength: LaunchDerivativeStrengths;
  derivativeScore: MomentumDerivativeScore;
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
  insufficientSamplesForDerivative: "INSUFFICIENT_SAMPLES_FOR_DERIVATIVE",
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
  const trades = sanitizeTrades(
    input.trades ?? [],
    input.mint,
    evaluatedAtMs
  );
  const windows = createWindowRecord(trades, evaluatedAtMs);
  const derivatives = computeDerivatives(trades, evaluatedAtMs);
  const components = computeScoreComponents({
    derivatives,
    hardReject: input.hardReject === true,
    riskLevel: input.riskLevel ?? "unknown",
    tradeSampleCount: trades.length,
    windows
  });
  const derivativeStrength = computeDerivativeStrengths({
    derivatives,
    hardReject: input.hardReject === true,
    riskLevel: input.riskLevel ?? "unknown",
    tradeSampleCount: trades.length,
    windows
  });
  const derivativeScore = derivativeStrength.combinedDerivativeScore;
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

  if (trades.length < 2) {
    reasonCodes.push(launchReasonCodes.insufficientSamplesForDerivative);
  }

  if (windows["10s"].volumeSol >= 2 || windows["30s"].volumeSol >= 4) {
    reasonCodes.push(launchReasonCodes.volumeSpike);
    drivers.push("early volume");
  }

  if (isGreaterThan(derivatives.volumeAccelerationSolPerSec2, 0.03)) {
    reasonCodes.push(launchReasonCodes.volumeAcceleration);
    drivers.push("volume acceleration");
  }

  if (windows["10s"].priceChangePct >= 8 || windows["30s"].priceChangePct >= 15) {
    reasonCodes.push(launchReasonCodes.priceSpike);
    drivers.push("price action");
  }

  if (isGreaterThan(derivatives.priceAccelerationPctPerSec2, 0.1)) {
    reasonCodes.push(launchReasonCodes.priceAcceleration);
    drivers.push("price acceleration");
  }

  if (windows["10s"].uniqueBuyers >= 3 || windows["30s"].uniqueBuyers >= 5) {
    reasonCodes.push(launchReasonCodes.buyerGrowth);
    drivers.push("buyer growth");
  }

  if (isGreaterThan(derivatives.buyerAccelerationPerSec2, 0.03)) {
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
  const score =
    input.hardReject === true
      ? 0
      : round(clamp(Math.max(rawScore, derivativeScore.totalScore), 0, 100));
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
    derivativeStrength,
    derivativeScore,
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
    "60s": computeWindow(trades, evaluatedAtMs, launchWindowMs["60s"]),
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
      if (trade.trader) {
        buyers.add(trade.trader);
      }
    } else {
      sellVolumeSol += trade.volumeSol;
      if (trade.trader) {
        sellers.add(trade.trader);
      }
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
    priceOpenSol: first.priceSol,
    priceHighSol: Math.max(...trades.map((trade) => trade.priceSol)),
    priceLowSol: Math.min(...trades.map((trade) => trade.priceSol)),
    priceCloseSol: last.priceSol,
    priceChangePct
  });
}

function computeDerivatives(
  trades: LaunchTradeSample[],
  evaluatedAtMs: number
): LaunchDerivatives {
  const snapshot = computeCanonicalDerivatives({
    mint: trades[0]?.mint ?? "unknown",
    evaluatedAt: evaluatedAtMs,
    observations: trades.map((trade) => ({
      id: tradeIdentity(trade),
      timestamp: trade.timestamp,
      side: trade.side,
      trader: trade.trader,
      priceSol: trade.priceSol,
      volumeSol: trade.volumeSol
    }))
  });
  const primary = snapshot.windows["10s"].metrics;
  const window5s = snapshot.windows["5s"].metrics;
  const window30s = snapshot.windows["30s"].metrics;

  return {
    volumeVelocitySolPerSec: primary.volumeVelocitySolPerSec.value,
    volumeAccelerationSolPerSec2:
      primary.volumeAccelerationSolPerSec2.value,
    priceVelocityPctPerSec: primary.priceVelocityPctPerSec.value,
    priceAccelerationPctPerSec2:
      primary.priceAccelerationPctPerSec2.value,
    priceSolVelocityPerSec: primary.priceSolVelocityPerSec.value,
    priceSolAccelerationPerSec2:
      primary.priceSolAccelerationPerSec2.value,
    buyerVelocityPerSec: primary.buyerVelocityPerSec.value,
    buyerAccelerationPerSec2: primary.buyerAccelerationPerSec2.value,
    tradeVelocityPerSec: primary.tradeVelocityPerSec.value,
    tradeAccelerationPerSec2: primary.tradeAccelerationPerSec2.value,
    buyPressureVelocityPerSec: primary.buyPressureVelocityPerSec.value,
    buyPressureAccelerationPerSec2:
      primary.buyPressureAccelerationPerSec2.value,
    marketCapSolVelocityPerSec: null,
    marketCapSolAccelerationPerSec2: null,
    liquiditySolVelocityPerSec: null,
    liquiditySolAccelerationPerSec2: null,
    dVol5sSolPerSec: window5s.volumeVelocitySolPerSec.value,
    dVol10sSolPerSec: primary.volumeVelocitySolPerSec.value,
    dVol30sSolPerSec: window30s.volumeVelocitySolPerSec.value,
    d2VolSolPerSec2: primary.volumeAccelerationSolPerSec2.value,
    dPricePctPerSec: primary.priceVelocityPctPerSec.value,
    d2PricePctPerSec2: primary.priceAccelerationPctPerSec2.value,
    dPriceSolPerSec: primary.priceSolVelocityPerSec.value,
    d2PriceSolPerSec2: primary.priceSolAccelerationPerSec2.value,
    dBuyersPerSec: primary.buyerVelocityPerSec.value,
    d2BuyersPerSec2: primary.buyerAccelerationPerSec2.value,
    dTradesPerSec: primary.tradeVelocityPerSec.value,
    d2TradesPerSec2: primary.tradeAccelerationPerSec2.value,
    dBuyPressurePerSec: primary.buyPressureVelocityPerSec.value,
    d2BuyPressurePerSec2: primary.buyPressureAccelerationPerSec2.value,
    dMarketCapSolPerSec: null,
    d2MarketCapSolPerSec2: null,
    dLiquiditySolPerSec: null,
    d2LiquiditySolPerSec2: null
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
  const volumeAccelerationScore = clamp(
    (input.derivatives.volumeAccelerationSolPerSec2 ?? 0) * 240,
    0,
    18
  );
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

function computeDerivativeStrengths(input: {
  derivatives: LaunchDerivatives;
  hardReject: boolean;
  riskLevel: string;
  tradeSampleCount: number;
  windows: Record<LaunchWindowLabel, LaunchWindowMetrics>;
}): LaunchDerivativeStrengths {
  const volume = toDerivativeStrength(input.derivatives.volumeVelocitySolPerSec, {
    unavailableCode: "VOLUME_VELOCITY_UNAVAILABLE",
    weakAt: 0.03,
    moderateAt: 0.1,
    strongAt: 0.3,
    explosiveAt: 0.75
  });
  const volumeAcceleration = toDerivativeStrength(
    input.derivatives.volumeAccelerationSolPerSec2,
    {
      unavailableCode: "VOLUME_ACCELERATION_UNAVAILABLE",
      weakAt: 0.005,
      moderateAt: 0.02,
      strongAt: 0.05,
      explosiveAt: 0.12
    }
  );
  const price = toDerivativeStrength(input.derivatives.priceVelocityPctPerSec, {
    unavailableCode: "PRICE_VELOCITY_UNAVAILABLE",
    weakAt: 0.05,
    moderateAt: 0.2,
    strongAt: 0.65,
    explosiveAt: 1.4
  });
  const priceAcceleration = toDerivativeStrength(
    input.derivatives.priceAccelerationPctPerSec2,
    {
      unavailableCode: "PRICE_ACCELERATION_UNAVAILABLE",
      weakAt: 0.01,
      moderateAt: 0.05,
      strongAt: 0.15,
      explosiveAt: 0.35
    }
  );
  const priceSol = toDerivativeStrength(input.derivatives.priceSolVelocityPerSec, {
    unavailableCode: "PRICE_SOL_VELOCITY_UNAVAILABLE",
    weakAt: 0.000001,
    moderateAt: 0.00001,
    strongAt: 0.00005,
    explosiveAt: 0.0002
  });
  const buyers = toDerivativeStrength(input.derivatives.buyerVelocityPerSec, {
    unavailableCode: "BUYER_VELOCITY_UNAVAILABLE",
    weakAt: 0.03,
    moderateAt: 0.1,
    strongAt: 0.25,
    explosiveAt: 0.5
  });
  const buyerAcceleration = toDerivativeStrength(
    input.derivatives.buyerAccelerationPerSec2,
    {
      unavailableCode: "BUYER_ACCELERATION_UNAVAILABLE",
      weakAt: 0.003,
      moderateAt: 0.015,
      strongAt: 0.04,
      explosiveAt: 0.1
    }
  );
  const trades = toDerivativeStrength(input.derivatives.tradeVelocityPerSec, {
    unavailableCode: "TRADE_VELOCITY_UNAVAILABLE",
    weakAt: 0.08,
    moderateAt: 0.2,
    strongAt: 0.45,
    explosiveAt: 0.8
  });
  const buyPressure = toDerivativeStrength(
    input.derivatives.buyPressureVelocityPerSec,
    {
      unavailableCode: "BUY_PRESSURE_DERIVATIVE_UNAVAILABLE",
      weakAt: 0.005,
      moderateAt: 0.02,
      strongAt: 0.06,
      explosiveAt: 0.12
    }
  );
  const marketCap = toDerivativeStrength(
    input.derivatives.marketCapSolVelocityPerSec,
    {
      unavailableCode: "MARKET_CAP_DERIVATIVE_UNAVAILABLE",
      weakAt: 0.05,
      moderateAt: 0.2,
      strongAt: 0.6,
      explosiveAt: 1.5
    }
  );
  const liquidity = toDerivativeStrength(
    input.derivatives.liquiditySolVelocityPerSec,
    {
      unavailableCode: "LIQUIDITY_DERIVATIVE_UNAVAILABLE",
      weakAt: 0.05,
      moderateAt: 0.2,
      strongAt: 0.6,
      explosiveAt: 1.5
    }
  );
  const combinedDerivativeScore = computeMomentumDerivativeScore({
    buyerAcceleration,
    buyers,
    buyPressure,
    hardReject: input.hardReject,
    price,
    priceAcceleration,
    riskLevel: input.riskLevel,
    tradeSampleCount: input.tradeSampleCount,
    trades,
    volume,
    volumeAcceleration,
    windows: input.windows
  });

  return {
    volume,
    volumeAcceleration,
    price,
    priceAcceleration,
    priceSol,
    buyers,
    buyerAcceleration,
    trades,
    buyPressure,
    marketCap,
    liquidity,
    combinedDerivativeScore
  };
}

function computeMomentumDerivativeScore(input: {
  buyerAcceleration: DerivativeStrength;
  buyers: DerivativeStrength;
  buyPressure: DerivativeStrength;
  hardReject: boolean;
  price: DerivativeStrength;
  priceAcceleration: DerivativeStrength;
  riskLevel: string;
  tradeSampleCount: number;
  trades: DerivativeStrength;
  volume: DerivativeStrength;
  volumeAcceleration: DerivativeStrength;
  windows: Record<LaunchWindowLabel, LaunchWindowMetrics>;
}): MomentumDerivativeScore {
  const reasonCodes: string[] = [];
  const components = {
    volumeVelocityScore: round(input.volume.normalizedScore * 0.16),
    volumeAccelerationScore: round(input.volumeAcceleration.normalizedScore * 0.12),
    priceVelocityScore: round(input.price.normalizedScore * 0.16),
    priceAccelerationScore: round(input.priceAcceleration.normalizedScore * 0.1),
    buyerVelocityScore: round(input.buyers.normalizedScore * 0.14),
    buyerAccelerationScore: round(input.buyerAcceleration.normalizedScore * 0.08),
    tradeVelocityScore: round(input.trades.normalizedScore * 0.1),
    buyPressureScore: round(Math.max(input.buyPressure.normalizedScore, 0) * 0.14),
    sellPressurePenalty:
      input.windows["10s"].netBuyPressure <= -0.2 ||
      input.windows["30s"].netBuyPressure <= -0.25
        ? 32
        : input.windows["10s"].netBuyPressure < 0
          ? 14
          : 0,
    missingDataPenalty:
      input.tradeSampleCount === 0 ? 45 : input.tradeSampleCount < 3 ? 22 : 0,
    riskPenalty: riskPenaltyFor(input.riskLevel, input.hardReject)
  };

  if (input.tradeSampleCount === 0) {
    reasonCodes.push("DISCOVERY_ONLY_NO_DERIVATIVES");
  }

  if (input.tradeSampleCount < 2) {
    reasonCodes.push(launchReasonCodes.insufficientSamplesForDerivative);
  }

  if (input.tradeSampleCount < 3) {
    reasonCodes.push(launchReasonCodes.insufficientTradeData);
  }

  if (components.sellPressurePenalty > 0) {
    reasonCodes.push(launchReasonCodes.sellPressure);
  }

  if (input.hardReject) {
    reasonCodes.push(launchReasonCodes.rejected);
  }

  const rawScore =
    components.volumeVelocityScore +
    components.volumeAccelerationScore +
    components.priceVelocityScore +
    components.priceAccelerationScore +
    components.buyerVelocityScore +
    components.buyerAccelerationScore +
    components.tradeVelocityScore +
    components.buyPressureScore -
    components.sellPressurePenalty -
    components.missingDataPenalty -
    components.riskPenalty;
  const totalScore = input.hardReject ? 0 : round(clamp(rawScore, 0, 100));

  return {
    totalScore,
    strengthLabel: scoreToLabel(totalScore, {
      hardReject: input.hardReject,
      tradeSampleCount: input.tradeSampleCount
    }),
    components,
    reasonCodes: uniqueStrings(reasonCodes)
  };
}

function toDerivativeStrength(
  rawValue: number | null,
  thresholds: {
    unavailableCode: string;
    weakAt: number;
    moderateAt: number;
    strongAt: number;
    explosiveAt: number;
  }
): DerivativeStrength {
  if (rawValue === null || !Number.isFinite(rawValue)) {
    return {
      rawValue: null,
      normalizedScore: 0,
      direction: "unavailable",
      strength: "none",
      reasonCodes: [thresholds.unavailableCode]
    };
  }

  const absoluteValue = Math.abs(rawValue);
  const normalizedScore = round(clamp((absoluteValue / thresholds.explosiveAt) * 100, 0, 100));
  const strength =
    absoluteValue >= thresholds.explosiveAt
      ? "explosive"
      : absoluteValue >= thresholds.strongAt
        ? "strong"
        : absoluteValue >= thresholds.moderateAt
          ? "moderate"
          : absoluteValue >= thresholds.weakAt
            ? "weak"
            : "none";
  const direction =
    rawValue > 0 ? "up" : rawValue < 0 ? "down" : ("flat" as const);

  return {
    rawValue: round(rawValue),
    normalizedScore,
    direction,
    strength,
    reasonCodes:
      strength === "none"
        ? ["DERIVATIVE_STRENGTH_NONE"]
        : [`DERIVATIVE_STRENGTH_${strength.toUpperCase()}`]
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
  mint: string,
  evaluatedAtMs: number
): LaunchTradeSample[] {
  const valid = trades
    .filter((trade) => {
      const timestampMs = tryParseTime(trade.timestamp);

      return (
        trade.mint === mint &&
        (trade.side === "buy" || trade.side === "sell") &&
        isPositiveFinite(trade.priceSol) &&
        isPositiveFinite(trade.volumeSol) &&
        timestampMs !== null &&
        timestampMs <= evaluatedAtMs
      );
    })
    .sort(
      (left, right) =>
        parseTime(left.timestamp) - parseTime(right.timestamp) ||
        tradeIdentity(left).localeCompare(tradeIdentity(right))
    );
  const seen = new Set<string>();

  return valid.filter((trade) => {
    const identity = tradeIdentity(trade);

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

function tradeIdentity(trade: LaunchTradeSample): string {
  return (
    trade.signature?.trim() ||
    [
      trade.mint,
      trade.timestamp,
      trade.side,
      trade.trader ?? "unknown",
      trade.priceSol,
      trade.volumeSol,
      trade.tokenAmount ?? "unknown"
    ].join(":")
  );
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
    priceOpenSol: null,
    priceHighSol: null,
    priceLowSol: null,
    priceCloseSol: null,
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
    priceOpenSol: nullableRound(window.priceOpenSol ?? window.openSol),
    priceHighSol: nullableRound(window.priceHighSol ?? window.highSol),
    priceLowSol: nullableRound(window.priceLowSol ?? window.lowSol),
    priceCloseSol: nullableRound(window.priceCloseSol ?? window.closeSol),
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
  const time = tryParseTime(value);

  if (time === null) {
    throw new RangeError("launch momentum timestamps must be valid");
  }

  return time;
}

function tryParseTime(value: string | Date): number | null {
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isFinite(time) ? time : null;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isGreaterThan(value: number | null, threshold: number): boolean {
  return value !== null && Number.isFinite(value) && value > threshold;
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
