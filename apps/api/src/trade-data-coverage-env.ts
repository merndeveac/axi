import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const defaultEnvLocalPath = fileURLToPath(
  new URL("../../../.env.local", import.meta.url)
);

const coverageEnvironmentKeys = new Set([
  "CHAIN_VERIFIER_REQUEST_TIMEOUT_MS",
  "PUMPPORTAL_DATA_API_KEY",
  "PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000",
  "PUMPPORTAL_DATA_WALLET_BALANCE_REFRESH_MS",
  "PUMPPORTAL_DATA_WALLET_CRITICAL_BALANCE_SOL",
  "PUMPPORTAL_DATA_WALLET_MIN_BALANCE_SOL",
  "PUMPPORTAL_DATA_WALLET_PUBLIC_KEY",
  "PUMPPORTAL_DATA_WALLET_TARGET_BALANCE_SOL",
  "PUMPPORTAL_DATA_WALLET_WARN_BALANCE_SOL",
  "PUMPPORTAL_WS_URL",
  "SOLANA_RPC_COMMITMENT",
  "SOLANA_RPC_HTTP",
  "STORAGE_DATABASE_PATH",
  "TRADE_DATA_COVERAGE_CHAIN_VERIFY",
  "TRADE_DATA_COVERAGE_CHAIN_VERIFY_MAX_SIGNATURES",
  "TRADE_DATA_COVERAGE_LIVE_ACK",
  "TRADE_DATA_COVERAGE_MAX_COST_SOL",
  "TRADE_DATA_COVERAGE_MAX_EVENTS",
  "TRADE_DATA_COVERAGE_MAX_MINTS",
  "TRADE_DATA_COVERAGE_MAX_RUNTIME_MS",
  "TRADE_DATA_COVERAGE_POST_STOP_GRACE_MS"
]);

export function loadTradeDataCoverageEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  envLocalPath = defaultEnvLocalPath
): NodeJS.ProcessEnv {
  const local = existsSync(envLocalPath)
    ? parseAllowlistedEnvironment(readFileSync(envLocalPath, "utf8"))
    : {};
  const allowlistedEnvironment = Object.fromEntries(
    Object.entries(environment).filter(([key]) =>
      coverageEnvironmentKeys.has(key)
    )
  );

  return {
    ...local,
    ...allowlistedEnvironment
  };
}

function parseAllowlistedEnvironment(text: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (!coverageEnvironmentKeys.has(key)) {
      continue;
    }
    const rawValue = line.slice(separator + 1).trim();
    parsed[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return parsed;
}
