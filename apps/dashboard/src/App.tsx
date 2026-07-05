import { useEffect, useMemo, useState } from "react";
import type {
  CandidateDecision,
  ChainVerificationStatus,
  MarketObservationSummary,
  OverlaySignal,
  RiskSnapshot,
  RollingMetricsSnapshot,
  TokenIdentitySummary,
  WatchPlanSummary
} from "@axi/shared";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { DataPanel } from "./components/DataPanel";
import { MetricValue } from "./components/MetricValue";
import { ReasonCodes } from "./components/ReasonCodes";

type ConnectionStatus = "connecting" | "open" | "closed";
type ApiStatus = "checking" | "connected" | "disconnected";

type StorageStats = {
  databasePath: string;
  feedEventCount: number;
  liveFeedEventCount: number;
  signalCount: number;
  chainVerificationCount: number;
  chainTransactionEventCount: number;
  chainTradeEventCount: number;
  marketObservationCount: number;
  pumpPortalTokenTradeEventCount: number;
  actualDataSubscriptionCount: number;
  actualDataSessionCount: number;
  tokenIdentityCount: number;
  tokenIdentityResolvedCount: number;
  tokenIdentityUnresolvedCount: number;
  tokenMetadataFetchCount: number;
  watchPlanCount: number;
  watchActionCount: number;
  riskSnapshotCount: number;
  candidateDecisionCount: number;
  paperOrderCount: number;
  paperPositionCount: number;
  lastSignalAt: string | null;
};

