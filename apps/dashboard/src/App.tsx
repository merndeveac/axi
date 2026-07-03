import { useEffect, useMemo, useState } from "react";
import type {
  CandidateDecision,
  ChainVerificationStatus,
  MarketObservationSummary,
  OverlaySignal,
  RiskSnapshot,
  RollingMetricsSnapshot,
  WatchPlanSummary
} from "@axi/shared";

type ConnectionStatus = "connecting" | "open" | "closed";
type ApiStatus = "checking" | "connected" | "disconnected";

type StorageStats = {
  databasePath: string;
  feedEventCount: number;
  signalCount: number;
  chainVerificationCount: number;
  chainTransactionEventCount: number;
  chainTradeEventCount: number;
  marketObservationCount: number;
  watchPlanCount: number;
  watchActionCount: number;
  riskSnapshotCount: number;
  candidateDecisionCount: number;
  paperOrderCount: number;
  paperPositionCount: number;
  lastSignalAt: string | null;
};

type HealthStatus = {
  candidateCount: number;
  candidateLifecycleEnabled: boolean;
  chainEventsConfigured: boolean;
  chainEventsEnabled: boolean;
  chainTradeEventCount: number;
  chainTransactionEventCount: number;
  chainWatchedAddressCount: number;
  chainVerificationCount: number;
  chainVerifier: ChainVerifierStatus;
  feedProvider: string;
  marketDataEnabled: boolean;
  marketDataMinConfidence: string;
  marketObservationCount: number;
  watchOrchestratorEnabled: boolean;
  watchPlanCount: number;
  watchActionCount: number;
  metricsEnabled: boolean;
  mode: string;
  paperAutoOrder: boolean;
  paperOnly: boolean;
  riskEnabled: boolean;
  status: string;
  trackedTokenCount: number;
  solUsdConfigured: boolean;
};

type ChainVerifierStatus = {
  cacheSize: number;
  configured: boolean;
  enabled: boolean;
  inFlightCount: number;
  maxConcurrent: number;
  onMigration: boolean;
  onMock: boolean;
  onNewToken: boolean;
  paperOnly: true;
  rpcHttpUrlConfigured: boolean;
  status: "disabled" | "config_error" | "ready";
};

type ChainEventsStatus = {
  backfillOnStart: boolean;
  configured: boolean;
  enabled: boolean;
  fetchTransactionOnLog: boolean;
  lastError: string | null;
  maxWatchedAddresses: number;
  paperOnly: true;
  rpcHttpConfigured: boolean;
  rpcWsConfigured: boolean;
  status: "disabled" | "config_error" | "ready" | "running";
  subscriptions: number;
  watchedAddressCount: number;
};

type MarketStatus = {
  allowSolUsdConversion: boolean;
  allowUsdFromStableQuotes: boolean;
  enabled: boolean;
  minConfidenceForMetrics: string;
  observationCount: number;
  paperOnly: true;
  solUsdConfigured: boolean;
};

type WatchStatus = {
  enabled: boolean;
  verifyOnNewToken: boolean;
  verifyOnMigration: boolean;
  watchOnNewToken: boolean;
  watchOnMigration: boolean;
  maxTargetsPerCandidate: number;
  minConfidenceToWatch: string;
  chainVerifierEnabled: boolean;
  chainVerifierConfigured: boolean;
  chainEventsEnabled: boolean;
  chainEventsConfigured: boolean;
  watchedAddressCount: number;
  watchPlanCount: number;
  watchActionCount: number;
  paperOnly: true;
};

type WatchTargetRow = {
  address: string;
  kind: string;
  confidence: string;
  reasonCodes: string[];
  source: string;
};

type WatchPlanRow = {
  id: number;
  mint: string;
  symbol?: string;
  source?: string;
  shouldVerifyMint: boolean;
  shouldWatchEvents: boolean;
  watchTargets: WatchTargetRow[];
  skippedTargets: WatchTargetRow[];
  reasonCodes: string[];
  createdAt: string;
};

type WatchActionRow = {
  id: number;
  mint: string;
  action: string;
  address: string;
  addressKind: string;
  status: string;
  reasonCodes: string[];
  createdAt: string;
};

