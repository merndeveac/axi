import { loadApiConfig, startApiServer } from "./app";
import type { ApiServerOptions } from "./app";
import type {
  MockFeedProviderOptions,
  PumpPortalFeedProviderOptions
} from "@axi/data-feeds";
import {
  createActualDataConfig,
  parseManualMints
} from "./actual-data-service";
import { createTokenIdentityConfig } from "./token-identity-service";

const config = loadApiConfig();
const liveTradeTrackingEnabled = config.LIVE_TRADE_TRACKING_ENABLED;
const effectiveTokenTradeMaxSubscribedTokens = liveTradeTrackingEnabled
  ? Math.min(
      config.PUMPPORTAL_TOKEN_TRADES_MAX_SUBSCRIBED_TOKENS,
      config.LIVE_TRADE_TRACKING_MAX_MINTS
    )
  : config.PUMPPORTAL_TOKEN_TRADES_MAX_SUBSCRIBED_TOKENS;
const effectiveTokenTradeMaxEventsPerSession = liveTradeTrackingEnabled
  ? Math.min(
      config.PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_SESSION,
      config.LIVE_TRADE_TRACKING_MAX_EVENTS_PER_SESSION
    )
  : config.PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_SESSION;
const effectiveTokenTradeMaxEventsPerMint = liveTradeTrackingEnabled
  ? Math.min(
      config.PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_MINT,
      config.LIVE_TRADE_TRACKING_MAX_EVENTS_PER_MINT
    )
  : config.PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_MINT;
const effectiveActualDataEnabled =
  config.PUMPPORTAL_TOKEN_TRADES_ENABLED || liveTradeTrackingEnabled;
const effectiveActualDataAcknowledged =
  config.PUMPPORTAL_TOKEN_TRADES_ACK_METERED &&
  (!liveTradeTrackingEnabled || config.LIVE_TRADE_TRACKING_ACK_METERED);
const mockFeed: MockFeedProviderOptions = {
  scenario: config.MOCK_FEED_SCENARIO
};
const pumpPortal: PumpPortalFeedProviderOptions = {
  maxTokenTradeEventsPerMint: effectiveTokenTradeMaxEventsPerMint,
  maxTokenTradeEventsPerSession: effectiveTokenTradeMaxEventsPerSession,
  maxTokenTradeSubscriptions: effectiveTokenTradeMaxSubscribedTokens,
  subscribeMigration: config.PUMPPORTAL_SUBSCRIBE_MIGRATION,
  subscribeNewToken: config.PUMPPORTAL_SUBSCRIBE_NEW_TOKEN
};
const options: ApiServerOptions = {
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
    apiKeyConfigured: config.PUMPPORTAL_API_KEY !== undefined,
    autoSubscribe: config.PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE,
    autoSubscribeOnMigration:
      config.PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_MIGRATION,
    autoSubscribeOnNewToken:
      config.PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_NEW_TOKEN,
    autoSubscribeOnQualified:
      config.PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_QUALIFIED,
    enabled: effectiveActualDataEnabled,
    manualMints: parseManualMints(config.PUMPPORTAL_TOKEN_TRADES_MANUAL_MINTS),
    maxEventsPerMint: effectiveTokenTradeMaxEventsPerMint,
    maxEventsPerSession: effectiveTokenTradeMaxEventsPerSession,
    maxSubscribedTokens: effectiveTokenTradeMaxSubscribedTokens,
    minScoreToAutoSubscribe:
      config.PUMPPORTAL_TOKEN_TRADES_MIN_SCORE_TO_AUTO_SUBSCRIBE,
    requireApiKey: config.PUMPPORTAL_TOKEN_TRADES_REQUIRE_API_KEY,
    unsubscribeAfterMs: liveTradeTrackingEnabled
      ? Math.min(
          config.PUMPPORTAL_TOKEN_TRADES_UNSUBSCRIBE_AFTER_MS,
          config.LIVE_TRADE_TRACKING_UNSUBSCRIBE_AFTER_MS
        )
      : config.PUMPPORTAL_TOKEN_TRADES_UNSUBSCRIBE_AFTER_MS
  }),
  liveTradeTracking: {
    acknowledgedMetered: config.LIVE_TRADE_TRACKING_ACK_METERED,
    autoMaxAgeSeconds: config.LIVE_TRADE_TRACKING_AUTO_MAX_AGE_SECONDS,
    autoMinAgeSeconds: config.LIVE_TRADE_TRACKING_AUTO_MIN_AGE_SECONDS,
    autoMinIdentityConfidence:
      config.LIVE_TRADE_TRACKING_AUTO_MIN_IDENTITY_CONFIDENCE,
    autoMode: config.LIVE_TRADE_TRACKING_AUTO_MODE,
    autoRequireRealData: config.LIVE_TRADE_TRACKING_AUTO_REQUIRE_REAL_DATA,
    enabled: liveTradeTrackingEnabled,
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
  pumpPortalDataWallet: {
    apiKeyConfigured: config.PUMPPORTAL_API_KEY !== undefined,
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

if (config.PUMPPORTAL_API_KEY !== undefined) {
  pumpPortal.apiKey = config.PUMPPORTAL_API_KEY;
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
    dataWallet: server.pumpPortalDataWallet.getStatus(),
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
