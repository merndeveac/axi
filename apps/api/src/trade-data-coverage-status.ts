import { loadApiConfig } from "./app";
import { loadTradeDataCoverageEnvironment } from "./trade-data-coverage-env";
import { readTradeDataCoverageStatus } from "./trade-data-coverage-status-service";

const config = loadApiConfig(loadTradeDataCoverageEnvironment());
console.log(
  JSON.stringify(
    readTradeDataCoverageStatus({
      ...(config.STORAGE_DATABASE_PATH
        ? { databasePath: config.STORAGE_DATABASE_PATH }
        : {})
    }),
    null,
    2
  )
);
