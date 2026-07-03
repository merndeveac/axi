import type { RiskLevel, RiskSnapshot, RiskSnapshotFlags } from "@axi/shared";

export type RiskInput = {
  mint: string;
  symbol?: string;
  name?: string;
  source?: string;
  mintAuthorityActive: boolean | null;
  freezeAuthorityActive: boolean | null;
  metadataMutable: boolean | null;
  holderCount: number | null;
  topHolderPct: number | null;
  top10HolderPct: number | null;
  devHolderPct: number | null;
  insiderHolderPct: number | null;
  creator?: string;
  devSoldPct: number | null;
  devNetFlowUsd: number | null;
  priorLaunchCount: number | null;
  priorRugCount: number | null;
  buySellRatio: number | null;
  netBuyPressure: number | null;
  uniqueBuyers: number | null;
  uniqueSellers: number | null;
  volumeVelocity: number | null;
  volumeAcceleration: number | null;
  buyerVelocity: number | null;
  buyerAcceleration: number | null;
  priceVelocity: number | null;
  priceAcceleration: number | null;
  largestTradeShare: number | null;
  sampleCount: number | null;
  insufficientMetrics: boolean | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  estimatedSellSlippagePct: number | null;
  sniperPct: number | null;
  bundlerPct: number | null;
  washTradingSuspected: boolean | null;
  honeypotSuspected: boolean | null;
};

export type RiskThresholds = {
  bundlerPctWarning: number;
  devDumpNetFlowUsd: number;
  devHolderHardRejectPct: number;
  devSoldPctHardReject: number;
  hardRejectOnInsufficientRiskData: boolean;
  holderCountHardRejectBelow: number;
  insiderHolderWarningPct: number;
  largestTradeShareWarning: number;
  liquidityHardRejectBelowUsd: number;
  sellPressureBuySellRatioWarningBelow: number;
  sellPressureNetBuyPressureWarningBelow: number;
  sellSlippageHardRejectPct: number;
  sniperPctWarning: number;
  top10HolderHardRejectPct: number;
  top10HolderWarningPct: number;
  topHolderHardRejectPct: number;
  topHolderWarningPct: number;
};

export type RiskEngineOptions = {
  now?: () => Date;
  thresholds?: Partial<RiskThresholds>;
};

export const defaultRiskThresholds: RiskThresholds = {
  bundlerPctWarning: 20,
  devDumpNetFlowUsd: -5_000,
  devHolderHardRejectPct: 10,
  devSoldPctHardReject: 50,
  hardRejectOnInsufficientRiskData: false,
  holderCountHardRejectBelow: 10,
  insiderHolderWarningPct: 15,
  largestTradeShareWarning: 0.35,
  liquidityHardRejectBelowUsd: 1_000,
  sellPressureBuySellRatioWarningBelow: 0.75,
  sellPressureNetBuyPressureWarningBelow: -0.35,
  sellSlippageHardRejectPct: 15,
  sniperPctWarning: 20,
  top10HolderHardRejectPct: 45,
  top10HolderWarningPct: 35,
  topHolderHardRejectPct: 20,
  topHolderWarningPct: 15
};

export class RiskEngine {
  private readonly now: () => Date;
  private readonly thresholds: RiskThresholds;

  constructor(options: RiskEngineOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.thresholds = {
      ...defaultRiskThresholds,
      ...options.thresholds
    };
  }

  evaluateRisk(input: RiskInput): RiskSnapshot {
    return evaluateRisk(input, {
      now: this.now,
      thresholds: this.thresholds
    });
  }
}

export function createRiskEngine(options: RiskEngineOptions = {}): RiskEngine {
  return new RiskEngine(options);
}

