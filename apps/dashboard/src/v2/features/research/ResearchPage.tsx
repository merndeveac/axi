import type { MomentumScannerSummaryV2 } from "@axi/shared";
import { useEffect, useState } from "react";
import { EmptyState } from "../../components/primitives/States";
import { useRealtimeScanner } from "../../data/hooks/useRealtimeScanner";
import { SignalBadge } from "../scanner/SignalBadge";
import { TokenResearchContent } from "./TokenResearchContent";
import { useScannerDetail } from "../../data/hooks/useScannerDetail";
import "./research.css";

export function ResearchPage() {
  const scanner = useRealtimeScanner({ limit: 100 });
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedMint && scanner.rows[0]) setSelectedMint(scanner.rows[0].mint);
  }, [scanner.rows, selectedMint]);
  const summary = scanner.rows.find((row) => row.mint === selectedMint) ?? null;
  return <ResearchPageView rows={scanner.rows} selected={summary} onSelect={setSelectedMint} />;
}

export function ResearchPageView({
  rows,
  selected,
  onSelect
}: {
  rows: MomentumScannerSummaryV2[];
  selected: MomentumScannerSummaryV2 | null;
  onSelect: (mint: string) => void;
}) {
  const detail = useScannerDetail(selected?.mint ?? null, selected !== null);
  return (
    <section className="axi-v2-page axi-v2-workflow-page" aria-labelledby="research-title">
      <header className="axi-v2-page__heading"><div><h1 className="axi-v2-page-title" id="research-title">Token research</h1><p className="axi-v2-page-description">Compare current launches, inspect evidence, and keep technical codes collapsed.</p></div></header>
      {rows.length === 0 ? <EmptyState title="No token research yet" detail="New PumpPortal discoveries appear here without requiring paid trade data." /> : (
        <div className="axi-v2-research-layout">
          <nav className="axi-v2-research-shortlist" aria-label="Research shortlist">
            {rows.slice(0, 30).map((row) => <button key={row.mint} type="button" aria-current={row.mint === selected?.mint ? "true" : undefined} onClick={() => onSelect(row.mint)}><span><strong>{row.identity.symbol ?? row.identity.displayName}</strong><small>{row.identity.shortMint}</small></span><SignalBadge signal={row.decision.signal} /></button>)}
          </nav>
          <div className="axi-v2-research-detail">
            {selected ? <TokenResearchContent summary={selected} detail={detail.data ?? null} pending={detail.isPending} error={detail.error instanceof Error ? detail.error : null} onRetry={() => { void detail.refetch(); }} /> : null}
          </div>
        </div>
      )}
    </section>
  );
}
