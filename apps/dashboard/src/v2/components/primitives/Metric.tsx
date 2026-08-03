import type { ReactNode } from "react";

export function Metric({
  label,
  value,
  detail
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <span className="axi-v2-metric">
      <span className="axi-v2-metric__label">{label}</span>
      <span className="axi-v2-metric__value axi-v2-numeric">{value}</span>
      {detail ? <span className="axi-v2-metric__detail">{detail}</span> : null}
    </span>
  );
}
