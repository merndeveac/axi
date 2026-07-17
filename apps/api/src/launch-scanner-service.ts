import {
  evaluateLaunchMomentum,
  type LaunchMomentumSnapshot,
  type LaunchTradeSample
} from "@axi/launch-momentum";
import {
  getDerivativeStrengthAgeBucket,
  type DerivativeStrengthCohort,
  type DerivativeStrengthMetricName
} from "@axi/derivative-strength";
import {
  type FeedEvent,
  type TokenCreatedEvent,
  type TokenTradeEvent
} from "@axi/data-feeds";
import type { RiskSnapshot } from "@axi/shared";
import {
  saveLaunchCandidate,
  saveLaunchScoreSnapshot,
  saveLaunchTrackingSession,
  saveLaunchTradeSample
} from "@axi/storage";
import {
  ActualDataServiceError,
  type ActualDataService,
  type ActualDataSubscriptionState
} from "./actual-data-service";

export type LaunchTrackingMode = "manual" | "newest" | "scored" | "qualified";

export type LaunchScannerConfig = {
  runtimeMode: "pumpportal_first" | "standard";
  liveDiscoveryEnabled: boolean;
  subscribeNewToken: boolean;
  subscribeMigration: boolean;
  launchTrackingEnabled: boolean;
  launchTrackingAcknowledgedMetered: boolean;
  launchTrackingMode: LaunchTrackingMode;
  maxConcurrentTracked: number;
  initialTrackingMs: number;
  extendedTrackingMs: number;
  maxEventsPerToken: number;
  maxEventsPerSession: number;
  maxSessionCostSol: number;
  minScoreToExtend: number;
  minScoreToRip: number;
  requireDataWalletReady: boolean;
  autoUnsubscribeOnHardReject: boolean;
  autoUnsubscribeOnLowScore: boolean;
  eventCostSolPer10000: number;
};

export type LaunchCostEstimateInput = {
  avgEventsPerToken?: number;
  tokensPerHour?: number;
};

