import { loadApiConfig, startApiServer } from "./app";
import type { ApiServerOptions } from "./app";
import type {
  MockFeedProviderOptions,
  PumpPortalFeedProviderOptions
} from "@axi/data-feeds";

const config = loadApiConfig();
const mockFeed: MockFeedProviderOptions = {
  scenario: config.MOCK_FEED_SCENARIO
};
const pumpPortal: PumpPortalFeedProviderOptions = {
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
    onChainVerified: config.CHAIN_EVENTS_ON_CHAIN_VERIFIED,
    onNewCandidate: config.CHAIN_EVENTS_ON_NEW_CANDIDATE,
    requestTimeoutMs: config.CHAIN_EVENTS_REQUEST_TIMEOUT_MS,
    watchedAddresses: parseWatchedAddresses(config.CHAIN_EVENTS_WATCHED_ADDRESSES)
  },
  chainVerifier: {
    cacheTtlMs: config.CHAIN_VERIFIER_CACHE_TTL_MS,
    commitment: config.SOLANA_RPC_COMMITMENT,
    enabled: config.CHAIN_VERIFIER_ENABLED,
    maxConcurrent: config.CHAIN_VERIFIER_MAX_CONCURRENT,
    onMigration: config.CHAIN_VERIFIER_ON_MIGRATION,
    onMock: config.CHAIN_VERIFIER_ON_MOCK,
    onNewToken: config.CHAIN_VERIFIER_ON_NEW_TOKEN,
    requestTimeoutMs: config.CHAIN_VERIFIER_REQUEST_TIMEOUT_MS
  },
  dataFeed: config.DATA_FEED,
  host: config.API_HOST,
  logLevel: config.LOG_LEVEL,
  mockFeed,
  mode: config.BOT_MODE,
  paperAutoOrder: config.PAPER_AUTO_ORDER,
  pumpPortal,
  port: config.API_PORT,
  signalIntervalMs: config.SIGNAL_INTERVAL_MS
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
    feedProvider: server.feed.name,
    paperAutoOrder: config.PAPER_AUTO_ORDER,
    port: config.API_PORT,
    chainEvents: server.chainEvents.getStatus(),
    chainVerifier: server.chainVerifier.getStatus(),
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
