import clsx from "clsx";
import type { HTMLAttributes } from "react";

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx("axi-v2-surface", className)} />;
}
