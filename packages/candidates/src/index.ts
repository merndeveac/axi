import type { FeedEvent } from "@axi/data-feeds";
import type {
  ChainVerificationSummary,
  ChainVerificationStatus,
  CandidateDecision,
  CandidateDecisionAction,
  CandidateLifecycleState,
  CandidateMetricsSummary,
  CandidateRiskSummary,
  MarketObservationSummary,
  RiskLevel,
  RiskSnapshot,
  RollingMetricsSnapshot,
  ScoreBreakdown,
  TokenCandidate,
  TokenIdentitySummary,
  WatchPlanSummary
} from "@axi/shared";

export type CandidateLifecycleEngineOptions = {
  maxAgeSeconds?: number;
  maxDecisionHistory?: number;
  maxRiskLevelForPaperBuyReady?: RiskLevel;
  minAgeSeconds?: number;
  minSampleCount?: number;
  minScoreForPaperBuyReady?: number;
  now?: () => Date;
};

export type PaperOrderStatus = "none" | "submitted" | "accepted" | "rejected";

export type CandidateState = {
  mint: string;
  symbol?: string;
  name?: string;
  title?: string;
  displayName?: string;
  metadataUri?: string | null;
  imageUri?: string | null;
  description?: string | null;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  discord?: string | null;
  creator?: string | null;
  identity?: TokenIdentitySummary;
  identityConfidence?: TokenIdentitySummary["confidence"];
  identityResolved?: boolean;
  identityReasonCodes?: string[];
  identitySource?: TokenIdentitySummary["dataSource"];
  source?: string;
  firstSeenAt: string;
  lastUpdatedAt: string;
  ageSeconds: number;
  eventTypesSeen: string[];
  lifecycleState: CandidateLifecycleState;
  latestMetrics?: RollingMetricsSnapshot;
  latestRisk?: RiskSnapshot;
  latestScore?: ScoreBreakdown;
  latestDecision?: CandidateDecision;
  chainVerificationStatus?: ChainVerificationStatus;
  chainVerification?: ChainVerificationSummary;
  chainVerifiedAt?: string;
  chainReasonCodes?: string[];
  latestMarketObservationSummary?: MarketObservationSummary;
  marketReasonCodes?: string[];
  latestWatchPlanSummary?: WatchPlanSummary;
  watchReasonCodes?: string[];
  onChainMintAuthorityActive?: boolean | null;
  onChainFreezeAuthorityActive?: boolean | null;
  onChainSupplyUi?: number | null;
  onChainTopHolderPct?: number | null;
  onChainTop10HolderPct?: number | null;
  decisionHistory: CandidateDecision[];
  ignoredReasonCodes: string[];
  rejectedReasonCodes: string[];
  paperOrderStatus: PaperOrderStatus;
};

type EngineConfig = Required<
  Omit<CandidateLifecycleEngineOptions, "maxRiskLevelForPaperBuyReady" | "now">
> & {
  maxRiskLevelForPaperBuyReady: RiskLevel;
  now: () => Date;
};

export class CandidateLifecycleEngine {
  private readonly config: EngineConfig;
  private readonly candidates = new Map<string, CandidateState>();

  constructor(options: CandidateLifecycleEngineOptions = {}) {
    this.config = {
      maxAgeSeconds: options.maxAgeSeconds ?? 900,
      maxDecisionHistory: options.maxDecisionHistory ?? 50,
      maxRiskLevelForPaperBuyReady:
        options.maxRiskLevelForPaperBuyReady ?? "medium",
      minAgeSeconds: options.minAgeSeconds ?? 3,
      minSampleCount: options.minSampleCount ?? 8,
      minScoreForPaperBuyReady: options.minScoreForPaperBuyReady ?? 75,
      now: options.now ?? (() => new Date())
    };
  }

