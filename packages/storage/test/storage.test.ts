import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FeedEvent } from "@axi/data-feeds";
import type {
  ChainTransactionEvent,
  NormalizedChainTradeEvent
} from "@axi/chain-events";
import type { MarketObservation } from "@axi/market-data";
import type {
  CandidateDecision,
  OverlaySignal,
  RiskSnapshot
} from "@axi/shared";
import { normalizePumpPortalIdentity } from "@axi/token-identity";
import {
  closeStorage,
  createReplayStream,
  getPumpPortalTokenTradeEvent,
  getTokenIdentity,
  getChainTradeEvent,
  getChainTransactionEvent,
  getLatestChainVerification,
  getLatestCandidateDecision,
  getLatestMarketObservation,
  getMarketObservation,
  getLatestRiskSnapshot,
  getLatestWatchPlan,
  getLightningTradePlan,
  listLiveFeedEvents,
  listLiveFeedEventsByMint,
  listLiveFeedEventsBySession,
  listLightningTradePlans,
  listLightningTradePlansByMint,
  listPumpPortalWalletStatusSnapshots,
  getStorageStats,
  initStorage,
  listCandidateDecisionsForReplay,
  listChainVerifications,
  listChainVerificationsForReplay,
  listChainTradeEvents,
  listChainTradeEventsForReplay,
  listChainTransactionEvents,
  listChainTransactionEventsForReplay,
  listCandidateDecisions,
  listFeedEvents,
  listMarketObservations,
  listMarketObservationsByMint,
  listMarketObservationsForReplay,
  listActualDataSessions,
  listActualDataSubscriptions,
  listActualDataSubscriptionsByMint,
  listPumpPortalTokenTradeEvents,
  listPumpPortalTokenTradeEventsByMint,
  listPumpPortalTokenTradeEventsForReplay,
  listPaperOrders,
  listPaperPositions,
  listRecentSignals,
  listRiskSnapshotsForReplay,
  listRiskSnapshots,
  listSignalsForReplay,
  listTokenIdentities,
  listTokenIdentitiesForReplay,
  listTokenMetadataFetches,
  listTokenMetadataFetchesByMint,
  listTokenMetadataFetchesForReplay,
  listUnresolvedTokenIdentities,
  listWatchActions,
  listWatchActionsByMint,
  listWatchActionsForReplay,
  listWatchPlans,
  listWatchPlansForReplay,
  saveCandidateDecision,
  saveChainVerification,
  saveChainTradeEvent,
  saveChainTransactionEvent,
  saveFeedEvent,
  saveLiveFeedEvent,
  saveLightningTradePlan,
  saveMarketObservation,
  saveActualDataSession,
  saveActualDataSubscription,
  savePaperOrder,
  savePumpPortalWalletStatusSnapshot,
  savePumpPortalTokenTradeEvent,
  saveRiskSnapshot,
  saveSignal,
  saveTokenIdentity,
  saveTokenMetadataFetch,
  saveWatchAction,
  saveWatchPlan,
  upsertTokenIdentity,
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
    expect(stats.liveFeedEventCount).toBe(0);
    expect(stats.chainVerificationCount).toBe(0);
    expect(stats.chainTransactionEventCount).toBe(0);
    expect(stats.chainTradeEventCount).toBe(0);
    expect(stats.marketObservationCount).toBe(0);
    expect(stats.watchPlanCount).toBe(0);
    expect(stats.watchActionCount).toBe(0);
    expect(stats.lightningTradePlanCount).toBe(0);
    expect(stats.pumpPortalWalletStatusSnapshotCount).toBe(0);
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

  it("chain transaction event can be saved, listed, and fetched by signature", () => {
    initStorage({ databasePath });
    const saved = saveChainTransactionEvent(createChainTransactionEvent());
    const listed = listChainTransactionEvents(10);
    const fetched = getChainTransactionEvent(saved.signature);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe("parsed");
    expect(fetched?.signature).toBe(saved.signature);
    expect(fetched?.reasonCodes).toContain("WATCHED_ADDRESS_LOG");
  });

  it("chain trade event can be saved, listed, and fetched by signature", () => {
    initStorage({ databasePath });
    const saved = saveChainTradeEvent(createChainTradeEvent());
    const listed = listChainTradeEvents(10);
    const fetched = getChainTradeEvent(saved.signature);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.side).toBe("buy");
    expect(fetched?.signature).toBe(saved.signature);
    expect(fetched?.confidence).toBe("medium");
  });

  it("market observation can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveMarketObservation(createMarketObservation());
    const listed = listMarketObservations(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
    expect(listed[0]?.quoteAsset).toBe("SOL");
  });

  it("market observations can be listed by mint", () => {
    initStorage({ databasePath });
    saveMarketObservation(createMarketObservation());
    saveMarketObservation({
      ...createMarketObservation(),
      signature:
        "OtherSignature111111111111111111111111111111111111111111111111111",
      mint: "OtherMint111111111111111111111111111111111"
    });

    const listed = listMarketObservationsByMint(mint, 10);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
  });

  it("latest market observation can be fetched by mint", () => {
    initStorage({ databasePath });
    saveMarketObservation(createMarketObservation("2026-01-01T00:00:01.000Z"));
    saveMarketObservation({
      ...createMarketObservation("2026-01-01T00:00:02.000Z"),
      signature:
        "LatestSignature111111111111111111111111111111111111111111111111"
    });

    const latest = getLatestMarketObservation(mint);

    expect(latest?.signature).toBe(
      "LatestSignature111111111111111111111111111111111111111111111111"
    );
  });

  it("market observation can be fetched by signature", () => {
    initStorage({ databasePath });
    const saved = saveMarketObservation(createMarketObservation());
    const fetched = getMarketObservation(saved.signature);

    expect(fetched?.signature).toBe(saved.signature);
    expect(fetched?.usableForMetrics).toBe(true);
  });

  it("market observation preserves null price and volume fields", () => {
    initStorage({ databasePath });
    saveMarketObservation({
      ...createMarketObservation(),
      priceQuote: null,
      priceSol: null,
      priceUsd: null,
      volumeQuote: null,
      volumeSol: null,
      volumeUsd: null,
      usableForMetrics: false,
      reasonCodes: ["MARKET_OBSERVATION_UNUSABLE"]
    });

    const listed = listMarketObservations(10);

    expect(listed[0]?.priceUsd).toBeNull();
    expect(listed[0]?.volumeSol).toBeNull();
    expect(listed[0]?.usableForMetrics).toBe(false);
  });

  it("pumpportal token trade event can be saved, listed, and fetched by signature", () => {
    initStorage({ databasePath });
    const saved = savePumpPortalTokenTradeEvent(createPumpPortalTradeEvent());
    const listed = listPumpPortalTokenTradeEvents(10);
    const fetched = getPumpPortalTokenTradeEvent("pumpportal-signature-1");

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
    expect(fetched?.signature).toBe("pumpportal-signature-1");
    expect(fetched?.usableForMetrics).toBe(true);
  });

  it("pumpportal token trade events can be listed by mint", () => {
    initStorage({ databasePath });
    savePumpPortalTokenTradeEvent(createPumpPortalTradeEvent());
    savePumpPortalTokenTradeEvent({
      ...createPumpPortalTradeEvent(),
      mint: "So11111111111111111111111111111111111111112",
      signature: "pumpportal-signature-2"
    });

    const listed = listPumpPortalTokenTradeEventsByMint(mint, 10);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
  });

  it("pumpportal token trade event preserves null price fields", () => {
    initStorage({ databasePath });
    savePumpPortalTokenTradeEvent({
      ...createPumpPortalTradeEvent(),
      priceSol: null,
      volumeSol: null,
      usableForMetrics: false,
      reasonCodes: ["PUMPPORTAL_TRADE_UNUSABLE_FOR_METRICS"]
    });

    const listed = listPumpPortalTokenTradeEvents(10);

    expect(listed[0]?.priceSol).toBeNull();
    expect(listed[0]?.volumeSol).toBeNull();
    expect(listed[0]?.usableForMetrics).toBe(false);
  });

  it("live feed event can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveLiveFeedEvent(createLiveFeedEvent());
    const listed = listLiveFeedEvents(10);
    const bySession = listLiveFeedEventsBySession("test-session", 10);
    const byMint = listLiveFeedEventsByMint(mint, 10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(bySession).toHaveLength(1);
    expect(byMint).toHaveLength(1);
    expect(listed[0]?.sessionId).toBe("test-session");
    expect(listed[0]?.provider).toBe("pumpportal");
    expect(listed[0]?.eventType).toBe("new_token");
    expect(listed[0]?.realData).toBe(true);
    expect(listed[0]?.reasonCodes).toContain("LIVE_FEED_EVENT");
  });

  it("actual data subscription can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveActualDataSubscription(createActualDataSubscription());
    const listed = listActualDataSubscriptions(10);
    const byMint = listActualDataSubscriptionsByMint(mint, 10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(byMint[0]?.status).toBe("subscribed");
    expect(byMint[0]?.reasonCodes).toContain("PUMPPORTAL_TRADE_SUBSCRIBED");
  });

  it("actual data session can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveActualDataSession(createActualDataSession());
    const listed = listActualDataSessions(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.provider).toBe("pumpportal");
    expect(listed[0]?.budgetEventLimit).toBe(5000);
  });

  it("token identity can be saved, listed, and fetched by mint", () => {
    initStorage({ databasePath });
    const saved = saveTokenIdentity(createTokenIdentity());
    const listed = listTokenIdentities(10);
    const fetched = getTokenIdentity(mint);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(fetched?.mint).toBe(mint);
    expect(fetched?.title).toBe("MOCK - Mock Token");
    expect(fetched?.reasonCodes).toContain("IDENTITY_FROM_PUMPPORTAL");
  });

  it("token identity can be upserted", () => {
    initStorage({ databasePath });
    upsertTokenIdentity(createTokenIdentity());
    upsertTokenIdentity({
      ...createTokenIdentity(),
      name: "Updated Token",
      title: "MOCK - Updated Token",
      displayName: "MOCK Updated Token",
      updatedAt: "2026-01-01T00:00:09.000Z"
    });

    const fetched = getTokenIdentity(mint);

    expect(listTokenIdentities(10)).toHaveLength(1);
    expect(fetched?.name).toBe("Updated Token");
    expect(fetched?.updatedAt).toBe("2026-01-01T00:00:09.000Z");
  });

  it("unresolved token identities can be listed", () => {
    initStorage({ databasePath });
    saveTokenIdentity({
      ...createTokenIdentity(),
      name: null,
      symbol: null,
      title: "MockMi...1111",
      displayName: "MockMi...1111",
      confidence: "none",
      completenessScore: 0,
      reasonCodes: ["IDENTITY_UNRESOLVED"]
    });

    const unresolved = listUnresolvedTokenIdentities(10);

    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.mint).toBe(mint);
  });

  it("token metadata fetch can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveTokenMetadataFetch(createTokenMetadataFetch());
    const listed = listTokenMetadataFetches(10);
    const byMint = listTokenMetadataFetchesByMint(mint, 10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(byMint[0]?.uri).toBe("https://example.test/meta.json");
    expect(byMint[0]?.reasonCodes).toContain("IDENTITY_FROM_OFFCHAIN_METADATA");
  });

  it("watch plan can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveWatchPlan(createWatchPlanFixture());
    const listed = listWatchPlans(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
    expect(listed[0]?.watchTargets[0]?.kind).toBe("mint");
  });

  it("latest watch plan can be fetched by mint", () => {
    initStorage({ databasePath });
    saveWatchPlan(createWatchPlanFixture("2026-01-01T00:00:07.000Z"));
    saveWatchPlan(createWatchPlanFixture("2026-01-01T00:00:08.000Z"));

    const latest = getLatestWatchPlan(mint);

    expect(latest?.createdAt).toBe("2026-01-01T00:00:08.000Z");
  });

  it("watch action can be saved and listed", () => {
    initStorage({ databasePath });
    const saved = saveWatchAction(createWatchActionFixture());
    const listed = listWatchActions(10);

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.action).toBe("verify_mint");
  });

  it("watch actions can be listed by mint", () => {
    initStorage({ databasePath });
    saveWatchAction(createWatchActionFixture());
    saveWatchAction({
      ...createWatchActionFixture(),
      mint: "OtherMint111111111111111111111111111111111",
      address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    });

    const listed = listWatchActionsByMint(mint, 10);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.mint).toBe(mint);
  });

  it("lightning trade plans can be saved, listed, and fetched by plan id", () => {
    initStorage({ databasePath });
    const saved = saveLightningTradePlan({
      planId: "plan-1",
      mint,
      action: "buy",
      amountSol: 0.001,
      mode: "dry_run",
      blocked: false,
      blockers: [],
      warnings: ["LIGHTNING_LIVE_TRADING_DISABLED"],
      request: {
        action: "buy",
        mint,
        amount: 0.001,
        apiKey: "api-key-value"
      },
      payload: {
        privateKey: "private-key-value",
        note: "dry run"
      },
      createdAt: "2026-01-01T00:00:09.000Z"
    });
    saveLightningTradePlan({
      planId: "plan-2",
      mint: "So11111111111111111111111111111111111111112",
      action: "buy",
      amountSol: 0.002,
      mode: "dry_run",
      blocked: true,
      blockers: ["LIGHTNING_AMOUNT_EXCEEDS_MAX_BUY"],
      warnings: [],
      request: {},
      payload: {},
      createdAt: "2026-01-01T00:00:10.000Z"
    });

    const listed = listLightningTradePlans(10);
    const byMint = listLightningTradePlansByMint(mint, 10);
    const fetched = getLightningTradePlan("plan-1");
    const serialized = JSON.stringify(fetched).toLowerCase();

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(2);
    expect(byMint).toHaveLength(1);
    expect(fetched?.planId).toBe("plan-1");
    expect(serialized).not.toContain("api-key-value");
    expect(serialized).not.toContain("private-key-value");
    expect(serialized).toContain("[redacted]");
  });

  it("pumpportal wallet status snapshots can be saved and listed without secrets", () => {
    initStorage({ databasePath });
    const saved = savePumpPortalWalletStatusSnapshot({
      dataWalletPublicKey: "So11111111111111111111111111111111111111112",
      tradingWalletPublicKey: "11111111111111111111111111111111",
      sameWallet: false,
      dataWalletBalanceSol: 0.05,
      tradingWalletBalanceSol: 0.03,
      dataWalletStatus: "ok",
      tradingWalletStatus: "low",
      reasonCodes: ["LIGHTNING_LIVE_TRADING_DISABLED"],
      payload: {
        apiKey: "api-key-value",
        privateKey: "private-key-value",
        publicOnly: true
      },
      createdAt: "2026-01-01T00:00:11.000Z"
    });

    const listed = listPumpPortalWalletStatusSnapshots(10);
    const serialized = JSON.stringify(listed).toLowerCase();

    expect(saved.id).toBeGreaterThan(0);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.sameWallet).toBe(false);
    expect(listed[0]?.dataWalletBalanceSol).toBe(0.05);
    expect(serialized).not.toContain("api-key-value");
    expect(serialized).not.toContain("private-key-value");
  });

  it("storage stats return counts", () => {
    initStorage({ databasePath });
    saveChainVerification(createChainVerification());
    saveChainTransactionEvent(createChainTransactionEvent());
    saveChainTradeEvent(createChainTradeEvent());
    saveMarketObservation(createMarketObservation());
    savePumpPortalTokenTradeEvent(createPumpPortalTradeEvent());
    saveActualDataSubscription(createActualDataSubscription());
    saveActualDataSession(createActualDataSession());
    saveTokenIdentity(createTokenIdentity());
    saveTokenMetadataFetch(createTokenMetadataFetch());
    saveWatchPlan(createWatchPlanFixture());
    saveWatchAction(createWatchActionFixture());
    saveLightningTradePlan({
      planId: "stats-plan",
      mint,
      action: "buy",
      amountSol: 0.001,
      mode: "dry_run",
      blocked: false,
      blockers: [],
      warnings: [],
      request: {},
      payload: {}
    });
    savePumpPortalWalletStatusSnapshot({
      dataWalletPublicKey: "So11111111111111111111111111111111111111112",
      tradingWalletPublicKey: "11111111111111111111111111111111",
      sameWallet: false,
      dataWalletBalanceSol: 0.05,
      tradingWalletBalanceSol: 0.03,
      dataWalletStatus: "ok",
      tradingWalletStatus: "low",
      reasonCodes: ["LIGHTNING_LIVE_TRADING_DISABLED"],
      payload: {}
    });
    saveFeedEvent(createFeedEvent());
    saveLiveFeedEvent(createLiveFeedEvent());
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
    expect(stats.liveFeedEventCount).toBe(1);
    expect(stats.signalCount).toBe(1);
    expect(stats.chainVerificationCount).toBe(1);
    expect(stats.chainTransactionEventCount).toBe(1);
    expect(stats.chainTradeEventCount).toBe(1);
    expect(stats.marketObservationCount).toBe(1);
    expect(stats.pumpPortalTokenTradeEventCount).toBe(1);
    expect(stats.actualDataSubscriptionCount).toBe(1);
    expect(stats.actualDataSessionCount).toBe(1);
    expect(stats.tokenIdentityCount).toBe(1);
    expect(stats.tokenIdentityResolvedCount).toBe(1);
    expect(stats.tokenIdentityUnresolvedCount).toBe(0);
    expect(stats.tokenMetadataFetchCount).toBe(1);
    expect(stats.watchPlanCount).toBe(1);
    expect(stats.watchActionCount).toBe(1);
    expect(stats.lightningTradePlanCount).toBe(1);
    expect(stats.pumpPortalWalletStatusSnapshotCount).toBe(1);
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
    const chainTransactionEvent = saveChainTransactionEvent(
      createChainTransactionEvent()
    );
    const chainTradeEvent = saveChainTradeEvent(createChainTradeEvent());
    const marketObservation = saveMarketObservation(createMarketObservation());
    const pumpPortalTrade = savePumpPortalTokenTradeEvent(
      createPumpPortalTradeEvent()
    );
    const actualDataSubscription = saveActualDataSubscription(
      createActualDataSubscription()
    );
    const actualDataSession = saveActualDataSession(createActualDataSession());
    const tokenIdentity = saveTokenIdentity(createTokenIdentity());
    const tokenMetadataFetch = saveTokenMetadataFetch(
      createTokenMetadataFetch()
    );
    const watchPlan = saveWatchPlan(createWatchPlanFixture());
    const watchAction = saveWatchAction(createWatchActionFixture());
    const riskSnapshots = listRiskSnapshotsForReplay(10);
    const candidateDecisions = listCandidateDecisionsForReplay(10);
    const chainVerifications = listChainVerificationsForReplay(10);
    const chainTransactionEvents = listChainTransactionEventsForReplay(10);
    const chainTradeEvents = listChainTradeEventsForReplay(10);
    const marketObservations = listMarketObservationsForReplay(10);
    const pumpPortalTrades = listPumpPortalTokenTradeEventsForReplay(10);
    const tokenIdentities = listTokenIdentitiesForReplay(10);
    const tokenMetadataFetches = listTokenMetadataFetchesForReplay(10);
    const watchPlans = listWatchPlansForReplay(10);
    const watchActions = listWatchActionsForReplay(10);
    const replayItems = [];
    const riskReplayItems = [];
    const candidateReplayItems = [];
    const chainReplayItems = [];
    const chainTransactionReplayItems = [];
    const chainTradeReplayItems = [];
    const marketReplayItems = [];
    const pumpPortalTradeReplayItems = [];
    const actualDataSubscriptionReplayItems = [];
    const actualDataSessionReplayItems = [];
    const tokenIdentityReplayItems = [];
    const tokenMetadataFetchReplayItems = [];
    const watchPlanReplayItems = [];
    const watchActionReplayItems = [];

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

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "chain_transaction_events"
    })) {
      chainTransactionReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "chain_trade_events"
    })) {
      chainTradeReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "market_observations"
    })) {
      marketReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "pumpportal_token_trade_events"
    })) {
      pumpPortalTradeReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "actual_data_subscriptions"
    })) {
      actualDataSubscriptionReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "actual_data_sessions"
    })) {
      actualDataSessionReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "token_identities"
    })) {
      tokenIdentityReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "token_metadata_fetches"
    })) {
      tokenMetadataFetchReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "watch_plans"
    })) {
      watchPlanReplayItems.push(item);
    }

    for await (const item of createReplayStream({
      limit: 10,
      speed: 0,
      type: "watch_actions"
    })) {
      watchActionReplayItems.push(item);
    }

    expect(feedEvents.map((event) => event.createdAt)).toEqual([
      "2026-01-01T00:00:01.000Z",
      "2026-01-01T00:00:02.000Z"
    ]);
    expect(signals).toHaveLength(1);
    expect(riskSnapshots[0]?.id).toBe(riskSnapshot.id);
    expect(candidateDecisions[0]?.id).toBe(candidateDecision.id);
    expect(chainVerifications[0]?.id).toBe(chainVerification.id);
    expect(chainTransactionEvents[0]?.id).toBe(chainTransactionEvent.id);
    expect(chainTradeEvents[0]?.id).toBe(chainTradeEvent.id);
    expect(marketObservations[0]?.id).toBe(marketObservation.id);
    expect(pumpPortalTrades[0]?.id).toBe(pumpPortalTrade.id);
    expect(tokenIdentities[0]?.id).toBe(tokenIdentity.id);
    expect(tokenMetadataFetches[0]?.id).toBe(tokenMetadataFetch.id);
    expect(actualDataSubscription.id).toBeGreaterThan(0);
    expect(actualDataSession.id).toBeGreaterThan(0);
    expect(tokenIdentity.id).toBeGreaterThan(0);
    expect(tokenMetadataFetch.id).toBeGreaterThan(0);
    expect(watchPlans[0]?.id).toBe(watchPlan.id);
    expect(watchActions[0]?.id).toBe(watchAction.id);
    expect(replayItems).toHaveLength(2);
    expect(replayItems[0]?.source).toBe("feed_events");
    expect(riskReplayItems[0]?.source).toBe("risk_snapshots");
    expect(candidateReplayItems[0]?.source).toBe("candidate_decisions");
    expect(chainReplayItems[0]?.source).toBe("chain_verifications");
    expect(chainTransactionReplayItems[0]?.source).toBe(
      "chain_transaction_events"
    );
    expect(chainTradeReplayItems[0]?.source).toBe("chain_trade_events");
    expect(marketReplayItems[0]?.source).toBe("market_observations");
    expect(pumpPortalTradeReplayItems[0]?.source).toBe(
      "pumpportal_token_trade_events"
    );
    expect(actualDataSubscriptionReplayItems[0]?.source).toBe(
      "actual_data_subscriptions"
    );
    expect(actualDataSessionReplayItems[0]?.source).toBe(
      "actual_data_sessions"
    );
    expect(tokenIdentityReplayItems[0]?.source).toBe("token_identities");
    expect(tokenMetadataFetchReplayItems[0]?.source).toBe(
      "token_metadata_fetches"
    );
    expect(watchPlanReplayItems[0]?.source).toBe("watch_plans");
    expect(watchActionReplayItems[0]?.source).toBe("watch_actions");
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

