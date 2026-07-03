import { describe, expect, it } from "vitest";
import type { FeedEvent } from "@axi/data-feeds";
import type {
  RiskSnapshot,
  RollingMetricsSnapshot,
  ScoreBreakdown
} from "@axi/shared";
import { createCandidateLifecycleEngine } from "../src/index";

const mint = "CandidateMint111111111111111111111111111";

describe("@axi/candidates", () => {
  it("creates a candidate from a new token event", () => {
    const engine = createCandidateLifecycleEngine();
    const state = engine.ingestFeedEvent(createTokenEvent());

    expect(state.lifecycleState).toBe("new");
    expect(state.symbol).toBe("CAND");
    expect(engine.getCandidate(mint)?.eventTypesSeen).toContain("token_created");
  });

  it("metrics move candidate into warming or watching", () => {
    const engine = createCandidateLifecycleEngine();

    engine.ingestFeedEvent(createTokenEvent());
    engine.updateMetrics(mint, createMetrics({ sampleCount: 2 }));
    const decision = engine.evaluateCandidate(mint);

    expect(decision?.lifecycleState).toBe("warming");
    expect(decision?.combinedReasonCodes).toContain("INSUFFICIENT_TRADE_METRICS");
  });

  it("hard reject moves candidate to rejected", () => {
    const engine = createCandidateLifecycleEngine();

    engine.ingestFeedEvent(createTokenEvent());
    engine.updateMetrics(mint, createMetrics());
    engine.updateRisk(mint, createRisk({ hardReject: true, riskLevel: "high" }));
    engine.updateScore(mint, createScore({ total: 92 }));

    const decision = engine.evaluateCandidate(mint);

    expect(decision?.lifecycleState).toBe("rejected");
    expect(decision?.action).toBe("REJECT");
  });

  it("insufficient metrics prevent PAPER_BUY_READY", () => {
    const engine = createCandidateLifecycleEngine();

    engine.ingestFeedEvent(createTokenEvent());
    engine.updateMetrics(mint, createMetrics({ insufficientMetrics: true, sampleCount: 2 }));
    engine.updateRisk(mint, createRisk());
    engine.updateScore(mint, createScore({ total: 95 }));

    const decision = engine.evaluateCandidate(mint);

    expect(decision?.action).not.toBe("PAPER_BUY_READY");
    expect(decision?.combinedReasonCodes).toContain("INSUFFICIENT_TRADE_METRICS");
  });

  it("high score with acceptable risk and enough metrics can qualify", () => {
    const engine = createCandidateLifecycleEngine();

    engine.ingestFeedEvent(createTokenEvent());
    engine.updateMetrics(mint, createMetrics({ sampleCount: 12 }));
    engine.updateRisk(mint, createRisk({ riskLevel: "low" }));
    engine.updateScore(mint, createScore({ total: 88 }));

    const decision = engine.evaluateCandidate(mint);

    expect(decision?.lifecycleState).toBe("qualified");
    expect(decision?.action).toBe("PAPER_BUY_READY");
  });

  it("critical risk prevents PAPER_BUY_READY", () => {
    const engine = createCandidateLifecycleEngine();

    engine.ingestFeedEvent(createTokenEvent());
    engine.updateMetrics(mint, createMetrics({ sampleCount: 12 }));
    engine.updateRisk(mint, createRisk({ riskLevel: "critical" }));
    engine.updateScore(mint, createScore({ total: 95 }));

    const decision = engine.evaluateCandidate(mint);

    expect(decision?.action).toBe("REJECT");
  });

  it("decision history is capped", () => {
    const engine = createCandidateLifecycleEngine({
      maxDecisionHistory: 3
    });

    engine.ingestFeedEvent(createTokenEvent());
    engine.updateMetrics(mint, createMetrics({ sampleCount: 12 }));
    engine.updateRisk(mint, createRisk());

    for (let score = 10; score < 60; score += 10) {
      engine.updateScore(mint, createScore({ total: score }));
      engine.evaluateCandidate(mint);
    }

    expect(engine.getCandidate(mint)?.decisionHistory).toHaveLength(3);
  });

  it("paper order submitted moves candidate to paper_ordered", () => {
    const engine = createCandidateLifecycleEngine();

    engine.ingestFeedEvent(createTokenEvent());
    engine.updateMetrics(mint, createMetrics({ sampleCount: 12 }));
    engine.updateRisk(mint, createRisk());
    engine.updateScore(mint, createScore({ total: 90 }));
    engine.evaluateCandidate(mint);

    const decision = engine.markPaperOrderSubmitted(mint);

    expect(decision?.lifecycleState).toBe("paper_ordered");
    expect(decision?.action).toBe("PAPER_ORDER_SUBMITTED");
  });

  it("attaches chain verification metadata to decisions", () => {
    const engine = createCandidateLifecycleEngine();

    engine.ingestFeedEvent(createTokenEvent());
    engine.updateMetrics(mint, createMetrics({ sampleCount: 12 }));
    engine.updateRisk(mint, createRisk());
    engine.updateScore(mint, createScore({ total: 90 }));
    engine.updateChainVerification(mint, {
      mint,
      status: "verified",
      reasonCodes: ["ON_CHAIN_MINT_VERIFIED", "ON_CHAIN_HOLDERS_VERIFIED"],
      inspectedAt: "2026-01-01T00:00:13.000Z",
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      supplyUi: 1_000_000,
      topHolderPct: 8.5,
      top10HolderPct: 30.5
    });

    const decision = engine.evaluateCandidate(mint);

    expect(decision?.chainVerificationStatus).toBe("verified");
    expect(decision?.chainReasonCodes).toContain("ON_CHAIN_MINT_VERIFIED");
    expect(decision?.combinedReasonCodes).toContain("ON_CHAIN_HOLDERS_VERIFIED");
    expect(decision?.onChainTopHolderPct).toBe(8.5);
  });

  it("reset and clear work", () => {
    const engine = createCandidateLifecycleEngine();

    engine.ingestFeedEvent(createTokenEvent());
    engine.resetCandidate(mint);
    expect(engine.getCandidate(mint)).toBeUndefined();

    engine.ingestFeedEvent(createTokenEvent());
    engine.clear();
    expect(engine.getAllCandidates()).toEqual([]);
  });
});

