import type { MomentumScannerRow, MomentumScannerSummaryV2 } from "@axi/shared";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "../../components/primitives/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/primitives/States";
import { formatNumberV2, formatPercentV2, formatSolV2, formatUiFieldV2 } from "../../lib/formatters";
import { SampleReadiness } from "../scanner/SampleReadiness";
import { SignalBadge } from "../scanner/SignalBadge";
import { PriceVolumeChart } from "./PriceVolumeChart";

export function TokenResearchContent({
  summary,
  detail,
  pending = false,
  error = null,
  onRetry
}: {
  summary: MomentumScannerSummaryV2;
  detail: MomentumScannerRow | null;
  pending?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  return (
    <div className="axi-v2-token-research">
      <section className="axi-v2-research-hero">
        <div>
          <span className="axi-v2-label">Token lifecycle</span>
          <h2>{summary.identity.symbol ?? summary.identity.displayName} <small>{summary.identity.displayName}</small></h2>
          <p>{summary.identity.shortMint} · {summary.identity.migrationStatus.replaceAll("_", " ")} · price source {summary.market.priceSol.source.replaceAll("_", " ")}</p>
        </div>
        <div className="axi-v2-research-hero__decision">
          <SignalBadge signal={summary.decision.signal} />
          <strong className="axi-v2-numeric">Score {summary.decision.score}</strong>
          <Badge tone="warning">Reference policy</Badge>
        </div>
      </section>

      {error ? <ErrorState title="Rich token detail unavailable" detail="The scanner remains live. Retry this token-specific request." {...(onRetry ? { onRetry } : {})} /> : pending && !detail ? <LoadingState label="Loading rich token evidence" /> : null}

      <section className="axi-v2-research-section">
        <header><h3>Price and volume</h3><span>{formatUiFieldV2(summary.market.priceSol, formatSolV2)}</span></header>
        <PriceVolumeChart summary={summary} detail={detail} />
        <div className="axi-v2-research-metrics">
          <ResearchMetric label="Market cap" value={formatUiFieldV2(summary.market.marketCapSol, (value) => `${formatNumberV2(value)} SOL`)} />
          <ResearchMetric label={summary.market.liquidityKind === "curve" ? "Curve liquidity" : "DEX liquidity"} value={summary.market.liquidityKind === "curve" ? formatUiFieldV2(summary.market.liquiditySol, (value) => `${formatNumberV2(value)} SOL`) : formatUiFieldV2(summary.market.liquidityUsd, (value) => `$${formatNumberV2(value)}`)} />
          <ResearchMetric label="10s volume" value={formatUiFieldV2(summary.flow.volume10sSol, (value) => `${formatNumberV2(value)} SOL`)} />
          <ResearchMetric label="Buy pressure" value={formatUiFieldV2(summary.flow.buyPressure, formatPercentV2)} />
        </div>
      </section>

      <section className="axi-v2-research-section">
        <header><h3>Sample readiness</h3><span>{summary.readiness.validSampleCount} valid</span></header>
        <SampleReadiness readiness={summary.readiness} />
        <div className="axi-v2-sample-timeline" aria-label="Sample readiness timeline">
          <span data-ready>Discovery</span><span data-ready={summary.readiness.validSampleCount >= 1}>Observed</span><span data-ready={summary.readiness.d1Ready}>D1 ready</span><span data-ready={summary.readiness.d2Ready}>D2 ready</span>
        </div>
      </section>

      <section className="axi-v2-research-section">
        <header><h3>Derivative matrix</h3><span>Normalized strength {formatUiFieldV2(summary.momentum.normalizedStrength, formatNumberV2)}</span></header>
        <div className="axi-v2-derivative-matrix">
          <ResearchMetric label="Price d1" value={formatUiFieldV2(summary.momentum.priceD1, formatNumberV2)} />
          <ResearchMetric label="Price d2" value={formatUiFieldV2(summary.momentum.priceD2, formatNumberV2)} />
          <ResearchMetric label="Volume d1" value={formatUiFieldV2(summary.momentum.volumeD1, formatNumberV2)} />
          <ResearchMetric label="Volume d2" value={formatUiFieldV2(summary.momentum.volumeD2, formatNumberV2)} />
          <ResearchMetric label="Confidence" value={formatUiFieldV2(summary.momentum.confidence, formatPercentV2)} />
          <ResearchMetric label="Cohort context" value={detail?.derivativeStrength.volume.cohortReady ? `p${formatNumberV2(detail.derivativeStrength.volume.cohortPercentile)}` : "Unproven"} />
        </div>
      </section>

      <section className="axi-v2-research-section">
        <header><h3>Decision explanation</h3><span>Calibrated: false</span></header>
        <div className="axi-v2-decision-explanation">
          <p className="axi-v2-positive"><ArrowUpRight size={16} />{summary.decision.topDriver ?? "No proven positive driver"}</p>
          <p className="axi-v2-negative"><ArrowDownRight size={16} />{summary.decision.topBlocker ?? "No active blocker"}</p>
          <p><AlertTriangle size={16} />Risk {summary.decision.riskLevel}{summary.decision.hardReject ? " · hard reject" : ""}</p>
        </div>
      </section>

      <section className="axi-v2-research-section">
        <header><h3>Market provenance</h3><span>{summary.market.liquidityKind === "curve" ? "Bonding curve phase" : "Migrated market"}</span></header>
        <p>Price: {summary.market.priceSol.source} · Liquidity: {summary.market.liquidityKind} · observed {summary.market.priceSol.observedAt ?? "unknown"}</p>
      </section>

      <section className="axi-v2-research-section">
        <header><h3>Paper position and exits</h3><span>Paper only</span></header>
        {summary.position.status ? (
          <div className="axi-v2-research-metrics">
            <ResearchMetric label="Position" value={summary.position.status} />
            <ResearchMetric label="Unrealized PnL" value={formatUiFieldV2(summary.position.unrealizedPnlPct, formatPercentV2)} />
            <ResearchMetric label="PnL SOL" value={formatUiFieldV2(summary.position.unrealizedPnlSol, formatSolV2)} />
            <ResearchMetric label="Exit alert" value={summary.position.exitSignal ?? "None"} />
          </div>
        ) : <EmptyState title="No paper position" detail="A reference signal alone does not create a position; every paper policy gate must pass." />}
      </section>

      <details className="axi-v2-technical-audit">
        <summary>Technical audit and reason codes</summary>
        {detail ? (
          <ul>{detail.reasonCodes.slice(0, 30).map((code) => <li key={code}>{code}</li>)}</ul>
        ) : <p>Rich technical evidence is unavailable. Scanner summary remains isolated.</p>}
      </details>
    </div>
  );
}

function ResearchMetric({ label, value }: { label: string; value: string }) {
  return <div className="axi-v2-research-metric"><span>{label}</span><strong className="axi-v2-numeric">{value}</strong></div>;
}