function createChainTransactionEvent(): ChainTransactionEvent {
  return {
    type: "chain_transaction",
    source: "solana_rpc",
    signature:
      "5NfL6eiYVQhnL5rtZJkR2Jqg7YbNLsC6Gc8a5YVwWnSb1E4qMvERqE1mUu3PF4aZ75xMwHj7pFaGgQ8z7R5dHnNU",
    slot: 123,
    blockTime: 1_767_225_600,
    watchedAddress: "11111111111111111111111111111111",
    watchedAddressKind: "wallet",
    mint,
    status: "parsed",
    reasonCodes: [
      "WATCHED_ADDRESS_LOG",
      "TRANSACTION_FETCHED",
      "TOKEN_BALANCE_CHANGES_FOUND"
    ],
    raw: {
      source: "test"
    },
    receivedAt: "2026-01-01T00:00:04.000Z"
  };
}

function createChainTradeEvent(): NormalizedChainTradeEvent {
  return {
    type: "trade",
    source: "solana_rpc",
    mint,
    symbol: "MOCK",
    side: "buy",
    priceUsd: null,
    volumeUsd: null,
    tokenAmount: 42,
    trader: "11111111111111111111111111111111",
    signature:
      "5NfL6eiYVQhnL5rtZJkR2Jqg7YbNLsC6Gc8a5YVwWnSb1E4qMvERqE1mUu3PF4aZ75xMwHj7pFaGgQ8z7R5dHnNU",
    slot: 123,
    timestamp: "2026-01-01T00:00:05.000Z",
    watchedAddress: "11111111111111111111111111111111",
    confidence: "medium",
    reasonCodes: [
      "CHAIN_TRADE_EVENT",
      "POSSIBLE_TOKEN_BUY",
      "INSUFFICIENT_PRICE_DATA"
    ],
    raw: {
      source: "test"
    }
  };
}

