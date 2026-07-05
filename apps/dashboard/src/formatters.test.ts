import { describe, expect, it } from "vitest";
import {
  formatAcceleration,
  formatAge,
  formatCompactNumber,
  formatMintShort,
  formatPct,
  formatSol,
  formatUnknown,
  formatUsd,
  formatVelocity
} from "./formatters";

describe("dashboard formatters", () => {
  it("renders unknown numeric values as dashes", () => {
    expect(formatUnknown(null)).toBe("--");
    expect(formatUsd(Number.NaN)).toBe("--");
    expect(formatSol(Number.POSITIVE_INFINITY)).toBe("--");
    expect(formatVelocity(undefined, "usd")).toBe("--");
  });

  it("formats compact numbers and money", () => {
    expect(formatCompactNumber(12_400)).toBe("12.4K");
    expect(formatUsd(1_250_000)).toBe("$1.3M");
    expect(formatUsd(0.00042)).toBe("$0.00042");
    expect(formatSol(0.00042)).toBe("0.00042 SOL");
  });

  it("formats signed percent, velocity, and acceleration units", () => {
    expect(formatPct(12.4)).toBe("+12.4%");
    expect(formatPct(-8.2)).toBe("-8.2%");
    expect(formatVelocity(25, "usd")).toBe("+$25/s");
    expect(formatVelocity(0.4, "buyers")).toBe("+0.4 buyers/s");
    expect(formatAcceleration(-2.5, "pct")).toBe("-2.5%/s²");
  });

  it("formats age and mint strings", () => {
    expect(formatAge(75)).toBe("1m 15s");
    expect(formatMintShort("PumpPortalMint111111111111111111111111111")).toBe(
      "PumpPort...111111"
    );
  });
});
