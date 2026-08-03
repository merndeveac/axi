import type { MomentumScannerSummaryV2 } from "@axi/shared";
import {
  useVirtualizer,
  type Rect,
  type Virtualizer
} from "@tanstack/react-virtual";
import { useRef, type KeyboardEvent } from "react";
import { EmptyState } from "../../components/primitives/States";
import { ScannerCard } from "./ScannerCard";
import type { ScannerDensity } from "./ScannerToolbar";

const COMPACT_ROW_SIZE = 86;
const COMFORTABLE_ROW_SIZE = 102;

function observeScannerRect(
  instance: Virtualizer<HTMLDivElement, Element>,
  callback: (rect: Rect) => void
) {
  const element = instance.scrollElement;
  if (!element) return;
  const update = () => {
    const rect = element.getBoundingClientRect();
    callback({
      width: rect.width || 1280,
      height: rect.height || 560
    });
  };
  update();
  const observer =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  observer?.observe(element);
  window.addEventListener("resize", update);
  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", update);
  };
}

export function ScannerVirtualList({
  rows,
  selectedMint,
  onSelect,
  density
}: {
  rows: MomentumScannerSummaryV2[];
  selectedMint: string | null;
  onSelect: (mint: string) => void;
  density: ScannerDensity;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowSize = density === "compact" ? COMPACT_ROW_SIZE : COMFORTABLE_ROW_SIZE;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowSize,
    observeElementRect: observeScannerRect,
    overscan: 4,
    initialRect: { width: 1280, height: 560 }
  });

  function selectAt(index: number) {
    const bounded = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[bounded];
    if (!row) return;
    onSelect(row.mint);
    virtualizer.scrollToIndex(bounded, { align: "auto" });
    requestAnimationFrame(() => {
      parentRef.current
        ?.querySelector<HTMLButtonElement>(`[data-mint="${CSS.escape(row.mint)}"]`)
        ?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(
      0,
      rows.findIndex((row) => row.mint === selectedMint)
    );
    if (event.key === "Home") selectAt(0);
    else if (event.key === "End") selectAt(rows.length - 1);
    else if (event.key === "ArrowDown") selectAt(current + 1);
    else selectAt(current - 1);
  }

  if (rows.length === 0) {
    return <EmptyState title="No scanner rows match" detail="Clear the filter or switch back to the active scanner." />;
  }

  return (
    <div
      ref={parentRef}
      className="axi-v2-scanner-list"
      role="listbox"
      aria-label="Momentum scanner results"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      data-density={density}
    >
      <div className="axi-v2-scanner-list__canvas" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <ScannerCard
              key={row.mint}
              row={row}
              selected={selectedMint === row.mint}
              onSelect={onSelect}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
