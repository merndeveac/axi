import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  LiveTokenCardViewModel,
  MomentumDiagnostics,
  MomentumScannerRow,
  OverlaySignal,
  RiskSnapshot,
  RollingMetricsSnapshot,
  StrategyStatus,
  TokenIdentitySummary
} from "@axi/shared";
import { DataPanel } from "./components/DataPanel";
import { MetricValue } from "./components/MetricValue";
import { ReasonCodes } from "./components/ReasonCodes";
import {
  formatAcceleration,
  formatAge,
  formatCompactNumber,
  formatMintShort,
  formatPct,
  formatSol,
  formatTime,
  formatTimeAgo,
  formatUnknown,
  formatUsd,
  formatVelocity
} from "./formatters";
import {
  getLiquidityDisplay,
  getMarketCapDisplay,
  getTokenInitials,
  sanitizeDashboardImageUri
} from "./scanner-view";
import {
  getMeteredControlView,
  getMeteredRuntimeBlockers as getHeaderMeteredRuntimeBlockers,
  getWalletSetupText
} from "./runtime-controls";

type ConnectionStatus = "connecting" | "open" | "closed";
type ApiStatus = "checking" | "connected" | "disconnected";
type TabId =
  | "scanner"
  | "signals"
  | "portfolio"
  | "metrics"
  | "risk"
  | "exit"
  | "data"
  | "debug";
type SortMode =
  | "newest"
  | "launchScore"
  | "marketCap"
  | "curveLiquidity"
  | "liquidity"
  | "volume10s"
  | "txns10s"
  | "priceChange"
  | "volumeVelocity"
  | "priceVelocity"
  | "uniqueBuyers"
  | "buySellRatio"
  | "signalStrength"
  | "risk"
  | "pnl";
type ActionFilter =
  | "all"
  | "discovery"
  | "watch"
  | "hot"
  | "ripping"
  | "rejected"
  | "tradeTracked"
  | "priceActionReady"
  | "curvePrice"
  | "discoveryOnly"
  | "migrated"
  | "paperPosition"
  | "missingData"
  | "missingCritical";

type StorageStats = {
  databasePath: string;
  feedEventCount: number;
  liveFeedEventCount: number;
  launchCandidateCount: number;
  launchScoreSnapshotCount: number;
  launchTradeSampleCount: number;
  launchTrackingEventCount: number;
  launchTrackingSessionCount: number;
  signalCount: number;
  chainVerificationCount: number;
  chainTransactionEventCount: number;
  chainTradeEventCount: number;
  marketObservationCount: number;
  pumpPortalTokenTradeEventCount: number;
  actualDataSubscriptionCount: number;
  actualDataSessionCount: number;
  meteredLaunchDataSessionCount: number;
  meteredLaunchDataSubscriptionCount: number;
  meteredLaunchDataEventCount: number;
  tokenIdentityCount: number;
  tokenIdentityResolvedCount: number;
  tokenIdentityUnresolvedCount: number;
  tokenMetadataFetchCount: number;
  watchPlanCount: number;
  watchActionCount: number;
  lightningTradePlanCount: number;
  pumpPortalWalletStatusSnapshotCount: number;
  riskSnapshotCount: number;
  candidateDecisionCount: number;
  paperOrderCount: number;
  paperPositionCount: number;
  paperPortfolioOrderCount: number;
  paperPortfolioFillCount: number;
  paperPortfolioPositionCount: number;
  paperPortfolioSnapshotCount: number;
  watchedWalletCount: number;
  watchedWalletTradeEventCount: number;
  exitRuleCount: number;
  exitSignalCount: number;
  lastSignalAt: string | null;
};

type FeedStatus = {
  mode: string;
  provider: string;
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  connecting: boolean;
  live: boolean;
  realData: boolean;
  subscriptions: string[];
  reconnectAttempts: number;
  lastOpenAt: string | null;
  lastCloseAt: string | null;
  lastMessageAt: string | null;
  lastEventAt: string | null;
  newTokenEventCount: number;
  migrationEventCount: number;
  tokenTradeEventCount: number;
  accountTradeEventCount: number;
  accountTradeSubscriptions: string[];
  parseErrorCount: number;
  lastError: string | null;
  reasonCodes: string[];
  paperOnly: true;
};

type LiveStatus = {
  mode: string;
  provider: string;
  sessionId: string;
  live: boolean;
  realData: boolean;
  liveTokenCount: number;
  liveFeedEventCount: number;
  lastEventAt: string | null;
  historicalMockRowsHidden: true;
  reasonCodes: string[];
  paperOnly: true;
  feed: FeedStatus;
};

type ActualDataStatus = {
  acknowledgedMetered: boolean;
  apiKeyConfigured: boolean;
  autoSubscribe: boolean;
  autoSubscribeOnMigration: boolean;
  autoSubscribeOnNewToken: boolean;
  autoSubscribeOnQualified: boolean;
  budgetReached: boolean;
  compatibleProvider: boolean;
  dataWalletBalanceSol: number | null;
  dataWalletBalanceStatus: string;
  dataWalletConfigured: boolean;
  dataWalletEstimatedEventsRemaining: number | null;
  dataWalletReasonCodes: string[];
  enabled: boolean;
  estimatedMeteredCostSol: number | null;
  manualMintCount: number;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSubscribedTokens: number;
  paperOnly: true;
  provider: string;
  reasonCodes: string[];
  subscribedTokenCount: number;
  totalEventsThisSession: number;
  meteredLaunchData?: MeteredLaunchDataStatus;
};

