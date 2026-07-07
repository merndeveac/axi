import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PumpPortalFeedProvider, type TokenTradeEvent } from "@axi/data-feeds";
import { simulateLaunchMomentumFixture } from "@axi/launch-momentum";
import { closeStorage, initStorage } from "@axi/storage";
import {
  createActualDataConfig,
  createActualDataService,
  type ActualDataDataWalletReadiness
} from "../src/actual-data-service";
import type { LaunchCandidateView } from "../src/launch-scanner-service";
import {
  MeteredLaunchDataServiceError,
  createMeteredLaunchDataService
} from "../src/metered-launch-data-service";

const mint = "So11111111111111111111111111111111111111112";
const secondMint = "11111111111111111111111111111111";

let testDirectory: string;
let databasePath: string;

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-metered-launch-"));
  databasePath = join(testDirectory, "axi.sqlite");
  initStorage({ databasePath });
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("MeteredLaunchDataService", () => {
  it("is disabled by default", () => {
    const service = createService();

    expect(service.getStatus().enabled).toBe(false);
    expect(service.getReasonCodes()).toContain("METERED_LAUNCH_DATA_DISABLED");
  });

  it("blocks tracking without cost acknowledgement", () => {
    const service = createService({
      enabled: true,
      acknowledgedCost: false,
      apiKeyConfigured: true,
      dataWalletPublicKeyConfigured: true
    });

    expect(() => service.trackMint(mint, "manual")).toThrow(
      MeteredLaunchDataServiceError
    );
    expect(service.getStatus().reasonCodes).toContain(
      "METERED_LAUNCH_DATA_ACK_MISSING"
    );
  });

  it("blocks tracking without a data API key", () => {
    const service = createService({
      enabled: true,
      acknowledgedCost: true,
      apiKeyConfigured: false,
      dataWalletPublicKeyConfigured: true
    });

    expect(service.getStatus().reasonCodes).toContain(
      "METERED_LAUNCH_DATA_API_KEY_MISSING"
    );
  });

  it("blocks tracking when a known wallet balance is below minimum", () => {
    const service = createService(
      {
        enabled: true,
        acknowledgedCost: true,
        apiKeyConfigured: true,
        dataWalletPublicKeyConfigured: true
      },
      {
        ...readyWallet,
        balanceSol: 0.005,
        balanceStatus: "critical",
        reasonCodes: ["DATA_WALLET_BALANCE_CRITICAL"],
        subscriptionBlockers: [
          "DATA_WALLET_FUNDS_REQUIRED_FOR_METERED_STREAM",
          "DATA_WALLET_BALANCE_BELOW_MINIMUM"
        ]
      }
    );

    expect(service.getStatus().reasonCodes).toContain(
      "METERED_LAUNCH_DATA_WALLET_LOW"
    );
  });

  it("accepts manual tracking with mocked gates", () => {
    const provider = new PumpPortalFeedProvider();
    const service = createService(
      {
        acknowledgedCost: true,
        apiKeyConfigured: true,
        dataWalletPublicKeyConfigured: true,
        enabled: true
      },
      readyWallet,
      provider
    );

    const tracking = service.trackMint(mint, "manual");

    expect(tracking.status).toBe("tracking");
    expect(service.getTrackedMints()).toEqual([mint]);
    expect(provider.getTokenTradeSubscriptions()).toEqual([mint]);
    expect(provider.getAccountTradeSubscriptions()).toEqual([]);
  });

  it("arms with a session ACK but waits for runtime start before tracking", () => {
    const provider = new PumpPortalFeedProvider();
    const service = createService(
      {
        acknowledgedCost: false,
        apiKeyConfigured: true,
        dataWalletPublicKeyConfigured: true,
        enabled: true
      },
      readyWallet,
      provider
    );

    const armed = service.acknowledgeSession({
      ackCost: true,
      maxConcurrentMints: 2,
      maxEventsPerSession: 100,
      maxSessionCostSol: 0.001
    });

    expect(armed.ackSource).toBe("session");
    expect(armed.active).toBe(false);
    expect(armed.canStart).toBe(true);
    expect(() => service.trackMint(mint, "manual")).toThrow(
      MeteredLaunchDataServiceError
    );

    service.start();
    expect(service.trackMint(mint, "manual").status).toBe("tracking");
    expect(provider.getTokenTradeSubscriptions()).toEqual([mint]);
  });

  it("rejects session ACK caps above the UI ceiling", () => {
    const service = createService({
      acknowledgedCost: false,
      apiKeyConfigured: true,
      dataWalletPublicKeyConfigured: true,
      enabled: true,
      maxSessionCostSol: 0.01,
      maxUiSessionCostSol: 0.005
    });

    expect(() =>
      service.acknowledgeSession({
        ackCost: true,
        maxConcurrentMints: 2,
        maxEventsPerSession: 100,
        maxSessionCostSol: 0.006
      })
    ).toThrow("Requested session cost cap exceeds the UI session ceiling.");
  });

  it("selects newest launch candidates when gates are ready", () => {
    const service = createService({
      acknowledgedCost: true,
      apiKeyConfigured: true,
      dataWalletPublicKeyConfigured: true,
      enabled: true,
      mode: "newest"
    });

    const decision = service.evaluateNewLaunchCandidate(
      createLaunchCandidate()
    );

    expect(decision.action).toBe("track");
    expect(decision.tracked).toBe(true);
    expect(service.getTrackedMints()).toEqual([mint]);

    service.untrackMint(mint, "test_cleanup");
  });

  it("enforces max concurrent metered mints", () => {
    const service = createService({
      acknowledgedCost: true,
      apiKeyConfigured: true,
      dataWalletPublicKeyConfigured: true,
      enabled: true,
      maxConcurrentMints: 1
    });

    service.trackMint(mint, "manual");

    expect(() => service.trackMint(secondMint, "manual")).toThrow(
      MeteredLaunchDataServiceError
    );
    expect(service.getStatus().reasonCodes).toContain(
      "METERED_LAUNCH_DATA_MAX_CONCURRENT_REACHED"
    );
  });

  it("untracks when the per-mint event cap is reached", () => {
    const service = createService({
      acknowledgedCost: true,
      apiKeyConfigured: true,
      dataWalletPublicKeyConfigured: true,
      enabled: true,
      maxEventsPerMint: 1
    });

    service.trackMint(mint, "manual");
    service.handlePumpPortalTokenTrade(createTokenTradeEvent());

    expect(service.getTrackedMint(mint)?.status).toBe("unsubscribed");
    expect(service.getTrackedMints()).toEqual([]);
    expect(service.getTrackedMint(mint)?.reasonCodes).toContain(
      "METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT"
    );
  });

  it("untracks all mints when the session cost cap is reached", () => {
    const service = createService({
      acknowledgedCost: true,
      apiKeyConfigured: true,
      dataWalletPublicKeyConfigured: true,
      enabled: true,
      maxSessionCostSol: 0.000001
    });

    service.trackMint(mint, "manual");
    service.handlePumpPortalTokenTrade(createTokenTradeEvent());

    expect(service.getStatus().budgetReached).toBe(true);
    expect(service.getTrackedMints()).toEqual([]);
    expect(service.getStatus().reasonCodes).toContain(
      "METERED_LAUNCH_DATA_COST_CAP_REACHED"
    );
  });

  it("auto-unsubscribes hard rejected launch candidates", () => {
    const service = createService(
      {
        acknowledgedCost: true,
        apiKeyConfigured: true,
        dataWalletPublicKeyConfigured: true,
        enabled: true,
        initialTrackMs: 0
      },
      readyWallet,
      new PumpPortalFeedProvider(),
      createLaunchCandidate({
        blockers: ["HARD_REJECT"],
        phase: "rejected",
        score: 5
      })
    );

    service.trackMint(mint, "manual");

    expect(service.getTrackedMint(mint)?.status).toBe("unsubscribed");
    expect(service.getTrackedMint(mint)?.reasonCodes).toContain(
      "METERED_LAUNCH_DATA_AUTO_HARD_REJECT"
    );
  });

  it("auto-unsubscribes low-score launch candidates after the initial window", () => {
    const service = createService(
      {
        acknowledgedCost: true,
        apiKeyConfigured: true,
        dataWalletPublicKeyConfigured: true,
        enabled: true,
        initialTrackMs: 0,
        minScoreToExtend: 45
      },
      readyWallet,
      new PumpPortalFeedProvider(),
      createLaunchCandidate({
        phase: "watching",
        score: 10
      })
    );

    service.trackMint(mint, "manual");

    expect(service.getTrackedMint(mint)?.status).toBe("unsubscribed");
    expect(service.getTrackedMint(mint)?.reasonCodes).toContain(
      "METERED_LAUNCH_DATA_INITIAL_LOW_SCORE"
    );
  });

  it("extends tracking for hot launch candidates after the initial window", () => {
    const service = createService(
      {
        acknowledgedCost: true,
        apiKeyConfigured: true,
        dataWalletPublicKeyConfigured: true,
        enabled: true,
        extendedTrackMs: 900_000,
        initialTrackMs: 0,
        minScoreToExtend: 45
      },
      readyWallet,
      new PumpPortalFeedProvider(),
      createLaunchCandidate({
        phase: "hot",
        score: 70
      })
    );

    service.trackMint(mint, "manual");

    expect(service.getTrackedMint(mint)?.status).toBe("tracking");
    expect(service.getTrackedMint(mint)?.extendedReviewAt).toBeTruthy();
  });

  it("updates cost counters from PumpPortal token-trade events", () => {
    const service = createService({
      acknowledgedCost: true,
      apiKeyConfigured: true,
      dataWalletPublicKeyConfigured: true,
      enabled: true
    });

    service.trackMint(mint, "manual");
    service.handlePumpPortalTokenTrade(createTokenTradeEvent());

    const tracked = service.getTrackedMint(mint);
    const cost = service.getSessionCost();

    expect(tracked?.eventCount).toBe(1);
    expect(cost.totalEventsThisSession).toBe(1);
    expect(cost.estimatedCostSol).toBe(0.000001);
    expect(service.getRecentTradeEvents()).toHaveLength(1);
  });
});

