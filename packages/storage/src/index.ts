import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { cwd } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { FeedEvent, TokenTradeEvent } from "@axi/data-feeds";
import type { PaperExitPolicyEvaluation } from "@axi/exit-strategy";
import type {
  ChainTransactionEvent,
  NormalizedChainTradeEvent
} from "@axi/chain-events";
import type { MarketObservation } from "@axi/market-data";
import type {
  PaperLifecycleValidationReport,
  PaperLifecycleValidationStatus
} from "@axi/paper-lifecycle-validation";
import type {
  PaperAutomationDeployment,
  PaperAutomationDeploymentStatus,
  PaperAutomationEvent,
  PaperAutomationEventKind,
  PaperAutomationOperation,
  PaperAutomationOperationKind,
  PaperAutomationOperationStatus
} from "@axi/paper-automation";
import type {
  PaperOperationsAlert,
  PaperOperationsAlertSeverity,
  PaperOperationsSession,
  PaperOperationsSessionStatus,
  PaperOperationsSnapshot,
  PaperOperationsSnapshotKind
} from "@axi/paper-operations";
import type {
  PaperForwardEvaluationReport,
  PaperForwardEvaluationStatus
} from "@axi/paper-forward-evaluation";
import type {
  CandidateWatchPlan,
  WatchTarget,
  WatchTargetKind
} from "@axi/watch-orchestrator";
import type {
  PaperFillStatus,
  PaperOrderSide as PortfolioOrderSide,
  PaperOrderSource,
  PaperOrderType,
  PaperPositionStatus,
  PaperRiskLevel
} from "@axi/paper-portfolio";
import type {
  PaperStrategyEvaluationReport,
  PaperStrategyEvaluationStatus
} from "@axi/paper-strategy-evaluation";
import type {
  CalibrationCaptureSession,
  CapturedObservationStatus,
  CapturedSignalObservation
} from "@axi/session-capture";
import type {
  TokenIdentity,
  TokenIdentityConfidence,
  TokenIdentityDataSource,
  TokenIdentitySource
} from "@axi/token-identity";
import {
  CandidateDecisionSchema,
  ChainVerificationStatusSchema,
  DiscoveryCoverageConnectionEventSchema,
  DiscoveryCoverageEventSchema,
  DiscoveryCoverageSessionSchema,
  TradeDataCoverageEventSchema,
  TradeDataCoverageSessionSchema,
  TradeDataSubscriptionEventSchema,
  type ChainVerificationStatus,
  type DiscoveryCoverageConnectionEvent,
  type DiscoveryCoverageEvent,
  type DiscoveryCoverageEventQuery,
  type DiscoveryCoverageSession,
  type TradeDataCoverageEvent,
  type TradeDataCoverageEventQuery,
  type TradeDataCoverageSession,
  type TradeDataSubscriptionEvent,
  type TradeDataSubscriptionEventQuery,
  OverlaySignalSchema,
  RiskSnapshotSchema,
  type CandidateDecision,
  type OverlaySignal,
  type RiskLevel,
  type RiskSnapshot,
  type SignalAction
} from "@axi/shared";

export const defaultDatabaseRelativePath = ".data/axi.sqlite";

export type StorageOptions = {
  databasePath?: string;
};

export type StorageHandle = {
  databasePath: string;
};

export type StoredFeedEvent = {
  id: number;
  eventType: string;
  mint: string;
  payload: FeedEvent;
  createdAt: string;
};

export type StoredSignal = {
  id: number;
  mint: string;
  symbol: string;
  action: SignalAction;
  score: number;
  hardReject: boolean;
  reasonCodes: string[];
  payload: OverlaySignal;
  createdAt: string;
};

export type ReplaySource =
  | "actual_data_sessions"
  | "actual_data_subscriptions"
  | "candidate_decisions"
  | "chain_transaction_events"
  | "chain_trade_events"
  | "feed_events"
  | "market_observations"
  | "pumpportal_token_trade_events"
  | "launch_timeseries_buckets"
  | "token_identities"
  | "token_metadata_fetches"
  | "watch_actions"
  | "watch_plans"
  | "chain_verifications"
  | "risk_snapshots"
  | "signals";

export type ReplayItem = {
  createdAt: string;
  payload: unknown;
  sequence: number;
  source: ReplaySource;
};

export type PaperOrderSide = "buy" | "sell";
export type PaperOrderStatus = "accepted" | "rejected";

export type PaperOrderInput = {
  mint: string;
  symbol: string;
  side: PaperOrderSide;
  status: PaperOrderStatus;
  sizeSol: number;
  simulatedPrice: number;
  reasonCodes: string[];
  signalId?: number | null;
  payload: unknown;
  createdAt?: string;
};

export type StoredPaperOrder = Omit<
  PaperOrderInput,
  "createdAt" | "signalId"
> & {
  id: number;
  signalId: number | null;
  createdAt: string;
};

export type PaperPositionInput = {
  mint: string;
  symbol: string;
  sizeSol: number;
  tokenAmount: number;
  entryPrice: number;
  status: "open" | "closed";
  payload: unknown;
  openedAt?: string;
  updatedAt?: string;
};

export type StoredPaperPosition = PaperPositionInput & {
  id: number;
  openedAt: string;
  updatedAt: string;
};

export type PaperPortfolioOrderInput = {
  orderId: string;
  type: PaperOrderType;
  side: PortfolioOrderSide;
  mint: string;
  symbol?: string | null;
  title?: string | null;
  source: PaperOrderSource;
  requestedSizeSol?: number | null;
  requestedSellPct?: number | null;
  signalScore?: number | null;
  riskLevel?: PaperRiskLevel | null;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredPaperPortfolioOrder = Omit<
  PaperPortfolioOrderInput,
  "createdAt"
> & {
  id: number;
  symbol: string | null;
  title: string | null;
  requestedSizeSol: number | null;
  requestedSellPct: number | null;
  signalScore: number | null;
  riskLevel: PaperRiskLevel | null;
  createdAt: string;
};

export type PaperPortfolioFillInput = {
  fillId: string;
  orderId: string;
  side: PortfolioOrderSide;
  mint: string;
  priceSol: number;
  effectivePriceSol: number;
  sizeSol: number;
  tokenAmount: number;
  feeSol: number;
  slippageSol: number;
  fillStatus: PaperFillStatus;
  rejectionReason?: string | null;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredPaperPortfolioFill = Omit<
  PaperPortfolioFillInput,
  "createdAt"
> & {
  id: number;
  rejectionReason: string | null;
  createdAt: string;
};

export type PaperPortfolioPositionInput = {
  positionId: string;
  mint: string;
  symbol?: string | null;
  title?: string | null;
  status: PaperPositionStatus;
  entryPriceSol: number;
  averageEntryPriceSol: number;
  currentPriceSol?: number | null;
  sizeSol: number;
  remainingSizeSol: number;
  tokenAmount: number;
  remainingTokenAmount: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  realizedPnlPct: number;
  unrealizedPnlPct: number;
  totalFeesSol: number;
  payload: unknown;
  openedAt: string;
  updatedAt: string;
  closedAt?: string | null;
  createdAt?: string;
};

export type StoredPaperPortfolioPosition = Omit<
  PaperPortfolioPositionInput,
  "createdAt"
> & {
  id: number;
  symbol: string | null;
  title: string | null;
  currentPriceSol: number | null;
  closedAt: string | null;
  createdAt: string;
};

export type PaperPortfolioSnapshotInput = {
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
  payload: unknown;
  createdAt?: string;
};

export type StoredPaperPortfolioSnapshot = Omit<
  PaperPortfolioSnapshotInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
};

export type StorageStats = {
  databasePath: string;
  feedEventCount: number;
  liveFeedEventCount: number;
  launchCandidateCount: number;
  launchScoreSnapshotCount: number;
  launchTradeSampleCount: number;
  launchTimeseriesBucketCount: number;
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
  runtimeSessionCount: number;
  operatorActionCount: number;
  capacitySnapshotCount: number;
  calibrationCaptureSessionCount: number;
  calibrationSignalObservationCount: number;
  paperStrategyEvaluationCount: number;
  paperLifecycleValidationCount: number;
  paperAutomationDeploymentCount: number;
  paperAutomationEventCount: number;
  paperAutomationOperationCount: number;
  paperOperationsSessionCount: number;
  paperOperationsSnapshotCount: number;
  paperOperationsAlertCount: number;
  paperForwardEvaluationCount: number;
  paperExitPolicyEvaluationCount: number;
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
  discoveryCoverageSessionCount: number;
  discoveryCoverageEventCount: number;
  discoveryCoverageConnectionEventCount: number;
  tradeDataCoverageSessionCount: number;
  tradeDataCoverageEventCount: number;
  tradeDataCoverageSubscriptionEventCount: number;
  lastSignalAt: string | null;
};

export type StoredCalibrationCaptureSession = CalibrationCaptureSession & {
  id: number;
};

export type StoredCapturedSignalObservation = CapturedSignalObservation & {
  id: number;
};

export type CalibrationCaptureObservationCounts = {
  observationCount: number;
  completedCount: number;
  pendingCount: number;
  unavailableCount: number;
};

export type StoredPaperStrategyEvaluation = PaperStrategyEvaluationReport & {
  id: number;
};

export type StoredPaperLifecycleValidation = PaperLifecycleValidationReport & {
  id: number;
};

export type StoredPaperAutomationDeployment = PaperAutomationDeployment & {
  id: number;
};

export type StoredPaperAutomationEvent = PaperAutomationEvent & {
  id: number;
};

export type StoredPaperAutomationOperation = PaperAutomationOperation & {
  id: number;
};

export type StoredPaperOperationsSession = PaperOperationsSession & {
  id: number;
};

export type StoredPaperOperationsSnapshot = PaperOperationsSnapshot & {
  id: number;
};

export type StoredPaperOperationsAlert = PaperOperationsAlert & {
  id: number;
};

export type StoredPaperForwardEvaluation = PaperForwardEvaluationReport & {
  id: number;
};

export type StoredPaperExitPolicyEvaluation = PaperExitPolicyEvaluation & {
  id: number;
};

export type LightningTradePlanStorageInput = {
  planId: string;
  mint: string;
  action: "buy" | "sell";
  amountSol: number;
  mode: string;
  blocked: boolean;
  blockers: string[];
  warnings: string[];
  request: unknown;
  payload: unknown;
  createdAt?: string;
};

export type StoredLightningTradePlan = Omit<
  LightningTradePlanStorageInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
};

export type RuntimeSessionInput = {
  sessionId: string;
  runtimeMode: string;
  paidDataArmed: boolean;
  startedAt: string;
  stoppedAt?: string | null;
  stopReason?: string | null;
  configFingerprint: string;
  createdAt?: string;
};

export type StoredRuntimeSession = Omit<
  RuntimeSessionInput,
  "createdAt" | "stoppedAt" | "stopReason"
> & {
  id: number;
  stoppedAt: string | null;
  stopReason: string | null;
  createdAt: string;
};

export type OperatorActionOutcome = "succeeded" | "blocked" | "failed";

export type OperatorActionInput = {
  actionId: string;
  action: string;
  target: string;
  safeParameters?: Record<string, unknown>;
  outcome: OperatorActionOutcome;
  reasonCodes: string[];
  createdAt?: string;
};

export type StoredOperatorAction = Omit<
  OperatorActionInput,
  "createdAt" | "safeParameters"
> & {
  id: number;
  safeParameters: Record<string, unknown>;
  createdAt: string;
};

export type CapacitySnapshotInput = {
  snapshotId: string;
  runtimeSessionId: string;
  observationWindowMs: number;
  launchCount: number;
  launchRatePerMinute: number;
  trackedMintCount: number;
  protectedMintCount: number;
  requiredInitialSlots: number;
  availableNewestSlots: number;
  initialCoverageRatio: number;
  observedEventsPerSecond: number;
  projectedHourlyEvents: number;
  projectedHourlyCostSol: number;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredCapacitySnapshot = Omit<
  CapacitySnapshotInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
};

export type PumpPortalWalletStatusSnapshotInput = {
  dataWalletPublicKey?: string | null;
  tradingWalletPublicKey?: string | null;
  sameWallet: boolean;
  dataWalletBalanceSol?: number | null;
  tradingWalletBalanceSol?: number | null;
  dataWalletStatus: string;
  tradingWalletStatus: string;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredPumpPortalWalletStatusSnapshot = Omit<
  PumpPortalWalletStatusSnapshotInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
  dataWalletPublicKey: string | null;
  tradingWalletPublicKey: string | null;
  dataWalletBalanceSol: number | null;
  tradingWalletBalanceSol: number | null;
};