export type LaunchCostEstimate = {
  avgEventsPerToken: number;
  estimatedCostPerEventSol: number;
  estimatedHourlyCostSol: number;
  estimatedSessionCostSol: number;
  maxEventsPerSession: number;
  maxSessionCostSol: number;
  tokensPerHour: number;
  wouldHitSessionBudget: boolean;
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

export type LaunchCandidateView = {
  mint: string;
  source: string;
  eventType: string;
  name: string | null;
  symbol: string | null;
  title: string | null;
  discoveredAt: string;
  latestEventAt: string;
  snapshot: LaunchMomentumSnapshot;
  tracking: LaunchTrackingView;
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

export type LaunchTrackingView = {
  eventCount: number;
  latestTradeAt: string | null;
  reasonCodes: string[];
  state:
    "not_tracked" | "tracking" | "unsubscribed" | "budget_reached" | "blocked";
  subscription: ActualDataSubscriptionState | null;
};

export type LaunchScannerStatus = {
  runtimeMode: LaunchScannerConfig["runtimeMode"];
  provider: string;
  liveDiscoveryEnabled: boolean;
  liveDiscoveryActive: boolean;
  subscribeNewToken: boolean;
  subscribeMigration: boolean;
  candidateCount: number;
  scoreSnapshotCount: number;
  trackedMintCount: number;
  launchTrackingEnabled: boolean;
  launchTrackingAcknowledgedMetered: boolean;
  launchTrackingMode: LaunchTrackingMode;
  maxConcurrentTracked: number;
  maxEventsPerToken: number;
  maxEventsPerSession: number;
  maxSessionCostSol: number;
  totalEventsThisSession: number;
  estimatedMeteredCostSol: number;
  minScoreToExtend: number;
  minScoreToRip: number;
  trackedMints: string[];
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

type LaunchCandidateState = {
  mint: string;
  source: string;
  eventType: string;
  name: string | null;
  symbol: string | null;
  title: string | null;
  discoveredAt: string;
  latestEventAt: string;
  trades: LaunchTradeSample[];
  snapshot: LaunchMomentumSnapshot;
  reasonCodes: string[];
};

type LaunchScannerOptions = {
  actualData: ActualDataService;
  config?: Partial<LaunchScannerConfig>;
  getRiskSnapshot?: (mint: string) => RiskSnapshot | undefined;
  onSnapshotPersisted?:
    | ((snapshot: LaunchMomentumSnapshot, snapshotId: number) => void)
    | undefined;
  providerName: string;
};

export function createLaunchScannerConfig(
  input: Partial<LaunchScannerConfig> = {}
): LaunchScannerConfig {
  return {
    runtimeMode: input.runtimeMode ?? "pumpportal_first",
    liveDiscoveryEnabled: input.liveDiscoveryEnabled ?? true,
    subscribeNewToken: input.subscribeNewToken ?? true,
    subscribeMigration: input.subscribeMigration ?? true,
    launchTrackingEnabled: false,
    launchTrackingAcknowledgedMetered: false,
    launchTrackingMode: "manual",
    maxConcurrentTracked: input.maxConcurrentTracked ?? 3,
    initialTrackingMs: input.initialTrackingMs ?? 30_000,
    extendedTrackingMs: input.extendedTrackingMs ?? 300_000,
    maxEventsPerToken: input.maxEventsPerToken ?? 250,
    maxEventsPerSession: input.maxEventsPerSession ?? 1000,
    maxSessionCostSol: input.maxSessionCostSol ?? 0.001,
    minScoreToExtend: input.minScoreToExtend ?? 45,
    minScoreToRip: input.minScoreToRip ?? 75,
    requireDataWalletReady: input.requireDataWalletReady ?? true,
    autoUnsubscribeOnHardReject: false,
    autoUnsubscribeOnLowScore: false,
    eventCostSolPer10000: input.eventCostSolPer10000 ?? 0.01
  };
}

export function createLaunchScannerService(
  options: LaunchScannerOptions
): LaunchScannerService {
  return new LaunchScannerService(options);
}

export class LaunchScannerService {
  private readonly actualData: ActualDataService;
  private readonly candidates = new Map<string, LaunchCandidateState>();
  private readonly config: LaunchScannerConfig;
  private readonly getRiskSnapshot:
    ((mint: string) => RiskSnapshot | undefined) | undefined;
  private readonly onSnapshotPersisted:
    | ((snapshot: LaunchMomentumSnapshot, snapshotId: number) => void)
    | undefined;
  private readonly providerName: string;
  private scoreSnapshotCount = 0;
  private startedAt: string | null = null;

  constructor(options: LaunchScannerOptions) {
    this.actualData = options.actualData;
    this.config = createLaunchScannerConfig(options.config);
    this.getRiskSnapshot = options.getRiskSnapshot;
    this.onSnapshotPersisted = options.onSnapshotPersisted;
    this.providerName = options.providerName;
  }

  start(): void {
    if (this.startedAt) {
      return;
    }

    this.startedAt = new Date().toISOString();
    saveLaunchTrackingSession({
      provider: this.providerName,
      status: this.config.launchTrackingEnabled ? "running" : "disabled",
      trackedTokenCount: this.getTrackedMintCount(),
      totalEventCount: this.actualData.getStatus().totalEventsThisSession,
      estimatedCostSol: this.getEstimatedMeteredCostSol(),
      budgetLimitSol: this.config.maxSessionCostSol,
      reasonCodes: this.getStatus().reasonCodes,
      payload: this.getStatus(),
      startedAt: this.startedAt,
      stoppedAt: null,
      createdAt: this.startedAt
    });
  }

  stop(): void {
    if (!this.startedAt) {
      return;
    }

    const stoppedAt = new Date().toISOString();
    saveLaunchTrackingSession({
      provider: this.providerName,
      status: "stopped",
      trackedTokenCount: this.getTrackedMintCount(),
      totalEventCount: this.actualData.getStatus().totalEventsThisSession,
      estimatedCostSol: this.getEstimatedMeteredCostSol(),
      budgetLimitSol: this.config.maxSessionCostSol,
      reasonCodes: this.getStatus().reasonCodes,
      payload: this.getStatus(),
      startedAt: this.startedAt,
      stoppedAt,
      createdAt: stoppedAt
    });
    this.startedAt = null;
  }

  ingestFeedEvent(event: FeedEvent): LaunchCandidateView | undefined {
    if (event.source !== "pumpportal") {
      return undefined;
    }

    if (event.type === "token_created") {
      return this.ingestDiscovery(event);
    }

    if (event.type !== "trade") {
      return undefined;
    }

    return this.ingestTrade(event);
  }

  ingestDiscovery(event: TokenCreatedEvent): LaunchCandidateView | undefined {
    if (!this.config.liveDiscoveryEnabled) {
      return undefined;
    }

    const eventType =
      event.rawSourceEventType === "migration" ? "migration" : "new_token";
    const existing = this.candidates.get(event.candidate.mint);
    const discoveredAt = existing?.discoveredAt ?? event.timestamp;
    const reasonCodes = uniqueReasonCodes([
      ...(existing?.reasonCodes ?? []),
      "RUNTIME_PUMPPORTAL_FIRST",
      "PUMPPORTAL_LIVE_DISCOVERY_ACTIVE",
      eventType === "migration"
        ? "PUMPPORTAL_MIGRATION_DISCOVERED"
        : "PUMPPORTAL_NEW_TOKEN_DISCOVERED",
      ...(event.reasonCodes ?? [])
    ]);
    const snapshot = evaluateLaunchMomentum({
      hardReject: this.getRiskSnapshot?.(event.candidate.mint)?.hardReject,
      launchedAt: discoveredAt,
      mint: event.candidate.mint,
      normalizationCohort: this.getDerivativeStrengthCohort(
        event.candidate.mint,
        ageSecondsBetween(discoveredAt, event.timestamp),
        event.timestamp
      ),
      now: event.timestamp,
      riskLevel: this.getRiskSnapshot?.(event.candidate.mint)?.riskLevel,
      trades: existing?.trades ?? []
    });
    const state: LaunchCandidateState = {
      mint: event.candidate.mint,
      source: event.source,
      eventType,
      name: event.candidate.name ?? null,
      symbol: event.candidate.symbol ?? null,
      title: event.candidate.title ?? null,
      discoveredAt,
      latestEventAt: event.timestamp,
      trades: existing?.trades ?? [],
      snapshot,
      reasonCodes
    };

    this.candidates.set(state.mint, state);
    this.persistCandidate(state);
    this.persistSnapshot(snapshot);
    return this.toCandidateView(state);
  }

  ingestTrade(event: TokenTradeEvent): LaunchCandidateView | undefined {
    if (!isPumpPortalTokenTrade(event)) {
      return undefined;
    }

    const existing = this.candidates.get(event.mint);
    const discoveredAt = existing?.discoveredAt ?? event.timestamp;
    const sample = toLaunchTradeSample(event);
    const trades = existing?.trades ? [...existing.trades] : [];

    if (sample) {
      trades.push(sample);
      while (trades.length > this.config.maxEventsPerToken) {
        trades.shift();
      }

      saveLaunchTradeSample({
        mint: sample.mint,
        signature: sample.signature,
        side: sample.side,
        trader: sample.trader,
        priceSol: sample.priceSol,
        volumeSol: sample.volumeSol,
        tokenAmount: sample.tokenAmount,
        confidence: event.confidence ?? "low",
        usableForMetrics: event.usableForMetrics === true,
        reasonCodes: uniqueReasonCodes([
          "PUMPPORTAL_TOKEN_TRADE",
          "LAUNCH_TRADE_SAMPLE",
          ...(event.reasonCodes ?? [])
        ]),
        payload: event,
        createdAt: sample.timestamp
      });
    }

    const snapshot = evaluateLaunchMomentum({
      hardReject: this.getRiskSnapshot?.(event.mint)?.hardReject,
      launchedAt: discoveredAt,
      mint: event.mint,
      normalizationCohort: this.getDerivativeStrengthCohort(
        event.mint,
        ageSecondsBetween(discoveredAt, event.timestamp),
        event.timestamp
      ),
      now: event.timestamp,
      riskLevel: this.getRiskSnapshot?.(event.mint)?.riskLevel,
      trades
    });
    const state: LaunchCandidateState = {
      mint: event.mint,
      source: event.source,
      eventType: existing?.eventType ?? "token_trade",
      name: event.name ?? existing?.name ?? null,
      symbol: event.symbol ?? existing?.symbol ?? null,
      title: existing?.title ?? event.name ?? event.symbol ?? null,
      discoveredAt,
      latestEventAt: event.timestamp,
      trades,
      snapshot,
      reasonCodes: uniqueReasonCodes([
        ...(existing?.reasonCodes ?? []),
        "LAUNCH_TRADE_TRACKED",
        ...(event.reasonCodes ?? [])
      ])
    };

    this.candidates.set(state.mint, state);
    this.persistCandidate(state);
    this.persistSnapshot(snapshot);
    return this.toCandidateView(state);
  }

  evaluateMint(mint: string): LaunchMomentumSnapshot | null {
    const candidate = this.candidates.get(mint);

    if (!candidate) {
      return null;
    }

    const evaluatedAt = new Date().toISOString();
    const snapshot = evaluateLaunchMomentum({
      hardReject: this.getRiskSnapshot?.(mint)?.hardReject,
      launchedAt: candidate.discoveredAt,
      mint,
      normalizationCohort: this.getDerivativeStrengthCohort(
        mint,
        ageSecondsBetween(candidate.discoveredAt, evaluatedAt),
        evaluatedAt
      ),
      now: evaluatedAt,
      riskLevel: this.getRiskSnapshot?.(mint)?.riskLevel,
      trades: candidate.trades
    });
    candidate.snapshot = snapshot;
    candidate.latestEventAt = snapshot.evaluatedAt;
    this.persistCandidate(candidate);
    this.persistSnapshot(snapshot);
    return snapshot;
  }

  trackMint(
    mint: string,
    reason = "manual"
  ): {
    candidate: LaunchCandidateView | null;
    paperOnly: true;
    status: LaunchScannerStatus;
    subscription: ActualDataSubscriptionState;
    tradingDisabled: true;
  } {
    void mint;
    void reason;
    throw new ActualDataServiceError(
      "LAUNCH_TRACKING_POLICY_MOVED_TO_METERED_SERVICE",
      "LaunchScannerService owns discovery and scoring only. Use the metered tracking command route.",
      410
    );
  }

  untrackMint(
    mint: string,
    reason = "manual_delete"
  ): {
    paperOnly: true;
    status: LaunchScannerStatus;
    subscription: ActualDataSubscriptionState | null;
    tradingDisabled: true;
  } {
    void mint;
    void reason;
    throw new ActualDataServiceError(
      "LAUNCH_TRACKING_POLICY_MOVED_TO_METERED_SERVICE",
      "LaunchScannerService owns discovery and scoring only. Use the metered tracking command route.",
      410
    );
  }

  getStatus(): LaunchScannerStatus {
    const actualStatus = this.actualData.getStatus();
    const reasonCodes = uniqueReasonCodes([
      "RUNTIME_PUMPPORTAL_FIRST",
      "MANAGED_STREAM_DISABLED_FOR_RUNTIME",
      ...(this.providerName === "pumpportal"
        ? ["PUMPPORTAL_LIVE_DISCOVERY_ACTIVE"]
        : ["PUMPPORTAL_LIVE_DISCOVERY_OFFLINE"]),
      ...(this.candidates.size === 0 ? ["PUMPPORTAL_WAITING_FOR_TOKENS"] : []),
      ...(this.config.liveDiscoveryEnabled
        ? []
        : ["PUMPPORTAL_LIVE_DISCOVERY_OFFLINE"]),
      ...(this.config.launchTrackingEnabled
        ? []
        : ["PUMPPORTAL_LAUNCH_TRACKING_DISABLED"]),
      ...(this.config.launchTrackingAcknowledgedMetered
        ? []
        : ["PUMPPORTAL_LAUNCH_TRACKING_METERED_NOT_ACKNOWLEDGED"]),
      ...(actualStatus.budgetReached
        ? ["PUMPPORTAL_LAUNCH_TRACKING_BUDGET_REACHED"]
        : []),
      "LAUNCH_TRACKING_POLICY_MOVED_TO_METERED_SERVICE",
      "DISCOVERY_AND_SCORING_ONLY",
      "OBSERVATION_ONLY",
      "PAPER_ONLY",
      "NO_TRADING"
    ]);

    return {
      runtimeMode: this.config.runtimeMode,
      provider: this.providerName,
      liveDiscoveryEnabled: this.config.liveDiscoveryEnabled,
      liveDiscoveryActive:
        this.config.liveDiscoveryEnabled && this.providerName === "pumpportal",
      subscribeNewToken: this.config.subscribeNewToken,
      subscribeMigration: this.config.subscribeMigration,
      candidateCount: this.candidates.size,
      scoreSnapshotCount: this.scoreSnapshotCount,
      trackedMintCount: this.getTrackedMintCount(),
      launchTrackingEnabled: this.config.launchTrackingEnabled,
      launchTrackingAcknowledgedMetered:
        this.config.launchTrackingAcknowledgedMetered,
      launchTrackingMode: this.config.launchTrackingMode,
      maxConcurrentTracked: this.config.maxConcurrentTracked,
      maxEventsPerToken: this.config.maxEventsPerToken,
      maxEventsPerSession: this.config.maxEventsPerSession,
      maxSessionCostSol: this.config.maxSessionCostSol,
      totalEventsThisSession: actualStatus.totalEventsThisSession,
      estimatedMeteredCostSol: this.getEstimatedMeteredCostSol(),
      minScoreToExtend: this.config.minScoreToExtend,
      minScoreToRip: this.config.minScoreToRip,
      trackedMints: this.getTrackedMints(),
      reasonCodes,
      paperOnly: true,
      tradingDisabled: true
    };
  }

  getCandidates(limit = 50): LaunchCandidateView[] {
    return Array.from(this.candidates.values())
      .sort((left, right) => right.snapshot.score - left.snapshot.score)
      .slice(0, limit)
      .map((candidate) => this.toCandidateView(candidate));
  }

  getCandidate(mint: string): LaunchCandidateView | null {
    const candidate = this.candidates.get(mint);
    return candidate ? this.toCandidateView(candidate) : null;
  }

  getScores(limit = 50): LaunchMomentumSnapshot[] {
    return this.getCandidates(limit).map((candidate) => candidate.snapshot);
  }

  getTracked(): LaunchTrackingView[] {
    return this.actualData
      .getSubscriptions()
      .filter(
        (subscription) =>
          subscription.reason.startsWith("launch_") ||
          this.candidates.has(subscription.mint)
      )
      .map((subscription) => this.getTrackingForMint(subscription.mint));
  }

  estimateCost(input: LaunchCostEstimateInput = {}): LaunchCostEstimate {
    const tokensPerHour = input.tokensPerHour ?? 500;
    const avgEventsPerToken = input.avgEventsPerToken ?? 20;
    const estimatedCostPerEventSol = this.getEstimatedCostPerEventSol();
    const estimatedHourlyEvents = tokensPerHour * avgEventsPerToken;
    const estimatedHourlyCostSol =
      estimatedHourlyEvents * estimatedCostPerEventSol;
    const estimatedSessionCostSol =
      this.config.maxEventsPerSession * estimatedCostPerEventSol;

    return {
      avgEventsPerToken,
      estimatedCostPerEventSol: round(estimatedCostPerEventSol),
      estimatedHourlyCostSol: round(estimatedHourlyCostSol),
      estimatedSessionCostSol: round(estimatedSessionCostSol),
      maxEventsPerSession: this.config.maxEventsPerSession,
      maxSessionCostSol: this.config.maxSessionCostSol,
      tokensPerHour,
      wouldHitSessionBudget:
        estimatedSessionCostSol >= this.config.maxSessionCostSol,
      reasonCodes: uniqueReasonCodes([
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "PUMPPORTAL_LAUNCH_COST_ESTIMATE",
        "PAPER_ONLY",
        "NO_TRADING"
      ]),
      paperOnly: true,
      tradingDisabled: true
    };
  }

  private getTrackingBlockers(mint?: string): string[] {
    const actualStatus = this.actualData.getStatus();
    const reasonCodes: string[] = [];

    if (!this.config.launchTrackingEnabled) {
      reasonCodes.push("PUMPPORTAL_LAUNCH_TRACKING_DISABLED");
    }

    if (!this.config.launchTrackingAcknowledgedMetered) {
      reasonCodes.push("PUMPPORTAL_LAUNCH_TRACKING_METERED_NOT_ACKNOWLEDGED");
    }

    if (!actualStatus.enabled) {
      reasonCodes.push("ACTUAL_DATA_DISABLED");
    }

    if (!actualStatus.compatibleProvider) {
      reasonCodes.push("ACTUAL_DATA_INCOMPATIBLE_PROVIDER");
    }

    if (!actualStatus.acknowledgedMetered) {
      reasonCodes.push("PUMPPORTAL_TOKEN_TRADES_METERED_NOT_ACKNOWLEDGED");
    }

    if (
      this.config.requireDataWalletReady &&
      actualStatus.dataWalletBalanceStatus !== "ok"
    ) {
      reasonCodes.push("DATA_WALLET_NOT_READY_FOR_LAUNCH_TRACKING");
    }

    if (actualStatus.reasonCodes.includes("PUMPPORTAL_API_KEY_MISSING")) {
      reasonCodes.push("PUMPPORTAL_API_KEY_MISSING");
    }

    if (actualStatus.budgetReached) {
      reasonCodes.push("PUMPPORTAL_LAUNCH_TRACKING_BUDGET_REACHED");
    }

    if (this.getEstimatedMeteredCostSol() >= this.config.maxSessionCostSol) {
      reasonCodes.push("PUMPPORTAL_LAUNCH_TRACKING_COST_BUDGET_REACHED");
    }

    const existing = mint
      ? this.actualData
          .getSubscriptions()
          .find((subscription) => subscription.mint === mint)
      : undefined;

    if (
      existing?.status !== "subscribed" &&
      this.getTrackedMintCount() >= this.config.maxConcurrentTracked
    ) {
      reasonCodes.push("PUMPPORTAL_LAUNCH_TRACKING_MAX_CONCURRENT_REACHED");
    }

    return uniqueReasonCodes(reasonCodes);
  }

  private getTrackingForMint(mint: string): LaunchTrackingView {
    const subscription =
      this.actualData.getSubscriptions().find((item) => item.mint === mint) ??
      null;
    const summary = this.actualData.getCandidateSummary(mint);
    const blockers = this.getTrackingBlockers(mint);
    const state =
      this.actualData.getStatus().budgetReached ||
      blockers.includes("PUMPPORTAL_LAUNCH_TRACKING_BUDGET_REACHED")
        ? "budget_reached"
        : subscription?.status === "subscribed"
          ? "tracking"
          : subscription?.status === "unsubscribed"
            ? "unsubscribed"
            : blockers.length > 0
              ? "blocked"
              : "not_tracked";

    return {
      eventCount: summary?.eventCount ?? subscription?.eventCount ?? 0,
      latestTradeAt: summary?.latestRealTradeAt ?? null,
      reasonCodes: uniqueReasonCodes([
        ...(summary?.reasonCodes ?? []),
        ...(subscription?.reasonCodes ?? []),
        ...blockers,
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "OBSERVATION_ONLY",
        "PAPER_ONLY"
      ]),
      state,
      subscription
    };
  }

  private getTrackedMintCount(): number {
    return this.getTrackedMints().length;
  }

  private getTrackedMints(): string[] {
    return this.actualData
      .getSubscriptions()
      .filter(
        (subscription) =>
          subscription.status === "subscribed" &&
          (subscription.reason.startsWith("launch_") ||
            this.candidates.has(subscription.mint))
      )
      .map((subscription) => subscription.mint)
      .sort();
  }

  private getEstimatedCostPerEventSol(): number {
    return Math.min(
      this.config.eventCostSolPer10000 / 10_000,
      this.config.maxSessionCostSol / this.config.maxEventsPerSession
    );
  }

  private getEstimatedMeteredCostSol(): number {
    return round(
      this.actualData.getStatus().totalEventsThisSession *
        this.getEstimatedCostPerEventSol()
    );
  }

  private getDerivativeStrengthCohort(
    excludedMint: string,
    ageSeconds: number,
    evaluatedAt: string
  ): DerivativeStrengthCohort {
    const targetBucket = getDerivativeStrengthAgeBucket(ageSeconds);
    const evaluatedAtMs = Date.parse(evaluatedAt);
    const cohort: Partial<
      Record<DerivativeStrengthMetricName, number[]>
    > = {};

    if (!Number.isFinite(evaluatedAtMs)) {
      return cohort;
    }

    for (const candidate of this.candidates.values()) {
      const snapshot = candidate.snapshot;

      if (
        candidate.mint === excludedMint ||
        getDerivativeStrengthAgeBucket(snapshot.ageSeconds) !== targetBucket ||
        Date.parse(snapshot.evaluatedAt) > evaluatedAtMs
      ) {
        continue;
      }

      for (const [metric, value] of derivativeCohortValues(snapshot)) {
        if (value === null || !Number.isFinite(value)) {
          continue;
        }

        const values = cohort[metric] ?? [];
        values.push(value);
        cohort[metric] = values;
      }
    }

    return cohort;
  }

  private persistCandidate(candidate: LaunchCandidateState): void {
    saveLaunchCandidate({
      mint: candidate.mint,
      source: candidate.source,
      eventType: candidate.eventType,
      name: candidate.name,
      symbol: candidate.symbol,
      title: candidate.title,
      status: candidate.snapshot.phase,
      reasonCodes: uniqueReasonCodes([
        ...candidate.reasonCodes,
        ...candidate.snapshot.reasonCodes
      ]),
      payload: this.toCandidateView(candidate),
      discoveredAt: candidate.discoveredAt,
      latestEventAt: candidate.latestEventAt
    });
  }

  private persistSnapshot(snapshot: LaunchMomentumSnapshot): void {
    const stored = saveLaunchScoreSnapshot({
      mint: snapshot.mint,
      score: snapshot.score,
      label: snapshot.label,
      phase: snapshot.phase,
      tradeSampleCount: snapshot.tradeSampleCount,
      priceSol: snapshot.priceSol,
      volumeSol: snapshot.volumeSol,
      reasonCodes: snapshot.reasonCodes,
      payload: snapshot,
      evaluatedAt: snapshot.evaluatedAt,
      createdAt: snapshot.evaluatedAt
    });
    this.onSnapshotPersisted?.(snapshot, stored.id);
    this.scoreSnapshotCount += 1;
  }

  private toCandidateView(
    candidate: LaunchCandidateState
  ): LaunchCandidateView {
    return {
      mint: candidate.mint,
      source: candidate.source,
      eventType: candidate.eventType,
      name: candidate.name,
      symbol: candidate.symbol,
      title: candidate.title,
      discoveredAt: candidate.discoveredAt,
      latestEventAt: candidate.latestEventAt,
      snapshot: candidate.snapshot,
      tracking: this.getTrackingForMint(candidate.mint),
      reasonCodes: uniqueReasonCodes([
        ...candidate.reasonCodes,
        ...candidate.snapshot.reasonCodes
      ]),
      paperOnly: true,
      tradingDisabled: true
    };
  }
}

function isPumpPortalTokenTrade(event: TokenTradeEvent): boolean {
  return (
    event.source === "pumpportal" &&
    event.type === "trade" &&
    event.reasonCodes?.includes("PUMPPORTAL_TOKEN_TRADE") === true
  );
}

function toLaunchTradeSample(event: TokenTradeEvent): LaunchTradeSample | null {
  if (
    (event.side !== "buy" && event.side !== "sell") ||
    !isPositiveFinite(event.priceSol ?? null) ||
    !isPositiveFinite(event.volumeSol ?? null)
  ) {
    return null;
  }

  return {
    mint: event.mint,
    side: event.side,
    trader: event.trader ?? null,
    signature: event.signature ?? null,
    priceSol: event.priceSol ?? 0,
    volumeSol: event.volumeSol ?? 0,
    tokenAmount: event.tokenAmount ?? null,
    timestamp: event.timestamp
  };
}

function isPositiveFinite(value: number | null): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function derivativeCohortValues(
  snapshot: LaunchMomentumSnapshot
): Array<[DerivativeStrengthMetricName, number | null]> {
  const derivatives = snapshot.derivatives;

  return [
    ["volume_velocity_sol", derivatives.volumeVelocitySolPerSec],
    ["volume_acceleration_sol", derivatives.volumeAccelerationSolPerSec2],
    ["price_velocity_pct", derivatives.priceVelocityPctPerSec],
    ["price_acceleration_pct", derivatives.priceAccelerationPctPerSec2],
    ["price_velocity_sol", derivatives.priceSolVelocityPerSec],
    ["price_acceleration_sol", derivatives.priceSolAccelerationPerSec2],
    ["buyer_velocity", derivatives.buyerVelocityPerSec],
    ["buyer_acceleration", derivatives.buyerAccelerationPerSec2],
    ["trade_velocity", derivatives.tradeVelocityPerSec],
    ["trade_acceleration", derivatives.tradeAccelerationPerSec2],
    ["buy_pressure_velocity", derivatives.buyPressureVelocityPerSec],
    ["buy_pressure_acceleration", derivatives.buyPressureAccelerationPerSec2],
    ["market_cap_velocity_sol", derivatives.marketCapSolVelocityPerSec],
    ["liquidity_velocity_sol", derivatives.liquiditySolVelocityPerSec]
  ];
}

function ageSecondsBetween(launchedAt: string, evaluatedAt: string): number {
  const ageSeconds = (Date.parse(evaluatedAt) - Date.parse(launchedAt)) / 1_000;
  return Number.isFinite(ageSeconds) ? Math.max(0, ageSeconds) : 0;
}

function round(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(10)) : 0;
}

function uniqueReasonCodes(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
