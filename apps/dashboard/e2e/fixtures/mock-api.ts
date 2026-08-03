import type {
  MomentumScannerSummaryV2,
  ScannerSnapshotV2,
  ScannerStreamMessageV2,
  StrategyStatus
} from "@axi/shared";
import type { Page, Route, WebSocketRoute } from "@playwright/test";
import { goldenScannerRows } from "../../src/v2/fixtures/golden-path";
import type { CanonicalRuntimeStatus } from "../../src/v2/data/runtime-adapter";

export const API_ORIGIN = "http://127.0.0.1:4399";
export const FIXTURE_NOW = "2026-08-03T12:00:00.000Z";

function fixtureRows(count = 100): MomentumScannerSummaryV2[] {
  return Array.from({ length: count }, (_, index) => {
    const source = structuredClone(
      goldenScannerRows[index % goldenScannerRows.length]!
    ) as MomentumScannerSummaryV2;
    const serial = String(index + 1).padStart(3, "0");
    const mint = `AxiBrowserFixture${serial}111111111111111111111111`;
    return {
      ...source,
      mint,
      rowVersion: 1,
      order: index,
      firstSeenAt: FIXTURE_NOW,
      latestEventAt: FIXTURE_NOW,
      identity: {
        ...source.identity,
        displayName: `${source.identity.displayName} ${serial}`,
        symbol: index < goldenScannerRows.length
          ? source.identity.symbol
          : `AX${serial}`,
        shortMint: `${mint.slice(0, 5)}…${mint.slice(-4)}`,
        imageUri: {
          value: null,
          availability: "unavailable",
          source: "enrichment",
          observedAt: FIXTURE_NOW,
          confidence: null,
          reason: "Local browser fixture has no remote image"
        }
      }
    };
  });
}

function canonicalRuntime(
  state: CanonicalRuntimeStatus["meteredPriceAction"]["state"] = "ARM_REQUIRED"
): CanonicalRuntimeStatus {
  const ready = state === "READY";
  const active = state === "ACTIVE";
  return {
    controlPlaneEnabled: true,
    localOnly: true,
    runtimeMode: "fixture",
    paperOnly: true,
    tradingDisabled: true,
    api: {
      online: true,
      wsOnline: true,
      lastUpdatedAt: FIXTURE_NOW,
      pid: 4242,
      ports: [4399]
    },
    liveDiscovery: {
      enabled: true,
      provider: "local-fixture",
      connected: true,
      connecting: false,
      stopped: false,
      lastStartedAt: FIXTURE_NOW,
      lastStoppedAt: null,
      lastEventAt: FIXTURE_NOW,
      newTokenEventCount: 100,
      migrationEventCount: 4,
      errorCount: 0,
      lastError: null,
      reasonCodes: ["LOCAL_BROWSER_FIXTURE"]
    },
    meteredPriceAction: {
      state,
      canArm: state === "ARM_REQUIRED",
      canStart: ready,
      canStop: active,
      acknowledgedCost: ready || active,
      trackedMintCount: active ? 2 : 0,
      estimatedCostSol: active ? 0.000021 : 0,
      sessionCostCapSol: 0.0001,
      budgetRemainingSol: active ? 0.000079 : 0.0001,
      maxConcurrentMints: 3,
      maxEventsPerSession: 1_000,
      maxUiSessionCostSol: 0.0001,
      eventCount: active ? 214 : 0,
      provider: "local-fixture",
      active,
      latestEventAt: active ? FIXTURE_NOW : null,
      blockers: state === "ARM_REQUIRED"
        ? ["Explicit cost ACK required"]
        : active
          ? ["Metered session is active"]
          : [],
      warnings: [
        active
          ? "Bounded fixture metered data active"
          : ready
            ? "Fixture session armed; metered data remains stopped"
            : "Paid token trades are off"
      ]
    },
    dataWallet: {
      publicKeyConfigured: true,
      publicKey: "FixturePublicAddress111111111111111111111111",
      shortPublicKey: "Fixtur…111111",
      apiKeyConfigured: false,
      balanceSol: 0.0042,
      balanceStatus: "ok",
      estimatedEventsRemaining: 42_000,
      lastBalanceCheckAt: FIXTURE_NOW,
      reasonCodes: ["LOCAL_BROWSER_FIXTURE"]
    },
    process: {
      pid: 4242,
      startedAt: FIXTURE_NOW,
      uptimeSeconds: 900,
      ports: [4399]
    },
    safety: {
      accountTradesEnabled: false,
      lightningExecutionEnabled: false,
      localTransactionApiEnabled: false,
      privateKeysLoaded: false,
      liveTradingEnabled: false,
      reasonCodes: ["LOCAL_BROWSER_FIXTURE", "LIVE_EXECUTION_DISABLED"]
    }
  };
}