function createTokenEvent(): FeedEvent {
  return {
    type: "token_created",
    candidate: {
      id: {
        chain: "solana",
        mint
      },
      mint,
      symbol: "CAND",
      name: "Candidate Token",
      source: "mock:momentum",
      ageSeconds: 10,
      firstSeenAt: "2026-01-01T00:00:00.000Z"
    },
    metrics: {
      priceUsd: 0.001,
      marketCapUsd: 50_000,
      liquidityUsd: 20_000,
      volume1mUsd: 10_000,
      volume5mUsd: 30_000,
      volume15mUsd: 60_000,
      buyCount1m: 30,
      buyCount5m: 120,
      sellCount1m: 10,
      sellCount5m: 40,
      uniqueBuyers1m: 25,
      uniqueBuyers5m: 100,
      uniqueSellers1m: 8,
      uniqueSellers5m: 32,
      holderCount: 250,
      topHolderPercent: 6,
      top10HolderPercent: 28,
      priceChange1mPct: 8,
      priceChange5mPct: 20,
      volumeVelocity: 2.5,
      buyerVelocity: 2.2
    },
    metricsComplete: true,
    riskFlags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      topHolderConcentrationHigh: false,
      mutableMetadata: false,
      suspiciousName: false,
      lowLiquidity: false,
      washTradingSuspected: false,
      honeypotSuspected: false
    },
    source: "mock",
    timestamp: "2026-01-01T00:00:00.000Z"
  };
}

