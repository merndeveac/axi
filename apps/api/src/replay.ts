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
import type { FeedEvent, TokenTradeEvent } from "@axi/data-feeds";
import type {
  ChainTransactionEvent,
  NormalizedChainTradeEvent
} from "@axi/chain-events";
import {
  createMarketObservationSummary,
  marketObservationToMetricsTradeEvent,
  normalizeChainTradeEventToMarketObservation,
  normalizeChainTransactionToMarketObservations,
  type MarketObservation
} from "@axi/market-data";
import { createWatchPlan, type CandidateWatchPlan } from "@axi/watch-orchestrator";
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
  market: boolean;
  metrics: boolean;
  risk: boolean;
  speed: number;
  type: ReplaySource;
  watch: boolean;
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
    const marketObservation = getReplayMarketObservation({
      enabled: args.market || item.source === "market_observations",
      payload: item.payload,
      source: item.source
    });
    const replayFeedEvent =
      marketObservationToFeedEvent(marketObservation) ??
      getReplayFeedEvent(item.source, item.payload);
    const metrics =
      metricsEngine && replayFeedEvent
        ? metricsEngine.ingestFeedEvent(replayFeedEvent)
        : metricsEngine &&
            item.source === "chain_trade_events" &&
            isChainTradeEvent(item.payload)
          ? metricsEngine.ingestTradeObservation({
              mint: item.payload.mint,
              side: item.payload.side,
              ...(item.payload.priceUsd !== undefined
                ? { priceUsd: item.payload.priceUsd }
                : {}),
              ...(item.payload.symbol ? { symbol: item.payload.symbol } : {}),
              timestamp: item.payload.timestamp,
              ...(item.payload.trader ? { trader: item.payload.trader } : {}),
              ...(item.payload.volumeUsd !== undefined
                ? { volumeUsd: item.payload.volumeUsd }
                : {})
            })
          : undefined;
    const replayEvaluation =
      replayFeedEvent
        ? evaluateReplayFeedEvent({
            event: replayFeedEvent,
            metrics,
            metricsEngine,
            riskEngine,
            candidateEngine
          })
        : {};
    const watchPlan =
      args.watch && replayFeedEvent && item.source === "feed_events"
        ? createReplayWatchPlan(replayFeedEvent)
        : undefined;

    console.log(
      JSON.stringify({
        createdAt: item.createdAt,
        candidateDecision: args.candidates
          ? replayEvaluation.candidateDecision
          : undefined,
        chainObservationOnly:
          (item.source === "chain_trade_events" ||
            item.source === "chain_transaction_events") &&
          !replayFeedEvent
            ? true
            : undefined,
        marketObservation:
          args.market || item.source === "market_observations"
            ? marketObservation
            : undefined,
        metrics: args.metrics ? metrics : undefined,
        payload: item.payload,
        riskSnapshot: args.risk ? replayEvaluation.riskSnapshot : undefined,
        sequence: item.sequence,
        source: item.source,
        watchPlan
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
    market: false,
    metrics: false,
    risk: false,
    speed: 0,
    type: "feed_events",
    watch: false
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

    if (arg === "--market") {
      parsed.market = parseBoolean(readValue(argv, index, arg), arg);
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

    if (arg === "--watch") {
      parsed.watch = parseBoolean(readValue(argv, index, arg), arg);
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
          "--type must be actual_data_sessions, actual_data_subscriptions, candidate_decisions, chain_transaction_events, chain_trade_events, chain_verifications, feed_events, market_observations, pumpportal_token_trade_events, risk_snapshots, signals, watch_actions, or watch_plans"
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
    value === "actual_data_sessions" ||
    value === "actual_data_subscriptions" ||
    value === "candidate_decisions" ||
    value === "chain_transaction_events" ||
    value === "chain_trade_events" ||
    value === "chain_verifications" ||
    value === "feed_events" ||
    value === "market_observations" ||
    value === "pumpportal_token_trade_events" ||
    value === "watch_actions" ||
    value === "watch_plans" ||
    value === "risk_snapshots" ||
    value === "signals"
  );
}

function createReplayWatchPlan(event: FeedEvent): CandidateWatchPlan {
  return createWatchPlan({
    event,
    options: {
      enabled: true,
      verifyOnNewToken: true,
      verifyOnMigration: true,
      watchOnNewToken: true,
      watchOnMigration: true
    }
  });
}

function isFeedEvent(value: unknown): value is FeedEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "token_created" || value.type === "trade")
  );
}

function isChainTradeEvent(value: unknown): value is NormalizedChainTradeEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "trade" &&
    "source" in value &&
    value.source === "solana_rpc" &&
    "mint" in value &&
    typeof value.mint === "string"
  );
}

function isChainTransactionEvent(value: unknown): value is ChainTransactionEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "chain_transaction" &&
    "source" in value &&
    value.source === "solana_rpc" &&
    "signature" in value &&
    typeof value.signature === "string"
  );
}

