import type { RuntimeSummaryV2 } from "@axi/shared";
import { Badge } from "../primitives/Badge";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { RuntimeControlBar } from "./RuntimeControlBar";
import { SecondaryNavigation } from "./SecondaryNavigation";
import type { AppRoute, PrimaryRoute, SecondaryRoute } from "../../app/navigation";

export function GlobalHeader({
  route,
  runtime,
  onNavigatePrimary,
  onNavigateSecondary,
  onOpenDiagnostics
}: {
  route: AppRoute;
  runtime: RuntimeSummaryV2;
  onNavigatePrimary: (route: PrimaryRoute) => void;
  onNavigateSecondary: (route: SecondaryRoute) => void;
  onOpenDiagnostics: () => void;
}) {
  return (
    <header className="axi-v2-global-header">
      <div className="axi-v2-global-header__top">
        <a className="axi-v2-brand" href="?ui=v2" aria-label="AXI Scanner home">
          AXI
        </a>
        <Badge tone="info">Paper only</Badge>
        <PrimaryNavigation route={route} onNavigate={onNavigatePrimary} />
        <div className="axi-v2-global-header__health" aria-label="Connection health">
          <span><i className="axi-v2-dot axi-v2-dot--good" />API</span>
          <span><i className="axi-v2-dot axi-v2-dot--good" />WebSocket</span>
          <span className="axi-v2-numeric">Updated 1s</span>
        </div>
        <SecondaryNavigation onNavigate={onNavigateSecondary} onOpenDiagnostics={onOpenDiagnostics} />
      </div>
      <RuntimeControlBar runtime={runtime} />
    </header>
  );
}
