import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
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
  createCandidateLifecycleEngine,
  type CandidateLifecycleEngine,
  type CandidateState
} from "@axi/candidates";
import { PaperTradeExecutor, type PaperTradeResult } from "@axi/execution";
import {
  createRollingMetricsEngine,
  type RollingMetricsEngine
} from "@axi/metrics";
import { createRiskEngine, type RiskEngine, type RiskInput } from "@axi/risk";
import { scoreCandidate } from "@axi/scoring";
import type { LightningTradePlan } from "@axi/pumpportal-lightning";
import {
  BotModeSchema,
  type BotMode,
  type ChainVerificationSummary,
  type CandidateDecision,
  type LiveCardDataCompleteness,
  type LiveTokenCardViewModel,
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
  closeStorage,
  getLatestChainVerification,
  getStorageStats,
  initStorage,
  listChainVerifications,
  saveLiveFeedEvent,
  saveLightningTradePlan,
  listPaperOrders,
  listPaperPositions,
  listRecentSignals,
  saveCandidateDecision,
  saveChainVerification,
  saveFeedEvent,
  savePaperOrder,
  savePumpPortalWalletStatusSnapshot,
  saveRiskSnapshot,
  saveSignal,
  listActualDataSubscriptions,
  listPumpPortalTokenTradeEvents,
  listPumpPortalTokenTradeEventsByMint,
  listTokenIdentities,
  listUnresolvedTokenIdentities,
  type StorageHandle,
  upsertPaperPosition
} from "@axi/storage";
import type { WatchOrchestratorOptions } from "@axi/watch-orchestrator";
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
  | "disabled"
  | "not_checked"
  | "partial"
  | "available";

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
  API_HOST: z.string().default("0.0.0.0"),
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
  PUMPPORTAL_LIGHTNING_MAX_BUY_SOL: z.coerce
    .number()
    .positive()
    .default(0.005),
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
  LIVE_TRADE_TRACKING_MAX_MINTS: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
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
  LIVE_TRADE_TRACKING_AUTO_MODE: liveTradeTrackingAutoModeSchema.default(
    "none"
  ),
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
  liveTradeTracking?: Partial<LiveTradeTrackingConfig>;
  liveCardEnrichment?: Partial<LiveCardEnrichmentConfig>;
  pumpPortalDataWallet?: Partial<PumpPortalDataWalletConfig> &
    Pick<PumpPortalDataWalletServiceOptions, "solanaClient">;
  pumpPortalWallets?: Partial<PumpPortalWalletsConfig> &
    Pick<PumpPortalWalletsServiceOptions, "solanaClient">;
  lightning?: Partial<LightningReadinessConfig>;
  indexer?: IndexerAdapterOptions;
  realDataRequired?: boolean;
  signalIntervalMs?: number;
  startFeed?: boolean;
  storageDatabasePath?: string;
  tokenIdentity?: TokenIdentityServiceConfig;
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
  pumpPortalDataWallet: PumpPortalDataWalletService;
  pumpPortalWallets: PumpPortalWalletsService;
  lightningReadiness: LightningReadinessService;
  indexerAdapter: IndexerAdapter;
  liveTokens: LiveTokenService;
  tokenIdentity: TokenIdentityService;
};

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(50)
});
const mintParamSchema = z.object({
  mint: z.string().min(32)
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
const actualDataSubscribeBodySchema = z.object({
  mint: z.string().min(1),
  reason: z.string().min(1).default("manual")
});
const liveTradeTrackingBodySchema = z.object({
  mint: z.string().min(1),
  reason: z.string().min(1).default("manual_live_card")
});
const lightningPlanBodySchema = z.object({
  mint: z.string().min(1),
  amountSol: z.coerce.number().positive(),
  reason: z.string().min(1).default("manual_test")
});
const tokenResolveBodySchema = z.object({
  mint: z.string().min(1)
});

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return apiConfigSchema.parse(env);
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
  const indexerAdapter = createIndexerAdapter(options.indexer);
  const signals = new Map<string, OverlaySignal>();
  const riskSnapshots = new Map<string, RiskSnapshot>();
  const lightningReadiness = createLightningReadinessService({
    config: createLightningReadinessConfig(options.lightning),
    wallets: pumpPortalWallets,
    getCandidate: (mint) => candidateEngine.getCandidate(mint),
    getRiskSnapshot: (mint) => riskSnapshots.get(mint)
  });
  const clients = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });
  const maxSignalCacheSize = 100;
  let feedStarted = false;

  app.addHook("onRequest", (request, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    done();
  });

  app.get("/health", async () => {
    const stats = getStorageStats();
    const chainEventsStatus = chainEvents.getStatus();
    const marketStatus = chainEvents.getMarketStatus();
    const watchStatus = watchOrchestration.getStatus();
    const feedStatus = getFeedStatus();
    const liveStatus = liveTokens.getStatus();
    const dataWalletStatus = await pumpPortalDataWallet.refreshBalance();
    const pumpPortalWalletsStatus = await pumpPortalWallets.refreshBalances();

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
      dataWallet: dataWalletStatus,
      pumpPortalWallets: pumpPortalWalletsStatus,
      lightningReadiness: lightningReadiness.getStatus(),
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
      tradingDisabled: true,
      solUsdConfigured: marketStatus.solUsdConfigured,
      trackedTokenCount: metricsEngine.getAllMetrics().length,
      uptimeSeconds: Math.round(process.uptime())
    };
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
    return indexerAdapter.getTimeseries(params.mint);
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

  app.get("/ui/live-token-cards", async () =>
    indexerAdapter.getStatus().preferLiveStateCards
      ? buildIndexerBackedLiveTokenCards()
      : buildLiveTokenCards()
  );

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
    return actualData.getStatus();
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

  app.post("/actual-data/subscribe", async (request, reply) => {
    const body = actualDataSubscribeBodySchema.parse(request.body);
    await pumpPortalDataWallet.refreshBalance();

    try {
      return actualData.subscribeMint(body.mint, body.reason);
    } catch (error) {
      if (error instanceof ActualDataServiceError) {
        return reply.code(error.statusCode).send({
          actualData: actualData.getStatus(),
          error: error.code,
          message: error.message,
          paperOnly: true
        });
      }

      throw error;
    }
  });

  app.delete("/actual-data/subscribe/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);

    return {
      paperOnly: true,
      subscription: actualData.unsubscribeMint(params.mint, "manual_delete")
    };
  });

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

  app.get("/live/trade-tracking/status", async () =>
    {
      await pumpPortalDataWallet.refreshBalance();
      return getLiveTradeTrackingStatus();
    }
  );

  app.post("/live/trade-tracking/track", async (request, reply) => {
    const body = liveTradeTrackingBodySchema.parse(request.body);
    await pumpPortalDataWallet.refreshBalance();

    try {
      return trackLiveMint(body.mint, body.reason);
    } catch (error) {
      if (error instanceof ActualDataServiceError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
          liveTradeTracking: getLiveTradeTrackingStatus(),
          paperOnly: true
        });
      }

      throw error;
    }
  });

  app.delete("/live/trade-tracking/track/:mint", async (request) => {
    const params = mintParamSchema.parse(request.params);
    const subscription = actualData.unsubscribeMint(
      params.mint,
      "manual_live_card_delete"
    );

    return {
      paperOnly: true,
      status: getLiveTradeTrackingStatus(),
      subscription
    };
  });

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

  app.server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `http://${host}`);

    if (url.pathname !== "/ws/signals") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (socket) => {
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
    await chainEvents.stop();
    await stopFeed();

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
    void feed.start(handleFeedEvent);
    void chainEvents.start();
  }

  async function stopFeed(): Promise<void> {
    if (!feedStarted) {
      return;
    }

    feedStarted = false;
    actualData.stop();
    await feed.stop();
    await chainEvents.stop();
  }

  function getFeedStatus() {
    const pumpPortalStatus =
      feed instanceof PumpPortalFeedProvider ? feed.getStatus() : undefined;
    const noFeedReasonCodes =
      feed instanceof NoFeedProvider ? feed.reasonCodes : [];
    const reasonCodes = uniqueReasonCodes([
      ...(dataFeedMode === "live" ? ["LIVE_FEED_EXPECTED"] : []),
      ...(dataFeedMode === "none" ? ["NO_FEED_MODE"] : []),
      ...(feed.name === "mock" ? ["MOCK_EXPLICITLY_ENABLED"] : []),
      ...(feed.name === "mock-blocked" ? ["MOCK_RUNTIME_BLOCKED"] : []),
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
      parseErrorCount: pumpPortalStatus?.parseErrorCount ?? 0,
      lastError: pumpPortalStatus?.lastError ?? null,
      reasonCodes,
      paperOnly: true as const
    };
  }

  function buildLiveTokenCards(): LiveTokenCardViewModel[] {
    const nowMs = Date.now();
    const feedStatus = getFeedStatus();
    const liveEvents = liveTokens.getLiveFeedEvents(1000);
    const liveTradeTrackingStatus = getLiveTradeTrackingStatus();

    return liveTokens.getLiveTokens().map((token) => {
      const candidate = candidateEngine.getCandidate(token.mint);
      const identity =
        candidate?.identity ?? getTokenIdentitySummary(token.mint);
      const metrics =
        metricsEngine.getMetrics(token.mint) ?? candidate?.latestMetrics;
      const riskSnapshot =
        riskSnapshots.get(token.mint) ?? candidate?.latestRisk;
      const decision = candidate?.latestDecision;
      const score = candidate?.latestScore;
      const actualDataSummary = actualData.getCandidateSummary(token.mint);
      const tradeTracking = getLiveTradeTrackingForMint(token.mint);
      const enrichment = liveCardEnrichments.get(token.mint);
      const marketObservations = chainEvents.getMarketObservationsByMint(
        token.mint,
        1000
      );
      const tokenEvents = liveEvents.filter(
        (event) => event.mint === token.mint
      );
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
        positiveOrNull(actualDataSummary?.latestPriceSol);
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
        imageUri: identity?.imageUri ?? null,
        identityConfidence:
          identity?.confidence ?? token.identityConfidence ?? "none",
        identitySource: identity?.dataSource ?? "unknown",
        identityResolved: identity?.resolved ?? false,
        metadataUri: identity?.metadataUri ?? null,
        source: token.source,
        sourceMode: token.sourceMode,
        realData: token.realData,
        eventTypes: token.eventTypes,
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
        fdvUsd,
        liquidityUsd,
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
        volumeVelocityUsdPerSec: metricsAvailable
          ? numberOrNull(metrics?.volumeVelocityUsdPerSec)
          : null,
        volumeAccelerationUsdPerSec2: metricsAvailable
          ? numberOrNull(metrics?.volumeAccelerationUsdPerSec2)
          : null,
        volumeVelocitySolPerSec: metricsAvailable
          ? numberOrNull(metrics?.volumeVelocitySolPerSec)
          : null,
        volumeAccelerationSolPerSec2: metricsAvailable
          ? numberOrNull(metrics?.volumeAccelerationSolPerSec2)
          : null,
        priceVelocityPctPerSec: metricsAvailable
          ? numberOrNull(metrics?.priceVelocityPctPerSec)
          : null,
        priceAccelerationPctPerSec2: metricsAvailable
          ? numberOrNull(metrics?.priceAccelerationPctPerSec2)
          : null,
        priceSolVelocityPctPerSec: metricsAvailable
          ? numberOrNull(metrics?.priceSolVelocityPctPerSec)
          : null,
        priceSolAccelerationPctPerSec2: metricsAvailable
          ? numberOrNull(metrics?.priceSolAccelerationPctPerSec2)
          : null,
        buyerVelocityPerSec: metricsAvailable
          ? numberOrNull(metrics?.buyerVelocityPerSec)
          : null,
        buyerAccelerationPerSec2: metricsAvailable
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

      return {
        mint: token.mint,
        shortMint: token.shortMint,
        name: token.name,
        symbol: token.symbol,
        title: token.title ?? token.displayName,
        displayName: token.displayName,
        imageUri: token.identity.imageUri,
        identityConfidence: token.name || token.symbol ? "low" : "none",
        identitySource: toTokenIdentityDataSource(token.identity.source),
        identityResolved: Boolean(token.name || token.symbol),
        metadataUri: token.identity.metadataUri,
        source: token.source,
        sourceMode: token.sourceMode,
        realData: token.sourceMode === "real",
        eventTypes: token.eventTypes,
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
        fdvUsd: token.market.fdvUsd,
        liquidityUsd: token.market.liquidityUsd,
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
        priceVelocityPctPerSec: null,
        priceAccelerationPctPerSec2: null,
        priceSolVelocityPctPerSec: numberOrNull(
          timeseries.rollingStats.priceVelocityPctPerSec
        ),
        priceSolAccelerationPctPerSec2: numberOrNull(
          timeseries.rollingStats.priceAccelerationPctPerSec2
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
        rejectReason: window60s.tradeCount < 3 ? "INSUFFICIENT_TRADE_METRICS" : null,
        strategyName: "paper-momentum-risk-v1",
        signalUpdatedAt: null,
        strategy,
        rawEventCount: token.rawEventCount,
        actualTradeEventCount: window60s.tradeCount,
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
          ? Math.max(0, Math.round((nowMs - Date.parse(token.latestTrade.at)) / 1000))
          : null,
        tradeEventCount: window60s.tradeCount,
        enrichmentStatus: token.dataCompleteness.label === "enriched" ? "partial" : "disabled",
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
        "NO_TRADING_CONTROLS"
      ],
      formula: [
        "total = clamp(momentum * 0.55 + quality * 0.55 - riskPenalty, 0, 100)",
        "rolling momentum blends volume, volume acceleration, buyer velocity, buyer acceleration, price velocity, buy/sell ratio, net pressure, and trade activity",
        "holder derivatives are displayed only when a real holder time series exists"
      ],
      paperOnly: true,
      reasonCodes: [
        "STRATEGY_STATUS_READ_ONLY",
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
      autoMinIdentityConfidence:
        liveTradeTracking.autoMinIdentityConfidence,
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
      actualStatus.budgetReached || blockers.includes("PUMPPORTAL_TRADE_BUDGET_REACHED")
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

  function trackLiveMint(mint: string, reason: string) {
    const normalizedMint = mint.trim();

    if (!isValidSolanaMint(normalizedMint)) {
      throw new ActualDataServiceError(
        "INVALID_MINT",
        `Invalid Solana mint for live trade tracking: ${normalizedMint}`,
        400
      );
    }

    const blockers = getLiveTradeTrackingBlockers(normalizedMint);

    if (blockers.length > 0) {
      throw new ActualDataServiceError(
        blockers[0] ?? "LIVE_TRADE_TRACKING_BLOCKED",
        "Live trade tracking is blocked by current metered safety gates."
      );
    }

    const subscription = actualData.subscribeMint(
      normalizedMint,
      `live_card_${reason}`
    );

    return {
      paperOnly: true,
      status: getLiveTradeTrackingStatus(),
      subscription
    };
  }

  function maybeAutoTrackLiveToken(options: {
    decision: CandidateDecision | undefined;
    identity: TokenIdentitySummary;
    liveToken: LiveToken | undefined;
  }): void {
    if (
      !options.liveToken ||
      !liveTradeTracking.enabled ||
      !liveTradeTracking.acknowledgedMetered ||
      liveTradeTracking.autoMode === "none"
    ) {
      return;
    }

    if (liveTradeTracking.autoRequireRealData && !options.liveToken.realData) {
      return;
    }

    const ageSeconds = getAgeSeconds(options.liveToken.firstSeenAt, Date.now());

    if (
      ageSeconds < liveTradeTracking.autoMinAgeSeconds ||
      ageSeconds > liveTradeTracking.autoMaxAgeSeconds
    ) {
      return;
    }

    if (
      !meetsMinimumConfidence(
        options.identity.confidence,
        liveTradeTracking.autoMinIdentityConfidence
      )
    ) {
      return;
    }

    const shouldTrack =
      liveTradeTracking.autoMode === "newest" ||
      (liveTradeTracking.autoMode === "watch" &&
        (options.decision?.action.includes("WATCH") ||
          options.decision?.lifecycleState === "watching")) ||
      (liveTradeTracking.autoMode === "qualified" &&
        options.decision?.action === "PAPER_BUY_READY" &&
        !options.decision.hardReject);

    if (!shouldTrack) {
      return;
    }

    try {
      trackLiveMint(options.liveToken.mint, "auto");
    } catch (error) {
      app.log.debug(
        {
          error,
          mint: options.liveToken.mint
        },
        "Live trade tracking auto-subscribe skipped"
      );
    }
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
      liveCardEnrichmentAttempts.length >=
      liveCardEnrichment.maxMintsPerMinute
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

  function handleFeedEvent(event: FeedEvent): void {
    const actualDataSummary =
      event.type === "trade" && event.source === "pumpportal"
        ? actualData.handlePumpPortalTradeEvent(event)
        : undefined;
    indexerAdapter.ingestFeedEvent(event);
    const identity = tokenIdentity.ingestFeedEvent(event);
    const identitySummary = toTokenIdentitySummary(identity);

    saveFeedEvent(event);
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
    const latestMetrics =
      rollingMetrics ?? metricsEngine.getMetrics(candidate.mint);
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

    maybeAutoTrackLiveToken({
      decision,
      identity: identitySummary,
      liveToken
    });

    if (!decision) {
      app.log.trace({ mint: candidate.mint }, "Candidate decision unavailable");
      return;
    }

    saveCandidateDecision(decision);
    actualData.maybeAutoSubscribeForEvent(event, decision);

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
    cacheSignal(signal);

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

    broadcast({
      type: "signal",
      signal
    });

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

    const latestMetrics = metricsEngine.getMetrics(options.record.mint);
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
    emitFeedEvent: handleFeedEvent,
    feed,
    getSignals: () => Array.from(signals.values()),
    indexerAdapter,
    metrics: metricsEngine,
    pumpPortalDataWallet,
    pumpPortalWallets,
    lightningReadiness,
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

function toLiveCardCompleteness(token: LiveTokenState): LiveCardDataCompleteness {
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
  return event.metrics;
}

function getLiveFeedEventType(event: FeedEvent): string {
  return event.type === "token_created" &&
    event.rawSourceEventType?.toLowerCase().includes("migr")
    ? "migration"
    : "new_token";
}

function getRiskFlags(event: FeedEvent): RiskFlags {
  return event.riskFlags;
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
      available:
        options.volume10sSol !== null || options.volume10sUsd !== null,
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

function meetsMinimumConfidence(
  confidence: TokenIdentitySummary["confidence"],
  minimum: ObservationConfidence
): boolean {
  const ranks: Record<TokenIdentitySummary["confidence"], number> = {
    high: 3,
    medium: 2,
    low: 1,
    none: 0
  };

  return ranks[confidence] >= ranks[minimum];
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

export async function startApiServer(
  options: ApiServerOptions = {}
): Promise<ApiServer> {
  const server = createApiServer(options);

  await server.app.listen({
    host: options.host ?? "0.0.0.0",
    port: options.port ?? 8787
  });

  server.startFeed();

  return server;
}
