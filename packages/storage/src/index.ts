import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { cwd } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { FeedEvent, TokenTradeEvent } from "@axi/data-feeds";
import type {
  ChainTransactionEvent,
  NormalizedChainTradeEvent
} from "@axi/chain-events";
import type { MarketObservation } from "@axi/market-data";
import type {
  CandidateWatchPlan,
  WatchTarget,
  WatchTargetKind
} from "@axi/watch-orchestrator";
import type {
  TokenIdentity,
  TokenIdentityConfidence,
  TokenIdentityDataSource,
  TokenIdentitySource
} from "@axi/token-identity";
import {
  CandidateDecisionSchema,
  ChainVerificationStatusSchema,
  type ChainVerificationStatus,
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

export type StorageStats = {
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
  watchedWalletCount: number;
  watchedWalletTradeEventCount: number;
  exitRuleCount: number;
  exitSignalCount: number;
  lastSignalAt: string | null;
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
    | "watched_wallet_buy"
    | "watched_wallet_sell"
    | "watched_wallet_any_trade";
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
} | null = null;

export function initStorage(options: StorageOptions = {}): StorageHandle {
  if (activeStorage) {
    return {
      databasePath: activeStorage.databasePath
    };
  }

  const databasePath = resolveDatabasePath(options.databasePath);
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);
  activeStorage = {
    db,
    databasePath
  };

  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  runMigrations(db);

  return {
    databasePath
  };
}

export function closeStorage(): void {
  activeStorage?.db.close();
  activeStorage = null;
}

export function saveFeedEvent(event: FeedEvent): StoredFeedEvent {
  const parsed = feedEventSchema.parse(event) as FeedEvent;
  const mint = getFeedEventMint(parsed);
  const createdAt = getFeedEventTimestamp(parsed);
  const db = getDb();

  const result = db
    .prepare(
      `insert into feed_events (event_type, mint, payload_json, created_at)
       values (?, ?, ?, ?)`
    )
    .run(parsed.type, mint, stringifyJson(parsed), createdAt);

  return {
    id: toRowId(result.lastInsertRowid),
    eventType: parsed.type,
    mint,
    payload: parsed,
    createdAt
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

export function getLaunchCandidate(
  mint: string
): StoredLaunchCandidate | null {
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
    tokenIdentityCount: countRows(db, "token_identities"),
    tokenIdentityResolvedCount: countResolvedTokenIdentities(db),
    tokenIdentityUnresolvedCount: countUnresolvedTokenIdentities(db),
    tokenMetadataFetchCount: countRows(db, "token_metadata_fetches"),
    watchPlanCount: countRows(db, "watch_plans"),
    watchActionCount: countRows(db, "watch_actions"),
    lightningTradePlanCount: countRows(db, "lightning_trade_plans"),
    pumpPortalWalletStatusSnapshotCount: countRows(
      db,
      "pumpportal_wallet_status_snapshots"
    ),
    riskSnapshotCount: countRows(db, "risk_snapshots"),
    candidateDecisionCount: countRows(db, "candidate_decisions"),
    paperOrderCount: countRows(db, "paper_orders"),
    paperPositionCount: countRows(db, "paper_positions"),
    watchedWalletCount: countRows(db, "watched_wallets"),
    watchedWalletTradeEventCount: countRows(
      db,
      "watched_wallet_trade_events"
    ),
    exitRuleCount: countRows(db, "exit_rules"),
    exitSignalCount: countRows(db, "exit_signals"),
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
