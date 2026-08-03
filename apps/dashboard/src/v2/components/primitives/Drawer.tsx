import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="axi-v2-dialog__overlay" />
        <DialogPrimitive.Content className="axi-v2-drawer">
          <div className="axi-v2-dialog__heading">
            <DialogPrimitive.Title className="axi-v2-dialog__title">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close drawer" tone="quiet">
                <X size={17} aria-hidden="true" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="axi-v2-visually-hidden">
            {description ?? `${title} drawer`}
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
