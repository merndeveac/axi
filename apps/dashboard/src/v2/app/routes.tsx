import type { AppRoute } from "./navigation";
import { routeLabels } from "./navigation";
import { goldenScannerRows } from "../fixtures/golden-path";
import { formatSolV2 } from "../lib/formatters";
import { Badge } from "../components/primitives/Badge";

export function RoutePlaceholder({ route }: { route: Exclude<AppRoute, "scanner"> }) {
  return (
    <section className="axi-v2-page" aria-labelledby="route-title">
      <header className="axi-v2-page__heading">
        <div>
          <h1 className="axi-v2-page-title" id="route-title">{routeLabels[route]}</h1>
          <p className="axi-v2-page-description">An isolated golden-path resource boundary is ready for this workflow.</p>
        </div>
      </header>
      <div className="axi-v2-placeholder-surface">Wave-specific workflow content will land behind this stable route boundary.</div>
    </section>
  );
}

export function ScannerShellPreview() {
  return (
    <section className="axi-v2-page" aria-labelledby="scanner-title">
      <header className="axi-v2-page__heading">
        <div>
          <h1 className="axi-v2-page-title" id="scanner-title">Momentum scanner</h1>
          <p className="axi-v2-page-description">Newest launches, sample readiness, momentum, and paper decisions.</p>
        </div>
        <Badge tone="warning">Reference policy</Badge>
      </header>
      <div className="axi-v2-shell-preview" aria-label="Scanner contract preview">
        {goldenScannerRows.slice(0, 6).map((row) => (
          <article className="axi-v2-shell-preview__row" key={row.mint}>
            <strong>{row.identity.symbol ?? row.identity.displayName}</strong>
            <span>{row.readiness.validSampleCount} samples</span>
            <span className="axi-v2-numeric">{formatSolV2(row.market.priceSol.value)}</span>
            <Badge tone={row.decision.signal === "REJECT" ? "danger" : row.decision.signal === "HOT" || row.decision.signal === "RIPPING" ? "positive" : "neutral"}>{row.decision.signal}</Badge>
          </article>
        ))}
      </div>
    </section>
  );
}
