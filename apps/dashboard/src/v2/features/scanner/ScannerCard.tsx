import type { MomentumScannerSummaryV2, UiField } from "@axi/shared";
import { formatNumberV2, formatPercentV2, formatSolV2, formatUiFieldV2 } from "../../lib/formatters";
import { Badge } from "../../components/primitives/Badge";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { SampleReadiness } from "./SampleReadiness";
import { SignalBadge } from "./SignalBadge";
import { Sparkline } from "./Sparkline";
import { TokenThumbnail } from "./TokenThumbnail";

function ageLabel(seconds: number | null): string {
  if (seconds === null) return "age —";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function fieldNumber(field: UiField<number>, suffix = "") {
  return formatUiFieldV2(field, (value) => `${formatNumberV2(value)}${suffix}`);
}

function operatorEvidenceLabel(value: string | null, fallback: string) {
  if (!value) return fallback;
  if (!/^[A-Z0-9_]+$/u.test(value)) return value;
  const words = value.toLowerCase().replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function ScannerCard({
  row,
  selected,
  onSelect,
  style
}: {
  row: MomentumScannerSummaryV2;
  selected: boolean;
  onSelect: (mint: string) => void;
  style?: React.CSSProperties;
}) {
  const symbol = row.identity.symbol ?? row.identity.displayName.slice(0, 8);
  const stale =
    row.readiness.freshnessMs.availability === "stale" ||
    row.market.priceSol.availability === "stale";
  const topDriver = operatorEvidenceLabel(row.decision.topDriver, "No proven driver");
  const topBlocker = operatorEvidenceLabel(row.decision.topBlocker, "No blocker");
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`${symbol}, ${row.decision.signal}, ${row.readiness.validSampleCount} valid samples`}
      className="axi-v2-scanner-card"
      data-mint={row.mint}
      data-row-height="82"
      data-testid="scanner-card"
      onClick={() => onSelect(row.mint)}
      style={style}
    >
      <span className="axi-v2-scanner-card__identity">
        <TokenThumbnail uri={row.identity.imageUri.value} symbol={symbol} />
        <span className="axi-v2-scanner-card__identity-copy">
          <strong>{symbol}</strong>
          <span>{row.identity.displayName}</span>
          <small>{ageLabel(row.identity.ageSeconds.value)} · {row.identity.shortMint}</small>
        </span>
        {row.identity.migrationStatus === "migrated" ? <Badge tone="info">Migrated</Badge> : null}
      </span>
      <span className="axi-v2-scanner-card__readiness">
        <SampleReadiness readiness={row.readiness} />
        <FreshnessIndicator field={row.readiness.freshnessMs} />
      </span>
      <span className="axi-v2-scanner-card__metric-group">
        <span className="axi-v2-scanner-card__primary axi-v2-numeric">
          {formatUiFieldV2(row.market.priceSol, formatSolV2)}
        </span>
        <span>{row.market.priceSol.source.replaceAll("_", " ")} · <Sparkline values={row.sparkline.values} /></span>
        <small>MCap {fieldNumber(row.market.marketCapSol, " SOL")} · {row.market.liquidityKind === "curve" ? "Curve" : "DEX"} liq {row.market.liquidityKind === "curve" ? fieldNumber(row.market.liquiditySol, " SOL") : `$${fieldNumber(row.market.liquidityUsd)}`}</small>
      </span>
      <span className="axi-v2-scanner-card__metric-group">
        <span className="axi-v2-scanner-card__primary axi-v2-numeric">{fieldNumber(row.flow.volume10sSol, " SOL")}</span>
        <span>10s volume</span>
        <small>{fieldNumber(row.flow.transactionCount10s)} tx · {fieldNumber(row.flow.uniqueBuyers10s)} buyers · {formatUiFieldV2(row.flow.buyPressure, formatPercentV2)}</small>
      </span>
      <span className="axi-v2-scanner-card__metric-group axi-v2-scanner-card__momentum">
        <span className="axi-v2-scanner-card__primary axi-v2-numeric">Strength {fieldNumber(row.momentum.normalizedStrength)}</span>
        <span>Confidence {formatUiFieldV2(row.momentum.confidence, formatPercentV2)}</span>
        <small>Price d1 {fieldNumber(row.momentum.priceD1)} · d2 {fieldNumber(row.momentum.priceD2)} · Vol d1 {fieldNumber(row.momentum.volumeD1)} · d2 {fieldNumber(row.momentum.volumeD2)}</small>
      </span>
      <span className="axi-v2-scanner-card__decision">
        <span className="axi-v2-scanner-card__decision-top"><SignalBadge signal={row.decision.signal} /><strong className="axi-v2-numeric">{row.decision.score}</strong>{stale ? <Badge tone="warning">Stale</Badge> : null}</span>
        <span title={topDriver}>↑ {topDriver}</span>
        <small title={topBlocker}>↓ {topBlocker} · Risk {row.decision.riskLevel}{row.position.status ? ` · PnL ${formatUiFieldV2(row.position.unrealizedPnlPct, formatPercentV2)}` : ""}</small>
      </span>
    </button>
  );
}
