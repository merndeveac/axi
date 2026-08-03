import type { MomentumScannerSummaryV2 } from "@axi/shared";

export type ScannerFilter =
  | "all"
  | "discovery"
  | "tracking"
  | "d1_ready"
  | "d2_ready"
  | "hot"
  | "ripping"
  | "positions"
  | "rejected"
  | "stale";

export function matchesScannerFilter(
  row: MomentumScannerSummaryV2,
  filter: ScannerFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "discovery":
      return row.readiness.validSampleCount === 0;
    case "tracking":
      return row.readiness.trackingState.includes("track");
    case "d1_ready":
      return row.readiness.d1Ready;
    case "d2_ready":
      return row.readiness.d2Ready;
    case "hot":
      return row.decision.signal === "HOT";
    case "ripping":
      return row.decision.signal === "RIPPING";
    case "positions":
      return row.position.status !== null;
    case "rejected":
      return row.decision.hardReject;
    case "stale":
      return (
        row.readiness.freshnessMs.availability === "stale" ||
        row.market.priceSol.availability === "stale"
      );
  }
}

export function matchesScannerSearch(
  row: MomentumScannerSummaryV2,
  search: string
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    row.identity.displayName,
    row.identity.symbol,
    row.identity.shortMint,
    row.mint
  ].some((value) => value?.toLowerCase().includes(query));
}
