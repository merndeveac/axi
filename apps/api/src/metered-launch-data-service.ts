import {
  isValidSolanaMint,
  type TokenTradeEvent
} from "@axi/data-feeds";
import type { StoredMeteredLaunchDataEvent } from "@axi/storage";
import {
  saveMeteredLaunchDataEvent,
  saveMeteredLaunchDataSession,
  saveMeteredLaunchDataSubscription
} from "@axi/storage";
import {
  ActualDataServiceError,
  type ActualDataDataWalletReadiness,
  type ActualDataService,
  type ActualDataSubscriptionState
} from "./actual-data-service";
import type { LaunchCandidateView } from "./launch-scanner-service";

export type MeteredLaunchDataMode =
  | "manual"
  | "newest"
  | "hot_candidates"
  | "launch_score";

export type MeteredLaunchDataConfig = {
  enabled: boolean;
  acknowledgedCost: boolean;
  requireDataWalletReady: boolean;
  mode: MeteredLaunchDataMode;
  maxConcurrentMints: number;
  initialTrackMs: number;
  extendedTrackMs: number;
  minScoreToExtend: number;
  minScoreToTrack: number;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSessionCostSol: number;
  autoUnsubscribeOnHardReject: boolean;
  autoUnsubscribeOnLowScore: boolean;
  projectRateWindowMs: number;
  eventCostSolPer10000: number;
  apiKeyConfigured: boolean;
  dataWalletPublicKeyConfigured: boolean;
  liveDiscoveryEnabled: boolean;
};

export type MeteredLaunchDataTrackedMint = {
  mint: string;
  status: "tracking" | "unsubscribed";
  reason: string;
  eventCount: number;
  estimatedCostSol: number;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
  initialReviewAt: string | null;
  extendedReviewAt: string | null;
  latestTradeAt: string | null;
  latestPriceSol: number | null;
  latestVolumeSol: number | null;
  reasonCodes: string[];
  subscription: ActualDataSubscriptionState | null;
};