function createService(
  config: Parameters<typeof createMeteredLaunchDataService>[0]["config"] = {},
  readiness: ActualDataDataWalletReadiness = readyWallet,
  provider = new PumpPortalFeedProvider(),
  candidate: LaunchCandidateView | null = null
) {
  const envAckEnabled = config?.acknowledgedCost === true;
  const actualData = createActualDataService({
    config: createActualDataConfig({
      acknowledgedMetered: true,
      apiKeyConfigured: true,
      enabled: true,
      maxEventsPerMint: 250,
      maxEventsPerSession: 1000,
      maxSubscribedTokens: 3
    }),
    dataWalletReadiness: () => readiness,
    providerName: "pumpportal",
    pumpPortalProvider: provider
  });

  return createMeteredLaunchDataService({
    actualData,
    config: {
      ...(envAckEnabled
        ? {
            requireUiAck: false,
            startActive: true
          }
        : {}),
      ...config
    },
    dataWalletReadiness: () => readiness,
    getLaunchCandidate: () => candidate,
    providerName: "pumpportal"
  });
}

const readyWallet: ActualDataDataWalletReadiness = {
  balanceSol: 0.05,
  balanceStatus: "ok",
  configured: true,
  estimatedEventsRemaining: 50_000,
  reasonCodes: ["DATA_WALLET_READY"],
  subscriptionBlockers: []
};

