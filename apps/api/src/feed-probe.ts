import {
  MockFeedProvider,
  PumpPortalFeedProvider,
  type FeedEvent,
  type MockFeedProviderOptions,
  type PumpPortalFeedProviderOptions,
  type TokenFeedProvider
} from "@axi/data-feeds";
import { loadApiConfig } from "./app";

type ProbeArgs = {
  limit: number;
  migration?: boolean;
  newToken?: boolean;
  provider?: "mock" | "pumpportal";
  timeoutMs: number;
};

const config = loadApiConfig();
const args = parseArgs(process.argv.slice(2));
const provider = createProbeProvider(args);
let count = 0;
let settled = false;

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
    count += 1;
    printEvent(event);

    if (count >= args.limit) {
      finish(resolve);
    }
  });
});

function createProbeProvider(args: ProbeArgs): TokenFeedProvider {
  const providerName = args.provider ?? config.DATA_FEED;

  if (providerName === "pumpportal") {
    const options: PumpPortalFeedProviderOptions = {
      maxEvents: args.limit,
      subscribeMigration: args.migration ?? config.PUMPPORTAL_SUBSCRIBE_MIGRATION,
      subscribeNewToken: args.newToken ?? config.PUMPPORTAL_SUBSCRIBE_NEW_TOKEN
    };

    if (config.PUMPPORTAL_API_KEY !== undefined) {
      options.apiKey = config.PUMPPORTAL_API_KEY;
    }

    if (config.PUMPPORTAL_WS_URL !== undefined) {
      options.wsUrl = config.PUMPPORTAL_WS_URL;
    }

    return new PumpPortalFeedProvider(options);
  }

  const options: MockFeedProviderOptions = {
    intervalMs: 0,
    maxEvents: args.limit,
    scenario: config.MOCK_FEED_SCENARIO
  };

  if (config.MOCK_FEED_SEED !== undefined) {
    options.seed = config.MOCK_FEED_SEED;
  }

  return new MockFeedProvider(options);
}

function printEvent(event: FeedEvent): void {
  console.log(JSON.stringify(event));
}

function parseArgs(argv: string[]): ProbeArgs {
  const parsed: ProbeArgs = {
    limit: 10,
    timeoutMs: 30_000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--provider") {
      const provider = readValue(argv, index, arg);

      if (provider !== "mock" && provider !== "pumpportal") {
        throw new Error("--provider must be mock or pumpportal");
      }

      parsed.provider = provider;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      parsed.limit = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
      continue;
    }

    if (arg === "--timeout") {
      parsed.timeoutMs = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
      continue;
    }

    if (arg === "--new-token") {
      parsed.newToken = parseBoolean(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--migration") {
      parsed.migration = parseBoolean(readValue(argv, index, arg));
      index += 1;
      continue;
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

function parseBoolean(value: string): boolean {
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error("Expected boolean value true or false");
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}
