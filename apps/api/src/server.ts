import { loadApiConfig, startApiServer } from "./app";
import type { ApiServerOptions } from "./app";
import type {
  MockFeedProviderOptions,
  PumpPortalFeedProviderOptions
} from "@axi/data-feeds";
import { createActualDataConfig } from "./actual-data-service";
import { createLaunchScannerConfig } from "./launch-scanner-service";
import { createMeteredLaunchDataConfig } from "./metered-launch-data-service";
import { createTokenIdentityConfig } from "./token-identity-service";

const config = loadApiConfig();
const dataApiKey = config.PUMPPORTAL_DATA_API_KEY ?? config.PUMPPORTAL_API_KEY;
const samePumpPortalWallet =
  config.PUMPPORTAL_USE_SAME_WALLET_FOR_DATA_AND_TRADING;
const tradingApiKey = samePumpPortalWallet
  ? (config.PUMPPORTAL_TRADING_API_KEY ?? dataApiKey)
  : config.PUMPPORTAL_TRADING_API_KEY;
const tradingWalletPublicKey = samePumpPortalWallet
  ? (config.PUMPPORTAL_TRADING_WALLET_PUBLIC_KEY ??
    config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY)
  : config.PUMPPORTAL_TRADING_WALLET_PUBLIC_KEY;
const meteredLaunchDataControlsEnabled =
  config.METERED_LAUNCH_DATA_CONTROLS_ENABLED;
const meteredLaunchDataEnabled = config.METERED_LAUNCH_DATA_ENABLED;
const meteredLaunchDataEnvAcknowledged =
  config.METERED_LAUNCH_DATA_ACK_COST &&
  !config.METERED_LAUNCH_DATA_REQUIRE_UI_ACK;
const effectiveMeteredLaunchDataExtendedTrackMs =
  config.MOMENTUM_ADAPTIVE_TRACKING_ENABLED
    ? Math.max(
        config.METERED_LAUNCH_DATA_EXTENDED_TRACK_MS,
        config.MOMENTUM_ADAPTIVE_MAX_TRACK_MS
      )
    : config.METERED_LAUNCH_DATA_EXTENDED_TRACK_MS;
const effectiveTokenTradeMaxSubscribedTokens = Math.min(
  config.PUMPPORTAL_TOKEN_TRADES_MAX_SUBSCRIBED_TOKENS,
  config.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS
);
const effectiveTokenTradeMaxEventsPerSession = Math.min(
  config.PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_SESSION,
  config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION
);
const effectiveTokenTradeMaxEventsPerMint = Math.min(
  config.PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_MINT,
  config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT
);
const effectiveActualDataEnabled =
  meteredLaunchDataEnabled || meteredLaunchDataControlsEnabled;
