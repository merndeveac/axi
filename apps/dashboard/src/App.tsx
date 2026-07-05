import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import type {
  LiveTokenCardViewModel,
  OverlaySignal,
  RiskSnapshot,
  RollingMetricsSnapshot,
  StrategyStatus,
  TokenIdentitySummary
} from "@axi/shared";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { MetricValue } from "./components/MetricValue";
import { ReasonCodes } from "./components/ReasonCodes";
import {
  formatAcceleration,
  formatAge,
  formatCompactNumber,
  formatMintShort,
  formatPct,
  formatSol,
  formatTime,
  formatTimeAgo,
  formatUnknown,
  formatUsd,
  formatVelocity
} from "./formatters";

type ConnectionStatus = "connecting" | "open" | "closed";
type ApiStatus = "checking" | "connected" | "disconnected";
type TabId = "live" | "signals" | "metrics" | "risk" | "data" | "storage";
type SortMode = "newest" | "score" | "volumeVelocity" | "volume10s" | "risk";
type ActionFilter = "all" | "watch" | "qualified" | "rejected";

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
  lightningTradePlanCount: number;
  pumpPortalWalletStatusSnapshotCount: number;
  riskSnapshotCount: number;
  candidateDecisionCount: number;
  paperOrderCount: number;
  paperPositionCount: number;
  lastSignalAt: string | null;
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
  dataWalletBalanceSol: number | null;
  dataWalletBalanceStatus: string;
  dataWalletConfigured: boolean;
  dataWalletEstimatedEventsRemaining: number | null;
  dataWalletReasonCodes: string[];
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

