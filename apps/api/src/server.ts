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
    signalIntervalMs: config.SIGNAL_INTERVAL_MS,
    storagePath: server.storage.databasePath
  },
  "AXI API started in paper mode"
);
