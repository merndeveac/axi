import { loadApiConfig } from "./app";
import {
  createActualDataConfig,
  createActualDataService
} from "./actual-data-service";
import {
  createMeteredLaunchDataConfig,
  createMeteredLaunchDataService
} from "./metered-launch-data-service";
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
    acknowledgedMetered: config.METERED_LAUNCH_DATA_ACK_COST,
    apiKeyConfigured: dataApiKey !== undefined,
    enabled: config.METERED_LAUNCH_DATA_ENABLED,
    maxEventsPerMint: config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT,
    maxEventsPerSession: config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION,
    maxSubscribedTokens: config.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS,
    requireApiKey: true,
    unsubscribeAfterMs: config.METERED_LAUNCH_DATA_EXTENDED_TRACK_MS
  }),
  dataWalletReadiness: () => pumpPortalDataWallet.getActualDataReadiness(),
  providerName: config.DATA_FEED
});
const meteredLaunchData = createMeteredLaunchDataService({
  actualData,
  config: createMeteredLaunchDataConfig({
    acknowledgedCost: config.METERED_LAUNCH_DATA_ACK_COST,
    apiKeyConfigured: dataApiKey !== undefined,
    autoUnsubscribeOnHardReject:
      config.METERED_LAUNCH_DATA_AUTO_UNSUBSCRIBE_ON_HARD_REJECT,
    autoUnsubscribeOnLowScore:
      config.METERED_LAUNCH_DATA_AUTO_UNSUBSCRIBE_ON_LOW_SCORE,
    dataWalletPublicKeyConfigured:
      config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY !== undefined,
    enabled: config.METERED_LAUNCH_DATA_ENABLED,
    eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
    extendedTrackMs: config.METERED_LAUNCH_DATA_EXTENDED_TRACK_MS,
    initialTrackMs: config.METERED_LAUNCH_DATA_INITIAL_TRACK_MS,
    liveDiscoveryEnabled: config.PUMPPORTAL_LIVE_DISCOVERY_ENABLED,
    maxConcurrentMints: config.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS,
    maxEventsPerMint: config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT,
    maxEventsPerSession: config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION,
    maxSessionCostSol: config.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL,
    minScoreToExtend: config.METERED_LAUNCH_DATA_MIN_SCORE_TO_EXTEND,
    minScoreToTrack: config.METERED_LAUNCH_DATA_MIN_SCORE_TO_TRACK,
    mode: config.METERED_LAUNCH_DATA_MODE,
    projectRateWindowMs: config.METERED_LAUNCH_DATA_PROJECT_RATE_WINDOW_MS,
    requireDataWalletReady:
      config.METERED_LAUNCH_DATA_REQUIRE_DATA_WALLET_READY
  }),
  dataWalletReadiness: () => pumpPortalDataWallet.getActualDataReadiness(),
  providerName: config.DATA_FEED
});

console.log(JSON.stringify(meteredLaunchData.getStatus(), null, 2));