const effectiveActualDataAcknowledged = meteredLaunchDataEnvAcknowledged;
const mockFeed: MockFeedProviderOptions = {
  scenario: config.MOCK_FEED_SCENARIO
};
const pumpPortal: PumpPortalFeedProviderOptions = {
  maxAccountTradeEventsPerSession: config.EXIT_STRATEGY_MAX_EVENTS_PER_SESSION,
  maxAccountTradeSubscriptions: config.EXIT_STRATEGY_MAX_WATCHED_WALLETS,
  maxTokenTradeEventsPerMint: effectiveTokenTradeMaxEventsPerMint,
  maxTokenTradeEventsPerSession: effectiveTokenTradeMaxEventsPerSession,
  maxTokenTradeSubscriptions: effectiveTokenTradeMaxSubscribedTokens,
  subscribeMigration:
    config.PUMPPORTAL_LIVE_DISCOVERY_ENABLED &&
    config.PUMPPORTAL_SUBSCRIBE_MIGRATION,
  subscribeNewToken:
    config.PUMPPORTAL_LIVE_DISCOVERY_ENABLED &&
    config.PUMPPORTAL_SUBSCRIBE_NEW_TOKEN
};
const options: ApiServerOptions = {
  allowedControlOrigins: config.API_ALLOWED_ORIGINS,
  chainEvents: {
    backfillLimitPerAddress: config.CHAIN_EVENTS_BACKFILL_LIMIT_PER_ADDRESS,
    backfillOnStart: config.CHAIN_EVENTS_BACKFILL_ON_START,
    commitment: config.SOLANA_RPC_COMMITMENT,
    enabled: config.CHAIN_EVENTS_ENABLED,
    fetchTransactionOnLog: config.CHAIN_EVENTS_FETCH_TRANSACTION_ON_LOG,
    maxConcurrentFetches: config.CHAIN_EVENTS_MAX_CONCURRENT_FETCHES,
    maxWatchedAddresses: config.CHAIN_EVENTS_MAX_WATCHED_ADDRESSES,
    marketData: {
      allowSolUsdConversion: config.MARKET_DATA_ALLOW_SOL_USD_CONVERSION,
      allowUsdFromStableQuotes: config.MARKET_DATA_ALLOW_USD_FROM_STABLE_QUOTES,
      enabled: config.MARKET_DATA_ENABLED,
      minConfidenceForMetrics: config.MARKET_DATA_MIN_CONFIDENCE_FOR_METRICS,
      solUsdPrice: config.MARKET_DATA_SOL_USD_PRICE ?? null
    },
    onChainVerified: config.CHAIN_EVENTS_ON_CHAIN_VERIFIED,
    onNewCandidate: config.CHAIN_EVENTS_ON_NEW_CANDIDATE,
    requestTimeoutMs: config.CHAIN_EVENTS_REQUEST_TIMEOUT_MS,
    watchedAddresses: parseWatchedAddresses(
      config.CHAIN_EVENTS_WATCHED_ADDRESSES
    )
  },
  chainVerifier: {
    cacheTtlMs: config.CHAIN_VERIFIER_CACHE_TTL_MS,
    commitment: config.SOLANA_RPC_COMMITMENT,
    enabled:
      config.CHAIN_VERIFIER_ENABLED || config.LIVE_CARD_CHAIN_VERIFY_ENABLED,
    maxConcurrent: config.CHAIN_VERIFIER_MAX_CONCURRENT,
    onMigration: config.CHAIN_VERIFIER_ON_MIGRATION,
    onMock: config.CHAIN_VERIFIER_ON_MOCK,
    onNewToken:
      config.CHAIN_VERIFIER_ON_NEW_TOKEN ||
      config.LIVE_CARD_CHAIN_VERIFY_ON_NEW_TOKEN,
    requestTimeoutMs: config.CHAIN_VERIFIER_REQUEST_TIMEOUT_MS
  },
  dataFeed: config.DATA_FEED,
  dataFeedMode: config.DATA_FEED_MODE,
  host: config.API_HOST,
  logLevel: config.LOG_LEVEL,
  mockFeed,
  mode: config.BOT_MODE,
  paperAutoOrder: config.PAPER_AUTO_ORDER,
  actualData: createActualDataConfig({
    acknowledgedMetered: effectiveActualDataAcknowledged,
    apiKeyConfigured: dataApiKey !== undefined,
    autoSubscribe: false,
    autoSubscribeOnMigration: false,
    autoSubscribeOnNewToken: false,
    autoSubscribeOnQualified: false,
    enabled: effectiveActualDataEnabled,
    manualMints: [],
    maxEventsPerMint: effectiveTokenTradeMaxEventsPerMint,
    maxEventsPerSession: effectiveTokenTradeMaxEventsPerSession,
    maxSubscribedTokens: effectiveTokenTradeMaxSubscribedTokens,
    minScoreToAutoSubscribe:
      config.PUMPPORTAL_TOKEN_TRADES_MIN_SCORE_TO_AUTO_SUBSCRIBE,
    requireApiKey: config.PUMPPORTAL_TOKEN_TRADES_REQUIRE_API_KEY,
    unsubscribeAfterMs: Math.min(
      config.PUMPPORTAL_TOKEN_TRADES_UNSUBSCRIBE_AFTER_MS,
      effectiveMeteredLaunchDataExtendedTrackMs
    )
  }),
  launchScanner: createLaunchScannerConfig({
    runtimeMode: config.AXI_RUNTIME_MODE,
    liveDiscoveryEnabled: config.PUMPPORTAL_LIVE_DISCOVERY_ENABLED,
    subscribeNewToken: config.PUMPPORTAL_SUBSCRIBE_NEW_TOKEN,
    subscribeMigration: config.PUMPPORTAL_SUBSCRIBE_MIGRATION,
    launchTrackingEnabled: false,
    launchTrackingAcknowledgedMetered: false,
    launchTrackingMode: "manual",
    maxConcurrentTracked: config.PUMPPORTAL_LAUNCH_TRACKING_MAX_CONCURRENT,
    initialTrackingMs: config.PUMPPORTAL_LAUNCH_TRACKING_INITIAL_MS,
    extendedTrackingMs: config.PUMPPORTAL_LAUNCH_TRACKING_EXTENDED_MS,
    maxEventsPerToken: config.PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_TOKEN,
    maxEventsPerSession:
      config.PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_SESSION,
    maxSessionCostSol: config.PUMPPORTAL_LAUNCH_TRACKING_MAX_SESSION_COST_SOL,
    minScoreToExtend: config.PUMPPORTAL_LAUNCH_TRACKING_MIN_SCORE_TO_EXTEND,
    minScoreToRip: config.PUMPPORTAL_LAUNCH_TRACKING_MIN_SCORE_TO_RIP,
    requireDataWalletReady:
      config.PUMPPORTAL_LAUNCH_TRACKING_REQUIRE_DATA_WALLET_READY,
    autoUnsubscribeOnHardReject:
      config.PUMPPORTAL_LAUNCH_TRACKING_AUTO_UNSUBSCRIBE_ON_HARD_REJECT,
    autoUnsubscribeOnLowScore:
      config.PUMPPORTAL_LAUNCH_TRACKING_AUTO_UNSUBSCRIBE_ON_LOW_SCORE,
    eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000
  }),
  meteredLaunchData: createMeteredLaunchDataConfig({
    acknowledgedCost: config.METERED_LAUNCH_DATA_ACK_COST,
    apiKeyConfigured: dataApiKey !== undefined,
    autoUnsubscribeOnHardReject:
      config.METERED_LAUNCH_DATA_AUTO_UNSUBSCRIBE_ON_HARD_REJECT,
    autoUnsubscribeOnLowScore:
      config.METERED_LAUNCH_DATA_AUTO_UNSUBSCRIBE_ON_LOW_SCORE,
    dataWalletPublicKeyConfigured:
      config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY !== undefined,
    controlsEnabled: meteredLaunchDataControlsEnabled,
    enabled: meteredLaunchDataEnabled,
    eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
    extendedTrackMs: effectiveMeteredLaunchDataExtendedTrackMs,
    initialTrackMs: config.METERED_LAUNCH_DATA_INITIAL_TRACK_MS,
    liveDiscoveryEnabled: config.PUMPPORTAL_LIVE_DISCOVERY_ENABLED,
    maxConcurrentMints: config.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS,
    maxProtectedMints: config.ROLLING_TRACKER_MAX_PROTECTED_MINTS,
    maxEventsPerMint: config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT,
    maxEventsPerSession: config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION,
    maxSessionCostSol: config.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL,
    maxUiSessionCostSol: config.METERED_LAUNCH_DATA_MAX_UI_SESSION_COST_SOL,
    minScoreToProtect: config.ROLLING_TRACKER_MIN_SCORE_PROTECT,
    minScoreToProtectRipping: config.ROLLING_TRACKER_MIN_SCORE_RIP,
    minScoreToExtend: config.METERED_LAUNCH_DATA_MIN_SCORE_TO_EXTEND,
    minScoreToTrack: config.METERED_LAUNCH_DATA_MIN_SCORE_TO_TRACK,
    mode: config.METERED_LAUNCH_DATA_MODE,
    protectedMaxAgeMs: config.ROLLING_TRACKER_PROTECTED_MAX_AGE_MS,
    projectRateWindowMs: config.METERED_LAUNCH_DATA_PROJECT_RATE_WINDOW_MS,
    rollingTrackerEnabled: config.ROLLING_TRACKER_ENABLED,
    reservedNewestSlots: config.ROLLING_TRACKER_RESERVED_NEWEST_SLOTS,
    requireUiAck: config.METERED_LAUNCH_DATA_REQUIRE_UI_ACK,
    requireDataWalletReady:
      config.METERED_LAUNCH_DATA_REQUIRE_DATA_WALLET_READY,
    staleNoTradesMs: config.ROLLING_TRACKER_STALE_NO_TRADES_MS,
    schedulerQueueLimit: config.ROLLING_TRACKER_QUEUE_LIMIT,
    schedulerQueueMaxAgeMs: config.ROLLING_TRACKER_QUEUE_MAX_AGE_MS,
    startActive: config.METERED_LAUNCH_DATA_START_ACTIVE
  }),
  liveTradeTracking: {
    acknowledgedMetered: false,
    autoMaxAgeSeconds: config.LIVE_TRADE_TRACKING_AUTO_MAX_AGE_SECONDS,
    autoMinAgeSeconds: config.LIVE_TRADE_TRACKING_AUTO_MIN_AGE_SECONDS,
    autoMinIdentityConfidence:
      config.LIVE_TRADE_TRACKING_AUTO_MIN_IDENTITY_CONFIDENCE,
    autoMode: "none",
    autoRequireRealData: config.LIVE_TRADE_TRACKING_AUTO_REQUIRE_REAL_DATA,
    enabled: false,
    maxEventsPerMint: config.LIVE_TRADE_TRACKING_MAX_EVENTS_PER_MINT,
    maxEventsPerSession: config.LIVE_TRADE_TRACKING_MAX_EVENTS_PER_SESSION,
    maxSubscribedTokens: config.LIVE_TRADE_TRACKING_MAX_MINTS,
    unsubscribeAfterMs: config.LIVE_TRADE_TRACKING_UNSUBSCRIBE_AFTER_MS
  },
  liveCardEnrichment: {
    cacheTtlMs: config.LIVE_CARD_ENRICHMENT_CACHE_TTL_MS,
    dexScreenerEnabled: config.DEXSCREENER_ENABLED,
    enabled: config.LIVE_CARD_ENRICHMENT_ENABLED,
    jupiterPriceEnabled: config.JUPITER_PRICE_ENABLED,
    maxMintsPerMinute: config.LIVE_CARD_ENRICHMENT_MAX_MINTS_PER_MINUTE,
    onNewToken: config.LIVE_CARD_ENRICHMENT_ON_NEW_TOKEN
  },
  watchedWalletExit: {
    accountTradesAcknowledgedMetered:
      config.EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED,
    accountTradesEnabled: config.EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED,
    apiKeyConfigured: dataApiKey !== undefined,
    cooldownMs: config.EXIT_STRATEGY_COOLDOWN_MS,
    defaultMinProfitPct: config.EXIT_STRATEGY_DEFAULT_MIN_PROFIT_PCT,
    defaultSellPct: config.EXIT_STRATEGY_DEFAULT_SELL_PCT,
    enabled: config.EXIT_STRATEGY_ENABLED,
    eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
    maxEventsPerSession: config.EXIT_STRATEGY_MAX_EVENTS_PER_SESSION,
    maxSessionCostSol: config.EXIT_STRATEGY_MAX_SESSION_COST_SOL,
    maxWatchedWallets: config.EXIT_STRATEGY_MAX_WATCHED_WALLETS,
    requireDataWalletReady: config.EXIT_STRATEGY_REQUIRE_DATA_WALLET_READY
  },
  paperPortfolio: {
    enabled: config.PAPER_PORTFOLIO_ENABLED,
    startingCashSol: config.PAPER_PORTFOLIO_STARTING_CASH_SOL,
    maxPositionSizeSol: config.PAPER_PORTFOLIO_MAX_POSITION_SIZE_SOL,
    maxOpenPositions: config.PAPER_PORTFOLIO_MAX_OPEN_POSITIONS,
    maxDailySpendSol: config.PAPER_PORTFOLIO_MAX_DAILY_SPEND_SOL,
    feeBps: config.PAPER_PORTFOLIO_FEE_BPS,
    slippageBps: config.PAPER_PORTFOLIO_SLIPPAGE_BPS,
    requirePriceForEntry: config.PAPER_PORTFOLIO_REQUIRE_PRICE_FOR_ENTRY,
    requirePriceForExit: config.PAPER_PORTFOLIO_REQUIRE_PRICE_FOR_EXIT,
    allowPartialExits: config.PAPER_PORTFOLIO_ALLOW_PARTIAL_EXITS,
    fallbackPriceSol: config.PAPER_PORTFOLIO_FALLBACK_PRICE_SOL ?? null,
    paperOnly: true,
    resetEnabled: config.PAPER_PORTFOLIO_RESET_ENABLED,
    entry: {
      enabled: config.PAPER_ENTRY_ENABLED,
      minLaunchScore: config.PAPER_ENTRY_MIN_LAUNCH_SCORE,
      allowedLabels: ["ripping", "hot"],
      maxRiskLevel: config.PAPER_ENTRY_MAX_RISK_LEVEL,
      blockHardReject: true,
      requireTradeTracked: config.PAPER_ENTRY_REQUIRE_TRADE_TRACKED,
      requirePrice: config.PAPER_ENTRY_REQUIRE_PRICE,
      minValidTradeSamples: config.PAPER_ENTRY_MIN_VALID_SAMPLES,
      minBuySellRatio: config.PAPER_ENTRY_MIN_BUY_SELL_RATIO,
      minUniqueBuyers10s: config.PAPER_ENTRY_MIN_UNIQUE_BUYERS_10S,
      maxAgeSeconds: config.PAPER_ENTRY_MAX_AGE_SECONDS,
      positionSizeSol: config.PAPER_ENTRY_POSITION_SIZE_SOL,
      cooldownByMintMs: config.PAPER_ENTRY_COOLDOWN_MS
    },
    exit: {
      enabled: config.PAPER_EXIT_ENABLED,
      allowWatchedWalletSignals: config.PAPER_EXIT_ALLOW_WATCHED_WALLET_SIGNALS,
      defaultSellPct: config.PAPER_EXIT_DEFAULT_SELL_PCT,
      requirePrice: config.PAPER_EXIT_REQUIRE_PRICE,
      minProfitPct: config.PAPER_EXIT_MIN_PROFIT_PCT,
      takeProfitPct: config.PAPER_EXIT_TAKE_PROFIT_PCT,
      stopLossPct: config.PAPER_EXIT_STOP_LOSS_PCT,
      trailingStopPct: config.PAPER_EXIT_TRAILING_STOP_PCT ?? null,
      cooldownMs: config.PAPER_EXIT_COOLDOWN_MS
    }
  },
  pumpPortalDataWallet: {
    apiKeyConfigured: dataApiKey !== undefined,
    balanceRefreshMs: config.PUMPPORTAL_DATA_WALLET_BALANCE_REFRESH_MS,
    commitment: config.SOLANA_RPC_COMMITMENT,
    criticalBalanceSol: config.PUMPPORTAL_DATA_WALLET_CRITICAL_BALANCE_SOL,
    eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
    minBalanceSol: config.PUMPPORTAL_DATA_WALLET_MIN_BALANCE_SOL,
    publicKey: config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY,
    requestTimeoutMs: config.CHAIN_VERIFIER_REQUEST_TIMEOUT_MS,
    rpcHttpUrl: config.SOLANA_RPC_HTTP,
    targetBalanceSol: config.PUMPPORTAL_DATA_WALLET_TARGET_BALANCE_SOL,
    warnBalanceSol: config.PUMPPORTAL_DATA_WALLET_WARN_BALANCE_SOL
  },
  pumpPortalWallets: {
    balanceRefreshMs: config.PUMPPORTAL_WALLET_BALANCE_REFRESH_MS,
    commitment: config.SOLANA_RPC_COMMITMENT,
    criticalBalanceSol: config.PUMPPORTAL_WALLET_MIN_BALANCE_SOL,
    dataWallet: {
      role: "data",
      apiKeyConfigured: dataApiKey !== undefined,
      publicKey: config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY
    },
    minBalanceSol: config.PUMPPORTAL_WALLET_MIN_BALANCE_SOL,
    requestTimeoutMs: config.CHAIN_VERIFIER_REQUEST_TIMEOUT_MS,
    rpcHttpUrl: config.SOLANA_RPC_HTTP,
    sameWalletAllowed: samePumpPortalWallet,
    targetBalanceSol: config.PUMPPORTAL_WALLET_TARGET_BALANCE_SOL,
    tradingWallet: {
      role: "trading",
      apiKeyConfigured: tradingApiKey !== undefined,
      publicKey: tradingWalletPublicKey
    },
    warnBalanceSol: config.PUMPPORTAL_WALLET_WARN_BALANCE_SOL
  },
  lightning: {
    enabled: config.PUMPPORTAL_LIGHTNING_READINESS_ENABLED,
    liveTradingAllowed: false,
    manualArmRequired: true,
    manualArmed: false,
    baseUrl: config.PUMPPORTAL_LIGHTNING_BASE_URL,
    limits: {
      maxBuySol: config.PUMPPORTAL_LIGHTNING_MAX_BUY_SOL,
      maxDailySol: config.PUMPPORTAL_LIGHTNING_MAX_DAILY_SOL,
      maxOpenPositions: config.PUMPPORTAL_LIGHTNING_MAX_OPEN_POSITIONS,
      maxSlippagePct: config.PUMPPORTAL_LIGHTNING_MAX_SLIPPAGE_PCT,
      priorityFeeSol: config.PUMPPORTAL_LIGHTNING_PRIORITY_FEE_SOL,
      pool: config.PUMPPORTAL_LIGHTNING_POOL,
      skipPreflight: config.PUMPPORTAL_LIGHTNING_SKIP_PREFLIGHT,
      jitoOnly: config.PUMPPORTAL_LIGHTNING_JITO_ONLY
    }
  },
  indexer: {
    enabled: config.API_INDEXER_ADAPTER_ENABLED,
    liveStateEnabled: config.API_INDEXER_LIVE_STATE_ENABLED,
    preferLiveStateCards: config.API_INDEXER_PREFER_LIVE_STATE_CARDS,
    recentEventLimit: config.API_INDEXER_RECENT_EVENT_LIMIT,
    timeseries: {
      retentionMs: config.TIMESERIES_RETENTION_MS
    },
    managedStream: {
      enabled: config.MANAGED_STREAM_ENABLED,
      provider: config.MANAGED_STREAM_PROVIDER,
      commitment: config.MANAGED_STREAM_COMMITMENT,
      endpoint: config.MANAGED_STREAM_ENDPOINT,
      authToken: config.MANAGED_STREAM_AUTH_TOKEN,
      apiKey: config.MANAGED_STREAM_API_KEY,
      allowRealConnection: config.MANAGED_STREAM_ALLOW_REAL_CONNECTION,
      realProvider: config.MANAGED_STREAM_REAL_PROVIDER,
      realConnectionAck: config.MANAGED_STREAM_REAL_CONNECTION_ACK,
      maxReconnectAttempts: config.MANAGED_STREAM_MAX_RECONNECT_ATTEMPTS,
      reconnectBackoffMs: config.MANAGED_STREAM_RECONNECT_BACKOFF_MS,
      transactionsEnabled: config.MANAGED_STREAM_TRANSACTIONS_ENABLED,
      transactionAccountInclude:
        config.MANAGED_STREAM_TRANSACTION_ACCOUNT_INCLUDE,
      transactionAccountExclude:
        config.MANAGED_STREAM_TRANSACTION_ACCOUNT_EXCLUDE,
      transactionAccountRequired:
        config.MANAGED_STREAM_TRANSACTION_ACCOUNT_REQUIRED,
      includeVotes: config.MANAGED_STREAM_INCLUDE_VOTES,
      includeFailed: config.MANAGED_STREAM_INCLUDE_FAILED,
      yellowstoneEnabled: config.YELLOWSTONE_ENABLED,
      yellowstoneEndpoint: config.YELLOWSTONE_GRPC_URL,
      yellowstoneAuthToken: config.YELLOWSTONE_GRPC_TOKEN,
      laserstreamEnabled: config.LASERSTREAM_ENABLED,
      laserstreamEndpoint: config.LASERSTREAM_GRPC_URL,
      laserstreamAuthToken: config.LASERSTREAM_API_KEY,
      laserstreamRegion: config.LASERSTREAM_REGION,
      laserstreamCommitment: config.LASERSTREAM_COMMITMENT,
      laserstreamTransactionsEnabled: config.LASERSTREAM_TRANSACTIONS_ENABLED,
      laserstreamAccountInclude: config.LASERSTREAM_ACCOUNT_INCLUDE,
      laserstreamAccountExclude: config.LASERSTREAM_ACCOUNT_EXCLUDE,
      laserstreamAccountRequired: config.LASERSTREAM_ACCOUNT_REQUIRED,
      laserstreamProgramInclude: config.LASERSTREAM_PROGRAM_INCLUDE,
      laserstreamIncludeVotes: config.LASERSTREAM_INCLUDE_VOTES,
      laserstreamIncludeFailed: config.LASERSTREAM_INCLUDE_FAILED,
      laserstreamMaxMessagesPerSession:
        config.LASERSTREAM_MAX_MESSAGES_PER_SESSION,
      laserstreamMaxRuntimeMs: config.LASERSTREAM_MAX_RUNTIME_MS,
      laserstreamStopOnError: config.LASERSTREAM_STOP_ON_ERROR,
      laserstreamReconnectEnabled: config.LASERSTREAM_RECONNECT_ENABLED,
      laserstreamReplayEnabled: config.LASERSTREAM_REPLAY_ENABLED,
      laserstreamReplayFromSlot: config.LASERSTREAM_REPLAY_FROM_SLOT,
      pumpfunProgramId: config.PUMPFUN_PROGRAM_ID,
      pumpswapProgramId: config.PUMPSWAP_PROGRAM_ID
    }
  },
  allowMockData: config.ALLOW_MOCK_DATA,
  failIfNoRealData: config.FAIL_IF_NO_REAL_DATA,
  mockFeedEnabled: config.MOCK_FEED_ENABLED,
  mockFeedRequireExplicitEnable: config.MOCK_FEED_REQUIRE_EXPLICIT_ENABLE,
  pumpPortal,
  port: config.API_PORT,
  realDataRequired: config.REAL_DATA_REQUIRED,
  signalIntervalMs: config.SIGNAL_INTERVAL_MS
};

