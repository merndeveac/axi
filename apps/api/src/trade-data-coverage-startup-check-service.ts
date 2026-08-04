import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FeedEventHandler, TokenFeedProvider } from "@axi/data-feeds";
import {
  closeStorage,
  initStorageReadOnly,
  listRuntimeSessions,
  listTradeDataCoverageSessions
} from "@axi/storage";
import {
  createApiServer,
  type ApiServer,
  type PreparedRuntimeSession
} from "./app";
import {
  finalizePreparedTradeDataCoverageRuntimeSession,
  openTradeDataCoverageStorage,
  prepareTradeDataCoverageRuntimeSession,
  sanitizeTradeDataCoverageStartupError,
  type TradeDataCoverageStartupError,
  type TradeDataCoverageStartupStage,
  type TradeDataCoverageStorageOwner
} from "./trade-data-coverage-runtime-startup";

export type StartupCheckFailureInjector = (
  stage: TradeDataCoverageStartupStage
) => void;

export type TradeDataCoverageStartupCheckOptions = {
  busyTimeoutMs?: number;
  createId?: () => string;
  createProvider?: () => TokenFeedProvider;
  databasePath?: string;
  exerciseFakeProviderStart?: boolean;
  failureInjector?: StartupCheckFailureInjector;
  now?: () => Date;
  removeDatabaseAfterCheck?: boolean;
  simulateLock?: boolean;
};

export type TradeDataCoverageStartupCheckResult = {
  success: boolean;
  storageReady: boolean;
  storageOwnershipMode: "owned";
  runtimeSessionPersisted: boolean;
  runtimeSessionFinalized: boolean;
  runtimeSessionCount: number;
  activeRuntimeSessionCount: number;
  activeCoverageSessionCount: number;
  providerConstructCount: number;
  providerConnectCount: number;
  networkConnectionStarted: false;
  paidStreamStarted: false;
  cleanupCompleted: boolean;
  failureStage: TradeDataCoverageStartupStage | null;
  safeErrorCode: string | null;
  safeErrorMessage: string | null;
};

