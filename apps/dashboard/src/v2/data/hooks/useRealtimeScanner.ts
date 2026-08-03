import { useEffect, useSyncExternalStore } from "react";
import { scannerRealtimeStore } from "../scanner-realtime-store";
import {
  useScannerSnapshot,
  type ScannerSnapshotParams
} from "./useScannerSnapshot";

export function useRealtimeScanner(
  params: ScannerSnapshotParams = {},
  enabled = true
) {
  const snapshot = useScannerSnapshot(params, enabled);
  useSyncExternalStore(
    scannerRealtimeStore.subscribe,
    scannerRealtimeStore.getRevision,
    scannerRealtimeStore.getRevision
  );

  useEffect(() => {
    if (snapshot.data) scannerRealtimeStore.applySnapshot(snapshot.data);
  }, [snapshot.data]);

  useEffect(() => {
    if (!enabled || !snapshot.isSuccess) return;
    return scannerRealtimeStore.connect(() => {
      void snapshot.refetch();
    });
  }, [enabled, snapshot.isSuccess, snapshot.refetch]);

  const realtimeRows = scannerRealtimeStore.getRows();
  return {
    ...snapshot,
    rows: realtimeRows.length > 0 ? realtimeRows : (snapshot.data?.rows ?? []),
    streamState: scannerRealtimeStore.getState()
  };
}
