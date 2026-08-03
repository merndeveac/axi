import type {
  TradeDataCoverageLatencyDistribution,
  TradeDataCoverageLatencyKey,
  TradeDataCoverageSession
} from "@axi/shared";
import { DataPanel } from "./DataPanel";
import { MetricValue } from "./MetricValue";

export type TradeDataCoveragePanelState = {
  status: "loading" | "ready" | "error";
  session: TradeDataCoverageSession | null;
  error: string | null;
};

export async function loadTradeDataCoverage(
  request: () => Promise<TradeDataCoverageSession | null>
): Promise<TradeDataCoveragePanelState> {
  try {
    return { status: "ready", session: await request(), error: null };
  } catch {
    return {
      status: "error",
      session: null,
      error: "Trade-data coverage diagnostics unavailable"
    };
  }
}

export function tradeCoverageValue(value: unknown): string {
  return value === null || value === undefined ? "—" : String(value);
}

export function tradeLatencyPercentiles(
  session: TradeDataCoverageSession | null,
  key: TradeDataCoverageLatencyKey
): string {
  const distribution = session?.latencyDistributions[key];
  if (!distribution || distribution.availableCount === 0) {
    return "—";
  }
  return [distribution.p50, distribution.p95, distribution.p99]
    .map((value) => (value === null ? "—" : `${value} ms`))
    .join(" / ");
}