function createMetrics(
  overrides: Partial<RollingMetricsSnapshot> = {}
): RollingMetricsSnapshot {
  return {
    mint,
    symbol: "CAND",
    windows: {
      "1s": createWindow(200),
      "3s": createWindow(600),
      "5s": createWindow(1000),
      "10s": createWindow(2500),
      "30s": createWindow(6000),
      "60s": createWindow(9000)
    },
    volumeVelocityUsdPerSec: 300,
    volumeAccelerationUsdPerSec2: 20,
    tradesPerSecond: 1.6,
    largestTradeUsd: 300,
    largestTradeShare: 0.1,
    buyerVelocityPerSec: 0.8,
    buyerAccelerationPerSec2: 0.1,
    latestPriceUsd: 0.0012,
    priceChangePct: {
      "1s": 1,
      "3s": 2,
      "5s": 3,
      "10s": 8,
      "30s": 16,
      "60s": 24
    },
    priceVelocityPctPerSec: 1,
    priceAccelerationPctPerSec2: 0.1,
    highPriceUsd: {
      "1s": 0.0012,
      "3s": 0.0012,
      "5s": 0.0012,
      "10s": 0.0012,
      "30s": 0.0012,
      "60s": 0.0012
    },
    lowPriceUsd: {
      "1s": 0.001,
      "3s": 0.001,
      "5s": 0.001,
      "10s": 0.001,
      "30s": 0.001,
      "60s": 0.001
    },
    buySellRatio: 3,
    netBuyPressure: 0.6,
    organicBuyerScore: 80,
    insufficientMetrics: false,
    sampleCount: 12,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastUpdatedAt: "2026-01-01T00:00:12.000Z",
    ...overrides
  };
}

function createWindow(totalVolumeUsd: number) {
  return {
    buyVolumeUsd: totalVolumeUsd * 0.75,
    sellVolumeUsd: totalVolumeUsd * 0.25,
    totalVolumeUsd,
    netVolumeUsd: totalVolumeUsd * 0.5,
    buyTradeCount: 8,
    sellTradeCount: 2,
    totalTradeCount: 10,
    uniqueBuyers: 7,
    uniqueSellers: 2,
    uniqueTraders: 9,
    priceChangePct: 4,
    highPriceUsd: 0.0012,
    lowPriceUsd: 0.001
  };
}

function createRisk(overrides: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    mint,
    symbol: "CAND",
    source: "mock",
    riskLevel: "low",
    hardReject: false,
    riskScore: 12,
    flags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      metadataMutable: false,
      holderCount: 250,
      topHolderPct: 6,
      top10HolderPct: 28,
      devHolderPct: 2,
      insiderHolderPct: 4,
      devSoldPct: 0,
      devNetFlowUsd: 200,
      priorLaunchCount: 1,
      priorRugCount: 0,
      buySellRatio: 3,
      netBuyPressure: 0.6,
      uniqueBuyers: 7,
      uniqueSellers: 2,
      volumeVelocity: 300,
      volumeAcceleration: 20,
      buyerVelocity: 0.8,
      buyerAcceleration: 0.1,
      priceVelocity: 1,
      priceAcceleration: 0.1,
      largestTradeShare: 0.1,
      sampleCount: 12,
      insufficientMetrics: false,
      liquidityUsd: 20_000,
      marketCapUsd: 60_000,
      fdvUsd: 60_000,
      estimatedSellSlippagePct: 4,
      sniperPct: 4,
      bundlerPct: 3,
      washTradingSuspected: false,
      honeypotSuspected: false
    },
    reasonCodes: ["BASELINE_RISK"],
    humanSummary: "low risk: BASELINE_RISK",
    updatedAt: "2026-01-01T00:00:12.000Z",
    ...overrides
  };
}

function createScore(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    total: 80,
    momentum: 80,
    quality: 70,
    riskPenalty: 0,
    hardReject: false,
    action: "BUY_READY",
    reasonCodes: ["STRONG_MOMENTUM"],
    ...overrides
  };
}