  ingestFeedEvent(event: FeedEvent): CandidateState {
    const mint = getEventMint(event);
    const state = this.ensureCandidate(mint, event);

    state.lastUpdatedAt = getEventTimestamp(event);
    state.eventTypesSeen = unique([...state.eventTypesSeen, event.type]);
    state.ageSeconds = getEventAgeSeconds(event, state);

    if (event.type === "token_created") {
      state.symbol = event.candidate.symbol;
      state.name = event.candidate.name;
      applyCandidateIdentityFields(state, event.candidate);
      state.source = event.candidate.source;
      state.firstSeenAt = minIsoTimestamp(
        state.firstSeenAt,
        event.candidate.firstSeenAt
      );
    } else if (event.type === "trade") {
      if (event.symbol) {
        state.symbol = event.symbol;
      }

      if (event.name) {
        state.name = event.name;
      }

      applyOptionalIdentityFields(state, event);

      state.source = event.source;
    } else {
      state.source = event.source;
    }

    if (state.lifecycleState === "new" && event.type === "trade") {
      state.lifecycleState = "warming";
    }

    return state;
  }

  updateMetrics(
    mint: string,
    metrics: RollingMetricsSnapshot | undefined
  ): CandidateState | undefined {
    const state = this.candidates.get(mint);

    if (!state || !metrics) {
      return state;
    }

    state.latestMetrics = metrics;
    state.lastUpdatedAt = metrics.lastUpdatedAt;

    if (metrics.sampleCount > 0 && state.lifecycleState === "new") {
      state.lifecycleState = metrics.insufficientMetrics
        ? "warming"
        : "watching";
    }

    return state;
  }

  updateRisk(
    mint: string,
    riskSnapshot: RiskSnapshot
  ): CandidateState | undefined {
    const state = this.candidates.get(mint);

    if (!state) {
      return undefined;
    }

    state.latestRisk = riskSnapshot;
    state.lastUpdatedAt = riskSnapshot.updatedAt;

    if (riskSnapshot.hardReject) {
      state.lifecycleState = "rejected";
      state.rejectedReasonCodes = unique([
        ...state.rejectedReasonCodes,
        ...riskSnapshot.reasonCodes
      ]);
    }

    return state;
  }

  updateScore(mint: string, score: ScoreBreakdown): CandidateState | undefined {
    const state = this.candidates.get(mint);

    if (!state) {
      return undefined;
    }

    state.latestScore = score;
    return state;
  }

  updateChainVerification(
    mint: string,
    summary: ChainVerificationSummary
  ): CandidateState | undefined {
    const state = this.candidates.get(mint);

    if (!state) {
      return undefined;
    }

    state.chainVerification = summary;
    state.chainVerificationStatus = summary.status;
    state.chainReasonCodes = summary.reasonCodes;
    state.lastUpdatedAt = summary.inspectedAt ?? state.lastUpdatedAt;

    if (summary.inspectedAt) {
      state.chainVerifiedAt = summary.inspectedAt;
    }

    state.onChainMintAuthorityActive =
      summary.mintAuthorityActive === undefined
        ? null
        : summary.mintAuthorityActive;
    state.onChainFreezeAuthorityActive =
      summary.freezeAuthorityActive === undefined
        ? null
        : summary.freezeAuthorityActive;
    state.onChainSupplyUi =
      summary.supplyUi === undefined ? null : summary.supplyUi;
    state.onChainTopHolderPct =
      summary.topHolderPct === undefined ? null : summary.topHolderPct;
    state.onChainTop10HolderPct =
      summary.top10HolderPct === undefined ? null : summary.top10HolderPct;

    return state;
  }

  updateMarketObservation(
    mint: string,
    summary: MarketObservationSummary
  ): CandidateState | undefined {
    const state = this.candidates.get(mint);

    if (!state) {
      return undefined;
    }

    state.latestMarketObservationSummary = summary;
    state.marketReasonCodes = summary.reasonCodes;
    state.lastUpdatedAt = summary.createdAt;

    return state;
  }

  updateWatchPlan(
    mint: string,
    summary: WatchPlanSummary
  ): CandidateState | undefined {
    const state = this.candidates.get(mint);

    if (!state) {
      return undefined;
    }

    state.latestWatchPlanSummary = summary;
    state.watchReasonCodes = summary.reasonCodes;
    state.lastUpdatedAt = summary.createdAt;

    return state;
  }