export function TradeDataCoveragePanel({
  state
}: {
  state: TradeDataCoveragePanelState;
}) {
  const session = state.session;
  const meta =
    state.status === "loading"
      ? "LOADING"
      : state.status === "error"
        ? "ENDPOINT UNAVAILABLE"
        : session
          ? session.schemaVersion.toUpperCase()
          : "NO SESSION";
  const latestFailure = session?.reasonCodes.find(
    (code) => code.includes("FAIL") || code.includes("MISMATCH")
  );
  const lifecycle = session?.subscriptionLifecycle.map(
    (event) => event.eventType
  );

  return (
    <DataPanel
      ariaLabel="Trade data coverage diagnostics"
      meta={<span>{meta}</span>}
      title="TRADE DATA COVERAGE"
    >
      {state.error ? <p className="panel-note">{state.error}</p> : null}
      <div className="status-grid secondary-grid embedded-grid">
        <MetricValue
          label="selected mint"
          value={session?.selectedMint ?? "—"}
          detail={`${tradeCoverageValue(session?.activeDurationMs)} ms active`}
        />
        <MetricValue
          label="subscription"
          value={session ? (session.stoppedAt ? "STOPPED" : "ACTIVE") : "—"}
          detail={lifecycle?.join(" → ") ?? "—"}
        />
        <MetricValue label="first trade" value={session?.firstTradeAt ?? "—"} />
        <MetricValue label="stop reason" value={session?.stopReason ?? "—"} />
        <MetricValue
          label="raw / recognized"
          value={`${tradeCoverageValue(session?.rawFrameCount)} / ${tradeCoverageValue(session?.recognizedTradeCount)}`}
        />
        <MetricValue
          label="normalized / rejected"
          value={`${tradeCoverageValue(session?.normalizationSuccessCount)} / ${tradeCoverageValue(session?.normalizationRejectCount)}`}
        />
        <MetricValue
          label="duplicates"
          value={tradeCoverageValue(session?.duplicateCount)}
        />
        <MetricValue
          label="queue committed / failed"
          value={`${tradeCoverageValue(session?.queueCommittedCount)} / ${tradeCoverageValue(session?.queueFailureCount)}`}
        />
        <MetricValue
          label="persisted"
          value={tradeCoverageValue(session?.persistenceCompletedCount)}
        />
        <MetricValue
          label="time-series accepted / rejected"
          value={`${tradeCoverageValue(session?.timeseriesAcceptedCount)} / ${tradeCoverageValue(session?.timeseriesRejectedCount)}`}
        />
        <MetricValue
          label="scanner projected"
          value={tradeCoverageValue(session?.scannerProjectedCount)}
        />
        <MetricValue
          label="post-stop trades"
          value={`${tradeCoverageValue(session?.postStopTradeCount)} (${tradeCoverageValue(session?.unexpectedPostStopTradeCount)} unexpected)`}
        />
        <MetricValue
          label="usable / unusable"
          value={`${tradeCoverageValue(session?.usableTradeCount)} / ${tradeCoverageValue(session?.unusableTradeCount)}`}
        />
        <MetricValue
          label="wrong mint"
          value={tradeCoverageValue(session?.wrongMintFrameCount)}
        />
        <MetricValue
          label="missing signature / amounts"
          value={`${tradeCoverageValue(session?.missingSignatureCount)} / ${tradeCoverageValue(session?.missingAmountCount)}`}
        />
        <MetricValue
          label="consistency mismatches"
          value={tradeCoverageValue(session?.consistencyMismatchCount)}
        />
        <MetricValue
          label="1s buckets / completed"
          value={`${tradeCoverageValue(session?.oneSecondBucketCount)} / ${tradeCoverageValue(session?.completedOneSecondBucketCount)}`}
        />
        <MetricValue
          label="trade count / valid samples"
          value={`${tradeCoverageValue(session?.timeseriesAcceptedCount)} / ${tradeCoverageValue(session?.validSampleCount)}`}
        />
        <MetricValue
          label="first / second derivative"
          value={`${availability(session?.firstDerivativeAvailable)} / ${availability(session?.secondDerivativeAvailable)}`}
        />
        <MetricValue
          label="estimated cost"
          value={session ? `${session.estimatedCostSol} SOL` : "—"}
          detail={session ? `cap ${session.maxCostSol} SOL; estimated` : "—"}
        />
        <LatencyMetric
          session={session}
          label="receive→normalize p50/p95/p99"
          latencyKey="receive_to_normalize"
        />
        <LatencyMetric
          session={session}
          label="normalize→persist p50/p95/p99"
          latencyKey="normalize_to_persist"
        />
        <LatencyMetric
          session={session}
          label="persist→time-series p50/p95/p99"
          latencyKey="persist_to_timeseries"
        />
        <LatencyMetric
          session={session}
          label="time-series→scanner p50/p95/p99"
          latencyKey="timeseries_to_scanner"
        />
        <LatencyMetric
          session={session}
          label="receive→scanner p50/p95/p99"
          latencyKey="receive_to_scanner"
        />
        <LatencyMetric
          session={session}
          label="provider→receive p50/p95/p99"
          latencyKey="provider_to_receive"
        />
        <MetricValue
          label="local reconciliation"
          value={session?.localReconciliationStatus ?? "—"}
          detail={
            session
              ? `max residual ${session.reconciliation.maximumAbsoluteResidual}`
              : "—"
          }
          tone={
            session?.localReconciliationStatus ===
            "TRADE_DATA_LOCALLY_RECONCILED"
              ? "good"
              : session
                ? "bad"
                : "neutral"
          }
        />
        <MetricValue
          label="upstream coverage"
          value={session?.upstreamCoverageStatus ?? "—"}
          detail="independent comparator/provider sequence required"
          tone={session ? "warn" : "neutral"}
        />
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
        TRADE_DATA_LOCALLY_RECONCILED means every locally received trade-session
        frame was accounted for. UPSTREAM UNPROVEN means AXI cannot prove
        PumpPortal supplied every market trade.
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
  latencyKey: TradeDataCoverageLatencyKey;
  session: TradeDataCoverageSession | null;
}) {
  const distribution: TradeDataCoverageLatencyDistribution | undefined =
    session?.latencyDistributions[latencyKey];
  return (
    <MetricValue
      label={label}
      value={tradeLatencyPercentiles(session, latencyKey)}
      detail={
        distribution
          ? `${distribution.availableCount} available / ${distribution.unavailableCount} unavailable`
          : "—"
      }
    />
  );
}

function availability(value: boolean | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : value
      ? "available"
      : "unavailable";
}
