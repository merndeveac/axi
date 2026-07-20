import { isValidSolanaMint, type TokenTradeEvent } from "@axi/data-feeds";
import type { StoredMeteredLaunchDataEvent } from "@axi/storage";
import {
  scheduleNewestCandidate,
  type TrackingProtectionReason,
  type TrackingSchedulerDecision,
  type TrackingSchedulerTrackedMint
} from "@axi/tracking-scheduler";
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
import { safeMeteredRuntimeDefaults } from "./runtime-contract";
import type { LaunchCandidateView } from "./launch-scanner-service";

export type MeteredLaunchDataMode =
  "manual" | "newest" | "hot_candidates" | "launch_score";

export const meteredSessionRolloverConfirmation =
  "ROLLOVER METERED DATA SESSION" as const;

export type MeteredLaunchDataConfig = {
  enabled: boolean;
  controlsEnabled: boolean;
  acknowledgedCost: boolean;
  requireUiAck: boolean;
  startActive: boolean;
  requireDataWalletReady: boolean;
  mode: MeteredLaunchDataMode;
  rollingTrackerEnabled: boolean;
  reservedNewestSlots: number;
  maxProtectedMints: number;
  schedulerQueueLimit: number;
  schedulerQueueMaxAgeMs: number;
  maxConcurrentMints: number;
  initialTrackMs: number;
  extendedTrackMs: number;
  minScoreToExtend: number;
  minScoreToTrack: number;
  minScoreToProtect: number;
  minScoreToProtectRipping: number;
  protectedMaxAgeMs: number;
  staleNoTradesMs: number;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSessionCostSol: number;
  maxUiSessionCostSol: number;
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
  action: "queue" | "skip" | "track";
  tracked: boolean;
  reasonCodes: string[];
  score: number | null;
  mode: MeteredLaunchDataMode;
  trackingState: MeteredLaunchDataTrackedMint | null;
  schedulerDecision: MeteredLaunchDataSchedulerDecision | null;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type MeteredLaunchDataSchedulerDecision = TrackingSchedulerDecision & {
  decisionId: number;
  decidedAt: string;
  executed: boolean;
  queueDepthAfter: number;
};

export type MeteredLaunchDataSchedulerStatus = {
  implemented: true;
  enabled: boolean;
  active: boolean;
  reservedNewestSlots: number;
  configuredMaxProtectedMints: number;
  effectiveMaxProtectedMints: number;
  absoluteProtectedMintCount: number;
  softProtectedMintCount: number;
  queueLimit: number;
  queueMaxAgeMs: number;
  queuedCandidateCount: number;
  queuedMints: string[];
  evaluationCount: number;
  trackingMutationCount: number;
  preemptionCount: number;
  queuedCount: number;
  droppedCount: number;
  lastDecision: MeteredLaunchDataSchedulerDecision | null;
  reasonCodes: string[];
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
  startAfterAck?: boolean | undefined;
};

export type MeteredLaunchDataStatus = {
  enabled: boolean;
  controlsEnabled: boolean;
  capabilityConfigured: boolean;
  active: boolean;
  acknowledgedCost: boolean;
  envAcknowledgedCost: boolean;
  sessionAcknowledgedCost: boolean;
  ackSource: "env" | "none" | "session";
  requireUiAck: boolean;
  requireDataWalletReady: boolean;
  ready: boolean;
  canArm: boolean;
  canStart: boolean;
  canStop: boolean;
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
  protectedMintCount: number;
  scheduler: MeteredLaunchDataSchedulerStatus;
  initialTrackMs: number;
  extendedTrackMs: number;
  protectedMaxAgeMs: number;
  staleNoTradesMs: number;
  projectRateWindowMs: number;
  eventCostSolPer10000: number;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxUiSessionCostSol: number;
  totalEventsThisSession: number;
  estimatedCostSol: number;
  maxSessionCostSol: number;
  remainingBudgetSol: number;
  projectedCostPerHourSol: number;
  budgetReached: boolean;
  reasonCodes: string[];
  blockers: string[];
  warnings: string[];
  trackedMints: string[];
  lastStopReason: string | null;
  startedAt: string | null;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type MeteredLaunchDataRateObservation = {
  eventCount: number;
  eventsPerSecond: number;
  windowMs: number;
};

export type MeteredLaunchDataServiceOptions = {
  actualData: ActualDataService;
  config?: Partial<MeteredLaunchDataConfig>;
  dataWalletReadiness?: () => ActualDataDataWalletReadiness;
  getLaunchCandidate?: (mint: string) => LaunchCandidateView | null;
  getLaunchCandidates?: (limit?: number) => LaunchCandidateView[];
  getLiveDiscoveryActive?: () => boolean;
  getCalibrationOutcomeProtectionUntil?:
    ((mint: string) => string | null) | undefined;
  hasOpenPaperPosition?: (mint: string) => boolean;
  hasOpenLivePosition?: (mint: string) => boolean;
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
  staleNoTradesTimer?: ReturnType<typeof setTimeout>;
};

type QueuedLaunchCandidate = {
  candidate: LaunchCandidateView;
  enqueuedAt: string;
};

export function createMeteredLaunchDataConfig(
  input: Partial<MeteredLaunchDataConfig> = {}
): MeteredLaunchDataConfig {
  const maxConcurrentMints =
    input.maxConcurrentMints ?? safeMeteredRuntimeDefaults.maxConcurrentMints;
  const reservedNewestSlots =
    input.reservedNewestSlots ?? safeMeteredRuntimeDefaults.reservedNewestSlots;

  return {
    enabled: input.enabled ?? false,
    controlsEnabled: input.controlsEnabled ?? input.enabled ?? false,
    acknowledgedCost: input.acknowledgedCost ?? false,
    requireUiAck: input.requireUiAck ?? true,
    startActive: input.startActive ?? false,
    requireDataWalletReady: input.requireDataWalletReady ?? true,
    mode: input.mode ?? "newest",
    rollingTrackerEnabled: input.rollingTrackerEnabled ?? true,
    reservedNewestSlots,
    maxProtectedMints:
      input.maxProtectedMints ?? safeMeteredRuntimeDefaults.maxProtectedMints,
    schedulerQueueLimit:
      input.schedulerQueueLimit ??
      safeMeteredRuntimeDefaults.schedulerQueueLimit,
    schedulerQueueMaxAgeMs:
      input.schedulerQueueMaxAgeMs ??
      safeMeteredRuntimeDefaults.schedulerQueueMaxAgeMs,
    maxConcurrentMints,
    initialTrackMs: input.initialTrackMs ?? 30_000,
    extendedTrackMs: input.extendedTrackMs ?? 300_000,
    minScoreToExtend: input.minScoreToExtend ?? 45,
    minScoreToTrack: input.minScoreToTrack ?? 0,
    minScoreToProtect: input.minScoreToProtect ?? 65,
    minScoreToProtectRipping: input.minScoreToProtectRipping ?? 80,
    protectedMaxAgeMs: input.protectedMaxAgeMs ?? 900_000,
    staleNoTradesMs: input.staleNoTradesMs ?? 30_000,
    maxEventsPerMint:
      input.maxEventsPerMint ?? safeMeteredRuntimeDefaults.maxEventsPerMint,
    maxEventsPerSession:
      input.maxEventsPerSession ??
      safeMeteredRuntimeDefaults.maxEventsPerSession,
    maxSessionCostSol:
      input.maxSessionCostSol ?? safeMeteredRuntimeDefaults.maxSessionCostSol,
    maxUiSessionCostSol:
      input.maxUiSessionCostSol ??
      safeMeteredRuntimeDefaults.maxUiSessionCostSol,
    autoUnsubscribeOnHardReject: input.autoUnsubscribeOnHardReject ?? true,
    autoUnsubscribeOnLowScore: input.autoUnsubscribeOnLowScore ?? true,
    projectRateWindowMs: input.projectRateWindowMs ?? 60_000,
    eventCostSolPer10000: input.eventCostSolPer10000 ?? 0.01,
    apiKeyConfigured: input.apiKeyConfigured ?? false,
    dataWalletPublicKeyConfigured: input.dataWalletPublicKeyConfigured ?? false,
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
    (() => ActualDataDataWalletReadiness) | undefined;
  private readonly getLaunchCandidate:
    ((mint: string) => LaunchCandidateView | null) | undefined;
  private readonly getLaunchCandidates:
    ((limit?: number) => LaunchCandidateView[]) | undefined;
  private readonly getLiveDiscoveryActive: (() => boolean) | undefined;
  private readonly getCalibrationOutcomeProtectionUntil:
    ((mint: string) => string | null) | undefined;
  private readonly hasOpenPaperPosition:
    ((mint: string) => boolean) | undefined;
  private readonly hasOpenLivePosition: ((mint: string) => boolean) | undefined;
  private readonly providerName: string;
  private readonly recentTradeEvents: StoredMeteredLaunchDataEvent[] = [];
  private readonly recentSchedulerDecisions: MeteredLaunchDataSchedulerDecision[] =
    [];
  private readonly schedulerQueue = new Map<string, QueuedLaunchCandidate>();
  private readonly tracked = new Map<string, InternalTrackedMint>();
  private readonly rateEventTimestamps: number[] = [];
  private budgetReached = false;
  private schedulerDecisionSequence = 0;
  private schedulerDroppedCount = 0;
  private schedulerEvaluationCount = 0;
  private schedulerMutationCount = 0;
  private schedulerPreemptionCount = 0;
  private schedulerQueuedCount = 0;
  private schedulerReconciling = false;
  private lastStopReason: string | null = null;
  private runtimeStopped = false;
  private sessionAck: {
    maxConcurrentMints: number;
    maxEventsPerSession: number;
    maxSessionCostSol: number;
  } | null = null;
  private startedAt: string | null = null;
  private totalEventsThisSession = 0;

  constructor(options: MeteredLaunchDataServiceOptions) {
    this.actualData = options.actualData;
    this.config = createMeteredLaunchDataConfig(options.config);
    this.dataWalletReadiness = options.dataWalletReadiness;
    this.getLaunchCandidate = options.getLaunchCandidate;
    this.getLaunchCandidates = options.getLaunchCandidates;
    this.getLiveDiscoveryActive = options.getLiveDiscoveryActive;
    this.getCalibrationOutcomeProtectionUntil =
      options.getCalibrationOutcomeProtectionUntil;
    this.hasOpenPaperPosition = options.hasOpenPaperPosition;
    this.hasOpenLivePosition = options.hasOpenLivePosition;
    this.providerName = options.providerName;
    this.runtimeStopped = !(
      this.config.startActive && this.isCostAcknowledged()
    );
  }

  prepare(): void {
    if (this.config.startActive && this.isCostAcknowledged()) {
      this.start();
    }
  }

  start(): void {
    this.runtimeStopped = !this.isCostAcknowledged();

    if (this.runtimeStopped || this.startedAt) {
      return;
    }

    this.startedAt = new Date().toISOString();
    this.reconcileSchedulerQueue();
    saveMeteredLaunchDataSession({
      status: this.config.enabled
        ? this.isReady()
          ? "running"
          : "blocked"
        : "disabled",
      mode: this.config.mode,
      trackedMintCount: this.getTrackedMints().length,
      totalEvents: this.getBillableEventCount(),
      estimatedCostSol: this.getEstimatedCostSol(),
      budgetReached: this.isSessionBudgetReached(),
      reasonCodes: this.getReasonCodes(),
      payload: this.getStatus(),
      startedAt: this.startedAt,
      stoppedAt: null,
      createdAt: this.startedAt
    });
  }

  stop(): void {
    this.runtimeStopped = true;
    this.lastStopReason = "service_stop";
    this.schedulerQueue.clear();

    for (const mint of this.getTrackedMints()) {
      this.untrackMint(mint, "service_stop", { reconcileQueue: false });
    }

    if (!this.startedAt) {
      return;
    }

    const stoppedAt = new Date().toISOString();
    saveMeteredLaunchDataSession({
      status: "stopped",
      mode: this.config.mode,
      trackedMintCount: this.getTrackedMints().length,
      totalEvents: this.getBillableEventCount(),
      estimatedCostSol: this.getEstimatedCostSol(),
      budgetReached: this.isSessionBudgetReached(),
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

    if (input.maxSessionCostSol > this.config.maxUiSessionCostSol) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_SESSION_COST_EXCEEDS_UI_LIMIT",
        "Requested session cost cap exceeds the UI session ceiling.",
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

    if (input.startAfterAck) {
      this.start();
    }

    return this.getStatus();
  }

  clearSessionAck(): MeteredLaunchDataStatus {
    this.sessionAck = null;
    this.runtimeStopped = true;
    this.lastStopReason = "session_ack_cleared";
    this.schedulerQueue.clear();

    for (const mint of this.getTrackedMints()) {
      this.untrackMint(mint, "session_ack_cleared", {
        reconcileQueue: false
      });
    }

    return this.getStatus();
  }

  resetSession(): MeteredLaunchDataStatus {
    if (this.startedAt || this.getTrackedMints().length > 0) {
      throw new MeteredLaunchDataServiceError(
        "METERED_LAUNCH_DATA_SESSION_RESET_ACTIVE",
        "Stop metered launch data before resetting its session."
      );
    }

    this.budgetReached = false;
    this.lastStopReason = "session_reset";
    this.runtimeStopped = true;
    this.sessionAck = null;
    this.totalEventsThisSession = 0;
    this.rateEventTimestamps.splice(0);
    this.schedulerQueue.clear();
    this.tracked.clear();

    return this.getStatus();
  }

  evaluateNewLaunchCandidate(
    candidate: LaunchCandidateView,
    options: { dryRun?: boolean; fromQueue?: boolean } = {}
  ): MeteredLaunchDataDecision {
    const blockers = this.getSubscriptionBlockers(candidate.mint);
    const score = candidate.snapshot.score;
    const capacityBlocker = "METERED_LAUNCH_DATA_MAX_CONCURRENT_REACHED";
    const nonCapacityBlockers = blockers.filter(
      (blocker) => blocker !== capacityBlocker
    );
    const selectionReasonCodes =
      this.getCandidateSelectionReasonCodes(candidate);

    if (nonCapacityBlockers.length > 0) {
      return {
        mint: candidate.mint,
        action: "skip",
        tracked: false,
        reasonCodes: unique([
          ...nonCapacityBlockers,
          ...selectionReasonCodes,
          ...(options.dryRun ? ["METERED_LAUNCH_DATA_EVALUATION_ONLY"] : [])
        ]),
        score,
        mode: this.config.mode,
        trackingState: this.getTrackedMint(candidate.mint),
        schedulerDecision: null,
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true
      };
    }

    const plannedDecision = this.planSchedulerDecision(candidate);

    if (options.dryRun) {
      const schedulerDecision = this.recordSchedulerDecision(
        plannedDecision,
        false
      );

      return {
        mint: candidate.mint,
        action: "skip",
        tracked: plannedDecision.action === "keep",
        reasonCodes: unique([
          ...selectionReasonCodes,
          ...plannedDecision.reasonCodes,
          "METERED_LAUNCH_DATA_EVALUATION_ONLY"
        ]),
        score,
        mode: this.config.mode,
        trackingState: this.getTrackedMint(candidate.mint),
        schedulerDecision,
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true
      };
    }

    if (plannedDecision.action === "keep") {
      const trackingState = this.getTrackedMint(candidate.mint);
      const schedulerDecision = this.recordSchedulerDecision(
        plannedDecision,
        true
      );

      return {
        mint: candidate.mint,
        action: "track",
        tracked: trackingState?.status === "tracking",
        reasonCodes: unique([
          ...selectionReasonCodes,
          ...plannedDecision.reasonCodes
        ]),
        score,
        mode: this.config.mode,
        trackingState,
        schedulerDecision,
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true
      };
    }

    if (plannedDecision.action === "queue") {
      const queuedDecision = this.enqueueSchedulerCandidate(
        candidate,
        plannedDecision
      );
      const schedulerDecision = this.recordSchedulerDecision(
        queuedDecision,
        true
      );

      return {
        mint: candidate.mint,
        action: "queue",
        tracked: false,
        reasonCodes: unique([
          ...blockers,
          ...selectionReasonCodes,
          ...queuedDecision.reasonCodes,
          ...(options.fromQueue ? ["SCHEDULER_QUEUE_RECONCILE_DEFERRED"] : [])
        ]),
        score,
        mode: this.config.mode,
        trackingState: this.getTrackedMint(candidate.mint),
        schedulerDecision,
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true
      };
    }

    if (plannedDecision.action === "drop") {
      this.schedulerQueue.delete(candidate.mint);
      const trackedCandidate = this.getTrackedMint(candidate.mint);
      const trackingMutation =
        trackedCandidate?.status === "tracking" &&
        plannedDecision.reasonCodes.includes("SCHEDULER_DROP_HARD_REJECT");

      if (trackingMutation) {
        this.untrackMint(candidate.mint, "scheduler_hard_reject", {
          reconcileQueue: false
        });
      }

      const schedulerDecision = this.recordSchedulerDecision(
        plannedDecision,
        true,
        { trackingMutation }
      );

      if (trackingMutation) {
        this.reconcileSchedulerQueue();
      }

      return {
        mint: candidate.mint,
        action: "skip",
        tracked: false,
        reasonCodes: unique([
          ...selectionReasonCodes,
          ...plannedDecision.reasonCodes
        ]),
        score,
        mode: this.config.mode,
        trackingState: this.getTrackedMint(candidate.mint),
        schedulerDecision,
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true
      };
    }

    if (plannedDecision.action === "preempt" && plannedDecision.preemptMint) {
      this.untrackMint(
        plannedDecision.preemptMint,
        "scheduler_preempt_for_newest",
        { reconcileQueue: false }
      );
    }

    this.schedulerQueue.delete(candidate.mint);
    const trackingState = this.trackMint(
      candidate.mint,
      `scheduler_${plannedDecision.action}_${this.config.mode}`
    );
    const schedulerDecision = this.recordSchedulerDecision(
      plannedDecision,
      true
    );

    return {
      mint: candidate.mint,
      action: "track",
      tracked: true,
      reasonCodes: unique([
        ...trackingState.reasonCodes,
        ...selectionReasonCodes,
        ...plannedDecision.reasonCodes
      ]),
      score,
      mode: this.config.mode,
      trackingState,
      schedulerDecision,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  evaluateCurrentCandidates(limit = 50): MeteredLaunchDataDecision[] {
    return this.getCurrentCandidatesForScheduling(limit).map((candidate) =>
      this.evaluateNewLaunchCandidate(candidate, { dryRun: true })
    );
  }

  trackCurrentCandidates(limit = 50): MeteredLaunchDataDecision[] {
    return this.getCurrentCandidatesForScheduling(limit).map((candidate) =>
      this.evaluateNewLaunchCandidate(candidate)
    );
  }

  getSchedulerStatus(): MeteredLaunchDataSchedulerStatus {
    this.pruneSchedulerQueue();
    const maxConcurrentMints = this.getMaxConcurrentMints();
    const protection = this.getProtectionSummary();
    const effectiveMaxProtectedMints = Math.min(
      this.config.maxProtectedMints,
      Math.max(
        0,
        maxConcurrentMints -
          Math.min(maxConcurrentMints, this.config.reservedNewestSlots)
      )
    );

    return {
      implemented: true,
      enabled: this.config.rollingTrackerEnabled,
      active:
        this.config.rollingTrackerEnabled &&
        this.getStartBlockers().length === 0 &&
        !this.runtimeStopped,
      reservedNewestSlots: Math.min(
        maxConcurrentMints,
        this.config.reservedNewestSlots
      ),
      configuredMaxProtectedMints: this.config.maxProtectedMints,
      effectiveMaxProtectedMints,
      absoluteProtectedMintCount: protection.absolute,
      softProtectedMintCount: Math.min(
        protection.soft,
        Math.max(0, effectiveMaxProtectedMints - protection.absolute)
      ),
      queueLimit: this.config.schedulerQueueLimit,
      queueMaxAgeMs: this.config.schedulerQueueMaxAgeMs,
      queuedCandidateCount: this.schedulerQueue.size,
      queuedMints: Array.from(this.schedulerQueue.keys()),
      evaluationCount: this.schedulerEvaluationCount,
      trackingMutationCount: this.schedulerMutationCount,
      preemptionCount: this.schedulerPreemptionCount,
      queuedCount: this.schedulerQueuedCount,
      droppedCount: this.schedulerDroppedCount,
      lastDecision: this.recentSchedulerDecisions[0] ?? null,
      reasonCodes: unique([
        "ROLLING_NEWEST_SCHEDULER_IMPLEMENTED",
        "SCHEDULER_NEWEST_ALWAYS_CONSIDERED",
        ...(this.config.rollingTrackerEnabled
          ? ["ROLLING_NEWEST_SCHEDULER_ENABLED"]
          : ["ROLLING_NEWEST_SCHEDULER_DISABLED"]),
        ...(this.schedulerQueue.size > 0 ? ["SCHEDULER_QUEUE_PENDING"] : []),
        "PAPER_ONLY",
        "TRADING_DISABLED"
      ]),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  getSchedulerDecisions(limit = 50): MeteredLaunchDataSchedulerDecision[] {
    const parsedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    return this.recentSchedulerDecisions.slice(0, parsedLimit);
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
      const primaryBlocker = blockers[0] ?? "METERED_LAUNCH_DATA_BLOCKED";
      throw new MeteredLaunchDataServiceError(
        primaryBlocker,
        primaryBlocker === "METERED_LAUNCH_DATA_STOPPED"
          ? "Start metered price action before tracking mints."
          : "Metered launch data tracking is blocked by current safety gates."
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
    this.schedulerQueue.delete(normalizedMint);
    this.scheduleInitialReview(normalizedMint);
    this.scheduleStaleNoTradesReview(normalizedMint);
    this.persistSubscription(state);
    return this.toTrackedMint(state);
  }

  untrackMint(
    mint: string,
    reason = "manual_delete",
    options: { reconcileQueue?: boolean } = {}
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

    if (options.reconcileQueue !== false) {
      this.reconcileSchedulerQueue();
    }

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
      this.enforceBillableSessionCaps();
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

    const reachedPerMintCap =
      tracked.eventCount >= this.config.maxEventsPerMint;

    if (reachedPerMintCap) {
      this.untrackMint(event.mint, "max_events_per_mint", {
        reconcileQueue: false
      });
    }

    this.enforceBillableSessionCaps();

    if (this.budgetReached) {
      this.schedulerQueue.clear();
    } else if (reachedPerMintCap) {
      this.reconcileSchedulerQueue();
    }

    return this.getTrackedMint(event.mint) ?? undefined;
  }

  getStatus(): MeteredLaunchDataStatus {
    const cost = this.getSessionCost();
    const budgetReached = this.isSessionBudgetReached();
    const dataWallet = this.getDataWalletReadiness();
    const blockers = this.getStartBlockers();
    const reasonCodes = this.getReasonCodes();
    const acknowledgedCost = this.isCostAcknowledged();
    const capabilityConfigured = this.isCapabilityConfigured(dataWallet);
    const active =
      this.config.enabled && acknowledgedCost && !this.runtimeStopped;
    const scheduler = this.getSchedulerStatus();
    const protectedMintCount =
      scheduler.absoluteProtectedMintCount + scheduler.softProtectedMintCount;

    return {
      enabled: this.config.enabled,
      controlsEnabled: this.config.controlsEnabled,
      capabilityConfigured,
      active,
      acknowledgedCost,
      envAcknowledgedCost: this.config.acknowledgedCost,
      sessionAcknowledgedCost: this.sessionAck !== null,
      ackSource: this.getAckSource(),
      requireUiAck: this.config.requireUiAck,
      requireDataWalletReady: this.config.requireDataWalletReady,
      ready: blockers.length === 0,
      canArm:
        this.config.controlsEnabled &&
        this.config.enabled &&
        capabilityConfigured &&
        !active,
      canStart:
        this.config.controlsEnabled &&
        this.config.enabled &&
        acknowledgedCost &&
        !active &&
        blockers.length === 0,
      canStop: active || this.getTrackedMints().length > 0,
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
      protectedMintCount,
      scheduler,
      initialTrackMs: this.config.initialTrackMs,
      extendedTrackMs: this.config.extendedTrackMs,
      protectedMaxAgeMs: this.config.protectedMaxAgeMs,
      staleNoTradesMs: this.config.staleNoTradesMs,
      projectRateWindowMs: this.config.projectRateWindowMs,
      eventCostSolPer10000: this.config.eventCostSolPer10000,
      maxEventsPerMint: this.config.maxEventsPerMint,
      maxEventsPerSession: this.getMaxEventsPerSession(),
      maxUiSessionCostSol: this.config.maxUiSessionCostSol,
      totalEventsThisSession: this.getBillableEventCount(),
      estimatedCostSol: cost.estimatedCostSol,
      maxSessionCostSol: this.getMaxSessionCostSol(),
      remainingBudgetSol: cost.remainingBudgetSol,
      projectedCostPerHourSol: cost.projectedCostPerHourSol,
      budgetReached,
      reasonCodes,
      blockers,
      warnings: this.getWarnings(),
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
    const totalEventsThisSession = this.getBillableEventCount();
    const budgetReached = this.isSessionBudgetReached();
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
      totalEventsThisSession,
      maxEventsPerSession: this.getMaxEventsPerSession(),
      budgetReached,
      reasonCodes: unique([
        ...(budgetReached ? ["METERED_LAUNCH_DATA_BUDGET_REACHED"] : []),
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

  getRateObservation(nowMs = Date.now()): MeteredLaunchDataRateObservation {
    this.pruneRateEvents(nowMs);

    return {
      eventCount: this.rateEventTimestamps.length,
      eventsPerSecond:
        this.config.projectRateWindowMs > 0
          ? (this.rateEventTimestamps.length /
              this.config.projectRateWindowMs) *
            1_000
          : 0,
      windowMs: this.config.projectRateWindowMs
    };
  }

  getReasonCodes(): string[] {
    const blockers = this.getStartBlockers();
    const budgetReached = this.isSessionBudgetReached();
    return unique([
      ...blockers,
      ...(this.runtimeStopped ? ["METERED_LAUNCH_DATA_STOPPED"] : []),
      ...this.getDataWalletReadiness().reasonCodes,
      ...(blockers.length === 0 ? ["METERED_LAUNCH_DATA_READY"] : []),
      ...(budgetReached ? ["METERED_LAUNCH_DATA_BUDGET_REACHED"] : []),
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

  private planSchedulerDecision(
    candidate: LaunchCandidateView
  ): TrackingSchedulerDecision {
    const now = new Date();

    return scheduleNewestCandidate({
      candidate: {
        mint: candidate.mint,
        discoveredAt: candidate.discoveredAt,
        observedAt: this.getSchedulerCandidateObservedAt(candidate),
        score: candidate.snapshot.score,
        phase: candidate.snapshot.phase,
        hardRejected: this.isHardRejectedCandidate(candidate),
        migration: candidate.eventType === "migration",
        eligible: this.shouldTrackCandidate(candidate)
      },
      tracked: this.getSchedulerTrackedMints(),
      policy: {
        enabled: this.config.rollingTrackerEnabled,
        maxConcurrentMints: this.getMaxConcurrentMints(),
        reservedNewestSlots: this.config.reservedNewestSlots,
        maxProtectedMints: this.config.maxProtectedMints,
        queueLimit: this.config.schedulerQueueLimit,
        queueMaxAgeMs: this.config.schedulerQueueMaxAgeMs,
        staleNoTradesMs: this.config.staleNoTradesMs,
        maxTrackingAgeMs: this.config.extendedTrackMs
      },
      now
    });
  }

  private getSchedulerTrackedMints(): TrackingSchedulerTrackedMint[] {
    return this.getTrackedMints().flatMap((mint) => {
      const tracked = this.tracked.get(mint);

      if (!tracked || tracked.status !== "tracking") {
        return [];
      }

      const candidate = this.getLaunchCandidate?.(mint) ?? null;

      return [
        {
          mint,
          subscribedAt: tracked.subscribedAt ?? new Date().toISOString(),
          score: candidate?.snapshot.score ?? 0,
          phase: candidate?.snapshot.phase ?? "unknown",
          eventCount: tracked.eventCount,
          latestTradeAt: tracked.latestTradeAt,
          hardRejected:
            candidate !== null && this.isHardRejectedCandidate(candidate),
          protectionReason: this.getTrackedMintProtectionReason(
            tracked,
            candidate
          )
        }
      ];
    });
  }

  private enqueueSchedulerCandidate(
    candidate: LaunchCandidateView,
    decision: TrackingSchedulerDecision
  ): TrackingSchedulerDecision {
    this.pruneSchedulerQueue();
    this.schedulerQueue.delete(candidate.mint);
    let rotatedOldest = false;

    while (
      this.schedulerQueue.size >= this.config.schedulerQueueLimit &&
      this.schedulerQueue.size > 0
    ) {
      const oldestMint = this.schedulerQueue.keys().next().value as
        string | undefined;

      if (!oldestMint) {
        break;
      }

      this.schedulerQueue.delete(oldestMint);
      rotatedOldest = true;
    }

    this.schedulerQueue.set(candidate.mint, {
      candidate,
      enqueuedAt: new Date().toISOString()
    });

    return rotatedOldest
      ? {
          ...decision,
          reasonCodes: unique([
            ...decision.reasonCodes,
            "SCHEDULER_QUEUE_ROTATED_OLDEST"
          ])
        }
      : decision;
  }

  private recordSchedulerDecision(
    decision: TrackingSchedulerDecision,
    executed: boolean,
    options: { trackingMutation?: boolean } = {}
  ): MeteredLaunchDataSchedulerDecision {
    this.schedulerEvaluationCount += 1;

    if (executed && decision.action === "preempt") {
      this.schedulerPreemptionCount += 1;
    }

    if (
      executed &&
      (decision.action === "preempt" ||
        decision.action === "track" ||
        options.trackingMutation === true)
    ) {
      this.schedulerMutationCount += 1;
    }

    if (executed && decision.action === "queue") {
      this.schedulerQueuedCount += 1;
    }

    if (executed && decision.action === "drop") {
      this.schedulerDroppedCount += 1;
    }

    const record: MeteredLaunchDataSchedulerDecision = {
      ...decision,
      decisionId: ++this.schedulerDecisionSequence,
      decidedAt: new Date().toISOString(),
      executed,
      queueDepthAfter: this.schedulerQueue.size
    };

    this.recentSchedulerDecisions.unshift(record);
    this.recentSchedulerDecisions.splice(100);
    return record;
  }

  private pruneSchedulerQueue(nowMs = Date.now()): void {
    for (const [mint, queued] of this.schedulerQueue) {
      const enqueuedAtMs = Date.parse(queued.enqueuedAt);
      const expired =
        this.config.schedulerQueueMaxAgeMs > 0 &&
        Number.isFinite(enqueuedAtMs) &&
        nowMs - enqueuedAtMs > this.config.schedulerQueueMaxAgeMs;
      const tracked = this.tracked.get(mint)?.status === "tracking";

      if (expired || tracked) {
        this.schedulerQueue.delete(mint);
      }
    }
  }

  private reconcileSchedulerQueue(): void {
    if (this.schedulerReconciling || this.runtimeStopped) {
      return;
    }

    this.pruneSchedulerQueue();
    const queued = Array.from(this.schedulerQueue.values()).sort(
      (left, right) =>
        Date.parse(this.getSchedulerCandidateObservedAt(right.candidate)) -
          Date.parse(this.getSchedulerCandidateObservedAt(left.candidate)) ||
        Date.parse(right.enqueuedAt) - Date.parse(left.enqueuedAt)
    )[0];

    if (!queued) {
      return;
    }

    const nonCapacityBlockers = this.getSubscriptionBlockers(
      queued.candidate.mint
    ).filter(
      (blocker) => blocker !== "METERED_LAUNCH_DATA_MAX_CONCURRENT_REACHED"
    );

    if (nonCapacityBlockers.length > 0) {
      return;
    }

    this.schedulerQueue.delete(queued.candidate.mint);
    this.schedulerReconciling = true;

    try {
      this.evaluateNewLaunchCandidate(
        this.getLaunchCandidate?.(queued.candidate.mint) ?? queued.candidate,
        { fromQueue: true }
      );
    } finally {
      this.schedulerReconciling = false;
    }
  }

  private getProtectionSummary(): { absolute: number; soft: number } {
    let absolute = 0;
    let soft = 0;
    const nowMs = Date.now();

    for (const mint of this.getTrackedMints()) {
      const tracked = this.tracked.get(mint);

      if (!tracked) {
        continue;
      }

      const candidate = this.getLaunchCandidate?.(mint) ?? null;
      const subscribedAtMs = tracked.subscribedAt
        ? Date.parse(tracked.subscribedAt)
        : NaN;
      const ageMs = Number.isFinite(subscribedAtMs)
        ? Math.max(0, nowMs - subscribedAtMs)
        : Number.POSITIVE_INFINITY;
      const hardRejected =
        candidate !== null && this.isHardRejectedCandidate(candidate);
      const trackingAgeExpired =
        this.config.extendedTrackMs > 0 && ageMs >= this.config.extendedTrackMs;
      const staleNoTrades =
        this.config.staleNoTradesMs > 0 &&
        ageMs >= this.config.staleNoTradesMs &&
        tracked.eventCount === 0;

      if (hardRejected || trackingAgeExpired || staleNoTrades) {
        continue;
      }

      const reason = this.getTrackedMintProtectionReason(tracked, candidate);

      if (
        reason === "paper_position" ||
        reason === "live_position" ||
        reason === "calibration_outcome"
      ) {
        absolute += 1;
      } else if (reason !== null) {
        soft += 1;
      }
    }

    return { absolute, soft };
  }

  private isHardRejectedCandidate(candidate: LaunchCandidateView): boolean {
    return (
      candidate.snapshot.phase === "rejected" ||
      candidate.snapshot.blockers.includes("HARD_REJECT")
    );
  }

  private getCurrentCandidatesForScheduling(
    limit: number
  ): LaunchCandidateView[] {
    return [...(this.getLaunchCandidates?.(limit) ?? [])].sort(
      (left, right) =>
        Number(this.hasCalibrationOutcomeProtection(right.mint)) -
          Number(this.hasCalibrationOutcomeProtection(left.mint)) ||
        Date.parse(this.getSchedulerCandidateObservedAt(left)) -
          Date.parse(this.getSchedulerCandidateObservedAt(right)) ||
        left.mint.localeCompare(right.mint)
    );
  }

  private getSchedulerCandidateObservedAt(
    candidate: LaunchCandidateView
  ): string {
    return candidate.eventType === "migration"
      ? candidate.latestEventAt
      : candidate.discoveredAt;
  }

  private getTrackedMintProtectionReason(
    tracked: InternalTrackedMint,
    candidate: LaunchCandidateView | null
  ): TrackingProtectionReason | null {
    if (this.hasOpenLivePosition?.(tracked.mint) === true) {
      return "live_position";
    }

    if (this.hasOpenPaperPosition?.(tracked.mint) === true) {
      return "paper_position";
    }

    if (this.hasCalibrationOutcomeProtection(tracked.mint)) {
      return "calibration_outcome";
    }

    const subscribedAtMs = tracked.subscribedAt
      ? Date.parse(tracked.subscribedAt)
      : NaN;
    const ageMs = Number.isFinite(subscribedAtMs)
      ? Date.now() - subscribedAtMs
      : Number.POSITIVE_INFINITY;

    if (
      candidate?.eventType === "migration" &&
      Number.isFinite(ageMs) &&
      ageMs <= this.config.protectedMaxAgeMs
    ) {
      return "migration";
    }

    if (
      candidate?.snapshot.phase === "ripping" &&
      candidate.snapshot.score >= this.config.minScoreToProtectRipping
    ) {
      return "ripping";
    }

    if (
      candidate?.snapshot.phase === "hot" &&
      candidate.snapshot.score >= this.config.minScoreToProtect
    ) {
      return "hot";
    }

    if (
      Number.isFinite(ageMs) &&
      ageMs <= this.config.protectedMaxAgeMs &&
      candidate?.snapshot.score !== undefined &&
      candidate.snapshot.score >= this.config.minScoreToProtect
    ) {
      return "protected_score";
    }

    return null;
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

  private scheduleStaleNoTradesReview(mint: string): void {
    const state = this.tracked.get(mint);

    if (!state || this.config.staleNoTradesMs <= 0) {
      return;
    }

    state.staleNoTradesTimer = setTimeout(() => {
      this.reviewStaleNoTrades(mint);
    }, this.config.staleNoTradesMs);
  }

  private reviewStaleNoTrades(mint: string): void {
    const state = this.tracked.get(mint);

    if (!state || state.status !== "tracking") {
      return;
    }

    if (state.eventCount === 0) {
      this.untrackMint(mint, "stale_no_trades");
    }
  }

  private reviewInitialWindow(mint: string): void {
    const state = this.tracked.get(mint);

    if (!state || state.status !== "tracking") {
      return;
    }

    const calibrationProtectionUntilMs =
      this.getCalibrationOutcomeProtectionUntilMs(mint);

    if (
      calibrationProtectionUntilMs !== null &&
      calibrationProtectionUntilMs > Date.now()
    ) {
      state.initialReviewTimer = setTimeout(
        () => {
          this.reviewInitialWindow(mint);
        },
        Math.max(1, calibrationProtectionUntilMs - Date.now())
      );
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

    if (state.staleNoTradesTimer) {
      clearTimeout(state.staleNoTradesTimer);
      delete state.staleNoTradesTimer;
    }
  }

  private untrackAll(reason: string): void {
    for (const mint of this.getTrackedMints()) {
      this.untrackMint(mint, reason, { reconcileQueue: false });
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
        subscription:
          subscription ?? this.findActualDataSubscription(state.mint)
      },
      ...(createdAt ? { createdAt } : {})
    });
  }

  private getStartBlockers(): string[] {
    return this.getSubscriptionBlockers(undefined, { includeStopped: false });
  }

  private hasCalibrationOutcomeProtection(
    mint: string,
    nowMs = Date.now()
  ): boolean {
    const protectionUntilMs = this.getCalibrationOutcomeProtectionUntilMs(mint);
    return protectionUntilMs !== null && protectionUntilMs > nowMs;
  }

  private getCalibrationOutcomeProtectionUntilMs(mint: string): number | null {
    if (!this.getCalibrationOutcomeProtectionUntil) {
      return null;
    }

    const protectionUntil = this.getCalibrationOutcomeProtectionUntil(mint);
    const protectionUntilMs = Date.parse(protectionUntil ?? "");
    return Number.isFinite(protectionUntilMs) ? protectionUntilMs : null;
  }

  private getWarnings(): string[] {
    const stoppedAfterUserAction =
      this.runtimeStopped &&
      this.isCostAcknowledged() &&
      this.lastStopReason !== null;

    return unique([
      ...(stoppedAfterUserAction ? ["METERED_LAUNCH_DATA_STOPPED"] : [])
    ]);
  }

  private getSubscriptionBlockers(
    mint?: string,
    options: { includeStopped?: boolean } = {}
  ): string[] {
    const dataWallet = this.getDataWalletReadiness();
    const reasonCodes: string[] = [];
    const includeStopped = options.includeStopped ?? true;

    if (!this.config.enabled) {
      reasonCodes.push("METERED_LAUNCH_DATA_DISABLED");
    }

    if (!this.isCostAcknowledged()) {
      reasonCodes.push("METERED_LAUNCH_DATA_ACK_MISSING");
    }

    if (includeStopped && this.runtimeStopped) {
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
      dataWallet.subscriptionBlockers.some(
        (code) => code.includes("BALANCE") || code.includes("FUNDS")
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

    if (this.isSessionBudgetReached()) {
      reasonCodes.push("METERED_LAUNCH_DATA_BUDGET_REACHED");
    }

    if (this.getBillableEventCount() >= this.getMaxEventsPerSession()) {
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
    return this.getStartBlockers().length === 0;
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
    return (
      this.sessionAck !== null ||
      (this.config.acknowledgedCost && !this.config.requireUiAck)
    );
  }

  private getAckSource(): MeteredLaunchDataStatus["ackSource"] {
    if (this.sessionAck !== null) {
      return "session";
    }

    if (this.config.acknowledgedCost && !this.config.requireUiAck) {
      return "env";
    }

    return "none";
  }

  private isCapabilityConfigured(
    dataWallet = this.getDataWalletReadiness()
  ): boolean {
    return (
      this.config.controlsEnabled &&
      this.config.enabled &&
      this.config.apiKeyConfigured &&
      this.config.dataWalletPublicKeyConfigured &&
      dataWallet.configured
    );
  }

  private getMaxConcurrentMints(): number {
    return (
      this.sessionAck?.maxConcurrentMints ?? this.config.maxConcurrentMints
    );
  }

  private getMaxEventsPerSession(): number {
    return (
      this.sessionAck?.maxEventsPerSession ?? this.config.maxEventsPerSession
    );
  }

  private getMaxSessionCostSol(): number {
    return this.sessionAck?.maxSessionCostSol ?? this.config.maxSessionCostSol;
  }

  private getBillableEventCount(): number {
    return Math.max(
      this.totalEventsThisSession,
      this.actualData.getEventCounters().totalEventsThisSession
    );
  }

  private isSessionBudgetReached(): boolean {
    return (
      this.budgetReached ||
      this.actualData.getStatus().budgetReached ||
      this.getBillableEventCount() >= this.getMaxEventsPerSession() ||
      this.getEstimatedCostSol() >= this.getMaxSessionCostSol()
    );
  }

  private enforceBillableSessionCaps(): void {
    if (this.getBillableEventCount() >= this.getMaxEventsPerSession()) {
      this.budgetReached = true;
      this.untrackAll("max_events_per_session");
      this.schedulerQueue.clear();
      return;
    }

    if (this.getEstimatedCostSol() >= this.getMaxSessionCostSol()) {
      this.budgetReached = true;
      this.untrackAll("max_session_cost");
      this.schedulerQueue.clear();
    }
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

  private getEstimatedCostSol(
    eventCount = this.getBillableEventCount()
  ): number {
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
  const normalized = reason
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
  return normalized
    ? `METERED_LAUNCH_DATA_${normalized}`
    : "METERED_LAUNCH_DATA_STOPPED";
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