export function evaluateRisk(
  input: RiskInput,
  options: RiskEngineOptions = {}
): RiskSnapshot {
  const thresholds = {
    ...defaultRiskThresholds,
    ...options.thresholds
  };
  const now = options.now ?? (() => new Date());
  const reasonCodes: string[] = [];
  const flags = toFlags(input);
  let riskScore = 0;

  if (input.mintAuthorityActive === true) {
    riskScore += 100;
    reasonCodes.push("MINT_AUTHORITY_ACTIVE");
  }

  if (input.freezeAuthorityActive === true) {
    riskScore += 100;
    reasonCodes.push("FREEZE_AUTHORITY_ACTIVE");
  }

  if (input.honeypotSuspected === true) {
    riskScore += 100;
    reasonCodes.push("HONEYPOT_SUSPECTED");
  }

  if (input.topHolderPct !== null) {
    if (input.topHolderPct > thresholds.topHolderHardRejectPct) {
      riskScore += 45;
      reasonCodes.push("TOP_HOLDER_TOO_HIGH");
    } else if (input.topHolderPct > thresholds.topHolderWarningPct) {
      riskScore += 16;
      reasonCodes.push("HOLDER_CONCENTRATION_ELEVATED");
    }
  }

  if (input.top10HolderPct !== null) {
    if (input.top10HolderPct > thresholds.top10HolderHardRejectPct) {
      riskScore += 45;
      reasonCodes.push("TOP10_HOLDER_TOO_HIGH");
    } else if (input.top10HolderPct > thresholds.top10HolderWarningPct) {
      riskScore += 18;
      reasonCodes.push("HOLDER_CONCENTRATION_ELEVATED");
    }
  }

  if (
    input.devHolderPct !== null &&
    input.devHolderPct > thresholds.devHolderHardRejectPct
  ) {
    riskScore += 40;
    reasonCodes.push("DEV_HOLDER_TOO_HIGH");
  }

  if (
    input.holderCount !== null &&
    input.holderCount < thresholds.holderCountHardRejectBelow
  ) {
    riskScore += 32;
    reasonCodes.push("INSUFFICIENT_HOLDERS");
  }

  if (
    input.liquidityUsd !== null &&
    input.liquidityUsd < thresholds.liquidityHardRejectBelowUsd
  ) {
    riskScore += 35;
    reasonCodes.push("LIQUIDITY_TOO_LOW");
  }

  if (
    input.estimatedSellSlippagePct !== null &&
    input.estimatedSellSlippagePct > thresholds.sellSlippageHardRejectPct
  ) {
    riskScore += 35;
    reasonCodes.push("SELL_SLIPPAGE_TOO_HIGH");
  }

  if (
    (input.devSoldPct !== null &&
      input.devSoldPct > thresholds.devSoldPctHardReject) ||
    (input.devNetFlowUsd !== null &&
      input.devNetFlowUsd < thresholds.devDumpNetFlowUsd)
  ) {
    riskScore += 45;
    reasonCodes.push("DEV_DUMP_DETECTED");
  }

  if (input.washTradingSuspected === true) {
    riskScore += 40;
    reasonCodes.push("WASH_TRADING_SUSPECTED");
  }

  addWarnings(input, thresholds, reasonCodes);

  if (hasUnknownAuthority(input)) {
    riskScore += 8;
    reasonCodes.push("UNKNOWN_AUTHORITY_STATUS");
  }

  if (hasUnknownHolderData(input)) {
    riskScore += 8;
    reasonCodes.push("UNKNOWN_HOLDER_DATA");
  }

  if (hasUnknownLiquidityData(input)) {
    riskScore += 8;
    reasonCodes.push("UNKNOWN_LIQUIDITY_DATA");
  }

  if (input.insufficientMetrics === true) {
    riskScore += 10;
    reasonCodes.push("INSUFFICIENT_METRICS");
  }

  if (
    thresholds.hardRejectOnInsufficientRiskData &&
    (hasUnknownAuthority(input) ||
      hasUnknownHolderData(input) ||
      hasUnknownLiquidityData(input))
  ) {
    riskScore += 35;
    reasonCodes.push("INSUFFICIENT_RISK_DATA");
  }

  const uniqueReasonCodes = unique(reasonCodes);
  const hardReject = hasHardRejectReason(uniqueReasonCodes);
  const riskLevel = getRiskLevelFromScore({
    critical: input.mintAuthorityActive === true || input.honeypotSuspected === true,
    hardReject,
    riskScore
  });
  const snapshot: RiskSnapshot = {
    mint: input.mint,
    riskLevel,
    hardReject,
    riskScore: clamp(Math.round(riskScore), 0, 100),
    flags,
    reasonCodes: uniqueReasonCodes,
    humanSummary: createHumanSummary(riskLevel, hardReject, uniqueReasonCodes),
    updatedAt: now().toISOString()
  };

  if (input.symbol) {
    snapshot.symbol = input.symbol;
  }

  if (input.name) {
    snapshot.name = input.name;
  }

  if (input.source) {
    snapshot.source = input.source;
  }

  return snapshot;
}

