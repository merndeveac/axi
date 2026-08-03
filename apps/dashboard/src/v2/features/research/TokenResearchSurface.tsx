import type { MomentumScannerSummaryV2 } from "@axi/shared";
import { X } from "lucide-react";
import { useScannerDetail } from "../../data/hooks/useScannerDetail";
import { Drawer } from "../../components/primitives/Drawer";
import { IconButton } from "../../components/primitives/IconButton";
import { TokenResearchContent } from "./TokenResearchContent";
import { useMediaQuery } from "./useMediaQuery";

export function TokenResearchSurface({
  summary,
  onClose
}: {
  summary: MomentumScannerSummaryV2 | null;
  onClose: () => void;
}) {
  const wide = useMediaQuery("(min-width: 1600px)");
  const detail = useScannerDetail(summary?.mint ?? null, summary !== null);
  if (!summary) return null;
  const content = (
    <TokenResearchContent
      summary={summary}
      detail={detail.data ?? null}
      pending={detail.isPending}
      error={detail.error instanceof Error ? detail.error : null}
      onRetry={() => { void detail.refetch(); }}
    />
  );
  if (wide) {
    return (
      <aside className="axi-v2-research-pane" aria-label={`Research ${summary.identity.displayName}`}>
        <div className="axi-v2-research-pane__close"><IconButton label="Close token research" tone="quiet" onClick={onClose}><X size={17} /></IconButton></div>
        {content}
      </aside>
    );
  }
  return (
    <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} title={`Research · ${summary.identity.symbol ?? summary.identity.displayName}`}>
      {content}
    </Drawer>
  );
}