export type MeteredLaunchDataDecision = {
  mint: string;
  action: "track" | "skip";
  tracked: boolean;
  reasonCodes: string[];
  score: number | null;
  mode: MeteredLaunchDataMode;
  trackingState: MeteredLaunchDataTrackedMint | null;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type MeteredLaunchDataCost = {
  eventCostSolPer10000: number;
  estimatedCostPerEventSol: number;
  estimatedCostSol: number;
  maxSessionCostSol: number;
  remainingBudgetSol: number;
  remainingEventsByBudget: number;
  projectedCostPerHourSol: number;
  totalEventsThisSession: number;
  maxEventsPerSession: number;
  budgetReached: boolean;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type MeteredLaunchDataSessionAckInput = {
  ackCost: true;
  maxSessionCostSol: number;
  maxConcurrentMints: number;
  maxEventsPerSession: number;
};

export type MeteredLaunchDataStatus = {
  enabled: boolean;
  active: boolean;
  acknowledgedCost: boolean;
  sessionAcknowledgedCost: boolean;
  requireDataWalletReady: boolean;
  ready: boolean;
  mode: MeteredLaunchDataMode;
  provider: string;
  liveDiscoveryEnabled: boolean;
  liveDiscoveryActive: boolean;
  apiKeyConfigured: boolean;
  dataWalletConfigured: boolean;
  dataWalletBalanceSol: number | null;
  dataWalletBalanceStatus: ActualDataDataWalletReadiness["balanceStatus"];
  dataWalletEstimatedEventsRemaining: number | null;
  maxConcurrentMints: number;
  trackedMintCount: number;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  totalEventsThisSession: number;
  estimatedCostSol: number;
  maxSessionCostSol: number;
  remainingBudgetSol: number;
  projectedCostPerHourSol: number;
  budgetReached: boolean;
  reasonCodes: string[];
  trackedMints: string[];
  lastStopReason: string | null;
  startedAt: string | null;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type MeteredLaunchDataServiceOptions = {
  actualData: ActualDataService;
  config?: Partial<MeteredLaunchDataConfig>;
  dataWalletReadiness?: () => ActualDataDataWalletReadiness;
  getLaunchCandidate?: (mint: string) => LaunchCandidateView | null;
  getLaunchCandidates?: (limit?: number) => LaunchCandidateView[];
  getLiveDiscoveryActive?: () => boolean;
  providerName: string;
};

export class MeteredLaunchDataServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 409) {
    super(message);
    this.name = "MeteredLaunchDataServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type InternalTrackedMint = Omit<
  MeteredLaunchDataTrackedMint,
  "estimatedCostSol" | "subscription"
> & {
  initialReviewTimer?: ReturnType<typeof setTimeout>;
  extendedReviewTimer?: ReturnType<typeof setTimeout>;
};

export function createMeteredLaunchDataConfig(
  input: Partial<MeteredLaunchDataConfig> = {}
): MeteredLaunchDataConfig {
  return {
    enabled: input.enabled ?? false,
    acknowledgedCost: input.acknowledgedCost ?? false,
    requireDataWalletReady: input.requireDataWalletReady ?? true,
    mode: input.mode ?? "newest",
    maxConcurrentMints: input.maxConcurrentMints ?? 3,
    initialTrackMs: input.initialTrackMs ?? 30_000,
    extendedTrackMs: input.extendedTrackMs ?? 300_000,
    minScoreToExtend: input.minScoreToExtend ?? 45,
    minScoreToTrack: input.minScoreToTrack ?? 0,
    maxEventsPerMint: input.maxEventsPerMint ?? 250,
    maxEventsPerSession: input.maxEventsPerSession ?? 1000,
    maxSessionCostSol: input.maxSessionCostSol ?? 0.001,
    autoUnsubscribeOnHardReject:
      input.autoUnsubscribeOnHardReject ?? true,
    autoUnsubscribeOnLowScore: input.autoUnsubscribeOnLowScore ?? true,
    projectRateWindowMs: input.projectRateWindowMs ?? 60_000,
    eventCostSolPer10000: input.eventCostSolPer10000 ?? 0.01,
    apiKeyConfigured: input.apiKeyConfigured ?? false,
    dataWalletPublicKeyConfigured:
      input.dataWalletPublicKeyConfigured ?? false,
    liveDiscoveryEnabled: input.liveDiscoveryEnabled ?? true
  };
}

export function createMeteredLaunchDataService(
  options: MeteredLaunchDataServiceOptions
): MeteredLaunchDataService {
  return new MeteredLaunchDataService(options);
}

export class MeteredLaunchDataService {
  private readonly actualData: ActualDataService;
  private readonly config: MeteredLaunchDataConfig;
  private readonly dataWalletReadiness:
    | (() => ActualDataDataWalletReadiness)
    | undefined;
  private readonly getLaunchCandidate:
    | ((mint: string) => LaunchCandidateView | null)
    | undefined;
  private readonly getLaunchCandidates:
    | ((limit?: number) => LaunchCandidateView[])
    | undefined;
  private readonly getLiveDiscoveryActive: (() => boolean) | undefined;
  private readonly providerName: string;
  private readonly recentTradeEvents: StoredMeteredLaunchDataEvent[] = [];
  private readonly tracked = new Map<string, InternalTrackedMint>();
  private readonly rateEventTimestamps: number[] = [];
  private budgetReached = false;
  private lastStopReason: string | null = null;
  private runtimeStopped = false;
  private sessionAck:
    | {
        maxConcurrentMints: number;
        maxEventsPerSession: number;
        maxSessionCostSol: number;
      }
    | null = null;
  private startedAt: string | null = null;
  private totalEventsThisSession = 0;

  constructor(options: MeteredLaunchDataServiceOptions) {
    this.actualData = options.actualData;
    this.config = createMeteredLaunchDataConfig(options.config);
    this.dataWalletReadiness = options.dataWalletReadiness;
    this.getLaunchCandidate = options.getLaunchCandidate;
    this.getLaunchCandidates = options.getLaunchCandidates;
    this.getLiveDiscoveryActive = options.getLiveDiscoveryActive;
    this.providerName = options.providerName;
    this.runtimeStopped = !this.config.acknowledgedCost;
  }

  start(): void {
    this.runtimeStopped = !this.isCostAcknowledged();

    if (this.startedAt) {
      return;
    }

    this.startedAt = new Date().toISOString();
    saveMeteredLaunchDataSession({
      status: this.config.enabled
        ? this.isReady()
          ? "running"
          : "blocked"
        : "disabled",
      mode: this.config.mode,
      trackedMintCount: this.getTrackedMints().length,
      totalEvents: this.totalEventsThisSession,
      estimatedCostSol: this.getEstimatedCostSol(),
      budgetReached: this.budgetReached,
      reasonCodes: this.getReasonCodes(),
      payload: this.getStatus(),
      startedAt: this.startedAt,
      stoppedAt: null,
      createdAt: this.startedAt
    });
  }

  stop(): void {
    this.runtimeStopped = true;

    for (const mint of this.getTrackedMints()) {
      this.untrackMint(mint, "service_stop");
    }

    if (!this.startedAt) {
      return;
    }

    const stoppedAt = new Date().toISOString();
    saveMeteredLaunchDataSession({
      status: "stopped",
      mode: this.config.mode,
      trackedMintCount: this.getTrackedMints().length,
      totalEvents: this.totalEventsThisSession,
      estimatedCostSol: this.getEstimatedCostSol(),
      budgetReached: this.budgetReached,
      reasonCodes: this.getReasonCodes(),
      payload: this.getStatus(),
      startedAt: this.startedAt,
      stoppedAt,
      createdAt: stoppedAt
    });
    this.startedAt = null;
  }

  acknowledgeSession(
    input: MeteredLaunchDataSessionAckInput
  ): MeteredLaunchDataStatus {
    if (input.ackCost !== true) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_ACK_REQUIRED",
        "Metered launch-data session ACK is required.",
        400
      );
    }

    if (!isPositiveFinite(input.maxSessionCostSol)) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_SESSION_COST_INVALID",
        "Session cost cap must be a positive number.",
        400
      );
    }

    if (!isPositiveInteger(input.maxConcurrentMints)) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_CONCURRENT_CAP_INVALID",
        "Concurrent mint cap must be a positive integer.",
        400
      );
    }

    if (!isPositiveInteger(input.maxEventsPerSession)) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_EVENT_CAP_INVALID",
        "Session event cap must be a positive integer.",
        400
      );
    }

    if (input.maxSessionCostSol > this.config.maxSessionCostSol) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_SESSION_COST_EXCEEDS_CONFIG",
        "Requested session cost cap exceeds the configured ceiling.",
        400
      );
    }

    if (input.maxConcurrentMints > this.config.maxConcurrentMints) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_CONCURRENT_CAP_EXCEEDS_CONFIG",
        "Requested concurrent mint cap exceeds the configured ceiling.",
        400
      );
    }

    if (input.maxEventsPerSession > this.config.maxEventsPerSession) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_EVENT_CAP_EXCEEDS_CONFIG",
        "Requested session event cap exceeds the configured ceiling.",
        400
      );
    }

    this.sessionAck = {
      maxConcurrentMints: input.maxConcurrentMints,
      maxEventsPerSession: input.maxEventsPerSession,
      maxSessionCostSol: input.maxSessionCostSol
    };

    return this.getStatus();
  }

  evaluateNewLaunchCandidate(
    candidate: LaunchCandidateView,
    options: { dryRun?: boolean } = {}
  ): MeteredLaunchDataDecision {
    const blockers = this.getSubscriptionBlockers(candidate.mint);
    const score = candidate.snapshot.score;
    const reasonCodes = unique([
      ...blockers,
      ...this.getCandidateSelectionReasonCodes(candidate)
    ]);
    const shouldTrack =
      blockers.length === 0 &&
      this.shouldTrackCandidate(candidate) &&
      !options.dryRun;

    if (!shouldTrack) {
      return {
        mint: candidate.mint,
        action: "skip",
        tracked: false,
        reasonCodes: unique([
          ...reasonCodes,
          ...(options.dryRun ? ["METERED_LAUNCH_DATA_EVALUATION_ONLY"] : [])
        ]),
        score,
        mode: this.config.mode,
        trackingState: this.getTrackedMint(candidate.mint),
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true
      };
    }

    const trackingState = this.trackMint(
      candidate.mint,
      `auto_${this.config.mode}`
    );

    return {
      mint: candidate.mint,
      action: "track",
      tracked: true,
      reasonCodes: trackingState.reasonCodes,
      score,
      mode: this.config.mode,
      trackingState,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  evaluateCurrentCandidates(limit = 50): MeteredLaunchDataDecision[] {
    return (this.getLaunchCandidates?.(limit) ?? []).map((candidate) =>
      this.evaluateNewLaunchCandidate(candidate, { dryRun: true })
    );
  }

  trackCurrentCandidates(limit = 50): MeteredLaunchDataDecision[] {
    return (this.getLaunchCandidates?.(limit) ?? []).map((candidate) =>
      this.evaluateNewLaunchCandidate(candidate)
    );
  }

  trackMint(mint: string, reason = "manual"): MeteredLaunchDataTrackedMint {
    const normalizedMint = mint.trim();

    if (!isValidSolanaMint(normalizedMint)) {
      throw new MeteredLaunchDataServiceError(
        "INVALID_MINT",
        `Invalid Solana mint for metered launch data: ${normalizedMint}`,
        400
      );
    }

    const blockers = this.getSubscriptionBlockers(normalizedMint);

    if (blockers.length > 0) {
      throw new MeteredLaunchDataServiceError(
        blockers[0] ?? "METERED_LAUNCH_DATA_BLOCKED",
        "Metered launch data tracking is blocked by current safety gates."
      );
    }

    const existing = this.tracked.get(normalizedMint);

    if (existing?.status === "tracking") {
      return this.toTrackedMint(existing);
    }

    let subscription: ActualDataSubscriptionState;

    try {
      subscription = this.actualData.subscribeMint(
        normalizedMint,
        `metered_launch_${reason}`
      );
    } catch (error) {
      if (error instanceof ActualDataServiceError) {
        throw new MeteredLaunchDataServiceError(
          this.toMeteredReasonCode(error.code),
          error.message,
          error.statusCode
        );
      }

      throw error;
    }

    const now = new Date();
    const subscribedAt = now.toISOString();
    const initialReviewAt = new Date(
      now.getTime() + this.config.initialTrackMs
    ).toISOString();
    const extendedReviewAt = new Date(
      now.getTime() + this.config.extendedTrackMs
    ).toISOString();
    const state: InternalTrackedMint = {
      mint: normalizedMint,
      status: "tracking",
      reason,
      eventCount: existing?.eventCount ?? 0,
      subscribedAt,
      unsubscribedAt: null,
      initialReviewAt,
      extendedReviewAt,
      latestTradeAt: existing?.latestTradeAt ?? null,
      latestPriceSol: existing?.latestPriceSol ?? null,
      latestVolumeSol: existing?.latestVolumeSol ?? null,
      reasonCodes: unique([
        "METERED_LAUNCH_DATA_TRACKING_STARTED",
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "METERED_LAUNCH_DATA_ONLY_NO_TRADING",
        ...subscription.reasonCodes
      ])
    };

    this.tracked.set(normalizedMint, state);
    this.scheduleInitialReview(normalizedMint);
    this.persistSubscription(state);
    return this.toTrackedMint(state);
  }

  untrackMint(
    mint: string,
    reason = "manual_delete"
  ): MeteredLaunchDataTrackedMint | null {
    const normalizedMint = mint.trim();
    const existing = this.tracked.get(normalizedMint);

    if (!existing) {
      return null;
    }

    this.clearTimers(existing);
    let subscription: ActualDataSubscriptionState | null = null;

    if (existing.status === "tracking") {
      subscription = this.actualData.unsubscribeMint(
        normalizedMint,
        `metered_launch_${reason}`
      );
    }

    const state: InternalTrackedMint = {
      ...existing,
      status: "unsubscribed",
      reason,
      unsubscribedAt: new Date().toISOString(),
      reasonCodes: unique([
        ...existing.reasonCodes,
        "METERED_LAUNCH_DATA_TRACKING_STOPPED",
        reasonToCode(reason)
      ])
    };

    this.lastStopReason = reason;
    this.tracked.set(normalizedMint, state);
    this.persistSubscription(state, subscription);
    return this.toTrackedMint(state);
  }

  handlePumpPortalTokenTrade(
    event: TokenTradeEvent
  ): MeteredLaunchDataTrackedMint | undefined {
    if (!isPumpPortalTokenTradeEvent(event)) {
      return undefined;
    }

    const tracked = this.tracked.get(event.mint);

    if (!tracked || tracked.status !== "tracking") {
      return undefined;
    }

    tracked.eventCount += 1;
    tracked.latestTradeAt = event.timestamp;
    tracked.latestPriceSol = event.priceSol ?? tracked.latestPriceSol;
    tracked.latestVolumeSol = event.volumeSol ?? tracked.latestVolumeSol;
    tracked.reasonCodes = unique([
      ...tracked.reasonCodes,
      "METERED_LAUNCH_DATA_TOKEN_TRADE",
      ...(event.reasonCodes ?? [])
    ]);

    this.totalEventsThisSession += 1;
    this.recordRateEvent(event.timestamp);

    const stored = saveMeteredLaunchDataEvent({
      mint: event.mint,
      signature: event.signature ?? null,
      side: event.side,
      trader: event.trader ?? null,
      priceSol: event.priceSol ?? null,
      volumeSol: event.volumeSol ?? null,
      tokenAmount: event.tokenAmount ?? null,
      usableForMetrics: event.usableForMetrics === true,
      reasonCodes: unique([
        "METERED_LAUNCH_DATA_TOKEN_TRADE",
        "PUMPPORTAL_TOKEN_TRADE",
        ...(event.reasonCodes ?? [])
      ]),
      payload: event,
      createdAt: event.timestamp
    });

    this.recentTradeEvents.unshift(stored);
    this.recentTradeEvents.splice(100);
    this.persistSubscription(tracked);

    if (tracked.eventCount >= this.config.maxEventsPerMint) {
      this.untrackMint(event.mint, "max_events_per_mint");
    }

    if (this.totalEventsThisSession >= this.getMaxEventsPerSession()) {
      this.budgetReached = true;
      this.untrackAll("max_events_per_session");
    }

    if (this.getEstimatedCostSol() >= this.getMaxSessionCostSol()) {
      this.budgetReached = true;
      this.untrackAll("max_session_cost");
    }

    return this.getTrackedMint(event.mint) ?? undefined;
  }

  getStatus(): MeteredLaunchDataStatus {
    const cost = this.getSessionCost();
    const dataWallet = this.getDataWalletReadiness();

    return {
      enabled: this.config.enabled,
      active: this.config.enabled && !this.runtimeStopped,
      acknowledgedCost: this.isCostAcknowledged(),
      sessionAcknowledgedCost: this.sessionAck !== null,
      requireDataWalletReady: this.config.requireDataWalletReady,
      ready: this.isReady(),
      mode: this.config.mode,
      provider: this.providerName,
      liveDiscoveryEnabled: this.config.liveDiscoveryEnabled,
      liveDiscoveryActive: this.isLiveDiscoveryActive(),
      apiKeyConfigured: this.config.apiKeyConfigured,
      dataWalletConfigured:
        this.config.dataWalletPublicKeyConfigured && dataWallet.configured,
      dataWalletBalanceSol: dataWallet.balanceSol,
      dataWalletBalanceStatus: dataWallet.balanceStatus,
      dataWalletEstimatedEventsRemaining: dataWallet.estimatedEventsRemaining,
      maxConcurrentMints: this.getMaxConcurrentMints(),
      trackedMintCount: this.getTrackedMints().length,
      maxEventsPerMint: this.config.maxEventsPerMint,
      maxEventsPerSession: this.getMaxEventsPerSession(),
      totalEventsThisSession: this.totalEventsThisSession,
      estimatedCostSol: cost.estimatedCostSol,
      maxSessionCostSol: this.getMaxSessionCostSol(),
      remainingBudgetSol: cost.remainingBudgetSol,
      projectedCostPerHourSol: cost.projectedCostPerHourSol,
      budgetReached: this.budgetReached,
      reasonCodes: this.getReasonCodes(),
      trackedMints: this.getTrackedMints(),
      lastStopReason: this.lastStopReason,
      startedAt: this.startedAt,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  getTrackedMints(): string[] {
    return Array.from(this.tracked.values())
      .filter((state) => state.status === "tracking")
      .map((state) => state.mint)
      .sort();
  }

  getTrackedMint(mint: string): MeteredLaunchDataTrackedMint | null {
    const state = this.tracked.get(mint.trim());
    return state ? this.toTrackedMint(state) : null;
  }

  getSessionCost(): MeteredLaunchDataCost {
    const estimatedCostPerEventSol = this.getEstimatedCostPerEventSol();
    const estimatedCostSol = this.getEstimatedCostSol();
    const remainingBudgetSol = round(
      Math.max(0, this.getMaxSessionCostSol() - estimatedCostSol)
    );
    const remainingEventsByBudget =
      estimatedCostPerEventSol > 0
        ? Math.floor(remainingBudgetSol / estimatedCostPerEventSol)
        : 0;

    return {
      eventCostSolPer10000: this.config.eventCostSolPer10000,
      estimatedCostPerEventSol,
      estimatedCostSol,
      maxSessionCostSol: this.getMaxSessionCostSol(),
      remainingBudgetSol,
      remainingEventsByBudget,
      projectedCostPerHourSol: this.getProjectedCostPerHourSol(),
      totalEventsThisSession: this.totalEventsThisSession,
      maxEventsPerSession: this.getMaxEventsPerSession(),
      budgetReached: this.budgetReached,
      reasonCodes: unique([
        ...(this.budgetReached ? ["METERED_LAUNCH_DATA_BUDGET_REACHED"] : []),
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "METERED_LAUNCH_DATA_ONLY_NO_TRADING",
        "LIGHTNING_EXECUTION_DISABLED"
      ]),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  getRecentTradeEvents(): StoredMeteredLaunchDataEvent[] {
    return [...this.recentTradeEvents];
  }

  getReasonCodes(): string[] {
    const blockers = this.getSubscriptionBlockers();
    return unique([
      ...blockers,
      ...this.getDataWalletReadiness().reasonCodes,
      ...(blockers.length === 0 ? ["METERED_LAUNCH_DATA_READY"] : []),
      ...(this.budgetReached ? ["METERED_LAUNCH_DATA_BUDGET_REACHED"] : []),
      ...(this.getEstimatedCostSol() >= this.getMaxSessionCostSol()
        ? ["METERED_LAUNCH_DATA_COST_CAP_REACHED"]
        : []),
      "METERED_LAUNCH_DATA_ONLY_NO_TRADING",
      "LIGHTNING_EXECUTION_DISABLED",
      "OBSERVATION_ONLY",
      "PAPER_ONLY"
    ]);
  }

  private shouldTrackCandidate(candidate: LaunchCandidateView): boolean {
    if (this.config.mode === "manual") {
      return false;
    }

    if (
      this.config.autoUnsubscribeOnHardReject &&
      candidate.snapshot.blockers.includes("HARD_REJECT")
    ) {
      return false;
    }

    if (candidate.snapshot.score < this.config.minScoreToTrack) {
      return false;
    }

    if (this.config.mode === "newest") {
      return true;
    }

    if (this.config.mode === "hot_candidates") {
      return (
        candidate.snapshot.phase === "hot" ||
        candidate.snapshot.phase === "ripping" ||
        candidate.snapshot.score >= this.config.minScoreToExtend
      );
    }

    return candidate.snapshot.score >= this.config.minScoreToTrack;
  }

  private getCandidateSelectionReasonCodes(
    candidate: LaunchCandidateView
  ): string[] {
    const reasonCodes: string[] = [];

    if (this.config.mode === "manual") {
      reasonCodes.push("METERED_LAUNCH_DATA_MANUAL_MODE");
    }

    if (candidate.snapshot.score < this.config.minScoreToTrack) {
      reasonCodes.push("METERED_LAUNCH_DATA_SCORE_BELOW_TRACK_MINIMUM");
    }

    if (
      candidate.snapshot.blockers.includes("HARD_REJECT") &&
      this.config.autoUnsubscribeOnHardReject
    ) {
      reasonCodes.push("METERED_LAUNCH_DATA_HARD_REJECT");
    }

    if (this.shouldTrackCandidate(candidate)) {
      reasonCodes.push("METERED_LAUNCH_DATA_SELECTED");
    } else {
      reasonCodes.push("METERED_LAUNCH_DATA_NOT_SELECTED");
    }

    return reasonCodes;
  }

  private scheduleInitialReview(mint: string): void {
    const state = this.tracked.get(mint);

    if (!state) {
      return;
    }

    this.clearTimers(state);

    if (this.config.initialTrackMs <= 0) {
      this.reviewInitialWindow(mint);
      return;
    }

    state.initialReviewTimer = setTimeout(() => {
      this.reviewInitialWindow(mint);
    }, this.config.initialTrackMs);
  }

  private reviewInitialWindow(mint: string): void {
    const state = this.tracked.get(mint);

    if (!state || state.status !== "tracking") {
      return;
    }

    const candidate = this.getLaunchCandidate?.(mint);

    if (!candidate) {
      this.untrackMint(mint, "initial_no_candidate");
      return;
    }

    if (
      this.config.autoUnsubscribeOnHardReject &&
      (candidate.snapshot.phase === "rejected" ||
        candidate.snapshot.blockers.includes("HARD_REJECT"))
    ) {
      this.untrackMint(mint, "auto_hard_reject");
      return;
    }

    if (candidate.snapshot.score >= this.config.minScoreToExtend) {
      this.scheduleExtendedReview(mint);
      return;
    }

    if (this.config.autoUnsubscribeOnLowScore) {
      this.untrackMint(mint, "initial_low_score");
    }
  }

  private scheduleExtendedReview(mint: string): void {
    const state = this.tracked.get(mint);

    if (!state) {
      return;
    }

    const remainingMs = Math.max(
      0,
      this.config.extendedTrackMs - this.config.initialTrackMs
    );

    if (remainingMs <= 0) {
      this.untrackMint(mint, "extended_window_elapsed");
      return;
    }

    state.extendedReviewTimer = setTimeout(() => {
      this.untrackMint(mint, "extended_window_elapsed");
    }, remainingMs);
  }

  private clearTimers(state: InternalTrackedMint): void {
    if (state.initialReviewTimer) {
      clearTimeout(state.initialReviewTimer);
      delete state.initialReviewTimer;
    }

    if (state.extendedReviewTimer) {
      clearTimeout(state.extendedReviewTimer);
      delete state.extendedReviewTimer;
    }
  }

  private untrackAll(reason: string): void {
    for (const mint of this.getTrackedMints()) {
      this.untrackMint(mint, reason);
    }
  }

  private persistSubscription(
    state: InternalTrackedMint,
    subscription?: ActualDataSubscriptionState | null
  ): void {
    const createdAt =
      state.unsubscribedAt ?? state.latestTradeAt ?? state.subscribedAt;

    saveMeteredLaunchDataSubscription({
      mint: state.mint,
      status: state.status,
      reason: state.reason,
      eventCount: state.eventCount,
      estimatedCostSol: this.getEstimatedCostSol(state.eventCount),
      subscribedAt: state.subscribedAt,
      unsubscribedAt: state.unsubscribedAt,
      reasonCodes: state.reasonCodes,
      payload: {
        ...this.toTrackedMint(state),
        subscription: subscription ?? this.findActualDataSubscription(state.mint)
      },
      ...(createdAt ? { createdAt } : {})
    });
  }

  private getSubscriptionBlockers(mint?: string): string[] {
    const dataWallet = this.getDataWalletReadiness();
    const reasonCodes: string[] = [];

    if (!this.config.enabled) {
      reasonCodes.push("METERED_LAUNCH_DATA_DISABLED");
    }

    if (!this.isCostAcknowledged()) {
      reasonCodes.push("METERED_LAUNCH_DATA_ACK_MISSING");
    }

    if (this.runtimeStopped) {
      reasonCodes.push("METERED_LAUNCH_DATA_STOPPED");
    }

    if (!this.config.apiKeyConfigured) {
      reasonCodes.push("METERED_LAUNCH_DATA_API_KEY_MISSING");
    }

    if (!this.config.dataWalletPublicKeyConfigured) {
      reasonCodes.push("METERED_LAUNCH_DATA_WALLET_MISSING");
    }

    if (
      this.config.requireDataWalletReady &&
      dataWallet.subscriptionBlockers.some((code) =>
        code.includes("BALANCE") || code.includes("FUNDS")
      )
    ) {
      reasonCodes.push("METERED_LAUNCH_DATA_WALLET_LOW");
    }

    if (
      this.config.requireDataWalletReady &&
      dataWallet.subscriptionBlockers.some((code) => code.includes("INVALID"))
    ) {
      reasonCodes.push("METERED_LAUNCH_DATA_WALLET_MISSING");
    }

    if (!this.isLiveDiscoveryActive()) {
      reasonCodes.push("PUMPPORTAL_LIVE_DISCOVERY_OFFLINE");
    }

    if (this.budgetReached) {
      reasonCodes.push("METERED_LAUNCH_DATA_BUDGET_REACHED");
    }

    if (this.totalEventsThisSession >= this.getMaxEventsPerSession()) {
      reasonCodes.push("METERED_LAUNCH_DATA_EVENT_CAP_SESSION_REACHED");
    }

    if (this.getEstimatedCostSol() >= this.getMaxSessionCostSol()) {
      reasonCodes.push("METERED_LAUNCH_DATA_COST_CAP_REACHED");
    }

    const existing = mint ? this.tracked.get(mint) : undefined;

    if (
      existing?.status !== "tracking" &&
      this.getTrackedMints().length >= this.getMaxConcurrentMints()
    ) {
      reasonCodes.push("METERED_LAUNCH_DATA_MAX_CONCURRENT_REACHED");
    }

    return unique(reasonCodes);
  }

  private isReady(): boolean {
    return this.getSubscriptionBlockers().length === 0;
  }

  private getDataWalletReadiness(): ActualDataDataWalletReadiness {
    return (
      this.dataWalletReadiness?.() ?? {
        balanceSol: null,
        balanceStatus: "unknown",
        configured: false,
        estimatedEventsRemaining: null,
        reasonCodes: [],
        subscriptionBlockers: []
      }
    );
  }

  private isLiveDiscoveryActive(): boolean {
    return (
      this.config.liveDiscoveryEnabled &&
      this.providerName === "pumpportal" &&
      (this.getLiveDiscoveryActive?.() ?? true)
    );
  }

  private isCostAcknowledged(): boolean {
    return this.config.acknowledgedCost || this.sessionAck !== null;
  }

  private getMaxConcurrentMints(): number {
    return this.sessionAck?.maxConcurrentMints ?? this.config.maxConcurrentMints;
  }

  private getMaxEventsPerSession(): number {
    return this.sessionAck?.maxEventsPerSession ?? this.config.maxEventsPerSession;
  }

  private getMaxSessionCostSol(): number {
    return this.sessionAck?.maxSessionCostSol ?? this.config.maxSessionCostSol;
  }

  private findActualDataSubscription(
    mint: string
  ): ActualDataSubscriptionState | null {
    return (
      this.actualData
        .getSubscriptions()
        .find((subscription) => subscription.mint === mint) ?? null
    );
  }

  private toTrackedMint(
    state: InternalTrackedMint
  ): MeteredLaunchDataTrackedMint {
    return {
      mint: state.mint,
      status: state.status,
      reason: state.reason,
      eventCount: state.eventCount,
      estimatedCostSol: this.getEstimatedCostSol(state.eventCount),
      subscribedAt: state.subscribedAt,
      unsubscribedAt: state.unsubscribedAt,
      initialReviewAt: state.initialReviewAt,
      extendedReviewAt: state.extendedReviewAt,
      latestTradeAt: state.latestTradeAt,
      latestPriceSol: state.latestPriceSol,
      latestVolumeSol: state.latestVolumeSol,
      reasonCodes: state.reasonCodes,
      subscription: this.findActualDataSubscription(state.mint)
    };
  }

  private getEstimatedCostPerEventSol(): number {
    return round(this.config.eventCostSolPer10000 / 10_000);
  }

  private getEstimatedCostSol(eventCount = this.totalEventsThisSession): number {
    return round(eventCount * this.getEstimatedCostPerEventSol());
  }

  private recordRateEvent(timestamp: string): void {
    const eventMs = Date.parse(timestamp);
    const nowMs = Number.isFinite(eventMs) ? eventMs : Date.now();
    this.rateEventTimestamps.push(nowMs);
    this.pruneRateEvents(nowMs);
  }

  private getProjectedCostPerHourSol(): number {
    const nowMs = Date.now();
    this.pruneRateEvents(nowMs);

    if (this.config.projectRateWindowMs <= 0) {
      return 0;
    }

    const eventsPerHour =
      (this.rateEventTimestamps.length / this.config.projectRateWindowMs) *
      3_600_000;

    return round(eventsPerHour * this.getEstimatedCostPerEventSol());
  }

  private pruneRateEvents(nowMs: number): void {
    const cutoff = nowMs - this.config.projectRateWindowMs;

    while (
      this.rateEventTimestamps.length > 0 &&
      (this.rateEventTimestamps[0] ?? nowMs) < cutoff
    ) {
      this.rateEventTimestamps.shift();
    }
  }

  private toMeteredReasonCode(code: string): string {
    if (code === "PUMPPORTAL_API_KEY_MISSING") {
      return "METERED_LAUNCH_DATA_API_KEY_MISSING";
    }

    if (code.includes("WALLET") || code.includes("FUNDS")) {
      return "METERED_LAUNCH_DATA_WALLET_LOW";
    }

    if (code.includes("MAX_TOKENS") || code.includes("MAX_CONCURRENT")) {
      return "METERED_LAUNCH_DATA_MAX_CONCURRENT_REACHED";
    }

    if (code.includes("BUDGET")) {
      return "METERED_LAUNCH_DATA_BUDGET_REACHED";
    }

    return code;
  }
}

function isPumpPortalTokenTradeEvent(event: TokenTradeEvent): boolean {
  return (
    event.type === "trade" &&
    event.source === "pumpportal" &&
    event.reasonCodes?.includes("PUMPPORTAL_TOKEN_TRADE") === true
  );
}

function reasonToCode(reason: string): string {
  const normalized = reason.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return normalized ? `METERED_LAUNCH_DATA_${normalized}` : "METERED_LAUNCH_DATA_STOPPED";
}

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
