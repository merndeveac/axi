import type { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

type TooltipProps = {
  children: ReactNode;
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
};

export function Tooltip({ children, content, side = "top" }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="axi-tooltip"
          side={side}
          sideOffset={8}
        >
          {content}
          <TooltipPrimitive.Arrow className="axi-tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
