import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FeedEventHandler, TokenFeedProvider } from "@axi/data-feeds";
import {
  closeStorage,
  initStorageReadOnly,
  listRuntimeSessions
} from "@axi/storage";
import { createApiServer } from "../src/app";
import {
  openTradeDataCoverageStorage,
  prepareTradeDataCoverageRuntimeSession,
  type TradeDataCoverageStartupStage
} from "../src/trade-data-coverage-runtime-startup";
import { runTradeDataCoverageStartupCheck } from "../src/trade-data-coverage-startup-check-service";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "axi-coverage-startup-test-"));
});

afterEach(() => {
  closeStorage();
  rmSync(directory, { recursive: true, force: true });
});

describe("trade-data coverage startup ownership", () => {
  it("readiness alone creates no runtime, coverage, or provider state", () => {
    const owner = openTradeDataCoverageStorage({
      databasePath: join(directory, "readiness-only.sqlite")
    });

    expect(owner.storageReady).toBe(true);
    expect(listRuntimeSessions(10)).toEqual([]);
    expect(owner.close()).toBe(true);
  });

  it("persists before provider construction and finalizes one zero-network runtime", async () => {
    const databasePath = join(directory, "ordering.sqlite");
    let providerConstructedAfterPersistence = false;

    const result = await runTradeDataCoverageStartupCheck({
      createId: () => "ordering",
      createProvider: () => {
        providerConstructedAfterPersistence =
          listRuntimeSessions(10).filter(
            (session) => session.sessionId === "trade-coverage-runtime-ordering"
          ).length === 1;
        return new TestProvider();
      },
      databasePath,
      now: () => new Date("2026-08-03T00:00:00.000Z")
    });

    expect(providerConstructedAfterPersistence).toBe(true);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        storageReady: true,
        storageOwnershipMode: "owned",
        runtimeSessionPersisted: true,
        runtimeSessionFinalized: true,
        runtimeSessionCount: 1,
        activeRuntimeSessionCount: 0,
        activeCoverageSessionCount: 0,
        providerConstructCount: 1,
        providerConnectCount: 0,
        networkConnectionStarted: false,
        paidStreamStarted: false,
        cleanupCompleted: true
      })
    );
    expect(JSON.stringify(result)).not.toContain(databasePath);
    expect(JSON.stringify(result)).not.toMatch(/api.?key|private.?key|secret/i);
  });

  it("keeps borrowed storage active until its CLI owner closes it", async () => {
    const owner = openTradeDataCoverageStorage({
      databasePath: join(directory, "borrowed.sqlite")
    });
    const runtimeSession = prepareTradeDataCoverageRuntimeSession(owner, {
      createId: () => "borrowed",
      now: () => new Date("2026-08-03T00:00:00.000Z"),
      runtimeMode: "none"
    });
    const server = createApiServer({
      dataFeed: "none",
      dataFeedMode: "none",
      feedProvider: new TestProvider(),
      logLevel: false,
      runtimeSession,
      startFeed: false,
      storage: { handle: owner.handle, ownership: "borrowed" }
    });

    await server.close();
    expect(owner.isActive()).toBe(true);
    expect(owner.close()).toBe(true);
    expect(owner.close()).toBe(false);
  });

  it("supports readiness then ordinary server runtime insertion on the borrowed handle", async () => {
    const databasePath = join(directory, "readiness-server-insert.sqlite");
    const owner = openTradeDataCoverageStorage({ databasePath });
    const provider = new TestProvider();
    const server = createApiServer({
      dataFeed: "none",
      dataFeedMode: "none",
      feedProvider: provider,
      logLevel: false,
      startFeed: false,
      storage: { handle: owner.handle, ownership: "borrowed" }
    });

    expect(listRuntimeSessions(10)).toEqual([
      expect.objectContaining({ paidDataArmed: false, stoppedAt: null })
    ]);
    expect(provider.startCount).toBe(0);

    await server.close();
    expect(listRuntimeSessions(10)).toEqual([
      expect.objectContaining({
        paidDataArmed: false,
        stopReason: "server_shutdown",
        stoppedAt: expect.any(String)
      })
    ]);
    expect(owner.isActive()).toBe(true);
    expect(owner.close()).toBe(true);
  });

  it("rejects a prepared marker when its runtime row was not persisted", () => {
    const owner = openTradeDataCoverageStorage({
      databasePath: join(directory, "missing-runtime-row.sqlite")
    });
    expect(() =>
      createApiServer({
        dataFeed: "none",
        dataFeedMode: "none",
        feedProvider: new TestProvider(),
        logLevel: false,
        runtimeSession: {
          configFingerprint: "safe-test-fingerprint",
          persisted: true,
          runtimeMode: "none",
          sessionId: "missing-runtime-session",
          startedAt: "2026-08-03T00:00:00.000Z"
        },
        startFeed: false,
        storage: { handle: owner.handle, ownership: "borrowed" }
      })
    ).toThrow("not active in the injected storage");
    expect(listRuntimeSessions(10)).toEqual([]);
    expect(owner.isActive()).toBe(true);
    expect(owner.close()).toBe(true);
  });

  it("closes internally owned storage after failed server construction", () => {
    expect(() =>
      createApiServer({
        dataFeed: "none",
        dataFeedMode: "none",
        failIfNoRealData: true,
        logLevel: false,
        storageDatabasePath: join(directory, "failed.sqlite")
      })
    ).toThrow("No real data feed");

    const server = createApiServer({
      dataFeed: "none",
      dataFeedMode: "none",
      logLevel: false,
      startFeed: false,
      storageDatabasePath: join(directory, "recovered.sqlite")
    });
    return server.close();
  });

  it("returns a bounded typed lock error and recovers after release", async () => {
    const databasePath = join(directory, "locked.sqlite");
    const startedAt = performance.now();
    const locked = await runTradeDataCoverageStartupCheck({
      busyTimeoutMs: 25,
      createId: () => "locked",
      databasePath,
      simulateLock: true
    });
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1_000);
    expect(locked).toEqual(
      expect.objectContaining({
        success: false,
        runtimeSessionPersisted: false,
        runtimeSessionCount: 0,
        activeRuntimeSessionCount: 0,
        activeCoverageSessionCount: 0,
        providerConstructCount: 0,
        providerConnectCount: 0,
        paidStreamStarted: false,
        cleanupCompleted: true,
        failureStage: "runtime_session_persistence",
        safeErrorCode: "TRADE_DATA_COVERAGE_STORAGE_LOCKED"
      })
    );

    const recovered = await runTradeDataCoverageStartupCheck({
      busyTimeoutMs: 25,
      createId: () => "recovered",
      databasePath
    });
    expect(recovered).toMatchObject({
      success: true,
      runtimeSessionCount: 1,
      activeRuntimeSessionCount: 0,
      providerConnectCount: 0
    });
  });

  it("cleans every injected startup failure boundary and permits recovery", async () => {
    const stages: TradeDataCoverageStartupStage[] = [
      "storage_initialization",
      "readiness_query",
      "runtime_session_persistence",
      "provider_construction",
      "api_construction",
      "coverage_service_construction",
      "provider_start",
      "runtime_session_finalization",
      "storage_close"
    ];

    for (const [index, targetStage] of stages.entries()) {
      const databasePath = join(directory, `failure-${index}.sqlite`);
      const failed = await runTradeDataCoverageStartupCheck({
        createId: () => `failed-${index}`,
        databasePath,
        exerciseFakeProviderStart: targetStage === "provider_start",
        failureInjector: (stage) => {
          if (stage === targetStage) {
            throw new Error("injected failure details must be sanitized");
          }
        }
      });

      expect(failed).toMatchObject({
        success: false,
        activeRuntimeSessionCount: 0,
        activeCoverageSessionCount: 0,
        providerConnectCount: 0,
        paidStreamStarted: false,
        cleanupCompleted: true,
        failureStage: targetStage
      });
      expect(failed.safeErrorMessage).not.toContain("injected failure details");

      const recovered = await runTradeDataCoverageStartupCheck({
        createId: () => `recovered-${index}`,
        databasePath
      });
      expect(recovered).toMatchObject({
        success: true,
        activeRuntimeSessionCount: 0,
        activeCoverageSessionCount: 0,
        providerConnectCount: 0
      });
    }
  });

  it("completes 25 sequential lifecycles without locks, duplicates, or active sessions", async () => {
    const databasePath = join(directory, "repeated.sqlite");

    for (let index = 0; index < 25; index += 1) {
      const result = await runTradeDataCoverageStartupCheck({
        createId: () => `repeat-${index}`,
        databasePath,
        now: () => new Date(1_775_174_400_000 + index * 1_000)
      });
      expect(result).toMatchObject({
        success: true,
        runtimeSessionCount: index + 1,
        activeRuntimeSessionCount: 0,
        activeCoverageSessionCount: 0,
        providerConnectCount: 0,
        paidStreamStarted: false,
        cleanupCompleted: true
      });
    }

    initStorageReadOnly({ databasePath });
    const sessions = listRuntimeSessions(100);
    expect(sessions).toHaveLength(25);
    expect(new Set(sessions.map((session) => session.sessionId)).size).toBe(25);
    expect(sessions.every((session) => session.stoppedAt !== null)).toBe(true);
    closeStorage();
  });
});

class TestProvider implements TokenFeedProvider {
  readonly name = "startup-test";
  startCount = 0;
  start(handler: FeedEventHandler): void {
    void handler;
    this.startCount += 1;
  }
  stop(): void {}
}
