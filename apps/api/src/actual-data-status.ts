import { loadApiConfig } from "./app";
import {
  createActualDataConfig,
  createActualDataService,
  parseManualMints
} from "./actual-data-service";
import {
  createPumpPortalDataWalletConfig,
  createPumpPortalDataWalletService
} from "./pumpportal-data-wallet-service";

const config = loadApiConfig();
const dataApiKey = config.PUMPPORTAL_DATA_API_KEY ?? config.PUMPPORTAL_API_KEY;
const pumpPortalDataWallet = createPumpPortalDataWalletService({
  config: createPumpPortalDataWalletConfig({
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
  })
});
await pumpPortalDataWallet.refreshBalance({ force: true });

const actualData = createActualDataService({
  config: createActualDataConfig({
    acknowledgedMetered: config.PUMPPORTAL_TOKEN_TRADES_ACK_METERED,
    apiKeyConfigured: dataApiKey !== undefined,
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
  dataWalletReadiness: () => pumpPortalDataWallet.getActualDataReadiness(),
  providerName: config.DATA_FEED
});

console.log(JSON.stringify(actualData.getStatus(), null, 2));
