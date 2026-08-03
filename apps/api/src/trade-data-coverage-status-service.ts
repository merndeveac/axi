import {
  closeStorage,
  initStorage,
  initStorageReadOnly,
  isTradeDataCoverageStorageReady,
  listTradeDataCoverageSessions
} from "@axi/storage";
import type { TradeDataCoverageSession } from "@axi/shared";

export type TradeDataCoverageStatus = {
  schemaVersion: "trade-data-coverage-v1";
  status:
    | "TRADE_DATA_COVERAGE_SESSION_AVAILABLE"
    | "NO_TRADE_DATA_COVERAGE_SESSION"
    | "TRADE_DATA_COVERAGE_STORAGE_NOT_READY";
  storageReady: boolean;
  activeSession: null;
  latestSession: TradeDataCoverageSession | null;
  paidStreamStarted: false;
  paperOnly: true;
  accountTradesActive: false;
  liveTradingEnabled: false;
  safeReason?: string;
};

export function readTradeDataCoverageStatus(
  options: {
    databasePath?: string;
    initializeMode?: "migrate" | "read_only";
  } = {}
): TradeDataCoverageStatus {
  try {
    const storageOptions = options.databasePath
      ? { databasePath: options.databasePath }
      : {};
    if (options.initializeMode === "read_only") {
      initStorageReadOnly(storageOptions);
    } else {
      initStorage(storageOptions);
    }

    if (!isTradeDataCoverageStorageReady()) {
      return notReady("Migration 26 or its coverage tables are unavailable.");
    }

    const latestSession = listTradeDataCoverageSessions(1)[0] ?? null;
    return {
      schemaVersion: "trade-data-coverage-v1",
      status: latestSession
        ? "TRADE_DATA_COVERAGE_SESSION_AVAILABLE"
        : "NO_TRADE_DATA_COVERAGE_SESSION",
      storageReady: true,
      activeSession: null,
      latestSession,
      paidStreamStarted: false,
      paperOnly: true,
      accountTradesActive: false,
      liveTradingEnabled: false
    };
  } catch (error) {
    return notReady(safeStorageReason(error));
  } finally {
    closeStorage();
  }
}

function notReady(safeReason: string): TradeDataCoverageStatus {
  return {
    schemaVersion: "trade-data-coverage-v1",
    status: "TRADE_DATA_COVERAGE_STORAGE_NOT_READY",
    storageReady: false,
    activeSession: null,
    latestSession: null,
    paidStreamStarted: false,
    paperOnly: true,
    accountTradesActive: false,
    liveTradingEnabled: false,
    safeReason
  };
}

function safeStorageReason(error: unknown): string {
  if (!(error instanceof Error)) {
    return "UNKNOWN_STORAGE_ERROR";
  }
  if (error.message.includes("no such table")) {
    return "TRADE_DATA_COVERAGE_TABLE_MISSING";
  }
  if (error.message.includes("does not exist")) {
    return "TRADE_DATA_COVERAGE_DATABASE_MISSING";
  }
  return "TRADE_DATA_COVERAGE_STORAGE_UNAVAILABLE";
}
