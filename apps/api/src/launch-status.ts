import { loadApiConfig } from "./app";
import {
  createActualDataConfig,
  createActualDataService
} from "./actual-data-service";
import {
  createLaunchScannerConfig,
  createLaunchScannerService
} from "./launch-scanner-service";

const config = loadApiConfig();
const dataApiKey = config.PUMPPORTAL_DATA_API_KEY ?? config.PUMPPORTAL_API_KEY;
const launchConfig = createLaunchScannerConfig({
  runtimeMode: config.AXI_RUNTIME_MODE,
  liveDiscoveryEnabled: config.PUMPPORTAL_LIVE_DISCOVERY_ENABLED,
  subscribeNewToken: config.PUMPPORTAL_SUBSCRIBE_NEW_TOKEN,
  subscribeMigration: config.PUMPPORTAL_SUBSCRIBE_MIGRATION,
  launchTrackingEnabled: config.PUMPPORTAL_LAUNCH_TRACKING_ENABLED,
  launchTrackingAcknowledgedMetered:
    config.PUMPPORTAL_LAUNCH_TRACKING_ACK_METERED,
  launchTrackingMode: config.PUMPPORTAL_LAUNCH_TRACKING_MODE,
  maxConcurrentTracked: config.PUMPPORTAL_LAUNCH_TRACKING_MAX_CONCURRENT,
  initialTrackingMs: config.PUMPPORTAL_LAUNCH_TRACKING_INITIAL_MS,
  extendedTrackingMs: config.PUMPPORTAL_LAUNCH_TRACKING_EXTENDED_MS,
  maxEventsPerToken: config.PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_TOKEN,
  maxEventsPerSession: config.PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_SESSION,
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
});
const actualData = createActualDataService({
  config: createActualDataConfig({
    acknowledgedMetered: config.PUMPPORTAL_LAUNCH_TRACKING_ACK_METERED,
    apiKeyConfigured: dataApiKey !== undefined,
    enabled: config.PUMPPORTAL_LAUNCH_TRACKING_ENABLED,
    maxEventsPerMint: config.PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_TOKEN,
    maxEventsPerSession:
      config.PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_SESSION,
    maxSubscribedTokens: config.PUMPPORTAL_LAUNCH_TRACKING_MAX_CONCURRENT,
    requireApiKey: true,
    unsubscribeAfterMs: config.PUMPPORTAL_LAUNCH_TRACKING_EXTENDED_MS
  }),
  providerName: config.DATA_FEED
});
const launchScanner = createLaunchScannerService({
  actualData,
  config: launchConfig,
  providerName: config.DATA_FEED
});

console.log(JSON.stringify(launchScanner.getStatus(), null, 2));
