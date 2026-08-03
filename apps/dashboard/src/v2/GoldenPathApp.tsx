import { useState } from "react";
import type { AppRoute } from "./app/navigation";
import { RoutePlaceholder, ScannerShellPreview } from "./app/routes";
import { AppShell } from "./components/layout/AppShell";
import { meteredArmRequired } from "./fixtures/golden-path";
import { TooltipProvider } from "./components/primitives/Tooltip";
import "./ui/tokens.css";
import "./ui/reset.css";
import "./ui/globals.css";
import "./ui/typography.css";
import "./golden-path.css";

export function GoldenPathApp() {
  const [route, setRoute] = useState<AppRoute>("scanner");
  return (
    <TooltipProvider delayDuration={250}>
      <AppShell route={route} runtime={meteredArmRequired} onNavigate={setRoute}>
        {route === "scanner" ? <ScannerShellPreview /> : <RoutePlaceholder route={route} />}
      </AppShell>
    </TooltipProvider>
  );
}
