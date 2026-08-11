import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  PumpPortalFeedProvider,
  TokenCreatedEvent,
  WebSocketLike
} from "@axi/data-feeds";
import type { TradeDataCoverageSession } from "@axi/shared";
import {
  listCandidateDecisions,
  listFeedEvents,
  listLaunchCandidates,
  listLiveFeedEvents,
  listMeteredLaunchDataEventsByMint,
  listPumpPortalTokenTradeEventsByMint,
  listRecentSignals,
  listRiskSnapshots,
  runStorageTransaction
} from "@axi/storage";
import {
  createApiServer,
  type ApiServer,
  type TradePipelineProfileSample,
  type TradePipelineProfileStage
} from "./app";

const selectedMint = "So11111111111111111111111111111111111111112";
const offlineTrader = "11111111111111111111111111111111";
const fixtureStartedAtMs = Date.parse("2026-08-04T00:00:00.000Z");

export type ProductionTradeLatencyScenarioResult = {
  canonicalTradeCount: number;
  candidateRowsLoaded: number;
  decisionScannerParity: boolean;
  exactlyOnce: boolean;
  externalNetworkConnections: 0;
  fakeProviderConnections: 1;
  latency: {
    databaseWriteP95Ms: number | null;
    derivativeToSignalP95Ms: number | null;
    queueWaitP95Ms: number | null;
    receiveToScannerMaxMs: number | null;
    receiveToScannerP95Ms: number | null;
    signalToScannerP95Ms: number | null;
  };
  lifecycleOrdered: boolean;
  outputDigest: string;
  persistenceDeltas: Record<string, number>;
  perStage: Partial<
    Record<TradePipelineProfileStage, { maximumMs: number; p95Ms: number }>
  >;
  scannerDeltaCount: number;
  stopToUnsubscribeMs: number | null;
  transactionMode: "legacy_autocommit" | "per_event";
};

export type ProductionTradeLatencyCheckResult = {
  status: "PRODUCTION_LATENCY_CHECK_PASSED" | "PRODUCTION_LATENCY_CHECK_FAILED";
  candidateFixtureCount: 500;
  outputEquivalent: boolean;
  outputDifferencePath: string | null;
  outputDifferenceValues: { legacy: unknown; optimized: unknown } | null;
  sequential21: ProductionTradeLatencyScenarioResult;
  sequential21LegacyProfile: ProductionTradeLatencyScenarioResult;
  stress65: ProductionTradeLatencyScenarioResult;
  networkConnections: 0;
  paidStreamsStarted: 0;
  accountTradesActive: false;
  paperAutomationActive: false;
  lightningActive: false;
  signingActive: false;
  transactionSendingActive: false;
  liveTradingEnabled: false;
};

type ScenarioRun = {
  result: ProductionTradeLatencyScenarioResult;
  stableOutput: unknown;
};

class OfflineWebSocket implements WebSocketLike {
  static instances: OfflineWebSocket[] = [];
  readonly sent: string[] = [];
  private readonly handlers = new Map<
    string,
    Array<(...args: unknown[]) => void>
  >();

  constructor(readonly url: string) {
    OfflineWebSocket.instances.push(this);
  }