function createTokenTradeEvent(eventMint = mint): TokenTradeEvent {
  return {
    type: "trade",
    source: "pumpportal",
    token: {
      chain: "solana",
      mint: eventMint
    },
    mint: eventMint,
    side: "buy",
    priceUsd: null,
    volumeUsd: null,
    priceSol: 0.02,
    volumeSol: 1,
    tokenAmount: 50,
    trader: "11111111111111111111111111111111",
    signature: "metered-launch-service-signature",
    usableForMetrics: true,
    confidence: "high",
    metrics: {} as TokenTradeEvent["metrics"],
    riskFlags: {} as TokenTradeEvent["riskFlags"],
    reasonCodes: ["PUMPPORTAL_TOKEN_TRADE"],
    timestamp: "2026-01-01T00:00:08.000Z"
  };
}

function createLaunchCandidate(
  options: {
    blockers?: string[];
    mint?: string;
    phase?: LaunchCandidateView["snapshot"]["phase"];
    score?: number;
  } = {}
): LaunchCandidateView {
  const candidateMint = options.mint ?? mint;
  const snapshot = simulateLaunchMomentumFixture("strong-ripper");

  return {
    mint: candidateMint,
    source: "pumpportal",
    eventType: "token_created",
    name: "Mock Launch",
    symbol: "MOCK",
    title: "MOCK Mock Launch",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    latestEventAt: "2026-01-01T00:00:05.000Z",
    snapshot: {
      ...snapshot,
      mint: candidateMint,
      score: options.score ?? snapshot.score,
      phase: options.phase ?? snapshot.phase,
      blockers: options.blockers ?? []
    },
    tracking: {
      eventCount: 0,
      latestTradeAt: null,
      reasonCodes: [],
      state: "not_tracked",
      subscription: null
    },
    reasonCodes: ["LAUNCH_DISCOVERED"],
    paperOnly: true,
    tradingDisabled: true
  };
}
