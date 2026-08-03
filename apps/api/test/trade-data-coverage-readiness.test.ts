import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadApiConfig } from "../src/app";
import { loadTradeDataCoverageEnvironment } from "../src/trade-data-coverage-env";
import {
  createTradeDataCoverageLiveReadiness,
  disabledTradeDataCoverageForbiddenPaths,
  type TradeDataCoverageLiveReadinessInput
} from "../src/trade-data-coverage-readiness";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("TradeDataCoverageLiveReadinessV1", () => {
  it("becomes ready without any ordinary runtime or scheduler override", () => {
    const directory = mkdtempSync(join(tmpdir(), "axi-coverage-env-"));
    tempDirectories.push(directory);
    const path = join(directory, ".env.local");
    writeFileSync(
      path,
      [
        "PUMPPORTAL_DATA_API_KEY=test-only-secret",
        "PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=11111111111111111111111111111111",
        "PUMPPORTAL_PRIVATE_KEY=must-not-load",
        ""
      ].join("\n")
    );
    const config = loadApiConfig(
      loadTradeDataCoverageEnvironment(
        {
          TRADE_DATA_COVERAGE_LIVE_ACK: "true",
          METERED_LAUNCH_DATA_REQUIRE_UI_ACK: "false",
          ROLLING_TRACKER_RESERVED_NEWEST_SLOTS: "999"
        },
        path
      )
    );
    const readiness = createTradeDataCoverageLiveReadiness({
      ...readyInput(),
      liveAuthorizationPresent: config.TRADE_DATA_COVERAGE_LIVE_ACK,
      dataApiKeyConfigured: config.PUMPPORTAL_DATA_API_KEY !== undefined,
      dataWalletPublicKeyConfigured:
        config.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY !== undefined,
      dataWalletPublicKeyValid: true
    });

    expect(readiness.canRun).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.reasonCodes).toContain("TRADE_COVERAGE_READY");
    expect(config.METERED_LAUNCH_DATA_REQUIRE_UI_ACK).toBe(true);
    expect(JSON.stringify(readiness)).not.toContain("test-only-secret");
    expect(loadTradeDataCoverageEnvironment({}, path)).not.toHaveProperty(
      "PUMPPORTAL_PRIVATE_KEY"
    );
  });

  it("reports missing dual authorization as coverage-only blockers", () => {
    const readiness = createTradeDataCoverageLiveReadiness({
      ...readyInput(),
      liveAuthorizationPresent: false,
      cliAckPresent: false
    });

    expect(readiness).toMatchObject({ canRun: false, preflightOnly: true });
    expect(readiness.blockers).toEqual([
      "TRADE_COVERAGE_LIVE_ACK_MISSING",
      "TRADE_COVERAGE_CLI_ACK_MISSING"
    ]);
    expect(readiness.reasonCodes).toContain("TRADE_COVERAGE_PREFLIGHT_ONLY");
  });

  it("makes the repository balance-unknown policy explicit", () => {
    const readiness = createTradeDataCoverageLiveReadiness({
      ...readyInput(),
      dataWalletBalanceStatus: "unknown",
      dataWalletBalanceSol: null
    });
    expect(readiness.canRun).toBe(true);
    expect(readiness.balancePolicy).toBe("unknown_allowed");
    expect(readiness.warnings).toContain("TRADE_COVERAGE_BALANCE_UNKNOWN");
  });

  it("reduces the effective event cap to remain within estimated cost", () => {
    const baseline = readyInput();
    const readiness = createTradeDataCoverageLiveReadiness({
      ...baseline,
      caps: { ...baseline.caps, maxCostSol: 0.00001 },
      estimatedCostPerEventSol: 0.000001
    });
    expect(readiness.caps.maxEvents).toBe(10);
    expect(readiness.canRun).toBe(true);
  });

  it.each([
    [
      "API key",
      { dataApiKeyConfigured: false },
      "TRADE_COVERAGE_API_KEY_MISSING"
    ],
    [
      "public wallet",
      { dataWalletPublicKeyConfigured: false },
      "TRADE_COVERAGE_DATA_WALLET_MISSING"
    ],
    [
      "low balance",
      { dataWalletBalanceSol: 0.01, dataWalletBalanceStatus: "critical" },
      "TRADE_COVERAGE_BALANCE_LOW"
    ],
    [
      "live ACK",
      { liveAuthorizationPresent: false },
      "TRADE_COVERAGE_LIVE_ACK_MISSING"
    ],
    ["CLI ACK", { cliAckPresent: false }, "TRADE_COVERAGE_CLI_ACK_MISSING"],
    [
      "event cap",
      { caps: { ...readyInput().caps, maxEvents: 51 } },
      "TRADE_COVERAGE_EVENT_CAP_TOO_HIGH"
    ],
    [
      "runtime cap",
      { caps: { ...readyInput().caps, maxRuntimeMs: 90_001 } },
      "TRADE_COVERAGE_RUNTIME_CAP_TOO_HIGH"
    ],
    [
      "cost cap",
      { caps: { ...readyInput().caps, maxCostSol: 0.0002 } },
      "TRADE_COVERAGE_COST_CAP_TOO_HIGH"
    ],
    [
      "grace cap",
      { caps: { ...readyInput().caps, postStopGraceMs: 10_001 } },
      "TRADE_COVERAGE_GRACE_CAP_TOO_HIGH"
    ],
    [
      "account trades",
      { forbiddenPaths: forbiddenPath("accountTradesEnabled") },
      "TRADE_COVERAGE_ACCOUNT_TRADES_ENABLED"
    ],
    [
      "paper automation",
      { forbiddenPaths: forbiddenPath("paperAutomationEnabled") },
      "TRADE_COVERAGE_PAPER_AUTOMATION_ENABLED"
    ],
    [
      "Lightning",
      { forbiddenPaths: forbiddenPath("lightningEnabled") },
      "TRADE_COVERAGE_LIGHTNING_ENABLED"
    ],
    [
      "Local Transaction API",
      { forbiddenPaths: forbiddenPath("localTransactionApiEnabled") },
      "TRADE_COVERAGE_LOCAL_TRANSACTION_API_ENABLED"
    ],
    ["storage", { storageReady: false }, "TRADE_COVERAGE_STORAGE_NOT_READY"]
  ])("blocks when %s is unsafe", (_label, override, reasonCode) => {
    const readiness = createTradeDataCoverageLiveReadiness({
      ...readyInput(),
      ...override
    } as TradeDataCoverageLiveReadinessInput);
    expect(readiness.canRun).toBe(false);
    expect(readiness.blockers).toContain(reasonCode);
  });
});

function readyInput(): TradeDataCoverageLiveReadinessInput {
  return {
    liveAuthorizationPresent: true,
    cliAckPresent: true,
    dataApiKeyConfigured: true,
    dataWalletPublicKeyConfigured: true,
    dataWalletPublicKeyValid: true,
    dataWalletBalanceStatus: "ok",
    dataWalletBalanceSol: 0.25,
    minimumBalanceSol: 0.02,
    storageReady: true,
    caps: {
      maxMints: 1,
      maxEvents: 50,
      maxRuntimeMs: 90_000,
      maxCostSol: 0.0001,
      postStopGraceMs: 5_000
    },
    forbiddenPaths: { ...disabledTradeDataCoverageForbiddenPaths },
    estimatedCostPerEventSol: 0.000001,
    chainVerify: false,
    solanaRpcConfigured: false,
    updatedAt: "2026-08-03T00:00:00.000Z"
  };
}

function forbiddenPath(
  key: keyof typeof disabledTradeDataCoverageForbiddenPaths
) {
  return {
    ...disabledTradeDataCoverageForbiddenPaths,
    [key]: true
  };
}
