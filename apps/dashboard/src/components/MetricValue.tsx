import type { ReactNode } from "react";

type MetricTone = "good" | "bad" | "warn" | "neutral";

type MetricValueProps = {
  detail?: ReactNode;
  label: string;
  tone?: MetricTone;
  value: ReactNode;
};

export function MetricValue({
  detail,
  label,
  tone = "neutral",
  value
}: MetricValueProps) {
  return (
    <div className={`metric-cell metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
