import type {
  RiskFlags,
  RollingMetrics,
  ScoreBreakdown,
  TokenCandidate
} from "@axi/shared";

export type HardRejectResult = {
  rejected: boolean;
  reasonCodes: string[];
};

const TOP_HOLDER_REJECT_PERCENT = 25;
const TOP_10_HOLDER_REJECT_PERCENT = 75;

const riskPenaltyWeights: Record<keyof RiskFlags, number> = {
  mintAuthorityActive: 100,
  freezeAuthorityActive: 100,
  topHolderConcentrationHigh: 35,
  mutableMetadata: 8,
  suspiciousName: 8,
  lowLiquidity: 12,
  washTradingSuspected: 22,
  honeypotSuspected: 100
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function hardReject(
  candidate: TokenCandidate,
  metrics: RollingMetrics,
  riskFlags: RiskFlags
): HardRejectResult {
  const reasonCodes: string[] = [];

  if (candidate.mint.trim().length < 32) {
    reasonCodes.push("INVALID_MINT");
  }

  if (riskFlags.mintAuthorityActive) {
    reasonCodes.push("MINT_AUTHORITY_ACTIVE");
  }

  if (riskFlags.freezeAuthorityActive) {
    reasonCodes.push("FREEZE_AUTHORITY_ACTIVE");
  }

  if (
    riskFlags.topHolderConcentrationHigh ||
    metrics.topHolderPercent >= TOP_HOLDER_REJECT_PERCENT ||
    metrics.top10HolderPercent >= TOP_10_HOLDER_REJECT_PERCENT
  ) {
    reasonCodes.push("TOP_HOLDER_CONCENTRATION_HIGH");
  }

  if (riskFlags.honeypotSuspected) {
    reasonCodes.push("HONEYPOT_SUSPECTED");
  }

  return {
    rejected: reasonCodes.length > 0,
    reasonCodes
  };
}

export function computeMomentumScore(metrics: RollingMetrics): number {
  const volumeScore = clamp((metrics.volumeVelocity - 1) * 14, 0, 28);
  const buyerScore = clamp((metrics.buyerVelocity - 1) * 16, 0, 28);
  const priceScore = clamp(metrics.priceChange5mPct * 1.4, 0, 18);
  const buySellRatio =
    metrics.buyCount1m / Math.max(metrics.sellCount1m, 1);
  const flowScore = clamp((buySellRatio - 1) * 10, 0, 16);
  const activityScore = clamp(metrics.volume1mUsd / 1000, 0, 10);

  return Math.round(
    clamp(volumeScore + buyerScore + priceScore + flowScore + activityScore, 0, 100)
  );
}

export function computeQualityScore(
  metrics: RollingMetrics,
  riskFlags: RiskFlags
): number {
  const liquidityScore = clamp(metrics.liquidityUsd / 2000, 0, 24);
  const holderScore = clamp(metrics.holderCount / 12, 0, 18);
  const concentrationScore = clamp(25 - metrics.topHolderPercent, 0, 20);
  const marketCapScore = clamp(metrics.marketCapUsd / 5000, 0, 14);
  const agePenalty = riskFlags.mutableMetadata ? 4 : 0;
  const lowLiquidityPenalty = riskFlags.lowLiquidity ? 8 : 0;

  return Math.round(
    clamp(
      liquidityScore +
        holderScore +
        concentrationScore +
        marketCapScore -
        agePenalty -
        lowLiquidityPenalty,
      0,
      100
    )
  );
}

export function computeRiskPenalty(riskFlags: RiskFlags): number {
  const penalty = Object.entries(riskFlags).reduce((total, [flag, active]) => {
    if (!active) {
      return total;
    }

    return total + riskPenaltyWeights[flag as keyof RiskFlags];
  }, 0);

  return clamp(penalty, 0, 100);
}

export function scoreCandidate(
  candidate: TokenCandidate,
  metrics: RollingMetrics,
  riskFlags: RiskFlags
): ScoreBreakdown {
  const momentum = computeMomentumScore(metrics);
  const quality = computeQualityScore(metrics, riskFlags);
  const riskPenalty = computeRiskPenalty(riskFlags);
  const reject = hardReject(candidate, metrics, riskFlags);

  if (reject.rejected) {
    return {
      total: 0,
      momentum,
      quality,
      riskPenalty,
      hardReject: true,
      action: "HARD_REJECT",
      reasonCodes: reject.reasonCodes
    };
  }

  const total = Math.round(clamp(momentum * 0.55 + quality * 0.55 - riskPenalty, 0, 100));
  const reasonCodes: string[] = [];

  if (momentum >= 65) {
    reasonCodes.push("STRONG_MOMENTUM");
  }

  if (metrics.volumeVelocity >= 1.8) {
    reasonCodes.push("RISING_VOLUME");
  }

  if (metrics.buyerVelocity >= 1.6) {
    reasonCodes.push("BUYER_ACCELERATION");
  }

  if (quality >= 55) {
    reasonCodes.push("QUALITY_LIQUIDITY_AND_DISTRIBUTION");
  }

  if (riskPenalty > 0) {
    reasonCodes.push("RISK_PENALTY_APPLIED");
  }

  if (reasonCodes.length === 0) {
    reasonCodes.push("BASELINE_SIGNAL");
  }

  return {
    total,
    momentum,
    quality,
    riskPenalty,
    hardReject: false,
    action: total >= 75 ? "BUY_READY" : total >= 45 ? "WATCH" : "IGNORE",
    reasonCodes
  };
}