  updateTokenIdentity(
    mint: string,
    identity: TokenIdentitySummary
  ): CandidateState | undefined {
    const state = this.candidates.get(mint);

    if (!state) {
      return undefined;
    }

    state.identity = identity;
    state.identityConfidence = identity.confidence;
    state.identityResolved = identity.resolved;
    state.identityReasonCodes = identity.reasonCodes;
    state.identitySource = identity.dataSource;
    state.title = identity.title;
    state.displayName = identity.displayName;
    state.metadataUri = identity.metadataUri;
    state.imageUri = identity.imageUri;
    state.description = identity.description;
    state.website = identity.website;
    state.twitter = identity.twitter;
    state.telegram = identity.telegram;
    state.discord = identity.discord;
    state.creator = identity.creator;
    state.source = identity.dataSource;

    if (identity.symbol) {
      state.symbol = identity.symbol;
    }

    if (identity.name) {
      state.name = identity.name;
    }

    return state;
  }

  markPaperOrderSubmitted(
    mint: string,
    reasonCodes: string[] = ["PAPER_ORDER_SUBMITTED"]
  ): CandidateDecision | undefined {
    const state = this.candidates.get(mint);

    if (!state) {
      return undefined;
    }

    state.paperOrderStatus = "submitted";
    state.lifecycleState = "paper_ordered";
    const decision = this.evaluateCandidate(mint);

    if (!decision) {
      return undefined;
    }

    decision.combinedReasonCodes = unique([
      ...reasonCodes,
      ...decision.combinedReasonCodes
    ]);
    state.latestDecision = decision;
    state.decisionHistory = [decision, ...state.decisionHistory].slice(
      0,
      this.config.maxDecisionHistory
    );
    return decision;
  }

  evaluateCandidate(
    mint: string,
    evidence: { sourceEventKey?: string } = {}
  ): CandidateDecision | undefined {
    const state = this.candidates.get(mint);

    if (!state) {
      return undefined;
    }

    const decision = this.createDecision(state);
    decision.decisionVersion = (state.latestDecision?.decisionVersion ?? 0) + 1;
    decision.decisionId = `candidate-decision:${state.mint}:${decision.decisionVersion}`;
    if (evidence.sourceEventKey) {
      decision.sourceEventKey = evidence.sourceEventKey;
    }
    state.latestDecision = decision;
    state.decisionHistory = [decision, ...state.decisionHistory].slice(
      0,
      this.config.maxDecisionHistory
    );

    if (decision.lifecycleState === "rejected") {
      state.rejectedReasonCodes = unique([
        ...state.rejectedReasonCodes,
        ...decision.combinedReasonCodes
      ]);
    }

    if (decision.lifecycleState === "ignored") {
      state.ignoredReasonCodes = unique([
        ...state.ignoredReasonCodes,
        ...decision.combinedReasonCodes
      ]);
    }

    state.lifecycleState = decision.lifecycleState;
    return decision;
  }

  getCandidate(mint: string): CandidateState | undefined {
    return this.candidates.get(mint);
  }

  getAllCandidates(): CandidateState[] {
    return Array.from(this.candidates.values());
  }

  resetCandidate(mint: string): void {
    this.candidates.delete(mint);
  }

  clear(): void {
    this.candidates.clear();
  }

  private ensureCandidate(mint: string, event: FeedEvent): CandidateState {
    const existing = this.candidates.get(mint);

    if (existing) {
      return existing;
    }

    const timestamp = getEventTimestamp(event);
    const state: CandidateState = {
      mint,
      firstSeenAt: getFirstSeenAt(event),
      lastUpdatedAt: timestamp,
      ageSeconds: getEventAgeSeconds(event),
      eventTypesSeen: [event.type],
      lifecycleState: "new",
      decisionHistory: [],
      ignoredReasonCodes: [],
      rejectedReasonCodes: [],
      paperOrderStatus: "none"
    };

    if (event.type === "token_created") {
      state.symbol = event.candidate.symbol;
      state.name = event.candidate.name;
      applyCandidateIdentityFields(state, event.candidate);
      state.source = event.candidate.source;
    } else if (event.type === "trade") {
      if (event.symbol) {
        state.symbol = event.symbol;
      }

      if (event.name) {
        state.name = event.name;
      }

      applyOptionalIdentityFields(state, event);
      state.source = event.source;
    } else {
      state.source = event.source;
    }

    this.candidates.set(mint, state);
    return state;
  }

