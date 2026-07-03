import { createCandidateLifecycleEngine } from "@axi/candidates";
import { createRollingMetricsEngine } from "@axi/metrics";
import { createRiskEngine, type RiskInput } from "@axi/risk";
import { scoreCandidate } from "@axi/scoring";
import {
  closeStorage,
  createReplayStream,
  initStorage,
  type ReplaySource
} from "@axi/storage";
import type { FeedEvent } from "@axi/data-feeds";
import type {
  CandidateDecision,
  RiskFlags,
  RiskSnapshot,
  RollingMetrics,
  RollingMetricsSnapshot,
  TokenCandidate
} from "@axi/shared";

type ReplayArgs = {
  db?: string;
  candidates: boolean;
  chain: boolean;
  limit: number;
  metrics: boolean;
  risk: boolean;
  speed: number;
  type: ReplaySource;
};

const args = parseArgs(process.argv.slice(2));
const storage = args.db ? initStorage({ databasePath: args.db }) : initStorage();
const metricsEngine =
  args.metrics || args.risk || args.candidates
    ? createRollingMetricsEngine()
    : undefined;
const riskEngine =
  args.risk || args.candidates ? createRiskEngine() : undefined;
const candidateEngine = args.candidates
  ? createCandidateLifecycleEngine()
  : undefined;

try {
  for await (const item of createReplayStream({
    limit: args.limit,
    speed: args.speed,
    type: args.type
  })) {
    const metrics =
      metricsEngine && item.source === "feed_events" && isFeedEvent(item.payload)
        ? metricsEngine.ingestFeedEvent(item.payload)
        : undefined;
    const replayEvaluation =
      item.source === "feed_events" && isFeedEvent(item.payload)
        ? evaluateReplayFeedEvent({
            event: item.payload,
            metrics,
            metricsEngine,
            riskEngine,
            candidateEngine
          })
        : {};

    console.log(
      JSON.stringify({
        createdAt: item.createdAt,
        candidateDecision: args.candidates
          ? replayEvaluation.candidateDecision
          : undefined,
        metrics: args.metrics ? metrics : undefined,
        payload: item.payload,
        riskSnapshot: args.risk ? replayEvaluation.riskSnapshot : undefined,
        sequence: item.sequence,
        source: item.source
      })
    );
  }
} finally {
  closeStorage();
}

if (process.env.LOG_LEVEL === "debug") {
  console.error(`Replayed from ${storage.databasePath}`);
}

