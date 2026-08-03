import type { UiField } from "@axi/shared";
import { isFieldRenderable } from "../contracts/ui-field";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2
});

const significantNumber = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 6
});

export function formatNumberV2(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Object.is(value, -0) || value === 0) return "0";
  if (Math.abs(value) >= 1_000) return compactNumber.format(value);
  if (Math.abs(value) < 0.000001) {
    return value.toExponential(2).replace("e+", "e");
  }
  return significantNumber.format(value);
}

export function formatSolV2(value: number | null): string {
  const formatted = formatNumberV2(value);
  return formatted === "—" ? formatted : `${formatted} SOL`;
}

export function formatPercentV2(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${formatNumberV2(value)}%`;
}

export function formatUiFieldV2<T>(
  field: UiField<T>,
  formatter: (value: T) => string
): string {
  if (!isFieldRenderable(field)) return "—";
  const value = formatter(field.value);
  if (field.availability === "stale") return `${value} · stale`;
  if (field.availability === "unproven") return `${value} · unproven`;
  return value;
}