const strategy: StrategyStatus = {
  strategyName: "Paper momentum risk",
  strategyVersion: "paper-momentum-risk-v1",
  policyStatus: "REFERENCE_POLICY",
  calibrated: false,
  thresholds: {
    minScoreForPaperBuyReady: 82,
    minScoreForWatch: 58,
    minSampleCount: 3,
    criticalRiskBlocksBuyReady: true,
    hardRejectBlocksBuyReady: true,
    insufficientMetricsBlocksBuyReady: true
  },
  scoringWeights: {
    rollingMomentumWeight: 0.65,
    legacyMomentumWeight: 0.35,
    momentumMultiplier: 1,
    qualityMultiplier: 0.8,
    riskPenaltyMultiplier: 1.2
  },
  safetyGates: [
    "PAPER_ONLY",
    "TRADING_DISABLED",
    "MANUAL_REVIEW_REQUIRED"
  ],
  formula: [
    "score = momentum + quality - risk penalty",
    "reference signals never activate live execution"
  ],
  paperOnly: true,
  reasonCodes: ["LOCAL_BROWSER_FIXTURE"]
};

const portfolioStatus = {
  enabled: true,
  entryPolicyEnabled: true,
  exitPolicyEnabled: true,
  openPositionCount: 2,
  closedPositionCount: 4,
  totalPnlSol: 0.000034,
  realizedPnlSol: 0.000019,
  unrealizedPnlSol: 0.000015,
  winRate: 0.625,
  paperOnly: true as const,
  liveExecutionDisabled: true as const
};

const jsonHeaders = {
  "access-control-allow-origin": "*",
  "content-type": "application/json"
};

export class MockApi {
  readonly rows = fixtureRows();
  readonly requests: Array<{
    method: string;
    path: string;
    body: unknown;
  }> = [];
  readonly unexpectedRequests: string[] = [];
  private readonly sockets: WebSocketRoute[] = [];
  private readonly failurePaths = new Set<string>();
  private runtime = canonicalRuntime();

  async install(page: Page): Promise<void> {
    await page.addInitScript((now) => {
      const timestamp = new Date(now).getTime();
      Date.now = () => timestamp;
      Math.random = () => 0.5;
    }, FIXTURE_NOW);

    await page.routeWebSocket(
      `${API_ORIGIN.replace("http", "ws")}/ws/v2/scanner`,
      (socket) => {
        this.sockets.push(socket);
      }
    );
    await page.route(`${API_ORIGIN}/**`, (route) => this.handle(route));
  }

  fail(path: string): void {
    this.failurePaths.add(path);
  }

  get connectedSocketCount(): number {
    return this.sockets.length;
  }

