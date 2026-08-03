import { useState, type ReactNode } from "react";
import type { AppRoute, PrimaryRoute, SecondaryRoute } from "../../app/navigation";
import { DiagnosticsDrawer } from "../../features/diagnostics/DiagnosticsDrawer";
import { GlobalHeader } from "./GlobalHeader";

export function AppShell({
  route,
  onNavigate,
  children
}: {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: ReactNode;
}) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  return (
    <div className="axi-v2-shell">
      <GlobalHeader
        route={route}
        onNavigatePrimary={(next: PrimaryRoute) => onNavigate(next)}
        onNavigateSecondary={(next: SecondaryRoute) => onNavigate(next)}
        onOpenDiagnostics={() => setDiagnosticsOpen(true)}
      />
      <main className="axi-v2-main" id="main-content">{children}</main>
      <DiagnosticsDrawer open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen} />
    </div>
  );
}
