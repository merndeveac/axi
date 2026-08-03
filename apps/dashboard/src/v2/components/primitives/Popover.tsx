import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ReactNode } from "react";

export function Popover({
  trigger,
  children
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="axi-v2-popover" sideOffset={6}>
          {children}
          <PopoverPrimitive.Arrow className="axi-v2-popover__arrow" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
