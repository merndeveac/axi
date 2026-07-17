import { describe, expect, it } from "vitest";
import {
  evaluateLaunchMomentum,
  simulateLaunchMomentumFixture,
  type LaunchTradeSample
} from "../src";

const mint = "LaunchMomentum111111111111111111111111111111";
const launchedAt = "2026-01-01T00:00:00.000Z";
const now = "2026-01-01T00:00:30.000Z";

describe("launch momentum evaluator", () => {
  it("keeps discovery-only launches explicit until metered trades arrive", () => {
    const snapshot = evaluateLaunchMomentum({
      mint,
      launchedAt,
      now,
      trades: []
    });

    expect(snapshot.phase).toBe("discovery_only");
    expect(snapshot.score).toBe(0);
    expect(snapshot.paperOnly).toBe(true);
    expect(snapshot.tradingDisabled).toBe(true);
    expect(snapshot.reasonCodes).toContain("LAUNCH_DISCOVERY_ONLY");
    expect(snapshot.reasonCodes).toContain(
      "INSUFFICIENT_SAMPLES_FOR_DERIVATIVE"
    );
    expect(snapshot.blockers).toContain(
      "PRICE_ACTION_REQUIRES_METERED_TOKEN_TRADES"
    );
    expect(snapshot.windows["5s"].volumeSol).toBe(0);
    expect(snapshot.derivatives.volumeVelocitySolPerSec).toBeNull();
    expect(snapshot.derivativeScore.totalScore).toBe(0);
  });

  it("keeps first derivatives null until two valid trade samples exist", () => {
    const snapshot = evaluateLaunchMomentum({
      mint,
      launchedAt,
      now,
      trades: [
        {
          mint,
          side: "buy",
          trader: "buyer-1",
          signature: "sig-1",
          priceSol: 0.0004,
          volumeSol: 1,
          tokenAmount: 2_500,
          timestamp: "2026-01-01T00:00:29.000Z"
        }
      ]
    });

    expect(snapshot.derivatives.priceVelocityPctPerSec).toBeNull();
    expect(snapshot.derivatives.priceAccelerationPctPerSec2).toBeNull();
    expect(snapshot.reasonCodes).toContain(
      "INSUFFICIENT_SAMPLES_FOR_DERIVATIVE"
    );
  });

  it("computes flat first derivatives and null second derivatives with two samples", () => {
    const snapshot = evaluateLaunchMomentum({
      mint,
      launchedAt,
      now,
      trades: [
        {
          mint,
          side: "buy",
          trader: "buyer-1",
          signature: "sig-1",
          priceSol: 0.0004,
          volumeSol: 1,
          tokenAmount: 2_500,
          timestamp: "2026-01-01T00:00:25.000Z"
        },
        {
          mint,
          side: "buy",
          trader: "buyer-2",
          signature: "sig-2",
          priceSol: 0.0004,
          volumeSol: 1,
          tokenAmount: 2_500,
          timestamp: "2026-01-01T00:00:29.000Z"
        }
      ]
    });

    expect(snapshot.derivatives.priceVelocityPctPerSec).toBe(0);
    expect(snapshot.derivatives.priceAccelerationPctPerSec2).toBeNull();
    expect(snapshot.derivatives.dVol10sSolPerSec).toBeGreaterThan(0);
  });

  it("scores strong early trade flow as ripping", () => {
    const snapshot = simulateLaunchMomentumFixture("strong-ripper");

    expect(snapshot.phase).toBe("ripping");
    expect(snapshot.label).toBe("ripping");
    expect(snapshot.score).toBeGreaterThanOrEqual(75);
    expect(snapshot.reasonCodes).toContain("LAUNCH_RIPPING");
    expect(snapshot.windows["30s"].tradeCount).toBeGreaterThanOrEqual(8);
    expect(snapshot.derivatives.volumeVelocitySolPerSec).toBeGreaterThan(0);
  });

  it("keeps weak launches below hot thresholds", () => {
    const snapshot = simulateLaunchMomentumFixture("weak-launch");

    expect(snapshot.score).toBeLessThan(55);
    expect(["discovery_only", "trade_tracked", "watching"]).toContain(
      snapshot.phase
    );
    expect(snapshot.reasonCodes).toContain("LAUNCH_TRADE_TRACKED");
  });

  it("penalizes early sell pressure", () => {
    const snapshot = simulateLaunchMomentumFixture("sell-pressure");

    expect(snapshot.score).toBeLessThan(55);
    expect(snapshot.reasonCodes).toContain("LAUNCH_SELL_PRESSURE");
    expect(snapshot.blockers).toContain("SELL_PRESSURE");
    expect(snapshot.windows["30s"].netBuyPressure).toBeLessThan(0);
  });

  it("hard rejects override momentum score", () => {
    const trades: LaunchTradeSample[] = [
      {
        mint,
        side: "buy",
        trader: "buyer-1",
        signature: "sig-1",
        priceSol: 0.0004,
        volumeSol: 2,
        tokenAmount: 5_000,
        timestamp: "2026-01-01T00:00:25.000Z"
      },
      {
        mint,
        side: "buy",
        trader: "buyer-2",
        signature: "sig-2",
        priceSol: 0.0005,
        volumeSol: 2,
        tokenAmount: 4_000,
        timestamp: "2026-01-01T00:00:27.000Z"
      },
      {
        mint,
        side: "buy",
        trader: "buyer-3",
        signature: "sig-3",
        priceSol: 0.0006,
        volumeSol: 2,
        tokenAmount: 3_333,
        timestamp: "2026-01-01T00:00:29.000Z"
      }
    ];

    const snapshot = evaluateLaunchMomentum({
      hardReject: true,
      launchedAt,
      mint,
      now,
      trades
    });

    expect(snapshot.score).toBe(0);
    expect(snapshot.label).toBe("reject");
    expect(snapshot.phase).toBe("rejected");
    expect(snapshot.reasonCodes).toContain("LAUNCH_REJECTED");
  });

  it("rejects invalid timestamps instead of substituting wall-clock time", () => {
    const invalidTrade: LaunchTradeSample = {
      mint,
      side: "buy",
      trader: "buyer-invalid",
      signature: "sig-invalid",
      priceSol: 0.0004,
      volumeSol: 1,
      tokenAmount: 2_500,
      timestamp: "not-a-date"
    };
    const snapshot = evaluateLaunchMomentum({
      mint,
      launchedAt,
      now,
      trades: [
        invalidTrade,
        {
          ...invalidTrade,
          signature: "sig-future",
          timestamp: "2026-01-01T00:00:31.000Z"
        }
      ]
    });

    expect(snapshot.tradeSampleCount).toBe(0);
    expect(snapshot.derivatives.volumeVelocitySolPerSec).toBeNull();
    expect(() =>
      evaluateLaunchMomentum({
        mint,
        launchedAt,
        now: "not-a-date",
        trades: []
      })
    ).toThrow("launch momentum timestamps must be valid");
  });

  it("deduplicates trade signatures and does not invent buyer identities", () => {
    const duplicate: LaunchTradeSample = {
      mint,
      side: "buy",
      trader: null,
      signature: "same-signature",
      priceSol: 0.0004,
      volumeSol: 1,
      tokenAmount: 2_500,
      timestamp: "2026-01-01T00:00:29.000Z"
    };
    const snapshot = evaluateLaunchMomentum({
      mint,
      launchedAt,
      now,
      trades: [duplicate, { ...duplicate }]
    });

    expect(snapshot.tradeSampleCount).toBe(1);
    expect(snapshot.windows["5s"].tradeCount).toBe(1);
    expect(snapshot.windows["5s"].uniqueBuyers).toBe(0);
  });
});
