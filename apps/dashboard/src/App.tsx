import { useEffect, useMemo, useState } from "react";
import type { OverlaySignal, RiskFlags } from "@axi/shared";

type ConnectionStatus = "connecting" | "open" | "closed";

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

export function App() {
  const [signals, setSignals] = useState<OverlaySignal[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
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

  const sortedSignals = useMemo(
    () => [...signals].sort((left, right) => right.score - left.score),
    [signals]
  );

  const buyReadyCount = signals.filter(
    (signal) => signal.action === "BUY_READY"
  ).length;
  const hardRejectCount = signals.filter((signal) => signal.hardReject).length;

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

      <section className="table-region" aria-label="Live token signals">
        <table>
          <thead>
            <tr>
              <th>Mint</th>
              <th>Symbol</th>
              <th>Score</th>
              <th>Action</th>
              <th>Reject</th>
              <th>Reasons</th>
              <th>Vol Vel</th>
              <th>Buyer Vel</th>
              <th>Risk Flags</th>
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
                <td>{signal.hardReject ? "yes" : "no"}</td>
                <td>{signal.reasonCodes.slice(0, 3).join(", ")}</td>
                <td>{signal.volumeVelocity.toFixed(2)}</td>
                <td>{signal.buyerVelocity.toFixed(2)}</td>
                <td>{activeRiskFlags(signal.riskFlags).join(", ") || "none"}</td>
              </tr>
            ))}
            {sortedSignals.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state">
                  Waiting for local paper signals
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

function activeRiskFlags(riskFlags: RiskFlags): string[] {
  return Object.entries(riskFlags)
    .filter(([, active]) => active)
    .map(([flag]) => flag);
}
