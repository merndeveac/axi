import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Drawer } from "../../components/primitives/Drawer";
import { useDiagnostics } from "../../data/hooks/useDiagnostics";
import "./diagnostics.css";

const panels = [
  { id: "discovery-coverage", title: "Discovery coverage", path: "/runtime/discovery-coverage" },
  { id: "trade-data-coverage", title: "Trade-data coverage", path: "/runtime/trade-data-coverage" },
  { id: "feed-status", title: "Feed & source status", path: "/feed/status" },
  { id: "indexer-status", title: "Indexer status", path: "/indexer/status" },
  { id: "stream-status", title: "Indexer stream status", path: "/indexer/stream/status" },
  { id: "storage-counts", title: "Storage counts", path: "/storage/stats" },
  { id: "raw-events", title: "Recent raw events", path: "/live/events?limit=25" },
  { id: "chain-verification", title: "Chain verification", path: "/chain/verifications?limit=25" },
  { id: "market-observations", title: "Market observations", path: "/market/observations?limit=25" }
] as const;

export function DiagnosticsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Developer diagnostics" description="Read-only engineering coverage, stream, storage, verification, and market evidence.">
      <div className="axi-v2-diagnostics">
        <p>Read-only engineering evidence. Every resource loads independently and all polling stops when this drawer closes.</p>
        <div className="axi-v2-diagnostics__panels">
          {panels.map((panel) => <DiagnosticPanel key={panel.id} {...panel} enabled={open} />)}
        </div>
      </div>
    </Drawer>
  );
}

export function DiagnosticPanel({ id, title, path, enabled }: { id: string; title: string; path: string; enabled: boolean }) {
  const query = useDiagnostics<unknown>(id, path, enabled);
  const entries = query.data === undefined ? [] : summarize(query.data);
  const reasonCodes = query.data === undefined ? [] : findStringValues(query.data, /reasonCodes?$/i);
  const equations = query.data === undefined ? [] : findStringValues(query.data, /(equation|reconciliation|formula)/i);
  return (
    <details className="axi-v2-diagnostic-panel" data-panel={id}>
      <summary>
        <span>{query.isPending ? <LoaderCircle className="axi-v2-spin" size={14} aria-hidden="true" /> : query.isError ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}{title}</span>
        <small>{query.isPending ? "loading" : query.isError ? "unavailable" : `${entries.length} fields`}</small>
      </summary>
      {query.isPending ? <p role="status">Loading {title.toLowerCase()}…</p> : query.isError ? <div className="axi-v2-diagnostic-error" role="alert"><strong>{title} unavailable</strong><span>{query.error instanceof Error ? query.error.message : "Request failed"}</span><button type="button" onClick={() => { void query.refetch(); }}>Retry panel</button></div> : (
        <div className="axi-v2-diagnostic-content">
          <dl>{entries.map(([label, value]) => <div key={label}><dt>{humanize(label)}</dt><dd className="axi-v2-numeric">{value}</dd></div>)}</dl>
          {reasonCodes.length ? <details><summary>Technical reason codes · {reasonCodes.length}</summary><ul>{reasonCodes.slice(0, 30).map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></details> : null}
          {equations.length ? <details><summary>Reconciliation equations · {equations.length}</summary><ul>{equations.slice(0, 20).map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></details> : null}
          <details><summary>Raw read-only response</summary><pre>{JSON.stringify(query.data, null, 2)}</pre></details>
        </div>
      )}
    </details>
  );
}

function summarize(value: unknown): Array<[string, string]> {
  if (Array.isArray(value)) return [["records", value.length.toLocaleString()]];
  if (!isRecord(value)) return [["value", formatValue(value)]];
  return Object.entries(value).flatMap(([key, item]) => {
    if (Array.isArray(item)) return [[key, `${item.length.toLocaleString()} records`] as [string, string]];
    if (isRecord(item)) {
      return Object.entries(item).filter(([, nested]) => !isRecord(nested) && !Array.isArray(nested)).slice(0, 5).map(([nestedKey, nested]) => [`${key}.${nestedKey}`, formatValue(nested)] as [string, string]);
    }
    return [[key, formatValue(item)] as [string, string]];
  }).slice(0, 18);
}

function findStringValues(value: unknown, keyPattern: RegExp, key = "", depth = 0): string[] {
  if (depth > 5) return [];
  if (Array.isArray(value)) {
    if (keyPattern.test(key)) return value.filter((item): item is string => typeof item === "string");
    return value.flatMap((item) => findStringValues(item, keyPattern, key, depth + 1));
  }
  if (!isRecord(value)) return keyPattern.test(key) && typeof value === "string" ? [value] : [];
  return Object.entries(value).flatMap(([nestedKey, nested]) => findStringValues(nested, keyPattern, nestedKey, depth + 1));
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function formatValue(value: unknown) { if (value === null || value === undefined) return "—"; if (typeof value === "boolean") return value ? "true" : "false"; return String(value); }
function humanize(value: string) { return value.replaceAll("_", " ").replaceAll(".", " · ").replace(/([a-z])([A-Z])/g, "$1 $2"); }
