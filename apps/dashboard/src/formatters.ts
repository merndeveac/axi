export type VelocityUnit = "usd" | "sol" | "pct" | "buyers" | "holders";

export function formatUnknown(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number" && !isFiniteNumber(value)) {
    return "—";
  }

  return String(value);
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  return Intl.NumberFormat("en", {
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 2,
    notation: Math.abs(value) >= 1000 ? "compact" : "standard"
  }).format(value);
}

export function formatSol(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  const digits = Math.abs(value) < 0.001 ? 6 : 4;
  return `${trimZeros(value.toFixed(digits))} SOL`;
}

export function formatUsd(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1000) {
    return `${sign}$${formatCompactNumber(abs)}`;
  }

  const digits = abs > 0 && abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
  return `${sign}$${trimZeros(abs.toFixed(digits))}`;
}

export function formatPct(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  return `${formatSigned(value, 2)}%`;
}

export function formatVelocity(
  value: number | null | undefined,
  unit: VelocityUnit
): string {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  if (unit === "usd") {
    return `${formatSignedUsd(value)}/s`;
  }

  if (unit === "sol") {
    return `${formatSigned(value, 4)} SOL/s`;
  }

  if (unit === "pct") {
    return `${formatSigned(value, 2)}%/s`;
  }

  return `${formatSigned(value, 2)} ${unit}/s`;
}

export function formatAcceleration(
  value: number | null | undefined,
  unit: VelocityUnit
): string {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  if (unit === "usd") {
    return `${formatSignedUsd(value)}/s²`;
  }

  if (unit === "sol") {
    return `${formatSigned(value, 4)} SOL/s²`;
  }

  if (unit === "pct") {
    return `${formatSigned(value, 2)}%/s²`;
  }

  return `${formatSigned(value, 2)} ${unit}/s²`;
}

export function formatAge(seconds: number | null | undefined): string {
  if (!isFiniteNumber(seconds)) {
    return "—";
  }

  if (seconds < 60) {
    return `${Math.max(0, Math.round(seconds))}s`;
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  }

  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function formatTimeAgo(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return "—";
  }

  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  return `${formatAge((Date.now() - parsed) / 1000)} ago`;
}

export function formatTime(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return "—";
  }

  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  return new Date(parsed).toLocaleTimeString();
}

export function formatMintShort(mint: string | null | undefined): string {
  if (!mint) {
    return "—";
  }

  return mint.length <= 14 ? mint : `${mint.slice(0, 8)}...${mint.slice(-6)}`;
}

function formatSigned(value: number, digits: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${trimZeros(value.toFixed(digits))}`;
}

function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUsd(Math.abs(value))}`;
}

function trimZeros(value: string): string {
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
