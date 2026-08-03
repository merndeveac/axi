import {
  closeStorage,
  initStorageReadOnly,
  listTradeDataCoverageSessions
} from "@axi/storage";
import { loadApiConfig } from "./app";

const config = loadApiConfig();

try {
  initStorageReadOnly({
    ...(config.STORAGE_DATABASE_PATH
      ? { databasePath: config.STORAGE_DATABASE_PATH }
      : {})
  });
  const latest = listTradeDataCoverageSessions(1)[0] ?? null;
  console.log(
    JSON.stringify(
      {
        schemaVersion: "trade-data-coverage-v1",
        activeSession: null,
        latestSession: latest,
        paidStreamStarted: false,
        paperOnly: true,
        accountTradesActive: false,
        liveTradingEnabled: false
      },
      null,
      2
    )
  );
} catch (error) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: "trade-data-coverage-v1",
        activeSession: null,
        latestSession: null,
        status: "NO_COVERAGE_DATABASE_AVAILABLE",
        safeReason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        paidStreamStarted: false,
        paperOnly: true,
        accountTradesActive: false,
        liveTradingEnabled: false
      },
      null,
      2
    )
  );
} finally {
  closeStorage();
}
