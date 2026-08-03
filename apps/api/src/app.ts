import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  MockFeedProvider,
  PumpPortalFeedProvider,
  isValidSolanaMint,
  type FeedEvent,
  type MockFeedProviderOptions,
  type PumpPortalFeedProviderOptions,
  type TokenFeedProvider
} from "@axi/data-feeds";
import {
  getDerivativeStrengthRuntimeContract,
  normalizeDerivativeStrength,
  type DerivativeStrengthMetricName
} from "@axi/derivative-strength";
import {
  defaultCalibrationEvidenceRequirements,
  evaluateSignalCalibration,
  getSignalCalibrationRuntimeContract,
  launchDerivativeReferencePolicy,
  scoreLaunchDerivativeSignal
} from "@axi/signal-calibration";
import {
  createCandidateLifecycleEngine,
  type CandidateLifecycleEngine,
  type CandidateState
} from "@axi/candidates";
import { PaperTradeExecutor, type PaperTradeResult } from "@axi/execution";
import {
  createRollingMetricsEngine,
  type RollingMetricsEngine
} from "@axi/metrics";
import {
  classifyPumpfunTransaction,
  compareExpectedNormalizedOutput,
  createPumpfunIdlDecoder,
  decodePumpfunTransaction,
  getFixtureEntry,
  listPumpfunFixtures,
  loadFixtureManifest,
  loadPumpfunFixture,
  pumpfunEventToIndexerEvent,
  summarizeTransactionFixture
} from "@axi/pumpfun-decoder";
import { createRiskEngine, type RiskEngine, type RiskInput } from "@axi/risk";
import { scoreCandidate } from "@axi/scoring";
import type { LightningTradePlan } from "@axi/pumpportal-lightning";
import {
  BotModeSchema,
  DiscoveryCoverageEventQuerySchema,
  TradeDataCoverageEventQuerySchema,
  TradeDataSubscriptionEventQuerySchema,
  type BotMode,
  type ChainVerificationSummary,
  type CandidateDecision,
  type LiveCardDataCompleteness,
  type LiveTokenCardViewModel,
  type MomentumFeedResponse,
  type MomentumFeedRow,
  type MomentumDiagnostics,
  type MomentumScannerRow,
  type LiveTradeTrackingState,
  type ObservationConfidence,
  type OverlaySignal,
  type QuoteAsset,
  type RiskFlags,
  type RiskSnapshot,
  type RollingMetrics,
  type RollingMetricsSnapshot,
  type ScoreBreakdown,
  type SignalState,
  type SignalStrength,
  type StrategySignalDriver,
  type StrategySignalExplanation,
  type StrategyStatus,
  type TokenIdentitySummary,
  type TokenIdentityDataSource,
  type TokenCandidate
} from "@axi/shared";
import {
  ScannerProjectionV2,
  selectScannerCardsV2,
  type ScannerFilterV2,
  type ScannerQueryV2,
  type ScannerSortV2
} from "./ui-v2-scanner";
import {
  closeStorage,
  findDiscoveryCoverageEventBySourceKey,
  getDiscoveryCoverageSession,
  getTradeDataCoverageSession,
  getLatestChainVerification,
  getStorageStats,
  initStorage,
  isTradeDataCoverageStorageReady,
  listChainVerifications,
  listCapacitySnapshots,
  listDiscoveryCoverageEvents,
  listDiscoveryCoverageSessions,
  listTradeDataCoverageEvents,
  listTradeDataCoverageSessions,
  listTradeDataSubscriptionEvents,
  saveLiveFeedEvent,
  saveLightningTradePlan,
  listPaperOrders,
  listPaperPositions,
  listRecentSignals,
  saveCandidateDecision,
  saveCapacitySnapshot,
  saveChainVerification,
  saveFeedEvent,
  saveDiscoveryCoverageConnectionEvent,
  saveDiscoveryCoverageEvent,
  saveDiscoveryCoverageSession,
  saveTradeDataCoverageEvent,
  saveTradeDataCoverageSession,
  saveTradeDataSubscriptionEvent,
  findTradeDataCoverageEventBySourceKey,
  savePaperOrder,
  savePumpPortalWalletStatusSnapshot,
  saveRiskSnapshot,
  saveSignal,
  runStorageTransaction,
  listActualDataSubscriptions,
  listLaunchCandidates,
  listLaunchScoreSnapshots,
  listLaunchTimeseriesBucketsByMint,
  listLaunchTrackingEvents,
  listLaunchTrackingSessions,
  listMeteredLaunchDataEvents,
  listMeteredLaunchDataEventsByMint,
  listMeteredLaunchDataSessions,
  listMeteredLaunchDataSubscriptions,
  listMeteredLaunchDataSubscriptionsByMint,
  listOperatorActions,
  listPumpPortalTokenTradeEvents,
  listPumpPortalTokenTradeEventsByMint,
  listTokenIdentities,
  listUnresolvedTokenIdentities,
  listRuntimeSessions,
  saveOperatorAction,
  saveRuntimeSession,
  upsertLaunchTimeseriesBucket,
  type StorageHandle,
  type StoredPaperPortfolioPosition,
  type StoredPaperPosition,
  upsertPaperPosition
} from "@axi/storage";
import type { WatchOrchestratorOptions } from "@axi/watch-orchestrator";
import {
  createDiscoveryCoverageService,
  type DiscoveryCoverageService
} from "./discovery-coverage-service";
import {
  createTradeDataCoverageService,
  type TradeDataCoverageService
} from "./trade-data-coverage-service";
import {
  createTradeDataCoverageLiveReadiness,
  disabledTradeDataCoverageForbiddenPaths,
  tradeDataCoverageLimits
} from "./trade-data-coverage-readiness";
import {
  ChainVerifierUnavailableError,
  createChainVerifierService,
  type ChainVerificationRecord,
  type ChainVerifierOptions,
  type ChainVerifierService
} from "./chain-verifier";
import {
  ChainEventsUnavailableError,
  createChainEventsService,
  type ChainEventsService,
  type ChainEventsServiceOptions
} from "./chain-events-service";
import type {
  WatchedAddressInput,
  WatchedAddressKind
} from "@axi/chain-events";
import {
  createWatchOrchestrationService,
  createWatchPlanSummary,
  type WatchOrchestrationService
} from "./watch-orchestration-service";
import {
  ActualDataServiceError,
  createActualDataConfig,
  createActualDataService,
  type ActualDataCandidateSummary,
  type ActualDataService,
  type ActualDataServiceConfig
} from "./actual-data-service";
import {
  createTokenIdentityConfig,
  createTokenIdentityService,
  toTokenIdentitySummary,
  type TokenIdentityService,
  type TokenIdentityServiceConfig
} from "./token-identity-service";
import {
  createWatchedWalletExitConfig,
  createWatchedWalletExitService,
  WatchedWalletExitServiceError,
  type WatchedWalletExitConfig,
  type WatchedWalletExitService
} from "./watched-wallet-exit-service";
import {
  createPaperPortfolioService,
  createPaperPortfolioServiceConfig,
  PaperPortfolioServiceError,
  type PaperPortfolioService,
  type PaperPortfolioServiceConfig
} from "./paper-portfolio-service";
import {
  createPaperAutomationService,
  PaperAutomationServiceError,
  type PaperAutomationService
} from "./paper-automation-service";
import type { PaperAutomationForwardConfigInput } from "@axi/paper-automation";
import {
  createPaperOperationsService,
  PaperOperationsServiceError,
  type PaperOperationsService
} from "./paper-operations-service";
import type { PaperOperationsConfigInput } from "@axi/paper-operations";
import {
  createPaperForwardEvaluationService,
  PaperForwardEvaluationServiceError,
  type PaperForwardEvaluationService
} from "./paper-forward-evaluation-service";
import type { PaperForwardEvaluationConfigInput } from "@axi/paper-forward-evaluation";
import { runPaperBacktest } from "./paper-backtest-lib";
import {
  createLiveTokenService,
  type LiveFeedMode,
  type LiveToken,
  type LiveTokenService
} from "./live-token-service";
import {
  createPumpPortalDataWalletConfig,
  createPumpPortalDataWalletService,
  type PumpPortalDataWalletConfig,
  type PumpPortalDataWalletService,
  type PumpPortalDataWalletServiceOptions
} from "./pumpportal-data-wallet-service";
import {
  createPumpPortalWalletsConfig,
  createPumpPortalWalletsService,
  type PumpPortalWalletsConfig,
  type PumpPortalWalletsService,
  type PumpPortalWalletsServiceOptions
} from "./pumpportal-wallets-service";
import {
  createLightningReadinessConfig,
  createLightningReadinessService,
  type LightningReadinessConfig,
  type LightningReadinessService
} from "./lightning-readiness-service";
import {
  createLaunchScannerConfig,
  createLaunchScannerService,
  type LaunchCandidateView,
  type LaunchScannerConfig,
  type LaunchScannerService
} from "./launch-scanner-service";
import {
  createMeteredLaunchDataConfig,
  createMeteredLaunchDataService,
  meteredSessionRolloverConfirmation,
  MeteredLaunchDataServiceError,
  type MeteredLaunchDataConfig,
  type MeteredLaunchDataService
} from "./metered-launch-data-service";
import {
  createRuntimeControlService,
  type RuntimeControlService
} from "./runtime-control-service";
import {
  applyControlCorsHeaders,
  createAllowedControlOrigins,
  evaluateLocalControlRequest,
  isMutationMethod,
  sendLocalControlRejection,
  type LocalControlDecision
} from "./local-control-guard";
import {
  createRuntimeContract,
  safeMeteredRuntimeDefaults
} from "./runtime-contract";
import { createTrackingCommandRouter } from "./tracking-command-router";
import {
  createRuntimeCapacityReport,
  type RuntimeCapacityReport
} from "./runtime-capacity";
import {
  CalibrationCaptureServiceError,
  createCalibrationCaptureService,
  type CalibrationCaptureService
} from "./calibration-capture-service";
import {
  createPaperStrategyEvaluationService,
  PaperStrategyEvaluationServiceError,
  type PaperStrategyEvaluationService
} from "./paper-strategy-evaluation-service";
import {
  createPaperLifecycleValidationService,
  PaperLifecycleValidationServiceError,
  type PaperLifecycleValidationInput,
  type PaperLifecycleValidationService
} from "./paper-lifecycle-validation-service";
import {
  createIndexerAdapter,
  type IndexerAdapter,
  type IndexerAdapterOptions
} from "./indexer-adapter";
import type { LiveTokenState } from "@axi/live-state";

const logLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent"
]);

const liveTradeTrackingAutoModeSchema = z.enum([
  "none",
  "newest",
  "watch",
  "qualified"
]);

type LiveTradeTrackingAutoMode = z.infer<
  typeof liveTradeTrackingAutoModeSchema
>;

export type LiveTradeTrackingConfig = {
  acknowledgedMetered: boolean;
  autoMaxAgeSeconds: number;
  autoMinAgeSeconds: number;
  autoMinIdentityConfidence: ObservationConfidence;
  autoMode: LiveTradeTrackingAutoMode;
  autoRequireRealData: boolean;
  enabled: boolean;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSubscribedTokens: number;
  unsubscribeAfterMs: number;
};

export type LiveCardEnrichmentConfig = {
  cacheTtlMs: number;
  dexScreenerEnabled: boolean;
  enabled: boolean;
  jupiterPriceEnabled: boolean;
  maxMintsPerMinute: number;
  onNewToken: boolean;
};

type LiveCardEnrichmentStatusValue =
  "disabled" | "not_checked" | "partial" | "available";

type LiveCardEnrichmentRecord = {
  dexId: string | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  mint: string;
  pairAddress: string | null;
  priceUsd: number | null;
  reasonCodes: string[];
  source: string | null;
  status: LiveCardEnrichmentStatusValue;
  updatedAt: string;
};

export const apiConfigSchema = z.object({
  NODE_ENV: z.string().default("development"),
  BOT_MODE: BotModeSchema.default("paper"),
  AXI_RUNTIME_MODE: z
    .enum(["pumpportal_first", "standard"])
    .default("pumpportal_first"),
  DATA_FEED_MODE: z.enum(["live", "none", "mock", "replay"]).default("live"),
  DATA_FEED: z.enum(["none", "mock", "pumpportal"]).default("pumpportal"),
  ALLOW_MOCK_DATA: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  MOCK_FEED_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  MOCK_FEED_REQUIRE_EXPLICIT_ENABLE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  REAL_DATA_REQUIRED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  FAIL_IF_NO_REAL_DATA: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PAPER_AUTO_ORDER: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  CHAIN_VERIFIER_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  SOLANA_RPC_HTTP: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  SOLANA_RPC_COMMITMENT: z
    .enum(["processed", "confirmed", "finalized"])
    .default("confirmed"),
  CHAIN_VERIFIER_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),
  CHAIN_VERIFIER_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(60000),
  CHAIN_VERIFIER_MAX_CONCURRENT: z.coerce.number().int().positive().default(2),
  CHAIN_VERIFIER_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  CHAIN_VERIFIER_ON_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  CHAIN_VERIFIER_ON_MOCK: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LIVE_CARD_CHAIN_VERIFY_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LIVE_CARD_CHAIN_VERIFY_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LIVE_CARD_CHAIN_VERIFY_MAX_MINTS_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  CHAIN_EVENTS_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  SOLANA_RPC_WS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  CHAIN_EVENTS_WATCHED_ADDRESSES: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional()
  ),
  CHAIN_EVENTS_MAX_WATCHED_ADDRESSES: z.coerce
    .number()
    .int()
    .positive()
    .default(25),
  CHAIN_EVENTS_BACKFILL_ON_START: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  CHAIN_EVENTS_BACKFILL_LIMIT_PER_ADDRESS: z.coerce
    .number()
    .int()
    .positive()
    .default(25),
  CHAIN_EVENTS_FETCH_TRANSACTION_ON_LOG: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  CHAIN_EVENTS_MAX_CONCURRENT_FETCHES: z.coerce
    .number()
    .int()
    .positive()
    .default(4),
  CHAIN_EVENTS_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),
  CHAIN_EVENTS_ON_NEW_CANDIDATE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  CHAIN_EVENTS_ON_CHAIN_VERIFIED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MARKET_DATA_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(true),
  MARKET_DATA_MIN_CONFIDENCE_FOR_METRICS: z
    .enum(["low", "medium", "high"])
    .default("medium"),
  MARKET_DATA_SOL_USD_PRICE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().positive().optional()
  ),
  MARKET_DATA_ALLOW_SOL_USD_CONVERSION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MARKET_DATA_ALLOW_USD_FROM_STABLE_QUOTES: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  WATCH_ORCHESTRATOR_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_VERIFY_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_VERIFY_ON_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_WATCH_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_WATCH_ON_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_MAX_TARGETS_PER_CANDIDATE: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  WATCH_ORCHESTRATOR_ALLOW_MINT_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  WATCH_ORCHESTRATOR_ALLOW_BONDING_CURVE_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  WATCH_ORCHESTRATOR_ALLOW_POOL_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  WATCH_ORCHESTRATOR_ALLOW_PROGRAM_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_ALLOW_WALLET_WATCH: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  WATCH_ORCHESTRATOR_MIN_CONFIDENCE_TO_WATCH: z
    .enum(["low", "medium", "high"])
    .default("medium"),
  API_HOST: z.string().default("127.0.0.1"),
  API_ALLOWED_ORIGINS: z.preprocess(
    parseStringListEnv,
    z
      .array(z.string().url())
      .default(["http://127.0.0.1:5173", "http://localhost:5173"])
  ),
  API_PORT: z.coerce.number().int().positive().default(8787),
  SIGNAL_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
  STORAGE_DATABASE_PATH: z.string().min(1).optional(),
  MOCK_FEED_SEED: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().optional()
  ),
  MOCK_FEED_SCENARIO: z
    .enum(["normal", "momentum", "rug", "flat"])
    .default("normal"),
  MOCK_FEED_MAX_EVENTS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().positive().optional()
  ),
  PUMPPORTAL_WS_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  PUMPPORTAL_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  PUMPPORTAL_DATA_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  PUMPPORTAL_DATA_WALLET_PUBLIC_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  PUMPPORTAL_TRADING_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  PUMPPORTAL_TRADING_WALLET_PUBLIC_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  PUMPPORTAL_USE_SAME_WALLET_FOR_DATA_AND_TRADING: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_LIGHTNING_READINESS_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_LIGHTNING_REQUIRE_MANUAL_ARM: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_LIGHTNING_MANUAL_ARMED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_LIGHTNING_BASE_URL: z
    .string()
    .url()
    .default("https://pumpportal.fun/api/trade"),
  PUMPPORTAL_LIGHTNING_MAX_BUY_SOL: z.coerce.number().positive().default(0.005),
  PUMPPORTAL_LIGHTNING_MAX_DAILY_SOL: z.coerce
    .number()
    .positive()
    .default(0.02),
  PUMPPORTAL_LIGHTNING_MAX_OPEN_POSITIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(1),
  PUMPPORTAL_LIGHTNING_MAX_SLIPPAGE_PCT: z.coerce
    .number()
    .positive()
    .default(10),
  PUMPPORTAL_LIGHTNING_PRIORITY_FEE_SOL: z.coerce
    .number()
    .nonnegative()
    .default(0.00005),
  PUMPPORTAL_LIGHTNING_POOL: z.string().min(1).default("auto"),
  PUMPPORTAL_LIGHTNING_SKIP_PREFLIGHT: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_LIGHTNING_JITO_ONLY: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_WALLET_MIN_BALANCE_SOL: z.coerce
    .number()
    .nonnegative()
    .default(0.02),
  PUMPPORTAL_WALLET_WARN_BALANCE_SOL: z.coerce
    .number()
    .nonnegative()
    .default(0.03),
  PUMPPORTAL_WALLET_TARGET_BALANCE_SOL: z.coerce
    .number()
    .nonnegative()
    .default(0.05),
  PUMPPORTAL_WALLET_BALANCE_REFRESH_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(15000),
  PUMPPORTAL_DATA_WALLET_MIN_BALANCE_SOL: z.coerce
    .number()
    .nonnegative()
    .default(0.02),
  PUMPPORTAL_DATA_WALLET_TARGET_BALANCE_SOL: z.coerce
    .number()
    .nonnegative()
    .default(0.05),
  PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000: z.coerce
    .number()
    .positive()
    .default(0.01),
  PUMPPORTAL_DATA_WALLET_BALANCE_REFRESH_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(15000),
  PUMPPORTAL_DATA_WALLET_WARN_BALANCE_SOL: z.coerce
    .number()
    .nonnegative()
    .default(0.03),
  PUMPPORTAL_DATA_WALLET_CRITICAL_BALANCE_SOL: z.coerce
    .number()
    .nonnegative()
    .default(0.02),
  PUMPPORTAL_SUBSCRIBE_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_SUBSCRIBE_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_LIVE_DISCOVERY_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_LAUNCH_TRACKING_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_LAUNCH_TRACKING_ACK_METERED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_LAUNCH_TRACKING_MODE: z
    .enum(["manual", "newest", "scored", "qualified"])
    .default("manual"),
  PUMPPORTAL_LAUNCH_TRACKING_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  PUMPPORTAL_LAUNCH_TRACKING_INITIAL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(30000),
  PUMPPORTAL_LAUNCH_TRACKING_EXTENDED_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(300000),
  PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_TOKEN: z.coerce
    .number()
    .int()
    .positive()
    .default(250),
  PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_SESSION: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  PUMPPORTAL_LAUNCH_TRACKING_MAX_SESSION_COST_SOL: z.coerce
    .number()
    .positive()
    .default(0.001),
  PUMPPORTAL_LAUNCH_TRACKING_MIN_SCORE_TO_EXTEND: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(45),
  PUMPPORTAL_LAUNCH_TRACKING_MIN_SCORE_TO_RIP: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(75),
  PUMPPORTAL_LAUNCH_TRACKING_REQUIRE_DATA_WALLET_READY: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_LAUNCH_TRACKING_AUTO_UNSUBSCRIBE_ON_HARD_REJECT: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PUMPPORTAL_LAUNCH_TRACKING_AUTO_UNSUBSCRIBE_ON_LOW_SCORE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  METERED_LAUNCH_DATA_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  METERED_LAUNCH_DATA_CONTROLS_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  METERED_LAUNCH_DATA_START_ACTIVE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  METERED_LAUNCH_DATA_REQUIRE_UI_ACK: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  METERED_LAUNCH_DATA_ACK_COST: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  METERED_LAUNCH_DATA_REQUIRE_DATA_WALLET_READY: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  METERED_LAUNCH_DATA_MODE: z
    .enum(["manual", "newest", "hot_candidates", "launch_score"])
    .default("newest"),
  ROLLING_TRACKER_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  ROLLING_TRACKER_RESERVED_NEWEST_SLOTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(safeMeteredRuntimeDefaults.reservedNewestSlots),
  ROLLING_TRACKER_MAX_PROTECTED_MINTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(safeMeteredRuntimeDefaults.maxProtectedMints),
  ROLLING_TRACKER_QUEUE_LIMIT: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(1000)
    .default(safeMeteredRuntimeDefaults.schedulerQueueLimit),
  ROLLING_TRACKER_QUEUE_MAX_AGE_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(safeMeteredRuntimeDefaults.schedulerQueueMaxAgeMs),
  METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS: z.coerce
    .number()
    .int()
    .positive()
    .default(safeMeteredRuntimeDefaults.maxConcurrentMints),
  METERED_LAUNCH_DATA_INITIAL_TRACK_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(30000),
  METERED_LAUNCH_DATA_EXTENDED_TRACK_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(300000),
  METERED_LAUNCH_DATA_MIN_SCORE_TO_EXTEND: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(45),
  METERED_LAUNCH_DATA_MIN_SCORE_TO_TRACK: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(0),
  ROLLING_TRACKER_MIN_SCORE_PROTECT: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(65),
  ROLLING_TRACKER_MIN_SCORE_RIP: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(80),
  ROLLING_TRACKER_PROTECTED_MAX_AGE_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(900000),
  ROLLING_TRACKER_STALE_NO_TRADES_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(30000),
  METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT: z.coerce
    .number()
    .int()
    .positive()
    .default(safeMeteredRuntimeDefaults.maxEventsPerMint),
  METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION: z.coerce
    .number()
    .int()
    .positive()
    .default(safeMeteredRuntimeDefaults.maxEventsPerSession),
  METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL: z.coerce
    .number()
    .positive()
    .default(safeMeteredRuntimeDefaults.maxSessionCostSol),
  METERED_LAUNCH_DATA_MAX_UI_SESSION_COST_SOL: z.coerce
    .number()
    .positive()
    .default(safeMeteredRuntimeDefaults.maxUiSessionCostSol),
  METERED_LAUNCH_DATA_AUTO_UNSUBSCRIBE_ON_HARD_REJECT: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  METERED_LAUNCH_DATA_AUTO_UNSUBSCRIBE_ON_LOW_SCORE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  METERED_LAUNCH_DATA_PROJECT_RATE_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  TRADE_DATA_COVERAGE_MAX_MINTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(1)
    .default(1),
  TRADE_DATA_COVERAGE_MAX_EVENTS: z.coerce
    .number()
    .int()
    .positive()
    .max(50)
    .default(50),
  TRADE_DATA_COVERAGE_MAX_RUNTIME_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(90_000)
    .default(90_000),
  TRADE_DATA_COVERAGE_MAX_COST_SOL: z.coerce
    .number()
    .positive()
    .max(0.0001)
    .default(0.0001),
  TRADE_DATA_COVERAGE_POST_STOP_GRACE_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(10_000)
    .default(5_000),
  TRADE_DATA_COVERAGE_CHAIN_VERIFY: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  TRADE_DATA_COVERAGE_CHAIN_VERIFY_MAX_SIGNATURES: z.coerce
    .number()
    .int()
    .min(0)
    .max(5)
    .default(5),
  TRADE_DATA_COVERAGE_LIVE_ACK: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MOMENTUM_ADAPTIVE_TRACKING_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  MOMENTUM_ADAPTIVE_EXTEND_ON_HOT: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  MOMENTUM_ADAPTIVE_EXTEND_ON_RIPPING: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  MOMENTUM_ADAPTIVE_EXTEND_ON_PAPER_POSITION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  MOMENTUM_ADAPTIVE_MAX_TRACK_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(900000),
  MOMENTUM_KEEP_MIGRATED_TOKENS_VISIBLE_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(1800000),
  PUMPPORTAL_TOKEN_TRADES_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_ACK_METERED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_MANUAL_MINTS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional()
  ),
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_MIGRATION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_QUALIFIED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPPORTAL_TOKEN_TRADES_MAX_SUBSCRIBED_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_SESSION: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_MINT: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  PUMPPORTAL_TOKEN_TRADES_UNSUBSCRIBE_AFTER_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(300000),
  PUMPPORTAL_TOKEN_TRADES_MIN_SCORE_TO_AUTO_SUBSCRIBE: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(60),
  PUMPPORTAL_TOKEN_TRADES_REQUIRE_API_KEY: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  LIVE_TRADE_TRACKING_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LIVE_TRADE_TRACKING_ACK_METERED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LIVE_TRADE_TRACKING_MAX_MINTS: z.coerce.number().int().positive().default(3),
  LIVE_TRADE_TRACKING_MAX_EVENTS_PER_SESSION: z.coerce
    .number()
    .int()
    .positive()
    .default(500),
  LIVE_TRADE_TRACKING_MAX_EVENTS_PER_MINT: z.coerce
    .number()
    .int()
    .positive()
    .default(200),
  LIVE_TRADE_TRACKING_AUTO_MODE:
    liveTradeTrackingAutoModeSchema.default("none"),
  LIVE_TRADE_TRACKING_AUTO_MIN_AGE_SECONDS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(0),
  LIVE_TRADE_TRACKING_AUTO_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(120),
  LIVE_TRADE_TRACKING_AUTO_MIN_IDENTITY_CONFIDENCE: z
    .enum(["low", "medium", "high"])
    .default("low"),
  LIVE_TRADE_TRACKING_AUTO_REQUIRE_REAL_DATA: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  LIVE_TRADE_TRACKING_UNSUBSCRIBE_AFTER_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(180000),
  EXIT_STRATEGY_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  EXIT_STRATEGY_MAX_WATCHED_WALLETS: z.coerce
    .number()
    .int()
    .positive()
    .default(25),
  EXIT_STRATEGY_MAX_EVENTS_PER_SESSION: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  EXIT_STRATEGY_MAX_SESSION_COST_SOL: z.coerce
    .number()
    .positive()
    .default(0.001),
  EXIT_STRATEGY_DEFAULT_MIN_PROFIT_PCT: z.coerce
    .number()
    .nonnegative()
    .default(25),
  EXIT_STRATEGY_DEFAULT_SELL_PCT: z.coerce
    .number()
    .positive()
    .max(100)
    .default(100),
  EXIT_STRATEGY_REQUIRE_DATA_WALLET_READY: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  EXIT_STRATEGY_COOLDOWN_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(60000),
  PAPER_PORTFOLIO_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_PORTFOLIO_STARTING_CASH_SOL: z.coerce.number().positive().default(1),
  PAPER_PORTFOLIO_MAX_POSITION_SIZE_SOL: z.coerce
    .number()
    .positive()
    .default(0.01),
  PAPER_PORTFOLIO_MAX_OPEN_POSITIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  PAPER_PORTFOLIO_MAX_DAILY_SPEND_SOL: z.coerce
    .number()
    .positive()
    .default(0.05),
  PAPER_PORTFOLIO_FEE_BPS: z.coerce.number().nonnegative().default(100),
  PAPER_PORTFOLIO_SLIPPAGE_BPS: z.coerce.number().nonnegative().default(300),
  PAPER_PORTFOLIO_REQUIRE_PRICE_FOR_ENTRY: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_PORTFOLIO_REQUIRE_PRICE_FOR_EXIT: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_PORTFOLIO_ALLOW_PARTIAL_EXITS: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_PORTFOLIO_FALLBACK_PRICE_SOL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().positive().optional()
  ),
  PAPER_PORTFOLIO_RESET_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PAPER_ENTRY_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PAPER_ENTRY_MIN_LAUNCH_SCORE: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(80),
  PAPER_ENTRY_POSITION_SIZE_SOL: z.coerce.number().positive().default(0.005),
  PAPER_ENTRY_REQUIRE_TRADE_TRACKED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_ENTRY_REQUIRE_PRICE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_ENTRY_MIN_VALID_SAMPLES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(10),
  PAPER_ENTRY_MIN_BUY_SELL_RATIO: z.coerce.number().nonnegative().default(1.5),
  PAPER_ENTRY_MIN_UNIQUE_BUYERS_10S: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(5),
  PAPER_ENTRY_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(120),
  PAPER_ENTRY_MAX_RISK_LEVEL: z
    .enum(["unknown", "low", "medium", "high", "critical"])
    .default("medium"),
  PAPER_ENTRY_COOLDOWN_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(300000),
  PAPER_EXIT_ENABLED: z.preprocess(parseBooleanEnv, z.boolean()).default(false),
  PAPER_EXIT_ALLOW_WATCHED_WALLET_SIGNALS: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_EXIT_DEFAULT_SELL_PCT: z.coerce
    .number()
    .positive()
    .max(100)
    .default(100),
  PAPER_EXIT_REQUIRE_PRICE: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_EXIT_MIN_PROFIT_PCT: z.coerce.number().default(25),
  PAPER_EXIT_TAKE_PROFIT_STAGE_1_SELL_PCT: z.coerce
    .number()
    .positive()
    .max(100)
    .default(50),
  PAPER_EXIT_TAKE_PROFIT_PCT: z.coerce.number().default(50),
  PAPER_EXIT_STOP_LOSS_PCT: z.coerce.number().default(-25),
  PAPER_EXIT_TRAILING_STOP_PCT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().positive().optional()
  ),
  PAPER_EXIT_TRAILING_ACTIVATION_PCT: z.coerce
    .number()
    .nonnegative()
    .default(20),
  PAPER_EXIT_MAX_HOLD_MS: z.coerce.number().int().positive().default(300000),
  PAPER_EXIT_ADVANCED_SIGNALS_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  PAPER_EXIT_MIGRATION_TRANSITION_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PAPER_EXIT_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(60000),
  LIVE_CARD_ENRICHMENT_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LIVE_CARD_ENRICHMENT_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LIVE_CARD_ENRICHMENT_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(30000),
  LIVE_CARD_ENRICHMENT_MAX_MINTS_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  DEXSCREENER_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  JUPITER_PRICE_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  TOKEN_IDENTITY_SOLANA_METADATA_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  TOKEN_IDENTITY_SOLANA_METADATA_ON_NEW_TOKEN: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  TOKEN_IDENTITY_SOLANA_METADATA_ON_DEMAND: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  TOKEN_IDENTITY_OFFCHAIN_FETCH_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  TOKEN_IDENTITY_OFFCHAIN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  TOKEN_IDENTITY_OFFCHAIN_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(3600000),
  TOKEN_IDENTITY_IPFS_GATEWAY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().default("https://ipfs.io/ipfs/")
  ),
  TOKEN_IDENTITY_MAX_METADATA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(262144),
  API_INDEXER_ADAPTER_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  API_INDEXER_LIVE_STATE_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  API_INDEXER_PREFER_LIVE_STATE_CARDS: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  API_INDEXER_RECENT_EVENT_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  TIMESERIES_RETENTION_MS: z.coerce
    .number()
    .int()
    .min(300_000)
    .max(86_400_000)
    .default(300_000),
  MANAGED_STREAM_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MANAGED_STREAM_PROVIDER: z
    .enum(["mock", "yellowstone", "laserstream", "geyser", "unknown"])
    .default("mock"),
  MANAGED_STREAM_COMMITMENT: z
    .enum(["processed", "confirmed", "finalized"])
    .default("confirmed"),
  MANAGED_STREAM_ENDPOINT: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional()
  ),
  MANAGED_STREAM_AUTH_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  MANAGED_STREAM_API_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  MANAGED_STREAM_ALLOW_REAL_CONNECTION: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MANAGED_STREAM_REAL_PROVIDER: z
    .enum(["mock", "yellowstone", "laserstream", "geyser", "unknown"])
    .default("mock"),
  MANAGED_STREAM_REAL_CONNECTION_ACK: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MANAGED_STREAM_MAX_RECONNECT_ATTEMPTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(10),
  MANAGED_STREAM_RECONNECT_BACKOFF_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(1000),
  MANAGED_STREAM_TRANSACTIONS_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  MANAGED_STREAM_TRANSACTION_ACCOUNT_INCLUDE: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  MANAGED_STREAM_TRANSACTION_ACCOUNT_EXCLUDE: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  MANAGED_STREAM_TRANSACTION_ACCOUNT_REQUIRED: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  MANAGED_STREAM_INCLUDE_VOTES: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  MANAGED_STREAM_INCLUDE_FAILED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  YELLOWSTONE_GRPC_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional()
  ),
  YELLOWSTONE_GRPC_TOKEN: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  YELLOWSTONE_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LASERSTREAM_GRPC_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional()
  ),
  LASERSTREAM_API_KEY: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  LASERSTREAM_REGION: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  LASERSTREAM_COMMITMENT: z
    .enum(["processed", "confirmed", "finalized"])
    .default("confirmed"),
  LASERSTREAM_TRANSACTIONS_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  LASERSTREAM_ACCOUNT_INCLUDE: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  LASERSTREAM_ACCOUNT_EXCLUDE: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  LASERSTREAM_ACCOUNT_REQUIRED: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  LASERSTREAM_PROGRAM_INCLUDE: z
    .preprocess(parseStringListEnv, z.array(z.string()))
    .default([]),
  LASERSTREAM_INCLUDE_VOTES: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LASERSTREAM_INCLUDE_FAILED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LASERSTREAM_MAX_MESSAGES_PER_SESSION: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),
  LASERSTREAM_MAX_RUNTIME_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(300000),
  LASERSTREAM_STOP_ON_ERROR: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LASERSTREAM_RECONNECT_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(true),
  LASERSTREAM_REPLAY_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  LASERSTREAM_REPLAY_FROM_SLOT: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().nonnegative().optional()
  ),
  LASERSTREAM_ENABLED: z
    .preprocess(parseBooleanEnv, z.boolean())
    .default(false),
  PUMPFUN_PROGRAM_ID: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  PUMPSWAP_PROGRAM_ID: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  LOG_LEVEL: logLevelSchema.default("info")
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;
export type ApiLogLevel = z.infer<typeof logLevelSchema>;

export function createLiveTradeTrackingConfig(
  input: Partial<LiveTradeTrackingConfig> = {}
): LiveTradeTrackingConfig {
  return {
    acknowledgedMetered: input.acknowledgedMetered ?? false,
    autoMaxAgeSeconds: input.autoMaxAgeSeconds ?? 120,
    autoMinAgeSeconds: input.autoMinAgeSeconds ?? 0,
    autoMinIdentityConfidence: input.autoMinIdentityConfidence ?? "low",
    autoMode: input.autoMode ?? "none",
    autoRequireRealData: input.autoRequireRealData ?? true,
    enabled: input.enabled ?? false,
    maxEventsPerMint: input.maxEventsPerMint ?? 200,
    maxEventsPerSession: input.maxEventsPerSession ?? 500,
    maxSubscribedTokens: input.maxSubscribedTokens ?? 3,
    unsubscribeAfterMs: input.unsubscribeAfterMs ?? 180_000
  };
}

export function createLiveCardEnrichmentConfig(
  input: Partial<LiveCardEnrichmentConfig> = {}
): LiveCardEnrichmentConfig {
  return {
    cacheTtlMs: input.cacheTtlMs ?? 30_000,
    dexScreenerEnabled: input.dexScreenerEnabled ?? false,
    enabled: input.enabled ?? false,
    jupiterPriceEnabled: input.jupiterPriceEnabled ?? false,
    maxMintsPerMinute: input.maxMintsPerMinute ?? 60,
    onNewToken: input.onNewToken ?? false
  };
}

export type ApiServerOptions = {
  allowedControlOrigins?: string[];
  chainEvents?: ChainEventsServiceOptions;
  closeStorageOnClose?: boolean;
  chainVerifier?: ChainVerifierOptions;
  allowMockData?: boolean;
  dataFeedMode?: LiveFeedMode;
  failIfNoRealData?: boolean;
  dataFeed?: "none" | "mock" | "pumpportal";
  feedProvider?: TokenFeedProvider;
  host?: string;
  logLevel?: ApiLogLevel | false;
  mockFeed?: MockFeedProviderOptions | undefined;
  mode?: BotMode;
  paperAutoOrder?: boolean;
  mockFeedEnabled?: boolean;
  mockFeedRequireExplicitEnable?: boolean;
  port?: number;
  pumpPortal?: PumpPortalFeedProviderOptions | undefined;
  actualData?: ActualDataServiceConfig;
  launchScanner?: Partial<LaunchScannerConfig>;
  meteredLaunchData?: Partial<MeteredLaunchDataConfig>;
  liveTradeTracking?: Partial<LiveTradeTrackingConfig>;
  liveCardEnrichment?: Partial<LiveCardEnrichmentConfig>;
  pumpPortalDataWallet?: Partial<PumpPortalDataWalletConfig> &
    Pick<PumpPortalDataWalletServiceOptions, "solanaClient">;
  pumpPortalWallets?: Partial<PumpPortalWalletsConfig> &
    Pick<PumpPortalWalletsServiceOptions, "solanaClient">;
  lightning?: Partial<LightningReadinessConfig>;
  watchedWalletExit?: Partial<WatchedWalletExitConfig>;
  paperPortfolio?: Partial<PaperPortfolioServiceConfig>;
  indexer?: IndexerAdapterOptions;
  realDataRequired?: boolean;
  signalIntervalMs?: number;
  startFeed?: boolean;
  storageDatabasePath?: string;
  tokenIdentity?: TokenIdentityServiceConfig;
  tradeDataCoverageReadiness?: {
    liveAuthorizationPresent: boolean;
    dataApiKeyConfigured: boolean;
    caps: {
      maxEvents: number;
      maxRuntimeMs: number;
      maxCostSol: number;
      postStopGraceMs: number;
    };
  };
  watchOrchestrator?: WatchOrchestratorOptions;
};

export type ApiServer = {
  app: FastifyInstance;
  close: () => Promise<void>;
  emitFeedEvent: (event: FeedEvent) => void;
  feed: TokenFeedProvider;
  candidates: CandidateLifecycleEngine;
  metrics: RollingMetricsEngine;
  risk: RiskEngine;
  getSignals: () => OverlaySignal[];
  startFeed: () => void;
  stopFeed: () => Promise<void>;
  storage: StorageHandle;
  chainEvents: ChainEventsService;
  chainVerifier: ChainVerifierService;
  watchOrchestration: WatchOrchestrationService;
  actualData: ActualDataService;
  discoveryCoverage: DiscoveryCoverageService;
  tradeDataCoverage: TradeDataCoverageService;
  launchScanner: LaunchScannerService;
  meteredLaunchData: MeteredLaunchDataService;
  runtimeControl: RuntimeControlService;
  calibrationCapture: CalibrationCaptureService;
  paperStrategyEvaluation: PaperStrategyEvaluationService;
  paperLifecycleValidation: PaperLifecycleValidationService;
  pumpPortalDataWallet: PumpPortalDataWalletService;
  pumpPortalWallets: PumpPortalWalletsService;
  lightningReadiness: LightningReadinessService;
  watchedWalletExit: WatchedWalletExitService;
  paperPortfolio: PaperPortfolioService;
  paperAutomation: PaperAutomationService;
  paperOperations: PaperOperationsService;
  paperForwardEvaluation: PaperForwardEvaluationService;
  scannerProjectionV2: ScannerProjectionV2;
  indexerAdapter: IndexerAdapter;
  liveTokens: LiveTokenService;
  tokenIdentity: TokenIdentityService;
};

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(50)
});
const timeseriesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(300),
  fillGaps: z.preprocess(parseBooleanEnv, z.boolean()).default(true)
});
const mintParamSchema = z.object({
  mint: z.string().min(32)
});
const scannerV2QuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(100),
  cursor: z.string().max(200).optional(),
  sort: z
    .enum([
      "newest",
      "score",
      "strength",
      "volume",
      "buyers",
      "priceChange",
      "risk",
      "pnl"
    ])
    .default("newest"),
  filters: z
    .preprocess(
      (value) =>
        typeof value === "string" && value.length > 0
          ? value.split(",").filter(Boolean)
          : [],
      z.array(
        z.enum([
          "discovery",
          "tracking",
          "d1_ready",
          "d2_ready",
          "hot",
          "ripping",
          "positions",
          "rejected",
          "stale"
        ])
      )
    )
    .default([]),
  activeOnly: z.preprocess(parseBooleanEnv, z.boolean()).default(true),
  includeProtected: z.preprocess(parseBooleanEnv, z.boolean()).default(true),
  query: z.string().trim().max(120).default("")
});
const pumpfunDecodeBodySchema = z.object({
  transaction: z.unknown()
});
const pumpfunFixtureDecodeBodySchema = z.object({
  fixture: z.string().min(1).max(200)
});
const streamMockPublishFixtureBodySchema = z.object({
  fixture: z.string().min(1).max(200)
});
const streamBuildSubscriptionBodySchema = z.object({
  provider: z.enum(["yellowstone", "laserstream", "mock"]).optional(),
  profile: z
    .enum([
      "pumpfun_program_transactions",
      "pumpfun_and_pumpswap_transactions",
      "laserstream_pumpfun_transactions",
      "yellowstone_pumpfun_transactions",
      "watched_addresses",
      "minimal_healthcheck"
    ])
    .optional(),
  commitment: z.enum(["processed", "confirmed", "finalized"]).optional(),
  includeProgram: z.array(z.string().min(1).max(200)).max(100).optional(),
  requiredAccount: z.array(z.string().min(1).max(200)).max(100).optional(),
  config: z
    .object({
      transactionAccountInclude: z
        .array(z.string().min(1).max(200))
        .max(100)
        .optional(),
      transactionAccountRequired: z
        .array(z.string().min(1).max(200))
        .max(100)
        .optional(),
      transactionAccountExclude: z
        .array(z.string().min(1).max(200))
        .max(100)
        .optional(),
      includeVotes: z.boolean().optional(),
      includeFailed: z.boolean().optional(),
      transactionsEnabled: z.boolean().optional()
    })
    .optional()
});
const chainVerifyBodySchema = z.object({
  mint: z.string().min(1)
});
const chainEventsWatchBodySchema = z.object({
  address: z.string().min(1),
  kind: z
    .enum([
      "mint",
      "pool",
      "bonding_curve",
      "program",
      "token_account",
      "wallet",
      "unknown"
    ])
    .default("unknown"),
  mint: z.string().min(1).optional(),
  label: z.string().min(1).optional()
});
const chainEventsAddressParamSchema = z.object({
  address: z.string().min(1)
});
const signatureParamSchema = z.object({
  signature: z.string().min(1)
});
const watchPlanBodySchema = z.object({
  mint: z.string().min(1),
  event: z.unknown().optional(),
  source: z.string().min(1).optional()
});
const launchEvaluateBodySchema = z.object({
  mint: z.string().min(1)
});
const meteredLaunchDataTrackBodySchema = z.object({
  mint: z.string().min(1),
  reason: z.string().min(1).default("manual")
});
const meteredLaunchDataEvaluateBodySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(1000).optional()
  })
  .default({});
const runtimeMeteredLaunchDataAckBodySchema = z.object({
  ackCost: z.literal(true),
  maxSessionCostSol: z.coerce.number().positive(),
  maxConcurrentMints: z.coerce.number().int().positive(),
  maxEventsPerSession: z.coerce.number().int().positive(),
  startAfterAck: z.preprocess(parseBooleanEnv, z.boolean()).optional()
});
const runtimeMeteredLaunchDataRolloverBodySchema =
  runtimeMeteredLaunchDataAckBodySchema.extend({
    confirmation: z.literal(meteredSessionRolloverConfirmation)
  });
const launchCostQuerySchema = z.object({
  avgEventsPerToken: z.coerce.number().positive().default(20),
  tokensPerHour: z.coerce.number().positive().default(500)
});
const lightningPlanBodySchema = z.object({
  mint: z.string().min(1),
  amountSol: z.coerce.number().positive(),
  reason: z.string().min(1).default("manual_test")
});
const tokenResolveBodySchema = z.object({
  mint: z.string().min(1)
});
const walletAddressParamSchema = z.object({
  address: z.string().min(32)
});
const exitWalletBodySchema = z.object({
  address: z.string().min(32),
  alias: z.string().min(1).nullable().optional(),
  tags: z.array(z.string().min(1)).default([]),
  enabled: z.boolean().optional()
});
const exitRuleBodySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  trigger: z
    .enum([
      "watched_wallet_buy",
      "watched_wallet_sell",
      "watched_wallet_any_trade"
    ])
    .optional(),
  minProfitPct: z.coerce.number().nonnegative().optional(),
  minProfitSol: z.coerce.number().nonnegative().nullable().optional(),
  sellPct: z.coerce.number().positive().max(100).optional(),
  requirePositionOpenedBeforeWalletTrade: z.boolean().optional(),
  allowedWalletTags: z.array(z.string().min(1)).optional(),
  blockedWalletTags: z.array(z.string().min(1)).optional(),
  requireCurrentPrice: z.boolean().optional(),
  maxPositionAgeMs: z.coerce.number().nonnegative().nullable().optional(),
  cooldownMs: z.coerce.number().nonnegative().optional(),
  priority: z.coerce.number().optional(),
  reasonCodes: z.array(z.string().min(1)).optional()
});
const exitRulePatchBodySchema = exitRuleBodySchema.omit({ id: true });
const exitRuleParamSchema = z.object({
  ruleId: z.string().min(1)
});
const exitTradeEventBodySchema = z.object({
  wallet: z.string().min(32),
  walletAlias: z.string().min(1).nullable().optional(),
  mint: z.string().min(32),
  side: z.enum(["buy", "sell", "unknown"]),
  priceSol: z.coerce.number().nonnegative().nullable().optional(),
  volumeSol: z.coerce.number().nonnegative().nullable().optional(),
  tokenAmount: z.coerce.number().nonnegative().nullable().optional(),
  signature: z.string().min(1).nullable().optional(),
  timestamp: z.string().datetime(),
  source: z
    .enum(["pumpportal_account_trade", "chain_events", "test"])
    .default("test"),
  confidence: z.enum(["low", "medium", "high"]).default("high"),
  usableForExitStrategy: z.boolean().default(true),
  reasonCodes: z.array(z.string().min(1)).default(["EXIT_SIMULATION_EVENT"]),
  raw: z.unknown().optional()
});
const exitPositionBodySchema = z
  .object({
    mint: z.string().min(32),
    symbol: z.string().min(1).nullable().optional(),
    title: z.string().min(1).nullable().optional(),
    entryPriceSol: z.coerce.number().nonnegative().nullable().optional(),
    currentPriceSol: z.coerce.number().nonnegative().nullable().optional(),
    sizeSol: z.coerce.number().nonnegative(),
    tokenAmount: z.coerce.number().nonnegative().nullable().optional(),
    openedAt: z.string().datetime(),
    unrealizedPnlPct: z.coerce.number().nullable().optional(),
    unrealizedPnlSol: z.coerce.number().nullable().optional(),
    status: z.enum(["open", "closed", "unknown"]).default("open")
  })
  .nullable();
const exitSimulateBodySchema = z.object({
  event: exitTradeEventBodySchema,
  position: exitPositionBodySchema,
  rule: exitRuleBodySchema.optional()
});
const exitCostQuerySchema = z.object({
  wallets: z.coerce.number().int().nonnegative().default(0),
  eventsPerWallet: z.coerce.number().int().nonnegative().default(100)
});
const paperPortfolioManualEntryBodySchema = z.object({
  mint: z.string().min(32),
  sizeSol: z.coerce.number().positive().optional(),
  reason: z.string().min(1).default("manual_paper_entry"),
  marketPriceSol: z.coerce.number().positive().optional()
});
const paperPortfolioManualExitBodySchema = z.object({
  mint: z.string().min(32),
  sellPct: z.coerce.number().positive().max(100).optional(),
  reason: z.string().min(1).default("manual_paper_exit"),
  marketPriceSol: z.coerce.number().positive().optional()
});
const paperPortfolioBacktestBodySchema = z.object({
  fixture: z
    .enum(["strong-ripper", "weak-launch", "sell-pressure", "no-trades"])
    .default("strong-ripper")
});
const signalCalibrationObservationSchema = z.object({
  observationId: z.string().min(1).max(200),
  partition: z.enum(["train", "validation"]),
  strategyVersion: z
    .string()
    .min(1)
    .default(launchDerivativeReferencePolicy.strategyVersion),
  signalAt: z.string().datetime(),
  outcomeAt: z.string().datetime(),
  score: z.number().finite(),
  targetReached: z.boolean(),
  forwardReturnPct: z.number().finite(),
  estimatedCostPct: z.number().finite().nonnegative().optional(),
  maxFavorableExcursionPct: z.number().finite().optional(),
  maxAdverseExcursionPct: z.number().finite().optional()
});
const calibrationEvidenceRequirementsSchema = z.object({
  minimumTrainingObservations: z
    .number()
    .int()
    .min(defaultCalibrationEvidenceRequirements.minimumTrainingObservations)
    .optional(),
  minimumValidationObservations: z
    .number()
    .int()
    .min(defaultCalibrationEvidenceRequirements.minimumValidationObservations)
    .optional(),
  minimumPositiveOutcomes: z
    .number()
    .int()
    .min(defaultCalibrationEvidenceRequirements.minimumPositiveOutcomes)
    .optional(),
  minimumSignalsPerThreshold: z
    .number()
    .int()
    .min(defaultCalibrationEvidenceRequirements.minimumSignalsPerThreshold)
    .optional(),
  minimumTrainingExpectancyPct: z.number().finite().nonnegative().optional()
});
const calibrationThresholdCandidatesSchema = z
  .array(z.number().finite().min(0).max(100))
  .min(1)
  .max(100);
const signalCalibrationEvaluationBodySchema = z.object({
  observations: z.array(signalCalibrationObservationSchema).max(10_000),
  thresholdCandidates: calibrationThresholdCandidatesSchema.optional(),
  evidenceRequirements: calibrationEvidenceRequirementsSchema.optional()
});
const calibrationCaptureStartBodySchema = z.object({
  partition: z.enum(["train", "validation"]),
  config: z
    .object({
      horizonMs: z.number().int().min(1_000).max(300_000).optional(),
      targetReturnPct: z.number().min(0).max(1_000).optional(),
      estimatedCostPct: z.number().min(0).max(100).optional(),
      samplingIntervalMs: z.number().int().min(1_000).max(300_000).optional(),
      maxOutcomeLagMs: z.number().int().min(0).max(10_000).optional(),
      minimumTradeSamples: z.number().int().min(3).max(10_000).optional(),
      maxObservationsPerSession: z.number().int().min(1).max(100_000).optional()
    })
    .optional()
});
const calibrationCaptureStopBodySchema = z
  .object({
    reason: z.string().min(1).max(200).default("operator_stop")
  })
  .default({});
const calibrationCaptureMaterializeBodySchema = z.object({}).default({});
const calibrationCaptureSessionParamSchema = z.object({
  sessionId: z.string().min(1).max(200)
});
const calibrationCaptureObservationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100_000).default(10_000),
  status: z.enum(["pending", "complete", "unavailable"]).optional()
});
const calibrationCaptureExportQuerySchema = z.object({
  format: z.enum(["json", "jsonl", "csv"]).default("json")
});
const paperStrategyEvaluationBodySchema = z.object({
  captureSessionIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
  config: z
    .object({
      startingCapitalSol: z.number().positive().max(1_000).optional(),
      positionSizeSol: z.number().positive().max(0.01).optional()
    })
    .optional(),
  thresholdCandidates: calibrationThresholdCandidatesSchema.optional(),
  evidenceRequirements: calibrationEvidenceRequirementsSchema.optional()
});
const paperStrategyEvaluationParamSchema = z.object({
  evaluationId: z.string().min(1).max(200)
});
const paperLifecycleValidationBodySchema = z.object({
  paperStrategyEvaluationId: z.string().trim().min(1).max(200),
  config: z
    .object({
      startingCapitalSol: z.number().positive().max(1_000).optional(),
      positionSizeSol: z.number().positive().max(0.01).optional(),
      maxOpenPositions: z.number().int().positive().max(100).optional(),
      maxDailySpendSol: z.number().positive().max(10).optional(),
      feeBps: z.number().nonnegative().max(10_000).optional(),
      baseSlippageBps: z.number().nonnegative().max(10_000).optional(),
      maximumMarketImpactBps: z.number().nonnegative().max(10_000).optional(),
      maximumVolumeParticipationRatio: z.number().positive().max(1).optional(),
      entryLatencyMs: z.number().int().nonnegative().max(300_000).optional(),
      exitLatencyMs: z.number().int().nonnegative().max(300_000).optional(),
      maximumFillDelayMs: z
        .number()
        .int()
        .nonnegative()
        .max(300_000)
        .optional(),
      entryMissedFillRate: z.number().min(0).max(1).optional(),
      exitMissedFillRate: z.number().min(0).max(1).optional(),
      minimumPathCoverageRatio: z.number().positive().max(1).optional()
    })
    .strict()
    .optional(),
  exitPolicyConfig: z
    .object({
      stopLossPct: z.number().min(-100).max(0).optional(),
      takeProfitStage1Pct: z.number().nonnegative().optional(),
      takeProfitStage1SellPct: z.number().positive().max(100).optional(),
      takeProfitStage2Pct: z.number().nonnegative().optional(),
      takeProfitStage2SellPct: z.number().positive().max(100).optional(),
      trailingStopPct: z.number().positive().nullable().optional(),
      trailingActivationPct: z.number().nonnegative().optional(),
      momentumDecayMinimumAgeMs: z.number().int().nonnegative().optional(),
      momentumDecayMaximumScore: z.number().min(0).max(100).optional(),
      volumeCollapseRatio: z.number().min(0).max(1).optional(),
      buyerReversalMaximumPressure: z.number().min(-1).max(1).optional(),
      liquidityMaximumSellSlippagePct: z.number().nonnegative().optional(),
      liquidityMinimumVelocitySolPerSec: z.number().optional(),
      derivativeReversalMaximumVelocityPctPerSec: z.number().optional(),
      derivativeReversalMaximumAccelerationPctPerSec2: z.number().optional(),
      maximumHoldMs: z.number().int().positive().max(300_000).optional(),
      watchedWalletMinimumProfitPct: z.number().optional(),
      enableLiquidityDeterioration: z.boolean().optional(),
      enableDerivativeReversal: z.boolean().optional(),
      enableMomentumDecay: z.boolean().optional(),
      enableBuyerReversal: z.boolean().optional(),
      enableVolumeCollapse: z.boolean().optional(),
      enableMaximumHold: z.boolean().optional(),
      enableMigrationTransition: z.boolean().optional(),
      migrationSellPct: z.number().positive().max(100).optional()
    })
    .strict()
    .optional()
});
const paperLifecycleValidationParamSchema = z.object({
  validationId: z.string().min(1).max(240)
});
const paperAutomationDeploymentParamSchema = z.object({
  deploymentId: z.string().min(1).max(300)
});
const paperAutomationApproveBodySchema = z.object({
  validationId: z.string().trim().min(1).max(240),
  approvedBy: z.string().trim().min(1).max(120),
  confirmation: z.string().min(1).max(500),
  forwardConfig: z
    .object({
      maximumSignalAgeMs: z.number().int().positive().optional(),
      minimumClosedTradesForDrift: z.number().int().positive().optional(),
      minimumExpectancyRetentionRatio: z.number().min(0).max(1).optional(),
      maximumForwardDrawdownPct: z.number().positive().optional(),
      maximumConsecutiveLosses: z.number().int().positive().optional(),
      maximumRejectedEntryRate: z.number().min(0).max(1).optional(),
      maximumConsecutiveStaleSignals: z.number().int().positive().optional()
    })
    .strict()
    .optional()
});
const paperAutomationControlBodySchema = z.object({
  deploymentId: z.string().trim().min(1).max(300),
  confirmation: z.string().min(1).max(500)
});
const paperAutomationPauseBodySchema = z.object({
  reason: z.string().trim().min(1).max(160).optional()
});
const paperOperationsSessionParamSchema = z.object({
  sessionId: z.string().min(1).max(360)
});
const paperOperationsStartBodySchema = z.object({
  deploymentId: z.string().trim().min(1).max(300),
  startedBy: z.string().trim().min(1).max(120),
  confirmation: z.string().min(1).max(600),
  config: z
    .object({
      maximumSessionCostSol: z.number().positive().max(0.001).optional(),
      budgetWarningRatio: z.number().min(0.01).max(0.8).optional(),
      maximumFeedSilenceMs: z.number().int().min(1_000).max(15_000).optional(),
      maximumTelemetryGapMs: z.number().int().min(1_000).max(30_000).optional(),
      maximumSignalLatencyMs: z.number().int().min(1).max(5_000).optional(),
      maximumSessionDurationMs: z
        .number()
        .int()
        .min(60_000)
        .max(86_400_000)
        .optional()
    })
    .strict()
    .optional()
});
const paperOperationsEndBodySchema = z.object({
  sessionId: z.string().trim().min(1).max(360),
  confirmation: z.string().min(1).max(600),
  reason: z.string().trim().min(1).max(240).optional()
});
const paperForwardEvaluationParamSchema = z.object({
  evaluationId: z.string().trim().min(1).max(360)
});
const paperForwardEvaluationBodySchema = z.object({
  deploymentId: z.string().trim().min(1).max(300),
  evaluatedBy: z.string().trim().min(1).max(120),
  confirmation: z.string().min(1).max(600),
  config: z
    .object({
      minimumCompletedSessions: z.number().int().positive().optional(),
      minimumDistinctUtcDays: z.number().int().positive().optional(),
      minimumTotalDurationMs: z.number().int().positive().optional(),
      minimumClosedTrades: z.number().int().positive().optional(),
      minimumSignalObservations: z.number().int().positive().optional(),
      maximumMissedFillRate: z.number().min(0).max(0.1).optional(),
      maximumDataCostToTradingPnlRatio: z.number().min(0).max(0.25).optional(),
      maximumP95SignalLatencyMs: z.number().int().min(1).max(5_000).optional()
    })
    .strict()
    .optional()
});
const paperExitPolicyEvaluationParamSchema = z.object({
  evaluationId: z.string().min(1).max(240)
});

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const config = apiConfigSchema.parse(env);
  assertApiConfigRelationships(config);
  return config;
}

function assertApiConfigRelationships(config: ApiConfig): void {
  if (
    config.ROLLING_TRACKER_RESERVED_NEWEST_SLOTS >
    config.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS
  ) {
    throw new Error(
      "reserved newest slots cannot exceed concurrent mint slots"
    );
  }
  if (
    config.ROLLING_TRACKER_MAX_PROTECTED_MINTS >
    config.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS -
      config.ROLLING_TRACKER_RESERVED_NEWEST_SLOTS
  ) {
    throw new Error("protected mints must fit outside reserved newest slots");
  }
  if (
    config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT >
    config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION
  ) {
    throw new Error("per-mint event cap cannot exceed the session event cap");
  }
  if (
    config.METERED_LAUNCH_DATA_MAX_UI_SESSION_COST_SOL >
    config.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL
  ) {
    throw new Error(
      "UI session cost cap cannot exceed the runtime session cap"
    );
  }
}

export function createApiServer(options: ApiServerOptions = {}): ApiServer {
  const mode = options.mode ?? "paper";

  if (mode === "live") {
    throw new Error(
      "Live mode is not implemented. Start this service with BOT_MODE=paper."
    );
  }

  const app = Fastify({
    logger:
      options.logLevel === false
        ? false
        : {
            level: options.logLevel ?? "info"
          }
  });
  const allowedControlOrigins = createAllowedControlOrigins(
    options.allowedControlOrigins
  );
  const apiHost = options.host ?? "127.0.0.1";

  const feed =
    options.feedProvider ??
    createFeedProvider({
      allowMockData: options.allowMockData ?? false,
      dataFeed: options.dataFeed ?? "pumpportal",
      dataFeedMode: options.dataFeedMode ?? "live",
      mockFeedEnabled: options.mockFeedEnabled ?? false,
      mockFeedRequireExplicitEnable:
        options.mockFeedRequireExplicitEnable ?? true,
      mockFeed: options.mockFeed,
      pumpPortal: options.pumpPortal,
      signalIntervalMs: options.signalIntervalMs ?? 2000
    });

  if ((options.failIfNoRealData ?? false) && feed.name !== "pumpportal") {
    throw new Error(
      "No real data feed is configured. Set DATA_FEED=pumpportal or disable FAIL_IF_NO_REAL_DATA."
    );
  }

  const executor = new PaperTradeExecutor(mode);
  const metricsEngine = createRollingMetricsEngine();
  const riskEngine = createRiskEngine();
  const candidateEngine = createCandidateLifecycleEngine();
  const chainVerifier = createChainVerifierService(options.chainVerifier);
  const chainEvents = createChainEventsService({
    ...options.chainEvents,
    onSafeFeedEvent: handleFeedEvent
  });
  const pumpPortalDataWalletOptions = options.pumpPortalDataWallet ?? {};
  const pumpPortalDataWallet = createPumpPortalDataWalletService({
    config: createPumpPortalDataWalletConfig(pumpPortalDataWalletOptions),
    ...(pumpPortalDataWalletOptions.solanaClient
      ? { solanaClient: pumpPortalDataWalletOptions.solanaClient }
      : {})
  });
  const pumpPortalWalletsOptions = options.pumpPortalWallets ?? {};
  const pumpPortalWallets = createPumpPortalWalletsService({
    config: createPumpPortalWalletsConfig(pumpPortalWalletsOptions),
    ...(pumpPortalWalletsOptions.solanaClient
      ? { solanaClient: pumpPortalWalletsOptions.solanaClient }
      : {})
  });
  const actualData = createActualDataService({
    config: options.actualData ?? createActualDataConfig(),
    dataWalletReadiness: () => pumpPortalDataWallet.getActualDataReadiness(),
    providerName: feed.name,
    ...(feed instanceof PumpPortalFeedProvider
      ? { pumpPortalProvider: feed }
      : {})
  });
  const liveTradeTracking = createLiveTradeTrackingConfig(
    options.liveTradeTracking
  );
  const liveCardEnrichment = createLiveCardEnrichmentConfig(
    options.liveCardEnrichment
  );
  const liveCardEnrichments = new Map<string, LiveCardEnrichmentRecord>();
  const liveCardEnrichmentAttempts: number[] = [];
  const paperAutoOrder = options.paperAutoOrder ?? false;
  const dataFeedMode = options.dataFeedMode ?? "live";
  const storage = options.storageDatabasePath
    ? initStorage({ databasePath: options.storageDatabasePath })
    : initStorage();
  const tokenIdentity = createTokenIdentityService({
    config: options.tokenIdentity ?? createTokenIdentityConfig(),
    logger: {
      warn: (message, context) => {
        app.log.warn(context ?? {}, message);
      }
    }
  });
  const watchOrchestration = createWatchOrchestrationService({
    ...(options.watchOrchestrator ?? {}),
    chainEvents,
    chainVerifier,
    logger: {
      warn: (message, context) => {
        app.log.warn(context ?? {}, message);
      }
    },
    scheduleVerification: (mint, event) => {
      void verifyAndApplyChainResult({
        event,
        mint
      });
    }
  });
  const liveTokens = createLiveTokenService({
    mode: dataFeedMode,
    provider: feed.name
  });
  const runtimeSessionId = randomUUID();
  const scannerProjectionV2 = new ScannerProjectionV2(runtimeSessionId);
  const runtimeSessionStartedAt = new Date().toISOString();
  const discoveryCoverage = createDiscoveryCoverageService({
    sessionId: runtimeSessionId,
    provider: feed.name,
    sourceMode: dataFeedMode,
    startedAt: runtimeSessionStartedAt,
    persistence: {
      saveSession: saveDiscoveryCoverageSession,
      saveEvent: saveDiscoveryCoverageEvent,
      saveConnectionEvent: saveDiscoveryCoverageConnectionEvent,
      findEventBySourceKey: findDiscoveryCoverageEventBySourceKey,
      getSession: getDiscoveryCoverageSession,
      listSessions: listDiscoveryCoverageSessions,
      listEvents: listDiscoveryCoverageEvents
    }
  });
  const tradeDataCoverage = createTradeDataCoverageService({
    provider: feed.name,
    sourceMode: dataFeedMode,
    estimatedCostPerEventSol:
      (options.meteredLaunchData?.eventCostSolPer10000 ?? 0.01) / 10_000,
    persistence: {
      saveSession: saveTradeDataCoverageSession,
      saveEvent: saveTradeDataCoverageEvent,
      saveSubscriptionEvent: saveTradeDataSubscriptionEvent,
      findEventBySourceKey: findTradeDataCoverageEventBySourceKey,
      getSession: getTradeDataCoverageSession,
      listSessions: listTradeDataCoverageSessions,
      listEvents: listTradeDataCoverageEvents,
      listSubscriptionEvents: listTradeDataSubscriptionEvents
    }
  });
  if (feed instanceof PumpPortalFeedProvider) {
    feed.setDiscoveryInstrumentation(
      discoveryCoverage.createFeedInstrumentation()
    );
    feed.setTradeInstrumentation(tradeDataCoverage.createFeedInstrumentation());
  }
  let canCaptureCoveredMint: (mint: string) => boolean = () => false;
  const calibrationCapture = createCalibrationCaptureService({
    runtimeSessionId,
    canCaptureMint: (mint) => canCaptureCoveredMint(mint)
  });
  const paperStrategyEvaluation = createPaperStrategyEvaluationService();
  const paperLifecycleValidation = createPaperLifecycleValidationService();
  const configuredIndexer = options.indexer ?? {};
  const onBucketUpdated = configuredIndexer.timeseries?.onBucketUpdated;
  const indexerAdapter = createIndexerAdapter({
    ...configuredIndexer,
    timeseries: {
      ...configuredIndexer.timeseries,
      onBucketUpdated: (bucket) => {
        upsertLaunchTimeseriesBucket(bucket);
        onBucketUpdated?.(bucket);
      }
    }
  });
  const signals = new Map<string, OverlaySignal>();
  const riskSnapshots = new Map<string, RiskSnapshot>();
  const launchScanner = createLaunchScannerService({
    actualData,
    config: options.launchScanner ?? createLaunchScannerConfig(),
    getRiskSnapshot: (mint) => riskSnapshots.get(mint),
    onSnapshotPersisted: (snapshot, snapshotId) => {
      try {
        calibrationCapture.captureSnapshot(snapshot, snapshotId);
      } catch (error) {
        app.log.error(
          { error, mint: snapshot.mint, snapshotId },
          "Failed to capture calibration signal snapshot"
        );
      }
    },
    providerName: feed.name
  });
  let hasOpenPaperPositionForMint: (mint: string) => boolean = (mint) => {
    void mint;
    return false;
  };
  const meteredLaunchData = createMeteredLaunchDataService({
    actualData,
    config: options.meteredLaunchData ?? createMeteredLaunchDataConfig(),
    dataWalletReadiness: () => pumpPortalDataWallet.getActualDataReadiness(),
    getLaunchCandidate: (mint) => launchScanner.getCandidate(mint),
    getLaunchCandidates: (limit) => launchScanner.getCandidates(limit),
    getLiveDiscoveryActive: () =>
      getFeedStatus().realData &&
      getFeedStatus().subscriptions.includes("subscribeNewToken"),
    getCalibrationOutcomeProtectionUntil: (mint) =>
      calibrationCapture.getOutcomeProtectionUntil(mint),
    hasOpenPaperPosition: (mint) => hasOpenPaperPositionForMint(mint),
    providerName: feed.name
  });
  canCaptureCoveredMint = (mint) =>
    meteredLaunchData.getTrackedMint(mint)?.status === "tracking";
  const trackingCommands = createTrackingCommandRouter(meteredLaunchData);
  const runtimeConfigFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        apiHost,
        dataFeedMode,
        meteredLaunchData: meteredLaunchData.getStatus(),
        mode,
        paperOnly: true,
        tradingDisabled: true
      })
    )
    .digest("hex");
  let paidDataArmed = false;

  function persistRuntimeSession(
    input: { stoppedAt?: string | null; stopReason?: string | null } = {}
  ): void {
    saveRuntimeSession({
      sessionId: runtimeSessionId,
      runtimeMode: dataFeedMode,
      paidDataArmed,
      startedAt: runtimeSessionStartedAt,
      stoppedAt: input.stoppedAt ?? null,
      stopReason: input.stopReason ?? null,
      configFingerprint: runtimeConfigFingerprint,
      createdAt: runtimeSessionStartedAt
    });
  }

  function disarmPaidData(reason: string): void {
    actualData.clearMeteredSessionAck();
    meteredLaunchData.clearSessionAck();
    paidDataArmed = false;
    persistRuntimeSession({ stopReason: reason });
  }

  function getRuntimeCapacityReport(now = new Date()): RuntimeCapacityReport {
    const meteredStatus = meteredLaunchData.getStatus();

    return createRuntimeCapacityReport({
      runtimeSessionId,
      runtimeStartedAt: runtimeSessionStartedAt,
      launchDiscoveryTimestamps: launchScanner
        .getCandidates(1_000)
        .filter(
          (candidate) =>
            candidate.eventType === "new_token" ||
            candidate.eventType === "migration"
        )
        .map((candidate) => candidate.discoveredAt),
      meteredStatus,
      meteredCost: meteredLaunchData.getSessionCost(),
      rateObservation: meteredLaunchData.getRateObservation(now.getTime()),
      now
    });
  }

  persistRuntimeSession();
  const lightningReadiness = createLightningReadinessService({
    config: createLightningReadinessConfig(options.lightning),
    wallets: pumpPortalWallets,
    getCandidate: (mint) => candidateEngine.getCandidate(mint),
    getRiskSnapshot: (mint) => riskSnapshots.get(mint)
  });
  const getCurrentPaperPriceSol = (mint: string): number | null =>
    positiveOrNull(metricsEngine.getMetrics(mint)?.latestPriceSol) ??
    positiveOrNull(actualData.getCandidateSummary(mint)?.latestPriceSol) ??
    positiveOrNull(launchScanner.getCandidate(mint)?.snapshot.priceSol);
  const paperPortfolio = createPaperPortfolioService({
    config: createPaperPortfolioServiceConfig(options.paperPortfolio),
    getCurrentPriceSol: getCurrentPaperPriceSol,
    getCurrentVolumeSol: (mint) =>
      positiveOrNull(
        indexerAdapter.getTimeseries(mint).windows["1s"].volumeSol
      ),
    getLaunchCandidate: (mint) => launchScanner.getCandidate(mint),
    getRiskSnapshot: (mint) => riskSnapshots.get(mint),
    getRecentSignals: () => Array.from(signals.values())
  });
  const paperAutomation = createPaperAutomationService({ paperPortfolio });
  const paperOperations = createPaperOperationsService({
    runtimeSessionId,
    paperAutomation,
    meteredLaunchData,
    getFeedStatus,
    getTimeseriesStatus: () => indexerAdapter.getTimeseriesStatus(),
    getTimeseriesGapCount: () =>
      meteredLaunchData
        .getTrackedMints()
        .reduce(
          (total, mint) =>
            total + indexerAdapter.getTimeseries(mint).gapBucketCount,
          0
        )
  });
  paperOperations.start();
  const paperForwardEvaluation = createPaperForwardEvaluationService();
  hasOpenPaperPositionForMint = (mint: string): boolean =>
    paperPortfolio.getPositionSummaryForMint(mint).hasPosition;
  const watchedWalletExit = createWatchedWalletExitService({
    config: createWatchedWalletExitConfig(options.watchedWalletExit),
    dataWalletReadiness: () => pumpPortalDataWallet.getActualDataReadiness(),
    getCurrentPriceSol: getCurrentPaperPriceSol,
    getOpenPaperPositions: () =>
      paperPortfolioPositionsForExit(paperPortfolio.getPositions()),
    providerName: feed.name,
    ...(feed instanceof PumpPortalFeedProvider
      ? { pumpPortalProvider: feed }
      : {})
  });
  const clients = new Set<WebSocket>();
  const scannerClientsV2 = new Set<WebSocket>();
  const scannerSignalsV2 = new Map<
    string,
    MomentumScannerRow["signalDisplay"]["label"]
  >();
  const wss = new WebSocketServer({ noServer: true });
  const maxSignalCacheSize = 100;
  let feedStarted = false;
  const runtimeControl = createRuntimeControlService({
    getDataWalletStatus: () => pumpPortalDataWallet.getStatus(),
    getFeedStatus,
    getMeteredLatestEventAt: () =>
      meteredLaunchData.getRecentTradeEvents()[0]?.createdAt ?? null,
    getMeteredLaunchDataStatus: () => meteredLaunchData.getStatus(),
    getTradingWalletsStatus: () => pumpPortalWallets.getStatus(),
    ackMeteredLaunchDataSession: (input) => {
      const status = meteredLaunchData.acknowledgeSession(input);
      actualData.acknowledgeMeteredSession(input.maxEventsPerSession);
      paidDataArmed = status.sessionAcknowledgedCost;
      persistRuntimeSession();
      return status;
    },
    clearMeteredLaunchDataSessionAck: () => {
      disarmPaidData("session_ack_cleared");
      return meteredLaunchData.getStatus();
    },
    refreshDataWallet: () =>
      pumpPortalDataWallet.refreshBalance({ force: true }),
    refreshTradingWallet: () =>
      pumpPortalWallets.refreshBalances({ force: true }),
    restartLiveDiscovery: async () => {
      await stopFeed(null);
      startFeed();
    },
    runtimeMode: dataFeedMode,
    startLiveDiscovery: () => startFeed(),
    startMeteredLaunchData: () => meteredLaunchData.start(),
    stopLiveDiscovery: () => stopFeed(),
    stopMeteredLaunchData: () => {
      meteredLaunchData.stop();
      disarmPaidData("operator_stop");
    },
    trackCurrentMeteredCandidates: (limit) =>
      meteredLaunchData.trackCurrentCandidates(limit)
  });

  const controlDecisions = new WeakMap<FastifyRequest, LocalControlDecision>();

  app.addHook("onRequest", (request, reply, done) => {
    applyControlCorsHeaders(request, reply, allowedControlOrigins);

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    const decision = evaluateLocalControlRequest(
      request,
      allowedControlOrigins
    );
    controlDecisions.set(request, decision);

    if (!decision.allowed) {
      sendLocalControlRejection(reply, decision);
      return;
    }

    done();
  });

  app.addHook("onResponse", async (request, reply) => {
    if (!isMutationMethod(request.method)) {
      return;
    }

    const decision = controlDecisions.get(request) ?? {
      allowed: false,
      mutation: true,
      reasonCodes: ["CONTROL_DECISION_MISSING"]
    };
    const target = request.routeOptions.url ?? request.url.split("?")[0] ?? "/";

    try {
      saveOperatorAction({
        actionId: `${runtimeSessionId}:${request.id}`,
        action: request.method,
        target,
        safeParameters: {
          method: request.method,
          route: target,
          statusCode: reply.statusCode
        },
        outcome: !decision.allowed
          ? "blocked"
          : reply.statusCode >= 400
            ? "failed"
            : "succeeded",
        reasonCodes: uniqueReasonCodes([
          ...decision.reasonCodes,
          `HTTP_${reply.statusCode}`
        ])
      });
    } catch (error) {
      app.log.error({ error, target }, "Failed to persist operator action");
    }
  });

  app.get("/health", async () => {
    const stats = getStorageStats();
    const chainEventsStatus = chainEvents.getStatus();
    const marketStatus = chainEvents.getMarketStatus();
    const watchStatus = watchOrchestration.getStatus();
    const feedStatus = getFeedStatus();
    const liveStatus = liveTokens.getStatus();
    const paperPortfolioStatus = paperPortfolio.getStatus();
    const paperAutomationStatus = paperAutomation.getStatus();
    const paperOperationsStatus = paperOperations.getStatus();
    const paperForwardEvaluationStatus = paperForwardEvaluation.getStatus();
    const dataWalletStatus = await pumpPortalDataWallet.refreshBalance();
    const pumpPortalWalletsStatus = await pumpPortalWallets.refreshBalances();
    const meteredLaunchDataStatus = meteredLaunchData.getStatus();
    const runtimeControlStatus = await runtimeControl.getStatus();

    return {
      chainEvents: chainEventsStatus,
      chainEventsConfigured: chainEventsStatus.configured,
      chainEventsEnabled: chainEventsStatus.enabled,
      chainTradeEventCount: stats.chainTradeEventCount,
      chainTransactionEventCount: stats.chainTransactionEventCount,
      chainVerifier: chainVerifier.getStatus(),
      chainVerificationCount: stats.chainVerificationCount,
      chainWatchedAddressCount: chainEventsStatus.watchedAddressCount,
      actualData: actualData.getStatus(),
      actualDataSessionCount: stats.actualDataSessionCount,
      actualDataSubscriptionCount: stats.actualDataSubscriptionCount,
      launchScanner: launchScanner.getStatus(),
      meteredLaunchData: meteredLaunchDataStatus,
      runtimeControl: {
        controlPlaneEnabled: runtimeControlStatus.controlPlaneEnabled,
        localOnly: runtimeControlStatus.localOnly,
        liveDiscovery: runtimeControlStatus.liveDiscovery,
        meteredLaunchData: runtimeControlStatus.meteredLaunchData,
        dataWallet: runtimeControlStatus.dataWallet,
        reasonCodes: runtimeControlStatus.reasonCodes,
        paperOnly: true,
        tradingDisabled: true
      },
      runtimeControlEnabled: runtimeControlStatus.controlPlaneEnabled,
      runtimeControlLocalOnly: runtimeControlStatus.localOnly,
      runtimeLiveDiscoveryState: runtimeControlStatus.liveDiscovery.connected
        ? "connected"
        : runtimeControlStatus.liveDiscovery.connecting
          ? "connecting"
          : runtimeControlStatus.liveDiscovery.lastError
            ? "errored"
            : "stopped",
      runtimeMeteredLaunchDataState: runtimeControlStatus.meteredLaunchData
        .active
        ? "active"
        : runtimeControlStatus.meteredLaunchData.blocked
          ? "blocked"
          : "stopped",
      meteredLaunchDataEnabled: meteredLaunchDataStatus.enabled,
      meteredLaunchDataReady: meteredLaunchDataStatus.ready,
      meteredLaunchDataTrackedCount: meteredLaunchDataStatus.trackedMintCount,
      meteredLaunchDataEstimatedCostSol:
        meteredLaunchDataStatus.estimatedCostSol,
      meteredLaunchDataBudgetReached: meteredLaunchDataStatus.budgetReached,
      meteredLaunchDataSessionCount: stats.meteredLaunchDataSessionCount,
      meteredLaunchDataSubscriptionCount:
        stats.meteredLaunchDataSubscriptionCount,
      meteredLaunchDataEventCount: stats.meteredLaunchDataEventCount,
      launchCandidateCount: stats.launchCandidateCount,
      launchScoreSnapshotCount: stats.launchScoreSnapshotCount,
      launchTradeSampleCount: stats.launchTradeSampleCount,
      launchTrackingEventCount: stats.launchTrackingEventCount,
      launchTrackingSessionCount: stats.launchTrackingSessionCount,
      dataWallet: dataWalletStatus,
      pumpPortalWallets: pumpPortalWalletsStatus,
      lightningReadiness: lightningReadiness.getStatus(),
      watchedWalletExit: watchedWalletExit.getStatus(),
      exitStrategyEnabled: watchedWalletExit.getStatus().enabled,
      accountTradeMonitoringEnabled:
        watchedWalletExit.getStatus().accountTradeMonitoringEnabled,
      paperPortfolio: paperPortfolioStatus,
      paperAutomation: paperAutomationStatus,
      paperOperations: paperOperationsStatus,
      paperForwardEvaluation: paperForwardEvaluationStatus,
      paperAutomationDeploymentCount: stats.paperAutomationDeploymentCount,
      paperAutomationEventCount: stats.paperAutomationEventCount,
      paperAutomationOperationCount: stats.paperAutomationOperationCount,
      paperOperationsSessionCount: stats.paperOperationsSessionCount,
      paperOperationsSnapshotCount: stats.paperOperationsSnapshotCount,
      paperOperationsAlertCount: stats.paperOperationsAlertCount,
      paperForwardEvaluationCount: stats.paperForwardEvaluationCount,
      paperPortfolioEnabled: paperPortfolioStatus.enabled,
      paperEntryEnabled: paperPortfolioStatus.entryPolicyEnabled,
      paperExitEnabled: paperPortfolioStatus.exitPolicyEnabled,
      openPaperPositionCount: paperPortfolioStatus.openPositionCount,
      totalPaperPnlSol: paperPortfolioStatus.totalPnlSol,
      paperPortfolioOrderCount: stats.paperPortfolioOrderCount,
      paperPortfolioFillCount: stats.paperPortfolioFillCount,
      paperPortfolioPositionCount: stats.paperPortfolioPositionCount,
      paperPortfolioSnapshotCount: stats.paperPortfolioSnapshotCount,
      watchedWalletCount: stats.watchedWalletCount,
      watchedWalletTradeEventCount: stats.watchedWalletTradeEventCount,
      exitRuleCount: stats.exitRuleCount,
      exitSignalCount: stats.exitSignalCount,
      liveTradeTracking: getLiveTradeTrackingStatus(),
      liveCardEnrichment: getLiveCardEnrichmentStatus(),
      indexer: indexerAdapter.getStatus(),
      indexerLiveStateTokenCount:
        indexerAdapter.getStatus().liveState.tokenCount,
      indexerRecentEventCount:
        indexerAdapter.getStatus().eventBus.publishedCount,
      dataFeedMode,
      dataFeed: options.dataFeed ?? "pumpportal",
      dataFeedReasonCodes:
        feed instanceof NoFeedProvider
          ? feed.reasonCodes
          : feedStatus.reasonCodes,
      feed: feedStatus,
      feedProvider: feed.name,
      mockFeedEnabled: feed.name === "mock",
      mockFeedBlocked: feed.name === "mock-blocked",
      mockRuntimeBlocked: feed.name === "mock-blocked",
      liveFeedExpected: dataFeedMode === "live",
      liveFeedConnected: feedStatus.connected,
      liveFeedReady: feedStatus.connected && liveStatus.liveTokenCount > 0,
      liveFeedLastEventAt: feedStatus.lastEventAt ?? liveStatus.lastEventAt,
      liveTokenCount: liveStatus.liveTokenCount,
      historicalMockRowsHidden: true,
      realDataConfigured: (options.dataFeed ?? "pumpportal") === "pumpportal",
      realDataActive: feed.name === "pumpportal",
      realDataRequired: options.realDataRequired ?? false,
      noFeedMode:
        dataFeedMode === "none" ||
        feed.name === "none" ||
        feed.name === "mock-blocked",
      noRealFeedMessage:
        dataFeedMode === "none" ||
        feed.name === "none" ||
        feed.name === "mock-blocked"
          ? "NO REAL FEED CONFIGURED"
          : undefined,
      marketData: marketStatus,
      marketDataEnabled: marketStatus.enabled,
      marketDataMinConfidence: marketStatus.minConfidenceForMetrics,
      marketObservationCount: stats.marketObservationCount,
      liveFeedEventCount: stats.liveFeedEventCount,
      pumpPortalTokenTradeEventCount: stats.pumpPortalTokenTradeEventCount,
      tokenIdentity: tokenIdentity.getStatus(),
      tokenIdentityCount: stats.tokenIdentityCount,
      tokenIdentityResolvedCount: stats.tokenIdentityResolvedCount,
      tokenIdentityUnresolvedCount: stats.tokenIdentityUnresolvedCount,
      tokenMetadataFetchCount: stats.tokenMetadataFetchCount,
      watchOrchestrator: watchStatus,
      watchOrchestratorEnabled: watchStatus.enabled,
      watchPlanCount: stats.watchPlanCount,
      watchActionCount: stats.watchActionCount,
      metricsEnabled: true,
      riskEnabled: true,
      candidateLifecycleEnabled: true,
      status: "ok",
      mode,
      candidateCount: candidateEngine.getAllCandidates().length,
      paperAutoOrder,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      solUsdConfigured: marketStatus.solUsdConfigured,
      trackedTokenCount: metricsEngine.getAllMetrics().length,
      uptimeSeconds: Math.round(process.uptime())
    };
  });

  app.get("/runtime/status", async () => runtimeControl.getStatus());

  app.get("/runtime/contracts", async () =>
    createRuntimeContract({
      actualData,
      allowedControlOrigins: Array.from(allowedControlOrigins),
      apiHost,
      meteredLaunchData,
      runtimeSessionId,
      timeseries: indexerAdapter.getTimeseriesStatus()
    })
  );

  app.get("/runtime/capacity", async () => getRuntimeCapacityReport());

  app.get("/runtime/scheduler", async () => ({
    scheduler: meteredLaunchData.getSchedulerStatus(),
    decisions: meteredLaunchData.getSchedulerDecisions(25),
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  }));

  app.get("/runtime/scheduler/decisions", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      decisions: meteredLaunchData.getSchedulerDecisions(query.limit),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/runtime/timeseries", async () => ({
    timeseries: indexerAdapter.getTimeseriesStatus(),
    persistedBucketCount: getStorageStats().launchTimeseriesBucketCount,
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  }));

  app.get("/runtime/derivatives", async () => {
    const status = indexerAdapter.getTimeseriesStatus();

    return {
      canonical: true,
      method: status.derivativeMethod,
      primaryWindowMs: 5_000,
      firstDerivativeMinSamples: 2,
      secondDerivativeMinSamples: 3,
      derivativeReadyMintCount: status.derivativeReadyMintCount,
      accelerationReadyMintCount: status.accelerationReadyMintCount,
      unavailableValue: null,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/runtime/derivative-strength", async () => ({
    ...getDerivativeStrengthRuntimeContract(),
    onlineCohortPolicy: "same_age_prior_snapshots_only",
    signalCalibrationRequired: true
  }));

  app.get("/runtime/signal-calibration", async () =>
    getSignalCalibrationRuntimeContract()
  );

  app.post("/runtime/signal-calibration/evaluate", async (request) => {
    const body = signalCalibrationEvaluationBodySchema.parse(request.body);

    return evaluateSignalCalibration({
      observations: body.observations,
      ...(body.thresholdCandidates
        ? { thresholdCandidates: body.thresholdCandidates }
        : {}),
      ...(body.evidenceRequirements
        ? { evidenceRequirements: body.evidenceRequirements }
        : {})
    });
  });

  app.get("/runtime/session-capture", async () =>
    calibrationCapture.getStatus()
  );

  app.post("/runtime/session-capture/start", async (request, reply) => {
    const body = calibrationCaptureStartBodySchema.parse(request.body);

    try {
      return calibrationCapture.start({
        partition: body.partition,
        ...(body.config ? { config: body.config } : {})
      });
    } catch (error) {
      return sendCalibrationCaptureError(reply, error);
    }
  });

  app.post("/runtime/session-capture/stop", async (request) => {
    const body = calibrationCaptureStopBodySchema.parse(request.body ?? {});
    return calibrationCapture.stop(body.reason);
  });

  app.get("/runtime/session-capture/sessions", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      currentRuntimeSessionId: runtimeSessionId,
      sessions: calibrationCapture.getSessions(query.limit),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get(
    "/runtime/session-capture/sessions/:sessionId",
    async (request, reply) => {
      const params = calibrationCaptureSessionParamSchema.parse(request.params);
      const session = calibrationCapture.getSession(params.sessionId);

      if (!session) {
        return reply.code(404).send({
          error: "CALIBRATION_CAPTURE_SESSION_NOT_FOUND",
          message: `Calibration capture session ${params.sessionId} was not found.`,
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true
        });
      }

      return session;
    }
  );

  app.get(
    "/runtime/session-capture/sessions/:sessionId/observations",
    async (request, reply) => {
      const params = calibrationCaptureSessionParamSchema.parse(request.params);
      const query = calibrationCaptureObservationsQuerySchema.parse(
        request.query
      );

      try {
        return {
          sessionId: params.sessionId,
          observations: calibrationCapture.getObservations(params.sessionId, {
            limit: query.limit,
            ...(query.status ? { status: query.status } : {})
          }),
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true
        };
      } catch (error) {
        return sendCalibrationCaptureError(reply, error);
      }
    }
  );

  app.post(
    "/runtime/session-capture/sessions/:sessionId/materialize",
    async (request, reply) => {
      calibrationCaptureMaterializeBodySchema.parse(request.body ?? {});
      const params = calibrationCaptureSessionParamSchema.parse(request.params);

      try {
        return calibrationCapture.materialize(params.sessionId);
      } catch (error) {
        return sendCalibrationCaptureError(reply, error);
      }
    }
  );

  app.get(
    "/runtime/session-capture/sessions/:sessionId/export",
    async (request, reply) => {
      const params = calibrationCaptureSessionParamSchema.parse(request.params);
      const query = calibrationCaptureExportQuerySchema.parse(request.query);

      try {
        const exported = calibrationCapture.export(
          params.sessionId,
          query.format
        );
        const extension = query.format === "jsonl" ? "jsonl" : query.format;
        const contentType =
          query.format === "csv"
            ? "text/csv; charset=utf-8"
            : query.format === "jsonl"
              ? "application/x-ndjson; charset=utf-8"
              : "application/json; charset=utf-8";

        return reply
          .type(contentType)
          .header(
            "content-disposition",
            `attachment; filename="${safeFileSegment(params.sessionId)}.${extension}"`
          )
          .send(exported.serialized);
      } catch (error) {
        return sendCalibrationCaptureError(reply, error);
      }
    }
  );

  app.get("/runtime/paper-strategy-evaluation", async () =>
    paperStrategyEvaluation.getStatus()
  );

  app.post(
    "/runtime/paper-strategy-evaluation/evaluate",
    async (request, reply) => {
      const body = paperStrategyEvaluationBodySchema.parse(request.body);

      try {
        return paperStrategyEvaluation.evaluate({
          captureSessionIds: body.captureSessionIds,
          ...(body.config ? { config: body.config } : {}),
          ...(body.thresholdCandidates
            ? { thresholdCandidates: body.thresholdCandidates }
            : {}),
          ...(body.evidenceRequirements
            ? { evidenceRequirements: body.evidenceRequirements }
            : {})
        });
      } catch (error) {
        return sendPaperStrategyEvaluationError(reply, error);
      }
    }
  );

  app.get("/runtime/paper-strategy-evaluation/evaluations", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      evaluations: paperStrategyEvaluation.getEvaluations(query.limit),
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    };
  });

  app.get(
    "/runtime/paper-strategy-evaluation/evaluations/:evaluationId",
    async (request, reply) => {
      const params = paperStrategyEvaluationParamSchema.parse(request.params);
      const evaluation = paperStrategyEvaluation.getEvaluation(
        params.evaluationId
      );

      if (!evaluation) {
        return reply.code(404).send({
          error: "PAPER_STRATEGY_EVALUATION_NOT_FOUND",
          message: `Paper strategy evaluation ${params.evaluationId} was not found.`,
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true,
          liveExecutionDisabled: true
        });
      }

      return evaluation;
    }
  );

  app.get(
    "/runtime/paper-strategy-evaluation/evaluations/:evaluationId/export",
    async (request, reply) => {
      const params = paperStrategyEvaluationParamSchema.parse(request.params);
      const evaluation = paperStrategyEvaluation.getEvaluation(
        params.evaluationId
      );

      if (!evaluation) {
        return reply.code(404).send({
          error: "PAPER_STRATEGY_EVALUATION_NOT_FOUND",
          message: `Paper strategy evaluation ${params.evaluationId} was not found.`,
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true,
          liveExecutionDisabled: true
        });
      }

      return reply
        .type("application/json; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="${safeFileSegment(params.evaluationId)}.json"`
        )
        .send(JSON.stringify(evaluation, null, 2));
    }
  );

  app.get("/runtime/paper-lifecycle-validation", async () =>
    paperLifecycleValidation.getStatus()
  );

  app.post(
    "/runtime/paper-lifecycle-validation/evaluate",
    async (request, reply) => {
      const body = paperLifecycleValidationBodySchema.parse(request.body);

      try {
        return paperLifecycleValidation.evaluate({
          paperStrategyEvaluationId: body.paperStrategyEvaluationId,
          ...(body.config
            ? {
                config: body.config as NonNullable<
                  PaperLifecycleValidationInput["config"]
                >
              }
            : {}),
          ...(body.exitPolicyConfig
            ? {
                exitPolicyConfig: body.exitPolicyConfig as NonNullable<
                  PaperLifecycleValidationInput["exitPolicyConfig"]
                >
              }
            : {})
        });
      } catch (error) {
        return sendPaperLifecycleValidationError(reply, error);
      }
    }
  );

  app.get(
    "/runtime/paper-lifecycle-validation/validations",
    async (request) => {
      const query = limitQuerySchema.parse(request.query);

      return {
        validations: paperLifecycleValidation.getValidations(query.limit),
        automaticThresholdActivation: false,
        automaticPaperTradingActivation: false,
        automaticLiveExecution: false,
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true,
        liveExecutionDisabled: true
      };
    }
  );

  app.get(
    "/runtime/paper-lifecycle-validation/validations/:validationId",
    async (request, reply) => {
      const params = paperLifecycleValidationParamSchema.parse(request.params);
      const validation = paperLifecycleValidation.getValidation(
        params.validationId
      );

      if (!validation) {
        return reply.code(404).send({
          error: "PAPER_LIFECYCLE_VALIDATION_NOT_FOUND",
          message: `Paper lifecycle validation ${params.validationId} was not found.`,
          automaticPaperTradingActivation: false,
          automaticLiveExecution: false,
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true,
          liveExecutionDisabled: true
        });
      }

      return validation;
    }
  );

  app.get(
    "/runtime/paper-lifecycle-validation/validations/:validationId/export",
    async (request, reply) => {
      const params = paperLifecycleValidationParamSchema.parse(request.params);
      const validation = paperLifecycleValidation.getValidation(
        params.validationId
      );

      if (!validation) {
        return reply.code(404).send({
          error: "PAPER_LIFECYCLE_VALIDATION_NOT_FOUND",
          message: `Paper lifecycle validation ${params.validationId} was not found.`,
          automaticPaperTradingActivation: false,
          automaticLiveExecution: false,
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true,
          liveExecutionDisabled: true
        });
      }

      return reply
        .type("application/json; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="${safeFileSegment(params.validationId)}.json"`
        )
        .send(JSON.stringify(validation, null, 2));
    }
  );

  app.get("/runtime/paper-automation", async () => paperAutomation.getStatus());

  app.get("/runtime/paper-automation/deployments", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      deployments: paperAutomation.getDeployments(query.limit),
      paperOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/runtime/paper-automation/events", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      events: paperAutomation.getEvents(query.limit),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/runtime/paper-automation/operations", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      operations: paperAutomation.getOperations(query.limit),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.post("/runtime/paper-automation/approve", async (request, reply) => {
    const body = paperAutomationApproveBodySchema.parse(request.body);
    try {
      return paperAutomation.approve({
        validationId: body.validationId,
        approvedBy: body.approvedBy,
        confirmation: body.confirmation,
        ...(body.forwardConfig
          ? {
              forwardConfig:
                body.forwardConfig as PaperAutomationForwardConfigInput
            }
          : {})
      });
    } catch (error) {
      return sendPaperAutomationError(reply, error);
    }
  });

  app.post("/runtime/paper-automation/arm", async (request, reply) => {
    const body = paperAutomationControlBodySchema.parse(request.body);
    try {
      return paperAutomation.arm(body);
    } catch (error) {
      return sendPaperAutomationError(reply, error);
    }
  });

  app.post("/runtime/paper-automation/pause", async (request, reply) => {
    const body = paperAutomationPauseBodySchema.parse(request.body ?? {});
    try {
      return paperAutomation.pause([
        "PAPER_AUTOMATION_OPERATOR_PAUSED",
        ...(body.reason
          ? [
              `PAPER_AUTOMATION_OPERATOR_REASON_${safeFileSegment(body.reason).toUpperCase()}`
            ]
          : [])
      ]);
    } catch (error) {
      return sendPaperAutomationError(reply, error);
    }
  });

  app.post("/runtime/paper-automation/revoke", async (request, reply) => {
    const body = paperAutomationControlBodySchema.parse(request.body);
    try {
      return paperAutomation.revoke(body);
    } catch (error) {
      return sendPaperAutomationError(reply, error);
    }
  });

  app.post("/runtime/paper-automation/reconcile", async () => ({
    operations: paperAutomation.reconcilePendingOperations(),
    status: paperAutomation.getStatus(),
    paperOnly: true,
    tradingDisabled: true,
    liveExecutionDisabled: true
  }));

  app.get(
    "/runtime/paper-automation/deployments/:deploymentId",
    async (request, reply) => {
      const params = paperAutomationDeploymentParamSchema.parse(request.params);
      const deployment = paperAutomation
        .getDeployments(1000)
        .find((item) => item.deploymentId === params.deploymentId);
      return (
        deployment ??
        reply.code(404).send({
          error: "PAPER_AUTOMATION_DEPLOYMENT_NOT_FOUND",
          paperOnly: true,
          liveExecutionDisabled: true
        })
      );
    }
  );

  app.get("/runtime/paper-operations", async () => paperOperations.getStatus());

  app.get("/runtime/paper-operations/sessions", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      sessions: paperOperations.getSessions(query.limit),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    };
  });

  app.get(
    "/runtime/paper-operations/sessions/:sessionId/snapshots",
    async (request) => {
      const params = paperOperationsSessionParamSchema.parse(request.params);
      const query = limitQuerySchema.parse(request.query);
      return {
        snapshots: paperOperations.getSnapshots(params.sessionId, query.limit),
        paperOnly: true,
        liveExecutionDisabled: true
      };
    }
  );

  app.get(
    "/runtime/paper-operations/sessions/:sessionId/alerts",
    async (request) => {
      const params = paperOperationsSessionParamSchema.parse(request.params);
      const query = limitQuerySchema.parse(request.query);
      return {
        alerts: paperOperations.getAlerts(params.sessionId, query.limit),
        paperOnly: true,
        liveExecutionDisabled: true
      };
    }
  );

  app.get(
    "/runtime/paper-operations/sessions/:sessionId/report",
    async (request, reply) => {
      const params = paperOperationsSessionParamSchema.parse(request.params);
      try {
        return paperOperations.buildEvidenceReport(params.sessionId);
      } catch (error) {
        return sendPaperOperationsError(reply, error);
      }
    }
  );

  app.post("/runtime/paper-operations/start", async (request, reply) => {
    const body = paperOperationsStartBodySchema.parse(request.body);
    try {
      return paperOperations.startSession({
        deploymentId: body.deploymentId,
        startedBy: body.startedBy,
        confirmation: body.confirmation,
        ...(body.config
          ? { config: body.config as PaperOperationsConfigInput }
          : {})
      });
    } catch (error) {
      return sendPaperOperationsError(reply, error);
    }
  });

  app.post("/runtime/paper-operations/end", async (request, reply) => {
    const body = paperOperationsEndBodySchema.parse(request.body);
    try {
      return paperOperations.endSession({
        sessionId: body.sessionId,
        confirmation: body.confirmation,
        ...(body.reason ? { reason: body.reason } : {})
      });
    } catch (error) {
      return sendPaperOperationsError(reply, error);
    }
  });

  app.post("/runtime/paper-operations/sample", async (_request, reply) => {
    try {
      return paperOperations.sampleNow();
    } catch (error) {
      return sendPaperOperationsError(reply, error);
    }
  });

  app.get("/runtime/paper-forward-evaluation", async () =>
    paperForwardEvaluation.getStatus()
  );

  app.get("/runtime/paper-forward-evaluations", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      evaluations: paperForwardEvaluation.getEvaluations(query.limit),
      paperOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    };
  });

  app.get(
    "/runtime/paper-forward-evaluations/:evaluationId",
    async (request, reply) => {
      const params = paperForwardEvaluationParamSchema.parse(request.params);
      try {
        return paperForwardEvaluation.getEvaluation(params.evaluationId);
      } catch (error) {
        return sendPaperForwardEvaluationError(reply, error);
      }
    }
  );

  app.post(
    "/runtime/paper-forward-evaluation/evaluate",
    async (request, reply) => {
      const body = paperForwardEvaluationBodySchema.parse(request.body);
      try {
        return paperForwardEvaluation.evaluate({
          deploymentId: body.deploymentId,
          evaluatedBy: body.evaluatedBy,
          confirmation: body.confirmation,
          ...(body.config
            ? { config: body.config as PaperForwardEvaluationConfigInput }
            : {})
        });
      } catch (error) {
        return sendPaperForwardEvaluationError(reply, error);
      }
    }
  );

  app.post("/runtime/capacity/snapshot", async () => {
    const report = getRuntimeCapacityReport();
    const snapshot = saveCapacitySnapshot({
      snapshotId: `${runtimeSessionId}:${randomUUID()}`,
      runtimeSessionId,
      observationWindowMs: report.observation.windowMs,
      launchCount: report.observation.launchCount,
      launchRatePerMinute: report.observation.launchRatePerMinute,
      trackedMintCount: report.slots.trackedMintCount,
      protectedMintCount: report.slots.protectedMintCount,
      requiredInitialSlots: report.slots.requiredInitialSlots,
      availableNewestSlots: report.slots.availableNewestSlots,
      initialCoverageRatio: report.slots.initialCoverageRatio,
      observedEventsPerSecond: report.observation.observedEventsPerSecond,
      projectedHourlyEvents: report.activity.projectedHourlyEventsAtCapacity,
      projectedHourlyCostSol: report.activity.projectedHourlyCostSolAtCapacity,
      reasonCodes: report.reasonCodes,
      payload: report,
      createdAt: report.generatedAt
    });

    return {
      report,
      snapshot,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/runtime/capacity/snapshots", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      snapshots: listCapacitySnapshots(query.limit),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/runtime/operator-actions", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      actions: listOperatorActions(query.limit),
      paperOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/runtime/sessions", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      currentSessionId: runtimeSessionId,
      sessions: listRuntimeSessions(query.limit),
      paperOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/runtime/discovery-coverage", async () =>
    discoveryCoverage.getSummary()
  );

  app.get("/runtime/discovery-coverage/events", async (request) => {
    const query = DiscoveryCoverageEventQuerySchema.parse(request.query);
    return {
      schemaVersion: "discovery-coverage-v1",
      events: discoveryCoverage.listEvents(query),
      limit: query.limit,
      offset: query.offset,
      paperOnly: true,
      paidStreamsActive: false,
      liveTradingEnabled: false
    };
  });

  app.get("/runtime/discovery-coverage/sessions", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      schemaVersion: "discovery-coverage-v1",
      sessions: discoveryCoverage.listSessions(query.limit),
      paperOnly: true,
      paidStreamsActive: false,
      liveTradingEnabled: false
    };
  });

  app.get(
    "/runtime/discovery-coverage/sessions/:sessionId",
    async (request, reply) => {
      const params = z
        .object({ sessionId: z.string().min(1) })
        .parse(request.params);
      const session = discoveryCoverage.getSession(params.sessionId);
      if (!session) {
        return reply.code(404).send({
          error: "DISCOVERY_COVERAGE_SESSION_NOT_FOUND",
          paperOnly: true,
          paidStreamsActive: false,
          liveTradingEnabled: false
        });
      }
      return session;
    }
  );

  app.get("/runtime/trade-data-coverage", async () =>
    tradeDataCoverage.getSummary()
  );

  app.get("/runtime/trade-data-coverage/readiness", async () => {
    const wallet = pumpPortalDataWallet.getStatus();
    const readinessConfig = options.tradeDataCoverageReadiness;
    return createTradeDataCoverageLiveReadiness({
      liveAuthorizationPresent:
        readinessConfig?.liveAuthorizationPresent ?? false,
      cliAckPresent: false,
      dataApiKeyConfigured:
        readinessConfig?.dataApiKeyConfigured ?? wallet.apiKeyConfigured,
      dataWalletPublicKeyConfigured: wallet.publicKeyConfigured,
      dataWalletPublicKeyValid: wallet.publicKeyValid,
      dataWalletBalanceStatus: wallet.balanceStatus,
      dataWalletBalanceSol: wallet.balanceSol,
      minimumBalanceSol: wallet.minBalanceSol,
      storageReady: isTradeDataCoverageStorageReady(),
      caps: {
        maxMints: tradeDataCoverageLimits.maxMints,
        maxEvents:
          readinessConfig?.caps.maxEvents ??
          tradeDataCoverageLimits.defaultMaxEvents,
        maxRuntimeMs:
          readinessConfig?.caps.maxRuntimeMs ??
          tradeDataCoverageLimits.defaultMaxRuntimeMs,
        maxCostSol:
          readinessConfig?.caps.maxCostSol ??
          tradeDataCoverageLimits.defaultMaxCostSol,
        postStopGraceMs:
          readinessConfig?.caps.postStopGraceMs ??
          tradeDataCoverageLimits.defaultPostStopGraceMs
      },
      forbiddenPaths: disabledTradeDataCoverageForbiddenPaths,
      estimatedCostPerEventSol:
        (options.meteredLaunchData?.eventCostSolPer10000 ?? 0.01) / 10_000
    });
  });

  app.get("/runtime/trade-data-coverage/events", async (request) => {
    const query = TradeDataCoverageEventQuerySchema.parse(request.query);
    return {
      schemaVersion: "trade-data-coverage-v1",
      events: tradeDataCoverage.listEvents(query),
      limit: query.limit,
      offset: query.offset,
      paperOnly: true,
      accountTradesActive: false,
      liveTradingEnabled: false
    };
  });

  app.get("/runtime/trade-data-coverage/sessions", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      schemaVersion: "trade-data-coverage-v1",
      sessions: tradeDataCoverage.listSessions(query.limit),
      paperOnly: true,
      accountTradesActive: false,
      liveTradingEnabled: false
    };
  });

  app.get(
    "/runtime/trade-data-coverage/sessions/:sessionId",
    async (request, reply) => {
      const params = z
        .object({ sessionId: z.string().min(1) })
        .parse(request.params);
      const session = tradeDataCoverage.getSession(params.sessionId);
      if (!session) {
        return reply.code(404).send({
          error: "TRADE_DATA_COVERAGE_SESSION_NOT_FOUND",
          paperOnly: true,
          accountTradesActive: false,
          liveTradingEnabled: false
        });
      }
      return session;
    }
  );

  app.get("/runtime/trade-data-coverage/subscriptions", async (request) => {
    const query = TradeDataSubscriptionEventQuerySchema.parse(request.query);
    return {
      schemaVersion: "trade-data-coverage-v1",
      subscriptions: tradeDataCoverage.listSubscriptionEvents(query),
      limit: query.limit,
      offset: query.offset,
      paperOnly: true,
      accountTradesActive: false,
      liveTradingEnabled: false
    };
  });

  app.get("/runtime/diagnostics", async () => runtimeControl.getDiagnostics());

  app.post("/runtime/live-discovery/start", async () => {
    return runtimeControl.startLiveDiscovery();
  });

  app.post("/runtime/live-discovery/stop", async () => {
    return runtimeControl.stopLiveDiscovery();
  });

  app.post("/runtime/live-discovery/restart", async () => {
    return runtimeControl.restartLiveDiscovery();
  });

  app.post("/runtime/metered-launch-data/start", async (_request, reply) => {
    const result = await runtimeControl.startMeteredLaunchData();

    if (!result.ok) {
      return reply.code(409).send(result);
    }

    return result;
  });

  app.post(
    "/runtime/metered-launch-data/ack-session",
    async (request, reply) => {
      try {
        const body = runtimeMeteredLaunchDataAckBodySchema.parse(request.body);
        return await runtimeControl.ackMeteredLaunchDataSession(body);
      } catch (error) {
        if (error instanceof MeteredLaunchDataServiceError) {
          return reply.code(error.statusCode).send({
            ok: false,
            error: error.code,
            message: error.message,
            status: await runtimeControl.getStatus(),
            paperOnly: true,
            tradingDisabled: true
          });
        }

        throw error;
      }
    }
  );

  app.post("/runtime/metered-launch-data/clear-session-ack", async () => {
    return runtimeControl.clearMeteredLaunchDataSessionAck();
  });

  app.post("/runtime/metered-launch-data/rollover", async (request, reply) => {
    const body = runtimeMeteredLaunchDataRolloverBodySchema.parse(request.body);

    try {
      meteredLaunchData.stop();
      disarmPaidData("metered_session_rollover");
      flushFeedEventQueue();
      actualData.resetMeteredSession();
      meteredLaunchData.resetSession();
      const status = meteredLaunchData.acknowledgeSession({
        ackCost: true,
        maxSessionCostSol: body.maxSessionCostSol,
        maxConcurrentMints: body.maxConcurrentMints,
        maxEventsPerSession: body.maxEventsPerSession,
        startAfterAck: false
      });
      actualData.acknowledgeMeteredSession(body.maxEventsPerSession);
      paidDataArmed = status.sessionAcknowledgedCost;
      persistRuntimeSession();

      const started = body.startAfterAck
        ? await runtimeControl.startMeteredLaunchData()
        : null;

      if (started && !started.ok) {
        return reply.code(409).send({
          ...started,
          action: "rollover",
          message:
            "Metered counters were reset, but the next bounded session was blocked by runtime gates.",
          liveExecutionDisabled: true
        });
      }

      return {
        ok: true,
        action: "rollover",
        message:
          "Metered data session rolled over with fresh bounded counters.",
        status: started?.status ?? (await runtimeControl.getStatus()),
        decisions: started?.decisions ?? [],
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true,
        liveExecutionDisabled: true
      };
    } catch (error) {
      if (
        error instanceof MeteredLaunchDataServiceError ||
        error instanceof ActualDataServiceError
      ) {
        return reply.code(error.statusCode).send({
          ok: false,
          error: error.code,
          message: error.message,
          status: await runtimeControl.getStatus(),
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true,
          liveExecutionDisabled: true
        });
      }

      throw error;
    }
  });

  app.post("/runtime/metered-launch-data/stop", async () => {
    const result = await runtimeControl.stopMeteredLaunchData();
    flushFeedEventQueue();
    return {
      ...result,
      status: await runtimeControl.getStatus()
    };
  });

  app.post("/runtime/metered-launch-data/restart", async (_request, reply) => {
    const result = await runtimeControl.restartMeteredLaunchData();

    if (!result.ok) {
      return reply.code(409).send(result);
    }

    return result;
  });

  app.post("/runtime/data-wallet/refresh", async () => {
    return runtimeControl.refreshDataWallet();
  });

  app.post("/runtime/trading-wallet/refresh", async () => {
    return runtimeControl.refreshTradingWallet();
  });

  app.get("/signals", async () => Array.from(signals.values()));

  app.get("/feed/status", async () => getFeedStatus());

  app.get("/feed/events/live", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return liveTokens.getLiveFeedEvents(query.limit);
  });

  app.get("/live/status", async () => ({
    ...liveTokens.getStatus(),
    feed: getFeedStatus()
  }));

  app.get("/indexer/status", async () => indexerAdapter.getStatus());

  app.get("/indexer/stream/status", async () =>
    indexerAdapter.getStreamStatus()
  );

  app.get("/indexer/stream/real-readiness", async () =>
    indexerAdapter.getStreamRealReadiness()
  );

  app.get("/indexer/stream/config", async () =>
    indexerAdapter.getStreamConfig()
  );

  app.post("/indexer/stream/build-subscription", async (request, reply) => {
    const body = streamBuildSubscriptionBodySchema.parse(request.body ?? {});

    try {
      return indexerAdapter.buildStreamSubscriptionPreview(body);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "MANAGED_STREAM_FILTER_LIMIT_EXCEEDED"
      ) {
        return reply.code(400).send({
          error: "managed_stream_filter_limit_exceeded",
          reasonCodes: ["MANAGED_STREAM_FILTER_LIMIT_EXCEEDED"]
        });
      }

      throw error;
    }
  });

  app.get("/indexer/stream/recent", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return indexerAdapter.getRecentStreamEnvelopes(query.limit);
  });

  app.post("/indexer/stream/mock/publish-fixture", async (request, reply) => {
    const body = streamMockPublishFixtureBodySchema.parse(request.body);

    try {
      const events = indexerAdapter.publishMockStreamFixture(body.fixture);

      return {
        fixture: body.fixture,
        normalizedEvents: events,
        normalizedEvent: events[0] ?? null,
        streamStatus: indexerAdapter.getStreamStatus(),
        liveState: indexerAdapter.getStatus().liveState,
        paperOnly: true,
        tradingDisabled: true,
        networkDisabled: true,
        reasonCodes: [
          "STREAM_MOCK_FIXTURE_PUBLISHED",
          "NO_NETWORK",
          "NO_TRADING"
        ]
      };
    } catch (error) {
      return reply.code(400).send({
        error: "invalid_stream_fixture",
        message:
          error instanceof Error ? error.message : "Invalid stream fixture"
      });
    }
  });

  app.get("/indexer/decoders", async () => ({
    decoders: [
      {
        name: "pumpfun",
        enabled: true,
        available: true,
        source: "local_debug",
        fixtureCount: getPumpfunFixtureNames().length
      }
    ],
    pumpfun: {
      enabled: true,
      available: true,
      source: "local_debug",
      fixtureCount: getPumpfunFixtureNames().length,
      fixtureManifestLoaded: isPumpfunFixtureManifestLoaded(),
      fixtures: getPumpfunFixtureNames(),
      idlStatus: createPumpfunIdlDecoder().status,
      supportedKinds: [
        "token_created",
        "buy_trade",
        "sell_trade",
        "migration",
        "failed_transaction",
        "unknown"
      ]
    },
    geyser: {
      enabled: false,
      implemented: false,
      status: "not_implemented"
    },
    paperOnly: true,
    tradingDisabled: true,
    networkDisabled: true,
    reasonCodes: [
      "PUMPFUN_DECODER_DEBUG_ONLY",
      "NO_NETWORK",
      "NO_PERSIST",
      "NO_TRADING"
    ]
  }));

  app.post("/indexer/decoders/pumpfun/decode", async (request) => {
    const body = pumpfunDecodeBodySchema.parse(request.body);
    return decodePumpfunPayloadForDebug(body.transaction);
  });

  app.post(
    "/indexer/decoders/pumpfun/decode-fixture",
    async (request, reply) => {
      const body = pumpfunFixtureDecodeBodySchema.parse(request.body);

      try {
        return {
          fixture: body.fixture,
          ...decodePumpfunFixtureForDebug(body.fixture)
        };
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_fixture",
          message: error instanceof Error ? error.message : "Invalid fixture"
        });
      }
    }
  );

  app.get("/indexer/events/recent", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return indexerAdapter.getRecentEvents(query.limit);
  });

  app.get("/indexer/live-state", async () => ({
    stats: indexerAdapter.getStatus().liveState,
    tokens: indexerAdapter.getLiveCards()
  }));

  app.get("/indexer/live-cards", async () => indexerAdapter.getLiveCards());

  app.get("/indexer/timeseries/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = timeseriesQuerySchema.parse(request.query);
    return indexerAdapter.getTimeseries(params.mint, query);
  });

  app.get("/indexer/derivatives/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    return indexerAdapter.getDerivatives(params.mint);
  });

  app.get("/indexer/timeseries/:mint/history", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = timeseriesQuerySchema
      .pick({ limit: true })
      .parse(request.query);

    return {
      mint: params.mint,
      buckets: listLaunchTimeseriesBucketsByMint(params.mint, query.limit),
      persisted: true,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/live/tokens", async () => liveTokens.getLiveTokens());

  app.get("/live/tokens/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const token = liveTokens.getLiveToken(params.mint);

    if (!token) {
      return reply.code(404).send({
        error: "not_found",
        message: `No current-session live token tracked for mint ${params.mint}`
      });
    }

    return token;
  });

  app.get("/live/events", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return liveTokens.getLiveFeedEvents(query.limit);
  });

  app.get("/ui/live-token-cards", async () => getLiveTokenCardsForUi());

  app.get("/ui/momentum-rows", async () => getMomentumScannerRows());

  app.get("/ui/momentum-feed", async () => {
    const rows = getMomentumScannerRows();

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      rows: rows.map(toMomentumFeedRow),
      totalRows: rows.length
    } satisfies MomentumFeedResponse;
  });

  app.get("/ui/v2/scanner", async (request, reply) => {
    const parsed = scannerV2QuerySchema.parse(request.query);
    const query: ScannerQueryV2 = {
      limit: parsed.limit,
      cursor: parsed.cursor ?? null,
      sort: parsed.sort as ScannerSortV2,
      filters: parsed.filters as ScannerFilterV2[],
      activeOnly: parsed.activeOnly,
      includeProtected: parsed.includeProtected,
      query: parsed.query
    };
    const now = new Date();
    const selected = selectScannerCardsV2(getLiveTokenCardsForUi(), query, now);
    const richPage = selected.page.map((card) =>
      liveCardToMomentumScannerRow(card)
    );
    const beforeProjectionCount = scannerProjectionV2.metrics.projectionCount;
    const snapshot = scannerProjectionV2.snapshotPage(
      richPage,
      {
        totalActive: selected.totalActive,
        totalHistory: selected.totalHistory,
        nextCursor: selected.nextCursor,
        offset: selected.offset
      },
      now
    );
    return reply
      .header("cache-control", "no-store")
      .header(
        "x-axi-v2-projection-count",
        String(scannerProjectionV2.metrics.projectionCount - beforeProjectionCount)
      )
      .header(
        "x-axi-v2-projection-ms",
        scannerProjectionV2.metrics.lastProjectionMs.toFixed(3)
      )
      .send(snapshot);
  });

  app.get("/ui/v2/scanner/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const card = getLiveTokenCardsForUi().find(
      (candidate) => candidate.mint === params.mint
    );
    if (!card) {
      return reply.code(404).send({
        error: "not_found",
        message: `No current-session momentum row for mint ${params.mint}`
      });
    }
    return liveCardToMomentumScannerRow(card);
  });

  app.get("/ui/momentum-rows/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const row = getMomentumScannerRows().find(
      (item) => item.mint === params.mint
    );

    if (!row) {
      return reply.code(404).send({
        error: "not_found",
        message: `No current-session momentum row for mint ${params.mint}`
      });
    }

    return row;
  });

  app.get("/ui/momentum-diagnostics", async () =>
    buildMomentumDiagnostics(getMomentumScannerRows())
  );

  app.get("/metered-launch-data/status", async () =>
    meteredLaunchData.getStatus()
  );

  app.get("/metered-launch-data/tracked", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      current: meteredLaunchData
        .getTrackedMints()
        .map((mint) => meteredLaunchData.getTrackedMint(mint))
        .filter(Boolean),
      persisted: listMeteredLaunchDataSubscriptions(query.limit),
      sessions: listMeteredLaunchDataSessions(query.limit),
      status: meteredLaunchData.getStatus(),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/metered-launch-data/tracked/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return {
      current: meteredLaunchData.getTrackedMint(params.mint),
      persisted: listMeteredLaunchDataSubscriptionsByMint(
        params.mint,
        query.limit
      ),
      status: meteredLaunchData.getStatus(),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/metered-launch-data/events", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      current: meteredLaunchData.getRecentTradeEvents().slice(0, query.limit),
      persisted: listMeteredLaunchDataEvents(query.limit),
      status: meteredLaunchData.getStatus(),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/metered-launch-data/events/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return {
      current: meteredLaunchData
        .getRecentTradeEvents()
        .filter((event) => event.mint === params.mint)
        .slice(0, query.limit),
      persisted: listMeteredLaunchDataEventsByMint(params.mint, query.limit),
      status: meteredLaunchData.getStatus(),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/metered-launch-data/cost", async () =>
    meteredLaunchData.getSessionCost()
  );

  app.post("/metered-launch-data/track", async (request, reply) => {
    const body = meteredLaunchDataTrackBodySchema.parse(request.body);
    await pumpPortalDataWallet.refreshBalance();

    try {
      return {
        tracking: trackingCommands.track({
          mint: body.mint,
          reason: body.reason,
          source: "metered_api"
        }),
        status: meteredLaunchData.getStatus(),
        paperOnly: true,
        dataOnly: true,
        tradingDisabled: true
      };
    } catch (error) {
      if (error instanceof MeteredLaunchDataServiceError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
          status: meteredLaunchData.getStatus(),
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true
        });
      }

      throw error;
    }
  });

  app.delete("/metered-launch-data/track/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    return {
      tracking: trackingCommands.untrack({
        mint: params.mint,
        reason: "manual_delete",
        source: "metered_api"
      }),
      status: meteredLaunchData.getStatus(),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.post("/metered-launch-data/evaluate", async (request) => {
    const body = meteredLaunchDataEvaluateBodySchema.parse(request.body ?? {});

    return {
      decisions: meteredLaunchData.evaluateCurrentCandidates(body.limit ?? 50),
      status: meteredLaunchData.getStatus(),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  });

  app.get("/launch/status", async () => ({
    ...launchScanner.getStatus(),
    meteredLaunchData: meteredLaunchData.getStatus()
  }));

  app.get("/launch/cards", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return launchScanner
      .getCandidates(query.limit)
      .map((candidate) => enrichLaunchCandidateWithMeteredData(candidate));
  });

  app.get("/launch/candidates", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      current: launchScanner
        .getCandidates(query.limit)
        .map((candidate) => enrichLaunchCandidateWithMeteredData(candidate)),
      persisted: listLaunchCandidates(query.limit),
      status: {
        ...launchScanner.getStatus(),
        meteredLaunchData: meteredLaunchData.getStatus()
      }
    };
  });

  app.get("/launch/candidates/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const candidate = launchScanner.getCandidate(params.mint);

    if (!candidate) {
      return reply.code(404).send({
        error: "not_found",
        message: `No current-session launch candidate tracked for mint ${params.mint}`,
        persisted:
          listLaunchCandidates(100).find((item) => item.mint === params.mint) ??
          null,
        paperOnly: true
      });
    }

    return enrichLaunchCandidateWithMeteredData(candidate);
  });

  app.get("/launch/scores", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      current: launchScanner.getScores(query.limit),
      persisted: listLaunchScoreSnapshots(query.limit),
      status: launchScanner.getStatus()
    };
  });

  app.get("/launch/tracked", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return {
      current: launchScanner.getTracked(),
      events: listLaunchTrackingEvents(query.limit),
      sessions: listLaunchTrackingSessions(query.limit),
      status: launchScanner.getStatus()
    };
  });

  app.post("/launch/evaluate", async (request, reply) => {
    const body = launchEvaluateBodySchema.parse(request.body);
    const snapshot = launchScanner.evaluateMint(body.mint);

    if (!snapshot) {
      return reply.code(404).send({
        error: "not_found",
        message: `No current-session launch candidate tracked for mint ${body.mint}`,
        paperOnly: true
      });
    }

    return {
      paperOnly: true,
      snapshot,
      tradingDisabled: true
    };
  });

  app.post("/launch/track", async (_request, reply) =>
    sendDeprecatedTrackingRoute(reply, "/metered-launch-data/track")
  );

  app.delete("/launch/track/:mint", async (_request, reply) =>
    sendDeprecatedTrackingRoute(reply, "/metered-launch-data/track/:mint")
  );

  app.get("/launch/cost", async (request) => {
    const query = launchCostQuerySchema.parse(request.query);
    return launchScanner.estimateCost({
      avgEventsPerToken: query.avgEventsPerToken,
      tokensPerHour: query.tokensPerHour
    });
  });

  app.get("/exit/status", async () => watchedWalletExit.getStatus());

  app.get("/exit/wallets", async () => ({
    current: watchedWalletExit.listWallets(),
    persisted: watchedWalletExit.listStoredWallets(),
    status: watchedWalletExit.getStatus(),
    paperOnly: true,
    liveExecutionDisabled: true
  }));

  app.post("/exit/wallets", async (request, reply) => {
    const body = exitWalletBodySchema.parse(request.body);

    try {
      return {
        ...watchedWalletExit.addWallet(body),
        status: watchedWalletExit.getStatus(),
        paperOnly: true,
        liveExecutionDisabled: true
      };
    } catch (error) {
      return sendWatchedWalletExitError(reply, error);
    }
  });

  app.delete("/exit/wallets/:address", async (request) => {
    const params = walletAddressParamSchema.parse(request.params);

    return {
      ...watchedWalletExit.removeWallet(params.address),
      status: watchedWalletExit.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/exit/rules", async () => ({
    current: watchedWalletExit.listRules(),
    persisted: watchedWalletExit.listStoredRules(),
    status: watchedWalletExit.getStatus(),
    paperOnly: true,
    liveExecutionDisabled: true
  }));

  app.post("/exit/rules", async (request, reply) => {
    const body = exitRuleBodySchema.parse(request.body ?? {});

    try {
      return {
        rule: watchedWalletExit.addRule(body),
        status: watchedWalletExit.getStatus(),
        paperOnly: true,
        liveExecutionDisabled: true
      };
    } catch (error) {
      return sendWatchedWalletExitError(reply, error);
    }
  });

  app.patch("/exit/rules/:ruleId", async (request, reply) => {
    const params = exitRuleParamSchema.parse(request.params);
    const body = exitRulePatchBodySchema.parse(request.body ?? {});

    try {
      return {
        rule: watchedWalletExit.updateRule(params.ruleId, body),
        status: watchedWalletExit.getStatus(),
        paperOnly: true,
        liveExecutionDisabled: true
      };
    } catch (error) {
      return sendWatchedWalletExitError(reply, error);
    }
  });

  app.delete("/exit/rules/:ruleId", async (request) => {
    const params = exitRuleParamSchema.parse(request.params);

    return {
      ...watchedWalletExit.removeRule(params.ruleId),
      status: watchedWalletExit.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/exit/events", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      events: watchedWalletExit.getRecentEvents(query.limit),
      status: watchedWalletExit.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/exit/events/wallet/:address", async (request) => {
    const params = walletAddressParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);

    return {
      events: watchedWalletExit.getRecentEventsByWallet(
        params.address,
        query.limit
      ),
      status: watchedWalletExit.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/exit/events/mint/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);

    return {
      events: watchedWalletExit.getRecentEventsByMint(params.mint, query.limit),
      status: watchedWalletExit.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/exit/signals", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      signals: watchedWalletExit.getSignals(query.limit),
      status: watchedWalletExit.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/exit/signals/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);

    return {
      signals: watchedWalletExit.getSignalsByMint(params.mint, query.limit),
      summary: watchedWalletExit.getSignalSummaryForMint(params.mint),
      status: watchedWalletExit.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.post("/exit/evaluate", async () =>
    watchedWalletExit.evaluateForOpenPositions()
  );

  app.post("/exit/simulate", async (request) => {
    const body = exitSimulateBodySchema.parse(request.body);

    return watchedWalletExit.simulate(body);
  });

  app.get("/exit/cost", async (request) => {
    const query = exitCostQuerySchema.parse(request.query);

    return watchedWalletExit.estimateCost({
      eventsPerWallet: query.eventsPerWallet,
      wallets: query.wallets
    });
  });

  app.get("/strategy/status", async () => getStrategyStatus());

  app.get("/metrics", async () =>
    metricsEngine.getAllMetrics().map(enrichMetricsWithIdentity)
  );

  app.get("/metrics/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const metrics = metricsEngine.getMetrics(params.mint);

    if (!metrics) {
      return reply.code(404).send({
        error: "not_found",
        message: `No metrics tracked for mint ${params.mint}`
      });
    }

    return enrichMetricsWithIdentity(metrics);
  });

  app.get("/candidates", async () =>
    candidateEngine.getAllCandidates().map(enrichCandidate)
  );

  app.get("/candidates/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const candidate = candidateEngine.getCandidate(params.mint);

    if (!candidate) {
      return reply.code(404).send({
        error: "not_found",
        message: `No candidate tracked for mint ${params.mint}`
      });
    }

    return enrichCandidate(candidate);
  });

  app.get("/risk", async () => Array.from(riskSnapshots.values()));

  app.get("/risk/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const riskSnapshot = riskSnapshots.get(params.mint);

    if (!riskSnapshot) {
      return reply.code(404).send({
        error: "not_found",
        message: `No risk snapshot tracked for mint ${params.mint}`
      });
    }

    return riskSnapshot;
  });

  app.get("/positions", async () => executor.getPositions());

  app.get("/storage/stats", async () => getStorageStats());

  app.get("/tokens/status", async () => tokenIdentity.getStatus());

  app.get("/tokens", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listTokenIdentities(query.limit);
  });

  app.get("/tokens/unresolved", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listUnresolvedTokenIdentities(query.limit);
  });

  app.get("/tokens/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const identity = tokenIdentity.getIdentity(params.mint);

    if (!identity) {
      return reply.code(404).send({
        error: "not_found",
        message: `No token identity tracked for mint ${params.mint}`
      });
    }

    return identity;
  });

  app.post("/tokens/resolve", async (request, reply) => {
    const body = tokenResolveBodySchema.parse(request.body);

    if (!isValidSolanaMint(body.mint)) {
      return reply.code(400).send({
        error: "INVALID_MINT",
        message: `Invalid Solana mint: ${body.mint}`,
        paperOnly: true
      });
    }

    try {
      return await tokenIdentity.resolveIdentity(body.mint, "manual_http");
    } catch (error) {
      return reply.code(400).send({
        error: "TOKEN_IDENTITY_RESOLVE_FAILED",
        message: error instanceof Error ? error.message : String(error),
        tokenIdentity: tokenIdentity.getStatus(),
        paperOnly: true
      });
    }
  });

  app.get("/actual-data/status", async () => {
    await pumpPortalDataWallet.refreshBalance();
    return {
      ...actualData.getStatus(),
      meteredLaunchData: meteredLaunchData.getStatus()
    };
  });

  app.get("/actual-data/subscriptions", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    await pumpPortalDataWallet.refreshBalance();

    return {
      current: actualData.getSubscriptions(),
      recent: listActualDataSubscriptions(query.limit),
      status: actualData.getStatus()
    };
  });

  app.post("/actual-data/subscribe", async (_request, reply) =>
    sendDeprecatedTrackingRoute(reply, "/metered-launch-data/track")
  );

  app.delete("/actual-data/subscribe/:mint", async (_request, reply) =>
    sendDeprecatedTrackingRoute(reply, "/metered-launch-data/track/:mint")
  );

  app.get("/actual-data/trades", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listPumpPortalTokenTradeEvents(query.limit).map(
      enrichRowWithIdentity
    );
  });

  app.get("/actual-data/trades/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return listPumpPortalTokenTradeEventsByMint(params.mint, query.limit).map(
      enrichRowWithIdentity
    );
  });

  app.get("/pumpportal/data-wallet/status", async () =>
    pumpPortalDataWallet.refreshBalance()
  );

  app.post("/pumpportal/data-wallet/refresh", async () =>
    pumpPortalDataWallet.refreshBalance({ force: true })
  );

  app.get("/pumpportal/data-wallet/funding", async () =>
    pumpPortalDataWallet.getFundingInstructions()
  );

  app.get("/pumpportal/wallets/status", async () =>
    pumpPortalWallets.refreshBalances()
  );

  app.post("/pumpportal/wallets/refresh", async () => {
    const status = await pumpPortalWallets.refreshBalances({ force: true });
    const snapshot = savePumpPortalWalletStatusSnapshot(
      pumpPortalWallets.toStorageSnapshot()
    );

    return {
      ...status,
      snapshotSaved: true,
      snapshotId: snapshot.id
    };
  });

  app.get("/pumpportal/wallets/funding", async () =>
    pumpPortalWallets.getFundingInstructions()
  );

  app.get("/execution/lightning/status", async () => {
    await pumpPortalWallets.refreshBalances();
    return lightningReadiness.getStatus();
  });

  app.post("/execution/lightning/plan-buy", async (request) => {
    const body = lightningPlanBodySchema.parse(request.body);
    await pumpPortalWallets.refreshBalances();
    const plan = lightningReadiness.createBuyPlan(body);
    saveLightningPlan(plan);

    return {
      ...plan,
      reason: body.reason,
      noTransactionSent: true,
      paperOnly: true,
      tradingDisabled: true
    };
  });

  app.post("/execution/lightning/plan-sell", async (request) => {
    const body = lightningPlanBodySchema.parse(request.body);
    await pumpPortalWallets.refreshBalances();
    const plan = lightningReadiness.createSellPlan(body);
    saveLightningPlan(plan);

    return {
      ...plan,
      reason: body.reason,
      noTransactionSent: true,
      paperOnly: true,
      tradingDisabled: true
    };
  });

  app.post("/execution/lightning/execute", async (_request, reply) => {
    const refusal = await lightningReadiness.refuseExecution();

    return reply.code(409).send({
      error: "LIGHTNING_LIVE_TRADING_DISABLED",
      message:
        "PumpPortal Lightning execution is disabled. This build only creates dry-run plans.",
      refusal,
      readiness: lightningReadiness.getStatus(),
      noTransactionSent: true,
      paperOnly: true,
      tradingDisabled: true
    });
  });

  app.get("/live/trade-tracking/status", async () => {
    await pumpPortalDataWallet.refreshBalance();
    return getLiveTradeTrackingStatus();
  });

  app.post("/live/trade-tracking/track", async (_request, reply) =>
    sendDeprecatedTrackingRoute(reply, "/metered-launch-data/track")
  );

  app.delete("/live/trade-tracking/track/:mint", async (_request, reply) =>
    sendDeprecatedTrackingRoute(reply, "/metered-launch-data/track/:mint")
  );

  app.get("/live/trade-tracking/trades", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listPumpPortalTokenTradeEvents(query.limit).map(
      enrichRowWithIdentity
    );
  });

  app.get("/live/trade-tracking/trades/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return listPumpPortalTokenTradeEventsByMint(params.mint, query.limit).map(
      enrichRowWithIdentity
    );
  });

  app.get("/enrichment/status", async () => getLiveCardEnrichmentStatus());

  app.get("/enrichment/tokens/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const enrichment = liveCardEnrichments.get(params.mint);

    if (!enrichment) {
      return reply.code(404).send({
        error: "not_found",
        message: `No live-card enrichment cached for mint ${params.mint}`,
        status: getLiveCardEnrichmentStatus(),
        paperOnly: true
      });
    }

    return enrichment;
  });

  app.post("/enrichment/tokens", async (request, reply) => {
    const body = tokenResolveBodySchema.parse(request.body);

    try {
      return await enrichLiveCardToken(body.mint, "manual_http");
    } catch (error) {
      if (error instanceof ActualDataServiceError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
          status: getLiveCardEnrichmentStatus(),
          paperOnly: true
        });
      }

      throw error;
    }
  });

  app.get("/chain/status", async () => chainVerifier.getStatus());

  app.get("/chain/verifications", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listChainVerifications(query.limit);
  });

  app.get("/chain/verifications/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const verification = getLatestChainVerification(params.mint);

    if (!verification) {
      return reply.code(404).send({
        error: "not_found",
        message: `No chain verification stored for mint ${params.mint}`
      });
    }

    return verification;
  });

  app.get("/chain/verify/:mint", async (request, reply) => {
    const params = chainVerifyBodySchema.parse(request.params);
    return verifyMintForHttp(params.mint, reply);
  });

  app.post("/chain/verify", async (request, reply) => {
    const body = chainVerifyBodySchema.parse(request.body);
    return verifyMintForHttp(body.mint, reply);
  });

  app.get("/chain/events/status", async () => chainEvents.getStatus());

  app.get("/chain/events/watches", async () =>
    chainEvents.getWatchedAddresses()
  );

  app.post("/chain/events/watch", async (request, reply) => {
    const body = chainEventsWatchBodySchema.parse(request.body);

    try {
      const watchInput: WatchedAddressInput = {
        address: body.address,
        kind: body.kind as WatchedAddressKind,
        reasonCodes: ["MANUAL_READ_ONLY_WATCH"]
      };

      if (body.mint) {
        watchInput.mint = body.mint;
      }

      if (body.label) {
        watchInput.label = body.label;
      }

      return chainEvents.watchAddress(watchInput);
    } catch (error) {
      if (error instanceof ChainEventsUnavailableError) {
        return reply.code(409).send({
          error: error.code,
          message: error.message,
          chainEvents: chainEvents.getStatus()
        });
      }

      if (error instanceof Error) {
        return reply.code(400).send({
          error: "CHAIN_EVENTS_WATCH_REJECTED",
          message: error.message,
          chainEvents: chainEvents.getStatus()
        });
      }

      throw error;
    }
  });

  app.delete("/chain/events/watch/:address", async (request) => {
    const params = chainEventsAddressParamSchema.parse(request.params);
    const removed = await chainEvents.unwatchAddress(params.address);

    return {
      address: params.address,
      removed,
      paperOnly: true
    };
  });

  app.get("/chain/events/transactions", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return chainEvents.getRecentChainEvents(query.limit);
  });

  app.get("/chain/events/trades", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return chainEvents.getRecentChainTradeEvents(query.limit);
  });

  app.get("/chain/events/transactions/:signature", async (request, reply) => {
    const params = signatureParamSchema.parse(request.params);
    const event = chainEvents.getChainTransactionEvent(params.signature);

    if (!event) {
      return reply.code(404).send({
        error: "not_found",
        message: `No chain transaction event stored for signature ${params.signature}`
      });
    }

    return event;
  });

  app.get("/market/status", async () => chainEvents.getMarketStatus());

  app.get("/market/observations", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return chainEvents.getRecentMarketObservations(query.limit);
  });

  app.get(
    "/market/observations/signature/:signature",
    async (request, reply) => {
      const params = signatureParamSchema.parse(request.params);
      const observation = chainEvents.getMarketObservation(params.signature);

      if (!observation) {
        return reply.code(404).send({
          error: "not_found",
          message: `No market observation stored for signature ${params.signature}`
        });
      }

      return observation;
    }
  );

  app.get("/market/observations/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return chainEvents.getMarketObservationsByMint(params.mint, query.limit);
  });

  app.get("/watch/status", async () => watchOrchestration.getStatus());

  app.get("/watch/plans", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return watchOrchestration
      .getWatchPlans(query.limit)
      .map(enrichRowWithIdentity);
  });

  app.get("/watch/plans/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const plan = watchOrchestration.getWatchPlan(params.mint);

    if (!plan) {
      return reply.code(404).send({
        error: "not_found",
        message: `No watch plan stored for mint ${params.mint}`
      });
    }

    return enrichRowWithIdentity(plan);
  });

  app.get("/watch/actions", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return watchOrchestration.getRecentActions(query.limit);
  });

  app.get("/watch/actions/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const query = limitQuerySchema.parse(request.query);
    return watchOrchestration.getRecentActionsByMint(params.mint, query.limit);
  });

  app.post("/watch/plan", async (request) => {
    const body = watchPlanBodySchema.parse(request.body);
    return watchOrchestration.createManualPlan(body);
  });

  app.get("/signals/recent", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listRecentSignals(query.limit);
  });

  app.get("/paper/orders", async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return listPaperOrders(query.limit);
  });

  app.get("/paper/positions", async () => listPaperPositions());

  app.get("/paper-portfolio/status", async () => paperPortfolio.getStatus());

  app.get("/runtime/paper-exit-policy", async () =>
    paperPortfolio.getExitPolicyStatus()
  );

  app.get("/runtime/paper-exit-policy/evaluations", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      evaluations: paperPortfolio.getExitPolicyEvaluations(query.limit),
      automaticPaperExitActivation: false,
      automaticLiveExecution: false,
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get(
    "/runtime/paper-exit-policy/evaluations/:evaluationId",
    async (request, reply) => {
      const params = paperExitPolicyEvaluationParamSchema.parse(request.params);
      const evaluation = paperPortfolio.getExitPolicyEvaluation(
        params.evaluationId
      );

      if (!evaluation) {
        return reply.code(404).send({
          error: "PAPER_EXIT_POLICY_EVALUATION_NOT_FOUND",
          message: `Paper exit policy evaluation ${params.evaluationId} was not found.`,
          paperOnly: true,
          liveExecutionDisabled: true
        });
      }

      return evaluation;
    }
  );

  app.get(
    "/runtime/paper-exit-policy/evaluations/:evaluationId/export",
    async (request, reply) => {
      const params = paperExitPolicyEvaluationParamSchema.parse(request.params);
      const evaluation = paperPortfolio.getExitPolicyEvaluation(
        params.evaluationId
      );

      if (!evaluation) {
        return reply.code(404).send({
          error: "PAPER_EXIT_POLICY_EVALUATION_NOT_FOUND",
          message: `Paper exit policy evaluation ${params.evaluationId} was not found.`,
          paperOnly: true,
          liveExecutionDisabled: true
        });
      }

      return reply
        .type("application/json; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="${safeFileSegment(params.evaluationId)}.json"`
        )
        .send(JSON.stringify(evaluation, null, 2));
    }
  );

  app.get("/paper-portfolio/snapshot", async () => ({
    snapshot: paperPortfolio.getSnapshot(),
    status: paperPortfolio.getStatus(),
    paperOnly: true,
    liveExecutionDisabled: true
  }));

  app.get("/paper-portfolio/positions", async () => ({
    positions: paperPortfolio.getPositions(),
    status: paperPortfolio.getStatus(),
    paperOnly: true,
    liveExecutionDisabled: true
  }));

  app.get("/paper-portfolio/positions/:mint", async (request, reply) => {
    const params = mintParamSchema.parse(request.params);
    const position = paperPortfolio.getPosition(params.mint);

    if (!position) {
      return reply.code(404).send({
        error: "not_found",
        message: `No paper portfolio position found for mint ${params.mint}`,
        status: paperPortfolio.getStatus(),
        paperOnly: true,
        liveExecutionDisabled: true
      });
    }

    return {
      position,
      summary: paperPortfolio.getPositionSummaryForMint(params.mint),
      status: paperPortfolio.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/paper-portfolio/orders", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      orders: paperPortfolio.getOrders(query.limit),
      status: paperPortfolio.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/paper-portfolio/fills", async (request) => {
    const query = limitQuerySchema.parse(request.query);

    return {
      fills: paperPortfolio.getFills(query.limit),
      status: paperPortfolio.getStatus(),
      paperOnly: true,
      liveExecutionDisabled: true
    };
  });

  app.get("/paper-portfolio/performance", async () =>
    paperPortfolio.getPerformance()
  );

  app.post("/paper-portfolio/evaluate-entries", async () => ({
    evaluations: paperPortfolio.evaluateEntries(),
    status: paperPortfolio.getStatus(),
    paperOnly: true,
    liveExecutionDisabled: true
  }));

  app.post("/paper-portfolio/evaluate-exits", async () => ({
    evaluations: paperPortfolio.evaluateExits(),
    status: paperPortfolio.getStatus(),
    paperOnly: true,
    liveExecutionDisabled: true
  }));

  app.post("/paper-portfolio/manual-entry", async (request, reply) => {
    const body = paperPortfolioManualEntryBodySchema.parse(request.body);

    try {
      return paperPortfolio.manualEntry({
        mint: body.mint,
        reason: body.reason,
        ...(body.sizeSol !== undefined ? { sizeSol: body.sizeSol } : {}),
        ...(body.marketPriceSol !== undefined
          ? { marketPriceSol: body.marketPriceSol }
          : {})
      });
    } catch (error) {
      return sendPaperPortfolioError(reply, error);
    }
  });

  app.post("/paper-portfolio/manual-exit", async (request, reply) => {
    const body = paperPortfolioManualExitBodySchema.parse(request.body);

    try {
      return paperPortfolio.manualExit({
        mint: body.mint,
        reason: body.reason,
        ...(body.sellPct !== undefined ? { sellPct: body.sellPct } : {}),
        ...(body.marketPriceSol !== undefined
          ? { marketPriceSol: body.marketPriceSol }
          : {})
      });
    } catch (error) {
      return sendPaperPortfolioError(reply, error);
    }
  });

  app.post("/paper-portfolio/backtest", async (request) => {
    const body = paperPortfolioBacktestBodySchema.parse(request.body ?? {});

    return runPaperBacktest({
      fixture: body.fixture
    });
  });

  app.server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `http://${host}`);

    if (url.pathname !== "/ws/signals" && url.pathname !== "/ws/v2/scanner") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket, request) => {
    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `http://${host}`);
    if (url.pathname === "/ws/v2/scanner") {
      scannerClientsV2.add(socket);
      sendJson(socket, getScannerSnapshotMessageV2());
      socket.on("close", () => scannerClientsV2.delete(socket));
      return;
    }

    clients.add(socket);
    sendJson(socket, {
      type: "snapshot",
      signals: Array.from(signals.values())
    });

    socket.on("close", () => {
      clients.delete(socket);
    });
  });

  app.addHook("onClose", async () => {
    try {
      await chainEvents.stop();
      await stopFeed(null);
    } finally {
      discoveryCoverage.finalize("server_shutdown");
      tradeDataCoverage.finalize("server_shutdown");
    }
    paperOperations.stop("server shutdown");
    calibrationCapture.interrupt("runtime_closed");
    paperAutomation.stop();
    paidDataArmed = false;
    persistRuntimeSession({
      stoppedAt: new Date().toISOString(),
      stopReason: "server_shutdown"
    });

    for (const client of clients) {
      client.close(1001, "Server shutting down");
    }

    wss.close();

    if (options.closeStorageOnClose ?? true) {
      closeStorage();
    }
  });

  function startFeed(): void {
    if (feedStarted) {
      return;
    }

    feedStarted = true;
    actualData.start();
    launchScanner.start();
    meteredLaunchData.prepare();
    paperPortfolio.start();
    paperAutomation.start();
    paperOperations.start();
    watchedWalletExit.start();
    void feed.start(
      feed instanceof PumpPortalFeedProvider
        ? enqueueFeedEvent
        : handleFeedEvent
    );
    void chainEvents.start();
  }

  async function stopFeed(
    coverageStopReason: string | null = "bounded_run_complete"
  ): Promise<void> {
    if (!feedStarted) {
      if (coverageStopReason) {
        discoveryCoverage.finalize(coverageStopReason);
      }
      return;
    }

    feedStarted = false;
    let feedStopError: unknown = null;
    try {
      await feed.stop();
      flushFeedEventQueue();
    } catch (error) {
      feedStopError = error;
    }
    paperOperations.stop("runtime feed stopped");
    meteredLaunchData.stop();
    disarmPaidData("feed_stop");
    launchScanner.stop();
    watchedWalletExit.stop();
    paperAutomation.stop();
    paperPortfolio.stop();
    actualData.stop();
    await chainEvents.stop();
    if (coverageStopReason) {
      discoveryCoverage.finalize(coverageStopReason);
    }
    if (feedStopError) {
      throw feedStopError;
    }
  }

  function getFeedStatus() {
    const pumpPortalStatus =
      feed instanceof PumpPortalFeedProvider ? feed.getStatus() : undefined;
    const noFeedReasonCodes =
      feed instanceof NoFeedProvider ? feed.reasonCodes : [];
    const reasonCodes = uniqueReasonCodes([
      "RUNTIME_PUMPPORTAL_FIRST",
      "MANAGED_STREAM_DISABLED_FOR_RUNTIME",
      ...(dataFeedMode === "live" ? ["LIVE_FEED_EXPECTED"] : []),
      ...(dataFeedMode === "none" ? ["NO_FEED_MODE"] : []),
      ...(feed.name === "mock" ? ["MOCK_EXPLICITLY_ENABLED"] : []),
      ...(feed.name === "mock-blocked" ? ["MOCK_RUNTIME_BLOCKED"] : []),
      ...(feed.name === "pumpportal"
        ? ["PUMPPORTAL_LIVE_DISCOVERY_ACTIVE"]
        : ["PUMPPORTAL_LIVE_DISCOVERY_OFFLINE"]),
      "HISTORICAL_MOCK_ROWS_HIDDEN",
      ...(pumpPortalStatus?.reasonCodes ?? noFeedReasonCodes)
    ]);

    return {
      mode: dataFeedMode,
      provider: feed.name,
      enabled: dataFeedMode === "live" || dataFeedMode === "mock",
      configured:
        feed.name === "pumpportal" ||
        feed.name === "mock" ||
        dataFeedMode === "none",
      connected: pumpPortalStatus?.connected ?? false,
      connecting: pumpPortalStatus?.connecting ?? false,
      live: dataFeedMode === "live",
      realData: feed.name === "pumpportal",
      subscriptions: pumpPortalStatus?.subscriptions ?? [],
      reconnectAttempts: pumpPortalStatus?.reconnectAttempts ?? 0,
      lastOpenAt: pumpPortalStatus?.lastOpenAt ?? null,
      lastCloseAt: pumpPortalStatus?.lastCloseAt ?? null,
      lastMessageAt: pumpPortalStatus?.lastMessageAt ?? null,
      lastEventAt: pumpPortalStatus?.lastEventAt ?? null,
      newTokenEventCount: pumpPortalStatus?.newTokenEventCount ?? 0,
      migrationEventCount: pumpPortalStatus?.migrationEventCount ?? 0,
      tokenTradeEventCount: pumpPortalStatus?.tokenTradeEventCount ?? 0,
      accountTradeEventCount: pumpPortalStatus?.accountTradeEventCount ?? 0,
      accountTradeSubscriptions:
        feed instanceof PumpPortalFeedProvider
          ? feed.getAccountTradeSubscriptions()
          : [],
      parseErrorCount: pumpPortalStatus?.parseErrorCount ?? 0,
      lastError: pumpPortalStatus?.lastError ?? null,
      reasonCodes,
      paperOnly: true as const
    };
  }

  function enrichLaunchCandidateWithMeteredData(
    candidate: LaunchCandidateView
  ) {
    const metered = meteredLaunchData.getTrackedMint(candidate.mint);
    const summary = actualData.getCandidateSummary(candidate.mint);
    const status = meteredLaunchData.getStatus();
    const state =
      metered?.status === "tracking"
        ? "tracking"
        : status.budgetReached
          ? "budget_reached"
          : metered?.status === "unsubscribed"
            ? "unsubscribed"
            : status.ready
              ? "not_tracked"
              : "blocked";

    return {
      ...candidate,
      meteredTrackingState: state,
      meteredEventsForMint: metered?.eventCount ?? summary?.eventCount ?? 0,
      meteredCostForMint: metered?.estimatedCostSol ?? 0,
      latestMeteredTradeAt:
        metered?.latestTradeAt ?? summary?.latestRealTradeAt ?? null,
      priceActionSource:
        (metered?.eventCount ?? summary?.eventCount ?? 0) > 0
          ? "PumpPortal subscribeTokenTrade"
          : "unavailable",
      meteredLaunchDataReasonCodes: uniqueReasonCodes([
        ...(metered?.reasonCodes ?? []),
        ...status.reasonCodes
      ]),
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  function getLiveTokenCardsForUi(): LiveTokenCardViewModel[] {
    return indexerAdapter.getStatus().preferLiveStateCards
      ? buildIndexerBackedLiveTokenCards()
      : buildLiveTokenCards();
  }

  function getMomentumScannerRows(): MomentumScannerRow[] {
    return getLiveTokenCardsForUi().map((card) =>
      liveCardToMomentumScannerRow(card)
    );
  }

  function getScannerSnapshotMessageV2() {
    const now = new Date();
    const selected = selectScannerCardsV2(
      getLiveTokenCardsForUi(),
      {
        limit: 100,
        cursor: null,
        sort: "newest",
        filters: [],
        activeOnly: true,
        includeProtected: true,
        query: ""
      },
      now
    );
    const snapshot = scannerProjectionV2.snapshotPage(
      selected.page.map((card) => liveCardToMomentumScannerRow(card)),
      {
        totalActive: selected.totalActive,
        totalHistory: selected.totalHistory,
        nextCursor: selected.nextCursor,
        offset: selected.offset
      },
      now
    );
    return scannerProjectionV2.snapshotEnvelope(snapshot);
  }

  function broadcastScannerUpsertV2(mint: string): void {
    if (scannerClientsV2.size === 0) return;
    const card = getLiveTokenCardsForUi().find((item) => item.mint === mint);
    if (!card) return;
    const message = scannerProjectionV2.upsert(
      liveCardToMomentumScannerRow(card)
    );
    if (!message || message.type !== "scanner.upsert") return;
    broadcastV2(message);
    const previousSignal = scannerSignalsV2.get(mint);
    const nextSignal = message.row.decision.signal;
    if (previousSignal && previousSignal !== nextSignal) {
      broadcastV2(
        scannerProjectionV2.signalTransition({
          mint,
          rowVersion: message.row.rowVersion,
          from: previousSignal,
          to: nextSignal,
          generatedAt: message.generatedAt
        })
      );
    }
    scannerSignalsV2.set(mint, nextSignal);
  }

  function buildMomentumSparkline(
    mint: string,
    curveSamples: Array<{
      priceSol: number | null;
      t: string;
      volumeSol: number | null;
    }> = []
  ): MomentumScannerRow["sparkline"] {
    const meteredSamples = meteredLaunchData
      .getRecentTradeEvents()
      .filter((event) => event.mint === mint)
      .map((event) => ({
        priceSol: finiteOrNull(event.priceSol),
        t: event.createdAt,
        volumeSol: finiteOrNull(event.volumeSol)
      }))
      .filter(
        (
          sample
        ): sample is {
          priceSol: number;
          t: string;
          volumeSol: number | null;
        } => sample.priceSol !== null && sample.priceSol > 0
      );

    if (meteredSamples.length >= 2) {
      return createMomentumSparkline(meteredSamples, {
        label: "trade samples",
        source: "trade_samples",
        windowSeconds: 60
      });
    }

    const metricSamples = metricsEngine
      .getRecentTradeSamples(mint, 50)
      .map((event) => ({
        priceSol: finiteOrNull(event.priceSol),
        t: event.timestamp,
        volumeSol: finiteOrNull(event.volumeSol)
      }))
      .filter(
        (
          sample
        ): sample is {
          priceSol: number;
          t: string;
          volumeSol: number | null;
        } => sample.priceSol !== null && sample.priceSol > 0
      );

    if (metricSamples.length >= 2) {
      return createMomentumSparkline(metricSamples, {
        label: "trade samples",
        source: "trade_samples",
        windowSeconds: 60
      });
    }

    const curveMarkSamples = curveSamples
      .map((sample) => ({
        priceSol: finiteOrNull(sample.priceSol),
        t: sample.t,
        volumeSol: finiteOrNull(sample.volumeSol)
      }))
      .filter(
        (
          sample
        ): sample is {
          priceSol: number;
          t: string;
          volumeSol: number | null;
        } => sample.priceSol !== null && sample.priceSol > 0
      );

    if (curveMarkSamples.length >= 2) {
      return createMomentumSparkline(curveMarkSamples, {
        label: "curve mark",
        source: "curve_marks",
        windowSeconds: 60
      });
    }

    return createMomentumSparkline([], {
      label:
        meteredSamples.length > 0 ||
        metricSamples.length > 0 ||
        curveMarkSamples.length > 0
          ? "one sample"
          : "unavailable",
      source: curveMarkSamples.length > 0 ? "curve_marks" : "unavailable",
      windowSeconds: 60
    });
  }

  function liveCardToMomentumScannerRow(
    card: LiveTokenCardViewModel
  ): MomentumScannerRow {
    const derivativeSampleCount = Math.max(
      card.sampleCount,
      card.launchTradeSampleCount,
      card.realTradeEventCount
    );
    const hasDerivativeSamples = derivativeSampleCount >= 2;
    const hasSecondDerivativeSamples = derivativeSampleCount >= 3;
    const hasTradeSamples =
      card.sampleCount > 0 ||
      card.launchTradeSampleCount > 0 ||
      card.realTradeEventCount > 0;
    const derivativeReasonCodes = [
      ...(hasDerivativeSamples ? [] : ["INSUFFICIENT_SAMPLES_FOR_DERIVATIVE"]),
      ...(hasSecondDerivativeSamples
        ? []
        : ["INSUFFICIENT_SAMPLES_FOR_SECOND_DERIVATIVE"])
    ];
    const missingFieldReasons = buildMomentumMissingFieldReasons(card, {
      hasDerivativeSamples,
      hasTradeSamples
    });
    const marketUnavailable = [
      ...(card.marketCapUsd === null &&
      card.marketCapSol === null &&
      card.curve.curveMarketCapSol === null
        ? (missingFieldReasons.marketCap ?? [])
        : []),
      ...(card.liquidityUsd === null && card.curve.curveLiquiditySol === null
        ? (missingFieldReasons.liquidity ?? [])
        : []),
      ...(card.fdvUsd === null ? ["FDV_UNAVAILABLE"] : []),
      ...(card.enrichmentStatus === "disabled" ? ["ENRICHMENT_DISABLED"] : [])
    ];
    const holderUnavailable =
      card.holderVelocityPerSec === null ||
      card.holderAccelerationPerSec2 === null
        ? ["HOLDER_TIME_SERIES_UNAVAILABLE"]
        : [];
    const unavailableFields = uniqueReasonCodes([
      ...card.unavailableFields,
      ...Object.values(missingFieldReasons).flat(),
      ...marketUnavailable,
      ...holderUnavailable,
      ...derivativeReasonCodes,
      "SOCIAL_SIGNAL_PROVIDER_NOT_CONFIGURED"
    ]);
    const staleFields = card.stale ? ["latestEventAt"] : [];
    const qualityLabel = getMomentumDataQualityLabel(card);
    const displayPriceSol = finiteOrNull(
      card.priceSol ?? card.launchPriceSol ?? card.curve.curvePriceSol
    );
    const displayMarketCapSol = finiteOrNull(
      card.marketCapSol ?? card.curve.curveMarketCapSol
    );
    const volume5sSol =
      finiteOrNull(card.volume5sSol) ??
      (hasTradeSamples ? finiteOrNull(card.launchVolume5sSol) : null);
    const volume10sSol =
      finiteOrNull(card.volume10sSol) ??
      (hasTradeSamples ? finiteOrNull(card.launchVolume10sSol) : null);
    const volume30sSol =
      finiteOrNull(card.volume30sSol) ??
      (hasTradeSamples ? finiteOrNull(card.launchVolume30sSol) : null);
    const flow10s = hasTradeSamples
      ? (card.launchWindows?.["10s"] ?? null)
      : null;
    const flow5s = hasTradeSamples
      ? (card.launchWindows?.["5s"] ?? null)
      : null;
    const flow30s = hasTradeSamples
      ? (card.launchWindows?.["30s"] ?? null)
      : null;
    const derivatives = {
      volumeVelocitySolPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.volumeVelocitySolPerSec,
        card.launchVolumeVelocitySolPerSec
      ),
      volumeAccelerationSolPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.volumeAccelerationSolPerSec2,
        card.launchVolumeAccelerationSolPerSec2
      ),
      priceVelocityPctPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.priceSolVelocityPctPerSec ?? card.priceVelocityPctPerSec,
        card.launchPriceVelocityPctPerSec
      ),
      priceAccelerationPctPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.priceSolAccelerationPctPerSec2 ?? card.priceAccelerationPctPerSec2,
        card.launchPriceAccelerationPctPerSec2
      ),
      buyerVelocityPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.buyerVelocityPerSec,
        card.launchBuyerVelocityPerSec
      ),
      buyerAccelerationPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.buyerAccelerationPerSec2,
        card.launchBuyerAccelerationPerSec2
      )
    };
    const derivativeReasonSet = uniqueReasonCodes([
      ...derivativeReasonCodes,
      ...(card.launchTradeSampleCount >= 2
        ? [
            ...(card.launchDerivativeScore?.reasonCodes ?? []),
            ...(card.launchDerivativeStrength?.volume.reasonCodes ?? []),
            ...(card.launchDerivativeStrength?.volumeAcceleration.reasonCodes ??
              []),
            ...(card.launchDerivativeStrength?.price.reasonCodes ?? []),
            ...(card.launchDerivativeStrength?.priceAcceleration.reasonCodes ??
              []),
            ...(card.launchDerivativeStrength?.buyers.reasonCodes ?? []),
            ...(card.launchDerivativeStrength?.buyerAcceleration.reasonCodes ??
              []),
            ...(card.launchDerivativeStrength?.trades.reasonCodes ?? []),
            ...(card.launchDerivativeStrength?.buyPressure.reasonCodes ?? [])
          ]
        : [])
    ]);
    const rowDerivatives: MomentumScannerRow["derivatives"] = {
      dVol5sSolPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dVol5sSolPerSec,
        derivatives.volumeVelocitySolPerSec
      ),
      dVol10sSolPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dVol10sSolPerSec,
        derivatives.volumeVelocitySolPerSec
      ),
      dVol30sSolPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dVol30sSolPerSec,
        derivatives.volumeVelocitySolPerSec
      ),
      d2VolSolPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.launchDerivatives?.d2VolSolPerSec2,
        derivatives.volumeAccelerationSolPerSec2
      ),
      dPricePctPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dPricePctPerSec,
        derivatives.priceVelocityPctPerSec
      ),
      d2PricePctPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.launchDerivatives?.d2PricePctPerSec2,
        derivatives.priceAccelerationPctPerSec2
      ),
      dPriceSolPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dPriceSolPerSec,
        null
      ),
      d2PriceSolPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.launchDerivatives?.d2PriceSolPerSec2,
        null
      ),
      dBuyersPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dBuyersPerSec,
        derivatives.buyerVelocityPerSec
      ),
      d2BuyersPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.launchDerivatives?.d2BuyersPerSec2,
        derivatives.buyerAccelerationPerSec2
      ),
      dTradesPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dTradesPerSec,
        null
      ),
      d2TradesPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.launchDerivatives?.d2TradesPerSec2,
        null
      ),
      dBuyPressurePerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dBuyPressurePerSec,
        null
      ),
      d2BuyPressurePerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.launchDerivatives?.d2BuyPressurePerSec2,
        null
      ),
      dMarketCapSolPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dMarketCapSolPerSec,
        null
      ),
      d2MarketCapSolPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.launchDerivatives?.d2MarketCapSolPerSec2,
        null
      ),
      dLiquiditySolPerSec: chooseDerivativeValue(
        hasDerivativeSamples,
        card.launchDerivatives?.dLiquiditySolPerSec,
        null
      ),
      d2LiquiditySolPerSec2: chooseDerivativeValue(
        hasSecondDerivativeSamples,
        card.launchDerivatives?.d2LiquiditySolPerSec2,
        null
      ),
      reasonCodes: derivativeReasonSet
    };
    const eligibleLaunchDerivativeStrength =
      card.launchTradeSampleCount >= 2 ? card.launchDerivativeStrength : null;
    const rowDerivativeStrength =
      eligibleLaunchDerivativeStrength ??
      createMomentumDerivativeStrengthFallback(rowDerivatives, {
        ageSeconds: card.launchAgeSeconds ?? card.ageSeconds,
        freshnessMs:
          card.latestTradeAgeSeconds === null
            ? null
            : card.latestTradeAgeSeconds * 1_000,
        sampleCount: derivativeSampleCount
      });
    const rowDerivativeScore = eligibleLaunchDerivativeStrength
      ? (card.launchDerivativeScore ??
        rowDerivativeStrength.combinedDerivativeScore)
      : rowDerivativeStrength.combinedDerivativeScore;
    const isProtected =
      card.paperPositionSummary.hasPosition ||
      card.launchPhase === "hot" ||
      card.launchPhase === "ripping" ||
      rowDerivativeScore.totalScore >= 65;
    const protectedReason = card.paperPositionSummary.hasPosition
      ? "PAPER_POSITION"
      : card.launchPhase === "ripping"
        ? "LAUNCH_RIPPING"
        : card.launchPhase === "hot"
          ? "LAUNCH_HOT"
          : rowDerivativeScore.totalScore >= 65
            ? "DERIVATIVE_SCORE_PROTECTED"
            : null;
    const rowData: MomentumScannerRow["data"] = {
      sampleCount: card.sampleCount,
      validTradeSampleCount: card.validMetricSampleCount,
      realTradeEventCount: card.realTradeEventCount,
      launchTradeSampleCount: card.launchTradeSampleCount,
      discoveryOnly: !hasTradeSamples,
      hasDerivativeSamples,
      lastTradeAt: card.latestTradeAt,
      trackingState: card.meteredLaunchDataState,
      isProtected,
      protectedReason,
      trackingExpiresAt: null,
      reasonCodes: uniqueReasonCodes([
        ...(hasTradeSamples ? ["TRADE_SAMPLES_AVAILABLE"] : ["DISCOVERY_ONLY"]),
        ...(hasDerivativeSamples
          ? ["DERIVATIVE_SAMPLES_AVAILABLE"]
          : derivativeReasonCodes),
        ...(isProtected ? ["ROLLING_SLOT_PROTECTED"] : [])
      ])
    };
    const rowStrategy: MomentumScannerRow["strategy"] = {
      launchScore: card.launchScore,
      derivativeScore: rowDerivativeScore.totalScore,
      signalLabel: rowDerivativeScore.strengthLabel,
      signalStrength:
        rowDerivativeStrength.combinedDerivativeScore.totalScore >= 80
          ? "explosive"
          : rowDerivativeStrength.combinedDerivativeScore.totalScore >= 65
            ? "strong"
            : rowDerivativeStrength.combinedDerivativeScore.totalScore >= 45
              ? "moderate"
              : rowDerivativeStrength.combinedDerivativeScore.totalScore > 0
                ? "weak"
                : "none",
      buyReadyPaper: card.launchBuyReadyPaper || card.buyReady,
      action: card.action,
      topDriver:
        card.launchDrivers[0] ??
        card.strategy.positiveDrivers[0]?.label ??
        null,
      topBlocker:
        card.launchBlockers[0] ?? card.strategy.blockers[0]?.label ?? null,
      reasonCodes: uniqueReasonCodes([
        ...rowDerivativeScore.reasonCodes,
        ...card.launchReasonCodes,
        ...card.combinedReasonCodes,
        "PAPER_ONLY"
      ])
    };
    const reasonCodes = uniqueReasonCodes([
      ...card.combinedReasonCodes,
      ...card.dataCompleteness.reasonCodes,
      ...card.tradeTrackingReasonCodes,
      ...card.launchReasonCodes,
      ...card.launchMissingDataReasons,
      ...card.curve.curveReasonCodes,
      ...card.dataSourceWarnings,
      ...Object.values(missingFieldReasons).flat(),
      ...marketUnavailable,
      ...holderUnavailable,
      ...derivativeReasonSet,
      "SOCIAL_SIGNAL_PROVIDER_NOT_CONFIGURED",
      "NO_TRADING_CONTROLS",
      "PAPER_ONLY"
    ]);

    return sanitizeMomentumRow({
      mint: card.mint,
      shortMint: card.shortMint,
      title: card.title,
      displayName: card.displayName,
      name: card.name,
      symbol: card.symbol,
      imageUri: card.imageUri,
      identitySource: card.identitySource,
      identityConfidence: card.identityConfidence,
      ageSeconds:
        finiteOrNull(card.launchAgeSeconds) ?? finiteOrNull(card.ageSeconds),
      launchedAt: card.firstSeenAt,
      latestEventAt: card.latestEventAt,
      eventType: card.eventTypes.at(-1) ?? null,
      eventTypes: card.eventTypes,
      latestEventType: card.latestEventType,
      launchPhase: card.launchPhase,
      launchScore: card.launchScore,
      launchScoreLabel: card.launchScoreLabel,
      signalAction: card.action,
      signalStrength: card.signalStrength,
      buyReadyPaper: card.launchBuyReadyPaper || card.buyReady,
      trackingState: card.meteredLaunchDataState,
      priceSol: displayPriceSol,
      priceUsd: finiteOrNull(card.priceUsd),
      marketCapUsd: finiteOrNull(card.marketCapUsd),
      marketCapSol: displayMarketCapSol,
      fdvUsd: finiteOrNull(card.fdvUsd),
      liquidityUsd: finiteOrNull(card.liquidityUsd),
      curve: card.curve,
      vSolInBondingCurve: finiteOrNull(card.vSolInBondingCurve),
      vTokensInBondingCurve: finiteOrNull(card.vTokensInBondingCurve),
      bondingCurveKey: card.bondingCurveKey,
      associatedBondingCurve: card.associatedBondingCurve,
      virtualSolReserves: finiteOrNull(card.virtualSolReserves),
      virtualTokenReserves: finiteOrNull(card.virtualTokenReserves),
      realSolReserves: finiteOrNull(card.realSolReserves),
      realTokenReserves: finiteOrNull(card.realTokenReserves),
      poolAddress: card.poolAddress,
      raydiumPool: card.raydiumPool,
      priceSource:
        displayPriceSol !== null || card.priceUsd !== null
          ? card.priceActionSource
          : null,
      marketDataSource: card.enrichmentSource,
      marketDataFreshnessMs:
        card.marketCapUsd !== null ||
        card.fdvUsd !== null ||
        card.liquidityUsd !== null
          ? card.dataFreshnessMs
          : null,
      volume5sSol,
      volume10sSol,
      volume30sSol,
      volume60sSol: hasTradeSamples
        ? (finiteOrNull(card.volume60sSol) ??
          finiteOrNull(card.launchWindows?.["60s"].volumeSol))
        : null,
      volume5sUsd: finiteOrNull(card.volume5sUsd),
      volume10sUsd: finiteOrNull(card.volume10sUsd),
      volume30sUsd: finiteOrNull(card.volume30sUsd),
      volume60sUsd: finiteOrNull(card.volume60sUsd),
      buyVolume10sSol:
        finiteOrNull(flow10s?.buyVolumeSol) ??
        (card.volume10sSol !== null ? finiteOrNull(card.buyVolume10s) : null),
      sellVolume10sSol:
        finiteOrNull(flow10s?.sellVolumeSol) ??
        (card.volume10sSol !== null ? finiteOrNull(card.sellVolume10s) : null),
      netVolume10sSol:
        finiteOrNull(flow10s?.netVolumeSol) ??
        (card.volume10sSol !== null ? finiteOrNull(card.netVolume10s) : null),
      tradeCount5s: finiteOrNull(flow5s?.tradeCount),
      tradeCount10s:
        finiteOrNull(card.totalTradeCount10s) ??
        finiteOrNull(flow10s?.tradeCount),
      tradeCount30s: finiteOrNull(flow30s?.tradeCount),
      buyCount10s:
        finiteOrNull(card.buyTradeCount10s) ??
        finiteOrNull(card.launchBuyCount10s),
      sellCount10s:
        finiteOrNull(card.sellTradeCount10s) ??
        finiteOrNull(card.launchSellCount10s),
      uniqueBuyers10s:
        finiteOrNull(card.uniqueBuyers10s) ??
        finiteOrNull(card.launchUniqueBuyers10s),
      uniqueSellers10s:
        finiteOrNull(card.uniqueSellers10s) ??
        finiteOrNull(card.launchUniqueSellers10s),
      buySellRatio: finiteOrNull(card.buySellRatio ?? flow10s?.buySellRatio),
      netBuyPressure:
        finiteOrNull(card.netBuyPressure) ??
        finiteOrNull(card.launchNetBuyPressure10s),
      latestTradeAt: card.latestTradeAt,
      realTradeEventCount: card.realTradeEventCount,
      ...derivatives,
      holderVelocityPerSec: null,
      holderAccelerationPerSec2: null,
      derivatives: rowDerivatives,
      derivativeStrength: rowDerivativeStrength,
      strategy: rowStrategy,
      data: rowData,
      riskLevel: card.riskLevel,
      riskScore: finiteOrNull(card.riskScore),
      hardReject: card.hardReject,
      topHolderPct: finiteOrNull(card.topHolderPct),
      top10HolderPct: finiteOrNull(card.top10HolderPct),
      holderCount: finiteOrNull(card.holderCount),
      mintAuthorityActive: card.mintAuthorityActive,
      freezeAuthorityActive: card.freezeAuthorityActive,
      riskReasonCodes: card.riskReasonCodes,
      topRiskWarnings: card.topRiskWarnings,
      hasPaperPosition: card.paperPositionSummary.hasPosition,
      paperPositionStatus: card.paperPositionSummary.status,
      entryPriceSol: finiteOrNull(card.paperPositionSummary.entryPriceSol),
      currentPriceSol: finiteOrNull(card.paperPositionSummary.currentPriceSol),
      unrealizedPnlPct: finiteOrNull(
        card.paperPositionSummary.unrealizedPnlPct
      ),
      unrealizedPnlSol: finiteOrNull(
        card.paperPositionSummary.unrealizedPnlSol
      ),
      realizedPnlSol: finiteOrNull(card.paperPositionSummary.realizedPnlSol),
      latestPaperExitSignal: card.paperPositionSummary.latestPaperExitSignal,
      hasMetadata: Boolean(card.metadataUri || card.imageUri),
      hasSocialLinks: card.missingFields.includes("socials") === false,
      migrationStatus: card.migrationStatus,
      migratedAt: card.migratedAt,
      migrationSource: card.migrationSource,
      migrationPool: card.migrationPool,
      adaptiveTrackingReasonCodes: card.adaptiveTrackingReasonCodes,
      sparkline: card.sparkline,
      signalDisplay: createMomentumSignalDisplay(card, {
        hasValidTradeSamples:
          card.realTradeEventCount >= 3 || card.launchTradeSampleCount >= 3
      }),
      realData: card.realData,
      source: card.source,
      dataQualityLabel: qualityLabel,
      dataQuality: createMomentumRowDataQuality({
        card,
        missingCriticalFields: card.missingCriticalFields,
        missingFieldReasons,
        rowPriceSol: displayPriceSol
      }),
      missingCriticalFields: card.missingCriticalFields,
      unavailableFields,
      staleFields,
      missingFieldReasons,
      fieldDiagnosticsSummary: summarizeMomentumFields({
        missingCriticalFields: card.missingCriticalFields,
        staleFields,
        unavailableFields
      }),
      reasonCodes,
      lastUpdatedAt: card.lastUpdatedAt,
      strategyName: card.strategyName,
      scoreComponents: card.launchScoreComponents ?? {
        earlyVolumeScore: null,
        volumeAccelerationScore: null,
        priceActionScore: null,
        buyerGrowthScore: null,
        buyPressureScore: null,
        riskPenalty: card.strategy.components.riskPenalty,
        missingDataPenalty: card.strategy.components.missingDataPenalty
      },
      positiveDrivers: [
        ...card.launchDrivers,
        ...card.strategy.positiveDrivers.map((driver) => driver.label)
      ],
      negativeDrivers: card.strategy.negativeDrivers.map(
        (driver) => driver.label
      ),
      blockers: uniqueReasonCodes([
        ...card.launchBlockers,
        ...card.strategy.blockers.map((driver) => driver.label)
      ])
    });
  }

  function buildMomentumDiagnostics(
    rows: MomentumScannerRow[]
  ): MomentumDiagnostics {
    const feedStatus = getFeedStatus();
    const actualStatus = actualData.getStatus();
    const enrichmentStatus = getLiveCardEnrichmentStatus();
    const chainVerifierStatus = chainVerifier.getStatus();
    const indexerStatus = indexerAdapter.getStatus();
    const chainVerifierReasonCodes = uniqueReasonCodes([
      chainVerifierStatus.enabled
        ? "CHAIN_VERIFIER_ENABLED"
        : "CHAIN_VERIFIER_DISABLED",
      chainVerifierStatus.configured
        ? "SOLANA_RPC_VERIFIER_CONFIGURED"
        : "SOLANA_RPC_VERIFIER_UNCONFIGURED",
      `CHAIN_VERIFIER_${chainVerifierStatus.status.toUpperCase()}`
    ]);
    const unavailableFieldCounts = countRowFields(
      rows.flatMap((row) => row.unavailableFields)
    );
    const missingCriticalFieldCounts = countRowFields(
      rows.flatMap((row) => row.missingCriticalFields)
    );
    const reasonCodes = uniqueReasonCodes([
      "MOMENTUM_DIAGNOSTICS_READY",
      ...(rows.length === 0 ? ["NO_LIVE_TOKENS"] : []),
      ...(Object.keys(unavailableFieldCounts).length > 0
        ? ["SCANNER_FIELDS_UNAVAILABLE"]
        : []),
      ...(Object.keys(missingCriticalFieldCounts).length > 0
        ? ["SCANNER_CRITICAL_FIELDS_MISSING"]
        : [])
    ]);
    const trackedRows = rows.filter((row) => row.trackingState === "tracking");
    const derivativeUnavailableReasons = countRowFields(
      rows.flatMap((row) =>
        row.derivatives.reasonCodes.filter(
          (code) =>
            code.includes("UNAVAILABLE") ||
            code.includes("INSUFFICIENT") ||
            code.includes("DISCOVERY_ONLY")
        )
      )
    );
    const averageValidSamplesPerTrackedMint =
      trackedRows.length === 0
        ? 0
        : roundScore(
            trackedRows.reduce(
              (sum, row) =>
                sum +
                Math.max(
                  row.data.validTradeSampleCount,
                  row.data.launchTradeSampleCount
                ),
              0
            ) / trackedRows.length
          );

    return {
      liveTokenCount: liveTokens.getLiveTokens().length,
      rowsReturned: rows.length,
      tokensWithPrice: rows.filter(
        (row) => row.priceSol !== null || row.priceUsd !== null
      ).length,
      tokensWithVolume: rows.filter(
        (row) => row.volume10sSol !== null || row.volume10sUsd !== null
      ).length,
      tokensWithMarketCap: rows.filter(
        (row) => row.marketCapUsd !== null || row.marketCapSol !== null
      ).length,
      tokensWithLiquidity: rows.filter(
        (row) =>
          row.liquidityUsd !== null || row.curve.curveLiquiditySol !== null
      ).length,
      tokensWithTradeData: rows.filter((row) => row.realTradeEventCount > 0)
        .length,
      tokensWithDerivatives: rows.filter(
        (row) =>
          row.volumeVelocitySolPerSec !== null ||
          row.priceVelocityPctPerSec !== null ||
          row.buyerVelocityPerSec !== null
      ).length,
      tokensWithEnoughSamplesForDerivatives: rows.filter(
        (row) => row.data.hasDerivativeSamples
      ).length,
      tokensWithPositiveVolumeVelocity: rows.filter(
        (row) => (row.derivatives.dVol10sSolPerSec ?? 0) > 0
      ).length,
      tokensWithPositiveVolumeAcceleration: rows.filter(
        (row) => (row.derivatives.d2VolSolPerSec2 ?? 0) > 0
      ).length,
      tokensWithPositivePriceVelocity: rows.filter(
        (row) => (row.derivatives.dPricePctPerSec ?? 0) > 0
      ).length,
      tokensWithPositivePriceAcceleration: rows.filter(
        (row) => (row.derivatives.d2PricePctPerSec2 ?? 0) > 0
      ).length,
      tokensWithPositiveBuyerVelocity: rows.filter(
        (row) => (row.derivatives.dBuyersPerSec ?? 0) > 0
      ).length,
      tokensWithPositiveBuyerAcceleration: rows.filter(
        (row) => (row.derivatives.d2BuyersPerSec2 ?? 0) > 0
      ).length,
      tokensWithExplosiveDerivativeStrength: rows.filter((row) =>
        [
          row.derivativeStrength.volume,
          row.derivativeStrength.volumeAcceleration,
          row.derivativeStrength.price,
          row.derivativeStrength.priceAcceleration,
          row.derivativeStrength.buyers,
          row.derivativeStrength.buyerAcceleration,
          row.derivativeStrength.trades,
          row.derivativeStrength.buyPressure
        ].some((strength) => strength.strength === "explosive")
      ).length,
      derivativeUnavailableReasons,
      averageValidSamplesPerTrackedMint,
      trackedCoverage: {
        trackedMintCount: meteredLaunchData.getStatus().trackedMintCount,
        rowsTracked: trackedRows.length,
        rowsWithTrades: trackedRows.filter((row) => row.realTradeEventCount > 0)
          .length,
        rowsWithDerivatives: trackedRows.filter(
          (row) =>
            row.derivatives.dVol10sSolPerSec !== null ||
            row.derivatives.dPricePctPerSec !== null ||
            row.derivatives.dBuyersPerSec !== null
        ).length
      },
      tokensWithRiskData: rows.filter((row) => row.riskScore !== null).length,
      tokensWithHolderData: rows.filter((row) => row.holderCount !== null)
        .length,
      tokensWithPaperPosition: rows.filter((row) => row.hasPaperPosition)
        .length,
      rowsWithCurvePrice: rows.filter((row) => row.curve.curvePriceSol !== null)
        .length,
      rowsWithTradePrice: rows.filter(
        (row) => row.priceSource === "PumpPortal subscribeTokenTrade"
      ).length,
      rowsWithCurveLiquidity: rows.filter(
        (row) => row.curve.curveLiquiditySol !== null
      ).length,
      rowsWithDexLiquidity: rows.filter((row) => row.liquidityUsd !== null)
        .length,
      rowsWithMarketCapSol: rows.filter((row) => row.marketCapSol !== null)
        .length,
      rowsWithMarketCapUsd: rows.filter((row) => row.marketCapUsd !== null)
        .length,
      rowsWithRealTradeVolume: rows.filter(
        (row) => row.volume10sSol !== null || row.volume10sUsd !== null
      ).length,
      rowsWithDerivedCurveData: rows.filter((row) =>
        row.curve.curveReasonCodes.some((code) => code.includes("DERIVED"))
      ).length,
      unavailableFieldCounts,
      missingCriticalFieldCounts,
      topMissingReasons: getTopMissingReasons(
        rows.flatMap((row) => Object.values(row.missingFieldReasons).flat())
      ),
      topUnavailableReasons: getTopMissingReasons(
        rows.flatMap((row) => row.unavailableFields)
      ),
      dataSources: {
        pumpportalLiveDiscovery: {
          enabled: feedStatus.enabled,
          connected: feedStatus.connected,
          tokenCount: liveTokens.getLiveTokens().length,
          reasonCodes: feedStatus.reasonCodes
        },
        pumpportalTokenTrades: {
          enabled: actualStatus.enabled,
          acknowledged: actualStatus.acknowledgedMetered,
          subscribedTokenCount: actualStatus.subscribedTokenCount,
          eventCount: actualStatus.totalEventsThisSession,
          reasonCodes: actualStatus.reasonCodes
        },
        dexScreener: {
          enabled: enrichmentStatus.dexScreenerEnabled,
          cachedMintCount: enrichmentStatus.cachedMintCount,
          reasonCodes: enrichmentStatus.reasonCodes
        },
        jupiter: {
          enabled: enrichmentStatus.jupiterPriceEnabled,
          cachedMintCount: enrichmentStatus.cachedMintCount,
          reasonCodes: enrichmentStatus.reasonCodes
        },
        solanaRpcVerifier: {
          enabled: chainVerifierStatus.enabled,
          configured: chainVerifierStatus.configured,
          reasonCodes: chainVerifierReasonCodes
        },
        indexer: {
          enabled: indexerStatus.enabled,
          liveStateTokenCount: indexerStatus.liveState.tokenCount,
          reasonCodes: indexerStatus.reasonCodes
        }
      },
      reasonCodes,
      recommendedNextActions: getMomentumRecommendedActions({
        actualStatus,
        chainVerifierStatus,
        enrichmentStatus,
        missingCriticalFieldCounts,
        rows,
        unavailableFieldCounts
      })
    };
  }

  function buildLiveTokenCards(): LiveTokenCardViewModel[] {
    const nowMs = Date.now();
    const feedStatus = getFeedStatus();
    const liveEvents = liveTokens.getLiveFeedEvents(1000);
    const liveTradeTrackingStatus = getLiveTradeTrackingStatus();
    const launchStatus = launchScanner.getStatus();
    const meteredLaunchDataStatus = meteredLaunchData.getStatus();

    return liveTokens.getLiveTokens().map((token) => {
      const candidate = candidateEngine.getCandidate(token.mint);
      const identity =
        candidate?.identity ?? getTokenIdentitySummary(token.mint);
      const metrics =
        metricsEngine.getMetrics(token.mint) ?? candidate?.latestMetrics;
      const canonicalDerivatives = indexerAdapter.getDerivatives(token.mint);
      const canonicalDerivativeWindow = canonicalDerivatives.primary;
      const canonicalDerivativeMetrics = canonicalDerivativeWindow.metrics;
      const hasCanonicalDerivativeObservations =
        canonicalDerivatives.observationCount > 0;
      const riskSnapshot =
        riskSnapshots.get(token.mint) ?? candidate?.latestRisk;
      const decision = candidate?.latestDecision;
      const score = candidate?.latestScore;
      const actualDataSummary = actualData.getCandidateSummary(token.mint);
      const tradeTracking = getLiveTradeTrackingForMint(token.mint);
      const launchCandidate = launchScanner.getCandidate(token.mint);
      const meteredTracking = meteredLaunchData.getTrackedMint(token.mint);
      const launchSnapshot = launchCandidate?.snapshot;
      const enrichment = liveCardEnrichments.get(token.mint);
      const marketObservations = chainEvents.getMarketObservationsByMint(
        token.mint,
        1000
      );
      const tokenEvents = liveEvents.filter(
        (event) => event.mint === token.mint
      );
      const tokenCreatedEvents = tokenEvents.filter(
        (event) => event.payload.type === "token_created"
      );
      const eventImageUri =
        tokenCreatedEvents
          .map((event) =>
            event.payload.type === "token_created"
              ? (event.payload.candidate.imageUri ?? null)
              : null
          )
          .find((value): value is string => Boolean(value)) ?? null;
      const eventMetadataUri =
        tokenCreatedEvents
          .map((event) =>
            event.payload.type === "token_created"
              ? (event.payload.candidate.metadataUri ?? null)
              : null
          )
          .find((value): value is string => Boolean(value)) ?? null;
      const marketHints = getLiveTokenMarketHints(tokenEvents);
      const curve = buildMomentumCurveData(marketHints);
      const migrationState = getLiveTokenMigrationState({
        eventTypes: token.eventTypes,
        latestEventAt: token.latestEventAt,
        source: token.source,
        tokenEvents
      });
      const metricsAvailable = Boolean(metrics && metrics.sampleCount > 0);
      const window1s = metrics?.windows["1s"];
      const window3s = metrics?.windows["3s"];
      const window5s = metrics?.windows["5s"];
      const window10s = metrics?.windows["10s"];
      const window30s = metrics?.windows["30s"];
      const window60s = metrics?.windows["60s"];
      const latestEventMs = Date.parse(token.latestEventAt);
      const dataFreshnessMs = Number.isFinite(latestEventMs)
        ? Math.max(0, nowMs - latestEventMs)
        : null;
      const unavailableFields = getUnavailableCardFields({
        metrics,
        metricsAvailable,
        riskSnapshot
      });
      const missingFields = getMissingCardFields({ identity, token });
      const latestPriceSol =
        positiveOrNull(metrics?.latestPriceSol) ??
        positiveOrNull(actualDataSummary?.latestPriceSol) ??
        positiveOrNull(
          marketObservations.find(
            (observation) => positiveOrNull(observation.priceSol) !== null
          )?.priceSol
        ) ??
        positiveOrNull(curve.curvePriceSol);
      const latestPriceUsd =
        positiveOrNull(metrics?.latestPriceUsd) ??
        positiveOrNull(enrichment?.priceUsd);
      const marketCapUsd =
        riskSnapshot?.flags.marketCapUsd ??
        positiveOrNull(enrichment?.marketCapUsd);
      const fdvUsd =
        riskSnapshot?.flags.fdvUsd ?? positiveOrNull(enrichment?.fdvUsd);
      const liquidityUsd =
        riskSnapshot?.flags.liquidityUsd ??
        positiveOrNull(enrichment?.liquidityUsd);
      const holderCount = riskSnapshot?.flags.holderCount ?? null;
      const topHolderPct =
        riskSnapshot?.flags.topHolderPct ??
        candidate?.onChainTopHolderPct ??
        null;
      const top10HolderPct =
        riskSnapshot?.flags.top10HolderPct ??
        candidate?.onChainTop10HolderPct ??
        null;
      const mintAuthorityActive =
        riskSnapshot?.flags.mintAuthorityActive ??
        candidate?.onChainMintAuthorityActive ??
        null;
      const freezeAuthorityActive =
        riskSnapshot?.flags.freezeAuthorityActive ??
        candidate?.onChainFreezeAuthorityActive ??
        null;
      const chainVerificationStatus =
        candidate?.chainVerificationStatus ??
        (getLatestChainVerification(token.mint)
          ? "verified"
          : ("not_checked" as const));
      const enrichmentStatus: LiveCardEnrichmentStatusValue =
        liveCardEnrichment.enabled
          ? (enrichment?.status ?? "not_checked")
          : "disabled";
      const dataSourceWarnings = uniqueReasonCodes([
        ...(metricsAvailable ? [] : ["DATA_UNAVAILABLE"]),
        "HOLDER_TIME_SERIES_UNAVAILABLE",
        ...(liveTradeTrackingStatus.enabled
          ? []
          : ["LIVE_TRADE_TRACKING_DISABLED"]),
        ...(liveTradeTrackingStatus.acknowledgedMetered
          ? []
          : ["LIVE_TRADE_TRACKING_METERED_NOT_ACKNOWLEDGED"]),
        ...(actualDataSummary?.eventCount
          ? []
          : ["ACTUAL_TRADE_DATA_UNAVAILABLE"]),
        ...(enrichmentStatus === "disabled"
          ? ["LIVE_CARD_ENRICHMENT_DISABLED"]
          : []),
        ...(feedStatus.realData ? [] : ["REAL_FEED_UNAVAILABLE"]),
        ...unavailableFields.map(
          (field) => `${field.toUpperCase()}_UNAVAILABLE`
        )
      ]);
      const calculationReasonCodes = uniqueReasonCodes([
        ...((metrics?.insufficientMetrics ?? true)
          ? ["INSUFFICIENT_TRADE_METRICS"]
          : []),
        ...(metrics?.usedSolMetricsFallback
          ? ["SCORE_USED_SOL_METRICS_FALLBACK"]
          : []),
        ...(hasCanonicalDerivativeObservations
          ? [
              ...canonicalDerivatives.reasonCodes,
              ...canonicalDerivativeWindow.reasonCodes
            ]
          : []),
        "HOLDER_TIME_SERIES_UNAVAILABLE",
        ...dataSourceWarnings
      ]);
      const action = decision?.action ?? token.action ?? "IGNORE";
      const lifecycleState =
        decision?.lifecycleState ?? candidate?.lifecycleState ?? "new";
      const cardScore = decision?.score ?? score?.total ?? token.score ?? 0;
      const hardReject =
        decision?.hardReject ?? riskSnapshot?.hardReject ?? false;
      const insufficientMetrics = metrics?.insufficientMetrics ?? true;
      const launchBuyReadyPaper =
        launchSnapshot !== undefined &&
        launchSnapshot.score >= launchStatus.minScoreToRip &&
        (launchSnapshot.phase === "hot" ||
          launchSnapshot.phase === "ripping") &&
        launchSnapshot.tradeSampleCount >= 3 &&
        !hardReject &&
        !launchSnapshot.blockers.includes("HARD_REJECT");
      const launchMissingDataReasons = launchSnapshot?.blockers.filter(
        (blocker) => blocker.includes("DATA") || blocker.includes("TRADE")
      ) ?? ["PUMPPORTAL_LAUNCH_SCANNER_UNAVAILABLE"];
      const meteredLaunchDataState =
        meteredTracking?.status === "tracking"
          ? "tracking"
          : meteredLaunchDataStatus.budgetReached
            ? "budget_reached"
            : meteredTracking?.status === "unsubscribed"
              ? "unsubscribed"
              : meteredLaunchDataStatus.ready
                ? "not_tracked"
                : "blocked";
      const paperPositionSummary = paperPortfolio.getPositionSummaryForMint(
        token.mint
      );
      const exitSignalSummary = watchedWalletExit.getSignalSummaryForMint(
        token.mint
      );
      const realTradeEventCount =
        meteredTracking?.eventCount ?? actualDataSummary?.eventCount ?? 0;
      const realPriceActionReady =
        realTradeEventCount > 0 &&
        (positiveOrNull(meteredTracking?.latestPriceSol) ??
          positiveOrNull(actualDataSummary?.latestPriceSol) ??
          positiveOrNull(launchSnapshot?.priceSol)) !== null;
      const realTimeSeriesReady =
        realTradeEventCount >= 3 ||
        (launchSnapshot?.tradeSampleCount ?? 0) >= 3;
      const missingDataReason =
        realTimeSeriesReady && realPriceActionReady
          ? null
          : ([
              ...(meteredTracking?.reasonCodes ?? []),
              ...meteredLaunchDataStatus.reasonCodes,
              ...launchMissingDataReasons
            ].find(
              (code) =>
                code.includes("ACK") ||
                code.includes("WALLET") ||
                code.includes("BUDGET") ||
                code.includes("DATA") ||
                code.includes("TRADE")
            ) ?? "DISCOVERY_ONLY");
      const priceActionSource =
        realTradeEventCount > 0 ||
        positiveOrNull(metrics?.latestPriceSol) !== null
          ? "PumpPortal subscribeTokenTrade"
          : positiveOrNull(
                marketObservations.find(
                  (observation) => positiveOrNull(observation.priceSol) !== null
                )?.priceSol
              ) !== null
            ? "market_observation"
            : curve.curvePriceSol !== null
              ? "curve_marks"
              : "unavailable";
      const signalStrength = getSignalStrength({
        action,
        hardReject,
        riskLevel: riskSnapshot?.riskLevel,
        score: cardScore
      });
      const topRiskWarnings = getTopRiskWarnings(riskSnapshot);
      const rejectReason = hardReject
        ? (topRiskWarnings[0] ?? riskSnapshot?.reasonCodes[0] ?? "HARD_REJECT")
        : insufficientMetrics
          ? "INSUFFICIENT_TRADE_METRICS"
          : null;
      const holderDataSource = getHolderDataSource(candidate, riskSnapshot);
      const holderDataFreshnessMs = getFreshnessMs(
        riskSnapshot?.updatedAt,
        nowMs
      );
      const dataCompleteness = buildLiveCardDataCompleteness({
        chainVerificationStatus,
        enrichmentStatus,
        hardReject,
        holderCount,
        identity,
        insufficientMetrics,
        freezeAuthorityActive,
        latestPriceSol,
        latestPriceUsd,
        liquidityUsd,
        marketCapUsd,
        missingFields,
        mintAuthorityActive,
        riskSnapshot,
        sampleCount: metrics?.sampleCount ?? 0,
        top10HolderPct,
        topHolderPct,
        tradeEventCount: tradeTracking.tradeEventCount,
        tradeTrackingState: tradeTracking.state,
        unavailableFields,
        volume10sSol: metricsAvailable
          ? numberOrNull(window10s?.totalVolumeSol)
          : null,
        volume10sUsd: metricsAvailable
          ? numberOrNull(window10s?.totalVolumeUsd)
          : null
      });
      const card: LiveTokenCardViewModel = {
        mint: token.mint,
        shortMint: shortMint(token.mint),
        name: identity?.name ?? token.name ?? null,
        symbol: identity?.symbol ?? token.symbol ?? null,
        title:
          identity?.title ??
          token.title ??
          createTokenTitle(token.symbol, token.name, token.mint),
        displayName:
          identity?.displayName ??
          token.displayName ??
          createTokenTitle(token.symbol, token.name, token.mint),
        imageUri: sanitizeScannerImageUri(
          identity?.imageUri ?? candidate?.imageUri ?? eventImageUri ?? null
        ),
        identityConfidence:
          identity?.confidence ?? token.identityConfidence ?? "none",
        identitySource: identity?.dataSource ?? "unknown",
        identityResolved: identity?.resolved ?? false,
        metadataUri:
          identity?.metadataUri ??
          candidate?.metadataUri ??
          eventMetadataUri ??
          null,
        source: token.source,
        sourceMode: token.sourceMode,
        realData: token.realData,
        eventTypes: token.eventTypes,
        latestEventType: token.eventTypes.at(-1) ?? null,
        firstSeenAt: token.firstSeenAt,
        lastSeenAt: token.lastSeenAt,
        ageSeconds: getAgeSeconds(token.firstSeenAt, nowMs),
        latestEventAt: token.latestEventAt,
        latestSignature: token.latestSignature ?? null,
        liveSessionOnly: true,
        stale: dataFreshnessMs !== null && dataFreshnessMs > 30_000,
        dataFreshnessMs,
        priceSol: latestPriceSol,
        priceUsd: latestPriceUsd,
        priceQuote: null,
        quoteAsset:
          (candidate?.latestMarketObservationSummary?.quoteAsset as
            QuoteAsset | undefined) ?? null,
        marketCapUsd,
        marketCapSol: marketHints.marketCapSol,
        fdvUsd,
        liquidityUsd,
        curve,
        vSolInBondingCurve: marketHints.vSolInBondingCurve,
        vTokensInBondingCurve: marketHints.vTokensInBondingCurve,
        bondingCurveKey: marketHints.bondingCurveKey,
        associatedBondingCurve: marketHints.associatedBondingCurve,
        virtualSolReserves: marketHints.virtualSolReserves,
        virtualTokenReserves: marketHints.virtualTokenReserves,
        realSolReserves: marketHints.realSolReserves,
        realTokenReserves: marketHints.realTokenReserves,
        poolAddress: marketHints.poolAddress,
        raydiumPool: marketHints.raydiumPool,
        volume1sUsd: metricsAvailable
          ? numberOrNull(window1s?.totalVolumeUsd)
          : null,
        volume3sUsd: metricsAvailable
          ? numberOrNull(window3s?.totalVolumeUsd)
          : null,
        volume5sUsd: metricsAvailable
          ? numberOrNull(window5s?.totalVolumeUsd)
          : null,
        volume10sUsd: metricsAvailable
          ? numberOrNull(window10s?.totalVolumeUsd)
          : null,
        volume30sUsd: metricsAvailable
          ? numberOrNull(window30s?.totalVolumeUsd)
          : null,
        volume60sUsd: metricsAvailable
          ? numberOrNull(window60s?.totalVolumeUsd)
          : null,
        volume1sSol: metricsAvailable
          ? numberOrNull(window1s?.totalVolumeSol)
          : null,
        volume3sSol: metricsAvailable
          ? numberOrNull(window3s?.totalVolumeSol)
          : null,
        volume5sSol: metricsAvailable
          ? numberOrNull(window5s?.totalVolumeSol)
          : null,
        volume10sSol: metricsAvailable
          ? numberOrNull(window10s?.totalVolumeSol)
          : null,
        volume30sSol: metricsAvailable
          ? numberOrNull(window30s?.totalVolumeSol)
          : null,
        volume60sSol: metricsAvailable
          ? numberOrNull(window60s?.totalVolumeSol)
          : null,
        buyVolume10s: metricsAvailable
          ? numberOrNull(
              metrics?.usedSolMetricsFallback
                ? window10s?.buyVolumeSol
                : window10s?.buyVolumeUsd
            )
          : null,
        sellVolume10s: metricsAvailable
          ? numberOrNull(
              metrics?.usedSolMetricsFallback
                ? window10s?.sellVolumeSol
                : window10s?.sellVolumeUsd
            )
          : null,
        netVolume10s: metricsAvailable
          ? numberOrNull(
              metrics?.usedSolMetricsFallback
                ? window10s?.netVolumeSol
                : window10s?.netVolumeUsd
            )
          : null,
        buySellRatio: metricsAvailable
          ? numberOrNull(metrics?.buySellRatio)
          : null,
        netBuyPressure: metricsAvailable
          ? numberOrNull(metrics?.netBuyPressure)
          : null,
        uniqueBuyers1s: metricsAvailable
          ? numberOrNull(window1s?.uniqueBuyers)
          : null,
        uniqueBuyers5s: metricsAvailable
          ? numberOrNull(window5s?.uniqueBuyers)
          : null,
        uniqueBuyers10s: metricsAvailable
          ? numberOrNull(window10s?.uniqueBuyers)
          : null,
        uniqueSellers10s: metricsAvailable
          ? numberOrNull(window10s?.uniqueSellers)
          : null,
        uniqueTraders10s: metricsAvailable
          ? numberOrNull(window10s?.uniqueTraders)
          : null,
        buyTradeCount10s: metricsAvailable
          ? numberOrNull(window10s?.buyTradeCount)
          : null,
        sellTradeCount10s: metricsAvailable
          ? numberOrNull(window10s?.sellTradeCount)
          : null,
        totalTradeCount10s: metricsAvailable
          ? numberOrNull(window10s?.totalTradeCount)
          : null,
        holders: holderCount,
        holderCount,
        topHolderPct,
        top10HolderPct,
        devHolderPct: riskSnapshot?.flags.devHolderPct ?? null,
        holderDataSource,
        holderDataFreshnessMs,
        volumeVelocityUsdPerSec: hasCanonicalDerivativeObservations
          ? canonicalDerivativeMetrics.volumeVelocityUsdPerSec.value
          : metricsAvailable
            ? numberOrNull(metrics?.volumeVelocityUsdPerSec)
            : null,
        volumeAccelerationUsdPerSec2: hasCanonicalDerivativeObservations
          ? canonicalDerivativeMetrics.volumeAccelerationUsdPerSec2.value
          : metricsAvailable
            ? numberOrNull(metrics?.volumeAccelerationUsdPerSec2)
            : null,
        volumeVelocitySolPerSec: hasCanonicalDerivativeObservations
          ? canonicalDerivativeMetrics.volumeVelocitySolPerSec.value
          : metricsAvailable
            ? numberOrNull(metrics?.volumeVelocitySolPerSec)
            : null,
        volumeAccelerationSolPerSec2: hasCanonicalDerivativeObservations
          ? canonicalDerivativeMetrics.volumeAccelerationSolPerSec2.value
          : metricsAvailable
            ? numberOrNull(metrics?.volumeAccelerationSolPerSec2)
            : null,
        priceVelocityPctPerSec:
          hasCanonicalDerivativeObservations &&
          canonicalDerivativeWindow.priceSource === "USD"
            ? canonicalDerivativeMetrics.priceVelocityPctPerSec.value
            : hasCanonicalDerivativeObservations
              ? null
              : metricsAvailable
                ? numberOrNull(metrics?.priceVelocityPctPerSec)
                : null,
        priceAccelerationPctPerSec2:
          hasCanonicalDerivativeObservations &&
          canonicalDerivativeWindow.priceSource === "USD"
            ? canonicalDerivativeMetrics.priceAccelerationPctPerSec2.value
            : hasCanonicalDerivativeObservations
              ? null
              : metricsAvailable
                ? numberOrNull(metrics?.priceAccelerationPctPerSec2)
                : null,
        priceSolVelocityPctPerSec:
          hasCanonicalDerivativeObservations &&
          canonicalDerivativeWindow.priceSource === "SOL"
            ? canonicalDerivativeMetrics.priceVelocityPctPerSec.value
            : hasCanonicalDerivativeObservations
              ? null
              : metricsAvailable
                ? numberOrNull(metrics?.priceSolVelocityPctPerSec)
                : null,
        priceSolAccelerationPctPerSec2:
          hasCanonicalDerivativeObservations &&
          canonicalDerivativeWindow.priceSource === "SOL"
            ? canonicalDerivativeMetrics.priceAccelerationPctPerSec2.value
            : hasCanonicalDerivativeObservations
              ? null
              : metricsAvailable
                ? numberOrNull(metrics?.priceSolAccelerationPctPerSec2)
                : null,
        buyerVelocityPerSec: hasCanonicalDerivativeObservations
          ? canonicalDerivativeMetrics.buyerVelocityPerSec.value
          : metricsAvailable
            ? numberOrNull(metrics?.buyerVelocityPerSec)
            : null,
        buyerAccelerationPerSec2: hasCanonicalDerivativeObservations
          ? canonicalDerivativeMetrics.buyerAccelerationPerSec2.value
          : metricsAvailable
            ? numberOrNull(metrics?.buyerAccelerationPerSec2)
            : null,
        holderVelocityPerSec: null,
        holderAccelerationPerSec2: null,
        sampleCount: metrics?.sampleCount ?? 0,
        validMetricSampleCount: metrics?.sampleCount ?? 0,
        insufficientMetrics,
        calculationConfidence: getCalculationConfidence(metrics),
        calculationReasonCodes,
        riskLevel: riskSnapshot?.riskLevel ?? "unknown",
        riskScore: riskSnapshot?.riskScore ?? null,
        hardReject,
        riskReasonCodes: riskSnapshot?.reasonCodes ?? [],
        topRiskWarnings,
        mintAuthorityActive,
        freezeAuthorityActive,
        liquidityRisk: getLiquidityRisk(riskSnapshot),
        concentrationRisk: getConcentrationRisk(riskSnapshot),
        washTradingSuspected: riskSnapshot?.flags.washTradingSuspected ?? null,
        honeypotSuspected: riskSnapshot?.flags.honeypotSuspected ?? null,
        action,
        lifecycleState,
        score: cardScore,
        scoreLabel: `${cardScore}/100`,
        signalStrength,
        combinedReasonCodes: uniqueReasonCodes([
          ...(decision?.combinedReasonCodes ?? token.reasonCodes),
          ...calculationReasonCodes
        ]),
        buyReady:
          action === "PAPER_BUY_READY" &&
          !hardReject &&
          !insufficientMetrics &&
          riskSnapshot?.riskLevel !== "critical",
        rejectReason,
        strategyName: "paper-momentum-risk-v1",
        signalUpdatedAt:
          decision?.updatedAt ?? candidate?.lastUpdatedAt ?? null,
        strategy: buildStrategyExplanation({
          action,
          calculationReasonCodes,
          hardReject,
          metrics,
          riskSnapshot,
          score,
          signalStrength,
          updatedAt: decision?.updatedAt ?? candidate?.lastUpdatedAt ?? null
        }),
        rawEventCount: tokenEvents.length,
        actualTradeEventCount: actualDataSummary?.eventCount ?? 0,
        meteredLaunchDataState,
        priceActionSource,
        realTradeEventCount,
        realPriceActionReady,
        realTimeSeriesReady,
        missingDataReason,
        marketObservationCount: marketObservations.length,
        chainVerificationStatus,
        feedProvider: feed.name,
        dataSourceWarnings,
        dataCompleteness,
        tradeTrackingState: tradeTracking.state,
        tradeTrackingReasonCodes: tradeTracking.reasonCodes,
        latestTradeAt: tradeTracking.latestTradeAt,
        latestTradeAgeSeconds: tradeTracking.latestTradeAgeSeconds,
        tradeEventCount: tradeTracking.tradeEventCount,
        launchAgeSeconds: launchSnapshot?.ageSeconds ?? null,
        launchPhase: launchSnapshot?.phase ?? "discovery_only",
        launchScore: launchSnapshot?.score ?? 0,
        launchScoreLabel: launchSnapshot
          ? `${launchSnapshot.score}/100 ${launchSnapshot.label}`
          : "0/100 none",
        launchBuyReadyPaper,
        launchTradeSampleCount: launchSnapshot?.tradeSampleCount ?? 0,
        launchPriceSol: launchSnapshot?.priceSol ?? null,
        launchWindows: launchSnapshot?.windows ?? null,
        launchDerivatives: launchSnapshot?.derivatives ?? null,
        launchDerivativeStrength: launchSnapshot?.derivativeStrength ?? null,
        launchDerivativeScore: launchSnapshot?.derivativeScore ?? null,
        launchScoreComponents: launchSnapshot?.components ?? null,
        launchTrackingState: launchCandidate?.tracking.state ?? "not_tracked",
        launchVolume5sSol:
          numberOrNull(launchSnapshot?.windows["5s"].volumeSol) ?? null,
        launchVolume10sSol:
          numberOrNull(launchSnapshot?.windows["10s"].volumeSol) ?? null,
        launchVolume30sSol:
          numberOrNull(launchSnapshot?.windows["30s"].volumeSol) ?? null,
        launchVolume2mSol:
          numberOrNull(launchSnapshot?.windows["2m"].volumeSol) ?? null,
        launchVolume5mSol:
          numberOrNull(launchSnapshot?.windows["5m"].volumeSol) ?? null,
        launchBuyCount10s:
          numberOrNull(launchSnapshot?.windows["10s"].buyCount) ?? null,
        launchSellCount10s:
          numberOrNull(launchSnapshot?.windows["10s"].sellCount) ?? null,
        launchUniqueBuyers10s:
          numberOrNull(launchSnapshot?.windows["10s"].uniqueBuyers) ?? null,
        launchUniqueSellers10s:
          numberOrNull(launchSnapshot?.windows["10s"].uniqueSellers) ?? null,
        launchNetBuyPressure10s:
          numberOrNull(launchSnapshot?.windows["10s"].netBuyPressure) ?? null,
        launchPriceChange10sPct:
          numberOrNull(launchSnapshot?.windows["10s"].priceChangePct) ?? null,
        launchVolumeVelocitySolPerSec:
          numberOrNull(launchSnapshot?.derivatives.volumeVelocitySolPerSec) ??
          null,
        launchVolumeAccelerationSolPerSec2:
          numberOrNull(
            launchSnapshot?.derivatives.volumeAccelerationSolPerSec2
          ) ?? null,
        launchPriceVelocityPctPerSec:
          numberOrNull(launchSnapshot?.derivatives.priceVelocityPctPerSec) ??
          null,
        launchPriceAccelerationPctPerSec2:
          numberOrNull(
            launchSnapshot?.derivatives.priceAccelerationPctPerSec2
          ) ?? null,
        launchBuyerVelocityPerSec:
          numberOrNull(launchSnapshot?.derivatives.buyerVelocityPerSec) ?? null,
        launchBuyerAccelerationPerSec2:
          numberOrNull(launchSnapshot?.derivatives.buyerAccelerationPerSec2) ??
          null,
        launchDrivers: launchSnapshot?.drivers ?? [],
        launchBlockers: launchSnapshot?.blockers ?? [],
        launchReasonCodes: uniqueReasonCodes([
          ...(launchCandidate?.reasonCodes ?? []),
          ...(launchSnapshot?.reasonCodes ?? [])
        ]),
        launchMissingDataReasons,
        migrationStatus: migrationState.status,
        migratedAt: migrationState.migratedAt,
        migrationSource: migrationState.source,
        migrationPool: migrationState.pool,
        adaptiveTrackingReasonCodes: getAdaptiveTrackingReasonCodes({
          hasPaperPosition: paperPositionSummary.hasPosition,
          launchPhase: launchSnapshot?.phase ?? "discovery_only",
          migrationStatus: migrationState.status,
          trackingState: meteredLaunchDataState
        }),
        sparkline: buildMomentumSparkline(token.mint, marketHints.curveMarks),
        exitSignalSummary,
        paperPositionSummary,
        dataCompletenessLabel: dataCompleteness.dataQualityLabel,
        missingCriticalFields: dataCompleteness.missingCriticalFields,
        enrichmentStatus,
        enrichmentSource: enrichment?.source ?? null,
        pairAddress: enrichment?.pairAddress ?? null,
        dexId: enrichment?.dexId ?? null,
        missingFields,
        unavailableFields,
        lastUpdatedAt:
          metrics?.lastUpdatedAt ??
          decision?.updatedAt ??
          candidate?.lastUpdatedAt ??
          token.latestEventAt
      };

      return card;
    });
  }

  function buildIndexerBackedLiveTokenCards(): LiveTokenCardViewModel[] {
    const nowMs = Date.now();

    return indexerAdapter.getLiveCards().map((token) => {
      const timeseries = indexerAdapter.getTimeseries(token.mint);
      const window1s = timeseries.windows["1s"];
      const window5s = timeseries.windows["5s"];
      const window10s = timeseries.windows["10s"];
      const window30s = timeseries.windows["30s"];
      const window60s = timeseries.windows["60s"];
      const latestEventMs = Date.parse(token.lastSeenAt);
      const dataFreshnessMs = Number.isFinite(latestEventMs)
        ? Math.max(0, nowMs - latestEventMs)
        : null;
      const dataCompleteness = toLiveCardCompleteness(token);
      const sourceWarnings = uniqueReasonCodes([
        ...token.dataCompleteness.unavailableFields.map(
          (field) => `${field.toUpperCase()}_UNAVAILABLE`
        ),
        "INDEXER_LIVE_STATE_CARD",
        "PAPER_ONLY"
      ]);
      const latestPriceSol = numberOrNull(token.market.priceSol);
      const latestPriceUsd = numberOrNull(token.market.priceUsd);
      const strategy = createIndexerStrategyExplanation(token);
      const curve = emptyMomentumCurveData();

      return {
        mint: token.mint,
        shortMint: token.shortMint,
        name: token.name,
        symbol: token.symbol,
        title: token.title ?? token.displayName,
        displayName: token.displayName,
        imageUri: sanitizeScannerImageUri(token.identity.imageUri),
        identityConfidence: token.name || token.symbol ? "low" : "none",
        identitySource: toTokenIdentityDataSource(token.identity.source),
        identityResolved: Boolean(token.name || token.symbol),
        metadataUri: token.identity.metadataUri,
        source: token.source,
        sourceMode: token.sourceMode,
        realData: token.sourceMode === "real",
        eventTypes: token.eventTypes,
        latestEventType: token.eventTypes.at(-1) ?? null,
        firstSeenAt: token.firstSeenAt,
        lastSeenAt: token.lastSeenAt,
        ageSeconds: token.ageSeconds,
        latestEventAt: token.lastSeenAt,
        latestSignature: token.latestSignature,
        liveSessionOnly: true,
        stale: dataFreshnessMs !== null && dataFreshnessMs > 30_000,
        dataFreshnessMs,
        priceSol: latestPriceSol,
        priceUsd: latestPriceUsd,
        priceQuote: latestPriceSol,
        quoteAsset: latestPriceSol !== null ? "SOL" : null,
        marketCapUsd: token.market.marketCapUsd,
        marketCapSol: null,
        fdvUsd: token.market.fdvUsd,
        liquidityUsd: token.market.liquidityUsd,
        curve,
        vSolInBondingCurve: null,
        vTokensInBondingCurve: null,
        bondingCurveKey: null,
        associatedBondingCurve: null,
        virtualSolReserves: null,
        virtualTokenReserves: null,
        realSolReserves: null,
        realTokenReserves: null,
        poolAddress: null,
        raydiumPool: null,
        volume1sUsd: numberOrNull(token.market.volumeUsd1s),
        volume3sUsd: null,
        volume5sUsd: numberOrNull(token.market.volumeUsd5s),
        volume10sUsd: numberOrNull(token.market.volumeUsd10s),
        volume30sUsd: null,
        volume60sUsd: numberOrNull(token.market.volumeUsd60s),
        volume1sSol: numberOrNull(window1s.volumeSol),
        volume3sSol: null,
        volume5sSol: numberOrNull(window5s.volumeSol),
        volume10sSol: numberOrNull(window10s.volumeSol),
        volume30sSol: numberOrNull(window30s.volumeSol),
        volume60sSol: numberOrNull(window60s.volumeSol),
        buyVolume10s: numberOrNull(window10s.buyVolumeSol),
        sellVolume10s: numberOrNull(window10s.sellVolumeSol),
        netVolume10s: numberOrNull(
          window10s.buyVolumeSol - window10s.sellVolumeSol
        ),
        buySellRatio: token.flow.buySellRatio,
        netBuyPressure: token.flow.netBuyPressure,
        uniqueBuyers1s: numberOrNull(window1s.uniqueBuyers),
        uniqueBuyers5s: numberOrNull(window5s.uniqueBuyers),
        uniqueBuyers10s: numberOrNull(window10s.uniqueBuyers),
        uniqueSellers10s: numberOrNull(window10s.uniqueSellers),
        uniqueTraders10s: numberOrNull(
          window10s.uniqueBuyers + window10s.uniqueSellers
        ),
        buyTradeCount10s: numberOrNull(window10s.buyCount),
        sellTradeCount10s: numberOrNull(window10s.sellCount),
        totalTradeCount10s: numberOrNull(window10s.tradeCount),
        holders: token.holders.holderCount,
        holderCount: token.holders.holderCount,
        topHolderPct: token.holders.topHolderPct,
        top10HolderPct: token.holders.top10HolderPct,
        devHolderPct: null,
        holderDataSource: token.holders.source,
        holderDataFreshnessMs: null,
        volumeVelocityUsdPerSec: null,
        volumeAccelerationUsdPerSec2: null,
        volumeVelocitySolPerSec: numberOrNull(
          timeseries.rollingStats.volumeVelocitySolPerSec
        ),
        volumeAccelerationSolPerSec2: numberOrNull(
          timeseries.rollingStats.volumeAccelerationSolPerSec2
        ),
        priceVelocityPctPerSec:
          timeseries.rollingStats.priceSource === "USD"
            ? numberOrNull(timeseries.rollingStats.priceVelocityPctPerSec)
            : null,
        priceAccelerationPctPerSec2:
          timeseries.rollingStats.priceSource === "USD"
            ? numberOrNull(timeseries.rollingStats.priceAccelerationPctPerSec2)
            : null,
        priceSolVelocityPctPerSec: numberOrNull(
          timeseries.rollingStats.priceSource === "SOL"
            ? timeseries.rollingStats.priceVelocityPctPerSec
            : null
        ),
        priceSolAccelerationPctPerSec2: numberOrNull(
          timeseries.rollingStats.priceSource === "SOL"
            ? timeseries.rollingStats.priceAccelerationPctPerSec2
            : null
        ),
        buyerVelocityPerSec: numberOrNull(
          timeseries.rollingStats.buyerVelocityPerSec
        ),
        buyerAccelerationPerSec2: numberOrNull(
          timeseries.rollingStats.buyerAccelerationPerSec2
        ),
        holderVelocityPerSec: null,
        holderAccelerationPerSec2: null,
        sampleCount: window60s.tradeCount,
        validMetricSampleCount: window60s.tradeCount,
        insufficientMetrics: window60s.tradeCount < 3,
        calculationConfidence: token.latestTrade?.confidence ?? "low",
        calculationReasonCodes: uniqueReasonCodes([
          "INDEXER_LIVE_STATE_CARD",
          ...timeseries.rollingStats.reasonCodes,
          ...(window60s.tradeCount < 3 ? ["INSUFFICIENT_TRADE_METRICS"] : []),
          "HOLDER_TIME_SERIES_UNAVAILABLE"
        ]),
        riskLevel: "unknown",
        riskScore: null,
        hardReject: false,
        riskReasonCodes: [],
        topRiskWarnings: [],
        mintAuthorityActive: null,
        freezeAuthorityActive: null,
        liquidityRisk: "unknown",
        concentrationRisk: "unknown",
        washTradingSuspected: null,
        honeypotSuspected: null,
        action: "IGNORE",
        lifecycleState: "new",
        score: 0,
        scoreLabel: "0/100",
        signalStrength: "none",
        combinedReasonCodes: uniqueReasonCodes([
          ...token.reasonCodes,
          "INDEXER_LIVE_STATE_CARD",
          "PAPER_ONLY"
        ]),
        buyReady: false,
        rejectReason:
          window60s.tradeCount < 3 ? "INSUFFICIENT_TRADE_METRICS" : null,
        strategyName: "paper-momentum-risk-v1",
        signalUpdatedAt: null,
        strategy,
        rawEventCount: token.rawEventCount,
        actualTradeEventCount: window60s.tradeCount,
        meteredLaunchDataState: "not_tracked",
        priceActionSource: "unavailable",
        realTradeEventCount: window60s.tradeCount,
        realPriceActionReady: latestPriceSol !== null,
        realTimeSeriesReady: window60s.tradeCount >= 3,
        missingDataReason:
          window60s.tradeCount >= 3 ? null : "INDEXER_LIVE_STATE_CARD",
        marketObservationCount: 0,
        chainVerificationStatus: "not_checked",
        feedProvider: token.source,
        dataSourceWarnings: sourceWarnings,
        dataCompleteness,
        tradeTrackingState: token.latestTrade ? "tracking" : "not_tracked",
        tradeTrackingReasonCodes: uniqueReasonCodes([
          ...(token.latestTrade ? ["INDEXER_TRADE_TRACKED"] : []),
          "INDEXER_LIVE_STATE_CARD",
          "PAPER_ONLY"
        ]),
        latestTradeAt: token.latestTrade?.at ?? null,
        latestTradeAgeSeconds: token.latestTrade
          ? Math.max(
              0,
              Math.round((nowMs - Date.parse(token.latestTrade.at)) / 1000)
            )
          : null,
        tradeEventCount: window60s.tradeCount,
        launchAgeSeconds: null,
        launchPhase: "discovery_only",
        launchScore: 0,
        launchScoreLabel: "0/100 none",
        launchBuyReadyPaper: false,
        launchTradeSampleCount: 0,
        launchPriceSol: null,
        launchWindows: null,
        launchDerivatives: null,
        launchDerivativeStrength: null,
        launchDerivativeScore: null,
        launchScoreComponents: null,
        launchTrackingState: "not_tracked",
        launchVolume5sSol: null,
        launchVolume10sSol: null,
        launchVolume30sSol: null,
        launchVolume2mSol: null,
        launchVolume5mSol: null,
        launchBuyCount10s: null,
        launchSellCount10s: null,
        launchUniqueBuyers10s: null,
        launchUniqueSellers10s: null,
        launchNetBuyPressure10s: null,
        launchPriceChange10sPct: null,
        launchVolumeVelocitySolPerSec: null,
        launchVolumeAccelerationSolPerSec2: null,
        launchPriceVelocityPctPerSec: null,
        launchPriceAccelerationPctPerSec2: null,
        launchBuyerVelocityPerSec: null,
        launchBuyerAccelerationPerSec2: null,
        launchDrivers: [],
        launchBlockers: ["INDEXER_LIVE_STATE_CARD"],
        launchReasonCodes: [
          "INDEXER_LIVE_STATE_CARD",
          "PUMPPORTAL_LAUNCH_SCANNER_UNAVAILABLE"
        ],
        launchMissingDataReasons: ["PUMPPORTAL_LAUNCH_SCANNER_UNAVAILABLE"],
        migrationStatus: token.eventTypes.includes("token_migrated")
          ? "migrated"
          : "not_migrated",
        migratedAt: token.eventTypes.includes("token_migrated")
          ? token.lastSeenAt
          : null,
        migrationSource: token.eventTypes.includes("token_migrated")
          ? token.source
          : null,
        migrationPool: null,
        adaptiveTrackingReasonCodes: token.eventTypes.includes("token_migrated")
          ? ["MIGRATED_TOKEN_VISIBLE"]
          : [],
        sparkline: buildMomentumSparkline(token.mint),
        exitSignalSummary: watchedWalletExit.getSignalSummaryForMint(
          token.mint
        ),
        paperPositionSummary: paperPortfolio.getPositionSummaryForMint(
          token.mint
        ),
        dataCompletenessLabel: dataCompleteness.dataQualityLabel,
        missingCriticalFields: dataCompleteness.missingCriticalFields,
        enrichmentStatus:
          token.dataCompleteness.label === "enriched" ? "partial" : "disabled",
        enrichmentSource: null,
        pairAddress: null,
        dexId: null,
        missingFields: token.dataCompleteness.missingFields,
        unavailableFields: token.dataCompleteness.unavailableFields,
        lastUpdatedAt: token.lastSeenAt
      };
    });
  }

  function getStrategyStatus(): StrategyStatus {
    return {
      strategyName: "paper-momentum-risk-v1",
      thresholds: {
        minScoreForPaperBuyReady: 75,
        minScoreForWatch: 45,
        minSampleCount: 8,
        criticalRiskBlocksBuyReady: true,
        hardRejectBlocksBuyReady: true,
        insufficientMetricsBlocksBuyReady: true
      },
      scoringWeights: {
        rollingMomentumWeight: 0.65,
        legacyMomentumWeight: 0.35,
        momentumMultiplier: 0.55,
        qualityMultiplier: 0.55,
        riskPenaltyMultiplier: 1
      },
      safetyGates: [
        "PAPER_ONLY",
        "HARD_REJECT_BLOCKS_BUY_READY",
        "CRITICAL_RISK_BLOCKS_BUY_READY",
        "INSUFFICIENT_METRICS_BLOCKS_BUY_READY",
        "PAPER_AUTO_ORDER_DEFAULT_FALSE",
        "PUMPPORTAL_LAUNCH_TRACKING_METERED_OPT_IN",
        "NO_TRADING_CONTROLS"
      ],
      formula: [
        "total = clamp(momentum * 0.55 + quality * 0.55 - riskPenalty, 0, 100)",
        "rolling momentum blends volume, volume acceleration, buyer velocity, buyer acceleration, price velocity, buy/sell ratio, net pressure, and trade activity",
        "launch momentum = early volume + volume acceleration + price action + buyer growth + buy pressure - risk/missing-data penalties",
        `launch extend threshold = ${launchScanner.getStatus().minScoreToExtend}; launch ripping threshold = ${launchScanner.getStatus().minScoreToRip}`,
        "holder derivatives are displayed only when a real holder time series exists"
      ],
      paperOnly: true,
      reasonCodes: [
        "STRATEGY_STATUS_READ_ONLY",
        "RUNTIME_PUMPPORTAL_FIRST",
        "PAPER_ONLY",
        "NO_TRADING_CONTROLS"
      ]
    };
  }

  function getLiveTradeTrackingStatus() {
    const actualStatus = actualData.getStatus();
    const subscriptions = actualData.getSubscriptions();
    const trackedSubscriptions = subscriptions.filter(
      (subscription) => subscription.status === "subscribed"
    );

    return {
      acknowledgedMetered: liveTradeTracking.acknowledgedMetered,
      actualData: actualStatus,
      autoMaxAgeSeconds: liveTradeTracking.autoMaxAgeSeconds,
      autoMinAgeSeconds: liveTradeTracking.autoMinAgeSeconds,
      autoMinIdentityConfidence: liveTradeTracking.autoMinIdentityConfidence,
      autoMode: liveTradeTracking.autoMode,
      autoRequireRealData: liveTradeTracking.autoRequireRealData,
      budgetReached: actualStatus.budgetReached,
      enabled: liveTradeTracking.enabled,
      maxEventsPerMint: liveTradeTracking.maxEventsPerMint,
      maxEventsPerSession: liveTradeTracking.maxEventsPerSession,
      maxSubscribedTokens: liveTradeTracking.maxSubscribedTokens,
      paperOnly: true,
      reasonCodes: uniqueReasonCodes([
        ...getLiveTradeTrackingBlockers(),
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "OBSERVATION_ONLY",
        "PAPER_ONLY"
      ]),
      subscribedTokenCount: trackedSubscriptions.length,
      subscriptions,
      totalEventsThisSession: actualStatus.totalEventsThisSession,
      trackedMints: trackedSubscriptions.map(
        (subscription) => subscription.mint
      ),
      unsubscribeAfterMs: liveTradeTracking.unsubscribeAfterMs
    };
  }

  function getLiveTradeTrackingBlockers(mint?: string): string[] {
    const actualStatus = actualData.getStatus();
    const reasonCodes: string[] = [];

    if (!liveTradeTracking.enabled) {
      reasonCodes.push("LIVE_TRADE_TRACKING_DISABLED");
    }

    if (!liveTradeTracking.acknowledgedMetered) {
      reasonCodes.push("LIVE_TRADE_TRACKING_METERED_NOT_ACKNOWLEDGED");
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

    if (actualStatus.reasonCodes.includes("PUMPPORTAL_API_KEY_MISSING")) {
      reasonCodes.push("PUMPPORTAL_API_KEY_MISSING");
    }

    if (actualStatus.budgetReached) {
      reasonCodes.push("PUMPPORTAL_TRADE_BUDGET_REACHED");
    }

    const existing = mint
      ? actualData
          .getSubscriptions()
          .find((subscription) => subscription.mint === mint)
      : undefined;

    if (
      existing?.status !== "subscribed" &&
      actualStatus.subscribedTokenCount >= liveTradeTracking.maxSubscribedTokens
    ) {
      reasonCodes.push("LIVE_TRADE_TRACKING_MAX_MINTS_REACHED");
    }

    return uniqueReasonCodes(reasonCodes);
  }

  function getLiveTradeTrackingForMint(mint: string): {
    latestTradeAgeSeconds: number | null;
    latestTradeAt: string | null;
    reasonCodes: string[];
    state: LiveTradeTrackingState;
    tradeEventCount: number;
  } {
    const actualStatus = actualData.getStatus();
    const summary = actualData.getCandidateSummary(mint);
    const subscription = actualData
      .getSubscriptions()
      .find((item) => item.mint === mint);
    const latestTradeAt = summary?.latestRealTradeAt ?? null;
    const latestTradeMs = latestTradeAt ? Date.parse(latestTradeAt) : NaN;
    const blockers = getLiveTradeTrackingBlockers(mint);
    const state: LiveTradeTrackingState =
      actualStatus.budgetReached ||
      blockers.includes("PUMPPORTAL_TRADE_BUDGET_REACHED")
        ? "budget_reached"
        : subscription?.status === "subscribed"
          ? "tracking"
          : subscription?.status === "unsubscribed"
            ? "unsubscribed"
            : liveTradeTracking.enabled &&
                liveTradeTracking.acknowledgedMetered &&
                blockers.some((code) =>
                  [
                    "ACTUAL_DATA_INCOMPATIBLE_PROVIDER",
                    "PUMPPORTAL_API_KEY_MISSING"
                  ].includes(code)
                )
              ? "error"
              : "not_tracked";

    return {
      latestTradeAgeSeconds: Number.isFinite(latestTradeMs)
        ? Math.max(0, Math.round((Date.now() - latestTradeMs) / 1000))
        : null,
      latestTradeAt,
      reasonCodes: uniqueReasonCodes([
        ...(summary?.reasonCodes ?? []),
        ...(subscription?.reasonCodes ?? []),
        ...blockers,
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "OBSERVATION_ONLY",
        "PAPER_ONLY"
      ]),
      state,
      tradeEventCount: summary?.eventCount ?? subscription?.eventCount ?? 0
    };
  }

  function getLiveCardEnrichmentStatus() {
    const nowMs = Date.now();
    pruneLiveCardEnrichmentAttempts(nowMs);

    return {
      cacheTtlMs: liveCardEnrichment.cacheTtlMs,
      cachedMintCount: liveCardEnrichments.size,
      dexScreenerEnabled: liveCardEnrichment.dexScreenerEnabled,
      enabled: liveCardEnrichment.enabled,
      jupiterPriceEnabled: liveCardEnrichment.jupiterPriceEnabled,
      maxMintsPerMinute: liveCardEnrichment.maxMintsPerMinute,
      onNewToken: liveCardEnrichment.onNewToken,
      paperOnly: true,
      reasonCodes: uniqueReasonCodes([
        ...(liveCardEnrichment.enabled
          ? []
          : ["LIVE_CARD_ENRICHMENT_DISABLED"]),
        ...(liveCardEnrichment.dexScreenerEnabled
          ? []
          : ["DEXSCREENER_DISABLED"]),
        ...(liveCardEnrichment.jupiterPriceEnabled
          ? []
          : ["JUPITER_PRICE_DISABLED"]),
        "OBSERVATION_ONLY",
        "PAPER_ONLY"
      ]),
      requestsThisMinute: liveCardEnrichmentAttempts.length
    };
  }

  async function enrichLiveCardToken(
    mint: string,
    reason: string
  ): Promise<LiveCardEnrichmentRecord> {
    const normalizedMint = mint.trim();

    if (!isValidSolanaMint(normalizedMint)) {
      throw new ActualDataServiceError(
        "INVALID_MINT",
        `Invalid Solana mint for live-card enrichment: ${normalizedMint}`,
        400
      );
    }

    if (!liveCardEnrichment.enabled) {
      throw new ActualDataServiceError(
        "LIVE_CARD_ENRICHMENT_DISABLED",
        "Live-card enrichment is disabled."
      );
    }

    if (
      !liveCardEnrichment.dexScreenerEnabled &&
      !liveCardEnrichment.jupiterPriceEnabled
    ) {
      throw new ActualDataServiceError(
        "LIVE_CARD_ENRICHMENT_SOURCE_DISABLED",
        "No live-card enrichment provider is enabled."
      );
    }

    const nowMs = Date.now();
    const cached = liveCardEnrichments.get(normalizedMint);

    if (
      cached &&
      liveCardEnrichment.cacheTtlMs > 0 &&
      nowMs - Date.parse(cached.updatedAt) < liveCardEnrichment.cacheTtlMs
    ) {
      return cached;
    }

    pruneLiveCardEnrichmentAttempts(nowMs);

    if (
      liveCardEnrichmentAttempts.length >= liveCardEnrichment.maxMintsPerMinute
    ) {
      throw new ActualDataServiceError(
        "LIVE_CARD_ENRICHMENT_RATE_LIMITED",
        "Live-card enrichment minute cap reached."
      );
    }

    liveCardEnrichmentAttempts.push(nowMs);

    const dexRecord = liveCardEnrichment.dexScreenerEnabled
      ? await fetchDexScreenerEnrichment(normalizedMint)
      : null;
    const jupiterPriceUsd =
      liveCardEnrichment.jupiterPriceEnabled &&
      (dexRecord?.priceUsd === null || dexRecord?.priceUsd === undefined)
        ? await fetchJupiterPriceUsd(normalizedMint)
        : null;
    const record: LiveCardEnrichmentRecord = {
      dexId: dexRecord?.dexId ?? null,
      fdvUsd: dexRecord?.fdvUsd ?? null,
      liquidityUsd: dexRecord?.liquidityUsd ?? null,
      marketCapUsd: dexRecord?.marketCapUsd ?? null,
      mint: normalizedMint,
      pairAddress: dexRecord?.pairAddress ?? null,
      priceUsd: dexRecord?.priceUsd ?? jupiterPriceUsd,
      reasonCodes: uniqueReasonCodes([
        ...(dexRecord ? ["DEXSCREENER_ENRICHED"] : []),
        ...(jupiterPriceUsd !== null ? ["JUPITER_PRICE_ENRICHED"] : []),
        ...(dexRecord || jupiterPriceUsd !== null
          ? []
          : ["LIVE_CARD_ENRICHMENT_UNAVAILABLE"]),
        "OBSERVATION_ONLY",
        "PAPER_ONLY",
        reason.toUpperCase()
      ]),
      source: dexRecord
        ? "dexscreener"
        : jupiterPriceUsd !== null
          ? "jupiter"
          : null,
      status:
        dexRecord && jupiterPriceUsd !== null
          ? "available"
          : dexRecord || jupiterPriceUsd !== null
            ? "partial"
            : "not_checked",
      updatedAt: new Date(nowMs).toISOString()
    };

    liveCardEnrichments.set(normalizedMint, record);
    return record;
  }

  async function fetchDexScreenerEnrichment(
    mint: string
  ): Promise<LiveCardEnrichmentRecord | null> {
    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(
          mint
        )}`
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        pairs?: Array<Record<string, unknown>>;
      };
      const pair =
        data.pairs?.find((item) => readString(item.chainId) === "solana") ??
        data.pairs?.[0];

      if (!pair) {
        return null;
      }

      return {
        dexId: readString(pair.dexId),
        fdvUsd: readNumber(pair.fdv),
        liquidityUsd: readNestedNumber(pair.liquidity, "usd"),
        marketCapUsd: readNumber(pair.marketCap),
        mint,
        pairAddress: readString(pair.pairAddress),
        priceUsd: readNumber(pair.priceUsd),
        reasonCodes: ["DEXSCREENER_ENRICHED"],
        source: "dexscreener",
        status: "partial",
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      app.log.warn({ error, mint }, "DexScreener enrichment failed");
      return null;
    }
  }

  async function fetchJupiterPriceUsd(mint: string): Promise<number | null> {
    try {
      const response = await fetch(
        `https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const item = data[mint];

      if (!item || typeof item !== "object") {
        return null;
      }

      return (
        readNumber((item as Record<string, unknown>).usdPrice) ??
        readNumber((item as Record<string, unknown>).price)
      );
    } catch (error) {
      app.log.warn({ error, mint }, "Jupiter price enrichment failed");
      return null;
    }
  }

  function pruneLiveCardEnrichmentAttempts(nowMs: number): void {
    while (
      liveCardEnrichmentAttempts.length > 0 &&
      nowMs - (liveCardEnrichmentAttempts[0] ?? nowMs) > 60_000
    ) {
      liveCardEnrichmentAttempts.shift();
    }
  }

  const feedEventBatchSize = 10;
  const pendingFeedEvents: FeedEvent[] = [];
  let feedEventDrainScheduled = false;

  function enqueueFeedEvent(event: FeedEvent): void {
    discoveryCoverage.markQueueAccepted(event);
    tradeDataCoverage.markQueueAccepted(event);
    pendingFeedEvents.push(event);
    scheduleFeedEventDrain();
  }

  function scheduleFeedEventDrain(): void {
    if (feedEventDrainScheduled || pendingFeedEvents.length === 0) {
      return;
    }

    feedEventDrainScheduled = true;
    setImmediate(() => {
      feedEventDrainScheduled = false;
      try {
        drainFeedEventBatch();
      } catch (error) {
        const dropped = pendingFeedEvents.splice(0);
        discoveryCoverage.markQueueFailedOrDropped(
          dropped,
          "pending_queue_cleared",
          safeDiscoveryErrorClass(error)
        );
        tradeDataCoverage.markQueueFailedOrDropped(
          dropped,
          "pending_queue_cleared",
          safeDiscoveryErrorClass(error)
        );
        meteredLaunchData.stop();
        disarmPaidData("feed_event_processing_error");
        app.log.error({ error }, "Feed event batch failed; paid data stopped");
        return;
      }
      scheduleFeedEventDrain();
    });
  }

  function drainFeedEventBatch(): void {
    const batch = pendingFeedEvents.splice(0, feedEventBatchSize);
    if (batch.length === 0) {
      return;
    }

    for (const event of batch) {
      discoveryCoverage.markQueueTransactionStarted(event);
      tradeDataCoverage.markQueueTransactionStarted(event);
    }

    try {
      runStorageTransaction(() => {
        for (const event of batch) {
          processFeedEvent(event);
        }
      });
    } catch (error) {
      discoveryCoverage.markQueueFailedOrDropped(
        batch,
        "queue_transaction_failed",
        safeDiscoveryErrorClass(error)
      );
      tradeDataCoverage.markQueueFailedOrDropped(
        batch,
        "queue_transaction_failed",
        safeDiscoveryErrorClass(error)
      );
      throw error;
    }

    discoveryCoverage.markQueueCommittedAndPipelineCompleted(batch);
    tradeDataCoverage.markQueueCommittedAndPipelineCompleted(batch);
  }

  function flushFeedEventQueue(): void {
    try {
      while (pendingFeedEvents.length > 0) {
        drainFeedEventBatch();
      }
    } catch (error) {
      const dropped = pendingFeedEvents.splice(0);
      discoveryCoverage.markQueueFailedOrDropped(
        dropped,
        "pending_queue_cleared_during_flush",
        safeDiscoveryErrorClass(error)
      );
      tradeDataCoverage.markQueueFailedOrDropped(
        dropped,
        "pending_queue_cleared_during_flush",
        safeDiscoveryErrorClass(error)
      );
      throw error;
    }
  }

  function handleFeedEvent(event: FeedEvent): void {
    runStorageTransaction(() => processFeedEvent(event));
  }

  function processFeedEvent(event: FeedEvent): void {
    if (event.type === "account_trade") {
      saveFeedEvent(event);
      const exitEvaluation = watchedWalletExit.ingestFeedEvent(event);
      paperPortfolio.ingestExitSignals(exitEvaluation.signals);
      return;
    }

    const discoveryMint =
      event.discoveryCoverage && event.type === "token_created"
        ? event.candidate.mint
        : null;
    const identityExisted = discoveryMint
      ? tokenIdentity.getIdentity(discoveryMint) !== undefined
      : false;
    const liveTokenExisted = discoveryMint
      ? liveTokens.getLiveToken(discoveryMint) !== undefined
      : false;
    const launchCandidateExisted = discoveryMint
      ? launchScanner.getCandidate(discoveryMint) !== null
      : false;

    const actualDataSummary =
      event.type === "trade" && event.source === "pumpportal"
        ? actualData.handlePumpPortalTradeEvent(event)
        : undefined;
    const indexerResult = indexerAdapter.ingestFeedEventWithResult(event);
    const identity = tokenIdentity.ingestFeedEvent(event);
    const identitySummary = toTokenIdentitySummary(identity);
    discoveryCoverage.markIdentityCompleted(event, !identityExisted);

    saveFeedEvent(event);
    tradeDataCoverage.markPersistenceCompleted(event);
    if (
      event.type === "trade" &&
      event.source === "pumpportal" &&
      indexerResult.timeseriesResult
    ) {
      const timeseries = indexerAdapter.getTimeseries(event.mint, {
        fillGaps: false
      });
      const derivatives = timeseries.derivatives.primary.metrics;
      const firstDerivativeAvailable = [
        derivatives.volumeVelocitySolPerSec,
        derivatives.priceSolVelocityPerSec,
        derivatives.buyerVelocityPerSec,
        derivatives.tradeVelocityPerSec,
        derivatives.buyPressureVelocityPerSec
      ].some((metric) => metric.status === "available");
      const secondDerivativeAvailable = [
        derivatives.volumeAccelerationSolPerSec2,
        derivatives.priceSolAccelerationPerSec2,
        derivatives.buyerAccelerationPerSec2,
        derivatives.tradeAccelerationPerSec2,
        derivatives.buyPressureAccelerationPerSec2
      ].some((metric) => metric.status === "available");
      tradeDataCoverage.markTimeseries(event, {
        action: indexerResult.timeseriesResult.action,
        bucketUpdated: indexerResult.timeseriesResult.bucket !== null,
        rollingWindowsUpdated: indexerResult.timeseriesResult.accepted,
        oneSecondBucketCount: timeseries.actualBucketCount,
        completedOneSecondBucketCount: timeseries.buckets.filter(
          (bucket) => !bucket.synthetic && bucket.complete
        ).length,
        validSampleCount: timeseries.derivatives.observationCount,
        firstDerivativeAvailable,
        secondDerivativeAvailable
      });
    }
    const rollingMetrics = metricsEngine.ingestFeedEvent(event);
    const ingestedCandidate = candidateEngine.ingestFeedEvent(event);
    const candidate =
      candidateEngine.updateTokenIdentity(
        ingestedCandidate.mint,
        identitySummary
      ) ?? ingestedCandidate;
    const watchPlan = watchOrchestration.handleFeedEvent(event, {
      mint: candidate.mint,
      ...(candidate.symbol ? { symbol: candidate.symbol } : {}),
      ...(candidate.source ? { source: candidate.source } : {})
    });

    if (watchPlan) {
      candidateEngine.updateWatchPlan(
        candidate.mint,
        createWatchPlanSummary(watchPlan)
      );
    }

    if (event.type === "trade" && event.marketObservation) {
      candidateEngine.updateMarketObservation(
        candidate.mint,
        event.marketObservation
      );
    }

    if (!watchOrchestration.getStatus().enabled) {
      chainEvents.maybeWatchCandidate({
        address: candidate.mint,
        kind: "mint",
        mint: candidate.mint,
        ...(candidate.symbol ? { symbol: candidate.symbol } : {}),
        ...(candidate.source ? { source: candidate.source } : {}),
        reasonCodes: ["CHAIN_EVENTS_CANDIDATE_MINT"]
      });
    }
    const latestMetrics = applyCanonicalDerivativesToRollingMetrics(
      rollingMetrics ?? metricsEngine.getMetrics(candidate.mint),
      indexerAdapter.getDerivatives(candidate.mint)
    );
    tradeDataCoverage.markDerivativeStrengthUpdated(event);
    candidateEngine.updateMetrics(candidate.mint, latestMetrics);

    const effectiveMetrics = mergeRollingIntoLegacyMetrics(
      getLegacyMetrics(event),
      latestMetrics
    );
    const shouldVerifyOnChain =
      !watchOrchestration.getStatus().enabled &&
      chainVerifier.shouldVerifyFeedEvent(event);

    if (shouldVerifyOnChain) {
      candidateEngine.updateChainVerification(
        candidate.mint,
        createPendingChainVerificationSummary(candidate.mint, event.timestamp)
      );
    }

    const riskSnapshot = riskEngine.evaluateRisk(
      createRiskInput({
        candidate,
        event,
        metrics: effectiveMetrics,
        rollingMetrics: latestMetrics
      })
    );
    riskSnapshots.set(candidate.mint, riskSnapshot);
    saveRiskSnapshot(riskSnapshot);
    candidateEngine.updateRisk(candidate.mint, riskSnapshot);
    const launchCandidateView = launchScanner.ingestFeedEvent(event);
    if (launchCandidateView) {
      discoveryCoverage.markCandidateCompleted(event, !launchCandidateExisted);
      discoveryCoverage.markScoreCompleted(event);
    }
    if (event.type === "trade" && event.source === "pumpportal") {
      meteredLaunchData.handlePumpPortalTokenTrade(event);

      if (paidDataArmed && meteredLaunchData.getStatus().budgetReached) {
        disarmPaidData("budget_reached");
      }
    }

    if (event.type === "token_created" && launchCandidateView) {
      try {
        meteredLaunchData.evaluateNewLaunchCandidate(launchCandidateView);
      } catch (error) {
        app.log.debug(
          {
            error,
            mint: launchCandidateView.mint
          },
          "Metered launch data auto-track skipped"
        );
      }
    }

    paperPortfolio.updateMarkPrice(
      candidate.mint,
      getCurrentPaperPriceSol(candidate.mint)
    );

    const score = scoreFeedCandidate({
      candidate,
      event,
      metrics: effectiveMetrics,
      riskSnapshot,
      rollingMetrics: latestMetrics
    });
    candidateEngine.updateScore(candidate.mint, score);
    const decision = candidateEngine.evaluateCandidate(candidate.mint);
    const liveToken = liveTokens.ingestLiveFeedEvent(event, {
      candidate,
      ...(decision ? { decision } : {}),
      identity: identitySummary,
      riskSnapshot,
      score
    });

    if (liveToken) {
      saveLiveFeedEvent({
        sessionId: liveTokens.getStatus().sessionId,
        provider: "pumpportal",
        eventType: getLiveFeedEventType(event),
        mint: liveToken.mint,
        name: liveToken.name ?? null,
        symbol: liveToken.symbol ?? null,
        title: liveToken.title ?? null,
        realData: true,
        reasonCodes: liveToken.reasonCodes,
        payload: event,
        createdAt: event.timestamp
      });
      discoveryCoverage.markLiveTokenCompleted(event, !liveTokenExisted);

      if (liveCardEnrichment.enabled && liveCardEnrichment.onNewToken) {
        void enrichLiveCardToken(liveToken.mint, "on_new_token").catch(
          (error) => {
            app.log.debug(
              {
                error,
                mint: liveToken.mint
              },
              "Live-card enrichment skipped"
            );
          }
        );
      }
    }

    if (
      event.type === "trade" &&
      event.source === "pumpportal" &&
      getMomentumScannerRows().some((row) => row.mint === event.mint)
    ) {
      tradeDataCoverage.markScannerProjected(event);
    }

    broadcastScannerUpsertV2(candidate.mint);

    if (!decision) {
      app.log.trace({ mint: candidate.mint }, "Candidate decision unavailable");
      return;
    }

    saveCandidateDecision(decision);

    const nextActualDataSummary =
      actualDataSummary ?? actualData.getCandidateSummary(candidate.mint);
    const signal = createOverlaySignal({
      ...(nextActualDataSummary
        ? { actualDataSummary: nextActualDataSummary }
        : {}),
      candidate,
      decision,
      metrics: effectiveMetrics,
      riskSnapshot,
      rollingMetrics: latestMetrics,
      score
    });
    const storedSignal = saveSignal(signal);
    tradeDataCoverage.markSignalUpdated(event);
    cacheSignal(signal);
    paperOperations.observeSignal(signal);
    paperAutomation.observeSignal(signal);
    paperPortfolio.evaluateEntrySignal(signal);
    paperPortfolio.evaluateExits();
    broadcastScannerUpsertV2(candidate.mint);
    discoveryCoverage.markPersistenceCompleted(event);

    if (
      discoveryMint &&
      getMomentumScannerRows().some((row) => row.mint === discoveryMint)
    ) {
      discoveryCoverage.markScannerProjected(event);
    }

    if (
      paperAutoOrder &&
      decision.action === "PAPER_BUY_READY" &&
      !signal.hardReject
    ) {
      const paperResult = executor.submitPaperBuy(signal);
      persistPaperTradeResult(signal, storedSignal.id, paperResult);
      const orderDecision = candidateEngine.markPaperOrderSubmitted(
        signal.mint,
        [paperResult.reason]
      );

      if (orderDecision) {
        saveCandidateDecision(orderDecision);
      }

      app.log.info(
        {
          mint: signal.mint,
          action: signal.action,
          paperResult: paperResult.reason
        },
        "Paper execution evaluated signal"
      );
    }

    discoveryCoverage.markBroadcastAttempted(event);
    broadcast({
      type: "signal",
      signal
    });
    discoveryCoverage.markBroadcastCompleted(event, clients.size);
    tradeDataCoverage.markBroadcastCompleted(event);

    if (shouldVerifyOnChain) {
      void verifyAndApplyChainResult({
        event,
        mint: candidate.mint
      });
    }
  }

  async function verifyMintForHttp(
    mint: string,
    reply: FastifyReply
  ): Promise<unknown> {
    try {
      const record = await chainVerifier.verifyMint(mint);
      const stored = saveChainVerification(
        chainVerifier.toStorageInput(record)
      );
      applyChainVerificationToCandidate({
        event: undefined,
        record
      });
      return {
        ...stored,
        summary: record.summary
      };
    } catch (error) {
      if (error instanceof ChainVerifierUnavailableError) {
        return reply.code(409).send({
          error: error.code,
          message: error.message,
          chainVerifier: chainVerifier.getStatus()
        });
      }

      throw error;
    }
  }

  async function verifyAndApplyChainResult(options: {
    event: FeedEvent | undefined;
    mint: string;
  }): Promise<void> {
    try {
      const record = await chainVerifier.verifyMint(options.mint);
      saveChainVerification(chainVerifier.toStorageInput(record));
      applyChainVerificationToCandidate({
        event: options.event,
        record
      });
    } catch (error) {
      app.log.warn(
        {
          error,
          mint: options.mint
        },
        "Read-only chain verification failed"
      );
    }
  }

  function applyChainVerificationToCandidate(options: {
    event: FeedEvent | undefined;
    record: ChainVerificationRecord;
  }): void {
    const candidate = candidateEngine.getCandidate(options.record.mint);

    if (!candidate) {
      return;
    }

    candidateEngine.updateChainVerification(
      options.record.mint,
      options.record.summary
    );
    if (!watchOrchestration.getStatus().enabled) {
      chainEvents.maybeWatchChainVerified({
        address: options.record.mint,
        kind: "mint",
        mint: options.record.mint,
        ...(candidate.symbol ? { symbol: candidate.symbol } : {}),
        ...(candidate.source ? { source: candidate.source } : {}),
        reasonCodes: ["CHAIN_EVENTS_CHAIN_VERIFIED_MINT"]
      });
    }

    const latestMetrics = applyCanonicalDerivativesToRollingMetrics(
      metricsEngine.getMetrics(options.record.mint),
      indexerAdapter.getDerivatives(options.record.mint)
    );
    const effectiveMetrics = mergeRollingIntoLegacyMetrics(
      options.event
        ? getLegacyMetrics(options.event)
        : fallbackMetricsFromCandidate(candidate),
      latestMetrics
    );
    const riskSnapshot = withChainReasonCodes(
      riskEngine.evaluateRisk(
        createRiskInput({
          candidate,
          event: options.event,
          metrics: effectiveMetrics,
          rollingMetrics: latestMetrics,
          chainRiskPatch: options.record.riskInputPatch
        })
      ),
      options.record.reasonCodes
    );
    riskSnapshots.set(candidate.mint, riskSnapshot);
    saveRiskSnapshot(riskSnapshot);
    candidateEngine.updateRisk(candidate.mint, riskSnapshot);

    const score = scoreFeedCandidate({
      candidate,
      event: options.event,
      metrics: effectiveMetrics,
      riskSnapshot,
      rollingMetrics: latestMetrics
    });
    candidateEngine.updateScore(candidate.mint, score);
    const decision = candidateEngine.evaluateCandidate(candidate.mint);

    if (!decision) {
      return;
    }

    saveCandidateDecision(decision);

    const signal = createOverlaySignal({
      candidate,
      decision,
      metrics: effectiveMetrics,
      riskSnapshot,
      rollingMetrics: latestMetrics,
      score
    });
    saveSignal(signal);
    cacheSignal(signal);
    paperOperations.observeSignal(signal);
    paperAutomation.observeSignal(signal);
    paperPortfolio.evaluateEntrySignal(signal);
    paperPortfolio.evaluateExits();
    broadcast({
      type: "signal",
      signal
    });
  }

  function createOverlaySignal(options: {
    actualDataSummary?: ActualDataCandidateSummary;
    candidate: CandidateState;
    decision: CandidateDecision;
    metrics: RollingMetrics;
    riskSnapshot: RiskSnapshot;
    rollingMetrics: RollingMetricsSnapshot | undefined;
    score: ScoreBreakdown;
  }): OverlaySignal {
    const identity =
      options.candidate.identity ??
      getTokenIdentitySummary(options.candidate.mint);
    const state: SignalState = {
      candidate: createTokenCandidateFromState(options.candidate),
      metrics: options.metrics,
      riskFlags: createRiskFlagsFromSnapshot(options.riskSnapshot),
      score: options.score,
      updatedAt:
        options.rollingMetrics?.lastUpdatedAt ?? options.decision.updatedAt
    };
    const actualDataSummary =
      options.actualDataSummary ??
      actualData.getCandidateSummary(options.candidate.mint);

    const signal: OverlaySignal = {
      mint: options.candidate.mint,
      symbol: identity?.symbol ?? options.candidate.symbol ?? "UNKNOWN",
      ...(identity?.name
        ? { name: identity.name }
        : options.candidate.name
          ? { name: options.candidate.name }
          : {}),
      ...(identity?.title
        ? { title: identity.title }
        : options.candidate.title
          ? { title: options.candidate.title }
          : {}),
      ...(identity?.displayName
        ? { displayName: identity.displayName }
        : options.candidate.displayName
          ? { displayName: options.candidate.displayName }
          : {}),
      ...(identity?.imageUri !== undefined
        ? { imageUri: identity.imageUri }
        : options.candidate.imageUri !== undefined
          ? { imageUri: options.candidate.imageUri }
          : {}),
      ...(identity
        ? {
            identity,
            identityConfidence: identity.confidence,
            identityResolved: identity.resolved,
            identityReasonCodes: identity.reasonCodes,
            identitySource: identity.dataSource
          }
        : {}),
      score: options.decision.score,
      action: signalActionFromDecision(options.decision),
      hardReject: options.decision.hardReject,
      reasonCodes: options.decision.combinedReasonCodes,
      feedProvider: feed.name,
      candidateDecision: options.decision,
      candidateDecisionAction: options.decision.action,
      combinedReasonCodes: options.decision.combinedReasonCodes,
      ...(options.decision.chainVerification
        ? { chainVerification: options.decision.chainVerification }
        : {}),
      ...(options.decision.chainVerificationStatus
        ? { chainVerificationStatus: options.decision.chainVerificationStatus }
        : {}),
      insufficientMetrics: options.decision.metricsSummary.insufficientMetrics,
      lifecycleState: options.decision.lifecycleState,
      ...(options.decision.marketObservationSummary
        ? {
            marketObservationSummary: options.decision.marketObservationSummary
          }
        : {}),
      ...(options.decision.marketReasonCodes
        ? { marketReasonCodes: options.decision.marketReasonCodes }
        : {}),
      ...(actualDataSummary ? { actualData: actualDataSummary } : {}),
      ...(options.decision.watchPlanSummary
        ? { watchPlanSummary: options.decision.watchPlanSummary }
        : {}),
      ...(options.decision.watchReasonCodes
        ? { watchReasonCodes: options.decision.watchReasonCodes }
        : {}),
      riskLevel: options.riskSnapshot.riskLevel,
      riskReasonCodes: options.riskSnapshot.reasonCodes,
      riskScore: options.riskSnapshot.riskScore,
      riskSnapshot: options.riskSnapshot,
      scoreReasonCodes: options.score.reasonCodes,
      volumeVelocity: Math.max(
        getEffectiveVolumeVelocity(options.rollingMetrics) ??
          options.metrics.volumeVelocity,
        0
      ),
      buyerVelocity: Math.max(
        options.rollingMetrics?.buyerVelocityPerSec ??
          options.metrics.buyerVelocity,
        0
      ),
      riskFlags: state.riskFlags,
      state
    };

    if (options.rollingMetrics) {
      signal.buySellRatio = options.rollingMetrics.buySellRatio;
      signal.buyerAcceleration =
        options.rollingMetrics.buyerAccelerationPerSec2;
      signal.netBuyPressure = options.rollingMetrics.netBuyPressure;
      signal.priceVelocity = getEffectivePriceVelocity(options.rollingMetrics);
      signal.rollingMetrics = options.rollingMetrics;
      signal.volumeAcceleration = getEffectiveVolumeAcceleration(
        options.rollingMetrics
      );
    }

    return signal;
  }

  function scoreFeedCandidate(options: {
    candidate: CandidateState;
    event: FeedEvent | undefined;
    metrics: RollingMetrics;
    riskSnapshot: RiskSnapshot;
    rollingMetrics: RollingMetricsSnapshot | undefined;
  }): ScoreBreakdown {
    const scoringOptions: {
      minSampleCount: number;
      riskSnapshot: RiskSnapshot;
      rollingMetrics?: RollingMetricsSnapshot;
    } = {
      minSampleCount: 8,
      riskSnapshot: options.riskSnapshot
    };

    if (options.rollingMetrics) {
      scoringOptions.rollingMetrics = options.rollingMetrics;
    }

    const score = scoreCandidate(
      createTokenCandidateFromState(options.candidate),
      options.metrics,
      options.event
        ? getRiskFlags(options.event)
        : createRiskFlagsFromSnapshot(options.riskSnapshot),
      scoringOptions
    );

    if (options.event?.source === "solana_rpc") {
      return {
        ...score,
        reasonCodes: uniqueReasonCodes([
          "CHAIN_TRADE_EVENT",
          ...(options.event.reasonCodes ?? []),
          ...score.reasonCodes
        ])
      };
    }

    if (
      !options.event ||
      options.event.source !== "pumpportal" ||
      options.event.metricsComplete !== false
    ) {
      return score;
    }

    const realFeedReason =
      options.event.rawSourceEventType === "migration"
        ? "REAL_FEED_MIGRATION_EVENT"
        : "REAL_FEED_NEW_TOKEN_EVENT";

    return {
      ...score,
      action: score.hardReject ? "HARD_REJECT" : "IGNORE",
      reasonCodes: uniqueReasonCodes([
        "INSUFFICIENT_METRICS",
        "INSUFFICIENT_TRADE_METRICS",
        "INSUFFICIENT_RISK_DATA",
        realFeedReason,
        ...score.reasonCodes
      ]),
      total: score.hardReject ? 0 : Math.min(score.total, 20)
    };
  }

  function persistPaperTradeResult(
    signal: OverlaySignal,
    signalId: number,
    paperResult: PaperTradeResult
  ): void {
    if (paperResult.order) {
      savePaperOrder({
        ...paperResult.order,
        signalId,
        payload: {
          reason: paperResult.reason,
          signal
        }
      });
    }

    if (paperResult.position) {
      upsertPaperPosition({
        mint: paperResult.position.mint,
        symbol: paperResult.position.symbol,
        sizeSol: paperResult.position.sizeSol,
        tokenAmount: paperResult.position.tokenAmount,
        entryPrice: paperResult.position.entryPrice,
        status: paperResult.position.status,
        payload: paperResult.position,
        openedAt: paperResult.position.openedAt,
        updatedAt: paperResult.position.updatedAt
      });
    }
  }

  function broadcast(payload: unknown): void {
    for (const client of clients) {
      sendJson(client, payload);
    }
  }

  function broadcastV2(payload: unknown): void {
    for (const client of scannerClientsV2) {
      sendJson(client, payload);
    }
  }

  function cacheSignal(signal: OverlaySignal): void {
    signals.delete(signal.mint);
    signals.set(signal.mint, signal);

    while (signals.size > maxSignalCacheSize) {
      const oldestMint = signals.keys().next().value;

      if (!oldestMint) {
        return;
      }

      signals.delete(oldestMint);
    }
  }

  function enrichCandidate(candidate: CandidateState):
    | CandidateState
    | (CandidateState & {
        actualData?: ActualDataCandidateSummary;
        identity?: TokenIdentitySummary;
      }) {
    const actualDataSummary = actualData.getCandidateSummary(candidate.mint);
    const identity =
      candidate.identity ?? getTokenIdentitySummary(candidate.mint);

    return {
      ...candidate,
      ...(actualDataSummary ? { actualData: actualDataSummary } : {}),
      ...(identity ? { identity } : {})
    };
  }

  function enrichMetricsWithIdentity<T extends { mint: string }>(
    metrics: T
  ): T & { identity?: TokenIdentitySummary } {
    const identity = getTokenIdentitySummary(metrics.mint);

    return identity
      ? {
          ...metrics,
          identity
        }
      : metrics;
  }

  function enrichRowWithIdentity<T extends { mint: string }>(
    row: T
  ): T & { identity?: TokenIdentitySummary } {
    const identity = getTokenIdentitySummary(row.mint);

    return identity
      ? {
          ...row,
          identity
        }
      : row;
  }

  function getTokenIdentitySummary(
    mint: string
  ): TokenIdentitySummary | undefined {
    const identity = tokenIdentity.getIdentity(mint);
    return identity ? toTokenIdentitySummary(identity) : undefined;
  }

  function sendJson(socket: WebSocket, payload: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function saveLightningPlan(plan: LightningTradePlan): void {
    saveLightningTradePlan({
      planId: plan.id,
      mint: plan.mint,
      action: plan.request.action,
      amountSol: plan.amountSol,
      mode: plan.mode,
      blocked: plan.blocked,
      blockers: plan.blockers,
      warnings: plan.warnings,
      request: plan.request,
      payload: {
        ...plan,
        noTransactionSent: true,
        paperOnly: true,
        tradingDisabled: true
      },
      createdAt: plan.createdAt
    });
  }

  if (options.startFeed) {
    startFeed();
  }

  return {
    actualData,
    app,
    candidates: candidateEngine,
    chainEvents,
    close: () => app.close(),
    discoveryCoverage,
    tradeDataCoverage,
    emitFeedEvent: handleFeedEvent,
    feed,
    getSignals: () => Array.from(signals.values()),
    indexerAdapter,
    launchScanner,
    calibrationCapture,
    paperStrategyEvaluation,
    paperLifecycleValidation,
    paperAutomation,
    paperOperations,
    paperForwardEvaluation,
    scannerProjectionV2,
    meteredLaunchData,
    metrics: metricsEngine,
    pumpPortalDataWallet,
    pumpPortalWallets,
    runtimeControl,
    lightningReadiness,
    watchedWalletExit,
    paperPortfolio,
    risk: riskEngine,
    chainVerifier,
    liveTokens,
    watchOrchestration,
    startFeed,
    stopFeed,
    storage,
    tokenIdentity
  };
}

function sendDeprecatedTrackingRoute(
  reply: FastifyReply,
  canonicalRoute: string
) {
  return reply.code(410).send({
    error: "TRACKING_ROUTE_DEPRECATED",
    message: `This mutation route no longer owns subscription policy. Use ${canonicalRoute}.`,
    canonicalRoute,
    canonicalOwner: "MeteredLaunchDataService",
    paperOnly: true,
    dataOnly: true,
    tradingDisabled: true
  });
}

function safeDiscoveryErrorClass(error: unknown): string {
  return error instanceof Error && error.name
    ? error.name.toUpperCase()
    : "UNKNOWN_ERROR";
}

function toLiveCardCompleteness(
  token: LiveTokenState
): LiveCardDataCompleteness {
  const unavailableFieldCount = token.dataCompleteness.unavailableFields.length;
  const missingCriticalFields = token.dataCompleteness.missingFields;

  return {
    requiredFieldCount: 4,
    availableFieldCount: Math.round(
      (token.dataCompleteness.completenessPct / 100) * 4
    ),
    unavailableFieldCount,
    completenessPct: token.dataCompleteness.completenessPct,
    missingCriticalFields,
    missingOptionalFields: token.dataCompleteness.unavailableFields,
    dataQualityLabel: token.dataCompleteness.label,
    reasonCodes: uniqueReasonCodes([
      `DATA_QUALITY_${token.dataCompleteness.label.toUpperCase()}`,
      "INDEXER_LIVE_STATE_CARD"
    ])
  };
}

function createIndexerStrategyExplanation(
  token: LiveTokenState
): StrategySignalExplanation {
  return {
    strategyName: "paper-momentum-risk-v1",
    score: 0,
    action: "IGNORE",
    signalStrength: "none",
    components: {
      momentumScore: 0,
      qualityScore: 0,
      riskPenalty: 0,
      liquidityPenalty: 0,
      concentrationPenalty: 0,
      missingDataPenalty:
        token.dataCompleteness.missingFields.length +
        token.dataCompleteness.unavailableFields.length
    },
    positiveDrivers: [],
    negativeDrivers: [],
    blockers: [
      {
        reasonCode: "INDEXER_FOUNDATION_ONLY",
        label: "Indexer foundation only",
        value: true
      }
    ],
    calculationInputs: {
      volumeVelocity: null,
      volumeAcceleration: null,
      priceVelocity: null,
      priceAcceleration: null,
      buyerVelocity: null,
      buyerAcceleration: null,
      holderVelocity: null,
      holderAcceleration: null
    },
    lastUpdatedAt: token.lastSeenAt
  };
}

function toTokenIdentityDataSource(source: string): TokenIdentityDataSource {
  if (
    source === "pumpportal" ||
    source === "solana_metadata" ||
    source === "offchain_metadata" ||
    source === "dexscreener" ||
    source === "jupiter_price" ||
    source === "manual" ||
    source === "mock"
  ) {
    return source;
  }

  return "unknown";
}

function createRiskInput(options: {
  candidate: CandidateState;
  chainRiskPatch?: ChainVerificationRecord["riskInputPatch"];
  event: FeedEvent | undefined;
  metrics: RollingMetrics;
  rollingMetrics: RollingMetricsSnapshot | undefined;
}): RiskInput {
  const riskFlags = options.event
    ? getRiskFlags(options.event)
    : options.candidate.latestRisk
      ? createRiskFlagsFromSnapshot(options.candidate.latestRisk)
      : createFallbackRiskFlags();
  const rolling = options.rollingMetrics;
  const source = options.candidate.source ?? options.event?.source ?? "unknown";
  const scenario = getMockScenario(source);
  const incompleteRealFeed =
    options.event?.source === "pumpportal" &&
    (options.event.metricsComplete === false ||
      options.event.reasonCodes?.includes("PUMPPORTAL_TOKEN_TRADE") === true);

  const input: RiskInput = {
    mint: options.candidate.mint,
    source,
    mintAuthorityActive: incompleteRealFeed
      ? null
      : riskFlags.mintAuthorityActive,
    freezeAuthorityActive: incompleteRealFeed
      ? null
      : riskFlags.freezeAuthorityActive,
    metadataMutable: incompleteRealFeed ? null : riskFlags.mutableMetadata,
    holderCount: incompleteRealFeed ? null : options.metrics.holderCount,
    topHolderPct: incompleteRealFeed ? null : options.metrics.topHolderPercent,
    top10HolderPct: incompleteRealFeed
      ? null
      : options.metrics.top10HolderPercent,
    devHolderPct: incompleteRealFeed ? null : mockDevHolderPct(scenario),
    insiderHolderPct: incompleteRealFeed
      ? null
      : mockInsiderHolderPct(scenario),
    devSoldPct: incompleteRealFeed ? null : mockDevSoldPct(scenario),
    devNetFlowUsd: incompleteRealFeed ? null : mockDevNetFlowUsd(scenario),
    priorLaunchCount: incompleteRealFeed
      ? null
      : mockPriorLaunchCount(scenario),
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
      rolling?.insufficientMetrics ??
      (options.event?.metricsComplete === false ? true : null),
    liquidityUsd: incompleteRealFeed ? null : options.metrics.liquidityUsd,
    marketCapUsd: incompleteRealFeed ? null : options.metrics.marketCapUsd,
    fdvUsd: incompleteRealFeed ? null : options.metrics.marketCapUsd,
    estimatedSellSlippagePct: incompleteRealFeed
      ? null
      : mockSellSlippagePct(scenario, riskFlags),
    sniperPct: incompleteRealFeed ? null : mockSniperPct(scenario),
    bundlerPct: incompleteRealFeed ? null : mockBundlerPct(scenario),
    washTradingSuspected: incompleteRealFeed
      ? null
      : riskFlags.washTradingSuspected,
    honeypotSuspected: incompleteRealFeed ? null : riskFlags.honeypotSuspected
  };

  if (options.candidate.symbol) {
    input.symbol = options.candidate.symbol;
  }

  if (options.candidate.name) {
    input.name = options.candidate.name;
  }

  return mergeChainRiskPatch(input, options.chainRiskPatch);
}

function createTokenCandidateFromState(state: CandidateState): TokenCandidate {
  return {
    id: {
      chain: "solana",
      mint: state.mint
    },
    mint: state.mint,
    symbol: state.symbol ?? "UNKNOWN",
    name: state.name ?? state.symbol ?? "Unknown Token",
    source: state.source ?? "unknown",
    ageSeconds: state.ageSeconds,
    firstSeenAt: state.firstSeenAt,
    ...(state.title ? { title: state.title } : {}),
    ...(state.displayName ? { displayName: state.displayName } : {}),
    ...(state.metadataUri !== undefined
      ? { metadataUri: state.metadataUri }
      : {}),
    ...(state.imageUri !== undefined ? { imageUri: state.imageUri } : {}),
    ...(state.description !== undefined
      ? { description: state.description }
      : {}),
    ...(state.website !== undefined ? { website: state.website } : {}),
    ...(state.twitter !== undefined ? { twitter: state.twitter } : {}),
    ...(state.telegram !== undefined ? { telegram: state.telegram } : {}),
    ...(state.discord !== undefined ? { discord: state.discord } : {}),
    ...(state.creator !== undefined ? { creator: state.creator } : {})
  };
}

function getLegacyMetrics(event: FeedEvent): RollingMetrics {
  return event.type === "account_trade"
    ? createEmptyLegacyMetrics()
    : event.metrics;
}

function getLiveFeedEventType(event: FeedEvent): string {
  return event.type === "token_created" &&
    event.rawSourceEventType?.toLowerCase().includes("migr")
    ? "migration"
    : "new_token";
}

function getRiskFlags(event: FeedEvent): RiskFlags {
  return event.type === "account_trade"
    ? createFallbackRiskFlags()
    : event.riskFlags;
}

function sendPaperStrategyEvaluationError(reply: FastifyReply, error: unknown) {
  if (error instanceof PaperStrategyEvaluationServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
  }

  throw error;
}

function sendPaperLifecycleValidationError(
  reply: FastifyReply,
  error: unknown
) {
  if (error instanceof PaperLifecycleValidationServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      automaticThresholdActivation: false,
      automaticPaperTradingActivation: false,
      automaticLiveExecution: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
  }

  throw error;
}

function sendCalibrationCaptureError(reply: FastifyReply, error: unknown) {
  if (error instanceof CalibrationCaptureServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    });
  }

  throw error;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 120) || "capture";
}

function sendWatchedWalletExitError(reply: FastifyReply, error: unknown) {
  if (error instanceof WatchedWalletExitServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      reasonCodes: error.reasonCodes,
      paperOnly: true,
      liveExecutionDisabled: true
    });
  }

  throw error;
}

function sendPaperPortfolioError(reply: FastifyReply, error: unknown) {
  if (error instanceof PaperPortfolioServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      reasonCodes: error.reasonCodes,
      paperOnly: true,
      liveExecutionDisabled: true
    });
  }

  throw error;
}

function sendPaperAutomationError(reply: FastifyReply, error: unknown) {
  if (error instanceof PaperAutomationServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      reasonCodes: error.reasonCodes,
      automaticLiveExecution: false,
      paperOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
  }

  throw error;
}

function sendPaperOperationsError(reply: FastifyReply, error: unknown) {
  if (error instanceof PaperOperationsServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      reasonCodes: error.reasonCodes,
      automaticMeteredStart: false,
      automaticPaperArm: false,
      automaticLiveExecution: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
  }

  throw error;
}

function sendPaperForwardEvaluationError(reply: FastifyReply, error: unknown) {
  if (error instanceof PaperForwardEvaluationServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      reasonCodes: error.reasonCodes,
      manualReviewRequired: true,
      automaticLivePromotion: false,
      automaticLiveExecution: false,
      privateKeyAccess: false,
      transactionSigning: false,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      liveExecutionDisabled: true
    });
  }

  throw error;
}

function createPendingChainVerificationSummary(
  mint: string,
  inspectedAt: string
): ChainVerificationSummary {
  return {
    mint,
    status: "pending",
    reasonCodes: ["CHAIN_VERIFICATION_PENDING"],
    inspectedAt
  };
}

function withChainReasonCodes(
  snapshot: RiskSnapshot,
  reasonCodes: string[]
): RiskSnapshot {
  return {
    ...snapshot,
    reasonCodes: uniqueReasonCodes([...snapshot.reasonCodes, ...reasonCodes])
  };
}

function fallbackMetricsFromCandidate(
  candidate: CandidateState
): RollingMetrics {
  const metrics = candidate.latestMetrics;

  if (!metrics) {
    return createEmptyLegacyMetrics();
  }

  return {
    priceUsd: metrics.latestPriceUsd,
    priceSol: metrics.latestPriceSol ?? null,
    marketCapUsd: 0,
    liquidityUsd: 0,
    volume1mUsd: metrics.windows["60s"].totalVolumeUsd,
    volume5mUsd: metrics.windows["60s"].totalVolumeUsd,
    volume15mUsd: metrics.windows["60s"].totalVolumeUsd,
    volumeSol: metrics.windows["60s"].totalVolumeSol ?? null,
    buyCount1m: metrics.windows["60s"].buyTradeCount,
    buyCount5m: metrics.windows["60s"].buyTradeCount,
    sellCount1m: metrics.windows["60s"].sellTradeCount,
    sellCount5m: metrics.windows["60s"].sellTradeCount,
    uniqueBuyers1m: metrics.windows["60s"].uniqueBuyers,
    uniqueBuyers5m: metrics.windows["60s"].uniqueBuyers,
    uniqueSellers1m: metrics.windows["60s"].uniqueSellers,
    uniqueSellers5m: metrics.windows["60s"].uniqueSellers,
    holderCount: 0,
    topHolderPercent: 0,
    top10HolderPercent: 0,
    priceChange1mPct: metrics.windows["60s"].priceChangePct,
    priceChange5mPct: metrics.windows["10s"].priceChangePct,
    volumeVelocity: Math.max(0, metrics.volumeVelocityUsdPerSec),
    buyerVelocity: Math.max(0, metrics.buyerVelocityPerSec)
  };
}

function createEmptyLegacyMetrics(): RollingMetrics {
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

function createFallbackRiskFlags(): RiskFlags {
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

function createRiskFlagsFromSnapshot(snapshot: RiskSnapshot): RiskFlags {
  return {
    mintAuthorityActive: snapshot.flags.mintAuthorityActive === true,
    freezeAuthorityActive: snapshot.flags.freezeAuthorityActive === true,
    topHolderConcentrationHigh:
      snapshot.reasonCodes.includes("TOP_HOLDER_TOO_HIGH") ||
      snapshot.reasonCodes.includes("TOP10_HOLDER_TOO_HIGH") ||
      snapshot.reasonCodes.includes("HOLDER_CONCENTRATION_ELEVATED"),
    mutableMetadata: snapshot.flags.metadataMutable === true,
    suspiciousName: false,
    lowLiquidity: snapshot.reasonCodes.includes("LIQUIDITY_TOO_LOW"),
    washTradingSuspected: snapshot.flags.washTradingSuspected === true,
    honeypotSuspected: snapshot.flags.honeypotSuspected === true
  };
}

function mergeChainRiskPatch(
  input: RiskInput,
  patch: ChainVerificationRecord["riskInputPatch"] | undefined
): RiskInput {
  if (!patch) {
    return input;
  }

  return {
    ...input,
    estimatedSellSlippagePct:
      patch.estimatedSellSlippagePct ?? input.estimatedSellSlippagePct,
    freezeAuthorityActive:
      patch.freezeAuthorityActive ?? input.freezeAuthorityActive,
    holderCount: patch.holderCount ?? input.holderCount,
    liquidityUsd: patch.liquidityUsd ?? input.liquidityUsd,
    mintAuthorityActive: patch.mintAuthorityActive ?? input.mintAuthorityActive,
    top10HolderPct: patch.top10HolderPct ?? input.top10HolderPct,
    topHolderPct: patch.topHolderPct ?? input.topHolderPct
  };
}

function signalActionFromDecision(
  decision: CandidateDecision
): OverlaySignal["action"] {
  if (decision.action === "REJECT") {
    return "HARD_REJECT";
  }

  if (
    decision.action === "PAPER_BUY_READY" ||
    decision.action === "PAPER_ORDER_SUBMITTED"
  ) {
    return "BUY_READY";
  }

  return decision.action;
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

function mockDevHolderPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
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

function mockDevSoldPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 65 : 0;
}

function mockDevNetFlowUsd(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
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

function mockPriorRugCount(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
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

function mockSniperPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 30 : scenario === "momentum" ? 4 : 9;
}

function mockBundlerPct(
  scenario: ReturnType<typeof getMockScenario>
): number | null {
  if (scenario === "unknown" || scenario === "flat") {
    return null;
  }

  return scenario === "rug" ? 26 : scenario === "momentum" ? 3 : 7;
}

function getEffectiveVolumeVelocity(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? (metrics.volumeVelocitySolPerSec ?? 0)
    : metrics.volumeVelocityUsdPerSec;
}

function getEffectiveVolumeAcceleration(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? (metrics.volumeAccelerationSolPerSec2 ?? 0)
    : metrics.volumeAccelerationUsdPerSec2;
}

function getEffectivePriceVelocity(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? (metrics.priceSolVelocityPctPerSec ?? 0)
    : metrics.priceVelocityPctPerSec;
}

function getEffectivePriceAcceleration(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? (metrics.priceSolAccelerationPctPerSec2 ?? 0)
    : metrics.priceAccelerationPctPerSec2;
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

function applyCanonicalDerivativesToRollingMetrics(
  metrics: RollingMetricsSnapshot | undefined,
  derivatives: ReturnType<IndexerAdapter["getDerivatives"]>
): RollingMetricsSnapshot | undefined {
  if (!metrics || derivatives.observationCount === 0) {
    return metrics;
  }

  const canonical = derivatives.primary;
  const values = canonical.metrics;

  return {
    ...metrics,
    volumeVelocityUsdPerSec:
      values.volumeVelocityUsdPerSec.value ?? metrics.volumeVelocityUsdPerSec,
    volumeAccelerationUsdPerSec2:
      values.volumeAccelerationUsdPerSec2.value ??
      metrics.volumeAccelerationUsdPerSec2,
    volumeVelocitySolPerSec:
      values.volumeVelocitySolPerSec.value ?? metrics.volumeVelocitySolPerSec,
    volumeAccelerationSolPerSec2:
      values.volumeAccelerationSolPerSec2.value ??
      metrics.volumeAccelerationSolPerSec2,
    buyerVelocityPerSec:
      values.buyerVelocityPerSec.value ?? metrics.buyerVelocityPerSec,
    buyerAccelerationPerSec2:
      values.buyerAccelerationPerSec2.value ?? metrics.buyerAccelerationPerSec2,
    tradesPerSecond:
      values.tradeVelocityPerSec.value ?? metrics.tradesPerSecond,
    priceVelocityPctPerSec:
      canonical.priceSource === "USD"
        ? (values.priceVelocityPctPerSec.value ??
          metrics.priceVelocityPctPerSec)
        : metrics.priceVelocityPctPerSec,
    priceAccelerationPctPerSec2:
      canonical.priceSource === "USD"
        ? (values.priceAccelerationPctPerSec2.value ??
          metrics.priceAccelerationPctPerSec2)
        : metrics.priceAccelerationPctPerSec2,
    priceSolVelocityPctPerSec:
      canonical.priceSource === "SOL"
        ? (values.priceVelocityPctPerSec.value ??
          metrics.priceSolVelocityPctPerSec)
        : metrics.priceSolVelocityPctPerSec,
    priceSolAccelerationPctPerSec2:
      canonical.priceSource === "SOL"
        ? (values.priceAccelerationPctPerSec2.value ??
          metrics.priceSolAccelerationPctPerSec2)
        : metrics.priceSolAccelerationPctPerSec2
  };
}

function getUnavailableCardFields(options: {
  metrics: RollingMetricsSnapshot | undefined;
  metricsAvailable: boolean;
  riskSnapshot: RiskSnapshot | undefined;
}): string[] {
  const fields: string[] = [];

  if (!options.metricsAvailable) {
    fields.push(
      "priceSol",
      "priceUsd",
      "priceQuote",
      "quoteAsset",
      "volume1sUsd",
      "volume3sUsd",
      "volume5sUsd",
      "volume10sUsd",
      "volume30sUsd",
      "volume60sUsd",
      "volume1sSol",
      "volume3sSol",
      "volume5sSol",
      "volume10sSol",
      "volume30sSol",
      "volume60sSol",
      "buyVolume10s",
      "sellVolume10s",
      "netVolume10s",
      "buySellRatio",
      "netBuyPressure",
      "uniqueBuyers1s",
      "uniqueBuyers5s",
      "uniqueBuyers10s",
      "uniqueSellers10s",
      "uniqueTraders10s",
      "buyTradeCount10s",
      "sellTradeCount10s",
      "totalTradeCount10s",
      "volumeVelocityUsdPerSec",
      "volumeAccelerationUsdPerSec2",
      "volumeVelocitySolPerSec",
      "volumeAccelerationSolPerSec2",
      "priceVelocityPctPerSec",
      "priceAccelerationPctPerSec2",
      "priceSolVelocityPctPerSec",
      "priceSolAccelerationPctPerSec2",
      "buyerVelocityPerSec",
      "buyerAccelerationPerSec2"
    );
  }

  if (!options.metrics?.hasUsdMetrics) {
    fields.push(
      "priceUsd",
      "volume1sUsd",
      "volume3sUsd",
      "volume5sUsd",
      "volume10sUsd",
      "volume30sUsd",
      "volume60sUsd",
      "volumeVelocityUsdPerSec",
      "volumeAccelerationUsdPerSec2",
      "priceVelocityPctPerSec",
      "priceAccelerationPctPerSec2"
    );
  }

  if (!options.metrics?.hasSolMetrics) {
    fields.push(
      "priceSol",
      "volume1sSol",
      "volume3sSol",
      "volume5sSol",
      "volume10sSol",
      "volume30sSol",
      "volume60sSol",
      "volumeVelocitySolPerSec",
      "volumeAccelerationSolPerSec2",
      "priceSolVelocityPctPerSec",
      "priceSolAccelerationPctPerSec2"
    );
  }

  if (options.riskSnapshot?.flags.marketCapUsd == null) {
    fields.push("marketCapUsd");
  }

  if (options.riskSnapshot?.flags.fdvUsd == null) {
    fields.push("fdvUsd");
  }

  if (options.riskSnapshot?.flags.liquidityUsd == null) {
    fields.push("liquidityUsd");
  }

  if (options.riskSnapshot?.flags.holderCount == null) {
    fields.push("holderCount", "holders");
  }

  if (options.riskSnapshot?.flags.topHolderPct == null) {
    fields.push("topHolderPct");
  }

  if (options.riskSnapshot?.flags.top10HolderPct == null) {
    fields.push("top10HolderPct");
  }

  fields.push("holderVelocityPerSec", "holderAccelerationPerSec2");

  return uniqueReasonCodes(fields);
}

function getMissingCardFields(options: {
  identity: TokenIdentitySummary | undefined;
  token: LiveToken;
}): string[] {
  const fields: string[] = [];

  if (!options.identity?.metadataUri) {
    fields.push("metadataUri");
  }

  if (!options.identity?.imageUri) {
    fields.push("imageUri");
  }

  if (!options.identity?.name && !options.token.name) {
    fields.push("name");
  }

  if (!options.identity?.symbol && !options.token.symbol) {
    fields.push("symbol");
  }

  if (!options.token.latestSignature) {
    fields.push("latestSignature");
  }

  return fields;
}

function buildLiveCardDataCompleteness(options: {
  chainVerificationStatus: LiveTokenCardViewModel["chainVerificationStatus"];
  enrichmentStatus: LiveCardEnrichmentStatusValue;
  freezeAuthorityActive: boolean | null;
  hardReject: boolean;
  holderCount: number | null;
  identity: TokenIdentitySummary | undefined;
  insufficientMetrics: boolean;
  latestPriceSol: number | null;
  latestPriceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  missingFields: string[];
  mintAuthorityActive: boolean | null;
  riskSnapshot: RiskSnapshot | undefined;
  sampleCount: number;
  top10HolderPct: number | null;
  topHolderPct: number | null;
  tradeEventCount: number;
  tradeTrackingState: LiveTradeTrackingState;
  unavailableFields: string[];
  volume10sSol: number | null;
  volume10sUsd: number | null;
}): LiveCardDataCompleteness {
  const criticalFields = [
    {
      available:
        options.identity !== undefined &&
        (options.identity.resolved === true ||
          options.identity.confidence !== "none"),
      name: "identity"
    },
    {
      available:
        options.latestPriceSol !== null || options.latestPriceUsd !== null,
      name: "price"
    },
    {
      available: options.volume10sSol !== null || options.volume10sUsd !== null,
      name: "volume10s"
    },
    { available: options.sampleCount > 0, name: "tradeMetrics" },
    { available: options.holderCount !== null, name: "holderCount" },
    { available: options.topHolderPct !== null, name: "topHolderPct" },
    { available: options.top10HolderPct !== null, name: "top10HolderPct" },
    {
      available: options.mintAuthorityActive !== null,
      name: "mintAuthorityActive"
    },
    {
      available: options.freezeAuthorityActive !== null,
      name: "freezeAuthorityActive"
    }
  ];
  const optionalFields = [
    {
      available: !options.missingFields.includes("metadataUri"),
      name: "metadataUri"
    },
    {
      available: !options.missingFields.includes("imageUri"),
      name: "imageUri"
    },
    { available: options.marketCapUsd !== null, name: "marketCapUsd" },
    { available: options.liquidityUsd !== null, name: "liquidityUsd" },
    {
      available: options.chainVerificationStatus !== "not_checked",
      name: "chainVerification"
    },
    {
      available:
        options.tradeTrackingState === "tracking" ||
        options.tradeEventCount > 0,
      name: "tradeTracking"
    },
    {
      available:
        options.enrichmentStatus === "available" ||
        options.enrichmentStatus === "partial",
      name: "enrichment"
    }
  ];
  const allFields = [...criticalFields, ...optionalFields];
  const availableFieldCount = allFields.filter(
    (field) => field.available
  ).length;
  const unavailableFieldCount = allFields.length - availableFieldCount;
  const missingCriticalFields = criticalFields
    .filter((field) => !field.available)
    .map((field) => field.name);
  const missingOptionalFields = optionalFields
    .filter((field) => !field.available)
    .map((field) => field.name);
  const dataQualityLabel =
    !options.insufficientMetrics &&
    options.sampleCount >= 8 &&
    options.riskSnapshot !== undefined
      ? "strategy_ready"
      : options.enrichmentStatus === "available" ||
          options.enrichmentStatus === "partial"
        ? "enriched"
        : options.tradeEventCount > 0 ||
            options.tradeTrackingState === "tracking" ||
            options.sampleCount > 0
          ? "trade_tracked"
          : options.latestPriceSol !== null ||
              options.latestPriceUsd !== null ||
              options.liquidityUsd !== null
            ? "partial_market"
            : "discovery_only";

  return {
    availableFieldCount,
    completenessPct: Math.round((availableFieldCount / allFields.length) * 100),
    dataQualityLabel,
    missingCriticalFields,
    missingOptionalFields,
    reasonCodes: uniqueReasonCodes([
      `DATA_QUALITY_${dataQualityLabel.toUpperCase()}`,
      ...(missingCriticalFields.length > 0
        ? ["CRITICAL_CARD_FIELDS_UNAVAILABLE"]
        : []),
      ...(missingOptionalFields.length > 0
        ? ["OPTIONAL_CARD_FIELDS_UNAVAILABLE"]
        : []),
      ...(options.unavailableFields.length > 0
        ? ["CARD_FIELDS_UNAVAILABLE"]
        : []),
      ...(options.hardReject ? ["RISK_HARD_REJECT"] : [])
    ]),
    requiredFieldCount: allFields.length,
    unavailableFieldCount
  };
}

function buildStrategyExplanation(options: {
  action: string;
  calculationReasonCodes: string[];
  hardReject: boolean;
  metrics: RollingMetricsSnapshot | undefined;
  riskSnapshot: RiskSnapshot | undefined;
  score: ScoreBreakdown | undefined;
  signalStrength: SignalStrength;
  updatedAt: string | null;
}): StrategySignalExplanation {
  const volumeVelocity = getEffectiveVolumeVelocity(options.metrics) ?? null;
  const volumeAcceleration =
    getEffectiveVolumeAcceleration(options.metrics) ?? null;
  const priceVelocity = getEffectivePriceVelocity(options.metrics) ?? null;
  const priceAcceleration =
    getEffectivePriceAcceleration(options.metrics) ?? null;
  const positiveDrivers = createPositiveDrivers({
    metrics: options.metrics,
    volumeAcceleration,
    volumeVelocity,
    priceVelocity
  });
  const negativeDrivers = createNegativeDrivers({
    calculationReasonCodes: options.calculationReasonCodes,
    riskSnapshot: options.riskSnapshot
  });
  const blockers = createStrategyBlockers({
    hardReject: options.hardReject,
    metrics: options.metrics,
    riskSnapshot: options.riskSnapshot
  });
  const concentrationPenalty =
    options.riskSnapshot?.reasonCodes.some((code) =>
      [
        "HOLDER_CONCENTRATION_ELEVATED",
        "TOP_HOLDER_TOO_HIGH",
        "TOP10_HOLDER_TOO_HIGH"
      ].includes(code)
    ) === true
      ? 18
      : 0;
  const liquidityPenalty =
    options.riskSnapshot?.reasonCodes.includes("LIQUIDITY_TOO_LOW") === true
      ? 12
      : 0;
  const missingDataPenalty =
    options.metrics === undefined || options.metrics.insufficientMetrics
      ? 10
      : 0;

  return {
    strategyName: "paper-momentum-risk-v1",
    score: options.score?.total ?? 0,
    action: options.action,
    signalStrength: options.signalStrength,
    components: {
      momentumScore: options.score?.momentum ?? 0,
      qualityScore: options.score?.quality ?? 0,
      riskPenalty: options.score?.riskPenalty ?? 0,
      liquidityPenalty,
      concentrationPenalty,
      missingDataPenalty
    },
    positiveDrivers,
    negativeDrivers,
    blockers,
    calculationInputs: {
      volumeVelocity,
      volumeAcceleration,
      priceVelocity,
      priceAcceleration,
      buyerVelocity: options.metrics?.buyerVelocityPerSec ?? null,
      buyerAcceleration: options.metrics?.buyerAccelerationPerSec2 ?? null,
      holderVelocity: null,
      holderAcceleration: null
    },
    lastUpdatedAt: options.updatedAt
  };
}

function createPositiveDrivers(options: {
  metrics: RollingMetricsSnapshot | undefined;
  priceVelocity: number | null;
  volumeAcceleration: number | null;
  volumeVelocity: number | null;
}): StrategySignalDriver[] {
  const drivers: StrategySignalDriver[] = [];

  if (options.volumeVelocity !== null && options.volumeVelocity > 0) {
    drivers.push({
      reasonCode: "VOLUME_VELOCITY",
      label: "Volume velocity",
      value: options.volumeVelocity
    });
  }

  if (options.volumeAcceleration !== null && options.volumeAcceleration > 0) {
    drivers.push({
      reasonCode: "VOLUME_ACCELERATION",
      label: "Volume acceleration",
      value: options.volumeAcceleration
    });
  }

  if (
    options.metrics?.buyerVelocityPerSec !== undefined &&
    options.metrics.buyerVelocityPerSec > 0
  ) {
    drivers.push({
      reasonCode: "BUYER_VELOCITY",
      label: "Buyer velocity",
      value: options.metrics.buyerVelocityPerSec
    });
  }

  if (
    options.metrics?.buyerAccelerationPerSec2 !== undefined &&
    options.metrics.buyerAccelerationPerSec2 > 0
  ) {
    drivers.push({
      reasonCode: "BUYER_ACCELERATION",
      label: "Buyer acceleration",
      value: options.metrics.buyerAccelerationPerSec2
    });
  }

  if (options.priceVelocity !== null && options.priceVelocity > 0) {
    drivers.push({
      reasonCode: "PRICE_VELOCITY",
      label: "Price velocity",
      value: options.priceVelocity
    });
  }

  return drivers;
}

function createNegativeDrivers(options: {
  calculationReasonCodes: string[];
  riskSnapshot: RiskSnapshot | undefined;
}): StrategySignalDriver[] {
  return uniqueReasonCodes([
    ...(options.riskSnapshot?.reasonCodes ?? []),
    ...options.calculationReasonCodes.filter(
      (code) => code.includes("UNAVAILABLE") || code.includes("INSUFFICIENT")
    )
  ])
    .slice(0, 12)
    .map((reasonCode) => ({
      reasonCode,
      label: getReasonLabel(reasonCode),
      value: null
    }));
}

function createStrategyBlockers(options: {
  hardReject: boolean;
  metrics: RollingMetricsSnapshot | undefined;
  riskSnapshot: RiskSnapshot | undefined;
}): StrategySignalDriver[] {
  const blockers: StrategySignalDriver[] = [];

  if (options.hardReject) {
    blockers.push({
      reasonCode: "HARD_REJECT",
      label: "Hard reject",
      value: true
    });
  }

  if (options.riskSnapshot?.riskLevel === "critical") {
    blockers.push({
      reasonCode: "RISK_LEVEL_CRITICAL",
      label: "Critical risk",
      value: options.riskSnapshot.riskLevel
    });
  }

  if (!options.metrics || options.metrics.insufficientMetrics) {
    blockers.push({
      reasonCode: "INSUFFICIENT_TRADE_METRICS",
      label: "Insufficient trade metrics",
      value: options.metrics?.sampleCount ?? 0
    });
  }

  return blockers;
}

function getSignalStrength(options: {
  action: string;
  hardReject: boolean;
  riskLevel: RiskSnapshot["riskLevel"] | undefined;
  score: number;
}): SignalStrength {
  if (
    options.hardReject ||
    options.riskLevel === "critical" ||
    options.action === "REJECT"
  ) {
    return "reject";
  }

  if (options.score >= 75) {
    return "strong";
  }

  if (options.score >= 60) {
    return "moderate";
  }

  if (options.score >= 35) {
    return "weak";
  }

  return "none";
}

function getCalculationConfidence(
  metrics: RollingMetricsSnapshot | undefined
): ObservationConfidence {
  if (!metrics || metrics.sampleCount === 0) {
    return "low";
  }

  if (metrics.sampleCount >= 8) {
    return "high";
  }

  if (metrics.sampleCount >= 3) {
    return "medium";
  }

  return "low";
}

function getTopRiskWarnings(riskSnapshot: RiskSnapshot | undefined): string[] {
  if (!riskSnapshot) {
    return ["RISK_DATA_UNAVAILABLE"];
  }

  return riskSnapshot.reasonCodes
    .filter(
      (code) =>
        code.includes("RISK") ||
        code.includes("AUTHORITY") ||
        code.includes("LIQUIDITY") ||
        code.includes("HOLDER") ||
        code.includes("HONEYPOT") ||
        code.includes("WASH")
    )
    .slice(0, 4);
}

function getLiquidityRisk(riskSnapshot: RiskSnapshot | undefined): string {
  if (!riskSnapshot || riskSnapshot.flags.liquidityUsd === null) {
    return "unknown";
  }

  return riskSnapshot.reasonCodes.includes("LIQUIDITY_TOO_LOW")
    ? "high"
    : "low";
}

function getConcentrationRisk(riskSnapshot: RiskSnapshot | undefined): string {
  if (
    !riskSnapshot ||
    (riskSnapshot.flags.topHolderPct === null &&
      riskSnapshot.flags.top10HolderPct === null)
  ) {
    return "unknown";
  }

  return riskSnapshot.reasonCodes.some((code) =>
    [
      "HOLDER_CONCENTRATION_ELEVATED",
      "TOP_HOLDER_TOO_HIGH",
      "TOP10_HOLDER_TOO_HIGH"
    ].includes(code)
  )
    ? "high"
    : "low";
}

function getHolderDataSource(
  candidate: CandidateState | undefined,
  riskSnapshot: RiskSnapshot | undefined
): string | null {
  if (
    candidate?.onChainTopHolderPct !== null &&
    candidate?.onChainTopHolderPct !== undefined
  ) {
    return "chain_verification";
  }

  if (
    riskSnapshot?.flags.holderCount !== null &&
    riskSnapshot?.flags.holderCount !== undefined
  ) {
    return "risk_snapshot";
  }

  return null;
}

function getAgeSeconds(firstSeenAt: string, nowMs: number): number {
  const firstSeenMs = Date.parse(firstSeenAt);

  if (!Number.isFinite(firstSeenMs)) {
    return 0;
  }

  return Math.max(0, Math.round((nowMs - firstSeenMs) / 1000));
}

function getFreshnessMs(
  timestamp: string | null | undefined,
  nowMs: number
): number | null {
  if (!timestamp) {
    return null;
  }

  const timestampMs = Date.parse(timestamp);

  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return Math.max(0, nowMs - timestampMs);
}

function createTokenTitle(
  symbol: string | undefined,
  name: string | undefined,
  mint: string
): string {
  if (symbol && name) {
    return `${symbol} - ${name}`;
  }

  return name ?? symbol ?? shortMint(mint);
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 8)}...${mint.slice(-6)}`;
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return numberOrNull(value);
}

function chooseDerivativeValue(
  hasEnoughSamples: boolean,
  primary: number | null | undefined,
  fallback: number | null | undefined
): number | null {
  if (!hasEnoughSamples) {
    return null;
  }

  return finiteOrNull(primary) ?? finiteOrNull(fallback);
}

function createMomentumDerivativeStrengthFallback(
  derivatives: MomentumScannerRow["derivatives"],
  options: {
    ageSeconds: number;
    freshnessMs: number | null;
    sampleCount: number;
  }
): MomentumScannerRow["derivativeStrength"] {
  const normalize = (
    metric: DerivativeStrengthMetricName,
    rawValue: number | null
  ) =>
    normalizeDerivativeStrength({
      metric,
      rawValue,
      ageSeconds: options.ageSeconds,
      availabilityStatus:
        rawValue === null ? "source_unavailable" : "available",
      sampleCount: options.sampleCount,
      windowMs: 10_000,
      freshnessMs: options.freshnessMs
    });
  const volume = normalize("volume_velocity_sol", derivatives.dVol10sSolPerSec);
  const volumeAcceleration = normalize(
    "volume_acceleration_sol",
    derivatives.d2VolSolPerSec2
  );
  const price = normalize("price_velocity_pct", derivatives.dPricePctPerSec);
  const priceAcceleration = normalize(
    "price_acceleration_pct",
    derivatives.d2PricePctPerSec2
  );
  const priceSol = normalize("price_velocity_sol", derivatives.dPriceSolPerSec);
  const buyers = normalize("buyer_velocity", derivatives.dBuyersPerSec);
  const buyerAcceleration = normalize(
    "buyer_acceleration",
    derivatives.d2BuyersPerSec2
  );
  const trades = normalize("trade_velocity", derivatives.dTradesPerSec);
  const buyPressure = normalize(
    "buy_pressure_velocity",
    derivatives.dBuyPressurePerSec
  );
  const marketCap = normalize(
    "market_cap_velocity_sol",
    derivatives.dMarketCapSolPerSec
  );
  const liquidity = normalize(
    "liquidity_velocity_sol",
    derivatives.dLiquiditySolPerSec
  );
  const score = scoreLaunchDerivativeSignal({
    featureScores: {
      volumeVelocity: volume.positiveScore,
      volumeAcceleration: volumeAcceleration.positiveScore,
      priceVelocity: price.positiveScore,
      priceAcceleration: priceAcceleration.positiveScore,
      buyerVelocity: buyers.positiveScore,
      buyerAcceleration: buyerAcceleration.positiveScore,
      tradeVelocity: trades.positiveScore,
      buyPressure: buyPressure.positiveScore
    },
    tradeSampleCount: options.sampleCount,
    sellPressure: (derivatives.dBuyPressurePerSec ?? 0) < 0 ? "mild" : "none",
    riskLevel: "unknown",
    hardReject: false
  });
  const combinedDerivativeScore = {
    ...score,
    reasonCodes: uniqueReasonCodes([
      ...score.reasonCodes,
      ...derivatives.reasonCodes,
      ...(score.totalScore > 0
        ? ["DERIVATIVE_SCORE_CANONICAL_STRENGTH_FALLBACK"]
        : ["DERIVATIVE_SCORE_UNAVAILABLE"])
    ])
  };

  return {
    volume,
    volumeAcceleration,
    price,
    priceAcceleration,
    priceSol,
    buyers,
    buyerAcceleration,
    trades,
    buyPressure,
    marketCap,
    liquidity,
    combinedDerivativeScore
  };
}

function roundScore(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function createMomentumSparkline(
  samples: Array<{ priceSol: number; t: string; volumeSol: number | null }>,
  options: {
    label: string;
    source: MomentumScannerRow["sparkline"]["source"];
    windowSeconds: number;
  }
): MomentumScannerRow["sparkline"] {
  const sorted = [...samples]
    .filter(
      (sample) =>
        Number.isFinite(sample.priceSol) &&
        sample.priceSol > 0 &&
        !Number.isNaN(Date.parse(sample.t))
    )
    .sort((left, right) => Date.parse(left.t) - Date.parse(right.t))
    .slice(-24);

  if (sorted.length < 2) {
    return {
      points: [],
      direction: "unavailable",
      priceChangePct: null,
      windowSeconds: options.windowSeconds,
      source: options.source,
      label: options.label,
      reasonCodes: uniqueReasonCodes([
        "INSUFFICIENT_PRICE_SAMPLES",
        ...(options.source === "curve_marks"
          ? ["INSUFFICIENT_CURVE_MARK_SAMPLES"]
          : []),
        ...(sorted.length === 0 ? ["NO_TRADE_EVENTS"] : [])
      ])
    };
  }

  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const priceChangePct =
    first.priceSol > 0
      ? ((last.priceSol - first.priceSol) / first.priceSol) * 100
      : null;
  const roundedChange =
    priceChangePct === null ? null : Math.round(priceChangePct * 1000) / 1000;

  return {
    points: sorted.map((sample) => ({
      t: sample.t,
      priceSol: sample.priceSol,
      volumeSol: sample.volumeSol
    })),
    direction:
      roundedChange === null
        ? "unavailable"
        : roundedChange > 0
          ? "up"
          : roundedChange < 0
            ? "down"
            : "flat",
    priceChangePct: roundedChange,
    windowSeconds: options.windowSeconds,
    source: options.source,
    label: options.label,
    reasonCodes: uniqueReasonCodes([
      options.source === "curve_marks"
        ? "SPARKLINE_CURVE_MARKS"
        : "SPARKLINE_REAL_TRADE_SAMPLES"
    ])
  };
}

function emptyMomentumCurveData(): MomentumScannerRow["curve"] {
  return {
    associatedBondingCurve: null,
    bondingCurve: null,
    curveLiquiditySol: null,
    curveMarketCapSol: null,
    curvePriceSol: null,
    curveReasonCodes: ["CURVE_RESERVES_UNAVAILABLE"],
    curveSol: null,
    curveSource: null,
    curveTokens: null,
    realSolReserves: null,
    realTokenReserves: null,
    virtualSolReserves: null,
    virtualTokenReserves: null
  };
}

function buildMomentumCurveData(input: {
  associatedBondingCurve: string | null;
  bondingCurveKey: string | null;
  marketCapSol: number | null;
  realSolReserves: number | null;
  realTokenReserves: number | null;
  vSolInBondingCurve: number | null;
  vTokensInBondingCurve: number | null;
  virtualSolReserves: number | null;
  virtualTokenReserves: number | null;
}): MomentumScannerRow["curve"] {
  const reasonCodes: string[] = [];
  const virtualSolReserves =
    finiteOrNull(input.virtualSolReserves) ??
    finiteOrNull(input.vSolInBondingCurve);
  const virtualTokenReserves =
    finiteOrNull(input.virtualTokenReserves) ??
    finiteOrNull(input.vTokensInBondingCurve);
  const realSolReserves = finiteOrNull(input.realSolReserves);
  const realTokenReserves = finiteOrNull(input.realTokenReserves);
  const curveSol = normalizeCurveSolReserve(
    virtualSolReserves ?? realSolReserves,
    reasonCodes
  );
  const curveTokens = normalizeCurveTokenReserve(
    virtualTokenReserves ?? realTokenReserves,
    reasonCodes
  );
  const curveLiquiditySol = curveSol;
  const curvePriceSol =
    curveSol !== null && curveTokens !== null && curveTokens > 0
      ? roundFinite(curveSol / curveTokens, 15)
      : null;
  const curveMarketCapSol = finiteOrNull(input.marketCapSol);

  if (curvePriceSol !== null) {
    reasonCodes.push("CURVE_PRICE_DERIVED", "CURVE_DECIMALS_UNKNOWN");
  }

  if (curveLiquiditySol !== null) {
    reasonCodes.push("CURVE_LIQUIDITY_DERIVED");
  }

  if (curveMarketCapSol !== null) {
    reasonCodes.push("CURVE_MARKET_CAP_FROM_PAYLOAD");
  }

  if (curveSol === null || curveTokens === null) {
    reasonCodes.push(
      curveSol === null && curveTokens === null
        ? "CURVE_RESERVES_UNAVAILABLE"
        : "CURVE_RESERVES_INVALID"
    );
  }

  return {
    associatedBondingCurve: input.associatedBondingCurve,
    bondingCurve: input.bondingCurveKey,
    curveLiquiditySol,
    curveMarketCapSol,
    curvePriceSol,
    curveReasonCodes: uniqueReasonCodes(reasonCodes),
    curveSol,
    curveSource:
      curvePriceSol !== null ||
      curveLiquiditySol !== null ||
      curveMarketCapSol !== null
        ? "pumpportal_payload"
        : null,
    curveTokens,
    realSolReserves,
    realTokenReserves,
    virtualSolReserves,
    virtualTokenReserves
  };
}

function normalizeCurveSolReserve(
  value: number | null,
  reasonCodes: string[]
): number | null {
  const reserve = positiveOrNull(value);

  if (reserve === null) {
    return null;
  }

  if (reserve > 1_000_000) {
    reasonCodes.push("CURVE_SOL_RESERVE_LAMPORTS_NORMALIZED");
    return roundFinite(reserve / 1_000_000_000, 12);
  }

  return reserve;
}

function normalizeCurveTokenReserve(
  value: number | null,
  reasonCodes: string[]
): number | null {
  const reserve = positiveOrNull(value);

  if (reserve === null) {
    return null;
  }

  if (reserve > 1_000_000_000_000) {
    reasonCodes.push("CURVE_DECIMALS_UNKNOWN", "CURVE_RESERVES_INVALID");
    return null;
  }

  return reserve;
}

function roundFinite(value: number, digits: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function getLiveTokenMarketHints(
  tokenEvents: Array<{ createdAt: string; payload: FeedEvent }>
): {
  associatedBondingCurve: string | null;
  bondingCurveKey: string | null;
  curveMarks: Array<{
    priceSol: number | null;
    t: string;
    volumeSol: number | null;
  }>;
  marketCapSol: number | null;
  poolAddress: string | null;
  raydiumPool: string | null;
  realSolReserves: number | null;
  realTokenReserves: number | null;
  vSolInBondingCurve: number | null;
  vTokensInBondingCurve: number | null;
  virtualSolReserves: number | null;
  virtualTokenReserves: number | null;
} {
  const hints = {
    associatedBondingCurve: null as string | null,
    bondingCurveKey: null as string | null,
    curveMarks: [] as Array<{
      priceSol: number | null;
      t: string;
      volumeSol: number | null;
    }>,
    marketCapSol: null as number | null,
    poolAddress: null as string | null,
    raydiumPool: null as string | null,
    realSolReserves: null as number | null,
    realTokenReserves: null as number | null,
    vSolInBondingCurve: null as number | null,
    vTokensInBondingCurve: null as number | null,
    virtualSolReserves: null as number | null,
    virtualTokenReserves: null as number | null
  };

  for (const event of tokenEvents) {
    if (event.payload.type !== "token_created") {
      continue;
    }

    const raw =
      event.payload.raw && typeof event.payload.raw === "object"
        ? (event.payload.raw as Record<string, unknown>)
        : {};

    hints.marketCapSol ??=
      finiteOrNull(event.payload.candidate.marketCapSol) ??
      positiveOrNull(readNumber(raw.marketCapSol));
    hints.vSolInBondingCurve ??=
      finiteOrNull(event.payload.candidate.vSolInBondingCurve) ??
      positiveOrNull(readNumber(raw.vSolInBondingCurve));
    hints.vTokensInBondingCurve ??=
      finiteOrNull(event.payload.candidate.vTokensInBondingCurve) ??
      positiveOrNull(readNumber(raw.vTokensInBondingCurve));
    hints.virtualSolReserves ??=
      finiteOrNull(event.payload.candidate.virtualSolReserves) ??
      positiveOrNull(readNumber(raw.virtualSolReserves)) ??
      positiveOrNull(readNumber(raw.virtualSolReserve)) ??
      hints.vSolInBondingCurve;
    hints.virtualTokenReserves ??=
      finiteOrNull(event.payload.candidate.virtualTokenReserves) ??
      positiveOrNull(readNumber(raw.virtualTokenReserves)) ??
      positiveOrNull(readNumber(raw.virtualTokenReserve)) ??
      hints.vTokensInBondingCurve;
    hints.realSolReserves ??=
      finiteOrNull(event.payload.candidate.realSolReserves) ??
      positiveOrNull(readNumber(raw.realSolReserves)) ??
      positiveOrNull(readNumber(raw.realSolReserve)) ??
      positiveOrNull(readNumber(raw.realSolInBondingCurve));
    hints.realTokenReserves ??=
      finiteOrNull(event.payload.candidate.realTokenReserves) ??
      positiveOrNull(readNumber(raw.realTokenReserves)) ??
      positiveOrNull(readNumber(raw.realTokenReserve)) ??
      positiveOrNull(readNumber(raw.realTokensInBondingCurve));
    hints.bondingCurveKey ??=
      event.payload.candidate.bondingCurveKey ??
      event.payload.bondingCurve ??
      readString(raw.bondingCurveKey) ??
      readString(raw.bondingCurve);
    hints.associatedBondingCurve ??=
      event.payload.candidate.associatedBondingCurve ??
      readString(raw.associatedBondingCurve) ??
      readString(raw.associatedBondingCurveKey) ??
      readString(raw.associated_bonding_curve);
    hints.poolAddress ??=
      event.payload.candidate.pool ??
      readString(raw.pool) ??
      readString(raw.pair) ??
      readString(raw.newPool);
    hints.raydiumPool ??=
      event.payload.candidate.raydiumPool ?? readString(raw.raydiumPool);

    const curve = buildMomentumCurveData({
      associatedBondingCurve: hints.associatedBondingCurve,
      bondingCurveKey: hints.bondingCurveKey,
      marketCapSol: hints.marketCapSol,
      realSolReserves:
        finiteOrNull(event.payload.candidate.realSolReserves) ??
        positiveOrNull(readNumber(raw.realSolReserves)) ??
        hints.realSolReserves,
      realTokenReserves:
        finiteOrNull(event.payload.candidate.realTokenReserves) ??
        positiveOrNull(readNumber(raw.realTokenReserves)) ??
        hints.realTokenReserves,
      vSolInBondingCurve:
        finiteOrNull(event.payload.candidate.vSolInBondingCurve) ??
        positiveOrNull(readNumber(raw.vSolInBondingCurve)),
      vTokensInBondingCurve:
        finiteOrNull(event.payload.candidate.vTokensInBondingCurve) ??
        positiveOrNull(readNumber(raw.vTokensInBondingCurve)),
      virtualSolReserves:
        finiteOrNull(event.payload.candidate.virtualSolReserves) ??
        positiveOrNull(readNumber(raw.virtualSolReserves)) ??
        positiveOrNull(readNumber(raw.virtualSolReserve)),
      virtualTokenReserves:
        finiteOrNull(event.payload.candidate.virtualTokenReserves) ??
        positiveOrNull(readNumber(raw.virtualTokenReserves)) ??
        positiveOrNull(readNumber(raw.virtualTokenReserve))
    });

    if (curve.curvePriceSol !== null) {
      hints.curveMarks.push({
        priceSol: curve.curvePriceSol,
        t: event.createdAt,
        volumeSol: curve.curveLiquiditySol
      });
    }
  }

  return hints;
}

function getLiveTokenMigrationState(options: {
  eventTypes: string[];
  latestEventAt: string;
  source: string;
  tokenEvents: Array<{
    createdAt: string;
    eventType: string;
    payload: FeedEvent;
  }>;
}): {
  migratedAt: string | null;
  pool: string | null;
  source: string | null;
  status: "not_migrated" | "migrated";
} {
  const migrationEvent = options.tokenEvents.find(
    (event) =>
      event.eventType === "migration" ||
      event.payload.rawSourceEventType?.toLowerCase().includes("migr")
  );
  const migrated =
    options.eventTypes.includes("migration") ||
    options.eventTypes.includes("token_migrated") ||
    migrationEvent !== undefined;

  if (!migrated) {
    return {
      migratedAt: null,
      pool: null,
      source: null,
      status: "not_migrated"
    };
  }

  const raw =
    migrationEvent?.payload.raw &&
    typeof migrationEvent.payload.raw === "object"
      ? (migrationEvent.payload.raw as Record<string, unknown>)
      : {};

  return {
    migratedAt: migrationEvent?.createdAt ?? options.latestEventAt,
    pool:
      readString(raw.pool) ??
      readString(raw.newPool) ??
      readString(raw.raydiumPool),
    source: migrationEvent?.payload.source ?? options.source,
    status: "migrated"
  };
}

function getAdaptiveTrackingReasonCodes(options: {
  hasPaperPosition: boolean;
  launchPhase: string;
  migrationStatus: "not_migrated" | "migrated";
  trackingState: string;
}): string[] {
  const reasonCodes = ["MOMENTUM_ADAPTIVE_TRACKING_RULES_AVAILABLE"];

  if (options.launchPhase === "hot") {
    reasonCodes.push("MOMENTUM_EXTEND_ON_HOT");
  }

  if (options.launchPhase === "ripping") {
    reasonCodes.push("MOMENTUM_EXTEND_ON_RIPPING");
  }

  if (options.hasPaperPosition) {
    reasonCodes.push("MOMENTUM_EXTEND_ON_PAPER_POSITION");
  }

  if (options.migrationStatus === "migrated") {
    reasonCodes.push("MIGRATED_TOKEN_VISIBLE");

    if (options.trackingState !== "tracking") {
      reasonCodes.push("TRADE_SOURCE_UNAVAILABLE_AFTER_MIGRATION");
    }
  }

  return uniqueReasonCodes(reasonCodes);
}

function createMomentumSignalDisplay(
  card: LiveTokenCardViewModel,
  options: { hasValidTradeSamples: boolean }
): MomentumScannerRow["signalDisplay"] {
  const score = Math.max(0, Math.min(100, Math.round(card.launchScore)));
  const topDriver =
    card.launchDrivers[0] ?? card.strategy.positiveDrivers[0]?.label ?? null;
  const topBlocker =
    card.rejectReason ??
    card.launchBlockers[0] ??
    card.strategy.blockers[0]?.label ??
    card.launchMissingDataReasons[0] ??
    null;
  const reasonCodes = uniqueReasonCodes([
    "SIGNAL_DISPLAY_READY",
    ...(card.hardReject ? ["RISK_HARD_REJECT"] : []),
    ...(!options.hasValidTradeSamples
      ? ["INSUFFICIENT_TRADE_SAMPLES", "HOT_RIPPING_REQUIRES_TRADE_SAMPLES"]
      : []),
    ...(card.launchBuyReadyPaper || card.buyReady
      ? ["PAPER_BUY_READY"]
      : ["PAPER_BUY_BLOCKED"])
  ]);

  if (card.hardReject || card.launchPhase === "rejected") {
    return {
      buyReadyPaper: false,
      color: "danger",
      label: "REJECT",
      reasonCodes,
      score,
      scorePct: score / 100,
      strength: card.signalStrength,
      topBlocker,
      topDriver
    };
  }

  if (options.hasValidTradeSamples && card.launchPhase === "ripping") {
    return {
      buyReadyPaper: card.launchBuyReadyPaper || card.buyReady,
      color: "success",
      label: "RIPPING",
      reasonCodes,
      score,
      scorePct: score / 100,
      strength: card.signalStrength,
      topBlocker,
      topDriver
    };
  }

  if (options.hasValidTradeSamples && card.launchPhase === "hot") {
    return {
      buyReadyPaper: card.launchBuyReadyPaper || card.buyReady,
      color: "warning",
      label: "HOT",
      reasonCodes,
      score,
      scorePct: score / 100,
      strength: card.signalStrength,
      topBlocker,
      topDriver
    };
  }

  if (
    card.action.includes("WATCH") ||
    card.launchPhase === "watching" ||
    score >= 25
  ) {
    return {
      buyReadyPaper: false,
      color: "info",
      label: "WATCH",
      reasonCodes,
      score,
      scorePct: score / 100,
      strength: card.signalStrength,
      topBlocker,
      topDriver
    };
  }

  return {
    buyReadyPaper: false,
    color: "neutral",
    label: "DISCOVERY",
    reasonCodes,
    score,
    scorePct: score / 100,
    strength: card.signalStrength,
    topBlocker,
    topDriver
  };
}

function createMomentumRowDataQuality(options: {
  card: LiveTokenCardViewModel;
  missingCriticalFields: string[];
  missingFieldReasons: Record<string, string[]>;
  rowPriceSol: number | null;
}): MomentumScannerRow["dataQuality"] {
  const missingReasons = getTopMissingReasons(
    Object.values(options.missingFieldReasons).flat()
  ).map((item) => item.reasonCode);

  return {
    discoveryOnly: options.card.dataCompletenessLabel === "discovery_only",
    hasCurveData:
      options.card.curve.curvePriceSol !== null ||
      options.card.curve.curveLiquiditySol !== null ||
      options.card.curve.curveMarketCapSol !== null,
    hasMarketData:
      options.card.marketCapUsd !== null ||
      options.card.marketCapSol !== null ||
      options.card.liquidityUsd !== null ||
      options.rowPriceSol !== null,
    hasRiskData:
      options.card.riskScore !== null ||
      options.card.riskReasonCodes.length > 0,
    hasSignal: options.card.launchScore > 0 || options.card.action !== "IGNORE",
    hasTradeData:
      options.card.realTradeEventCount > 0 ||
      options.card.launchTradeSampleCount > 0,
    missingCriticalCount: options.missingCriticalFields.length,
    topMissingReasons: missingReasons.slice(0, 4)
  };
}

function sanitizeScannerImageUri(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function buildMomentumMissingFieldReasons(
  card: LiveTokenCardViewModel,
  options: { hasDerivativeSamples: boolean; hasTradeSamples: boolean }
): Record<string, string[]> {
  const tokenTradeTrackingUnavailable =
    card.meteredLaunchDataState === "blocked" ||
    card.meteredLaunchDataState === "not_tracked" ||
    card.meteredLaunchDataState === "unsubscribed";
  const marketCapAvailable =
    card.marketCapUsd !== null ||
    card.marketCapSol !== null ||
    card.curve.curveMarketCapSol !== null;
  const curveLiquidityAvailable = card.curve.curveLiquiditySol !== null;
  const curvePriceAvailable = card.curve.curvePriceSol !== null;

  return {
    marketCap: marketCapAvailable
      ? []
      : uniqueReasonCodes([
          ...(card.enrichmentStatus === "disabled"
            ? ["ENRICHMENT_DISABLED"]
            : []),
          card.ageSeconds < 300 ? "TOKEN_TOO_NEW" : "MARKET_CAP_UNAVAILABLE"
        ]),
    liquidity:
      card.liquidityUsd !== null || curveLiquidityAvailable
        ? []
        : uniqueReasonCodes([
            ...(card.enrichmentStatus === "disabled"
              ? ["ENRICHMENT_DISABLED"]
              : []),
            "LIQUIDITY_UNAVAILABLE",
            "CURVE_RESERVES_UNAVAILABLE",
            card.migrationStatus === "not_migrated"
              ? "TOKEN_NOT_MIGRATED"
              : "POOL_NOT_DETECTED"
          ]),
    price:
      card.priceSol !== null || card.priceUsd !== null || curvePriceAvailable
        ? []
        : uniqueReasonCodes([
            tokenTradeTrackingUnavailable
              ? "TOKEN_TRADE_TRACKING_DISABLED"
              : "INSUFFICIENT_TRADE_SAMPLES",
            "CURVE_RESERVES_UNAVAILABLE",
            "PRICE_UNAVAILABLE"
          ]),
    volume:
      card.volume10sSol !== null || card.volume10sUsd !== null
        ? []
        : uniqueReasonCodes([
            tokenTradeTrackingUnavailable
              ? "TOKEN_TRADE_TRACKING_DISABLED"
              : options.hasTradeSamples
                ? "VOLUME_UNAVAILABLE"
                : "NO_TRADE_EVENTS"
          ]),
    holders:
      card.holderCount !== null ||
      card.topHolderPct !== null ||
      card.top10HolderPct !== null
        ? []
        : [
            "CHAIN_VERIFY_DISABLED",
            "HOLDER_DATA_UNAVAILABLE",
            "HOLDER_TIME_SERIES_UNAVAILABLE"
          ],
    social: ["SOCIAL_PROVIDER_NOT_CONFIGURED"],
    derivatives: options.hasDerivativeSamples
      ? []
      : uniqueReasonCodes([
          "INSUFFICIENT_SAMPLES_FOR_DERIVATIVE",
          ...(tokenTradeTrackingUnavailable
            ? ["TOKEN_TRADE_TRACKING_DISABLED"]
            : [])
        ])
  };
}

function getTopMissingReasons(
  reasonCodes: string[]
): Array<{ reasonCode: string; count: number }> {
  return Object.entries(countRowFields(reasonCodes))
    .map(([reasonCode, count]) => ({ reasonCode, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.reasonCode.localeCompare(right.reasonCode)
    )
    .slice(0, 12);
}

function getMomentumDataQualityLabel(
  card: LiveTokenCardViewModel
): MomentumScannerRow["dataQualityLabel"] {
  if (!card.realData) {
    return "unavailable";
  }

  if (card.dataCompletenessLabel === "strategy_ready") {
    return "strategy_ready";
  }

  if (
    card.enrichmentStatus === "available" ||
    card.enrichmentStatus === "partial"
  ) {
    return "enriched";
  }

  if (card.realTimeSeriesReady && card.realPriceActionReady) {
    return "price_action_ready";
  }

  if (
    card.meteredLaunchDataState === "tracking" ||
    card.realTradeEventCount > 0 ||
    card.launchTradeSampleCount > 0
  ) {
    return "metered_tracking";
  }

  return "discovery_only";
}

function summarizeMomentumFields(options: {
  missingCriticalFields: string[];
  staleFields: string[];
  unavailableFields: string[];
}): string {
  const parts = [
    options.missingCriticalFields.length > 0
      ? `${options.missingCriticalFields.length} critical missing`
      : null,
    options.unavailableFields.length > 0
      ? `${options.unavailableFields.length} unavailable`
      : null,
    options.staleFields.length > 0
      ? `${options.staleFields.length} stale`
      : null
  ].filter(Boolean);

  return parts.join(" / ") || "all scanner fields available";
}

function sanitizeMomentumRow(row: MomentumScannerRow): MomentumScannerRow {
  return JSON.parse(
    JSON.stringify(row, (_key, value: unknown) =>
      typeof value === "number" && !Number.isFinite(value) ? null : value
    )
  ) as MomentumScannerRow;
}

const momentumFeedRowKeys = [
  "ageSeconds",
  "buyCount10s",
  "buySellRatio",
  "curve",
  "dataQualityLabel",
  "derivatives",
  "displayName",
  "fdvUsd",
  "hardReject",
  "hasMetadata",
  "hasPaperPosition",
  "hasSocialLinks",
  "imageUri",
  "lastUpdatedAt",
  "latestEventAt",
  "launchPhase",
  "launchScore",
  "launchedAt",
  "liquidityUsd",
  "marketCapSol",
  "marketCapUsd",
  "migrationStatus",
  "mint",
  "missingCriticalFields",
  "name",
  "netBuyPressure",
  "paperPositionStatus",
  "poolAddress",
  "priceSol",
  "priceUsd",
  "priceVelocityPctPerSec",
  "raydiumPool",
  "realData",
  "realTradeEventCount",
  "riskLevel",
  "sellCount10s",
  "shortMint",
  "signalAction",
  "signalDisplay",
  "signalStrength",
  "source",
  "sparkline",
  "strategy",
  "symbol",
  "title",
  "trackingState",
  "tradeCount10s",
  "unavailableFields",
  "uniqueBuyers10s",
  "uniqueSellers10s",
  "unrealizedPnlPct",
  "unrealizedPnlSol",
  "volume10sSol",
  "volume10sUsd",
  "volume30sSol",
  "volume60sSol",
  "volumeVelocitySolPerSec"
] as const satisfies ReadonlyArray<keyof MomentumScannerRow>;

function toMomentumFeedRow(row: MomentumScannerRow): MomentumFeedRow {
  return {
    ...Object.fromEntries(momentumFeedRowKeys.map((key) => [key, row[key]])),
    derivativeScore: row.derivativeStrength.combinedDerivativeScore.totalScore
  } as MomentumFeedRow;
}

function countRowFields(fields: string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const field of fields) {
    counts[field] = (counts[field] ?? 0) + 1;
  }

  return counts;
}

function getMomentumRecommendedActions(options: {
  actualStatus: {
    acknowledgedMetered: boolean;
    apiKeyConfigured: boolean;
    dataWalletBalanceStatus: string;
    enabled: boolean;
    totalEventsThisSession: number;
  };
  chainVerifierStatus: {
    configured: boolean;
    enabled: boolean;
  };
  enrichmentStatus: {
    enabled: boolean;
  };
  missingCriticalFieldCounts: Record<string, number>;
  rows: MomentumScannerRow[];
  unavailableFieldCounts: Record<string, number>;
}): string[] {
  const actions: string[] = [];

  if (options.rows.length === 0) {
    actions.push("WAITING_FOR_LIVE_TOKENS");
  }

  if (
    options.unavailableFieldCounts.priceSol ||
    options.unavailableFieldCounts.volume10sSol ||
    options.missingCriticalFieldCounts.price ||
    options.missingCriticalFieldCounts.volume10s
  ) {
    if (!options.actualStatus.enabled) {
      actions.push("ENABLE_METERED_TOKEN_TRADES_FOR_PRICE_ACTION");
    } else if (!options.actualStatus.apiKeyConfigured) {
      actions.push("CHECK_PUMPPORTAL_API_KEY");
    } else if (!options.actualStatus.acknowledgedMetered) {
      actions.push("CHECK_METERED_ACK");
    } else if (options.actualStatus.totalEventsThisSession === 0) {
      actions.push("WAIT_FOR_MORE_TRADE_SAMPLES");
    }
  }

  if (
    (options.unavailableFieldCounts.MARKET_CAP_UNAVAILABLE ||
      options.unavailableFieldCounts.LIQUIDITY_UNAVAILABLE ||
      options.unavailableFieldCounts.FDV_UNAVAILABLE) &&
    !options.enrichmentStatus.enabled
  ) {
    actions.push("ENABLE_ENRICHMENT_FOR_MCAP_LIQUIDITY");
  }

  if (
    (options.missingCriticalFieldCounts.holderCount ||
      options.unavailableFieldCounts.HOLDER_TIME_SERIES_UNAVAILABLE) &&
    (!options.chainVerifierStatus.enabled ||
      !options.chainVerifierStatus.configured)
  ) {
    actions.push("ENABLE_CHAIN_VERIFY_FOR_HOLDER_DATA");
  }

  if (
    options.actualStatus.dataWalletBalanceStatus === "critical" ||
    options.actualStatus.dataWalletBalanceStatus === "low"
  ) {
    actions.push("CHECK_DATA_WALLET_BALANCE");
  }

  if (options.unavailableFieldCounts.INSUFFICIENT_SAMPLES_FOR_DERIVATIVE) {
    actions.push("WAIT_FOR_MORE_TRADE_SAMPLES");
  }

  if (options.unavailableFieldCounts.SOCIAL_SIGNAL_PROVIDER_NOT_CONFIGURED) {
    actions.push("SOCIAL_SIGNAL_PROVIDER_NOT_CONFIGURED");
  }

  return uniqueReasonCodes(actions);
}

function paperPortfolioPositionsForExit(
  positions: StoredPaperPortfolioPosition[]
): StoredPaperPosition[] {
  return positions
    .filter((position) => position.status !== "closed")
    .map((position) => ({
      id: position.id,
      mint: position.mint,
      symbol: position.symbol ?? "UNKNOWN",
      sizeSol: position.remainingSizeSol,
      tokenAmount: position.remainingTokenAmount,
      entryPrice: position.averageEntryPriceSol,
      status: "open",
      payload: {
        ...(position.payload && typeof position.payload === "object"
          ? position.payload
          : {}),
        paperPortfolioPosition: position,
        source: "paper_portfolio"
      },
      openedAt: position.openedAt,
      updatedAt: position.updatedAt
    }));
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNestedNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return readNumber((value as Record<string, unknown>)[key]);
}

function getReasonLabel(reasonCode: string): string {
  return reasonCode
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function createFeedProvider(options: {
  allowMockData: boolean;
  dataFeed: "none" | "mock" | "pumpportal";
  dataFeedMode: LiveFeedMode;
  mockFeedEnabled: boolean;
  mockFeedRequireExplicitEnable: boolean;
  mockFeed?: MockFeedProviderOptions | undefined;
  pumpPortal?: PumpPortalFeedProviderOptions | undefined;
  signalIntervalMs: number;
}): TokenFeedProvider {
  if (options.dataFeedMode === "live") {
    return new PumpPortalFeedProvider(options.pumpPortal);
  }

  if (options.dataFeedMode === "none" || options.dataFeed === "none") {
    return new NoFeedProvider("none", ["NO_REAL_FEED_CONFIGURED"]);
  }

  if (options.dataFeedMode === "replay") {
    return new NoFeedProvider("none", ["NO_FEED_MODE", "REPLAY_MODE"]);
  }

  if (
    (options.dataFeedMode === "mock" || options.dataFeed === "mock") &&
    options.mockFeedRequireExplicitEnable &&
    (!options.allowMockData || !options.mockFeedEnabled)
  ) {
    return new NoFeedProvider("mock-blocked", [
      "MOCK_FEED_BLOCKED_NOT_EXPLICITLY_ALLOWED",
      "NO_REAL_FEED_CONFIGURED"
    ]);
  }

  if (options.dataFeedMode !== "mock" && options.dataFeed !== "mock") {
    return new NoFeedProvider("none", ["NO_REAL_FEED_CONFIGURED"]);
  }

  return new MockFeedProvider({
    intervalMs: options.signalIntervalMs,
    ...options.mockFeed
  });
}

class NoFeedProvider implements TokenFeedProvider {
  readonly reasonCodes: string[];

  constructor(
    readonly name: "none" | "mock-blocked",
    reasonCodes: string[]
  ) {
    this.reasonCodes = reasonCodes;
  }

  start(): void {
    // Intentionally empty: no-feed mode keeps the API alive without fake data.
  }

  stop(): void {
    // Intentionally empty.
  }
}

function parseBooleanEnv(value: unknown): boolean | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }

  return undefined;
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes));
}

function decodePumpfunPayloadForDebug(transaction: unknown): {
  decodedEvent: ReturnType<typeof decodePumpfunTransaction>;
  normalizedEvent: ReturnType<typeof pumpfunEventToIndexerEvent>;
  classification: ReturnType<typeof classifyPumpfunTransaction>;
  persisted: false;
  paperOnly: true;
  tradingDisabled: true;
  networkDisabled: true;
} {
  const decodedEvent = decodePumpfunTransaction(transaction);

  return {
    decodedEvent,
    normalizedEvent: pumpfunEventToIndexerEvent(decodedEvent),
    classification: classifyPumpfunTransaction(transaction),
    persisted: false,
    paperOnly: true,
    tradingDisabled: true,
    networkDisabled: true
  };
}

function decodePumpfunFixtureForDebug(fixtureName: string): ReturnType<
  typeof decodePumpfunPayloadForDebug
> & {
  manifestEntry: ReturnType<typeof getFixtureEntry>;
  fixtureSummary: ReturnType<typeof summarizePumpfunFixtureForDebug>;
  expectedComparison: ReturnType<typeof compareExpectedNormalizedOutput>;
} {
  const manifestEntry = getFixtureEntry(fixtureName);
  const transaction = loadPumpfunFixture(manifestEntry.filename);
  const decoded = decodePumpfunPayloadForDebug(transaction);

  return {
    ...decoded,
    manifestEntry,
    fixtureSummary: summarizePumpfunFixtureForDebug(transaction),
    expectedComparison: compareExpectedNormalizedOutput(
      manifestEntry,
      decoded.normalizedEvent
    )
  };
}

function getPumpfunFixtureNames(): string[] {
  return listPumpfunFixtures().map((entry) => entry.filename);
}

function isPumpfunFixtureManifestLoaded(): boolean {
  try {
    loadFixtureManifest();
    return true;
  } catch {
    return false;
  }
}

function summarizePumpfunFixtureForDebug(
  transaction: unknown
): ReturnType<typeof summarizeTransactionFixture> {
  return summarizeTransactionFixture(transaction);
}

function emptyStringToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value;
}

function parseStringListEnv(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function startApiServer(
  options: ApiServerOptions = {}
): Promise<ApiServer> {
  const server = createApiServer(options);

  await server.app.listen({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 8787
  });

  server.startFeed();

  return server;
}
