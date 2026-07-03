import { loadApiConfig } from "./app";
import {
  createActualDataConfig,
  createActualDataService,
  parseManualMints
} from "./actual-data-service";

const config = loadApiConfig();
const actualData = createActualDataService({
  config: createActualDataConfig({
    acknowledgedMetered: config.PUMPPORTAL_TOKEN_TRADES_ACK_METERED,
    apiKeyConfigured: config.PUMPPORTAL_API_KEY !== undefined,
    autoSubscribe: config.PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE,
    autoSubscribeOnMigration:
      config.PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_MIGRATION,
    autoSubscribeOnNewToken:
      config.PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_NEW_TOKEN,
    autoSubscribeOnQualified:
      config.PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_QUALIFIED,
    enabled: config.PUMPPORTAL_TOKEN_TRADES_ENABLED,
    manualMints: parseManualMints(
      config.PUMPPORTAL_TOKEN_TRADES_MANUAL_MINTS
    ),
    maxEventsPerMint: config.PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_MINT,
    maxEventsPerSession:
      config.PUMPPORTAL_TOKEN_TRADES_MAX_EVENTS_PER_SESSION,
    maxSubscribedTokens:
      config.PUMPPORTAL_TOKEN_TRADES_MAX_SUBSCRIBED_TOKENS,
    minScoreToAutoSubscribe:
      config.PUMPPORTAL_TOKEN_TRADES_MIN_SCORE_TO_AUTO_SUBSCRIBE,
    requireApiKey: config.PUMPPORTAL_TOKEN_TRADES_REQUIRE_API_KEY,
    unsubscribeAfterMs:
      config.PUMPPORTAL_TOKEN_TRADES_UNSUBSCRIBE_AFTER_MS
  }),
  providerName: config.DATA_FEED
});

console.log(JSON.stringify(actualData.getStatus(), null, 2));
