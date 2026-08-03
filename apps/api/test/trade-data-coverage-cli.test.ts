import { describe, expect, it } from "vitest";
import { parseTradeDataCoverageArgs } from "../src/trade-data-coverage-cli";

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

  it("parses unsafe cap requests so readiness can report sanitized blockers", () => {
    expect(
      parseTradeDataCoverageArgs([
        "--max-events",
        "51",
        "--max-cost-sol",
        "0.001"
      ])
    ).toMatchObject({ maxEvents: 51, maxCostSol: 0.001 });
  });
});
