import { describe, expect, it } from "vitest";
import type {
  MetricWindow,
  RiskFlags,
  RollingMetrics,
  RollingMetricsSnapshot,
  RollingWindowMetrics,
  TokenCandidate
} from "@axi/shared";
import {
  computeMomentumScore,
  hardReject,
  scoreCandidate
} from "../src/index";

const baseCandidate: TokenCandidate = {
  id: {
    chain: "solana",
    mint: "MockMint111111111111111111111111111111111"
  },
  mint: "MockMint111111111111111111111111111111111",
  symbol: "MOCK",
  name: "Mock Token",
  source: "mock",
  ageSeconds: 90,
  firstSeenAt: "2026-01-01T00:00:00.000Z"
};

const baseMetrics: RollingMetrics = {
  priceUsd: 0.00042,
  marketCapUsd: 48_000,
  liquidityUsd: 18_000,
  volume1mUsd: 7_500,
  volume5mUsd: 21_000,
  volume15mUsd: 38_000,
  buyCount1m: 42,
  buyCount5m: 120,
  sellCount1m: 18,
  sellCount5m: 64,
  uniqueBuyers1m: 33,
  uniqueBuyers5m: 90,
  uniqueSellers1m: 14,
  uniqueSellers5m: 42,
  holderCount: 260,
  topHolderPercent: 8,
  top10HolderPercent: 36,
  priceChange1mPct: 4,
  priceChange5mPct: 14,
  volumeVelocity: 2.4,
  buyerVelocity: 2.1
};

const baseRiskFlags: RiskFlags = {
  mintAuthorityActive: false,
  freezeAuthorityActive: false,
  topHolderConcentrationHigh: false,
  mutableMetadata: false,
  suspiciousName: false,
  lowLiquidity: false,
  washTradingSuspected: false,
  honeypotSuspected: false
};

describe("scoring", () => {
  it("rejects mint authority active", () => {
    const result = hardReject(baseCandidate, baseMetrics, {
      ...baseRiskFlags,
      mintAuthorityActive: true
    });

    expect(result.rejected).toBe(true);
    expect(result.reasonCodes).toContain("MINT_AUTHORITY_ACTIVE");
  });

  it("rejects freeze authority active", () => {
    const result = hardReject(baseCandidate, baseMetrics, {
      ...baseRiskFlags,
      freezeAuthorityActive: true
    });

    expect(result.rejected).toBe(true);
    expect(result.reasonCodes).toContain("FREEZE_AUTHORITY_ACTIVE");
  });

  it("rejects top holder concentration too high", () => {
    const result = hardReject(
      baseCandidate,
      { ...baseMetrics, topHolderPercent: 31 },
      baseRiskFlags
    );

    expect(result.rejected).toBe(true);
    expect(result.reasonCodes).toContain("TOP_HOLDER_CONCENTRATION_HIGH");
  });

  it("scores rising volume and buyers higher than flat metrics", () => {
    const flat = computeMomentumScore({
      ...baseMetrics,
      volumeVelocity: 1,
      buyerVelocity: 1,
      priceChange5mPct: 0,
      buyCount1m: 20,
      sellCount1m: 20
    });
    const rising = computeMomentumScore({
      ...baseMetrics,
      volumeVelocity: 3,
      buyerVelocity: 2.6
    });

    expect(rising).toBeGreaterThan(flat);
  });

  it("never returns BUY_READY if hardReject is true", () => {
    const score = scoreCandidate(baseCandidate, baseMetrics, {
      ...baseRiskFlags,
      mintAuthorityActive: true
    });

    expect(score.hardReject).toBe(true);
    expect(score.action).not.toBe("BUY_READY");
  });

  it("insufficient metrics prevent BUY_READY", () => {
    const score = scoreCandidate(baseCandidate, baseMetrics, baseRiskFlags, {
      rollingMetrics: createRollingMetrics({
        insufficientMetrics: true
      })
    });

    expect(score.action).not.toBe("BUY_READY");
    expect(score.reasonCodes).toContain("INSUFFICIENT_TRADE_METRICS");
  });

  it("positive volume and buyer acceleration improve score", () => {
    const weak = scoreCandidate(baseCandidate, baseMetrics, baseRiskFlags, {
      rollingMetrics: createRollingMetrics({
        buyerAccelerationPerSec2: 0,
        buyerVelocityPerSec: 0.1,
        insufficientMetrics: false,
        volumeAccelerationUsdPerSec2: 0,
        volumeVelocityUsdPerSec: 10
      })
    });
    const strong = scoreCandidate(baseCandidate, baseMetrics, baseRiskFlags, {
      rollingMetrics: createRollingMetrics({
        buyerAccelerationPerSec2: 0.2,
        buyerVelocityPerSec: 0.8,
        insufficientMetrics: false,
        volumeAccelerationUsdPerSec2: 80,
        volumeVelocityUsdPerSec: 200
      })
    });

    expect(strong.total).toBeGreaterThan(weak.total);
    expect(strong.reasonCodes).toContain("POSITIVE_VOLUME_ACCELERATION");
    expect(strong.reasonCodes).toContain("POSITIVE_BUYER_ACCELERATION");
  });

  it("sell pressure penalizes score", () => {
    const buyPressure = scoreCandidate(baseCandidate, baseMetrics, baseRiskFlags, {
      rollingMetrics: createRollingMetrics({
        buySellRatio: 4,
        insufficientMetrics: false,
        netBuyPressure: 0.7
      })
    });
    const sellPressure = scoreCandidate(baseCandidate, baseMetrics, baseRiskFlags, {
      rollingMetrics: createRollingMetrics({
        buySellRatio: 0.25,
        insufficientMetrics: false,
        netBuyPressure: -0.7
      })
    });

    expect(sellPressure.total).toBeLessThan(buyPressure.total);
    expect(sellPressure.reasonCodes).toContain("SELL_PRESSURE_HIGH");
  });
});

