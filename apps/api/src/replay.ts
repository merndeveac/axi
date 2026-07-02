import { closeStorage, createReplayStream, initStorage } from "@axi/storage";

type ReplayArgs = {
  db?: string;
  limit: number;
  speed: number;
  type: "feed_events" | "signals";
};

const args = parseArgs(process.argv.slice(2));
const storage = args.db ? initStorage({ databasePath: args.db }) : initStorage();

try {
  for await (const item of createReplayStream({
    limit: args.limit,
    speed: args.speed,
    type: args.type
  })) {
    console.log(
      JSON.stringify({
        createdAt: item.createdAt,
        payload: item.payload,
        sequence: item.sequence,
        source: item.source
      })
    );
  }
} finally {
  closeStorage();
}

if (process.env.LOG_LEVEL === "debug") {
  console.error(`Replayed from ${storage.databasePath}`);
}

function parseArgs(argv: string[]): ReplayArgs {
  const parsed: ReplayArgs = {
    limit: 50,
    speed: 0,
    type: "feed_events"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--db") {
      parsed.db = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      parsed.limit = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
      continue;
    }

    if (arg === "--speed") {
      parsed.speed = Number.parseFloat(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--type") {
      const type = readValue(argv, index, arg);

      if (type !== "feed_events" && type !== "signals") {
        throw new Error("--type must be feed_events or signals");
      }

      parsed.type = type;
      index += 1;
      continue;
    }
  }

  if (!Number.isInteger(parsed.limit) || parsed.limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }

  if (!Number.isFinite(parsed.speed) || parsed.speed < 0) {
    throw new Error("--speed must be zero or a positive number");
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
