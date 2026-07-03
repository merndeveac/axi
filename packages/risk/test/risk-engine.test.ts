import { describe, expect, it } from "vitest";
import {
  createEmptyRiskSnapshot,
  createRiskEngine,
  evaluateRisk,
  getHardRejectReasons,
  isHardRejected,
  type RiskInput
} from "../src/index";

const baseInput: RiskInput = {
  mint: "RiskMint11111111111111111111111111111111",
  symbol: "RISK",
  name: "Risk Token",
  source: "mock",
  mintAuthorityActive: false,
  freezeAuthorityActive: false,
  metadataMutable: false,
  holderCount: 250,
  topHolderPct: 6,
  top10HolderPct: 28,
  devHolderPct: 2,
  insiderHolderPct: 4,
  creator: "mock-creator",
  devSoldPct: 0,
  devNetFlowUsd: 500,
  priorLaunchCount: 2,
  priorRugCount: 0,
  buySellRatio: 2.2,
  netBuyPressure: 0.4,
  uniqueBuyers: 40,
  uniqueSellers: 16,
  volumeVelocity: 120,
  volumeAcceleration: 20,
  buyerVelocity: 0.8,
  buyerAcceleration: 0.14,
  priceVelocity: 1.2,
  priceAcceleration: 0.1,
  largestTradeShare: 0.18,
  sampleCount: 12,
  insufficientMetrics: false,
  liquidityUsd: 18_000,
  marketCapUsd: 80_000,
  fdvUsd: 80_000,
  estimatedSellSlippagePct: 4,
  sniperPct: 4,
  bundlerPct: 3,
  washTradingSuspected: false,
  honeypotSuspected: false
};

describe("@axi/risk", () => {
  it("creates an empty risk snapshot", () => {
    const snapshot = createEmptyRiskSnapshot(baseInput.mint);

    expect(snapshot.riskLevel).toBe("unknown");
    expect(snapshot.hardReject).toBe(false);
    expect(snapshot.reasonCodes).toContain("UNKNOWN_AUTHORITY_STATUS");
  });

  it("hard rejects active mint authority", () => {
    const snapshot = evaluateRisk({
      ...baseInput,
      mintAuthorityActive: true
    });

    expect(snapshot.hardReject).toBe(true);
    expect(snapshot.riskLevel).toBe("critical");
    expect(snapshot.reasonCodes).toContain("MINT_AUTHORITY_ACTIVE");
  });

  it("hard rejects high top holder concentration", () => {
    const snapshot = evaluateRisk({
      ...baseInput,
      topHolderPct: 25
    });

    expect(snapshot.hardReject).toBe(true);
    expect(snapshot.reasonCodes).toContain("TOP_HOLDER_TOO_HIGH");
  });

  it("hard rejects high top10 concentration", () => {
    const snapshot = evaluateRisk({
      ...baseInput,
      top10HolderPct: 55
    });

    expect(snapshot.hardReject).toBe(true);
    expect(snapshot.reasonCodes).toContain("TOP10_HOLDER_TOO_HIGH");
  });

  it("hard rejects high dev holder concentration", () => {
    const snapshot = evaluateRisk({
      ...baseInput,
      devHolderPct: 16
    });

    expect(snapshot.hardReject).toBe(true);
    expect(snapshot.reasonCodes).toContain("DEV_HOLDER_TOO_HIGH");
  });

  it("hard rejects low liquidity when known", () => {
    const snapshot = evaluateRisk({
      ...baseInput,
      liquidityUsd: 600
    });

    expect(snapshot.hardReject).toBe(true);
    expect(snapshot.reasonCodes).toContain("LIQUIDITY_TOO_LOW");
  });

  it("hard rejects high sell slippage when known", () => {
    const snapshot = evaluateRisk({
      ...baseInput,
      estimatedSellSlippagePct: 22
    });

    expect(snapshot.hardReject).toBe(true);
    expect(snapshot.reasonCodes).toContain("SELL_SLIPPAGE_TOO_HIGH");
  });

  it("missing data warns without hard rejecting by default", () => {
    const snapshot = evaluateRisk({
      ...baseInput,
      mintAuthorityActive: null,
      freezeAuthorityActive: null,
      metadataMutable: null,
      holderCount: null,
      topHolderPct: null,
      top10HolderPct: null,
      liquidityUsd: null,
      estimatedSellSlippagePct: null
    });

    expect(snapshot.hardReject).toBe(false);
    expect(snapshot.reasonCodes).toContain("UNKNOWN_AUTHORITY_STATUS");
    expect(snapshot.reasonCodes).toContain("UNKNOWN_HOLDER_DATA");
    expect(snapshot.reasonCodes).toContain("UNKNOWN_LIQUIDITY_DATA");
  });

  it("rug-style input produces high or critical risk", () => {
    const snapshot = evaluateRisk({
      ...baseInput,
      mintAuthorityActive: true,
      honeypotSuspected: true,
      topHolderPct: 44,
      top10HolderPct: 82,
      devSoldPct: 80,
      washTradingSuspected: true
    });

    expect(snapshot.hardReject).toBe(true);
    expect(snapshot.riskLevel).toBe("critical");
    expect(getHardRejectReasons(snapshot).length).toBeGreaterThan(2);
  });

  it("safe-style input produces low or medium risk", () => {
    const engine = createRiskEngine({
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });
    const snapshot = engine.evaluateRisk(baseInput);

    expect(isHardRejected(snapshot)).toBe(false);
    expect(["low", "medium"]).toContain(snapshot.riskLevel);
    expect(snapshot.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
