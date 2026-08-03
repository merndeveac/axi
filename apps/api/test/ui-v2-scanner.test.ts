import { describe, expect, it } from "vitest";
import {
  selectScannerCandidatesV2,
  type ScannerCandidateV2,
  type ScannerQueryV2
} from "../src/ui-v2-scanner";

const now = new Date("2026-08-03T20:00:00.000Z");

function candidate(
  mint: string,
  overrides: Partial<ScannerCandidateV2> = {}
): ScannerCandidateV2 {
  return {
    mint,
    name: mint,
    symbol: mint,
    displayName: mint,
    firstSeenAt: "2026-08-03T19:50:00.000Z",
    latestEventAt: "2026-08-03T19:50:00.000Z",
    trackingState: "not_tracked",
    tradeSampleCount: 0,
    strengthLabel: "none",
    score: 0,
    strengthScore: null,
    volume10sSol: null,
    uniqueBuyers10s: null,
    priceChange10sPct: null,
    riskLevel: "unknown",
    unrealizedPnlPct: null,
    hasPosition: false,
    hardReject: false,
    stale: true,
    ...overrides
  };
}

const activeQuery: ScannerQueryV2 = {
  limit: 100,
  cursor: null,
  sort: "newest",
  filters: [],
  activeOnly: true,
  includeProtected: true,
  query: ""
};

describe("V2 scanner candidate selection", () => {
  it("rotates ordinary rows after five minutes while retaining protected rows", () => {
    const result = selectScannerCandidatesV2(
      [
        candidate("ordinary-old"),
        candidate("ordinary-new", {
          latestEventAt: "2026-08-03T19:59:00.000Z"
        }),
        candidate("tracked-old", { trackingState: "tracking" }),
        candidate("position-old", { hasPosition: true }),
        candidate("ripping-old", { strengthLabel: "ripping" })
      ],
      activeQuery,
      now
    );

    expect(result.totalActive).toBe(4);
    expect(result.totalHistory).toBe(1);
    expect(result.page.map((row) => row.mint)).toEqual([
      "tracked-old",
      "position-old",
      "ripping-old",
      "ordinary-new"
    ]);
  });

  it("filters and sorts without requiring rich card projection", () => {
    const result = selectScannerCandidatesV2(
      [
        candidate("hot-low", {
          latestEventAt: "2026-08-03T19:59:00.000Z",
          strengthLabel: "hot",
          score: 40
        }),
        candidate("hot-high", {
          latestEventAt: "2026-08-03T19:59:00.000Z",
          strengthLabel: "hot",
          score: 80
        }),
        candidate("watch", {
          latestEventAt: "2026-08-03T19:59:00.000Z",
          strengthLabel: "watch"
        })
      ],
      { ...activeQuery, filters: ["hot"], sort: "score" },
      now
    );

    expect(result.page.map((row) => row.mint)).toEqual(["hot-high", "hot-low"]);
  });
});
