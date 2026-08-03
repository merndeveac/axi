import type { MomentumScannerSummaryV2 } from "@axi/shared";
import { useMemo } from "react";
import { Badge } from "../../components/primitives/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/primitives/States";
import { usePortfolioHistory } from "../../data/hooks/usePortfolioHistory";
import { usePortfolioSummary, type PaperPortfolioSnapshotV2 } from "../../data/hooks/usePortfolioSummary";
import { usePositions, type PaperPortfolioStatusV2, type PaperPositionV2 } from "../../data/hooks/usePositions";
import { useScannerSnapshot } from "../../data/hooks/useScannerSnapshot";
import { formatPercentV2, formatSolV2 } from "../../lib/formatters";
import { SignalBadge } from "../scanner/SignalBadge";
import "./positions.css";

export function PositionsPage() {
  const positions = usePositions();
  const portfolio = usePortfolioSummary();
  const scanner = useScannerSnapshot({ limit: 100 });
  const history = usePortfolioHistory();
  if (positions.isPending && !positions.data) return <LoadingState label="Loading paper positions" />;
  if (positions.isError && !positions.data) {
    return <ErrorState title="Paper positions unavailable" detail="Scanner and Runtime continue independently." onRetry={() => { void positions.refetch(); }} />;
  }
  return (
    <PositionsPageView
      positions={positions.data?.positions ?? []}
      status={positions.data?.status ?? null}
      snapshot={portfolio.data?.snapshot ?? null}
      scannerRows={scanner.data?.rows ?? []}
      orders={history.orders.data?.orders ?? []}
      fills={history.fills.data?.fills ?? []}
    />
  );
}

export function PositionsPageView({
  positions,
  status,
  snapshot,
  scannerRows,
  orders = [],
  fills = []
}: {
  positions: PaperPositionV2[];
  status: PaperPortfolioStatusV2 | null;
  snapshot: PaperPortfolioSnapshotV2 | null;
  scannerRows: MomentumScannerSummaryV2[];
  orders?: Array<{ id: string; side: string; mint: string; source: string; createdAt: string }>;
  fills?: Array<{ id: string; side: string; mint: string; priceSol: number; sizeSol: number; fillStatus: string; createdAt: string }>;
}) {
  const ordered = useMemo(
    () => [...positions].sort((left, right) => Number(right.status !== "closed") - Number(left.status !== "closed") || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [positions]
  );
  const scannerByMint = new Map(scannerRows.map((row) => [row.mint, row]));
  return (
    <section className="axi-v2-page axi-v2-workflow-page" aria-labelledby="positions-title">
      <header className="axi-v2-page__heading"><div><h1 className="axi-v2-page-title" id="positions-title">Paper positions</h1><p className="axi-v2-page-description">Open exposure first, with mark provenance, PnL, and exit alerts.</p></div><Badge tone="info">Paper only</Badge></header>
      <div className="axi-v2-portfolio-summary" aria-label="Paper portfolio summary">
        <PortfolioMetric label="Equity" value={formatSolV2(snapshot?.equitySol ?? null)} />
        <PortfolioMetric label="Deployed" value={formatSolV2(snapshot?.deployedSol ?? null)} />
        <PortfolioMetric label="Unrealized" value={formatSolV2(snapshot?.unrealizedPnlSol ?? status?.unrealizedPnlSol ?? null)} tone={(snapshot?.unrealizedPnlSol ?? 0) >= 0 ? "positive" : "negative"} />
        <PortfolioMetric label="Realized" value={formatSolV2(snapshot?.realizedPnlSol ?? status?.realizedPnlSol ?? null)} tone={(snapshot?.realizedPnlSol ?? 0) >= 0 ? "positive" : "negative"} />
        <PortfolioMetric label="Win rate" value={formatPercentV2(snapshot?.winRate ?? status?.winRate ?? null)} />
        <PortfolioMetric label="Open" value={String(status?.openPositionCount ?? snapshot?.openPositionCount ?? positions.filter((position) => position.status !== "closed").length)} />
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          title="No paper positions yet"
          detail={`Paper entry policy is ${status?.entryPolicyEnabled ? "enabled" : "disabled"}. A HOT/RIPPING reference signal is not sufficient by itself; price, samples, risk, size, and portfolio gates must all pass.`}
        />
      ) : (
        <div className="axi-v2-position-list">
          {ordered.map((position) => {
            const scannerRow = scannerByMint.get(position.mint);
            return (
              <article className="axi-v2-position-card" key={position.id}>
                <div className="axi-v2-position-card__identity"><Badge tone={position.status === "open" ? "positive" : position.status === "partially_closed" ? "warning" : "neutral"}>{position.status.replaceAll("_", " ")}</Badge><h2>{position.symbol ?? position.title ?? `${position.mint.slice(0, 5)}…${position.mint.slice(-4)}`}</h2><small>{position.mint.slice(0, 6)}…{position.mint.slice(-5)}</small></div>
                <PositionMetric label="Entry" value={formatSolV2(position.averageEntryPriceSol || position.entryPriceSol)} />
                <PositionMetric label="Current mark" value={formatSolV2(position.currentPriceSol ?? null)} detail={scannerRow ? scannerRow.market.priceSol.source.replaceAll("_", " ") : "mark unavailable"} />
                <PositionMetric label="Unrealized" value={`${formatSolV2(position.unrealizedPnlSol)} · ${formatPercentV2(position.unrealizedPnlPct)}`} tone={position.unrealizedPnlSol >= 0 ? "positive" : "negative"} />
                <PositionMetric label="Realized" value={`${formatSolV2(position.realizedPnlSol)} · ${formatPercentV2(position.realizedPnlPct)}`} tone={position.realizedPnlSol >= 0 ? "positive" : "negative"} />
                <div className="axi-v2-position-card__signal"><span>Current momentum</span>{scannerRow ? <SignalBadge signal={scannerRow.decision.signal} /> : <strong>—</strong>}<small>{scannerRow?.position.exitSignal ? `Exit alert · ${scannerRow.position.exitSignal}` : "No active exit alert"}</small></div>
                <PositionMetric label="Remaining" value={formatSolV2(position.remainingSizeSol)} detail={`Opened ${new Date(position.openedAt).toLocaleString()}`} />
              </article>
            );
          })}
        </div>
      )}

      <details className="axi-v2-portfolio-history">
        <summary>Paper order and fill history · {orders.length} orders · {fills.length} fills</summary>
        <div className="axi-v2-history-grid">
          <section><h3>Orders</h3>{orders.length === 0 ? <p>No paper orders.</p> : orders.map((order) => <p key={order.id}><strong>{order.side}</strong> {order.mint.slice(0, 8)}… · {order.source} · {new Date(order.createdAt).toLocaleString()}</p>)}</section>
          <section><h3>Fills</h3>{fills.length === 0 ? <p>No paper fills.</p> : fills.map((fill) => <p key={fill.id}><strong>{fill.side}</strong> {formatSolV2(fill.sizeSol)} @ {formatSolV2(fill.priceSol)} · {fill.fillStatus}</p>)}</section>
        </div>
      </details>
    </section>
  );
}

function PortfolioMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }) {
  return <div className={`axi-v2-portfolio-metric axi-v2-portfolio-metric--${tone}`}><span>{label}</span><strong className="axi-v2-numeric">{value}</strong></div>;
}

function PositionMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: "neutral" | "positive" | "negative" }) {
  return <div className={`axi-v2-position-metric axi-v2-position-metric--${tone}`}><span>{label}</span><strong className="axi-v2-numeric">{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}