options.tokenIdentity = createTokenIdentityConfig({
  solanaMetadataEnabled: config.TOKEN_IDENTITY_SOLANA_METADATA_ENABLED,
  solanaMetadataOnDemand: config.TOKEN_IDENTITY_SOLANA_METADATA_ON_DEMAND,
  solanaMetadataOnNewToken: config.TOKEN_IDENTITY_SOLANA_METADATA_ON_NEW_TOKEN,
  offchainFetchEnabled: config.TOKEN_IDENTITY_OFFCHAIN_FETCH_ENABLED,
  offchainTimeoutMs: config.TOKEN_IDENTITY_OFFCHAIN_TIMEOUT_MS,
  offchainCacheTtlMs: config.TOKEN_IDENTITY_OFFCHAIN_CACHE_TTL_MS,
  ipfsGateway: config.TOKEN_IDENTITY_IPFS_GATEWAY,
  maxMetadataBytes: config.TOKEN_IDENTITY_MAX_METADATA_BYTES
});

options.watchOrchestrator = {
  enabled: config.WATCH_ORCHESTRATOR_ENABLED,
  verifyOnNewToken: config.WATCH_ORCHESTRATOR_VERIFY_ON_NEW_TOKEN,
  verifyOnMigration: config.WATCH_ORCHESTRATOR_VERIFY_ON_MIGRATION,
  watchOnNewToken: config.WATCH_ORCHESTRATOR_WATCH_ON_NEW_TOKEN,
  watchOnMigration: config.WATCH_ORCHESTRATOR_WATCH_ON_MIGRATION,
  maxTargetsPerCandidate: config.WATCH_ORCHESTRATOR_MAX_TARGETS_PER_CANDIDATE,
  allowMintWatch: config.WATCH_ORCHESTRATOR_ALLOW_MINT_WATCH,
  allowBondingCurveWatch: config.WATCH_ORCHESTRATOR_ALLOW_BONDING_CURVE_WATCH,
  allowPoolWatch: config.WATCH_ORCHESTRATOR_ALLOW_POOL_WATCH,
  allowProgramWatch: config.WATCH_ORCHESTRATOR_ALLOW_PROGRAM_WATCH,
  allowWalletWatch: config.WATCH_ORCHESTRATOR_ALLOW_WALLET_WATCH,
  minConfidenceToWatch: config.WATCH_ORCHESTRATOR_MIN_CONFIDENCE_TO_WATCH
};