function isMarketObservation(value: unknown): value is MarketObservation {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "market_observation" &&
    "source" in value &&
    value.source === "solana_rpc" &&
    "mint" in value &&
    typeof value.mint === "string"
  );
}

function getReplayMarketObservation(options: {
  enabled: boolean;
  payload: unknown;
  source: ReplaySource;
}): MarketObservation | undefined {
  if (!options.enabled) {
    return undefined;
  }

  if (
    options.source === "market_observations" &&
    isMarketObservation(options.payload)
  ) {
    return options.payload;
  }

  if (
    options.source === "chain_trade_events" &&
    isChainTradeEvent(options.payload)
  ) {
    return normalizeChainTradeEventToMarketObservation(options.payload);
  }

  if (
    options.source === "chain_transaction_events" &&
    isChainTransactionEvent(options.payload)
  ) {
    return normalizeChainTransactionToMarketObservations({
      chainTransactionEvent: options.payload
    })[0];
  }

  return undefined;
}

function getReplayFeedEvent(
  source: ReplaySource,
  payload: unknown
): FeedEvent | undefined {
  if (source === "feed_events" && isFeedEvent(payload)) {
    return payload;
  }

  if (source === "pumpportal_token_trade_events" && isFeedEvent(payload)) {
    return payload;
  }

  if (source === "chain_trade_events" && isChainTradeEvent(payload)) {
    return chainTradeToFeedEvent(payload) ?? undefined;
  }

  return undefined;
}

function marketObservationToFeedEvent(
  observation: MarketObservation | undefined
): TokenTradeEvent | undefined {
  if (!observation) {
    return undefined;
  }

  const metricsEvent = marketObservationToMetricsTradeEvent(observation);

  if (!metricsEvent) {
    return undefined;
  }

  return createFeedEventFromMarketObservation(observation, metricsEvent.side);
}

function chainTradeToFeedEvent(
  event: NormalizedChainTradeEvent
): TokenTradeEvent | null {
  if (event.confidence === "low" || event.side === "unknown") {
    return null;
  }

  if (
    event.priceUsd === null ||
    event.priceUsd === undefined ||
    event.volumeUsd === null ||
    event.volumeUsd === undefined ||
    !Number.isFinite(event.priceUsd) ||
    !Number.isFinite(event.volumeUsd)
  ) {
    return null;
  }

  const riskFlags = createSafeRiskFlags();
  const metrics: RollingMetrics = {
    priceUsd: event.priceUsd,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: event.volumeUsd,
    volume5mUsd: event.volumeUsd,
    volume15mUsd: event.volumeUsd,
    buyCount1m: event.side === "buy" ? 1 : 0,
    buyCount5m: event.side === "buy" ? 1 : 0,
    sellCount1m: event.side === "sell" ? 1 : 0,
    sellCount5m: event.side === "sell" ? 1 : 0,
    uniqueBuyers1m: event.side === "buy" ? 1 : 0,
    uniqueBuyers5m: event.side === "buy" ? 1 : 0,
    uniqueSellers1m: event.side === "sell" ? 1 : 0,
    uniqueSellers5m: event.side === "sell" ? 1 : 0,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: 0,
    priceChange5mPct: 0,
    volumeVelocity: 0,
    buyerVelocity: 0
  };

  return {
    type: "trade",
    mint: event.mint,
    source: "solana_rpc",
    ...(event.symbol ? { symbol: event.symbol } : {}),
    ...(event.name ? { name: event.name } : {}),
    token: {
      chain: "solana",
      mint: event.mint
    },
    side: event.side,
    priceUsd: event.priceUsd,
    volumeUsd: event.volumeUsd,
    ...(event.tokenAmount !== null && event.tokenAmount !== undefined
      ? { tokenAmount: event.tokenAmount }
      : {}),
    ...(event.trader ? { trader: event.trader } : {}),
    signature: event.signature,
    metrics,
    metricsComplete: true,
    raw: event,
    rawSourceEventType: "chain_trade",
    reasonCodes: [
      "CHAIN_TRADE_EVENT",
      event.confidence === "high"
        ? "CHAIN_EVENT_HIGH_CONFIDENCE"
        : "CHAIN_EVENT_MEDIUM_CONFIDENCE",
      ...event.reasonCodes
    ],
    receivedAt: event.timestamp,
    riskFlags,
    timestamp: event.timestamp
  };
}

