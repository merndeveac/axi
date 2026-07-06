import { closeStorage, initStorage } from "@axi/storage";
import { loadApiConfig } from "./app";
import {
  createWatchedWalletExitConfig,
  createWatchedWalletExitService
} from "./watched-wallet-exit-service";

const config = loadApiConfig();
const dataApiKey = config.PUMPPORTAL_DATA_API_KEY ?? config.PUMPPORTAL_API_KEY;

initStorage(
  config.STORAGE_DATABASE_PATH
    ? { databasePath: config.STORAGE_DATABASE_PATH }
    : {}
);

const service = createWatchedWalletExitService({
  config: createWatchedWalletExitConfig({
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
  }),
  providerName: config.DATA_FEED
});

service.start();

console.log(
  JSON.stringify(
    {
      ...service.getStatus(),
      networkDisabled: true,
      tradingDisabled: true
    },
    null,
    2
  )
);

closeStorage();
