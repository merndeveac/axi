import { PumpPortalFeedProvider, type FeedEvent } from "@axi/data-feeds";
import { loadApiConfig } from "./app";

type LiveProbeArgs = {
  limit: number;
  timeoutMs: number;
};

const config = loadApiConfig();
const args = parseArgs(process.argv.slice(2));
const configuredApiKey =
  config.PUMPPORTAL_DATA_API_KEY ?? config.PUMPPORTAL_API_KEY;
const provider = new PumpPortalFeedProvider({
  ...(configuredApiKey ? { apiKey: configuredApiKey } : {}),
  maxEvents: args.limit,
  subscribeMigration: true,
  subscribeNewToken: true,
  ...(config.PUMPPORTAL_WS_URL ? { wsUrl: config.PUMPPORTAL_WS_URL } : {})
});
let count = 0;
let settled = false;

console.error(
  JSON.stringify({
    provider: "pumpportal",
    apiKeyConfigured: configuredApiKey !== undefined,
    meteredTokenTrades: false,
    subscriptions: ["subscribeNewToken", "subscribeMigration"],
    paperOnly: true
  })
);

await new Promise<void>((resolve) => {
  const timeout = setTimeout(() => {
    finish(resolve);
  }, args.timeoutMs);

  const finish = (done: () => void) => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeout);
    void provider.stop();
    done();
  };

  void provider.start((event) => {
    if (!isLiveTokenEvent(event)) {
      return;
    }

    count += 1;
    console.log(JSON.stringify(event));

    if (count >= args.limit) {
      finish(resolve);
    }
  });
});

const status = provider.getStatus();

if (count === 0 && status.connected) {
  console.error(
    JSON.stringify({
      status: "NO_LIVE_EVENTS_WITHIN_TIMEOUT",
      feed: status,
      paperOnly: true
    })
  );
  process.exitCode = 2;
}

if (count === 0 && !status.connected) {
  console.error(
    JSON.stringify({
      status: "LIVE_FEED_CONNECTION_FAILED",
      feed: status,
      paperOnly: true
    })
  );
  process.exitCode = 1;
}

function parseArgs(argv: string[]): LiveProbeArgs {
  const parsed: LiveProbeArgs = {
    limit: 10,
    timeoutMs: 60_000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--limit") {
      parsed.limit = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
      continue;
    }

    if (arg === "--timeout") {
      parsed.timeoutMs = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
    }
  }

  if (!Number.isInteger(parsed.limit) || parsed.limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }

  if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive integer in milliseconds");
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

function isLiveTokenEvent(event: FeedEvent): boolean {
  return event.type === "token_created" && event.source === "pumpportal";
}
