import type {
  MomentumScannerSummaryV2,
  RuntimeSummaryV2,
  ScannerSnapshotV2,
  UiField
} from "@axi/shared";
import { uiField } from "../contracts/ui-field";

const NOW = "2025-06-14T12:00:00.000Z";

function value<T>(
  input: T | null,
  source: UiField<T>["source"] = "token_trade"
): UiField<T> {
  const options = { source, observedAt: NOW, confidence: 0.86 };
  return input === null ? uiField<T>(null, options) : uiField(input, options);
}

function scannerRow(
  overrides: Partial<MomentumScannerSummaryV2> = {}
): MomentumScannerSummaryV2 {
  const mint = overrides.mint ?? "AxiFixtureMint111111111111111111111111111";
  return {
    mint,
    rowVersion: 1,
    order: 0,
    firstSeenAt: "2025-06-14T11:59:42.000Z",
    latestEventAt: NOW,
    identity: {
      displayName: "Axi Fixture",
      symbol: "AXIF",
      shortMint: `${mint.slice(0, 4)}…${mint.slice(-4)}`,
      imageUri: value("https://example.invalid/token.png", "enrichment"),
      ageSeconds: value(18, "unknown"),
      migrationStatus: "not_migrated"
    },
    readiness: {
      trackingState: "discovery",
      state: "discovery",
      validSampleCount: 0,
      d1Ready: false,
      d2Ready: false,
      freshnessMs: value(250, "curve"),
      isProtected: false
    },
    market: {
      priceSol: value(4.2528736e-8, "curve"),
      priceUsd: uiField(null, {
        source: "enrichment",
        reason: "No legitimate SOL/USD conversion"
      }),
      marketCapSol: value(42.5, "curve"),
      marketCapUsd: uiField(null, { source: "enrichment" }),
      liquiditySol: value(21.25, "curve"),
      liquidityUsd: uiField(null, { source: "enrichment" }),
      liquidityKind: "curve"
    },
    flow: {
      volume10sSol: uiField(null, { source: "token_trade" }),
      transactionCount10s: uiField(null, { source: "token_trade" }),
      uniqueBuyers10s: uiField(null, { source: "token_trade" }),
      buyPressure: uiField(null, { source: "token_trade" })
    },
    momentum: {
      priceD1: uiField(null, { source: "token_trade" }),
      priceD2: uiField(null, { source: "token_trade" }),
      volumeD1: uiField(null, { source: "token_trade" }),
      volumeD2: uiField(null, { source: "token_trade" }),
      normalizedStrength: uiField(null, { source: "token_trade" }),
      confidence: uiField(null, { source: "token_trade" })
    },
    decision: {
      signal: "DISCOVERY",
      score: 0,
      topDriver: "New launch observed",
      topBlocker: "Trade samples unavailable",
      riskLevel: "unknown",
      hardReject: false,
      referencePolicy: true
    },
    position: {
      status: null,
      unrealizedPnlPct: uiField(null, { source: "portfolio" }),
      unrealizedPnlSol: uiField(null, { source: "portfolio" }),
      exitSignal: null
    },
    sparkline: { values: [4.2e-8, 4.25e-8], source: "curve" },
    ...overrides
  };
}

function withSamples(
  count: number,
  overrides: Partial<MomentumScannerSummaryV2> = {}
): MomentumScannerSummaryV2 {
  const d1Ready = count >= 2;
  const d2Ready = count >= 3;
  return scannerRow({
    ...overrides,
    readiness: {
      trackingState: "token_trade",
      state: d2Ready ? "d2_ready" : d1Ready ? "d1_ready" : "observed",
      validSampleCount: count,
      d1Ready,
      d2Ready,
      freshnessMs: value(90),
      isProtected: true
    },
    flow: {
      volume10sSol: value(1.25),
      transactionCount10s: value(12),
      uniqueBuyers10s: value(8),
      buyPressure: value(0.64)
    },
    momentum: {
      priceD1: d1Ready ? value(0.42) : uiField(null),
      priceD2: d2Ready ? value(0.08) : uiField(null),
      volumeD1: d1Ready ? value(0.16) : uiField(null),
      volumeD2: d2Ready ? value(0.04) : uiField(null),
      normalizedStrength: d1Ready ? value(68) : uiField(null),
      confidence: value(Math.min(0.98, 0.35 + count * 0.16))
    }
  });
}

