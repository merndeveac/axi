import { describe, expect, it } from "vitest";
import { resolveUiVersion } from "./ui-version";

describe("resolveUiVersion", () => {
  it("uses V2 as the launch default", () => {
    expect(resolveUiVersion("", undefined)).toBe("v2");
  });

  it("honors a supported build-time version", () => {
    expect(resolveUiVersion("", "v2")).toBe("v2");
  });

  it("lets a supported query override win", () => {
    expect(resolveUiVersion("?ui=legacy", "v2")).toBe("legacy");
    expect(resolveUiVersion("?ui=v2", "legacy")).toBe("v2");
  });

  it("ignores unsupported values", () => {
    expect(resolveUiVersion("?ui=other", "other")).toBe("v2");
  });
});
