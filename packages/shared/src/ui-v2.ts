import { z } from "zod";

export type UiAvailability =
  | "available"
  | "unavailable"
  | "stale"
  | "unproven";

export type UiFieldSource =
  | "token_trade"
  | "curve"
  | "enrichment"
  | "risk"
  | "portfolio"
  | "runtime"
  | "unknown";

export interface UiField<T> {
  value: T | null;
  availability: UiAvailability;
  source: UiFieldSource;
  observedAt: string | null;
  confidence: number | null;
  reason?: string | null;
}

export type ScannerSignalV2 =
  | "DISCOVERY"
  | "WATCH"
  | "HOT"
  | "RIPPING"
  | "REJECT";

export type ScannerReadinessV2 =
  | "discovery"
  | "observed"
  | "d1_ready"
  | "d2_ready";

export interface MomentumScannerSummaryV2 {
  mint: string;
  rowVersion: number;
  order: number;
  firstSeenAt: string;
  latestEventAt: string | null;
  identity: {
    displayName: string;
    symbol: string | null;
    shortMint: string;
    imageUri: UiField<string>;
    ageSeconds: UiField<number>;
    migrationStatus: "not_migrated" | "migrated";
  };
  readiness: {
    trackingState: string;
    state: ScannerReadinessV2;
    validSampleCount: number;
    d1Ready: boolean;
    d2Ready: boolean;
    freshnessMs: UiField<number>;
    isProtected: boolean;
  };
  market: {
    priceSol: UiField<number>;
    priceUsd: UiField<number>;
    marketCapSol: UiField<number>;
    marketCapUsd: UiField<number>;
    liquiditySol: UiField<number>;
    liquidityUsd: UiField<number>;
    liquidityKind: "curve" | "dex" | "unavailable";
  };
  flow: {
    volume10sSol: UiField<number>;
    transactionCount10s: UiField<number>;
    uniqueBuyers10s: UiField<number>;
    buyPressure: UiField<number>;
  };
  momentum: {
    priceD1: UiField<number>;
    priceD2: UiField<number>;
    volumeD1: UiField<number>;
    volumeD2: UiField<number>;
    normalizedStrength: UiField<number>;
    confidence: UiField<number>;
  };
  decision: {
    signal: ScannerSignalV2;
    score: number;
    topDriver: string | null;
    topBlocker: string | null;
    riskLevel: string;
    hardReject: boolean;
    referencePolicy: boolean;
  };
  position: {
    status: string | null;
    unrealizedPnlPct: UiField<number>;
    unrealizedPnlSol: UiField<number>;
    exitSignal: string | null;
  };
  sparkline: {
    values: number[];
    source: UiFieldSource;
  };
}

export interface ScannerSnapshotV2 {
  schemaVersion: "scanner-snapshot-v2";
  snapshotVersion: number;
  generatedAt: string;
  sessionId: string | null;
  totalActive: number;
  totalHistory: number;
  nextCursor: string | null;
  rows: MomentumScannerSummaryV2[];
}

export interface ScannerStreamEnvelopeV2 {
  schemaVersion: "scanner-stream-v2";
  sequence: number;
  generatedAt: string;
}

export type ScannerStreamMessageV2 =
  | (ScannerStreamEnvelopeV2 & {
      type: "scanner.snapshot";
      snapshot: ScannerSnapshotV2;
    })
  | (ScannerStreamEnvelopeV2 & {
      type: "scanner.upsert";
      row: MomentumScannerSummaryV2;
    })
  | (ScannerStreamEnvelopeV2 & {
      type: "scanner.remove";
      mint: string;
      rowVersion: number;
    })
  | (ScannerStreamEnvelopeV2 & {
      type: "runtime.update";
      runtimeVersion: number;
    })
  | (ScannerStreamEnvelopeV2 & {
      type: "position.update";
      mint: string;
      positionVersion: number;
    })
  | (ScannerStreamEnvelopeV2 & {
      type: "signal.transition";
      mint: string;
      rowVersion: number;
      from: ScannerSignalV2;
      to: ScannerSignalV2;
    });

export type RuntimePhaseV2 =
  | "ARM_REQUIRED"
  | "READY"
  | "ACTIVE"
  | "BUDGET_REACHED";

export interface RuntimeCapabilityV2 {
  allowed: boolean;
  blocker: string | null;
}

export interface RuntimeSummaryV2 {
  phase: RuntimePhaseV2;
  paperOnly: true;
  tradingDisabled: true;
  liveExecutionDisabled: true;
  discovery: "offline" | "starting" | "active" | "stopped";
  acknowledged: boolean;
  canArm: RuntimeCapabilityV2;
  canStart: RuntimeCapabilityV2;
  canStop: RuntimeCapabilityV2;
  spendSol: UiField<number>;
  capSol: UiField<number>;
  remainingSol: UiField<number>;
  walletBalanceSol: UiField<number>;
  trackedMintCount: UiField<number>;
  maximumConcurrentMints: number;
  maximumEvents: number;
  durationSeconds: number | null;
  warning: string | null;
  processSessionId: string;
  updatedAt: string;
}

export const UiAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "stale",
  "unproven"
]);

export const UiFieldSchema = z.object({
  value: z.unknown().nullable(),
  availability: UiAvailabilitySchema,
  source: z.enum([
    "token_trade",
    "curve",
    "enrichment",
    "risk",
    "portfolio",
    "runtime",
    "unknown"
  ]),
  observedAt: z.string().datetime().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  reason: z.string().nullable().optional()
});

export const ScannerSnapshotV2Schema = z.custom<ScannerSnapshotV2>(
  (value) => {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<ScannerSnapshotV2>;
    return (
      candidate.schemaVersion === "scanner-snapshot-v2" &&
      typeof candidate.snapshotVersion === "number" &&
      typeof candidate.generatedAt === "string" &&
      Array.isArray(candidate.rows) &&
      candidate.rows.every(
        (row) =>
          typeof row?.mint === "string" &&
          typeof row.rowVersion === "number" &&
          typeof row.order === "number" &&
          typeof row.readiness?.validSampleCount === "number" &&
          typeof row.decision?.signal === "string"
      )
    );
  },
  { message: "Invalid scanner-snapshot-v2 contract" }
);
