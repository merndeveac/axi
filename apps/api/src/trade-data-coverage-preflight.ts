import { isValidSolanaMint } from "@axi/data-feeds";
import {
  closeStorage,
  initStorage,
  isTradeDataCoverageStorageReady
} from "@axi/storage";
import { loadApiConfig } from "./app";
import { parseTradeDataCoverageArgs } from "./trade-data-coverage-cli";
import { loadTradeDataCoverageEnvironment } from "./trade-data-coverage-env";
import {
  createTradeDataCoverageLiveReadiness,
  disabledTradeDataCoverageForbiddenPaths
} from "./trade-data-coverage-readiness";

const config = loadApiConfig(loadTradeDataCoverageEnvironment());
const args = parseTradeDataCoverageArgs(process.argv.slice(2), {
  maxEvents: config.TRADE_DATA_COVERAGE_MAX_EVENTS,
  maxRuntimeMs: config.TRADE_DATA_COVERAGE_MAX_RUNTIME_MS,
  maxCostSol: config.TRADE_DATA_COVERAGE_MAX_COST_SOL,
  postStopGraceMs: config.TRADE_DATA_COVERAGE_POST_STOP_GRACE_MS,
  chainVerify: config.TRADE_DATA_COVERAGE_CHAIN_VERIFY
});

let storageReady = false;
try {
  initStorage({
    ...(config.STORAGE_DATABASE_PATH
      ? { databasePath: config.STORAGE_DATABASE_PATH }
      : {})
  });
  storageReady = isTradeDataCoverageStorageReady();

  const publicKey = config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY;
  const readiness = createTradeDataCoverageLiveReadiness({
    liveAuthorizationPresent: config.TRADE_DATA_COVERAGE_LIVE_ACK,
    cliAckPresent: args.ackMetered,
    dataApiKeyConfigured: config.PUMPPORTAL_DATA_API_KEY !== undefined,
    dataWalletPublicKeyConfigured: publicKey !== undefined,
    dataWalletPublicKeyValid: publicKey ? isValidSolanaMint(publicKey) : false,
    dataWalletBalanceStatus: publicKey ? "unknown" : "missing_config",
    dataWalletBalanceSol: null,
    minimumBalanceSol: config.PUMPPORTAL_DATA_WALLET_MIN_BALANCE_SOL,
    storageReady,
    caps: {
      maxMints: 1,
      maxEvents: args.maxEvents,
      maxRuntimeMs: args.maxRuntimeMs,
      maxCostSol: args.maxCostSol,
      postStopGraceMs: args.postStopGraceMs
    },
    forbiddenPaths: disabledTradeDataCoverageForbiddenPaths,
    estimatedCostPerEventSol:
      config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000 / 10_000,
    chainVerify: args.chainVerify,
    solanaRpcConfigured: config.SOLANA_RPC_HTTP !== undefined
  });

  printResult(
    {
      status: "TRADE_DATA_COVERAGE_PREFLIGHT",
      ...readiness,
      selectedMintMode: args.mint ? "explicit" : "newest_free_discovery",
      networkConnectionStarted: false,
      paidStreamStarted: false
    },
    args.json
  );
} finally {
  closeStorage();
}

function printResult(value: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  const record = value as { status?: string; canRun?: boolean };
  console.log(`status=${record.status ?? "UNKNOWN"}`);
  console.log(`canRun=${record.canRun ?? false}`);
}
