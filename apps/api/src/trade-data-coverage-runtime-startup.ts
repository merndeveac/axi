import { createHash, randomUUID } from "node:crypto";
import {
  assertStorageHandleActive,
  closeStorage,
  initStorage,
  isStorageHandleActive,
  isTradeDataCoverageStorageReady,
  saveRuntimeSession,
  type StorageHandle
} from "@axi/storage";
import type { PreparedRuntimeSession } from "./app";

export const tradeDataCoverageStorageLockedCode =
  "TRADE_DATA_COVERAGE_STORAGE_LOCKED";

export type TradeDataCoverageStartupStage =
  | "storage_initialization"
  | "readiness_query"
  | "runtime_session_persistence"
  | "api_construction"
  | "coverage_service_construction"
  | "provider_construction"
  | "provider_start"
  | "runtime_session_finalization"
  | "storage_close";

export class TradeDataCoverageStartupError extends Error {
  readonly code: string;
  readonly stage: TradeDataCoverageStartupStage;

  constructor(
    code: string,
    stage: TradeDataCoverageStartupStage,
    message: string
  ) {
    super(message);
    this.name = "TradeDataCoverageStartupError";
    this.code = code;
    this.stage = stage;
  }
}

export type TradeDataCoverageStorageOwner = {
  readonly handle: StorageHandle;
  readonly ownership: "owned";
  readonly storageReady: true;
  close: () => boolean;
  isActive: () => boolean;
};

export type PrepareRuntimeSessionOptions = {
  beforePersist?: () => void;
  createId?: () => string;
  now?: () => Date;
  runtimeMode?: "live" | "mock" | "none" | "replay";
};

export function openTradeDataCoverageStorage(options: {
  busyTimeoutMs?: number;
  databasePath?: string;
}): TradeDataCoverageStorageOwner {
  let handle: StorageHandle;
  try {
    handle = initStorage({
      ...(options.busyTimeoutMs !== undefined
        ? { busyTimeoutMs: options.busyTimeoutMs }
        : {}),
      ...(options.databasePath !== undefined
        ? { databasePath: options.databasePath }
        : {})
    });
  } catch (error) {
    throw sanitizeTradeDataCoverageStartupError(
      error,
      "storage_initialization"
    );
  }

  try {
    if (!isTradeDataCoverageStorageReady()) {
      throw new TradeDataCoverageStartupError(
        "TRADE_DATA_COVERAGE_STORAGE_NOT_READY",
        "readiness_query",
        "Trade-data coverage storage is not ready."
      );
    }
  } catch (error) {
    closeStorage(handle);
    throw sanitizeTradeDataCoverageStartupError(error, "readiness_query");
  }

  let closed = false;
  return {
    handle,
    ownership: "owned",
    storageReady: true,
    close: () => {
      if (closed) {
        return false;
      }
      try {
        const closedNow = closeStorage(handle);
        closed = closedNow || !isStorageHandleActive(handle);
        return closedNow;
      } catch (error) {
        throw sanitizeTradeDataCoverageStartupError(error, "storage_close");
      }
    },
    isActive: () => !closed && isStorageHandleActive(handle)
  };
}

export function prepareTradeDataCoverageRuntimeSession(
  owner: TradeDataCoverageStorageOwner,
  options: PrepareRuntimeSessionOptions = {}
): PreparedRuntimeSession {
  const runtimeMode = options.runtimeMode ?? "live";
  const startedAt = (options.now ?? (() => new Date()))().toISOString();
  const sessionId = `trade-coverage-runtime-${
    options.createId?.() ?? randomUUID()
  }`;
  const configFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        dataOnly: true,
        paperOnly: true,
        purpose: "trade_data_coverage_validation",
        runtimeMode,
        tradingDisabled: true
      })
    )
    .digest("hex");

  try {
    assertStorageHandleActive(owner.handle);
    options.beforePersist?.();
    saveRuntimeSession({
      sessionId,
      runtimeMode,
      paidDataArmed: false,
      startedAt,
      stoppedAt: null,
      stopReason: null,
      configFingerprint,
      createdAt: startedAt
    });
  } catch (error) {
    throw sanitizeTradeDataCoverageStartupError(
      error,
      "runtime_session_persistence"
    );
  }

  return {
    configFingerprint,
    persisted: true,
    runtimeMode,
    sessionId,
    startedAt
  };
}

export function finalizePreparedTradeDataCoverageRuntimeSession(
  owner: TradeDataCoverageStorageOwner,
  runtimeSession: PreparedRuntimeSession,
  options: { now?: () => Date; stopReason: string }
): void {
  try {
    assertStorageHandleActive(owner.handle);
    saveRuntimeSession({
      sessionId: runtimeSession.sessionId,
      runtimeMode: runtimeSession.runtimeMode,
      paidDataArmed: false,
      startedAt: runtimeSession.startedAt,
      stoppedAt: (options.now ?? (() => new Date()))().toISOString(),
      stopReason: options.stopReason,
      configFingerprint: runtimeSession.configFingerprint,
      createdAt: runtimeSession.startedAt
    });
  } catch (error) {
    throw sanitizeTradeDataCoverageStartupError(
      error,
      "runtime_session_finalization"
    );
  }
}

export function sanitizeTradeDataCoverageStartupError(
  error: unknown,
  stage: TradeDataCoverageStartupStage
): TradeDataCoverageStartupError {
  if (error instanceof TradeDataCoverageStartupError) {
    return error;
  }
  if (isStorageLockError(error)) {
    return new TradeDataCoverageStartupError(
      tradeDataCoverageStorageLockedCode,
      stage,
      "Trade-data coverage storage remained locked beyond the bounded startup timeout."
    );
  }
  return new TradeDataCoverageStartupError(
    `TRADE_DATA_COVERAGE_${stage.toUpperCase()}_FAILED`,
    stage,
    `Trade-data coverage startup failed during ${stage}.`
  );
}

function isStorageLockError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /database is locked|database is busy|SQLITE_BUSY/i.test(error.message)
  );
}