function createMarketObservation(
  createdAt = "2026-01-01T00:00:06.000Z"
): MarketObservation {
  return {
    type: "market_observation",
    source: "solana_rpc",
    mint,
    symbol: "MOCK",
    signature:
      "5NfL6eiYVQhnL5rtZJkR2Jqg7YbNLsC6Gc8a5YVwWnSb1E4qMvERqE1mUu3PF4aZ75xMwHj7pFaGgQ8z7R5dHnNU",
    slot: 123,
    timestamp: createdAt,
    watchedAddress: "11111111111111111111111111111111",
    watchedAddressKind: "wallet",
    perspective: "wallet",
    side: "buy",
    baseTokenAmount: 42,
    quoteAsset: "SOL",
    quoteMint: null,
    quoteAmount: 1.5,
    priceQuote: 0.035714285714,
    priceSol: 0.035714285714,
    priceUsd: null,
    volumeQuote: 1.5,
    volumeSol: 1.5,
    volumeUsd: null,
    confidence: "medium",
    usableForMetrics: true,
    reasonCodes: [
      "MARKET_OBSERVATION_CREATED",
      "QUOTE_ASSET_SOL",
      "MARKET_OBSERVATION_USABLE"
    ],
    raw: {
      source: "test"
    },
    createdAt
  };
}

