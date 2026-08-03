import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

export const MenuRoot = DropdownMenu.Root;

export function MenuTrigger({ children }: { children: ReactNode }) {
  return <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>;
}

export function MenuContent({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content className="axi-v2-menu" sideOffset={6} align="end">
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  children,
  onSelect
}: {
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item className="axi-v2-menu__item" onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  );
}
