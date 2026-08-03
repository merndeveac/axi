import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <div className="axi-v2-state"><LoaderCircle className="axi-v2-spin" size={18} />{label}</div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="axi-v2-state"><Inbox size={20} /><div><strong>{title}</strong><p>{detail}</p></div></div>;
}

export function ErrorState({
  title,
  detail,
  onRetry
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return <div className="axi-v2-state axi-v2-state--error"><AlertTriangle size={20} /><div><strong>{title}</strong><p>{detail}</p>{onRetry ? <Button size="compact" onClick={onRetry}><RefreshCw size={14} /> Retry</Button> : null}</div></div>;
}

export function StaleState({ children }: { children: ReactNode }) {
  return <span className="axi-v2-stale"><AlertTriangle size={13} />{children}</span>;
}

export function Skeleton({ width = "100%" }: { width?: string }) {
  return <span className="axi-v2-skeleton" style={{ width }} aria-hidden="true" />;
}