  sendScannerUpsert(row: MomentumScannerSummaryV2): void {
    const message: ScannerStreamMessageV2 = {
      schemaVersion: "scanner-stream-v2",
      type: "scanner.upsert",
      sequence: 2,
      generatedAt: FIXTURE_NOW,
      row: { ...structuredClone(row), rowVersion: row.rowVersion + 1 }
    };
    for (const socket of this.sockets) socket.send(JSON.stringify(message));
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = `${url.pathname}${url.search}`;
    let body: unknown = null;
    if (request.method() === "POST") body = request.postDataJSON();
    this.requests.push({ method: request.method(), path, body });

    if (this.failurePaths.has(url.pathname)) {
      await route.fulfill({
        status: 503,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "Deterministic fixture failure" })
      });
      return;
    }

    const response = this.responseFor(request.method(), url);
    if (response === undefined) {
      this.unexpectedRequests.push(`${request.method()} ${path}`);
      await route.fulfill({
        status: 404,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "No local browser fixture" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify(response)
    });
  }

  private responseFor(method: string, url: URL): unknown | undefined {
    const path = url.pathname;
    if (method === "GET" && path === "/runtime/status") return this.runtime;
    if (method === "GET" && path === "/ui/v2/scanner") {
      const snapshot: ScannerSnapshotV2 = {
        schemaVersion: "scanner-snapshot-v2",
        snapshotVersion: 1,
        generatedAt: FIXTURE_NOW,
        sessionId: "local-browser-fixture",
        totalActive: this.rows.length,
        totalHistory: 24,
        nextCursor: null,
        rows: this.rows
      };
      return snapshot;
    }
    if (method === "GET" && path.startsWith("/ui/v2/scanner/")) return null;
    if (method === "GET" && path === "/paper-portfolio/positions") {
      return {
        positions: [
          {
            id: "fixture-position-open",
            mint: this.rows[10]!.mint,
            symbol: "AXIP",
            title: "Axi Paper Position",
            status: "open",
            entryPriceSol: 4.1e-8,
            averageEntryPriceSol: 4.1e-8,
            currentPriceSol: 4.2528736e-8,
            sizeSol: 0.0001,
            remainingSizeSol: 0.00008,
            realizedPnlSol: 0.000006,
            unrealizedPnlSol: 0.0000148,
            realizedPnlPct: 6,
            unrealizedPnlPct: 14.8,
            openedAt: FIXTURE_NOW,
            updatedAt: FIXTURE_NOW,
            closedAt: null
          },
          {
            id: "fixture-position-partial",
            mint: this.rows[11]!.mint,
            symbol: "AXIX",
            title: "Axi Exit Fixture",
            status: "partially_closed",
            entryPriceSol: 5.2e-8,
            averageEntryPriceSol: 5.2e-8,
            currentPriceSol: 4.9e-8,
            sizeSol: 0.0002,
            remainingSizeSol: 0.0001,
            realizedPnlSol: 0.000013,
            unrealizedPnlSol: -0.0000042,
            realizedPnlPct: 13,
            unrealizedPnlPct: -4.2,
            openedAt: FIXTURE_NOW,
            updatedAt: FIXTURE_NOW,
            closedAt: null
          }
        ],
        status: portfolioStatus,
        paperOnly: true,
        liveExecutionDisabled: true
      };
    }
    if (method === "GET" && path === "/paper-portfolio/snapshot") {
      return {
        snapshot: {
          cashSol: 0.0046,
          deployedSol: 0.00018,
          equitySol: 0.004814,
          realizedPnlSol: 0.000019,
          unrealizedPnlSol: 0.000015,
          totalPnlSol: 0.000034,
          totalPnlPct: 0.72,
          openPositionCount: 2,
          closedPositionCount: 4,
          winRate: 0.625,
          maxDrawdownSol: 0.000011,
          totalFeesSol: 0.000002,
          totalTrades: 6,
          updatedAt: FIXTURE_NOW
        },
        status: portfolioStatus,
        paperOnly: true,
        liveExecutionDisabled: true
      };
    }
    if (method === "GET" && path === "/paper-portfolio/orders") {
      return {
        orders: [
          {
            id: "fixture-order-1",
            side: "buy",
            mint: this.rows[10]!.mint,
            source: "paper-policy-fixture",
            createdAt: FIXTURE_NOW
          }
        ]
      };
    }
    if (method === "GET" && path === "/paper-portfolio/fills") {
      return {
        fills: [
          {
            id: "fixture-fill-1",
            orderIntentId: "fixture-order-1",
            side: "buy",
            mint: this.rows[10]!.mint,
            priceSol: 4.1e-8,
            sizeSol: 0.0001,
            fillStatus: "filled",
            createdAt: FIXTURE_NOW,
            paperOnly: true
          }
        ]
      };
    }
    if (method === "GET" && path === "/strategy/status") return strategy;
    if (method === "GET" && path === "/runtime/paper-forward-evaluation") {
      return {
        deploymentId: "fixture-deployment-001",
        deploymentStatus: "complete",
        completedSessionCount: 6,
        interruptedSessionCount: 1,
        activeSessionCount: 0,
        eligibleSessionIds: ["fixture-session-001"],
        evaluationCount: 1,
        latestEvaluation: {
          evaluationId: "fixture-evaluation-001",
          evaluationVersion: "forward-evidence-v1",
          evaluationStatus: "manual_review_required",
          evaluatedAt: FIXTURE_NOW,
          cohortMetrics: {
            closedTradeCount: 18,
            signalObservationCount: 42,
            totalNetPnlSol: 0.00034,
            netReturnConfidenceLowerBoundPct: -1.8
          },
          acceptanceGates: [
            { gate: "minimum_closed_trades", passed: true, actual: 18, required: ">= 15" },
            { gate: "positive_confidence_bound", passed: false, actual: -1.8, required: "> 0" }
          ]
        },
        contract: {
          evaluationVersion: "forward-evidence-v1",
          evidencePolicy: "all_completed_same_deployment_forward_sessions",
          candidateMeaning: "manual_review_only",
          defaultConfig: { minimumClosedTrades: 15 }
        },
        manualReviewRequired: true,
        automaticLivePromotion: false,
        automaticLiveExecution: false,
        paperOnly: true,
        tradingDisabled: true
      };
    }
    if (method === "GET" && path === "/metered-launch-data/tracked") {
      return { current: [] };
    }
    if (method === "GET" && path === "/exit/wallets") {
      return {
        current: [
          {
            address: "FixtureWatchedPublicAddress111111111111111111",
            alias: "Fixture observer",
            tags: ["paper evidence"],
            enabled: true
          }
        ]
      };
    }
    if (method === "GET" && path === "/exit/rules") {
      return {
        current: [
          {
            id: "fixture-rule-1",
            name: "Paper profit observation",
            enabled: true,
            trigger: "watched_wallet_sell",
            minProfitPct: 12,
            sellPct: 25
          }
        ]
      };
    }
    if (method === "GET" && isDiagnosticsPath(path)) {
      return {
        status: "fixture",
        recordCount: 25,
        reasonCodes: ["LOCAL_BROWSER_FIXTURE", "NO_NETWORK"],
        reconciliationEquation: "fixture inputs = fixture outputs",
        updatedAt: FIXTURE_NOW
      };
    }
    if (method === "POST" && path === "/runtime/metered-launch-data/ack-session") {
      this.runtime = canonicalRuntime("READY");
      return commandResult("Fixture session armed.", this.runtime);
    }
    if (method === "POST" && path.startsWith("/runtime/")) {
      return commandResult("Fixture runtime command accepted.", this.runtime);
    }
    return undefined;
  }
}

function commandResult(message: string, status: CanonicalRuntimeStatus) {
  return {
    ok: true,
    message,
    status,
    paperOnly: true,
    tradingDisabled: true
  };
}

function isDiagnosticsPath(path: string): boolean {
  return [
    "/runtime/discovery-coverage",
    "/runtime/trade-data-coverage",
    "/feed/status",
    "/indexer/status",
    "/indexer/stream/status",
    "/storage/stats",
    "/live/events",
    "/chain/verifications",
    "/market/observations"
  ].includes(path);
}
