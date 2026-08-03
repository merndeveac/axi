import type { AppRoute } from "./navigation";
import { routeLabels } from "./navigation";
import { ScannerPage } from "../features/scanner/ScannerPage";

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

export function ScannerRoute() {
  return <ScannerPage />;
}
