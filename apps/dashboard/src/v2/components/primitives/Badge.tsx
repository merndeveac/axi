import clsx from "clsx";
import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "info" | "positive" | "warning" | "danger";
}) {
  return <span className={clsx("axi-v2-badge", `axi-v2-badge--${tone}`)}>{children}</span>;
}
