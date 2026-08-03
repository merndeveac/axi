import type { ScannerSignalV2 } from "@axi/shared";
import { Badge } from "../../components/primitives/Badge";

export function SignalBadge({ signal }: { signal: ScannerSignalV2 }) {
  const tone =
    signal === "REJECT"
      ? "danger"
      : signal === "RIPPING" || signal === "HOT"
        ? "positive"
        : signal === "WATCH"
          ? "info"
          : "neutral";
  return <Badge tone={tone}>{signal}</Badge>;
}
