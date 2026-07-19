import type { MomentumScannerRow } from "@axi/shared";
import { formatSol, formatUsd } from "./formatters";

export type ScannerValueDisplay = {
  label: string;
  primary: string;
  secondary: string;
  source: "dex" | "curve" | "pool" | "payload" | "unavailable";
};

export type FeedCoverageSummary = {
  complete: boolean;
  coveragePct: number;
  foldedEventCount: number;
  rawEventCount: number;
  rowCount: number;
  uniqueMintCount: number;
};

type MarketCapDisplayRow = Pick<
  MomentumScannerRow,
  "curve" | "fdvUsd" | "marketCapSol" | "marketCapUsd"
>;

type LiquidityDisplayRow = Pick<
  MomentumScannerRow,
  "curve" | "liquidityUsd" | "poolAddress" | "raydiumPool"
>;

export function getFeedCoverageSummary(input: {
  liveTokenCount?: number | null;
  newTokenEventCount?: number | null;
  rowCount: number;
}): FeedCoverageSummary {
  const rowCount = Math.max(0, Math.trunc(input.rowCount));
  const uniqueMintCount = Math.max(
    rowCount,
    Math.trunc(input.liveTokenCount ?? rowCount)
  );
  const rawEventCount = Math.max(
    uniqueMintCount,
    Math.trunc(input.newTokenEventCount ?? uniqueMintCount)
  );

  return {
    complete: rowCount >= uniqueMintCount,
    coveragePct:
      uniqueMintCount === 0
        ? 100
        : Math.min(100, (rowCount / uniqueMintCount) * 100),
    foldedEventCount: Math.max(0, rawEventCount - uniqueMintCount),
    rawEventCount,
    rowCount,
    uniqueMintCount
  };
}

export function sanitizeDashboardImageUri(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function getTokenInitials(
  symbol: string | null | undefined,
  displayName: string | null | undefined
): string {
  const cleaned = (symbol || displayName || "?")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 2)
    .toUpperCase();

  return cleaned || "?";
}

export function getMarketCapDisplay(
  row: MarketCapDisplayRow
): ScannerValueDisplay {
  if (row.marketCapUsd !== null) {
    return {
      label: "market cap",
      primary: formatUsd(row.marketCapUsd),
      secondary: row.fdvUsd !== null ? `FDV ${formatUsd(row.fdvUsd)}` : "FDV —",
      source: "dex"
    };
  }

  if (row.marketCapSol !== null) {
    return {
      label: "market cap",
      primary: formatSol(row.marketCapSol),
      secondary: row.curve.curveMarketCapSol !== null ? "payload SOL" : "SOL",
      source: "payload"
    };
  }

  return {
    label: "market cap",
    primary: "—",
    secondary: "unavailable",
    source: "unavailable"
  };
}

export function getLiquidityDisplay(
  row: LiquidityDisplayRow
): ScannerValueDisplay {
  if (row.liquidityUsd !== null) {
    return {
      label: row.poolAddress || row.raydiumPool ? "pool" : "dex",
      primary: formatUsd(row.liquidityUsd),
      secondary: row.poolAddress ?? row.raydiumPool ?? "DEX liquidity",
      source: row.poolAddress || row.raydiumPool ? "pool" : "dex"
    };
  }

  if (row.curve.curveLiquiditySol !== null) {
    return {
      label: "curve",
      primary: formatSol(row.curve.curveLiquiditySol),
      secondary: row.curve.bondingCurve ?? "bonding curve",
      source: "curve"
    };
  }

  return {
    label: "unavailable",
    primary: "—",
    secondary: "liquidity unavailable",
    source: "unavailable"
  };
}
