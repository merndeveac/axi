import type { AppRoute } from "./navigation";
import { ScannerPage } from "../features/scanner/ScannerPage";
import { PositionsPage } from "../features/positions/PositionsPage";
import { ResearchPage } from "../features/research/ResearchPage";
import { RuntimePage } from "../features/runtime/RuntimePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { StrategyEvidencePage } from "../features/strategy/StrategyEvidencePage";

export function ScannerRoute() {
  return <ScannerPage />;
}

export function WorkflowRoute({ route, onNavigate }: { route: Exclude<AppRoute, "scanner">; onNavigate: (route: AppRoute) => void }) {
  if (route === "positions") return <PositionsPage />;
  if (route === "research") return <ResearchPage />;
  if (route === "strategy") return <StrategyEvidencePage />;
  if (route === "runtime") return <RuntimePage onOpenEvidence={() => onNavigate("strategy")} />;
  return <SettingsPage />;
}
