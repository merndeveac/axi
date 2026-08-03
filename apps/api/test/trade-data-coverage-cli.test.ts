import { describe, expect, it } from "vitest";
import {
  evaluateTradeDataCoveragePreflight,
  parseTradeDataCoverageArgs
} from "../src/trade-data-coverage-cli";

describe("trade-data coverage CLI", () => {
  it("uses hard bounded defaults without starting anything", () => {
    expect(parseTradeDataCoverageArgs([])).toMatchObject({
      ackMetered: false,
      maxEvents: 50,
      maxRuntimeMs: 90_000,
      maxCostSol: 0.0001,
      postStopGraceMs: 5_000,
      select: "newest"
    });
  });

  it("rejects caps above the safety ceiling", () => {
    expect(() => parseTradeDataCoverageArgs(["--max-events", "51"])).toThrow(
      "1 through 50"
    );
    expect(() =>
      parseTradeDataCoverageArgs(["--max-cost-sol", "0.001"])
    ).toThrow("at most 0.0001");
  });

  it("reports every missing live-session requirement", () => {
    const preflight = evaluateTradeDataCoveragePreflight({
      args: parseTradeDataCoverageArgs([]),
      liveAck: false,
      apiKeyConfigured: false,
      dataWalletPublicKey: undefined,
      balanceSol: null,
      minimumBalanceSol: 0.02,
      solanaRpcConfigured: false
    });
    expect(preflight.readyForLiveSession).toBe(false);
    expect(preflight.missingRequirements).toEqual(
      expect.arrayContaining([
        "--ack-metered",
        "TRADE_DATA_COVERAGE_LIVE_ACK=true",
        "PUMPPORTAL_DATA_API_KEY",
        "PUMPPORTAL_DATA_WALLET_PUBLIC_KEY"
      ])
    );
    expect(preflight.safety.accountTradesActive).toBe(false);
    expect(preflight.safety.liveTradingEnabled).toBe(false);
  });

  it("makes the repository balance-unknown policy explicit", () => {
    const args = parseTradeDataCoverageArgs(["--ack-metered"]);
    const preflight = evaluateTradeDataCoveragePreflight({
      args,
      liveAck: true,
      apiKeyConfigured: true,
      dataWalletPublicKey: "11111111111111111111111111111111",
      balanceSol: null,
      minimumBalanceSol: 0.02,
      solanaRpcConfigured: false
    });
    expect(preflight.readyForLiveSession).toBe(true);
    expect(preflight.balancePolicy).toBe("unknown_allowed");
    expect(preflight.reasonCodes).toContain(
      "BALANCE_UNKNOWN_ALLOWED_BY_REPOSITORY_POLICY"
    );
  });

  it("reduces the event cap so estimated cost cannot cross the SOL cap", () => {
    const preflight = evaluateTradeDataCoveragePreflight({
      args: parseTradeDataCoverageArgs([
        "--ack-metered",
        "--max-events",
        "50",
        "--max-cost-sol",
        "0.00001"
      ]),
      liveAck: true,
      apiKeyConfigured: true,
      dataWalletPublicKey: "11111111111111111111111111111111",
      balanceSol: null,
      minimumBalanceSol: 0.02,
      solanaRpcConfigured: false,
      estimatedCostPerEventSol: 0.000001
    });
    expect(preflight.caps.maxEvents).toBe(10);
    expect(preflight.readyForLiveSession).toBe(true);
  });
});
