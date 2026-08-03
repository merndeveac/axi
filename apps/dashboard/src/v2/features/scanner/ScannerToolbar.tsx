import { Search } from "lucide-react";
import type { ScannerFilter } from "./filters";
import type { ScannerSort } from "./sorting";

export type ScannerDensity = "compact" | "comfortable";

export function ScannerToolbar({
  search,
  sort,
  filter,
  density,
  onSearch,
  onSort,
  onFilter,
  onDensity,
  activeOnly,
  onActiveOnly
}: {
  search: string;
  sort: ScannerSort;
  filter: ScannerFilter;
  density: ScannerDensity;
  onSearch: (value: string) => void;
  onSort: (value: ScannerSort) => void;
  onFilter: (value: ScannerFilter) => void;
  onDensity: (value: ScannerDensity) => void;
  activeOnly: boolean;
  onActiveOnly: (active: boolean) => void;
}) {
  return (
    <div className="axi-v2-scanner-toolbar" aria-label="Scanner controls">
      <label className="axi-v2-scanner-search">
        <Search size={15} aria-hidden="true" />
        <span className="axi-v2-visually-hidden">Search scanner</span>
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search name, symbol, or mint"
        />
      </label>
      <label className="axi-v2-scanner-select">
        <span>Sort</span>
        <select value={sort} onChange={(event) => onSort(event.target.value as ScannerSort)}>
          <option value="newest">Newest</option>
          <option value="score">Score</option>
          <option value="strength">Derivative strength</option>
          <option value="volume">10s volume</option>
          <option value="buyers">Buyers</option>
          <option value="priceChange">Price change</option>
          <option value="risk">Risk</option>
          <option value="pnl">PnL</option>
        </select>
      </label>
      <label className="axi-v2-scanner-select">
        <span>Filter</span>
        <select value={filter} onChange={(event) => onFilter(event.target.value as ScannerFilter)}>
          <option value="all">All active</option>
          <option value="discovery">Discovery</option>
          <option value="tracking">Tracking</option>
          <option value="d1_ready">D1 ready</option>
          <option value="d2_ready">D2 ready</option>
          <option value="hot">HOT</option>
          <option value="ripping">RIPPING</option>
          <option value="positions">Positions</option>
          <option value="rejected">Rejected</option>
          <option value="stale">Stale</option>
        </select>
      </label>
      <div className="axi-v2-segmented" role="group" aria-label="Scanner density">
        <button type="button" aria-pressed={density === "compact"} onClick={() => onDensity("compact")}>Compact</button>
        <button type="button" aria-pressed={density === "comfortable"} onClick={() => onDensity("comfortable")}>Comfortable</button>
      </div>
      <button className="axi-v2-history-toggle" type="button" aria-pressed={!activeOnly} onClick={() => onActiveOnly(!activeOnly)}>
        {activeOnly ? "Session history" : "Active scanner"}
      </button>
    </div>
  );
}