export const discoveryOnlyToken = scannerRow();

export const tradeTrackedToken = scannerRow({
  mint: "TrackedFixtureMint111111111111111111111111",
  readiness: {
    trackingState: "token_trade",
    state: "discovery",
    validSampleCount: 0,
    d1Ready: false,
    d2Ready: false,
    freshnessMs: value(120),
    isProtected: true
  }
});

export const oneSampleToken = withSamples(1, {
  mint: "OneSampleFixtureMint1111111111111111111111"
});
export const d1ReadyToken = withSamples(2, {
  mint: "D1ReadyFixtureMint111111111111111111111111"
});
export const d2ReadyToken = withSamples(3, {
  mint: "D2ReadyFixtureMint111111111111111111111111"
});

export const hotToken = withSamples(4, {
  mint: "HotFixtureMint1111111111111111111111111111",
  decision: {
    signal: "HOT",
    score: 78,
    topDriver: "Volume acceleration",
    topBlocker: "Small age cohort",
    riskLevel: "medium",
    hardReject: false,
    referencePolicy: true
  }
});

export const rippingToken = withSamples(6, {
  mint: "RippingFixtureMint111111111111111111111111",
  decision: {
    signal: "RIPPING",
    score: 93,
    topDriver: "Price and buyer acceleration",
    topBlocker: null,
    riskLevel: "low",
    hardReject: false,
    referencePolicy: true
  }
});

export const hardRejectToken = withSamples(3, {
  mint: "RejectFixtureMint1111111111111111111111111",
  decision: {
    signal: "REJECT",
    score: 12,
    topDriver: null,
    topBlocker: "Hard risk policy reject",
    riskLevel: "critical",
    hardReject: true,
    referencePolicy: true
  }
});

export const staleToken = scannerRow({
  mint: "StaleFixtureMint11111111111111111111111111",
  latestEventAt: "2025-06-14T11:54:00.000Z",
  market: {
    ...discoveryOnlyToken.market,
    priceSol: uiField(4.2528736e-8, {
      availability: "stale",
      source: "curve",
      observedAt: "2025-06-14T11:54:00.000Z",
      reason: "No update for six minutes"
    })
  },
  readiness: {
    ...discoveryOnlyToken.readiness,
    freshnessMs: uiField(360_000, {
      availability: "stale",
      source: "curve",
      observedAt: "2025-06-14T11:54:00.000Z"
    })
  }
});

export const migratedToken = scannerRow({
  mint: "MigratedFixtureMint11111111111111111111111",
  identity: {
    ...discoveryOnlyToken.identity,
    migrationStatus: "migrated"
  },
  market: {
    ...discoveryOnlyToken.market,
    liquidityKind: "dex",
    liquiditySol: uiField(null, { source: "curve" }),
    liquidityUsd: value(12_450, "enrichment")
  }
});

export const paperPositionToken = withSamples(5, {
  mint: "PositionFixtureMint11111111111111111111111",
  position: {
    status: "open",
    unrealizedPnlPct: value(14.8, "portfolio"),
    unrealizedPnlSol: value(0.0000148, "portfolio"),
    exitSignal: null
  }
});

export const exitSignalToken = withSamples(5, {
  mint: "ExitFixtureMint111111111111111111111111111",
  position: {
    status: "partially_closed",
    unrealizedPnlPct: value(-4.2, "portfolio"),
    unrealizedPnlSol: value(-0.0000042, "portfolio"),
    exitSignal: "paper-exit-fixture-1"
  }
});

