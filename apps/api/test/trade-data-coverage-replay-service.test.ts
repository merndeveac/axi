import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeStorage, initStorage, type StorageHandle } from "@axi/storage";
import {
  replayTradeDataCoverageFrames,
  type TradeDataCoverageReplayFrame
} from "../src/trade-data-coverage-replay-service";

const mint = "So11111111111111111111111111111111111111112";
let directory: string | null = null;
let handle: StorageHandle | null = null;

afterEach(() => {
  if (handle) closeStorage(handle);
  handle = null;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = null;
});

describe("offline trade-data coverage replay", () => {
  it.each([49, 50, 65])(
    "enforces the canonical boundary for a %i-frame burst",
    (frameCount) => {
      directory = mkdtempSync(join(tmpdir(), "axi-replay-test-"));
      handle = initStorage({ databasePath: join(directory, "target.sqlite") });
      const result = replayTradeDataCoverageFrames({
        frames: frames(frameCount),
        selectedMint: mint,
        sourceStartedAt: "2026-08-04T00:00:00.000Z",
        targetSessionId: `replay-${frameCount}`,
        maxEvents: 50
      });

      expect(result.status).toBe("OFFLINE_REPLAY_PASSED");
      expect(result.canonicalAdmittedTrades).toBe(Math.min(frameCount, 50));
      expect(result.postStopEvidenceOnlyTrades).toBe(
        Math.max(0, frameCount - 50)
      );
      expect(result.canonicalBusinessTradeRows).toBe(Math.min(frameCount, 50));
      expect(result.canonicalTimeSeriesSourceEvents).toBe(
        Math.min(frameCount, 50)
      );
      expect(result.postStopCanonicalMutations).toBe(0);
      expect(result.estimatedBillableMessages).toBe(frameCount);
      expect(result.maximumAbsoluteCounterResidual).toBe(0);
      expect(result.sessionSubscriptionCounterResidual).toBe(0);
      expect(result.telemetryFailures).toBe(0);
      expect(result.lifecycleSequenceMatches).toBe(true);
      expect(result.lifecycleEmbeddedEvents).toBe(10);
      expect(result.lifecyclePersistedEvents).toBe(10);
      expect(result.lifecycleResidual).toBe(0);
    }
  );

  it("reclassifies rounded execution-price failures without conflating curve spread", () => {
    directory = mkdtempSync(join(tmpdir(), "axi-replay-test-"));
    handle = initStorage({ databasePath: join(directory, "target.sqlite") });
    const replayFrames = frames(65).map((frame, index) => ({
      ...frame,
      priorPriceVolumeMismatch: index < 60
    }));
    const result = replayTradeDataCoverageFrames({
      frames: replayFrames,
      selectedMint: mint,
      sourceStartedAt: "2026-08-04T00:00:00.000Z",
      targetSessionId: "replay-price-classification",
      maxEvents: 50
    });

    expect(result.priceConsistency).toMatchObject({
      priorFailures: 60,
      roundingComparisonDefects: 60,
      differentPriceSemanticsDefects: 0,
      unitUncertainty: 0,
      genuineInconsistency: 0,
      correctedExecutionIdentityPasses: 65,
      correctedExecutionIdentityFailures: 0,
      expectedCurveExecutionSpreads: 65
    });
  });
});

function frames(count: number): TradeDataCoverageReplayFrame[] {
  return Array.from({ length: count }, (_, index) => {
    const receivedAt = new Date(
      Date.parse("2026-08-04T00:00:00.000Z") + index * 75
    ).toISOString();
    return {
      raw: {
        mint,
        signature: `fixture-signature-${index + 1}`,
        traderPublicKey: "11111111111111111111111111111111",
        txType: index % 2 === 0 ? "buy" : "sell",
        solAmount: 0.25 + index * 0.001,
        tokenAmount: 100_000 + index * 100,
        newTokenBalance: 1_000_000 + index,
        vSolInBondingCurve: 30 + index * 0.1,
        vTokensInBondingCurve: 10_000_000 - index * 1_000,
        marketCapSol: 30 + index * 0.5,
        timestamp: receivedAt
      },
      receivedAt,
      priorPriceVolumeMismatch: false
    };
  });
}
