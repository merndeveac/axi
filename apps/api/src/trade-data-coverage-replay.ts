import { runOfflineTradeDataCoverageReplay } from "./trade-data-coverage-replay-service";

const args = parseArgs(process.argv.slice(2));
const result = runOfflineTradeDataCoverageReplay({
  fromDatabase: args.fromDatabase,
  sessionId: args.sessionId,
  ...(args.outputDatabase ? { outputDatabase: args.outputDatabase } : {})
});

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`status=${result.status}`);
  console.log(`observedMatchingTrades=${result.observedMatchingTrades}`);
  console.log(`canonicalAdmittedTrades=${result.canonicalAdmittedTrades}`);
  console.log(
    `postStopEvidenceOnlyTrades=${result.postStopEvidenceOnlyTrades}`
  );
  console.log(`sourceDatabaseUnchanged=${result.sourceDatabaseUnchanged}`);
}

if (result.status !== "OFFLINE_REPLAY_PASSED") {
  process.exitCode = 1;
}

function parseArgs(argv: string[]): {
  fromDatabase: string;
  sessionId: string;
  outputDatabase?: string;
  json: boolean;
} {
  let fromDatabase: string | undefined;
  let sessionId: string | undefined;
  let outputDatabase: string | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--from-db") {
      fromDatabase = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--session") {
      sessionId = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--output-db") {
      outputDatabase = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--json") {
      json = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!fromDatabase) {
    throw new Error("--from-db is required");
  }
  if (!sessionId) {
    throw new Error("--session is required");
  }
  return {
    fromDatabase,
    sessionId,
    ...(outputDatabase ? { outputDatabase } : {}),
    json
  };
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function parseBoolean(value: string, arg: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${arg} must be true or false`);
}
