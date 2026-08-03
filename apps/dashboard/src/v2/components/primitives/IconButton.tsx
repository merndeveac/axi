import { forwardRef } from "react";
import { Button, type ButtonProps } from "./Button";

type IconButtonProps = Omit<ButtonProps, "children"> & {
  label: string;
  children: ButtonProps["children"];
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, children, ...props }, ref) {
    return (
      <Button {...props} ref={ref} aria-label={label} className="axi-v2-icon-button">
        {children}
      </Button>
    );
  }
);