function parseArgs(argv: string[]): ReplayArgs {
  const parsed: ReplayArgs = {
    candidates: false,
    chain: false,
    limit: 50,
    metrics: false,
    risk: false,
    speed: 0,
    type: "feed_events"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--db") {
      parsed.db = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      parsed.limit = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
      continue;
    }

    if (arg === "--speed") {
      parsed.speed = Number.parseFloat(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--metrics") {
      parsed.metrics = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--risk") {
      parsed.risk = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--candidates") {
      parsed.candidates = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--chain") {
      parsed.chain = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--type") {
      const type = readValue(argv, index, arg);

      if (!isReplaySource(type)) {
        throw new Error(
          "--type must be candidate_decisions, chain_verifications, feed_events, risk_snapshots, or signals"
        );
      }

      parsed.type = type;
      index += 1;
      continue;
    }
  }

  if (!Number.isInteger(parsed.limit) || parsed.limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }

  if (!Number.isFinite(parsed.speed) || parsed.speed < 0) {
    throw new Error("--speed must be zero or a positive number");
  }

  if (parsed.chain) {
    throw new Error(
      "--chain true is not supported. Replay is local-only and never calls live RPC."
    );
  }

  return parsed;
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function parseBoolean(value: string, arg: string): boolean {
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${arg} must be true or false`);
}

function isReplaySource(value: string): value is ReplaySource {
  return (
    value === "candidate_decisions" ||
    value === "chain_verifications" ||
    value === "feed_events" ||
    value === "risk_snapshots" ||
    value === "signals"
  );
}

function isFeedEvent(value: unknown): value is FeedEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "token_created" || value.type === "trade")
  );
}

function evaluateReplayFeedEvent(options: {
  event: FeedEvent;
  metrics: RollingMetricsSnapshot | undefined;
  metricsEngine: ReturnType<typeof createRollingMetricsEngine> | undefined;
  riskEngine: ReturnType<typeof createRiskEngine> | undefined;
  candidateEngine:
    | ReturnType<typeof createCandidateLifecycleEngine>
    | undefined;
}): {
  candidateDecision?: CandidateDecision;
  riskSnapshot?: RiskSnapshot;
} {
  const latestMetrics =
    options.metrics ??
    options.metricsEngine?.getMetrics(getEventMint(options.event));
  const effectiveMetrics = mergeRollingIntoLegacyMetrics(
    options.event.metrics,
    latestMetrics
  );
  const candidate = options.candidateEngine?.ingestFeedEvent(options.event);

  if (candidate) {
    options.candidateEngine?.updateMetrics(candidate.mint, latestMetrics);
  }

  const riskSnapshot = options.riskEngine?.evaluateRisk(
    createRiskInput({
      event: options.event,
      metrics: effectiveMetrics,
      rollingMetrics: latestMetrics
    })
  );

  if (candidate && riskSnapshot) {
    options.candidateEngine?.updateRisk(candidate.mint, riskSnapshot);
  }

  if (!candidate || !options.candidateEngine) {
    return riskSnapshot ? { riskSnapshot } : {};
  }

  const scoringOptions: {
    minSampleCount: number;
    riskSnapshot?: RiskSnapshot;
    rollingMetrics?: RollingMetricsSnapshot;
  } = {
    minSampleCount: 8
  };

  if (riskSnapshot) {
    scoringOptions.riskSnapshot = riskSnapshot;
  }

  if (latestMetrics) {
    scoringOptions.rollingMetrics = latestMetrics;
  }

  const score = scoreCandidate(
    createTokenCandidateFromReplayCandidate(candidate),
    effectiveMetrics,
    options.event.riskFlags,
    scoringOptions
  );
  options.candidateEngine.updateScore(candidate.mint, score);
  const candidateDecision = options.candidateEngine.evaluateCandidate(
    candidate.mint
  );

  const result: {
    candidateDecision?: CandidateDecision;
    riskSnapshot?: RiskSnapshot;
  } = {};

  if (candidateDecision) {
    result.candidateDecision = candidateDecision;
  }

  if (riskSnapshot) {
    result.riskSnapshot = riskSnapshot;
  }

  return result;
}

function createRiskInput(options: {
  event: FeedEvent;
  metrics: RollingMetrics;
  rollingMetrics: RollingMetricsSnapshot | undefined;
}): RiskInput {
  const riskFlags = options.event.riskFlags;
  const rolling = options.rollingMetrics;
  const scenario = getMockScenario(
    options.event.rawSourceEventType ?? options.event.source
  );
  const incompleteRealFeed =
    options.event.source === "pumpportal" &&
    options.event.metricsComplete === false;
  const input: RiskInput = {
    mint: getEventMint(options.event),
    source: options.event.source,
    mintAuthorityActive: incompleteRealFeed ? null : riskFlags.mintAuthorityActive,
    freezeAuthorityActive: incompleteRealFeed ? null : riskFlags.freezeAuthorityActive,
    metadataMutable: incompleteRealFeed ? null : riskFlags.mutableMetadata,
    holderCount: incompleteRealFeed ? null : options.metrics.holderCount,
    topHolderPct: incompleteRealFeed ? null : options.metrics.topHolderPercent,
    top10HolderPct: incompleteRealFeed ? null : options.metrics.top10HolderPercent,
    devHolderPct: incompleteRealFeed ? null : mockDevHolderPct(scenario),
    insiderHolderPct: incompleteRealFeed ? null : mockInsiderHolderPct(scenario),
    devSoldPct: incompleteRealFeed ? null : mockDevSoldPct(scenario),
    devNetFlowUsd: incompleteRealFeed ? null : mockDevNetFlowUsd(scenario),
    priorLaunchCount: incompleteRealFeed ? null : mockPriorLaunchCount(scenario),
    priorRugCount: incompleteRealFeed ? null : mockPriorRugCount(scenario),
    buySellRatio: rolling?.buySellRatio ?? null,
    netBuyPressure: rolling?.netBuyPressure ?? null,
    uniqueBuyers: rolling?.windows["10s"].uniqueBuyers ?? null,
    uniqueSellers: rolling?.windows["10s"].uniqueSellers ?? null,
    volumeVelocity: rolling?.volumeVelocityUsdPerSec ?? null,
    volumeAcceleration: rolling?.volumeAccelerationUsdPerSec2 ?? null,
    buyerVelocity: rolling?.buyerVelocityPerSec ?? null,
    buyerAcceleration: rolling?.buyerAccelerationPerSec2 ?? null,
    priceVelocity: rolling?.priceVelocityPctPerSec ?? null,
    priceAcceleration: rolling?.priceAccelerationPctPerSec2 ?? null,
    largestTradeShare: rolling?.largestTradeShare ?? null,
    sampleCount: rolling?.sampleCount ?? null,
    insufficientMetrics:
      rolling?.insufficientMetrics ?? (options.event.metricsComplete === false ? true : null),
    liquidityUsd: incompleteRealFeed ? null : options.metrics.liquidityUsd,
    marketCapUsd: incompleteRealFeed ? null : options.metrics.marketCapUsd,
    fdvUsd: incompleteRealFeed ? null : options.metrics.marketCapUsd,
    estimatedSellSlippagePct: incompleteRealFeed
      ? null
      : mockSellSlippagePct(scenario, riskFlags),
    sniperPct: incompleteRealFeed ? null : mockSniperPct(scenario),
    bundlerPct: incompleteRealFeed ? null : mockBundlerPct(scenario),
    washTradingSuspected: incompleteRealFeed ? null : riskFlags.washTradingSuspected,
    honeypotSuspected: incompleteRealFeed ? null : riskFlags.honeypotSuspected
  };
  const symbol = getEventSymbol(options.event);
  const name = getEventName(options.event);

  if (symbol) {
    input.symbol = symbol;
  }

  if (name) {
    input.name = name;
  }

  return input;
}

function getEventMint(event: FeedEvent): string {
  return event.type === "token_created" ? event.candidate.mint : event.mint;
}

function getEventSymbol(event: FeedEvent): string | undefined {
  return event.type === "token_created" ? event.candidate.symbol : event.symbol;
}

function getEventName(event: FeedEvent): string | undefined {
  return event.type === "token_created" ? event.candidate.name : event.name;
}

function createTokenCandidateFromReplayCandidate(candidate: {
  ageSeconds: number;
  firstSeenAt: string;
  mint: string;
  name?: string;
  source?: string;
  symbol?: string;
}): TokenCandidate {
  return {
    id: {
      chain: "solana",
      mint: candidate.mint
    },
    mint: candidate.mint,
    symbol: candidate.symbol ?? "UNKNOWN",
    name: candidate.name ?? candidate.symbol ?? "Unknown Token",
    source: candidate.source ?? "replay",
    ageSeconds: candidate.ageSeconds,
    firstSeenAt: candidate.firstSeenAt
  };
}

function mergeRollingIntoLegacyMetrics(
  metrics: RollingMetrics,
  rollingMetrics: RollingMetricsSnapshot | undefined
): RollingMetrics {
  if (!rollingMetrics || rollingMetrics.sampleCount === 0) {
    return metrics;
  }

  const window60s = rollingMetrics.windows["60s"];
  const window10s = rollingMetrics.windows["10s"];

  return {
    ...metrics,
    priceUsd: rollingMetrics.latestPriceUsd || metrics.priceUsd,
    volume1mUsd: window60s.totalVolumeUsd,
    volume5mUsd: Math.max(metrics.volume5mUsd, window60s.totalVolumeUsd),
    volume15mUsd: Math.max(metrics.volume15mUsd, window60s.totalVolumeUsd),
    buyCount1m: window60s.buyTradeCount,
    buyCount5m: Math.max(metrics.buyCount5m, window60s.buyTradeCount),
    sellCount1m: window60s.sellTradeCount,
    sellCount5m: Math.max(metrics.sellCount5m, window60s.sellTradeCount),
    uniqueBuyers1m: window60s.uniqueBuyers,
    uniqueBuyers5m: Math.max(metrics.uniqueBuyers5m, window60s.uniqueBuyers),
    uniqueSellers1m: window60s.uniqueSellers,
    uniqueSellers5m: Math.max(metrics.uniqueSellers5m, window60s.uniqueSellers),
    priceChange1mPct: window60s.priceChangePct,
    priceChange5mPct: window10s.priceChangePct,
    volumeVelocity: Math.max(
      metrics.volumeVelocity,
      rollingMetrics.volumeVelocityUsdPerSec
    ),
    buyerVelocity: Math.max(
      metrics.buyerVelocity,
      rollingMetrics.buyerVelocityPerSec
    )
  };
}

function getMockScenario(
  source: string
): "normal" | "momentum" | "rug" | "flat" | "unknown" {
  if (source.includes("momentum")) {
    return "momentum";
  }

  if (source.includes("rug")) {
    return "rug";
  }

  if (source.includes("flat")) {
    return "flat";
  }

  if (source.includes("normal") || source === "mock") {
    return "normal";
  }

  return "unknown";
}

function mockDevHolderPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 18 : scenario === "momentum" ? 3 : 6;
}

function mockInsiderHolderPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 28 : scenario === "momentum" ? 5 : 9;
}

function mockDevSoldPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 65 : 0;
}

function mockDevNetFlowUsd(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? -8_000 : 500;
}

function mockPriorLaunchCount(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 8 : 2;
}

function mockPriorRugCount(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 3 : 0;
}

function mockSellSlippagePct(
  scenario: ReturnType<typeof getMockScenario>,
  riskFlags: RiskFlags
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  if (scenario === "rug" || riskFlags.lowLiquidity) {
    return 22;
  }

  return scenario === "momentum" ? 3 : 6;
}

function mockSniperPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 30 : scenario === "momentum" ? 4 : 9;
}

function mockBundlerPct(scenario: ReturnType<typeof getMockScenario>): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 26 : scenario === "momentum" ? 3 : 7;
}
