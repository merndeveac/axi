import { Badge } from "../../components/primitives/Badge";

export function ScannerSummary({
  visible,
  total,
  streamState,
  stale
}: {
  visible: number;
  total: number;
  streamState: "live" | "reconciling" | "offline";
  stale: boolean;
}) {
  return (
    <div className="axi-v2-scanner-summary" aria-live="polite">
      <span className="axi-v2-numeric">{visible} shown · {total} active</span>
      <span>Newest launch stays at the top; selected mint stays pinned.</span>
      <Badge tone={streamState === "live" ? "positive" : streamState === "reconciling" ? "warning" : "danger"}>
        {streamState}
      </Badge>
      {stale ? <Badge tone="warning">Cached rows · stale</Badge> : null}
    </div>
  );
}
