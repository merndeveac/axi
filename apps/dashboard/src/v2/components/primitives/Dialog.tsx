import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { IconButton } from "./IconButton";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  restoreFocusRef
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <DialogPrimitive.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="axi-v2-dialog__overlay" />
        <DialogPrimitive.Content
          className="axi-v2-dialog__content"
          onCloseAutoFocus={(event) => {
            if (restoreFocusRef?.current) {
              event.preventDefault();
              restoreFocusRef.current.focus();
            }
          }}
        >
          <div className="axi-v2-dialog__heading">
            <div>
              <DialogPrimitive.Title className="axi-v2-dialog__title">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="axi-v2-dialog__description">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close dialog" tone="quiet">
                <X size={17} aria-hidden="true" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