function createRollingMetrics(
  overrides: Partial<RollingMetricsSnapshot> = {}
): RollingMetricsSnapshot {
  const windowMetrics: RollingWindowMetrics = {
    buyVolumeUsd: 1000,
    sellVolumeUsd: 250,
    totalVolumeUsd: 1250,
    netVolumeUsd: 750,
    buyTradeCount: 8,
    sellTradeCount: 2,
    totalTradeCount: 10,
    uniqueBuyers: 7,
    uniqueSellers: 2,
    uniqueTraders: 9,
    priceChangePct: 8,
    highPriceUsd: 0.0005,
    lowPriceUsd: 0.0004
  };
  const windows = createWindowRecord(windowMetrics);
  const timestamp = "2026-01-01T00:00:00.000Z";

  return {
    mint: baseCandidate.mint,
    symbol: baseCandidate.symbol,
    windows,
    volumeVelocityUsdPerSec: 150,
    volumeAccelerationUsdPerSec2: 35,
    tradesPerSecond: 2,
    largestTradeUsd: 250,
    largestTradeShare: 0.2,
    buyerVelocityPerSec: 0.7,
    buyerAccelerationPerSec2: 0.1,
    latestPriceUsd: 0.0005,
    priceChangePct: createWindowRecord(8),
    priceVelocityPctPerSec: 1.6,
    priceAccelerationPctPerSec2: 0.2,
    highPriceUsd: createWindowRecord(0.0005),
    lowPriceUsd: createWindowRecord(0.0004),
    buySellRatio: 4,
    netBuyPressure: 0.6,
    organicBuyerScore: 75,
    insufficientMetrics: false,
    sampleCount: 10,
    firstSeenAt: timestamp,
    lastUpdatedAt: timestamp,
    ...overrides
  };
}

function createWindowRecord<T>(value: T): Record<MetricWindow, T> {
  return {
    "1s": value,
    "3s": value,
    "5s": value,
    "10s": value,
    "30s": value,
    "60s": value
  };
}
