import { describe, expect, it } from "vitest";
import { uiField } from "../contracts/ui-field";
import {
  formatNumberV2,
  formatSolV2,
  formatUiFieldV2
} from "./formatters";

describe("V2 formatters", () => {
  it("never rounds a tiny nonzero SOL value to zero", () => {
    expect(formatSolV2(4.2528736e-8)).toBe("4.25e-8 SOL");
    expect(formatSolV2(4.2528736e-8)).not.toBe("0 SOL");
  });

  it("distinguishes null from true zero", () => {
    expect(formatNumberV2(null)).toBe("—");
    expect(formatNumberV2(0)).toBe("0");
  });

  it("retains stale and unproven semantics", () => {
    expect(
      formatUiFieldV2(uiField(2, { availability: "stale" }), String)
    ).toBe("2 · stale");
    expect(
      formatUiFieldV2(uiField(2, { availability: "unproven" }), String)
    ).toBe("2 · unproven");
    expect(formatUiFieldV2(uiField<number>(null), String)).toBe("—");
  });
});