if (config.MOCK_FEED_MAX_EVENTS !== undefined) {
  mockFeed.maxEvents = config.MOCK_FEED_MAX_EVENTS;
}

if (config.MOCK_FEED_SEED !== undefined) {
  mockFeed.seed = config.MOCK_FEED_SEED;
}

if (config.STORAGE_DATABASE_PATH !== undefined) {
  options.storageDatabasePath = config.STORAGE_DATABASE_PATH;
}

if (config.SOLANA_RPC_HTTP !== undefined && options.chainVerifier) {
  options.chainVerifier.rpcHttpUrl = config.SOLANA_RPC_HTTP;
}

if (config.SOLANA_RPC_HTTP !== undefined && options.chainEvents) {
  options.chainEvents.rpcHttpUrl = config.SOLANA_RPC_HTTP;
}

if (config.SOLANA_RPC_HTTP !== undefined && options.tokenIdentity) {
  options.tokenIdentity.rpcHttpUrl = config.SOLANA_RPC_HTTP;
}

if (config.SOLANA_RPC_WS !== undefined && options.chainEvents) {
  options.chainEvents.rpcWsUrl = config.SOLANA_RPC_WS;
}

if (dataApiKey !== undefined) {
  pumpPortal.apiKey = dataApiKey;
}

if (config.PUMPPORTAL_WS_URL !== undefined) {
  pumpPortal.wsUrl = config.PUMPPORTAL_WS_URL;
}

