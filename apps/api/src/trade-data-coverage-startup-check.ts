import {
  maximumStorageBusyTimeoutMs,
  defaultStorageBusyTimeoutMs
} from "@axi/storage";
import { runTradeDataCoverageStartupCheck } from "./trade-data-coverage-startup-check-service";

const args = parseArgs(process.argv.slice(2));
const result = await runTradeDataCoverageStartupCheck({
  busyTimeoutMs: args.timeoutMs,
  ...(args.databasePath ? { databasePath: args.databasePath } : {}),
  simulateLock: args.simulateLock
});

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`success=${result.success}`);
  console.log(`storageReady=${result.storageReady}`);
  console.log(`runtimeSessionPersisted=${result.runtimeSessionPersisted}`);
  console.log(`runtimeSessionFinalized=${result.runtimeSessionFinalized}`);
  console.log(`providerConnectCount=${result.providerConnectCount}`);
  console.log(`cleanupCompleted=${result.cleanupCompleted}`);
  if (result.safeErrorCode) {
    console.log(`safeErrorCode=${result.safeErrorCode}`);
  }
}

if (!result.success) {
  process.exitCode = 1;
}

function parseArgs(argv: string[]): {
  databasePath?: string;
  json: boolean;
  simulateLock: boolean;
  timeoutMs: number;
} {
  let databasePath: string | undefined;
  let json = false;
  let simulateLock = false;
  let timeoutMs = defaultStorageBusyTimeoutMs;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--db") {
      databasePath = readValue(argv, index, arg);
      index += 1;
    } else if (arg === "--json") {
      json = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === "--simulate-lock") {
      simulateLock = parseBoolean(readValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === "--timeout-ms") {
      timeoutMs = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 0 ||
    timeoutMs > maximumStorageBusyTimeoutMs
  ) {
    throw new Error(
      `--timeout-ms must be between 0 and ${maximumStorageBusyTimeoutMs}`
    );
  }

  return {
    ...(databasePath ? { databasePath } : {}),
    json,
    simulateLock,
    timeoutMs
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
