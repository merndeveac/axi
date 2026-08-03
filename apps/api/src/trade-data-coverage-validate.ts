import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isValidSolanaMint, PumpPortalFeedProvider } from "@axi/data-feeds";
import {
  closeStorage,
  initStorage,
  isTradeDataCoverageStorageReady
} from "@axi/storage";
import { createActualDataConfig } from "./actual-data-service";
import { createApiServer, loadApiConfig } from "./app";
import { createMeteredLaunchDataConfig } from "./metered-launch-data-service";
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
const apiKey = config.PUMPPORTAL_DATA_API_KEY;
const publicKey = config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY;
let storageReady = false;
try {
  initStorage({
    ...(config.STORAGE_DATABASE_PATH
      ? { databasePath: config.STORAGE_DATABASE_PATH }
      : {})
  });
  storageReady = isTradeDataCoverageStorageReady();
} catch {
  storageReady = false;
}

const initialPreflight = createTradeDataCoverageLiveReadiness({
  liveAuthorizationPresent: config.TRADE_DATA_COVERAGE_LIVE_ACK,
  cliAckPresent: args.ackMetered,
  dataApiKeyConfigured: apiKey !== undefined,
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
  solanaRpcConfigured: config.SOLANA_RPC_HTTP !== undefined,
  chainVerify: args.chainVerify,
  estimatedCostPerEventSol:
    config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000 / 10_000
});