  private createDecision(state: CandidateState): CandidateDecision {
    const score = state.latestScore;
    const risk = state.latestRisk;
    const metrics = state.latestMetrics;
    const metricsSummary = createMetricsSummary(metrics, state.lastUpdatedAt);
    const riskSummary = createRiskSummary(risk);
    const riskReasonCodes = risk?.reasonCodes ?? ["UNKNOWN_RISK"];
    const scoreReasonCodes = score?.reasonCodes ?? ["NO_SCORE_YET"];
    const chainReasonCodes = state.chainReasonCodes ?? [];
    const marketReasonCodes = state.marketReasonCodes ?? [];
    const watchReasonCodes = state.watchReasonCodes ?? [];
    const lifecycleReasonCodes: string[] = [];
    let lifecycleState: CandidateLifecycleState = state.lifecycleState;
    let action: CandidateDecisionAction = "IGNORE";
    const totalScore = score?.total ?? 0;
    const hardReject = risk?.hardReject ?? score?.hardReject ?? false;

    if (state.paperOrderStatus === "submitted") {
      lifecycleState = "paper_ordered";
      action = "PAPER_ORDER_SUBMITTED";
      lifecycleReasonCodes.push("PAPER_ORDER_SUBMITTED");
    } else if (hardReject || risk?.riskLevel === "critical") {
      lifecycleState = "rejected";
      action = "REJECT";
      lifecycleReasonCodes.push(
        risk?.riskLevel === "critical" ? "CRITICAL_RISK" : "RISK_HARD_REJECT"
      );
    } else if (
      metricsSummary.insufficientMetrics ||
      metricsSummary.sampleCount < this.config.minSampleCount
    ) {
      lifecycleState = metricsSummary.sampleCount > 0 ? "warming" : "new";
      action = metricsSummary.sampleCount > 0 ? "WATCH" : "IGNORE";
      lifecycleReasonCodes.push("INSUFFICIENT_TRADE_METRICS");
    } else if (
      compareRiskLevel(
        riskSummary.riskLevel,
        this.config.maxRiskLevelForPaperBuyReady
      ) > 0
    ) {
      lifecycleState = "watching";
      action = "WATCH";
      lifecycleReasonCodes.push("RISK_LEVEL_TOO_HIGH");
    } else if (state.ageSeconds < this.config.minAgeSeconds) {
      lifecycleState = "warming";
      action = "WATCH";
      lifecycleReasonCodes.push("CANDIDATE_TOO_NEW");
    } else if (state.ageSeconds > this.config.maxAgeSeconds) {
      lifecycleState = "ignored";
      action = "IGNORE";
      lifecycleReasonCodes.push("CANDIDATE_TOO_OLD");
    } else if (totalScore >= this.config.minScoreForPaperBuyReady) {
      lifecycleState = "qualified";
      action = "PAPER_BUY_READY";
      lifecycleReasonCodes.push("PAPER_BUY_READY");
    } else if (totalScore >= 45) {
      lifecycleState = "watching";
      action = "WATCH";
      lifecycleReasonCodes.push("SCORE_WATCH");
    } else {
      lifecycleState = "ignored";
      action = "IGNORE";
      lifecycleReasonCodes.push("SCORE_TOO_LOW");
    }

    const decision: CandidateDecision = {
      mint: state.mint,
      lifecycleState,
      action,
      score: totalScore,
      riskLevel: riskSummary.riskLevel,
      hardReject: action === "REJECT" || hardReject,
      riskReasonCodes,
      scoreReasonCodes,
      combinedReasonCodes: unique([
        ...lifecycleReasonCodes,
        ...riskReasonCodes,
        ...scoreReasonCodes,
        ...chainReasonCodes,
        ...marketReasonCodes,
        ...watchReasonCodes
      ]),
      metricsSummary,
      riskSnapshotSummary: riskSummary,
      createdAt: state.firstSeenAt,
      updatedAt: state.lastUpdatedAt
    };

    if (state.symbol) {
      decision.symbol = state.symbol;
    }

    if (state.name) {
      decision.name = state.name;
    }

    if (state.title) {
      decision.title = state.title;
    }

    if (state.displayName) {
      decision.displayName = state.displayName;
    }

    if (state.imageUri !== undefined) {
      decision.imageUri = state.imageUri;
    }

    if (state.identity) {
      decision.identity = state.identity;
      decision.identityConfidence = state.identity.confidence;
      decision.identityResolved = state.identity.resolved;
      decision.identityReasonCodes = state.identity.reasonCodes;
      decision.identitySource = state.identity.dataSource;
    }

    if (state.source) {
      decision.source = state.source;
    }

    if (state.chainVerification) {
      decision.chainVerification = state.chainVerification;
    }

    if (state.chainVerificationStatus) {
      decision.chainVerificationStatus = state.chainVerificationStatus;
    }

    if (state.chainVerifiedAt) {
      decision.chainVerifiedAt = state.chainVerifiedAt;
    }

    if (state.chainReasonCodes) {
      decision.chainReasonCodes = state.chainReasonCodes;
    }

    if (state.onChainMintAuthorityActive !== undefined) {
      decision.onChainMintAuthorityActive = state.onChainMintAuthorityActive;
    }

    if (state.onChainFreezeAuthorityActive !== undefined) {
      decision.onChainFreezeAuthorityActive =
        state.onChainFreezeAuthorityActive;
    }

    if (state.onChainSupplyUi !== undefined) {
      decision.onChainSupplyUi = state.onChainSupplyUi;
    }

    if (state.onChainTopHolderPct !== undefined) {
      decision.onChainTopHolderPct = state.onChainTopHolderPct;
    }

    if (state.onChainTop10HolderPct !== undefined) {
      decision.onChainTop10HolderPct = state.onChainTop10HolderPct;
    }

    if (state.latestMarketObservationSummary) {
      decision.marketObservationSummary = state.latestMarketObservationSummary;
    }

    if (state.marketReasonCodes) {
      decision.marketReasonCodes = state.marketReasonCodes;
    }

    if (state.latestWatchPlanSummary) {
      decision.watchPlanSummary = state.latestWatchPlanSummary;
    }

    if (state.watchReasonCodes) {
      decision.watchReasonCodes = state.watchReasonCodes;
    }

    return decision;
  }
}

