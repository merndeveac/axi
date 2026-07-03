import { useEffect, useMemo, useState } from "react";
import type {
  CandidateDecision,
  OverlaySignal,
  RiskSnapshot,
  RollingMetricsSnapshot
} from "@axi/shared";

type ConnectionStatus = "connecting" | "open" | "closed";
type ApiStatus = "checking" | "connected" | "disconnected";

type StorageStats = {
  databasePath: string;
  feedEventCount: number;
  signalCount: number;
  riskSnapshotCount: number;
  candidateDecisionCount: number;
  paperOrderCount: number;
  paperPositionCount: number;
  lastSignalAt: string | null;
};

type HealthStatus = {
  candidateCount: number;
  candidateLifecycleEnabled: boolean;
  feedProvider: string;
  metricsEnabled: boolean;
  mode: string;
  paperAutoOrder: boolean;
  paperOnly: boolean;
  riskEnabled: boolean;
  status: string;
  trackedTokenCount: number;
};

type CandidateApiRow = {
  mint: string;
  symbol?: string;
  name?: string;
  source?: string;
  lifecycleState: string;
  latestDecision?: CandidateDecision;
  latestMetrics?: RollingMetricsSnapshot;
  latestRisk?: RiskSnapshot;
  lastUpdatedAt: string;
  paperOrderStatus: string;
};

type ServerMessage =
  | {
      type: "snapshot";
      signals: OverlaySignal[];
    }
  | {
      type: "signal";
      signal: OverlaySignal;
    };

const wsUrl =
  import.meta.env.VITE_AXI_WS_URL ?? "ws://localhost:8787/ws/signals";
const apiBaseUrl = import.meta.env.VITE_AXI_API_URL ?? "http://localhost:8787";

