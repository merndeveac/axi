import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApiServer } from "../src/app";
import { createApiServer } from "../src/app";
import { readTradeDataCoverageStatus } from "../src/trade-data-coverage-status-service";

let directory: string;
let databasePath: string;
let server: ApiServer | undefined;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "axi-coverage-status-"));
  databasePath = join(directory, "axi.sqlite");
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(directory, { recursive: true, force: true });
});

describe("trade-data coverage status", () => {
  it("migrates a fresh database and reports a clean no-session status", () => {
    expect(readTradeDataCoverageStatus({ databasePath })).toMatchObject({
      status: "NO_TRADE_DATA_COVERAGE_SESSION",
      storageReady: true,
      activeSession: null,
      latestSession: null
    });
  });

  it("distinguishes an actual missing-table database", () => {
    new DatabaseSync(databasePath).close();
    expect(
      readTradeDataCoverageStatus({
        databasePath,
        initializeMode: "read_only"
      })
    ).toMatchObject({
      status: "TRADE_DATA_COVERAGE_STORAGE_NOT_READY",
      storageReady: false
    });
  });

  it("retrieves an existing finalized session after restart", async () => {
    server = createApiServer({
      dataFeed: "none",
      dataFeedMode: "none",
      logLevel: false,
      startFeed: false,
      storageDatabasePath: databasePath
    });
    server.tradeDataCoverage.begin({
      sessionId: "coverage-status-session",
      selectedMint: "So11111111111111111111111111111111111111112",
      maxEvents: 1
    });
    server.tradeDataCoverage.finalize("status_test_complete");
    await server.close();
    server = undefined;

    expect(readTradeDataCoverageStatus({ databasePath })).toMatchObject({
      status: "TRADE_DATA_COVERAGE_SESSION_AVAILABLE",
      storageReady: true,
      latestSession: {
        sessionId: "coverage-status-session",
        stopReason: "STATUS_TEST_COMPLETE"
      }
    });
  });
});
