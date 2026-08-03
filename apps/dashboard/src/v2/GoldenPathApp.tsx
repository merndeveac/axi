import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { AppRoute } from "./app/navigation";
import { RoutePlaceholder, ScannerRoute } from "./app/routes";
import { AppShell } from "./components/layout/AppShell";
import { TooltipProvider } from "./components/primitives/Tooltip";
import { dashboardQueryClient } from "./data/query-client";
import "./ui/tokens.css";
import "./ui/reset.css";
import "./ui/globals.css";
import "./ui/typography.css";
import "./golden-path.css";

export function GoldenPathApp() {
  return (
    <QueryClientProvider client={dashboardQueryClient}>
      <GoldenPathRouter />
    </QueryClientProvider>
  );
}

function GoldenPathRouter() {
  const [route, setRoute] = useState<AppRoute>("scanner");
  return (
    <TooltipProvider delayDuration={250}>
      <AppShell route={route} onNavigate={setRoute}>
        {route === "scanner" ? <ScannerRoute /> : <RoutePlaceholder route={route} />}
      </AppShell>
    </TooltipProvider>
  );
}
