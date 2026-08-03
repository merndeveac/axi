import { goldenScannerSnapshot } from "./fixtures/golden-path";
import { formatSolV2 } from "./lib/formatters";
import "./placeholder.css";

export function GoldenPathApp() {
  const lead = goldenScannerSnapshot.rows[0];

  return (
    <main className="v2-placeholder">
      <p className="v2-placeholder__eyebrow">AXI · Paper only</p>
      <h1>Golden-path UI contract checkpoint</h1>
      <p>
        The V2 boundary is isolated and rendering deterministic fixtures while
        the legacy dashboard remains the default.
      </p>
      {lead ? (
        <dl>
          <div>
            <dt>Fixture</dt>
            <dd>{lead.identity.displayName}</dd>
          </div>
          <div>
            <dt>Curve price</dt>
            <dd>{formatSolV2(lead.market.priceSol.value)}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{lead.decision.signal}</dd>
          </div>
        </dl>
      ) : null}
    </main>
  );
}
