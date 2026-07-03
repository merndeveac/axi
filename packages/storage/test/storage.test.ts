import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FeedEvent } from "@axi/data-feeds";
import type { CandidateDecision, OverlaySignal, RiskSnapshot } from "@axi/shared";
import {
  closeStorage,
  createReplayStream,
  getLatestChainVerification,
  getLatestCandidateDecision,
  getLatestRiskSnapshot,
  getStorageStats,
  initStorage,
  listCandidateDecisionsForReplay,
  listChainVerifications,
  listChainVerificationsForReplay,
  listCandidateDecisions,
  listFeedEvents,
  listPaperOrders,
  listPaperPositions,
  listRecentSignals,
  listRiskSnapshotsForReplay,
  listRiskSnapshots,
  listSignalsForReplay,
  saveCandidateDecision,
  saveChainVerification,
  saveFeedEvent,
  savePaperOrder,
  saveRiskSnapshot,
  saveSignal,
  upsertPaperPosition
} from "../src/index";

const mint = "MockMint9999111111111111111111111111111111";

let testDirectory: string;
let databasePath: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-storage-"));
  databasePath = join(testDirectory, "axi.sqlite");
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("@axi/storage", () => {
  it("database initializes", () => {
    const handle = initStorage({ databasePath });
    const stats = getStorageStats();

    expect(handle.databasePath).toBe(databasePath);
    expect(stats.databasePath).toBe(databasePath);
    expect(stats.signalCount).toBe(0);
    expect(stats.chainVerificationCount).toBe(0);
    expect(stats.riskSnapshotCount).toBe(0);
    expect(stats.candidateDecisionCount).toBe(0);
  });

  it("signal can be saved and read", () => {
    initStorage({ databasePath });
    const saved = saveSignal(createSignal());
    const recent = listRecentSignals(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.mint).toBe(mint);
    expect(recent[0]?.reasonCodes).toEqual(["STRONG_MOMENTUM"]);
  });

  it("paper order can be saved and read", () => {
    initStorage({ databasePath });
    const signal = saveSignal(createSignal());
    const order = savePaperOrder({
      mint,
      symbol: "MOCK",
      side: "buy",
      status: "accepted",
      sizeSol: 0.25,
      simulatedPrice: 0.00042,
      reasonCodes: ["STRONG_MOMENTUM"],
      signalId: signal.id,
      payload: {
        source: "test"
      }
    });

    const orders = listPaperOrders(10);

    expect(order.id).toBeGreaterThan(0);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.signalId).toBe(signal.id);
    expect(orders[0]?.side).toBe("buy");
  });

  it("paper position can be upserted and listed", () => {
    initStorage({ databasePath });
    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.25,
      tokenAmount: 595.23,
      entryPrice: 0.00042,
      status: "open",
      payload: {
        source: "first"
      }
    });

    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.5,
      tokenAmount: 1190.46,
      entryPrice: 0.00042,
      status: "open",
      payload: {
        source: "second"
      }
    });

    const positions = listPaperPositions();

    expect(positions).toHaveLength(1);
    expect(positions[0]?.sizeSol).toBe(0.5);
    expect(positions[0]?.tokenAmount).toBe(1190.46);
  });

  it("risk snapshot can be saved, listed, and fetched by mint", () => {
    initStorage({ databasePath });
    const saved = saveRiskSnapshot(createRiskSnapshot());
    const listed = listRiskSnapshots(10);
    const latest = getLatestRiskSnapshot(mint);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(latest?.mint).toBe(mint);
    expect(latest?.reasonCodes).toContain("BASELINE_RISK");
  });

  it("candidate decision can be saved, listed, and fetched by mint", () => {
    initStorage({ databasePath });
    const saved = saveCandidateDecision(createCandidateDecision());
    const listed = listCandidateDecisions(10);
    const latest = getLatestCandidateDecision(mint);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(latest?.mint).toBe(mint);
    expect(latest?.action).toBe("PAPER_BUY_READY");
  });

  it("chain verification can be saved, listed, and fetched by mint", () => {
    initStorage({ databasePath });
    const saved = saveChainVerification(createChainVerification());
    const listed = listChainVerifications(10);
    const latest = getLatestChainVerification(mint);

    expect(saved.id).toBeGreaterThan(0);
    expect(saved.status).toBe("verified");
    expect(listed).toHaveLength(1);
    expect(latest?.mint).toBe(mint);
    expect(latest?.reasonCodes).toContain("ON_CHAIN_MINT_VERIFIED");
    expect(latest?.topHolderPct).toBe(12.5);
  });

  it("storage stats return counts", () => {
    initStorage({ databasePath });
    saveChainVerification(createChainVerification());
    saveFeedEvent(createFeedEvent());
    saveRiskSnapshot(createRiskSnapshot());
    saveCandidateDecision(createCandidateDecision());
    const signal = saveSignal(createSignal());
    savePaperOrder({
      mint,
      symbol: "MOCK",
      side: "buy",
      status: "accepted",
      sizeSol: 0.25,
      simulatedPrice: 0.00042,
      reasonCodes: ["STRONG_MOMENTUM"],
      signalId: signal.id,
      payload: {}
    });
    upsertPaperPosition({
      mint,
      symbol: "MOCK",
      sizeSol: 0.25,
      tokenAmount: 595.23,
      entryPrice: 0.00042,
      status: "open",
      payload: {}
    });

    const stats = getStorageStats();

    expect(stats.feedEventCount).toBe(1);
    expect(stats.signalCount).toBe(1);
    expect(stats.chainVerificationCount).toBe(1);
    expect(stats.riskSnapshotCount).toBe(1);
    expect(stats.candidateDecisionCount).toBe(1);
    expect(stats.paperOrderCount).toBe(1);
    expect(stats.paperPositionCount).toBe(1);
    expect(stats.lastSignalAt).toEqual(expect.any(String));
  });

  it("lists replay records in chronological order", async () => {
    initStorage({ databasePath });
    saveFeedEvent(createFeedEvent("2026-01-01T00:00:02.000Z"));
    saveFeedEvent(createFeedEvent("2026-01-01T00:00:01.000Z"));
    saveSignal(createSignal());

    const feedEvents = listFeedEvents(10);
    const signals = listSignalsForReplay(10);
    const riskSnapshot = saveRiskSnapshot(createRiskSnapshot());
    const candidateDecision = saveCandidateDecision(createCandidateDecision());
    const chainVerification = saveChainVerification(createChainVerification());
    const riskSnapshots = listRiskSnapshotsForReplay(10);
    const candidateDecisions = listCandidateDecisionsForReplay(10);
    const chainVerifications = listChainVerificationsForReplay(10);
    const replayItems = [];
    const riskReplayItems = [];
    const candidateReplayItems = [];
    const chainReplayItems = [];

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "feed_events"
    })) {
      replayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "risk_snapshots"
    })) {
      riskReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "candidate_decisions"
    })) {
      candidateReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "chain_verifications"
    })) {
      chainReplayItems.push(item);
    }

    expect(feedEvents.map((event) => event.createdAt)).toEqual([
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:02.000Z"
    ]);
    expect(signals).toHaveLength(1);
    expect(riskSnapshots[0]?.id).toBe(riskSnapshot.id);
    expect(candidateDecisions[0]?.id).toBe(candidateDecision.id);
    expect(chainVerifications[0]?.id).toBe(chainVerification.id);
    expect(replayItems).toHaveLength(2);
    expect(replayItems[0]?.source).toBe("feed_events");
    expect(riskReplayItems[0]?.source).toBe("risk_snapshots");
    expect(candidateReplayItems[0]?.source).toBe("candidate_decisions");
    expect(chainReplayItems[0]?.source).toBe("chain_verifications");
  });
});

