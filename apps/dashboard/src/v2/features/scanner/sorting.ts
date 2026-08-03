import type { MomentumScannerSummaryV2 } from "@axi/shared";

export type ScannerSort =
  | "newest"
  | "score"
  | "strength"
  | "volume"
  | "buyers"
  | "priceChange"
  | "risk"
  | "pnl";

function numeric(value: number | null, fallback = -Infinity): number {
  return value === null || !Number.isFinite(value) ? fallback : value;
}

function riskRank(value: string): number {
  const normalized = value.toLowerCase();
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

export function sortScannerRows(
  rows: readonly MomentumScannerSummaryV2[],
  sort: ScannerSort
): MomentumScannerSummaryV2[] {
  return [...rows].sort((left, right) => {
    switch (sort) {
      case "score":
        return right.decision.score - left.decision.score;
      case "strength":
        return (
          numeric(right.momentum.normalizedStrength.value) -
          numeric(left.momentum.normalizedStrength.value)
        );
      case "volume":
        return (
          numeric(right.flow.volume10sSol.value) -
          numeric(left.flow.volume10sSol.value)
        );
      case "buyers":
        return (
          numeric(right.flow.uniqueBuyers10s.value) -
          numeric(left.flow.uniqueBuyers10s.value)
        );
      case "priceChange":
        return (
          numeric(right.momentum.priceD1.value) -
          numeric(left.momentum.priceD1.value)
        );
      case "risk":
        return riskRank(left.decision.riskLevel) - riskRank(right.decision.riskLevel);
      case "pnl":
        return (
          numeric(right.position.unrealizedPnlPct.value) -
          numeric(left.position.unrealizedPnlPct.value)
        );
      case "newest":
        return (
          Date.parse(right.latestEventAt ?? right.firstSeenAt) -
          Date.parse(left.latestEventAt ?? left.firstSeenAt)
        );
    }
  });
}
