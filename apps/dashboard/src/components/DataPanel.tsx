import type { ReactNode } from "react";

type DataPanelProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  meta?: ReactNode;
  title: string;
};

export function DataPanel({
  ariaLabel,
  children,
  className,
  meta,
  title
}: DataPanelProps) {
  return (
    <section className={`table-region ${className ?? ""}`} aria-label={ariaLabel}>
      <div className="table-heading">
        <h2>&gt; {title}</h2>
        {meta ? <div className="table-meta">{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}
