import { describe, expect, it } from "vitest";
import {
  compareExpectedNormalizedOutput,
  getFixtureEntry,
  listPumpfunFixtures,
  loadExpectedOutputForFixture,
  loadFixtureManifest,
  loadPumpfunFixture,
  preventFixturePathTraversal,
  sanitizeTransactionFixture,
  summarizeTransactionFixture,
  validateFixtureAgainstManifest,
  validateTransactionFixtureShape
} from "../src/fixtures";
import {
  decodePumpfunTransaction,
  pumpfunEventToIndexerEvent
} from "../src/index";

describe("@axi/pumpfun-decoder fixtures", () => {
  it("loads the fixture manifest", () => {
    const manifest = loadFixtureManifest();

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.fixtures.length).toBeGreaterThanOrEqual(6);
  });

  it("ensures every listed fixture exists and has expected event type", () => {
    for (const entry of listPumpfunFixtures()) {
      const json = loadPumpfunFixture(entry.filename);
      const validation = validateFixtureAgainstManifest(entry, json);

      expect(entry.expectedEventType).toBeTruthy();
      expect(validation.errors).toEqual([]);
      expect(validation.ok).toBe(true);
    }
  });

  it("marks synthetic fixtures as synthetic", () => {
    for (const entry of listPumpfunFixtures()) {
      if (entry.fixtureType === "synthetic") {
        expect(entry.source).toBe("synthetic");
        expect(entry.cluster).toBe("local");
      }
    }
  });

  it("fails cleanly for missing fixtures", () => {
    expect(() => getFixtureEntry("missing-fixture")).toThrow(
      "PUMPFUN_FIXTURE_NOT_FOUND"
    );
  });

  it("rejects fixture path traversal", () => {
    expect(() => preventFixturePathTraversal("../buy-trade.json")).toThrow(
      "PUMPFUN_FIXTURE_PATH_INVALID"
    );
  });

  it("rejects secret-like keys during sanitization", () => {
    expect(() =>
      sanitizeTransactionFixture({
        signature: "sig",
        apiKey: "do-not-store"
      })
    ).toThrow("PUMPFUN_FIXTURE_SECRET_KEY_REJECTED");
  });

  it("accepts and summarizes getTransaction-like fixtures", () => {
    const fixture = loadPumpfunFixture("buy-trade.json");
    const validation = validateTransactionFixtureShape(fixture);
    const summary = summarizeTransactionFixture(fixture);

    expect(validation.ok).toBe(true);
    expect(summary.signature).toBe("pumpfun_fixture_buy_trade_sig");
    expect(summary.slot).toBe(1002);
    expect(summary.logCount).toBeGreaterThan(0);
    expect(summary.preTokenBalanceCount).toBe(2);
  });

  it("includes failed transaction errors in summaries", () => {
    const summary = summarizeTransactionFixture(
      loadPumpfunFixture("failed-transaction.json")
    );

    expect(summary.hasError).toBe(true);
    expect(summary.err).toEqual({ InstructionError: [0, "Custom"] });
  });

  it("matches golden expected normalized output stable fields", () => {
    for (const entry of listPumpfunFixtures()) {
      const expected = loadExpectedOutputForFixture(entry);

      expect(expected).not.toBeNull();

      const decoded = decodePumpfunTransaction(loadPumpfunFixture(entry.filename));
      const normalized = pumpfunEventToIndexerEvent(decoded);
      const comparison = compareExpectedNormalizedOutput(entry, normalized);

      expect(comparison.checked).toBe(true);
      expect(comparison).toMatchObject({
        ok: true,
        missingFields: [],
        mismatchedFields: []
      });
    }
  });
});
