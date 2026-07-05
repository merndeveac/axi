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
const args = parseArgs(process.argv.slice(2));
const actualData = createActualDataService({
  config: createActualDataConfig({
    acknowledgedMetered: config.PUMPPORTAL_LAUNCH_TRACKING_ACK_METERED,
    apiKeyConfigured:
      (config.PUMPPORTAL_DATA_API_KEY ?? config.PUMPPORTAL_API_KEY) !==
      undefined,
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
  config: createLaunchScannerConfig({
    maxEventsPerSession:
      config.PUMPPORTAL_LAUNCH_TRACKING_MAX_EVENTS_PER_SESSION,
    maxSessionCostSol:
      config.PUMPPORTAL_LAUNCH_TRACKING_MAX_SESSION_COST_SOL,
    eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000
  }),
  providerName: config.DATA_FEED
});

console.log(JSON.stringify(launchScanner.estimateCost(args), null, 2));

function parseArgs(argv: string[]) {
  const parsed = {
    avgEventsPerToken: 20,
    tokensPerHour: 500
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--tokens-per-hour") {
      parsed.tokensPerHour = Number.parseFloat(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--avg-events-per-token") {
      parsed.avgEventsPerToken = Number.parseFloat(readValue(argv, index, arg));
      index += 1;
    }
  }

  if (!Number.isFinite(parsed.tokensPerHour) || parsed.tokensPerHour <= 0) {
    throw new Error("--tokens-per-hour must be positive");
  }

  if (
    !Number.isFinite(parsed.avgEventsPerToken) ||
    parsed.avgEventsPerToken <= 0
  ) {
    throw new Error("--avg-events-per-token must be positive");
  }

  return parsed;
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}
