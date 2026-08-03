import type { MomentumScannerSummaryV2 } from "@axi/shared";
import { useDeferredValue, useMemo, useState } from "react";
import { Badge } from "../../components/primitives/Badge";
import { useRealtimeScanner } from "../../data/hooks/useRealtimeScanner";
import { goldenScannerRows } from "../../fixtures/golden-path";
import { matchesScannerFilter, matchesScannerSearch, type ScannerFilter } from "./filters";
import { ScannerSummary } from "./ScannerSummary";
import { ScannerToolbar, type ScannerDensity } from "./ScannerToolbar";
import { ScannerVirtualList } from "./ScannerVirtualList";
import { SelectedTokenPreview } from "./SelectedTokenPreview";
import { sortScannerRows, type ScannerSort } from "./sorting";
import { TokenResearchSurface } from "../research/TokenResearchSurface";
import "./scanner.css";

export function ScannerPage() {
  const [activeOnly, setActiveOnly] = useState(true);
  const [researchSelection, setResearchSelection] = useState<MomentumScannerSummaryV2 | null>(null);
  const scanner = useRealtimeScanner({ limit: 100, activeOnly });
  const rows = scanner.rows.length > 0 ? scanner.rows : [...goldenScannerRows];
  return (
    <>
      <ScannerPageView
        rows={rows}
        totalActive={scanner.data?.totalActive ?? rows.length}
        streamState={scanner.isSuccess ? (scanner.streamState.needsReconciliation ? "reconciling" : "live") : scanner.isError ? "offline" : "reconciling"}
        stale={scanner.isError && rows.length > 0}
        activeOnly={activeOnly}
        onActiveOnly={setActiveOnly}
        onSelectionChange={setResearchSelection}
      />
      <TokenResearchSurface summary={researchSelection} onClose={() => setResearchSelection(null)} />
    </>
  );
}

export function ScannerPageView({
  rows,
  totalActive = rows.length,
  streamState = "live",
  stale = false,
  activeOnly = true,
  onActiveOnly = () => undefined,
  onSelectionChange = () => undefined
}: {
  rows: MomentumScannerSummaryV2[];
  totalActive?: number;
  streamState?: "live" | "reconciling" | "offline";
  stale?: boolean;
  activeOnly?: boolean;
  onActiveOnly?: (active: boolean) => void;
  onSelectionChange?: (row: MomentumScannerSummaryV2 | null) => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState<ScannerSort>("newest");
  const [filter, setFilter] = useState<ScannerFilter>("all");
  const [density, setDensity] = useState<ScannerDensity>("compact");
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [pinnedSelection, setPinnedSelection] = useState<MomentumScannerSummaryV2 | null>(null);
  const visibleRows = useMemo(
    () =>
      sortScannerRows(
        rows.filter(
          (row) =>
            matchesScannerSearch(row, deferredSearch) &&
            matchesScannerFilter(row, filter)
        ),
        sort
      ),
    [deferredSearch, filter, rows, sort]
  );
  const selected =
    rows.find((row) => row.mint === selectedMint) ??
    (pinnedSelection?.mint === selectedMint ? pinnedSelection : null);

  function selectMint(mint: string) {
    setSelectedMint(mint);
    const row = rows.find((candidate) => candidate.mint === mint) ?? null;
    setPinnedSelection(row);
    onSelectionChange(row);
  }

  function closeSelection() {
    setSelectedMint(null);
    onSelectionChange(null);
  }

  return (
    <section className="axi-v2-page axi-v2-scanner-page" aria-labelledby="scanner-title">
      <header className="axi-v2-page__heading axi-v2-scanner-heading">
        <div>
          <h1 className="axi-v2-page-title" id="scanner-title">Momentum scanner</h1>
          <p className="axi-v2-page-description">Sample readiness, acceleration, risk, and paper decisions at launch speed.</p>
        </div>
        <Badge tone="warning">Reference policy</Badge>
      </header>
      <ScannerToolbar
        search={search}
        sort={sort}
        filter={filter}
        density={density}
        onSearch={setSearch}
        onSort={setSort}
        onFilter={setFilter}
        onDensity={setDensity}
        activeOnly={activeOnly}
        onActiveOnly={onActiveOnly}
      />
      <ScannerSummary visible={visibleRows.length} total={totalActive} streamState={streamState} stale={stale} />
      <div className="axi-v2-selected-slot">
        {selected ? <SelectedTokenPreview row={selected} onClose={closeSelection} /> : null}
      </div>
      <ScannerVirtualList rows={visibleRows} selectedMint={selectedMint} onSelect={selectMint} density={density} />
    </section>
  );
}
