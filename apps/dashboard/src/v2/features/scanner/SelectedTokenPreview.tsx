import type { MomentumScannerSummaryV2 } from "@axi/shared";
import { X } from "lucide-react";
import { IconButton } from "../../components/primitives/IconButton";
import { formatSolV2 } from "../../lib/formatters";
import { SignalBadge } from "./SignalBadge";

export function SelectedTokenPreview({
  row,
  onClose
}: {
  row: MomentumScannerSummaryV2;
  onClose: () => void;
}) {
  return (
    <aside className="axi-v2-selected-preview" aria-label={`Selected token ${row.identity.displayName}`}>
      <div>
        <span className="axi-v2-label">Selected research</span>
        <strong>{row.identity.symbol ?? row.identity.displayName}</strong>
        <small>{row.identity.shortMint}</small>
      </div>
      <SignalBadge signal={row.decision.signal} />
      <span className="axi-v2-numeric">{formatSolV2(row.market.priceSol.value)}</span>
      <span>{row.decision.topDriver ?? "No proven driver"}</span>
      <IconButton label="Close selected token" tone="quiet" onClick={onClose}><X size={16} /></IconButton>
    </aside>
  );
}