function createFeedEvent(timestamp = "2026-01-01T00:00:00.000Z"): FeedEvent {
  return {
    type: "token_created",
    candidate: createSignal().state.candidate,
    metrics: createSignal().state.metrics,
    metricsComplete: true,
    receivedAt: timestamp,
    riskFlags: createSignal().riskFlags,
    source: "mock",
    timestamp
  };
}

function createRiskSnapshot(): RiskSnapshot {
  return {
    mint,
    symbol: "MOCK",
    source: "mock",
    riskLevel: "low",
    hardReject: false,
    riskScore: 10,
    flags: {
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      metadataMutable: false,
      holderCount: 260,
      topHolderPct: 8,
      top10HolderPct: 36,
      devHolderPct: 2,
      insiderHolderPct: 3,
      devSoldPct: 0,
      devNetFlowUsd: 100,
      priorLaunchCount: 1,
      priorRugCount: 0,
      buySellRatio: 2,
      netBuyPressure: 0.4,
      uniqueBuyers: 30,
      uniqueSellers: 12,
      volumeVelocity: 150,
      volumeAcceleration: 20,
      buyerVelocity: 0.5,
      buyerAcceleration: 0.1,
      priceVelocity: 1,
      priceAcceleration: 0.1,
      largestTradeShare: 0.12,
      sampleCount: 12,
      insufficientMetrics: false,
      liquidityUsd: 12_000,
      marketCapUsd: 50_000,
      fdvUsd: 50_000,
      estimatedSellSlippagePct: 4,
      sniperPct: 3,
      bundlerPct: 2,
      washTradingSuspected: false,
      honeypotSuspected: false
    },
    reasonCodes: ["BASELINE_RISK"],
    humanSummary: "low risk",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createChainVerification() {
  return {
    mint,
    status: "verified" as const,
    reasonCodes: ["ON_CHAIN_MINT_VERIFIED", "ON_CHAIN_SUPPLY_VERIFIED"],
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    supplyUi: 1_000_000,
    topHolderPct: 12.5,
    top10HolderPct: 34.2,
    payload: {
      mint,
      source: "test"
    },
    inspectedAt: "2026-01-01T00:00:03.000Z",
    createdAt: "2026-01-01T00:00:03.000Z"
  };
}

function createCandidateDecision(): CandidateDecision {
  return {
    mint,
    symbol: "MOCK",
    source: "mock",
    lifecycleState: "qualified",
    action: "PAPER_BUY_READY",
    score: 88,
    riskLevel: "low",
    hardReject: false,
    riskReasonCodes: ["BASELINE_RISK"],
    scoreReasonCodes: ["STRONG_MOMENTUM"],
    combinedReasonCodes: ["PAPER_BUY_READY", "BASELINE_RISK", "STRONG_MOMENTUM"],
    metricsSummary: {
      sampleCount: 12,
      insufficientMetrics: false,
      volume10sUsd: 5_000,
      volumeVelocity: 150,
      volumeAcceleration: 20,
      buyerVelocity: 0.5,
      buyerAcceleration: 0.1,
      priceVelocity: 1,
      buySellRatio: 2,
      netBuyPressure: 0.4,
      lastUpdatedAt: "2026-01-01T00:00:00.000Z"
    },
    riskSnapshotSummary: {
      riskLevel: "low",
      riskScore: 10,
      hardReject: false,
      humanSummary: "low risk"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createSignal(): OverlaySignal {
  return {
    mint,
    symbol: "MOCK",
    score: 88,
    action: "BUY_READY",
    hardReject: false,
    reasonCodes: ["STRONG_MOMENTUM"],
    volumeVelocity: 2.1,
    buyerVelocity: 1.9,
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
    state: {
      candidate: {
        id: {
          chain: "solana",
          mint
        },
        mint,
        symbol: "MOCK",
        name: "Mock Token",
        source: "test",
        ageSeconds: 90,
        firstSeenAt: "2026-01-01T00:00:00.000Z"
      },
      metrics: {
        priceUsd: 0.00042,
        marketCapUsd: 50_000,
        liquidityUsd: 12_000,
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
        volumeVelocity: 2.1,
        buyerVelocity: 1.9
      },
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
      score: {
        total: 88,
        momentum: 82,
        quality: 79,
        riskPenalty: 0,
        hardReject: false,
        action: "BUY_READY",
        reasonCodes: ["STRONG_MOMENTUM"]
      },
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  };
}