export function createEmptyRiskSnapshot(
  mint: string,
  options: {
    source?: string;
    symbol?: string;
    updatedAt?: string;
  } = {}
): RiskSnapshot {
  const snapshot: RiskSnapshot = {
    mint,
    riskLevel: "unknown",
    hardReject: false,
    riskScore: 0,
    flags: createEmptyFlags(),
    reasonCodes: [
      "UNKNOWN_AUTHORITY_STATUS",
      "UNKNOWN_HOLDER_DATA",
      "UNKNOWN_LIQUIDITY_DATA"
    ],
    humanSummary: "Risk data is not available yet.",
    updatedAt: options.updatedAt ?? "1970-01-01T00:00:00.000Z"
  };

  if (options.source) {
    snapshot.source = options.source;
  }

  if (options.symbol) {
    snapshot.symbol = options.symbol;
  }

  return snapshot;
}

export function mergeRiskSnapshot(
  previous: RiskSnapshot | undefined,
  next: RiskSnapshot
): RiskSnapshot {
  if (!previous) {
    return next;
  }

  return {
    ...previous,
    ...next,
    flags: {
      ...previous.flags,
      ...next.flags
    },
    reasonCodes: unique([...previous.reasonCodes, ...next.reasonCodes])
  };
}

export function getRiskLevel(snapshot: RiskSnapshot): RiskLevel {
  return snapshot.riskLevel;
}

export function getHardRejectReasons(snapshot: RiskSnapshot): string[] {
  return snapshot.reasonCodes.filter((reasonCode) =>
    hardRejectReasonCodes.has(reasonCode)
  );
}

export function isHardRejected(snapshot: RiskSnapshot): boolean {
  return snapshot.hardReject;
}

function addWarnings(
  input: RiskInput,
  thresholds: RiskThresholds,
  reasonCodes: string[]
): void {
  if (
    input.priorRugCount !== null &&
    input.priorRugCount > 0
  ) {
    reasonCodes.push("DEV_HISTORY_RISK");
  }

  if (
    input.insiderHolderPct !== null &&
    input.insiderHolderPct > thresholds.insiderHolderWarningPct
  ) {
    reasonCodes.push("HOLDER_CONCENTRATION_ELEVATED");
  }

  if (
    input.sniperPct !== null &&
    input.sniperPct > thresholds.sniperPctWarning
  ) {
    reasonCodes.push("SNIPER_CONCENTRATION_ELEVATED");
  }

  if (
    input.bundlerPct !== null &&
    input.bundlerPct > thresholds.bundlerPctWarning
  ) {
    reasonCodes.push("BUNDLER_CONCENTRATION_ELEVATED");
  }

  if (
    (input.buySellRatio !== null &&
      input.buySellRatio < thresholds.sellPressureBuySellRatioWarningBelow) ||
    (input.netBuyPressure !== null &&
      input.netBuyPressure < thresholds.sellPressureNetBuyPressureWarningBelow)
  ) {
    reasonCodes.push("SELL_PRESSURE_ELEVATED");
  }

  if (
    input.largestTradeShare !== null &&
    input.largestTradeShare > thresholds.largestTradeShareWarning
  ) {
    reasonCodes.push("LARGEST_TRADE_SHARE_ELEVATED");
  }
}

function toFlags(input: RiskInput): RiskSnapshotFlags {
  return {
    mintAuthorityActive: input.mintAuthorityActive,
    freezeAuthorityActive: input.freezeAuthorityActive,
    metadataMutable: input.metadataMutable,
    holderCount: input.holderCount,
    topHolderPct: input.topHolderPct,
    top10HolderPct: input.top10HolderPct,
    devHolderPct: input.devHolderPct,
    insiderHolderPct: input.insiderHolderPct,
    devSoldPct: input.devSoldPct,
    devNetFlowUsd: input.devNetFlowUsd,
    priorLaunchCount: input.priorLaunchCount,
    priorRugCount: input.priorRugCount,
    buySellRatio: input.buySellRatio,
    netBuyPressure: input.netBuyPressure,
    uniqueBuyers: input.uniqueBuyers,
    uniqueSellers: input.uniqueSellers,
    volumeVelocity: input.volumeVelocity,
    volumeAcceleration: input.volumeAcceleration,
    buyerVelocity: input.buyerVelocity,
    buyerAcceleration: input.buyerAcceleration,
    priceVelocity: input.priceVelocity,
    priceAcceleration: input.priceAcceleration,
    largestTradeShare: input.largestTradeShare,
    sampleCount: input.sampleCount,
    insufficientMetrics: input.insufficientMetrics,
    liquidityUsd: input.liquidityUsd,
    marketCapUsd: input.marketCapUsd,
    fdvUsd: input.fdvUsd,
    estimatedSellSlippagePct: input.estimatedSellSlippagePct,
    sniperPct: input.sniperPct,
    bundlerPct: input.bundlerPct,
    washTradingSuspected: input.washTradingSuspected,
    honeypotSuspected: input.honeypotSuspected
  };
}

