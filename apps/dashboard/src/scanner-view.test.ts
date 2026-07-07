import type { MomentumScannerRow } from "@axi/shared";
import { describe, expect, it } from "vitest";
import {
  getLiquidityDisplay,
  getMarketCapDisplay,
  getTokenInitials,
  sanitizeDashboardImageUri
} from "./scanner-view";

describe("scanner view helpers", () => {
  it("sanitizes token image URIs", () => {
    expect(sanitizeDashboardImageUri("https://example.test/token.png")).toBe(
      "https://example.test/token.png"
    );
    expect(sanitizeDashboardImageUri("javascript:alert(1)")).toBeNull();
    expect(sanitizeDashboardImageUri("data:image/png;base64,abc")).toBeNull();
    expect(sanitizeDashboardImageUri(null)).toBeNull();
  });

  it("generates stable fallback initials", () => {
    expect(getTokenInitials("PORTAL", "Portal Token")).toBe("PO");
    expect(getTokenInitials(null, "The Black Bull")).toBe("TH");
    expect(getTokenInitials(null, null)).toBe("?");
  });

  it("keeps unavailable market values distinct from explicit zero", () => {
    expect(getMarketCapDisplay(row({ marketCapSol: null })).primary).toBe("—");
    expect(getMarketCapDisplay(row({ marketCapSol: 0 })).primary).toBe("0 SOL");
  });

  it("uses curve liquidity only as curve liquidity", () => {
    expect(
      getLiquidityDisplay(
        row({
          curve: {
            ...emptyCurve,
            curveLiquiditySol: 12.5,
            bondingCurve: "Curve111111111111111111111111111111111"
          }
        })
      )
    ).toMatchObject({
      label: "curve",
      primary: "12.5 SOL",
      source: "curve"
    });
    expect(getLiquidityDisplay(row({ liquidityUsd: null })).primary).toBe("—");
  });
});

const emptyCurve: MomentumScannerRow["curve"] = {
  associatedBondingCurve: null,
  bondingCurve: null,
  curveLiquiditySol: null,
  curveMarketCapSol: null,
  curvePriceSol: null,
  curveReasonCodes: [],
  curveSol: null,
  curveSource: null,
  curveTokens: null,
  realSolReserves: null,
  realTokenReserves: null,
  virtualSolReserves: null,
  virtualTokenReserves: null
};

function row(overrides: Partial<MomentumScannerRow>): MomentumScannerRow {
  return {
    curve: emptyCurve,
    fdvUsd: null,
    liquidityUsd: null,
    marketCapSol: null,
    marketCapUsd: null,
    poolAddress: null,
    raydiumPool: null,
    ...overrides
  } as MomentumScannerRow;
}