export function createCandidateLifecycleEngine(
  options: CandidateLifecycleEngineOptions = {}
): CandidateLifecycleEngine {
  return new CandidateLifecycleEngine(options);
}

function applyOptionalIdentityFields(
  state: CandidateState,
  event: FeedEvent
): void {
  if (event.type === "token_created") {
    return;
  }

  const metadataEvent = event as FeedEvent & {
    description?: string;
    discord?: string;
    imageUri?: string;
    metadataUri?: string;
    telegram?: string;
    twitter?: string;
    website?: string;
  };

  if (metadataEvent.metadataUri) {
    state.metadataUri = metadataEvent.metadataUri;
  }

  if (metadataEvent.imageUri) {
    state.imageUri = metadataEvent.imageUri;
  }

  if (metadataEvent.description) {
    state.description = metadataEvent.description;
  }

  if (metadataEvent.website) {
    state.website = metadataEvent.website;
  }

  if (metadataEvent.twitter) {
    state.twitter = metadataEvent.twitter;
  }

  if (metadataEvent.telegram) {
    state.telegram = metadataEvent.telegram;
  }

  if (metadataEvent.discord) {
    state.discord = metadataEvent.discord;
  }
}

function applyCandidateIdentityFields(
  state: CandidateState,
  candidate: TokenCandidate
): void {
  if (candidate.title) {
    state.title = candidate.title;
  }

  if (candidate.displayName) {
    state.displayName = candidate.displayName;
  }

  if (candidate.metadataUri !== undefined) {
    state.metadataUri = candidate.metadataUri;
  }

  if (candidate.imageUri !== undefined) {
    state.imageUri = candidate.imageUri;
  }

  if (candidate.description !== undefined) {
    state.description = candidate.description;
  }

  if (candidate.website !== undefined) {
    state.website = candidate.website;
  }

  if (candidate.twitter !== undefined) {
    state.twitter = candidate.twitter;
  }

  if (candidate.telegram !== undefined) {
    state.telegram = candidate.telegram;
  }

  if (candidate.discord !== undefined) {
    state.discord = candidate.discord;
  }

  if (candidate.creator !== undefined) {
    state.creator = candidate.creator;
  }
}