type WatchedAddressRow = {
  address: string;
  addedAt: string;
  kind: string;
  label?: string;
  mint?: string;
  reasonCodes: string[];
  source?: string;
  symbol?: string;
};

type ChainTransactionRow = {
  id: number;
  signature: string;
  watchedAddress: string;
  watchedAddressKind: string;
  mint?: string;
  status: string;
  reasonCodes: string[];
  receivedAt: string;
  createdAt: string;
};

type ChainTradeRow = {
  id: number;
  signature: string;
  mint: string;
  side: string;
  confidence: string;
  priceUsd?: number | null;
  volumeUsd?: number | null;
  tokenAmount?: number | null;
  watchedAddress: string;
  reasonCodes: string[];
  timestamp: string;
  createdAt: string;
};

type MarketObservationRow = {
  id: number;
  signature: string;
  mint: string;
  side: string;
  quoteAsset: string;
  quoteMint: string | null;
  baseTokenAmount: number | null;
  quoteAmount: number | null;
  priceQuote: number | null;
  priceSol: number | null;
  priceUsd: number | null;
  volumeSol: number | null;
  volumeUsd: number | null;
  confidence: string;
  usableForMetrics: boolean;
  reasonCodes: string[];
  createdAt: string;
};

type CandidateApiRow = {
  mint: string;
  symbol?: string;
  name?: string;
  source?: string;
  lifecycleState: string;
  chainVerificationStatus?: ChainVerificationStatus;
  chainVerifiedAt?: string;
  chainReasonCodes?: string[];
  onChainMintAuthorityActive?: boolean | null;
  onChainFreezeAuthorityActive?: boolean | null;
  onChainTopHolderPct?: number | null;
  onChainTop10HolderPct?: number | null;
  latestDecision?: CandidateDecision;
  latestMetrics?: RollingMetricsSnapshot;
  latestRisk?: RiskSnapshot;
  latestMarketObservationSummary?: MarketObservationSummary;
  latestWatchPlanSummary?: WatchPlanSummary;
  lastUpdatedAt: string;
  marketReasonCodes?: string[];
  watchReasonCodes?: string[];
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
  const [chainStatus, setChainStatus] = useState<ChainVerifierStatus | null>(null);
  const [chainEventsStatus, setChainEventsStatus] =
    useState<ChainEventsStatus | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatus | null>(null);
  const [chainTransactions, setChainTransactions] = useState<
    ChainTransactionRow[]
  >([]);
  const [chainTrades, setChainTrades] = useState<ChainTradeRow[]>([]);
  const [marketObservations, setMarketObservations] = useState<
    MarketObservationRow[]
  >([]);
  const [watchPlans, setWatchPlans] = useState<WatchPlanRow[]>([]);
  const [watchActions, setWatchActions] = useState<WatchActionRow[]>([]);
  const [watchedAddresses, setWatchedAddresses] = useState<WatchedAddressRow[]>(
    []
  );
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
        const [
          healthResponse,
          statsResponse,
          candidatesResponse,
          chainResponse,
          chainEventsResponse,
          marketStatusResponse,
          watchStatusResponse,
          watchedAddressesResponse,
          chainTransactionsResponse,
          chainTradesResponse,
          marketObservationsResponse,
          watchPlansResponse,
          watchActionsResponse
        ] = await Promise.all([
          fetch(`${apiBaseUrl}/health`),
          fetch(`${apiBaseUrl}/storage/stats`),
          fetch(`${apiBaseUrl}/candidates`),
          fetch(`${apiBaseUrl}/chain/status`),
          fetch(`${apiBaseUrl}/chain/events/status`),
          fetch(`${apiBaseUrl}/market/status`),
          fetch(`${apiBaseUrl}/watch/status`),
          fetch(`${apiBaseUrl}/chain/events/watches`),
          fetch(`${apiBaseUrl}/chain/events/transactions?limit=10`),
          fetch(`${apiBaseUrl}/chain/events/trades?limit=10`),
          fetch(`${apiBaseUrl}/market/observations?limit=10`),
          fetch(`${apiBaseUrl}/watch/plans?limit=10`),
          fetch(`${apiBaseUrl}/watch/actions?limit=10`)
        ]);

        if (
          !healthResponse.ok ||
          !statsResponse.ok ||
          !candidatesResponse.ok ||
          !chainResponse.ok ||
          !chainEventsResponse.ok ||
          !marketStatusResponse.ok ||
          !watchStatusResponse.ok ||
          !watchedAddressesResponse.ok ||
          !chainTransactionsResponse.ok ||
          !chainTradesResponse.ok ||
          !marketObservationsResponse.ok ||
          !watchPlansResponse.ok ||
          !watchActionsResponse.ok
        ) {
          throw new Error("API status check failed");
        }

        const health = (await healthResponse.json()) as HealthStatus;
        const stats = (await statsResponse.json()) as StorageStats;
        const nextCandidates =
          (await candidatesResponse.json()) as CandidateApiRow[];
        const nextChainStatus =
          (await chainResponse.json()) as ChainVerifierStatus;
        const nextChainEventsStatus =
          (await chainEventsResponse.json()) as ChainEventsStatus;
        const nextMarketStatus =
          (await marketStatusResponse.json()) as MarketStatus;
        const nextWatchStatus =
          (await watchStatusResponse.json()) as WatchStatus;
        const nextWatchedAddresses =
          (await watchedAddressesResponse.json()) as WatchedAddressRow[];
        const nextChainTransactions =
          (await chainTransactionsResponse.json()) as ChainTransactionRow[];
        const nextChainTrades =
          (await chainTradesResponse.json()) as ChainTradeRow[];
        const nextMarketObservations =
          (await marketObservationsResponse.json()) as MarketObservationRow[];
        const nextWatchPlans =
          (await watchPlansResponse.json()) as WatchPlanRow[];
        const nextWatchActions =
          (await watchActionsResponse.json()) as WatchActionRow[];

        if (!cancelled) {
          setApiStatus("connected");
          setCandidates(nextCandidates);
          setChainStatus(nextChainStatus);
          setChainEventsStatus(nextChainEventsStatus);
          setMarketStatus(nextMarketStatus);
          setWatchStatus(nextWatchStatus);
          setWatchedAddresses(nextWatchedAddresses);
          setChainTransactions(nextChainTransactions);
          setChainTrades(nextChainTrades);
          setMarketObservations(nextMarketObservations);
          setWatchPlans(nextWatchPlans);
          setWatchActions(nextWatchActions);
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
          <span>Chain</span>
          <strong>{chainStatus?.status ?? healthStatus?.chainVerifier.status ?? "unknown"}</strong>
        </div>
        <div>
          <span>Chain Events</span>
          <strong>{chainEventsStatus?.status ?? "unknown"}</strong>
        </div>
        <div>
          <span>Market Data</span>
          <strong>{marketStatus?.enabled ? "on" : "off"}</strong>
        </div>
        <div>
          <span>Watch Orch</span>
          <strong>
            {(watchStatus?.enabled ?? healthStatus?.watchOrchestratorEnabled)
              ? "on"
              : "off"}
          </strong>
        </div>
        <div>
          <span>Verify Trigger</span>
          <strong>
            {watchStatus?.verifyOnNewToken || watchStatus?.verifyOnMigration
              ? "on"
              : "off"}
          </strong>
        </div>
        <div>
          <span>Watch Trigger</span>
          <strong>
            {watchStatus?.watchOnNewToken || watchStatus?.watchOnMigration
              ? "on"
              : "off"}
          </strong>
        </div>
        <div>
          <span>Watch Plans</span>
          <strong>
            {storageStats?.watchPlanCount ??
              watchStatus?.watchPlanCount ??
              healthStatus?.watchPlanCount ??
              0}
          </strong>
        </div>
        <div>
          <span>Watch Actions</span>
          <strong>
            {storageStats?.watchActionCount ??
              watchStatus?.watchActionCount ??
              healthStatus?.watchActionCount ??
              0}
          </strong>
        </div>
        <div>
          <span>Watch Min</span>
          <strong>{watchStatus?.minConfidenceToWatch ?? "unknown"}</strong>
        </div>
        <div>
          <span>Market Obs</span>
          <strong>
            {storageStats?.marketObservationCount ??
              marketStatus?.observationCount ??
              healthStatus?.marketObservationCount ??
              0}
          </strong>
        </div>
        <div>
          <span>Market Min</span>
          <strong>
            {marketStatus?.minConfidenceForMetrics ??
              healthStatus?.marketDataMinConfidence ??
              "unknown"}
          </strong>
        </div>
        <div>
          <span>SOL/USD</span>
          <strong>
            {(marketStatus?.solUsdConfigured ??
            healthStatus?.solUsdConfigured)
              ? "configured"
              : "unset"}
          </strong>
        </div>
        <div>
          <span>Chain Event RPC</span>
          <strong>{chainEventsStatus?.configured ? "configured" : "unset"}</strong>
        </div>
        <div>
          <span>Watched</span>
          <strong>
            {chainEventsStatus?.watchedAddressCount ??
              healthStatus?.chainWatchedAddressCount ??
              0}
          </strong>
        </div>
        <div>
          <span>Chain Tx</span>
          <strong>
            {storageStats?.chainTransactionEventCount ??
              healthStatus?.chainTransactionEventCount ??
              0}
          </strong>
        </div>
        <div>
          <span>Chain Trades</span>
          <strong>
            {storageStats?.chainTradeEventCount ??
              healthStatus?.chainTradeEventCount ??
              0}
          </strong>
        </div>
        <div>
          <span>Paper Only</span>
          <strong>{healthStatus?.paperOnly ? "yes" : "unknown"}</strong>
        </div>
        <div>
          <span>RPC</span>
          <strong>{chainStatus?.rpcHttpUrlConfigured ? "configured" : "unset"}</strong>
        </div>
        <div>
          <span>Chain Reads</span>
          <strong>{storageStats?.chainVerificationCount ?? 0}</strong>
        </div>
        <div>
          <span>Chain Cache</span>
          <strong>{chainStatus?.cacheSize ?? 0}</strong>
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

      <section className="table-region watch-region" aria-label="Watch orchestration plans">
        <div className="table-heading">
          <h2>Watch Orchestration Plans</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Mint</th>
              <th>Symbol</th>
              <th>Source</th>
              <th>Verify</th>
              <th>Watch</th>
              <th>Selected</th>
              <th>Skipped</th>
              <th>Reasons</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {watchPlans.map((plan) => (
              <tr key={plan.id}>
                <td className="mono" title={plan.mint}>
                  {shortMint(plan.mint)}
                </td>
                <td>{plan.symbol ?? "UNKNOWN"}</td>
                <td>{plan.source ?? "unknown"}</td>
                <td>{plan.shouldVerifyMint ? "yes" : "no"}</td>
                <td>{plan.shouldWatchEvents ? "yes" : "no"}</td>
                <td>{formatTargets(plan.watchTargets)}</td>
                <td>{formatTargets(plan.skippedTargets)}</td>
                <td>{topReasonCodes(plan.reasonCodes)}</td>
                <td>{formatTimestamp(plan.createdAt)}</td>
              </tr>
            ))}
            {watchPlans.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state compact-empty">
                  No persisted watch plans
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-region watch-region" aria-label="Watch orchestration actions">
        <div className="table-heading">
          <h2>Watch Orchestration Actions</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Mint</th>
              <th>Action</th>
              <th>Address</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Reasons</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {watchActions.map((action) => (
              <tr key={action.id}>
                <td className="mono" title={action.mint}>
                  {shortMint(action.mint)}
                </td>
                <td>{action.action}</td>
                <td className="mono" title={action.address}>
                  {shortMint(action.address)}
                </td>
                <td>{action.addressKind}</td>
                <td>{action.status}</td>
                <td>{topReasonCodes(action.reasonCodes)}</td>
                <td>{formatTimestamp(action.createdAt)}</td>
              </tr>
            ))}
            {watchActions.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state compact-empty">
                  No persisted watch actions
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-region chain-events-region" aria-label="Chain events">
        <div className="table-heading">
          <h2>Read-Only Chain Events</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Address</th>
              <th>Mint</th>
              <th>Source</th>
              <th>Reasons</th>
              <th>Observed</th>
            </tr>
          </thead>
          <tbody>
            {watchedAddresses.map((watch) => (
              <tr key={watch.address}>
                <td>{watch.kind}</td>
                <td className="mono" title={watch.address}>
                  {shortMint(watch.address)}
                </td>
                <td className="mono" title={watch.mint ?? ""}>
                  {watch.mint ? shortMint(watch.mint) : "-"}
                </td>
                <td>{watch.source ?? "manual"}</td>
                <td>{topReasonCodes(watch.reasonCodes)}</td>
                <td>{formatTimestamp(watch.addedAt)}</td>
              </tr>
            ))}
            {watchedAddresses.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state compact-empty">
                  No read-only watched addresses
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-region chain-events-region" aria-label="Recent chain transactions">
        <div className="table-heading">
          <h2>Recent Chain Transactions</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Signature</th>
              <th>Status</th>
              <th>Watched</th>
              <th>Kind</th>
              <th>Mint</th>
              <th>Reasons</th>
              <th>Observed</th>
            </tr>
          </thead>
          <tbody>
            {chainTransactions.map((event) => (
              <tr key={`${event.id}-${event.signature}`}>
                <td className="mono" title={event.signature}>
                  {shortMint(event.signature)}
                </td>
                <td>{event.status}</td>
                <td className="mono" title={event.watchedAddress}>
                  {shortMint(event.watchedAddress)}
                </td>
                <td>{event.watchedAddressKind}</td>
                <td className="mono" title={event.mint ?? ""}>
                  {event.mint ? shortMint(event.mint) : "-"}
                </td>
                <td>{topReasonCodes(event.reasonCodes)}</td>
                <td>{formatTimestamp(event.receivedAt ?? event.createdAt)}</td>
              </tr>
            ))}
            {chainTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state compact-empty">
                  No persisted chain transactions
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-region chain-events-region" aria-label="Recent chain trades">
        <div className="table-heading">
          <h2>Recent Chain Trades</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Signature</th>
              <th>Mint</th>
              <th>Side</th>
              <th>Confidence</th>
              <th>Price</th>
              <th>Volume</th>
              <th>Tokens</th>
              <th>Watched</th>
              <th>Reasons</th>
              <th>Observed</th>
            </tr>
          </thead>
          <tbody>
            {chainTrades.map((event) => (
              <tr key={`${event.id}-${event.signature}`}>
                <td className="mono" title={event.signature}>
                  {shortMint(event.signature)}
                </td>
                <td className="mono" title={event.mint}>
                  {shortMint(event.mint)}
                </td>
                <td>{event.side}</td>
                <td>{event.confidence}</td>
                <td>{event.priceUsd == null ? "-" : formatUsd(event.priceUsd)}</td>
                <td>{event.volumeUsd == null ? "-" : formatUsd(event.volumeUsd)}</td>
                <td>{formatNullableNumber(event.tokenAmount)}</td>
                <td className="mono" title={event.watchedAddress}>
                  {shortMint(event.watchedAddress)}
                </td>
                <td>{topReasonCodes(event.reasonCodes)}</td>
                <td>{formatTimestamp(event.timestamp ?? event.createdAt)}</td>
              </tr>
            ))}
            {chainTrades.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-state compact-empty">
                  No persisted chain trades
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-region market-region" aria-label="Market observations">
        <div className="table-heading">
          <h2>Market Observations</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Mint</th>
              <th>Side</th>
              <th>Quote</th>
              <th>Base Amt</th>
              <th>Quote Amt</th>
              <th>Price Quote</th>
              <th>Price SOL</th>
              <th>Price USD</th>
              <th>Vol SOL</th>
              <th>Vol USD</th>
              <th>Confidence</th>
              <th>Usable</th>
              <th>Reasons</th>
              <th>Signature</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {marketObservations.map((observation) => (
              <tr key={`${observation.id}-${observation.signature}`}>
                <td className="mono" title={observation.mint}>
                  {shortMint(observation.mint)}
                </td>
                <td>{observation.side}</td>
                <td>{observation.quoteAsset}</td>
                <td>{formatNullableNumber(observation.baseTokenAmount)}</td>
                <td>{formatNullableNumber(observation.quoteAmount)}</td>
                <td>{formatNullableNumber(observation.priceQuote)}</td>
                <td>{formatNullableNumber(observation.priceSol)}</td>
                <td>{formatNullableUsd(observation.priceUsd)}</td>
                <td>{formatNullableNumber(observation.volumeSol)}</td>
                <td>{formatNullableUsd(observation.volumeUsd)}</td>
                <td>{observation.confidence}</td>
                <td>{observation.usableForMetrics ? "yes" : "no"}</td>
                <td>{topReasonCodes(observation.reasonCodes)}</td>
                <td className="mono" title={observation.signature}>
                  {shortMint(observation.signature)}
                </td>
                <td>{formatTimestamp(observation.createdAt)}</td>
              </tr>
            ))}
            {marketObservations.length === 0 ? (
              <tr>
                <td colSpan={15} className="empty-state compact-empty">
                  No persisted market observations
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
              <th>Chain</th>
              <th>Mint Auth</th>
              <th>Freeze Auth</th>
              <th>Top Holder</th>
              <th>Top 10</th>
              <th>Chain Reasons</th>
              <th>Watch Targets</th>
              <th>Watch Status</th>
              <th>Watch Reasons</th>
              <th>Reasons</th>
              <th>10s USD</th>
              <th>10s SOL</th>
              <th>SOL Fallback</th>
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
                  <td>{candidate.chainVerificationStatus ?? "not_checked"}</td>
                  <td>{formatNullableBoolean(candidate.onChainMintAuthorityActive)}</td>
                  <td>{formatNullableBoolean(candidate.onChainFreezeAuthorityActive)}</td>
                  <td>{formatPercent(candidate.onChainTopHolderPct)}</td>
                  <td>{formatPercent(candidate.onChainTop10HolderPct)}</td>
                  <td>{topReasonCodes(candidate.chainReasonCodes)}</td>
                  <td>
                    {candidate.latestWatchPlanSummary?.selectedTargetCount ?? 0}
                  </td>
                  <td>{formatWatchSummary(candidate.latestWatchPlanSummary)}</td>
                  <td>{topReasonCodes(candidate.watchReasonCodes)}</td>
                  <td>{topReasonCodes(decision?.combinedReasonCodes)}</td>
                  <td>{formatUsd(candidate.latestMetrics?.windows["10s"].totalVolumeUsd ?? 0)}</td>
                  <td>{formatNullableNumber(candidate.latestMetrics?.windows["10s"].totalVolumeSol)}</td>
                  <td>{candidate.latestMetrics?.usedSolMetricsFallback ? "yes" : "no"}</td>
                  <td>{formatNumber(effectiveVolumeVelocity(candidate.latestMetrics))}</td>
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
                <td colSpan={26} className="empty-state">
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
              <th>10s SOL</th>
              <th>SOL Fallback</th>
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
                <td>{formatNullableNumber(metricVolumeSol(signal, "10s"))}</td>
                <td>{signal.rollingMetrics?.usedSolMetricsFallback ? "yes" : "no"}</td>
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
                <td colSpan={22} className="empty-state">
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

function metricVolumeSol(
  signal: OverlaySignal,
  window: "1s" | "5s" | "10s"
): number | undefined {
  return signal.rollingMetrics?.windows[window].totalVolumeSol;
}

function effectiveVolumeVelocity(
  metrics: RollingMetricsSnapshot | undefined
): number | undefined {
  if (!metrics) {
    return undefined;
  }

  return metrics.usedSolMetricsFallback
    ? metrics.volumeVelocitySolPerSec
    : metrics.volumeVelocityUsdPerSec;
}

function normalizeClassName(value: string): string {
  return value.toLowerCase();
}

function topReasonCodes(reasonCodes: string[] | undefined): string {
  return reasonCodes?.slice(0, 3).join(", ") || "-";
}

function formatTargets(targets: WatchTargetRow[] | undefined): string {
  if (!targets || targets.length === 0) {
    return "-";
  }

  return targets
    .slice(0, 3)
    .map((target) => `${target.kind}:${shortMint(target.address)}`)
    .join(", ");
}

function formatWatchSummary(summary: WatchPlanSummary | undefined): string {
  if (!summary) {
    return "-";
  }

  if (summary.shouldVerifyMint && summary.shouldWatchEvents) {
    return "verify + watch";
  }

  if (summary.shouldVerifyMint) {
    return "verify";
  }

  if (summary.shouldWatchEvents) {
    return "watch";
  }

  return "dry-run";
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(2);
}

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : value.toFixed(4);
}

function formatUsd(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }

  return `$${value.toFixed(0)}`;
}

function formatNullableUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return formatUsd(value);
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${value.toFixed(2)}%`;
}

function formatNullableBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return value ? "yes" : "no";
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