function createPumpPortalTradeEvent() {
  return {
    mint,
    signature: "pumpportal-signature-1",
    side: "buy" as const,
    trader: "11111111111111111111111111111111",
    priceSol: 0.02,
    volumeSol: 1.5,
    tokenAmount: 75,
    confidence: "high" as const,
    usableForMetrics: true,
    reasonCodes: [
      "PUMPPORTAL_TOKEN_TRADE",
      "PUMPPORTAL_TRADE_USABLE_FOR_METRICS"
    ],
    payload: {
      type: "trade",
      source: "pumpportal",
      mint
    },
    createdAt: "2026-01-01T00:00:06.500Z"
  };
}

function createLiveFeedEvent() {
  return {
    sessionId: "test-session",
    provider: "pumpportal",
    eventType: "new_token",
    mint,
    name: "Mock Token",
    symbol: "MOCK",
    title: "MOCK - Mock Token",
    realData: true,
    reasonCodes: ["LIVE_FEED_EVENT", "REAL_FEED_NEW_TOKEN_EVENT"],
    payload: {
      type: "token_created",
      source: "pumpportal",
      mint
    },
    createdAt: "2026-01-01T00:00:06.750Z"
  };
}

function createActualDataSubscription() {
  return {
    mint,
    provider: "pumpportal",
    status: "subscribed",
    reason: "manual",
    eventCount: 2,
    maxEvents: 1000,
    subscribedAt: "2026-01-01T00:00:06.500Z",
    unsubscribedAt: null,
    reasonCodes: [
      "PUMPPORTAL_TRADE_STREAM_METERED",
      "PUMPPORTAL_TRADE_SUBSCRIBED"
    ],
    payload: {
      mint,
      status: "subscribed"
    },
    createdAt: "2026-01-01T00:00:06.500Z"
  };
}

