import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isValidSolanaMint, PumpPortalFeedProvider } from "@axi/data-feeds";
import { createActualDataConfig } from "./actual-data-service";
import {
  createApiServer,
  loadApiConfig,
  type ApiServer,
  type PreparedRuntimeSession
} from "./app";
import { createMeteredLaunchDataConfig } from "./metered-launch-data-service";
import { parseTradeDataCoverageArgs } from "./trade-data-coverage-cli";
import { loadTradeDataCoverageEnvironment } from "./trade-data-coverage-env";
import {
  createTradeDataCoverageLiveReadiness,
  disabledTradeDataCoverageForbiddenPaths
} from "./trade-data-coverage-readiness";
import {
  finalizePreparedTradeDataCoverageRuntimeSession,
  openTradeDataCoverageStorage,
  prepareTradeDataCoverageRuntimeSession,
  sanitizeTradeDataCoverageStartupError,
  type TradeDataCoverageStartupStage,
  type TradeDataCoverageStorageOwner
} from "./trade-data-coverage-runtime-startup";

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
await runValidation();

async function runValidation(): Promise<void> {
  const startup = {
    storageInitializationStarted: true,
    storageInitializationCompleted: false,
    storageOwnershipMode: "owned" as const,
    runtimeSessionPersisted: false,
    apiConstructed: false,
    providerConstructed: false,
    providerConnected: false,
    networkConnectionStarted: false,
    coverageSessionCreated: false,
    paidStreamStarted: false,
    cleanupCompleted: false,
    failureStage: null as TradeDataCoverageStartupStage | null,
    safeErrorCode: null as string | null
  };
  let owner: TradeDataCoverageStorageOwner | null = null;
  let runtimeSession: PreparedRuntimeSession | null = null;
  let server: ApiServer | null = null;
  let coverageFinalized = false;
  let output: Record<string, unknown> | null = null;

  try {
    owner = openTradeDataCoverageStorage({
      ...(config.STORAGE_DATABASE_PATH
        ? { databasePath: config.STORAGE_DATABASE_PATH }
        : {})
    });
    startup.storageInitializationCompleted = true;

    const initialPreflight = createInitialPreflight(true);
    if (!initialPreflight.canRun) {
      output = {
        status: "PREFLIGHT_ONLY",
        ...initialPreflight,
        paperOnly: true,
        paidStreamStarted: false
      };
      process.exitCode = 2;
      return;
    }

    runtimeSession = prepareTradeDataCoverageRuntimeSession(owner);
    startup.runtimeSessionPersisted = true;
    const hardEventCap = initialPreflight.caps.maxEvents;

    let provider: PumpPortalFeedProvider;
    try {
      provider = new PumpPortalFeedProvider({
        apiKey,
        maxTokenTradeEventsPerMint: hardEventCap,
        maxTokenTradeEventsPerSession: hardEventCap,
        maxTokenTradeSubscriptions: 1,
        maxAccountTradeSubscriptions: 0,
        subscribeMigration: true,
        subscribeNewToken: true,
        ...(config.PUMPPORTAL_WS_URL ? { wsUrl: config.PUMPPORTAL_WS_URL } : {})
      });
      startup.providerConstructed = true;
    } catch (error) {
      throw sanitizeTradeDataCoverageStartupError(
        error,
        "provider_construction"
      );
    }

    try {
      server = createCoverageServer({
        hardEventCap,
        owner,
        provider,
        runtimeSession
      });
      startup.apiConstructed = true;
    } catch (error) {
      throw sanitizeTradeDataCoverageStartupError(error, "api_construction");
    }

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
      storageReady: true,
      caps: initialPreflight.caps,
      forbiddenPaths: disabledTradeDataCoverageForbiddenPaths,
      solanaRpcConfigured: walletStatus.solanaRpcConfigured,
      chainVerify: args.chainVerify,
      estimatedCostPerEventSol:
        config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000 / 10_000
    });
    if (!finalPreflight.canRun) {
      output = {
        status: "PREFLIGHT_BLOCKED",
        ...finalPreflight,
        paperOnly: true,
        paidStreamStarted: false
      };
      process.exitCode = 2;
      return;
    }

    startup.networkConnectionStarted = true;
    server.startFeed();
    const selectedMint =
      args.mint ?? (await waitForNewestMint(server, args.maxRuntimeMs));
    if (!selectedMint) {
      throw new Error(
        "No newly launched mint arrived during the free discovery selection window."
      );
    }
    startup.providerConnected = true;

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
    startup.coverageSessionCreated = true;
    server.meteredLaunchData.acknowledgeSession({
      ackCost: true,
      maxConcurrentMints: 1,
      maxEventsPerSession: hardEventCap,
      maxSessionCostSol: args.maxCostSol,
      startAfterAck: true
    });
    server.meteredLaunchData.trackMint(selectedMint, "trade_data_coverage");
    startup.paidStreamStarted = true;

    const runtimeTimer = setTimeout(() => {
      if (!server?.tradeDataCoverage.enforceRuntimeCap()) {
        server?.tradeDataCoverage.requestStop("max_runtime");
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
    coverageFinalized = true;
    output = {
      status: "BOUNDED_SESSION_FINALIZED",
      preflight: finalPreflight,
      summary
    };
  } catch (error) {
    if (server) {
      server.tradeDataCoverage.requestStop("validation_error");
      server.tradeDataCoverage.beginGrace("validation_error");
      await server.stopFeed().catch(() => undefined);
      const summary = server.tradeDataCoverage.finalize("validation_error");
      coverageFinalized = true;
      output = {
        status: "BOUNDED_SESSION_FAILED",
        error: safeError(error),
        summary,
        paperOnly: true,
        liveTradingEnabled: false
      };
    } else {
      const startupError = sanitizeTradeDataCoverageStartupError(
        error,
        startup.runtimeSessionPersisted
          ? "api_construction"
          : "storage_initialization"
      );
      startup.failureStage = startupError.stage;
      startup.safeErrorCode = startupError.code;
      output = {
        status: "BOUNDED_SESSION_STARTUP_FAILED",
        error: {
          code: startupError.code,
          message: startupError.message,
          stage: startupError.stage
        },
        networkConnectionStarted: false,
        paidStreamStarted: false,
        paperOnly: true,
        liveTradingEnabled: false
      };
    }
    process.exitCode = 1;
  } finally {
    if (server) {
      if (!coverageFinalized) {
        server.tradeDataCoverage.finalize("preflight_blocked");
      }
      try {
        await server.close();
      } catch (error) {
        const startupError = sanitizeTradeDataCoverageStartupError(
          error,
          "runtime_session_finalization"
        );
        startup.failureStage = startupError.stage;
        startup.safeErrorCode = startupError.code;
        output = {
          status: "BOUNDED_SESSION_CLEANUP_FAILED",
          error: {
            code: startupError.code,
            message: startupError.message,
            stage: startupError.stage
          },
          networkConnectionStarted: startup.networkConnectionStarted,
          paidStreamStarted: startup.paidStreamStarted,
          paperOnly: true,
          liveTradingEnabled: false
        };
        process.exitCode = 1;
      }
    } else if (owner && runtimeSession && owner.isActive()) {
      try {
        finalizePreparedTradeDataCoverageRuntimeSession(owner, runtimeSession, {
          stopReason: "startup_failed"
        });
      } catch (error) {
        const startupError = sanitizeTradeDataCoverageStartupError(
          error,
          "runtime_session_finalization"
        );
        startup.failureStage = startupError.stage;
        startup.safeErrorCode = startupError.code;
        process.exitCode = 1;
      }
    }
    try {
      owner?.close();
      startup.cleanupCompleted = owner ? !owner.isActive() : true;
    } catch (error) {
      const startupError = sanitizeTradeDataCoverageStartupError(
        error,
        "storage_close"
      );
      startup.failureStage = startupError.stage;
      startup.safeErrorCode = startupError.code;
      startup.cleanupCompleted = false;
      output = {
        status: "BOUNDED_SESSION_CLEANUP_FAILED",
        error: {
          code: startupError.code,
          message: startupError.message,
          stage: startupError.stage
        },
        networkConnectionStarted: startup.networkConnectionStarted,
        paidStreamStarted: startup.paidStreamStarted,
        paperOnly: true,
        liveTradingEnabled: false
      };
      process.exitCode = 1;
    }
    if (output) {
      printResult({ ...output, startup }, args.json);
    }
  }
}

function createInitialPreflight(storageReady: boolean) {
  return createTradeDataCoverageLiveReadiness({
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
}

function createCoverageServer(input: {
  hardEventCap: number;
  owner: TradeDataCoverageStorageOwner;
  provider: PumpPortalFeedProvider;
  runtimeSession: PreparedRuntimeSession;
}): ApiServer {
  return createApiServer({
    dataFeed: "pumpportal",
    dataFeedMode: "live",
    feedProvider: input.provider,
    logLevel: false,
    mode: "paper",
    paperAutoOrder: false,
    startFeed: false,
    storage: { handle: input.owner.handle, ownership: "borrowed" },
    runtimeSession: input.runtimeSession,
    actualData: createActualDataConfig({
      acknowledgedMetered: true,
      apiKeyConfigured: true,
      autoSubscribe: false,
      autoSubscribeOnMigration: false,
      autoSubscribeOnNewToken: false,
      autoSubscribeOnQualified: false,
      enabled: true,
      manualMints: [],
      maxEventsPerMint: input.hardEventCap,
      maxEventsPerSession: input.hardEventCap,
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
      maxEventsPerMint: input.hardEventCap,
      maxEventsPerSession: input.hardEventCap,
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
