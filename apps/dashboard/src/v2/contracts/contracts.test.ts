import { describe, expect, it } from "vitest";
import {
  ScannerSnapshotV2Schema,
  UiFieldSchema
} from "@axi/shared";
import { availabilityLabel, isFieldRenderable, uiField } from "./ui-field";
import {
  goldenRuntimeFixtures,
  goldenScannerRows,
  goldenScannerSnapshot,
  staleToken,
  walletUnknownRuntime
} from "../fixtures/golden-path";

describe("V2 UI contracts", () => {
  it("parses the deterministic golden snapshot", () => {
    expect(ScannerSnapshotV2Schema.parse(goldenScannerSnapshot).rows).toHaveLength(
      12
    );
    for (const row of goldenScannerRows) {
      expect(row.mint).not.toBe("");
      expect(row.decision.referencePolicy).toBe(true);
    }
  });

  it("keeps availability states semantically distinct", () => {
    const zero = uiField(0, { source: "runtime" });
    const unavailable = uiField<number>(null, { source: "runtime" });
    const stale = uiField(5, {
      availability: "stale",
      source: "runtime"
    });
    const unproven = uiField(5, {
      availability: "unproven",
      source: "runtime"
    });

    expect(UiFieldSchema.parse(zero).value).toBe(0);
    expect(isFieldRenderable(unavailable)).toBe(false);
    expect(isFieldRenderable(stale)).toBe(true);
    expect(isFieldRenderable(unproven)).toBe(true);
    expect([stale, unproven].map((field) => availabilityLabel(field.availability)))
      .toEqual(["Stale", "Unproven"]);
  });

  it("freezes stale state and source provenance", () => {
    expect(staleToken.market.priceSol.availability).toBe("stale");
    expect(staleToken.market.priceSol.source).toBe("curve");
    expect(walletUnknownRuntime.walletBalanceSol.availability).toBe("unproven");
    expect(walletUnknownRuntime.walletBalanceSol.source).toBe("runtime");
  });

  it("freezes the canonical runtime gate matrix", () => {
    expect(goldenRuntimeFixtures.ARM_REQUIRED.canArm.allowed).toBe(true);
    expect(goldenRuntimeFixtures.READY.canStart.allowed).toBe(true);
    expect(goldenRuntimeFixtures.ACTIVE.canStop.allowed).toBe(true);
    expect(goldenRuntimeFixtures.BUDGET_REACHED.remainingSol.value).toBe(0);
  });
});
