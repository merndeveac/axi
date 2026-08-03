import type { RuntimeSummaryV2 } from "@axi/shared";
import { useState, type ReactNode } from "react";
import type { AppRoute, PrimaryRoute, SecondaryRoute } from "../../app/navigation";
import { Drawer } from "../primitives/Drawer";
import { GlobalHeader } from "./GlobalHeader";

export function AppShell({
  route,
  runtime,
  onNavigate,
  children
}: {
  route: AppRoute;
  runtime: RuntimeSummaryV2;
  onNavigate: (route: AppRoute) => void;
  children: ReactNode;
}) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  return (
    <div className="axi-v2-shell">
      <GlobalHeader
        route={route}
        runtime={runtime}
        onNavigatePrimary={(next: PrimaryRoute) => onNavigate(next)}
        onNavigateSecondary={(next: SecondaryRoute) => onNavigate(next)}
        onOpenDiagnostics={() => setDiagnosticsOpen(true)}
      />
      <main className="axi-v2-main" id="main-content">{children}</main>
      <Drawer open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen} title="Developer diagnostics">
        <p className="axi-v2-drawer__copy">
          Engineering coverage, stream, storage, and verification panels remain isolated from the operator shell.
        </p>
      </Drawer>
    </div>
  );
}