function createFeedEventFromMarketObservation(
  observation: MarketObservation,
  side: "buy" | "sell"
): TokenTradeEvent {
  const riskFlags = createSafeRiskFlags();
  const metrics: RollingMetrics = {
    priceUsd: observation.priceUsd ?? 0,
    ...(observation.priceSol !== null ? { priceSol: observation.priceSol } : {}),
    ...(observation.priceQuote !== null
      ? { priceQuote: observation.priceQuote }
      : {}),
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: observation.volumeUsd ?? 0,
    volume5mUsd: observation.volumeUsd ?? 0,
    volume15mUsd: observation.volumeUsd ?? 0,
    ...(observation.volumeSol !== null
      ? { volumeSol: observation.volumeSol }
      : {}),
    ...(observation.volumeQuote !== null
      ? { volumeQuote: observation.volumeQuote }
      : {}),
    quoteAsset: observation.quoteAsset,
    quoteMint: observation.quoteMint,
    usableForMetrics: observation.usableForMetrics,
    confidence: observation.confidence,
    reasonCodes: observation.reasonCodes,
    buyCount1m: side === "buy" ? 1 : 0,
    buyCount5m: side === "buy" ? 1 : 0,
    sellCount1m: side === "sell" ? 1 : 0,
    sellCount5m: side === "sell" ? 1 : 0,
    uniqueBuyers1m: side === "buy" ? 1 : 0,
    uniqueBuyers5m: side === "buy" ? 1 : 0,
    uniqueSellers1m: side === "sell" ? 1 : 0,
    uniqueSellers5m: side === "sell" ? 1 : 0,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: 0,
    priceChange5mPct: 0,
    volumeVelocity: 0,
    buyerVelocity: 0
  };

  return {
    type: "trade",
    mint: observation.mint,
    source: "solana_rpc",
    ...(observation.symbol ? { symbol: observation.symbol } : {}),
    token: {
      chain: "solana",
      mint: observation.mint
    },
    side,
    priceUsd: observation.priceUsd,
    volumeUsd: observation.volumeUsd,
    ...(observation.priceSol !== null ? { priceSol: observation.priceSol } : {}),
    ...(observation.volumeSol !== null ? { volumeSol: observation.volumeSol } : {}),
    ...(observation.priceQuote !== null
      ? { priceQuote: observation.priceQuote }
      : {}),
    ...(observation.volumeQuote !== null
      ? { volumeQuote: observation.volumeQuote }
      : {}),
    quoteAsset: observation.quoteAsset,
    quoteMint: observation.quoteMint,
    ...(observation.baseTokenAmount !== null
      ? { tokenAmount: observation.baseTokenAmount }
      : {}),
    ...(observation.watchedAddress ? { trader: observation.watchedAddress } : {}),
    signature: observation.signature,
    metrics,
    marketObservation: createMarketObservationSummary(observation),
    metricsComplete: true,
    raw: observation,
    rawSourceEventType: "market_observation",
    reasonCodes: [
      "CHAIN_TRADE_EVENT",
      "MARKET_OBSERVATION",
      ...observation.reasonCodes
    ],
    receivedAt: observation.timestamp,
    riskFlags,
    timestamp: observation.timestamp,
    usableForMetrics: observation.usableForMetrics,
    confidence: observation.confidence
  };
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
    (options.event.metricsComplete === false ||
      options.event.reasonCodes?.includes("PUMPPORTAL_TOKEN_TRADE") === true);
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
    volumeVelocity: getEffectiveVolumeVelocity(rolling) ?? null,
    volumeAcceleration: getEffectiveVolumeAcceleration(rolling) ?? null,
    buyerVelocity: rolling?.buyerVelocityPerSec ?? null,
    buyerAcceleration: rolling?.buyerAccelerationPerSec2 ?? null,
    priceVelocity: getEffectivePriceVelocity(rolling) ?? null,
    priceAcceleration: getEffectivePriceAcceleration(rolling) ?? null,
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
    priceSol: rollingMetrics.latestPriceSol ?? metrics.priceSol ?? null,
    volume1mUsd: window60s.totalVolumeUsd,
    volume5mUsd: Math.max(metrics.volume5mUsd, window60s.totalVolumeUsd),
    volume15mUsd: Math.max(metrics.volume15mUsd, window60s.totalVolumeUsd),
    volumeSol: window60s.totalVolumeSol ?? metrics.volumeSol ?? null,
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

function getEffectiveVolumeVelocity(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? metrics.volumeVelocitySolPerSec ?? 0
    : metrics.volumeVelocityUsdPerSec;
}

function getEffectiveVolumeAcceleration(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? metrics.volumeAccelerationSolPerSec2 ?? 0
    : metrics.volumeAccelerationUsdPerSec2;
}

function getEffectivePriceVelocity(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? metrics.priceSolVelocityPctPerSec ?? 0
    : metrics.priceVelocityPctPerSec;
}

function getEffectivePriceAcceleration(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? metrics.priceSolAccelerationPctPerSec2 ?? 0
    : metrics.priceAccelerationPctPerSec2;
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

function createSafeRiskFlags(): RiskFlags {
  return {
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    topHolderConcentrationHigh: false,
    mutableMetadata: false,
    suspiciousName: false,
    lowLiquidity: false,
    washTradingSuspected: false,
    honeypotSuspected: false
  };
}