function createActualDataSession() {
  return {
    provider: "pumpportal",
    status: "running",
    totalEventCount: 2,
    subscribedTokenCount: 1,
    budgetEventLimit: 5000,
    startedAt: "2026-01-01T00:00:06.000Z",
    stoppedAt: null,
    reasonCodes: ["PUMPPORTAL_TRADE_STREAM_METERED", "PAPER_ONLY"],
    payload: {
      status: "running"
    },
    createdAt: "2026-01-01T00:00:06.000Z"
  };
}

function createTokenIdentity() {
  return {
    ...normalizePumpPortalIdentity({
      image: "https://example.test/mock.png",
      metadataUri: "https://example.test/meta.json",
      mint,
      name: "Mock Token",
      symbol: "MOCK"
    }),
    firstSeenAt: "2026-01-01T00:00:06.700Z",
    updatedAt: "2026-01-01T00:00:06.700Z"
  };
}

function createTokenMetadataFetch() {
  return {
    mint,
    uri: "https://example.test/meta.json",
    source: "offchain_metadata",
    status: "success",
    reasonCodes: ["IDENTITY_FROM_OFFCHAIN_METADATA"],
    payload: {
      name: "Mock Token",
      symbol: "MOCK"
    },
    fetchedAt: "2026-01-01T00:00:06.800Z",
    createdAt: "2026-01-01T00:00:06.800Z"
  };
}

