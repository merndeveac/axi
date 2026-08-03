import type { ScannerStreamMessageV2 } from "@axi/shared";
import { describe, expect, it } from "vitest";
import {
  goldenScannerSnapshot,
  hotToken,
  rippingToken
} from "../fixtures/golden-path";
import {
  applyScannerMessage,
  applyScannerSnapshot,
  emptyVersionedScannerState,
  orderedScannerRows
} from "./versioning";
import { parseScannerStreamMessage, reconnectDelay } from "./websocket-client";

function upsert(
  sequence: number,
  row = hotToken
): ScannerStreamMessageV2 {
  return {
    schemaVersion: "scanner-stream-v2",
    type: "scanner.upsert",
    sequence,
    generatedAt: "2025-06-14T12:00:01.000Z",
    row
  };
}

describe("versioned scanner state", () => {
  it("does not let an older HTTP snapshot overwrite a newer delta", () => {
    const initial = applyScannerSnapshot(emptyVersionedScannerState(), {
      ...goldenScannerSnapshot,
      snapshotVersion: 4
    });
    const newerRow = { ...rippingToken, rowVersion: 6, order: -1 };
    const afterDelta = applyScannerMessage(initial, upsert(5, newerRow));
    const afterOldHttp = applyScannerSnapshot(afterDelta, {
      ...goldenScannerSnapshot,
      snapshotVersion: 4
    });
    expect(afterOldHttp.rows.get(newerRow.mint)?.rowVersion).toBe(6);
    expect(afterOldHttp).toBe(afterDelta);
  });

  it("applies duplicates idempotently and flags sequence gaps", () => {
    const once = applyScannerMessage(emptyVersionedScannerState(), upsert(1));
    expect(applyScannerMessage(once, upsert(1))).toBe(once);
    const gap = applyScannerMessage(once, upsert(3, rippingToken));
    expect(gap.needsReconciliation).toBe(true);
    expect(gap.rows.has(rippingToken.mint)).toBe(false);
  });

  it("removes active rows and preserves server ordering", () => {
    const initial = applyScannerSnapshot(emptyVersionedScannerState(), {
      ...goldenScannerSnapshot,
      snapshotVersion: 1
    });
    const target = orderedScannerRows(initial)[0];
    expect(target).toBeTruthy();
    if (!target) return;
    const removed = applyScannerMessage(initial, {
      schemaVersion: "scanner-stream-v2",
      type: "scanner.remove",
      sequence: 2,
      generatedAt: "2025-06-14T12:00:02.000Z",
      mint: target.mint,
      rowVersion: target.rowVersion
    });
    expect(removed.rows.has(target.mint)).toBe(false);
  });

  it("bounds WebSocket insertions to the 100-row active page", () => {
    let state = emptyVersionedScannerState();
    for (let index = 0; index < 105; index += 1) {
      state = applyScannerMessage(
        state,
        upsert(index + 1, {
          ...hotToken,
          mint: `Bounded${String(index).padStart(3, "0")}1111111111111111111111111111111`,
          order: 0,
          rowVersion: 1
        })
      );
    }
    expect(state.rows.size).toBe(100);
    expect(state.rows.has("Bounded1041111111111111111111111111111111")).toBe(
      true
    );
    expect(state.rows.has("Bounded0001111111111111111111111111111111")).toBe(
      false
    );
  });
});

describe("scanner WebSocket guards", () => {
  it("rejects malformed and unsupported messages", () => {
    expect(parseScannerStreamMessage("not json")).toBeNull();
    expect(parseScannerStreamMessage(JSON.stringify({ type: "scanner.upsert" }))).toBeNull();
    expect(
      parseScannerStreamMessage(
        JSON.stringify({ schemaVersion: "scanner-stream-v1", sequence: 1 })
      )
    ).toBeNull();
  });

  it("uses bounded exponential reconnect backoff with jitter", () => {
    expect(reconnectDelay(0, 15_000, () => 0.5)).toBe(500);
    expect(reconnectDelay(10, 15_000, () => 0.5)).toBe(15_000);
    expect(reconnectDelay(1, 15_000, () => 0)).toBe(800);
  });
});