const server = await startApiServer(options);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  server.app.log.info({ signal }, "Shutting down");
  await server.close();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

server.app.log.info(
  {
    mode: config.BOT_MODE,
    dataFeedMode: config.DATA_FEED_MODE,
    feedProvider: server.feed.name,
    paperAutoOrder: config.PAPER_AUTO_ORDER,
    port: config.API_PORT,
    chainEvents: server.chainEvents.getStatus(),
    marketData: server.chainEvents.getMarketStatus(),
    watchOrchestrator: server.watchOrchestration.getStatus(),
    chainVerifier: server.chainVerifier.getStatus(),
    actualData: server.actualData.getStatus(),
    launchScanner: server.launchScanner.getStatus(),
    meteredLaunchData: server.meteredLaunchData.getStatus(),
    watchedWalletExit: server.watchedWalletExit.getStatus(),
    paperPortfolio: server.paperPortfolio.getStatus(),
    dataWallet: server.pumpPortalDataWallet.getStatus(),
    pumpPortalWallets: server.pumpPortalWallets.getStatus(),
    lightningReadiness: server.lightningReadiness.getStatus(),
    liveTradeTracking: config.LIVE_TRADE_TRACKING_ENABLED,
    liveCardEnrichment: config.LIVE_CARD_ENRICHMENT_ENABLED,
    tokenIdentity: server.tokenIdentity.getStatus(),
    signalIntervalMs: config.SIGNAL_INTERVAL_MS,
    storagePath: server.storage.databasePath
  },
  "AXI API started in paper mode"
);

function parseWatchedAddresses(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => ({
      address,
      kind: "unknown" as const,
      source: "env",
      reasonCodes: ["CHAIN_EVENTS_ENV_WATCH"]
    }));
}
