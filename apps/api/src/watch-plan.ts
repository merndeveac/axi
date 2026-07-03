import { existsSync, readFileSync } from "node:fs";
import { createWatchPlan } from "@axi/watch-orchestrator";
import type { FeedEvent } from "@axi/data-feeds";

type Args = {
  file?: string;
  json: boolean;
  mint?: string;
  source?: string;
};

try {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    throw new Error("--file is required. This command reads local JSON only.");
  }

  if (!existsSync(args.file)) {
    throw new Error(`FILE_NOT_FOUND: ${args.file}`);
  }

  const raw = JSON.parse(readFileSync(args.file, "utf8")) as unknown;
  const event = isFeedEvent(raw) ? raw : undefined;
  const mint = args.mint ?? (event ? getEventMint(event) : readMint(raw));

  if (!mint) {
    throw new Error("--mint is required when the file does not include a mint.");
  }

  const plan = createWatchPlan({
    ...(event ? { event } : {}),
    mint,
    options: {
      enabled: true,
      verifyOnNewToken: true,
      verifyOnMigration: true,
      watchOnNewToken: true,
      watchOnMigration: true
    },
    rawPayload: event ? undefined : raw,
    source: args.source ?? "manual"
  });

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(
      [
        plan.mint,
        plan.shouldVerifyMint ? "verify" : "no-verify",
        plan.shouldWatchEvents ? "watch" : "no-watch",
        `${plan.watchTargets.length} selected`,
        `${plan.skippedTargets.length} skipped`,
        plan.reasonCodes.join(",")
      ].join(" ")
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    json: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--file") {
      parsed.file = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--mint") {
      parsed.mint = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--source") {
      parsed.source = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--json") {
      parsed.json = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
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

function parseBoolean(value: string, arg: string): boolean {
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${arg} must be true or false`);
}

function isFeedEvent(value: unknown): value is FeedEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "token_created" || value.type === "trade")
  );
}

function getEventMint(event: FeedEvent): string {
  return event.type === "token_created" ? event.candidate.mint : event.mint;
}

function readMint(value: unknown): string | undefined {
  return (
    getString(value, "mint") ??
    getString(value, "tokenMint") ??
    getString(value, "baseMint") ??
    getString(value, "ca") ??
    getString(value, "address") ??
    getString(value, "contractAddress")
  );
}

function getString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  const next = (value as Record<string, unknown>)[key];
  return typeof next === "string" && next.length > 0 ? next : undefined;
}
