import { Check, Clipboard, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { ErrorState, LoadingState } from "../../components/primitives/States";
import { configuredApiBaseUrl } from "../../data/api-client";
import { useCanonicalRuntimeStatus } from "../../data/hooks/useRuntimeStatus";
import { useRuntimeTrackedMints } from "../../data/hooks/useRuntimeTrackedMints";
import { adaptRuntimeStatusV2, type CanonicalRuntimeStatus } from "../../data/runtime-adapter";
import { apiOfflineRuntime } from "../../fixtures/golden-path";
import { formatSolV2 } from "../../lib/formatters";
import { useRuntimeMutations, type RuntimeCommand } from "./RuntimeMutations";
import "./runtime.css";

export function RuntimePage({ onOpenEvidence }: { onOpenEvidence: () => void }) {
  const status = useCanonicalRuntimeStatus();
  const tracked = useRuntimeTrackedMints(status.isSuccess);
  const mutation = useRuntimeMutations();
  const [feedback, setFeedback] = useState<string | null>(null);

  async function run(command: RuntimeCommand) {
    setFeedback(null);
    try {
      const result = await mutation.mutateAsync(command);
      setFeedback(`${result.message} Resulting state: ${result.status.meteredPriceAction.state}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Runtime request failed");
    }
  }

  if (status.isPending && !status.data) return <LoadingState label="Loading canonical runtime status" />;
  if (status.isError && !status.data) {
    return <ErrorState title="Runtime API unavailable" detail="Controls remain safely disabled. Scanner cache and other resources continue independently." onRetry={() => { void status.refetch(); }} />;
  }

  return (
    <RuntimePageView
      status={status.data!}
      trackedMints={tracked.data?.current ?? []}
      trackedPending={tracked.isPending}
      pendingAction={mutation.isPending ? mutation.variables.kind : null}
      feedback={feedback}
      onCommand={run}
      onOpenEvidence={onOpenEvidence}
    />
  );
}

export function RuntimePageView({
  status,
  trackedMints,
  trackedPending = false,
  pendingAction = null,
  feedback = null,
  onCommand,
  onOpenEvidence
}: {
  status: CanonicalRuntimeStatus;
  trackedMints: Array<{ mint: string; status?: string; eventCount?: number; lastEventAt?: string | null }>;
  trackedPending?: boolean;
  pendingAction?: RuntimeCommand["kind"] | null;
  feedback?: string | null;
  onCommand: (command: RuntimeCommand) => Promise<void> | void;
  onOpenEvidence: () => void;
}) {
  const runtime = status ? adaptRuntimeStatusV2(status) : apiOfflineRuntime;
  const [copied, setCopied] = useState(false);
  const busy = pendingAction !== null;
  const publicAddress = status.dataWallet.publicKey;

  async function copyAddress() {
    if (!publicAddress) return;
    await navigator.clipboard.writeText(publicAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section className="axi-v2-page axi-v2-runtime-page" aria-labelledby="runtime-title">
      <header className="axi-v2-page__heading">
        <div>
          <h1 className="axi-v2-page-title" id="runtime-title">Runtime</h1>
          <p className="axi-v2-page-description">Canonical discovery, metered-data readiness, capacity, and process-owned session state.</p>
        </div>
        <div className="axi-v2-heading-badges"><Badge tone="info">Paper only</Badge><Badge tone="danger">Trading disabled</Badge></div>
      </header>

      <section className="axi-v2-runtime-hero" aria-labelledby="discovery-controls-title">
        <div><span className="axi-v2-eyebrow">Free public discovery</span><h2 id="discovery-controls-title">{status.liveDiscovery.provider} · {runtime.discovery}</h2><p>{status.liveDiscovery.lastError ?? `Last event ${formatTimestamp(status.liveDiscovery.lastEventAt)}`}</p></div>
        <div className="axi-v2-runtime-actions">
          <Button disabled={busy} onClick={() => { void onCommand({ kind: "start-discovery" }); }}>{pendingAction === "start-discovery" ? "Starting…" : "Start discovery"}</Button>
          <Button disabled={busy} onClick={() => { void onCommand({ kind: "restart-discovery" }); }}>{pendingAction === "restart-discovery" ? "Restarting…" : "Restart"}</Button>
          <Button tone="danger" disabled={busy} onClick={() => { void onCommand({ kind: "stop-discovery" }); }}>{pendingAction === "stop-discovery" ? "Stopping…" : "Stop discovery"}</Button>
        </div>
      </section>
      {feedback ? <p className="axi-v2-runtime-feedback" role="status">{feedback}</p> : null}

      <div className="axi-v2-runtime-grid">
        <RuntimePanel title="Metered data session" badge={<Badge tone={runtime.phase === "ACTIVE" ? "warning" : "neutral"}>{runtime.phase.replaceAll("_", " ")}</Badge>}>
          <div className="axi-v2-stat-grid">
            <RuntimeStat label="Spend" value={formatSolV2(runtime.spendSol.value)} />
            <RuntimeStat label="Session cap" value={formatSolV2(runtime.capSol.value)} />
            <RuntimeStat label="Remaining" value={formatSolV2(runtime.remainingSol.value)} />
            <RuntimeStat label="Events" value={`${status.meteredPriceAction.eventCount}/${runtime.maximumEvents}`} />
            <RuntimeStat label="Tracked" value={`${runtime.trackedMintCount.value ?? 0}/${runtime.maximumConcurrentMints}`} />
            <RuntimeStat label="Provider" value={status.meteredPriceAction.provider} />
          </div>
          <p className="axi-v2-runtime-note">Arm, Start, and Stop remain fixed in the global header. Their enabled state comes only from the backend capabilities below.</p>
          <div className="axi-v2-capability-list">
            <Capability label="Arm" allowed={runtime.canArm.allowed} blocker={runtime.canArm.blocker} />
            <Capability label="Start" allowed={runtime.canStart.allowed} blocker={runtime.canStart.blocker} />
            <Capability label="Stop" allowed={runtime.canStop.allowed} blocker={runtime.canStop.blocker} />
          </div>
        </RuntimePanel>

        <RuntimePanel title="Public data wallet" badge={<Badge tone={status.dataWallet.balanceStatus === "ok" ? "positive" : "warning"}>{status.dataWallet.balanceStatus}</Badge>}>
          <dl className="axi-v2-runtime-definition-list">
            <div><dt>Public address</dt><dd className="axi-v2-mono">{status.dataWallet.shortPublicKey ?? "Not configured"}</dd></div>
            <div><dt>Balance</dt><dd>{formatSolV2(status.dataWallet.balanceSol)}</dd></div>
            <div><dt>Estimated events remaining</dt><dd>{status.dataWallet.estimatedEventsRemaining?.toLocaleString() ?? "—"}</dd></div>
            <div><dt>Last checked</dt><dd>{formatTimestamp(status.dataWallet.lastBalanceCheckAt)}</dd></div>
          </dl>
          <div className="axi-v2-runtime-actions">
            <Button disabled={!publicAddress} onClick={() => { void copyAddress(); }}>{copied ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}{copied ? "Copied" : "Copy public address"}</Button>
            <Button disabled={busy} onClick={() => { void onCommand({ kind: "refresh-wallet" }); }}><RefreshCcw size={14} aria-hidden="true" />{pendingAction === "refresh-wallet" ? "Refreshing…" : "Refresh balance"}</Button>
          </div>
          <span className="axi-v2-visually-hidden" role="status">{copied ? "Public data-wallet address copied" : ""}</span>
        </RuntimePanel>

        <RuntimePanel title="Tracked mints & scheduler" badge={<Badge>{trackedMints.length} current</Badge>}>
          {trackedPending ? <p>Loading tracked mints…</p> : trackedMints.length === 0 ? <p>No mints are consuming metered trade data.</p> : (
            <ul className="axi-v2-tracked-list">{trackedMints.map((item) => <li key={item.mint}><span className="axi-v2-mono">{shortAddress(item.mint)}</span><span>{item.status ?? "tracking"} · {item.eventCount ?? 0} events</span></li>)}</ul>
          )}
          <p className="axi-v2-runtime-note">Capacity is bounded to {runtime.maximumConcurrentMints} concurrent mints and {runtime.maximumEvents.toLocaleString()} events for this process-owned session.</p>
        </RuntimePanel>

        <RuntimePanel title="Readiness & operations" badge={<Badge tone={status.api.online ? "positive" : "danger"}>API {status.api.online ? "online" : "offline"}</Badge>}>
          <dl className="axi-v2-runtime-definition-list">
            <div><dt>ACK owner</dt><dd>{runtime.acknowledged ? "Current API process" : "Not acknowledged"}</dd></div>
            <div><dt>Process session</dt><dd className="axi-v2-mono">{runtime.processSessionId}</dd></div>
            <div><dt>Control plane</dt><dd>{status.localOnly ? "Local only" : "Unavailable"}</dd></div>
            <div><dt>WebSocket</dt><dd>{status.api.wsOnline ? "Online" : "Offline"}</dd></div>
          </dl>
          <div className="axi-v2-runtime-links">
            <a href={`${configuredApiBaseUrl}/feed/status`} target="_blank" rel="noreferrer">Provider feed status</a>
            <a href={`${configuredApiBaseUrl}/runtime/diagnostics`} target="_blank" rel="noreferrer">Runtime operations JSON</a>
            <button type="button" onClick={onOpenEvidence}>Strategy & evidence</button>
          </div>
        </RuntimePanel>
      </div>

      <section className="axi-v2-safety-banner" aria-label="Runtime safety boundary">
        <ShieldItem label="Paper only" safe={status.paperOnly} />
        <ShieldItem label="Account trades" safe={!status.safety.accountTradesEnabled} />
        <ShieldItem label="Lightning execution" safe={!status.safety.lightningExecutionEnabled} />
        <ShieldItem label="Transaction API" safe={!status.safety.localTransactionApiEnabled} />
        <ShieldItem label="Private keys" safe={!status.safety.privateKeysLoaded} />
      </section>
    </section>
  );
}

function RuntimePanel({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return <section className="axi-v2-runtime-panel"><header><h2>{title}</h2>{badge}</header>{children}</section>;
}

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return <div className="axi-v2-runtime-stat"><span>{label}</span><strong className="axi-v2-numeric">{value}</strong></div>;
}

function Capability({ label, allowed, blocker }: { label: string; allowed: boolean; blocker: string | null }) {
  return <div><Badge tone={allowed ? "positive" : "warning"}>{label} {allowed ? "ready" : "blocked"}</Badge><span>{blocker ?? "Backend capability allowed"}</span></div>;
}

function ShieldItem({ label, safe }: { label: string; safe: boolean }) {
  return <span><Check size={14} aria-hidden="true" />{label}: {safe ? "safe" : "blocked"}</span>;
}

function shortAddress(value: string) {
  return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-6)}` : value;
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