export const goldenScannerRows = [
  discoveryOnlyToken,
  tradeTrackedToken,
  oneSampleToken,
  d1ReadyToken,
  d2ReadyToken,
  hotToken,
  rippingToken,
  hardRejectToken,
  staleToken,
  migratedToken,
  paperPositionToken,
  exitSignalToken
] as const;

export const goldenScannerSnapshot: ScannerSnapshotV2 = {
  schemaVersion: "scanner-snapshot-v2",
  snapshotVersion: 1,
  generatedAt: NOW,
  sessionId: "fixture-session",
  totalActive: goldenScannerRows.length,
  totalHistory: 0,
  nextCursor: null,
  rows: [...goldenScannerRows]
};

function runtime(
  phase: RuntimeSummaryV2["phase"],
  overrides: Partial<RuntimeSummaryV2> = {}
): RuntimeSummaryV2 {
  return {
    phase,
    paperOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true,
    apiOnline: true,
    websocketOnline: true,
    discovery: "active",
    acknowledged: false,
    canArm: { allowed: true, blocker: null },
    canStart: { allowed: false, blocker: "Explicit cost ACK required" },
    canStop: { allowed: false, blocker: "Metered session is not active" },
    spendSol: value(0, "runtime"),
    capSol: value(0.0001, "runtime"),
    remainingSol: value(0.0001, "runtime"),
    walletBalanceSol: value(0.0042, "runtime"),
    trackedMintCount: value(0, "runtime"),
    maximumSessionCostSol: 0.0001,
    maximumConcurrentMints: 3,
    maximumEvents: 1_000,
    durationSeconds: 900,
    warning: "Paid token trades are off",
    processSessionId: "api-fixture-session",
    updatedAt: NOW,
    ...overrides
  };
}

export const meteredArmRequired = runtime("ARM_REQUIRED");
export const meteredReady = runtime("READY", {
  acknowledged: true,
  canArm: { allowed: false, blocker: "Session already armed" },
  canStart: { allowed: true, blocker: null }
});
export const meteredActive = runtime("ACTIVE", {
  acknowledged: true,
  canArm: { allowed: false, blocker: "Metered session is active" },
  canStart: { allowed: false, blocker: "Metered session is active" },
  canStop: { allowed: true, blocker: null },
  spendSol: value(0.000021, "runtime"),
  remainingSol: value(0.000079, "runtime"),
  trackedMintCount: value(2, "runtime"),
  warning: "Bounded metered token trades active"
});
export const meteredBudgetReached = runtime("BUDGET_REACHED", {
  acknowledged: true,
  canArm: { allowed: false, blocker: "Session budget reached" },
  canStart: { allowed: false, blocker: "Session budget reached" },
  canStop: { allowed: false, blocker: "Metered session stopped at budget" },
  spendSol: value(0.0001, "runtime"),
  remainingSol: value(0, "runtime"),
  warning: "Session cost cap reached"
});

export const apiOfflineRuntime = runtime("ARM_REQUIRED", {
  apiOnline: false,
  websocketOnline: false,
  discovery: "offline",
  canArm: { allowed: false, blocker: "API offline" },
  walletBalanceSol: uiField(null, {
    source: "runtime",
    reason: "API offline"
  }),
  warning: "API offline"
});

export const websocketOfflineRuntime = runtime("ARM_REQUIRED", {
  websocketOnline: false,
  warning: "WebSocket offline; cached scanner rows retained"
});

export const walletUnknownRuntime = runtime("ARM_REQUIRED", {
  canArm: { allowed: false, blocker: "Data-wallet balance is unknown" },
  walletBalanceSol: uiField(null, {
    availability: "unproven",
    source: "runtime",
    reason: "Balance has not been checked"
  })
});

export const goldenRuntimeFixtures = {
  ARM_REQUIRED: meteredArmRequired,
  READY: meteredReady,
  ACTIVE: meteredActive,
  BUDGET_REACHED: meteredBudgetReached,
  API_OFFLINE: apiOfflineRuntime,
  WEBSOCKET_OFFLINE: websocketOfflineRuntime,
  WALLET_UNKNOWN: walletUnknownRuntime
} as const;
