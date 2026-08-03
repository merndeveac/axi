import type {
  DiscoveryCoverageLatencyDistribution,
  DiscoveryCoverageLatencyKey,
  DiscoveryCoverageSession
} from "@axi/shared";
import { DataPanel } from "./DataPanel";
import { MetricValue } from "./MetricValue";

export type DiscoveryCoveragePanelState = {
  status: "loading" | "ready" | "error";
  session: DiscoveryCoverageSession | null;
  error: string | null;
};

export async function loadDiscoveryCoverage(
  request: () => Promise<DiscoveryCoverageSession>
): Promise<DiscoveryCoveragePanelState> {
  try {
    return { status: "ready", session: await request(), error: null };
  } catch {
    return {
      status: "error",
      session: null,
      error: "Discovery coverage diagnostics unavailable"
    };
  }
}

export function coverageValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

export function latencyPercentiles(
  session: DiscoveryCoverageSession | null,
  key: DiscoveryCoverageLatencyKey
): string {
  const distribution = session?.latencyDistributions[key];
  if (!distribution || distribution.availableCount === 0) {
    return "—";
  }
  return [distribution.p50, distribution.p95, distribution.p99]
    .map(formatLatency)
    .join(" / ");
}

export function DiscoveryCoveragePanel({
  state
}: {
  state: DiscoveryCoveragePanelState;
}) {
  const session = state.session;
  const loading = state.status === "loading";
  const meta = loading
    ? "LOADING"
    : state.status === "error"
      ? "ENDPOINT UNAVAILABLE"
      : session
        ? session.schemaVersion.toUpperCase()
        : "NO SESSION";
  const latestFailure = session?.reasonCodes.find((code) =>
    code.includes("FAIL")
  );

  return (
    <DataPanel
      ariaLabel="Discovery coverage diagnostics"
      meta={<span>{meta}</span>}
      title="DISCOVERY COVERAGE"
    >
      {state.error ? <p className="panel-note">{state.error}</p> : null}
      <div className="status-grid secondary-grid embedded-grid">
        <MetricValue
          label="connection"
          value={
            session
              ? session.stoppedAt
                ? "DISCONNECTED"
                : session.connectionCount > 0
                  ? "CONNECTED"
                  : "—"
              : "—"
          }
          detail={`${coverageValue(session?.reconnectSuccessCount)}/${coverageValue(session?.reconnectAttemptCount)} reconnects`}
        />
        <MetricValue
          label="gap status"
          value={session?.upstreamCoverageStatus ?? "—"}
          detail={`${coverageValue(session?.disconnectedDurationMs)} ms disconnected`}
          tone={session?.upstreamCoverageStatus === "UNPROVEN" ? "warn" : "neutral"}
        />
        <MetricValue label="raw frames" value={coverageValue(session?.rawFrameCount)} />
        <MetricValue label="parsed" value={coverageValue(session?.parsedFrameCount)} />
        <MetricValue label="malformed" value={coverageValue(session?.parseFailureCount)} />
        <MetricValue label="create / migration" value={`${coverageValue(session?.recognizedCreateCount)} / ${coverageValue(session?.recognizedMigrationCount)}`} />
        <MetricValue label="non-discovery / unknown" value={`${coverageValue(session?.recognizedNonDiscoveryCount)} / ${coverageValue(session?.unknownPayloadCount)}`} />
        <MetricValue label="normalization rejects" value={coverageValue(session?.normalizationRejectCount)} />
        <MetricValue label="normalized / duplicates" value={`${coverageValue(session?.normalizationSuccessCount)} / ${coverageValue(session?.duplicateCount)}`} />
        <MetricValue label="queue accepted / committed" value={`${coverageValue(session?.queueAcceptedCount)} / ${coverageValue(session?.queueCommittedCount)}`} />
        <MetricValue label="queue failed / dropped" value={`${coverageValue(session?.queueFailureCount)} / ${coverageValue(session?.pipelineFailedOrDroppedCount)}`} />
        <MetricValue label="identity / live token" value={`${completedEntities(session, "identity")} / ${completedEntities(session, "live")}`} />
        <MetricValue label="candidate / score" value={`${completedEntities(session, "candidate")} / ${coverageValue(session?.scoreProducedCount)}`} />
        <MetricValue label="persistence / scanner" value={`${coverageValue(session?.persistenceCompletedCount)} / ${coverageValue(session?.scannerProjectedCount)}`} />
        <MetricValue label="broadcasts" value={coverageValue(session?.broadcastCompletedCount)} />
        <LatencyMetric session={session} label="receive→normalize p50/p95/p99" latencyKey="receive_to_normalize" />
        <LatencyMetric session={session} label="normalize→commit p50/p95/p99" latencyKey="normalize_to_queue_commit" />
        <LatencyMetric session={session} label="commit→score p50/p95/p99" latencyKey="queue_commit_to_score" />
        <LatencyMetric session={session} label="commit→scanner p50/p95/p99" latencyKey="queue_commit_to_scanner" />
        <LatencyMetric session={session} label="receive→scanner p50/p95/p99" latencyKey="receive_to_scanner" />
        <LatencyMetric session={session} label="provider→receive p50/p95/p99" latencyKey="provider_to_receive" />
        <MetricValue
          label="local reconciliation"
          value={session?.localReconciliationStatus ?? "—"}
          detail={session ? `max residual ${session.reconciliation.maximumAbsoluteResidual}` : "—"}
          tone={
            session?.localReconciliationStatus === "LOCALLY_RECONCILED"
              ? "good"
              : session
                ? "bad"
                : "neutral"
          }
        />
        <MetricValue
          label="upstream coverage"
          value={session?.upstreamCoverageStatus ?? "—"}
          detail="provider sequence/comparator required"
          tone={session?.upstreamCoverageStatus === "UNPROVEN" ? "warn" : "neutral"}
        />
        <MetricValue label="session" value={session?.sessionId ?? "—"} detail={`${coverageValue(session?.observationDurationMs)} ms observed`} />
        <MetricValue label="latest failure" value={latestFailure ?? "—"} />
      </div>
      <div className="diagnostic-actions">
        {(session?.reconciliation.equations ?? []).map((equation) => (
          <span key={equation.name}>
            {equation.name}: residual {equation.residual}
          </span>
        ))}
      </div>
      <p className="panel-note">
        LOCALLY_RECONCILED means AXI accounted for every frame it received.
        UPSTREAM UNPROVEN means AXI cannot independently prove PumpPortal
        delivered every actual launch.
      </p>
    </DataPanel>
  );
}

function LatencyMetric({
  label,
  latencyKey,
  session
}: {
  label: string;
  latencyKey: DiscoveryCoverageLatencyKey;
  session: DiscoveryCoverageSession | null;
}) {
  const distribution: DiscoveryCoverageLatencyDistribution | undefined =
    session?.latencyDistributions[latencyKey];
  return (
    <MetricValue
      label={label}
      value={latencyPercentiles(session, latencyKey)}
      detail={
        distribution
          ? `${distribution.availableCount} available / ${distribution.unavailableCount} unavailable`
          : "—"
      }
    />
  );
}

function completedEntities(
  session: DiscoveryCoverageSession | null,
  type: "identity" | "live" | "candidate"
): string {
  if (!session) {
    return "—";
  }
  if (type === "identity") {
    return String(session.identityCreatedCount + session.identityUpdatedCount);
  }
  if (type === "live") {
    return String(session.liveTokenCreatedCount + session.liveTokenUpdatedCount);
  }
  return String(session.candidateCreatedCount + session.candidateUpdatedCount);
}

function formatLatency(value: number | null): string {
  return value === null ? "—" : `${value} ms`;
}
