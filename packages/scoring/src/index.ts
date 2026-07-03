import type {
  RiskFlags,
  RiskSnapshot,
  RollingMetrics,
  RollingMetricsSnapshot,
  ScoreBreakdown,
  TokenCandidate
} from "@axi/shared";

export type HardRejectResult = {
  rejected: boolean;
  reasonCodes: string[];
};

export type ScoreCandidateOptions = {
  minSampleCount?: number;
  riskSnapshot?: RiskSnapshot;
  rollingMetrics?: RollingMetricsSnapshot;
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

export function computeMomentumScore(
  metrics: RollingMetrics,
  rollingMetrics?: RollingMetricsSnapshot
): number {
  const volumeScore = clamp((metrics.volumeVelocity - 1) * 14, 0, 28);
  const buyerScore = clamp((metrics.buyerVelocity - 1) * 16, 0, 28);
  const priceScore = clamp(metrics.priceChange5mPct * 1.4, 0, 18);
  const buySellRatio =
    metrics.buyCount1m / Math.max(metrics.sellCount1m, 1);
  const flowScore = clamp((buySellRatio - 1) * 10, 0, 16);
  const activityScore = clamp(metrics.volume1mUsd / 1000, 0, 10);

  const legacyScore = Math.round(
    clamp(volumeScore + buyerScore + priceScore + flowScore + activityScore, 0, 100)
  );

  if (!rollingMetrics || rollingMetrics.sampleCount === 0) {
    return legacyScore;
  }

  return Math.round(
    clamp(legacyScore * 0.35 + computeRollingMomentumScore(rollingMetrics) * 0.65, 0, 100)
  );
}

export function computeQualityScore(
  metrics: RollingMetrics,
  riskFlags: RiskFlags,
  rollingMetrics?: RollingMetricsSnapshot
): number {
  const liquidityScore = clamp(metrics.liquidityUsd / 2000, 0, 24);
  const holderScore = clamp(metrics.holderCount / 12, 0, 18);
  const concentrationScore = clamp(25 - metrics.topHolderPercent, 0, 20);
  const marketCapScore = clamp(metrics.marketCapUsd / 5000, 0, 14);
  const agePenalty = riskFlags.mutableMetadata ? 4 : 0;
  const lowLiquidityPenalty = riskFlags.lowLiquidity ? 8 : 0;
  const organicBuyerScore = rollingMetrics
    ? clamp((rollingMetrics.organicBuyerScore - 50) * 0.12, -6, 6)
    : 0;

  return Math.round(
    clamp(
      liquidityScore +
        holderScore +
        concentrationScore +
        marketCapScore -
        agePenalty -
        lowLiquidityPenalty +
        organicBuyerScore,
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
  riskFlags: RiskFlags,
  options: ScoreCandidateOptions = {}
): ScoreBreakdown {
  const rollingMetrics = options.rollingMetrics;
  const riskSnapshot = options.riskSnapshot;
  const momentum = computeMomentumScore(metrics, rollingMetrics);
  const quality = computeQualityScore(metrics, riskFlags, rollingMetrics);
  const riskPenalty = computeCombinedRiskPenalty(riskFlags, riskSnapshot);
  const reject = hardReject(candidate, metrics, riskFlags);
  const riskHardReject = riskSnapshot?.hardReject ?? false;

  if (reject.rejected || riskHardReject) {
    return {
      total: 0,
      momentum,
      quality,
      riskPenalty,
      hardReject: true,
      action: "HARD_REJECT",
      reasonCodes: uniqueReasonCodes([
        ...reject.reasonCodes,
        ...(riskSnapshot?.reasonCodes ?? []),
        ...(riskHardReject ? ["RISK_HARD_REJECT"] : [])
      ])
    };
  }

  const total = Math.round(clamp(momentum * 0.55 + quality * 0.55 - riskPenalty, 0, 100));
  const reasonCodes: string[] = [];
  const insufficientMetrics =
    rollingMetrics?.insufficientMetrics ??
    riskSnapshot?.flags.insufficientMetrics ??
    false;
  const belowMinSampleCount =
    rollingMetrics !== undefined &&
    rollingMetrics.sampleCount < (options.minSampleCount ?? 0);
  const riskLevel = riskSnapshot?.riskLevel;

  if (momentum >= 65) {
    reasonCodes.push("STRONG_MOMENTUM");
  }

  if (metrics.volumeVelocity >= 1.8) {
    reasonCodes.push("RISING_VOLUME");
  }

  if (metrics.buyerVelocity >= 1.6) {
    reasonCodes.push("BUYER_ACCELERATION");
  }

  if (rollingMetrics) {
    if (rollingMetrics.volumeVelocityUsdPerSec >= 75) {
      reasonCodes.push("POSITIVE_VOLUME_VELOCITY");
    }

    if (rollingMetrics.volumeAccelerationUsdPerSec2 > 10) {
      reasonCodes.push("POSITIVE_VOLUME_ACCELERATION");
    }

    if (rollingMetrics.buyerVelocityPerSec >= 0.4) {
      reasonCodes.push("POSITIVE_BUYER_VELOCITY");
    }

    if (rollingMetrics.buyerAccelerationPerSec2 > 0.05) {
      reasonCodes.push("POSITIVE_BUYER_ACCELERATION");
    }

    if (rollingMetrics.priceVelocityPctPerSec > 0.1) {
      reasonCodes.push("POSITIVE_PRICE_VELOCITY");
    }

    if (rollingMetrics.buyerVelocityPerSec < 0.2) {
      reasonCodes.push("WEAK_BUYER_GROWTH");
    }

    if (
      rollingMetrics.netBuyPressure < -0.2 ||
      rollingMetrics.buySellRatio < 0.75
    ) {
      reasonCodes.push("SELL_PRESSURE_HIGH");
    }

    if (insufficientMetrics) {
      reasonCodes.push("INSUFFICIENT_TRADE_METRICS");
    }
  }

  if (belowMinSampleCount) {
    reasonCodes.push("INSUFFICIENT_TRADE_METRICS");
  }

  if (riskSnapshot) {
    if (riskLevel === "critical") {
      reasonCodes.push("RISK_LEVEL_CRITICAL");
    }

    if (riskLevel === "high") {
      reasonCodes.push("RISK_LEVEL_HIGH");
    }

    if (
      riskSnapshot.reasonCodes.includes("HOLDER_CONCENTRATION_ELEVATED") ||
      riskSnapshot.reasonCodes.includes("TOP_HOLDER_TOO_HIGH") ||
      riskSnapshot.reasonCodes.includes("TOP10_HOLDER_TOO_HIGH")
    ) {
      reasonCodes.push("HIGH_CONCENTRATION_RISK");
    }

    if (riskSnapshot.reasonCodes.includes("SELL_PRESSURE_ELEVATED")) {
      reasonCodes.push("SELL_PRESSURE_HIGH");
    }
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
    action: getScoreAction({
      belowMinSampleCount,
      insufficientMetrics,
      riskLevel,
      total
    }),
    reasonCodes: uniqueReasonCodes(reasonCodes)
  };
}

function computeCombinedRiskPenalty(
  riskFlags: RiskFlags,
  riskSnapshot: RiskSnapshot | undefined
): number {
  const legacyPenalty = computeRiskPenalty(riskFlags);

  if (!riskSnapshot) {
    return legacyPenalty;
  }

  const levelPenalty =
    riskSnapshot.riskLevel === "critical"
      ? 100
      : riskSnapshot.riskLevel === "high"
        ? 45
        : riskSnapshot.riskLevel === "medium"
          ? 20
          : riskSnapshot.riskLevel === "unknown"
            ? 8
            : 0;
  const scorePenalty = clamp(riskSnapshot.riskScore * 0.45, 0, 45);

  return clamp(Math.max(legacyPenalty, levelPenalty) + scorePenalty, 0, 100);
}

function computeRollingMomentumScore(metrics: RollingMetricsSnapshot): number {
  const volumeVelocityScore = clamp(metrics.volumeVelocityUsdPerSec / 8, 0, 18);
  const volumeAccelerationScore = clamp(
    metrics.volumeAccelerationUsdPerSec2 / 3,
    0,
    14
  );
  const buyerVelocityScore = clamp(metrics.buyerVelocityPerSec * 22, 0, 16);
  const buyerAccelerationScore = clamp(
    metrics.buyerAccelerationPerSec2 * 60,
    0,
    12
  );
  const priceVelocityScore = clamp(metrics.priceVelocityPctPerSec * 8, 0, 14);
  const ratioScore = clamp((metrics.buySellRatio - 1) * 7, 0, 12);
  const pressureScore = clamp(metrics.netBuyPressure * 12, 0, 12);
  const tradeActivityScore = clamp(metrics.tradesPerSecond * 10, 0, 12);
  const sellPressurePenalty =
    metrics.netBuyPressure < -0.2 || metrics.buySellRatio < 0.75 ? 18 : 0;
  const insufficientPenalty = metrics.insufficientMetrics ? 10 : 0;

  return Math.round(
    clamp(
      volumeVelocityScore +
        volumeAccelerationScore +
        buyerVelocityScore +
        buyerAccelerationScore +
        priceVelocityScore +
        ratioScore +
        pressureScore +
        tradeActivityScore -
        sellPressurePenalty -
        insufficientPenalty,
      0,
      100
    )
  );
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes));
}

function getScoreAction(options: {
  belowMinSampleCount: boolean;
  insufficientMetrics: boolean;
  riskLevel: RiskSnapshot["riskLevel"] | undefined;
  total: number;
}): ScoreBreakdown["action"] {
  if (options.riskLevel === "critical") {
    return "IGNORE";
  }

  if (options.total >= 75) {
    return options.insufficientMetrics || options.belowMinSampleCount
      ? "WATCH"
      : "BUY_READY";
  }

  return options.total >= 45 ? "WATCH" : "IGNORE";
}
