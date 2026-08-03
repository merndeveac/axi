export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="axi-v2-sparkline axi-v2-sparkline--empty">—</span>;
  }
  const width = 58;
  const height = 20;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - minimum) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = (values.at(-1) ?? 0) >= (values[0] ?? 0);
  return (
    <svg
      className={`axi-v2-sparkline ${rising ? "axi-v2-sparkline--up" : "axi-v2-sparkline--down"}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={rising ? "Price trend rising" : "Price trend falling"}
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