if (!initialPreflight.canRun) {
  printResult(
    {
      status: "PREFLIGHT_ONLY",
      ...initialPreflight,
      paperOnly: true,
      paidStreamStarted: false
    },
    args.json
  );
  closeStorage();
  process.exitCode = 2;
} else {
  const hardEventCap = initialPreflight.caps.maxEvents;
  const provider = new PumpPortalFeedProvider({
    apiKey,
    maxTokenTradeEventsPerMint: hardEventCap,
    maxTokenTradeEventsPerSession: hardEventCap,
    maxTokenTradeSubscriptions: 1,
    maxAccountTradeSubscriptions: 0,
    subscribeMigration: true,
    subscribeNewToken: true,
    ...(config.PUMPPORTAL_WS_URL ? { wsUrl: config.PUMPPORTAL_WS_URL } : {})
  });
  const server = createApiServer({
    dataFeed: "pumpportal",
    dataFeedMode: "live",
    feedProvider: provider,
    logLevel: false,
    mode: "paper",
    paperAutoOrder: false,
    startFeed: false,
    ...(config.STORAGE_DATABASE_PATH
      ? { storageDatabasePath: config.STORAGE_DATABASE_PATH }
      : {}),
    actualData: createActualDataConfig({
      acknowledgedMetered: true,
      apiKeyConfigured: true,
      autoSubscribe: false,
      autoSubscribeOnMigration: false,
      autoSubscribeOnNewToken: false,
      autoSubscribeOnQualified: false,
      enabled: true,
      manualMints: [],
      maxEventsPerMint: hardEventCap,
      maxEventsPerSession: hardEventCap,
      maxSubscribedTokens: 1,
      requireApiKey: true,
      unsubscribeAfterMs: args.maxRuntimeMs + args.postStopGraceMs
    }),
    meteredLaunchData: createMeteredLaunchDataConfig({
      acknowledgedCost: true,
      apiKeyConfigured: true,
      controlsEnabled: true,
      dataWalletPublicKeyConfigured: true,
      enabled: true,
      eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
      initialTrackMs: args.maxRuntimeMs,
      extendedTrackMs: args.maxRuntimeMs,
      maxConcurrentMints: 1,
      maxEventsPerMint: hardEventCap,
      maxEventsPerSession: hardEventCap,
      maxSessionCostSol: args.maxCostSol,
      maxUiSessionCostSol: args.maxCostSol,
      mode: "manual",
      requireDataWalletReady: true,
      requireUiAck: true,
      rollingTrackerEnabled: false,
      startActive: false
    }),
    pumpPortalDataWallet: {
      apiKeyConfigured: true,
      balanceRefreshMs: config.PUMPPORTAL_DATA_WALLET_BALANCE_REFRESH_MS,
      commitment: config.SOLANA_RPC_COMMITMENT,
      criticalBalanceSol: config.PUMPPORTAL_DATA_WALLET_CRITICAL_BALANCE_SOL,
      eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
      minBalanceSol: config.PUMPPORTAL_DATA_WALLET_MIN_BALANCE_SOL,
      publicKey: config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY,
      requestTimeoutMs: config.CHAIN_VERIFIER_REQUEST_TIMEOUT_MS,
      rpcHttpUrl: config.SOLANA_RPC_HTTP,
      targetBalanceSol: config.PUMPPORTAL_DATA_WALLET_TARGET_BALANCE_SOL,
      warnBalanceSol: config.PUMPPORTAL_DATA_WALLET_WARN_BALANCE_SOL
    },
    paperPortfolio: { enabled: false },
    watchedWalletExit: {
      accountTradesAcknowledgedMetered: false,
      accountTradesEnabled: false,
      enabled: false
    },
    lightning: { enabled: false }
  });

  let finalized = false;
  try {
    const walletStatus = await server.pumpPortalDataWallet.refreshBalance({
      force: true
    });
    const finalPreflight = createTradeDataCoverageLiveReadiness({
      liveAuthorizationPresent: config.TRADE_DATA_COVERAGE_LIVE_ACK,
      cliAckPresent: args.ackMetered,
      dataApiKeyConfigured: walletStatus.apiKeyConfigured,
      dataWalletPublicKeyConfigured: walletStatus.publicKeyConfigured,
      dataWalletPublicKeyValid: walletStatus.publicKeyValid,
      dataWalletBalanceStatus: walletStatus.balanceStatus,
      dataWalletBalanceSol: walletStatus.balanceSol,
      minimumBalanceSol: walletStatus.minBalanceSol,
      storageReady,
      caps: {
        maxMints: 1,
        maxEvents: args.maxEvents,
        maxRuntimeMs: args.maxRuntimeMs,
        maxCostSol: args.maxCostSol,
        postStopGraceMs: args.postStopGraceMs
      },
      forbiddenPaths: disabledTradeDataCoverageForbiddenPaths,
      solanaRpcConfigured: walletStatus.solanaRpcConfigured,
      chainVerify: args.chainVerify,
      estimatedCostPerEventSol:
        config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000 / 10_000
    });
    if (!finalPreflight.canRun) {
      printResult(
        {
          status: "PREFLIGHT_BLOCKED",
          ...finalPreflight,
          paperOnly: true,
          paidStreamStarted: false
        },
        args.json
      );
      process.exitCode = 2;
    } else {
      server.startFeed();
      const selectedMint =
        args.mint ?? (await waitForNewestMint(server, args.maxRuntimeMs));
      if (!selectedMint) {
        throw new Error(
          "No newly launched mint arrived during the free discovery selection window."
        );
      }

      let resolveStop: (reason: string) => void = () => undefined;
      const stopped = new Promise<string>((resolve) => {
        resolveStop = resolve;
      });
      server.indexerAdapter.trackTimeseriesMint(selectedMint);
      server.tradeDataCoverage.begin({
        sessionId: `trade-coverage-${randomUUID()}`,
        selectedMint,
        maxEvents: hardEventCap,
        maxRuntimeMs: args.maxRuntimeMs,
        maxCostSol: args.maxCostSol,
        postStopGraceMs: args.postStopGraceMs,
        chainVerify: args.chainVerify,
        chainVerifyMaxSignatures:
          config.TRADE_DATA_COVERAGE_CHAIN_VERIFY_MAX_SIGNATURES,
        onStopRequested: resolveStop
      });
      server.meteredLaunchData.acknowledgeSession({
        ackCost: true,
        maxConcurrentMints: 1,
        maxEventsPerSession: hardEventCap,
        maxSessionCostSol: args.maxCostSol,
        startAfterAck: true
      });
      server.meteredLaunchData.trackMint(selectedMint, "trade_data_coverage");

      const runtimeTimer = setTimeout(() => {
        if (!server.tradeDataCoverage.enforceRuntimeCap()) {
          server.tradeDataCoverage.requestStop("max_runtime");
        }
      }, args.maxRuntimeMs);
      const stopReason = await stopped;
      clearTimeout(runtimeTimer);
      server.meteredLaunchData.untrackMint(
        selectedMint,
        `trade_data_coverage_${stopReason}`
      );
      server.tradeDataCoverage.beginGrace(stopReason);
      await delay(args.postStopGraceMs);
      await server.stopFeed();
      await server.tradeDataCoverage.verifySampledSignatures(
        args.chainVerify && config.SOLANA_RPC_HTTP
          ? createReadOnlyTransactionVerifier(config.SOLANA_RPC_HTTP)
          : null
      );
      const summary = server.tradeDataCoverage.finalize(stopReason);
      finalized = true;
      printResult(
        {
          status: "BOUNDED_SESSION_FINALIZED",
          preflight: finalPreflight,
          summary
        },
        args.json
      );
    }
  } catch (error) {
    server.tradeDataCoverage.requestStop("validation_error");
    server.tradeDataCoverage.beginGrace("validation_error");
    await server.stopFeed().catch(() => undefined);
    const summary = server.tradeDataCoverage.finalize("validation_error");
    finalized = true;
    printResult(
      {
        status: "BOUNDED_SESSION_FAILED",
        error: safeError(error),
        summary,
        paperOnly: true,
        liveTradingEnabled: false
      },
      args.json
    );
    process.exitCode = 1;
  } finally {
    if (!finalized) {
      server.tradeDataCoverage.finalize("preflight_blocked");
    }
    await server.close();
  }
}

async function waitForNewestMint(
  server: ReturnType<typeof createApiServer>,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const newest = server.liveTokens.getLiveTokens()[0];
    if (newest?.realData) {
      return newest.mint;
    }
    await delay(100);
  }
  return null;
}

function printResult(value: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  const record = value as { status?: string; summary?: unknown };
  console.log(`status=${record.status ?? "UNKNOWN"}`);
  console.log(`summary=${JSON.stringify(record.summary ?? value)}`);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

function createReadOnlyTransactionVerifier(rpcHttpUrl: string): {
  getTransaction: (signature: string) => Promise<unknown>;
} {
  let requestId = 0;
  return {
    getTransaction: async (signature) => {
      requestId += 1;
      const response = await fetch(rpcHttpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method: "getTransaction",
          params: [
            signature,
            {
              commitment: config.SOLANA_RPC_COMMITMENT,
              encoding: "jsonParsed",
              maxSupportedTransactionVersion: 0
            }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`SOLANA_RPC_HTTP_${response.status}`);
      }
      const body = (await response.json()) as {
        error?: unknown;
        result?: unknown;
      };
      if (body.error) {
        throw new Error("SOLANA_RPC_GET_TRANSACTION_FAILED");
      }
      return body.result ?? null;
    }
  };
}
