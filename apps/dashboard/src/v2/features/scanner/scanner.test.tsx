// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import type { MomentumScannerSummaryV2 } from "@axi/shared";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  goldenScannerRows,
  hotToken,
  staleToken
} from "../../fixtures/golden-path";
import { formatSolV2 } from "../../lib/formatters";
import { matchesScannerFilter, matchesScannerSearch } from "./filters";
import { ScannerPageView } from "./ScannerPage";
import { readinessCopy } from "./SampleReadiness";
import { sortScannerRows } from "./sorting";

beforeAll(() => {
  class ResizeObserverStub {
    constructor(
      private readonly callback: ResizeObserverCallback
    ) {}
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: {
              bottom: 560,
              height: 560,
              left: 0,
              right: 1280,
              top: 0,
              width: 1280,
              x: 0,
              y: 0,
              toJSON: () => ({})
            }
          } as ResizeObserverEntry
        ],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverStub
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(callback, 0)
  });
  if (!globalThis.CSS) {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { escape: (value: string) => value }
    });
  } else if (!globalThis.CSS.escape) {
    globalThis.CSS.escape = (value: string) => value;
  }
});

afterEach(cleanup);

function loadRows(count: number): MomentumScannerSummaryV2[] {
  return Array.from({ length: count }, (_, index) => {
    const source = goldenScannerRows[index % goldenScannerRows.length];
    if (!source) throw new Error("Golden scanner fixtures unavailable");
    const mint = `Load${String(index).padStart(4, "0")}1111111111111111111111111111111`;
    return {
      ...source,
      mint,
      order: index,
      rowVersion: index + 1,
      firstSeenAt: new Date(Date.parse("2025-06-14T12:00:00.000Z") - index * 100).toISOString(),
      latestEventAt: new Date(Date.parse("2025-06-14T12:00:00.000Z") - index * 100).toISOString(),
      identity: {
        ...source.identity,
        displayName: `Load token ${index}`,
        symbol: `L${index}`,
        shortMint: `Load…${String(index).padStart(4, "0")}`,
        imageUri: { ...source.identity.imageUri, value: null, availability: "unavailable" }
      }
    };
  });
}

describe("scanner filters, sorting, and readiness", () => {
  it("maps sample counts to the golden-path readiness vocabulary", () => {
    expect([0, 1, 2, 3].map(readinessCopy)).toEqual([
      "0 samples · discovery",
      "1 sample · observed",
      "2 samples · d1 ready",
      "3 samples · d2 ready"
    ]);
  });

  it("filters and searches without relying on raw reason codes", () => {
    expect(matchesScannerFilter(hotToken, "hot")).toBe(true);
    expect(matchesScannerFilter(staleToken, "stale")).toBe(true);
    expect(matchesScannerSearch(hotToken, hotToken.mint.slice(0, 12))).toBe(true);
    expect(matchesScannerSearch(hotToken, "definitely absent")).toBe(false);
  });

  it("sorts a copy and preserves stable mint identity", () => {
    const source = loadRows(20);
    const sorted = sortScannerRows(source, "score");
    expect(source[0]?.mint).toContain("0000");
    expect(sorted).not.toBe(source);
    expect(new Set(sorted.map((row) => row.mint))).toEqual(
      new Set(source.map((row) => row.mint))
    );
  });

  it("formats micro prices as significant nonzero SOL", () => {
    expect(formatSolV2(4.2528736e-8)).toBe("4.25e-8 SOL");
  });
});

describe.each([10, 100, 500, 815])("virtualized scanner with %i rows", (count) => {
  it("keeps the live DOM bounded", async () => {
    render(<ScannerPageView rows={loadRows(count)} />);
    const cards = await screen.findAllByTestId("scanner-card");
    expect(cards.length).toBeLessThanOrEqual(Math.min(count, 20));
    expect(cards[0]).toHaveAttribute("data-row-height", "82");
  });
});

describe("scanner selection behavior", () => {
  it("pins selection by mint through insertion, reorder, and removal", async () => {
    const user = userEvent.setup();
    const rows = loadRows(12);
    const selected = rows[1];
    expect(selected).toBeTruthy();
    if (!selected) return;
    const view = render(<ScannerPageView rows={rows} />);
    await user.click(screen.getByRole("option", { name: new RegExp(`L1,`) }));
    expect(screen.getByLabelText("Selected token Load token 1")).toBeTruthy();

    const inserted = { ...rows[0]!, mint: "Newest11111111111111111111111111111111111", order: -1 };
    view.rerender(<ScannerPageView rows={[inserted, ...rows]} />);
    expect(screen.getByLabelText("Selected token Load token 1")).toBeTruthy();

    view.rerender(<ScannerPageView rows={[inserted, ...rows.filter((row) => row.mint !== selected.mint)]} />);
    expect(screen.getByLabelText("Selected token Load token 1")).toBeTruthy();
  });

  it("supports arrow-key row selection", async () => {
    render(<ScannerPageView rows={loadRows(20)} />);
    const list = screen.getByRole("listbox");
    list.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(await screen.findByLabelText("Selected token Load token 1")).toBeTruthy();
  });

  it("shows stale state without exposing technical reason-code walls", async () => {
    render(<ScannerPageView rows={[staleToken]} stale />);
    expect((await screen.findAllByText(/stale/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText("INSUFFICIENT_PRICE_SAMPLES")).toBeNull();
  });
});
