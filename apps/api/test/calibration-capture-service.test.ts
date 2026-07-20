import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulateLaunchMomentumFixture } from "@axi/launch-momentum";
import {
  closeStorage,
  initStorage,
  upsertLaunchTimeseriesBucket
} from "@axi/storage";
import {
  CalibrationCaptureServiceError,
  createCalibrationCaptureService
} from "../src/calibration-capture-service";

let testDirectory: string;
let now = new Date("2026-01-01T00:00:25.000Z");

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "axi-calibration-capture-"));
  initStorage({ databasePath: join(testDirectory, "axi.sqlite") });
  now = new Date("2026-01-01T00:00:25.000Z");
});

afterEach(() => {
  closeStorage();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("CalibrationCaptureService", () => {
  it("captures, materializes, exports, and stops a manual session", () => {
    const service = createService();
    const started = service.start({
      partition: "train",
      config: {
        horizonMs: 1_000,
        maxOutcomeLagMs: 1_000,
        samplingIntervalMs: 1_000
      }
    });
    const snapshot = simulateLaunchMomentumFixture("strong-ripper");

    expect(started).toMatchObject({
      created: true,
      session: {
        sessionId: "capture-test-1",
        partition: "train",
        status: "active"
      },
      status: { active: true, observationCount: 0 }
    });

    const captured = service.captureSnapshot(snapshot, 42);
    expect(captured).toMatchObject({
      captured: true,
      observation: {
        sourceSnapshotId: 42,
        signalAt: "2026-01-01T00:00:25.000Z",
        status: "pending"
      }
    });
    expect(service.captureSnapshot(snapshot, 43)).toEqual({
      captured: false,
      reasonCodes: ["CALIBRATION_CAPTURE_SAMPLING_INTERVAL"]
    });

    const entryPriceSol = snapshot.priceSol;
    expect(entryPriceSol).not.toBeNull();
    upsertLaunchTimeseriesBucket(
      outcomeBucket(snapshot.mint, entryPriceSol ?? 1)
    );
    now = new Date("2026-01-01T00:00:26.000Z");

    expect(service.materialize(started.session.sessionId)).toMatchObject({
      observationCount: 1,
      completedCount: 1,
      pendingCount: 0,
      unavailableCount: 0,
      changedCount: 1,
      tradingDisabled: true
    });

    const exported = service.export(started.session.sessionId, "json");
    expect(exported.dataset.manifest).toMatchObject({
      captureSessionId: "capture-test-1",
      partition: "train",
      completedObservationCount: 1,
      automaticThresholdActivation: false,
      tradingDisabled: true
    });
    expect(JSON.parse(exported.serialized)).toEqual(exported.dataset);

    expect(service.stop("test_complete")).toMatchObject({
      stopped: true,
      session: { status: "stopped", stopReason: "test_complete" }
    });
    expect(service.getStatus()).toMatchObject({
      active: false,
      observationCount: 0
    });
  });

  it("keeps one active session per runtime and reports unknown sessions", () => {
    const service = createService();
    const first = service.start({ partition: "validation" });
    const repeated = service.start({ partition: "validation" });

    expect(first.created).toBe(true);
    expect(repeated).toMatchObject({
      created: false,
      session: { sessionId: first.session.sessionId }
    });
    expect(() => service.start({ partition: "train" })).toThrow(
      CalibrationCaptureServiceError
    );
    expect(() => service.getDataset("missing-session")).toThrow(
      CalibrationCaptureServiceError
    );
  });

  it("interrupts an active session without enabling trading", () => {
    const service = createService();
    service.start({ partition: "train" });
    now = new Date("2026-01-01T00:00:30.000Z");

    expect(service.interrupt()).toMatchObject({
      status: "interrupted",
      stopReason: "runtime_closed",
      tradingDisabled: true
    });
    expect(service.interrupt()).toBeNull();
  });

  it("captures only mints whose forward outcome stream is covered", () => {
    const service = createCalibrationCaptureService({
      runtimeSessionId: "runtime-1",
      canCaptureMint: () => false,
      createId: () => "test-1",
      now: () => now
    });
    service.start({ partition: "train" });

    expect(
      service.captureSnapshot(simulateLaunchMomentumFixture("strong-ripper"), 1)
    ).toEqual({
      captured: false,
      reasonCodes: ["CALIBRATION_CAPTURE_OUTCOME_COVERAGE_UNAVAILABLE"]
    });
  });

  it("protects pending outcome coverage through its bounded deadline", () => {
    const service = createService();
    const snapshot = simulateLaunchMomentumFixture("strong-ripper");
    service.start({
      partition: "train",
      config: { horizonMs: 1_000, maxOutcomeLagMs: 1_000 }
    });
    service.captureSnapshot(snapshot, 1);

    expect(service.getOutcomeProtectionUntil(snapshot.mint)).toBe(
      "2026-01-01T00:00:27.000Z"
    );
    now = new Date("2026-01-01T00:00:27.000Z");
    expect(service.getOutcomeProtectionUntil(snapshot.mint)).toBeNull();
  });

  it("materializes the bounded signal window even after more than 1,000 later buckets", () => {
    const service = createService();
    const started = service.start({
      partition: "train",
      config: {
        horizonMs: 1_000,
        maxOutcomeLagMs: 1_000,
        samplingIntervalMs: 1_000
      }
    });
    const snapshot = simulateLaunchMomentumFixture("strong-ripper");
    const entryPriceSol = snapshot.priceSol ?? 1;
    service.captureSnapshot(snapshot, 42);
    upsertLaunchTimeseriesBucket(outcomeBucket(snapshot.mint, entryPriceSol));

    for (let index = 0; index < 1_001; index += 1) {
      upsertLaunchTimeseriesBucket(
        laterBucket(snapshot.mint, entryPriceSol, index)
      );
    }

    now = new Date("2026-01-01T01:00:00.000Z");
    expect(service.materialize(started.session.sessionId)).toMatchObject({
      completedCount: 1,
      unavailableCount: 0
    });
  });
});

function createService() {
  return createCalibrationCaptureService({
    runtimeSessionId: "runtime-1",
    createId: () => "test-1",
    now: () => now
  });
}

function outcomeBucket(mint: string, entryPriceSol: number) {
  return {
    schemaVersion: 1 as const,
    bucketMs: 1000 as const,
    mint,
    bucketStart: "2026-01-01T00:00:25.000Z",
    bucketEnd: "2026-01-01T00:00:26.000Z",
    firstTradeAt: "2026-01-01T00:00:25.100Z",
    lastTradeAt: "2026-01-01T00:00:25.900Z",
    openSol: entryPriceSol,
    highSol: entryPriceSol * 2.1,
    lowSol: entryPriceSol * 0.9,
    closeSol: entryPriceSol * 2,
    volumeSol: 1,
    buyVolumeSol: 1,
    sellVolumeSol: 0,
    vwapSol: entryPriceSol * 1.5,
    openUsd: null,
    highUsd: null,
    lowUsd: null,
    closeUsd: null,
    volumeUsd: 0,
    buyVolumeUsd: 0,
    sellVolumeUsd: 0,
    vwapUsd: null,
    tokenVolume: 1_000,
    tradeCount: 2,
    buyCount: 2,
    sellCount: 0,
    uniqueBuyers: 2,
    uniqueSellers: 0,
    sourceCount: 1,
    sources: ["test"],
    confidence: "high" as const,
    complete: true,
    synthetic: false,
    reasonCodes: ["TIMESERIES_BUCKET_1S"],
    paperOnly: true as const,
    dataOnly: true as const,
    tradingDisabled: true as const
  };
}

function laterBucket(mint: string, entryPriceSol: number, index: number) {
  const startMs = Date.parse("2026-01-01T00:00:27.000Z") + index * 1_000;
  const endMs = startMs + 1_000;

  return {
    ...outcomeBucket(mint, entryPriceSol),
    bucketStart: new Date(startMs).toISOString(),
    bucketEnd: new Date(endMs).toISOString(),
    firstTradeAt: new Date(startMs + 100).toISOString(),
    lastTradeAt: new Date(startMs + 900).toISOString()
  };
}