export function App() {
  const [signals, setSignals] = useState<OverlaySignal[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [candidates, setCandidates] = useState<CandidateApiRow[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("never");

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retryTimer: number | undefined;
    let closedByReact = false;

    const connect = () => {
      setConnectionStatus("connecting");
      socket = new WebSocket(wsUrl);

      socket.addEventListener("open", () => {
        setConnectionStatus("open");
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;

        if (message.type === "snapshot") {
          setSignals(message.signals);
        }

        if (message.type === "signal") {
          setSignals((current) => upsertSignal(current, message.signal));
        }

        setLastUpdated(new Date().toLocaleTimeString());
      });

      socket.addEventListener("close", () => {
        setConnectionStatus("closed");

        if (!closedByReact) {
          retryTimer = window.setTimeout(connect, 1500);
        }
      });
    };

    connect();

    return () => {
      closedByReact = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }

      socket?.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadApiStatus = async () => {
      try {
        const [healthResponse, statsResponse, candidatesResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/health`),
          fetch(`${apiBaseUrl}/storage/stats`),
          fetch(`${apiBaseUrl}/candidates`)
        ]);

        if (!healthResponse.ok || !statsResponse.ok || !candidatesResponse.ok) {
          throw new Error("API status check failed");
        }

        const health = (await healthResponse.json()) as HealthStatus;
        const stats = (await statsResponse.json()) as StorageStats;
        const nextCandidates =
          (await candidatesResponse.json()) as CandidateApiRow[];

        if (!cancelled) {
          setApiStatus("connected");
          setCandidates(nextCandidates);
          setHealthStatus(health);
          setStorageStats(stats);
        }
      } catch {
        if (!cancelled) {
          setApiStatus("disconnected");
        }
      }
    };

    void loadApiStatus();
    const timer = window.setInterval(() => {
      void loadApiStatus();
    }, 3000);

    return () => {
      cancelled = true;

      window.clearInterval(timer);
    };
  }, []);

  const sortedSignals = useMemo(
    () => [...signals].sort((left, right) => right.score - left.score),
    [signals]
  );
  const sortedCandidates = useMemo(
    () =>
      [...candidates].sort(
        (left, right) =>
          (right.latestDecision?.score ?? 0) -
          (left.latestDecision?.score ?? 0)
      ),
    [candidates]
  );

  const buyReadyCount = signals.filter(
    (signal) => signal.action === "BUY_READY"
  ).length;
  const hardRejectCount = signals.filter((signal) => signal.hardReject).length;
  const incompleteMetricCount = signals.filter((signal) =>
    signal.reasonCodes.includes("INSUFFICIENT_METRICS") ||
    signal.reasonCodes.includes("INSUFFICIENT_TRADE_METRICS")
  ).length;
  const statusMessage = getStatusMessage({
    apiStatus,
    feedProvider: healthStatus?.feedProvider,
    incompleteMetricCount,
    candidateCount: candidates.length,
    signalCount: signals.length,
    storageStats
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">paper mode</p>
          <h1>AXI Signal Console</h1>
        </div>
        <div className={`status-pill status-${connectionStatus}`}>
          {connectionStatus}
        </div>
      </header>

      <section className="metric-strip" aria-label="Signal metrics">
        <div>
          <span>Total</span>
          <strong>{signals.length}</strong>
        </div>
        <div>
          <span>Buy Ready</span>
          <strong>{buyReadyCount}</strong>
        </div>
        <div>
          <span>Hard Reject</span>
          <strong>{hardRejectCount}</strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>{lastUpdated}</strong>
        </div>
      </section>

      <section className="storage-panel" aria-label="Storage status">
        <div>
          <span>API</span>
          <strong>{apiStatus}</strong>
        </div>
        <div>
          <span>Feed</span>
          <strong>{healthStatus?.feedProvider ?? "unknown"}</strong>
        </div>
        <div>
          <span>Metrics</span>
          <strong>{healthStatus?.metricsEnabled ? "on" : "off"}</strong>
        </div>
        <div>
          <span>Risk</span>
          <strong>{healthStatus?.riskEnabled ? "on" : "off"}</strong>
        </div>
        <div>
          <span>Lifecycle</span>
          <strong>{healthStatus?.candidateLifecycleEnabled ? "on" : "off"}</strong>
        </div>
        <div>
          <span>Tracked</span>
          <strong>{healthStatus?.trackedTokenCount ?? 0}</strong>
        </div>
        <div>
          <span>Candidates</span>
          <strong>{healthStatus?.candidateCount ?? candidates.length}</strong>
        </div>
        <div>
          <span>Stored Signals</span>
          <strong>{storageStats?.signalCount ?? signals.length}</strong>
        </div>
        <div>
          <span>Risk Snapshots</span>
          <strong>{storageStats?.riskSnapshotCount ?? 0}</strong>
        </div>
        <div>
          <span>Decisions</span>
          <strong>{storageStats?.candidateDecisionCount ?? 0}</strong>
        </div>
        <div>
          <span>Auto Paper</span>
          <strong>{healthStatus?.paperAutoOrder ? "on" : "off"}</strong>
        </div>
        <div>
          <span>Paper Orders</span>
          <strong>{storageStats?.paperOrderCount ?? 0}</strong>
        </div>
        <div>
          <span>Paper Positions</span>
          <strong>{storageStats?.paperPositionCount ?? 0}</strong>
        </div>
        <div>
          <span>Last Signal</span>
          <strong>{formatTimestamp(storageStats?.lastSignalAt)}</strong>
        </div>
        <div>
          <span>Incomplete</span>
          <strong>{incompleteMetricCount}</strong>
        </div>
      </section>

      <section className="status-message" aria-live="polite">
        {statusMessage}
      </section>

      <section className="table-region candidate-region" aria-label="Candidate lifecycle">
        <div className="table-heading">
          <h2>Candidate Lifecycle</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Mint</th>
              <th>Symbol</th>
              <th>State</th>
              <th>Action</th>
              <th>Score</th>
              <th>Risk</th>
              <th>Hard Reject</th>
              <th>Reasons</th>
              <th>10s Vol</th>
              <th>Vol Vel</th>
              <th>Buyer Vel</th>
              <th>Buy/Sell</th>
              <th>Net Pressure</th>
              <th>Risk Warnings</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {sortedCandidates.map((candidate) => {
              const decision = candidate.latestDecision;
              const risk = candidate.latestRisk;

              return (
                <tr key={candidate.mint}>
                  <td className="mono" title={candidate.mint}>
                    {shortMint(candidate.mint)}
                  </td>
                  <td>{candidate.symbol ?? "UNKNOWN"}</td>
                  <td>
                    <span className={`state state-${candidate.lifecycleState}`}>
                      {candidate.lifecycleState}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`action action-${normalizeClassName(
                        decision?.action ?? "IGNORE"
                      )}`}
                    >
                      {decision?.action ?? "IGNORE"}
                    </span>
                  </td>
                  <td>
                    <span className="score">{decision?.score ?? 0}</span>
                  </td>
                  <td>
                    <span
                      className={`risk-level risk-${risk?.riskLevel ?? "unknown"}`}
                    >
                      {risk?.riskLevel ?? "unknown"}
                    </span>
                  </td>
                  <td>{decision?.hardReject || risk?.hardReject ? "yes" : "no"}</td>
                  <td>{topReasonCodes(decision?.combinedReasonCodes)}</td>
                  <td>{formatUsd(candidate.latestMetrics?.windows["10s"].totalVolumeUsd ?? 0)}</td>
                  <td>{formatNumber(candidate.latestMetrics?.volumeVelocityUsdPerSec)}</td>
                  <td>{formatNumber(candidate.latestMetrics?.buyerVelocityPerSec)}</td>
                  <td>{formatNumber(candidate.latestMetrics?.buySellRatio)}</td>
                  <td>{formatNumber(candidate.latestMetrics?.netBuyPressure)}</td>
                  <td>{topReasonCodes(risk?.reasonCodes)}</td>
                  <td>{formatTimestamp(candidate.lastUpdatedAt)}</td>
                </tr>
              );
            })}
            {sortedCandidates.length === 0 ? (
              <tr>
                <td colSpan={15} className="empty-state">
                  {statusMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-region" aria-label="Live token signals">
        <div className="table-heading">
          <h2>Signals</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Mint</th>
              <th>Symbol</th>
              <th>Score</th>
              <th>Action</th>
              <th>State</th>
              <th>Risk</th>
              <th>Reasons</th>
              <th>Feed</th>
              <th>Insufficient</th>
              <th>1s Vol</th>
              <th>5s Vol</th>
              <th>10s Vol</th>
              <th>Vol Vel</th>
              <th>Vol Acc</th>
              <th>Buyer Vel</th>
              <th>Buyer Acc</th>
              <th>Price Vel</th>
              <th>Buy/Sell</th>
              <th>Net Pressure</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {sortedSignals.map((signal) => (
              <tr key={signal.mint}>
                <td className="mono" title={signal.mint}>
                  {shortMint(signal.mint)}
                </td>
                <td>{signal.symbol}</td>
                <td>
                  <span className="score">{signal.score}</span>
                </td>
                <td>
                  <span className={`action action-${signal.action.toLowerCase()}`}>
                    {signal.action}
                  </span>
                </td>
                <td>
                  <span className={`state state-${signal.lifecycleState ?? "unknown"}`}>
                    {signal.lifecycleState ?? "unknown"}
                  </span>
                </td>
                <td>
                  <span className={`risk-level risk-${signal.riskLevel ?? "unknown"}`}>
                    {signal.riskLevel ?? "unknown"}
                  </span>
                </td>
                <td>{signal.reasonCodes.slice(0, 3).join(", ")}</td>
                <td>{signal.feedProvider ?? healthStatus?.feedProvider ?? "unknown"}</td>
                <td>{signal.insufficientMetrics ? "yes" : "no"}</td>
                <td>{formatUsd(metricVolume(signal, "1s"))}</td>
                <td>{formatUsd(metricVolume(signal, "5s"))}</td>
                <td>{formatUsd(metricVolume(signal, "10s"))}</td>
                <td>{formatNumber(signal.volumeVelocity)}</td>
                <td>{formatNumber(signal.volumeAcceleration)}</td>
                <td>{formatNumber(signal.buyerVelocity)}</td>
                <td>{formatNumber(signal.buyerAcceleration)}</td>
                <td>{formatNumber(signal.priceVelocity)}</td>
                <td>{formatNumber(signal.buySellRatio)}</td>
                <td>{formatNumber(signal.netBuyPressure)}</td>
                <td>{formatTimestamp(signal.rollingMetrics?.lastUpdatedAt)}</td>
              </tr>
            ))}
            {sortedSignals.length === 0 ? (
              <tr>
                <td colSpan={20} className="empty-state">
                  {statusMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function upsertSignal(
  currentSignals: OverlaySignal[],
  nextSignal: OverlaySignal
): OverlaySignal[] {
  const withoutNext = currentSignals.filter(
    (signal) => signal.mint !== nextSignal.mint
  );

  return [nextSignal, ...withoutNext].slice(0, 100);
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 8)}...${mint.slice(-6)}`;
}

function metricVolume(
  signal: OverlaySignal,
  window: "1s" | "5s" | "10s"
): number {
  return signal.rollingMetrics?.windows[window].totalVolumeUsd ?? 0;
}

function normalizeClassName(value: string): string {
  return value.toLowerCase();
}

function topReasonCodes(reasonCodes: string[] | undefined): string {
  return reasonCodes?.slice(0, 3).join(", ") || "-";
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(2);
}

function formatUsd(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }

  return `$${value.toFixed(0)}`;
}

function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return "never";
  }

  return new Date(timestamp).toLocaleTimeString();
}

function getStatusMessage(options: {
  apiStatus: ApiStatus;
  candidateCount: number;
  feedProvider: string | undefined;
  incompleteMetricCount: number;
  signalCount: number;
  storageStats: StorageStats | null;
}): string {
  if (options.apiStatus === "disconnected") {
    return "API disconnected";
  }

  if (options.apiStatus === "checking") {
    return "Checking API";
  }

  if (options.storageStats?.feedEventCount === 0) {
    return "API connected, no persisted mock events yet";
  }

  if (options.candidateCount === 0) {
    return "API connected, waiting for candidate lifecycle data";
  }

  if (
    options.feedProvider === "pumpportal" &&
    options.incompleteMetricCount > 0
  ) {
    return "PumpPortal feed connected with insufficient metrics for scoring";
  }

  if (options.signalCount === 0 && (options.storageStats?.signalCount ?? 0) > 0) {
    return "Persisted paper data exists, waiting for live signals";
  }

  if (options.signalCount === 0) {
    return "API connected, waiting for paper signals";
  }

  if ((options.storageStats?.signalCount ?? 0) > options.signalCount) {
    return "Persistence active with replayable paper data";
  }

  return "Paper signals updating";
}