type PumpPortalDataWalletStatus = {
  configured: boolean;
  apiKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  publicKey: string | null;
  shortPublicKey: string | null;
  publicKeyValid: boolean;
  solanaRpcConfigured: boolean;
  balanceSol: number | null;
  balanceLamports: number | null;
  minBalanceSol: number;
  warnBalanceSol: number;
  criticalBalanceSol: number;
  targetBalanceSol: number;
  balanceStatus: string;
  estimatedEventsRemaining: number | null;
  estimatedCostPer10000EventsSol: number;
  lastBalanceCheckAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

type PumpPortalWalletSummary = {
  role: "data" | "trading";
  configured: boolean;
  apiKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  publicKey: string | null;
  shortPublicKey: string | null;
  publicKeyValid: boolean;
  balanceSol: number | null;
  balanceLamports: number | null;
  balanceStatus: string;
  minBalanceSol: number;
  warnBalanceSol: number;
  criticalBalanceSol: number;
  targetBalanceSol: number;
  lastBalanceCheckAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
};

type PumpPortalWalletsStatus = {
  dataWallet: PumpPortalWalletSummary;
  tradingWallet: PumpPortalWalletSummary;
  sameWallet: boolean;
  sameWalletWarning: string | null;
  solanaRpcConfigured: boolean;
  paperOnly: true;
  tradingDisabled: true;
  secretFieldsExposed: false;
  reasonCodes: string[];
};

type LightningStatus = {
  readiness: {
    enabled: boolean;
    liveTradingAllowed: boolean;
    manualArmRequired: boolean;
    manualArmed: boolean;
    dataWalletReady: boolean;
    tradingWalletReady: boolean;
    apiKeyConfigured: boolean;
    publicKeyConfigured: boolean;
    balanceSol: number | null;
    reasonCodes: string[];
  };
  limits: {
    maxBuySol: number;
    maxDailySol: number;
    maxOpenPositions: number;
    maxSlippagePct: number;
    priorityFeeSol: number;
    pool: string;
    skipPreflight: boolean;
    jitoOnly: boolean;
  };
  liveTradingAllowed: boolean;
  manualArmRequired: boolean;
  manualArmed: boolean;
  maxBuySol: number;
  maxDailySol: number;
  maxOpenPositions: number;
  pool: string;
  slippage: number;
  priorityFee: number;
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

type LiveTradeTrackingStatus = {
  acknowledgedMetered: boolean;
  autoMode: string;
  budgetReached: boolean;
  enabled: boolean;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSubscribedTokens: number;
  paperOnly: true;
  reasonCodes: string[];
  subscribedTokenCount: number;
  totalEventsThisSession: number;
  trackedMints: string[];
};

type LaunchScannerStatus = {
  runtimeMode: string;
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
  launchTrackingMode: string;
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
  meteredLaunchData?: MeteredLaunchDataStatus;
  paperOnly: true;
  tradingDisabled: true;
};

type MeteredLaunchDataStatus = {
  enabled: boolean;
  controlsEnabled?: boolean;
  capabilityConfigured?: boolean;
  active: boolean;
  acknowledgedCost: boolean;
  envAcknowledgedCost?: boolean;
  sessionAcknowledgedCost: boolean;
  ackSource?: "env" | "none" | "session";
  requireUiAck?: boolean;
  requireDataWalletReady: boolean;
  ready: boolean;
  canArm?: boolean;
  canStart?: boolean;
  canStop?: boolean;
  mode: string;
  provider: string;
  liveDiscoveryEnabled: boolean;
  liveDiscoveryActive: boolean;
  apiKeyConfigured: boolean;
  dataWalletConfigured: boolean;
  dataWalletBalanceSol: number | null;
  dataWalletBalanceStatus: string;
  dataWalletEstimatedEventsRemaining: number | null;
  maxConcurrentMints: number;
  trackedMintCount: number;
  scheduler: {
    implemented: true;
    enabled: boolean;
    active: boolean;
    reservedNewestSlots: number;
    effectiveMaxProtectedMints: number;
    queuedCandidateCount: number;
    evaluationCount: number;
    trackingMutationCount: number;
    preemptionCount: number;
    lastDecision: {
      action: "track" | "keep" | "preempt" | "queue" | "drop";
      incomingMint: string;
      decidedAt: string;
    } | null;
  };
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxUiSessionCostSol?: number;
  totalEventsThisSession: number;
  estimatedCostSol: number;
  maxSessionCostSol: number;
  remainingBudgetSol: number;
  projectedCostPerHourSol: number;
  budgetReached: boolean;
  reasonCodes: string[];
  blockers?: string[];
  warnings?: string[];
  trackedMints: string[];
  lastStopReason: string | null;
  startedAt: string | null;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

type RuntimeControlStatus = {
  controlPlaneEnabled: boolean;
  localOnly: boolean;
  runtimeMode: string;
  paperOnly: true;
  tradingDisabled: true;
  runtime: {
    mode: string;
    paperOnly: true;
    tradingDisabled: true;
    startedAt: string;
    uptimeSeconds: number;
  };
  api: {
    online: boolean;
    wsOnline: boolean;
    pid: number;
    ports: number[];
    lastUpdatedAt: string;
  };
  liveDiscovery: {
    enabled: boolean;
    provider: string;
    connected: boolean;
    connecting: boolean;
    stopped: boolean;
    lastStartedAt: string | null;
    lastStoppedAt: string | null;
    lastEventAt: string | null;
    newTokenEventCount: number;
    migrationEventCount: number;
    errorCount: number;
    lastError: string | null;
    reasonCodes: string[];
  };
  meteredPriceAction: {
    state:
      | "OFF"
      | "ARM_REQUIRED"
      | "READY"
      | "ACTIVE"
      | "STOPPED"
      | "BLOCKED"
      | "BUDGET_REACHED";
    enabled: boolean;
    controlsEnabled: boolean;
    capabilityConfigured: boolean;
    active: boolean;
    canArm: boolean;
    canStart: boolean;
    canStop: boolean;
    requiresAck: boolean;
    sessionAck: boolean;
    envAck: boolean;
    ackSource: "env" | "none" | "session";
    acknowledgedCost: boolean;
    provider: string;
    apiKeyConfigured: boolean;
    dataWalletPublicKeyConfigured: boolean;
    dataWalletBalanceStatus: string;
    trackedMintCount: number;
    eventCount: number;
    estimatedCostSol: number;
    sessionCostCapSol: number;
    budgetRemainingSol: number;
    maxConcurrentMints: number;
    maxEventsPerSession: number;
    maxUiSessionCostSol: number;
    budgetReached: boolean;
    latestEventAt: string | null;
    blockers: string[];
    warnings: string[];
    reasonCodes: string[];
  };
  meteredLaunchData: {
    enabled: boolean;
    active: boolean;
    blocked: boolean;
    trackedMintCount: number;
    eventCount: number;
    estimatedCostSol: number;
    sessionCostCapSol: number;
    budgetRemainingSol: number;
    latestEventAt: string | null;
    reasonCodes: string[];
  };
  dataWallet: {
    publicKeyConfigured: boolean;
    publicKey: string | null;
    shortPublicKey: string | null;
    apiKeyConfigured: boolean;
    balanceSol: number | null;
    balanceStatus: string;
    estimatedEventsRemaining: number | null;
    lastBalanceCheckAt: string | null;
    reasonCodes: string[];
  };
  tradingWallet: {
    purpose: "future_lightning_execution";
    enabledReadiness: true;
    publicKeyConfigured: boolean;
    publicKey: string | null;
    shortPublicKey: string | null;
    apiKeyConfigured: boolean;
    balanceSol: number | null;
    balanceStatus: string;
    lastBalanceCheckAt: string | null;
    reasonCodes: string[];
    sameAsDataWallet: boolean;
    liveTradingAllowed: false;
    manualArmed: false;
    warning: string;
  };
  usage: {
    meteredEventCount: number;
    estimatedCostSol: number;
    maxSessionCostSol: number;
    remainingBudgetSol: number;
    projectedCostPerHourSol: number;
    trackedMintCount: number;
  };
  safety: {
    accountTradesEnabled: false;
    lightningExecutionEnabled: false;
    localTransactionApiEnabled: false;
    privateKeysLoaded: false;
    liveTradingEnabled: false;
    reasonCodes: string[];
  };
  process: {
    pid: number;
    uptimeSeconds: number;
    ports: number[];
    startedAt: string;
  };
  reasonCodes: string[];
};

type RuntimeControlResult = {
  ok: boolean;
  message: string;
  status: RuntimeControlStatus;
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

type RuntimeContract = {
  version: number;
  runtimeSessionId: string;
  safety: {
    apiHost: string;
    localMutationGuard: boolean;
    tradingDisabled: boolean;
  };
  ownership: {
    capacityModel: string;
    canonicalDerivatives: string;
    canonicalDerivativeStrength: string;
    canonicalTimeseries: string;
    discoveryAndLaunchScoring: string;
    signalCalibration: string;
    calibrationSessionCapture: string;
    paperStrategyEvaluation: string;
    paperExitPolicy: string;
    subscriptionPolicy: string;
    subscriptionTransport: string;
    trackingScheduler: string;
    trackingCommandRoute: string;
  };
  configuration: {
    driftDetected: boolean;
    drift: Array<{
      code: string;
      key: string;
      expected: number;
      actual: number;
    }>;
  };
  timeseries: {
    canonical: true;
    bucketMs: number;
    retentionMs: number;
    mintCount: number;
    bucketCount: number;
    acceptedEventCount: number;
    duplicateEventCount: number;
    lateEventCount: number;
  };
  derivatives: {
    canonical: true;
    method: string;
    primaryWindowMs: number;
    firstDerivativeMinSamples: number;
    secondDerivativeMinSamples: number;
    derivativeReadyMintCount: number;
    accelerationReadyMintCount: number;
  };
  derivativeStrength: {
    canonical: true;
    method: string;
    minimumRobustCohortSize: number;
    confidenceReportedSeparately: true;
    confidenceAppliedToSignalScore: false;
    calibrationStatus: "pending";
    onlineCohortPolicy: string;
  };
  signalCalibration: {
    strategyVersion: string;
    policyStatus: "reference_only";
    calibrationStatus: "reference_only";
    evaluatorStatus: "implemented";
    outcomeCaptureStatus: "implemented";
    outcomeCaptureOwner: "@axi/session-capture";
    paperStrategyEvaluationStatus: "implemented";
    paperStrategyEvaluationOwner: "@axi/paper-strategy-evaluation";
    automaticThresholdActivation: false;
  };
  sessionCapture: {
    captureVersion: string;
    implementationStatus: "implemented";
    activationMode: "manual_local_only";
    defaultActive: false;
    outcomePolicy: string;
    futureDataRejected: true;
    automaticThresholdActivation: false;
  };
  paperStrategyEvaluation: {
    evaluationVersion: string;
    implementationStatus: "implemented";
    activationMode: "offline_local_only";
    temporalHoldoutRequired: true;
    incompleteOutcomesRejected: true;
    automaticThresholdActivation: false;
    automaticPaperTradingActivation: false;
  };
  paperExitPolicy: {
    policyVersion: string;
    implementationStatus: "implemented";
    policyStatus: "reference_only";
    evaluationMode: "deterministic_paper_and_replay";
    automaticPaperExitActivation: false;
    automaticLiveExecution: false;
    operatorConfiguredPaperExecutionRequired: true;
  };
};

type RuntimeCapacityReport = {
  generatedAt: string;
  observation: {
    windowMs: number;
    launchCount: number;
    launchRatePerMinute: number;
    launchConfidence: "none" | "low" | "medium" | "high";
    tradeEventCount: number;
    observedEventsPerSecond: number;
    eventRateConfidence: "none" | "low" | "medium" | "high";
  };
  slots: {
    concurrentSlots: number;
    trackedMintCount: number;
    protectedMintCount: number;
    availableNewestSlots: number;
    requiredInitialSlotsRoundedUp: number;
    minimumTotalSlotsForFullInitialCoverage: number;
    maximumFullyObservedLaunchesPerMinute: number;
    initialCoverageRatio: number;
    allLaunchesCanReceiveInitialWindow: boolean;
  };
  activity: {
    projectedEventsPerSecondAtCapacity: number;
    projectedHourlyEventsAtCapacity: number;
    projectedHourlyCostSolAtCapacity: number;
  };
  budget: {
    effectiveRemainingEvents: number;
    bindingConstraint: "none" | "concurrency" | "event_cap" | "cost_cap";
  };
  policy: {
    initialObservationMs: number;
    extendedObservationMs: number;
    newestAlwaysConsidered: true;
    schedulerMutationApplied: boolean;
  };
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

type MeteredLaunchDataTrackedMint = {
  mint: string;
  status: string;
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
};

type MeteredLaunchDataTrackedResponse = {
  current: MeteredLaunchDataTrackedMint[];
  persisted: MeteredLaunchDataTrackedMint[];
  sessions: unknown[];
  status: MeteredLaunchDataStatus;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

type LiveCardEnrichmentStatus = {
  cachedMintCount: number;
  dexScreenerEnabled: boolean;
  enabled: boolean;
  jupiterPriceEnabled: boolean;
  maxMintsPerMinute: number;
  onNewToken: boolean;
  paperOnly: true;
  reasonCodes: string[];
  requestsThisMinute: number;
};

type IndexerStatus = {
  enabled: boolean;
  liveStateEnabled: boolean;
  preferLiveStateCards: boolean;
  source: string;
  sourceMode: string;
  eventBus: {
    publishedCount: number;
    subscriberCount: number;
    lastEventAt: string | null;
    errorCount: number;
  };
  liveState: {
    tokenCount: number;
    eventCount: number;
    lastEventAt: string | null;
  };
  futureGeyser: {
    enabled: boolean;
    implemented: boolean;
    status: string;
  };
  managedStream?: {
    managedStreamEnabled: boolean;
    provider: string;
    clientKind?: string;
    clientStatus?: {
      enabled: boolean;
      configured: boolean;
      authConfigured: boolean;
      connectionState: string;
      reasonCodes: string[];
    };
    connectionState: string;
    configured: boolean;
    authConfigured: boolean;
    endpointMasked?: string | null;
    subscriptionSummary?: {
      profile: string | null;
      transactionsEnabled: boolean;
      transactionAccountIncludeCount: number;
      transactionAccountRequiredCount: number;
      slotsEnabled: boolean;
      blocksEnabled: boolean;
    };
    receivedCount: number;
    transactionCount: number;
    errorCount: number;
    lastMessageAt: string | null;
    reasonCodes: string[];
    yellowstoneStatus: {
      enabled: boolean;
      configured: boolean;
      connectionState: string;
    };
    laserstreamStatus: {
      enabled: boolean;
      configured: boolean;
      connectionState: string;
    };
    realConnectionAllowed?: boolean;
    realConnectionAck?: boolean;
    realProvider?: string;
    laserstream?: {
      enabled: boolean;
      configured: boolean;
      apiKeyConfigured: boolean;
      endpointMasked: string | null;
      readyToConnect: boolean;
      connected: boolean;
      reasonCodes: string[];
      messageCount: number;
      lastMessageAt: string | null;
      maxMessagesPerSession: number;
      maxRuntimeMs: number;
    };
    connectionBlockedReasons?: string[];
    secretsExposed?: false;
  };
  streamProvider?: string;
  streamEnabled?: boolean;
  streamConnectionState?: string;
  streamEnvelopeCount?: number;
  streamEventCount?: number;
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

type TokenIdentityStatus = {
  enabled: true;
  solanaMetadataEnabled: boolean;
  solanaMetadataConfigured: boolean;
  solanaMetadataOnDemand: boolean;
  solanaMetadataOnNewToken: boolean;
  offchainFetchEnabled: boolean;
  identityCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  lastResolvedAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
  paperOnly: true;
};

type HealthStatus = {
  actualData: ActualDataStatus;
  accountTradeMonitoringEnabled: boolean;
  dataFeedMode: string;
  dataFeed: string;
  feed: FeedStatus;
  feedProvider: string;
  historicalMockRowsHidden: boolean;
  liveFeedConnected: boolean;
  liveFeedExpected: boolean;
  liveFeedLastEventAt: string | null;
  liveFeedReady: boolean;
  liveTokenCount: number;
  launchScanner: LaunchScannerStatus;
  meteredLaunchData: MeteredLaunchDataStatus;
  runtimeControl: RuntimeControlStatus;
  runtimeControlEnabled: boolean;
  runtimeControlLocalOnly: boolean;
  runtimeLiveDiscoveryState: string;
  runtimeMeteredLaunchDataState: string;
  meteredLaunchDataEnabled: boolean;
  meteredLaunchDataReady: boolean;
  meteredLaunchDataTrackedCount: number;
  meteredLaunchDataEstimatedCostSol: number;
  meteredLaunchDataBudgetReached: boolean;
  mockFeedEnabled: boolean;
  mockRuntimeBlocked: boolean;
  noFeedMode: boolean;
  noRealFeedMessage?: string;
  realDataActive: boolean;
  tokenIdentity: TokenIdentityStatus;
  watchedWalletCount: number;
  watchedWalletExit: ExitStatus;
  watchedWalletTradeEventCount: number;
  paperPortfolio: PaperPortfolioStatus;
  paperPortfolioEnabled: boolean;
  paperEntryEnabled: boolean;
  paperExitEnabled: boolean;
  openPaperPositionCount: number;
  totalPaperPnlSol: number;
  exitRuleCount: number;
  exitSignalCount: number;
  mode: string;
  paperAutoOrder: boolean;
  paperOnly: boolean;
  status: string;
  uptimeSeconds: number;
};

type MarketStatus = {
  allowSolUsdConversion: boolean;
  allowUsdFromStableQuotes: boolean;
  enabled: boolean;
  minConfidenceForMetrics: string;
  observationCount: number;
  paperOnly: true;
  solUsdConfigured: boolean;
};

type ChainStatus = {
  configured: boolean;
  enabled: boolean;
  paperOnly: true;
  rpcHttpUrlConfigured: boolean;
  status: string;
};

type MetricsRow = RollingMetricsSnapshot & {
  identity?: TokenIdentitySummary;
};

type TokenIdentityRow = TokenIdentitySummary & {
  id?: number;
  createdAt?: string;
};

type LiveEventRow = {
  sessionId: string;
  provider: string;
  eventType: string;
  mint: string;
  name?: string;
  symbol?: string;
  title?: string;
  realData: true;
  reasonCodes: string[];
  createdAt: string;
};

type PumpPortalTradeRow = {
  id: number;
  identity?: TokenIdentitySummary;
  mint: string;
  signature: string | null;
  side: string;
  trader: string | null;
  priceSol: number | null;
  volumeSol: number | null;
  tokenAmount: number | null;
  confidence: string;
  usableForMetrics: boolean;
  reasonCodes: string[];
  createdAt: string;
};

type ExitStatus = {
  enabled: boolean;
  accountTradesEnabled: boolean;
  meteredAck: boolean;
  watchedWalletCount: number;
  enabledRuleCount: number;
  observedTradeCount: number;
  exitSignalCount: number;
  maxWatchedWallets: number;
  maxEventsPerSession: number;
  estimatedCostSol: number;
  budgetReached: boolean;
  dataWalletReady: boolean;
  accountTradeMonitoringEnabled: boolean;
  accountTradeSubscribedWalletCount: number;
  accountTradeEventCount: number;
  reasonCodes: string[];
  paperOnly: true;
  liveExecutionDisabled: true;
};

type ExitWallet = {
  address: string;
  alias: string | null;
  tags: string[];
  enabled: boolean;
  source: string;
  reasonCodes: string[];
  createdAt: string;
  updatedAt: string;
};

type ExitRule = {
  id?: string;
  ruleId?: string;
  name: string;
  enabled: boolean;
  trigger: string;
  minProfitPct: number;
  minProfitSol?: number | null;
  sellPct: number;
  requirePositionOpenedBeforeWalletTrade: boolean;
  requireCurrentPrice?: boolean;
  cooldownMs: number;
  priority: number;
  reasonCodes: string[];
};

type ExitEvent = {
  id: number;
  wallet: string;
  walletAlias: string | null;
  mint: string;
  side: string;
  priceSol: number | null;
  volumeSol: number | null;
  tokenAmount: number | null;
  signature: string | null;
  confidence: string;
  usableForExitStrategy: boolean;
  reasonCodes: string[];
  createdAt: string;
};

type ExitSignal = {
  id: number;
  signalId: string;
  mint: string;
  wallet: string;
  walletAlias: string | null;
  ruleId: string;
  action: "paper_sell";
  sellPct: number;
  blocked: boolean;
  blockers: string[];
  warnings: string[];
  reasonCodes: string[];
  createdAt: string;
};

type PaperPortfolioStatus = {
  enabled: boolean;
  entryPolicyEnabled: boolean;
  exitPolicyEnabled: boolean;
  openPositionCount: number;
  closedPositionCount: number;
  orderCount: number;
  fillCount: number;
  snapshotCount: number;
  exitPolicyVersion: string;
  exitPolicyEvaluationCount: number;
  totalPnlSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  winRate: number;
  maxDrawdownSol: number;
  paperOnly: true;
  liveExecutionDisabled: true;
  reasonCodes: string[];
};

type PaperPortfolioSnapshot = {
  cashSol: number;
  deployedSol: number;
  equitySol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  totalPnlPct: number;
  openPositionCount: number;
  closedPositionCount: number;
  winRate: number;
  maxDrawdownSol: number;
  maxDrawdownPct: number;
  totalFeesSol: number;
  totalTrades: number;
  updatedAt: string;
};

type PaperPortfolioPosition = {
  id: number;
  positionId: string;
  mint: string;
  symbol: string | null;
  title: string | null;
  status: "open" | "partially_closed" | "closed";
  entryPriceSol: number;
  averageEntryPriceSol: number;
  currentPriceSol: number | null;
  sizeSol: number;
  remainingSizeSol: number;
  tokenAmount: number;
  remainingTokenAmount: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  realizedPnlPct: number;
  unrealizedPnlPct: number;
  totalFeesSol: number;
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
};

type PaperPortfolioOrder = {
  id: number;
  orderId: string;
  type: "entry" | "exit";
  side: "buy" | "sell";
  mint: string;
  symbol: string | null;
  title: string | null;
  source: string;
  requestedSizeSol: number | null;
  requestedSellPct: number | null;
  signalScore: number | null;
  riskLevel: string | null;
  reasonCodes: string[];
  createdAt: string;
};

type PaperPortfolioFill = {
  id: number;
  fillId: string;
  orderId: string;
  side: "buy" | "sell";
  mint: string;
  priceSol: number;
  effectivePriceSol: number;
  sizeSol: number;
  tokenAmount: number;
  feeSol: number;
  slippageSol: number;
  fillStatus: "filled" | "rejected" | "partial";
  rejectionReason: string | null;
  reasonCodes: string[];
  createdAt: string;
};

type PaperPortfolioSnapshotResponse = {
  snapshot: PaperPortfolioSnapshot;
  status: PaperPortfolioStatus;
};

type PaperPortfolioPositionsResponse = {
  positions: PaperPortfolioPosition[];
  status: PaperPortfolioStatus;
};

type PaperPortfolioOrdersResponse = {
  orders: PaperPortfolioOrder[];
  status: PaperPortfolioStatus;
};

type PaperPortfolioFillsResponse = {
  fills: PaperPortfolioFill[];
  status: PaperPortfolioStatus;
};

type PaperPortfolioPerformanceResponse = {
  snapshot: PaperPortfolioSnapshot;
  bestTrade: PaperPortfolioPosition | null;
  worstTrade: PaperPortfolioPosition | null;
  snapshots: Array<
    PaperPortfolioSnapshot & { id?: number; createdAt?: string }
  >;
  paperOnly: true;
  liveExecutionDisabled: true;
};

type ExitWalletsResponse = {
  current: ExitWallet[];
  persisted: ExitWallet[];
};

type ExitRulesResponse = {
  current: ExitRule[];
  persisted: ExitRule[];
};

type ExitEventsResponse = {
  events: ExitEvent[];
};

type ExitSignalsResponse = {
  signals: ExitSignal[];
};

type MarketObservationRow = {
  id: number;
  signature: string;
  mint: string;
  side: string;
  quoteAsset: string;
  priceQuote: number | null;
  priceSol: number | null;
  priceUsd: number | null;
  volumeSol: number | null;
  volumeUsd: number | null;
  confidence: string;
  usableForMetrics: boolean;
  reasonCodes: string[];
  createdAt: string;
};

type ChainVerificationRow = {
  id?: number;
  mint: string;
  status: string;
  mintAuthorityActive?: boolean | null;
  freezeAuthorityActive?: boolean | null;
  topHolderPct?: number | null;
  top10HolderPct?: number | null;
  reasonCodes: string[];
  inspectedAt?: string | null;
  createdAt?: string;
};

type ServerMessage =
  | {
      type: "snapshot";
      signals: OverlaySignal[];
    }
  | {
      type: "signal";
      signal: OverlaySignal;
    };

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "scanner", label: "Scanner" },
  { id: "signals", label: "Signals" },
  { id: "portfolio", label: "Portfolio" },
  { id: "metrics", label: "Metrics" },
  { id: "risk", label: "Risk" },
  { id: "exit", label: "Exit" },
  { id: "data", label: "Data" },
  { id: "debug", label: "Debug" }
];

const wsUrl =
  import.meta.env.VITE_AXI_WS_URL ?? "ws://localhost:8787/ws/signals";
const apiBaseUrl = import.meta.env.VITE_AXI_API_URL ?? "http://localhost:8787";

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [momentumRows, setMomentumRows] = useState<MomentumScannerRow[]>([]);
  const [momentumDiagnostics, setMomentumDiagnostics] =
    useState<MomentumDiagnostics | null>(null);
  const [cards, setCards] = useState<LiveTokenCardViewModel[]>([]);
  const [signals, setSignals] = useState<OverlaySignal[]>([]);
  const [metrics, setMetrics] = useState<MetricsRow[]>([]);
  const [riskRows, setRiskRows] = useState<RiskSnapshot[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatus | null>(
    null
  );
  const [actualDataStatus, setActualDataStatus] =
    useState<ActualDataStatus | null>(null);
  const [dataWalletStatus, setDataWalletStatus] =
    useState<PumpPortalDataWalletStatus | null>(null);
  const [pumpPortalWalletsStatus, setPumpPortalWalletsStatus] =
    useState<PumpPortalWalletsStatus | null>(null);
  const [lightningStatus, setLightningStatus] =
    useState<LightningStatus | null>(null);
  const [exitStatus, setExitStatus] = useState<ExitStatus | null>(null);
  const [exitWallets, setExitWallets] = useState<ExitWallet[]>([]);
  const [exitRules, setExitRules] = useState<ExitRule[]>([]);
  const [exitEvents, setExitEvents] = useState<ExitEvent[]>([]);
  const [exitSignals, setExitSignals] = useState<ExitSignal[]>([]);
  const [paperPortfolioStatus, setPaperPortfolioStatus] =
    useState<PaperPortfolioStatus | null>(null);
  const [paperPortfolioSnapshot, setPaperPortfolioSnapshot] =
    useState<PaperPortfolioSnapshot | null>(null);
  const [paperPortfolioPositions, setPaperPortfolioPositions] = useState<
    PaperPortfolioPosition[]
  >([]);
  const [paperPortfolioOrders, setPaperPortfolioOrders] = useState<
    PaperPortfolioOrder[]
  >([]);
  const [paperPortfolioFills, setPaperPortfolioFills] = useState<
    PaperPortfolioFill[]
  >([]);
  const [paperPortfolioPerformance, setPaperPortfolioPerformance] =
    useState<PaperPortfolioPerformanceResponse | null>(null);
  const [liveTradeTrackingStatus, setLiveTradeTrackingStatus] =
    useState<LiveTradeTrackingStatus | null>(null);
  const [launchScannerStatus, setLaunchScannerStatus] =
    useState<LaunchScannerStatus | null>(null);
  const [meteredLaunchDataStatus, setMeteredLaunchDataStatus] =
    useState<MeteredLaunchDataStatus | null>(null);
  const [meteredLaunchDataTracked, setMeteredLaunchDataTracked] = useState<
    MeteredLaunchDataTrackedMint[]
  >([]);
  const [runtimeControlStatus, setRuntimeControlStatus] =
    useState<RuntimeControlStatus | null>(null);
  const [runtimeContract, setRuntimeContract] =
    useState<RuntimeContract | null>(null);
  const [runtimeCapacity, setRuntimeCapacity] =
    useState<RuntimeCapacityReport | null>(null);
  const [runtimeActionStatus, setRuntimeActionStatus] =
    useState<string>("ready");
  const [liveCardEnrichmentStatus, setLiveCardEnrichmentStatus] =
    useState<LiveCardEnrichmentStatus | null>(null);
  const [indexerStatus, setIndexerStatus] = useState<IndexerStatus | null>(
    null
  );
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [tokenIdentityStatus, setTokenIdentityStatus] =
    useState<TokenIdentityStatus | null>(null);
  const [tokenIdentities, setTokenIdentities] = useState<TokenIdentityRow[]>(
    []
  );
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEventRow[]>([]);
  const [actualTrades, setActualTrades] = useState<PumpPortalTradeRow[]>([]);
  const [marketObservations, setMarketObservations] = useState<
    MarketObservationRow[]
  >([]);
  const [chainVerifications, setChainVerifications] = useState<
    ChainVerificationRow[]
  >([]);
  const [sortMode, setSortMode] = useState<SortMode>("launchScore");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [realOnly, setRealOnly] = useState(true);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [hideUnavailableHeavy, setHideUnavailableHeavy] = useState(false);
  const [trackedOnly, setTrackedOnly] = useState(false);
  const [showMigrated, setShowMigrated] = useState(true);
  const [compactMode, setCompactMode] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedMint, setExpandedMint] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("never");
  const [controlPanelOpen, setControlPanelOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setActiveTab(getInitialTab());

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retryTimer: number | undefined;
    let closedByReact = false;

    const refreshScannerRows = async () => {
      try {
        const nextRows =
          await fetchJson<MomentumScannerRow[]>("/ui/momentum-rows");
        setMomentumRows(nextRows);
      } catch {
        // Polling remains the fallback path.
      }
    };

    const connect = () => {
      setConnectionStatus("connecting");
      socket = new WebSocket(wsUrl);

      socket.addEventListener("open", () => setConnectionStatus("open"));
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;

        if (message.type === "snapshot") {
          setSignals(message.signals);
        }

        if (message.type === "signal") {
          setSignals((current) => upsertSignal(current, message.signal));
          void refreshScannerRows();
        }

        setLastUpdated(new Date().toLocaleTimeString());
      });
      socket.addEventListener("close", () => {
        setConnectionStatus("closed");

        if (!closedByReact) {
          retryTimer = window.setTimeout(connect, 1500);
        }
      });
    };

    connect();

    return () => {
      closedByReact = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }

      socket?.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      try {
        const [
          health,
          stats,
          nextFeedStatus,
          nextLiveStatus,
          nextMomentumRows,
          nextMomentumDiagnostics,
          nextCards,
          nextStrategy,
          nextSignals,
          nextMetrics,
          nextRiskRows,
          nextActualDataStatus,
          nextDataWalletStatus,
          nextPumpPortalWalletsStatus,
          nextLightningStatus,
          nextExitStatus,
          nextExitWallets,
          nextExitRules,
          nextExitEvents,
          nextExitSignals,
          nextPaperPortfolioStatus,
          nextPaperPortfolioSnapshot,
          nextPaperPortfolioPositions,
          nextPaperPortfolioOrders,
          nextPaperPortfolioFills,
          nextPaperPortfolioPerformance,
          nextLiveTradeTrackingStatus,
          nextLaunchScannerStatus,
          nextMeteredLaunchDataStatus,
          nextMeteredLaunchDataTracked,
          nextRuntimeControlStatus,
          nextRuntimeContract,
          nextRuntimeCapacity,
          nextActualTrades,
          nextLiveCardEnrichmentStatus,
          nextMarketStatus,
          nextMarketObservations,
          nextChainStatus,
          nextChainVerifications,
          nextTokenIdentityStatus,
          nextTokenIdentities,
          nextIndexerStatus,
          nextLiveEvents
        ] = await Promise.all([
          fetchJson<HealthStatus>("/health"),
          fetchJson<StorageStats>("/storage/stats"),
          fetchJson<FeedStatus>("/feed/status"),
          fetchJson<LiveStatus>("/live/status"),
          fetchJson<MomentumScannerRow[]>("/ui/momentum-rows"),
          fetchJson<MomentumDiagnostics>("/ui/momentum-diagnostics"),
          fetchJson<LiveTokenCardViewModel[]>("/ui/live-token-cards"),
          fetchJson<StrategyStatus>("/strategy/status"),
          fetchJson<OverlaySignal[]>("/signals"),
          fetchJson<MetricsRow[]>("/metrics"),
          fetchJson<RiskSnapshot[]>("/risk"),
          fetchJson<ActualDataStatus>("/actual-data/status"),
          fetchJson<PumpPortalDataWalletStatus>(
            "/pumpportal/data-wallet/status"
          ),
          fetchJson<PumpPortalWalletsStatus>("/pumpportal/wallets/status"),
          fetchJson<LightningStatus>("/execution/lightning/status"),
          fetchJson<ExitStatus>("/exit/status"),
          fetchJson<ExitWalletsResponse>("/exit/wallets"),
          fetchJson<ExitRulesResponse>("/exit/rules"),
          fetchJson<ExitEventsResponse>("/exit/events?limit=25"),
          fetchJson<ExitSignalsResponse>("/exit/signals?limit=25"),
          fetchJson<PaperPortfolioStatus>("/paper-portfolio/status"),
          fetchJson<PaperPortfolioSnapshotResponse>(
            "/paper-portfolio/snapshot"
          ),
          fetchJson<PaperPortfolioPositionsResponse>(
            "/paper-portfolio/positions"
          ),
          fetchJson<PaperPortfolioOrdersResponse>(
            "/paper-portfolio/orders?limit=50"
          ),
          fetchJson<PaperPortfolioFillsResponse>(
            "/paper-portfolio/fills?limit=50"
          ),
          fetchJson<PaperPortfolioPerformanceResponse>(
            "/paper-portfolio/performance"
          ),
          fetchJson<LiveTradeTrackingStatus>("/live/trade-tracking/status"),
          fetchJson<LaunchScannerStatus>("/launch/status"),
          fetchJson<MeteredLaunchDataStatus>("/metered-launch-data/status"),
          fetchJson<MeteredLaunchDataTrackedResponse>(
            "/metered-launch-data/tracked?limit=25"
          ),
          fetchJson<RuntimeControlStatus>("/runtime/status"),
          fetchJson<RuntimeContract>("/runtime/contracts"),
          fetchJson<RuntimeCapacityReport>("/runtime/capacity"),
          fetchJson<PumpPortalTradeRow[]>("/actual-data/trades?limit=10"),
          fetchJson<LiveCardEnrichmentStatus>("/enrichment/status"),
          fetchJson<MarketStatus>("/market/status"),
          fetchJson<MarketObservationRow[]>("/market/observations?limit=10"),
          fetchJson<ChainStatus>("/chain/status"),
          fetchJson<ChainVerificationRow[]>("/chain/verifications?limit=10"),
          fetchJson<TokenIdentityStatus>("/tokens/status"),
          fetchJson<TokenIdentityRow[]>("/tokens?limit=25"),
          fetchJson<IndexerStatus>("/indexer/status"),
          fetchJson<LiveEventRow[]>("/live/events?limit=25")
        ]);

        if (!cancelled) {
          setApiStatus("connected");
          setHealthStatus(health);
          setStorageStats(stats);
          setFeedStatus(nextFeedStatus);
          setLiveStatus(nextLiveStatus);
          setMomentumRows(nextMomentumRows);
          setMomentumDiagnostics(nextMomentumDiagnostics);
          setCards(nextCards);
          setStrategyStatus(nextStrategy);
          setSignals(nextSignals);
          setMetrics(nextMetrics);
          setRiskRows(nextRiskRows);
          setActualDataStatus(nextActualDataStatus);
          setDataWalletStatus(nextDataWalletStatus);
          setPumpPortalWalletsStatus(nextPumpPortalWalletsStatus);
          setLightningStatus(nextLightningStatus);
          setExitStatus(nextExitStatus);
          setExitWallets(nextExitWallets.current);
          setExitRules(nextExitRules.current);
          setExitEvents(nextExitEvents.events);
          setExitSignals(nextExitSignals.signals);
          setPaperPortfolioStatus(nextPaperPortfolioStatus);
          setPaperPortfolioSnapshot(nextPaperPortfolioSnapshot.snapshot);
          setPaperPortfolioPositions(nextPaperPortfolioPositions.positions);
          setPaperPortfolioOrders(nextPaperPortfolioOrders.orders);
          setPaperPortfolioFills(nextPaperPortfolioFills.fills);
          setPaperPortfolioPerformance(nextPaperPortfolioPerformance);
          setLiveTradeTrackingStatus(nextLiveTradeTrackingStatus);
          setLaunchScannerStatus(nextLaunchScannerStatus);
          setMeteredLaunchDataStatus(nextMeteredLaunchDataStatus);
          setMeteredLaunchDataTracked(nextMeteredLaunchDataTracked.current);
          setRuntimeControlStatus(nextRuntimeControlStatus);
          setRuntimeContract(nextRuntimeContract);
          setRuntimeCapacity(nextRuntimeCapacity);
          setActualTrades(nextActualTrades);
          setLiveCardEnrichmentStatus(nextLiveCardEnrichmentStatus);
          setMarketStatus(nextMarketStatus);
          setMarketObservations(nextMarketObservations);
          setChainStatus(nextChainStatus);
          setChainVerifications(nextChainVerifications);
          setTokenIdentityStatus(nextTokenIdentityStatus);
          setTokenIdentities(nextTokenIdentities);
          setIndexerStatus(nextIndexerStatus);
          setLiveEvents(nextLiveEvents);
          if (runtimeActionStatus === "API OFFLINE") {
            setRuntimeActionStatus("ready");
          }
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch {
        if (!cancelled) {
          setApiStatus("disconnected");
          setRuntimeActionStatus("API OFFLINE");
        }
      }
    };

    void loadDashboardData();
    const timer = window.setInterval(() => {
      void loadDashboardData();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRuntimeControl = async () => {
      try {
        const nextRuntimeControlStatus =
          await fetchJson<RuntimeControlStatus>("/runtime/status");

        if (!cancelled) {
          setRuntimeControlStatus(nextRuntimeControlStatus);
          setApiStatus("connected");
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch {
        if (!cancelled) {
          setApiStatus("disconnected");
          setRuntimeActionStatus("API OFFLINE");
        }
      }
    };

    void loadRuntimeControl();
    const timer = window.setInterval(() => {
      void loadRuntimeControl();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      try {
        const nextRows =
          await fetchJson<MomentumScannerRow[]>("/ui/momentum-rows");

        if (!cancelled) {
          setMomentumRows(nextRows);
          setApiStatus("connected");
        }
      } catch {
        if (!cancelled) {
          setApiStatus("disconnected");
        }
      }
    };

    void loadRows();
    const timer = window.setInterval(() => {
      void loadRows();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDiagnostics = async () => {
      try {
        const nextDiagnostics = await fetchJson<MomentumDiagnostics>(
          "/ui/momentum-diagnostics"
        );

        if (!cancelled) {
          setMomentumDiagnostics(nextDiagnostics);
          setApiStatus("connected");
        }
      } catch {
        if (!cancelled) {
          setApiStatus("disconnected");
        }
      }
    };

    void loadDiagnostics();
    const timer = window.setInterval(() => {
      void loadDiagnostics();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const visibleRows = useMemo(
    () =>
      sortRows(
        filterRows(momentumRows, {
          actionFilter,
          hideUnavailableHeavy,
          realOnly,
          search,
          showMigrated,
          trackedOnly
        }),
        sortMode
      ),
    [
      actionFilter,
      hideUnavailableHeavy,
      momentumRows,
      realOnly,
      search,
      showMigrated,
      sortMode,
      trackedOnly
    ]
  );
  const refreshDataWalletStatus = async () => {
    const nextDataWalletStatus = await fetchJson<PumpPortalDataWalletStatus>(
      "/pumpportal/data-wallet/status"
    );
    setDataWalletStatus(nextDataWalletStatus);
  };

  const refreshPumpPortalWalletsStatus = async () => {
    const nextWalletsStatus = await fetchJson<PumpPortalWalletsStatus>(
      "/pumpportal/wallets/status"
    );
    setPumpPortalWalletsStatus(nextWalletsStatus);
  };

  const refreshRuntimeControlSurfaces = async () => {
    const nextRuntimeControlStatus =
      await fetchJson<RuntimeControlStatus>("/runtime/status");

    setRuntimeControlStatus(nextRuntimeControlStatus);
    setApiStatus("connected");
    setLastUpdated(new Date().toLocaleTimeString());
  };

  const runRuntimeAction = async (
    path: string,
    label: string,
    body?: unknown
  ) => {
    setRuntimeActionStatus(`${label}...`);

    try {
      const result = await postJson<RuntimeControlResult>(path, body);
      setRuntimeControlStatus(result.status);
      setRuntimeActionStatus(result.message);
      await refreshRuntimeControlSurfaces();

      if (path.includes("data-wallet") || path.includes("trading-wallet")) {
        await refreshDataWalletStatus();
        await refreshPumpPortalWalletsStatus();
      }
    } catch (error) {
      setRuntimeActionStatus(
        error instanceof Error ? error.message : `${label} failed`
      );
      try {
        await refreshRuntimeControlSurfaces();
      } catch {
        setApiStatus("disconnected");
      }
    }
  };
  const hotLaunchCount = momentumRows.filter((row) =>
    ["hot", "ripping"].includes(row.launchPhase)
  ).length;
  const rippingLaunchCount = momentumRows.filter(
    (row) => row.launchPhase === "ripping"
  ).length;
  const trackedCardCount = momentumRows.filter(
    (row) => row.trackingState === "tracking"
  ).length;
  const unavailableFieldCount = momentumRows.reduce(
    (total, row) => total + row.unavailableFields.length,
    0
  );
  const modeLabel = (healthStatus?.mode ?? "paper").toUpperCase();
  const feedModeLabel = (
    feedStatus?.mode ??
    healthStatus?.dataFeedMode ??
    "unknown"
  ).toUpperCase();
  const feedLabel = (
    feedStatus?.provider ??
    healthStatus?.feedProvider ??
    "unknown"
  ).toUpperCase();
  const apiLabel =
    apiStatus === "connected"
      ? "ONLINE"
      : apiStatus === "checking"
        ? "CHECKING"
        : "OFFLINE";
  const websocketLabel =
    connectionStatus === "open"
      ? "ONLINE"
      : connectionStatus === "connecting"
        ? "CONNECTING"
        : "OFFLINE";
  const liveLabel = getLiveConnectionLabel(feedStatus, healthStatus);
  const liveTone = getLiveConnectionTone(feedStatus, healthStatus);

  return (
    <main className="app-shell">
      <HeaderControlCenter
        apiLabel={apiLabel}
        apiStatus={apiStatus}
        connectionStatus={connectionStatus}
        controlPanelOpen={controlPanelOpen}
        dataWalletStatus={dataWalletStatus}
        feedLabel={feedLabel}
        feedModeLabel={feedModeLabel}
        feedStatus={feedStatus}
        healthStatus={healthStatus}
        hotLaunchCount={hotLaunchCount}
        lastUpdated={lastUpdated}
        liveLabel={liveLabel}
        liveTone={liveTone}
        meteredLaunchDataStatus={meteredLaunchDataStatus}
        modeLabel={modeLabel}
        momentumDiagnostics={momentumDiagnostics}
        momentumRowCount={momentumRows.length}
        onToggleDiagnostics={() => setControlPanelOpen((open) => !open)}
        rippingLaunchCount={rippingLaunchCount}
        runtimeActionStatus={runtimeActionStatus}
        runtimeCapacity={runtimeCapacity}
        runtimeContract={runtimeContract}
        runtimeControlStatus={runtimeControlStatus}
        runRuntimeAction={runRuntimeAction}
        trackedCardCount={trackedCardCount}
        unavailableFieldCount={unavailableFieldCount}
        websocketLabel={websocketLabel}
      />

      {apiStatus === "disconnected" ? <ApiOfflineNotice /> : null}

      <nav className="tab-bar" role="tablist" aria-label="Dashboard tabs">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={
              activeTab === tab.id ? "tab-button active" : "tab-button"
            }
            key={tab.id}
            onClick={() => activateTab(tab.id, setActiveTab)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "scanner" ? (
        <ScannerTab
          actionFilter={actionFilter}
          compactMode={compactMode}
          diagnostics={momentumDiagnostics}
          expandedMint={expandedMint}
          feedStatus={feedStatus}
          healthStatus={healthStatus}
          hideUnavailableHeavy={hideUnavailableHeavy}
          liveStatus={liveStatus}
          realOnly={realOnly}
          rows={visibleRows}
          search={search}
          setActionFilter={setActionFilter}
          setCompactMode={setCompactMode}
          setExpandedMint={setExpandedMint}
          setHideUnavailableHeavy={setHideUnavailableHeavy}
          setRealOnly={setRealOnly}
          setSearch={setSearch}
          setShowMigrated={setShowMigrated}
          setShowUnavailable={setShowUnavailable}
          setSortMode={setSortMode}
          setTrackedOnly={setTrackedOnly}
          showMigrated={showMigrated}
          showUnavailable={showUnavailable}
          sortMode={sortMode}
          totalRows={momentumRows.length}
          trackedOnly={trackedOnly}
        />
      ) : null}
      {activeTab === "signals" ? (
        <SignalsTab cards={cards} signals={signals} strategy={strategyStatus} />
      ) : null}
      {activeTab === "portfolio" ? (
        <PortfolioTab
          fills={paperPortfolioFills}
          orders={paperPortfolioOrders}
          performance={paperPortfolioPerformance}
          positions={paperPortfolioPositions}
          snapshot={paperPortfolioSnapshot}
          status={paperPortfolioStatus}
        />
      ) : null}
      {activeTab === "metrics" ? <MetricsTab metrics={metrics} /> : null}
      {activeTab === "risk" ? <RiskTab riskRows={riskRows} /> : null}
      {activeTab === "exit" ? (
        <ExitTab
          events={exitEvents}
          rules={exitRules}
          signals={exitSignals}
          status={exitStatus}
          wallets={exitWallets}
        />
      ) : null}
      {activeTab === "data" ? (
        <DataTab
          actualDataStatus={actualDataStatus}
          actualTrades={actualTrades}
          chainStatus={chainStatus}
          dataWalletStatus={dataWalletStatus}
          diagnostics={momentumDiagnostics}
          lightningStatus={lightningStatus}
          feedStatus={feedStatus}
          liveCardEnrichmentStatus={liveCardEnrichmentStatus}
          indexerStatus={indexerStatus}
          launchScannerStatus={launchScannerStatus}
          liveStatus={liveStatus}
          liveTradeTrackingStatus={liveTradeTrackingStatus}
          marketObservations={marketObservations}
          marketStatus={marketStatus}
          meteredLaunchDataStatus={meteredLaunchDataStatus}
          meteredLaunchDataTracked={meteredLaunchDataTracked}
          pumpPortalWalletsStatus={pumpPortalWalletsStatus}
          runtimeActionStatus={runtimeActionStatus}
          runtimeControlStatus={runtimeControlStatus}
          runRuntimeAction={runRuntimeAction}
          tokenIdentities={tokenIdentities}
          tokenIdentityStatus={tokenIdentityStatus}
        />
      ) : null}
      {activeTab === "debug" ? (
        <StorageTab
          chainVerifications={chainVerifications}
          liveEvents={liveEvents}
          storageStats={storageStats}
        />
      ) : null}
    </main>
  );
}

function HeaderControlCenter({
  apiLabel,
  apiStatus,
  connectionStatus,
  controlPanelOpen,
  dataWalletStatus,
  feedLabel,
  feedModeLabel,
  feedStatus,
  healthStatus,
  hotLaunchCount,
  lastUpdated,
  liveLabel,
  liveTone,
  meteredLaunchDataStatus,
  modeLabel,
  momentumDiagnostics,
  momentumRowCount,
  onToggleDiagnostics,
  rippingLaunchCount,
  runtimeActionStatus,
  runtimeCapacity,
  runtimeContract,
  runtimeControlStatus,
  runRuntimeAction,
  trackedCardCount,
  unavailableFieldCount,
  websocketLabel
}: {
  apiLabel: string;
  apiStatus: ApiStatus;
  connectionStatus: ConnectionStatus;
  controlPanelOpen: boolean;
  dataWalletStatus: PumpPortalDataWalletStatus | null;
  feedLabel: string;
  feedModeLabel: string;
  feedStatus: FeedStatus | null;
  healthStatus: HealthStatus | null;
  hotLaunchCount: number;
  lastUpdated: string;
  liveLabel: string;
  liveTone: "online" | "offline" | "warning" | "neutral";
  meteredLaunchDataStatus: MeteredLaunchDataStatus | null;
  modeLabel: string;
  momentumDiagnostics: MomentumDiagnostics | null;
  momentumRowCount: number;
  onToggleDiagnostics: () => void;
  rippingLaunchCount: number;
  runtimeActionStatus: string;
  runtimeCapacity: RuntimeCapacityReport | null;
  runtimeContract: RuntimeContract | null;
  runtimeControlStatus: RuntimeControlStatus | null;
  runRuntimeAction: (
    path: string,
    label: string,
    body?: unknown
  ) => Promise<void>;
  trackedCardCount: number;
  unavailableFieldCount: number;
  websocketLabel: string;
}) {
  const [armModalOpen, setArmModalOpen] = useState(false);
  const [armCostAck, setArmCostAck] = useState(false);
  const [armMaxSessionCostSol, setArmMaxSessionCostSol] = useState("0.001");
  const [armMaxConcurrentMints, setArmMaxConcurrentMints] = useState("3");
  const [armMaxEventsPerSession, setArmMaxEventsPerSession] = useState("1000");
  const meteredControl = getMeteredControlView({
    apiStatus,
    meteredStatus: null,
    pendingAction: runtimeActionStatus,
    runtimeStatus: runtimeControlStatus
  });
  const meteredPriceAction = runtimeControlStatus?.meteredPriceAction ?? null;
  const meteredBlockers = getHeaderMeteredRuntimeBlockers(
    runtimeControlStatus,
    null
  );
  const walletSetupText = getWalletSetupText(runtimeControlStatus);
  const dataWalletPublicKey =
    runtimeControlStatus?.dataWallet.publicKey ??
    dataWalletStatus?.publicKey ??
    null;
  const dataWalletShort =
    runtimeControlStatus?.dataWallet.shortPublicKey ??
    dataWalletStatus?.shortPublicKey ??
    "public address";
  const balanceStatus =
    runtimeControlStatus?.dataWallet.balanceStatus ??
    dataWalletStatus?.balanceStatus ??
    "unknown";
  const apiOffline = apiStatus === "disconnected";
  const liveFeedStopped =
    !runtimeControlStatus?.liveDiscovery.connected &&
    !runtimeControlStatus?.liveDiscovery.connecting;
  const projectedCostPerHour =
    runtimeControlStatus?.usage.projectedCostPerHourSol ?? null;
  const capacityHasLaunchSample =
    (runtimeCapacity?.observation.launchCount ?? 0) > 0;
  const capacityCoverageValue = runtimeCapacity
    ? capacityHasLaunchSample
      ? `${Math.round(runtimeCapacity.slots.initialCoverageRatio * 100)}%`
      : "NO SAMPLE"
    : "—";
  const latestMeteredAt =
    meteredPriceAction?.latestEventAt ??
    runtimeControlStatus?.meteredLaunchData.latestEventAt ??
    null;
  const tradingWallet = runtimeControlStatus?.tradingWallet ?? null;
  const tradingWalletShort =
    tradingWallet?.shortPublicKey ?? "public address pending";
  const tradingBalanceStatus = tradingWallet?.balanceStatus ?? "unknown";
  const canArmMetered = !apiOffline && meteredPriceAction?.canArm === true;
  const parsedArmCost = Number(armMaxSessionCostSol);
  const parsedArmMints = Number(armMaxConcurrentMints);
  const parsedArmEvents = Number(armMaxEventsPerSession);
  const armSessionCostCeiling = Math.min(
    meteredPriceAction?.sessionCostCapSol ?? 0.001,
    meteredPriceAction?.maxUiSessionCostSol ?? 0.005
  );
  const armSubmitDisabled =
    !armCostAck ||
    !Number.isFinite(parsedArmCost) ||
    parsedArmCost <= 0 ||
    parsedArmCost > armSessionCostCeiling ||
    !Number.isInteger(parsedArmMints) ||
    parsedArmMints <= 0 ||
    parsedArmMints > (meteredPriceAction?.maxConcurrentMints ?? 3) ||
    !Number.isInteger(parsedArmEvents) ||
    parsedArmEvents <= 0 ||
    parsedArmEvents > (meteredPriceAction?.maxEventsPerSession ?? 1000);

  const submitArmMetered = () => {
    if (armSubmitDisabled) {
      return;
    }

    setArmModalOpen(false);
    void runRuntimeAction(
      "/runtime/metered-launch-data/ack-session",
      "Arming metered price action",
      {
        ackCost: true,
        maxSessionCostSol: parsedArmCost,
        maxConcurrentMints: parsedArmMints,
        maxEventsPerSession: parsedArmEvents
      }
    );
  };

  const refreshWallets = async () => {
    await runRuntimeAction(
      "/runtime/data-wallet/refresh",
      "Refreshing data wallet"
    );
    await runRuntimeAction(
      "/runtime/trading-wallet/refresh",
      "Refreshing trading wallet"
    );
  };

  return (
    <header className="control-header">
      <div className="control-header-main">
        <div className="brand-cluster">
          <div className="brand-mark">AXI</div>
          <div>
            <p className="eyebrow">
              live token intelligence / momentum scanner
            </p>
            <h1>AXI</h1>
            <span className="runtime-mode">
              {feedModeLabel} · {modeLabel} · PumpPortal-first
            </span>
          </div>
        </div>

        <div className="control-status-grid" aria-label="Runtime status">
          <StatusChip label="PAPER" tone="good" value="ONLY" />
          <StatusChip
            label="LIVE FEED"
            tone={
              liveTone === "online"
                ? "good"
                : liveTone === "warning"
                  ? "warn"
                  : "bad"
            }
            value={liveLabel}
          />
          <StatusChip
            label="METERED PRICE"
            tone={
              (meteredPriceAction?.state ?? meteredControl.state) === "ACTIVE"
                ? "good"
                : (meteredPriceAction?.state ?? meteredControl.state) ===
                      "READY" ||
                    (meteredPriceAction?.state ?? meteredControl.state) ===
                      "STOPPED"
                  ? "warn"
                  : (meteredPriceAction?.state ?? meteredControl.state) ===
                        "BLOCKED" ||
                      (meteredPriceAction?.state ?? meteredControl.state) ===
                        "BUDGET_REACHED"
                    ? "bad"
                    : "neutral"
            }
            value={meteredPriceAction?.state ?? meteredControl.state}
          />
          <StatusChip
            label="DATA WALLET"
            tone={getDataWalletTone(balanceStatus)}
            value={balanceStatus.toUpperCase()}
          />
          <StatusChip
            label="TRADING WALLET"
            tone={getDataWalletTone(tradingBalanceStatus)}
            value={tradingBalanceStatus.toUpperCase()}
          />
          <StatusChip
            label="API"
            tone={apiStatus === "connected" ? "good" : "bad"}
            value={apiLabel}
          />
          <StatusChip
            label="CONFIG"
            tone={runtimeContract?.configuration.driftDetected ? "bad" : "good"}
            value={
              runtimeContract
                ? runtimeContract.configuration.driftDetected
                  ? "DRIFT"
                  : "ALIGNED"
                : "CHECKING"
            }
          />
          <StatusChip
            label="SIGNAL POLICY"
            tone="warn"
            value={
              runtimeContract
                ? runtimeContract.signalCalibration.policyStatus
                    .replaceAll("_", " ")
                    .toUpperCase()
                : "CHECKING"
            }
          />
          <StatusChip
            label="CAPTURE"
            tone="neutral"
            value={
              runtimeContract
                ? runtimeContract.sessionCapture.defaultActive
                  ? "ACTIVE"
                  : "MANUAL"
                : "CHECKING"
            }
          />
          <StatusChip
            label="PAPER EVAL"
            tone="neutral"
            value={
              runtimeContract
                ? runtimeContract.paperStrategyEvaluation.activationMode ===
                  "offline_local_only"
                  ? "OFFLINE"
                  : "CHECK"
                : "CHECKING"
            }
          />
          <StatusChip
            label="EXIT POLICY"
            tone="warn"
            value={
              runtimeContract
                ? runtimeContract.paperExitPolicy.policyStatus
                    .replaceAll("_", " ")
                    .toUpperCase()
                : "CHECKING"
            }
          />
          <StatusChip
            label="WS"
            tone={connectionStatus === "open" ? "good" : "warn"}
            value={websocketLabel}
          />
          <StatusChip label="UPDATED" value={lastUpdated} />
        </div>
      </div>

      <div className="control-metrics" aria-label="Scanner summary">
        <HeaderMetric
          label="Rows"
          value={formatCompactNumber(momentumRowCount)}
        />
        <HeaderMetric
          label="Hot"
          value={formatCompactNumber(hotLaunchCount)}
          detail={`${formatCompactNumber(rippingLaunchCount)} ripping`}
        />
        <HeaderMetric
          label="Tracked"
          value={formatCompactNumber(trackedCardCount)}
          detail="metered"
        />
        <HeaderMetric
          label="Coverage"
          value={capacityCoverageValue}
          detail={
            runtimeCapacity
              ? `${formatCompactNumber(runtimeCapacity.observation.launchRatePerMinute)}/min · ${runtimeCapacity.observation.launchConfidence}`
              : "model checking"
          }
        />
        <HeaderMetric
          label="Slots"
          value={
            runtimeCapacity
              ? `${runtimeCapacity.slots.requiredInitialSlotsRoundedUp}/${runtimeCapacity.slots.availableNewestSlots}`
              : "—"
          }
          detail={
            runtimeCapacity
              ? `required/newest · ${runtimeCapacity.slots.protectedMintCount} protected`
              : "scheduler unchanged"
          }
        />
        <HeaderMetric
          label="Scheduler"
          value={
            meteredLaunchDataStatus
              ? meteredLaunchDataStatus.scheduler.active
                ? "ACTIVE"
                : !meteredLaunchDataStatus.scheduler.enabled
                  ? "OFF"
                  : meteredLaunchDataStatus.ready
                    ? "READY"
                    : "BLOCKED"
              : "—"
          }
          detail={
            meteredLaunchDataStatus
              ? `${meteredLaunchDataStatus.scheduler.queuedCandidateCount} queued · ${meteredLaunchDataStatus.scheduler.preemptionCount} preempted`
              : "policy checking"
          }
        />
        <HeaderMetric
          label="1s buckets"
          value={
            runtimeContract
              ? formatCompactNumber(runtimeContract.timeseries.bucketCount)
              : "—"
          }
          detail={
            runtimeContract
              ? `${formatCompactNumber(runtimeContract.derivatives.derivativeReadyMintCount)} d1 · ${formatCompactNumber(runtimeContract.derivatives.accelerationReadyMintCount)} d2 ready`
              : "series checking"
          }
        />
        <HeaderMetric
          label="Run rate"
          value={
            runtimeCapacity
              ? `${formatCompactNumber(runtimeCapacity.activity.projectedEventsPerSecondAtCapacity)}/s`
              : "—"
          }
          detail={
            runtimeCapacity
              ? `${formatSol(runtimeCapacity.activity.projectedHourlyCostSolAtCapacity)}/h projected`
              : "observed events"
          }
        />
        <HeaderMetric
          label="Feed"
          value={formatCompactNumber(
            runtimeControlStatus?.liveDiscovery.newTokenEventCount ??
              feedStatus?.newTokenEventCount
          )}
          detail={`${formatCompactNumber(
            runtimeControlStatus?.liveDiscovery.migrationEventCount ??
              feedStatus?.migrationEventCount
          )} migrated`}
        />
        <HeaderMetric
          label="Wallet"
          value={formatSol(
            runtimeControlStatus?.dataWallet.balanceSol ??
              dataWalletStatus?.balanceSol
          )}
          detail={dataWalletShort}
        />
        <HeaderMetric
          label="Trading"
          value={formatSol(tradingWallet?.balanceSol)}
          detail={tradingWalletShort}
        />
        <HeaderMetric
          label="Events"
          value={formatCompactNumber(
            meteredPriceAction?.eventCount ??
              runtimeControlStatus?.meteredLaunchData.eventCount
          )}
          detail={`${formatSol(
            meteredPriceAction?.estimatedCostSol ??
              runtimeControlStatus?.meteredLaunchData.estimatedCostSol
          )} est`}
        />
        <HeaderMetric
          label="Budget"
          value={formatSol(
            meteredPriceAction?.budgetRemainingSol ??
              runtimeControlStatus?.meteredLaunchData.budgetRemainingSol
          )}
          detail={`${formatSol(
            meteredPriceAction?.sessionCostCapSol ??
              runtimeControlStatus?.meteredLaunchData.sessionCostCapSol
          )} cap`}
        />
        <HeaderMetric
          label="Blanks"
          value={formatCompactNumber(unavailableFieldCount)}
          detail={`${formatCompactNumber(momentumDiagnostics?.rowsWithCurvePrice)} curve marks`}
        />
      </div>

      <div className="control-actions" aria-label="Runtime controls">
        <button
          disabled={apiOffline || !liveFeedStopped}
          onClick={() =>
            void runRuntimeAction(
              "/runtime/live-discovery/start",
              "Starting discovery"
            )
          }
          type="button"
        >
          Start Live Feed
        </button>
        <button
          disabled={apiOffline}
          onClick={() =>
            void runRuntimeAction(
              "/runtime/live-discovery/stop",
              "Stopping discovery"
            )
          }
          type="button"
        >
          Stop Live Feed
        </button>
        <button
          disabled={apiOffline}
          onClick={() =>
            void runRuntimeAction(
              "/runtime/live-discovery/restart",
              "Restarting discovery"
            )
          }
          type="button"
        >
          Restart Live Feed
        </button>
        <button
          disabled={!canArmMetered}
          onClick={() => {
            setArmCostAck(false);
            setArmModalOpen(true);
          }}
          title="Arm this browser session for metered price action."
          type="button"
        >
          Arm Metered
        </button>
        <button
          className="metered-action"
          disabled={apiOffline || meteredPriceAction?.canStart !== true}
          onClick={() =>
            void runRuntimeAction(
              "/runtime/metered-launch-data/start",
              "Starting metered price action"
            )
          }
          title={meteredControl.helper}
          type="button"
        >
          Start Metered
        </button>
        <button
          disabled={apiOffline || meteredPriceAction?.canStop !== true}
          onClick={() =>
            void runRuntimeAction(
              "/runtime/metered-launch-data/stop",
              "Stopping metered price action"
            )
          }
          type="button"
        >
          Stop Metered
        </button>
        <button
          disabled={apiOffline}
          onClick={() => void refreshWallets()}
          type="button"
        >
          Refresh Wallets
        </button>
        <button onClick={onToggleDiagnostics} type="button">
          {controlPanelOpen ? "Close Diagnostics" : "Open Diagnostics"}
        </button>
      </div>

      <div className="control-action-status" role="status">
        <span>{runtimeActionStatus}</span>
        {meteredBlockers.length > 0 ? (
          <strong>{meteredBlockers[0]}</strong>
        ) : meteredPriceAction?.warnings.length ? (
          <strong>{meteredPriceAction.warnings[0]}</strong>
        ) : (
          <strong>{meteredControl.helper}</strong>
        )}
      </div>

      {armModalOpen ? (
        <div className="modal-backdrop">
          <div
            aria-label="Arm metered price action"
            aria-modal="true"
            className="arm-metered-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <h2>Arm Metered</h2>
              <button
                aria-label="Close"
                onClick={() => setArmModalOpen(false)}
                type="button"
              >
                x
              </button>
            </div>
            <div className="arm-form">
              <label>
                <span>Session SOL cap</span>
                <input
                  max={armSessionCostCeiling}
                  min="0.000001"
                  onChange={(event) =>
                    setArmMaxSessionCostSol(event.target.value)
                  }
                  step="0.000001"
                  type="number"
                  value={armMaxSessionCostSol}
                />
              </label>
              <label>
                <span>Concurrent mints</span>
                <input
                  max={meteredPriceAction?.maxConcurrentMints ?? 3}
                  min="1"
                  onChange={(event) =>
                    setArmMaxConcurrentMints(event.target.value)
                  }
                  step="1"
                  type="number"
                  value={armMaxConcurrentMints}
                />
              </label>
              <label>
                <span>Session events</span>
                <input
                  max={meteredPriceAction?.maxEventsPerSession ?? 1000}
                  min="1"
                  onChange={(event) =>
                    setArmMaxEventsPerSession(event.target.value)
                  }
                  step="1"
                  type="number"
                  value={armMaxEventsPerSession}
                />
              </label>
              <label className="check-control arm-ack">
                <input
                  checked={armCostAck}
                  onChange={(event) => setArmCostAck(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I understand this arms PumpPortal subscribeTokenTrade for this
                  browser session only, can spend data-wallet SOL up to the
                  session cap, and does not enable trading.
                </span>
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setArmModalOpen(false)} type="button">
                Cancel
              </button>
              <button
                className="metered-action"
                disabled={armSubmitDisabled}
                onClick={submitArmMetered}
                type="button"
              >
                Arm Session
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {controlPanelOpen ? (
        <div className="control-diagnostics">
          <section>
            <h2>Data Wallet</h2>
            <dl>
              <dt>public address</dt>
              <dd>
                <span className="mono">{dataWalletShort}</span>
                {dataWalletPublicKey ? (
                  <button
                    className="inline-copy-button"
                    onClick={() => copyPublicKey(dataWalletPublicKey)}
                    type="button"
                  >
                    copy
                  </button>
                ) : null}
              </dd>
              <dt>API key configured</dt>
              <dd>
                {String(
                  dataWalletStatus?.apiKeyConfigured ??
                    runtimeControlStatus?.dataWallet.apiKeyConfigured ??
                    false
                )}
              </dd>
              <dt>balance</dt>
              <dd>
                {formatSol(
                  dataWalletStatus?.balanceSol ??
                    runtimeControlStatus?.dataWallet.balanceSol
                )}
              </dd>
              <dt>status</dt>
              <dd>{balanceStatus}</dd>
              <dt>events remaining</dt>
              <dd>
                {formatCompactNumber(
                  dataWalletStatus?.estimatedEventsRemaining ??
                    runtimeControlStatus?.dataWallet.estimatedEventsRemaining
                )}
              </dd>
              <dt>last check</dt>
              <dd>
                {formatTimeAgo(
                  dataWalletStatus?.lastBalanceCheckAt ??
                    runtimeControlStatus?.dataWallet.lastBalanceCheckAt
                )}
              </dd>
              {walletSetupText ? (
                <>
                  <dt>setup</dt>
                  <dd>
                    <code>{walletSetupText}</code>
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
          <section>
            <h2>Trading Wallet</h2>
            <dl>
              <dt>public address</dt>
              <dd>
                <span className="mono">{tradingWalletShort}</span>
                {tradingWallet?.publicKey ? (
                  <button
                    className="inline-copy-button"
                    onClick={() => copyPublicKey(tradingWallet.publicKey)}
                    type="button"
                  >
                    copy
                  </button>
                ) : null}
              </dd>
              <dt>API key configured</dt>
              <dd>{String(tradingWallet?.apiKeyConfigured ?? false)}</dd>
              <dt>balance</dt>
              <dd>{formatSol(tradingWallet?.balanceSol)}</dd>
              <dt>status</dt>
              <dd>{tradingBalanceStatus}</dd>
              <dt>live trading</dt>
              <dd>{String(tradingWallet?.liveTradingAllowed ?? false)}</dd>
              <dt>armed</dt>
              <dd>{String(tradingWallet?.manualArmed ?? false)}</dd>
            </dl>
          </section>
          <section>
            <h2>Metered Usage</h2>
            <dl>
              <dt>tracked mints</dt>
              <dd>
                {formatCompactNumber(
                  meteredPriceAction?.trackedMintCount ??
                    meteredLaunchDataStatus?.trackedMintCount ??
                    runtimeControlStatus?.meteredLaunchData.trackedMintCount
                )}
              </dd>
              <dt>events this session</dt>
              <dd>
                {formatCompactNumber(
                  meteredPriceAction?.eventCount ??
                    meteredLaunchDataStatus?.totalEventsThisSession ??
                    runtimeControlStatus?.meteredLaunchData.eventCount
                )}
              </dd>
              <dt>estimated spent</dt>
              <dd>
                {formatSol(
                  meteredPriceAction?.estimatedCostSol ??
                    meteredLaunchDataStatus?.estimatedCostSol ??
                    runtimeControlStatus?.meteredLaunchData.estimatedCostSol
                )}
              </dd>
              <dt>session cap</dt>
              <dd>
                {formatSol(
                  meteredPriceAction?.sessionCostCapSol ??
                    meteredLaunchDataStatus?.maxSessionCostSol ??
                    runtimeControlStatus?.meteredLaunchData.sessionCostCapSol
                )}
              </dd>
              <dt>budget remaining</dt>
              <dd>
                {formatSol(
                  meteredPriceAction?.budgetRemainingSol ??
                    meteredLaunchDataStatus?.remainingBudgetSol ??
                    runtimeControlStatus?.meteredLaunchData.budgetRemainingSol
                )}
              </dd>
              <dt>projected / hour</dt>
              <dd>{formatSol(projectedCostPerHour)}</dd>
              <dt>latest metered event</dt>
              <dd>{formatTimeAgo(latestMeteredAt)}</dd>
            </dl>
          </section>
          <section>
            <h2>Runtime</h2>
            <dl>
              <dt>runtime mode</dt>
              <dd>
                {runtimeControlStatus?.runtimeMode ??
                  healthStatus?.dataFeedMode ??
                  "unknown"}
              </dd>
              <dt>provider</dt>
              <dd>{feedLabel}</dd>
              <dt>live feed</dt>
              <dd>{liveLabel}</dd>
              <dt>metered state</dt>
              <dd>{meteredControl.state}</dd>
              <dt>paper only</dt>
              <dd>{String(runtimeControlStatus?.paperOnly ?? true)}</dd>
              <dt>trading disabled</dt>
              <dd>{String(runtimeControlStatus?.tradingDisabled ?? true)}</dd>
            </dl>
          </section>
          <section>
            <h2>Blockers</h2>
            {meteredBlockers.length > 0 ? (
              <div className="control-blockers">
                {meteredBlockers.map((blocker) => (
                  <span key={blocker}>{blocker}</span>
                ))}
              </div>
            ) : (
              <p>Metered price action gates are clear.</p>
            )}
            {meteredPriceAction?.warnings.length ? (
              <div className="control-warnings">
                {meteredPriceAction.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}
            <div className="offline-commands control-commands">
              <code>pnpm axi:doctor</code>
              <code>pnpm axi:restart</code>
              <code>pnpm axi:stop</code>
            </div>
          </section>
        </div>
      ) : null}
    </header>
  );
}

function StatusChip({
  label,
  tone = "neutral",
  value
}: {
  label: string;
  tone?: "good" | "bad" | "warn" | "neutral";
  value: string;
}) {
  return (
    <span className={`status-chip ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function HeaderMetric({
  detail,
  label,
  value
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <span className="header-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail ? <em>{detail}</em> : null}
    </span>
  );
}

function ApiOfflineNotice() {
  return (
    <section className="offline-notice" role="status">
      <div>
        <strong>API OFFLINE</strong>
        <span>Dashboard shell is still running.</span>
      </div>
      <div className="offline-commands">
        <code>pnpm axi:doctor</code>
        <code>pnpm axi:restart</code>
      </div>
    </section>
  );
}

function ScannerTab({
  actionFilter,
  compactMode,
  diagnostics,
  expandedMint,
  feedStatus,
  healthStatus,
  hideUnavailableHeavy,
  liveStatus,
  realOnly,
  rows,
  search,
  setActionFilter,
  setCompactMode,
  setExpandedMint,
  setHideUnavailableHeavy,
  setRealOnly,
  setSearch,
  setShowMigrated,
  setShowUnavailable,
  setSortMode,
  setTrackedOnly,
  showMigrated,
  showUnavailable,
  sortMode,
  totalRows,
  trackedOnly
}: {
  actionFilter: ActionFilter;
  compactMode: boolean;
  diagnostics: MomentumDiagnostics | null;
  expandedMint: string | null;
  feedStatus: FeedStatus | null;
  healthStatus: HealthStatus | null;
  hideUnavailableHeavy: boolean;
  liveStatus: LiveStatus | null;
  realOnly: boolean;
  rows: MomentumScannerRow[];
  search: string;
  setActionFilter: (value: ActionFilter) => void;
  setCompactMode: (value: boolean) => void;
  setExpandedMint: (value: string | null) => void;
  setHideUnavailableHeavy: (value: boolean) => void;
  setRealOnly: (value: boolean) => void;
  setSearch: (value: string) => void;
  setShowMigrated: (value: boolean) => void;
  setShowUnavailable: (value: boolean) => void;
  setSortMode: (value: SortMode) => void;
  setTrackedOnly: (value: boolean) => void;
  showMigrated: boolean;
  showUnavailable: boolean;
  sortMode: SortMode;
  totalRows: number;
  trackedOnly: boolean;
}) {
  return (
    <section className="tab-panel scanner-panel" role="tabpanel">
      <div className="panel-heading scanner-heading">
        <div>
          <h2>Momentum Scanner</h2>
          <p>
            {totalRows} current-session rows / {rows.length} visible / blanks
            are unavailable, not zero
          </p>
        </div>
        <span className="table-meta">
          {getLiveEmptyState(feedStatus, liveStatus, healthStatus)}
        </span>
      </div>

      <div
        className="live-controls scanner-controls"
        aria-label="Scanner controls"
      >
        <label>
          <span>Search</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="symbol / name / mint"
            value={search}
          />
        </label>
        <label>
          <span>Sort</span>
          <select
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            value={sortMode}
          >
            <option value="newest">newest</option>
            <option value="launchScore">launch score</option>
            <option value="marketCap">market cap</option>
            <option value="curveLiquidity">curve liquidity</option>
            <option value="liquidity">liquidity</option>
            <option value="volume10s">volume 10s</option>
            <option value="txns10s">txns 10s</option>
            <option value="priceChange">price change</option>
            <option value="volumeVelocity">volume velocity</option>
            <option value="priceVelocity">price velocity</option>
            <option value="uniqueBuyers">unique buyers</option>
            <option value="buySellRatio">buy/sell ratio</option>
            <option value="signalStrength">signal strength</option>
            <option value="risk">risk</option>
            <option value="pnl">PnL</option>
          </select>
        </label>
        <label>
          <span>Filter</span>
          <select
            onChange={(event) =>
              setActionFilter(event.target.value as ActionFilter)
            }
            value={actionFilter}
          >
            <option value="all">all</option>
            <option value="discovery">discovery</option>
            <option value="watch">watch</option>
            <option value="hot">hot</option>
            <option value="ripping">ripping</option>
            <option value="rejected">rejected</option>
            <option value="tradeTracked">trade tracked</option>
            <option value="priceActionReady">price action ready</option>
            <option value="curvePrice">curve price</option>
            <option value="discoveryOnly">discovery only</option>
            <option value="migrated">migrated</option>
            <option value="paperPosition">paper position</option>
            <option value="missingData">missing data</option>
            <option value="missingCritical">missing critical</option>
          </select>
        </label>
        <label className="check-control">
          <input
            checked={realOnly}
            onChange={(event) => setRealOnly(event.target.checked)}
            type="checkbox"
          />
          <span>Real only</span>
        </label>
        <label className="check-control">
          <input
            checked={hideUnavailableHeavy}
            onChange={(event) => setHideUnavailableHeavy(event.target.checked)}
            type="checkbox"
          />
          <span>Hide sparse</span>
        </label>
        <label className="check-control">
          <input
            checked={trackedOnly}
            onChange={(event) => setTrackedOnly(event.target.checked)}
            type="checkbox"
          />
          <span>Tracked only</span>
        </label>
        <label className="check-control">
          <input
            checked={showMigrated}
            onChange={(event) => setShowMigrated(event.target.checked)}
            type="checkbox"
          />
          <span>Migrated</span>
        </label>
        <label className="check-control">
          <input
            checked={compactMode}
            onChange={(event) => setCompactMode(event.target.checked)}
            type="checkbox"
          />
          <span>Compact</span>
        </label>
        <label className="check-control">
          <input
            checked={showUnavailable}
            onChange={(event) => setShowUnavailable(event.target.checked)}
            type="checkbox"
          />
          <span>Audit reasons</span>
        </label>
      </div>

      <div
        className="scanner-summary-strip"
        aria-label="Scanner diagnostics summary"
      >
        <span>price {formatCompactNumber(diagnostics?.tokensWithPrice)}</span>
        <span>
          curve price {formatCompactNumber(diagnostics?.rowsWithCurvePrice)}
        </span>
        <span>volume {formatCompactNumber(diagnostics?.tokensWithVolume)}</span>
        <span>
          trades {formatCompactNumber(diagnostics?.tokensWithTradeData)}
        </span>
        <span>
          derivatives {formatCompactNumber(diagnostics?.tokensWithDerivatives)}
        </span>
        <span>
          samples{" "}
          {formatCompactNumber(
            diagnostics?.tokensWithEnoughSamplesForDerivatives
          )}
        </span>
        <span>
          explosive{" "}
          {formatCompactNumber(
            diagnostics?.tokensWithExplosiveDerivativeStrength
          )}
        </span>
        <span>
          mcap {formatCompactNumber(diagnostics?.tokensWithMarketCap)}
        </span>
        <span>
          curve liq {formatCompactNumber(diagnostics?.rowsWithCurveLiquidity)}
        </span>
        <span>
          dex liq {formatCompactNumber(diagnostics?.rowsWithDexLiquidity)}
        </span>
        <span>
          holders {formatCompactNumber(diagnostics?.tokensWithHolderData)}
        </span>
      </div>

      {rows.length > 0 ? (
        <div className={compactMode ? "scanner-list compact" : "scanner-list"}>
          <div className="scanner-list-header" role="row">
            <span>Pair / Token</span>
            <span>Sparkline</span>
            <span>Market</span>
            <span>Liquidity / Curve</span>
            <span>Volume</span>
            <span>TXNS / Flow</span>
            <span>Price / dP</span>
            <span>AXI Signal</span>
          </div>
          {rows.map((row) => (
            <ScannerRow
              expanded={expandedMint === row.mint}
              key={row.mint}
              onToggle={() =>
                setExpandedMint(expandedMint === row.mint ? null : row.mint)
              }
              row={row}
              showUnavailable={showUnavailable}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state live-empty">
          {getLiveEmptyState(feedStatus, liveStatus, healthStatus)}
        </div>
      )}
    </section>
  );
}

function ScannerRow({
  expanded,
  onToggle,
  row,
  showUnavailable
}: {
  expanded: boolean;
  onToggle: () => void;
  row: MomentumScannerRow;
  showUnavailable: boolean;
}) {
  const market = getMarketCapDisplay(row);
  const liquidity = getLiquidityDisplay(row);
  const signal = row.signalDisplay;
  const derivativeScore = row.derivativeStrength.combinedDerivativeScore;
  const rowClass = [
    "scanner-card",
    expanded ? "expanded" : "",
    "spark-" + row.sparkline.direction,
    "signal-" + signal.color
  ]
    .filter(Boolean)
    .join(" ");
  const eventLabel =
    row.migrationStatus === "migrated" ? "Migrated" : "New Token";
  const metadataLabel = row.hasMetadata ? "metadata" : "metadata pending";
  const linkLabel = row.hasSocialLinks ? "links" : "social n/a";
  const liquidityLabel =
    liquidity.source === "curve"
      ? "curve"
      : liquidity.source === "pool"
        ? "pool"
        : liquidity.source === "dex"
          ? "dex"
          : "unavailable";

  return (
    <article className={rowClass}>
      <button className="scanner-card-main" onClick={onToggle} type="button">
        <div className="scanner-token-cell">
          <TokenThumbnail row={row} />
          <div className="scanner-token-copy">
            <strong title={row.mint}>{row.displayName}</strong>
            <span className="scanner-token-subline">
              {row.symbol ?? "UNKNOWN"} · {formatAge(row.ageSeconds)} ·{" "}
              <span className="mono" title={row.mint}>
                {row.shortMint}
              </span>
            </span>
            <small className="scanner-token-badges">
              <span>{row.source}</span>
              <span>{eventLabel}</span>
              {row.trackingState === "tracking" ? (
                <span>Trade Tracked</span>
              ) : null}
              <span>{metadataLabel}</span>
              <span>{linkLabel}</span>
            </small>
          </div>
        </div>
        <div className="scanner-spark-cell">
          <Sparkline sparkline={row.sparkline} />
          <div className="sparkline-meta">
            <span className={"sparkline-change " + row.sparkline.direction}>
              {formatPct(row.sparkline.priceChangePct)}
            </span>
            <small>{row.sparkline.label}</small>
          </div>
        </div>
        <div className="scanner-market-cell">
          <span>{market.label}</span>
          <strong>{market.primary}</strong>
          <small>{market.secondary}</small>
          <small>price {formatSol(row.priceSol)}</small>
        </div>
        <div className="scanner-liquidity-cell">
          <span className={"liquidity-source source-" + liquidity.source}>
            {liquidityLabel}
          </span>
          <strong>{liquidity.primary}</strong>
          <small title={liquidity.secondary}>
            {formatMintShort(liquidity.secondary)}
          </small>
          <small>mark {formatSol(row.curve.curvePriceSol)}</small>
        </div>
        <div className="scanner-flow-cell">
          <strong>{formatSol(row.volume10sSol)}</strong>
          <span>10s volume</span>
          <small>
            {formatSol(row.volume30sSol)} 30s / {formatSol(row.volume60sSol)}{" "}
            60s
          </small>
          <small>
            dVol {formatVelocity(row.derivatives.dVol10sSolPerSec, "sol")} /{" "}
            {formatAcceleration(row.derivatives.d2VolSolPerSec2, "sol")}
          </small>
        </div>
        <div className="scanner-tx-cell">
          <strong>{formatCompactNumber(row.tradeCount10s)}</strong>
          <span>flow 10s</span>
          <small>
            {formatCompactNumber(row.buyCount10s)} buy /{" "}
            {formatCompactNumber(row.sellCount10s)} sell
          </small>
          <small>
            buyers {formatCompactNumber(row.uniqueBuyers10s)} / sellers{" "}
            {formatCompactNumber(row.uniqueSellers10s)}
          </small>
          <small>
            ratio {formatCompactNumber(row.buySellRatio)} / pressure{" "}
            {formatPct(row.netBuyPressure)}
          </small>
        </div>
        <div className="scanner-risk-cell">
          <strong>
            {formatVelocity(row.derivatives.dPricePctPerSec, "pct")}
          </strong>
          <span>dPrice / sec</span>
          <small>
            d2 {formatAcceleration(row.derivatives.d2PricePctPerSec2, "pct")}
          </small>
          <small>
            dBuyers {formatVelocity(row.derivatives.dBuyersPerSec, "buyers")}
          </small>
          <small>
            {row.hardReject ? "hard reject" : String(row.riskLevel)}
          </small>
        </div>
        <div className="scanner-signal-cell">
          <div className="signal-score-line">
            <strong>{derivativeScore.totalScore}</strong>
            <span className={getScorePillClass(row)}>
              {row.strategy.signalLabel}
            </span>
          </div>
          <span
            className={"derivative-strength " + row.strategy.signalStrength}
          >
            {row.strategy.signalStrength} derivative
          </span>
          <span>
            {row.strategy.topDriver ??
              row.strategy.topBlocker ??
              row.signalAction}
          </span>
          <small>
            launch {row.launchScore} · {formatDataQuality(row.launchPhase)}
          </small>
          <small>
            {signal.buyReadyPaper ? "paper ready" : "paper blocked"} ·{" "}
            {formatDataQuality(row.dataQualityLabel)}
          </small>
          {row.hasPaperPosition ? (
            <small className={"pnl-" + getPnlTone(row.unrealizedPnlSol)}>
              {row.paperPositionStatus} {formatPct(row.unrealizedPnlPct)}
            </small>
          ) : null}
        </div>
      </button>
      {expanded ? (
        <ScannerRowAudit row={row} showUnavailable={showUnavailable} />
      ) : null}
    </article>
  );
}

function TokenThumbnail({ row }: { row: MomentumScannerRow }) {
  const [failed, setFailed] = useState(false);
  const imageUri = failed ? null : sanitizeDashboardImageUri(row.imageUri);

  if (imageUri) {
    return (
      <img
        alt=""
        className="scanner-token-image"
        decoding="async"
        loading="lazy"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={imageUri}
      />
    );
  }

  return (
    <span className="scanner-token-image fallback" aria-hidden="true">
      {getTokenInitials(row.symbol, row.displayName)}
    </span>
  );
}

function Sparkline({
  sparkline
}: {
  sparkline: MomentumScannerRow["sparkline"];
}) {
  if (sparkline.points.length < 2) {
    return (
      <div
        aria-label={sparkline.reasonCodes.join(", ")}
        className="sparkline-empty"
        title={sparkline.reasonCodes.join(", ")}
      />
    );
  }

  const prices = sparkline.points.map((point) => point.priceSol);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const width = 116;
  const height = 34;
  const points = sparkline.points
    .map((point, index) => {
      const x =
        sparkline.points.length === 1
          ? 0
          : (index / (sparkline.points.length - 1)) * width;
      const y = height - ((point.priceSol - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      aria-label={`price sparkline ${sparkline.direction}`}
      className={"scanner-sparkline " + sparkline.direction}
      focusable="false"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline fill="none" points={points} />
    </svg>
  );
}

function getScorePillClass(row: MomentumScannerRow): string {
  if (row.signalDisplay.color === "danger") {
    return "score-pill danger";
  }

  if (row.signalDisplay.color === "success") {
    return "score-pill hot";
  }

  if (row.signalDisplay.color === "warning") {
    return "score-pill warn";
  }

  if (row.signalDisplay.color === "info") {
    return "score-pill info";
  }

  return "score-pill";
}

function formatMarketCap(row: MomentumScannerRow): string {
  if (row.marketCapUsd !== null) {
    return formatUsd(row.marketCapUsd);
  }

  if (row.marketCapSol !== null) {
    return formatSol(row.marketCapSol);
  }

  return "—";
}

function ScannerRowAudit({
  row,
  showUnavailable
}: {
  row: MomentumScannerRow;
  showUnavailable: boolean;
}) {
  const liquidity = getLiquidityDisplay(row);
  return (
    <div className="scanner-row-audit">
      <div className="scanner-audit-panel">
        <h4>Strategy Components</h4>
        <dl>
          <dt>signal</dt>
          <dd>{row.signalDisplay.label}</dd>
          <dt>top driver</dt>
          <dd>{row.signalDisplay.topDriver ?? "—"}</dd>
          <dt>top blocker</dt>
          <dd>{row.signalDisplay.topBlocker ?? "—"}</dd>
          <dt>early volume</dt>
          <dd>{formatCompactNumber(row.scoreComponents.earlyVolumeScore)}</dd>
          <dt>volume acceleration</dt>
          <dd>
            {formatCompactNumber(row.scoreComponents.volumeAccelerationScore)}
          </dd>
          <dt>price action</dt>
          <dd>{formatCompactNumber(row.scoreComponents.priceActionScore)}</dd>
          <dt>buyer growth</dt>
          <dd>{formatCompactNumber(row.scoreComponents.buyerGrowthScore)}</dd>
          <dt>buy pressure</dt>
          <dd>{formatCompactNumber(row.scoreComponents.buyPressureScore)}</dd>
          <dt>risk penalty</dt>
          <dd>{formatCompactNumber(row.scoreComponents.riskPenalty)}</dd>
          <dt>missing data penalty</dt>
          <dd>{formatCompactNumber(row.scoreComponents.missingDataPenalty)}</dd>
        </dl>
      </div>
      <div className="scanner-audit-panel">
        <h4>Derivatives</h4>
        <DerivativeMetricTable row={row} />
      </div>
      <div className="scanner-audit-panel">
        <h4>Metric Windows</h4>
        <dl>
          <dt>sparkline</dt>
          <dd>
            {row.sparkline.label} / {formatPct(row.sparkline.priceChangePct)}
          </dd>
          <dt>volume 5s</dt>
          <dd>{formatSol(row.volume5sSol)}</dd>
          <dt>volume 10s</dt>
          <dd>{formatSol(row.volume10sSol)}</dd>
          <dt>volume 30s / 60s</dt>
          <dd>
            {formatSol(row.volume30sSol)} / {formatSol(row.volume60sSol)}
          </dd>
          <dt>buy/sell ratio</dt>
          <dd>{formatCompactNumber(row.buySellRatio)}</dd>
          <dt>net pressure</dt>
          <dd>{formatPct(row.netBuyPressure)}</dd>
          <dt>unique buyers/sellers</dt>
          <dd>
            {formatCompactNumber(row.uniqueBuyers10s)} /{" "}
            {formatCompactNumber(row.uniqueSellers10s)}
          </dd>
          <dt>latest trade</dt>
          <dd>{formatTimeAgo(row.latestTradeAt)}</dd>
          <dt>sample count</dt>
          <dd>{formatCompactNumber(row.realTradeEventCount)}</dd>
        </dl>
      </div>
      <div className="scanner-audit-panel">
        <h4>Risk And Holder Data</h4>
        <dl>
          <dt>risk level</dt>
          <dd>{row.riskLevel}</dd>
          <dt>hard reject</dt>
          <dd>{formatBool(row.hardReject)}</dd>
          <dt>mint / freeze auth</dt>
          <dd>
            {formatBool(row.mintAuthorityActive)} /{" "}
            {formatBool(row.freezeAuthorityActive)}
          </dd>
          <dt>holders</dt>
          <dd>{formatCompactNumber(row.holderCount)}</dd>
          <dt>top holder</dt>
          <dd>{formatPct(row.topHolderPct)}</dd>
          <dt>top10</dt>
          <dd>{formatPct(row.top10HolderPct)}</dd>
          <dt>data quality</dt>
          <dd>{formatDataQuality(row.dataQualityLabel)}</dd>
          <dt>critical missing</dt>
          <dd>{formatCompactNumber(row.dataQuality.missingCriticalCount)}</dd>
        </dl>
      </div>
      <div className="scanner-audit-panel">
        <h4>Data Audit</h4>
        <dl>
          <dt>market cap</dt>
          <dd>{formatMarketCap(row)}</dd>
          <dt>liquidity</dt>
          <dd>
            {liquidity.label} / {liquidity.primary}
          </dd>
          <dt>price / source</dt>
          <dd>
            {formatSol(row.priceSol)} / {row.priceSource ?? "—"}
          </dd>
          <dt>curve reserves</dt>
          <dd>
            {formatSol(row.curve.curveSol)} /{" "}
            {formatCompactNumber(row.curve.curveTokens)} tokens
          </dd>
          <dt>bonding curve</dt>
          <dd>{row.curve.bondingCurve ?? "—"}</dd>
          <dt>pool</dt>
          <dd>{row.poolAddress ?? row.raydiumPool ?? "—"}</dd>
          <dt>migration</dt>
          <dd>
            {row.migrationStatus} / {formatTimeAgo(row.migratedAt)}
          </dd>
          <dt>audit</dt>
          <dd>{row.fieldDiagnosticsSummary}</dd>
          <dt>top missing</dt>
          <dd>{row.dataQuality.topMissingReasons.join(", ") || "—"}</dd>
        </dl>
        {showUnavailable ? (
          <div className="scanner-audit-reasons">
            <ReasonCodes codes={row.unavailableFields} limit={18} />
            <ReasonCodes codes={row.reasonCodes} limit={18} />
          </div>
        ) : null}
      </div>
      <div className="scanner-audit-panel">
        <h4>Paper Position / Exit Signal</h4>
        <dl>
          <dt>paper position</dt>
          <dd>{row.paperPositionStatus ?? "none"}</dd>
          <dt>entry / current</dt>
          <dd>
            {formatSol(row.entryPriceSol)} / {formatSol(row.currentPriceSol)}
          </dd>
          <dt>paper exit</dt>
          <dd>
            {row.latestPaperExitSignal
              ? row.latestPaperExitSignal.sellPct + "%"
              : "none"}
          </dd>
          <dt>position pnl</dt>
          <dd>
            {formatPct(row.unrealizedPnlPct)} /{" "}
            {formatSol(row.unrealizedPnlSol)}
          </dd>
          <dt>paper ready</dt>
          <dd>{formatBool(row.signalDisplay.buyReadyPaper)}</dd>
          <dt>tracking state</dt>
          <dd>{row.trackingState}</dd>
          <dt>visibility</dt>
          <dd>{formatDataQuality(row.dataQualityLabel)}</dd>
        </dl>
      </div>
    </div>
  );
}

function DerivativeMetricTable({ row }: { row: MomentumScannerRow }) {
  const rows = [
    {
      label: "Volume",
      velocity: formatVelocity(row.derivatives.dVol10sSolPerSec, "sol"),
      acceleration: formatAcceleration(row.derivatives.d2VolSolPerSec2, "sol"),
      strength: row.derivativeStrength.volume
    },
    {
      label: "Price %",
      velocity: formatVelocity(row.derivatives.dPricePctPerSec, "pct"),
      acceleration: formatAcceleration(
        row.derivatives.d2PricePctPerSec2,
        "pct"
      ),
      strength: row.derivativeStrength.price
    },
    {
      label: "Price SOL",
      velocity: formatVelocity(row.derivatives.dPriceSolPerSec, "sol"),
      acceleration: formatAcceleration(
        row.derivatives.d2PriceSolPerSec2,
        "sol"
      ),
      strength: row.derivativeStrength.priceSol
    },
    {
      label: "Buyers",
      velocity: formatVelocity(row.derivatives.dBuyersPerSec, "buyers"),
      acceleration: formatAcceleration(
        row.derivatives.d2BuyersPerSec2,
        "buyers"
      ),
      strength: row.derivativeStrength.buyers
    },
    {
      label: "Trades",
      velocity: formatVelocity(row.derivatives.dTradesPerSec, "trades"),
      acceleration: formatAcceleration(
        row.derivatives.d2TradesPerSec2,
        "trades"
      ),
      strength: row.derivativeStrength.trades
    },
    {
      label: "Pressure",
      velocity: formatVelocity(row.derivatives.dBuyPressurePerSec, "pct"),
      acceleration: formatAcceleration(
        row.derivatives.d2BuyPressurePerSec2,
        "pct"
      ),
      strength: row.derivativeStrength.buyPressure
    },
    {
      label: "Market cap",
      velocity: formatVelocity(row.derivatives.dMarketCapSolPerSec, "sol"),
      acceleration: formatAcceleration(
        row.derivatives.d2MarketCapSolPerSec2,
        "sol"
      ),
      strength: row.derivativeStrength.marketCap
    },
    {
      label: "Liquidity",
      velocity: formatVelocity(row.derivatives.dLiquiditySolPerSec, "sol"),
      acceleration: formatAcceleration(
        row.derivatives.d2LiquiditySolPerSec2,
        "sol"
      ),
      strength: row.derivativeStrength.liquidity
    }
  ];

  return (
    <table className="derivative-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>d/dt</th>
          <th>d2/dt2</th>
          <th>Strength</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((metric) => (
          <tr key={metric.label}>
            <td>{metric.label}</td>
            <td>{metric.velocity}</td>
            <td>{metric.acceleration}</td>
            <td className={"derivative-strength " + metric.strength.strength}>
              {metric.strength.strength} · {metric.strength.direction} ·{" "}
              {formatPct(metric.strength.confidence.overall * 100)} conf
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SignalsTab({
  cards,
  signals,
  strategy
}: {
  cards: LiveTokenCardViewModel[];
  signals: OverlaySignal[];
  strategy: StrategyStatus | null;
}) {
  const sortedCards = [...cards].sort(
    (left, right) => right.score - left.score
  );

  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>SIGNALS</h2>
          <p>Read-only strategy status and current card signal explanations.</p>
        </div>
      </div>
      <div className="strategy-status">
        <Stat
          label="strategy"
          value={strategy?.strategyName ?? "—"}
          detail="read only"
        />
        <Stat
          label="buy ready"
          value={formatCompactNumber(
            strategy?.thresholds.minScoreForPaperBuyReady
          )}
          detail="min score"
        />
        <Stat
          label="min samples"
          value={formatCompactNumber(strategy?.thresholds.minSampleCount)}
        />
        <Stat label="safety" value={strategy?.paperOnly ? "PAPER ONLY" : "—"} />
        <div className="formula-list">
          {(strategy?.formula ?? []).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </div>
      <TableShell
        empty="No live card signals"
        headers={[
          "Token",
          "Score",
          "Action",
          "Strength",
          "Risk",
          "Momentum",
          "Quality",
          "Penalty",
          "Drivers",
          "Blockers"
        ]}
        rows={sortedCards.map((card) => [
          <TokenName card={card} key="token" />,
          card.scoreLabel,
          card.action,
          card.signalStrength,
          card.riskLevel,
          card.strategy.components.momentumScore,
          card.strategy.components.qualityScore,
          card.strategy.components.riskPenalty,
          <DriverList drivers={card.strategy.positiveDrivers} key="drivers" />,
          <DriverList drivers={card.strategy.blockers} key="blockers" />
        ])}
      />
      <TableShell
        empty="No raw WebSocket signals"
        headers={["Mint", "Score", "Action", "Risk", "Reasons"]}
        rows={signals.map((signal) => [
          formatMintShort(signal.mint),
          signal.score,
          signal.action,
          signal.riskLevel ?? "unknown",
          <ReasonCodes codes={signal.reasonCodes} key="reasons" />
        ])}
        title="RAW SIGNALS"
      />
    </section>
  );
}

function PortfolioTab({
  fills,
  orders,
  performance,
  positions,
  snapshot,
  status
}: {
  fills: PaperPortfolioFill[];
  orders: PaperPortfolioOrder[];
  performance: PaperPortfolioPerformanceResponse | null;
  positions: PaperPortfolioPosition[];
  snapshot: PaperPortfolioSnapshot | null;
  status: PaperPortfolioStatus | null;
}) {
  const bestTrade = performance?.bestTrade ?? null;
  const worstTrade = performance?.worstTrade ?? null;

  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>PORTFOLIO</h2>
          <p>
            Simulated entries, exits, PnL, fees, and replayable paper history.
          </p>
        </div>
        <span className="table-meta">
          {status?.liveExecutionDisabled ? "NO LIVE EXECUTION" : "—"}
        </span>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="portfolio"
          value={status?.enabled ? "ON" : "OFF"}
          detail="paper only"
          tone={status?.enabled ? "good" : "neutral"}
        />
        <MetricValue
          label="entry policy"
          value={status?.entryPolicyEnabled ? "ON" : "OFF"}
          detail="launch scanner"
          tone={status?.entryPolicyEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="exit policy"
          value={status?.exitPolicyEnabled ? "ON" : "OFF"}
          detail={`${formatCompactNumber(status?.exitPolicyEvaluationCount)} evals / ${status?.exitPolicyVersion ?? "—"}`}
          tone={status?.exitPolicyEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="cash"
          value={formatSol(snapshot?.cashSol)}
          detail="simulated"
        />
        <MetricValue
          label="deployed"
          value={formatSol(snapshot?.deployedSol)}
          detail={`${formatCompactNumber(status?.openPositionCount)} open`}
        />
        <MetricValue
          label="equity"
          value={formatSol(snapshot?.equitySol)}
          detail="cash + marks"
        />
        <MetricValue
          label="total pnl"
          value={formatSol(status?.totalPnlSol)}
          detail={formatPct(snapshot?.totalPnlPct)}
          tone={getPnlTone(status?.totalPnlSol)}
        />
        <MetricValue
          label="realized"
          value={formatSol(status?.realizedPnlSol)}
          detail={`${formatCompactNumber(status?.closedPositionCount)} closed`}
          tone={getPnlTone(status?.realizedPnlSol)}
        />
        <MetricValue
          label="unrealized"
          value={formatSol(status?.unrealizedPnlSol)}
          detail="mark-to-market"
          tone={getPnlTone(status?.unrealizedPnlSol)}
        />
        <MetricValue
          label="win rate"
          value={formatPct(status?.winRate)}
          detail={`${formatCompactNumber(snapshot?.totalTrades)} fills`}
        />
        <MetricValue
          label="drawdown"
          value={formatSol(status?.maxDrawdownSol)}
          detail={formatPct(snapshot?.maxDrawdownPct)}
          tone={status?.maxDrawdownSol ? "warn" : "neutral"}
        />
        <MetricValue
          label="fees"
          value={formatSol(snapshot?.totalFeesSol)}
          detail={`${formatCompactNumber(status?.fillCount)} fills stored`}
        />
      </div>
      <ReasonCodes codes={status?.reasonCodes ?? []} limit={18} />
      <TableShell
        empty="No paper portfolio positions"
        headers={[
          "Token",
          "Status",
          "Entry",
          "Current",
          "Remaining",
          "Unrealized",
          "Realized",
          "Fees",
          "Updated"
        ]}
        rows={positions.map((position) => [
          position.title ?? position.symbol ?? formatMintShort(position.mint),
          position.status,
          formatSol(position.averageEntryPriceSol),
          formatSol(position.currentPriceSol),
          formatSol(position.remainingSizeSol),
          `${formatSol(position.unrealizedPnlSol)} / ${formatPct(
            position.unrealizedPnlPct
          )}`,
          `${formatSol(position.realizedPnlSol)} / ${formatPct(
            position.realizedPnlPct
          )}`,
          formatSol(position.totalFeesSol),
          formatTime(position.updatedAt)
        ])}
        title="POSITIONS"
      />
      <TableShell
        empty="No paper orders"
        headers={[
          "Created",
          "Token",
          "Side",
          "Source",
          "Size",
          "Sell %",
          "Score",
          "Reasons"
        ]}
        rows={orders.map((order) => [
          formatTime(order.createdAt),
          order.title ?? order.symbol ?? formatMintShort(order.mint),
          order.side.toUpperCase(),
          order.source,
          formatSol(order.requestedSizeSol),
          order.requestedSellPct === null ? "—" : `${order.requestedSellPct}%`,
          formatCompactNumber(order.signalScore),
          <ReasonCodes codes={order.reasonCodes} key="reasons" limit={5} />
        ])}
        title="ORDERS"
      />
      <TableShell
        empty="No paper fills"
        headers={[
          "Created",
          "Token",
          "Side",
          "Status",
          "Price",
          "Effective",
          "Size",
          "Fee",
          "Reasons"
        ]}
        rows={fills.map((fill) => [
          formatTime(fill.createdAt),
          formatMintShort(fill.mint),
          fill.side.toUpperCase(),
          fill.fillStatus,
          formatSol(fill.priceSol),
          formatSol(fill.effectivePriceSol),
          formatSol(fill.sizeSol),
          formatSol(fill.feeSol),
          <ReasonCodes codes={fill.reasonCodes} key="reasons" limit={5} />
        ])}
        title="FILLS"
      />
      <TableShell
        empty="No closed paper trades yet"
        headers={["Rank", "Token", "Realized", "Return", "Closed"]}
        rows={[
          ...(bestTrade
            ? [
                [
                  "best",
                  bestTrade.title ??
                    bestTrade.symbol ??
                    formatMintShort(bestTrade.mint),
                  formatSol(bestTrade.realizedPnlSol),
                  formatPct(bestTrade.realizedPnlPct),
                  formatTime(bestTrade.closedAt)
                ]
              ]
            : []),
          ...(worstTrade
            ? [
                [
                  "worst",
                  worstTrade.title ??
                    worstTrade.symbol ??
                    formatMintShort(worstTrade.mint),
                  formatSol(worstTrade.realizedPnlSol),
                  formatPct(worstTrade.realizedPnlPct),
                  formatTime(worstTrade.closedAt)
                ]
              ]
            : [])
        ]}
        title="PERFORMANCE"
      />
    </section>
  );
}

function MetricsTab({ metrics }: { metrics: MetricsRow[] }) {
  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>METRICS</h2>
          <p>Rolling windows, derivatives, and sample counts.</p>
        </div>
      </div>
      <TableShell
        empty="No metrics yet"
        headers={[
          "Token",
          "Samples",
          "10s USD",
          "10s SOL",
          "dVol/dt",
          "d2Vol/dt2",
          "dPrice/dt",
          "dBuyers/dt",
          "Buy/Sell",
          "Net Pressure",
          "Updated"
        ]}
        rows={metrics.map((metric) => [
          metric.identity?.displayName ?? formatMintShort(metric.mint),
          metric.sampleCount,
          formatUsd(metric.windows["10s"].totalVolumeUsd),
          formatSol(metric.windows["10s"].totalVolumeSol),
          formatVelocity(
            metric.usedSolMetricsFallback
              ? metric.volumeVelocitySolPerSec
              : metric.volumeVelocityUsdPerSec,
            metric.usedSolMetricsFallback ? "sol" : "usd"
          ),
          formatAcceleration(
            metric.usedSolMetricsFallback
              ? metric.volumeAccelerationSolPerSec2
              : metric.volumeAccelerationUsdPerSec2,
            metric.usedSolMetricsFallback ? "sol" : "usd"
          ),
          formatVelocity(
            metric.usedSolMetricsFallback
              ? metric.priceSolVelocityPctPerSec
              : metric.priceVelocityPctPerSec,
            "pct"
          ),
          formatVelocity(metric.buyerVelocityPerSec, "buyers"),
          formatCompactNumber(metric.buySellRatio),
          formatPct(metric.netBuyPressure),
          formatTime(metric.lastUpdatedAt)
        ])}
      />
    </section>
  );
}

function RiskTab({ riskRows }: { riskRows: RiskSnapshot[] }) {
  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>RISK</h2>
          <p>
            Hard rejects, authority flags, holder concentration, and risk
            reasons.
          </p>
        </div>
      </div>
      <TableShell
        empty="No risk snapshots yet"
        headers={[
          "Token",
          "Level",
          "Score",
          "Reject",
          "Mint Auth",
          "Freeze",
          "Holders",
          "Top",
          "Top10",
          "Liquidity",
          "Reasons"
        ]}
        rows={riskRows.map((risk) => [
          risk.symbol ?? formatMintShort(risk.mint),
          risk.riskLevel,
          risk.riskScore,
          risk.hardReject ? "yes" : "no",
          formatBool(risk.flags.mintAuthorityActive),
          formatBool(risk.flags.freezeAuthorityActive),
          formatCompactNumber(risk.flags.holderCount),
          formatPct(risk.flags.topHolderPct),
          formatPct(risk.flags.top10HolderPct),
          formatUsd(risk.flags.liquidityUsd),
          <ReasonCodes codes={risk.reasonCodes} key="reasons" />
        ])}
      />
    </section>
  );
}

function ExitTab({
  events,
  rules,
  signals,
  status,
  wallets
}: {
  events: ExitEvent[];
  rules: ExitRule[];
  signals: ExitSignal[];
  status: ExitStatus | null;
  wallets: ExitWallet[];
}) {
  const eventStatsByWallet = new Map<
    string,
    { count: number; latestAt: string | null }
  >();

  for (const event of events) {
    const current = eventStatsByWallet.get(event.wallet) ?? {
      count: 0,
      latestAt: null
    };
    eventStatsByWallet.set(event.wallet, {
      count: current.count + 1,
      latestAt:
        current.latestAt && current.latestAt > event.createdAt
          ? current.latestAt
          : event.createdAt
    });
  }

  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>EXIT</h2>
          <p>
            Watched-wallet triggers, paper exit plans, and metered account-trade
            gates.
          </p>
        </div>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="strategy"
          value={status?.enabled ? "ON" : "OFF"}
          detail="paper exit only"
          tone={status?.enabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="account trades"
          value={status?.accountTradesEnabled ? "ON" : "OFF"}
          detail={status?.meteredAck ? "metered ack" : "ack missing"}
          tone={
            status?.accountTradeMonitoringEnabled
              ? "warn"
              : status?.accountTradesEnabled
                ? "bad"
                : "neutral"
          }
        />
        <MetricValue
          label="watched"
          value={`${formatCompactNumber(status?.watchedWalletCount)}/${formatCompactNumber(
            status?.maxWatchedWallets
          )}`}
          detail={`${formatCompactNumber(
            status?.accountTradeSubscribedWalletCount
          )} subscribed`}
        />
        <MetricValue
          label="rules"
          value={formatCompactNumber(status?.enabledRuleCount)}
          detail={`${rules.length} configured`}
        />
        <MetricValue
          label="events"
          value={`${formatCompactNumber(status?.observedTradeCount)}/${formatCompactNumber(
            status?.maxEventsPerSession
          )}`}
          detail={`${formatCompactNumber(
            status?.accountTradeEventCount
          )} session`}
        />
        <MetricValue
          label="signals"
          value={formatCompactNumber(status?.exitSignalCount)}
          detail="paper plans"
        />
        <MetricValue
          label="budget"
          value={formatSol(status?.estimatedCostSol)}
          detail={status?.budgetReached ? "cap reached" : "within cap"}
          tone={status?.budgetReached ? "bad" : "neutral"}
        />
        <MetricValue
          label="data wallet"
          value={status?.dataWalletReady ? "READY" : "BLOCKED"}
          detail="metered stream gate"
          tone={status?.dataWalletReady ? "good" : "neutral"}
        />
        <MetricValue
          label="paper only"
          value={status?.paperOnly ? "YES" : "UNKNOWN"}
          detail={
            status?.liveExecutionDisabled ? "live execution disabled" : "—"
          }
          tone="good"
        />
      </div>
      <ReasonCodes codes={status?.reasonCodes ?? []} limit={18} />
      <TableShell
        empty="No watched wallets configured"
        headers={[
          "Alias",
          "Address",
          "Tags",
          "Enabled",
          "Last Event",
          "Events"
        ]}
        rows={wallets.map((wallet) => {
          const stats = eventStatsByWallet.get(wallet.address);

          return [
            wallet.alias ?? "—",
            formatMintShort(wallet.address),
            wallet.tags.join(", ") || "—",
            wallet.enabled ? "yes" : "no",
            formatTime(stats?.latestAt ?? null),
            formatCompactNumber(stats?.count ?? 0)
          ];
        })}
        title="WATCHED WALLETS"
      />
      <TableShell
        empty="No exit rules configured"
        headers={[
          "Name",
          "Enabled",
          "Trigger",
          "Min Profit",
          "Sell Plan",
          "Cooldown",
          "Priority"
        ]}
        rows={rules.map((rule) => [
          rule.name,
          rule.enabled ? "yes" : "no",
          rule.trigger,
          formatPct(rule.minProfitPct / 100),
          `${rule.sellPct}%`,
          `${formatCompactNumber(rule.cooldownMs)}ms`,
          rule.priority
        ])}
        title="RULES"
      />
      <TableShell
        empty="No watched wallet trade events"
        headers={[
          "Wallet",
          "Mint",
          "Side",
          "Price",
          "Volume",
          "Signature",
          "Time"
        ]}
        rows={events.map((event) => [
          event.walletAlias ?? formatMintShort(event.wallet),
          formatMintShort(event.mint),
          event.side.toUpperCase(),
          formatSol(event.priceSol),
          formatSol(event.volumeSol),
          formatMintShort(event.signature),
          formatTime(event.createdAt)
        ])}
        title="WATCHED WALLET EVENTS"
      />
      <TableShell
        empty="No paper exit signals"
        headers={[
          "Token",
          "Wallet",
          "Rule",
          "Sell Plan",
          "Blocked",
          "Blockers",
          "Warnings",
          "Created"
        ]}
        rows={signals.map((signal) => [
          formatMintShort(signal.mint),
          signal.walletAlias ?? formatMintShort(signal.wallet),
          signal.ruleId,
          `${signal.sellPct}%`,
          signal.blocked ? "yes" : "no",
          <ReasonCodes codes={signal.blockers} key="blockers" limit={4} />,
          <ReasonCodes codes={signal.warnings} key="warnings" limit={4} />,
          formatTime(signal.createdAt)
        ])}
        title="PAPER EXIT SIGNALS"
      />
    </section>
  );
}

function DataTab({
  actualDataStatus,
  actualTrades,
  chainStatus,
  dataWalletStatus,
  diagnostics,
  lightningStatus,
  feedStatus,
  indexerStatus,
  launchScannerStatus,
  liveCardEnrichmentStatus,
  liveStatus,
  liveTradeTrackingStatus,
  marketObservations,
  marketStatus,
  meteredLaunchDataStatus,
  meteredLaunchDataTracked,
  pumpPortalWalletsStatus,
  runtimeActionStatus,
  runtimeControlStatus,
  runRuntimeAction,
  tokenIdentities,
  tokenIdentityStatus
}: {
  actualDataStatus: ActualDataStatus | null;
  actualTrades: PumpPortalTradeRow[];
  chainStatus: ChainStatus | null;
  dataWalletStatus: PumpPortalDataWalletStatus | null;
  diagnostics: MomentumDiagnostics | null;
  lightningStatus: LightningStatus | null;
  feedStatus: FeedStatus | null;
  indexerStatus: IndexerStatus | null;
  launchScannerStatus: LaunchScannerStatus | null;
  liveCardEnrichmentStatus: LiveCardEnrichmentStatus | null;
  liveStatus: LiveStatus | null;
  liveTradeTrackingStatus: LiveTradeTrackingStatus | null;
  marketObservations: MarketObservationRow[];
  marketStatus: MarketStatus | null;
  meteredLaunchDataStatus: MeteredLaunchDataStatus | null;
  meteredLaunchDataTracked: MeteredLaunchDataTrackedMint[];
  pumpPortalWalletsStatus: PumpPortalWalletsStatus | null;
  runtimeActionStatus: string;
  runtimeControlStatus: RuntimeControlStatus | null;
  runRuntimeAction: (
    path: string,
    label: string,
    body?: unknown
  ) => Promise<void>;
  tokenIdentities: TokenIdentityRow[];
  tokenIdentityStatus: TokenIdentityStatus | null;
}) {
  const realManagedStreamState = getRealManagedStreamState(indexerStatus);
  const meteredBlockers = getMeteredRuntimeBlockers(runtimeControlStatus);
  const canStartMetered =
    Boolean(runtimeControlStatus) &&
    runtimeControlStatus?.meteredLaunchData.enabled === true &&
    runtimeControlStatus?.meteredLaunchData.blocked === false;

  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>DATA</h2>
          <p>
            Feed health, source status, identities, and recent observations.
          </p>
        </div>
      </div>
      <DataPanel
        ariaLabel="Momentum scanner diagnostics"
        meta={<span>FIELD AVAILABILITY</span>}
        title="SCANNER DIAGNOSTICS"
      >
        <div className="status-grid secondary-grid embedded-grid">
          <MetricValue
            label="rows"
            value={formatCompactNumber(diagnostics?.rowsReturned)}
            detail={`${formatCompactNumber(
              diagnostics?.liveTokenCount
            )} live tokens`}
          />
          <MetricValue
            label="price"
            value={formatCompactNumber(diagnostics?.tokensWithPrice)}
            detail="price action"
          />
          <MetricValue
            label="volume"
            value={formatCompactNumber(diagnostics?.tokensWithVolume)}
            detail="rolling windows"
          />
          <MetricValue
            label="trades"
            value={formatCompactNumber(diagnostics?.tokensWithTradeData)}
            detail="metered samples"
          />
          <MetricValue
            label="derivatives"
            value={formatCompactNumber(diagnostics?.tokensWithDerivatives)}
            detail="sample gated"
          />
          <MetricValue
            label="market cap"
            value={formatCompactNumber(diagnostics?.tokensWithMarketCap)}
            detail="enrichment"
          />
          <MetricValue
            label="liquidity"
            value={formatCompactNumber(diagnostics?.tokensWithLiquidity)}
            detail="enrichment"
          />
          <MetricValue
            label="holders"
            value={formatCompactNumber(diagnostics?.tokensWithHolderData)}
            detail="chain verifier"
          />
          <MetricValue
            label="positions"
            value={formatCompactNumber(diagnostics?.tokensWithPaperPosition)}
            detail="paper portfolio"
          />
        </div>
        <div className="diagnostic-actions">
          {(diagnostics?.recommendedNextActions ?? []).map((action) => (
            <span key={action}>{action}</span>
          ))}
        </div>
        <ReasonBlock
          title="Momentum Diagnostics Reasons"
          codes={diagnostics?.reasonCodes}
        />
      </DataPanel>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="feed"
          value={feedStatus?.connected ? "CONNECTED" : "OFFLINE"}
          detail={feedStatus?.provider ?? "unknown"}
          tone={feedStatus?.connected ? "good" : "bad"}
        />
        <MetricValue
          label="live session"
          value={formatCompactNumber(liveStatus?.liveTokenCount)}
          detail={liveStatus?.sessionId ?? "—"}
        />
        <MetricValue
          label="launch tracking"
          value={launchScannerStatus?.launchTrackingEnabled ? "ON" : "OFF"}
          detail={`${launchScannerStatus?.trackedMintCount ?? 0}/${
            launchScannerStatus?.maxConcurrentTracked ?? 0
          } mints`}
          tone={launchScannerStatus?.launchTrackingEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="metered launch data"
          value={meteredLaunchDataStatus?.enabled ? "ON" : "OFF"}
          detail={`${meteredLaunchDataStatus?.trackedMintCount ?? 0}/${
            meteredLaunchDataStatus?.maxConcurrentMints ?? 0
          } mints`}
          tone={
            meteredLaunchDataStatus?.budgetReached
              ? "bad"
              : meteredLaunchDataStatus?.ready
                ? "warn"
                : "neutral"
          }
        />
        <MetricValue
          label="data wallet"
          value={(dataWalletStatus?.balanceStatus ?? "unknown").toUpperCase()}
          detail={
            dataWalletStatus?.publicKeyConfigured
              ? (dataWalletStatus.shortPublicKey ?? "—")
              : "public key missing"
          }
          tone={getDataWalletTone(dataWalletStatus?.balanceStatus)}
        />
        <MetricValue
          label="launch budget"
          value={formatSol(launchScannerStatus?.estimatedMeteredCostSol)}
          detail={`${formatSol(launchScannerStatus?.maxSessionCostSol)} cap`}
          tone={
            (launchScannerStatus?.estimatedMeteredCostSol ?? 0) >=
            (launchScannerStatus?.maxSessionCostSol ?? Number.POSITIVE_INFINITY)
              ? "bad"
              : "neutral"
          }
        />
        <MetricValue
          label="enrichment"
          value={liveCardEnrichmentStatus?.enabled ? "ON" : "OFF"}
          detail={`${liveCardEnrichmentStatus?.cachedMintCount ?? 0} cached`}
          tone={liveCardEnrichmentStatus?.enabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="market"
          value={marketStatus?.enabled ? "ON" : "OFF"}
          detail={`${marketStatus?.minConfidenceForMetrics ?? "—"} min`}
        />
        <MetricValue
          label="chain"
          value={(chainStatus?.status ?? "unknown").toUpperCase()}
          detail={chainStatus?.rpcHttpUrlConfigured ? "rpc set" : "rpc unset"}
        />
        <MetricValue
          label="identity"
          value={formatCompactNumber(tokenIdentityStatus?.identityCount)}
          detail={`${tokenIdentityStatus?.resolvedCount ?? 0} resolved`}
        />
        <MetricValue
          label="indexer"
          value={indexerStatus?.enabled ? "ON" : "OFF"}
          detail={indexerStatus?.source ?? "api_adapter"}
          tone={indexerStatus?.enabled ? "good" : "neutral"}
        />
        <MetricValue
          label="indexer events"
          value={formatCompactNumber(indexerStatus?.eventBus.publishedCount)}
          detail={`${indexerStatus?.liveState.tokenCount ?? 0} live-state tokens`}
        />
        <MetricValue
          label="future geyser"
          value={
            indexerStatus?.futureGeyser.implemented
              ? "IMPLEMENTED"
              : "NOT IMPLEMENTED"
          }
          detail={indexerStatus?.futureGeyser.status ?? "not_implemented"}
          tone="neutral"
        />
        <MetricValue
          label="managed stream"
          value={indexerStatus?.streamEnabled ? "ON" : "OFF"}
          detail={`secondary / ${indexerStatus?.streamProvider ?? "mock"}`}
          tone={indexerStatus?.streamEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label={`REAL MANAGED STREAM: ${realManagedStreamState}`}
          value={realManagedStreamState}
          detail={`Provider ${
            indexerStatus?.managedStream?.realProvider ?? "laserstream"
          }`}
          tone={
            realManagedStreamState === "CONNECTED"
              ? "good"
              : realManagedStreamState === "READY"
                ? "warn"
                : realManagedStreamState === "BLOCKED"
                  ? "bad"
                  : "neutral"
          }
        />
        <MetricValue
          label="laser gates"
          value={
            indexerStatus?.managedStream?.realConnectionAllowed &&
            indexerStatus?.managedStream?.realConnectionAck
              ? "OPEN"
              : "CLOSED"
          }
          detail={`allow ${
            indexerStatus?.managedStream?.realConnectionAllowed ? "yes" : "no"
          } / ack ${
            indexerStatus?.managedStream?.realConnectionAck ? "yes" : "no"
          }`}
          tone={
            indexerStatus?.managedStream?.laserstream?.readyToConnect
              ? "warn"
              : "neutral"
          }
        />
        <MetricValue
          label="laser readiness"
          value={
            indexerStatus?.managedStream?.laserstream?.readyToConnect
              ? "READY"
              : "BLOCKED"
          }
          detail={
            indexerStatus?.managedStream?.laserstream?.apiKeyConfigured
              ? "api key configured"
              : "api key unset"
          }
          tone={
            indexerStatus?.managedStream?.laserstream?.readyToConnect
              ? "warn"
              : "neutral"
          }
        />
        <MetricValue
          label="laser messages"
          value={formatCompactNumber(
            indexerStatus?.managedStream?.laserstream?.messageCount
          )}
          detail={`limit ${formatCompactNumber(
            indexerStatus?.managedStream?.laserstream?.maxMessagesPerSession
          )}`}
        />
        <MetricValue
          label="stream state"
          value={(
            indexerStatus?.streamConnectionState ?? "disabled"
          ).toUpperCase()}
          detail={`${formatCompactNumber(
            indexerStatus?.streamEnvelopeCount
          )} envelopes`}
        />
        <MetricValue
          label="stream events"
          value={formatCompactNumber(indexerStatus?.streamEventCount)}
          detail={`${formatCompactNumber(
            indexerStatus?.managedStream?.errorCount
          )} errors`}
        />
        <MetricValue
          label="stream auth"
          value={
            indexerStatus?.managedStream?.configured
              ? "CONFIGURED"
              : "UNCONFIGURED"
          }
          detail={
            indexerStatus?.managedStream?.authConfigured
              ? "auth configured"
              : "auth unset"
          }
        />
        <MetricValue
          label="stream endpoint"
          value={
            indexerStatus?.managedStream?.endpointMasked ? "MASKED" : "UNSET"
          }
          detail={indexerStatus?.managedStream?.endpointMasked ?? "no endpoint"}
        />
        <MetricValue
          label="subscription"
          value={
            indexerStatus?.managedStream?.subscriptionSummary
              ?.transactionsEnabled
              ? "TRANSACTIONS"
              : "HEALTHCHECK"
          }
          detail={`programs ${formatCompactNumber(
            indexerStatus?.managedStream?.subscriptionSummary
              ?.transactionAccountIncludeCount
          )} / required ${formatCompactNumber(
            indexerStatus?.managedStream?.subscriptionSummary
              ?.transactionAccountRequiredCount
          )}`}
        />
        <MetricValue
          label="stream last"
          value={formatTimeAgo(
            indexerStatus?.managedStream?.laserstream?.lastMessageAt ??
              indexerStatus?.managedStream?.lastMessageAt
          )}
          detail={`runtime ${formatCompactNumber(
            indexerStatus?.managedStream?.laserstream?.maxRuntimeMs
          )} ms`}
        />
        <MetricValue
          label="yellowstone"
          value={
            indexerStatus?.managedStream?.yellowstoneStatus.connectionState ===
            "not_implemented"
              ? "SKELETON"
              : "DISABLED"
          }
          detail={
            indexerStatus?.managedStream?.yellowstoneStatus.connectionState ??
            "not_implemented"
          }
        />
        <MetricValue
          label="laserstream"
          value={
            indexerStatus?.managedStream?.laserstreamStatus.connectionState ===
            "not_implemented"
              ? "SKELETON"
              : "DISABLED"
          }
          detail={
            indexerStatus?.managedStream?.laserstreamStatus.connectionState ??
            "not_implemented"
          }
        />
      </div>
      <DataPanel
        ariaLabel="Pump.fun PumpPortal runtime control"
        meta={<span>METERED DATA ONLY — NO TRADING</span>}
        title="PUMPFUN / PUMPPORTAL CONTROL"
      >
        <div className="status-grid secondary-grid embedded-grid">
          <MetricValue
            label="live discovery"
            value={getRuntimeLiveLabel(runtimeControlStatus)}
            detail={formatTimeAgo(
              runtimeControlStatus?.liveDiscovery.lastEventAt
            )}
            tone={
              runtimeControlStatus?.liveDiscovery.connected
                ? "good"
                : runtimeControlStatus?.liveDiscovery.connecting
                  ? "warn"
                  : runtimeControlStatus?.liveDiscovery.lastError
                    ? "bad"
                    : "neutral"
            }
          />
          <MetricValue
            label="new tokens"
            value={formatCompactNumber(
              runtimeControlStatus?.liveDiscovery.newTokenEventCount
            )}
            detail={`${formatCompactNumber(
              runtimeControlStatus?.liveDiscovery.migrationEventCount
            )} migrations`}
          />
          <MetricValue
            label="metered price"
            value={getRuntimeMeteredLabel(runtimeControlStatus)}
            detail={`${formatCompactNumber(
              runtimeControlStatus?.meteredLaunchData.trackedMintCount
            )} tracked`}
            tone={
              runtimeControlStatus?.meteredLaunchData.active
                ? "good"
                : runtimeControlStatus?.meteredLaunchData.blocked
                  ? "bad"
                  : "neutral"
            }
          />
          <MetricValue
            label="events"
            value={formatCompactNumber(
              runtimeControlStatus?.meteredLaunchData.eventCount
            )}
            detail={`${formatSol(
              runtimeControlStatus?.meteredLaunchData.estimatedCostSol
            )} cost`}
          />
          <MetricValue
            label="budget left"
            value={formatSol(
              runtimeControlStatus?.meteredLaunchData.budgetRemainingSol
            )}
            detail={`${formatSol(
              runtimeControlStatus?.meteredLaunchData.sessionCostCapSol
            )} cap`}
          />
          <MetricValue
            label="data wallet"
            value={(
              runtimeControlStatus?.dataWallet.balanceStatus ?? "unknown"
            ).toUpperCase()}
            detail={
              runtimeControlStatus?.dataWallet.shortPublicKey ??
              "public address"
            }
            tone={getDataWalletTone(
              runtimeControlStatus?.dataWallet.balanceStatus
            )}
          />
          <MetricValue
            label="api key"
            value={
              runtimeControlStatus?.dataWallet.apiKeyConfigured ? "YES" : "NO"
            }
            detail="backend only"
            tone={
              runtimeControlStatus?.dataWallet.apiKeyConfigured ? "good" : "bad"
            }
          />
          <MetricValue
            label="runtime"
            value={`${formatCompactNumber(
              runtimeControlStatus?.process.uptimeSeconds
            )}s`}
            detail={
              runtimeControlStatus?.paperOnly &&
              runtimeControlStatus.tradingDisabled
                ? "paper only"
                : "check gates"
            }
          />
        </div>
        <div className="runtime-actions">
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/live-discovery/start",
                "Starting discovery"
              )
            }
            type="button"
          >
            Start live discovery
          </button>
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/live-discovery/stop",
                "Stopping discovery"
              )
            }
            type="button"
          >
            Stop live discovery
          </button>
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/live-discovery/restart",
                "Restarting discovery"
              )
            }
            type="button"
          >
            Restart live discovery
          </button>
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/data-wallet/refresh",
                "Refreshing wallet"
              )
            }
            type="button"
          >
            Refresh wallet balance
          </button>
          <button
            className="control-button metered"
            disabled={!canStartMetered}
            onClick={() =>
              void runRuntimeAction(
                "/runtime/metered-launch-data/start",
                "Starting metered price action"
              )
            }
            type="button"
          >
            Start metered price action
          </button>
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/metered-launch-data/stop",
                "Stopping metered price action"
              )
            }
            type="button"
          >
            Stop metered price action
          </button>
        </div>
        <div className="runtime-action-status">{runtimeActionStatus}</div>
        {meteredBlockers.length > 0 ? (
          <div className="signal-risk-strip data-wallet-warnings">
            {meteredBlockers.map((blocker) => (
              <span key={blocker}>{blocker}</span>
            ))}
          </div>
        ) : null}
        <div className="data-wallet-address-row">
          <span className="mono">
            {runtimeControlStatus?.dataWallet.publicKey ??
              "data wallet public address unavailable"}
          </span>
          {runtimeControlStatus?.dataWallet.publicKey ? (
            <button
              className="copy-button"
              onClick={() =>
                void navigator.clipboard.writeText(
                  runtimeControlStatus.dataWallet.publicKey ?? ""
                )
              }
              type="button"
            >
              copy
            </button>
          ) : null}
        </div>
        <ReasonBlock
          title="Runtime Control Reasons"
          codes={runtimeControlStatus?.reasonCodes}
        />
      </DataPanel>
      <ReasonBlock title="Feed Reasons" codes={feedStatus?.reasonCodes} />
      <ReasonBlock
        title="Launch Scanner Reasons"
        codes={launchScannerStatus?.reasonCodes}
      />
      <DataPanel
        ariaLabel="PumpPortal launch tracking"
        meta={
          <span>
            {launchScannerStatus?.launchTrackingAcknowledgedMetered
              ? "METERED ACKED"
              : "METERED NOT ACKED"}
          </span>
        }
        title="PUMPPORTAL LAUNCH TRACKING"
      >
        <div className="status-grid secondary-grid embedded-grid">
          <MetricValue
            label="mode"
            value={(
              launchScannerStatus?.launchTrackingMode ?? "manual"
            ).toUpperCase()}
            detail={launchScannerStatus?.runtimeMode ?? "pumpportal_first"}
          />
          <MetricValue
            label="discovery"
            value={
              launchScannerStatus?.liveDiscoveryActive ? "ACTIVE" : "OFFLINE"
            }
            detail={`${launchScannerStatus?.candidateCount ?? 0} candidates`}
            tone={launchScannerStatus?.liveDiscoveryActive ? "good" : "bad"}
          />
          <MetricValue
            label="session events"
            value={formatCompactNumber(
              launchScannerStatus?.totalEventsThisSession
            )}
            detail={`${formatCompactNumber(
              launchScannerStatus?.maxEventsPerSession
            )} cap`}
          />
          <MetricValue
            label="per token"
            value={formatCompactNumber(launchScannerStatus?.maxEventsPerToken)}
            detail="event cap"
          />
          <MetricValue
            label="extend"
            value={formatCompactNumber(launchScannerStatus?.minScoreToExtend)}
            detail={`rip ${formatCompactNumber(
              launchScannerStatus?.minScoreToRip
            )}`}
          />
          <MetricValue
            label="tracked mints"
            value={formatCompactNumber(launchScannerStatus?.trackedMintCount)}
            detail={`${launchScannerStatus?.trackedMints.length ?? 0} listed`}
          />
        </div>
        <div className="data-wallet-address-row">
          <span className="mono">
            {(launchScannerStatus?.trackedMints ?? [])
              .map(formatMintShort)
              .join(" / ") || "no launch mints tracked"}
          </span>
        </div>
      </DataPanel>
      <DataPanel
        ariaLabel="Metered launch data"
        meta={
          <span>
            {meteredLaunchDataStatus?.acknowledgedCost
              ? "COST ACKED"
              : "ACK MISSING"}
          </span>
        }
        title="METERED LAUNCH DATA"
      >
        <div className="status-grid secondary-grid embedded-grid">
          <MetricValue
            label="enabled"
            value={meteredLaunchDataStatus?.enabled ? "ON" : "OFF"}
            detail={meteredLaunchDataStatus?.mode ?? "newest"}
            tone={meteredLaunchDataStatus?.enabled ? "warn" : "neutral"}
          />
          <MetricValue
            label="ready"
            value={meteredLaunchDataStatus?.ready ? "YES" : "NO"}
            detail={
              meteredLaunchDataStatus?.liveDiscoveryActive
                ? "discovery active"
                : "discovery offline"
            }
            tone={meteredLaunchDataStatus?.ready ? "good" : "bad"}
          />
          <MetricValue
            label="data wallet"
            value={
              meteredLaunchDataStatus?.dataWalletConfigured
                ? "READY"
                : "BLOCKED"
            }
            detail={(
              meteredLaunchDataStatus?.dataWalletBalanceStatus ?? "unknown"
            ).toUpperCase()}
            tone={getDataWalletTone(
              meteredLaunchDataStatus?.dataWalletBalanceStatus
            )}
          />
          <MetricValue
            label="api key"
            value={meteredLaunchDataStatus?.apiKeyConfigured ? "YES" : "NO"}
            detail="backend only"
            tone={meteredLaunchDataStatus?.apiKeyConfigured ? "good" : "bad"}
          />
          <MetricValue
            label="tracked mints"
            value={formatCompactNumber(
              meteredLaunchDataStatus?.trackedMintCount
            )}
            detail={`${formatCompactNumber(
              meteredLaunchDataStatus?.maxConcurrentMints
            )} cap`}
          />
          <MetricValue
            label="events"
            value={formatCompactNumber(
              meteredLaunchDataStatus?.totalEventsThisSession
            )}
            detail={`${formatCompactNumber(
              meteredLaunchDataStatus?.maxEventsPerSession
            )} cap`}
          />
          <MetricValue
            label="cost"
            value={formatSol(meteredLaunchDataStatus?.estimatedCostSol)}
            detail={`${formatSol(
              meteredLaunchDataStatus?.maxSessionCostSol
            )} cap`}
            tone={meteredLaunchDataStatus?.budgetReached ? "bad" : "neutral"}
          />
          <MetricValue
            label="remaining"
            value={formatSol(meteredLaunchDataStatus?.remainingBudgetSol)}
            detail={`${formatSol(
              meteredLaunchDataStatus?.projectedCostPerHourSol
            )} / hr projected`}
          />
          <MetricValue
            label="stop"
            value={
              meteredLaunchDataStatus?.lastStopReason
                ? meteredLaunchDataStatus.lastStopReason.toUpperCase()
                : "—"
            }
            detail={
              meteredLaunchDataStatus?.budgetReached
                ? "budget reached"
                : "no stop condition"
            }
          />
        </div>
        <ReasonBlock
          title="Metered Launch Data Reasons"
          codes={meteredLaunchDataStatus?.reasonCodes}
        />
        <TableShell
          empty="No metered launch mints tracked"
          headers={[
            "Mint",
            "Status",
            "Subscribed",
            "Events",
            "Cost",
            "Latest",
            "Reason"
          ]}
          rows={meteredLaunchDataTracked.map((item) => [
            formatMintShort(item.mint),
            item.status.toUpperCase(),
            formatTime(item.subscribedAt),
            formatCompactNumber(item.eventCount),
            formatSol(item.estimatedCostSol),
            formatTimeAgo(item.latestTradeAt),
            item.reason
          ])}
          title="METERED TRACKED MINTS"
        />
      </DataPanel>
      <ReasonBlock title="Indexer Reasons" codes={indexerStatus?.reasonCodes} />
      <ReasonBlock
        title="Managed Stream Reasons"
        codes={indexerStatus?.managedStream?.reasonCodes}
      />
      <ReasonBlock
        title="Actual Data Reasons"
        codes={actualDataStatus?.reasonCodes}
      />
      <DataWalletPanel
        actualDataStatus={actualDataStatus}
        dataWalletStatus={dataWalletStatus}
        liveTradeTrackingStatus={liveTradeTrackingStatus}
      />
      <PumpPortalWalletsLightningPanel
        lightningStatus={lightningStatus}
        pumpPortalWalletsStatus={pumpPortalWalletsStatus}
      />
      <ReasonBlock
        title="Trade Tracking Reasons"
        codes={liveTradeTrackingStatus?.reasonCodes}
      />
      <ReasonBlock
        title="Enrichment Reasons"
        codes={liveCardEnrichmentStatus?.reasonCodes}
      />
      <TableShell
        empty="No token identities"
        headers={[
          "Token",
          "Source",
          "Confidence",
          "Resolved",
          "Metadata",
          "Updated"
        ]}
        rows={tokenIdentities.map((identity) => [
          identity.displayName,
          identity.dataSource,
          identity.confidence,
          identity.resolved ? "yes" : "no",
          identity.metadataUri ? "yes" : "—",
          formatTime(identity.updatedAt)
        ])}
        title="TOKEN IDENTITIES"
      />
      <TableShell
        empty="No actual PumpPortal token trades"
        headers={[
          "Mint",
          "Side",
          "Price SOL",
          "Volume SOL",
          "Usable",
          "Reasons"
        ]}
        rows={actualTrades.map((trade) => [
          trade.identity?.displayName ?? formatMintShort(trade.mint),
          trade.side,
          formatSol(trade.priceSol),
          formatSol(trade.volumeSol),
          trade.usableForMetrics ? "yes" : "no",
          <ReasonCodes codes={trade.reasonCodes} key="reasons" />
        ])}
        title="ACTUAL TOKEN TRADES"
      />
      <TableShell
        empty="No market observations"
        headers={[
          "Mint",
          "Side",
          "Quote",
          "Price",
          "Volume",
          "Confidence",
          "Usable"
        ]}
        rows={marketObservations.map((observation) => [
          formatMintShort(observation.mint),
          observation.side,
          observation.quoteAsset,
          formatUsdOrSol(observation.priceUsd, observation.priceSol),
          formatUsdOrSol(observation.volumeUsd, observation.volumeSol),
          observation.confidence,
          observation.usableForMetrics ? "yes" : "no"
        ])}
        title="MARKET OBSERVATIONS"
      />
    </section>
  );
}

function getRealManagedStreamState(
  indexerStatus: IndexerStatus | null
): "DISABLED" | "READY" | "CONNECTED" | "BLOCKED" {
  const managedStream = indexerStatus?.managedStream;
  const laserstream = managedStream?.laserstream;

  if (laserstream?.connected) {
    return "CONNECTED";
  }

  if (laserstream?.readyToConnect) {
    return "READY";
  }

  if ((managedStream?.connectionBlockedReasons?.length ?? 0) > 0) {
    return "BLOCKED";
  }

  return "DISABLED";
}

function DataWalletPanel({
  actualDataStatus,
  dataWalletStatus,
  liveTradeTrackingStatus
}: {
  actualDataStatus: ActualDataStatus | null;
  dataWalletStatus: PumpPortalDataWalletStatus | null;
  liveTradeTrackingStatus: LiveTradeTrackingStatus | null;
}) {
  const publicKey = dataWalletStatus?.publicKey ?? null;

  return (
    <div className="data-wallet-panel">
      <div className="table-heading">
        <h3>DATA WALLET / PUMPPORTAL METERED DATA</h3>
        <span className="table-meta">DATA ONLY / PAPER ONLY</span>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="status"
          value={(dataWalletStatus?.balanceStatus ?? "unknown").toUpperCase()}
          detail="billing readiness"
          tone={getDataWalletTone(dataWalletStatus?.balanceStatus)}
        />
        <MetricValue
          label="funding address"
          value={dataWalletStatus?.shortPublicKey ?? "—"}
          detail={
            dataWalletStatus?.publicKeyConfigured ? "public key" : "missing"
          }
        />
        <MetricValue
          label="balance"
          value={formatSol(dataWalletStatus?.balanceSol)}
          detail={`${formatSol(dataWalletStatus?.minBalanceSol)} minimum`}
          tone={getDataWalletTone(dataWalletStatus?.balanceStatus)}
        />
        <MetricValue
          label="target"
          value={formatSol(dataWalletStatus?.targetBalanceSol)}
          detail={`${formatSol(dataWalletStatus?.warnBalanceSol)} warn`}
        />
        <MetricValue
          label="events left"
          value={formatCompactNumber(
            dataWalletStatus?.estimatedEventsRemaining
          )}
          detail={`${formatSol(
            dataWalletStatus?.estimatedCostPer10000EventsSol
          )} / 10k events`}
        />
        <MetricValue
          label="api key"
          value={dataWalletStatus?.apiKeyConfigured ? "YES" : "NO"}
          detail="backend only"
          tone={dataWalletStatus?.apiKeyConfigured ? "good" : "bad"}
        />
        <MetricValue
          label="rpc balance"
          value={dataWalletStatus?.solanaRpcConfigured ? "YES" : "NO"}
          detail={formatTimeAgo(dataWalletStatus?.lastBalanceCheckAt)}
          tone={dataWalletStatus?.solanaRpcConfigured ? "good" : "warn"}
        />
        <MetricValue
          label="trades"
          value={liveTradeTrackingStatus?.enabled ? "ON" : "OFF"}
          detail={
            actualDataStatus?.acknowledgedMetered ? "acknowledged" : "not acked"
          }
        />
        <MetricValue
          label="subscribed"
          value={formatCompactNumber(
            liveTradeTrackingStatus?.subscribedTokenCount
          )}
          detail={`${formatCompactNumber(
            liveTradeTrackingStatus?.totalEventsThisSession
          )} session events`}
        />
        <MetricValue
          label="budget"
          value={formatCompactNumber(
            liveTradeTrackingStatus?.maxEventsPerSession
          )}
          detail={
            liveTradeTrackingStatus?.budgetReached
              ? "budget reached"
              : "session cap"
          }
          tone={liveTradeTrackingStatus?.budgetReached ? "bad" : "neutral"}
        />
      </div>
      <div className="data-wallet-address-row">
        <span className="mono">
          {publicKey ?? "PUMPPORTAL_DATA_WALLET_PUBLIC_KEY missing"}
        </span>
        <button
          disabled={!publicKey}
          onClick={() => copyPublicKey(publicKey)}
          type="button"
        >
          COPY ADDRESS
        </button>
      </div>
      <div className="signal-risk-strip data-wallet-warnings">
        <span>DATA ONLY</span>
        <span>PAPER ONLY</span>
        <span>NO TRADING ENDPOINTS</span>
        <span>NO PRIVATE KEY STORED</span>
        <span>FUND SMALL AMOUNTS ONLY</span>
      </div>
      <ReasonBlock
        title="Data Wallet Reasons"
        codes={dataWalletStatus?.reasonCodes}
      />
    </div>
  );
}

function PumpPortalWalletsLightningPanel({
  lightningStatus,
  pumpPortalWalletsStatus
}: {
  lightningStatus: LightningStatus | null;
  pumpPortalWalletsStatus: PumpPortalWalletsStatus | null;
}) {
  return (
    <div className="data-wallet-panel lightning-panel">
      <div className="table-heading">
        <h3>PUMPPORTAL WALLETS / LIGHTNING READINESS</h3>
        <span className="table-meta">NO TRANSACTION SENT / PLANNING ONLY</span>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="live trading"
          value={lightningStatus?.liveTradingAllowed ? "ON" : "DISABLED"}
          detail="execution gate"
          tone={lightningStatus?.liveTradingAllowed ? "bad" : "good"}
        />
        <MetricValue
          label="manual arm"
          value={lightningStatus?.manualArmed ? "ARMED" : "NOT ARMED"}
          detail={
            lightningStatus?.manualArmRequired ? "required" : "not required"
          }
          tone={lightningStatus?.manualArmed ? "warn" : "good"}
        />
        <MetricValue
          label="max buy"
          value={formatSol(lightningStatus?.maxBuySol)}
          detail={`${formatSol(lightningStatus?.maxDailySol)} daily`}
        />
        <MetricValue
          label="slippage cap"
          value={`${lightningStatus?.slippage ?? "—"}%`}
          detail={`${formatSol(lightningStatus?.priorityFee)} priority`}
        />
        <MetricValue
          label="pool"
          value={lightningStatus?.pool ?? "—"}
          detail={`${lightningStatus?.maxOpenPositions ?? 0} max open`}
        />
        <MetricValue
          label="same wallet"
          value={pumpPortalWalletsStatus?.sameWallet ? "YES" : "NO"}
          detail="separate preferred"
          tone={pumpPortalWalletsStatus?.sameWallet ? "warn" : "good"}
        />
      </div>
      <div className="wallet-readiness-grid">
        <WalletReadinessBlock
          purpose="metered data streams"
          title="DATA WALLET"
          wallet={pumpPortalWalletsStatus?.dataWallet ?? null}
        />
        <WalletReadinessBlock
          purpose="future Lightning execution"
          title="TRADING WALLET"
          wallet={pumpPortalWalletsStatus?.tradingWallet ?? null}
        />
      </div>
      {pumpPortalWalletsStatus?.sameWalletWarning ? (
        <div className="inline-warning">
          {pumpPortalWalletsStatus.sameWalletWarning}
        </div>
      ) : null}
      <div className="signal-risk-strip data-wallet-warnings">
        <span>NO TRANSACTION SENT</span>
        <span>PLAN ONLY</span>
        <span>NO EXECUTE BUTTON</span>
        <span>NO PRIVATE KEY FIELD</span>
        <span>NO API KEY FIELD</span>
        <span>FUND SMALL AMOUNTS ONLY</span>
      </div>
      <ReasonBlock
        title="Wallet Reasons"
        codes={pumpPortalWalletsStatus?.reasonCodes}
      />
      <ReasonBlock
        title="Lightning Reasons"
        codes={lightningStatus?.reasonCodes}
      />
    </div>
  );
}

function WalletReadinessBlock({
  purpose,
  title,
  wallet
}: {
  purpose: string;
  title: string;
  wallet: PumpPortalWalletSummary | null;
}) {
  const publicKey = wallet?.publicKey ?? null;

  return (
    <div className="wallet-readiness-block">
      <div className="table-heading">
        <h3>{title}</h3>
        <span className="table-meta">{purpose}</span>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="status"
          value={(wallet?.balanceStatus ?? "unknown").toUpperCase()}
          detail={wallet?.configured ? "configured" : "not ready"}
          tone={getDataWalletTone(wallet?.balanceStatus)}
        />
        <MetricValue
          label="api key"
          value={wallet?.apiKeyConfigured ? "YES" : "NO"}
          detail="backend only"
          tone={wallet?.apiKeyConfigured ? "good" : "bad"}
        />
        <MetricValue
          label="balance"
          value={formatSol(wallet?.balanceSol)}
          detail={`${formatSol(wallet?.minBalanceSol)} minimum`}
          tone={getDataWalletTone(wallet?.balanceStatus)}
        />
        <MetricValue
          label="address"
          value={wallet?.shortPublicKey ?? "—"}
          detail={wallet?.publicKeyValid ? "valid" : "missing/invalid"}
        />
      </div>
      <div className="data-wallet-address-row">
        <span className="mono">
          {publicKey ?? `${title} public key missing`}
        </span>
        <button
          disabled={!publicKey}
          onClick={() => copyPublicKey(publicKey)}
          type="button"
        >
          COPY ADDRESS
        </button>
      </div>
      <ReasonBlock title={`${title} Reasons`} codes={wallet?.reasonCodes} />
    </div>
  );
}

function StorageTab({
  chainVerifications,
  liveEvents,
  storageStats
}: {
  chainVerifications: ChainVerificationRow[];
  liveEvents: LiveEventRow[];
  storageStats: StorageStats | null;
}) {
  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>Debug</h2>
          <p>
            Persisted counts, live feed rows, and read-only chain verification
            rows.
          </p>
        </div>
      </div>
      <div className="debug-grid">
        {Object.entries(storageStats ?? {}).map(([key, value]) => (
          <div className="debug-row" key={key}>
            <span>{key}</span>
            <strong>{String(value ?? "—")}</strong>
          </div>
        ))}
      </div>
      <TableShell
        empty="No live feed events"
        headers={["Mint", "Type", "Real", "Created", "Reasons"]}
        rows={liveEvents.map((event) => [
          event.symbol ?? formatMintShort(event.mint),
          event.eventType,
          event.realData ? "REAL" : "MOCK",
          formatTime(event.createdAt),
          <ReasonCodes codes={event.reasonCodes} key="reasons" />
        ])}
        title="LIVE FEED EVENTS"
      />
      <TableShell
        empty="No chain verifications"
        headers={[
          "Mint",
          "Status",
          "Mint Auth",
          "Freeze",
          "Top",
          "Top10",
          "Reasons"
        ]}
        rows={chainVerifications.map((row) => [
          formatMintShort(row.mint),
          row.status,
          formatBool(row.mintAuthorityActive),
          formatBool(row.freezeAuthorityActive),
          formatPct(row.topHolderPct),
          formatPct(row.top10HolderPct),
          <ReasonCodes codes={row.reasonCodes} key="reasons" />
        ])}
        title="CHAIN VERIFICATIONS"
      />
    </section>
  );
}

function TableShell({
  empty,
  headers,
  rows,
  title
}: {
  empty: string;
  headers: string[];
  rows: Array<Array<ReactNode>>;
  title?: string;
}) {
  return (
    <div className="table-region">
      {title ? (
        <div className="table-heading">
          <h3>{title}</h3>
          <span className="table-meta">{rows.length} rows</span>
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td
                className="empty-state compact-empty"
                colSpan={headers.length}
              >
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  detail,
  label,
  value
}: {
  detail?: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="card-stat">
      <span>{label}</span>
      <strong>{formatUnknown(value)}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function TokenName({ card }: { card: LiveTokenCardViewModel }) {
  return (
    <span className="token-cell" title={card.mint}>
      <span className="token-title">{card.displayName}</span>
      <span className="token-mint mono">{card.shortMint}</span>
    </span>
  );
}

function DriverList({
  drivers
}: {
  drivers: LiveTokenCardViewModel["strategy"]["positiveDrivers"];
}) {
  if (drivers.length === 0) {
    return <span className="muted">—</span>;
  }

  return (
    <span className="driver-list">
      {drivers.slice(0, 3).map((driver) => (
        <span
          className="driver-code"
          key={`${driver.reasonCode}-${driver.label}`}
        >
          {driver.label}
        </span>
      ))}
      {drivers.length > 3 ? (
        <span className="driver-code">+{drivers.length - 3}</span>
      ) : null}
    </span>
  );
}

function ReasonBlock({
  codes,
  title
}: {
  codes: string[] | undefined;
  title: string;
}) {
  return (
    <div className="reason-block">
      <h3>{title}</h3>
      <ReasonCodes codes={codes} limit={10} />
    </div>
  );
}

function filterRows(
  rows: MomentumScannerRow[],
  options: {
    actionFilter: ActionFilter;
    hideUnavailableHeavy: boolean;
    realOnly: boolean;
    search: string;
    showMigrated: boolean;
    trackedOnly: boolean;
  }
): MomentumScannerRow[] {
  const query = options.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (options.realOnly && !row.realData) {
      return false;
    }

    if (options.trackedOnly && row.trackingState !== "tracking") {
      return false;
    }

    if (!options.showMigrated && row.migrationStatus === "migrated") {
      return false;
    }

    if (
      options.hideUnavailableHeavy &&
      row.unavailableFields.length + row.missingCriticalFields.length >= 8
    ) {
      return false;
    }

    if (query.length > 0) {
      const haystack = [
        row.mint,
        row.name ?? "",
        row.symbol ?? "",
        row.title,
        row.displayName
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    if (
      options.actionFilter === "discovery" ||
      options.actionFilter === "discoveryOnly"
    ) {
      return row.dataQualityLabel === "discovery_only";
    }

    if (options.actionFilter === "watch") {
      return (
        row.signalAction.includes("WATCH") || row.launchPhase === "watching"
      );
    }

    if (options.actionFilter === "hot") {
      return row.launchPhase === "hot";
    }

    if (options.actionFilter === "ripping") {
      return row.launchPhase === "ripping";
    }

    if (options.actionFilter === "rejected") {
      return (
        row.hardReject ||
        row.signalStrength === "reject" ||
        row.launchPhase === "rejected"
      );
    }

    if (options.actionFilter === "tradeTracked") {
      return row.trackingState === "tracking" || row.realTradeEventCount > 0;
    }

    if (options.actionFilter === "priceActionReady") {
      return (
        row.dataQualityLabel === "price_action_ready" ||
        row.sparkline.direction !== "unavailable"
      );
    }

    if (options.actionFilter === "curvePrice") {
      return row.curve.curvePriceSol !== null;
    }

    if (options.actionFilter === "migrated") {
      return row.migrationStatus === "migrated";
    }

    if (options.actionFilter === "paperPosition") {
      return row.hasPaperPosition;
    }

    if (options.actionFilter === "missingData") {
      return (
        row.unavailableFields.length > 0 ||
        row.dataQuality.missingCriticalCount > 0
      );
    }

    if (options.actionFilter === "missingCritical") {
      return row.missingCriticalFields.length > 0;
    }

    return true;
  });
}

function sortRows(
  rows: MomentumScannerRow[],
  sortMode: SortMode
): MomentumScannerRow[] {
  const riskWeight: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    unknown: 2,
    low: 1
  };

  return [...rows].sort((left, right) => {
    if (sortMode === "launchScore") {
      return (
        right.launchScore - left.launchScore ||
        parseRowTime(right.latestEventAt) - parseRowTime(left.latestEventAt)
      );
    }

    if (sortMode === "volumeVelocity") {
      return (
        (right.volumeVelocitySolPerSec ?? -1) -
        (left.volumeVelocitySolPerSec ?? -1)
      );
    }

    if (sortMode === "marketCap") {
      return (
        (right.marketCapUsd ?? right.marketCapSol ?? -1) -
        (left.marketCapUsd ?? left.marketCapSol ?? -1)
      );
    }

    if (sortMode === "liquidity") {
      return (
        (right.liquidityUsd ?? right.curve.curveLiquiditySol ?? -1) -
        (left.liquidityUsd ?? left.curve.curveLiquiditySol ?? -1)
      );
    }

    if (sortMode === "curveLiquidity") {
      return (
        (right.curve.curveLiquiditySol ?? -1) -
        (left.curve.curveLiquiditySol ?? -1)
      );
    }

    if (sortMode === "volume10s") {
      return (
        (right.volume10sSol ?? right.volume10sUsd ?? -1) -
        (left.volume10sSol ?? left.volume10sUsd ?? -1)
      );
    }

    if (sortMode === "txns10s") {
      return (right.tradeCount10s ?? -1) - (left.tradeCount10s ?? -1);
    }

    if (sortMode === "priceChange") {
      return (
        (right.sparkline.priceChangePct ?? -1) -
        (left.sparkline.priceChangePct ?? -1)
      );
    }

    if (sortMode === "priceVelocity") {
      return (
        (right.priceVelocityPctPerSec ?? -1) -
        (left.priceVelocityPctPerSec ?? -1)
      );
    }

    if (sortMode === "uniqueBuyers") {
      return (right.uniqueBuyers10s ?? -1) - (left.uniqueBuyers10s ?? -1);
    }

    if (sortMode === "buySellRatio") {
      return (right.buySellRatio ?? -1) - (left.buySellRatio ?? -1);
    }

    if (sortMode === "signalStrength") {
      return (
        signalStrengthWeight(right.signalStrength) -
        signalStrengthWeight(left.signalStrength)
      );
    }

    if (sortMode === "risk") {
      return (
        (riskWeight[right.riskLevel] ?? 0) - (riskWeight[left.riskLevel] ?? 0)
      );
    }

    if (sortMode === "pnl") {
      return (
        (right.unrealizedPnlPct ?? Number.NEGATIVE_INFINITY) -
        (left.unrealizedPnlPct ?? Number.NEGATIVE_INFINITY)
      );
    }

    return parseRowTime(right.latestEventAt) - parseRowTime(left.latestEventAt);
  });
}

function parseRowTime(timestamp: string | null): number {
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function signalStrengthWeight(value: string): number {
  const normalized = value.toLowerCase();

  if (normalized.includes("ripping") || normalized.includes("strong")) {
    return 5;
  }

  if (normalized.includes("hot") || normalized.includes("medium")) {
    return 4;
  }

  if (normalized.includes("watch") || normalized.includes("weak")) {
    return 3;
  }

  if (normalized.includes("reject")) {
    return 1;
  }

  return 2;
}

function upsertSignal(
  currentSignals: OverlaySignal[],
  nextSignal: OverlaySignal
): OverlaySignal[] {
  const withoutNext = currentSignals.filter(
    (signal) => signal.mint !== nextSignal.mint
  );

  return [nextSignal, ...withoutNext].slice(0, 100);
}

function getLiveConnectionLabel(
  feedStatus: FeedStatus | null,
  healthStatus: HealthStatus | null
): string {
  if (feedStatus?.connected || healthStatus?.liveFeedConnected) {
    return "CONNECTED";
  }

  if (feedStatus?.connecting) {
    return "CONNECTING";
  }

  return "OFFLINE";
}

function getLiveConnectionTone(
  feedStatus: FeedStatus | null,
  healthStatus: HealthStatus | null
): "online" | "offline" | "warning" | "neutral" {
  if (feedStatus?.connected || healthStatus?.liveFeedConnected) {
    return "online";
  }

  if (feedStatus?.connecting) {
    return "warning";
  }

  return "offline";
}

function getLiveEmptyState(
  feedStatus: FeedStatus | null,
  liveStatus: LiveStatus | null,
  healthStatus: HealthStatus | null
): string {
  if (healthStatus?.mockFeedEnabled) {
    return "MOCK MODE EXPLICITLY ENABLED";
  }

  if ((feedStatus?.mode ?? healthStatus?.dataFeedMode) === "none") {
    return "NO LIVE FEED CONFIGURED";
  }

  if (feedStatus?.connecting) {
    return "WAITING FOR PUMPPORTAL LIVE TOKENS";
  }

  if (feedStatus?.connected && (liveStatus?.liveTokenCount ?? 0) === 0) {
    return "LIVE FEED CONNECTED - NO TOKENS YET";
  }

  return feedStatus?.connected ? "LIVE FEED CONNECTED" : "LIVE FEED OFFLINE";
}

function activateTab(tab: TabId, setActiveTab: (tab: TabId) => void): void {
  setActiveTab(tab);
  window.location.hash = tab;
}

function getInitialTab(): TabId {
  const hash = window.location.hash.replace("#", "");
  return tabs.some((tab) => tab.id === hash) ? (hash as TabId) : "scanner";
}

function formatDataQuality(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}

function getRuntimeLiveLabel(status: RuntimeControlStatus | null): string {
  if (status?.liveDiscovery.connected) {
    return "CONNECTED";
  }

  if (status?.liveDiscovery.connecting) {
    return "CONNECTING";
  }

  if (status?.liveDiscovery.lastError) {
    return "ERROR";
  }

  return "STOPPED";
}

function getRuntimeMeteredLabel(status: RuntimeControlStatus | null): string {
  if (status?.meteredLaunchData.active) {
    return "ACTIVE";
  }

  if (status?.meteredLaunchData.blocked) {
    return "BLOCKED";
  }

  return "STOPPED";
}

function getMeteredRuntimeBlockers(
  status: RuntimeControlStatus | null
): string[] {
  const codes = status?.meteredLaunchData.reasonCodes ?? [];
  const blockers: string[] = [];

  if (codes.some((code) => code.includes("ACK"))) {
    blockers.push("ACK missing");
  }

  if (codes.some((code) => code.includes("API_KEY"))) {
    blockers.push("API key missing");
  }

  if (codes.some((code) => code.includes("WALLET"))) {
    blockers.push("wallet missing");
  }

  if (codes.some((code) => code.includes("BALANCE"))) {
    blockers.push("wallet low");
  }

  if (codes.some((code) => code.includes("BUDGET") || code.includes("CAP"))) {
    blockers.push("budget reached");
  }

  if (codes.some((code) => code.includes("OFFLINE"))) {
    blockers.push("live discovery offline");
  }

  return Array.from(new Set(blockers));
}

function getDataWalletTone(
  balanceStatus: string | null | undefined
): "good" | "bad" | "warn" | "neutral" {
  if (balanceStatus === "ok") {
    return "good";
  }

  if (
    balanceStatus === "critical" ||
    balanceStatus === "missing_config" ||
    balanceStatus === "missing"
  ) {
    return "bad";
  }

  if (balanceStatus === "low" || balanceStatus === "unknown") {
    return "warn";
  }

  return "neutral";
}

function getPnlTone(
  value: number | null | undefined
): "good" | "bad" | "warn" | "neutral" {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return "neutral";
  }

  return value > 0 ? "good" : "bad";
}

function copyPublicKey(publicKey: string | null): void {
  if (!publicKey || !navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(publicKey);
}

function formatBool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return value ? "yes" : "no";
}

function formatUsdOrSol(
  usdValue: number | null | undefined,
  solValue: number | null | undefined
): string {
  const usd = formatUsd(usdValue);

  if (usd !== "—") {
    return usd;
  }

  return formatSol(solValue);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: {
            "content-type": "application/json"
          }
        })
  });
  const payload = (await response.json()) as T;

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `POST ${path} failed with ${response.status}`;

    throw new Error(message);
  }

  return payload;
}
