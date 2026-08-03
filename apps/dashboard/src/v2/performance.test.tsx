// @vitest-environment jsdom

import type {
  MomentumScannerSummaryV2,
  ScannerSnapshotV2,
  ScannerStreamMessageV2
} from "@axi/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { goldenScannerRows } from "./fixtures/golden-path";
import { ScannerPageView } from "./features/scanner/ScannerPage";

type PerformanceResult = {
  tokens: number;
  responseRows: number;
  projectionCount: number;
  snapshotBytes: number;
  deltaBytes: number;
  generationMs: number;
  heapDeltaBytes: number;
  domRows: number;
  newLaunchLatencyMs: number;
};

const results: PerformanceResult[] = [];

beforeAll(() => {
  class ResizeObserverStub {
    constructor(private readonly callback: ResizeObserverCallback) {}
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
});

afterEach(cleanup);

afterAll(() => {
  console.info(`UI_V2_PERFORMANCE ${JSON.stringify(results)}`);
});

describe.each([10, 100, 500, 815])(
  "V2 performance evidence with %i tokens",
  (tokenCount) => {
    it("keeps transport and rendered work bounded", async () => {
      const heapBefore = process.memoryUsage().heapUsed;
      const rows = loadRows(tokenCount);
      const responseRows = rows.slice(0, 100);
      const started = performance.now();
      const snapshot: ScannerSnapshotV2 = {
        schemaVersion: "scanner-snapshot-v2",
        snapshotVersion: 1,
        generatedAt: "2026-08-03T12:00:00.000Z",
        sessionId: "performance-fixture",
        totalActive: tokenCount,
        totalHistory: 0,
        nextCursor: tokenCount > 100 ? "scanner-v2-next-page" : null,
        rows: responseRows
      };
      const snapshotJson = JSON.stringify(snapshot);
      const generationMs = performance.now() - started;
      const delta: ScannerStreamMessageV2 = {
        schemaVersion: "scanner-stream-v2",
        type: "scanner.upsert",
        sequence: 2,
        generatedAt: "2026-08-03T12:00:01.000Z",
        row: responseRows[0]!
      };
      const snapshotBytes = Buffer.byteLength(snapshotJson);
      const deltaBytes = Buffer.byteLength(JSON.stringify(delta));
      const heapDeltaBytes = Math.max(
        0,
        process.memoryUsage().heapUsed - heapBefore
      );

      const view = render(
        <ScannerPageView rows={rows} totalActive={tokenCount} />
      );
      const cards = await screen.findAllByTestId("scanner-card");
      const newLaunch = {
        ...scannerRow(0, "NEW"),
        mint: "NewPerformanceLaunch11111111111111111111111111",
        firstSeenAt: "2026-08-03T12:00:01.000Z",
        latestEventAt: "2026-08-03T12:00:01.000Z"
      };
      const launchStarted = performance.now();
      view.rerender(
        <ScannerPageView
          rows={[newLaunch, ...rows]}
          totalActive={tokenCount + 1}
        />
      );
      await screen.findByRole("option", { name: /^NEW,/ });
      const newLaunchLatencyMs = performance.now() - launchStarted;

      const result = {
        tokens: tokenCount,
        responseRows: responseRows.length,
        projectionCount: responseRows.length,
        snapshotBytes,
        deltaBytes,
        generationMs: rounded(generationMs),
        heapDeltaBytes,
        domRows: cards.length,
        newLaunchLatencyMs: rounded(newLaunchLatencyMs)
      };
      results.push(result);
      expect(snapshotBytes).toBeLessThanOrEqual(500_000);
      expect(deltaBytes).toBeLessThanOrEqual(50_000);
      expect(generationMs).toBeLessThan(100);
      expect(cards.length).toBeLessThanOrEqual(20);
      expect(newLaunchLatencyMs).toBeLessThan(1_500);
    });
  }
);

function loadRows(count: number): MomentumScannerSummaryV2[] {
  return Array.from({ length: count }, (_, index) => scannerRow(index));
}

function scannerRow(
  index: number,
  symbol = `P${index}`
): MomentumScannerSummaryV2 {
  const source = goldenScannerRows[index % goldenScannerRows.length]!;
  const timestamp = new Date(
    Date.parse("2026-08-03T12:00:00.000Z") - index * 100
  ).toISOString();
  return {
    ...source,
    mint: `Perf${String(index).padStart(6, "0")}111111111111111111111111111111`,
    order: index,
    rowVersion: index + 1,
    firstSeenAt: timestamp,
    latestEventAt: timestamp,
    identity: {
      ...source.identity,
      displayName:
        symbol === "NEW" ? "New launch" : `Performance token ${index}`,
      symbol,
      shortMint: `Perf…${String(index).padStart(6, "0")}`,
      imageUri: {
        ...source.identity.imageUri,
        value: null,
        availability: "unavailable"
      }
    }
  };
}

function rounded(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