function createWatchPlanFixture(createdAt = "2026-01-01T00:00:07.000Z") {
  const target = {
    address: "11111111111111111111111111111111",
    kind: "mint" as const,
    mint,
    symbol: "MOCK",
    source: "pumpportal" as const,
    confidence: "medium" as const,
    reasonCodes: [
      "WATCH_TARGET_MINT",
      "WATCH_TARGET_MEDIUM_CONFIDENCE",
      "WATCH_TARGET_SELECTED"
    ],
    createdAt
  };

  return {
    mint,
    symbol: "MOCK",
    source: "pumpportal" as const,
    shouldVerifyMint: true,
    shouldWatchEvents: true,
    watchTargets: [target],
    skippedTargets: [],
    reasonCodes: [
      "WATCH_PLAN_CREATED",
      "VERIFY_ON_NEW_TOKEN",
      "WATCH_ON_NEW_TOKEN"
    ],
    payload: {
      source: "test"
    },
    createdAt
  };
}

function createWatchActionFixture(createdAt = "2026-01-01T00:00:08.000Z") {
  return {
    mint,
    action: "verify_mint",
    address: "11111111111111111111111111111111",
    addressKind: "mint" as const,
    status: "scheduled",
    reasonCodes: ["ORCHESTRATION_VERIFICATION_SCHEDULED"],
    payload: {
      source: "test"
    },
    createdAt
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
    combinedReasonCodes: [
      "PAPER_BUY_READY",
      "BASELINE_RISK",
      "STRONG_MOMENTUM"
    ],
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