export type WatchedWalletInput = {
  address: string;
  alias?: string | null;
  tags: string[];
  enabled: boolean;
  source: "manual" | "imported" | "test";
  reasonCodes: string[];
  payload?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

export type StoredWatchedWallet = Omit<
  WatchedWalletInput,
  "createdAt" | "updatedAt" | "payload"
> & {
  id: number;
  alias: string | null;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export type WatchedWalletTradeEventInput = {
  wallet: string;
  walletAlias?: string | null;
  mint: string;
  side: "buy" | "sell" | "unknown";
  priceSol?: number | null;
  volumeSol?: number | null;
  tokenAmount?: number | null;
  signature?: string | null;
  confidence: "low" | "medium" | "high";
  usableForExitStrategy: boolean;
  reasonCodes: string[];
  payload?: unknown;
  createdAt?: string;
};

export type StoredWatchedWalletTradeEvent = Omit<
  WatchedWalletTradeEventInput,
  "createdAt" | "payload"
> & {
  id: number;
  walletAlias: string | null;
  priceSol: number | null;
  volumeSol: number | null;
  tokenAmount: number | null;
  signature: string | null;
  payload: unknown;
  createdAt: string;
};

export type ExitRuleInput = {
  id: string;
  name: string;
  enabled: boolean;
  trigger:
    "watched_wallet_buy" | "watched_wallet_sell" | "watched_wallet_any_trade";
  minProfitPct: number;
  minProfitSol?: number | null;
  sellPct: number;
  requirePositionOpenedBeforeWalletTrade: boolean;
  allowedWalletTags?: string[];
  blockedWalletTags?: string[];
  requireCurrentPrice: boolean;
  maxPositionAgeMs?: number | null;
  cooldownMs: number;
  priority: number;
  reasonCodes: string[];
  payload?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

export type StoredExitRule = Omit<
  ExitRuleInput,
  "id" | "createdAt" | "updatedAt" | "payload"
> & {
  id: number;
  ruleId: string;
  minProfitSol: number | null;
  maxPositionAgeMs: number | null;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ExitSignalInput = {
  id: string;
  mint: string;
  wallet: string;
  walletAlias?: string | null;
  ruleId: string;
  action: "paper_sell";
  sellPct: number;
  blocked: boolean;
  blockers: string[];
  warnings: string[];
  reasonCodes: string[];
  payload?: unknown;
  createdAt?: string;
};

export type StoredExitSignal = Omit<
  ExitSignalInput,
  "id" | "createdAt" | "payload"
> & {
  id: number;
  signalId: string;
  walletAlias: string | null;
  payload: unknown;
  createdAt: string;
};

export type StoredRiskSnapshot = {
  id: number;
  mint: string;
  riskLevel: RiskLevel;
  hardReject: boolean;
  riskScore: number;
  reasonCodes: string[];
  payload: RiskSnapshot;
  createdAt: string;
};

export type StoredCandidateDecision = {
  id: number;
  mint: string;
  symbol: string;
  lifecycleState: CandidateDecision["lifecycleState"];
  action: CandidateDecision["action"];
  score: number;
  riskLevel: RiskLevel;
  hardReject: boolean;
  combinedReasonCodes: string[];
  payload: CandidateDecision;
  createdAt: string;
};

export type ChainVerificationInput = {
  mint: string;
  status: ChainVerificationStatus;
  reasonCodes: string[];
  mintAuthorityActive?: boolean | null;
  freezeAuthorityActive?: boolean | null;
  supplyUi?: number | null;
  topHolderPct?: number | null;
  top10HolderPct?: number | null;
  payload: unknown;
  inspectedAt?: string;
  createdAt?: string;
};

export type StoredChainVerification = Omit<
  ChainVerificationInput,
  "createdAt" | "inspectedAt"
> & {
  id: number;
  inspectedAt: string;
  createdAt: string;
};

export type ChainTransactionEventInput = ChainTransactionEvent;

export type StoredChainTransactionEvent = ChainTransactionEventInput & {
  id: number;
  createdAt: string;
};

export type ChainTradeEventInput = NormalizedChainTradeEvent;

export type StoredChainTradeEvent = ChainTradeEventInput & {
  id: number;
  createdAt: string;
};

export type MarketObservationInput = MarketObservation;

export type StoredMarketObservation = MarketObservationInput & {
  id: number;
  createdAt: string;
};

export type PumpPortalTokenTradeEventInput = {
  mint: string;
  signature?: string | null;
  side: TokenTradeEvent["side"];
  trader?: string | null;
  priceSol?: number | null;
  volumeSol?: number | null;
  tokenAmount?: number | null;
  confidence: NonNullable<TokenTradeEvent["confidence"]>;
  usableForMetrics: boolean;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredPumpPortalTokenTradeEvent = Omit<
  PumpPortalTokenTradeEventInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
};

export type LiveFeedEventInput = {
  sessionId: string;
  provider: string;
  eventType: string;
  mint: string;
  name?: string | null;
  symbol?: string | null;
  title?: string | null;
  realData: boolean;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredLiveFeedEvent = Omit<LiveFeedEventInput, "createdAt"> & {
  id: number;
  createdAt: string;
  name: string | null;
  symbol: string | null;
  title: string | null;
};

export type ActualDataSubscriptionInput = {
  mint: string;
  provider: string;
  status: string;
  reason: string;
  eventCount: number;
  maxEvents: number;
  subscribedAt?: string | null;
  unsubscribedAt?: string | null;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredActualDataSubscription = Omit<
  ActualDataSubscriptionInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
};

export type ActualDataSessionInput = {
  provider: string;
  status: string;
  totalEventCount: number;
  subscribedTokenCount: number;
  budgetEventLimit: number;
  startedAt?: string | null;
  stoppedAt?: string | null;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredActualDataSession = Omit<
  ActualDataSessionInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
};

export type MeteredLaunchDataSessionInput = {
  status: string;
  mode: string;
  trackedMintCount: number;
  totalEvents: number;
  estimatedCostSol: number;
  budgetReached: boolean;
  reasonCodes: string[];
  payload: unknown;
  startedAt?: string | null;
  stoppedAt?: string | null;
  createdAt?: string;
};

export type StoredMeteredLaunchDataSession = Omit<
  MeteredLaunchDataSessionInput,
  "createdAt" | "startedAt" | "stoppedAt"
> & {
  id: number;
  createdAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
};

export type MeteredLaunchDataSubscriptionInput = {
  mint: string;
  status: string;
  reason: string;
  eventCount: number;
  estimatedCostSol: number;
  subscribedAt?: string | null;
  unsubscribedAt?: string | null;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredMeteredLaunchDataSubscription = Omit<
  MeteredLaunchDataSubscriptionInput,
  "createdAt" | "subscribedAt" | "unsubscribedAt"
> & {
  id: number;
  createdAt: string;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
};

export type MeteredLaunchDataEventInput = {
  mint: string;
  signature?: string | null;
  side: TokenTradeEvent["side"];
  trader?: string | null;
  priceSol?: number | null;
  volumeSol?: number | null;
  tokenAmount?: number | null;
  usableForMetrics: boolean;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredMeteredLaunchDataEvent = Omit<
  MeteredLaunchDataEventInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
};

export type LaunchCandidateInput = {
  mint: string;
  source: string;
  eventType: string;
  name?: string | null;
  symbol?: string | null;
  title?: string | null;
  status: string;
  reasonCodes: string[];
  payload: unknown;
  discoveredAt?: string;
  latestEventAt?: string;
  createdAt?: string;
};

export type StoredLaunchCandidate = Omit<
  LaunchCandidateInput,
  "createdAt" | "discoveredAt" | "latestEventAt"
> & {
  id: number;
  createdAt: string;
  discoveredAt: string;
  latestEventAt: string;
  name: string | null;
  symbol: string | null;
  title: string | null;
};

export type LaunchTradeSampleInput = {
  mint: string;
  signature?: string | null;
  side: "buy" | "sell" | "unknown";
  trader?: string | null;
  priceSol?: number | null;
  volumeSol?: number | null;
  tokenAmount?: number | null;
  confidence: string;
  usableForMetrics: boolean;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredLaunchTradeSample = Omit<
  LaunchTradeSampleInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
  signature: string | null;
  trader: string | null;
  priceSol: number | null;
  volumeSol: number | null;
  tokenAmount: number | null;
};

export type LaunchTimeseriesBucketInput = {
  schemaVersion: 1;
  bucketMs: 1000;
  mint: string;
  bucketStart: string;
  bucketEnd: string;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  openSol: number | null;
  highSol: number | null;
  lowSol: number | null;
  closeSol: number | null;
  volumeSol: number;
  buyVolumeSol: number;
  sellVolumeSol: number;
  vwapSol: number | null;
  openUsd: number | null;
  highUsd: number | null;
  lowUsd: number | null;
  closeUsd: number | null;
  volumeUsd: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  vwapUsd: number | null;
  tokenVolume: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  sourceCount: number;
  sources: string[];
  confidence: "low" | "medium" | "high";
  complete: boolean;
  synthetic: boolean;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
  createdAt?: string;
  updatedAt?: string;
};

export type StoredLaunchTimeseriesBucket = Omit<
  LaunchTimeseriesBucketInput,
  "createdAt" | "updatedAt"
> & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

export type LaunchScoreSnapshotInput = {
  mint: string;
  score: number;
  label: string;
  phase: string;
  tradeSampleCount: number;
  priceSol?: number | null;
  volumeSol: number;
  reasonCodes: string[];
  payload: unknown;
  evaluatedAt?: string;
  createdAt?: string;
};

export type StoredLaunchScoreSnapshot = Omit<
  LaunchScoreSnapshotInput,
  "createdAt" | "evaluatedAt"
> & {
  id: number;
  createdAt: string;
  evaluatedAt: string;
  priceSol: number | null;
};

export type LaunchTrackingEventInput = {
  mint: string;
  action: string;
  status: string;
  reason: string;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredLaunchTrackingEvent = Omit<
  LaunchTrackingEventInput,
  "createdAt"
> & {
  id: number;
  createdAt: string;
};

export type LaunchTrackingSessionInput = {
  provider: string;
  status: string;
  trackedTokenCount: number;
  totalEventCount: number;
  estimatedCostSol?: number | null;
  budgetLimitSol: number;
  reasonCodes: string[];
  payload: unknown;
  startedAt?: string | null;
  stoppedAt?: string | null;
  createdAt?: string;
};

export type StoredLaunchTrackingSession = Omit<
  LaunchTrackingSessionInput,
  "createdAt" | "startedAt" | "stoppedAt" | "estimatedCostSol"
> & {
  id: number;
  createdAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
  estimatedCostSol: number | null;
};

export type StoredTokenIdentity = TokenIdentity & {
  id: number;
  createdAt: string;
};

export type TokenMetadataFetchInput = {
  mint: string;
  uri?: string | null;
  source: string;
  status: string;
  reasonCodes: string[];
  payload: unknown;
  fetchedAt?: string;
  createdAt?: string;
};

export type StoredTokenMetadataFetch = Omit<
  TokenMetadataFetchInput,
  "createdAt" | "fetchedAt"
> & {
  id: number;
  fetchedAt: string;
  createdAt: string;
  uri: string | null;
};

export type WatchPlanInput = CandidateWatchPlan & {
  payload?: unknown;
};

export type StoredWatchPlan = CandidateWatchPlan & {
  id: number;
  payload: unknown;
  createdAt: string;
};

export type WatchActionInput = {
  mint: string;
  action: string;
  address: string;
  addressKind: WatchTargetKind;
  status: string;
  reasonCodes: string[];
  payload: unknown;
  createdAt?: string;
};

export type StoredWatchAction = Omit<WatchActionInput, "createdAt"> & {
  id: number;
  createdAt: string;
};

type SignalRow = {
  id: number;
  mint: string;
  symbol: string;
  action: SignalAction;
  score: number;
  hard_reject: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type FeedEventRow = {
  id: number;
  event_type: string;
  mint: string;
  payload_json: string;
  created_at: string;
};

type PaperOrderRow = {
  id: number;
  mint: string;
  symbol: string;
  side: PaperOrderSide;
  status: PaperOrderStatus;
  size_sol: number;
  simulated_price: number;
  reason_codes_json: string;
  signal_id: number | null;
  payload_json: string;
  created_at: string;
};

type PaperPositionRow = {
  id: number;
  mint: string;
  symbol: string;
  size_sol: number;
  token_amount: number;
  entry_price: number;
  status: "open" | "closed";
  payload_json: string;
  opened_at: string;
  updated_at: string;
};

type PaperPortfolioOrderRow = {
  id: number;
  order_id: string;
  type: PaperOrderType;
  side: PortfolioOrderSide;
  mint: string;
  symbol: string | null;
  title: string | null;
  source: PaperOrderSource;
  requested_size_sol: number | null;
  requested_sell_pct: number | null;
  signal_score: number | null;
  risk_level: PaperRiskLevel | null;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type PaperPortfolioFillRow = {
  id: number;
  fill_id: string;
  order_id: string;
  side: PortfolioOrderSide;
  mint: string;
  price_sol: number;
  effective_price_sol: number;
  size_sol: number;
  token_amount: number;
  fee_sol: number;
  slippage_sol: number;
  fill_status: PaperFillStatus;
  rejection_reason: string | null;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type PaperPortfolioPositionRow = {
  id: number;
  position_id: string;
  mint: string;
  symbol: string | null;
  title: string | null;
  status: PaperPositionStatus;
  entry_price_sol: number;
  average_entry_price_sol: number;
  current_price_sol: number | null;
  size_sol: number;
  remaining_size_sol: number;
  token_amount: number;
  remaining_token_amount: number;
  realized_pnl_sol: number;
  unrealized_pnl_sol: number;
  realized_pnl_pct: number;
  unrealized_pnl_pct: number;
  total_fees_sol: number;
  payload_json: string;
  opened_at: string;
  updated_at: string;
  closed_at: string | null;
  created_at: string;
};

type PaperPortfolioSnapshotRow = {
  id: number;
  cash_sol: number;
  deployed_sol: number;
  equity_sol: number;
  realized_pnl_sol: number;
  unrealized_pnl_sol: number;
  total_pnl_sol: number;
  total_pnl_pct: number;
  open_position_count: number;
  closed_position_count: number;
  win_rate: number;
  max_drawdown_sol: number;
  max_drawdown_pct: number;
  total_fees_sol: number;
  total_trades: number;
  payload_json: string;
  created_at: string;
};

type RiskSnapshotRow = {
  id: number;
  mint: string;
  risk_level: RiskLevel;
  hard_reject: number;
  risk_score: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type CandidateDecisionRow = {
  id: number;
  mint: string;
  symbol: string;
  lifecycle_state: CandidateDecision["lifecycleState"];
  action: CandidateDecision["action"];
  score: number;
  risk_level: RiskLevel;
  hard_reject: number;
  combined_reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type ChainVerificationRow = {
  id: number;
  mint: string;
  status: ChainVerificationStatus;
  reason_codes_json: string;
  mint_authority_active: number | null;
  freeze_authority_active: number | null;
  supply_ui: number | null;
  top_holder_pct: number | null;
  top10_holder_pct: number | null;
  payload_json: string;
  inspected_at: string;
  created_at: string;
};

type ChainTransactionEventRow = {
  id: number;
  signature: string;
  watched_address: string;
  watched_address_kind: ChainTransactionEvent["watchedAddressKind"];
  mint: string | null;
  status: ChainTransactionEvent["status"];
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type ChainTradeEventRow = {
  id: number;
  signature: string;
  mint: string;
  side: NormalizedChainTradeEvent["side"];
  confidence: NormalizedChainTradeEvent["confidence"];
  price_usd: number | null;
  volume_usd: number | null;
  token_amount: number | null;
  watched_address: string;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type MarketObservationRow = {
  id: number;
  signature: string;
  mint: string;
  side: MarketObservation["side"];
  quote_asset: MarketObservation["quoteAsset"];
  quote_mint: string | null;
  base_token_amount: number | null;
  quote_amount: number | null;
  price_quote: number | null;
  price_sol: number | null;
  price_usd: number | null;
  volume_quote: number | null;
  volume_sol: number | null;
  volume_usd: number | null;
  confidence: MarketObservation["confidence"];
  usable_for_metrics: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type PumpPortalTokenTradeEventRow = {
  id: number;
  mint: string;
  signature: string | null;
  side: TokenTradeEvent["side"];
  trader: string | null;
  price_sol: number | null;
  volume_sol: number | null;
  token_amount: number | null;
  confidence: NonNullable<TokenTradeEvent["confidence"]>;
  usable_for_metrics: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type LiveFeedEventRow = {
  id: number;
  session_id: string;
  provider: string;
  event_type: string;
  mint: string;
  name: string | null;
  symbol: string | null;
  title: string | null;
  real_data: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type ActualDataSubscriptionRow = {
  id: number;
  mint: string;
  provider: string;
  status: string;
  reason: string;
  event_count: number;
  max_events: number;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type ActualDataSessionRow = {
  id: number;
  provider: string;
  status: string;
  total_event_count: number;
  subscribed_token_count: number;
  budget_event_limit: number;
  started_at: string | null;
  stopped_at: string | null;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type MeteredLaunchDataSessionRow = {
  id: number;
  status: string;
  mode: string;
  tracked_mint_count: number;
  total_events: number;
  estimated_cost_sol: number;
  budget_reached: number;
  reason_codes_json: string;
  payload_json: string;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
};

type MeteredLaunchDataSubscriptionRow = {
  id: number;
  mint: string;
  status: string;
  reason: string;
  event_count: number;
  estimated_cost_sol: number;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type MeteredLaunchDataEventRow = {
  id: number;
  mint: string;
  signature: string | null;
  side: TokenTradeEvent["side"];
  trader: string | null;
  price_sol: number | null;
  volume_sol: number | null;
  token_amount: number | null;
  usable_for_metrics: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type LaunchCandidateRow = {
  id: number;
  mint: string;
  source: string;
  event_type: string;
  name: string | null;
  symbol: string | null;
  title: string | null;
  status: string;
  reason_codes_json: string;
  payload_json: string;
  discovered_at: string;
  latest_event_at: string;
  created_at: string;
};

type LaunchTradeSampleRow = {
  id: number;
  mint: string;
  signature: string | null;
  side: "buy" | "sell" | "unknown";
  trader: string | null;
  price_sol: number | null;
  volume_sol: number | null;
  token_amount: number | null;
  confidence: string;
  usable_for_metrics: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type LaunchTimeseriesBucketRow = {
  id: number;
  mint: string;
  bucket_start: string;
  bucket_end: string;
  trade_count: number;
  volume_sol: number;
  volume_usd: number;
  close_sol: number | null;
  close_usd: number | null;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

type LaunchScoreSnapshotRow = {
  id: number;
  mint: string;
  score: number;
  label: string;
  phase: string;
  trade_sample_count: number;
  price_sol: number | null;
  volume_sol: number;
  reason_codes_json: string;
  payload_json: string;
  evaluated_at: string;
  created_at: string;
};

type LaunchTrackingEventRow = {
  id: number;
  mint: string;
  action: string;
  status: string;
  reason: string;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type LaunchTrackingSessionRow = {
  id: number;
  provider: string;
  status: string;
  tracked_token_count: number;
  total_event_count: number;
  estimated_cost_sol: number | null;
  budget_limit_sol: number;
  reason_codes_json: string;
  payload_json: string;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
};

type TokenIdentityRow = {
  id: number;
  mint: string;
  name: string | null;
  symbol: string | null;
  title: string;
  display_name: string;
  metadata_uri: string | null;
  image_uri: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  creator: string | null;
  confidence: TokenIdentityConfidence;
  completeness_score: number;
  real_data: number;
  data_source: TokenIdentityDataSource;
  reason_codes_json: string;
  sources_json: string;
  payload_json: string;
  first_seen_at: string;
  updated_at: string;
  created_at: string;
};

type TokenMetadataFetchRow = {
  id: number;
  mint: string;
  uri: string | null;
  source: string;
  status: string;
  reason_codes_json: string;
  payload_json: string;
  fetched_at: string;
  created_at: string;
};

type WatchPlanRow = {
  id: number;
  mint: string;
  symbol: string | null;
  source: string | null;
  should_verify_mint: number;
  should_watch_events: number;
  watch_targets_json: string;
  skipped_targets_json: string;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type WatchActionRow = {
  id: number;
  mint: string;
  action: string;
  address: string;
  address_kind: WatchTargetKind;
  status: string;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type LightningTradePlanRow = {
  id: number;
  plan_id: string;
  mint: string;
  action: "buy" | "sell";
  amount_sol: number;
  mode: string;
  blocked: number;
  blockers_json: string;
  warnings_json: string;
  request_json: string;
  payload_json: string;
  created_at: string;
};

type RuntimeSessionRow = {
  id: number;
  session_id: string;
  runtime_mode: string;
  paid_data_armed: number;
  started_at: string;
  stopped_at: string | null;
  stop_reason: string | null;
  config_fingerprint: string;
  created_at: string;
};

type CalibrationCaptureSessionRow = {
  id: number;
  session_id: string;
  runtime_session_id: string;
  strategy_version: string;
  partition: string;
  status: string;
  started_at: string;
  stopped_at: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

type CalibrationSignalObservationRow = {
  id: number;
  observation_id: string;
  capture_session_id: string;
  runtime_session_id: string;
  mint: string;
  strategy_version: string;
  partition: string;
  source_snapshot_id: number;
  signal_at: string;
  score: number;
  status: CapturedObservationStatus;
  outcome_at: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

type PaperStrategyEvaluationRow = {
  id: number;
  evaluation_id: string;
  evaluation_version: string;
  strategy_version: string;
  status: PaperStrategyEvaluationStatus;
  selected_threshold: number | null;
  capture_session_ids_json: string;
  payload_json: string;
  evaluated_at: string;
  created_at: string;
};

type PaperLifecycleValidationRow = {
  id: number;
  validation_id: string;
  validation_version: string;
  strategy_evaluation_id: string;
  status: PaperLifecycleValidationStatus;
  selected_threshold: number;
  capture_session_ids_json: string;
  payload_json: string;
  evaluated_at: string;
  created_at: string;
};

type PaperAutomationDeploymentRow = {
  id: number;
  deployment_id: string;
  automation_version: string;
  validation_id: string;
  status: PaperAutomationDeploymentStatus;
  selected_threshold: number;
  payload_json: string;
  approved_at: string;
  updated_at: string;
};

type PaperAutomationEventRow = {
  id: number;
  event_id: string;
  deployment_id: string;
  operation_id: string | null;
  kind: PaperAutomationEventKind;
  mint: string | null;
  payload_json: string;
  observed_at: string;
  created_at: string;
};

type PaperAutomationOperationRow = {
  id: number;
  operation_id: string;
  deployment_id: string;
  kind: PaperAutomationOperationKind;
  status: PaperAutomationOperationStatus;
  mint: string;
  execute_after: string;
  expires_at: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

type PaperOperationsSessionRow = {
  id: number;
  session_id: string;
  deployment_id: string;
  runtime_session_id: string;
  status: PaperOperationsSessionStatus;
  payload_json: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
};

type PaperOperationsSnapshotRow = {
  id: number;
  sample_id: string;
  session_id: string;
  kind: PaperOperationsSnapshotKind;
  payload_json: string;
  observed_at: string;
  created_at: string;
};

type PaperOperationsAlertRow = {
  id: number;
  alert_id: string;
  session_id: string;
  sample_id: string;
  severity: PaperOperationsAlertSeverity;
  code: string;
  payload_json: string;
  observed_at: string;
  created_at: string;
};

type PaperForwardEvaluationRow = {
  id: number;
  evaluation_id: string;
  deployment_id: string;
  status: PaperForwardEvaluationStatus;
  payload_json: string;
  evaluated_at: string;
  created_at: string;
};

type PaperExitPolicyEvaluationRow = {
  id: number;
  evaluation_id: string;
  policy_version: string;
  mint: string;
  status: PaperExitPolicyEvaluation["evaluationStatus"];
  selected_rule_id: string | null;
  payload_json: string;
  evaluated_at: string;
  created_at: string;
};

type OperatorActionRow = {
  id: number;
  action_id: string;
  action: string;
  target: string;
  safe_parameters_json: string;
  outcome: OperatorActionOutcome;
  reason_codes_json: string;
  created_at: string;
};

type CapacitySnapshotRow = {
  id: number;
  snapshot_id: string;
  runtime_session_id: string;
  observation_window_ms: number;
  launch_count: number;
  launch_rate_per_minute: number;
  tracked_mint_count: number;
  protected_mint_count: number;
  required_initial_slots: number;
  available_newest_slots: number;
  initial_coverage_ratio: number;
  observed_events_per_second: number;
  projected_hourly_events: number;
  projected_hourly_cost_sol: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type PumpPortalWalletStatusSnapshotRow = {
  id: number;
  data_wallet_public_key: string | null;
  trading_wallet_public_key: string | null;
  same_wallet: number;
  data_wallet_balance_sol: number | null;
  trading_wallet_balance_sol: number | null;
  data_wallet_status: string;
  trading_wallet_status: string;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type WatchedWalletRow = {
  id: number;
  address: string;
  alias: string | null;
  tags_json: string;
  enabled: number;
  source: WatchedWalletInput["source"];
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

type WatchedWalletTradeEventRow = {
  id: number;
  wallet: string;
  wallet_alias: string | null;
  mint: string;
  side: WatchedWalletTradeEventInput["side"];
  price_sol: number | null;
  volume_sol: number | null;
  token_amount: number | null;
  signature: string | null;
  confidence: WatchedWalletTradeEventInput["confidence"];
  usable_for_exit_strategy: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type ExitRuleRow = {
  id: number;
  rule_id: string;
  name: string;
  enabled: number;
  trigger: ExitRuleInput["trigger"];
  min_profit_pct: number;
  min_profit_sol: number | null;
  sell_pct: number;
  require_position_opened_before_wallet_trade: number;
  max_position_age_ms: number | null;
  cooldown_ms: number;
  priority: number;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

type ExitSignalRow = {
  id: number;
  signal_id: string;
  mint: string;
  wallet: string;
  wallet_alias: string | null;
  rule_id: string;
  action: ExitSignalInput["action"];
  sell_pct: number;
  blocked: number;
  blockers_json: string;
  warnings_json: string;
  reason_codes_json: string;
  payload_json: string;
  created_at: string;
};

type CountRow = {
  count: number;
};

type LastSignalRow = {
  last_signal_at: string | null;
};

const feedEventSchema = z
  .object({
    type: z.string().min(1)
  })
  .passthrough();

const paperOrderInputSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  status: z.enum(["accepted", "rejected"]),
  sizeSol: z.number().nonnegative(),
  simulatedPrice: z.number().nonnegative(),
  reasonCodes: z.array(z.string().min(1)),
  signalId: z.number().int().positive().nullable().optional(),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const paperPositionInputSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1),
  sizeSol: z.number().nonnegative(),
  tokenAmount: z.number().nonnegative(),
  entryPrice: z.number().nonnegative(),
  status: z.enum(["open", "closed"]),
  payload: z.unknown(),
  openedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

const paperPortfolioOrderInputSchema = z.object({
  orderId: z.string().min(1),
  type: z.enum(["entry", "exit"]),
  side: z.enum(["buy", "sell"]),
  mint: z.string().min(1),
  symbol: z.string().min(1).nullable().optional(),
  title: z.string().min(1).nullable().optional(),
  source: z.enum([
    "launch_signal",
    "watched_wallet_exit",
    "take_profit",
    "stop_loss",
    "paper_exit_policy",
    "manual_paper",
    "replay"
  ]),
  requestedSizeSol: z.number().nonnegative().nullable().optional(),
  requestedSellPct: z.number().nonnegative().max(100).nullable().optional(),
  signalScore: z.number().nullable().optional(),
  riskLevel: z
    .enum(["unknown", "low", "medium", "high", "critical"])
    .nullable()
    .optional(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const paperPortfolioFillInputSchema = z.object({
  fillId: z.string().min(1),
  orderId: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  mint: z.string().min(1),
  priceSol: z.number().nonnegative(),
  effectivePriceSol: z.number().nonnegative(),
  sizeSol: z.number().nonnegative(),
  tokenAmount: z.number().nonnegative(),
  feeSol: z.number().nonnegative(),
  slippageSol: z.number().nonnegative(),
  fillStatus: z.enum(["filled", "rejected", "partial"]),
  rejectionReason: z.string().min(1).nullable().optional(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const paperPortfolioPositionInputSchema = z.object({
  positionId: z.string().min(1),
  mint: z.string().min(1),
  symbol: z.string().min(1).nullable().optional(),
  title: z.string().min(1).nullable().optional(),
  status: z.enum(["open", "partially_closed", "closed"]),
  entryPriceSol: z.number().nonnegative(),
  averageEntryPriceSol: z.number().nonnegative(),
  currentPriceSol: z.number().nonnegative().nullable().optional(),
  sizeSol: z.number().nonnegative(),
  remainingSizeSol: z.number().nonnegative(),
  tokenAmount: z.number().nonnegative(),
  remainingTokenAmount: z.number().nonnegative(),
  realizedPnlSol: z.number(),
  unrealizedPnlSol: z.number(),
  realizedPnlPct: z.number(),
  unrealizedPnlPct: z.number(),
  totalFeesSol: z.number().nonnegative(),
  payload: z.unknown(),
  openedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime().optional()
});

const paperPortfolioSnapshotInputSchema = z.object({
  cashSol: z.number(),
  deployedSol: z.number().nonnegative(),
  equitySol: z.number(),
  realizedPnlSol: z.number(),
  unrealizedPnlSol: z.number(),
  totalPnlSol: z.number(),
  totalPnlPct: z.number(),
  openPositionCount: z.number().int().nonnegative(),
  closedPositionCount: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(100),
  maxDrawdownSol: z.number().nonnegative(),
  maxDrawdownPct: z.number().min(0),
  totalFeesSol: z.number().nonnegative(),
  totalTrades: z.number().int().nonnegative(),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const chainVerificationInputSchema = z.object({
  mint: z.string().min(32),
  status: ChainVerificationStatusSchema,
  reasonCodes: z.array(z.string().min(1)),
  mintAuthorityActive: z.boolean().nullable().optional(),
  freezeAuthorityActive: z.boolean().nullable().optional(),
  supplyUi: z.number().nonnegative().nullable().optional(),
  topHolderPct: z.number().min(0).max(100).nullable().optional(),
  top10HolderPct: z.number().min(0).max(100).nullable().optional(),
  payload: z.unknown(),
  inspectedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional()
});

const chainTransactionEventInputSchema = z.object({
  type: z.literal("chain_transaction"),
  source: z.literal("solana_rpc"),
  signature: z.string().min(1),
  slot: z.number().int().nonnegative().optional(),
  blockTime: z.number().int().nonnegative().nullable().optional(),
  watchedAddress: z.string().min(1),
  watchedAddressKind: z.enum([
    "mint",
    "pool",
    "bonding_curve",
    "program",
    "token_account",
    "wallet",
    "unknown"
  ]),
  mint: z.string().min(1).optional(),
  status: z.enum(["parsed", "unclassified", "errored"]),
  reasonCodes: z.array(z.string().min(1)),
  raw: z.unknown().optional(),
  receivedAt: z.string().datetime()
});

const chainTradeEventInputSchema = z.object({
  type: z.literal("trade"),
  source: z.literal("solana_rpc"),
  mint: z.string().min(1),
  symbol: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  side: z.enum(["buy", "sell", "unknown"]),
  priceUsd: z.number().nonnegative().nullable().optional(),
  volumeUsd: z.number().nonnegative().nullable().optional(),
  tokenAmount: z.number().nonnegative().nullable().optional(),
  trader: z.string().min(1).nullable().optional(),
  signature: z.string().min(1),
  slot: z.number().int().nonnegative().optional(),
  timestamp: z.string().datetime(),
  watchedAddress: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  reasonCodes: z.array(z.string().min(1)),
  raw: z.unknown().optional()
});

const marketObservationInputSchema = z.object({
  type: z.literal("market_observation"),
  source: z.literal("solana_rpc"),
  mint: z.string().min(1),
  symbol: z.string().min(1).optional(),
  signature: z.string().min(1),
  slot: z.number().int().nonnegative().optional(),
  timestamp: z.string().datetime(),
  watchedAddress: z.string().min(1).optional(),
  watchedAddressKind: z
    .enum([
      "mint",
      "pool",
      "bonding_curve",
      "program",
      "token_account",
      "wallet",
      "unknown"
    ])
    .optional(),
  perspective: z.enum(["wallet", "pool", "bonding_curve", "unknown"]),
  side: z.enum(["buy", "sell", "unknown"]),
  baseTokenAmount: z.number().nonnegative().nullable(),
  quoteAsset: z.enum(["SOL", "WSOL", "USDC", "USDT", "UNKNOWN"]),
  quoteMint: z.string().min(1).nullable(),
  quoteAmount: z.number().nonnegative().nullable(),
  priceQuote: z.number().nonnegative().nullable(),
  priceSol: z.number().nonnegative().nullable(),
  priceUsd: z.number().nonnegative().nullable(),
  volumeQuote: z.number().nonnegative().nullable(),
  volumeSol: z.number().nonnegative().nullable(),
  volumeUsd: z.number().nonnegative().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  usableForMetrics: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  raw: z.unknown().optional(),
  createdAt: z.string().datetime()
});

const pumpPortalTokenTradeEventInputSchema = z.object({
  mint: z.string().min(1),
  signature: z.string().min(1).nullable().optional(),
  side: z.enum(["buy", "sell", "unknown"]),
  trader: z.string().min(1).nullable().optional(),
  priceSol: z.number().nonnegative().nullable().optional(),
  volumeSol: z.number().nonnegative().nullable().optional(),
  tokenAmount: z.number().nonnegative().nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  usableForMetrics: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const liveFeedEventInputSchema = z.object({
  sessionId: z.string().min(1),
  provider: z.string().min(1),
  eventType: z.string().min(1),
  mint: z.string().min(1),
  name: z.string().min(1).nullable().optional(),
  symbol: z.string().min(1).nullable().optional(),
  title: z.string().min(1).nullable().optional(),
  realData: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const actualDataSubscriptionInputSchema = z.object({
  mint: z.string().min(1),
  provider: z.string().min(1),
  status: z.string().min(1),
  reason: z.string().min(1),
  eventCount: z.number().int().nonnegative(),
  maxEvents: z.number().int().nonnegative(),
  subscribedAt: z.string().datetime().nullable().optional(),
  unsubscribedAt: z.string().datetime().nullable().optional(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const actualDataSessionInputSchema = z.object({
  provider: z.string().min(1),
  status: z.string().min(1),
  totalEventCount: z.number().int().nonnegative(),
  subscribedTokenCount: z.number().int().nonnegative(),
  budgetEventLimit: z.number().int().nonnegative(),
  startedAt: z.string().datetime().nullable().optional(),
  stoppedAt: z.string().datetime().nullable().optional(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const meteredLaunchDataSessionInputSchema = z.object({
  status: z.string().min(1),
  mode: z.string().min(1),
  trackedMintCount: z.number().int().nonnegative(),
  totalEvents: z.number().int().nonnegative(),
  estimatedCostSol: z.number().nonnegative(),
  budgetReached: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  startedAt: z.string().datetime().nullable().optional(),
  stoppedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime().optional()
});

const meteredLaunchDataSubscriptionInputSchema = z.object({
  mint: z.string().min(1),
  status: z.string().min(1),
  reason: z.string().min(1),
  eventCount: z.number().int().nonnegative(),
  estimatedCostSol: z.number().nonnegative(),
  subscribedAt: z.string().datetime().nullable().optional(),
  unsubscribedAt: z.string().datetime().nullable().optional(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const meteredLaunchDataEventInputSchema = z.object({
  mint: z.string().min(1),
  signature: z.string().min(1).nullable().optional(),
  side: z.enum(["buy", "sell", "unknown"]),
  trader: z.string().min(1).nullable().optional(),
  priceSol: z.number().nonnegative().nullable().optional(),
  volumeSol: z.number().nonnegative().nullable().optional(),
  tokenAmount: z.number().nonnegative().nullable().optional(),
  usableForMetrics: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const launchCandidateInputSchema = z.object({
  mint: z.string().min(1),
  source: z.string().min(1),
  eventType: z.string().min(1),
  name: z.string().min(1).nullable().optional(),
  symbol: z.string().min(1).nullable().optional(),
  title: z.string().min(1).nullable().optional(),
  status: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  discoveredAt: z.string().datetime().optional(),
  latestEventAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional()
});

const launchTradeSampleInputSchema = z.object({
  mint: z.string().min(1),
  signature: z.string().min(1).nullable().optional(),
  side: z.enum(["buy", "sell", "unknown"]),
  trader: z.string().min(1).nullable().optional(),
  priceSol: z.number().nonnegative().nullable().optional(),
  volumeSol: z.number().nonnegative().nullable().optional(),
  tokenAmount: z.number().nonnegative().nullable().optional(),
  confidence: z.string().min(1),
  usableForMetrics: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const launchTimeseriesBucketInputSchema = z.object({
  schemaVersion: z.literal(1),
  bucketMs: z.literal(1000),
  mint: z.string().min(1),
  bucketStart: z.string().datetime(),
  bucketEnd: z.string().datetime(),
  firstTradeAt: z.string().datetime().nullable(),
  lastTradeAt: z.string().datetime().nullable(),
  openSol: z.number().positive().nullable(),
  highSol: z.number().positive().nullable(),
  lowSol: z.number().positive().nullable(),
  closeSol: z.number().positive().nullable(),
  volumeSol: z.number().nonnegative(),
  buyVolumeSol: z.number().nonnegative(),
  sellVolumeSol: z.number().nonnegative(),
  vwapSol: z.number().positive().nullable(),
  openUsd: z.number().positive().nullable(),
  highUsd: z.number().positive().nullable(),
  lowUsd: z.number().positive().nullable(),
  closeUsd: z.number().positive().nullable(),
  volumeUsd: z.number().nonnegative(),
  buyVolumeUsd: z.number().nonnegative(),
  sellVolumeUsd: z.number().nonnegative(),
  vwapUsd: z.number().positive().nullable(),
  tokenVolume: z.number().nonnegative(),
  tradeCount: z.number().int().nonnegative(),
  buyCount: z.number().int().nonnegative(),
  sellCount: z.number().int().nonnegative(),
  uniqueBuyers: z.number().int().nonnegative(),
  uniqueSellers: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  sources: z.array(z.string().min(1)),
  confidence: z.enum(["low", "medium", "high"]),
  complete: z.boolean(),
  synthetic: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  paperOnly: z.literal(true),
  dataOnly: z.literal(true),
  tradingDisabled: z.literal(true),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

const launchScoreSnapshotInputSchema = z.object({
  mint: z.string().min(1),
  score: z.number().min(0).max(100),
  label: z.string().min(1),
  phase: z.string().min(1),
  tradeSampleCount: z.number().int().nonnegative(),
  priceSol: z.number().nonnegative().nullable().optional(),
  volumeSol: z.number().nonnegative(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  evaluatedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional()
});

const launchTrackingEventInputSchema = z.object({
  mint: z.string().min(1),
  action: z.string().min(1),
  status: z.string().min(1),
  reason: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const launchTrackingSessionInputSchema = z.object({
  provider: z.string().min(1),
  status: z.string().min(1),
  trackedTokenCount: z.number().int().nonnegative(),
  totalEventCount: z.number().int().nonnegative(),
  estimatedCostSol: z.number().nonnegative().nullable().optional(),
  budgetLimitSol: z.number().nonnegative(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  startedAt: z.string().datetime().nullable().optional(),
  stoppedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime().optional()
});

const tokenIdentitySourceSchema = z.object({
  source: z.enum([
    "pumpportal",
    "solana_metadata",
    "offchain_metadata",
    "dexscreener",
    "jupiter_price",
    "manual",
    "mock",
    "unknown"
  ]),
  realData: z.boolean(),
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  metadataUri: z.string().nullable().optional(),
  imageUri: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  twitter: z.string().nullable().optional(),
  telegram: z.string().nullable().optional(),
  discord: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  confidence: z.enum(["none", "low", "medium", "high"]),
  reasonCodes: z.array(z.string().min(1)),
  fetchedAt: z.string().datetime(),
  raw: z.unknown().optional()
});

const tokenIdentityInputSchema = z.object({
  mint: z.string().min(1),
  name: z.string().nullable(),
  symbol: z.string().nullable(),
  title: z.string().min(1),
  displayName: z.string().min(1),
  normalizedName: z.string().nullable(),
  normalizedSymbol: z.string().nullable(),
  metadataUri: z.string().nullable(),
  imageUri: z.string().nullable(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  twitter: z.string().nullable(),
  telegram: z.string().nullable(),
  discord: z.string().nullable(),
  creator: z.string().nullable(),
  sourcePriority: z.array(z.string().min(1)),
  sources: z.array(tokenIdentitySourceSchema),
  confidence: z.enum(["none", "low", "medium", "high"]),
  completenessScore: z.number().min(0).max(100),
  realData: z.boolean(),
  dataSource: z.enum([
    "pumpportal",
    "solana_metadata",
    "offchain_metadata",
    "dexscreener",
    "jupiter_price",
    "manual",
    "mock",
    "unknown"
  ]),
  reasonCodes: z.array(z.string().min(1)),
  firstSeenAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  raw: z.unknown().optional()
});

const tokenMetadataFetchInputSchema = z.object({
  mint: z.string().min(1),
  uri: z.string().nullable().optional(),
  source: z.string().min(1),
  status: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  fetchedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional()
});

const watchTargetSchema = z.object({
  address: z.string().min(1),
  kind: z.enum([
    "mint",
    "pool",
    "bonding_curve",
    "program",
    "token_account",
    "wallet",
    "unknown"
  ]),
  mint: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  source: z.enum(["mock", "pumpportal", "manual", "derived", "unknown"]),
  confidence: z.enum(["low", "medium", "high"]),
  reasonCodes: z.array(z.string().min(1)),
  createdAt: z.string().datetime()
});

const watchPlanInputSchema = z.object({
  mint: z.string().min(1),
  symbol: z.string().min(1).optional(),
  source: z
    .enum(["mock", "pumpportal", "manual", "derived", "unknown"])
    .optional(),
  shouldVerifyMint: z.boolean(),
  shouldWatchEvents: z.boolean(),
  watchTargets: z.array(watchTargetSchema),
  skippedTargets: z.array(watchTargetSchema),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown().optional(),
  createdAt: z.string().datetime()
});

const watchActionInputSchema = z.object({
  mint: z.string().min(1),
  action: z.string().min(1),
  address: z.string().min(1),
  addressKind: z.enum([
    "mint",
    "pool",
    "bonding_curve",
    "program",
    "token_account",
    "wallet",
    "unknown"
  ]),
  status: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const lightningTradePlanInputSchema = z.object({
  planId: z.string().min(1),
  mint: z.string().min(1),
  action: z.enum(["buy", "sell"]),
  amountSol: z.number().nonnegative(),
  mode: z.string().min(1),
  blocked: z.boolean(),
  blockers: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  request: z.unknown(),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const runtimeSessionInputSchema = z.object({
  sessionId: z.string().min(1),
  runtimeMode: z.string().min(1),
  paidDataArmed: z.boolean(),
  startedAt: z.string().datetime(),
  stoppedAt: z.string().datetime().nullable().optional(),
  stopReason: z.string().min(1).nullable().optional(),
  configFingerprint: z.string().min(1),
  createdAt: z.string().datetime().optional()
});

const sessionCaptureConfigSchema = z.object({
  schemaVersion: z.literal(1),
  horizonMs: z.number().int().min(1_000).max(300_000),
  targetReturnPct: z.number().min(0).max(1_000),
  estimatedCostPct: z.number().min(0).max(100),
  samplingIntervalMs: z.number().int().min(1_000).max(300_000),
  maxOutcomeLagMs: z.number().int().min(0).max(10_000),
  minimumTradeSamples: z.number().int().min(3),
  maxObservationsPerSession: z.number().int().min(1).max(100_000)
});

const calibrationCaptureSessionSchema = z.object({
  schemaVersion: z.literal(1),
  captureVersion: z.literal("calibration-session-capture-v1"),
  sessionId: z.string().min(1),
  runtimeSessionId: z.string().min(1),
  strategyVersion: z.literal("launch-derivative-reference-v1"),
  partition: z.enum(["train", "validation"]),
  status: z.enum(["active", "stopped", "interrupted"]),
  config: sessionCaptureConfigSchema,
  startedAt: z.string().datetime(),
  stoppedAt: z.string().datetime().nullable(),
  stopReason: z.string().min(1).nullable(),
  reasonCodes: z.array(z.string().min(1)),
  paperOnly: z.literal(true),
  dataOnly: z.literal(true),
  tradingDisabled: z.literal(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const capturedSignalObservationSchema = z.object({
  schemaVersion: z.literal(1),
  captureVersion: z.literal("calibration-session-capture-v1"),
  observationId: z.string().min(1),
  captureSessionId: z.string().min(1),
  runtimeSessionId: z.string().min(1),
  mint: z.string().min(1),
  strategyVersion: z.literal("launch-derivative-reference-v1"),
  partition: z.enum(["train", "validation"]),
  sourceSnapshotId: z.number().int().positive(),
  signalAt: z.string().datetime(),
  signalAgeSeconds: z.number().nonnegative(),
  score: z.number().min(0).max(100),
  label: z.enum(["none", "watch", "hot", "ripping", "reject"]),
  tradeSampleCount: z.number().int().nonnegative(),
  entryPriceSol: z.number().positive(),
  horizonMs: z.number().int().min(1_000).max(300_000),
  targetReturnPct: z.number().min(0).max(1_000),
  estimatedCostPct: z.number().min(0).max(100),
  maxOutcomeLagMs: z.number().int().min(0).max(10_000),
  status: z.enum(["pending", "complete", "unavailable"]),
  outcomeAt: z.string().datetime().nullable(),
  outcomePriceSol: z.number().positive().nullable(),
  forwardReturnPct: z.number().nullable(),
  maxFavorableExcursionPct: z.number().nullable(),
  maxAdverseExcursionPct: z.number().nullable(),
  targetReached: z.boolean().nullable(),
  reasonCodes: z.array(z.string().min(1)),
  paperOnly: z.literal(true),
  dataOnly: z.literal(true),
  tradingDisabled: z.literal(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const paperStrategyEvaluationSchema = z
  .object({
    schemaVersion: z.literal(1),
    evaluationVersion: z.literal("paper-strategy-evaluation-v1"),
    evaluationId: z.string().min(1),
    evaluatedAt: z.string().datetime(),
    strategyVersion: z.literal("launch-derivative-reference-v1"),
    policyStatus: z.literal("reference_only"),
    evaluationPolicy: z.literal("fixed_horizon_score_threshold"),
    selectionPolicy: z.literal("training_only_then_single_temporal_holdout"),
    datasetIds: z.array(z.string().min(1)).min(1),
    captureSessionIds: z.array(z.string().min(1)).min(1),
    config: z.object({
      schemaVersion: z.literal(1),
      startingCapitalSol: z.number().positive(),
      positionSizeSol: z.number().positive(),
      minimumDatasetCompletenessRatio: z.number().min(0).max(1),
      maximumUnavailableOutcomeRatio: z.number().min(0).max(1),
      confidenceLevel: z.literal(0.95),
      confidenceZScore: z.literal(1.96),
      minimumValidationExpectancyPct: z.literal(0),
      minimumValidationProfitFactor: z.literal(1),
      minimumValidationConfidenceLowerBoundPct: z.literal(0)
    }),
    datasetAudit: z
      .object({
        integrityValid: z.boolean(),
        qualitySufficient: z.boolean(),
        temporalHoldoutValid: z.boolean().nullable()
      })
      .passthrough(),
    calibration: z
      .object({
        schemaVersion: z.literal(1),
        automaticThresholdActivation: z.literal(false),
        tradingDisabled: z.literal(true)
      })
      .passthrough(),
    selectedThreshold: z.number().min(0).max(100).nullable(),
    trainingPerformance: z.unknown().nullable(),
    validationPerformance: z.unknown().nullable(),
    acceptanceGates: z.array(
      z.object({
        gate: z.string().min(1),
        passed: z.boolean(),
        actual: z.union([z.number(), z.string(), z.boolean()]).nullable(),
        required: z.string().min(1)
      })
    ),
    evaluationStatus: z.enum([
      "invalid_dataset",
      "data_quality_failed",
      "insufficient_evidence",
      "holdout_rejected",
      "paper_observation_candidate"
    ]),
    automaticThresholdActivation: z.literal(false),
    automaticPaperTradingActivation: z.literal(false),
    calibrated: z.literal(false),
    paperOnly: z.literal(true),
    dataOnly: z.literal(true),
    tradingDisabled: z.literal(true),
    liveExecutionDisabled: z.literal(true),
    reasonCodes: z.array(z.string().min(1))
  })
  .passthrough();

const paperLifecycleValidationSchema = z
  .object({
    schemaVersion: z.literal(1),
    validationVersion: z.literal("paper-lifecycle-validation-v1"),
    validationId: z.string().min(1),
    evaluatedAt: z.string().datetime(),
    policyStatus: z.literal("reference_only"),
    validationPolicy: z.literal("global_event_time_portfolio_replay"),
    selectionPolicy: z.literal(
      "upstream_training_threshold_single_temporal_holdout"
    ),
    simulationPolicy: z.literal(
      "shared_capital_latency_cost_liquidity_and_missed_fills"
    ),
    strategyProvenance: z
      .object({
        evaluationId: z.string().min(1),
        evaluationVersion: z.literal("paper-strategy-evaluation-v1"),
        evaluationStatus: z.literal("paper_observation_candidate"),
        selectedThreshold: z.number().min(0).max(100),
        captureSessionIds: z.array(z.string().min(1)),
        expectedObservationCount: z.number().int().nonnegative()
      })
      .passthrough(),
    captureSessionIds: z.array(z.string().min(1)),
    selectedThreshold: z.number().min(0).max(100),
    config: z.object({ schemaVersion: z.literal(1) }).passthrough(),
    exitPolicyVersion: z.literal("paper-exit-policy-v1"),
    exitPolicyConfig: z.object({ schemaVersion: z.literal(1) }).passthrough(),
    dataAudit: z
      .object({
        integrityValid: z.boolean(),
        qualitySufficient: z.boolean(),
        temporalHoldoutValid: z.boolean().nullable(),
        noLookAheadValid: z.boolean()
      })
      .passthrough(),
    portfolioSnapshot: z
      .object({
        cashSol: z.number().nonnegative(),
        equitySol: z.number(),
        openPositionCount: z.number().int().nonnegative(),
        updatedAt: z.string().datetime()
      })
      .passthrough(),
    peakOpenPositionCount: z.number().int().nonnegative(),
    trades: z.array(
      z.object({ observationId: z.string().min(1) }).passthrough()
    ),
    trainingPerformance: z.unknown().nullable(),
    validationPerformance: z.unknown().nullable(),
    validationHorizonBenchmark: z.unknown().nullable(),
    benchmarkOutperformancePct: z.number().nullable(),
    acceptanceGates: z.array(
      z.object({
        gate: z.string().min(1),
        passed: z.boolean(),
        actual: z.union([z.number(), z.string(), z.boolean()]).nullable(),
        required: z.string().min(1)
      })
    ),
    validationStatus: z.enum([
      "invalid_input",
      "data_quality_failed",
      "insufficient_evidence",
      "holdout_rejected",
      "paper_automation_candidate"
    ]),
    automaticThresholdActivation: z.literal(false),
    automaticPaperTradingActivation: z.literal(false),
    automaticLiveExecution: z.literal(false),
    calibrated: z.literal(false),
    paperOnly: z.literal(true),
    dataOnly: z.literal(true),
    tradingDisabled: z.literal(true),
    liveExecutionDisabled: z.literal(true),
    reasonCodes: z.array(z.string().min(1))
  })
  .passthrough();

const paperAutomationDeploymentSchema = z
  .object({
    schemaVersion: z.literal(1),
    automationVersion: z.literal("paper-automation-v1"),
    deploymentId: z.string().min(1),
    validationId: z.string().min(1),
    validationVersion: z.literal("paper-lifecycle-validation-v1"),
    strategyEvaluationId: z.string().min(1),
    strategyEvaluationVersion: z.literal("paper-strategy-evaluation-v1"),
    selectedThreshold: z.number().min(0).max(100),
    exitPolicyVersion: z.literal("paper-exit-policy-v1"),
    executionConfig: z.object({ schemaVersion: z.literal(1) }).passthrough(),
    exitPolicyConfig: z.object({ schemaVersion: z.literal(1) }).passthrough(),
    validationExpectancyPct: z.number().positive(),
    validationConfidenceLowerBoundPct: z.number().positive(),
    forwardStartingEquitySol: z.number().positive(),
    forwardConfig: z
      .object({
        schemaVersion: z.literal(1),
        maximumSignalAgeMs: z.number().positive(),
        minimumClosedTradesForDrift: z.number().int().positive(),
        minimumExpectancyRetentionRatio: z.number().min(0).max(1),
        minimumForwardExpectancyPct: z.literal(0),
        maximumForwardDrawdownPct: z.number().positive(),
        maximumConsecutiveLosses: z.number().int().positive(),
        maximumRejectedEntryRate: z.number().min(0).max(1),
        maximumConsecutiveStaleSignals: z.number().int().positive()
      })
      .strict(),
    approvedBy: z.string().min(1),
    approvedAt: z.string().datetime(),
    status: z.enum(["approved", "armed", "paused", "revoked"]),
    statusReasonCodes: z.array(z.string().min(1)),
    armedAt: z.string().datetime().nullable(),
    pausedAt: z.string().datetime().nullable(),
    revokedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
    automaticLiveExecution: z.literal(false),
    paperOnly: z.literal(true),
    tradingDisabled: z.literal(true),
    liveExecutionDisabled: z.literal(true)
  })
  .strict();

const paperAutomationEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1),
    deploymentId: z.string().min(1),
    operationId: z.string().min(1).nullable(),
    kind: z.enum([
      "approved",
      "armed",
      "paused",
      "revoked",
      "restart_reconciled",
      "signal_accepted",
      "signal_rejected",
      "entry_scheduled",
      "entry_missed",
      "entry_executed",
      "entry_rejected",
      "entry_expired",
      "entry_cancelled",
      "exit_scheduled",
      "exit_missed",
      "exit_executed",
      "exit_rejected",
      "exit_expired",
      "exit_cancelled",
      "drift_detected",
      "kill_switch_triggered"
    ]),
    mint: z.string().min(1).nullable(),
    observedAt: z.string().datetime(),
    orderId: z.string().min(1).nullable(),
    fillId: z.string().min(1).nullable(),
    entryFeeSol: z.number().nonnegative().nullable(),
    positionSizeSol: z.number().positive().nullable(),
    realizedPnlSol: z.number().nullable(),
    positionClosed: z.boolean().nullable(),
    reasonCodes: z.array(z.string().min(1)),
    payload: z.unknown(),
    paperOnly: z.literal(true),
    liveExecutionDisabled: z.literal(true)
  })
  .strict();

const paperAutomationOperationSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationId: z.string().min(1),
    deploymentId: z.string().min(1),
    kind: z.enum(["entry", "exit"]),
    status: z.enum(["pending", "executed", "rejected", "expired", "cancelled"]),
    mint: z.string().min(1),
    signalScore: z.number().min(0).max(100),
    signalHardReject: z.boolean(),
    signalAt: z.string().datetime(),
    executeAfter: z.string().datetime(),
    expiresAt: z.string().datetime(),
    exitEvaluationId: z.string().min(1).nullable(),
    reasonCodes: z.array(z.string().min(1)),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    paperOnly: z.literal(true),
    liveExecutionDisabled: z.literal(true)
  })
  .strict();

const paperOperationsConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    maximumSessionCostSol: z.number().positive().max(0.001),
    budgetWarningRatio: z.number().min(0.01).max(0.8),
    maximumFeedSilenceMs: z.number().int().min(1_000).max(15_000),
    maximumTelemetryGapMs: z.number().int().min(1_000).max(30_000),
    maximumSignalLatencyMs: z.number().int().min(1).max(5_000),
    maximumSessionDurationMs: z.number().int().min(60_000).max(86_400_000)
  })
  .strict();

const paperOperationsSessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationsVersion: z.literal("paper-operations-v1"),
    sessionId: z.string().min(1),
    deploymentId: z.string().min(1),
    runtimeSessionId: z.string().min(1),
    status: z.enum(["active", "completed", "interrupted"]),
    config: paperOperationsConfigSchema,
    startedBy: z.string().min(1),
    startingMeteredCostSol: z.number().nonnegative(),
    startingMeteredEventCount: z.number().int().nonnegative(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable(),
    endReason: z.string().min(1).nullable(),
    reasonCodes: z.array(z.string().min(1)),
    updatedAt: z.string().datetime(),
    automaticMeteredStart: z.literal(false),
    automaticPaperArm: z.literal(false),
    automaticLiveExecution: z.literal(false),
    paperOnly: z.literal(true),
    dataOnly: z.literal(true),
    tradingDisabled: z.literal(true),
    liveExecutionDisabled: z.literal(true)
  })
  .strict();

const paperOperationsSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationsVersion: z.literal("paper-operations-v1"),
    sampleId: z.string().min(1),
    sessionId: z.string().min(1),
    deploymentId: z.string().min(1),
    runtimeSessionId: z.string().min(1),
    kind: z.enum([
      "session_started",
      "runtime_sample",
      "signal_latency",
      "budget_enforced",
      "session_ended",
      "restart_reconciled"
    ]),
    observedAt: z.string().datetime(),
    telemetryGapMs: z.number().nonnegative().nullable(),
    meteredActive: z.boolean(),
    feedConnected: z.boolean(),
    lastEventAt: z.string().datetime().nullable(),
    feedSilenceMs: z.number().nonnegative().nullable(),
    trackedMintCount: z.number().int().nonnegative(),
    meteredEventCount: z.number().int().nonnegative(),
    estimatedCostSol: z.number().nonnegative(),
    budgetRemainingSol: z.number().nonnegative(),
    budgetReached: z.boolean(),
    dataWalletBalanceSol: z.number().nonnegative().nullable(),
    dataWalletBalanceStatus: z.enum([
      "unknown",
      "missing_config",
      "critical",
      "low",
      "ok"
    ]),
    signalMint: z.string().min(1).nullable(),
    signalAt: z.string().datetime().nullable(),
    signalLatencyMs: z.number().nonnegative().nullable(),
    automationStatus: z
      .enum(["approved", "armed", "paused", "revoked"])
      .nullable(),
    automationHealthy: z.boolean().nullable(),
    pendingOperationCount: z.number().int().nonnegative(),
    closedTradeCount: z.number().int().nonnegative(),
    winCount: z.number().int().nonnegative(),
    totalNetPnlSol: z.number(),
    maximumDrawdownPct: z.number().nonnegative(),
    timeseriesAcceptedEventCount: z.number().int().nonnegative(),
    timeseriesDuplicateEventCount: z.number().int().nonnegative(),
    timeseriesInvalidEventCount: z.number().int().nonnegative(),
    timeseriesLateEventCount: z.number().int().nonnegative(),
    timeseriesGapCount: z.number().int().nonnegative(),
    storageWriteHealthy: z.boolean(),
    reasonCodes: z.array(z.string().min(1)),
    payload: z.unknown(),
    paperOnly: z.literal(true),
    dataOnly: z.literal(true),
    tradingDisabled: z.literal(true),
    liveExecutionDisabled: z.literal(true)
  })
  .strict();

const paperOperationsAlertSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationsVersion: z.literal("paper-operations-v1"),
    alertId: z.string().min(1),
    sessionId: z.string().min(1),
    sampleId: z.string().min(1),
    severity: z.enum(["warning", "critical"]),
    code: z.string().min(1),
    observedAt: z.string().datetime(),
    metricValue: z.union([z.number(), z.string(), z.boolean()]).nullable(),
    threshold: z.union([z.number(), z.string(), z.boolean()]).nullable(),
    reasonCodes: z.array(z.string().min(1)),
    payload: z.unknown(),
    paperOnly: z.literal(true),
    dataOnly: z.literal(true),
    tradingDisabled: z.literal(true),
    liveExecutionDisabled: z.literal(true)
  })
  .strict();

const paperForwardEvaluationSchema = z
  .object({
    schemaVersion: z.literal(1),
    evaluationVersion: z.literal("paper-forward-evaluation-v1"),
    evaluationId: z.string().min(1),
    evaluatedAt: z.string().datetime(),
    evaluatedBy: z.string().min(1),
    evaluationPolicy: z.literal(
      "all_completed_same_deployment_forward_sessions"
    ),
    evidenceDigestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    deploymentProvenance: z
      .object({
        deploymentId: z.string().min(1),
        automationVersion: z.literal("paper-automation-v1"),
        deploymentStatus: z.enum(["approved", "armed", "paused", "revoked"]),
        validationId: z.string().min(1),
        strategyEvaluationId: z.string().min(1),
        selectedThreshold: z.number().min(0).max(100),
        exitPolicyVersion: z.literal("paper-exit-policy-v1"),
        validationExpectancyPct: z.number().positive(),
        validationConfidenceLowerBoundPct: z.number().positive(),
        approvedAt: z.string().datetime()
      })
      .strict(),
    config: z.object({ schemaVersion: z.literal(1) }).passthrough(),
    sessionIds: z.array(z.string().min(1)),
    evidenceReportIds: z.array(z.string().min(1)),
    evidenceAudit: z
      .object({
        integrityValid: z.boolean(),
        completedSessionCount: z.number().int().nonnegative(),
        distinctUtcDayCount: z.number().int().nonnegative()
      })
      .passthrough(),
    sessions: z.array(z.object({ sessionId: z.string().min(1) }).passthrough()),
    cohortMetrics: z
      .object({
        closedTradeCount: z.number().int().nonnegative(),
        signalObservationCount: z.number().int().nonnegative(),
        totalDataCostSol: z.number().nonnegative(),
        netPnlAfterDataCostSol: z.number()
      })
      .passthrough(),
    acceptanceGates: z.array(
      z
        .object({
          gate: z.string().min(1),
          category: z.enum(["evidence", "operational", "edge"]),
          passed: z.boolean(),
          actual: z.union([z.number(), z.string(), z.boolean()]).nullable(),
          required: z.string().min(1),
          reasonCode: z.string().min(1)
        })
        .strict()
    ),
    evaluationStatus: z.enum([
      "insufficient_evidence",
      "operational_rejected",
      "edge_rejected",
      "manual_live_candidate"
    ]),
    manualReviewRequired: z.literal(true),
    automaticLivePromotion: z.literal(false),
    automaticLiveExecution: z.literal(false),
    privateKeyAccess: z.literal(false),
    transactionSigning: z.literal(false),
    paperOnly: z.literal(true),
    dataOnly: z.literal(true),
    tradingDisabled: z.literal(true),
    liveExecutionDisabled: z.literal(true),
    reasonCodes: z.array(z.string().min(1))
  })
  .strict();

const paperExitPolicyEvaluationSchema = z
  .object({
    schemaVersion: z.literal(1),
    policyVersion: z.literal("paper-exit-policy-v1"),
    evaluationId: z.string().min(1),
    evaluatedAt: z.string().datetime(),
    mint: z.string().min(1),
    policyStatus: z.literal("reference_only"),
    evaluationStatus: z.enum(["invalid_input", "hold", "paper_exit_candidate"]),
    precedencePolicy: z.literal("first_eligible_rule_by_ascending_priority"),
    config: z.object({ schemaVersion: z.literal(1) }).passthrough(),
    position: z.object({ mint: z.string().min(1) }).passthrough(),
    market: z.object({ hardReject: z.boolean() }).passthrough(),
    positionAgeMs: z.number().nonnegative(),
    trailingDrawdownPct: z.number().nonnegative(),
    volumeRateRatio5sTo30s: z.number().nullable(),
    ruleEvaluations: z.array(
      z.object({
        ruleId: z.string().min(1),
        trigger: z.string().min(1),
        priority: z.number(),
        enabled: z.boolean(),
        matched: z.boolean(),
        eligible: z.boolean(),
        sellPct: z.number().min(1).max(100),
        actual: z.union([z.number(), z.string(), z.boolean()]).nullable(),
        required: z.string().min(1),
        blockers: z.array(z.string()),
        reasonCodes: z.array(z.string())
      })
    ),
    selectedAction: z
      .object({
        ruleId: z.string().min(1),
        trigger: z.string().min(1),
        priority: z.number(),
        sellPct: z.number().min(1).max(100),
        reason: z.string().min(1),
        reasonCodes: z.array(z.string().min(1))
      })
      .nullable(),
    automaticPaperExitActivation: z.literal(false),
    automaticLiveExecution: z.literal(false),
    calibrated: z.literal(false),
    paperOnly: z.literal(true),
    liveExecutionDisabled: z.literal(true),
    reasonCodes: z.array(z.string().min(1))
  })
  .passthrough();

const calibrationObservationLimitSchema = z
  .number()
  .int()
  .positive()
  .max(100_000);

const operatorActionInputSchema = z.object({
  actionId: z.string().min(1),
  action: z.string().min(1),
  target: z.string().min(1),
  safeParameters: z.object({}).catchall(z.unknown()).default({}),
  outcome: z.enum(["succeeded", "blocked", "failed"]),
  reasonCodes: z.array(z.string().min(1)),
  createdAt: z.string().datetime().optional()
});

const capacitySnapshotInputSchema = z.object({
  snapshotId: z.string().min(1),
  runtimeSessionId: z.string().min(1),
  observationWindowMs: z.number().positive(),
  launchCount: z.number().int().nonnegative(),
  launchRatePerMinute: z.number().nonnegative(),
  trackedMintCount: z.number().int().nonnegative(),
  protectedMintCount: z.number().int().nonnegative(),
  requiredInitialSlots: z.number().nonnegative(),
  availableNewestSlots: z.number().int().nonnegative(),
  initialCoverageRatio: z.number().min(0).max(1),
  observedEventsPerSecond: z.number().nonnegative(),
  projectedHourlyEvents: z.number().nonnegative(),
  projectedHourlyCostSol: z.number().nonnegative(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const pumpPortalWalletStatusSnapshotInputSchema = z.object({
  dataWalletPublicKey: z.string().min(1).nullable().optional(),
  tradingWalletPublicKey: z.string().min(1).nullable().optional(),
  sameWallet: z.boolean(),
  dataWalletBalanceSol: z.number().nonnegative().nullable().optional(),
  tradingWalletBalanceSol: z.number().nonnegative().nullable().optional(),
  dataWalletStatus: z.string().min(1),
  tradingWalletStatus: z.string().min(1),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional()
});

const watchedWalletInputSchema = z.object({
  address: z.string().min(32),
  alias: z.string().min(1).nullable().optional(),
  tags: z.array(z.string().min(1)),
  enabled: z.boolean(),
  source: z.enum(["manual", "imported", "test"]),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

const watchedWalletTradeEventInputSchema = z.object({
  wallet: z.string().min(32),
  walletAlias: z.string().min(1).nullable().optional(),
  mint: z.string().min(32),
  side: z.enum(["buy", "sell", "unknown"]),
  priceSol: z.number().nonnegative().nullable().optional(),
  volumeSol: z.number().nonnegative().nullable().optional(),
  tokenAmount: z.number().nonnegative().nullable().optional(),
  signature: z.string().min(1).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  usableForExitStrategy: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown().optional(),
  createdAt: z.string().datetime().optional()
});

const exitRuleInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  trigger: z.enum([
    "watched_wallet_buy",
    "watched_wallet_sell",
    "watched_wallet_any_trade"
  ]),
  minProfitPct: z.number().nonnegative(),
  minProfitSol: z.number().nonnegative().nullable().optional(),
  sellPct: z.number().positive().max(100),
  requirePositionOpenedBeforeWalletTrade: z.boolean(),
  allowedWalletTags: z.array(z.string().min(1)).optional(),
  blockedWalletTags: z.array(z.string().min(1)).optional(),
  requireCurrentPrice: z.boolean(),
  maxPositionAgeMs: z.number().nonnegative().nullable().optional(),
  cooldownMs: z.number().nonnegative(),
  priority: z.number(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

const exitSignalInputSchema = z.object({
  id: z.string().min(1),
  mint: z.string().min(32),
  wallet: z.string().min(32),
  walletAlias: z.string().min(1).nullable().optional(),
  ruleId: z.string().min(1),
  action: z.literal("paper_sell"),
  sellPct: z.number().positive().max(100),
  blocked: z.boolean(),
  blockers: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.unknown().optional(),
  createdAt: z.string().datetime().optional()
});

const limitSchema = z.number().int().positive().max(1000);

let activeStorage: {
  db: DatabaseSync;
  databasePath: string;
  readOnly: boolean;
} | null = null;

export function initStorage(options: StorageOptions = {}): StorageHandle {
  if (activeStorage) {
    if (activeStorage.readOnly) {
      throw new Error("Storage is already initialized in read-only mode.");
    }

    return {
      databasePath: activeStorage.databasePath
    };
  }

  const databasePath = resolveDatabasePath(options.databasePath);
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);
  activeStorage = {
    db,
    databasePath,
    readOnly: false
  };

  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  runMigrations(db);

  return {
    databasePath
  };
}

export function initStorageReadOnly(
  options: StorageOptions = {}
): StorageHandle {
  if (activeStorage) {
    if (!activeStorage.readOnly) {
      throw new Error("Storage is already initialized in read-write mode.");
    }

    return {
      databasePath: activeStorage.databasePath
    };
  }

  const databasePath = resolveDatabasePath(options.databasePath);

  if (!existsSync(databasePath)) {
    throw new Error(`Storage database ${databasePath} does not exist.`);
  }

  const db = new DatabaseSync(databasePath, { readOnly: true });
  activeStorage = {
    db,
    databasePath,
    readOnly: true
  };
  db.exec("PRAGMA query_only = ON");

  return {
    databasePath
  };
}

export function closeStorage(): void {
  activeStorage?.db.close();
  activeStorage = null;
}

export function runStorageTransaction<T>(operation: () => T): T {
  const db = getDb();
  if (db.isTransaction) {
    return operation();
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    throw error;
  }
}

export function saveFeedEvent(event: FeedEvent): StoredFeedEvent {
  const parsed = feedEventSchema.parse(event) as FeedEvent;
  const mint = getFeedEventMint(parsed);
  const createdAt = getFeedEventTimestamp(parsed);
  const eventType =
    parsed.type === "token_created"
      ? parsed.rawSourceEventType === "migration"
        ? "migration"
        : "create"
      : parsed.type;
  const db = getDb();

  const result = db
    .prepare(
      `insert into feed_events (event_type, mint, payload_json, created_at)
       values (?, ?, ?, ?)`
    )
    .run(eventType, mint, stringifyJson(parsed), createdAt);

  return {
    id: toRowId(result.lastInsertRowid),
    eventType,
    mint,
    payload: parsed,
    createdAt
  };
}

export function saveDiscoveryCoverageSession(
  input: DiscoveryCoverageSession
): DiscoveryCoverageSession {
  const session = DiscoveryCoverageSessionSchema.parse(input);
  const db = getDb();
  const existing = getDiscoveryCoverageSession(session.sessionId);

  if (existing?.stoppedAt) {
    if (
      session.stoppedAt !== existing.stoppedAt ||
      session.stopReason !== existing.stopReason
    ) {
      throw new Error(
        "A finalized discovery coverage session cannot be changed."
      );
    }
    return existing;
  }

  db.prepare(
    `insert into discovery_coverage_sessions (
      session_id,
      provider,
      source_mode,
      local_reconciliation_status,
      upstream_coverage_status,
      raw_frame_count,
      pipeline_completed_count,
      payload_json,
      started_at,
      stopped_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(session_id) do update set
      provider = excluded.provider,
      source_mode = excluded.source_mode,
      local_reconciliation_status = excluded.local_reconciliation_status,
      upstream_coverage_status = excluded.upstream_coverage_status,
      raw_frame_count = excluded.raw_frame_count,
      pipeline_completed_count = excluded.pipeline_completed_count,
      payload_json = excluded.payload_json,
      stopped_at = excluded.stopped_at,
      updated_at = excluded.updated_at`
  ).run(
    session.sessionId,
    session.provider,
    session.sourceMode,
    session.localReconciliationStatus,
    session.upstreamCoverageStatus,
    session.rawFrameCount,
    session.pipelineCompletedCount,
    stringifyJson(session),
    session.startedAt,
    session.stoppedAt,
    session.updatedAt
  );

  return session;
}

export function getDiscoveryCoverageSession(
  sessionId: string
): DiscoveryCoverageSession | null {
  const row = getDb()
    .prepare(
      `select payload_json
       from discovery_coverage_sessions
       where session_id = ?`
    )
    .get(sessionId) as { payload_json: string } | undefined;
  return row ? mapDiscoveryCoverageSession(row.payload_json) : null;
}

export function listDiscoveryCoverageSessions(
  limit = 25
): DiscoveryCoverageSession[] {
  const safeLimit = z.number().int().positive().max(1000).parse(limit);
  const rows = getDb()
    .prepare(
      `select payload_json
       from discovery_coverage_sessions
       order by started_at desc, id desc
       limit ?`
    )
    .all(safeLimit) as { payload_json: string }[];
  return rows.map((row) => mapDiscoveryCoverageSession(row.payload_json));
}

export function saveDiscoveryCoverageEvent(
  input: DiscoveryCoverageEvent
): DiscoveryCoverageEvent {
  const event = DiscoveryCoverageEventSchema.parse(input);
  getDb()
    .prepare(
      `insert into discovery_coverage_events (
        session_id,
        correlation_id,
        source_event_key,
        event_type,
        mint,
        parser_outcome,
        normalization_outcome,
        pipeline_outcome,
        payload_json,
        received_at,
        completed_at,
        created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(session_id, correlation_id) do update set
        source_event_key = excluded.source_event_key,
        event_type = excluded.event_type,
        mint = excluded.mint,
        parser_outcome = excluded.parser_outcome,
        normalization_outcome = excluded.normalization_outcome,
        pipeline_outcome = excluded.pipeline_outcome,
        payload_json = excluded.payload_json,
        completed_at = excluded.completed_at`
    )
    .run(
      event.sessionId,
      event.correlationId,
      event.sourceEventKey,
      event.eventType,
      event.mint,
      event.parserOutcome,
      event.normalizationOutcome,
      event.pipelineOutcome,
      stringifyJson(event),
      event.receivedAt,
      event.completedAt,
      event.createdAt
    );
  return event;
}

export function findDiscoveryCoverageEventBySourceKey(
  sourceEventKey: string,
  eventType: "create" | "migration"
): DiscoveryCoverageEvent | null {
  const row = getDb()
    .prepare(
      `select payload_json
       from discovery_coverage_events
       where source_event_key = ? and event_type = ?
       order by id desc
       limit 1`
    )
    .get(sourceEventKey, eventType) as { payload_json: string } | undefined;
  return row ? mapDiscoveryCoverageEvent(row.payload_json) : null;
}

export function listDiscoveryCoverageEvents(
  input: DiscoveryCoverageEventQuery
): DiscoveryCoverageEvent[] {
  const query = input;
  const clauses: string[] = [];
  const parameters: Array<string | number> = [];
  const addFilter = (column: string, value: string | undefined) => {
    if (value !== undefined) {
      clauses.push(`${column} = ?`);
      parameters.push(value);
    }
  };

  addFilter("session_id", query.sessionId);
  addFilter("event_type", query.eventType);
  addFilter("parser_outcome", query.parserOutcome);
  addFilter("pipeline_outcome", query.pipelineOutcome);
  addFilter("mint", query.mint);
  const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
  const rows = getDb()
    .prepare(
      `select payload_json
       from discovery_coverage_events
       ${where}
       order by received_at desc, id desc
       limit ? offset ?`
    )
    .all(...parameters, query.limit, query.offset) as {
    payload_json: string;
  }[];
  return rows.map((row) => mapDiscoveryCoverageEvent(row.payload_json));
}

export function saveDiscoveryCoverageConnectionEvent(
  input: DiscoveryCoverageConnectionEvent
): DiscoveryCoverageConnectionEvent {
  const event = DiscoveryCoverageConnectionEventSchema.parse(input);
  getDb()
    .prepare(
      `insert into discovery_coverage_connection_events (
        connection_event_id,
        session_id,
        event_type,
        connection_id,
        gap_status,
        payload_json,
        created_at
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(connection_event_id) do nothing`
    )
    .run(
      event.connectionEventId,
      event.sessionId,
      event.eventType,
      event.connectionId,
      event.gapStatus,
      stringifyJson(event),
      event.createdAt
    );
  return event;
}

export function saveTradeDataCoverageSession(
  input: TradeDataCoverageSession
): TradeDataCoverageSession {
  const session = TradeDataCoverageSessionSchema.parse(input);
  const existing = getTradeDataCoverageSession(session.sessionId);
  if (existing?.stoppedAt) {
    if (
      existing.stoppedAt !== session.stoppedAt ||
      existing.stopReason !== session.stopReason
    ) {
      throw new Error(
        "A finalized trade data coverage session cannot be changed."
      );
    }
    return existing;
  }

  getDb()
    .prepare(
      `insert into trade_data_coverage_sessions (
        session_id, schema_version, provider, selected_mint, started_at,
        stopped_at, stop_reason, subscription_summary_json, counters_json,
        latency_summary_json, consistency_summary_json, timeseries_summary_json,
        estimated_cost_sol, local_reconciliation_status,
        upstream_coverage_status, reason_codes_json, payload_json, created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(session_id) do update set
        stopped_at = excluded.stopped_at,
        stop_reason = excluded.stop_reason,
        subscription_summary_json = excluded.subscription_summary_json,
        counters_json = excluded.counters_json,
        latency_summary_json = excluded.latency_summary_json,
        consistency_summary_json = excluded.consistency_summary_json,
        timeseries_summary_json = excluded.timeseries_summary_json,
        estimated_cost_sol = excluded.estimated_cost_sol,
        local_reconciliation_status = excluded.local_reconciliation_status,
        upstream_coverage_status = excluded.upstream_coverage_status,
        reason_codes_json = excluded.reason_codes_json,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at`
    )
    .run(
      session.sessionId,
      session.schemaVersion,
      session.provider,
      session.selectedMint,
      session.startedAt,
      session.stoppedAt,
      session.stopReason,
      stringifyJson(session.subscriptionLifecycle),
      stringifyJson(extractTradeCoverageCounters(session)),
      stringifyJson(session.latencyDistributions),
      stringifyJson(session.consistencySummary),
      stringifyJson({
        completedOneSecondBucketCount: session.completedOneSecondBucketCount,
        firstDerivativeAvailable: session.firstDerivativeAvailable,
        oneSecondBucketCount: session.oneSecondBucketCount,
        secondDerivativeAvailable: session.secondDerivativeAvailable,
        validSampleCount: session.validSampleCount
      }),
      session.estimatedCostSol,
      session.localReconciliationStatus,
      session.upstreamCoverageStatus,
      stringifyJson(session.reasonCodes),
      stringifyJson(session),
      session.startedAt,
      session.updatedAt
    );
  return session;
}

export function getTradeDataCoverageSession(
  sessionId: string
): TradeDataCoverageSession | null {
  const row = getDb()
    .prepare(
      `select payload_json from trade_data_coverage_sessions where session_id = ?`
    )
    .get(sessionId) as { payload_json: string } | undefined;
  return row
    ? TradeDataCoverageSessionSchema.parse(JSON.parse(row.payload_json))
    : null;
}

export function listTradeDataCoverageSessions(
  limit = 25
): TradeDataCoverageSession[] {
  const safeLimit = z.number().int().positive().max(1000).parse(limit);
  const rows = getDb()
    .prepare(
      `select payload_json from trade_data_coverage_sessions
       order by started_at desc, id desc limit ?`
    )
    .all(safeLimit) as { payload_json: string }[];
  return rows.map((row) =>
    TradeDataCoverageSessionSchema.parse(JSON.parse(row.payload_json))
  );
}

export function saveTradeDataCoverageEvent(
  input: TradeDataCoverageEvent
): TradeDataCoverageEvent {
  const event = TradeDataCoverageEventSchema.parse(input);
  getDb()
    .prepare(
      `insert into trade_data_coverage_events (
        session_id, correlation_id, source_event_key, subscribed_mint,
        observed_mint, signature, side, parser_outcome,
        normalization_outcome, pipeline_outcome, usable_for_metrics,
        duplicate_key, rejection_reason, failure_stage, failure_reason,
        price_sol, volume_sol, token_amount, trader, provider_timestamp,
        received_at, completed_at, post_stop, stage_timestamps_json,
        stage_latencies_json, consistency_checks_json, reason_codes_json,
        payload_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(session_id, correlation_id) do update set
        source_event_key = excluded.source_event_key,
        observed_mint = excluded.observed_mint,
        signature = excluded.signature,
        side = excluded.side,
        parser_outcome = excluded.parser_outcome,
        normalization_outcome = excluded.normalization_outcome,
        pipeline_outcome = excluded.pipeline_outcome,
        usable_for_metrics = excluded.usable_for_metrics,
        duplicate_key = excluded.duplicate_key,
        rejection_reason = excluded.rejection_reason,
        failure_stage = excluded.failure_stage,
        failure_reason = excluded.failure_reason,
        price_sol = excluded.price_sol,
        volume_sol = excluded.volume_sol,
        token_amount = excluded.token_amount,
        trader = excluded.trader,
        provider_timestamp = excluded.provider_timestamp,
        completed_at = excluded.completed_at,
        post_stop = excluded.post_stop,
        stage_timestamps_json = excluded.stage_timestamps_json,
        stage_latencies_json = excluded.stage_latencies_json,
        consistency_checks_json = excluded.consistency_checks_json,
        reason_codes_json = excluded.reason_codes_json,
        payload_json = excluded.payload_json`
    )
    .run(
      event.sessionId,
      event.correlationId,
      event.sourceEventKey,
      event.subscribedMint,
      event.observedMint,
      event.signature,
      event.side,
      event.parserOutcome,
      event.normalizationOutcome,
      event.pipelineOutcome,
      event.usableForMetrics ? 1 : 0,
      event.duplicateKey,
      event.rejectionReason,
      event.failureStage,
      event.failureReason,
      event.normalizedPriceSol,
      event.normalizedVolumeSol,
      event.normalizedTokenAmount,
      event.trader,
      event.providerTimestamp,
      event.receivedAt,
      event.completedAt,
      event.postStop ? 1 : 0,
      stringifyJson(event.stageTimestamps),
      stringifyJson(event.stageLatenciesMs),
      stringifyJson(event.consistencyChecks),
      stringifyJson(event.reasonCodes),
      stringifyJson(event),
      event.createdAt
    );
  return event;
}

export function findTradeDataCoverageEventBySourceKey(
  sessionId: string,
  sourceEventKey: string
): TradeDataCoverageEvent | null {
  const row = getDb()
    .prepare(
      `select payload_json from trade_data_coverage_events
       where session_id = ? and source_event_key = ?
       order by id desc limit 1`
    )
    .get(sessionId, sourceEventKey) as { payload_json: string } | undefined;
  return row
    ? TradeDataCoverageEventSchema.parse(JSON.parse(row.payload_json))
    : null;
}

export function listTradeDataCoverageEvents(
  query: TradeDataCoverageEventQuery
): TradeDataCoverageEvent[] {
  const clauses: string[] = [];
  const parameters: Array<string | number> = [];
  const add = (column: string, value: string | undefined) => {
    if (value !== undefined) {
      clauses.push(`${column} = ?`);
      parameters.push(value);
    }
  };
  add("session_id", query.sessionId);
  add("observed_mint", query.mint);
  add("signature", query.signature);
  add("parser_outcome", query.parserOutcome);
  add("normalization_outcome", query.normalizationOutcome);
  add("pipeline_outcome", query.pipelineOutcome);
  if (query.usableForMetrics !== undefined) {
    clauses.push("usable_for_metrics = ?");
    parameters.push(query.usableForMetrics ? 1 : 0);
  }
  if (query.postStop !== undefined) {
    clauses.push("post_stop = ?");
    parameters.push(query.postStop ? 1 : 0);
  }
  const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
  const rows = getDb()
    .prepare(
      `select payload_json from trade_data_coverage_events ${where}
       order by received_at desc, id desc limit ? offset ?`
    )
    .all(...parameters, query.limit, query.offset) as {
    payload_json: string;
  }[];
  return rows.map((row) =>
    TradeDataCoverageEventSchema.parse(JSON.parse(row.payload_json))
  );
}

export function saveTradeDataSubscriptionEvent(
  input: TradeDataSubscriptionEvent
): TradeDataSubscriptionEvent {
  const event = TradeDataSubscriptionEventSchema.parse(input);
  getDb()
    .prepare(
      `insert into trade_data_coverage_subscription_events (
        subscription_event_id, session_id, mint, event_type, safe_reason,
        event_timestamp, payload_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(subscription_event_id) do nothing`
    )
    .run(
      event.subscriptionEventId,
      event.sessionId,
      event.mint,
      event.eventType,
      event.safeReason,
      event.timestamp,
      stringifyJson(event),
      event.createdAt
    );
  return event;
}

export function listTradeDataSubscriptionEvents(
  query: TradeDataSubscriptionEventQuery
): TradeDataSubscriptionEvent[] {
  const clauses: string[] = [];
  const parameters: Array<string | number> = [];
  const add = (column: string, value: string | undefined) => {
    if (value !== undefined) {
      clauses.push(`${column} = ?`);
      parameters.push(value);
    }
  };
  add("session_id", query.sessionId);
  add("mint", query.mint);
  add("event_type", query.eventType);
  const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
  const rows = getDb()
    .prepare(
      `select payload_json from trade_data_coverage_subscription_events ${where}
       order by event_timestamp desc, id desc limit ? offset ?`
    )
    .all(...parameters, query.limit, query.offset) as {
    payload_json: string;
  }[];
  return rows.map((row) =>
    TradeDataSubscriptionEventSchema.parse(JSON.parse(row.payload_json))
  );
}

function extractTradeCoverageCounters(
  session: TradeDataCoverageSession
): Record<string, number | boolean> {
  return {
    rawFrameCount: session.rawFrameCount,
    recognizedTradeCount: session.recognizedTradeCount,
    normalizationSuccessCount: session.normalizationSuccessCount,
    duplicateCount: session.duplicateCount,
    queueCommittedCount: session.queueCommittedCount,
    persistenceCompletedCount: session.persistenceCompletedCount,
    timeseriesAcceptedCount: session.timeseriesAcceptedCount,
    scannerProjectedCount: session.scannerProjectedCount,
    broadcastCompletedCount: session.broadcastCompletedCount,
    usableTradeCount: session.usableTradeCount,
    firstDerivativeAvailable: session.firstDerivativeAvailable,
    secondDerivativeAvailable: session.secondDerivativeAvailable
  };
}

export function saveSignal(signal: OverlaySignal): StoredSignal {
  const parsed = OverlaySignalSchema.parse(signal);
  const createdAt = new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into signals (
        mint,
        symbol,
        action,
        score,
        hard_reject,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.symbol,
      parsed.action,
      parsed.score,
      parsed.hardReject ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    symbol: parsed.symbol,
    action: parsed.action,
    score: parsed.score,
    hardReject: parsed.hardReject,
    reasonCodes: parsed.reasonCodes,
    payload: parsed,
    createdAt
  };
}

export function listRecentSignals(limit = 50): StoredSignal[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from signals
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as SignalRow[];

  return rows.map(mapSignalRow);
}

export function saveRiskSnapshot(snapshot: RiskSnapshot): StoredRiskSnapshot {
  const parsed = RiskSnapshotSchema.parse(snapshot);
  const createdAt = parsed.updatedAt;
  const db = getDb();

  const result = db
    .prepare(
      `insert into risk_snapshots (
        mint,
        risk_level,
        hard_reject,
        risk_score,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.riskLevel,
      parsed.hardReject ? 1 : 0,
      parsed.riskScore,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    riskLevel: parsed.riskLevel,
    hardReject: parsed.hardReject,
    riskScore: parsed.riskScore,
    reasonCodes: parsed.reasonCodes,
    payload: parsed,
    createdAt
  };
}

export function listRiskSnapshots(limit = 50): StoredRiskSnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from risk_snapshots
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as RiskSnapshotRow[];

  return rows.map(mapRiskSnapshotRow);
}

export function getLatestRiskSnapshot(mint: string): StoredRiskSnapshot | null {
  const row = getDb()
    .prepare(
      `select *
       from risk_snapshots
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(mint) as RiskSnapshotRow | undefined;

  return row ? mapRiskSnapshotRow(row) : null;
}

export function saveCandidateDecision(
  decision: CandidateDecision
): StoredCandidateDecision {
  const parsed = CandidateDecisionSchema.parse(decision);
  const createdAt = parsed.updatedAt;
  const db = getDb();

  const result = db
    .prepare(
      `insert into candidate_decisions (
        mint,
        symbol,
        lifecycle_state,
        action,
        score,
        risk_level,
        hard_reject,
        combined_reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.symbol ?? "UNKNOWN",
      parsed.lifecycleState,
      parsed.action,
      parsed.score,
      parsed.riskLevel,
      parsed.hardReject ? 1 : 0,
      stringifyJson(parsed.combinedReasonCodes),
      stringifyJson(parsed),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    symbol: parsed.symbol ?? "UNKNOWN",
    lifecycleState: parsed.lifecycleState,
    action: parsed.action,
    score: parsed.score,
    riskLevel: parsed.riskLevel,
    hardReject: parsed.hardReject,
    combinedReasonCodes: parsed.combinedReasonCodes,
    payload: parsed,
    createdAt
  };
}

export function listCandidateDecisions(limit = 50): StoredCandidateDecision[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from candidate_decisions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as CandidateDecisionRow[];

  return rows.map(mapCandidateDecisionRow);
}

export function getLatestCandidateDecision(
  mint: string
): StoredCandidateDecision | null {
  const row = getDb()
    .prepare(
      `select *
       from candidate_decisions
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(mint) as CandidateDecisionRow | undefined;

  return row ? mapCandidateDecisionRow(row) : null;
}

export function listFeedEvents(limit = 50): StoredFeedEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from feed_events
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as FeedEventRow[];

  return rows.map(mapFeedEventRow);
}

export function listSignalsForReplay(limit = 50): StoredSignal[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from signals
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as SignalRow[];

  return rows.map(mapSignalRow);
}

export function listRiskSnapshotsForReplay(limit = 50): StoredRiskSnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from risk_snapshots
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as RiskSnapshotRow[];

  return rows.map(mapRiskSnapshotRow);
}

export function listCandidateDecisionsForReplay(
  limit = 50
): StoredCandidateDecision[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from candidate_decisions
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as CandidateDecisionRow[];

  return rows.map(mapCandidateDecisionRow);
}

export function saveChainVerification(
  verification: ChainVerificationInput
): StoredChainVerification {
  const parsed = chainVerificationInputSchema.parse(verification);
  const now = new Date().toISOString();
  const inspectedAt = parsed.inspectedAt ?? now;
  const createdAt = parsed.createdAt ?? inspectedAt;
  const db = getDb();

  const result = db
    .prepare(
      `insert into chain_verifications (
        mint,
        status,
        reason_codes_json,
        mint_authority_active,
        freeze_authority_active,
        supply_ui,
        top_holder_pct,
        top10_holder_pct,
        payload_json,
        inspected_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.status,
      stringifyJson(parsed.reasonCodes),
      boolToNullableInt(parsed.mintAuthorityActive),
      boolToNullableInt(parsed.freezeAuthorityActive),
      parsed.supplyUi ?? null,
      parsed.topHolderPct ?? null,
      parsed.top10HolderPct ?? null,
      stringifyJson(parsed.payload),
      inspectedAt,
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    status: parsed.status,
    reasonCodes: parsed.reasonCodes,
    mintAuthorityActive: parsed.mintAuthorityActive ?? null,
    freezeAuthorityActive: parsed.freezeAuthorityActive ?? null,
    supplyUi: parsed.supplyUi ?? null,
    topHolderPct: parsed.topHolderPct ?? null,
    top10HolderPct: parsed.top10HolderPct ?? null,
    payload: parsed.payload,
    inspectedAt,
    createdAt
  };
}

export function listChainVerifications(limit = 50): StoredChainVerification[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_verifications
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ChainVerificationRow[];

  return rows.map(mapChainVerificationRow);
}

export function listChainVerificationsForReplay(
  limit = 50
): StoredChainVerification[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_verifications
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as ChainVerificationRow[];

  return rows.map(mapChainVerificationRow);
}

export function getLatestChainVerification(
  mint: string
): StoredChainVerification | null {
  const row = getDb()
    .prepare(
      `select *
       from chain_verifications
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(mint) as ChainVerificationRow | undefined;

  return row ? mapChainVerificationRow(row) : null;
}

export function saveChainTransactionEvent(
  event: ChainTransactionEventInput
): StoredChainTransactionEvent {
  const parsed = chainTransactionEventInputSchema.parse(
    event
  ) as ChainTransactionEvent;
  const db = getDb();

  const result = db
    .prepare(
      `insert into chain_transaction_events (
        signature,
        watched_address,
        watched_address_kind,
        mint,
        status,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.signature,
      parsed.watchedAddress,
      parsed.watchedAddressKind,
      parsed.mint ?? null,
      parsed.status,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      parsed.receivedAt
    );

  return {
    ...parsed,
    id: toRowId(result.lastInsertRowid),
    createdAt: parsed.receivedAt
  };
}

export function listChainTransactionEvents(
  limit = 50
): StoredChainTransactionEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_transaction_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ChainTransactionEventRow[];

  return rows.map(mapChainTransactionEventRow);
}

export function listChainTransactionEventsForReplay(
  limit = 50
): StoredChainTransactionEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_transaction_events
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as ChainTransactionEventRow[];

  return rows.map(mapChainTransactionEventRow);
}

export function getChainTransactionEvent(
  signature: string
): StoredChainTransactionEvent | null {
  const row = getDb()
    .prepare(
      `select *
       from chain_transaction_events
       where signature = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(signature) as ChainTransactionEventRow | undefined;

  return row ? mapChainTransactionEventRow(row) : null;
}

export function saveChainTradeEvent(
  event: ChainTradeEventInput
): StoredChainTradeEvent {
  const parsed = chainTradeEventInputSchema.parse(
    event
  ) as NormalizedChainTradeEvent;
  const db = getDb();

  const result = db
    .prepare(
      `insert into chain_trade_events (
        signature,
        mint,
        side,
        confidence,
        price_usd,
        volume_usd,
        token_amount,
        watched_address,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.signature,
      parsed.mint,
      parsed.side,
      parsed.confidence,
      parsed.priceUsd ?? null,
      parsed.volumeUsd ?? null,
      parsed.tokenAmount ?? null,
      parsed.watchedAddress,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      parsed.timestamp
    );

  return {
    ...parsed,
    id: toRowId(result.lastInsertRowid),
    createdAt: parsed.timestamp
  };
}

export function listChainTradeEvents(limit = 50): StoredChainTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_trade_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ChainTradeEventRow[];

  return rows.map(mapChainTradeEventRow);
}

export function listChainTradeEventsForReplay(
  limit = 50
): StoredChainTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from chain_trade_events
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as ChainTradeEventRow[];

  return rows.map(mapChainTradeEventRow);
}

export function getChainTradeEvent(
  signature: string
): StoredChainTradeEvent | null {
  const row = getDb()
    .prepare(
      `select *
       from chain_trade_events
       where signature = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(signature) as ChainTradeEventRow | undefined;

  return row ? mapChainTradeEventRow(row) : null;
}

export function saveMarketObservation(
  observation: MarketObservationInput
): StoredMarketObservation {
  const parsed = marketObservationInputSchema.parse(
    observation
  ) as MarketObservation;
  const db = getDb();

  const result = db
    .prepare(
      `insert into market_observations (
        signature,
        mint,
        side,
        quote_asset,
        quote_mint,
        base_token_amount,
        quote_amount,
        price_quote,
        price_sol,
        price_usd,
        volume_quote,
        volume_sol,
        volume_usd,
        confidence,
        usable_for_metrics,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.signature,
      parsed.mint,
      parsed.side,
      parsed.quoteAsset,
      parsed.quoteMint,
      parsed.baseTokenAmount,
      parsed.quoteAmount,
      parsed.priceQuote,
      parsed.priceSol,
      parsed.priceUsd,
      parsed.volumeQuote,
      parsed.volumeSol,
      parsed.volumeUsd,
      parsed.confidence,
      parsed.usableForMetrics ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed),
      parsed.createdAt
    );

  return {
    ...parsed,
    id: toRowId(result.lastInsertRowid),
    createdAt: parsed.createdAt
  };
}

export function listMarketObservations(limit = 50): StoredMarketObservation[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from market_observations
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as MarketObservationRow[];

  return rows.map(mapMarketObservationRow);
}

export function listMarketObservationsForReplay(
  limit = 50
): StoredMarketObservation[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from market_observations
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as MarketObservationRow[];

  return rows.map(mapMarketObservationRow);
}

export function listMarketObservationsByMint(
  mint: string,
  limit = 50
): StoredMarketObservation[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from market_observations
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as MarketObservationRow[];

  return rows.map(mapMarketObservationRow);
}

export function getMarketObservation(
  signature: string
): StoredMarketObservation | null {
  const row = getDb()
    .prepare(
      `select *
       from market_observations
       where signature = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(signature) as MarketObservationRow | undefined;

  return row ? mapMarketObservationRow(row) : null;
}

export function getLatestMarketObservation(
  mint: string
): StoredMarketObservation | null {
  const row = getDb()
    .prepare(
      `select *
       from market_observations
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(mint) as MarketObservationRow | undefined;

  return row ? mapMarketObservationRow(row) : null;
}

export function savePumpPortalTokenTradeEvent(
  event: PumpPortalTokenTradeEventInput
): StoredPumpPortalTokenTradeEvent {
  const parsed = pumpPortalTokenTradeEventInputSchema.parse(event);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into pumpportal_token_trade_events (
        mint,
        signature,
        side,
        trader,
        price_sol,
        volume_sol,
        token_amount,
        confidence,
        usable_for_metrics,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.signature ?? null,
      parsed.side,
      parsed.trader ?? null,
      parsed.priceSol ?? null,
      parsed.volumeSol ?? null,
      parsed.tokenAmount ?? null,
      parsed.confidence,
      parsed.usableForMetrics ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    signature: parsed.signature ?? null,
    side: parsed.side,
    trader: parsed.trader ?? null,
    priceSol: parsed.priceSol ?? null,
    volumeSol: parsed.volumeSol ?? null,
    tokenAmount: parsed.tokenAmount ?? null,
    confidence: parsed.confidence,
    usableForMetrics: parsed.usableForMetrics,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listPumpPortalTokenTradeEvents(
  limit = 50
): StoredPumpPortalTokenTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from pumpportal_token_trade_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PumpPortalTokenTradeEventRow[];

  return rows.map(mapPumpPortalTokenTradeEventRow);
}

export function listPumpPortalTokenTradeEventsForReplay(
  limit = 50
): StoredPumpPortalTokenTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from pumpportal_token_trade_events
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as PumpPortalTokenTradeEventRow[];

  return rows.map(mapPumpPortalTokenTradeEventRow);
}

export function listPumpPortalTokenTradeEventsByMint(
  mint: string,
  limit = 50
): StoredPumpPortalTokenTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from pumpportal_token_trade_events
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as PumpPortalTokenTradeEventRow[];

  return rows.map(mapPumpPortalTokenTradeEventRow);
}

export function getPumpPortalTokenTradeEvent(
  signature: string
): StoredPumpPortalTokenTradeEvent | null {
  const row = getDb()
    .prepare(
      `select *
       from pumpportal_token_trade_events
       where signature = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(signature) as PumpPortalTokenTradeEventRow | undefined;

  return row ? mapPumpPortalTokenTradeEventRow(row) : null;
}

export function saveLiveFeedEvent(
  event: LiveFeedEventInput
): StoredLiveFeedEvent {
  const parsed = liveFeedEventInputSchema.parse(event);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into live_feed_events (
        session_id,
        provider,
        event_type,
        mint,
        name,
        symbol,
        title,
        real_data,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.sessionId,
      parsed.provider,
      parsed.eventType,
      parsed.mint,
      parsed.name ?? null,
      parsed.symbol ?? null,
      parsed.title ?? null,
      parsed.realData ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    sessionId: parsed.sessionId,
    provider: parsed.provider,
    eventType: parsed.eventType,
    mint: parsed.mint,
    name: parsed.name ?? null,
    symbol: parsed.symbol ?? null,
    title: parsed.title ?? null,
    realData: parsed.realData,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listLiveFeedEvents(limit = 50): StoredLiveFeedEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from live_feed_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as LiveFeedEventRow[];

  return rows.map(mapLiveFeedEventRow);
}

export function listLiveFeedEventsBySession(
  sessionId: string,
  limit = 50
): StoredLiveFeedEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from live_feed_events
       where session_id = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(sessionId, parsedLimit) as LiveFeedEventRow[];

  return rows.map(mapLiveFeedEventRow);
}

export function listLiveFeedEventsByMint(
  mint: string,
  limit = 50
): StoredLiveFeedEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from live_feed_events
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as LiveFeedEventRow[];

  return rows.map(mapLiveFeedEventRow);
}

export function saveActualDataSubscription(
  subscription: ActualDataSubscriptionInput
): StoredActualDataSubscription {
  const parsed = actualDataSubscriptionInputSchema.parse(subscription);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into actual_data_subscriptions (
        mint,
        provider,
        status,
        reason,
        event_count,
        max_events,
        subscribed_at,
        unsubscribed_at,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.provider,
      parsed.status,
      parsed.reason,
      parsed.eventCount,
      parsed.maxEvents,
      parsed.subscribedAt ?? null,
      parsed.unsubscribedAt ?? null,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    provider: parsed.provider,
    status: parsed.status,
    reason: parsed.reason,
    eventCount: parsed.eventCount,
    maxEvents: parsed.maxEvents,
    subscribedAt: parsed.subscribedAt ?? null,
    unsubscribedAt: parsed.unsubscribedAt ?? null,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listActualDataSubscriptions(
  limit = 50
): StoredActualDataSubscription[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from actual_data_subscriptions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ActualDataSubscriptionRow[];

  return rows.map(mapActualDataSubscriptionRow);
}

export function listActualDataSubscriptionsForReplay(
  limit = 50
): StoredActualDataSubscription[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from actual_data_subscriptions
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as ActualDataSubscriptionRow[];

  return rows.map(mapActualDataSubscriptionRow);
}

export function listActualDataSubscriptionsByMint(
  mint: string,
  limit = 50
): StoredActualDataSubscription[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from actual_data_subscriptions
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as ActualDataSubscriptionRow[];

  return rows.map(mapActualDataSubscriptionRow);
}

export function saveActualDataSession(
  session: ActualDataSessionInput
): StoredActualDataSession {
  const parsed = actualDataSessionInputSchema.parse(session);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into actual_data_sessions (
        provider,
        status,
        total_event_count,
        subscribed_token_count,
        budget_event_limit,
        started_at,
        stopped_at,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.provider,
      parsed.status,
      parsed.totalEventCount,
      parsed.subscribedTokenCount,
      parsed.budgetEventLimit,
      parsed.startedAt ?? null,
      parsed.stoppedAt ?? null,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    provider: parsed.provider,
    status: parsed.status,
    totalEventCount: parsed.totalEventCount,
    subscribedTokenCount: parsed.subscribedTokenCount,
    budgetEventLimit: parsed.budgetEventLimit,
    startedAt: parsed.startedAt ?? null,
    stoppedAt: parsed.stoppedAt ?? null,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listActualDataSessions(limit = 50): StoredActualDataSession[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from actual_data_sessions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ActualDataSessionRow[];

  return rows.map(mapActualDataSessionRow);
}

export function listActualDataSessionsForReplay(
  limit = 50
): StoredActualDataSession[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from actual_data_sessions
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as ActualDataSessionRow[];

  return rows.map(mapActualDataSessionRow);
}

export function saveMeteredLaunchDataSession(
  session: MeteredLaunchDataSessionInput
): StoredMeteredLaunchDataSession {
  const parsed = meteredLaunchDataSessionInputSchema.parse(session);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const payload = sanitizeStoragePayload(parsed.payload);
  const db = getDb();

  const result = db
    .prepare(
      `insert into metered_launch_data_sessions (
        status,
        mode,
        tracked_mint_count,
        total_events,
        estimated_cost_sol,
        budget_reached,
        reason_codes_json,
        payload_json,
        started_at,
        stopped_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.status,
      parsed.mode,
      parsed.trackedMintCount,
      parsed.totalEvents,
      parsed.estimatedCostSol,
      parsed.budgetReached ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(payload),
      parsed.startedAt ?? null,
      parsed.stoppedAt ?? null,
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    status: parsed.status,
    mode: parsed.mode,
    trackedMintCount: parsed.trackedMintCount,
    totalEvents: parsed.totalEvents,
    estimatedCostSol: parsed.estimatedCostSol,
    budgetReached: parsed.budgetReached,
    reasonCodes: parsed.reasonCodes,
    payload,
    startedAt: parsed.startedAt ?? null,
    stoppedAt: parsed.stoppedAt ?? null,
    createdAt
  };
}

export function listMeteredLaunchDataSessions(
  limit = 50
): StoredMeteredLaunchDataSession[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from metered_launch_data_sessions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as MeteredLaunchDataSessionRow[];

  return rows.map(mapMeteredLaunchDataSessionRow);
}

export function saveMeteredLaunchDataSubscription(
  subscription: MeteredLaunchDataSubscriptionInput
): StoredMeteredLaunchDataSubscription {
  const parsed = meteredLaunchDataSubscriptionInputSchema.parse(subscription);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const payload = sanitizeStoragePayload(parsed.payload);
  const db = getDb();

  const result = db
    .prepare(
      `insert into metered_launch_data_subscriptions (
        mint,
        status,
        reason,
        event_count,
        estimated_cost_sol,
        subscribed_at,
        unsubscribed_at,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.status,
      parsed.reason,
      parsed.eventCount,
      parsed.estimatedCostSol,
      parsed.subscribedAt ?? null,
      parsed.unsubscribedAt ?? null,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    status: parsed.status,
    reason: parsed.reason,
    eventCount: parsed.eventCount,
    estimatedCostSol: parsed.estimatedCostSol,
    subscribedAt: parsed.subscribedAt ?? null,
    unsubscribedAt: parsed.unsubscribedAt ?? null,
    reasonCodes: parsed.reasonCodes,
    payload,
    createdAt
  };
}

export function listMeteredLaunchDataSubscriptions(
  limit = 50
): StoredMeteredLaunchDataSubscription[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from metered_launch_data_subscriptions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as MeteredLaunchDataSubscriptionRow[];

  return rows.map(mapMeteredLaunchDataSubscriptionRow);
}

export function listMeteredLaunchDataSubscriptionsByMint(
  mint: string,
  limit = 50
): StoredMeteredLaunchDataSubscription[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from metered_launch_data_subscriptions
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as MeteredLaunchDataSubscriptionRow[];

  return rows.map(mapMeteredLaunchDataSubscriptionRow);
}

export function saveMeteredLaunchDataEvent(
  event: MeteredLaunchDataEventInput
): StoredMeteredLaunchDataEvent {
  const parsed = meteredLaunchDataEventInputSchema.parse(event);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const payload = sanitizeStoragePayload(parsed.payload);
  const db = getDb();

  const result = db
    .prepare(
      `insert into metered_launch_data_events (
        mint,
        signature,
        side,
        trader,
        price_sol,
        volume_sol,
        token_amount,
        usable_for_metrics,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.signature ?? null,
      parsed.side,
      parsed.trader ?? null,
      parsed.priceSol ?? null,
      parsed.volumeSol ?? null,
      parsed.tokenAmount ?? null,
      parsed.usableForMetrics ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    signature: parsed.signature ?? null,
    side: parsed.side,
    trader: parsed.trader ?? null,
    priceSol: parsed.priceSol ?? null,
    volumeSol: parsed.volumeSol ?? null,
    tokenAmount: parsed.tokenAmount ?? null,
    usableForMetrics: parsed.usableForMetrics,
    reasonCodes: parsed.reasonCodes,
    payload,
    createdAt
  };
}

export function listMeteredLaunchDataEvents(
  limit = 50
): StoredMeteredLaunchDataEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from metered_launch_data_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as MeteredLaunchDataEventRow[];

  return rows.map(mapMeteredLaunchDataEventRow);
}

export function listMeteredLaunchDataEventsByMint(
  mint: string,
  limit = 50
): StoredMeteredLaunchDataEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from metered_launch_data_events
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as MeteredLaunchDataEventRow[];

  return rows.map(mapMeteredLaunchDataEventRow);
}

export function saveLaunchCandidate(
  candidate: LaunchCandidateInput
): StoredLaunchCandidate {
  const parsed = launchCandidateInputSchema.parse(candidate);
  const now = new Date().toISOString();
  const discoveredAt = parsed.discoveredAt ?? parsed.createdAt ?? now;
  const latestEventAt = parsed.latestEventAt ?? discoveredAt;
  const createdAt = parsed.createdAt ?? now;
  const db = getDb();

  db.prepare(
    `insert into launch_candidates (
      mint,
      source,
      event_type,
      name,
      symbol,
      title,
      status,
      reason_codes_json,
      payload_json,
      discovered_at,
      latest_event_at,
      created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(mint) do update set
      source = excluded.source,
      event_type = excluded.event_type,
      name = excluded.name,
      symbol = excluded.symbol,
      title = excluded.title,
      status = excluded.status,
      reason_codes_json = excluded.reason_codes_json,
      payload_json = excluded.payload_json,
      latest_event_at = excluded.latest_event_at`
  ).run(
    parsed.mint,
    parsed.source,
    parsed.eventType,
    parsed.name ?? null,
    parsed.symbol ?? null,
    parsed.title ?? null,
    parsed.status,
    stringifyJson(parsed.reasonCodes),
    stringifyJson(parsed.payload),
    discoveredAt,
    latestEventAt,
    createdAt
  );

  const row = db
    .prepare("select * from launch_candidates where mint = ?")
    .get(parsed.mint) as LaunchCandidateRow | undefined;

  if (!row) {
    throw new Error(`Failed to save launch candidate for ${parsed.mint}`);
  }

  return mapLaunchCandidateRow(row);
}

export function listLaunchCandidates(limit = 50): StoredLaunchCandidate[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_candidates
       order by datetime(latest_event_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as LaunchCandidateRow[];

  return rows.map(mapLaunchCandidateRow);
}

export function getLaunchCandidate(mint: string): StoredLaunchCandidate | null {
  const row = getDb()
    .prepare("select * from launch_candidates where mint = ?")
    .get(mint) as LaunchCandidateRow | undefined;

  return row ? mapLaunchCandidateRow(row) : null;
}

export function saveLaunchTradeSample(
  sample: LaunchTradeSampleInput
): StoredLaunchTradeSample {
  const parsed = launchTradeSampleInputSchema.parse(sample);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();
  const result = db
    .prepare(
      `insert into launch_trade_samples (
        mint,
        signature,
        side,
        trader,
        price_sol,
        volume_sol,
        token_amount,
        confidence,
        usable_for_metrics,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.signature ?? null,
      parsed.side,
      parsed.trader ?? null,
      parsed.priceSol ?? null,
      parsed.volumeSol ?? null,
      parsed.tokenAmount ?? null,
      parsed.confidence,
      parsed.usableForMetrics ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    signature: parsed.signature ?? null,
    side: parsed.side,
    trader: parsed.trader ?? null,
    priceSol: parsed.priceSol ?? null,
    volumeSol: parsed.volumeSol ?? null,
    tokenAmount: parsed.tokenAmount ?? null,
    confidence: parsed.confidence,
    usableForMetrics: parsed.usableForMetrics,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listLaunchTradeSamplesByMint(
  mint: string,
  limit = 250
): StoredLaunchTradeSample[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_trade_samples
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as LaunchTradeSampleRow[];

  return rows.map(mapLaunchTradeSampleRow);
}

export function upsertLaunchTimeseriesBucket(
  bucket: LaunchTimeseriesBucketInput
): StoredLaunchTimeseriesBucket {
  const parsed = launchTimeseriesBucketInputSchema.parse(bucket);
  const createdAt = parsed.createdAt ?? parsed.bucketStart;
  const updatedAt = parsed.updatedAt ?? parsed.lastTradeAt ?? parsed.bucketEnd;
  const db = getDb();

  db.prepare(
    `insert into launch_timeseries_buckets (
      mint,
      bucket_start,
      bucket_end,
      trade_count,
      volume_sol,
      volume_usd,
      close_sol,
      close_usd,
      reason_codes_json,
      payload_json,
      created_at,
      updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(mint, bucket_start) do update set
      bucket_end = excluded.bucket_end,
      trade_count = excluded.trade_count,
      volume_sol = excluded.volume_sol,
      volume_usd = excluded.volume_usd,
      close_sol = excluded.close_sol,
      close_usd = excluded.close_usd,
      reason_codes_json = excluded.reason_codes_json,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`
  ).run(
    parsed.mint,
    parsed.bucketStart,
    parsed.bucketEnd,
    parsed.tradeCount,
    parsed.volumeSol,
    parsed.volumeUsd,
    parsed.closeSol,
    parsed.closeUsd,
    stringifyJson(parsed.reasonCodes),
    stringifyJson(parsed),
    createdAt,
    updatedAt
  );

  const row = db
    .prepare(
      `select * from launch_timeseries_buckets
       where mint = ? and bucket_start = ?`
    )
    .get(parsed.mint, parsed.bucketStart) as
    LaunchTimeseriesBucketRow | undefined;

  if (!row) {
    throw new Error(
      `Failed to save launch timeseries bucket for ${parsed.mint} at ${parsed.bucketStart}`
    );
  }

  return mapLaunchTimeseriesBucketRow(row);
}

export function listLaunchTimeseriesBucketsByMint(
  mint: string,
  limit = 300
): StoredLaunchTimeseriesBucket[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_timeseries_buckets
       where mint = ?
       order by datetime(bucket_start) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as LaunchTimeseriesBucketRow[];

  return rows.map(mapLaunchTimeseriesBucketRow);
}

export function listLaunchTimeseriesBucketsByMintBetween(
  mint: string,
  afterExclusive: string,
  beforeInclusive: string,
  limit = 1_000
): StoredLaunchTimeseriesBucket[] {
  const parsedMint = z.string().min(1).parse(mint);
  const parsedAfter = z.string().datetime().parse(afterExclusive);
  const parsedBefore = z.string().datetime().parse(beforeInclusive);
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_timeseries_buckets
       where mint = ?
         and datetime(bucket_end) > datetime(?)
         and datetime(bucket_end) <= datetime(?)
       order by datetime(bucket_end) asc, id asc
       limit ?`
    )
    .all(
      parsedMint,
      parsedAfter,
      parsedBefore,
      parsedLimit
    ) as LaunchTimeseriesBucketRow[];

  return rows.map(mapLaunchTimeseriesBucketRow);
}

export function listLaunchTimeseriesBucketsForReplay(
  limit = 300
): StoredLaunchTimeseriesBucket[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_timeseries_buckets
       order by datetime(bucket_start) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as LaunchTimeseriesBucketRow[];

  return rows.map(mapLaunchTimeseriesBucketRow);
}

export function saveLaunchScoreSnapshot(
  snapshot: LaunchScoreSnapshotInput
): StoredLaunchScoreSnapshot {
  const parsed = launchScoreSnapshotInputSchema.parse(snapshot);
  const evaluatedAt =
    parsed.evaluatedAt ?? parsed.createdAt ?? new Date().toISOString();
  const createdAt = parsed.createdAt ?? evaluatedAt;
  const db = getDb();
  const result = db
    .prepare(
      `insert into launch_score_snapshots (
        mint,
        score,
        label,
        phase,
        trade_sample_count,
        price_sol,
        volume_sol,
        reason_codes_json,
        payload_json,
        evaluated_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.score,
      parsed.label,
      parsed.phase,
      parsed.tradeSampleCount,
      parsed.priceSol ?? null,
      parsed.volumeSol,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      evaluatedAt,
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    score: parsed.score,
    label: parsed.label,
    phase: parsed.phase,
    tradeSampleCount: parsed.tradeSampleCount,
    priceSol: parsed.priceSol ?? null,
    volumeSol: parsed.volumeSol,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    evaluatedAt,
    createdAt
  };
}

export function listLaunchScoreSnapshots(
  limit = 50
): StoredLaunchScoreSnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_score_snapshots
       order by score desc, datetime(evaluated_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as LaunchScoreSnapshotRow[];

  return rows.map(mapLaunchScoreSnapshotRow);
}

export function listLaunchScoreSnapshotsByMint(
  mint: string,
  limit = 50
): StoredLaunchScoreSnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_score_snapshots
       where mint = ?
       order by datetime(evaluated_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as LaunchScoreSnapshotRow[];

  return rows.map(mapLaunchScoreSnapshotRow);
}

export function saveLaunchTrackingEvent(
  event: LaunchTrackingEventInput
): StoredLaunchTrackingEvent {
  const parsed = launchTrackingEventInputSchema.parse(event);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();
  const result = db
    .prepare(
      `insert into launch_tracking_events (
        mint,
        action,
        status,
        reason,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.action,
      parsed.status,
      parsed.reason,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    action: parsed.action,
    status: parsed.status,
    reason: parsed.reason,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listLaunchTrackingEvents(
  limit = 50
): StoredLaunchTrackingEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_tracking_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as LaunchTrackingEventRow[];

  return rows.map(mapLaunchTrackingEventRow);
}

export function saveLaunchTrackingSession(
  session: LaunchTrackingSessionInput
): StoredLaunchTrackingSession {
  const parsed = launchTrackingSessionInputSchema.parse(session);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();
  const result = db
    .prepare(
      `insert into launch_tracking_sessions (
        provider,
        status,
        tracked_token_count,
        total_event_count,
        estimated_cost_sol,
        budget_limit_sol,
        reason_codes_json,
        payload_json,
        started_at,
        stopped_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.provider,
      parsed.status,
      parsed.trackedTokenCount,
      parsed.totalEventCount,
      parsed.estimatedCostSol ?? null,
      parsed.budgetLimitSol,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      parsed.startedAt ?? null,
      parsed.stoppedAt ?? null,
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    provider: parsed.provider,
    status: parsed.status,
    trackedTokenCount: parsed.trackedTokenCount,
    totalEventCount: parsed.totalEventCount,
    estimatedCostSol: parsed.estimatedCostSol ?? null,
    budgetLimitSol: parsed.budgetLimitSol,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    startedAt: parsed.startedAt ?? null,
    stoppedAt: parsed.stoppedAt ?? null,
    createdAt
  };
}

export function listLaunchTrackingSessions(
  limit = 50
): StoredLaunchTrackingSession[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from launch_tracking_sessions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as LaunchTrackingSessionRow[];

  return rows.map(mapLaunchTrackingSessionRow);
}

export function saveTokenIdentity(
  identity: TokenIdentity
): StoredTokenIdentity {
  const parsed = tokenIdentityInputSchema.parse(identity) as TokenIdentity;
  const createdAt = new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into token_identities (
        mint,
        name,
        symbol,
        title,
        display_name,
        metadata_uri,
        image_uri,
        description,
        website,
        twitter,
        telegram,
        discord,
        creator,
        confidence,
        completeness_score,
        real_data,
        data_source,
        reason_codes_json,
        sources_json,
        payload_json,
        first_seen_at,
        updated_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(...tokenIdentityValues(parsed, createdAt));

  return {
    ...parsed,
    id: toRowId(result.lastInsertRowid),
    createdAt
  };
}

export function upsertTokenIdentity(
  identity: TokenIdentity
): StoredTokenIdentity {
  const parsed = tokenIdentityInputSchema.parse(identity) as TokenIdentity;
  const createdAt = new Date().toISOString();
  const db = getDb();

  db.prepare(
    `insert into token_identities (
      mint,
      name,
      symbol,
      title,
      display_name,
      metadata_uri,
      image_uri,
      description,
      website,
      twitter,
      telegram,
      discord,
      creator,
      confidence,
      completeness_score,
      real_data,
      data_source,
      reason_codes_json,
      sources_json,
      payload_json,
      first_seen_at,
      updated_at,
      created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(mint) do update set
      name = excluded.name,
      symbol = excluded.symbol,
      title = excluded.title,
      display_name = excluded.display_name,
      metadata_uri = excluded.metadata_uri,
      image_uri = excluded.image_uri,
      description = excluded.description,
      website = excluded.website,
      twitter = excluded.twitter,
      telegram = excluded.telegram,
      discord = excluded.discord,
      creator = excluded.creator,
      confidence = excluded.confidence,
      completeness_score = excluded.completeness_score,
      real_data = excluded.real_data,
      data_source = excluded.data_source,
      reason_codes_json = excluded.reason_codes_json,
      sources_json = excluded.sources_json,
      payload_json = excluded.payload_json,
      first_seen_at = excluded.first_seen_at,
      updated_at = excluded.updated_at`
  ).run(...tokenIdentityValues(parsed, createdAt));

  const stored = getTokenIdentity(parsed.mint);

  if (!stored) {
    throw new Error(`Failed to upsert token identity for ${parsed.mint}`);
  }

  return stored;
}

export function listTokenIdentities(limit = 50): StoredTokenIdentity[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from token_identities
       order by datetime(updated_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as TokenIdentityRow[];

  return rows.map(mapTokenIdentityRow);
}

export function listTokenIdentitiesForReplay(
  limit = 50
): StoredTokenIdentity[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from token_identities
       order by datetime(updated_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as TokenIdentityRow[];

  return rows.map(mapTokenIdentityRow);
}

export function getTokenIdentity(mint: string): StoredTokenIdentity | null {
  const row = getDb()
    .prepare(
      `select *
       from token_identities
       where mint = ?
       order by datetime(updated_at) desc, id desc
       limit 1`
    )
    .get(mint) as TokenIdentityRow | undefined;

  return row ? mapTokenIdentityRow(row) : null;
}

export function listUnresolvedTokenIdentities(
  limit = 50
): StoredTokenIdentity[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from token_identities
       where (name is null or name = '') and (symbol is null or symbol = '')
       order by datetime(updated_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as TokenIdentityRow[];

  return rows.map(mapTokenIdentityRow);
}

export function saveTokenMetadataFetch(
  fetchResult: TokenMetadataFetchInput
): StoredTokenMetadataFetch {
  const parsed = tokenMetadataFetchInputSchema.parse(fetchResult);
  const fetchedAt = parsed.fetchedAt ?? new Date().toISOString();
  const createdAt = parsed.createdAt ?? fetchedAt;
  const db = getDb();

  const result = db
    .prepare(
      `insert into token_metadata_fetches (
        mint,
        uri,
        source,
        status,
        reason_codes_json,
        payload_json,
        fetched_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.uri ?? null,
      parsed.source,
      parsed.status,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      fetchedAt,
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    uri: parsed.uri ?? null,
    source: parsed.source,
    status: parsed.status,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    fetchedAt,
    createdAt
  };
}

export function listTokenMetadataFetches(
  limit = 50
): StoredTokenMetadataFetch[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from token_metadata_fetches
       order by datetime(fetched_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as TokenMetadataFetchRow[];

  return rows.map(mapTokenMetadataFetchRow);
}

export function listTokenMetadataFetchesForReplay(
  limit = 50
): StoredTokenMetadataFetch[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from token_metadata_fetches
       order by datetime(fetched_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as TokenMetadataFetchRow[];

  return rows.map(mapTokenMetadataFetchRow);
}

export function listTokenMetadataFetchesByMint(
  mint: string,
  limit = 50
): StoredTokenMetadataFetch[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from token_metadata_fetches
       where mint = ?
       order by datetime(fetched_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as TokenMetadataFetchRow[];

  return rows.map(mapTokenMetadataFetchRow);
}

export function saveWatchPlan(plan: WatchPlanInput): StoredWatchPlan {
  const parsed = watchPlanInputSchema.parse(plan) as WatchPlanInput;
  const payload = parsed.payload ?? parsed;
  const db = getDb();

  const result = db
    .prepare(
      `insert into watch_plans (
        mint,
        symbol,
        source,
        should_verify_mint,
        should_watch_events,
        watch_targets_json,
        skipped_targets_json,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.symbol ?? null,
      parsed.source ?? null,
      parsed.shouldVerifyMint ? 1 : 0,
      parsed.shouldWatchEvents ? 1 : 0,
      stringifyJson(parsed.watchTargets),
      stringifyJson(parsed.skippedTargets),
      stringifyJson(parsed.reasonCodes),
      stringifyJson(payload),
      parsed.createdAt
    );

  return {
    ...parsed,
    id: toRowId(result.lastInsertRowid),
    payload,
    createdAt: parsed.createdAt
  };
}

export function listWatchPlans(limit = 50): StoredWatchPlan[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from watch_plans
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as WatchPlanRow[];

  return rows.map(mapWatchPlanRow);
}

export function listWatchPlansForReplay(limit = 50): StoredWatchPlan[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from watch_plans
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as WatchPlanRow[];

  return rows.map(mapWatchPlanRow);
}

export function getLatestWatchPlan(mint: string): StoredWatchPlan | null {
  const row = getDb()
    .prepare(
      `select *
       from watch_plans
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(mint) as WatchPlanRow | undefined;

  return row ? mapWatchPlanRow(row) : null;
}

export function saveWatchAction(action: WatchActionInput): StoredWatchAction {
  const parsed = watchActionInputSchema.parse(action);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into watch_actions (
        mint,
        action,
        address,
        address_kind,
        status,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.action,
      parsed.address,
      parsed.addressKind,
      parsed.status,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    action: parsed.action,
    address: parsed.address,
    addressKind: parsed.addressKind,
    status: parsed.status,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listWatchActions(limit = 50): StoredWatchAction[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from watch_actions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as WatchActionRow[];

  return rows.map(mapWatchActionRow);
}

export function listWatchActionsForReplay(limit = 50): StoredWatchAction[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from watch_actions
       order by datetime(created_at) asc, id asc
       limit ?`
    )
    .all(parsedLimit) as WatchActionRow[];

  return rows.map(mapWatchActionRow);
}

export function listWatchActionsByMint(
  mint: string,
  limit = 50
): StoredWatchAction[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from watch_actions
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as WatchActionRow[];

  return rows.map(mapWatchActionRow);
}

export function saveLightningTradePlan(
  plan: LightningTradePlanStorageInput
): StoredLightningTradePlan {
  const parsed = lightningTradePlanInputSchema.parse(plan);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const request = sanitizeStoragePayload(parsed.request);
  const payload = sanitizeStoragePayload(parsed.payload);
  const db = getDb();

  const result = db
    .prepare(
      `insert into lightning_trade_plans (
        plan_id,
        mint,
        action,
        amount_sol,
        mode,
        blocked,
        blockers_json,
        warnings_json,
        request_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.planId,
      parsed.mint,
      parsed.action,
      parsed.amountSol,
      parsed.mode,
      parsed.blocked ? 1 : 0,
      stringifyJson(parsed.blockers),
      stringifyJson(parsed.warnings),
      stringifyJson(request),
      stringifyJson(payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    planId: parsed.planId,
    mint: parsed.mint,
    action: parsed.action,
    amountSol: parsed.amountSol,
    mode: parsed.mode,
    blocked: parsed.blocked,
    blockers: parsed.blockers,
    warnings: parsed.warnings,
    request,
    payload,
    createdAt
  };
}

export function listLightningTradePlans(
  limit = 50
): StoredLightningTradePlan[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from lightning_trade_plans
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as LightningTradePlanRow[];

  return rows.map(mapLightningTradePlanRow);
}

export function saveRuntimeSession(
  session: RuntimeSessionInput
): StoredRuntimeSession {
  const parsed = runtimeSessionInputSchema.parse(session);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  db.prepare(
    `insert into runtime_sessions (
      session_id,
      runtime_mode,
      paid_data_armed,
      started_at,
      stopped_at,
      stop_reason,
      config_fingerprint,
      created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(session_id) do update set
      runtime_mode = excluded.runtime_mode,
      paid_data_armed = excluded.paid_data_armed,
      started_at = excluded.started_at,
      stopped_at = excluded.stopped_at,
      stop_reason = excluded.stop_reason,
      config_fingerprint = excluded.config_fingerprint`
  ).run(
    parsed.sessionId,
    parsed.runtimeMode,
    parsed.paidDataArmed ? 1 : 0,
    parsed.startedAt,
    parsed.stoppedAt ?? null,
    parsed.stopReason ?? null,
    parsed.configFingerprint,
    createdAt
  );

  const row = db
    .prepare("select * from runtime_sessions where session_id = ?")
    .get(parsed.sessionId) as RuntimeSessionRow | undefined;

  if (!row) {
    throw new Error(`Runtime session ${parsed.sessionId} was not persisted.`);
  }

  return mapRuntimeSessionRow(row);
}

export function listRuntimeSessions(limit = 50): StoredRuntimeSession[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from runtime_sessions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as RuntimeSessionRow[];

  return rows.map(mapRuntimeSessionRow);
}

export function saveCalibrationCaptureSession(
  session: CalibrationCaptureSession
): StoredCalibrationCaptureSession {
  const parsed = calibrationCaptureSessionSchema.parse(session);
  assertCalibrationCaptureSessionState(parsed);
  const existing = getCalibrationCaptureSession(parsed.sessionId);

  if (
    existing &&
    calibrationCaptureSessionImmutableFieldsDiffer(existing, parsed)
  ) {
    throw new Error(
      `Calibration capture session ${parsed.sessionId} immutable fields do not match.`
    );
  }

  if (
    existing &&
    existing.status !== "active" &&
    (existing.status !== parsed.status ||
      existing.stoppedAt !== parsed.stoppedAt ||
      existing.stopReason !== parsed.stopReason ||
      JSON.stringify(existing.reasonCodes) !==
        JSON.stringify(parsed.reasonCodes) ||
      existing.updatedAt !== parsed.updatedAt)
  ) {
    throw new Error(
      `Calibration capture session ${parsed.sessionId} cannot change after it is closed.`
    );
  }

  const db = getDb();

  db.prepare(
    `insert into calibration_capture_sessions (
      session_id,
      runtime_session_id,
      strategy_version,
      partition,
      status,
      started_at,
      stopped_at,
      payload_json,
      created_at,
      updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(session_id) do update set
      status = excluded.status,
      stopped_at = excluded.stopped_at,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`
  ).run(
    parsed.sessionId,
    parsed.runtimeSessionId,
    parsed.strategyVersion,
    parsed.partition,
    parsed.status,
    parsed.startedAt,
    parsed.stoppedAt,
    stringifyJson(parsed),
    parsed.createdAt,
    parsed.updatedAt
  );

  const stored = getCalibrationCaptureSession(parsed.sessionId);

  if (!stored) {
    throw new Error(
      `Calibration capture session ${parsed.sessionId} was not persisted.`
    );
  }

  return stored;
}

export function getCalibrationCaptureSession(
  sessionId: string
): StoredCalibrationCaptureSession | null {
  const row = getDb()
    .prepare("select * from calibration_capture_sessions where session_id = ?")
    .get(sessionId) as CalibrationCaptureSessionRow | undefined;

  return row ? mapCalibrationCaptureSessionRow(row) : null;
}

export function getActiveCalibrationCaptureSessionForRuntime(
  runtimeSessionId: string
): StoredCalibrationCaptureSession | null {
  const row = getDb()
    .prepare(
      `select *
       from calibration_capture_sessions
       where runtime_session_id = ? and status = 'active'
       order by datetime(started_at) desc, id desc
       limit 1`
    )
    .get(runtimeSessionId) as CalibrationCaptureSessionRow | undefined;

  return row ? mapCalibrationCaptureSessionRow(row) : null;
}

export function listCalibrationCaptureSessions(
  limit = 50
): StoredCalibrationCaptureSession[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from calibration_capture_sessions
       order by datetime(started_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as CalibrationCaptureSessionRow[];

  return rows.map(mapCalibrationCaptureSessionRow);
}

export function saveCapturedSignalObservation(
  observation: CapturedSignalObservation
): StoredCapturedSignalObservation {
  const parsed = capturedSignalObservationSchema.parse(observation);
  assertCapturedSignalObservationState(parsed);
  const session = getCalibrationCaptureSession(parsed.captureSessionId);

  if (!session) {
    throw new Error(
      `Calibration capture session ${parsed.captureSessionId} was not found for observation ${parsed.observationId}.`
    );
  }

  if (
    session.runtimeSessionId !== parsed.runtimeSessionId ||
    session.strategyVersion !== parsed.strategyVersion ||
    session.partition !== parsed.partition ||
    session.config.horizonMs !== parsed.horizonMs ||
    session.config.targetReturnPct !== parsed.targetReturnPct ||
    session.config.estimatedCostPct !== parsed.estimatedCostPct ||
    session.config.maxOutcomeLagMs !== parsed.maxOutcomeLagMs
  ) {
    throw new Error(
      `Captured observation ${parsed.observationId} does not match its capture session policy.`
    );
  }

  const existing = getCapturedSignalObservation(parsed.observationId);

  if (
    existing &&
    capturedSignalObservationImmutableFieldsDiffer(existing, parsed)
  ) {
    throw new Error(
      `Captured observation ${parsed.observationId} immutable fields do not match.`
    );
  }

  if (
    existing &&
    (existing.status === "complete" ||
      (existing.status === "unavailable" && parsed.status === "pending")) &&
    (existing.status !== parsed.status ||
      existing.outcomeAt !== parsed.outcomeAt ||
      existing.outcomePriceSol !== parsed.outcomePriceSol ||
      existing.forwardReturnPct !== parsed.forwardReturnPct ||
      existing.maxFavorableExcursionPct !== parsed.maxFavorableExcursionPct ||
      existing.maxAdverseExcursionPct !== parsed.maxAdverseExcursionPct ||
      existing.targetReached !== parsed.targetReached ||
      JSON.stringify(existing.reasonCodes) !==
        JSON.stringify(parsed.reasonCodes) ||
      existing.updatedAt !== parsed.updatedAt)
  ) {
    throw new Error(
      `Captured observation ${parsed.observationId} cannot regress or change a completed outcome.`
    );
  }

  const db = getDb();
  db.prepare(
    `insert into calibration_signal_observations (
      observation_id,
      capture_session_id,
      runtime_session_id,
      mint,
      strategy_version,
      partition,
      source_snapshot_id,
      signal_at,
      score,
      status,
      outcome_at,
      payload_json,
      created_at,
      updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(observation_id) do update set
      status = excluded.status,
      outcome_at = excluded.outcome_at,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`
  ).run(
    parsed.observationId,
    parsed.captureSessionId,
    parsed.runtimeSessionId,
    parsed.mint,
    parsed.strategyVersion,
    parsed.partition,
    parsed.sourceSnapshotId,
    parsed.signalAt,
    parsed.score,
    parsed.status,
    parsed.outcomeAt,
    stringifyJson(parsed),
    parsed.createdAt,
    parsed.updatedAt
  );

  const stored = getCapturedSignalObservation(parsed.observationId);

  if (!stored) {
    throw new Error(
      `Captured observation ${parsed.observationId} was not persisted.`
    );
  }

  return stored;
}

export function getCapturedSignalObservation(
  observationId: string
): StoredCapturedSignalObservation | null {
  const row = getDb()
    .prepare(
      "select * from calibration_signal_observations where observation_id = ?"
    )
    .get(observationId) as CalibrationSignalObservationRow | undefined;

  return row ? mapCalibrationSignalObservationRow(row) : null;
}

export function getLatestCapturedSignalObservationByMint(
  captureSessionId: string,
  mint: string
): StoredCapturedSignalObservation | null {
  const row = getDb()
    .prepare(
      `select *
       from calibration_signal_observations
       where capture_session_id = ? and mint = ?
       order by datetime(signal_at) desc, id desc
       limit 1`
    )
    .get(captureSessionId, mint) as CalibrationSignalObservationRow | undefined;

  return row ? mapCalibrationSignalObservationRow(row) : null;
}

export function getCalibrationCaptureObservationCounts(
  captureSessionId: string
): CalibrationCaptureObservationCounts {
  const row = getDb()
    .prepare(
      `select
         count(*) as observation_count,
         coalesce(sum(case when status = 'complete' then 1 else 0 end), 0) as completed_count,
         coalesce(sum(case when status = 'pending' then 1 else 0 end), 0) as pending_count,
         coalesce(sum(case when status = 'unavailable' then 1 else 0 end), 0) as unavailable_count
       from calibration_signal_observations
       where capture_session_id = ?`
    )
    .get(captureSessionId) as {
    observation_count: number;
    completed_count: number;
    pending_count: number;
    unavailable_count: number;
  };

  return {
    observationCount: row.observation_count,
    completedCount: row.completed_count,
    pendingCount: row.pending_count,
    unavailableCount: row.unavailable_count
  };
}

export function listCapturedSignalObservationsBySession(
  captureSessionId: string,
  options: {
    limit?: number | undefined;
    status?: CapturedObservationStatus | undefined;
  } = {}
): StoredCapturedSignalObservation[] {
  const limit = calibrationObservationLimitSchema.parse(
    options.limit ?? 10_000
  );
  const rows = options.status
    ? (getDb()
        .prepare(
          `select *
           from calibration_signal_observations
           where capture_session_id = ? and status = ?
           order by datetime(signal_at) asc, mint asc, id asc
           limit ?`
        )
        .all(
          captureSessionId,
          options.status,
          limit
        ) as CalibrationSignalObservationRow[])
    : (getDb()
        .prepare(
          `select *
           from calibration_signal_observations
           where capture_session_id = ?
           order by datetime(signal_at) asc, mint asc, id asc
           limit ?`
        )
        .all(captureSessionId, limit) as CalibrationSignalObservationRow[]);

  return rows.map(mapCalibrationSignalObservationRow);
}

export function savePaperStrategyEvaluation(
  report: PaperStrategyEvaluationReport
): StoredPaperStrategyEvaluation {
  const parsed = parsePaperStrategyEvaluation(report);
  const existing = getPaperStrategyEvaluation(parsed.evaluationId);

  if (existing) {
    const { id: _id, ...existingReport } = existing;
    void _id;

    if (stringifyJson(existingReport) !== stringifyJson(parsed)) {
      throw new Error(
        `Paper strategy evaluation ${parsed.evaluationId} is immutable and already exists with different data.`
      );
    }

    return existing;
  }

  const db = getDb();
  db.prepare(
    `insert into paper_strategy_evaluations (
      evaluation_id,
      evaluation_version,
      strategy_version,
      status,
      selected_threshold,
      capture_session_ids_json,
      payload_json,
      evaluated_at,
      created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    parsed.evaluationId,
    parsed.evaluationVersion,
    parsed.strategyVersion,
    parsed.evaluationStatus,
    parsed.selectedThreshold,
    stringifyJson(parsed.captureSessionIds),
    stringifyJson(parsed),
    parsed.evaluatedAt,
    parsed.evaluatedAt
  );

  const stored = getPaperStrategyEvaluation(parsed.evaluationId);

  if (!stored) {
    throw new Error(
      `Paper strategy evaluation ${parsed.evaluationId} was not persisted.`
    );
  }

  return stored;
}

export function getPaperStrategyEvaluation(
  evaluationId: string
): StoredPaperStrategyEvaluation | null {
  const row = getDb()
    .prepare("select * from paper_strategy_evaluations where evaluation_id = ?")
    .get(evaluationId) as PaperStrategyEvaluationRow | undefined;

  return row ? mapPaperStrategyEvaluationRow(row) : null;
}

export function listPaperStrategyEvaluations(
  limit = 50
): StoredPaperStrategyEvaluation[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select * from paper_strategy_evaluations
       order by datetime(evaluated_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperStrategyEvaluationRow[];

  return rows.map(mapPaperStrategyEvaluationRow);
}

export function savePaperLifecycleValidation(
  report: PaperLifecycleValidationReport
): StoredPaperLifecycleValidation {
  const parsed = parsePaperLifecycleValidation(report);
  const existing = getPaperLifecycleValidation(parsed.validationId);

  if (existing) {
    const { id: _id, ...existingReport } = existing;
    void _id;

    if (stringifyJson(existingReport) !== stringifyJson(parsed)) {
      throw new Error(
        `Paper lifecycle validation ${parsed.validationId} is immutable and already exists with different data.`
      );
    }

    return existing;
  }

  getDb()
    .prepare(
      `insert into paper_lifecycle_validations (
        validation_id,
        validation_version,
        strategy_evaluation_id,
        status,
        selected_threshold,
        capture_session_ids_json,
        payload_json,
        evaluated_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.validationId,
      parsed.validationVersion,
      parsed.strategyProvenance.evaluationId,
      parsed.validationStatus,
      parsed.selectedThreshold,
      stringifyJson(parsed.captureSessionIds),
      stringifyJson(parsed),
      parsed.evaluatedAt,
      parsed.evaluatedAt
    );

  const stored = getPaperLifecycleValidation(parsed.validationId);
  if (!stored) {
    throw new Error(
      `Paper lifecycle validation ${parsed.validationId} was not persisted.`
    );
  }
  return stored;
}

export function getPaperLifecycleValidation(
  validationId: string
): StoredPaperLifecycleValidation | null {
  const row = getDb()
    .prepare(
      "select * from paper_lifecycle_validations where validation_id = ?"
    )
    .get(validationId) as PaperLifecycleValidationRow | undefined;

  return row ? mapPaperLifecycleValidationRow(row) : null;
}

export function listPaperLifecycleValidations(
  limit = 50
): StoredPaperLifecycleValidation[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select * from paper_lifecycle_validations
       order by datetime(evaluated_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperLifecycleValidationRow[];

  return rows.map(mapPaperLifecycleValidationRow);
}

export function savePaperAutomationDeployment(
  deployment: PaperAutomationDeployment
): StoredPaperAutomationDeployment {
  const parsed = parsePaperAutomationDeployment(deployment);
  const existing = getPaperAutomationDeployment(parsed.deploymentId);

  if (existing) {
    if (paperAutomationDeploymentImmutableFieldsDiffer(existing, parsed)) {
      throw new Error(
        `Paper automation deployment ${parsed.deploymentId} has immutable pinned fields.`
      );
    }
    if (
      !paperAutomationStorageTransitionAllowed(existing.status, parsed.status)
    ) {
      throw new Error(
        `Paper automation deployment ${parsed.deploymentId} cannot transition from ${existing.status} to ${parsed.status}.`
      );
    }
    if (Date.parse(parsed.updatedAt) < Date.parse(existing.updatedAt)) {
      throw new Error(
        `Paper automation deployment ${parsed.deploymentId} cannot move backwards in time.`
      );
    }

    getDb()
      .prepare(
        `update paper_automation_deployments
         set status = ?, payload_json = ?, updated_at = ?
         where deployment_id = ?`
      )
      .run(
        parsed.status,
        stringifyJson(parsed),
        parsed.updatedAt,
        parsed.deploymentId
      );
  } else {
    getDb()
      .prepare(
        `insert into paper_automation_deployments (
          deployment_id, automation_version, validation_id, status,
          selected_threshold, payload_json, approved_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.deploymentId,
        parsed.automationVersion,
        parsed.validationId,
        parsed.status,
        parsed.selectedThreshold,
        stringifyJson(parsed),
        parsed.approvedAt,
        parsed.updatedAt
      );
  }

  const stored = getPaperAutomationDeployment(parsed.deploymentId);
  if (!stored) {
    throw new Error(
      `Paper automation deployment ${parsed.deploymentId} was not persisted.`
    );
  }
  return stored;
}

export function getPaperAutomationDeployment(
  deploymentId: string
): StoredPaperAutomationDeployment | null {
  const row = getDb()
    .prepare(
      "select * from paper_automation_deployments where deployment_id = ?"
    )
    .get(deploymentId) as PaperAutomationDeploymentRow | undefined;
  return row ? mapPaperAutomationDeploymentRow(row) : null;
}

export function getLatestPaperAutomationDeployment(): StoredPaperAutomationDeployment | null {
  const row = getDb()
    .prepare(
      `select * from paper_automation_deployments
       order by datetime(approved_at) desc, id desc limit 1`
    )
    .get() as PaperAutomationDeploymentRow | undefined;
  return row ? mapPaperAutomationDeploymentRow(row) : null;
}

export function listPaperAutomationDeployments(
  limit = 50
): StoredPaperAutomationDeployment[] {
  const rows = getDb()
    .prepare(
      `select * from paper_automation_deployments
       order by datetime(approved_at) desc, id desc limit ?`
    )
    .all(limitSchema.parse(limit)) as PaperAutomationDeploymentRow[];
  return rows.map(mapPaperAutomationDeploymentRow);
}

export function savePaperAutomationEvent(
  event: PaperAutomationEvent
): StoredPaperAutomationEvent {
  const parsed = parsePaperAutomationEvent(event);
  const existing = getPaperAutomationEvent(parsed.eventId);
  if (existing) {
    const { id: _id, ...storedEvent } = existing;
    void _id;
    if (stringifyJson(storedEvent) !== stringifyJson(parsed)) {
      throw new Error(
        `Paper automation event ${parsed.eventId} is immutable and already exists with different data.`
      );
    }
    return existing;
  }

  getDb()
    .prepare(
      `insert into paper_automation_events (
        event_id, deployment_id, operation_id, kind, mint, payload_json,
        observed_at, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.eventId,
      parsed.deploymentId,
      parsed.operationId,
      parsed.kind,
      parsed.mint,
      stringifyJson(parsed),
      parsed.observedAt,
      new Date().toISOString()
    );
  const stored = getPaperAutomationEvent(parsed.eventId);
  if (!stored)
    throw new Error(
      `Paper automation event ${parsed.eventId} was not persisted.`
    );
  return stored;
}

export function getPaperAutomationEvent(
  eventId: string
): StoredPaperAutomationEvent | null {
  const row = getDb()
    .prepare("select * from paper_automation_events where event_id = ?")
    .get(eventId) as PaperAutomationEventRow | undefined;
  return row ? mapPaperAutomationEventRow(row) : null;
}

export function listPaperAutomationEvents(
  deploymentId: string,
  limit = 500
): StoredPaperAutomationEvent[] {
  const rows = getDb()
    .prepare(
      `select * from paper_automation_events where deployment_id = ?
       order by datetime(observed_at) asc, id asc limit ?`
    )
    .all(deploymentId, limitSchema.parse(limit)) as PaperAutomationEventRow[];
  return rows.map(mapPaperAutomationEventRow);
}

export function listPaperAutomationEventsForEvaluation(
  deploymentId: string
): StoredPaperAutomationEvent[] {
  const rows = getDb()
    .prepare(
      `select * from paper_automation_events where deployment_id = ?
       order by datetime(observed_at) asc, id asc`
    )
    .all(deploymentId) as PaperAutomationEventRow[];
  return rows.map(mapPaperAutomationEventRow);
}

export function savePaperAutomationOperation(
  operation: PaperAutomationOperation
): StoredPaperAutomationOperation {
  const parsed = parsePaperAutomationOperation(operation);
  const existing = getPaperAutomationOperation(parsed.operationId);
  if (existing) {
    if (paperAutomationOperationImmutableFieldsDiffer(existing, parsed)) {
      throw new Error(
        `Paper automation operation ${parsed.operationId} has immutable scheduling fields.`
      );
    }
    if (
      existing.status !== parsed.status &&
      (existing.status !== "pending" || parsed.status === "pending")
    ) {
      throw new Error(
        `Paper automation operation ${parsed.operationId} cannot transition from ${existing.status} to ${parsed.status}.`
      );
    }
    if (Date.parse(parsed.updatedAt) < Date.parse(existing.updatedAt)) {
      throw new Error(
        `Paper automation operation ${parsed.operationId} cannot move backwards in time.`
      );
    }
    getDb()
      .prepare(
        `update paper_automation_operations
         set status = ?, payload_json = ?, updated_at = ? where operation_id = ?`
      )
      .run(
        parsed.status,
        stringifyJson(parsed),
        parsed.updatedAt,
        parsed.operationId
      );
  } else {
    if (parsed.status !== "pending") {
      throw new Error(
        `New paper automation operation ${parsed.operationId} must be pending.`
      );
    }
    getDb()
      .prepare(
        `insert into paper_automation_operations (
          operation_id, deployment_id, kind, status, mint, execute_after,
          expires_at, payload_json, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.operationId,
        parsed.deploymentId,
        parsed.kind,
        parsed.status,
        parsed.mint,
        parsed.executeAfter,
        parsed.expiresAt,
        stringifyJson(parsed),
        parsed.createdAt,
        parsed.updatedAt
      );
  }
  const stored = getPaperAutomationOperation(parsed.operationId);
  if (!stored)
    throw new Error(
      `Paper automation operation ${parsed.operationId} was not persisted.`
    );
  return stored;
}

export function getPaperAutomationOperation(
  operationId: string
): StoredPaperAutomationOperation | null {
  const row = getDb()
    .prepare("select * from paper_automation_operations where operation_id = ?")
    .get(operationId) as PaperAutomationOperationRow | undefined;
  return row ? mapPaperAutomationOperationRow(row) : null;
}

export function listPaperAutomationOperations(
  deploymentId: string,
  options: { status?: PaperAutomationOperationStatus; limit?: number } = {}
): StoredPaperAutomationOperation[] {
  const limit = limitSchema.parse(options.limit ?? 500);
  const rows = options.status
    ? (getDb()
        .prepare(
          `select * from paper_automation_operations
           where deployment_id = ? and status = ?
           order by datetime(created_at) asc, id asc limit ?`
        )
        .all(
          deploymentId,
          options.status,
          limit
        ) as PaperAutomationOperationRow[])
    : (getDb()
        .prepare(
          `select * from paper_automation_operations where deployment_id = ?
           order by datetime(created_at) asc, id asc limit ?`
        )
        .all(deploymentId, limit) as PaperAutomationOperationRow[]);
  return rows.map(mapPaperAutomationOperationRow);
}

export function listPaperAutomationOperationsForEvaluation(
  deploymentId: string
): StoredPaperAutomationOperation[] {
  const rows = getDb()
    .prepare(
      `select * from paper_automation_operations where deployment_id = ?
       order by datetime(created_at) asc, id asc`
    )
    .all(deploymentId) as PaperAutomationOperationRow[];
  return rows.map(mapPaperAutomationOperationRow);
}

export function savePaperOperationsSession(
  session: PaperOperationsSession
): StoredPaperOperationsSession {
  const parsed = parsePaperOperationsSession(session);
  assertPaperOperationsSessionState(parsed);
  const existing = getPaperOperationsSession(parsed.sessionId);
  if (existing) {
    if (paperOperationsSessionImmutableFieldsDiffer(existing, parsed)) {
      throw new Error(
        `Paper operations session ${parsed.sessionId} has immutable pinned fields.`
      );
    }
    if (existing.status === parsed.status) {
      const { id: _id, ...storedSession } = existing;
      void _id;
      if (stringifyJson(storedSession) !== stringifyJson(parsed)) {
        throw new Error(
          `Paper operations session ${parsed.sessionId} has immutable lifecycle data.`
        );
      }
      return existing;
    }
    if (existing.status !== "active" || parsed.status === "active") {
      throw new Error(
        `Paper operations session ${parsed.sessionId} cannot transition from ${existing.status} to ${parsed.status}.`
      );
    }
    if (Date.parse(parsed.updatedAt) < Date.parse(existing.updatedAt)) {
      throw new Error(
        `Paper operations session ${parsed.sessionId} cannot move backwards in time.`
      );
    }
    getDb()
      .prepare(
        `update paper_operations_sessions
         set status = ?, payload_json = ?, ended_at = ?, updated_at = ?
         where session_id = ?`
      )
      .run(
        parsed.status,
        stringifyJson(parsed),
        parsed.endedAt,
        parsed.updatedAt,
        parsed.sessionId
      );
  } else {
    if (parsed.status !== "active") {
      throw new Error(
        `New paper operations session ${parsed.sessionId} must be active.`
      );
    }
    getDb()
      .prepare(
        `insert into paper_operations_sessions (
          session_id, deployment_id, runtime_session_id, status, payload_json,
          started_at, ended_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.sessionId,
        parsed.deploymentId,
        parsed.runtimeSessionId,
        parsed.status,
        stringifyJson(parsed),
        parsed.startedAt,
        parsed.endedAt,
        parsed.updatedAt
      );
  }
  const stored = getPaperOperationsSession(parsed.sessionId);
  if (!stored) {
    throw new Error(
      `Paper operations session ${parsed.sessionId} was not persisted.`
    );
  }
  return stored;
}

export function getPaperOperationsSession(
  sessionId: string
): StoredPaperOperationsSession | null {
  const row = getDb()
    .prepare("select * from paper_operations_sessions where session_id = ?")
    .get(sessionId) as PaperOperationsSessionRow | undefined;
  return row ? mapPaperOperationsSessionRow(row) : null;
}

export function getActivePaperOperationsSession(): StoredPaperOperationsSession | null {
  const row = getDb()
    .prepare(
      `select * from paper_operations_sessions where status = 'active'
       order by datetime(started_at) desc, id desc limit 1`
    )
    .get() as PaperOperationsSessionRow | undefined;
  return row ? mapPaperOperationsSessionRow(row) : null;
}

export function getLatestPaperOperationsSession(): StoredPaperOperationsSession | null {
  const row = getDb()
    .prepare(
      `select * from paper_operations_sessions
       order by datetime(started_at) desc, id desc limit 1`
    )
    .get() as PaperOperationsSessionRow | undefined;
  return row ? mapPaperOperationsSessionRow(row) : null;
}

export function listPaperOperationsSessions(
  limit = 50
): StoredPaperOperationsSession[] {
  const rows = getDb()
    .prepare(
      `select * from paper_operations_sessions
       order by datetime(started_at) desc, id desc limit ?`
    )
    .all(limitSchema.parse(limit)) as PaperOperationsSessionRow[];
  return rows.map(mapPaperOperationsSessionRow);
}

export function listPaperOperationsSessionsForEvaluation(
  deploymentId: string
): StoredPaperOperationsSession[] {
  const rows = getDb()
    .prepare(
      `select * from paper_operations_sessions where deployment_id = ?
       order by datetime(started_at) asc, id asc`
    )
    .all(deploymentId) as PaperOperationsSessionRow[];
  return rows.map(mapPaperOperationsSessionRow);
}

export function savePaperOperationsSnapshot(
  snapshot: PaperOperationsSnapshot
): StoredPaperOperationsSnapshot {
  const parsed = parsePaperOperationsSnapshot(snapshot);
  const existing = getPaperOperationsSnapshot(parsed.sampleId);
  if (existing) {
    const { id: _id, ...stored } = existing;
    void _id;
    if (stringifyJson(stored) !== stringifyJson(parsed)) {
      throw new Error(
        `Paper operations snapshot ${parsed.sampleId} is immutable and already exists with different data.`
      );
    }
    return existing;
  }
  const session = getPaperOperationsSession(parsed.sessionId);
  if (!session || session.deploymentId !== parsed.deploymentId) {
    throw new Error(
      `Paper operations snapshot ${parsed.sampleId} references an unknown session.`
    );
  }
  getDb()
    .prepare(
      `insert into paper_operations_snapshots (
        sample_id, session_id, kind, payload_json, observed_at, created_at
      ) values (?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.sampleId,
      parsed.sessionId,
      parsed.kind,
      stringifyJson(parsed),
      parsed.observedAt,
      new Date().toISOString()
    );
  const stored = getPaperOperationsSnapshot(parsed.sampleId);
  if (!stored) {
    throw new Error(
      `Paper operations snapshot ${parsed.sampleId} was not persisted.`
    );
  }
  return stored;
}

export function getPaperOperationsSnapshot(
  sampleId: string
): StoredPaperOperationsSnapshot | null {
  const row = getDb()
    .prepare("select * from paper_operations_snapshots where sample_id = ?")
    .get(sampleId) as PaperOperationsSnapshotRow | undefined;
  return row ? mapPaperOperationsSnapshotRow(row) : null;
}

export function listPaperOperationsSnapshots(
  sessionId: string,
  limit = 500
): StoredPaperOperationsSnapshot[] {
  const rows = getDb()
    .prepare(
      `select * from paper_operations_snapshots where session_id = ?
       order by datetime(observed_at) desc, id desc limit ?`
    )
    .all(sessionId, limitSchema.parse(limit)) as PaperOperationsSnapshotRow[];
  return rows.map(mapPaperOperationsSnapshotRow).reverse();
}

export function getLatestPaperOperationsSnapshotForSession(
  sessionId: string
): StoredPaperOperationsSnapshot | null {
  const row = getDb()
    .prepare(
      `select * from paper_operations_snapshots where session_id = ?
       order by datetime(observed_at) desc, id desc limit 1`
    )
    .get(sessionId) as PaperOperationsSnapshotRow | undefined;
  return row ? mapPaperOperationsSnapshotRow(row) : null;
}

export function listPaperOperationsSnapshotsForExport(
  sessionId: string
): StoredPaperOperationsSnapshot[] {
  const rows = getDb()
    .prepare(
      `select * from paper_operations_snapshots where session_id = ?
       order by datetime(observed_at) asc, id asc`
    )
    .all(sessionId) as PaperOperationsSnapshotRow[];
  return rows.map(mapPaperOperationsSnapshotRow);
}

export function savePaperOperationsAlert(
  alert: PaperOperationsAlert
): StoredPaperOperationsAlert {
  const parsed = parsePaperOperationsAlert(alert);
  const existing = getPaperOperationsAlert(parsed.alertId);
  if (existing) {
    const { id: _id, ...stored } = existing;
    void _id;
    if (stringifyJson(stored) !== stringifyJson(parsed)) {
      throw new Error(
        `Paper operations alert ${parsed.alertId} is immutable and already exists with different data.`
      );
    }
    return existing;
  }
  if (!getPaperOperationsSnapshot(parsed.sampleId)) {
    throw new Error(
      `Paper operations alert ${parsed.alertId} references an unknown snapshot.`
    );
  }
  getDb()
    .prepare(
      `insert into paper_operations_alerts (
        alert_id, session_id, sample_id, severity, code, payload_json,
        observed_at, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.alertId,
      parsed.sessionId,
      parsed.sampleId,
      parsed.severity,
      parsed.code,
      stringifyJson(parsed),
      parsed.observedAt,
      new Date().toISOString()
    );
  const stored = getPaperOperationsAlert(parsed.alertId);
  if (!stored) {
    throw new Error(
      `Paper operations alert ${parsed.alertId} was not persisted.`
    );
  }
  return stored;
}

export function getPaperOperationsAlert(
  alertId: string
): StoredPaperOperationsAlert | null {
  const row = getDb()
    .prepare("select * from paper_operations_alerts where alert_id = ?")
    .get(alertId) as PaperOperationsAlertRow | undefined;
  return row ? mapPaperOperationsAlertRow(row) : null;
}

export function listPaperOperationsAlerts(
  sessionId: string,
  limit = 500
): StoredPaperOperationsAlert[] {
  const rows = getDb()
    .prepare(
      `select * from paper_operations_alerts where session_id = ?
       order by datetime(observed_at) desc, id desc limit ?`
    )
    .all(sessionId, limitSchema.parse(limit)) as PaperOperationsAlertRow[];
  return rows.map(mapPaperOperationsAlertRow).reverse();
}

export function listPaperOperationsAlertsForExport(
  sessionId: string
): StoredPaperOperationsAlert[] {
  const rows = getDb()
    .prepare(
      `select * from paper_operations_alerts where session_id = ?
       order by datetime(observed_at) asc, id asc`
    )
    .all(sessionId) as PaperOperationsAlertRow[];
  return rows.map(mapPaperOperationsAlertRow);
}

export function savePaperForwardEvaluation(
  evaluation: PaperForwardEvaluationReport
): StoredPaperForwardEvaluation {
  const parsed = parsePaperForwardEvaluation(evaluation);
  const existing = getPaperForwardEvaluation(parsed.evaluationId);
  if (existing) {
    const { id: _id, ...stored } = existing;
    void _id;
    if (stringifyJson(stored) !== stringifyJson(parsed)) {
      throw new Error(
        `Paper forward evaluation ${parsed.evaluationId} is immutable.`
      );
    }
    return existing;
  }
  const deployment = getPaperAutomationDeployment(
    parsed.deploymentProvenance.deploymentId
  );
  if (!deployment) {
    throw new Error(
      `Paper forward evaluation ${parsed.evaluationId} references a missing deployment.`
    );
  }
  for (const sessionId of parsed.sessionIds) {
    const session = getPaperOperationsSession(sessionId);
    if (
      !session ||
      session.status !== "completed" ||
      session.deploymentId !== deployment.deploymentId
    ) {
      throw new Error(
        `Paper forward evaluation ${parsed.evaluationId} references an invalid completed session ${sessionId}.`
      );
    }
  }
  getDb()
    .prepare(
      `insert into paper_forward_evaluations (
        evaluation_id, deployment_id, status, payload_json, evaluated_at,
        created_at
      ) values (?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.evaluationId,
      parsed.deploymentProvenance.deploymentId,
      parsed.evaluationStatus,
      stringifyJson(parsed),
      parsed.evaluatedAt,
      parsed.evaluatedAt
    );
  const stored = getPaperForwardEvaluation(parsed.evaluationId);
  if (!stored) {
    throw new Error(
      `Paper forward evaluation ${parsed.evaluationId} was not persisted.`
    );
  }
  return stored;
}

export function getPaperForwardEvaluation(
  evaluationId: string
): StoredPaperForwardEvaluation | null {
  const row = getDb()
    .prepare("select * from paper_forward_evaluations where evaluation_id = ?")
    .get(evaluationId) as PaperForwardEvaluationRow | undefined;
  return row ? mapPaperForwardEvaluationRow(row) : null;
}

export function getLatestPaperForwardEvaluation(
  deploymentId?: string
): StoredPaperForwardEvaluation | null {
  const row = deploymentId
    ? (getDb()
        .prepare(
          `select * from paper_forward_evaluations where deployment_id = ?
           order by datetime(evaluated_at) desc, id desc limit 1`
        )
        .get(deploymentId) as PaperForwardEvaluationRow | undefined)
    : (getDb()
        .prepare(
          `select * from paper_forward_evaluations
           order by datetime(evaluated_at) desc, id desc limit 1`
        )
        .get() as PaperForwardEvaluationRow | undefined);
  return row ? mapPaperForwardEvaluationRow(row) : null;
}

export function listPaperForwardEvaluations(
  limit = 50
): StoredPaperForwardEvaluation[] {
  const rows = getDb()
    .prepare(
      `select * from paper_forward_evaluations
       order by datetime(evaluated_at) desc, id desc limit ?`
    )
    .all(limitSchema.parse(limit)) as PaperForwardEvaluationRow[];
  return rows.map(mapPaperForwardEvaluationRow);
}

export function savePaperExitPolicyEvaluation(
  evaluation: PaperExitPolicyEvaluation
): StoredPaperExitPolicyEvaluation {
  const parsed = parsePaperExitPolicyEvaluation(evaluation);
  const existing = getPaperExitPolicyEvaluation(parsed.evaluationId);

  if (existing) {
    const { id: _id, ...existingEvaluation } = existing;
    void _id;

    if (stringifyJson(existingEvaluation) !== stringifyJson(parsed)) {
      throw new Error(
        `Paper exit policy evaluation ${parsed.evaluationId} is immutable and already exists with different data.`
      );
    }

    return existing;
  }

  getDb()
    .prepare(
      `insert into paper_exit_policy_evaluations (
        evaluation_id,
        policy_version,
        mint,
        status,
        selected_rule_id,
        payload_json,
        evaluated_at,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.evaluationId,
      parsed.policyVersion,
      parsed.mint,
      parsed.evaluationStatus,
      parsed.selectedAction?.ruleId ?? null,
      stringifyJson(parsed),
      parsed.evaluatedAt,
      parsed.evaluatedAt
    );

  const stored = getPaperExitPolicyEvaluation(parsed.evaluationId);

  if (!stored) {
    throw new Error(
      `Paper exit policy evaluation ${parsed.evaluationId} was not persisted.`
    );
  }

  return stored;
}

export function getPaperExitPolicyEvaluation(
  evaluationId: string
): StoredPaperExitPolicyEvaluation | null {
  const row = getDb()
    .prepare(
      "select * from paper_exit_policy_evaluations where evaluation_id = ?"
    )
    .get(evaluationId) as PaperExitPolicyEvaluationRow | undefined;

  return row ? mapPaperExitPolicyEvaluationRow(row) : null;
}

export function listPaperExitPolicyEvaluations(
  limit = 50
): StoredPaperExitPolicyEvaluation[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select * from paper_exit_policy_evaluations
       order by datetime(evaluated_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperExitPolicyEvaluationRow[];

  return rows.map(mapPaperExitPolicyEvaluationRow);
}

export function listPaperExitPolicyEvaluationsByMint(
  mint: string,
  limit = 50
): StoredPaperExitPolicyEvaluation[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select * from paper_exit_policy_evaluations
       where mint = ?
       order by datetime(evaluated_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as PaperExitPolicyEvaluationRow[];

  return rows.map(mapPaperExitPolicyEvaluationRow);
}

export function saveOperatorAction(
  action: OperatorActionInput
): StoredOperatorAction {
  const parsed = operatorActionInputSchema.parse(action);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const safeParameters = sanitizeStoragePayload(
    parsed.safeParameters
  ) as Record<string, unknown>;
  const db = getDb();

  db.prepare(
    `insert into operator_actions (
      action_id,
      action,
      target,
      safe_parameters_json,
      outcome,
      reason_codes_json,
      created_at
    )
    values (?, ?, ?, ?, ?, ?, ?)
    on conflict(action_id) do nothing`
  ).run(
    parsed.actionId,
    parsed.action,
    parsed.target,
    stringifyJson(safeParameters),
    parsed.outcome,
    stringifyJson(parsed.reasonCodes),
    createdAt
  );

  const row = db
    .prepare("select * from operator_actions where action_id = ?")
    .get(parsed.actionId) as OperatorActionRow | undefined;

  if (!row) {
    throw new Error(`Operator action ${parsed.actionId} was not persisted.`);
  }

  return mapOperatorActionRow(row);
}

export function listOperatorActions(limit = 50): StoredOperatorAction[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from operator_actions
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as OperatorActionRow[];

  return rows.map(mapOperatorActionRow);
}

export function saveCapacitySnapshot(
  snapshot: CapacitySnapshotInput
): StoredCapacitySnapshot {
  const parsed = capacitySnapshotInputSchema.parse(snapshot);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const payload = sanitizeStoragePayload(parsed.payload);
  const db = getDb();

  db.prepare(
    `insert into capacity_snapshots (
      snapshot_id,
      runtime_session_id,
      observation_window_ms,
      launch_count,
      launch_rate_per_minute,
      tracked_mint_count,
      protected_mint_count,
      required_initial_slots,
      available_newest_slots,
      initial_coverage_ratio,
      observed_events_per_second,
      projected_hourly_events,
      projected_hourly_cost_sol,
      reason_codes_json,
      payload_json,
      created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(snapshot_id) do nothing`
  ).run(
    parsed.snapshotId,
    parsed.runtimeSessionId,
    parsed.observationWindowMs,
    parsed.launchCount,
    parsed.launchRatePerMinute,
    parsed.trackedMintCount,
    parsed.protectedMintCount,
    parsed.requiredInitialSlots,
    parsed.availableNewestSlots,
    parsed.initialCoverageRatio,
    parsed.observedEventsPerSecond,
    parsed.projectedHourlyEvents,
    parsed.projectedHourlyCostSol,
    stringifyJson(parsed.reasonCodes),
    stringifyJson(payload),
    createdAt
  );

  const row = db
    .prepare("select * from capacity_snapshots where snapshot_id = ?")
    .get(parsed.snapshotId) as CapacitySnapshotRow | undefined;

  if (!row) {
    throw new Error(
      `Capacity snapshot ${parsed.snapshotId} was not persisted.`
    );
  }

  return mapCapacitySnapshotRow(row);
}

export function listCapacitySnapshots(limit = 50): StoredCapacitySnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from capacity_snapshots
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as CapacitySnapshotRow[];

  return rows.map(mapCapacitySnapshotRow);
}

export function listLightningTradePlansByMint(
  mint: string,
  limit = 50
): StoredLightningTradePlan[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from lightning_trade_plans
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as LightningTradePlanRow[];

  return rows.map(mapLightningTradePlanRow);
}

export function getLightningTradePlan(
  planId: string
): StoredLightningTradePlan | null {
  const row = getDb()
    .prepare(
      `select *
       from lightning_trade_plans
       where plan_id = ?
       order by datetime(created_at) desc, id desc
       limit 1`
    )
    .get(planId) as LightningTradePlanRow | undefined;

  return row ? mapLightningTradePlanRow(row) : null;
}

export function savePumpPortalWalletStatusSnapshot(
  snapshot: PumpPortalWalletStatusSnapshotInput
): StoredPumpPortalWalletStatusSnapshot {
  const parsed = pumpPortalWalletStatusSnapshotInputSchema.parse(snapshot);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const payload = sanitizeStoragePayload(parsed.payload);
  const db = getDb();

  const result = db
    .prepare(
      `insert into pumpportal_wallet_status_snapshots (
        data_wallet_public_key,
        trading_wallet_public_key,
        same_wallet,
        data_wallet_balance_sol,
        trading_wallet_balance_sol,
        data_wallet_status,
        trading_wallet_status,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.dataWalletPublicKey ?? null,
      parsed.tradingWalletPublicKey ?? null,
      parsed.sameWallet ? 1 : 0,
      parsed.dataWalletBalanceSol ?? null,
      parsed.tradingWalletBalanceSol ?? null,
      parsed.dataWalletStatus,
      parsed.tradingWalletStatus,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    dataWalletPublicKey: parsed.dataWalletPublicKey ?? null,
    tradingWalletPublicKey: parsed.tradingWalletPublicKey ?? null,
    sameWallet: parsed.sameWallet,
    dataWalletBalanceSol: parsed.dataWalletBalanceSol ?? null,
    tradingWalletBalanceSol: parsed.tradingWalletBalanceSol ?? null,
    dataWalletStatus: parsed.dataWalletStatus,
    tradingWalletStatus: parsed.tradingWalletStatus,
    reasonCodes: parsed.reasonCodes,
    payload,
    createdAt
  };
}

export function listPumpPortalWalletStatusSnapshots(
  limit = 50
): StoredPumpPortalWalletStatusSnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from pumpportal_wallet_status_snapshots
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PumpPortalWalletStatusSnapshotRow[];

  return rows.map(mapPumpPortalWalletStatusSnapshotRow);
}

export function saveWatchedWallet(
  wallet: WatchedWalletInput
): StoredWatchedWallet {
  const parsed = watchedWalletInputSchema.parse(wallet);
  const now = new Date().toISOString();
  const createdAt = parsed.createdAt ?? now;
  const updatedAt = parsed.updatedAt ?? now;
  const payload = sanitizeStoragePayload({
    ...parsed,
    payload: parsed.payload ?? null
  });
  const db = getDb();

  db.prepare(
    `insert into watched_wallets (
      address,
      alias,
      tags_json,
      enabled,
      source,
      reason_codes_json,
      payload_json,
      created_at,
      updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(address) do update set
      alias = excluded.alias,
      tags_json = excluded.tags_json,
      enabled = excluded.enabled,
      source = excluded.source,
      reason_codes_json = excluded.reason_codes_json,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`
  ).run(
    parsed.address,
    parsed.alias ?? null,
    stringifyJson(parsed.tags),
    parsed.enabled ? 1 : 0,
    parsed.source,
    stringifyJson(parsed.reasonCodes),
    stringifyJson(payload),
    createdAt,
    updatedAt
  );

  const row = db
    .prepare("select * from watched_wallets where address = ?")
    .get(parsed.address) as WatchedWalletRow | undefined;

  if (!row) {
    throw new Error(`Failed to save watched wallet ${parsed.address}`);
  }

  return mapWatchedWalletRow(row);
}

export function listWatchedWallets(): StoredWatchedWallet[] {
  const rows = getDb()
    .prepare(
      `select *
       from watched_wallets
       order by datetime(updated_at) desc, id desc`
    )
    .all() as WatchedWalletRow[];

  return rows.map(mapWatchedWalletRow);
}

export function deleteWatchedWallet(address: string): boolean {
  const result = getDb()
    .prepare("delete from watched_wallets where address = ?")
    .run(address);

  return Number(result.changes) > 0;
}

export function saveWatchedWalletTradeEvent(
  event: WatchedWalletTradeEventInput
): StoredWatchedWalletTradeEvent {
  const parsed = watchedWalletTradeEventInputSchema.parse(event);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const payload = sanitizeStoragePayload(parsed.payload ?? parsed);
  const db = getDb();
  const result = db
    .prepare(
      `insert into watched_wallet_trade_events (
        wallet,
        wallet_alias,
        mint,
        side,
        price_sol,
        volume_sol,
        token_amount,
        signature,
        confidence,
        usable_for_exit_strategy,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.wallet,
      parsed.walletAlias ?? null,
      parsed.mint,
      parsed.side,
      parsed.priceSol ?? null,
      parsed.volumeSol ?? null,
      parsed.tokenAmount ?? null,
      parsed.signature ?? null,
      parsed.confidence,
      parsed.usableForExitStrategy ? 1 : 0,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    wallet: parsed.wallet,
    walletAlias: parsed.walletAlias ?? null,
    mint: parsed.mint,
    side: parsed.side,
    priceSol: parsed.priceSol ?? null,
    volumeSol: parsed.volumeSol ?? null,
    tokenAmount: parsed.tokenAmount ?? null,
    signature: parsed.signature ?? null,
    confidence: parsed.confidence,
    usableForExitStrategy: parsed.usableForExitStrategy,
    reasonCodes: parsed.reasonCodes,
    payload,
    createdAt
  };
}

export function listWatchedWalletTradeEvents(
  limit = 50
): StoredWatchedWalletTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from watched_wallet_trade_events
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as WatchedWalletTradeEventRow[];

  return rows.map(mapWatchedWalletTradeEventRow);
}

export function listWatchedWalletTradeEventsByWallet(
  address: string,
  limit = 50
): StoredWatchedWalletTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from watched_wallet_trade_events
       where wallet = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(address, parsedLimit) as WatchedWalletTradeEventRow[];

  return rows.map(mapWatchedWalletTradeEventRow);
}

export function listWatchedWalletTradeEventsByMint(
  mint: string,
  limit = 50
): StoredWatchedWalletTradeEvent[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from watched_wallet_trade_events
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as WatchedWalletTradeEventRow[];

  return rows.map(mapWatchedWalletTradeEventRow);
}

export function saveExitRule(rule: ExitRuleInput): StoredExitRule {
  const parsed = exitRuleInputSchema.parse(rule);
  const now = new Date().toISOString();
  const createdAt = parsed.createdAt ?? now;
  const updatedAt = parsed.updatedAt ?? now;
  const payload = sanitizeStoragePayload({
    ...parsed,
    payload: parsed.payload ?? null
  });
  const db = getDb();

  db.prepare(
    `insert into exit_rules (
      rule_id,
      name,
      enabled,
      trigger,
      min_profit_pct,
      min_profit_sol,
      sell_pct,
      require_position_opened_before_wallet_trade,
      max_position_age_ms,
      cooldown_ms,
      priority,
      reason_codes_json,
      payload_json,
      created_at,
      updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(rule_id) do update set
      name = excluded.name,
      enabled = excluded.enabled,
      trigger = excluded.trigger,
      min_profit_pct = excluded.min_profit_pct,
      min_profit_sol = excluded.min_profit_sol,
      sell_pct = excluded.sell_pct,
      require_position_opened_before_wallet_trade =
        excluded.require_position_opened_before_wallet_trade,
      max_position_age_ms = excluded.max_position_age_ms,
      cooldown_ms = excluded.cooldown_ms,
      priority = excluded.priority,
      reason_codes_json = excluded.reason_codes_json,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`
  ).run(
    parsed.id,
    parsed.name,
    parsed.enabled ? 1 : 0,
    parsed.trigger,
    parsed.minProfitPct,
    parsed.minProfitSol ?? null,
    parsed.sellPct,
    parsed.requirePositionOpenedBeforeWalletTrade ? 1 : 0,
    parsed.maxPositionAgeMs ?? null,
    parsed.cooldownMs,
    parsed.priority,
    stringifyJson(parsed.reasonCodes),
    stringifyJson(payload),
    createdAt,
    updatedAt
  );

  const row = db
    .prepare("select * from exit_rules where rule_id = ?")
    .get(parsed.id) as ExitRuleRow | undefined;

  if (!row) {
    throw new Error(`Failed to save exit rule ${parsed.id}`);
  }

  return mapExitRuleRow(row);
}

export function listExitRules(): StoredExitRule[] {
  const rows = getDb()
    .prepare(
      `select *
       from exit_rules
       order by priority asc, rule_id asc`
    )
    .all() as ExitRuleRow[];

  return rows.map(mapExitRuleRow);
}

export function getExitRule(ruleId: string): StoredExitRule | null {
  const row = getDb()
    .prepare("select * from exit_rules where rule_id = ?")
    .get(ruleId) as ExitRuleRow | undefined;

  return row ? mapExitRuleRow(row) : null;
}

export function deleteExitRule(ruleId: string): boolean {
  const result = getDb()
    .prepare("delete from exit_rules where rule_id = ?")
    .run(ruleId);

  return Number(result.changes) > 0;
}

export function saveExitSignal(signal: ExitSignalInput): StoredExitSignal {
  const parsed = exitSignalInputSchema.parse(signal);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const payload = sanitizeStoragePayload(parsed.payload ?? parsed);
  const db = getDb();
  const result = db
    .prepare(
      `insert into exit_signals (
        signal_id,
        mint,
        wallet,
        wallet_alias,
        rule_id,
        action,
        sell_pct,
        blocked,
        blockers_json,
        warnings_json,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.id,
      parsed.mint,
      parsed.wallet,
      parsed.walletAlias ?? null,
      parsed.ruleId,
      parsed.action,
      parsed.sellPct,
      parsed.blocked ? 1 : 0,
      stringifyJson(parsed.blockers),
      stringifyJson(parsed.warnings),
      stringifyJson(parsed.reasonCodes),
      stringifyJson(payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    signalId: parsed.id,
    mint: parsed.mint,
    wallet: parsed.wallet,
    walletAlias: parsed.walletAlias ?? null,
    ruleId: parsed.ruleId,
    action: parsed.action,
    sellPct: parsed.sellPct,
    blocked: parsed.blocked,
    blockers: parsed.blockers,
    warnings: parsed.warnings,
    reasonCodes: parsed.reasonCodes,
    payload,
    createdAt
  };
}

export function listExitSignals(limit = 50): StoredExitSignal[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from exit_signals
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as ExitSignalRow[];

  return rows.map(mapExitSignalRow);
}

export function listExitSignalsByMint(
  mint: string,
  limit = 50
): StoredExitSignal[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from exit_signals
       where mint = ?
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(mint, parsedLimit) as ExitSignalRow[];

  return rows.map(mapExitSignalRow);
}

export async function* createReplayStream(
  options: {
    limit?: number;
    speed?: number;
    type?: ReplaySource;
  } = {}
): AsyncGenerator<ReplayItem> {
  const type = options.type ?? "feed_events";
  const speed = options.speed ?? 0;
  const records = getReplayRecords(type, options.limit);
  let previousTimestamp: number | undefined;

  for (const [index, record] of records.entries()) {
    const currentTimestamp = Date.parse(record.createdAt);

    if (
      speed > 0 &&
      previousTimestamp !== undefined &&
      Number.isFinite(currentTimestamp) &&
      Number.isFinite(previousTimestamp)
    ) {
      const waitMs = Math.max(
        0,
        (currentTimestamp - previousTimestamp) / speed
      );

      if (waitMs > 0) {
        await delay(waitMs);
      }
    }

    previousTimestamp = currentTimestamp;

    yield {
      createdAt: record.createdAt,
      payload: getReplayPayload(record),
      sequence: index + 1,
      source: type
    };
  }
}

function getReplayPayload(
  record:
    | StoredActualDataSession
    | StoredActualDataSubscription
    | StoredCandidateDecision
    | StoredChainTransactionEvent
    | StoredChainTradeEvent
    | StoredChainVerification
    | StoredFeedEvent
    | StoredLaunchTimeseriesBucket
    | StoredMarketObservation
    | StoredPumpPortalTokenTradeEvent
    | StoredRiskSnapshot
    | StoredSignal
    | StoredTokenIdentity
    | StoredTokenMetadataFetch
    | StoredWatchAction
    | StoredWatchPlan
): unknown {
  if ("payload" in record) {
    return record.payload;
  }

  const payload = { ...record } as Record<string, unknown>;
  delete payload.createdAt;
  delete payload.id;
  return payload;
}

function getReplayRecords(
  type: ReplaySource,
  limit: number | undefined
): Array<
  | StoredActualDataSession
  | StoredActualDataSubscription
  | StoredCandidateDecision
  | StoredChainTransactionEvent
  | StoredChainTradeEvent
  | StoredChainVerification
  | StoredFeedEvent
  | StoredLaunchTimeseriesBucket
  | StoredMarketObservation
  | StoredPumpPortalTokenTradeEvent
  | StoredRiskSnapshot
  | StoredSignal
  | StoredTokenIdentity
  | StoredTokenMetadataFetch
  | StoredWatchAction
  | StoredWatchPlan
> {
  switch (type) {
    case "actual_data_sessions":
      return listActualDataSessionsForReplay(limit);
    case "actual_data_subscriptions":
      return listActualDataSubscriptionsForReplay(limit);
    case "candidate_decisions":
      return listCandidateDecisionsForReplay(limit);
    case "chain_transaction_events":
      return listChainTransactionEventsForReplay(limit);
    case "chain_trade_events":
      return listChainTradeEventsForReplay(limit);
    case "chain_verifications":
      return listChainVerificationsForReplay(limit);
    case "risk_snapshots":
      return listRiskSnapshotsForReplay(limit);
    case "signals":
      return listSignalsForReplay(limit);
    case "feed_events":
      return listFeedEvents(limit);
    case "market_observations":
      return listMarketObservationsForReplay(limit);
    case "pumpportal_token_trade_events":
      return listPumpPortalTokenTradeEventsForReplay(limit);
    case "launch_timeseries_buckets":
      return listLaunchTimeseriesBucketsForReplay(limit);
    case "token_identities":
      return listTokenIdentitiesForReplay(limit);
    case "token_metadata_fetches":
      return listTokenMetadataFetchesForReplay(limit);
    case "watch_actions":
      return listWatchActionsForReplay(limit);
    case "watch_plans":
      return listWatchPlansForReplay(limit);
  }
}

export function savePaperOrder(order: PaperOrderInput): StoredPaperOrder {
  const parsed = paperOrderInputSchema.parse(order);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into paper_orders (
        mint,
        symbol,
        side,
        status,
        size_sol,
        simulated_price,
        reason_codes_json,
        signal_id,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.mint,
      parsed.symbol,
      parsed.side,
      parsed.status,
      parsed.sizeSol,
      parsed.simulatedPrice,
      stringifyJson(parsed.reasonCodes),
      parsed.signalId ?? null,
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    mint: parsed.mint,
    symbol: parsed.symbol,
    side: parsed.side,
    status: parsed.status,
    sizeSol: parsed.sizeSol,
    simulatedPrice: parsed.simulatedPrice,
    reasonCodes: parsed.reasonCodes,
    signalId: parsed.signalId ?? null,
    payload: parsed.payload,
    createdAt
  };
}

export function listPaperOrders(limit = 50): StoredPaperOrder[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from paper_orders
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperOrderRow[];

  return rows.map(mapPaperOrderRow);
}

export function upsertPaperPosition(
  position: PaperPositionInput
): StoredPaperPosition {
  const parsed = paperPositionInputSchema.parse(position);
  const now = new Date().toISOString();
  const openedAt = parsed.openedAt ?? now;
  const updatedAt = parsed.updatedAt ?? now;
  const db = getDb();

  db.prepare(
    `insert into paper_positions (
      mint,
      symbol,
      size_sol,
      token_amount,
      entry_price,
      status,
      payload_json,
      opened_at,
      updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(mint) do update set
      symbol = excluded.symbol,
      size_sol = excluded.size_sol,
      token_amount = excluded.token_amount,
      entry_price = excluded.entry_price,
      status = excluded.status,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`
  ).run(
    parsed.mint,
    parsed.symbol,
    parsed.sizeSol,
    parsed.tokenAmount,
    parsed.entryPrice,
    parsed.status,
    stringifyJson(parsed.payload),
    openedAt,
    updatedAt
  );

  const row = db
    .prepare("select * from paper_positions where mint = ?")
    .get(parsed.mint) as PaperPositionRow | undefined;

  if (!row) {
    throw new Error(`Failed to upsert paper position for ${parsed.mint}`);
  }

  return mapPaperPositionRow(row);
}

export function listPaperPositions(): StoredPaperPosition[] {
  const rows = getDb()
    .prepare(
      `select *
       from paper_positions
       order by datetime(updated_at) desc, id desc`
    )
    .all() as PaperPositionRow[];

  return rows.map(mapPaperPositionRow);
}

export function savePaperPortfolioOrder(
  order: PaperPortfolioOrderInput
): StoredPaperPortfolioOrder {
  const parsed = paperPortfolioOrderInputSchema.parse(order);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into paper_portfolio_orders (
        order_id,
        type,
        side,
        mint,
        symbol,
        title,
        source,
        requested_size_sol,
        requested_sell_pct,
        signal_score,
        risk_level,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.orderId,
      parsed.type,
      parsed.side,
      parsed.mint,
      parsed.symbol ?? null,
      parsed.title ?? null,
      parsed.source,
      parsed.requestedSizeSol ?? null,
      parsed.requestedSellPct ?? null,
      parsed.signalScore ?? null,
      parsed.riskLevel ?? null,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    orderId: parsed.orderId,
    type: parsed.type,
    side: parsed.side,
    mint: parsed.mint,
    symbol: parsed.symbol ?? null,
    title: parsed.title ?? null,
    source: parsed.source,
    requestedSizeSol: parsed.requestedSizeSol ?? null,
    requestedSellPct: parsed.requestedSellPct ?? null,
    signalScore: parsed.signalScore ?? null,
    riskLevel: parsed.riskLevel ?? null,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listPaperPortfolioOrders(
  limit = 50
): StoredPaperPortfolioOrder[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from paper_portfolio_orders
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperPortfolioOrderRow[];

  return rows.map(mapPaperPortfolioOrderRow);
}

export function listPaperPortfolioOrdersForState(): StoredPaperPortfolioOrder[] {
  const rows = getDb()
    .prepare(
      `select * from paper_portfolio_orders
       order by datetime(created_at) asc, id asc`
    )
    .all() as PaperPortfolioOrderRow[];
  return rows.map(mapPaperPortfolioOrderRow);
}

export function savePaperPortfolioFill(
  fill: PaperPortfolioFillInput
): StoredPaperPortfolioFill {
  const parsed = paperPortfolioFillInputSchema.parse(fill);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into paper_portfolio_fills (
        fill_id,
        order_id,
        side,
        mint,
        price_sol,
        effective_price_sol,
        size_sol,
        token_amount,
        fee_sol,
        slippage_sol,
        fill_status,
        rejection_reason,
        reason_codes_json,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.fillId,
      parsed.orderId,
      parsed.side,
      parsed.mint,
      parsed.priceSol,
      parsed.effectivePriceSol,
      parsed.sizeSol,
      parsed.tokenAmount,
      parsed.feeSol,
      parsed.slippageSol,
      parsed.fillStatus,
      parsed.rejectionReason ?? null,
      stringifyJson(parsed.reasonCodes),
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    fillId: parsed.fillId,
    orderId: parsed.orderId,
    side: parsed.side,
    mint: parsed.mint,
    priceSol: parsed.priceSol,
    effectivePriceSol: parsed.effectivePriceSol,
    sizeSol: parsed.sizeSol,
    tokenAmount: parsed.tokenAmount,
    feeSol: parsed.feeSol,
    slippageSol: parsed.slippageSol,
    fillStatus: parsed.fillStatus,
    rejectionReason: parsed.rejectionReason ?? null,
    reasonCodes: parsed.reasonCodes,
    payload: parsed.payload,
    createdAt
  };
}

export function listPaperPortfolioFills(
  limit = 50
): StoredPaperPortfolioFill[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from paper_portfolio_fills
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperPortfolioFillRow[];

  return rows.map(mapPaperPortfolioFillRow);
}

export function listPaperPortfolioFillsForState(): StoredPaperPortfolioFill[] {
  const rows = getDb()
    .prepare(
      `select * from paper_portfolio_fills
       order by datetime(created_at) asc, id asc`
    )
    .all() as PaperPortfolioFillRow[];
  return rows.map(mapPaperPortfolioFillRow);
}

export function upsertPaperPortfolioPosition(
  position: PaperPortfolioPositionInput
): StoredPaperPortfolioPosition {
  const parsed = paperPortfolioPositionInputSchema.parse(position);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  db.prepare(
    `insert into paper_portfolio_positions (
      position_id,
      mint,
      symbol,
      title,
      status,
      entry_price_sol,
      average_entry_price_sol,
      current_price_sol,
      size_sol,
      remaining_size_sol,
      token_amount,
      remaining_token_amount,
      realized_pnl_sol,
      unrealized_pnl_sol,
      realized_pnl_pct,
      unrealized_pnl_pct,
      total_fees_sol,
      payload_json,
      opened_at,
      updated_at,
      closed_at,
      created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(position_id) do update set
      mint = excluded.mint,
      symbol = excluded.symbol,
      title = excluded.title,
      status = excluded.status,
      entry_price_sol = excluded.entry_price_sol,
      average_entry_price_sol = excluded.average_entry_price_sol,
      current_price_sol = excluded.current_price_sol,
      size_sol = excluded.size_sol,
      remaining_size_sol = excluded.remaining_size_sol,
      token_amount = excluded.token_amount,
      remaining_token_amount = excluded.remaining_token_amount,
      realized_pnl_sol = excluded.realized_pnl_sol,
      unrealized_pnl_sol = excluded.unrealized_pnl_sol,
      realized_pnl_pct = excluded.realized_pnl_pct,
      unrealized_pnl_pct = excluded.unrealized_pnl_pct,
      total_fees_sol = excluded.total_fees_sol,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at,
      closed_at = excluded.closed_at`
  ).run(
    parsed.positionId,
    parsed.mint,
    parsed.symbol ?? null,
    parsed.title ?? null,
    parsed.status,
    parsed.entryPriceSol,
    parsed.averageEntryPriceSol,
    parsed.currentPriceSol ?? null,
    parsed.sizeSol,
    parsed.remainingSizeSol,
    parsed.tokenAmount,
    parsed.remainingTokenAmount,
    parsed.realizedPnlSol,
    parsed.unrealizedPnlSol,
    parsed.realizedPnlPct,
    parsed.unrealizedPnlPct,
    parsed.totalFeesSol,
    stringifyJson(parsed.payload),
    parsed.openedAt,
    parsed.updatedAt,
    parsed.closedAt ?? null,
    createdAt
  );

  const row = db
    .prepare("select * from paper_portfolio_positions where position_id = ?")
    .get(parsed.positionId) as PaperPortfolioPositionRow | undefined;

  if (!row) {
    throw new Error(
      `Failed to upsert paper portfolio position ${parsed.positionId}`
    );
  }

  return mapPaperPortfolioPositionRow(row);
}

export function listPaperPortfolioPositions(
  limit = 100
): StoredPaperPortfolioPosition[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from paper_portfolio_positions
       order by datetime(updated_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperPortfolioPositionRow[];

  return rows.map(mapPaperPortfolioPositionRow);
}

export function listPaperPortfolioPositionsForState(): StoredPaperPortfolioPosition[] {
  const rows = getDb()
    .prepare(
      `select * from paper_portfolio_positions
       order by datetime(updated_at) asc, id asc`
    )
    .all() as PaperPortfolioPositionRow[];
  return rows.map(mapPaperPortfolioPositionRow);
}

export function getPaperPortfolioPosition(
  mint: string
): StoredPaperPortfolioPosition | null {
  const row = getDb()
    .prepare(
      `select *
       from paper_portfolio_positions
       where mint = ?
       order by datetime(updated_at) desc, id desc
       limit 1`
    )
    .get(mint) as PaperPortfolioPositionRow | undefined;

  return row ? mapPaperPortfolioPositionRow(row) : null;
}

export function savePaperPortfolioSnapshot(
  snapshot: PaperPortfolioSnapshotInput
): StoredPaperPortfolioSnapshot {
  const parsed = paperPortfolioSnapshotInputSchema.parse(snapshot);
  const createdAt = parsed.createdAt ?? new Date().toISOString();
  const db = getDb();

  const result = db
    .prepare(
      `insert into paper_portfolio_snapshots (
        cash_sol,
        deployed_sol,
        equity_sol,
        realized_pnl_sol,
        unrealized_pnl_sol,
        total_pnl_sol,
        total_pnl_pct,
        open_position_count,
        closed_position_count,
        win_rate,
        max_drawdown_sol,
        max_drawdown_pct,
        total_fees_sol,
        total_trades,
        payload_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.cashSol,
      parsed.deployedSol,
      parsed.equitySol,
      parsed.realizedPnlSol,
      parsed.unrealizedPnlSol,
      parsed.totalPnlSol,
      parsed.totalPnlPct,
      parsed.openPositionCount,
      parsed.closedPositionCount,
      parsed.winRate,
      parsed.maxDrawdownSol,
      parsed.maxDrawdownPct,
      parsed.totalFeesSol,
      parsed.totalTrades,
      stringifyJson(parsed.payload),
      createdAt
    );

  return {
    id: toRowId(result.lastInsertRowid),
    cashSol: parsed.cashSol,
    deployedSol: parsed.deployedSol,
    equitySol: parsed.equitySol,
    realizedPnlSol: parsed.realizedPnlSol,
    unrealizedPnlSol: parsed.unrealizedPnlSol,
    totalPnlSol: parsed.totalPnlSol,
    totalPnlPct: parsed.totalPnlPct,
    openPositionCount: parsed.openPositionCount,
    closedPositionCount: parsed.closedPositionCount,
    winRate: parsed.winRate,
    maxDrawdownSol: parsed.maxDrawdownSol,
    maxDrawdownPct: parsed.maxDrawdownPct,
    totalFeesSol: parsed.totalFeesSol,
    totalTrades: parsed.totalTrades,
    payload: parsed.payload,
    createdAt
  };
}

export function listPaperPortfolioSnapshots(
  limit = 50
): StoredPaperPortfolioSnapshot[] {
  const parsedLimit = limitSchema.parse(limit);
  const rows = getDb()
    .prepare(
      `select *
       from paper_portfolio_snapshots
       order by datetime(created_at) desc, id desc
       limit ?`
    )
    .all(parsedLimit) as PaperPortfolioSnapshotRow[];

  return rows.map(mapPaperPortfolioSnapshotRow);
}

export function getStorageStats(): StorageStats {
  const db = getDb();
  const lastSignal = db
    .prepare("select max(created_at) as last_signal_at from signals")
    .get() as LastSignalRow;

  return {
    databasePath: getStoragePath(),
    feedEventCount: countRows(db, "feed_events"),
    liveFeedEventCount: countRows(db, "live_feed_events"),
    launchCandidateCount: countRows(db, "launch_candidates"),
    launchScoreSnapshotCount: countRows(db, "launch_score_snapshots"),
    launchTradeSampleCount: countRows(db, "launch_trade_samples"),
    launchTimeseriesBucketCount: countRows(db, "launch_timeseries_buckets"),
    launchTrackingEventCount: countRows(db, "launch_tracking_events"),
    launchTrackingSessionCount: countRows(db, "launch_tracking_sessions"),
    signalCount: countRows(db, "signals"),
    chainVerificationCount: countRows(db, "chain_verifications"),
    chainTransactionEventCount: countRows(db, "chain_transaction_events"),
    chainTradeEventCount: countRows(db, "chain_trade_events"),
    marketObservationCount: countRows(db, "market_observations"),
    pumpPortalTokenTradeEventCount: countRows(
      db,
      "pumpportal_token_trade_events"
    ),
    actualDataSubscriptionCount: countRows(db, "actual_data_subscriptions"),
    actualDataSessionCount: countRows(db, "actual_data_sessions"),
    meteredLaunchDataSessionCount: countRows(
      db,
      "metered_launch_data_sessions"
    ),
    meteredLaunchDataSubscriptionCount: countRows(
      db,
      "metered_launch_data_subscriptions"
    ),
    meteredLaunchDataEventCount: countRows(db, "metered_launch_data_events"),
    tokenIdentityCount: countRows(db, "token_identities"),
    tokenIdentityResolvedCount: countResolvedTokenIdentities(db),
    tokenIdentityUnresolvedCount: countUnresolvedTokenIdentities(db),
    tokenMetadataFetchCount: countRows(db, "token_metadata_fetches"),
    watchPlanCount: countRows(db, "watch_plans"),
    watchActionCount: countRows(db, "watch_actions"),
    lightningTradePlanCount: countRows(db, "lightning_trade_plans"),
    runtimeSessionCount: countRows(db, "runtime_sessions"),
    operatorActionCount: countRows(db, "operator_actions"),
    capacitySnapshotCount: countRows(db, "capacity_snapshots"),
    calibrationCaptureSessionCount: countRows(
      db,
      "calibration_capture_sessions"
    ),
    calibrationSignalObservationCount: countRows(
      db,
      "calibration_signal_observations"
    ),
    paperStrategyEvaluationCount: countRows(db, "paper_strategy_evaluations"),
    paperLifecycleValidationCount: countRows(db, "paper_lifecycle_validations"),
    paperAutomationDeploymentCount: countRows(
      db,
      "paper_automation_deployments"
    ),
    paperAutomationEventCount: countRows(db, "paper_automation_events"),
    paperAutomationOperationCount: countRows(db, "paper_automation_operations"),
    paperOperationsSessionCount: countRows(db, "paper_operations_sessions"),
    paperOperationsSnapshotCount: countRows(db, "paper_operations_snapshots"),
    paperOperationsAlertCount: countRows(db, "paper_operations_alerts"),
    paperForwardEvaluationCount: countRows(db, "paper_forward_evaluations"),
    paperExitPolicyEvaluationCount: countRows(
      db,
      "paper_exit_policy_evaluations"
    ),
    pumpPortalWalletStatusSnapshotCount: countRows(
      db,
      "pumpportal_wallet_status_snapshots"
    ),
    riskSnapshotCount: countRows(db, "risk_snapshots"),
    candidateDecisionCount: countRows(db, "candidate_decisions"),
    paperOrderCount: countRows(db, "paper_orders"),
    paperPositionCount: countRows(db, "paper_positions"),
    paperPortfolioOrderCount: countRows(db, "paper_portfolio_orders"),
    paperPortfolioFillCount: countRows(db, "paper_portfolio_fills"),
    paperPortfolioPositionCount: countRows(db, "paper_portfolio_positions"),
    paperPortfolioSnapshotCount: countRows(db, "paper_portfolio_snapshots"),
    watchedWalletCount: countRows(db, "watched_wallets"),
    watchedWalletTradeEventCount: countRows(db, "watched_wallet_trade_events"),
    exitRuleCount: countRows(db, "exit_rules"),
    exitSignalCount: countRows(db, "exit_signals"),
    discoveryCoverageSessionCount: countRows(db, "discovery_coverage_sessions"),
    discoveryCoverageEventCount: countRows(db, "discovery_coverage_events"),
    discoveryCoverageConnectionEventCount: countRows(
      db,
      "discovery_coverage_connection_events"
    ),
    tradeDataCoverageSessionCount: countRows(
      db,
      "trade_data_coverage_sessions"
    ),
    tradeDataCoverageEventCount: countRows(db, "trade_data_coverage_events"),
    tradeDataCoverageSubscriptionEventCount: countRows(
      db,
      "trade_data_coverage_subscription_events"
    ),
    lastSignalAt: lastSignal.last_signal_at
  };
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    create table if not exists storage_migrations (
      id integer primary key,
      name text not null,
      applied_at text not null
    )
  `);

  if (!hasMigration(db, 1)) {
    db.exec(`
      create table if not exists feed_events (
        id integer primary key autoincrement,
        event_type text not null,
        mint text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_feed_events_created_at
        on feed_events(created_at);

      create index if not exists idx_feed_events_mint
        on feed_events(mint);

      create table if not exists signals (
        id integer primary key autoincrement,
        mint text not null,
        symbol text not null,
        action text not null,
        score real not null,
        hard_reject integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_signals_created_at
        on signals(created_at);

      create index if not exists idx_signals_mint
        on signals(mint);

      create table if not exists paper_orders (
        id integer primary key autoincrement,
        mint text not null,
        symbol text not null,
        side text not null,
        status text not null,
        size_sol real not null,
        simulated_price real not null,
        reason_codes_json text not null,
        signal_id integer,
        payload_json text not null,
        created_at text not null,
        foreign key(signal_id) references signals(id)
      );

      create index if not exists idx_paper_orders_created_at
        on paper_orders(created_at);

      create index if not exists idx_paper_orders_mint
        on paper_orders(mint);

      create table if not exists paper_positions (
        id integer primary key autoincrement,
        mint text not null unique,
        symbol text not null,
        size_sol real not null,
        token_amount real not null,
        entry_price real not null,
        status text not null,
        payload_json text not null,
        opened_at text not null,
        updated_at text not null
      );

      create index if not exists idx_paper_positions_updated_at
        on paper_positions(updated_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(1, "initial_paper_storage", new Date().toISOString());
  }

  if (!hasMigration(db, 2)) {
    db.exec(`
      create table if not exists risk_snapshots (
        id integer primary key autoincrement,
        mint text not null,
        risk_level text not null,
        hard_reject integer not null,
        risk_score real not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_risk_snapshots_created_at
        on risk_snapshots(created_at);

      create index if not exists idx_risk_snapshots_mint
        on risk_snapshots(mint);

      create table if not exists candidate_decisions (
        id integer primary key autoincrement,
        mint text not null,
        symbol text not null,
        lifecycle_state text not null,
        action text not null,
        score real not null,
        risk_level text not null,
        hard_reject integer not null,
        combined_reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_candidate_decisions_created_at
        on candidate_decisions(created_at);

      create index if not exists idx_candidate_decisions_mint
        on candidate_decisions(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(2, "risk_and_candidate_decisions", new Date().toISOString());
  }

  if (!hasMigration(db, 3)) {
    db.exec(`
      create table if not exists chain_verifications (
        id integer primary key autoincrement,
        mint text not null,
        status text not null,
        reason_codes_json text not null,
        mint_authority_active integer,
        freeze_authority_active integer,
        supply_ui real,
        top_holder_pct real,
        top10_holder_pct real,
        payload_json text not null,
        inspected_at text not null,
        created_at text not null
      );

      create index if not exists idx_chain_verifications_created_at
        on chain_verifications(created_at);

      create index if not exists idx_chain_verifications_mint
        on chain_verifications(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
      values (?, ?, ?)`
    ).run(3, "chain_verifications", new Date().toISOString());
  }

  if (!hasMigration(db, 4)) {
    db.exec(`
      create table if not exists chain_transaction_events (
        id integer primary key autoincrement,
        signature text not null,
        watched_address text not null,
        watched_address_kind text not null,
        mint text,
        status text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_chain_transaction_events_created_at
        on chain_transaction_events(created_at);

      create index if not exists idx_chain_transaction_events_signature
        on chain_transaction_events(signature);

      create index if not exists idx_chain_transaction_events_watched_address
        on chain_transaction_events(watched_address);

      create table if not exists chain_trade_events (
        id integer primary key autoincrement,
        signature text not null,
        mint text not null,
        side text not null,
        confidence text not null,
        price_usd real,
        volume_usd real,
        token_amount real,
        watched_address text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_chain_trade_events_created_at
        on chain_trade_events(created_at);

      create index if not exists idx_chain_trade_events_signature
        on chain_trade_events(signature);

      create index if not exists idx_chain_trade_events_mint
        on chain_trade_events(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(4, "chain_transaction_events", new Date().toISOString());
  }

  if (!hasMigration(db, 5)) {
    db.exec(`
      create table if not exists market_observations (
        id integer primary key autoincrement,
        signature text not null,
        mint text not null,
        side text not null,
        quote_asset text not null,
        quote_mint text,
        base_token_amount real,
        quote_amount real,
        price_quote real,
        price_sol real,
        price_usd real,
        volume_quote real,
        volume_sol real,
        volume_usd real,
        confidence text not null,
        usable_for_metrics integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_market_observations_created_at
        on market_observations(created_at);

      create index if not exists idx_market_observations_signature
        on market_observations(signature);

      create index if not exists idx_market_observations_mint
        on market_observations(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(5, "market_observations", new Date().toISOString());
  }

  if (!hasMigration(db, 6)) {
    db.exec(`
      create table if not exists watch_plans (
        id integer primary key autoincrement,
        mint text not null,
        symbol text,
        source text,
        should_verify_mint integer not null,
        should_watch_events integer not null,
        watch_targets_json text not null,
        skipped_targets_json text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_watch_plans_created_at
        on watch_plans(created_at);

      create index if not exists idx_watch_plans_mint
        on watch_plans(mint);

      create table if not exists watch_actions (
        id integer primary key autoincrement,
        mint text not null,
        action text not null,
        address text not null,
        address_kind text not null,
        status text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_watch_actions_created_at
        on watch_actions(created_at);

      create index if not exists idx_watch_actions_mint
        on watch_actions(mint);

      create index if not exists idx_watch_actions_address
        on watch_actions(address);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
      values (?, ?, ?)`
    ).run(6, "watch_orchestration", new Date().toISOString());
  }

  if (!hasMigration(db, 7)) {
    db.exec(`
      create table if not exists pumpportal_token_trade_events (
        id integer primary key autoincrement,
        mint text not null,
        signature text,
        side text not null,
        trader text,
        price_sol real,
        volume_sol real,
        token_amount real,
        confidence text not null,
        usable_for_metrics integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_pumpportal_token_trade_events_created_at
        on pumpportal_token_trade_events(created_at);

      create index if not exists idx_pumpportal_token_trade_events_mint
        on pumpportal_token_trade_events(mint);

      create index if not exists idx_pumpportal_token_trade_events_signature
        on pumpportal_token_trade_events(signature);

      create table if not exists actual_data_subscriptions (
        id integer primary key autoincrement,
        mint text not null,
        provider text not null,
        status text not null,
        reason text not null,
        event_count integer not null,
        max_events integer not null,
        subscribed_at text,
        unsubscribed_at text,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_actual_data_subscriptions_created_at
        on actual_data_subscriptions(created_at);

      create index if not exists idx_actual_data_subscriptions_mint
        on actual_data_subscriptions(mint);

      create table if not exists actual_data_sessions (
        id integer primary key autoincrement,
        provider text not null,
        status text not null,
        total_event_count integer not null,
        subscribed_token_count integer not null,
        budget_event_limit integer not null,
        started_at text,
        stopped_at text,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_actual_data_sessions_created_at
        on actual_data_sessions(created_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(7, "actual_data_pumpportal_trades", new Date().toISOString());
  }

  if (!hasMigration(db, 8)) {
    db.exec(`
      create table if not exists token_identities (
        id integer primary key autoincrement,
        mint text not null unique,
        name text,
        symbol text,
        title text not null,
        display_name text not null,
        metadata_uri text,
        image_uri text,
        description text,
        website text,
        twitter text,
        telegram text,
        discord text,
        creator text,
        confidence text not null,
        completeness_score real not null,
        real_data integer not null,
        data_source text not null,
        reason_codes_json text not null,
        sources_json text not null,
        payload_json text not null,
        first_seen_at text not null,
        updated_at text not null,
        created_at text not null
      );

      create index if not exists idx_token_identities_updated_at
        on token_identities(updated_at);

      create index if not exists idx_token_identities_mint
        on token_identities(mint);

      create index if not exists idx_token_identities_confidence
        on token_identities(confidence);

      create table if not exists token_metadata_fetches (
        id integer primary key autoincrement,
        mint text not null,
        uri text,
        source text not null,
        status text not null,
        reason_codes_json text not null,
        payload_json text not null,
        fetched_at text not null,
        created_at text not null
      );

      create index if not exists idx_token_metadata_fetches_fetched_at
        on token_metadata_fetches(fetched_at);

      create index if not exists idx_token_metadata_fetches_mint
        on token_metadata_fetches(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(8, "token_identity_normalization", new Date().toISOString());
  }

  if (!hasMigration(db, 9)) {
    db.exec(`
      create table if not exists live_feed_events (
        id integer primary key autoincrement,
        session_id text not null,
        provider text not null,
        event_type text not null,
        mint text not null,
        name text,
        symbol text,
        title text,
        real_data integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_live_feed_events_created_at
        on live_feed_events(created_at);

      create index if not exists idx_live_feed_events_session_id
        on live_feed_events(session_id);

      create index if not exists idx_live_feed_events_mint
        on live_feed_events(mint);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(9, "live_feed_events", new Date().toISOString());
  }

  if (!hasMigration(db, 10)) {
    db.exec(`
      create table if not exists lightning_trade_plans (
        id integer primary key autoincrement,
        plan_id text not null,
        mint text not null,
        action text not null,
        amount_sol real not null,
        mode text not null,
        blocked integer not null,
        blockers_json text not null,
        warnings_json text not null,
        request_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_lightning_trade_plans_created_at
        on lightning_trade_plans(created_at);

      create index if not exists idx_lightning_trade_plans_plan_id
        on lightning_trade_plans(plan_id);

      create index if not exists idx_lightning_trade_plans_mint
        on lightning_trade_plans(mint);

      create table if not exists pumpportal_wallet_status_snapshots (
        id integer primary key autoincrement,
        data_wallet_public_key text,
        trading_wallet_public_key text,
        same_wallet integer not null,
        data_wallet_balance_sol real,
        trading_wallet_balance_sol real,
        data_wallet_status text not null,
        trading_wallet_status text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_pumpportal_wallet_status_snapshots_created_at
        on pumpportal_wallet_status_snapshots(created_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(10, "pumpportal_lightning_readiness", new Date().toISOString());
  }

  if (!hasMigration(db, 11)) {
    db.exec(`
      create table if not exists launch_candidates (
        id integer primary key autoincrement,
        mint text not null unique,
        source text not null,
        event_type text not null,
        name text,
        symbol text,
        title text,
        status text not null,
        reason_codes_json text not null,
        payload_json text not null,
        discovered_at text not null,
        latest_event_at text not null,
        created_at text not null
      );

      create index if not exists idx_launch_candidates_latest_event_at
        on launch_candidates(latest_event_at);

      create index if not exists idx_launch_candidates_status
        on launch_candidates(status);

      create table if not exists launch_trade_samples (
        id integer primary key autoincrement,
        mint text not null,
        signature text,
        side text not null,
        trader text,
        price_sol real,
        volume_sol real,
        token_amount real,
        confidence text not null,
        usable_for_metrics integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_launch_trade_samples_created_at
        on launch_trade_samples(created_at);

      create index if not exists idx_launch_trade_samples_mint
        on launch_trade_samples(mint);

      create table if not exists launch_score_snapshots (
        id integer primary key autoincrement,
        mint text not null,
        score real not null,
        label text not null,
        phase text not null,
        trade_sample_count integer not null,
        price_sol real,
        volume_sol real not null,
        reason_codes_json text not null,
        payload_json text not null,
        evaluated_at text not null,
        created_at text not null
      );

      create index if not exists idx_launch_score_snapshots_evaluated_at
        on launch_score_snapshots(evaluated_at);

      create index if not exists idx_launch_score_snapshots_mint
        on launch_score_snapshots(mint);

      create index if not exists idx_launch_score_snapshots_score
        on launch_score_snapshots(score);

      create table if not exists launch_tracking_events (
        id integer primary key autoincrement,
        mint text not null,
        action text not null,
        status text not null,
        reason text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_launch_tracking_events_created_at
        on launch_tracking_events(created_at);

      create index if not exists idx_launch_tracking_events_mint
        on launch_tracking_events(mint);

      create table if not exists launch_tracking_sessions (
        id integer primary key autoincrement,
        provider text not null,
        status text not null,
        tracked_token_count integer not null,
        total_event_count integer not null,
        estimated_cost_sol real,
        budget_limit_sol real not null,
        reason_codes_json text not null,
        payload_json text not null,
        started_at text,
        stopped_at text,
        created_at text not null
      );

      create index if not exists idx_launch_tracking_sessions_created_at
        on launch_tracking_sessions(created_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(11, "launch_scanner", new Date().toISOString());
  }

  if (!hasMigration(db, 12)) {
    db.exec(`
      create table if not exists watched_wallets (
        id integer primary key autoincrement,
        address text not null unique,
        alias text,
        tags_json text not null,
        enabled integer not null,
        source text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_watched_wallets_updated_at
        on watched_wallets(updated_at);

      create table if not exists watched_wallet_trade_events (
        id integer primary key autoincrement,
        wallet text not null,
        wallet_alias text,
        mint text not null,
        side text not null,
        price_sol real,
        volume_sol real,
        token_amount real,
        signature text,
        confidence text not null,
        usable_for_exit_strategy integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_watched_wallet_trade_events_created_at
        on watched_wallet_trade_events(created_at);

      create index if not exists idx_watched_wallet_trade_events_wallet
        on watched_wallet_trade_events(wallet);

      create index if not exists idx_watched_wallet_trade_events_mint
        on watched_wallet_trade_events(mint);

      create table if not exists exit_rules (
        id integer primary key autoincrement,
        rule_id text not null unique,
        name text not null,
        enabled integer not null,
        trigger text not null,
        min_profit_pct real not null,
        min_profit_sol real,
        sell_pct real not null,
        require_position_opened_before_wallet_trade integer not null,
        max_position_age_ms real,
        cooldown_ms real not null,
        priority real not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_exit_rules_rule_id
        on exit_rules(rule_id);

      create table if not exists exit_signals (
        id integer primary key autoincrement,
        signal_id text not null,
        mint text not null,
        wallet text not null,
        wallet_alias text,
        rule_id text not null,
        action text not null,
        sell_pct real not null,
        blocked integer not null,
        blockers_json text not null,
        warnings_json text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_exit_signals_created_at
        on exit_signals(created_at);

      create index if not exists idx_exit_signals_mint
        on exit_signals(mint);

      create index if not exists idx_exit_signals_wallet
        on exit_signals(wallet);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(12, "watched_wallet_exit_strategy", new Date().toISOString());
  }

  if (!hasMigration(db, 13)) {
    db.exec(`
      create table if not exists paper_portfolio_orders (
        id integer primary key autoincrement,
        order_id text not null,
        type text not null,
        side text not null,
        mint text not null,
        symbol text,
        title text,
        source text not null,
        requested_size_sol real,
        requested_sell_pct real,
        signal_score real,
        risk_level text,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_paper_portfolio_orders_created_at
        on paper_portfolio_orders(created_at);

      create index if not exists idx_paper_portfolio_orders_mint
        on paper_portfolio_orders(mint);

      create index if not exists idx_paper_portfolio_orders_order_id
        on paper_portfolio_orders(order_id);

      create table if not exists paper_portfolio_fills (
        id integer primary key autoincrement,
        fill_id text not null,
        order_id text not null,
        side text not null,
        mint text not null,
        price_sol real not null,
        effective_price_sol real not null,
        size_sol real not null,
        token_amount real not null,
        fee_sol real not null,
        slippage_sol real not null,
        fill_status text not null,
        rejection_reason text,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_paper_portfolio_fills_created_at
        on paper_portfolio_fills(created_at);

      create index if not exists idx_paper_portfolio_fills_mint
        on paper_portfolio_fills(mint);

      create index if not exists idx_paper_portfolio_fills_order_id
        on paper_portfolio_fills(order_id);

      create table if not exists paper_portfolio_positions (
        id integer primary key autoincrement,
        position_id text not null unique,
        mint text not null,
        symbol text,
        title text,
        status text not null,
        entry_price_sol real not null,
        average_entry_price_sol real not null,
        current_price_sol real,
        size_sol real not null,
        remaining_size_sol real not null,
        token_amount real not null,
        remaining_token_amount real not null,
        realized_pnl_sol real not null,
        unrealized_pnl_sol real not null,
        realized_pnl_pct real not null,
        unrealized_pnl_pct real not null,
        total_fees_sol real not null,
        payload_json text not null,
        opened_at text not null,
        updated_at text not null,
        closed_at text,
        created_at text not null
      );

      create index if not exists idx_paper_portfolio_positions_updated_at
        on paper_portfolio_positions(updated_at);

      create index if not exists idx_paper_portfolio_positions_mint
        on paper_portfolio_positions(mint);

      create index if not exists idx_paper_portfolio_positions_status
        on paper_portfolio_positions(status);

      create table if not exists paper_portfolio_snapshots (
        id integer primary key autoincrement,
        cash_sol real not null,
        deployed_sol real not null,
        equity_sol real not null,
        realized_pnl_sol real not null,
        unrealized_pnl_sol real not null,
        total_pnl_sol real not null,
        total_pnl_pct real not null,
        open_position_count integer not null,
        closed_position_count integer not null,
        win_rate real not null,
        max_drawdown_sol real not null,
        max_drawdown_pct real not null,
        total_fees_sol real not null,
        total_trades integer not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_paper_portfolio_snapshots_created_at
        on paper_portfolio_snapshots(created_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(13, "paper_portfolio_pnl_engine", new Date().toISOString());
  }

  if (!hasMigration(db, 14)) {
    db.exec(`
      create table if not exists metered_launch_data_sessions (
        id integer primary key autoincrement,
        status text not null,
        mode text not null,
        tracked_mint_count integer not null,
        total_events integer not null,
        estimated_cost_sol real not null,
        budget_reached integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        started_at text,
        stopped_at text,
        created_at text not null
      );

      create index if not exists idx_metered_launch_data_sessions_created_at
        on metered_launch_data_sessions(created_at);

      create table if not exists metered_launch_data_subscriptions (
        id integer primary key autoincrement,
        mint text not null,
        status text not null,
        reason text not null,
        event_count integer not null,
        estimated_cost_sol real not null,
        subscribed_at text,
        unsubscribed_at text,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_metered_launch_data_subscriptions_created_at
        on metered_launch_data_subscriptions(created_at);

      create index if not exists idx_metered_launch_data_subscriptions_mint
        on metered_launch_data_subscriptions(mint);

      create table if not exists metered_launch_data_events (
        id integer primary key autoincrement,
        mint text not null,
        signature text,
        side text not null,
        trader text,
        price_sol real,
        volume_sol real,
        token_amount real,
        usable_for_metrics integer not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_metered_launch_data_events_created_at
        on metered_launch_data_events(created_at);

      create index if not exists idx_metered_launch_data_events_mint
        on metered_launch_data_events(mint);

      create index if not exists idx_metered_launch_data_events_signature
        on metered_launch_data_events(signature);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(14, "metered_launch_data", new Date().toISOString());
  }

  if (!hasMigration(db, 15)) {
    db.exec(`
      create table if not exists runtime_sessions (
        id integer primary key autoincrement,
        session_id text not null unique,
        runtime_mode text not null,
        paid_data_armed integer not null,
        started_at text not null,
        stopped_at text,
        stop_reason text,
        config_fingerprint text not null,
        created_at text not null
      );

      create index if not exists idx_runtime_sessions_created_at
        on runtime_sessions(created_at);

      create table if not exists operator_actions (
        id integer primary key autoincrement,
        action_id text not null unique,
        action text not null,
        target text not null,
        safe_parameters_json text not null,
        outcome text not null,
        reason_codes_json text not null,
        created_at text not null
      );

      create index if not exists idx_operator_actions_created_at
        on operator_actions(created_at);

      create index if not exists idx_operator_actions_target
        on operator_actions(target);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(15, "runtime_control_audit", new Date().toISOString());
  }

  if (!hasMigration(db, 16)) {
    db.exec(`
      create table if not exists capacity_snapshots (
        id integer primary key autoincrement,
        snapshot_id text not null unique,
        runtime_session_id text not null,
        observation_window_ms real not null,
        launch_count integer not null,
        launch_rate_per_minute real not null,
        tracked_mint_count integer not null,
        protected_mint_count integer not null,
        required_initial_slots real not null,
        available_newest_slots integer not null,
        initial_coverage_ratio real not null,
        observed_events_per_second real not null,
        projected_hourly_events real not null,
        projected_hourly_cost_sol real not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null
      );

      create index if not exists idx_capacity_snapshots_created_at
        on capacity_snapshots(created_at);

      create index if not exists idx_capacity_snapshots_runtime_session
        on capacity_snapshots(runtime_session_id);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(16, "capacity_snapshots", new Date().toISOString());
  }

  if (!hasMigration(db, 17)) {
    db.exec(`
      create table if not exists launch_timeseries_buckets (
        id integer primary key autoincrement,
        mint text not null,
        bucket_start text not null,
        bucket_end text not null,
        trade_count integer not null,
        volume_sol real not null,
        volume_usd real not null,
        close_sol real,
        close_usd real,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null,
        updated_at text not null,
        unique(mint, bucket_start)
      );

      create index if not exists idx_launch_timeseries_buckets_start
        on launch_timeseries_buckets(bucket_start);

      create index if not exists idx_launch_timeseries_buckets_mint_start
        on launch_timeseries_buckets(mint, bucket_start);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(17, "canonical_launch_timeseries", new Date().toISOString());
  }

  if (!hasMigration(db, 18)) {
    db.exec(`
      create table if not exists calibration_capture_sessions (
        id integer primary key autoincrement,
        session_id text not null unique,
        runtime_session_id text not null,
        strategy_version text not null,
        partition text not null,
        status text not null,
        started_at text not null,
        stopped_at text,
        payload_json text not null,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_calibration_capture_sessions_runtime
        on calibration_capture_sessions(runtime_session_id);

      create index if not exists idx_calibration_capture_sessions_status
        on calibration_capture_sessions(status);

      create table if not exists calibration_signal_observations (
        id integer primary key autoincrement,
        observation_id text not null unique,
        capture_session_id text not null,
        runtime_session_id text not null,
        mint text not null,
        strategy_version text not null,
        partition text not null,
        source_snapshot_id integer not null,
        signal_at text not null,
        score real not null,
        status text not null,
        outcome_at text,
        payload_json text not null,
        created_at text not null,
        updated_at text not null,
        unique(capture_session_id, mint, source_snapshot_id)
      );

      create index if not exists idx_calibration_observations_session_signal
        on calibration_signal_observations(capture_session_id, signal_at);

      create index if not exists idx_calibration_observations_session_status
        on calibration_signal_observations(capture_session_id, status);

      create index if not exists idx_calibration_observations_mint_signal
        on calibration_signal_observations(mint, signal_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(18, "calibration_session_capture", new Date().toISOString());
  }

  if (!hasMigration(db, 19)) {
    db.exec(`
      create table if not exists paper_strategy_evaluations (
        id integer primary key autoincrement,
        evaluation_id text not null unique,
        evaluation_version text not null,
        strategy_version text not null,
        status text not null,
        selected_threshold real,
        capture_session_ids_json text not null,
        payload_json text not null,
        evaluated_at text not null,
        created_at text not null
      );

      create index if not exists idx_paper_strategy_evaluations_status
        on paper_strategy_evaluations(status);

      create index if not exists idx_paper_strategy_evaluations_evaluated_at
        on paper_strategy_evaluations(evaluated_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(19, "paper_strategy_evaluation", new Date().toISOString());
  }

  if (!hasMigration(db, 20)) {
    db.exec(`
      create table if not exists paper_exit_policy_evaluations (
        id integer primary key autoincrement,
        evaluation_id text not null unique,
        policy_version text not null,
        mint text not null,
        status text not null,
        selected_rule_id text,
        payload_json text not null,
        evaluated_at text not null,
        created_at text not null
      );

      create index if not exists idx_paper_exit_policy_evaluations_mint
        on paper_exit_policy_evaluations(mint, evaluated_at);

      create index if not exists idx_paper_exit_policy_evaluations_status
        on paper_exit_policy_evaluations(status, evaluated_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(20, "paper_exit_policy_evaluation", new Date().toISOString());
  }

  if (!hasMigration(db, 21)) {
    db.exec(`
      create table if not exists paper_lifecycle_validations (
        id integer primary key autoincrement,
        validation_id text not null unique,
        validation_version text not null,
        strategy_evaluation_id text not null,
        status text not null,
        selected_threshold real not null,
        capture_session_ids_json text not null,
        payload_json text not null,
        evaluated_at text not null,
        created_at text not null
      );

      create index if not exists idx_paper_lifecycle_validations_status
        on paper_lifecycle_validations(status, evaluated_at);

      create index if not exists idx_paper_lifecycle_validations_strategy
        on paper_lifecycle_validations(strategy_evaluation_id, evaluated_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(21, "paper_lifecycle_validation", new Date().toISOString());
  }

  if (!hasMigration(db, 22)) {
    db.exec(`
      create table if not exists paper_automation_deployments (
        id integer primary key autoincrement,
        deployment_id text not null unique,
        automation_version text not null,
        validation_id text not null,
        status text not null,
        selected_threshold real not null,
        payload_json text not null,
        approved_at text not null,
        updated_at text not null
      );

      create unique index if not exists idx_paper_automation_active_validation
        on paper_automation_deployments(validation_id, deployment_id);
      create index if not exists idx_paper_automation_deployments_status
        on paper_automation_deployments(status, approved_at);

      create table if not exists paper_automation_events (
        id integer primary key autoincrement,
        event_id text not null unique,
        deployment_id text not null,
        operation_id text,
        kind text not null,
        mint text,
        payload_json text not null,
        observed_at text not null,
        created_at text not null
      );

      create index if not exists idx_paper_automation_events_deployment
        on paper_automation_events(deployment_id, observed_at);
      create index if not exists idx_paper_automation_events_operation
        on paper_automation_events(operation_id);

      create table if not exists paper_automation_operations (
        id integer primary key autoincrement,
        operation_id text not null unique,
        deployment_id text not null,
        kind text not null,
        status text not null,
        mint text not null,
        execute_after text not null,
        expires_at text not null,
        payload_json text not null,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_paper_automation_operations_pending
        on paper_automation_operations(deployment_id, status, execute_after);
      create index if not exists idx_paper_automation_operations_mint
        on paper_automation_operations(deployment_id, mint, status);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(22, "paper_automation_forward_validation", new Date().toISOString());
  }

  if (!hasMigration(db, 23)) {
    db.exec(`
      create table if not exists paper_operations_sessions (
        id integer primary key autoincrement,
        session_id text not null unique,
        deployment_id text not null,
        runtime_session_id text not null,
        status text not null,
        payload_json text not null,
        started_at text not null,
        ended_at text,
        updated_at text not null
      );

      create unique index if not exists idx_paper_operations_active
        on paper_operations_sessions(status) where status = 'active';
      create index if not exists idx_paper_operations_deployment
        on paper_operations_sessions(deployment_id, started_at);

      create table if not exists paper_operations_snapshots (
        id integer primary key autoincrement,
        sample_id text not null unique,
        session_id text not null,
        kind text not null,
        payload_json text not null,
        observed_at text not null,
        created_at text not null
      );

      create index if not exists idx_paper_operations_snapshots_session
        on paper_operations_snapshots(session_id, observed_at);

      create table if not exists paper_operations_alerts (
        id integer primary key autoincrement,
        alert_id text not null unique,
        session_id text not null,
        sample_id text not null,
        severity text not null,
        code text not null,
        payload_json text not null,
        observed_at text not null,
        created_at text not null
      );

      create index if not exists idx_paper_operations_alerts_session
        on paper_operations_alerts(session_id, observed_at);
      create index if not exists idx_paper_operations_alerts_severity
        on paper_operations_alerts(session_id, severity, observed_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(
      23,
      "paper_forward_operations_observability",
      new Date().toISOString()
    );
  }

  if (!hasMigration(db, 24)) {
    db.exec(`
      create table if not exists paper_forward_evaluations (
        id integer primary key autoincrement,
        evaluation_id text not null unique,
        deployment_id text not null,
        status text not null,
        payload_json text not null,
        evaluated_at text not null,
        created_at text not null
      );

      create index if not exists idx_paper_forward_evaluations_deployment
        on paper_forward_evaluations(deployment_id, evaluated_at);
      create index if not exists idx_paper_forward_evaluations_status
        on paper_forward_evaluations(status, evaluated_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(24, "paper_forward_evidence_evaluation", new Date().toISOString());
  }

  if (!hasMigration(db, 25)) {
    db.exec(`
      create table if not exists discovery_coverage_sessions (
        id integer primary key autoincrement,
        session_id text not null unique,
        provider text not null,
        source_mode text not null,
        local_reconciliation_status text not null,
        upstream_coverage_status text not null,
        raw_frame_count integer not null,
        pipeline_completed_count integer not null,
        payload_json text not null,
        started_at text not null,
        stopped_at text,
        updated_at text not null
      );

      create index if not exists idx_discovery_coverage_sessions_started
        on discovery_coverage_sessions(started_at);

      create table if not exists discovery_coverage_events (
        id integer primary key autoincrement,
        session_id text not null,
        correlation_id text not null,
        source_event_key text,
        event_type text not null,
        mint text,
        parser_outcome text not null,
        normalization_outcome text not null,
        pipeline_outcome text not null,
        payload_json text not null,
        received_at text not null,
        completed_at text,
        created_at text not null,
        unique(session_id, correlation_id),
        foreign key(session_id) references discovery_coverage_sessions(session_id)
      );

      create index if not exists idx_discovery_coverage_events_session
        on discovery_coverage_events(session_id, received_at);
      create index if not exists idx_discovery_coverage_events_source_key
        on discovery_coverage_events(source_event_key, event_type);
      create index if not exists idx_discovery_coverage_events_type_created
        on discovery_coverage_events(event_type, created_at);
      create index if not exists idx_discovery_coverage_events_mint
        on discovery_coverage_events(mint, received_at);
      create index if not exists idx_discovery_coverage_events_outcomes
        on discovery_coverage_events(session_id, parser_outcome, pipeline_outcome);

      create table if not exists discovery_coverage_connection_events (
        id integer primary key autoincrement,
        connection_event_id text not null unique,
        session_id text not null,
        event_type text not null,
        connection_id text not null,
        gap_status text not null,
        payload_json text not null,
        created_at text not null,
        foreign key(session_id) references discovery_coverage_sessions(session_id)
      );

      create index if not exists idx_discovery_coverage_connection_session
        on discovery_coverage_connection_events(session_id, created_at);
      create index if not exists idx_discovery_coverage_connection_type
        on discovery_coverage_connection_events(session_id, event_type, created_at);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(25, "discovery_coverage_instrumentation", new Date().toISOString());
  }

  if (!hasMigration(db, 26)) {
    db.exec(`
      create table if not exists trade_data_coverage_sessions (
        id integer primary key autoincrement,
        session_id text not null unique,
        schema_version text not null,
        provider text not null,
        selected_mint text not null,
        started_at text not null,
        stopped_at text,
        stop_reason text,
        subscription_summary_json text not null,
        counters_json text not null,
        latency_summary_json text not null,
        consistency_summary_json text not null,
        timeseries_summary_json text not null,
        estimated_cost_sol real not null,
        local_reconciliation_status text not null,
        upstream_coverage_status text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null,
        updated_at text not null
      );

      create index if not exists idx_trade_data_coverage_sessions_started
        on trade_data_coverage_sessions(started_at);
      create index if not exists idx_trade_data_coverage_sessions_mint
        on trade_data_coverage_sessions(selected_mint, started_at);
      create index if not exists idx_trade_data_coverage_sessions_outcomes
        on trade_data_coverage_sessions(local_reconciliation_status, upstream_coverage_status);

      create table if not exists trade_data_coverage_events (
        id integer primary key autoincrement,
        session_id text not null,
        correlation_id text not null,
        source_event_key text,
        subscribed_mint text not null,
        observed_mint text,
        signature text,
        side text,
        parser_outcome text not null,
        normalization_outcome text not null,
        pipeline_outcome text not null,
        usable_for_metrics integer not null,
        duplicate_key text,
        rejection_reason text,
        failure_stage text,
        failure_reason text,
        price_sol real,
        volume_sol real,
        token_amount real,
        trader text,
        provider_timestamp text,
        received_at text not null,
        completed_at text,
        post_stop integer not null,
        stage_timestamps_json text not null,
        stage_latencies_json text not null,
        consistency_checks_json text not null,
        reason_codes_json text not null,
        payload_json text not null,
        created_at text not null,
        unique(session_id, correlation_id),
        foreign key(session_id) references trade_data_coverage_sessions(session_id)
      );

      create index if not exists idx_trade_data_coverage_events_session
        on trade_data_coverage_events(session_id, received_at);
      create index if not exists idx_trade_data_coverage_events_source_key
        on trade_data_coverage_events(session_id, source_event_key);
      create index if not exists idx_trade_data_coverage_events_signature
        on trade_data_coverage_events(signature, received_at);
      create index if not exists idx_trade_data_coverage_events_mint
        on trade_data_coverage_events(observed_mint, received_at);
      create index if not exists idx_trade_data_coverage_events_outcomes
        on trade_data_coverage_events(session_id, parser_outcome, normalization_outcome, pipeline_outcome);
      create index if not exists idx_trade_data_coverage_events_timestamps
        on trade_data_coverage_events(received_at, completed_at);

      create table if not exists trade_data_coverage_subscription_events (
        id integer primary key autoincrement,
        subscription_event_id text not null unique,
        session_id text not null,
        mint text not null,
        event_type text not null,
        safe_reason text,
        event_timestamp text not null,
        payload_json text not null,
        created_at text not null,
        foreign key(session_id) references trade_data_coverage_sessions(session_id)
      );

      create index if not exists idx_trade_data_coverage_subscription_session
        on trade_data_coverage_subscription_events(session_id, event_timestamp);
      create index if not exists idx_trade_data_coverage_subscription_mint
        on trade_data_coverage_subscription_events(mint, event_timestamp);
      create index if not exists idx_trade_data_coverage_subscription_type
        on trade_data_coverage_subscription_events(session_id, event_type, event_timestamp);
    `);

    db.prepare(
      `insert into storage_migrations (id, name, applied_at)
       values (?, ?, ?)`
    ).run(26, "trade_data_coverage_validation", new Date().toISOString());
  }
}

function hasMigration(db: DatabaseSync, id: number): boolean {
  const row = db
    .prepare("select id from storage_migrations where id = ?")
    .get(id) as { id: number } | undefined;

  return Boolean(row);
}

function countRows(db: DatabaseSync, tableName: string): number {
  const row = db.prepare(`select count(*) as count from ${tableName}`).get() as
    CountRow | undefined;

  return row?.count ?? 0;
}

function countResolvedTokenIdentities(db: DatabaseSync): number {
  const row = db
    .prepare(
      `select count(*) as count
       from token_identities
       where (name is not null and name != '') or (symbol is not null and symbol != '')`
    )
    .get() as CountRow | undefined;

  return row?.count ?? 0;
}

function countUnresolvedTokenIdentities(db: DatabaseSync): number {
  const row = db
    .prepare(
      `select count(*) as count
       from token_identities
       where (name is null or name = '') and (symbol is null or symbol = '')`
    )
    .get() as CountRow | undefined;

  return row?.count ?? 0;
}

function getDb(): DatabaseSync {
  if (!activeStorage) {
    initStorage();
  }

  if (!activeStorage) {
    throw new Error("Storage failed to initialize.");
  }

  return activeStorage.db;
}

function getStoragePath(): string {
  if (!activeStorage) {
    initStorage();
  }

  if (!activeStorage) {
    throw new Error("Storage failed to initialize.");
  }

  return activeStorage.databasePath;
}

function resolveDatabasePath(databasePath?: string): string {
  if (databasePath) {
    return isAbsolute(databasePath)
      ? databasePath
      : join(findWorkspaceRoot(cwd()), databasePath);
  }

  return join(findWorkspaceRoot(cwd()), defaultDatabaseRelativePath);
}

function findWorkspaceRoot(startDirectory: string): string {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    if (existsSync(join(currentDirectory, "pnpm-workspace.yaml"))) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
}

function getFeedEventMint(event: FeedEvent): string {
  if (event.type === "token_created") {
    return event.candidate.mint;
  }

  return event.mint;
}

function getFeedEventTimestamp(event: FeedEvent): string {
  return event.timestamp || new Date().toISOString();
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function sanitizeStoragePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStoragePayload(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = isSecretStorageKey(key)
      ? "[redacted]"
      : sanitizeStoragePayload(entry);
  }

  return sanitized;
}

function isSecretStorageKey(key: string): boolean {
  return /(api[_-]?key|private[_-]?key|seed|secret|mnemonic|keypair)/i.test(
    key
  );
}

function tokenIdentityValues(
  identity: TokenIdentity,
  createdAt: string
): [
  string,
  string | null,
  string | null,
  string,
  string,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  TokenIdentityConfidence,
  number,
  number,
  TokenIdentityDataSource,
  string,
  string,
  string,
  string,
  string,
  string
] {
  return [
    identity.mint,
    identity.name,
    identity.symbol,
    identity.title,
    identity.displayName,
    identity.metadataUri,
    identity.imageUri,
    identity.description,
    identity.website,
    identity.twitter,
    identity.telegram,
    identity.discord,
    identity.creator,
    identity.confidence,
    identity.completenessScore,
    identity.realData ? 1 : 0,
    identity.dataSource,
    stringifyJson(identity.reasonCodes),
    stringifyJson(identity.sources),
    stringifyJson(identity),
    identity.firstSeenAt,
    identity.updatedAt,
    createdAt
  ];
}

function mapFeedEventRow(row: FeedEventRow): StoredFeedEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    mint: row.mint,
    payload: JSON.parse(row.payload_json) as FeedEvent,
    createdAt: row.created_at
  };
}

function mapSignalRow(row: SignalRow): StoredSignal {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    action: row.action,
    score: row.score,
    hardReject: Boolean(row.hard_reject),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: OverlaySignalSchema.parse(JSON.parse(row.payload_json)),
    createdAt: row.created_at
  };
}

function mapPaperOrderRow(row: PaperOrderRow): StoredPaperOrder {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    side: row.side,
    status: row.status,
    sizeSol: row.size_sol,
    simulatedPrice: row.simulated_price,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    signalId: row.signal_id,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapPaperPositionRow(row: PaperPositionRow): StoredPaperPosition {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    sizeSol: row.size_sol,
    tokenAmount: row.token_amount,
    entryPrice: row.entry_price,
    status: row.status,
    payload: JSON.parse(row.payload_json),
    openedAt: row.opened_at,
    updatedAt: row.updated_at
  };
}

function mapPaperPortfolioOrderRow(
  row: PaperPortfolioOrderRow
): StoredPaperPortfolioOrder {
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.type,
    side: row.side,
    mint: row.mint,
    symbol: row.symbol,
    title: row.title,
    source: row.source,
    requestedSizeSol: row.requested_size_sol,
    requestedSellPct: row.requested_sell_pct,
    signalScore: row.signal_score,
    riskLevel: row.risk_level,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapPaperPortfolioFillRow(
  row: PaperPortfolioFillRow
): StoredPaperPortfolioFill {
  return {
    id: row.id,
    fillId: row.fill_id,
    orderId: row.order_id,
    side: row.side,
    mint: row.mint,
    priceSol: row.price_sol,
    effectivePriceSol: row.effective_price_sol,
    sizeSol: row.size_sol,
    tokenAmount: row.token_amount,
    feeSol: row.fee_sol,
    slippageSol: row.slippage_sol,
    fillStatus: row.fill_status,
    rejectionReason: row.rejection_reason,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapPaperPortfolioPositionRow(
  row: PaperPortfolioPositionRow
): StoredPaperPortfolioPosition {
  return {
    id: row.id,
    positionId: row.position_id,
    mint: row.mint,
    symbol: row.symbol,
    title: row.title,
    status: row.status,
    entryPriceSol: row.entry_price_sol,
    averageEntryPriceSol: row.average_entry_price_sol,
    currentPriceSol: row.current_price_sol,
    sizeSol: row.size_sol,
    remainingSizeSol: row.remaining_size_sol,
    tokenAmount: row.token_amount,
    remainingTokenAmount: row.remaining_token_amount,
    realizedPnlSol: row.realized_pnl_sol,
    unrealizedPnlSol: row.unrealized_pnl_sol,
    realizedPnlPct: row.realized_pnl_pct,
    unrealizedPnlPct: row.unrealized_pnl_pct,
    totalFeesSol: row.total_fees_sol,
    payload: JSON.parse(row.payload_json),
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    createdAt: row.created_at
  };
}

function mapPaperPortfolioSnapshotRow(
  row: PaperPortfolioSnapshotRow
): StoredPaperPortfolioSnapshot {
  return {
    id: row.id,
    cashSol: row.cash_sol,
    deployedSol: row.deployed_sol,
    equitySol: row.equity_sol,
    realizedPnlSol: row.realized_pnl_sol,
    unrealizedPnlSol: row.unrealized_pnl_sol,
    totalPnlSol: row.total_pnl_sol,
    totalPnlPct: row.total_pnl_pct,
    openPositionCount: row.open_position_count,
    closedPositionCount: row.closed_position_count,
    winRate: row.win_rate,
    maxDrawdownSol: row.max_drawdown_sol,
    maxDrawdownPct: row.max_drawdown_pct,
    totalFeesSol: row.total_fees_sol,
    totalTrades: row.total_trades,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapChainVerificationRow(
  row: ChainVerificationRow
): StoredChainVerification {
  return {
    id: row.id,
    mint: row.mint,
    status: row.status,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    mintAuthorityActive: nullableIntToBool(row.mint_authority_active),
    freezeAuthorityActive: nullableIntToBool(row.freeze_authority_active),
    supplyUi: row.supply_ui,
    topHolderPct: row.top_holder_pct,
    top10HolderPct: row.top10_holder_pct,
    payload: JSON.parse(row.payload_json),
    inspectedAt: row.inspected_at,
    createdAt: row.created_at
  };
}

function mapChainTransactionEventRow(
  row: ChainTransactionEventRow
): StoredChainTransactionEvent {
  const payload = chainTransactionEventInputSchema.parse(
    JSON.parse(row.payload_json)
  ) as ChainTransactionEvent;

  return {
    ...payload,
    id: row.id,
    createdAt: row.created_at
  };
}

function mapChainTradeEventRow(row: ChainTradeEventRow): StoredChainTradeEvent {
  const payload = chainTradeEventInputSchema.parse(
    JSON.parse(row.payload_json)
  ) as NormalizedChainTradeEvent;

  return {
    ...payload,
    id: row.id,
    createdAt: row.created_at
  };
}

function mapMarketObservationRow(
  row: MarketObservationRow
): StoredMarketObservation {
  const payload = marketObservationInputSchema.parse(
    JSON.parse(row.payload_json)
  ) as MarketObservation;

  return {
    ...payload,
    id: row.id,
    createdAt: row.created_at
  };
}

function mapPumpPortalTokenTradeEventRow(
  row: PumpPortalTokenTradeEventRow
): StoredPumpPortalTokenTradeEvent {
  return {
    id: row.id,
    mint: row.mint,
    signature: row.signature,
    side: row.side,
    trader: row.trader,
    priceSol: row.price_sol,
    volumeSol: row.volume_sol,
    tokenAmount: row.token_amount,
    confidence: row.confidence,
    usableForMetrics: Boolean(row.usable_for_metrics),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapLiveFeedEventRow(row: LiveFeedEventRow): StoredLiveFeedEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    provider: row.provider,
    eventType: row.event_type,
    mint: row.mint,
    name: row.name,
    symbol: row.symbol,
    title: row.title,
    realData: Boolean(row.real_data),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapActualDataSubscriptionRow(
  row: ActualDataSubscriptionRow
): StoredActualDataSubscription {
  return {
    id: row.id,
    mint: row.mint,
    provider: row.provider,
    status: row.status,
    reason: row.reason,
    eventCount: row.event_count,
    maxEvents: row.max_events,
    subscribedAt: row.subscribed_at,
    unsubscribedAt: row.unsubscribed_at,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapActualDataSessionRow(
  row: ActualDataSessionRow
): StoredActualDataSession {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    totalEventCount: row.total_event_count,
    subscribedTokenCount: row.subscribed_token_count,
    budgetEventLimit: row.budget_event_limit,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapMeteredLaunchDataSessionRow(
  row: MeteredLaunchDataSessionRow
): StoredMeteredLaunchDataSession {
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    trackedMintCount: row.tracked_mint_count,
    totalEvents: row.total_events,
    estimatedCostSol: row.estimated_cost_sol,
    budgetReached: Boolean(row.budget_reached),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    createdAt: row.created_at
  };
}

function mapMeteredLaunchDataSubscriptionRow(
  row: MeteredLaunchDataSubscriptionRow
): StoredMeteredLaunchDataSubscription {
  return {
    id: row.id,
    mint: row.mint,
    status: row.status,
    reason: row.reason,
    eventCount: row.event_count,
    estimatedCostSol: row.estimated_cost_sol,
    subscribedAt: row.subscribed_at,
    unsubscribedAt: row.unsubscribed_at,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapMeteredLaunchDataEventRow(
  row: MeteredLaunchDataEventRow
): StoredMeteredLaunchDataEvent {
  return {
    id: row.id,
    mint: row.mint,
    signature: row.signature,
    side: row.side,
    trader: row.trader,
    priceSol: row.price_sol,
    volumeSol: row.volume_sol,
    tokenAmount: row.token_amount,
    usableForMetrics: Boolean(row.usable_for_metrics),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapLaunchCandidateRow(row: LaunchCandidateRow): StoredLaunchCandidate {
  return {
    id: row.id,
    mint: row.mint,
    source: row.source,
    eventType: row.event_type,
    name: row.name,
    symbol: row.symbol,
    title: row.title,
    status: row.status,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    discoveredAt: row.discovered_at,
    latestEventAt: row.latest_event_at,
    createdAt: row.created_at
  };
}

function mapLaunchTradeSampleRow(
  row: LaunchTradeSampleRow
): StoredLaunchTradeSample {
  return {
    id: row.id,
    mint: row.mint,
    signature: row.signature,
    side: row.side,
    trader: row.trader,
    priceSol: row.price_sol,
    volumeSol: row.volume_sol,
    tokenAmount: row.token_amount,
    confidence: row.confidence,
    usableForMetrics: Boolean(row.usable_for_metrics),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapLaunchTimeseriesBucketRow(
  row: LaunchTimeseriesBucketRow
): StoredLaunchTimeseriesBucket {
  const payload = launchTimeseriesBucketInputSchema.parse(
    JSON.parse(row.payload_json)
  );

  return {
    ...payload,
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapLaunchScoreSnapshotRow(
  row: LaunchScoreSnapshotRow
): StoredLaunchScoreSnapshot {
  return {
    id: row.id,
    mint: row.mint,
    score: row.score,
    label: row.label,
    phase: row.phase,
    tradeSampleCount: row.trade_sample_count,
    priceSol: row.price_sol,
    volumeSol: row.volume_sol,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    evaluatedAt: row.evaluated_at,
    createdAt: row.created_at
  };
}

function mapLaunchTrackingEventRow(
  row: LaunchTrackingEventRow
): StoredLaunchTrackingEvent {
  return {
    id: row.id,
    mint: row.mint,
    action: row.action,
    status: row.status,
    reason: row.reason,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapLaunchTrackingSessionRow(
  row: LaunchTrackingSessionRow
): StoredLaunchTrackingSession {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    trackedTokenCount: row.tracked_token_count,
    totalEventCount: row.total_event_count,
    estimatedCostSol: row.estimated_cost_sol,
    budgetLimitSol: row.budget_limit_sol,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    createdAt: row.created_at
  };
}

function mapTokenIdentityRow(row: TokenIdentityRow): StoredTokenIdentity {
  const payload = tokenIdentityInputSchema.parse(
    JSON.parse(row.payload_json)
  ) as TokenIdentity;

  return {
    ...payload,
    id: row.id,
    mint: row.mint,
    name: row.name,
    symbol: row.symbol,
    title: row.title,
    displayName: row.display_name,
    metadataUri: row.metadata_uri,
    imageUri: row.image_uri,
    description: row.description,
    website: row.website,
    twitter: row.twitter,
    telegram: row.telegram,
    discord: row.discord,
    creator: row.creator,
    confidence: row.confidence,
    completenessScore: row.completeness_score,
    realData: Boolean(row.real_data),
    dataSource: row.data_source,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    sources: JSON.parse(row.sources_json) as TokenIdentitySource[],
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

function mapTokenMetadataFetchRow(
  row: TokenMetadataFetchRow
): StoredTokenMetadataFetch {
  return {
    id: row.id,
    mint: row.mint,
    uri: row.uri,
    source: row.source,
    status: row.status,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    fetchedAt: row.fetched_at,
    createdAt: row.created_at
  };
}

function mapWatchPlanRow(row: WatchPlanRow): StoredWatchPlan {
  const watchTargets = z
    .array(watchTargetSchema)
    .parse(JSON.parse(row.watch_targets_json)) as WatchTarget[];
  const skippedTargets = z
    .array(watchTargetSchema)
    .parse(JSON.parse(row.skipped_targets_json)) as WatchTarget[];
  const plan: CandidateWatchPlan = {
    mint: row.mint,
    ...(row.symbol ? { symbol: row.symbol } : {}),
    ...(row.source
      ? {
          source: row.source as CandidateWatchPlan["source"]
        }
      : {}),
    shouldVerifyMint: Boolean(row.should_verify_mint),
    shouldWatchEvents: Boolean(row.should_watch_events),
    watchTargets,
    skippedTargets,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    createdAt: row.created_at
  };

  return {
    ...plan,
    id: row.id,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapWatchActionRow(row: WatchActionRow): StoredWatchAction {
  return {
    id: row.id,
    mint: row.mint,
    action: row.action,
    address: row.address,
    addressKind: row.address_kind,
    status: row.status,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapLightningTradePlanRow(
  row: LightningTradePlanRow
): StoredLightningTradePlan {
  return {
    id: row.id,
    planId: row.plan_id,
    mint: row.mint,
    action: row.action,
    amountSol: row.amount_sol,
    mode: row.mode,
    blocked: Boolean(row.blocked),
    blockers: JSON.parse(row.blockers_json) as string[],
    warnings: JSON.parse(row.warnings_json) as string[],
    request: JSON.parse(row.request_json),
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function assertCalibrationCaptureSessionState(
  session: CalibrationCaptureSession
): void {
  const activeStateIsValid =
    session.status === "active" &&
    session.stoppedAt === null &&
    session.stopReason === null;
  const closedStateIsValid =
    session.status !== "active" &&
    session.stoppedAt !== null &&
    session.stopReason !== null &&
    Date.parse(session.stoppedAt) >= Date.parse(session.startedAt);

  if (!activeStateIsValid && !closedStateIsValid) {
    throw new Error(
      `Calibration capture session ${session.sessionId} has an invalid lifecycle state.`
    );
  }
}

function calibrationCaptureSessionImmutableFieldsDiffer(
  existing: StoredCalibrationCaptureSession,
  candidate: CalibrationCaptureSession
): boolean {
  return (
    existing.schemaVersion !== candidate.schemaVersion ||
    existing.captureVersion !== candidate.captureVersion ||
    existing.runtimeSessionId !== candidate.runtimeSessionId ||
    existing.strategyVersion !== candidate.strategyVersion ||
    existing.partition !== candidate.partition ||
    JSON.stringify(existing.config) !== JSON.stringify(candidate.config) ||
    existing.startedAt !== candidate.startedAt ||
    existing.createdAt !== candidate.createdAt ||
    existing.paperOnly !== candidate.paperOnly ||
    existing.dataOnly !== candidate.dataOnly ||
    existing.tradingDisabled !== candidate.tradingDisabled
  );
}

function assertCapturedSignalObservationState(
  observation: CapturedSignalObservation
): void {
  const outcomeFields = [
    observation.outcomeAt,
    observation.outcomePriceSol,
    observation.forwardReturnPct,
    observation.maxFavorableExcursionPct,
    observation.maxAdverseExcursionPct,
    observation.targetReached
  ];
  const completeStateIsValid =
    observation.status === "complete" &&
    outcomeFields.every((value) => value !== null) &&
    observation.outcomeAt !== null &&
    Date.parse(observation.outcomeAt) > Date.parse(observation.signalAt);
  const incompleteStateIsValid =
    observation.status !== "complete" &&
    outcomeFields.every((value) => value === null);

  if (!completeStateIsValid && !incompleteStateIsValid) {
    throw new Error(
      `Captured observation ${observation.observationId} has an invalid outcome state.`
    );
  }
}

function capturedSignalObservationImmutableFieldsDiffer(
  existing: StoredCapturedSignalObservation,
  candidate: CapturedSignalObservation
): boolean {
  return (
    existing.schemaVersion !== candidate.schemaVersion ||
    existing.captureVersion !== candidate.captureVersion ||
    existing.captureSessionId !== candidate.captureSessionId ||
    existing.runtimeSessionId !== candidate.runtimeSessionId ||
    existing.mint !== candidate.mint ||
    existing.strategyVersion !== candidate.strategyVersion ||
    existing.partition !== candidate.partition ||
    existing.sourceSnapshotId !== candidate.sourceSnapshotId ||
    existing.signalAt !== candidate.signalAt ||
    existing.signalAgeSeconds !== candidate.signalAgeSeconds ||
    existing.score !== candidate.score ||
    existing.label !== candidate.label ||
    existing.tradeSampleCount !== candidate.tradeSampleCount ||
    existing.entryPriceSol !== candidate.entryPriceSol ||
    existing.horizonMs !== candidate.horizonMs ||
    existing.targetReturnPct !== candidate.targetReturnPct ||
    existing.estimatedCostPct !== candidate.estimatedCostPct ||
    existing.maxOutcomeLagMs !== candidate.maxOutcomeLagMs ||
    existing.paperOnly !== candidate.paperOnly ||
    existing.dataOnly !== candidate.dataOnly ||
    existing.tradingDisabled !== candidate.tradingDisabled ||
    existing.createdAt !== candidate.createdAt
  );
}

function parsePaperStrategyEvaluation(
  value: unknown
): PaperStrategyEvaluationReport {
  return paperStrategyEvaluationSchema.parse(
    value
  ) as unknown as PaperStrategyEvaluationReport;
}

function mapPaperStrategyEvaluationRow(
  row: PaperStrategyEvaluationRow
): StoredPaperStrategyEvaluation {
  return {
    ...parsePaperStrategyEvaluation(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function parsePaperLifecycleValidation(
  value: unknown
): PaperLifecycleValidationReport {
  return paperLifecycleValidationSchema.parse(
    value
  ) as unknown as PaperLifecycleValidationReport;
}

function mapPaperLifecycleValidationRow(
  row: PaperLifecycleValidationRow
): StoredPaperLifecycleValidation {
  return {
    ...parsePaperLifecycleValidation(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function parsePaperAutomationDeployment(
  value: unknown
): PaperAutomationDeployment {
  return paperAutomationDeploymentSchema.parse(
    value
  ) as unknown as PaperAutomationDeployment;
}

function mapPaperAutomationDeploymentRow(
  row: PaperAutomationDeploymentRow
): StoredPaperAutomationDeployment {
  return {
    ...parsePaperAutomationDeployment(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function parsePaperAutomationEvent(value: unknown): PaperAutomationEvent {
  return paperAutomationEventSchema.parse(value) as PaperAutomationEvent;
}

function mapPaperAutomationEventRow(
  row: PaperAutomationEventRow
): StoredPaperAutomationEvent {
  return {
    ...parsePaperAutomationEvent(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function parsePaperAutomationOperation(
  value: unknown
): PaperAutomationOperation {
  return paperAutomationOperationSchema.parse(
    value
  ) as PaperAutomationOperation;
}

function mapPaperAutomationOperationRow(
  row: PaperAutomationOperationRow
): StoredPaperAutomationOperation {
  return {
    ...parsePaperAutomationOperation(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function paperAutomationDeploymentImmutableFieldsDiffer(
  existing: StoredPaperAutomationDeployment,
  candidate: PaperAutomationDeployment
): boolean {
  const mutableKeys = new Set([
    "id",
    "status",
    "statusReasonCodes",
    "armedAt",
    "pausedAt",
    "revokedAt",
    "updatedAt"
  ]);
  const pinned = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).filter(([key]) => !mutableKeys.has(key))
    );
  return (
    stringifyJson(pinned(existing as unknown as Record<string, unknown>)) !==
    stringifyJson(pinned(candidate as unknown as Record<string, unknown>))
  );
}

function paperAutomationStorageTransitionAllowed(
  from: PaperAutomationDeploymentStatus,
  to: PaperAutomationDeploymentStatus
): boolean {
  if (from === to) return true;
  if (from === "revoked") return false;
  if (to === "revoked") return true;
  if (from === "approved") return to === "armed" || to === "paused";
  if (from === "armed") return to === "paused";
  return to === "armed";
}

function paperAutomationOperationImmutableFieldsDiffer(
  existing: StoredPaperAutomationOperation,
  candidate: PaperAutomationOperation
): boolean {
  return (
    existing.schemaVersion !== candidate.schemaVersion ||
    existing.operationId !== candidate.operationId ||
    existing.deploymentId !== candidate.deploymentId ||
    existing.kind !== candidate.kind ||
    existing.mint !== candidate.mint ||
    existing.signalScore !== candidate.signalScore ||
    existing.signalHardReject !== candidate.signalHardReject ||
    existing.signalAt !== candidate.signalAt ||
    existing.executeAfter !== candidate.executeAfter ||
    existing.expiresAt !== candidate.expiresAt ||
    existing.exitEvaluationId !== candidate.exitEvaluationId ||
    existing.createdAt !== candidate.createdAt ||
    existing.paperOnly !== candidate.paperOnly ||
    existing.liveExecutionDisabled !== candidate.liveExecutionDisabled
  );
}

function parsePaperOperationsSession(value: unknown): PaperOperationsSession {
  return paperOperationsSessionSchema.parse(value) as PaperOperationsSession;
}

function mapPaperOperationsSessionRow(
  row: PaperOperationsSessionRow
): StoredPaperOperationsSession {
  return {
    ...parsePaperOperationsSession(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function parsePaperOperationsSnapshot(value: unknown): PaperOperationsSnapshot {
  return paperOperationsSnapshotSchema.parse(value) as PaperOperationsSnapshot;
}

function mapPaperOperationsSnapshotRow(
  row: PaperOperationsSnapshotRow
): StoredPaperOperationsSnapshot {
  return {
    ...parsePaperOperationsSnapshot(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function parsePaperOperationsAlert(value: unknown): PaperOperationsAlert {
  return paperOperationsAlertSchema.parse(value) as PaperOperationsAlert;
}

function mapPaperOperationsAlertRow(
  row: PaperOperationsAlertRow
): StoredPaperOperationsAlert {
  return {
    ...parsePaperOperationsAlert(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function parsePaperForwardEvaluation(
  value: unknown
): PaperForwardEvaluationReport {
  return paperForwardEvaluationSchema.parse(
    value
  ) as unknown as PaperForwardEvaluationReport;
}

function mapPaperForwardEvaluationRow(
  row: PaperForwardEvaluationRow
): StoredPaperForwardEvaluation {
  return {
    ...parsePaperForwardEvaluation(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function assertPaperOperationsSessionState(
  session: PaperOperationsSession
): void {
  const active =
    session.status === "active" &&
    session.endedAt === null &&
    session.endReason === null;
  const closed =
    session.status !== "active" &&
    session.endedAt !== null &&
    session.endReason !== null &&
    Date.parse(session.endedAt) >= Date.parse(session.startedAt);
  if (!active && !closed) {
    throw new Error(
      `Paper operations session ${session.sessionId} has an invalid lifecycle state.`
    );
  }
}

function paperOperationsSessionImmutableFieldsDiffer(
  existing: StoredPaperOperationsSession,
  candidate: PaperOperationsSession
): boolean {
  return (
    existing.schemaVersion !== candidate.schemaVersion ||
    existing.operationsVersion !== candidate.operationsVersion ||
    existing.sessionId !== candidate.sessionId ||
    existing.deploymentId !== candidate.deploymentId ||
    existing.runtimeSessionId !== candidate.runtimeSessionId ||
    JSON.stringify(existing.config) !== JSON.stringify(candidate.config) ||
    existing.startedBy !== candidate.startedBy ||
    existing.startingMeteredCostSol !== candidate.startingMeteredCostSol ||
    existing.startingMeteredEventCount !==
      candidate.startingMeteredEventCount ||
    existing.startedAt !== candidate.startedAt ||
    existing.automaticMeteredStart !== candidate.automaticMeteredStart ||
    existing.automaticPaperArm !== candidate.automaticPaperArm ||
    existing.automaticLiveExecution !== candidate.automaticLiveExecution ||
    existing.paperOnly !== candidate.paperOnly ||
    existing.dataOnly !== candidate.dataOnly ||
    existing.tradingDisabled !== candidate.tradingDisabled ||
    existing.liveExecutionDisabled !== candidate.liveExecutionDisabled
  );
}

function parsePaperExitPolicyEvaluation(
  value: unknown
): PaperExitPolicyEvaluation {
  return paperExitPolicyEvaluationSchema.parse(
    value
  ) as unknown as PaperExitPolicyEvaluation;
}

function mapPaperExitPolicyEvaluationRow(
  row: PaperExitPolicyEvaluationRow
): StoredPaperExitPolicyEvaluation {
  return {
    ...parsePaperExitPolicyEvaluation(JSON.parse(row.payload_json)),
    id: row.id
  };
}

function mapCalibrationCaptureSessionRow(
  row: CalibrationCaptureSessionRow
): StoredCalibrationCaptureSession {
  const payload = calibrationCaptureSessionSchema.parse(
    JSON.parse(row.payload_json)
  );

  return {
    ...payload,
    id: row.id
  };
}

function mapCalibrationSignalObservationRow(
  row: CalibrationSignalObservationRow
): StoredCapturedSignalObservation {
  const payload = capturedSignalObservationSchema.parse(
    JSON.parse(row.payload_json)
  );

  return {
    ...payload,
    id: row.id
  };
}

function mapRuntimeSessionRow(row: RuntimeSessionRow): StoredRuntimeSession {
  return {
    id: row.id,
    sessionId: row.session_id,
    runtimeMode: row.runtime_mode,
    paidDataArmed: Boolean(row.paid_data_armed),
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    stopReason: row.stop_reason,
    configFingerprint: row.config_fingerprint,
    createdAt: row.created_at
  };
}

function mapOperatorActionRow(row: OperatorActionRow): StoredOperatorAction {
  return {
    id: row.id,
    actionId: row.action_id,
    action: row.action,
    target: row.target,
    safeParameters: JSON.parse(row.safe_parameters_json) as Record<
      string,
      unknown
    >,
    outcome: row.outcome,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    createdAt: row.created_at
  };
}

function mapCapacitySnapshotRow(
  row: CapacitySnapshotRow
): StoredCapacitySnapshot {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    runtimeSessionId: row.runtime_session_id,
    observationWindowMs: row.observation_window_ms,
    launchCount: row.launch_count,
    launchRatePerMinute: row.launch_rate_per_minute,
    trackedMintCount: row.tracked_mint_count,
    protectedMintCount: row.protected_mint_count,
    requiredInitialSlots: row.required_initial_slots,
    availableNewestSlots: row.available_newest_slots,
    initialCoverageRatio: row.initial_coverage_ratio,
    observedEventsPerSecond: row.observed_events_per_second,
    projectedHourlyEvents: row.projected_hourly_events,
    projectedHourlyCostSol: row.projected_hourly_cost_sol,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapPumpPortalWalletStatusSnapshotRow(
  row: PumpPortalWalletStatusSnapshotRow
): StoredPumpPortalWalletStatusSnapshot {
  return {
    id: row.id,
    dataWalletPublicKey: row.data_wallet_public_key,
    tradingWalletPublicKey: row.trading_wallet_public_key,
    sameWallet: Boolean(row.same_wallet),
    dataWalletBalanceSol: row.data_wallet_balance_sol,
    tradingWalletBalanceSol: row.trading_wallet_balance_sol,
    dataWalletStatus: row.data_wallet_status,
    tradingWalletStatus: row.trading_wallet_status,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapWatchedWalletRow(row: WatchedWalletRow): StoredWatchedWallet {
  return {
    id: row.id,
    address: row.address,
    alias: row.alias,
    tags: JSON.parse(row.tags_json) as string[],
    enabled: Boolean(row.enabled),
    source: row.source,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapWatchedWalletTradeEventRow(
  row: WatchedWalletTradeEventRow
): StoredWatchedWalletTradeEvent {
  return {
    id: row.id,
    wallet: row.wallet,
    walletAlias: row.wallet_alias,
    mint: row.mint,
    side: row.side,
    priceSol: row.price_sol,
    volumeSol: row.volume_sol,
    tokenAmount: row.token_amount,
    signature: row.signature,
    confidence: row.confidence,
    usableForExitStrategy: Boolean(row.usable_for_exit_strategy),
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapExitRuleRow(row: ExitRuleRow): StoredExitRule {
  const payload = JSON.parse(row.payload_json);
  const payloadRule =
    payload && typeof payload === "object"
      ? (payload as Partial<ExitRuleInput>)
      : {};

  return {
    id: row.id,
    ruleId: row.rule_id,
    name: row.name,
    enabled: Boolean(row.enabled),
    trigger: row.trigger,
    minProfitPct: row.min_profit_pct,
    minProfitSol: row.min_profit_sol,
    sellPct: row.sell_pct,
    requirePositionOpenedBeforeWalletTrade: Boolean(
      row.require_position_opened_before_wallet_trade
    ),
    allowedWalletTags: payloadRule.allowedWalletTags ?? [],
    blockedWalletTags: payloadRule.blockedWalletTags ?? [],
    requireCurrentPrice: payloadRule.requireCurrentPrice ?? true,
    maxPositionAgeMs: row.max_position_age_ms,
    cooldownMs: row.cooldown_ms,
    priority: row.priority,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapExitSignalRow(row: ExitSignalRow): StoredExitSignal {
  return {
    id: row.id,
    signalId: row.signal_id,
    mint: row.mint,
    wallet: row.wallet,
    walletAlias: row.wallet_alias,
    ruleId: row.rule_id,
    action: row.action,
    sellPct: row.sell_pct,
    blocked: Boolean(row.blocked),
    blockers: JSON.parse(row.blockers_json) as string[],
    warnings: JSON.parse(row.warnings_json) as string[],
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapRiskSnapshotRow(row: RiskSnapshotRow): StoredRiskSnapshot {
  return {
    id: row.id,
    mint: row.mint,
    riskLevel: row.risk_level,
    hardReject: Boolean(row.hard_reject),
    riskScore: row.risk_score,
    reasonCodes: JSON.parse(row.reason_codes_json) as string[],
    payload: RiskSnapshotSchema.parse(JSON.parse(row.payload_json)),
    createdAt: row.created_at
  };
}

function mapCandidateDecisionRow(
  row: CandidateDecisionRow
): StoredCandidateDecision {
  return {
    id: row.id,
    mint: row.mint,
    symbol: row.symbol,
    lifecycleState: row.lifecycle_state,
    action: row.action,
    score: row.score,
    riskLevel: row.risk_level,
    hardReject: Boolean(row.hard_reject),
    combinedReasonCodes: JSON.parse(row.combined_reason_codes_json) as string[],
    payload: CandidateDecisionSchema.parse(JSON.parse(row.payload_json)),
    createdAt: row.created_at
  };
}

function mapDiscoveryCoverageSession(
  payloadJson: string
): DiscoveryCoverageSession {
  return DiscoveryCoverageSessionSchema.parse(JSON.parse(payloadJson));
}

function mapDiscoveryCoverageEvent(
  payloadJson: string
): DiscoveryCoverageEvent {
  return DiscoveryCoverageEventSchema.parse(JSON.parse(payloadJson));
}

function toRowId(rowId: number | bigint): number {
  return typeof rowId === "bigint" ? Number(rowId) : rowId;
}

function boolToNullableInt(value: boolean | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return value ? 1 : 0;
}

function nullableIntToBool(value: number | null): boolean | null {
  if (value === null) {
    return null;
  }

  return value === 1;
}