function createMetricsSummary(
  metrics: RollingMetricsSnapshot | undefined,
  fallbackTimestamp: string
): CandidateMetricsSummary {
  if (!metrics) {
    return {
      sampleCount: 0,
      insufficientMetrics: true,
      volume10sUsd: 0,
      volume10sSol: 0,
      volumeVelocity: 0,
      volumeAcceleration: 0,
      volumeVelocitySol: 0,
      volumeAccelerationSol: 0,
      buyerVelocity: 0,
      buyerAcceleration: 0,
      priceVelocity: 0,
      priceSolVelocity: 0,
      usedSolMetricsFallback: false,
      buySellRatio: 1,
      netBuyPressure: 0,
      lastUpdatedAt: fallbackTimestamp
    };
  }

  return {
    sampleCount: metrics.sampleCount,
    insufficientMetrics: metrics.insufficientMetrics,
    volume10sUsd: metrics.windows["10s"].totalVolumeUsd,
    volume10sSol: metrics.windows["10s"].totalVolumeSol ?? 0,
    volumeVelocity: metrics.volumeVelocityUsdPerSec,
    volumeAcceleration: metrics.volumeAccelerationUsdPerSec2,
    volumeVelocitySol: metrics.volumeVelocitySolPerSec ?? 0,
    volumeAccelerationSol: metrics.volumeAccelerationSolPerSec2 ?? 0,
    buyerVelocity: metrics.buyerVelocityPerSec,
    buyerAcceleration: metrics.buyerAccelerationPerSec2,
    priceVelocity: metrics.priceVelocityPctPerSec,
    priceSolVelocity: metrics.priceSolVelocityPctPerSec ?? 0,
    usedSolMetricsFallback: metrics.usedSolMetricsFallback ?? false,
    buySellRatio: metrics.buySellRatio,
    netBuyPressure: metrics.netBuyPressure,
    lastUpdatedAt: metrics.lastUpdatedAt
  };
}

function createRiskSummary(
  risk: RiskSnapshot | undefined
): CandidateRiskSummary {
  if (!risk) {
    return {
      riskLevel: "unknown",
      riskScore: 0,
      hardReject: false,
      humanSummary: "Risk data is not available yet."
    };
  }

  return {
    riskLevel: risk.riskLevel,
    riskScore: risk.riskScore,
    hardReject: risk.hardReject,
    humanSummary: risk.humanSummary
  };
}

function getEventMint(event: FeedEvent): string {
  return event.type === "token_created" ? event.candidate.mint : event.mint;
}

function getEventTimestamp(event: FeedEvent): string {
  return event.timestamp;
}

function getFirstSeenAt(event: FeedEvent): string {
  return event.type === "token_created"
    ? event.candidate.firstSeenAt
    : event.timestamp;
}

function getEventAgeSeconds(event: FeedEvent, state?: CandidateState): number {
  if (event.type === "token_created") {
    return event.candidate.ageSeconds;
  }

  if (!state) {
    return 0;
  }

  const ageMillis = Date.parse(event.timestamp) - Date.parse(state.firstSeenAt);
  return Number.isFinite(ageMillis)
    ? Math.max(0, ageMillis / 1000)
    : state.ageSeconds;
}

function compareRiskLevel(left: RiskLevel, right: RiskLevel): number {
  return riskLevelRank(left) - riskLevelRank(right);
}

function riskLevelRank(level: RiskLevel): number {
  switch (level) {
    case "unknown":
      return 1;
    case "low":
      return 2;
    case "medium":
      return 3;
    case "high":
      return 4;
    case "critical":
      return 5;
  }
}

function minIsoTimestamp(left: string, right: string): string {
  return new Date(Math.min(Date.parse(left), Date.parse(right))).toISOString();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
