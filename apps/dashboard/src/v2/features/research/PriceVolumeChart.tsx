import type { MomentumScannerRow, MomentumScannerSummaryV2 } from "@axi/shared";

export function PriceVolumeChart({
  summary,
  detail
}: {
  summary: MomentumScannerSummaryV2;
  detail: MomentumScannerRow | null;
}) {
  const values =
    detail?.sparkline.points.map((point) => point.priceSol) ??
    summary.sparkline.values;
  if (values.length < 2) {
    return <div className="axi-v2-research-chart axi-v2-research-chart--empty">Price history needs at least two legitimate samples.</div>;
  }
  const width = 600;
  const height = 120;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values.map((value, index) => `${((index / (values.length - 1)) * width).toFixed(1)},${(height - ((value - minimum) / range) * height).toFixed(1)}`).join(" ");
  return (
    <svg className="axi-v2-research-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Token price history">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
