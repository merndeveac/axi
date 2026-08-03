import { MoreHorizontal } from "lucide-react";
import {
  routeLabels,
  secondaryRoutes,
  type AppRoute,
  type SecondaryRoute
} from "../../app/navigation";
import { IconButton } from "../primitives/IconButton";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../primitives/Menu";

export function SecondaryNavigation({
  onNavigate,
  onOpenDiagnostics
}: {
  onNavigate: (route: SecondaryRoute) => void;
  onOpenDiagnostics: () => void;
}) {
  return (
    <MenuRoot>
      <MenuTrigger>
        <IconButton label="Open secondary navigation" tone="quiet">
          <MoreHorizontal size={19} aria-hidden="true" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        {secondaryRoutes.map((route) => (
          <MenuItem key={route} onSelect={() => onNavigate(route)}>
            {routeLabels[route as AppRoute]}
          </MenuItem>
        ))}
        <div className="axi-v2-menu__separator" />
        <MenuItem onSelect={onOpenDiagnostics}>Developer diagnostics</MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}