function createEmptyFlags(): RiskSnapshotFlags {
  return {
    mintAuthorityActive: null,
    freezeAuthorityActive: null,
    metadataMutable: null,
    holderCount: null,
    topHolderPct: null,
    top10HolderPct: null,
    devHolderPct: null,
    insiderHolderPct: null,
    devSoldPct: null,
    devNetFlowUsd: null,
    priorLaunchCount: null,
    priorRugCount: null,
    buySellRatio: null,
    netBuyPressure: null,
    uniqueBuyers: null,
    uniqueSellers: null,
    volumeVelocity: null,
    volumeAcceleration: null,
    buyerVelocity: null,
    buyerAcceleration: null,
    priceVelocity: null,
    priceAcceleration: null,
    largestTradeShare: null,
    sampleCount: null,
    insufficientMetrics: null,
    liquidityUsd: null,
    marketCapUsd: null,
    fdvUsd: null,
    estimatedSellSlippagePct: null,
    sniperPct: null,
    bundlerPct: null,
    washTradingSuspected: null,
    honeypotSuspected: null
  };
}

function getRiskLevelFromScore(options: {
  critical: boolean;
  hardReject: boolean;
  riskScore: number;
}): RiskLevel {
  if (options.critical || options.riskScore >= 90) {
    return "critical";
  }

  if (options.hardReject || options.riskScore >= 65) {
    return "high";
  }

  if (options.riskScore >= 35) {
    return "medium";
  }

  if (options.riskScore > 0) {
    return "low";
  }

  return "low";
}

function createHumanSummary(
  riskLevel: RiskLevel,
  hardReject: boolean,
  reasonCodes: string[]
): string {
  if (reasonCodes.length === 0) {
    return "No risk warnings from available paper-mode data.";
  }

  const prefix = hardReject
    ? "Hard reject"
    : riskLevel === "unknown"
      ? "Risk unknown"
      : `${riskLevel} risk`;

  return `${prefix}: ${reasonCodes.slice(0, 3).join(", ")}`;
}

function hasUnknownAuthority(input: RiskInput): boolean {
  return (
    input.mintAuthorityActive === null ||
    input.freezeAuthorityActive === null ||
    input.metadataMutable === null
  );
}

function hasUnknownHolderData(input: RiskInput): boolean {
  return (
    input.holderCount === null ||
    input.topHolderPct === null ||
    input.top10HolderPct === null
  );
}

function hasUnknownLiquidityData(input: RiskInput): boolean {
  return (
    input.liquidityUsd === null ||
    input.estimatedSellSlippagePct === null
  );
}

const hardRejectReasonCodes = new Set([
  "MINT_AUTHORITY_ACTIVE",
  "FREEZE_AUTHORITY_ACTIVE",
  "TOP_HOLDER_TOO_HIGH",
  "TOP10_HOLDER_TOO_HIGH",
  "DEV_HOLDER_TOO_HIGH",
  "INSUFFICIENT_HOLDERS",
  "LIQUIDITY_TOO_LOW",
  "SELL_SLIPPAGE_TOO_HIGH",
  "DEV_DUMP_DETECTED",
  "WASH_TRADING_SUSPECTED",
  "HONEYPOT_SUSPECTED",
  "INSUFFICIENT_RISK_DATA"
]);

function hasHardRejectReason(reasonCodes: string[]): boolean {
  return reasonCodes.some((reasonCode) => hardRejectReasonCodes.has(reasonCode));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