  on(event: string, handler: (...args: unknown[]) => void): WebSocketLike {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit("close");
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

export async function runProductionTradeDataLatencyCheck(): Promise<ProductionTradeLatencyCheckResult> {
  const legacy21 = await runScenario(21, "legacy_autocommit");
  const optimized21 = await runScenario(21, "per_event");
  const stress65 = await runScenario(65, "per_event");
  const differencePath = findFirstDifference(
    legacy21.stableOutput,
    optimized21.stableOutput
  );
  const outputEquivalent = differencePath === null;
  const outputDifferenceValues = differencePath
    ? {
        legacy: valueAtPath(legacy21.stableOutput, differencePath),
        optimized: valueAtPath(optimized21.stableOutput, differencePath)
      }
    : null;
  const scenariosPass = [optimized21.result, stress65.result].every(
    (scenario) =>
      scenario.exactlyOnce &&
      scenario.decisionScannerParity &&
      scenario.lifecycleOrdered &&
      scenario.stopToUnsubscribeMs !== null &&
      scenario.stopToUnsubscribeMs >= 0 &&
      scenario.scannerDeltaCount === scenario.canonicalTradeCount &&
      scenario.latency.receiveToScannerP95Ms !== null &&
      scenario.latency.receiveToScannerP95Ms <= 1_000 &&
      scenario.latency.receiveToScannerMaxMs !== null &&
      scenario.latency.receiveToScannerMaxMs <= 2_000
  );

  return {
    status:
      outputEquivalent && scenariosPass
        ? "PRODUCTION_LATENCY_CHECK_PASSED"
        : "PRODUCTION_LATENCY_CHECK_FAILED",
    candidateFixtureCount: 500,
    outputEquivalent,
    outputDifferencePath: differencePath,
    outputDifferenceValues,
    sequential21: optimized21.result,
    sequential21LegacyProfile: legacy21.result,
    stress65: stress65.result,
    networkConnections: 0,
    paidStreamsStarted: 0,
    accountTradesActive: false,
    paperAutomationActive: false,
    lightningActive: false,
    signingActive: false,
    transactionSendingActive: false,
    liveTradingEnabled: false
  };
}

async function runScenario(
  tradeCount: 21 | 65,
  transactionMode: "legacy_autocommit" | "per_event"
): Promise<ScenarioRun> {
  const directory = mkdtempSync(join(tmpdir(), "axi-production-latency-"));
  const databasePath = join(directory, "latency.sqlite");
  const profileSamples: TradePipelineProfileSample[] = [];
  OfflineWebSocket.instances = [];
  let server: ApiServer | undefined;
  let providerClockMs = fixtureStartedAtMs + 1_000_000;
  const scenarioNow = () => new Date(providerClockMs++);

  try {
    server = createApiServer({
      dataFeed: "pumpportal",
      dataFeedMode: "live",
      logLevel: false,
      mode: "paper",
      paperAutoOrder: false,
      startFeed: true,
      storageDatabasePath: databasePath,
      queuedFeedEventTransactionMode: transactionMode,
      tradeDataCoverageNow: scenarioNow,
      tradePipelineProfiler: (sample) => profileSamples.push(sample),
      pumpPortal: {
        maxTokenTradeEventsPerMint: 1_000,
        maxTokenTradeEventsPerSession: 1_000,
        maxTokenTradeSubscriptions: 1,
        now: scenarioNow,
        subscribeMigration: false,
        subscribeNewToken: true,
        webSocketConstructor: OfflineWebSocket,
        wsUrl: "wss://offline.invalid/pumpportal"
      },
      actualData: {
        acknowledgedMetered: true,
        apiKeyConfigured: true,
        autoSubscribe: false,
        autoSubscribeOnMigration: false,
        autoSubscribeOnNewToken: false,
        autoSubscribeOnQualified: false,
        enabled: true,
        manualMints: [],
        maxEventsPerMint: 1_000,
        maxEventsPerSession: 1_000,
        maxSubscribedTokens: 1,
        minScoreToAutoSubscribe: 0,
        requireApiKey: false,
        unsubscribeAfterMs: 300_000
      },
      meteredLaunchData: {
        acknowledgedCost: true,
        apiKeyConfigured: true,
        controlsEnabled: true,
        dataWalletPublicKeyConfigured: true,
        enabled: true,
        extendedTrackMs: 300_000,
        initialTrackMs: 300_000,
        maxConcurrentMints: 1,
        maxEventsPerMint: 1_000,
        maxEventsPerSession: 1_000,
        maxSessionCostSol: 0.01,
        maxUiSessionCostSol: 0.01,
        mode: "manual",
        requireDataWalletReady: false,
        requireUiAck: false,
        rollingTrackerEnabled: false,
        startActive: true
      },
      pumpPortalDataWallet: {
        apiKeyConfigured: true,
        publicKey: selectedMint
      },
      paperPortfolio: { enabled: false },
      watchedWalletExit: {
        accountTradesAcknowledgedMetered: false,
        accountTradesEnabled: false,
        enabled: false
      },
      lightning: { enabled: false }
    });

    const socket = OfflineWebSocket.instances[0];
    if (!socket) {
      throw new Error("Offline PumpPortal socket was not constructed.");
    }
    socket.emit("open");

    runStorageTransaction(() => {
      for (let index = 0; index < 500; index += 1) {
        server?.emitFeedEvent(createCandidateEvent(index));
      }
      server?.emitFeedEvent(createCandidateEvent(500, selectedMint));
    });

    const representativeRows = {
      candidates: listLaunchCandidates(1_000).length,
      decisions: listCandidateDecisions(1_000).length,
      feedEvents: listFeedEvents(1_000).length,
      liveEvents: listLiveFeedEvents(1_000).length,
      risks: listRiskSnapshots(1_000).length,
      signals: listRecentSignals(1_000).length
    };
    if (Object.values(representativeRows).some((count) => count < 500)) {
      throw new Error(
        `Loaded-state fixture incomplete: ${JSON.stringify(representativeRows)}`
      );
    }

    const before = selectedMintPersistenceCounts();
    const scannerVersionBefore = server.scannerProjectionV2.version;
    const provider = server.feed as PumpPortalFeedProvider;
    server.tradeDataCoverage.begin({
      sessionId: `offline-production-${transactionMode}-${tradeCount}`,
      selectedMint,
      maxEvents: tradeCount,
      maxRuntimeMs: 90_000,
      maxCostSol: 0.01,
      postStopGraceMs: 100,
      onStopRequested: () => {
        provider.unsubscribeTokenTrades([selectedMint]);
      }
    });
    server.meteredLaunchData.trackMint(selectedMint, "offline_latency_check");
    socket.emit("message", JSON.stringify({ message: "subscribed" }));

    for (let index = 0; index < tradeCount; index += 1) {
      socket.emit("message", JSON.stringify(createTradePayload(index)));
    }
    await waitForPipeline(server, tradeCount);
    server.meteredLaunchData.untrackMint(
      selectedMint,
      "offline_latency_check_complete"
    );
    server.tradeDataCoverage.beginGrace("offline_latency_check_complete");
    socket.emit("message", JSON.stringify({ message: "unsubscribed" }));
    const summary = server.tradeDataCoverage.finalize(
      "offline_latency_check_complete"
    );
    if (!summary) {
      throw new Error("Offline production latency session did not finalize.");
    }

    const after = selectedMintPersistenceCounts();
    const scannerRowResponse = await server.app.inject({
      method: "GET",
      url: `/ui/momentum-rows/${selectedMint}`
    });
    if (scannerRowResponse.statusCode !== 200) {
      throw new Error("Selected mint scanner row was not projected.");
    }
    const scannerRow = scannerRowResponse.json() as Record<string, unknown>;
    const candidate = server.candidates.getCandidate(selectedMint);
    const signal = server
      .getSignals()
      .filter((item) => item.mint === selectedMint)
      .at(-1);
    const stableOutput = stableValue({
      derivatives: server.indexerAdapter.getDerivatives(selectedMint),
      metrics: server.metrics.getMetrics(selectedMint),
      risk: candidate?.latestRisk,
      score: candidate?.latestScore,
      decision: candidate?.latestDecision,
      signal,
      scannerRow
    });
    const latestDecision = candidate?.latestDecision;
    const decisionScannerParity =
      latestDecision?.decisionId === scannerRow.decisionId &&
      latestDecision?.decisionVersion === scannerRow.decisionVersion &&
      latestDecision?.sourceEventKey === scannerRow.decisionSourceEventKey &&
      latestDecision?.decisionId === signal?.decisionId &&
      latestDecision?.decisionVersion === signal?.decisionVersion &&
      latestDecision?.sourceEventKey === signal?.sourceEventKey;
    const deltas = subtractCounts(after, before);
    const exactlyOnce =
      summary.canonicalAdmittedTradeCount === tradeCount &&
      summary.canonicalBusinessTradeCount === tradeCount &&
      summary.canonicalTimeSeriesSourceEventCount === tradeCount &&
      summary.queueCommittedCount === tradeCount &&
      summary.pipelineCompletedCount === tradeCount &&
      Object.entries(deltas)
        .filter(([key]) => key !== "liveEvents")
        .every(([, count]) => count === tradeCount) &&
      deltas.liveEvents === 0;
    const lifecycle = lifecycleEvidence(summary);

    return {
      stableOutput,
      result: {
        canonicalTradeCount: tradeCount,
        candidateRowsLoaded: representativeRows.candidates,
        decisionScannerParity,
        exactlyOnce,
        externalNetworkConnections: 0,
        fakeProviderConnections: 1,
        latency: {
          databaseWriteP95Ms: latencyP95(summary, "database_write"),
          derivativeToSignalP95Ms: latencyP95(
            summary,
            "derivative_to_signal_compute"
          ),
          queueWaitP95Ms: latencyP95(summary, "queue_wait"),
          receiveToScannerMaxMs:
            summary.latencyDistributions.receive_to_scanner?.max ?? null,
          receiveToScannerP95Ms: latencyP95(summary, "receive_to_scanner"),
          signalToScannerP95Ms: latencyP95(
            summary,
            "signal_compute_to_scanner_projection"
          )
        },
        lifecycleOrdered: lifecycle.ordered,
        outputDigest: createHash("sha256")
          .update(JSON.stringify(stableOutput))
          .digest("hex"),
        persistenceDeltas: deltas,
        perStage: summarizeProfile(profileSamples),
        scannerDeltaCount:
          server.scannerProjectionV2.version - scannerVersionBefore,
        stopToUnsubscribeMs: lifecycle.stopToUnsubscribeMs,
        transactionMode
      }
    };
  } finally {
    await server?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function createCandidateEvent(
  index: number,
  mint = deterministicMint(index)
): TokenCreatedEvent {
  const timestamp = new Date(fixtureStartedAtMs + index * 1_000).toISOString();
  return {
    type: "token_created",
    candidate: {
      id: { chain: "solana", mint },
      mint,
      symbol: `L${index}`,
      name: `Offline Latency Candidate ${index}`,
      source: "pumpportal",
      ageSeconds: 0,
      firstSeenAt: timestamp
    },
    metrics: emptyMetrics(),
    metricsComplete: false,
    rawSourceEventType: "new_token",
    realData: true,
    receivedAt: timestamp,
    riskFlags: safeRiskFlags(),
    source: "pumpportal",
    timestamp
  };
}

function createTradePayload(index: number): Record<string, unknown> {
  return {
    eventIndex: String(index + 1),
    mint: selectedMint,
    signature: `offline-latency-signature-${String(index + 1).padStart(4, "0")}`,
    solAmount: 0.01 + index * 0.0001,
    tokenAmount: 10 + index,
    traderPublicKey: offlineTrader,
    txType: index % 4 === 3 ? "sell" : "buy",
    timestamp: new Date(
      fixtureStartedAtMs + 600_000 + index * 1_000
    ).toISOString(),
    vSolInBondingCurve: 30 + index,
    vTokensInBondingCurve: 1_000_000 - index * 100
  };
}

function deterministicMint(index: number): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = index + 1;
  let suffix = "";
  for (let position = 0; position < 5; position += 1) {
    suffix = alphabet[value % alphabet.length] + suffix;
    value = Math.floor(value / alphabet.length);
  }
  return `${"1".repeat(27)}${suffix}`;
}

function emptyMetrics(): TokenCreatedEvent["metrics"] {
  return {
    priceUsd: 0,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: 0,
    volume5mUsd: 0,
    volume15mUsd: 0,
    buyCount1m: 0,
    buyCount5m: 0,
    sellCount1m: 0,
    sellCount5m: 0,
    uniqueBuyers1m: 0,
    uniqueBuyers5m: 0,
    uniqueSellers1m: 0,
    uniqueSellers5m: 0,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: 0,
    priceChange5mPct: 0,
    volumeVelocity: 0,
    buyerVelocity: 0
  };
}

function safeRiskFlags(): TokenCreatedEvent["riskFlags"] {
  return {
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    topHolderConcentrationHigh: false,
    mutableMetadata: false,
    suspiciousName: false,
    lowLiquidity: true,
    washTradingSuspected: false,
    honeypotSuspected: false
  };
}

async function waitForPipeline(
  server: ApiServer,
  expected: number
): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const summary = server.tradeDataCoverage.getSummary();
    if ((summary?.pipelineCompletedCount ?? 0) >= expected) return;
    if ((summary?.pipelineFailedOrDroppedCount ?? 0) > 0) {
      throw new Error("Production queue reported a failed or dropped trade.");
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Production queue did not complete ${expected} trades.`);
}

function selectedMintPersistenceCounts(): Record<string, number> {
  return {
    actualTrades: listPumpPortalTokenTradeEventsByMint(selectedMint, 1_000)
      .length,
    candidateDecisions: listCandidateDecisions(1_000).filter(
      (row) => row.mint === selectedMint
    ).length,
    feedEvents: listFeedEvents(1_000).filter((row) => row.mint === selectedMint)
      .length,
    liveEvents: listLiveFeedEvents(1_000).filter(
      (row) => row.mint === selectedMint
    ).length,
    meteredTrades: listMeteredLaunchDataEventsByMint(selectedMint, 1_000)
      .length,
    riskSnapshots: listRiskSnapshots(1_000).filter(
      (row) => row.mint === selectedMint
    ).length,
    signals: listRecentSignals(1_000).filter((row) => row.mint === selectedMint)
      .length
  };
}

function subtractCounts(
  after: Record<string, number>,
  before: Record<string, number>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(after).map(([key, value]) => [
      key,
      value - (before[key] ?? 0)
    ])
  );
}

function lifecycleEvidence(summary: TradeDataCoverageSession): {
  ordered: boolean;
  stopToUnsubscribeMs: number | null;
} {
  const stop = summary.subscriptionLifecycle.find(
    (event) => event.eventType === "stop_requested"
  );
  const sent = summary.subscriptionLifecycle.find(
    (event) => event.eventType === "unsubscribe_sent"
  );
  const acknowledged = summary.subscriptionLifecycle.find(
    (event) => event.eventType === "unsubscribe_acknowledged"
  );
  if (!stop || !sent || !acknowledged) {
    return { ordered: false, stopToUnsubscribeMs: null };
  }
  const stopMs = Date.parse(stop.timestamp);
  const sentMs = Date.parse(sent.timestamp);
  const acknowledgedMs = Date.parse(acknowledged.timestamp);
  return {
    ordered: stopMs <= sentMs && sentMs <= acknowledgedMs,
    stopToUnsubscribeMs: sentMs - stopMs
  };
}

function latencyP95(
  summary: TradeDataCoverageSession,
  key: keyof TradeDataCoverageSession["latencyDistributions"]
): number | null {
  return summary.latencyDistributions[key]?.p95 ?? null;
}

function summarizeProfile(
  samples: TradePipelineProfileSample[]
): ProductionTradeLatencyScenarioResult["perStage"] {
  const grouped = new Map<TradePipelineProfileStage, number[]>();
  for (const sample of samples) {
    const durations = grouped.get(sample.stage) ?? [];
    durations.push(sample.durationMs);
    grouped.set(sample.stage, durations);
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([stage, durations]) => [
      stage,
      {
        maximumMs: round(Math.max(...durations)),
        p95Ms: round(percentile(durations, 0.95))
      }
    ])
  );
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

const volatileOutputKeys = new Set([
  "ageSeconds",
  "createdAt",
  "dataFreshnessMs",
  "generatedAt",
  "lastUpdatedAt",
  "updatedAt"
]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !volatileOutputKeys.has(key))
      .map(([key, child]) => [key, stableValue(child)])
  );
}

function findFirstDifference(
  left: unknown,
  right: unknown,
  path = "$"
): string | null {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return `${path}.length`;
    for (let index = 0; index < left.length; index += 1) {
      const difference = findFirstDifference(
        left[index],
        right[index],
        `${path}[${index}]`
      );
      if (difference) return difference;
    }
    return null;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Array.from(
      new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])
    ).sort();
    for (const key of keys) {
      if (!(key in leftRecord) || !(key in rightRecord))
        return `${path}.${key}`;
      const difference = findFirstDifference(
        leftRecord[key],
        rightRecord[key],
        `${path}.${key}`
      );
      if (difference) return difference;
    }
    return null;
  }
  return path;
}

function valueAtPath(value: unknown, path: string): unknown {
  const segments = path
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
