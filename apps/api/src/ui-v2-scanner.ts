import { createHash } from "node:crypto";
import type {
  MomentumScannerRow,
  MomentumScannerSummaryV2,
  ScannerSnapshotV2,
  ScannerStreamMessageV2,
  UiAvailability,
  UiField,
  UiFieldSource
} from "@axi/shared";

export type ScannerSortV2 =
  | "newest"
  | "score"
  | "strength"
  | "volume"
  | "buyers"
  | "priceChange"
  | "risk"
  | "pnl";

export type ScannerFilterV2 =
  | "discovery"
  | "tracking"
  | "d1_ready"
  | "d2_ready"
  | "hot"
  | "ripping"
  | "positions"
  | "rejected"
  | "stale";

export type ScannerQueryV2 = {
  limit: number;
  cursor: string | null;
  sort: ScannerSortV2;
  filters: ScannerFilterV2[];
  activeOnly: boolean;
  includeProtected: boolean;
  query: string;
};

/**
 * The deliberately small record used to select a scanner page. Rich card
 * projection happens only after this record has been filtered, sorted, and
 * paginated.
 */
export type ScannerCandidateV2 = {
  mint: string;
  name: string | null;
  symbol: string | null;
  displayName: string;
  firstSeenAt: string;
  latestEventAt: string;
  trackingState: string;
  tradeSampleCount: number;
  strengthLabel: string | null;
  score: number;
  strengthScore: number | null;
  volume10sSol: number | null;
  uniqueBuyers10s: number | null;
  priceChange10sPct: number | null;
  riskLevel: string;
  unrealizedPnlPct: number | null;
  hasPosition: boolean;
  hardReject: boolean;
  stale: boolean;
};

type VersionEntry = { fingerprint: string; rowVersion: number };

export type ScannerProjectionMetricsV2 = {
  projectionCount: number;
  lastProjectionMs: number;
};

const ACTIVE_WINDOW_MS = 5 * 60_000;

function field<T>(options: {
  value: T | null;
  source: UiFieldSource;
  observedAt: string | null;
  confidence?: number | null;
  fieldName?: string;
  unavailableFields?: readonly string[];
  staleFields?: readonly string[];
  unproven?: boolean;
  reason?: string | null;
}): UiField<T> {
  const unavailable =
    options.value === null ||
    (options.fieldName
      ? options.unavailableFields?.includes(options.fieldName)
      : false);
  const availability: UiAvailability = unavailable
    ? "unavailable"
    : options.unproven
      ? "unproven"
      : options.fieldName && options.staleFields?.includes(options.fieldName)
        ? "stale"
        : "available";
  return {
    value: unavailable ? null : options.value,
    availability,
    source: options.source,
    observedAt: options.observedAt,
    confidence: options.confidence ?? null,
    reason:
      options.reason ??
      (unavailable && options.fieldName
        ? `${options.fieldName} unavailable`
        : null)
  };
}

function marketSource(row: MomentumScannerRow): UiFieldSource {
  if (row.priceSource?.toLowerCase().includes("curve")) return "curve";
  return row.realTradeEventCount > 0 ? "token_trade" : "unknown";
}

function safeImageUri(uri: string | null): string | null {
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    return ["https:", "http:", "ipfs:"].includes(parsed.protocol) ? uri : null;
  } catch {
    return null;
  }
}

