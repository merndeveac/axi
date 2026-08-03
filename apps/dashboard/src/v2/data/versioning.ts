import type {
  MomentumScannerSummaryV2,
  ScannerSnapshotV2,
  ScannerStreamMessageV2
} from "@axi/shared";

export type VersionedScannerState = {
  snapshotVersion: number;
  lastSequence: number;
  generatedAt: string | null;
  rows: ReadonlyMap<string, MomentumScannerSummaryV2>;
  needsReconciliation: boolean;
};

export function emptyVersionedScannerState(): VersionedScannerState {
  return {
    snapshotVersion: 0,
    lastSequence: 0,
    generatedAt: null,
    rows: new Map(),
    needsReconciliation: false
  };
}

export function applyScannerSnapshot(
  state: VersionedScannerState,
  snapshot: ScannerSnapshotV2
): VersionedScannerState {
  if (
    snapshot.snapshotVersion < state.snapshotVersion ||
    snapshot.snapshotVersion < state.lastSequence
  ) {
    return state;
  }
  const rows = new Map<string, MomentumScannerSummaryV2>();
  for (const row of snapshot.rows) {
    const existing = state.rows.get(row.mint);
    rows.set(
      row.mint,
      existing && existing.rowVersion > row.rowVersion ? existing : row
    );
  }
  return {
    snapshotVersion: snapshot.snapshotVersion,
    lastSequence: Math.max(state.lastSequence, snapshot.snapshotVersion),
    generatedAt: snapshot.generatedAt,
    rows,
    needsReconciliation: false
  };
}

export function applyScannerMessage(
  state: VersionedScannerState,
  message: ScannerStreamMessageV2
): VersionedScannerState {
  if (message.sequence <= state.lastSequence) return state;
  if (state.lastSequence > 0 && message.sequence !== state.lastSequence + 1) {
    return { ...state, needsReconciliation: true };
  }

  if (message.type === "scanner.snapshot") {
    return applyScannerSnapshot(state, message.snapshot);
  }

  const base = {
    ...state,
    lastSequence: message.sequence,
    generatedAt: message.generatedAt,
    needsReconciliation: false
  };

  if (message.type === "scanner.upsert") {
    const current = state.rows.get(message.row.mint);
    if (current && current.rowVersion >= message.row.rowVersion) return base;
    const rows = new Map(state.rows);
    rows.set(message.row.mint, message.row);
    return { ...base, rows };
  }

  if (message.type === "scanner.remove") {
    const current = state.rows.get(message.mint);
    if (!current || current.rowVersion > message.rowVersion) return base;
    const rows = new Map(state.rows);
    rows.delete(message.mint);
    return { ...base, rows };
  }

  return base;
}

export function orderedScannerRows(
  state: VersionedScannerState
): MomentumScannerSummaryV2[] {
  return [...state.rows.values()].sort(
    (left, right) => left.order - right.order || right.rowVersion - left.rowVersion
  );
}
