import {
  isValidSolanaMint,
  PumpPortalFeedProvider,
  type FeedEvent
} from "@axi/data-feeds";
import { loadApiConfig } from "./app";

type ProbeArgs = {
  ackMetered: boolean;
  apiKey?: string;
  json: boolean;
  limit: number;
  mints: string[];
  timeoutMs: number;
};

const config = loadApiConfig();
const args = parseArgs(process.argv.slice(2));

if (!args.ackMetered) {
  throw new Error("--ack-metered is required because subscribeTokenTrade is metered");
}

for (const mint of args.mints) {
  if (!isValidSolanaMint(mint)) {
    throw new Error(`Invalid Solana mint: ${mint}`);
  }
}

const apiKey = args.apiKey ?? config.PUMPPORTAL_API_KEY;

if (!apiKey) {
  throw new Error(
    "PUMPPORTAL_API_KEY or --api-key is required for actual-data probe"
  );
}

const provider = new PumpPortalFeedProvider({
  apiKey,
  maxEvents: args.limit,
  maxTokenTradeEventsPerSession: args.limit,
  maxTokenTradeSubscriptions: args.mints.length,
  subscribeMigration: false,
  subscribeNewToken: false,
  ...(config.PUMPPORTAL_WS_URL ? { wsUrl: config.PUMPPORTAL_WS_URL } : {})
});
let count = 0;
let settled = false;

provider.subscribeTokenTrades(args.mints);

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
    if (!isPumpPortalTokenTradeEvent(event)) {
      return;
    }

    count += 1;
    printEvent(event, args.json);

    if (count >= args.limit) {
      finish(resolve);
    }
  });
});

function parseArgs(argv: string[]): ProbeArgs {
  const parsed: ProbeArgs = {
    ackMetered: false,
    json: true,
    limit: 25,
    mints: [],
    timeoutMs: 30_000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mint") {
      parsed.mints.push(...readMintValues(readValue(argv, index, arg)));
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

    if (arg === "--api-key") {
      parsed.apiKey = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--json") {
      parsed.json = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--ack-metered") {
      parsed.ackMetered = true;
      continue;
    }
  }

  parsed.mints = Array.from(new Set(parsed.mints));

  if (parsed.mints.length === 0) {
    throw new Error("--mint is required at least once");
  }

  if (!Number.isInteger(parsed.limit) || parsed.limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }

  if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive integer in milliseconds");
  }

  return parsed;
}

function readMintValues(value: string): string[] {
  return value
    .split(",")
    .map((mint) => mint.trim())
    .filter(Boolean);
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function parseBoolean(value: string, arg: string): boolean {
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${arg} must be true or false`);
}

function isPumpPortalTokenTradeEvent(event: FeedEvent): boolean {
  return (
    event.type === "trade" &&
    event.source === "pumpportal" &&
    event.reasonCodes?.includes("PUMPPORTAL_TOKEN_TRADE") === true
  );
}

function printEvent(event: FeedEvent, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(event));
    return;
  }

  if (event.type !== "trade") {
    return;
  }

  console.log(
    [
      event.timestamp,
      event.mint,
      event.side,
      event.priceSol ?? "--",
      event.volumeSol ?? "--",
      event.signature ?? "--"
    ].join(" ")
  );
}
