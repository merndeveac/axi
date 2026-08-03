import clsx from "clsx";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode
} from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "danger" | "quiet";
  size?: "compact" | "default";
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, tone = "default", size = "default", type, ...props },
    ref
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type ?? "button"}
        className={clsx(
          "axi-v2-button",
          `axi-v2-button--${tone}`,
          `axi-v2-button--${size}`,
          className
        )}
      />
    );
  }
);