function operatorEvidenceLabel(value: string | null): string | null {
  if (!value || !/^[A-Z0-9_]+$/u.test(value)) return value;
  const words = value.toLowerCase().replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function averageConfidence(row: MomentumScannerRow): number | null {
  const values = [
    row.derivativeStrength.price.confidence.overall,
    row.derivativeStrength.volume.confidence.overall,
    row.derivativeStrength.buyers.confidence.overall
  ].filter((value) => Number.isFinite(value));
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export function projectMomentumScannerSummaryV2(
  row: MomentumScannerRow,
  order: number,
  rowVersion: number
): MomentumScannerSummaryV2 {
  const observedAt = row.lastUpdatedAt;
  const source = marketSource(row);
  const samples = row.data.validTradeSampleCount;
  const d1Ready = samples >= 2;
  const d2Ready = samples >= 3;
  const confidence = averageConfidence(row);
  const unavailable = row.unavailableFields;
  const stale = row.staleFields;
  const typed = <T>(
    value: T | null,
    fieldName: string,
    fieldSource: UiFieldSource
  ) =>
    field({
      value,
      source: fieldSource,
      observedAt,
      confidence,
      fieldName,
      unavailableFields: unavailable,
      staleFields: stale
    });

  return {
    mint: row.mint,
    rowVersion,
    order,
    firstSeenAt: row.launchedAt ?? row.latestEventAt ?? observedAt ?? "",
    latestEventAt: row.latestEventAt,
    identity: {
      displayName: row.displayName,
      symbol: row.symbol,
      shortMint: row.shortMint,
      imageUri: field({
        value: safeImageUri(row.imageUri),
        source: "enrichment",
        observedAt,
        confidence: row.imageUri ? 1 : null,
        reason: row.imageUri ? null : "No safe metadata image"
      }),
      ageSeconds: typed(row.ageSeconds, "ageSeconds", "unknown"),
      migrationStatus: row.migrationStatus
    },
    readiness: {
      trackingState: row.trackingState,
      state: d2Ready
        ? "d2_ready"
        : d1Ready
          ? "d1_ready"
          : samples === 1
            ? "observed"
            : "discovery",
      validSampleCount: samples,
      d1Ready,
      d2Ready,
      freshnessMs: typed(
        row.marketDataFreshnessMs,
        "marketDataFreshnessMs",
        source
      ),
      isProtected: row.data.isProtected
    },
    market: {
      priceSol: typed(row.priceSol, "priceSol", source),
      priceUsd: typed(row.priceUsd, "priceUsd", "enrichment"),
      marketCapSol: typed(row.marketCapSol, "marketCapSol", source),
      marketCapUsd: typed(row.marketCapUsd, "marketCapUsd", "enrichment"),
      liquiditySol: typed(row.curve.curveLiquiditySol, "liquiditySol", "curve"),
      liquidityUsd: typed(row.liquidityUsd, "liquidityUsd", "enrichment"),
      liquidityKind:
        row.curve.curveLiquiditySol !== null
          ? "curve"
          : row.liquidityUsd !== null
            ? "dex"
            : "unavailable"
    },
    flow: {
      volume10sSol: typed(row.volume10sSol, "volume10sSol", "token_trade"),
      transactionCount10s: typed(
        row.tradeCount10s,
        "tradeCount10s",
        "token_trade"
      ),
      uniqueBuyers10s: typed(
        row.uniqueBuyers10s,
        "uniqueBuyers10s",
        "token_trade"
      ),
      buyPressure: typed(row.netBuyPressure, "netBuyPressure", "token_trade")
    },
    momentum: {
      priceD1: typed(
        row.derivatives.dPricePctPerSec,
        "dPricePctPerSec",
        "token_trade"
      ),
      priceD2: typed(
        row.derivatives.d2PricePctPerSec2,
        "d2PricePctPerSec2",
        "token_trade"
      ),
      volumeD1: typed(
        row.derivatives.dVol10sSolPerSec,
        "dVol10sSolPerSec",
        "token_trade"
      ),
      volumeD2: typed(
        row.derivatives.d2VolSolPerSec2,
        "d2VolSolPerSec2",
        "token_trade"
      ),
      normalizedStrength: field({
        value: d1Ready
          ? row.derivativeStrength.combinedDerivativeScore.totalScore
          : null,
        source: "token_trade",
        observedAt,
        confidence,
        reason: d1Ready ? null : "Two valid samples required"
      }),
      confidence: field({
        value: confidence,
        source: "token_trade",
        observedAt,
        confidence
      })
    },
    decision: {
      signal: row.signalDisplay.label,
      score: row.signalDisplay.score,
      topDriver: operatorEvidenceLabel(row.signalDisplay.topDriver),
      topBlocker: operatorEvidenceLabel(row.signalDisplay.topBlocker),
      riskLevel: row.riskLevel,
      hardReject: row.hardReject,
      referencePolicy: true
    },
    position: {
      status: row.paperPositionStatus,
      unrealizedPnlPct: typed(
        row.unrealizedPnlPct,
        "unrealizedPnlPct",
        "portfolio"
      ),
      unrealizedPnlSol: typed(
        row.unrealizedPnlSol,
        "unrealizedPnlSol",
        "portfolio"
      ),
      exitSignal: row.latestPaperExitSignal?.signalId ?? null
    },
    sparkline: {
      values: row.sparkline.points.slice(-20).map((point) => point.priceSol),
      source:
        row.sparkline.source === "trade_samples"
          ? "token_trade"
          : row.sparkline.source === "curve_marks"
            ? "curve"
            : "unknown"
    }
  };
}

function rowTimestamp(row: MomentumScannerRow): number {
  const value = row.latestEventAt ?? row.launchedAt ?? row.lastUpdatedAt;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function isActiveScannerRowV2(
  row: MomentumScannerRow,
  nowMs: number
): boolean {
  return (
    nowMs - rowTimestamp(row) <= ACTIVE_WINDOW_MS ||
    row.signalDisplay.label === "HOT" ||
    row.signalDisplay.label === "RIPPING" ||
    row.hasPaperPosition
  );
}

function matchesFilters(row: MomentumScannerRow, filters: ScannerFilterV2[]) {
  if (filters.length === 0) return true;
  return filters.some((filterName) => {
    switch (filterName) {
      case "discovery":
        return row.data.validTradeSampleCount === 0;
      case "tracking":
        return row.trackingState.includes("track");
      case "d1_ready":
        return row.data.validTradeSampleCount >= 2;
      case "d2_ready":
        return row.data.validTradeSampleCount >= 3;
      case "hot":
        return row.signalDisplay.label === "HOT";
      case "ripping":
        return row.signalDisplay.label === "RIPPING";
      case "positions":
        return row.hasPaperPosition;
      case "rejected":
        return row.hardReject;
      case "stale":
        return row.staleFields.length > 0;
    }
  });
}

function riskOrder(row: MomentumScannerRow): number {
  const normalized = row.riskLevel.toLowerCase();
  return normalized === "critical"
    ? 4
    : normalized === "high"
      ? 3
      : normalized === "medium"
        ? 2
        : normalized === "low"
          ? 1
          : 0;
}

function sortRows(rows: MomentumScannerRow[], sort: ScannerSortV2) {
  return rows.sort((left, right) => {
    const protectedOrder =
      Number(right.data.isProtected) - Number(left.data.isProtected);
    if (protectedOrder !== 0) return protectedOrder;
    switch (sort) {
      case "score":
        return right.signalDisplay.score - left.signalDisplay.score;
      case "strength":
        return (
          right.derivativeStrength.combinedDerivativeScore.totalScore -
          left.derivativeStrength.combinedDerivativeScore.totalScore
        );
      case "volume":
        return (right.volume10sSol ?? -1) - (left.volume10sSol ?? -1);
      case "buyers":
        return (right.uniqueBuyers10s ?? -1) - (left.uniqueBuyers10s ?? -1);
      case "priceChange":
        return (
          (right.sparkline.priceChangePct ?? -Infinity) -
          (left.sparkline.priceChangePct ?? -Infinity)
        );
      case "risk":
        return riskOrder(left) - riskOrder(right);
      case "pnl":
        return (
          (right.unrealizedPnlPct ?? -Infinity) -
          (left.unrealizedPnlPct ?? -Infinity)
        );
      case "newest":
        return rowTimestamp(right) - rowTimestamp(left);
    }
  });
}

function encodeCursor(offset: number): string {
  return Buffer.from(`scanner-v2:${offset}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^scanner-v2:(\d+)$/.exec(value);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

export function selectScannerCandidatesV2<T extends ScannerCandidateV2>(
  candidates: T[],
  query: ScannerQueryV2,
  now = new Date()
): {
  page: T[];
  totalActive: number;
  totalHistory: number;
  nextCursor: string | null;
  offset: number;
} {
  const nowMs = now.getTime();
  const isProtected = (candidate: ScannerCandidateV2) =>
    candidate.trackingState === "tracking" ||
    candidate.hasPosition ||
    candidate.strengthLabel === "hot" ||
    candidate.strengthLabel === "ripping";
  const isActive = (candidate: ScannerCandidateV2) => {
    const timestamp = Date.parse(
      candidate.latestEventAt ?? candidate.firstSeenAt
    );
    return (
      nowMs - (Number.isFinite(timestamp) ? timestamp : 0) <=
        ACTIVE_WINDOW_MS || isProtected(candidate)
    );
  };
  const active = candidates.filter(isActive);
  const source = query.activeOnly ? active : candidates;
  const lowered = query.query.trim().toLowerCase();
  const eligible = source.filter((candidate) => {
    if (!query.includeProtected && isProtected(candidate)) return false;
    if (
      lowered &&
      ![
        candidate.name,
        candidate.symbol,
        candidate.displayName,
        candidate.mint
      ].some((value) => value?.toLowerCase().includes(lowered))
    ) {
      return false;
    }
    if (query.filters.length === 0) return true;
    const samples = candidate.tradeSampleCount;
    return query.filters.some((filterName) => {
      switch (filterName) {
        case "discovery":
          return samples === 0;
        case "tracking":
          return candidate.trackingState.includes("track");
        case "d1_ready":
          return samples >= 2;
        case "d2_ready":
          return samples >= 3;
        case "hot":
          return candidate.strengthLabel === "hot";
        case "ripping":
          return candidate.strengthLabel === "ripping";
        case "positions":
          return candidate.hasPosition;
        case "rejected":
          return candidate.hardReject;
        case "stale":
          return candidate.stale;
      }
    });
  });
  eligible.sort((left, right) => {
    const protectedOrder =
      Number(isProtected(right)) - Number(isProtected(left));
    if (protectedOrder !== 0) return protectedOrder;
    switch (query.sort) {
      case "score":
        return right.score - left.score;
      case "strength":
        return (right.strengthScore ?? -1) - (left.strengthScore ?? -1);
      case "volume":
        return (right.volume10sSol ?? -1) - (left.volume10sSol ?? -1);
      case "buyers":
        return (right.uniqueBuyers10s ?? -1) - (left.uniqueBuyers10s ?? -1);
      case "priceChange":
        return (
          (right.priceChange10sPct ?? -Infinity) -
          (left.priceChange10sPct ?? -Infinity)
        );
      case "risk":
        return riskCandidateOrder(left) - riskCandidateOrder(right);
      case "pnl":
        return (
          (right.unrealizedPnlPct ?? -Infinity) -
          (left.unrealizedPnlPct ?? -Infinity)
        );
      case "newest":
        return Date.parse(right.latestEventAt) - Date.parse(left.latestEventAt);
    }
  });
  const offset = Math.min(decodeCursor(query.cursor), eligible.length);
  const page = eligible.slice(offset, offset + query.limit);
  const nextOffset = offset + page.length;
  return {
    page,
    totalActive: active.length,
    totalHistory: candidates.length - active.length,
    nextCursor: nextOffset < eligible.length ? encodeCursor(nextOffset) : null,
    offset
  };
}

function riskCandidateOrder(candidate: ScannerCandidateV2): number {
  const normalized = candidate.riskLevel.toLowerCase();
  return normalized === "critical"
    ? 4
    : normalized === "high"
      ? 3
      : normalized === "medium"
        ? 2
        : normalized === "low"
          ? 1
          : 0;
}

export class ScannerProjectionV2 {
  private readonly versions = new Map<string, VersionEntry>();
  private sequence = 0;
  readonly metrics: ScannerProjectionMetricsV2 = {
    projectionCount: 0,
    lastProjectionMs: 0
  };

  constructor(private readonly sessionId: string | null) {}

  get version(): number {
    return this.sequence;
  }

  snapshot(
    richRows: MomentumScannerRow[],
    query: ScannerQueryV2,
    now = new Date()
  ): ScannerSnapshotV2 {
    const started = performance.now();
    const nowMs = now.getTime();
    const activeRows = richRows.filter((row) =>
      isActiveScannerRowV2(row, nowMs)
    );
    const totalHistory = richRows.length - activeRows.length;
    const sourceRows = query.activeOnly ? activeRows : richRows;
    const lowered = query.query.trim().toLowerCase();
    const eligible = sourceRows.filter(
      (row) =>
        (query.includeProtected || !row.data.isProtected) &&
        matchesFilters(row, query.filters) &&
        (!lowered ||
          [row.name, row.symbol, row.displayName, row.mint].some((value) =>
            value?.toLowerCase().includes(lowered)
          ))
    );
    sortRows(eligible, query.sort);
    const offset = Math.min(decodeCursor(query.cursor), eligible.length);
    const page = eligible.slice(offset, offset + query.limit);
    const rows = page.map((row, index) => this.project(row, offset + index));
    this.metrics.lastProjectionMs = performance.now() - started;
    const nextOffset = offset + rows.length;
    return {
      schemaVersion: "scanner-snapshot-v2",
      snapshotVersion: this.sequence,
      generatedAt: now.toISOString(),
      sessionId: this.sessionId,
      totalActive: activeRows.length,
      totalHistory,
      nextCursor:
        nextOffset < eligible.length ? encodeCursor(nextOffset) : null,
      rows
    };
  }

  snapshotPage(
    richRows: MomentumScannerRow[],
    page: {
      totalActive: number;
      totalHistory: number;
      nextCursor: string | null;
      offset: number;
    },
    now = new Date()
  ): ScannerSnapshotV2 {
    const started = performance.now();
    const rows = richRows.map((row, index) =>
      this.project(row, page.offset + index)
    );
    this.metrics.lastProjectionMs = performance.now() - started;
    return {
      schemaVersion: "scanner-snapshot-v2",
      snapshotVersion: this.sequence,
      generatedAt: now.toISOString(),
      sessionId: this.sessionId,
      totalActive: page.totalActive,
      totalHistory: page.totalHistory,
      nextCursor: page.nextCursor,
      rows
    };
  }

  upsert(
    row: MomentumScannerRow,
    generatedAt = new Date().toISOString()
  ): ScannerStreamMessageV2 | null {
    const previousVersion = this.sequence;
    const summary = this.project(row, 0);
    if (previousVersion === this.sequence) return null;
    return {
      schemaVersion: "scanner-stream-v2",
      type: "scanner.upsert",
      sequence: this.sequence,
      generatedAt,
      row: summary
    };
  }

  snapshotMessage(
    richRows: MomentumScannerRow[],
    now = new Date()
  ): ScannerStreamMessageV2 {
    const snapshot = this.snapshot(
      richRows,
      {
        limit: 100,
        cursor: null,
        sort: "newest",
        filters: [],
        activeOnly: true,
        includeProtected: true,
        query: ""
      },
      now
    );
    if (this.sequence === 0) this.sequence = 1;
    snapshot.snapshotVersion = this.sequence;
    return {
      schemaVersion: "scanner-stream-v2",
      type: "scanner.snapshot",
      sequence: this.sequence,
      generatedAt: snapshot.generatedAt,
      snapshot
    };
  }

  snapshotEnvelope(snapshot: ScannerSnapshotV2): ScannerStreamMessageV2 {
    if (this.sequence === 0) this.sequence = 1;
    snapshot.snapshotVersion = this.sequence;
    return {
      schemaVersion: "scanner-stream-v2",
      type: "scanner.snapshot",
      sequence: this.sequence,
      generatedAt: snapshot.generatedAt,
      snapshot
    };
  }

  signalTransition(options: {
    mint: string;
    rowVersion: number;
    from: MomentumScannerSummaryV2["decision"]["signal"];
    to: MomentumScannerSummaryV2["decision"]["signal"];
    generatedAt: string;
  }): ScannerStreamMessageV2 {
    this.sequence += 1;
    return {
      schemaVersion: "scanner-stream-v2",
      type: "signal.transition",
      sequence: this.sequence,
      generatedAt: options.generatedAt,
      mint: options.mint,
      rowVersion: options.rowVersion,
      from: options.from,
      to: options.to
    };
  }

  private project(
    row: MomentumScannerRow,
    order: number
  ): MomentumScannerSummaryV2 {
    const candidate = projectMomentumScannerSummaryV2(row, order, 0);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ ...candidate, order: 0, rowVersion: 0 }))
      .digest("base64url");
    const previous = this.versions.get(row.mint);
    const rowVersion = previous
      ? previous.fingerprint === fingerprint
        ? previous.rowVersion
        : previous.rowVersion + 1
      : 1;
    if (!previous || previous.fingerprint !== fingerprint) {
      this.sequence += 1;
      this.versions.set(row.mint, { fingerprint, rowVersion });
    }
    this.metrics.projectionCount += 1;
    return { ...candidate, rowVersion };
  }
}