type PumpPortalDataWalletStatus = {
  configured: boolean;
  apiKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  publicKey: string | null;
  shortPublicKey: string | null;
  publicKeyValid: boolean;
  solanaRpcConfigured: boolean;
  balanceSol: number | null;
  balanceLamports: number | null;
  minBalanceSol: number;
  warnBalanceSol: number;
  criticalBalanceSol: number;
  targetBalanceSol: number;
  balanceStatus: string;
  estimatedEventsRemaining: number | null;
  estimatedCostPer10000EventsSol: number;
  lastBalanceCheckAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

type PumpPortalWalletSummary = {
  role: "data" | "trading";
  configured: boolean;
  apiKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  publicKey: string | null;
  shortPublicKey: string | null;
  publicKeyValid: boolean;
  balanceSol: number | null;
  balanceLamports: number | null;
  balanceStatus: string;
  minBalanceSol: number;
  warnBalanceSol: number;
  criticalBalanceSol: number;
  targetBalanceSol: number;
  lastBalanceCheckAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
};

type PumpPortalWalletsStatus = {
  dataWallet: PumpPortalWalletSummary;
  tradingWallet: PumpPortalWalletSummary;
  sameWallet: boolean;
  sameWalletWarning: string | null;
  solanaRpcConfigured: boolean;
  paperOnly: true;
  tradingDisabled: true;
  secretFieldsExposed: false;
  reasonCodes: string[];
};

type LightningStatus = {
  readiness: {
    enabled: boolean;
    liveTradingAllowed: boolean;
    manualArmRequired: boolean;
    manualArmed: boolean;
    dataWalletReady: boolean;
    tradingWalletReady: boolean;
    apiKeyConfigured: boolean;
    publicKeyConfigured: boolean;
    balanceSol: number | null;
    reasonCodes: string[];
  };
  limits: {
    maxBuySol: number;
    maxDailySol: number;
    maxOpenPositions: number;
    maxSlippagePct: number;
    priorityFeeSol: number;
    pool: string;
    skipPreflight: boolean;
    jitoOnly: boolean;
  };
  liveTradingAllowed: boolean;
  manualArmRequired: boolean;
  manualArmed: boolean;
  maxBuySol: number;
  maxDailySol: number;
  maxOpenPositions: number;
  pool: string;
  slippage: number;
  priorityFee: number;
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

type LightningTradePlan = {
  id: string;
  mode: string;
  request: {
    action: string;
    mint: string;
    amount: number;
    denominatedInSol: boolean;
    slippage: number;
    priorityFee: number;
    pool: string;
    skipPreflight: boolean;
    jitoOnly: boolean;
  };
  mint: string;
  amountSol: number;
  maxBuySol: number;
  estimatedRisk: string;
  safetyChecks: Array<{
    code: string;
    passed: boolean;
    severity: string;
    message: string;
  }>;
  blocked: boolean;
  blockers: string[];
  warnings: string[];
  createdAt: string;
  noTransactionSent?: boolean;
  paperOnly?: true;
  tradingDisabled?: true;
};

type LiveTradeTrackingStatus = {
  acknowledgedMetered: boolean;
  autoMode: string;
  budgetReached: boolean;
  enabled: boolean;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  maxSubscribedTokens: number;
  paperOnly: true;
  reasonCodes: string[];
  subscribedTokenCount: number;
  totalEventsThisSession: number;
  trackedMints: string[];
};

type LiveCardEnrichmentStatus = {
  cachedMintCount: number;
  dexScreenerEnabled: boolean;
  enabled: boolean;
  jupiterPriceEnabled: boolean;
  maxMintsPerMinute: number;
  onNewToken: boolean;
  paperOnly: true;
  reasonCodes: string[];
  requestsThisMinute: number;
};

type IndexerStatus = {
  enabled: boolean;
  liveStateEnabled: boolean;
  preferLiveStateCards: boolean;
  source: string;
  sourceMode: string;
  eventBus: {
    publishedCount: number;
    subscriberCount: number;
    lastEventAt: string | null;
    errorCount: number;
  };
  liveState: {
    tokenCount: number;
    eventCount: number;
    lastEventAt: string | null;
  };
  futureGeyser: {
    enabled: boolean;
    implemented: boolean;
    status: string;
  };
  managedStream?: {
    managedStreamEnabled: boolean;
    provider: string;
    clientKind?: string;
    clientStatus?: {
      enabled: boolean;
      configured: boolean;
      authConfigured: boolean;
      connectionState: string;
      reasonCodes: string[];
    };
    connectionState: string;
    configured: boolean;
    authConfigured: boolean;
    endpointMasked?: string | null;
    subscriptionSummary?: {
      profile: string | null;
      transactionsEnabled: boolean;
      transactionAccountIncludeCount: number;
      transactionAccountRequiredCount: number;
      slotsEnabled: boolean;
      blocksEnabled: boolean;
    };
    receivedCount: number;
    transactionCount: number;
    errorCount: number;
    lastMessageAt: string | null;
    reasonCodes: string[];
    yellowstoneStatus: {
      enabled: boolean;
      configured: boolean;
      connectionState: string;
    };
    laserstreamStatus: {
      enabled: boolean;
      configured: boolean;
      connectionState: string;
    };
  };
  streamProvider?: string;
  streamEnabled?: boolean;
  streamConnectionState?: string;
  streamEnvelopeCount?: number;
  streamEventCount?: number;
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
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

type HealthStatus = {
  actualData: ActualDataStatus;
  dataFeedMode: string;
  dataFeed: string;
  feed: FeedStatus;
  feedProvider: string;
  historicalMockRowsHidden: boolean;
  liveFeedConnected: boolean;
  liveFeedExpected: boolean;
  liveFeedLastEventAt: string | null;
  liveFeedReady: boolean;
  liveTokenCount: number;
  mockFeedEnabled: boolean;
  mockRuntimeBlocked: boolean;
  noFeedMode: boolean;
  noRealFeedMessage?: string;
  realDataActive: boolean;
  tokenIdentity: TokenIdentityStatus;
  mode: string;
  paperAutoOrder: boolean;
  paperOnly: boolean;
  status: string;
  uptimeSeconds: number;
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

type ChainStatus = {
  configured: boolean;
  enabled: boolean;
  paperOnly: true;
  rpcHttpUrlConfigured: boolean;
  status: string;
};

type MetricsRow = RollingMetricsSnapshot & {
  identity?: TokenIdentitySummary;
};

type TokenIdentityRow = TokenIdentitySummary & {
  id?: number;
  createdAt?: string;
};

type LiveEventRow = {
  sessionId: string;
  provider: string;
  eventType: string;
  mint: string;
  name?: string;
  symbol?: string;
  title?: string;
  realData: true;
  reasonCodes: string[];
  createdAt: string;
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

type MarketObservationRow = {
  id: number;
  signature: string;
  mint: string;
  side: string;
  quoteAsset: string;
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

type ChainVerificationRow = {
  id?: number;
  mint: string;
  status: string;
  mintAuthorityActive?: boolean | null;
  freezeAuthorityActive?: boolean | null;
  topHolderPct?: number | null;
  top10HolderPct?: number | null;
  reasonCodes: string[];
  inspectedAt?: string | null;
  createdAt?: string;
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

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "live", label: "LIVE" },
  { id: "signals", label: "SIGNALS" },
  { id: "metrics", label: "METRICS" },
  { id: "risk", label: "RISK" },
  { id: "data", label: "DATA" },
  { id: "storage", label: "STORAGE / DEBUG" }
];

const wsUrl =
  import.meta.env.VITE_AXI_WS_URL ?? "ws://localhost:8787/ws/signals";
const apiBaseUrl = import.meta.env.VITE_AXI_API_URL ?? "http://localhost:8787";

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [cards, setCards] = useState<LiveTokenCardViewModel[]>([]);
  const [signals, setSignals] = useState<OverlaySignal[]>([]);
  const [metrics, setMetrics] = useState<MetricsRow[]>([]);
  const [riskRows, setRiskRows] = useState<RiskSnapshot[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatus | null>(
    null
  );
  const [actualDataStatus, setActualDataStatus] =
    useState<ActualDataStatus | null>(null);
  const [dataWalletStatus, setDataWalletStatus] =
    useState<PumpPortalDataWalletStatus | null>(null);
  const [pumpPortalWalletsStatus, setPumpPortalWalletsStatus] =
    useState<PumpPortalWalletsStatus | null>(null);
  const [lightningStatus, setLightningStatus] =
    useState<LightningStatus | null>(null);
  const [liveTradeTrackingStatus, setLiveTradeTrackingStatus] =
    useState<LiveTradeTrackingStatus | null>(null);
  const [liveCardEnrichmentStatus, setLiveCardEnrichmentStatus] =
    useState<LiveCardEnrichmentStatus | null>(null);
  const [indexerStatus, setIndexerStatus] = useState<IndexerStatus | null>(
    null
  );
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [tokenIdentityStatus, setTokenIdentityStatus] =
    useState<TokenIdentityStatus | null>(null);
  const [tokenIdentities, setTokenIdentities] = useState<TokenIdentityRow[]>(
    []
  );
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEventRow[]>([]);
  const [actualTrades, setActualTrades] = useState<PumpPortalTradeRow[]>([]);
  const [marketObservations, setMarketObservations] = useState<
    MarketObservationRow[]
  >([]);
  const [chainVerifications, setChainVerifications] = useState<
    ChainVerificationRow[]
  >([]);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [realOnly, setRealOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedMint, setExpandedMint] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("never");

  useEffect(() => {
    const onHashChange = () => setActiveTab(getInitialTab());

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retryTimer: number | undefined;
    let closedByReact = false;

    const refreshCards = async () => {
      try {
        const nextCards = await fetchJson<LiveTokenCardViewModel[]>(
          "/ui/live-token-cards"
        );
        setCards(nextCards);
      } catch {
        // Polling remains the fallback path.
      }
    };

    const connect = () => {
      setConnectionStatus("connecting");
      socket = new WebSocket(wsUrl);

      socket.addEventListener("open", () => setConnectionStatus("open"));
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;

        if (message.type === "snapshot") {
          setSignals(message.signals);
        }

        if (message.type === "signal") {
          setSignals((current) => upsertSignal(current, message.signal));
          void refreshCards();
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

    const loadDashboardData = async () => {
      try {
        const [
          health,
          stats,
          nextFeedStatus,
          nextLiveStatus,
          nextCards,
          nextStrategy,
          nextSignals,
          nextMetrics,
          nextRiskRows,
          nextActualDataStatus,
          nextDataWalletStatus,
          nextPumpPortalWalletsStatus,
          nextLightningStatus,
          nextLiveTradeTrackingStatus,
          nextActualTrades,
          nextLiveCardEnrichmentStatus,
          nextMarketStatus,
          nextMarketObservations,
          nextChainStatus,
          nextChainVerifications,
          nextTokenIdentityStatus,
          nextTokenIdentities,
          nextIndexerStatus,
          nextLiveEvents
        ] = await Promise.all([
          fetchJson<HealthStatus>("/health"),
          fetchJson<StorageStats>("/storage/stats"),
          fetchJson<FeedStatus>("/feed/status"),
          fetchJson<LiveStatus>("/live/status"),
          fetchJson<LiveTokenCardViewModel[]>("/ui/live-token-cards"),
          fetchJson<StrategyStatus>("/strategy/status"),
          fetchJson<OverlaySignal[]>("/signals"),
          fetchJson<MetricsRow[]>("/metrics"),
          fetchJson<RiskSnapshot[]>("/risk"),
          fetchJson<ActualDataStatus>("/actual-data/status"),
          fetchJson<PumpPortalDataWalletStatus>(
            "/pumpportal/data-wallet/status"
          ),
          fetchJson<PumpPortalWalletsStatus>("/pumpportal/wallets/status"),
          fetchJson<LightningStatus>("/execution/lightning/status"),
          fetchJson<LiveTradeTrackingStatus>("/live/trade-tracking/status"),
          fetchJson<PumpPortalTradeRow[]>("/actual-data/trades?limit=10"),
          fetchJson<LiveCardEnrichmentStatus>("/enrichment/status"),
          fetchJson<MarketStatus>("/market/status"),
          fetchJson<MarketObservationRow[]>("/market/observations?limit=10"),
          fetchJson<ChainStatus>("/chain/status"),
          fetchJson<ChainVerificationRow[]>("/chain/verifications?limit=10"),
          fetchJson<TokenIdentityStatus>("/tokens/status"),
          fetchJson<TokenIdentityRow[]>("/tokens?limit=25"),
          fetchJson<IndexerStatus>("/indexer/status"),
          fetchJson<LiveEventRow[]>("/live/events?limit=25")
        ]);

        if (!cancelled) {
          setApiStatus("connected");
          setHealthStatus(health);
          setStorageStats(stats);
          setFeedStatus(nextFeedStatus);
          setLiveStatus(nextLiveStatus);
          setCards(nextCards);
          setStrategyStatus(nextStrategy);
          setSignals(nextSignals);
          setMetrics(nextMetrics);
          setRiskRows(nextRiskRows);
          setActualDataStatus(nextActualDataStatus);
          setDataWalletStatus(nextDataWalletStatus);
          setPumpPortalWalletsStatus(nextPumpPortalWalletsStatus);
          setLightningStatus(nextLightningStatus);
          setLiveTradeTrackingStatus(nextLiveTradeTrackingStatus);
          setActualTrades(nextActualTrades);
          setLiveCardEnrichmentStatus(nextLiveCardEnrichmentStatus);
          setMarketStatus(nextMarketStatus);
          setMarketObservations(nextMarketObservations);
          setChainStatus(nextChainStatus);
          setChainVerifications(nextChainVerifications);
          setTokenIdentityStatus(nextTokenIdentityStatus);
          setTokenIdentities(nextTokenIdentities);
          setIndexerStatus(nextIndexerStatus);
          setLiveEvents(nextLiveEvents);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch {
        if (!cancelled) {
          setApiStatus("disconnected");
        }
      }
    };

    void loadDashboardData();
    const timer = window.setInterval(() => {
      void loadDashboardData();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const visibleCards = useMemo(
    () =>
      sortCards(
        filterCards(cards, { actionFilter, realOnly, search }),
        sortMode
      ),
    [actionFilter, cards, realOnly, search, sortMode]
  );
  const buyReadyCount = cards.filter((card) => card.buyReady).length;
  const rejectedCount = cards.filter(
    (card) => card.hardReject || card.signalStrength === "reject"
  ).length;
  const strategyReadyCount = cards.filter(
    (card) => card.dataCompleteness.dataQualityLabel === "strategy_ready"
  ).length;
  const trackedCardCount = cards.filter(
    (card) => card.tradeTrackingState === "tracking"
  ).length;
  const unavailableFieldCount = cards.reduce(
    (total, card) => total + card.unavailableFields.length,
    0
  );
  const modeLabel = (healthStatus?.mode ?? "paper").toUpperCase();
  const feedModeLabel = (
    feedStatus?.mode ??
    healthStatus?.dataFeedMode ??
    "unknown"
  ).toUpperCase();
  const feedLabel = (
    feedStatus?.provider ??
    healthStatus?.feedProvider ??
    "unknown"
  ).toUpperCase();
  const apiLabel =
    apiStatus === "connected"
      ? "ONLINE"
      : apiStatus === "checking"
        ? "CHECKING"
        : "OFFLINE";
  const websocketLabel =
    connectionStatus === "open"
      ? "ONLINE"
      : connectionStatus === "connecting"
        ? "CONNECTING"
        : "OFFLINE";
  const liveLabel = getLiveConnectionLabel(feedStatus, healthStatus);
  const liveTone = getLiveConnectionTone(feedStatus, healthStatus);

  return (
    <main className="app-shell">
      <header className="command-bar">
        <div className="brand-cluster">
          <span className="prompt">&gt;</span>
          <div>
            <p className="eyebrow">live token intelligence</p>
            <h1>AXI</h1>
          </div>
          <span className="terminal-cursor" aria-hidden="true" />
        </div>
        <div className="command-status" aria-label="Runtime status">
          <ConnectionBadge label={modeLabel} tone="online" />
          <ConnectionBadge label={`MODE ${feedModeLabel}`} tone="online" />
          <ConnectionBadge label={`FEED ${feedLabel}`} tone="neutral" />
          <ConnectionBadge label={liveLabel} tone={liveTone} />
          <ConnectionBadge label="PAPER ONLY" tone="online" />
          <ConnectionBadge
            label={`API ${apiLabel}`}
            tone={apiStatus === "connected" ? "online" : "offline"}
          />
          <ConnectionBadge
            label={`WS ${websocketLabel}`}
            tone={connectionStatus === "open" ? "online" : "warning"}
          />
          <span className="last-update">UPDATED {lastUpdated}</span>
        </div>
      </header>

      <section className="status-grid" aria-label="System status">
        <MetricValue
          label="live cards"
          value={formatCompactNumber(cards.length)}
          detail="current session"
          tone={cards.length > 0 ? "good" : "neutral"}
        />
        <MetricValue
          label="buy ready"
          value={formatCompactNumber(buyReadyCount)}
          detail="paper signal"
          tone={buyReadyCount > 0 ? "good" : "neutral"}
        />
        <MetricValue
          label="rejects"
          value={formatCompactNumber(rejectedCount)}
          detail="risk blocked"
          tone={rejectedCount > 0 ? "bad" : "neutral"}
        />
        <MetricValue
          label="complete"
          value={formatCompactNumber(strategyReadyCount)}
          detail="strategy ready"
          tone={strategyReadyCount > 0 ? "good" : "neutral"}
        />
        <MetricValue
          label="feed events"
          value={formatCompactNumber(feedStatus?.newTokenEventCount ?? 0)}
          detail={`${feedStatus?.migrationEventCount ?? 0} migrations`}
          tone={feedStatus?.connected ? "good" : "neutral"}
        />
        <MetricValue
          label="tracked trades"
          value={formatCompactNumber(trackedCardCount)}
          detail="metered opt-in"
          tone={
            trackedCardCount > 0 ? "good" : "neutral"
          }
        />
        <MetricValue
          label="data wallet"
          value={(dataWalletStatus?.balanceStatus ?? "unknown").toUpperCase()}
          detail={dataWalletStatus?.shortPublicKey ?? "funding address"}
          tone={getDataWalletTone(dataWalletStatus?.balanceStatus)}
        />
        <MetricValue
          label="unavailable"
          value={formatCompactNumber(unavailableFieldCount)}
          detail="shown as --"
          tone={unavailableFieldCount > 0 ? "warn" : "good"}
        />
        <MetricValue
          label="mock"
          value={healthStatus?.mockFeedEnabled ? "[ON]" : "[OFF]"}
          detail={
            healthStatus?.historicalMockRowsHidden
              ? "historical hidden"
              : "unknown"
          }
          tone={healthStatus?.mockFeedEnabled ? "warn" : "good"}
        />
        <MetricValue
          label="storage"
          value={formatCompactNumber(storageStats?.liveFeedEventCount ?? 0)}
          detail="live rows"
        />
      </section>

      <nav className="tab-bar" role="tablist" aria-label="Dashboard tabs">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={
              activeTab === tab.id ? "tab-button active" : "tab-button"
            }
            key={tab.id}
            onClick={() => activateTab(tab.id, setActiveTab)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "live" ? (
        <LiveTab
          actionFilter={actionFilter}
          cards={visibleCards}
          expandedMint={expandedMint}
          feedStatus={feedStatus}
          healthStatus={healthStatus}
          liveStatus={liveStatus}
          realOnly={realOnly}
          search={search}
          setActionFilter={setActionFilter}
          setExpandedMint={setExpandedMint}
          setRealOnly={setRealOnly}
          setSearch={setSearch}
          setSortMode={setSortMode}
          sortMode={sortMode}
          totalCards={cards.length}
        />
      ) : null}
      {activeTab === "signals" ? (
        <SignalsTab cards={cards} signals={signals} strategy={strategyStatus} />
      ) : null}
      {activeTab === "metrics" ? <MetricsTab metrics={metrics} /> : null}
      {activeTab === "risk" ? <RiskTab riskRows={riskRows} /> : null}
      {activeTab === "data" ? (
        <DataTab
          actualDataStatus={actualDataStatus}
          actualTrades={actualTrades}
          chainStatus={chainStatus}
          dataWalletStatus={dataWalletStatus}
          lightningStatus={lightningStatus}
          feedStatus={feedStatus}
          liveCardEnrichmentStatus={liveCardEnrichmentStatus}
          indexerStatus={indexerStatus}
          liveStatus={liveStatus}
          liveTradeTrackingStatus={liveTradeTrackingStatus}
          marketObservations={marketObservations}
          marketStatus={marketStatus}
          pumpPortalWalletsStatus={pumpPortalWalletsStatus}
          tokenIdentities={tokenIdentities}
          tokenIdentityStatus={tokenIdentityStatus}
        />
      ) : null}
      {activeTab === "storage" ? (
        <StorageTab
          chainVerifications={chainVerifications}
          liveEvents={liveEvents}
          storageStats={storageStats}
        />
      ) : null}
    </main>
  );
}

function LiveTab({
  actionFilter,
  cards,
  expandedMint,
  feedStatus,
  healthStatus,
  liveStatus,
  realOnly,
  search,
  setActionFilter,
  setExpandedMint,
  setRealOnly,
  setSearch,
  setSortMode,
  sortMode,
  totalCards
}: {
  actionFilter: ActionFilter;
  cards: LiveTokenCardViewModel[];
  expandedMint: string | null;
  feedStatus: FeedStatus | null;
  healthStatus: HealthStatus | null;
  liveStatus: LiveStatus | null;
  realOnly: boolean;
  search: string;
  setActionFilter: (value: ActionFilter) => void;
  setExpandedMint: (value: string | null) => void;
  setRealOnly: (value: boolean) => void;
  setSearch: (value: string) => void;
  setSortMode: (value: SortMode) => void;
  sortMode: SortMode;
  totalCards: number;
}) {
  return (
    <section className="tab-panel live-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>LIVE TOKENS</h2>
          <p>
            {totalCards} current-session cards / sort {sortMode} / unavailable
            fields render as --
          </p>
        </div>
        <span className="table-meta">
          {getLiveEmptyState(feedStatus, liveStatus, healthStatus)}
        </span>
      </div>

      <div className="live-controls" aria-label="Live token controls">
        <label>
          <span>Search</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="symbol / name / mint"
            value={search}
          />
        </label>
        <label>
          <span>Sort</span>
          <select
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            value={sortMode}
          >
            <option value="newest">newest</option>
            <option value="score">score</option>
            <option value="volumeVelocity">volume velocity</option>
            <option value="volume10s">volume 10s</option>
            <option value="risk">risk</option>
          </select>
        </label>
        <label>
          <span>Action</span>
          <select
            onChange={(event) =>
              setActionFilter(event.target.value as ActionFilter)
            }
            value={actionFilter}
          >
            <option value="all">all</option>
            <option value="watch">watch</option>
            <option value="qualified">qualified</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <label className="check-control">
          <input
            checked={realOnly}
            onChange={(event) => setRealOnly(event.target.checked)}
            type="checkbox"
          />
          <span>REAL only</span>
        </label>
      </div>

      {cards.length > 0 ? (
        <div className="token-grid">
          {cards.map((card) => (
            <TokenCard
              card={card}
              expanded={expandedMint === card.mint}
              key={card.mint}
              onToggle={() =>
                setExpandedMint(expandedMint === card.mint ? null : card.mint)
              }
            />
          ))}
        </div>
      ) : (
        <div className="empty-state live-empty">
          {getLiveEmptyState(feedStatus, liveStatus, healthStatus)}
        </div>
      )}
    </section>
  );
}

function TokenCard({
  card,
  expanded,
  onToggle
}: {
  card: LiveTokenCardViewModel;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="token-card">
      <div className="token-card-header">
        <div className="token-title-block">
          <h3>{card.displayName}</h3>
          <span>
            {card.symbol ?? "UNKNOWN"} / {card.shortMint}
          </span>
        </div>
        <div className="token-card-actions">
          <span className="terminal-badge terminal-badge-online">
            {card.realData ? "REAL" : "MOCK"}
          </span>
          <span className="terminal-badge terminal-badge-neutral">
            {card.source.toUpperCase()}
          </span>
          <span className="terminal-badge terminal-badge-neutral">
            {formatDataQuality(card.dataCompleteness.dataQualityLabel)}{" "}
            {card.dataCompleteness.completenessPct}%
          </span>
          <span
            className={`terminal-badge ${getTradeTrackingBadgeClass(
              card.tradeTrackingState
            )}`}
          >
            {formatTradeTrackingState(card.tradeTrackingState)}
          </span>
          <span className={`action action-${normalizeClassName(card.action)}`}>
            {card.action}
          </span>
          <span className="score">{card.score}</span>
        </div>
      </div>

      <div className="stat-row top-stat-row">
        <Stat
          detail={formatUsd(card.priceUsd)}
          label="price"
          value={formatSol(card.priceSol)}
        />
        <Stat
          detail={`FDV ${formatUsd(card.fdvUsd)}`}
          label="mcap"
          value={formatUsd(card.marketCapUsd)}
        />
        <Stat label="liquidity" value={formatUsd(card.liquidityUsd)} />
        <Stat
          detail={`60s ${formatUsd(card.volume60sUsd)}`}
          label="vol 10s"
          value={formatUsd(card.volume10sUsd)}
        />
        <Stat label="holders" value={formatCompactNumber(card.holderCount)} />
        <Stat
          label="txns 10s"
          value={formatCompactNumber(card.totalTradeCount10s)}
        />
      </div>

      <div className="stat-row">
        <Stat
          label="buys/sells"
          value={`${formatCompactNumber(card.buyTradeCount10s)}/${formatCompactNumber(
            card.sellTradeCount10s
          )}`}
        />
        <Stat
          label="unique"
          value={`${formatCompactNumber(card.uniqueBuyers10s)}/${formatCompactNumber(
            card.uniqueSellers10s
          )}`}
          detail="buyers/sellers"
        />
        <Stat label="buy/sell" value={formatCompactNumber(card.buySellRatio)} />
        <Stat label="net pressure" value={formatPct(card.netBuyPressure)} />
        <Stat label="buy vol" value={formatUsd(card.buyVolume10s)} />
        <Stat label="sell vol" value={formatUsd(card.sellVolume10s)} />
      </div>

      <div className="stat-row technical-row">
        <Stat
          label="dVol/dt"
          value={formatVelocity(card.volumeVelocityUsdPerSec, "usd")}
        />
        <Stat
          label="d2Vol/dt2"
          value={formatAcceleration(card.volumeAccelerationUsdPerSec2, "usd")}
        />
        <Stat
          label="dPrice/dt"
          value={formatVelocity(card.priceVelocityPctPerSec, "pct")}
        />
        <Stat
          label="d2Price/dt2"
          value={formatAcceleration(card.priceAccelerationPctPerSec2, "pct")}
        />
        <Stat
          label="dBuyers/dt"
          value={formatVelocity(card.buyerVelocityPerSec, "buyers")}
        />
        <Stat
          label="d2Buyers/dt2"
          value={formatAcceleration(card.buyerAccelerationPerSec2, "buyers")}
        />
        <Stat
          label="dHolders/dt"
          value={formatVelocity(card.holderVelocityPerSec, "holders")}
        />
        <Stat
          label="d2Holders/dt2"
          value={formatAcceleration(card.holderAccelerationPerSec2, "holders")}
        />
      </div>

      <div className="signal-risk-strip">
        <span className={`risk-level risk-${card.riskLevel}`}>
          {card.riskLevel}
        </span>
        <span className="state">
          {card.hardReject ? "HARD REJECT" : "PASS"}
        </span>
        <span>top {formatPct(card.topHolderPct)}</span>
        <span>top10 {formatPct(card.top10HolderPct)}</span>
        <span>mint auth {formatBool(card.mintAuthorityActive)}</span>
        <span>freeze {formatBool(card.freezeAuthorityActive)}</span>
      </div>

      <div className="strategy-strip">
        <div>
          <span className="muted">signal</span>
          <strong>{card.signalStrength}</strong>
        </div>
        <div>
          <span className="muted">strategy</span>
          <strong>{card.strategyName}</strong>
        </div>
        <div>
          <span className="muted">positive</span>
          <DriverList drivers={card.strategy.positiveDrivers} />
        </div>
        <div>
          <span className="muted">negative</span>
          <DriverList drivers={card.strategy.negativeDrivers} />
        </div>
        <div>
          <span className="muted">blockers</span>
          <DriverList drivers={card.strategy.blockers} />
        </div>
      </div>

      <footer className="token-card-footer">
        <span>age {formatAge(card.ageSeconds)}</span>
        <span>updated {formatTimeAgo(card.lastUpdatedAt)}</span>
        <span>trades {formatCompactNumber(card.tradeEventCount)}</span>
        <span>latest trade {formatTimeAgo(card.latestTradeAt)}</span>
        <span>{card.eventTypes.at(-1) ?? "--"}</span>
        <span>{formatMintShort(card.latestSignature)}</span>
        <span>
          missing {card.missingFields.length} / unavailable{" "}
          {card.unavailableFields.length}
        </span>
        <button onClick={onToggle} type="button">
          {expanded ? "HIDE AUDIT" : "AUDIT"}
        </button>
      </footer>

      {expanded ? <TokenAudit card={card} /> : null}
    </article>
  );
}

function TokenAudit({ card }: { card: LiveTokenCardViewModel }) {
  return (
    <div className="token-audit">
      <div>
        <h4>Calculation Inputs</h4>
        <dl>
          <dt>samples</dt>
          <dd>{card.validMetricSampleCount}</dd>
          <dt>confidence</dt>
          <dd>{card.calculationConfidence}</dd>
          <dt>volume velocity</dt>
          <dd>
            {formatVelocity(
              card.strategy.calculationInputs.volumeVelocity,
              "usd"
            )}
          </dd>
          <dt>volume acceleration</dt>
          <dd>
            {formatAcceleration(
              card.strategy.calculationInputs.volumeAcceleration,
              "usd"
            )}
          </dd>
          <dt>price velocity</dt>
          <dd>
            {formatVelocity(
              card.strategy.calculationInputs.priceVelocity,
              "pct"
            )}
          </dd>
          <dt>buyer velocity</dt>
          <dd>
            {formatVelocity(
              card.strategy.calculationInputs.buyerVelocity,
              "buyers"
            )}
          </dd>
          <dt>holder velocity</dt>
          <dd>
            {formatVelocity(
              card.strategy.calculationInputs.holderVelocity,
              "holders"
            )}
          </dd>
        </dl>
      </div>
      <div>
        <h4>Source Audit</h4>
        <dl>
          <dt>identity</dt>
          <dd>
            {card.identitySource} / {card.identityConfidence} /{" "}
            {card.identityResolved ? "resolved" : "unresolved"}
          </dd>
          <dt>price source</dt>
          <dd>
            {card.priceSol === null && card.priceUsd === null
              ? "UNAVAILABLE"
              : "DERIVED"}
          </dd>
          <dt>volume source</dt>
          <dd>
            {card.volume10sUsd === null && card.volume10sSol === null
              ? "UNAVAILABLE"
              : "DERIVED"}
          </dd>
          <dt>holder source</dt>
          <dd>{card.holderDataSource ?? "UNAVAILABLE"}</dd>
          <dt>raw events</dt>
          <dd>{card.rawEventCount}</dd>
          <dt>actual trades</dt>
          <dd>{card.actualTradeEventCount}</dd>
          <dt>market observations</dt>
          <dd>{card.marketObservationCount}</dd>
          <dt>data quality</dt>
          <dd>
            {formatDataQuality(card.dataCompleteness.dataQualityLabel)} /{" "}
            {card.dataCompleteness.completenessPct}%
          </dd>
          <dt>trade tracking</dt>
          <dd>
            {formatTradeTrackingState(card.tradeTrackingState)} /{" "}
            {formatCompactNumber(card.tradeEventCount)} trades
          </dd>
          <dt>latest trade</dt>
          <dd>{formatTimeAgo(card.latestTradeAt)}</dd>
          <dt>enrichment</dt>
          <dd>
            {card.enrichmentStatus}
            {card.enrichmentSource ? ` / ${card.enrichmentSource}` : ""}
          </dd>
          <dt>dex pair</dt>
          <dd>{card.dexId ?? "--"} / {formatMintShort(card.pairAddress)}</dd>
        </dl>
      </div>
      <div>
        <h4>Reason Codes</h4>
        <ReasonCodes codes={card.combinedReasonCodes} limit={16} />
        <h4>Completeness</h4>
        <ReasonCodes codes={card.dataCompleteness.reasonCodes} limit={16} />
        <h4>Trade Tracking</h4>
        <ReasonCodes codes={card.tradeTrackingReasonCodes} limit={16} />
        <h4>Unavailable Fields</h4>
        <ReasonCodes codes={card.unavailableFields} limit={16} />
        <h4>Warnings</h4>
        <ReasonCodes codes={card.dataSourceWarnings} limit={16} />
      </div>
    </div>
  );
}

function SignalsTab({
  cards,
  signals,
  strategy
}: {
  cards: LiveTokenCardViewModel[];
  signals: OverlaySignal[];
  strategy: StrategyStatus | null;
}) {
  const sortedCards = sortCards(cards, "score");

  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>SIGNALS</h2>
          <p>Read-only strategy status and current card signal explanations.</p>
        </div>
      </div>
      <div className="strategy-status">
        <Stat
          label="strategy"
          value={strategy?.strategyName ?? "--"}
          detail="read only"
        />
        <Stat
          label="buy ready"
          value={formatCompactNumber(
            strategy?.thresholds.minScoreForPaperBuyReady
          )}
          detail="min score"
        />
        <Stat
          label="min samples"
          value={formatCompactNumber(strategy?.thresholds.minSampleCount)}
        />
        <Stat
          label="safety"
          value={strategy?.paperOnly ? "PAPER ONLY" : "--"}
        />
        <div className="formula-list">
          {(strategy?.formula ?? []).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </div>
      <TableShell
        empty="No live card signals"
        headers={[
          "Token",
          "Score",
          "Action",
          "Strength",
          "Risk",
          "Momentum",
          "Quality",
          "Penalty",
          "Drivers",
          "Blockers"
        ]}
        rows={sortedCards.map((card) => [
          <TokenName card={card} key="token" />,
          card.scoreLabel,
          card.action,
          card.signalStrength,
          card.riskLevel,
          card.strategy.components.momentumScore,
          card.strategy.components.qualityScore,
          card.strategy.components.riskPenalty,
          <DriverList drivers={card.strategy.positiveDrivers} key="drivers" />,
          <DriverList drivers={card.strategy.blockers} key="blockers" />
        ])}
      />
      <TableShell
        empty="No raw WebSocket signals"
        headers={["Mint", "Score", "Action", "Risk", "Reasons"]}
        rows={signals.map((signal) => [
          formatMintShort(signal.mint),
          signal.score,
          signal.action,
          signal.riskLevel ?? "unknown",
          <ReasonCodes codes={signal.reasonCodes} key="reasons" />
        ])}
        title="RAW SIGNALS"
      />
    </section>
  );
}

function MetricsTab({ metrics }: { metrics: MetricsRow[] }) {
  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>METRICS</h2>
          <p>Rolling windows, derivatives, and sample counts.</p>
        </div>
      </div>
      <TableShell
        empty="No metrics yet"
        headers={[
          "Token",
          "Samples",
          "10s USD",
          "10s SOL",
          "dVol/dt",
          "d2Vol/dt2",
          "dPrice/dt",
          "dBuyers/dt",
          "Buy/Sell",
          "Net Pressure",
          "Updated"
        ]}
        rows={metrics.map((metric) => [
          metric.identity?.displayName ?? formatMintShort(metric.mint),
          metric.sampleCount,
          formatUsd(metric.windows["10s"].totalVolumeUsd),
          formatSol(metric.windows["10s"].totalVolumeSol),
          formatVelocity(
            metric.usedSolMetricsFallback
              ? metric.volumeVelocitySolPerSec
              : metric.volumeVelocityUsdPerSec,
            metric.usedSolMetricsFallback ? "sol" : "usd"
          ),
          formatAcceleration(
            metric.usedSolMetricsFallback
              ? metric.volumeAccelerationSolPerSec2
              : metric.volumeAccelerationUsdPerSec2,
            metric.usedSolMetricsFallback ? "sol" : "usd"
          ),
          formatVelocity(
            metric.usedSolMetricsFallback
              ? metric.priceSolVelocityPctPerSec
              : metric.priceVelocityPctPerSec,
            "pct"
          ),
          formatVelocity(metric.buyerVelocityPerSec, "buyers"),
          formatCompactNumber(metric.buySellRatio),
          formatPct(metric.netBuyPressure),
          formatTime(metric.lastUpdatedAt)
        ])}
      />
    </section>
  );
}

function RiskTab({ riskRows }: { riskRows: RiskSnapshot[] }) {
  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>RISK</h2>
          <p>
            Hard rejects, authority flags, holder concentration, and risk
            reasons.
          </p>
        </div>
      </div>
      <TableShell
        empty="No risk snapshots yet"
        headers={[
          "Token",
          "Level",
          "Score",
          "Reject",
          "Mint Auth",
          "Freeze",
          "Holders",
          "Top",
          "Top10",
          "Liquidity",
          "Reasons"
        ]}
        rows={riskRows.map((risk) => [
          risk.symbol ?? formatMintShort(risk.mint),
          risk.riskLevel,
          risk.riskScore,
          risk.hardReject ? "yes" : "no",
          formatBool(risk.flags.mintAuthorityActive),
          formatBool(risk.flags.freezeAuthorityActive),
          formatCompactNumber(risk.flags.holderCount),
          formatPct(risk.flags.topHolderPct),
          formatPct(risk.flags.top10HolderPct),
          formatUsd(risk.flags.liquidityUsd),
          <ReasonCodes codes={risk.reasonCodes} key="reasons" />
        ])}
      />
    </section>
  );
}

function DataTab({
  actualDataStatus,
  actualTrades,
  chainStatus,
  dataWalletStatus,
  lightningStatus,
  feedStatus,
  indexerStatus,
  liveCardEnrichmentStatus,
  liveStatus,
  liveTradeTrackingStatus,
  marketObservations,
  marketStatus,
  pumpPortalWalletsStatus,
  tokenIdentities,
  tokenIdentityStatus
}: {
  actualDataStatus: ActualDataStatus | null;
  actualTrades: PumpPortalTradeRow[];
  chainStatus: ChainStatus | null;
  dataWalletStatus: PumpPortalDataWalletStatus | null;
  lightningStatus: LightningStatus | null;
  feedStatus: FeedStatus | null;
  indexerStatus: IndexerStatus | null;
  liveCardEnrichmentStatus: LiveCardEnrichmentStatus | null;
  liveStatus: LiveStatus | null;
  liveTradeTrackingStatus: LiveTradeTrackingStatus | null;
  marketObservations: MarketObservationRow[];
  marketStatus: MarketStatus | null;
  pumpPortalWalletsStatus: PumpPortalWalletsStatus | null;
  tokenIdentities: TokenIdentityRow[];
  tokenIdentityStatus: TokenIdentityStatus | null;
}) {
  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>DATA</h2>
          <p>
            Feed health, source status, identities, and recent observations.
          </p>
        </div>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="feed"
          value={feedStatus?.connected ? "CONNECTED" : "OFFLINE"}
          detail={feedStatus?.provider ?? "unknown"}
          tone={feedStatus?.connected ? "good" : "bad"}
        />
        <MetricValue
          label="live session"
          value={formatCompactNumber(liveStatus?.liveTokenCount)}
          detail={liveStatus?.sessionId ?? "--"}
        />
        <MetricValue
          label="actual data"
          value={actualDataStatus?.enabled ? "ON" : "OFF"}
          detail="token trades opt-in"
          tone={actualDataStatus?.enabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="data wallet"
          value={(dataWalletStatus?.balanceStatus ?? "unknown").toUpperCase()}
          detail={
            dataWalletStatus?.publicKeyConfigured
              ? (dataWalletStatus.shortPublicKey ?? "--")
              : "public key missing"
          }
          tone={getDataWalletTone(dataWalletStatus?.balanceStatus)}
        />
        <MetricValue
          label="trade tracking"
          value={liveTradeTrackingStatus?.enabled ? "ON" : "OFF"}
          detail={`${liveTradeTrackingStatus?.subscribedTokenCount ?? 0}/${
            liveTradeTrackingStatus?.maxSubscribedTokens ?? 0
          } mints`}
          tone={liveTradeTrackingStatus?.enabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="enrichment"
          value={liveCardEnrichmentStatus?.enabled ? "ON" : "OFF"}
          detail={`${liveCardEnrichmentStatus?.cachedMintCount ?? 0} cached`}
          tone={liveCardEnrichmentStatus?.enabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="market"
          value={marketStatus?.enabled ? "ON" : "OFF"}
          detail={`${marketStatus?.minConfidenceForMetrics ?? "--"} min`}
        />
        <MetricValue
          label="chain"
          value={(chainStatus?.status ?? "unknown").toUpperCase()}
          detail={chainStatus?.rpcHttpUrlConfigured ? "rpc set" : "rpc unset"}
        />
        <MetricValue
          label="identity"
          value={formatCompactNumber(tokenIdentityStatus?.identityCount)}
          detail={`${tokenIdentityStatus?.resolvedCount ?? 0} resolved`}
        />
        <MetricValue
          label="indexer"
          value={indexerStatus?.enabled ? "ON" : "OFF"}
          detail={indexerStatus?.source ?? "api_adapter"}
          tone={indexerStatus?.enabled ? "good" : "neutral"}
        />
        <MetricValue
          label="indexer events"
          value={formatCompactNumber(indexerStatus?.eventBus.publishedCount)}
          detail={`${indexerStatus?.liveState.tokenCount ?? 0} live-state tokens`}
        />
        <MetricValue
          label="future geyser"
          value={
            indexerStatus?.futureGeyser.implemented
              ? "IMPLEMENTED"
              : "NOT IMPLEMENTED"
          }
          detail={indexerStatus?.futureGeyser.status ?? "not_implemented"}
          tone="neutral"
        />
        <MetricValue
          label="managed stream"
          value={indexerStatus?.streamEnabled ? "ON" : "OFF"}
          detail={indexerStatus?.streamProvider ?? "mock"}
          tone={indexerStatus?.streamEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="REAL MANAGED STREAM: NOT CONNECTED"
          value={
            (
              indexerStatus?.managedStream?.clientStatus?.connectionState ??
              "disabled"
            ).toUpperCase()
          }
          detail={indexerStatus?.managedStream?.clientKind ?? "mock"}
          tone="neutral"
        />
        <MetricValue
          label="stream state"
          value={(indexerStatus?.streamConnectionState ?? "disabled").toUpperCase()}
          detail={`${formatCompactNumber(
            indexerStatus?.streamEnvelopeCount
          )} envelopes`}
        />
        <MetricValue
          label="stream events"
          value={formatCompactNumber(indexerStatus?.streamEventCount)}
          detail={`${formatCompactNumber(
            indexerStatus?.managedStream?.errorCount
          )} errors`}
        />
        <MetricValue
          label="stream auth"
          value={
            indexerStatus?.managedStream?.configured
              ? "CONFIGURED"
              : "UNCONFIGURED"
          }
          detail={
            indexerStatus?.managedStream?.authConfigured
              ? "auth configured"
              : "auth unset"
          }
        />
        <MetricValue
          label="stream endpoint"
          value={indexerStatus?.managedStream?.endpointMasked ? "MASKED" : "UNSET"}
          detail={indexerStatus?.managedStream?.endpointMasked ?? "no endpoint"}
        />
        <MetricValue
          label="subscription"
          value={
            indexerStatus?.managedStream?.subscriptionSummary?.transactionsEnabled
              ? "TRANSACTIONS"
              : "HEALTHCHECK"
          }
          detail={`programs ${formatCompactNumber(
            indexerStatus?.managedStream?.subscriptionSummary
              ?.transactionAccountIncludeCount
          )} / required ${formatCompactNumber(
            indexerStatus?.managedStream?.subscriptionSummary
              ?.transactionAccountRequiredCount
          )}`}
        />
        <MetricValue
          label="stream last"
          value={formatTimeAgo(indexerStatus?.managedStream?.lastMessageAt)}
          detail={indexerStatus?.managedStream?.connectionState ?? "disabled"}
        />
        <MetricValue
          label="yellowstone"
          value={
            indexerStatus?.managedStream?.yellowstoneStatus.connectionState ===
            "not_implemented"
              ? "SKELETON"
              : "DISABLED"
          }
          detail={
            indexerStatus?.managedStream?.yellowstoneStatus.connectionState ??
            "not_implemented"
          }
        />
        <MetricValue
          label="laserstream"
          value={
            indexerStatus?.managedStream?.laserstreamStatus.connectionState ===
            "not_implemented"
              ? "SKELETON"
              : "DISABLED"
          }
          detail={
            indexerStatus?.managedStream?.laserstreamStatus.connectionState ??
            "not_implemented"
          }
        />
      </div>
      <ReasonBlock title="Feed Reasons" codes={feedStatus?.reasonCodes} />
      <ReasonBlock title="Indexer Reasons" codes={indexerStatus?.reasonCodes} />
      <ReasonBlock
        title="Managed Stream Reasons"
        codes={indexerStatus?.managedStream?.reasonCodes}
      />
      <ReasonBlock
        title="Actual Data Reasons"
        codes={actualDataStatus?.reasonCodes}
      />
      <DataWalletPanel
        actualDataStatus={actualDataStatus}
        dataWalletStatus={dataWalletStatus}
        liveTradeTrackingStatus={liveTradeTrackingStatus}
      />
      <PumpPortalWalletsLightningPanel
        lightningStatus={lightningStatus}
        pumpPortalWalletsStatus={pumpPortalWalletsStatus}
      />
      <ReasonBlock
        title="Trade Tracking Reasons"
        codes={liveTradeTrackingStatus?.reasonCodes}
      />
      <ReasonBlock
        title="Enrichment Reasons"
        codes={liveCardEnrichmentStatus?.reasonCodes}
      />
      <TableShell
        empty="No token identities"
        headers={[
          "Token",
          "Source",
          "Confidence",
          "Resolved",
          "Metadata",
          "Updated"
        ]}
        rows={tokenIdentities.map((identity) => [
          identity.displayName,
          identity.dataSource,
          identity.confidence,
          identity.resolved ? "yes" : "no",
          identity.metadataUri ? "yes" : "--",
          formatTime(identity.updatedAt)
        ])}
        title="TOKEN IDENTITIES"
      />
      <TableShell
        empty="No actual PumpPortal token trades"
        headers={[
          "Mint",
          "Side",
          "Price SOL",
          "Volume SOL",
          "Usable",
          "Reasons"
        ]}
        rows={actualTrades.map((trade) => [
          trade.identity?.displayName ?? formatMintShort(trade.mint),
          trade.side,
          formatSol(trade.priceSol),
          formatSol(trade.volumeSol),
          trade.usableForMetrics ? "yes" : "no",
          <ReasonCodes codes={trade.reasonCodes} key="reasons" />
        ])}
        title="ACTUAL TOKEN TRADES"
      />
      <TableShell
        empty="No market observations"
        headers={[
          "Mint",
          "Side",
          "Quote",
          "Price",
          "Volume",
          "Confidence",
          "Usable"
        ]}
        rows={marketObservations.map((observation) => [
          formatMintShort(observation.mint),
          observation.side,
          observation.quoteAsset,
          formatUsdOrSol(observation.priceUsd, observation.priceSol),
          formatUsdOrSol(observation.volumeUsd, observation.volumeSol),
          observation.confidence,
          observation.usableForMetrics ? "yes" : "no"
        ])}
        title="MARKET OBSERVATIONS"
      />
    </section>
  );
}

function DataWalletPanel({
  actualDataStatus,
  dataWalletStatus,
  liveTradeTrackingStatus
}: {
  actualDataStatus: ActualDataStatus | null;
  dataWalletStatus: PumpPortalDataWalletStatus | null;
  liveTradeTrackingStatus: LiveTradeTrackingStatus | null;
}) {
  const publicKey = dataWalletStatus?.publicKey ?? null;

  return (
    <div className="data-wallet-panel">
      <div className="table-heading">
        <h3>DATA WALLET / PUMPPORTAL METERED DATA</h3>
        <span className="table-meta">DATA ONLY / PAPER ONLY</span>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="status"
          value={(dataWalletStatus?.balanceStatus ?? "unknown").toUpperCase()}
          detail="billing readiness"
          tone={getDataWalletTone(dataWalletStatus?.balanceStatus)}
        />
        <MetricValue
          label="funding address"
          value={dataWalletStatus?.shortPublicKey ?? "--"}
          detail={
            dataWalletStatus?.publicKeyConfigured
              ? "public key"
              : "missing"
          }
        />
        <MetricValue
          label="balance"
          value={formatSol(dataWalletStatus?.balanceSol)}
          detail={`${formatSol(dataWalletStatus?.minBalanceSol)} minimum`}
          tone={getDataWalletTone(dataWalletStatus?.balanceStatus)}
        />
        <MetricValue
          label="target"
          value={formatSol(dataWalletStatus?.targetBalanceSol)}
          detail={`${formatSol(dataWalletStatus?.warnBalanceSol)} warn`}
        />
        <MetricValue
          label="events left"
          value={formatCompactNumber(
            dataWalletStatus?.estimatedEventsRemaining
          )}
          detail={`${formatSol(
            dataWalletStatus?.estimatedCostPer10000EventsSol
          )} / 10k events`}
        />
        <MetricValue
          label="api key"
          value={dataWalletStatus?.apiKeyConfigured ? "YES" : "NO"}
          detail="backend only"
          tone={dataWalletStatus?.apiKeyConfigured ? "good" : "bad"}
        />
        <MetricValue
          label="rpc balance"
          value={dataWalletStatus?.solanaRpcConfigured ? "YES" : "NO"}
          detail={formatTimeAgo(dataWalletStatus?.lastBalanceCheckAt)}
          tone={dataWalletStatus?.solanaRpcConfigured ? "good" : "warn"}
        />
        <MetricValue
          label="trades"
          value={liveTradeTrackingStatus?.enabled ? "ON" : "OFF"}
          detail={
            actualDataStatus?.acknowledgedMetered ? "acknowledged" : "not acked"
          }
        />
        <MetricValue
          label="subscribed"
          value={formatCompactNumber(
            liveTradeTrackingStatus?.subscribedTokenCount
          )}
          detail={`${formatCompactNumber(
            liveTradeTrackingStatus?.totalEventsThisSession
          )} session events`}
        />
        <MetricValue
          label="budget"
          value={formatCompactNumber(
            liveTradeTrackingStatus?.maxEventsPerSession
          )}
          detail={
            liveTradeTrackingStatus?.budgetReached
              ? "budget reached"
              : "session cap"
          }
          tone={liveTradeTrackingStatus?.budgetReached ? "bad" : "neutral"}
        />
      </div>
      <div className="data-wallet-address-row">
        <span className="mono">{publicKey ?? "PUMPPORTAL_DATA_WALLET_PUBLIC_KEY missing"}</span>
        <button
          disabled={!publicKey}
          onClick={() => copyPublicKey(publicKey)}
          type="button"
        >
          COPY ADDRESS
        </button>
      </div>
      <div className="signal-risk-strip data-wallet-warnings">
        <span>DATA ONLY</span>
        <span>PAPER ONLY</span>
        <span>NO TRADING ENDPOINTS</span>
        <span>NO PRIVATE KEY STORED</span>
        <span>FUND SMALL AMOUNTS ONLY</span>
      </div>
      <ReasonBlock
        title="Data Wallet Reasons"
        codes={dataWalletStatus?.reasonCodes}
      />
    </div>
  );
}

function PumpPortalWalletsLightningPanel({
  lightningStatus,
  pumpPortalWalletsStatus
}: {
  lightningStatus: LightningStatus | null;
  pumpPortalWalletsStatus: PumpPortalWalletsStatus | null;
}) {
  const [mint, setMint] = useState("");
  const [amountSol, setAmountSol] = useState("0.001");
  const [plan, setPlan] = useState<LightningTradePlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const submitPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPlanError(null);

    try {
      const nextPlan = await postJson<LightningTradePlan>(
        "/execution/lightning/plan-buy",
        {
          mint,
          amountSol: Number(amountSol),
          reason: "dashboard_plan_only"
        }
      );
      setPlan(nextPlan);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="data-wallet-panel lightning-panel">
      <div className="table-heading">
        <h3>PUMPPORTAL WALLETS / LIGHTNING READINESS</h3>
        <span className="table-meta">NO TRANSACTION SENT / PLANNING ONLY</span>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="live trading"
          value={lightningStatus?.liveTradingAllowed ? "ON" : "DISABLED"}
          detail="execution gate"
          tone={lightningStatus?.liveTradingAllowed ? "bad" : "good"}
        />
        <MetricValue
          label="manual arm"
          value={lightningStatus?.manualArmed ? "ARMED" : "NOT ARMED"}
          detail={
            lightningStatus?.manualArmRequired ? "required" : "not required"
          }
          tone={lightningStatus?.manualArmed ? "warn" : "good"}
        />
        <MetricValue
          label="max buy"
          value={formatSol(lightningStatus?.maxBuySol)}
          detail={`${formatSol(lightningStatus?.maxDailySol)} daily`}
        />
        <MetricValue
          label="slippage cap"
          value={`${lightningStatus?.slippage ?? "--"}%`}
          detail={`${formatSol(lightningStatus?.priorityFee)} priority`}
        />
        <MetricValue
          label="pool"
          value={lightningStatus?.pool ?? "--"}
          detail={`${lightningStatus?.maxOpenPositions ?? 0} max open`}
        />
        <MetricValue
          label="same wallet"
          value={pumpPortalWalletsStatus?.sameWallet ? "YES" : "NO"}
          detail="separate preferred"
          tone={pumpPortalWalletsStatus?.sameWallet ? "warn" : "good"}
        />
      </div>
      <div className="wallet-readiness-grid">
        <WalletReadinessBlock
          purpose="metered data streams"
          title="DATA WALLET"
          wallet={pumpPortalWalletsStatus?.dataWallet ?? null}
        />
        <WalletReadinessBlock
          purpose="future Lightning execution"
          title="TRADING WALLET"
          wallet={pumpPortalWalletsStatus?.tradingWallet ?? null}
        />
      </div>
      {pumpPortalWalletsStatus?.sameWalletWarning ? (
        <div className="inline-warning">
          {pumpPortalWalletsStatus.sameWalletWarning}
        </div>
      ) : null}
      <div className="signal-risk-strip data-wallet-warnings">
        <span>NO TRANSACTION SENT</span>
        <span>PLAN ONLY</span>
        <span>NO EXECUTE BUTTON</span>
        <span>NO PRIVATE KEY FIELD</span>
        <span>NO API KEY FIELD</span>
        <span>FUND SMALL AMOUNTS ONLY</span>
      </div>
      <form className="planner-form" onSubmit={submitPlan}>
        <label>
          <span>Mint</span>
          <input
            onChange={(event) => setMint(event.target.value)}
            placeholder="token mint"
            value={mint}
          />
        </label>
        <label>
          <span>Amount SOL</span>
          <input
            min="0"
            onChange={(event) => setAmountSol(event.target.value)}
            step="0.0001"
            type="number"
            value={amountSol}
          />
        </label>
        <button type="submit">PLAN ONLY</button>
      </form>
      {planError ? <div className="inline-warning">{planError}</div> : null}
      {plan ? (
        <div className="plan-result">
          <div className="table-heading">
            <h3>DRY-RUN PLAN</h3>
            <span className="table-meta">NO TRANSACTION SENT</span>
          </div>
          <div className="status-grid secondary-grid">
            <MetricValue
              label="mode"
              value={plan.mode.toUpperCase()}
              detail={plan.id}
              tone={plan.blocked ? "warn" : "good"}
            />
            <MetricValue
              label="blocked"
              value={plan.blocked ? "YES" : "NO"}
              detail={plan.estimatedRisk}
              tone={plan.blocked ? "bad" : "good"}
            />
            <MetricValue
              label="amount"
              value={formatSol(plan.amountSol)}
              detail={`${formatSol(plan.maxBuySol)} max`}
            />
            <MetricValue
              label="request"
              value={plan.request.action.toUpperCase()}
              detail={`${plan.request.pool} pool`}
            />
          </div>
          <div className="data-wallet-address-row">
            <span className="mono">
              {plan.request.mint} / {formatSol(plan.request.amount)} /{" "}
              {plan.request.slippage}% slippage
            </span>
          </div>
          <ReasonBlock title="Plan Blockers" codes={plan.blockers} />
          <ReasonBlock title="Plan Warnings" codes={plan.warnings} />
          <ReasonBlock
            title="Plan Safety Checks"
            codes={plan.safetyChecks.map((check) => check.code)}
          />
        </div>
      ) : null}
      <ReasonBlock
        title="Wallet Reasons"
        codes={pumpPortalWalletsStatus?.reasonCodes}
      />
      <ReasonBlock
        title="Lightning Reasons"
        codes={lightningStatus?.reasonCodes}
      />
    </div>
  );
}

function WalletReadinessBlock({
  purpose,
  title,
  wallet
}: {
  purpose: string;
  title: string;
  wallet: PumpPortalWalletSummary | null;
}) {
  const publicKey = wallet?.publicKey ?? null;

  return (
    <div className="wallet-readiness-block">
      <div className="table-heading">
        <h3>{title}</h3>
        <span className="table-meta">{purpose}</span>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="status"
          value={(wallet?.balanceStatus ?? "unknown").toUpperCase()}
          detail={wallet?.configured ? "configured" : "not ready"}
          tone={getDataWalletTone(wallet?.balanceStatus)}
        />
        <MetricValue
          label="api key"
          value={wallet?.apiKeyConfigured ? "YES" : "NO"}
          detail="backend only"
          tone={wallet?.apiKeyConfigured ? "good" : "bad"}
        />
        <MetricValue
          label="balance"
          value={formatSol(wallet?.balanceSol)}
          detail={`${formatSol(wallet?.minBalanceSol)} minimum`}
          tone={getDataWalletTone(wallet?.balanceStatus)}
        />
        <MetricValue
          label="address"
          value={wallet?.shortPublicKey ?? "--"}
          detail={wallet?.publicKeyValid ? "valid" : "missing/invalid"}
        />
      </div>
      <div className="data-wallet-address-row">
        <span className="mono">{publicKey ?? `${title} public key missing`}</span>
        <button
          disabled={!publicKey}
          onClick={() => copyPublicKey(publicKey)}
          type="button"
        >
          COPY ADDRESS
        </button>
      </div>
      <ReasonBlock title={`${title} Reasons`} codes={wallet?.reasonCodes} />
    </div>
  );
}

function StorageTab({
  chainVerifications,
  liveEvents,
  storageStats
}: {
  chainVerifications: ChainVerificationRow[];
  liveEvents: LiveEventRow[];
  storageStats: StorageStats | null;
}) {
  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>STORAGE / DEBUG</h2>
          <p>
            Persisted counts, live feed rows, and read-only chain verification
            rows.
          </p>
        </div>
      </div>
      <div className="debug-grid">
        {Object.entries(storageStats ?? {}).map(([key, value]) => (
          <div className="debug-row" key={key}>
            <span>{key}</span>
            <strong>{String(value ?? "--")}</strong>
          </div>
        ))}
      </div>
      <TableShell
        empty="No live feed events"
        headers={["Mint", "Type", "Real", "Created", "Reasons"]}
        rows={liveEvents.map((event) => [
          event.symbol ?? formatMintShort(event.mint),
          event.eventType,
          event.realData ? "REAL" : "MOCK",
          formatTime(event.createdAt),
          <ReasonCodes codes={event.reasonCodes} key="reasons" />
        ])}
        title="LIVE FEED EVENTS"
      />
      <TableShell
        empty="No chain verifications"
        headers={[
          "Mint",
          "Status",
          "Mint Auth",
          "Freeze",
          "Top",
          "Top10",
          "Reasons"
        ]}
        rows={chainVerifications.map((row) => [
          formatMintShort(row.mint),
          row.status,
          formatBool(row.mintAuthorityActive),
          formatBool(row.freezeAuthorityActive),
          formatPct(row.topHolderPct),
          formatPct(row.top10HolderPct),
          <ReasonCodes codes={row.reasonCodes} key="reasons" />
        ])}
        title="CHAIN VERIFICATIONS"
      />
    </section>
  );
}

function TableShell({
  empty,
  headers,
  rows,
  title
}: {
  empty: string;
  headers: string[];
  rows: Array<Array<ReactNode>>;
  title?: string;
}) {
  return (
    <div className="table-region">
      {title ? (
        <div className="table-heading">
          <h3>{title}</h3>
          <span className="table-meta">{rows.length} rows</span>
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td
                className="empty-state compact-empty"
                colSpan={headers.length}
              >
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  detail,
  label,
  value
}: {
  detail?: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="card-stat">
      <span>{label}</span>
      <strong>{formatUnknown(value)}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function TokenName({ card }: { card: LiveTokenCardViewModel }) {
  return (
    <span className="token-cell" title={card.mint}>
      <span className="token-title">{card.displayName}</span>
      <span className="token-mint mono">{card.shortMint}</span>
    </span>
  );
}

function DriverList({
  drivers
}: {
  drivers: LiveTokenCardViewModel["strategy"]["positiveDrivers"];
}) {
  if (drivers.length === 0) {
    return <span className="muted">--</span>;
  }

  return (
    <span className="driver-list">
      {drivers.slice(0, 3).map((driver) => (
        <span
          className="driver-code"
          key={`${driver.reasonCode}-${driver.label}`}
        >
          {driver.label}
        </span>
      ))}
      {drivers.length > 3 ? (
        <span className="driver-code">+{drivers.length - 3}</span>
      ) : null}
    </span>
  );
}

function ReasonBlock({
  codes,
  title
}: {
  codes: string[] | undefined;
  title: string;
}) {
  return (
    <div className="reason-block">
      <h3>{title}</h3>
      <ReasonCodes codes={codes} limit={10} />
    </div>
  );
}

function filterCards(
  cards: LiveTokenCardViewModel[],
  options: {
    actionFilter: ActionFilter;
    realOnly: boolean;
    search: string;
  }
): LiveTokenCardViewModel[] {
  const query = options.search.trim().toLowerCase();

  return cards.filter((card) => {
    if (options.realOnly && !card.realData) {
      return false;
    }

    if (query.length > 0) {
      const haystack = [
        card.mint,
        card.name ?? "",
        card.symbol ?? "",
        card.title,
        card.displayName
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    if (options.actionFilter === "watch") {
      return (
        card.action.includes("WATCH") || card.lifecycleState === "watching"
      );
    }

    if (options.actionFilter === "qualified") {
      return card.buyReady || card.lifecycleState === "qualified";
    }

    if (options.actionFilter === "rejected") {
      return (
        card.hardReject ||
        card.signalStrength === "reject" ||
        card.lifecycleState === "rejected"
      );
    }

    return true;
  });
}

function sortCards(
  cards: LiveTokenCardViewModel[],
  sortMode: SortMode
): LiveTokenCardViewModel[] {
  const riskWeight: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    unknown: 2,
    low: 1
  };

  return [...cards].sort((left, right) => {
    if (sortMode === "score") {
      return right.score - left.score;
    }

    if (sortMode === "volumeVelocity") {
      return (
        (right.volumeVelocityUsdPerSec ?? right.volumeVelocitySolPerSec ?? -1) -
        (left.volumeVelocityUsdPerSec ?? left.volumeVelocitySolPerSec ?? -1)
      );
    }

    if (sortMode === "volume10s") {
      return (
        (right.volume10sUsd ?? right.volume10sSol ?? -1) -
        (left.volume10sUsd ?? left.volume10sSol ?? -1)
      );
    }

    if (sortMode === "risk") {
      return (
        (riskWeight[right.riskLevel] ?? 0) - (riskWeight[left.riskLevel] ?? 0)
      );
    }

    return Date.parse(right.latestEventAt) - Date.parse(left.latestEventAt);
  });
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

  return feedStatus?.connected ? "LIVE FEED CONNECTED" : "LIVE FEED OFFLINE";
}

function activateTab(tab: TabId, setActiveTab: (tab: TabId) => void): void {
  setActiveTab(tab);
  window.location.hash = tab;
}

function getInitialTab(): TabId {
  const hash = window.location.hash.replace("#", "");
  return tabs.some((tab) => tab.id === hash) ? (hash as TabId) : "live";
}

function normalizeClassName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function formatDataQuality(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}

function formatTradeTrackingState(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}

function getTradeTrackingBadgeClass(value: string): string {
  if (value === "tracking") {
    return "terminal-badge-online";
  }

  if (value === "budget_reached" || value === "error") {
    return "terminal-badge-offline";
  }

  if (value === "tracking_requested") {
    return "terminal-badge-warning";
  }

  return "terminal-badge-neutral";
}

function getDataWalletTone(
  balanceStatus: string | null | undefined
): "good" | "bad" | "warn" | "neutral" {
  if (balanceStatus === "ok") {
    return "good";
  }

  if (balanceStatus === "critical" || balanceStatus === "missing_config") {
    return "bad";
  }

  if (balanceStatus === "low" || balanceStatus === "unknown") {
    return "warn";
  }

  return "neutral";
}

function copyPublicKey(publicKey: string | null): void {
  if (!publicKey || !navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(publicKey);
}

function formatBool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }

  return value ? "yes" : "no";
}

function formatUsdOrSol(
  usdValue: number | null | undefined,
  solValue: number | null | undefined
): string {
  const usd = formatUsd(usdValue);

  if (usd !== "--") {
    return usd;
  }

  return formatSol(solValue);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}