export async function runTradeDataCoverageStartupCheck(
  options: TradeDataCoverageStartupCheckOptions = {}
): Promise<TradeDataCoverageStartupCheckResult> {
  const temporaryDirectory = options.databasePath
    ? null
    : mkdtempSync(join(tmpdir(), "axi-trade-coverage-startup-"));
  const databasePath =
    options.databasePath ?? join(temporaryDirectory!, "axi.sqlite");
  const removeDatabaseAfterCheck =
    options.removeDatabaseAfterCheck ?? temporaryDirectory !== null;
  const timeoutMs = options.busyTimeoutMs ?? 250;
  let owner: TradeDataCoverageStorageOwner | null = null;
  let runtimeSession: PreparedRuntimeSession | null = null;
  let server: ApiServer | null = null;
  let serverCloseAttempted = false;
  const lockState: { blocker: DatabaseSync | null } = { blocker: null };
  let providerConstructCount = 0;
  let providerConnectCount = 0;
  let storageReady = false;
  let runtimeSessionPersisted = false;
  let cleanupCompleted = false;
  let failure: TradeDataCoverageStartupError | null = null;

  const inject = (stage: TradeDataCoverageStartupStage): void => {
    try {
      options.failureInjector?.(stage);
    } catch (error) {
      throw sanitizeTradeDataCoverageStartupError(error, stage);
    }
  };

  try {
    inject("storage_initialization");
    owner = openTradeDataCoverageStorage({
      busyTimeoutMs: timeoutMs,
      databasePath
    });
    storageReady = owner.storageReady;
    inject("readiness_query");

    runtimeSession = prepareTradeDataCoverageRuntimeSession(owner, {
      ...(options.createId ? { createId: options.createId } : {}),
      ...(options.now ? { now: options.now } : {}),
      runtimeMode: "none",
      beforePersist: () => {
        if (options.simulateLock) {
          lockState.blocker = new DatabaseSync(databasePath);
          lockState.blocker.exec("BEGIN IMMEDIATE");
        }
        inject("runtime_session_persistence");
      }
    });
    runtimeSessionPersisted = true;

    inject("provider_construction");
    let provider: TokenFeedProvider;
    try {
      provider =
        options.createProvider?.() ??
        new ZeroNetworkFeedProvider(() => {
          providerConnectCount += 1;
        });
    } catch (error) {
      throw sanitizeTradeDataCoverageStartupError(
        error,
        "provider_construction"
      );
    }
    providerConstructCount += 1;

    inject("api_construction");
    try {
      server = createApiServer({
        dataFeed: "none",
        dataFeedMode: "none",
        feedProvider: provider,
        lightning: { enabled: false },
        logLevel: false,
        mode: "paper",
        paperAutoOrder: false,
        paperPortfolio: { enabled: false },
        runtimeSession,
        startFeed: false,
        storage: { handle: owner.handle, ownership: "borrowed" },
        watchedWalletExit: {
          accountTradesAcknowledgedMetered: false,
          accountTradesEnabled: false,
          enabled: false
        }
      });
    } catch (error) {
      throw sanitizeTradeDataCoverageStartupError(error, "api_construction");
    }
    inject("coverage_service_construction");

    if (options.exerciseFakeProviderStart) {
      inject("provider_start");
      try {
        await provider.start(() => undefined);
        await provider.stop();
      } catch (error) {
        throw sanitizeTradeDataCoverageStartupError(error, "provider_start");
      }
    }

    inject("runtime_session_finalization");
    try {
      serverCloseAttempted = true;
      await server.close();
    } catch (error) {
      throw sanitizeTradeDataCoverageStartupError(
        error,
        "runtime_session_finalization"
      );
    }
    server = null;
  } catch (error) {
    failure = sanitizeTradeDataCoverageStartupError(
      error,
      inferFailureStage(error)
    );
  } finally {
    if (lockState.blocker) {
      if (lockState.blocker.isTransaction) {
        lockState.blocker.exec("ROLLBACK");
      }
      lockState.blocker.close();
      lockState.blocker = null;
    }

    const serverToClose = server as ApiServer | null;
    if (serverToClose && !serverCloseAttempted) {
      serverCloseAttempted = true;
      await serverToClose.close().catch(() => undefined);
      server = null;
    } else if (
      serverToClose === null &&
      failure &&
      owner &&
      runtimeSession &&
      owner.isActive()
    ) {
      try {
        finalizePreparedTradeDataCoverageRuntimeSession(owner, runtimeSession, {
          ...(options.now ? { now: options.now } : {}),
          stopReason: "startup_check_failed"
        });
      } catch (error) {
        failure = sanitizeTradeDataCoverageStartupError(
          error,
          "runtime_session_finalization"
        );
      }
    }

    try {
      inject("storage_close");
    } catch (error) {
      failure = sanitizeTradeDataCoverageStartupError(error, "storage_close");
    } finally {
      try {
        owner?.close();
        cleanupCompleted = owner ? !owner.isActive() : true;
      } catch (error) {
        failure = sanitizeTradeDataCoverageStartupError(error, "storage_close");
        cleanupCompleted = false;
      }
    }
  }

  const persisted = readPersistedStartupState(databasePath);
  const result: TradeDataCoverageStartupCheckResult = {
    success:
      failure === null &&
      storageReady &&
      runtimeSessionPersisted &&
      runtimeSession !== null &&
      persisted.finalizedRuntimeSessionIds.includes(runtimeSession.sessionId) &&
      persisted.activeRuntimeSessionCount === 0 &&
      persisted.activeCoverageSessionCount === 0 &&
      providerConnectCount === 0 &&
      cleanupCompleted,
    storageReady,
    storageOwnershipMode: "owned",
    runtimeSessionPersisted,
    runtimeSessionFinalized:
      runtimeSession !== null &&
      persisted.finalizedRuntimeSessionIds.includes(runtimeSession.sessionId),
    runtimeSessionCount: persisted.runtimeSessionCount,
    activeRuntimeSessionCount: persisted.activeRuntimeSessionCount,
    activeCoverageSessionCount: persisted.activeCoverageSessionCount,
    providerConstructCount,
    providerConnectCount,
    networkConnectionStarted: false,
    paidStreamStarted: false,
    cleanupCompleted,
    failureStage: failure?.stage ?? null,
    safeErrorCode: failure?.code ?? null,
    safeErrorMessage: failure?.message ?? null
  };

  if (removeDatabaseAfterCheck && temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  return result;
}

class ZeroNetworkFeedProvider implements TokenFeedProvider {
  readonly name = "startup-check";

  constructor(private readonly onStart: () => void) {}

  start(handler: FeedEventHandler): void {
    void handler;
    this.onStart();
  }

  stop(): void {}
}

function inferFailureStage(error: unknown): TradeDataCoverageStartupStage {
  if (
    error &&
    typeof error === "object" &&
    "stage" in error &&
    typeof error.stage === "string"
  ) {
    return error.stage as TradeDataCoverageStartupStage;
  }
  return "api_construction";
}

function readPersistedStartupState(databasePath: string): {
  activeCoverageSessionCount: number;
  activeRuntimeSessionCount: number;
  finalizedRuntimeSessionIds: string[];
  runtimeSessionCount: number;
} {
  try {
    initStorageReadOnly({ databasePath });
    const runtimeSessions = listRuntimeSessions(1_000);
    const coverageSessions = listTradeDataCoverageSessions(1_000);
    return {
      activeCoverageSessionCount: coverageSessions.filter(
        (session) => session.stoppedAt === null
      ).length,
      activeRuntimeSessionCount: runtimeSessions.filter(
        (session) => session.stoppedAt === null
      ).length,
      finalizedRuntimeSessionIds: runtimeSessions
        .filter((session) => session.stoppedAt !== null)
        .map((session) => session.sessionId),
      runtimeSessionCount: runtimeSessions.length
    };
  } catch {
    return {
      activeCoverageSessionCount: 0,
      activeRuntimeSessionCount: 0,
      finalizedRuntimeSessionIds: [],
      runtimeSessionCount: 0
    };
  } finally {
    closeStorage();
  }
}