type HealthStatus = {
  actualData: ActualDataStatus;
  actualDataSessionCount: number;
  actualDataSubscriptionCount: number;
  candidateCount: number;
  candidateLifecycleEnabled: boolean;
  chainEventsConfigured: boolean;
  chainEventsEnabled: boolean;
  chainTradeEventCount: number;
  chainTransactionEventCount: number;
  chainWatchedAddressCount: number;
  dataFeedMode: string;
  dataFeed: string;
  dataFeedReasonCodes: string[];
  feed: FeedStatus;
  chainVerificationCount: number;
  chainVerifier: ChainVerifierStatus;
  feedProvider: string;
  historicalMockRowsHidden: boolean;
  liveFeedConnected: boolean;
  liveFeedExpected: boolean;
  liveFeedLastEventAt: string | null;
  liveFeedReady: boolean;
  liveTokenCount: number;
  mockFeedBlocked: boolean;
  mockFeedEnabled: boolean;
  mockRuntimeBlocked: boolean;
  noFeedMode: boolean;
  noRealFeedMessage?: string;
  realDataActive: boolean;
  realDataConfigured: boolean;
  marketDataEnabled: boolean;
  marketDataMinConfidence: string;
  marketObservationCount: number;
  liveFeedEventCount: number;
  pumpPortalTokenTradeEventCount: number;
  tokenIdentity: TokenIdentityStatus;
  tokenIdentityCount: number;
  tokenIdentityResolvedCount: number;
  tokenIdentityUnresolvedCount: number;
  tokenMetadataFetchCount: number;
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

type FeedStatus = {
  mode: string;
  provider: string;
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  connecting: boolean;
  live: boolean;
  realData: boolean;
  subscriptions: string[];
  reconnectAttempts: number;
  lastOpenAt: string | null;
  lastCloseAt: string | null;
  lastMessageAt: string | null;
  lastEventAt: string | null;
  newTokenEventCount: number;
  migrationEventCount: number;
  tokenTradeEventCount: number;
  parseErrorCount: number;
  lastError: string | null;
  reasonCodes: string[];
  paperOnly: true;
};

type LiveStatus = {
  mode: string;
  provider: string;
  sessionId: string;
  live: boolean;
  realData: boolean;
  liveTokenCount: number;
  liveFeedEventCount: number;
  lastEventAt: string | null;
  historicalMockRowsHidden: true;
  reasonCodes: string[];
  paperOnly: true;
  feed: FeedStatus;
};

type ActualDataStatus = {
  acknowledgedMetered: boolean;
  apiKeyConfigured: boolean;
  autoSubscribe: boolean;
  autoSubscribeOnMigration: boolean;
  autoSubscribeOnNewToken: boolean;
  autoSubscribeOnQualified: boolean;
  budgetReached: boolean;
  compatibleProvider: boolean;
  enabled: boolean;
  estimatedMeteredCostSol: number | null;
  manualMintCount: number;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSubscribedTokens: number;
  paperOnly: true;
  provider: string;
  reasonCodes: string[];
  subscribedTokenCount: number;
  totalEventsThisSession: number;
};

type TokenIdentityStatus = {
  enabled: true;
  solanaMetadataEnabled: boolean;
  solanaMetadataConfigured: boolean;
  solanaMetadataOnDemand: boolean;
  solanaMetadataOnNewToken: boolean;
  offchainFetchEnabled: boolean;
  identityCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  lastResolvedAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
  paperOnly: true;
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
  identity?: TokenIdentitySummary;
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

type ActualDataSummary = {
  eventCount: number;
  latestPriceSol: number | null;
  latestRealTradeAt: string | null;
  latestVolumeSol: number | null;
  observationOnly: true;
  paperOnly: true;
  provider: "pumpportal";
  reasonCodes: string[];
  subscriptionStatus: string;
};

type PumpPortalTradeRow = {
  id: number;
  identity?: TokenIdentitySummary;
  mint: string;
  signature: string | null;
  side: string;
  trader: string | null;
  priceSol: number | null;
  volumeSol: number | null;
  tokenAmount: number | null;
  confidence: string;
  usableForMetrics: boolean;
  reasonCodes: string[];
  createdAt: string;
};

type CandidateApiRow = {
  mint: string;
  identity?: TokenIdentitySummary;
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
  actualData?: ActualDataSummary;
  latestWatchPlanSummary?: WatchPlanSummary;
  lastUpdatedAt: string;
  marketReasonCodes?: string[];
  watchReasonCodes?: string[];
  paperOrderStatus: string;
};

type TokenIdentityRow = TokenIdentitySummary & {
  id?: number;
  createdAt?: string;
};

type LiveTokenRow = {
  mint: string;
  name?: string;
  symbol?: string;
  title?: string;
  displayName: string;
  source: "pumpportal";
  sourceMode: "real";
  realData: true;
  eventTypes: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  latestEventAt: string;
  latestSignature?: string;
  rawSource?: string;
  identityConfidence?: string;
  candidateState?: string;
  action?: string;
  riskLevel?: string;
  score?: number;
  reasonCodes: string[];
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
  const [chainStatus, setChainStatus] = useState<ChainVerifierStatus | null>(
    null
  );
  const [chainEventsStatus, setChainEventsStatus] =
    useState<ChainEventsStatus | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [actualDataStatus, setActualDataStatus] =
    useState<ActualDataStatus | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [liveTokens, setLiveTokens] = useState<LiveTokenRow[]>([]);
  const [actualTrades, setActualTrades] = useState<PumpPortalTradeRow[]>([]);
  const [tokenIdentityStatus, setTokenIdentityStatus] =
    useState<TokenIdentityStatus | null>(null);
  const [tokenIdentities, setTokenIdentities] = useState<TokenIdentityRow[]>(
    []
  );
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
          feedStatusResponse,
          liveStatusResponse,
          liveTokensResponse,
          actualDataStatusResponse,
          actualTradesResponse,
          tokenIdentityStatusResponse,
          tokenIdentitiesResponse,
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
          fetch(`${apiBaseUrl}/feed/status`),
          fetch(`${apiBaseUrl}/live/status`),
          fetch(`${apiBaseUrl}/live/tokens`),
          fetch(`${apiBaseUrl}/actual-data/status`),
          fetch(`${apiBaseUrl}/actual-data/trades?limit=10`),
          fetch(`${apiBaseUrl}/tokens/status`),
          fetch(`${apiBaseUrl}/tokens?limit=25`),
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
          !feedStatusResponse.ok ||
          !liveStatusResponse.ok ||
          !liveTokensResponse.ok ||
          !actualDataStatusResponse.ok ||
          !actualTradesResponse.ok ||
          !tokenIdentityStatusResponse.ok ||
          !tokenIdentitiesResponse.ok ||
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
        const nextFeedStatus = (await feedStatusResponse.json()) as FeedStatus;
        const nextLiveStatus = (await liveStatusResponse.json()) as LiveStatus;
        const nextLiveTokens =
          (await liveTokensResponse.json()) as LiveTokenRow[];
        const nextActualDataStatus =
          (await actualDataStatusResponse.json()) as ActualDataStatus;
        const nextActualTrades =
          (await actualTradesResponse.json()) as PumpPortalTradeRow[];
        const nextTokenIdentityStatus =
          (await tokenIdentityStatusResponse.json()) as TokenIdentityStatus;
        const nextTokenIdentities =
          (await tokenIdentitiesResponse.json()) as TokenIdentityRow[];
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
          setFeedStatus(nextFeedStatus);
          setLiveStatus(nextLiveStatus);
          setLiveTokens(nextLiveTokens);
          setActualDataStatus(nextActualDataStatus);
          setActualTrades(nextActualTrades);
          setTokenIdentityStatus(nextTokenIdentityStatus);
          setTokenIdentities(nextTokenIdentities);
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
          (right.latestDecision?.score ?? 0) - (left.latestDecision?.score ?? 0)
      ),
    [candidates]
  );

  const buyReadyCount = signals.filter(
    (signal) => signal.action === "BUY_READY"
  ).length;
  const hardRejectCount = signals.filter((signal) => signal.hardReject).length;
  const incompleteMetricCount = signals.filter(
    (signal) =>
      signal.reasonCodes.includes("INSUFFICIENT_METRICS") ||
      signal.reasonCodes.includes("INSUFFICIENT_TRADE_METRICS")
  ).length;
  const statusMessage = getStatusMessage({
    apiStatus,
    feedProvider: healthStatus?.feedProvider,
    feedStatus,
    liveStatus,
    noFeedMode: healthStatus?.noFeedMode,
    noRealFeedMessage: healthStatus?.noRealFeedMessage,
    incompleteMetricCount,
    candidateCount: candidates.length,
    signalCount: signals.length,
    storageStats
  });
  const modeLabel = (healthStatus?.mode ?? "paper").toUpperCase();
  const feedModeLabel = (
    feedStatus?.mode ??
    healthStatus?.dataFeedMode ??
    "unknown"
  ).toUpperCase();
  const feedLabel = (
    feedStatus?.provider ??
    healthStatus?.dataFeed ??
    healthStatus?.feedProvider ??
    "unknown"
  ).toUpperCase();
  const liveConnectionLabel = getLiveConnectionLabel(feedStatus, healthStatus);
  const liveConnectionTone = getLiveConnectionTone(feedStatus, healthStatus);
  const apiLabel =
    apiStatus === "connected"
      ? "ONLINE"
      : apiStatus === "checking"
        ? "CHECKING"
        : "OFFLINE";
  const apiTone =
    apiStatus === "connected"
      ? "online"
      : apiStatus === "checking"
        ? "warning"
        : "offline";
  const websocketLabel =
    connectionStatus === "open"
      ? "ONLINE"
      : connectionStatus === "connecting"
        ? "CONNECTING"
        : "OFFLINE";
  const websocketTone =
    connectionStatus === "open"
      ? "online"
      : connectionStatus === "connecting"
        ? "warning"
        : "offline";
  const actualData = actualDataStatus ?? healthStatus?.actualData ?? null;
  const identityStatus =
    tokenIdentityStatus ?? healthStatus?.tokenIdentity ?? null;
  const actualDataLabel =
    actualData?.enabled && actualData.compatibleProvider
      ? "REAL/PUMPPORTAL"
      : healthStatus?.mockFeedEnabled
        ? "MOCK"
        : healthStatus?.noFeedMode
          ? "NO REAL FEED"
          : "PAPER FEED";

  return (
    <main className="app-shell">
      <header className="command-bar">
        <div className="brand-cluster">
          <span className="prompt">&gt;</span>
          <div>
            <p className="eyebrow">operator console</p>
            <h1>AXI</h1>
          </div>
          <span className="terminal-cursor" aria-hidden="true" />
        </div>
        <div className="command-status" aria-label="Runtime status">
          <ConnectionBadge label={modeLabel} tone="online" />
          <ConnectionBadge label={`MODE ${feedModeLabel}`} tone="online" />
          <ConnectionBadge label={`FEED ${feedLabel}`} tone="neutral" />
          <ConnectionBadge
            label={liveConnectionLabel}
            tone={liveConnectionTone}
          />
          <ConnectionBadge label="PAPER ONLY" tone="online" />
          <ConnectionBadge label={`API ${apiLabel}`} tone={apiTone} />
          <ConnectionBadge
            label={`WS ${websocketLabel}`}
            tone={websocketTone}
          />
          <span className="last-update">LAST MSG {lastUpdated}</span>
        </div>
      </header>

      <section className="status-grid" aria-label="System status">
        <MetricValue label="feed" value={feedLabel} detail="source" />
        <MetricValue label="feed mode" value={feedModeLabel} detail="runtime" />
        <MetricValue
          label="live feed"
          value={liveConnectionLabel}
          detail={formatTimestamp(
            feedStatus?.lastEventAt ?? liveStatus?.lastEventAt
          )}
          tone={
            liveConnectionTone === "online"
              ? "good"
              : liveConnectionTone === "warning"
                ? "warn"
                : "bad"
          }
        />
        <MetricValue
          label="live tokens"
          value={formatCompactNumber(
            liveStatus?.liveTokenCount ?? liveTokens.length
          )}
          detail="current session"
          tone={
            (liveStatus?.liveTokenCount ?? liveTokens.length) > 0
              ? "good"
              : "neutral"
          }
        />
        <MetricValue
          label="real data"
          value={healthStatus?.realDataConfigured ? "[CFG]" : "[NONE]"}
          detail={healthStatus?.realDataActive ? "active" : "inactive"}
          tone={healthStatus?.realDataActive ? "good" : "neutral"}
        />
        <MetricValue
          label="mock"
          value={
            healthStatus?.mockFeedEnabled
              ? "[ON]"
              : healthStatus?.mockFeedBlocked
                ? "[BLOCKED]"
                : "[OFF]"
          }
          detail={
            healthStatus?.mockFeedBlocked
              ? "explicit opt-in required"
              : "runtime"
          }
          tone={
            healthStatus?.mockFeedEnabled
              ? "warn"
              : healthStatus?.mockFeedBlocked
                ? "bad"
                : "neutral"
          }
        />
        <MetricValue
          label="signals"
          value={formatCompactNumber(signals.length)}
          detail={`${formatCompactNumber(storageStats?.signalCount ?? 0)} stored`}
          tone="good"
        />
        <MetricValue
          label="buy ready"
          value={formatCompactNumber(buyReadyCount)}
          detail="paper signal"
          tone={buyReadyCount > 0 ? "good" : "neutral"}
        />
        <MetricValue
          label="hard reject"
          value={formatCompactNumber(hardRejectCount)}
          detail="blocked"
          tone={hardRejectCount > 0 ? "bad" : "neutral"}
        />
        <MetricValue
          label="metrics"
          value={healthStatus?.metricsEnabled ? "[ON]" : "[OFF]"}
          detail={`${incompleteMetricCount} incomplete`}
          tone={healthStatus?.metricsEnabled ? "good" : "bad"}
        />
        <MetricValue
          label="risk"
          value={healthStatus?.riskEnabled ? "[ON]" : "[OFF]"}
          detail={`${formatCompactNumber(storageStats?.riskSnapshotCount ?? 0)} snapshots`}
          tone={healthStatus?.riskEnabled ? "good" : "bad"}
        />
        <MetricValue
          label="candidates"
          value={formatCompactNumber(
            healthStatus?.candidateCount ?? candidates.length
          )}
          detail={`${formatCompactNumber(healthStatus?.trackedTokenCount ?? 0)} tracked`}
        />
        <MetricValue
          label="storage"
          value={formatCompactNumber(storageStats?.feedEventCount ?? 0)}
          detail="feed events"
        />
        <MetricValue
          label="chain verifier"
          value={(
            chainStatus?.status ??
            healthStatus?.chainVerifier.status ??
            "unknown"
          ).toUpperCase()}
          detail={
            chainStatus?.rpcHttpUrlConfigured ? "rpc configured" : "rpc unset"
          }
          tone={chainStatus?.enabled ? "good" : "neutral"}
        />
        <MetricValue
          label="chain events"
          value={(chainEventsStatus?.status ?? "unknown").toUpperCase()}
          detail={`${chainEventsStatus?.watchedAddressCount ?? healthStatus?.chainWatchedAddressCount ?? 0} watched`}
          tone={chainEventsStatus?.enabled ? "good" : "neutral"}
        />
        <MetricValue
          label="market data"
          value={marketStatus?.enabled ? "[ON]" : "[OFF]"}
          detail={`${marketStatus?.minConfidenceForMetrics ?? healthStatus?.marketDataMinConfidence ?? "unknown"} min`}
          tone={marketStatus?.enabled ? "good" : "neutral"}
        />
        <MetricValue
          label="data mode"
          value={actualDataLabel}
          detail="observation only"
          tone={actualData?.enabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="actual trades"
          value={formatCompactNumber(actualData?.totalEventsThisSession ?? 0)}
          detail={`${formatCompactNumber(storageStats?.pumpPortalTokenTradeEventCount ?? 0)} stored`}
          tone={
            (actualData?.totalEventsThisSession ?? 0) > 0 ? "good" : "neutral"
          }
        />
        <MetricValue
          label="actual subs"
          value={`${actualData?.subscribedTokenCount ?? 0}/${actualData?.maxSubscribedTokens ?? 0}`}
          detail={actualData?.budgetReached ? "budget reached" : "token trades"}
          tone={
            actualData?.budgetReached
              ? "bad"
              : actualData?.enabled
                ? "warn"
                : "neutral"
          }
        />
        <MetricValue
          label="identities"
          value={formatCompactNumber(identityStatus?.identityCount ?? 0)}
          detail={`${identityStatus?.resolvedCount ?? 0} resolved / ${identityStatus?.unresolvedCount ?? 0} unresolved`}
          tone={(identityStatus?.resolvedCount ?? 0) > 0 ? "good" : "neutral"}
        />
        <MetricValue
          label="metadata"
          value={identityStatus?.solanaMetadataEnabled ? "[SOL]" : "[OFF]"}
          detail={
            identityStatus?.offchainFetchEnabled
              ? "offchain on"
              : "offchain off"
          }
          tone={identityStatus?.solanaMetadataEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="watch orch"
          value={
            (watchStatus?.enabled ?? healthStatus?.watchOrchestratorEnabled)
              ? "[ON]"
              : "[OFF]"
          }
          detail={`${storageStats?.watchPlanCount ?? watchStatus?.watchPlanCount ?? 0} plans / ${storageStats?.watchActionCount ?? watchStatus?.watchActionCount ?? 0} actions`}
          tone={
            (watchStatus?.enabled ?? healthStatus?.watchOrchestratorEnabled)
              ? "good"
              : "neutral"
          }
        />
        <MetricValue
          label="paper"
          value={healthStatus?.paperOnly ? "[PAPER]" : "[UNKNOWN]"}
          detail={`auto order ${healthStatus?.paperAutoOrder ? "on" : "off"}`}
          tone={healthStatus?.paperOnly ? "good" : "warn"}
        />
        <MetricValue
          label="last signal"
          value={formatTimestamp(storageStats?.lastSignalAt)}
          detail="sqlite"
        />
      </section>

      <section className="console-line" aria-live="polite">
        <span className="prompt">&gt;</span>
        <span>{statusMessage}</span>
      </section>

      <section
        className="table-region live-token-region"
        aria-label="Live tokens"
      >
        <div className="table-heading">
          <h2>LIVE TOKENS</h2>
          <span className="table-meta">
            FEED: {feedLabel} / MODE: {feedModeLabel} / {liveConnectionLabel} /
            MOCK: {healthStatus?.mockFeedEnabled ? "ENABLED" : "BLOCKED"}
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Symbol</th>
              <th>Name</th>
              <th>Mint</th>
              <th>Event</th>
              <th>First Seen</th>
              <th>Last Seen</th>
              <th>Source</th>
              <th>Real</th>
              <th>State</th>
              <th>Action</th>
              <th>Risk</th>
              <th>Score</th>
              <th>Identity</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            {liveTokens.map((token) => (
              <tr key={token.mint}>
                <td>
                  <TokenCell
                    fallbackName={token.displayName}
                    fallbackSymbol={token.symbol}
                    mint={token.mint}
                  />
                </td>
                <td>{token.symbol ?? "UNKNOWN"}</td>
                <td>{token.name ?? "--"}</td>
                <td className="mono" title={token.mint}>
                  {shortMint(token.mint)}
                </td>
                <td>{token.eventTypes.join(", ")}</td>
                <td>{formatTimestamp(token.firstSeenAt)}</td>
                <td>
                  {formatTimestamp(token.lastSeenAt ?? token.latestEventAt)}
                </td>
                <td>{token.source}</td>
                <td>{token.realData ? "true" : "false"}</td>
                <td>{token.candidateState ?? "--"}</td>
                <td>{token.action ?? "--"}</td>
                <td>{token.riskLevel ?? "--"}</td>
                <td>{token.score ?? "--"}</td>
                <td>{token.identityConfidence ?? "--"}</td>
                <td>
                  <ReasonCodes codes={token.reasonCodes} />
                </td>
              </tr>
            ))}
            {liveTokens.length === 0 ? (
              <tr>
                <td colSpan={15} className="empty-state">
                  {getLiveEmptyState(feedStatus, liveStatus, healthStatus)}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section
        className="table-region actual-data-region"
        aria-label="Actual data status"
      >
        <div className="table-heading">
          <h2>Actual Data Status</h2>
          <span className="table-meta">PAPER ONLY / OBSERVATION ONLY</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Enabled</th>
              <th>Metered Ack</th>
              <th>API Key</th>
              <th>Provider</th>
              <th>Compatible</th>
              <th>Subscribed</th>
              <th>Events</th>
              <th>Session Max</th>
              <th>Mint Max</th>
              <th>Budget</th>
              <th>Est Cost SOL</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{actualData?.enabled ? "yes" : "no"}</td>
              <td>{actualData?.acknowledgedMetered ? "yes" : "no"}</td>
              <td>{actualData?.apiKeyConfigured ? "yes" : "no"}</td>
              <td>{actualData?.provider ?? "unknown"}</td>
              <td>{actualData?.compatibleProvider ? "yes" : "no"}</td>
              <td>
                {actualData?.subscribedTokenCount ?? 0}/
                {actualData?.maxSubscribedTokens ?? 0}
              </td>
              <td>
                {formatCompactNumber(actualData?.totalEventsThisSession ?? 0)}
              </td>
              <td>
                {formatCompactNumber(actualData?.maxEventsPerSession ?? 0)}
              </td>
              <td>{formatCompactNumber(actualData?.maxEventsPerMint ?? 0)}</td>
              <td>{actualData?.budgetReached ? "reached" : "open"}</td>
              <td>
                {formatNullableNumber(actualData?.estimatedMeteredCostSol)}
              </td>
              <td>
                <ReasonCodes codes={actualData?.reasonCodes} />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section
        className="table-region token-region"
        aria-label="Token identities"
      >
        <div className="table-heading">
          <h2>Token Identities</h2>
          <span className="table-meta">
            {identityStatus?.resolvedCount ?? 0} resolved /{" "}
            {identityStatus?.unresolvedCount ?? 0} unresolved
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Symbol</th>
              <th>Name</th>
              <th>Confidence</th>
              <th>Source</th>
              <th>Metadata URI</th>
              <th>Image</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {tokenIdentities.map((identity) => (
              <tr key={identity.mint}>
                <td>
                  <TokenCell identity={identity} mint={identity.mint} />
                </td>
                <td>{identity.symbol ?? "UNKNOWN"}</td>
                <td>{identity.name ?? "--"}</td>
                <td>{identity.confidence}</td>
                <td>{identity.dataSource}</td>
                <td className="mono" title={identity.metadataUri ?? ""}>
                  {identity.metadataUri
                    ? compactUri(identity.metadataUri)
                    : "--"}
                </td>
                <td>{identity.imageUri ? "yes" : "no"}</td>
                <td>{identity.resolved ? "resolved" : "unresolved"}</td>
                <td>{formatTimestamp(identity.updatedAt)}</td>
              </tr>
            ))}
            {tokenIdentities.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-state compact-empty">
                  No token identities
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section
        className="table-region actual-data-region"
        aria-label="Actual PumpPortal trades"
      >
        <div className="table-heading">
          <h2>Actual PumpPortal Trades</h2>
          <span className="table-meta">{actualTrades.length} rows</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Side</th>
              <th>Price SOL</th>
              <th>Volume SOL</th>
              <th>Token Amt</th>
              <th>Trader</th>
              <th>Confidence</th>
              <th>Usable</th>
              <th>Reasons</th>
              <th>Signature</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {actualTrades.map((trade) => (
              <tr key={trade.id}>
                <td>
                  <TokenCell identity={trade.identity} mint={trade.mint} />
                </td>
                <td>{trade.side}</td>
                <td>{formatNullableNumber(trade.priceSol)}</td>
                <td>{formatNullableNumber(trade.volumeSol)}</td>
                <td>{formatNullableNumber(trade.tokenAmount)}</td>
                <td className="mono" title={trade.trader ?? ""}>
                  {trade.trader ? shortMint(trade.trader) : "--"}
                </td>
                <td>{trade.confidence}</td>
                <td>{trade.usableForMetrics ? "yes" : "no"}</td>
                <td>
                  <ReasonCodes codes={trade.reasonCodes} />
                </td>
                <td className="mono" title={trade.signature ?? ""}>
                  {trade.signature ? shortMint(trade.signature) : "--"}
                </td>
                <td>{formatTimestamp(trade.createdAt)}</td>
              </tr>
            ))}
            {actualTrades.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-state compact-empty">
                  No actual PumpPortal token trades
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section
        className="table-region watch-region"
        aria-label="Watch orchestration plans"
      >
        <div className="table-heading">
          <h2>Watch Orchestration Plans</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Token</th>
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
                <td>
                  <TokenCell
                    fallbackSymbol={plan.symbol}
                    identity={plan.identity}
                    mint={plan.mint}
                  />
                </td>
                <td>{plan.symbol ?? "UNKNOWN"}</td>
                <td>{plan.source ?? "unknown"}</td>
                <td>{plan.shouldVerifyMint ? "yes" : "no"}</td>
                <td>{plan.shouldWatchEvents ? "yes" : "no"}</td>
                <td>
                  <TargetList targets={plan.watchTargets} />
                </td>
                <td>
                  <TargetList targets={plan.skippedTargets} />
                </td>
                <td>
                  <ReasonCodes codes={plan.reasonCodes} />
                </td>
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

      <section
        className="table-region watch-region"
        aria-label="Watch orchestration actions"
      >
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
                <td>
                  <ReasonCodes codes={action.reasonCodes} />
                </td>
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

      <section
        className="table-region chain-events-region"
        aria-label="Chain events"
      >
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
                  {watch.mint ? shortMint(watch.mint) : "--"}
                </td>
                <td>{watch.source ?? "manual"}</td>
                <td>
                  <ReasonCodes codes={watch.reasonCodes} />
                </td>
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

      <section
        className="table-region chain-events-region"
        aria-label="Recent chain transactions"
      >
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
                  {event.mint ? shortMint(event.mint) : "--"}
                </td>
                <td>
                  <ReasonCodes codes={event.reasonCodes} />
                </td>
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

      <section
        className="table-region chain-events-region"
        aria-label="Recent chain trades"
      >
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
                <td>
                  {event.priceUsd == null ? "--" : formatUsd(event.priceUsd)}
                </td>
                <td>
                  {event.volumeUsd == null ? "--" : formatUsd(event.volumeUsd)}
                </td>
                <td>{formatNullableNumber(event.tokenAmount)}</td>
                <td className="mono" title={event.watchedAddress}>
                  {shortMint(event.watchedAddress)}
                </td>
                <td>
                  <ReasonCodes codes={event.reasonCodes} />
                </td>
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

      <section
        className="table-region market-region"
        aria-label="Market observations"
      >
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
                <td>
                  <ReasonCodes codes={observation.reasonCodes} />
                </td>
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

      <DataPanel
        ariaLabel="Candidate lifecycle"
        className="candidate-region primary-region"
        meta={`${sortedCandidates.length} rows`}
        title="CANDIDATES"
      >
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Symbol</th>
              <th>Name</th>
              <th>Identity</th>
              <th>Source</th>
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
              <th>Actual Trades</th>
              <th>Actual Sub</th>
              <th>Real Trade</th>
              <th>Price SOL</th>
              <th>Volume SOL</th>
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
                  <td>
                    <TokenCell
                      fallbackName={candidate.name}
                      fallbackSymbol={candidate.symbol}
                      identity={candidate.identity}
                      mint={candidate.mint}
                    />
                  </td>
                  <td>
                    {candidate.identity?.symbol ??
                      candidate.symbol ??
                      "UNKNOWN"}
                  </td>
                  <td>{candidate.identity?.name ?? candidate.name ?? "--"}</td>
                  <td>
                    {candidate.identity
                      ? `${candidate.identity.confidence}/${candidate.identity.resolved ? "resolved" : "unresolved"}`
                      : "unresolved"}
                  </td>
                  <td>
                    {candidate.identity?.dataSource ??
                      candidate.source ??
                      "unknown"}
                  </td>
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
                  <td>
                    {decision?.hardReject || risk?.hardReject ? "yes" : "no"}
                  </td>
                  <td>{candidate.chainVerificationStatus ?? "not_checked"}</td>
                  <td>
                    {formatNullableBoolean(
                      candidate.onChainMintAuthorityActive
                    )}
                  </td>
                  <td>
                    {formatNullableBoolean(
                      candidate.onChainFreezeAuthorityActive
                    )}
                  </td>
                  <td>{formatPercent(candidate.onChainTopHolderPct)}</td>
                  <td>{formatPercent(candidate.onChainTop10HolderPct)}</td>
                  <td>
                    <ReasonCodes codes={candidate.chainReasonCodes} />
                  </td>
                  <td>
                    {candidate.latestWatchPlanSummary?.selectedTargetCount ?? 0}
                  </td>
                  <td>
                    {formatWatchSummary(candidate.latestWatchPlanSummary)}
                  </td>
                  <td>
                    <ReasonCodes codes={candidate.watchReasonCodes} />
                  </td>
                  <td>{candidate.actualData?.eventCount ?? 0}</td>
                  <td>{candidate.actualData?.subscriptionStatus ?? "none"}</td>
                  <td>
                    {formatTimestamp(candidate.actualData?.latestRealTradeAt)}
                  </td>
                  <td>
                    {formatNullableNumber(candidate.actualData?.latestPriceSol)}
                  </td>
                  <td>
                    {formatNullableNumber(
                      candidate.actualData?.latestVolumeSol
                    )}
                  </td>
                  <td>
                    <ReasonCodes codes={decision?.combinedReasonCodes} />
                  </td>
                  <td>
                    {formatUsd(
                      candidate.latestMetrics?.windows["10s"].totalVolumeUsd ??
                        0
                    )}
                  </td>
                  <td>
                    {formatNullableNumber(
                      candidate.latestMetrics?.windows["10s"].totalVolumeSol
                    )}
                  </td>
                  <td>
                    {candidate.latestMetrics?.usedSolMetricsFallback
                      ? "yes"
                      : "no"}
                  </td>
                  <td>
                    {formatNumber(
                      effectiveVolumeVelocity(candidate.latestMetrics)
                    )}
                  </td>
                  <td>
                    {formatNumber(candidate.latestMetrics?.buyerVelocityPerSec)}
                  </td>
                  <td>{formatNumber(candidate.latestMetrics?.buySellRatio)}</td>
                  <td>
                    {formatNumber(candidate.latestMetrics?.netBuyPressure)}
                  </td>
                  <td>
                    <ReasonCodes codes={risk?.reasonCodes} />
                  </td>
                  <td>{formatTimestamp(candidate.lastUpdatedAt)}</td>
                </tr>
              );
            })}
            {sortedCandidates.length === 0 ? (
              <tr>
                <td colSpan={34} className="empty-state">
                  {statusMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </DataPanel>

      <DataPanel
        ariaLabel="Live token signals"
        className="signal-region primary-region"
        meta={`${sortedSignals.length} rows`}
        title="SIGNALS"
      >
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Symbol</th>
              <th>Name</th>
              <th>Identity</th>
              <th>Source</th>
              <th>Score</th>
              <th>Action</th>
              <th>State</th>
              <th>Risk</th>
              <th>Reasons</th>
              <th>Feed</th>
              <th>Data</th>
              <th>Actual Events</th>
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
                <td>
                  <TokenCell
                    fallbackName={signal.name}
                    fallbackSymbol={signal.symbol}
                    identity={signal.identity}
                    mint={signal.mint}
                  />
                </td>
                <td>{signal.identity?.symbol ?? signal.symbol}</td>
                <td>{signal.identity?.name ?? signal.name ?? "--"}</td>
                <td>
                  {signal.identity
                    ? `${signal.identity.confidence}/${signal.identity.resolved ? "resolved" : "unresolved"}`
                    : "unresolved"}
                </td>
                <td>
                  {signal.identity?.dataSource ??
                    signal.feedProvider ??
                    "unknown"}
                </td>
                <td>
                  <span className="score">{signal.score}</span>
                </td>
                <td>
                  <span
                    className={`action action-${signal.action.toLowerCase()}`}
                  >
                    {signal.action}
                  </span>
                </td>
                <td>
                  <span
                    className={`state state-${signal.lifecycleState ?? "unknown"}`}
                  >
                    {signal.lifecycleState ?? "unknown"}
                  </span>
                </td>
                <td>
                  <span
                    className={`risk-level risk-${signal.riskLevel ?? "unknown"}`}
                  >
                    {signal.riskLevel ?? "unknown"}
                  </span>
                </td>
                <td>
                  <ReasonCodes codes={signal.reasonCodes} />
                </td>
                <td>
                  {signal.feedProvider ??
                    healthStatus?.feedProvider ??
                    "unknown"}
                </td>
                <td>
                  {formatSignalDataMode(signal, healthStatus?.feedProvider)}
                </td>
                <td>{signal.actualData?.eventCount ?? 0}</td>
                <td>{signal.insufficientMetrics ? "yes" : "no"}</td>
                <td>{formatUsd(metricVolume(signal, "1s"))}</td>
                <td>{formatUsd(metricVolume(signal, "5s"))}</td>
                <td>{formatUsd(metricVolume(signal, "10s"))}</td>
                <td>{formatNullableNumber(metricVolumeSol(signal, "10s"))}</td>
                <td>
                  {signal.rollingMetrics?.usedSolMetricsFallback ? "yes" : "no"}
                </td>
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
                <td colSpan={27} className="empty-state">
                  {statusMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </DataPanel>
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

function TokenCell({
  fallbackName,
  fallbackSymbol,
  identity,
  mint
}: {
  fallbackName?: string | undefined;
  fallbackSymbol?: string | undefined;
  identity?: TokenIdentitySummary | undefined;
  mint: string;
}) {
  const title =
    identity?.title ??
    (fallbackSymbol && fallbackName
      ? `${fallbackSymbol} - ${fallbackName}`
      : (fallbackName ?? fallbackSymbol ?? shortMint(mint)));
  const displayName = identity?.displayName ?? title;
  const unresolved = identity && !identity.resolved;

  return (
    <span className="token-cell" title={mint}>
      <span className="token-title">{displayName}</span>
      <span className="token-mint mono">{shortMint(mint)}</span>
      {unresolved ? <span className="token-unresolved">unresolved</span> : null}
    </span>
  );
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

function TargetList({ targets }: { targets: WatchTargetRow[] | undefined }) {
  if (!targets || targets.length === 0) {
    return <span className="muted">--</span>;
  }

  const visibleTargets = targets.slice(0, 3);
  const remainingCount = targets.length - visibleTargets.length;

  return (
    <span
      className="target-list"
      title={targets.map((target) => target.address).join(", ")}
    >
      {visibleTargets.map((target) => (
        <span className="target-code" key={`${target.kind}-${target.address}`}>
          {target.kind}:{shortMint(target.address)}
        </span>
      ))}
      {remainingCount > 0 ? (
        <span className="target-code target-more">+{remainingCount}</span>
      ) : null}
    </span>
  );
}

function formatWatchSummary(summary: WatchPlanSummary | undefined): string {
  if (!summary) {
    return "--";
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

function formatSignalDataMode(
  signal: OverlaySignal,
  fallbackFeed: string | undefined
): string {
  if (signal.actualData) {
    return "REAL/PUMPPORTAL";
  }

  const feed = signal.feedProvider ?? fallbackFeed ?? "unknown";

  return feed === "mock" ? "MOCK" : "PAPER ONLY";
}

function getLiveConnectionLabel(
  feedStatus: FeedStatus | null,
  healthStatus: HealthStatus | null
): string {
  if (feedStatus?.connected || healthStatus?.liveFeedConnected) {
    return "CONNECTED";
  }

  if (feedStatus?.connecting) {
    return "CONNECTING";
  }

  return "OFFLINE";
}

function getLiveConnectionTone(
  feedStatus: FeedStatus | null,
  healthStatus: HealthStatus | null
): "online" | "offline" | "warning" | "neutral" {
  if (feedStatus?.connected || healthStatus?.liveFeedConnected) {
    return "online";
  }

  if (feedStatus?.connecting) {
    return "warning";
  }

  return "offline";
}

function getLiveEmptyState(
  feedStatus: FeedStatus | null,
  liveStatus: LiveStatus | null,
  healthStatus: HealthStatus | null
): string {
  if (healthStatus?.mockFeedEnabled) {
    return "MOCK MODE EXPLICITLY ENABLED";
  }

  if ((feedStatus?.mode ?? healthStatus?.dataFeedMode) === "none") {
    return "NO LIVE FEED CONFIGURED";
  }

  if (feedStatus?.connecting) {
    return "WAITING FOR PUMPPORTAL LIVE TOKENS";
  }

  if (feedStatus?.connected && (liveStatus?.liveTokenCount ?? 0) === 0) {
    return "LIVE FEED CONNECTED - NO TOKENS YET";
  }

  return "LIVE FEED OFFLINE";
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "--" : value.toFixed(2);
}

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "--" : value.toFixed(4);
}

function formatUsd(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }

  return `$${value.toFixed(0)}`;
}

function formatNullableUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }

  return formatUsd(value);
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "--" : `${value.toFixed(2)}%`;
}

function formatNullableBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }

  return value ? "yes" : "no";
}

function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return "--";
  }

  return new Date(timestamp).toLocaleTimeString();
}

function formatCompactNumber(value: number): string {
  return Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact"
  }).format(value);
}

function compactUri(uri: string): string {
  return uri.length > 34 ? `${uri.slice(0, 24)}...${uri.slice(-7)}` : uri;
}

function getStatusMessage(options: {
  apiStatus: ApiStatus;
  candidateCount: number;
  feedProvider: string | undefined;
  feedStatus: FeedStatus | null;
  incompleteMetricCount: number;
  liveStatus: LiveStatus | null;
  noFeedMode: boolean | undefined;
  noRealFeedMessage: string | undefined;
  signalCount: number;
  storageStats: StorageStats | null;
}): string {
  if (options.apiStatus === "disconnected") {
    return "API disconnected";
  }

  if (options.apiStatus === "checking") {
    return "Checking API";
  }

  if (options.noFeedMode) {
    return options.noRealFeedMessage ?? "NO REAL FEED CONFIGURED";
  }

  if (
    options.feedStatus?.connected &&
    options.liveStatus?.liveTokenCount === 0
  ) {
    return "Live feed connected, waiting for live tokens";
  }

  if (options.feedStatus?.connecting) {
    return "Live feed connecting";
  }

  if (options.feedStatus?.live && !options.feedStatus.connected) {
    return "LIVE FEED OFFLINE";
  }

  if (options.storageStats?.feedEventCount === 0) {
    return "API connected, no feed events yet";
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

  if (
    options.signalCount === 0 &&
    (options.storageStats?.signalCount ?? 0) > 0
  ) {
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
