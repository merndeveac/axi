import {
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type {
  LiveTokenCardViewModel,
  MomentumDiagnostics,
  MomentumScannerRow,
  OverlaySignal,
  RiskSnapshot,
  RollingMetricsSnapshot,
  StrategyStatus,
  TokenIdentitySummary
} from "@axi/shared";
import { ConnectionBadge } from "./components/ConnectionBadge";
import { DataPanel } from "./components/DataPanel";
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
type TabId =
  | "scanner"
  | "signals"
  | "portfolio"
  | "metrics"
  | "risk"
  | "exit"
  | "data"
  | "debug";
type SortMode =
  | "newest"
  | "launchScore"
  | "volume10s"
  | "volumeVelocity"
  | "priceVelocity"
  | "uniqueBuyers"
  | "buySellRatio"
  | "risk"
  | "pnl";
type ActionFilter =
  | "all"
  | "watch"
  | "hot"
  | "ripping"
  | "rejected"
  | "tradeTracked"
  | "discoveryOnly"
  | "missingCritical";

type StorageStats = {
  databasePath: string;
  feedEventCount: number;
  liveFeedEventCount: number;
  launchCandidateCount: number;
  launchScoreSnapshotCount: number;
  launchTradeSampleCount: number;
  launchTrackingEventCount: number;
  launchTrackingSessionCount: number;
  signalCount: number;
  chainVerificationCount: number;
  chainTransactionEventCount: number;
  chainTradeEventCount: number;
  marketObservationCount: number;
  pumpPortalTokenTradeEventCount: number;
  actualDataSubscriptionCount: number;
  actualDataSessionCount: number;
  meteredLaunchDataSessionCount: number;
  meteredLaunchDataSubscriptionCount: number;
  meteredLaunchDataEventCount: number;
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
  paperPortfolioOrderCount: number;
  paperPortfolioFillCount: number;
  paperPortfolioPositionCount: number;
  paperPortfolioSnapshotCount: number;
  watchedWalletCount: number;
  watchedWalletTradeEventCount: number;
  exitRuleCount: number;
  exitSignalCount: number;
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
  accountTradeEventCount: number;
  accountTradeSubscriptions: string[];
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
  meteredLaunchData?: MeteredLaunchDataStatus;
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

type LaunchScannerStatus = {
  runtimeMode: string;
  provider: string;
  liveDiscoveryEnabled: boolean;
  liveDiscoveryActive: boolean;
  subscribeNewToken: boolean;
  subscribeMigration: boolean;
  candidateCount: number;
  scoreSnapshotCount: number;
  trackedMintCount: number;
  launchTrackingEnabled: boolean;
  launchTrackingAcknowledgedMetered: boolean;
  launchTrackingMode: string;
  maxConcurrentTracked: number;
  maxEventsPerToken: number;
  maxEventsPerSession: number;
  maxSessionCostSol: number;
  totalEventsThisSession: number;
  estimatedMeteredCostSol: number;
  minScoreToExtend: number;
  minScoreToRip: number;
  trackedMints: string[];
  reasonCodes: string[];
  meteredLaunchData?: MeteredLaunchDataStatus;
  paperOnly: true;
  tradingDisabled: true;
};

type MeteredLaunchDataStatus = {
  enabled: boolean;
  active: boolean;
  acknowledgedCost: boolean;
  requireDataWalletReady: boolean;
  ready: boolean;
  mode: string;
  provider: string;
  liveDiscoveryEnabled: boolean;
  liveDiscoveryActive: boolean;
  apiKeyConfigured: boolean;
  dataWalletConfigured: boolean;
  dataWalletBalanceSol: number | null;
  dataWalletBalanceStatus: string;
  dataWalletEstimatedEventsRemaining: number | null;
  maxConcurrentMints: number;
  trackedMintCount: number;
  maxEventsPerMint: number;
  maxEventsPerSession: number;
  totalEventsThisSession: number;
  estimatedCostSol: number;
  maxSessionCostSol: number;
  remainingBudgetSol: number;
  projectedCostPerHourSol: number;
  budgetReached: boolean;
  reasonCodes: string[];
  trackedMints: string[];
  lastStopReason: string | null;
  startedAt: string | null;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

type RuntimeControlStatus = {
  controlPlaneEnabled: boolean;
  localOnly: boolean;
  runtimeMode: string;
  paperOnly: true;
  tradingDisabled: true;
  liveDiscovery: {
    enabled: boolean;
    connected: boolean;
    connecting: boolean;
    stopped: boolean;
    lastStartedAt: string | null;
    lastStoppedAt: string | null;
    lastEventAt: string | null;
    newTokenEventCount: number;
    migrationEventCount: number;
    errorCount: number;
    lastError: string | null;
    reasonCodes: string[];
  };
  meteredLaunchData: {
    enabled: boolean;
    active: boolean;
    blocked: boolean;
    trackedMintCount: number;
    eventCount: number;
    estimatedCostSol: number;
    sessionCostCapSol: number;
    budgetRemainingSol: number;
    latestEventAt: string | null;
    reasonCodes: string[];
  };
  dataWallet: {
    publicKeyConfigured: boolean;
    publicKey: string | null;
    shortPublicKey: string | null;
    apiKeyConfigured: boolean;
    balanceSol: number | null;
    balanceStatus: string;
    estimatedEventsRemaining: number | null;
    lastBalanceCheckAt: string | null;
    reasonCodes: string[];
  };
  process: {
    pid: number;
    uptimeSeconds: number;
    ports: number[];
    startedAt: string;
  };
  reasonCodes: string[];
};

type RuntimeControlResult = {
  ok: boolean;
  message: string;
  status: RuntimeControlStatus;
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

type MeteredLaunchDataTrackedMint = {
  mint: string;
  status: string;
  reason: string;
  eventCount: number;
  estimatedCostSol: number;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
  initialReviewAt: string | null;
  extendedReviewAt: string | null;
  latestTradeAt: string | null;
  latestPriceSol: number | null;
  latestVolumeSol: number | null;
  reasonCodes: string[];
};

type MeteredLaunchDataTrackedResponse = {
  current: MeteredLaunchDataTrackedMint[];
  persisted: MeteredLaunchDataTrackedMint[];
  sessions: unknown[];
  status: MeteredLaunchDataStatus;
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
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
    realConnectionAllowed?: boolean;
    realConnectionAck?: boolean;
    realProvider?: string;
    laserstream?: {
      enabled: boolean;
      configured: boolean;
      apiKeyConfigured: boolean;
      endpointMasked: string | null;
      readyToConnect: boolean;
      connected: boolean;
      reasonCodes: string[];
      messageCount: number;
      lastMessageAt: string | null;
      maxMessagesPerSession: number;
      maxRuntimeMs: number;
    };
    connectionBlockedReasons?: string[];
    secretsExposed?: false;
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
  accountTradeMonitoringEnabled: boolean;
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
  launchScanner: LaunchScannerStatus;
  meteredLaunchData: MeteredLaunchDataStatus;
  runtimeControl: RuntimeControlStatus;
  runtimeControlEnabled: boolean;
  runtimeControlLocalOnly: boolean;
  runtimeLiveDiscoveryState: string;
  runtimeMeteredLaunchDataState: string;
  meteredLaunchDataEnabled: boolean;
  meteredLaunchDataReady: boolean;
  meteredLaunchDataTrackedCount: number;
  meteredLaunchDataEstimatedCostSol: number;
  meteredLaunchDataBudgetReached: boolean;
  mockFeedEnabled: boolean;
  mockRuntimeBlocked: boolean;
  noFeedMode: boolean;
  noRealFeedMessage?: string;
  realDataActive: boolean;
  tokenIdentity: TokenIdentityStatus;
  watchedWalletCount: number;
  watchedWalletExit: ExitStatus;
  watchedWalletTradeEventCount: number;
  paperPortfolio: PaperPortfolioStatus;
  paperPortfolioEnabled: boolean;
  paperEntryEnabled: boolean;
  paperExitEnabled: boolean;
  openPaperPositionCount: number;
  totalPaperPnlSol: number;
  exitRuleCount: number;
  exitSignalCount: number;
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

type ExitStatus = {
  enabled: boolean;
  accountTradesEnabled: boolean;
  meteredAck: boolean;
  watchedWalletCount: number;
  enabledRuleCount: number;
  observedTradeCount: number;
  exitSignalCount: number;
  maxWatchedWallets: number;
  maxEventsPerSession: number;
  estimatedCostSol: number;
  budgetReached: boolean;
  dataWalletReady: boolean;
  accountTradeMonitoringEnabled: boolean;
  accountTradeSubscribedWalletCount: number;
  accountTradeEventCount: number;
  reasonCodes: string[];
  paperOnly: true;
  liveExecutionDisabled: true;
};

type ExitWallet = {
  address: string;
  alias: string | null;
  tags: string[];
  enabled: boolean;
  source: string;
  reasonCodes: string[];
  createdAt: string;
  updatedAt: string;
};

type ExitRule = {
  id?: string;
  ruleId?: string;
  name: string;
  enabled: boolean;
  trigger: string;
  minProfitPct: number;
  minProfitSol?: number | null;
  sellPct: number;
  requirePositionOpenedBeforeWalletTrade: boolean;
  requireCurrentPrice?: boolean;
  cooldownMs: number;
  priority: number;
  reasonCodes: string[];
};

type ExitEvent = {
  id: number;
  wallet: string;
  walletAlias: string | null;
  mint: string;
  side: string;
  priceSol: number | null;
  volumeSol: number | null;
  tokenAmount: number | null;
  signature: string | null;
  confidence: string;
  usableForExitStrategy: boolean;
  reasonCodes: string[];
  createdAt: string;
};

type ExitSignal = {
  id: number;
  signalId: string;
  mint: string;
  wallet: string;
  walletAlias: string | null;
  ruleId: string;
  action: "paper_sell";
  sellPct: number;
  blocked: boolean;
  blockers: string[];
  warnings: string[];
  reasonCodes: string[];
  createdAt: string;
};

type PaperPortfolioStatus = {
  enabled: boolean;
  entryPolicyEnabled: boolean;
  exitPolicyEnabled: boolean;
  openPositionCount: number;
  closedPositionCount: number;
  orderCount: number;
  fillCount: number;
  snapshotCount: number;
  totalPnlSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  winRate: number;
  maxDrawdownSol: number;
  paperOnly: true;
  liveExecutionDisabled: true;
  reasonCodes: string[];
};

type PaperPortfolioSnapshot = {
  cashSol: number;
  deployedSol: number;
  equitySol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  totalPnlPct: number;
  openPositionCount: number;
  closedPositionCount: number;
  winRate: number;
  maxDrawdownSol: number;
  maxDrawdownPct: number;
  totalFeesSol: number;
  totalTrades: number;
  updatedAt: string;
};

type PaperPortfolioPosition = {
  id: number;
  positionId: string;
  mint: string;
  symbol: string | null;
  title: string | null;
  status: "open" | "partially_closed" | "closed";
  entryPriceSol: number;
  averageEntryPriceSol: number;
  currentPriceSol: number | null;
  sizeSol: number;
  remainingSizeSol: number;
  tokenAmount: number;
  remainingTokenAmount: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  realizedPnlPct: number;
  unrealizedPnlPct: number;
  totalFeesSol: number;
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
};

type PaperPortfolioOrder = {
  id: number;
  orderId: string;
  type: "entry" | "exit";
  side: "buy" | "sell";
  mint: string;
  symbol: string | null;
  title: string | null;
  source: string;
  requestedSizeSol: number | null;
  requestedSellPct: number | null;
  signalScore: number | null;
  riskLevel: string | null;
  reasonCodes: string[];
  createdAt: string;
};

type PaperPortfolioFill = {
  id: number;
  fillId: string;
  orderId: string;
  side: "buy" | "sell";
  mint: string;
  priceSol: number;
  effectivePriceSol: number;
  sizeSol: number;
  tokenAmount: number;
  feeSol: number;
  slippageSol: number;
  fillStatus: "filled" | "rejected" | "partial";
  rejectionReason: string | null;
  reasonCodes: string[];
  createdAt: string;
};

type PaperPortfolioSnapshotResponse = {
  snapshot: PaperPortfolioSnapshot;
  status: PaperPortfolioStatus;
};

type PaperPortfolioPositionsResponse = {
  positions: PaperPortfolioPosition[];
  status: PaperPortfolioStatus;
};

type PaperPortfolioOrdersResponse = {
  orders: PaperPortfolioOrder[];
  status: PaperPortfolioStatus;
};

type PaperPortfolioFillsResponse = {
  fills: PaperPortfolioFill[];
  status: PaperPortfolioStatus;
};

type PaperPortfolioPerformanceResponse = {
  snapshot: PaperPortfolioSnapshot;
  bestTrade: PaperPortfolioPosition | null;
  worstTrade: PaperPortfolioPosition | null;
  snapshots: Array<PaperPortfolioSnapshot & { id?: number; createdAt?: string }>;
  paperOnly: true;
  liveExecutionDisabled: true;
};

type ExitWalletsResponse = {
  current: ExitWallet[];
  persisted: ExitWallet[];
};

type ExitRulesResponse = {
  current: ExitRule[];
  persisted: ExitRule[];
};

type ExitEventsResponse = {
  events: ExitEvent[];
};

type ExitSignalsResponse = {
  signals: ExitSignal[];
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
  { id: "scanner", label: "Scanner" },
  { id: "signals", label: "Signals" },
  { id: "portfolio", label: "Portfolio" },
  { id: "metrics", label: "Metrics" },
  { id: "risk", label: "Risk" },
  { id: "exit", label: "Exit" },
  { id: "data", label: "Data" },
  { id: "debug", label: "Debug" }
];

const wsUrl =
  import.meta.env.VITE_AXI_WS_URL ?? "ws://localhost:8787/ws/signals";
const apiBaseUrl = import.meta.env.VITE_AXI_API_URL ?? "http://localhost:8787";

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [momentumRows, setMomentumRows] = useState<MomentumScannerRow[]>([]);
  const [momentumDiagnostics, setMomentumDiagnostics] =
    useState<MomentumDiagnostics | null>(null);
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
  const [exitStatus, setExitStatus] = useState<ExitStatus | null>(null);
  const [exitWallets, setExitWallets] = useState<ExitWallet[]>([]);
  const [exitRules, setExitRules] = useState<ExitRule[]>([]);
  const [exitEvents, setExitEvents] = useState<ExitEvent[]>([]);
  const [exitSignals, setExitSignals] = useState<ExitSignal[]>([]);
  const [paperPortfolioStatus, setPaperPortfolioStatus] =
    useState<PaperPortfolioStatus | null>(null);
  const [paperPortfolioSnapshot, setPaperPortfolioSnapshot] =
    useState<PaperPortfolioSnapshot | null>(null);
  const [paperPortfolioPositions, setPaperPortfolioPositions] = useState<
    PaperPortfolioPosition[]
  >([]);
  const [paperPortfolioOrders, setPaperPortfolioOrders] = useState<
    PaperPortfolioOrder[]
  >([]);
  const [paperPortfolioFills, setPaperPortfolioFills] = useState<
    PaperPortfolioFill[]
  >([]);
  const [paperPortfolioPerformance, setPaperPortfolioPerformance] =
    useState<PaperPortfolioPerformanceResponse | null>(null);
  const [liveTradeTrackingStatus, setLiveTradeTrackingStatus] =
    useState<LiveTradeTrackingStatus | null>(null);
  const [launchScannerStatus, setLaunchScannerStatus] =
    useState<LaunchScannerStatus | null>(null);
  const [meteredLaunchDataStatus, setMeteredLaunchDataStatus] =
    useState<MeteredLaunchDataStatus | null>(null);
  const [meteredLaunchDataTracked, setMeteredLaunchDataTracked] = useState<
    MeteredLaunchDataTrackedMint[]
  >([]);
  const [runtimeControlStatus, setRuntimeControlStatus] =
    useState<RuntimeControlStatus | null>(null);
  const [runtimeActionStatus, setRuntimeActionStatus] =
    useState<string>("ready");
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
  const [sortMode, setSortMode] = useState<SortMode>("launchScore");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [realOnly, setRealOnly] = useState(true);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
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

    const refreshScannerRows = async () => {
      try {
        const nextRows = await fetchJson<MomentumScannerRow[]>(
          "/ui/momentum-rows"
        );
        setMomentumRows(nextRows);
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
          void refreshScannerRows();
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
          nextMomentumRows,
          nextMomentumDiagnostics,
          nextCards,
          nextStrategy,
          nextSignals,
          nextMetrics,
          nextRiskRows,
          nextActualDataStatus,
          nextDataWalletStatus,
          nextPumpPortalWalletsStatus,
          nextLightningStatus,
          nextExitStatus,
          nextExitWallets,
          nextExitRules,
          nextExitEvents,
          nextExitSignals,
          nextPaperPortfolioStatus,
          nextPaperPortfolioSnapshot,
          nextPaperPortfolioPositions,
          nextPaperPortfolioOrders,
          nextPaperPortfolioFills,
          nextPaperPortfolioPerformance,
          nextLiveTradeTrackingStatus,
          nextLaunchScannerStatus,
          nextMeteredLaunchDataStatus,
          nextMeteredLaunchDataTracked,
          nextRuntimeControlStatus,
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
          fetchJson<MomentumScannerRow[]>("/ui/momentum-rows"),
          fetchJson<MomentumDiagnostics>("/ui/momentum-diagnostics"),
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
          fetchJson<ExitStatus>("/exit/status"),
          fetchJson<ExitWalletsResponse>("/exit/wallets"),
          fetchJson<ExitRulesResponse>("/exit/rules"),
          fetchJson<ExitEventsResponse>("/exit/events?limit=25"),
          fetchJson<ExitSignalsResponse>("/exit/signals?limit=25"),
          fetchJson<PaperPortfolioStatus>("/paper-portfolio/status"),
          fetchJson<PaperPortfolioSnapshotResponse>("/paper-portfolio/snapshot"),
          fetchJson<PaperPortfolioPositionsResponse>(
            "/paper-portfolio/positions"
          ),
          fetchJson<PaperPortfolioOrdersResponse>(
            "/paper-portfolio/orders?limit=50"
          ),
          fetchJson<PaperPortfolioFillsResponse>(
            "/paper-portfolio/fills?limit=50"
          ),
          fetchJson<PaperPortfolioPerformanceResponse>(
            "/paper-portfolio/performance"
          ),
          fetchJson<LiveTradeTrackingStatus>("/live/trade-tracking/status"),
          fetchJson<LaunchScannerStatus>("/launch/status"),
          fetchJson<MeteredLaunchDataStatus>("/metered-launch-data/status"),
          fetchJson<MeteredLaunchDataTrackedResponse>(
            "/metered-launch-data/tracked?limit=25"
          ),
          fetchJson<RuntimeControlStatus>("/runtime/status"),
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
          setMomentumRows(nextMomentumRows);
          setMomentumDiagnostics(nextMomentumDiagnostics);
          setCards(nextCards);
          setStrategyStatus(nextStrategy);
          setSignals(nextSignals);
          setMetrics(nextMetrics);
          setRiskRows(nextRiskRows);
          setActualDataStatus(nextActualDataStatus);
          setDataWalletStatus(nextDataWalletStatus);
          setPumpPortalWalletsStatus(nextPumpPortalWalletsStatus);
          setLightningStatus(nextLightningStatus);
          setExitStatus(nextExitStatus);
          setExitWallets(nextExitWallets.current);
          setExitRules(nextExitRules.current);
          setExitEvents(nextExitEvents.events);
          setExitSignals(nextExitSignals.signals);
          setPaperPortfolioStatus(nextPaperPortfolioStatus);
          setPaperPortfolioSnapshot(nextPaperPortfolioSnapshot.snapshot);
          setPaperPortfolioPositions(nextPaperPortfolioPositions.positions);
          setPaperPortfolioOrders(nextPaperPortfolioOrders.orders);
          setPaperPortfolioFills(nextPaperPortfolioFills.fills);
          setPaperPortfolioPerformance(nextPaperPortfolioPerformance);
          setLiveTradeTrackingStatus(nextLiveTradeTrackingStatus);
          setLaunchScannerStatus(nextLaunchScannerStatus);
          setMeteredLaunchDataStatus(nextMeteredLaunchDataStatus);
          setMeteredLaunchDataTracked(nextMeteredLaunchDataTracked.current);
          setRuntimeControlStatus(nextRuntimeControlStatus);
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
          if (runtimeActionStatus === "API OFFLINE") {
            setRuntimeActionStatus("ready");
          }
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch {
        if (!cancelled) {
          setApiStatus("disconnected");
          setRuntimeActionStatus("API OFFLINE");
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

  const visibleRows = useMemo(
    () =>
      sortRows(
        filterRows(momentumRows, { actionFilter, realOnly, search }),
        sortMode
      ),
    [actionFilter, momentumRows, realOnly, search, sortMode]
  );
  const runRuntimeAction = async (path: string, label: string) => {
    setRuntimeActionStatus(`${label}...`);

    try {
      const result = await postJson<RuntimeControlResult>(path);
      setRuntimeControlStatus(result.status);
      setRuntimeActionStatus(result.message);
    } catch (error) {
      setRuntimeActionStatus(
        error instanceof Error ? error.message : `${label} failed`
      );
    }
  };
  const hotLaunchCount = momentumRows.filter((row) =>
    ["hot", "ripping"].includes(row.launchPhase)
  ).length;
  const rippingLaunchCount = momentumRows.filter(
    (row) => row.launchPhase === "ripping"
  ).length;
  const launchTrackedCount = momentumRows.filter(
    (row) => row.realTradeEventCount > 0
  ).length;
  const trackedCardCount = momentumRows.filter(
    (row) => row.trackingState === "tracking"
  ).length;
  const unavailableFieldCount = momentumRows.reduce(
    (total, row) => total + row.unavailableFields.length,
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
          <div>
            <p className="eyebrow">live token intelligence</p>
            <h1>AXI</h1>
          </div>
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
          label="scanner rows"
          value={formatCompactNumber(momentumRows.length)}
          detail="current session"
          tone={momentumRows.length > 0 ? "good" : "neutral"}
        />
        <MetricValue
          label="hot launches"
          value={formatCompactNumber(hotLaunchCount)}
          detail={`${rippingLaunchCount} ripping`}
          tone={hotLaunchCount > 0 ? "good" : "neutral"}
        />
        <MetricValue
          label="tracked launches"
          value={formatCompactNumber(launchTrackedCount)}
          detail="metered opt-in"
          tone={launchTrackedCount > 0 ? "good" : "neutral"}
        />
        <MetricValue
          label="launch scores"
          value={formatCompactNumber(
            healthStatus?.launchScanner.scoreSnapshotCount ?? 0
          )}
          detail={`extend ${healthStatus?.launchScanner.minScoreToExtend ?? 45}`}
          tone={
            (healthStatus?.launchScanner.scoreSnapshotCount ?? 0) > 0
              ? "good"
              : "neutral"
          }
        />
        <MetricValue
          label="feed events"
          value={formatCompactNumber(feedStatus?.newTokenEventCount ?? 0)}
          detail={`${feedStatus?.migrationEventCount ?? 0} migrations`}
          tone={feedStatus?.connected ? "good" : "neutral"}
        />
        <MetricValue
          label="trade streams"
          value={formatCompactNumber(trackedCardCount)}
          detail={`${healthStatus?.launchScanner.trackedMintCount ?? 0} launch`}
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
          detail="diagnosed fields"
          tone={unavailableFieldCount > 0 ? "warn" : "good"}
        />
        <MetricValue
          label="paper pnl"
          value={formatSol(healthStatus?.totalPaperPnlSol)}
          detail={`${formatCompactNumber(
            healthStatus?.openPaperPositionCount
          )} open`}
          tone={getPnlTone(healthStatus?.totalPaperPnlSol)}
        />
        <MetricValue
          label="portfolio"
          value={healthStatus?.paperPortfolioEnabled ? "ON" : "OFF"}
          detail={`entry ${
            healthStatus?.paperEntryEnabled ? "on" : "off"
          } / exit ${healthStatus?.paperExitEnabled ? "on" : "off"}`}
          tone={healthStatus?.paperPortfolioEnabled ? "good" : "neutral"}
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

      {apiStatus === "disconnected" ? <ApiOfflineNotice /> : null}

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

      {activeTab === "scanner" ? (
        <ScannerTab
          actionFilter={actionFilter}
          compactMode={compactMode}
          diagnostics={momentumDiagnostics}
          expandedMint={expandedMint}
          feedStatus={feedStatus}
          healthStatus={healthStatus}
          liveStatus={liveStatus}
          realOnly={realOnly}
          rows={visibleRows}
          search={search}
          setActionFilter={setActionFilter}
          setCompactMode={setCompactMode}
          setExpandedMint={setExpandedMint}
          setRealOnly={setRealOnly}
          setSearch={setSearch}
          setShowUnavailable={setShowUnavailable}
          setSortMode={setSortMode}
          showUnavailable={showUnavailable}
          sortMode={sortMode}
          totalRows={momentumRows.length}
        />
      ) : null}
      {activeTab === "signals" ? (
        <SignalsTab cards={cards} signals={signals} strategy={strategyStatus} />
      ) : null}
      {activeTab === "portfolio" ? (
        <PortfolioTab
          fills={paperPortfolioFills}
          orders={paperPortfolioOrders}
          performance={paperPortfolioPerformance}
          positions={paperPortfolioPositions}
          snapshot={paperPortfolioSnapshot}
          status={paperPortfolioStatus}
        />
      ) : null}
      {activeTab === "metrics" ? <MetricsTab metrics={metrics} /> : null}
      {activeTab === "risk" ? <RiskTab riskRows={riskRows} /> : null}
      {activeTab === "exit" ? (
        <ExitTab
          events={exitEvents}
          rules={exitRules}
          signals={exitSignals}
          status={exitStatus}
          wallets={exitWallets}
        />
      ) : null}
      {activeTab === "data" ? (
        <DataTab
          actualDataStatus={actualDataStatus}
          actualTrades={actualTrades}
          chainStatus={chainStatus}
          dataWalletStatus={dataWalletStatus}
          diagnostics={momentumDiagnostics}
          lightningStatus={lightningStatus}
          feedStatus={feedStatus}
          liveCardEnrichmentStatus={liveCardEnrichmentStatus}
          indexerStatus={indexerStatus}
          launchScannerStatus={launchScannerStatus}
          liveStatus={liveStatus}
          liveTradeTrackingStatus={liveTradeTrackingStatus}
          marketObservations={marketObservations}
          marketStatus={marketStatus}
          meteredLaunchDataStatus={meteredLaunchDataStatus}
          meteredLaunchDataTracked={meteredLaunchDataTracked}
          pumpPortalWalletsStatus={pumpPortalWalletsStatus}
          runtimeActionStatus={runtimeActionStatus}
          runtimeControlStatus={runtimeControlStatus}
          runRuntimeAction={runRuntimeAction}
          tokenIdentities={tokenIdentities}
          tokenIdentityStatus={tokenIdentityStatus}
        />
      ) : null}
      {activeTab === "debug" ? (
        <StorageTab
          chainVerifications={chainVerifications}
          liveEvents={liveEvents}
          storageStats={storageStats}
        />
      ) : null}
    </main>
  );
}

function ApiOfflineNotice() {
  return (
    <section className="offline-notice" role="status">
      <div>
        <strong>API OFFLINE</strong>
        <span>Dashboard shell is still running.</span>
      </div>
      <div className="offline-commands">
        <code>pnpm axi:doctor</code>
        <code>pnpm axi:restart</code>
      </div>
    </section>
  );
}

function ScannerTab({
  actionFilter,
  compactMode,
  diagnostics,
  expandedMint,
  feedStatus,
  healthStatus,
  liveStatus,
  realOnly,
  rows,
  search,
  setActionFilter,
  setCompactMode,
  setExpandedMint,
  setRealOnly,
  setSearch,
  setShowUnavailable,
  setSortMode,
  showUnavailable,
  sortMode,
  totalRows
}: {
  actionFilter: ActionFilter;
  compactMode: boolean;
  diagnostics: MomentumDiagnostics | null;
  expandedMint: string | null;
  feedStatus: FeedStatus | null;
  healthStatus: HealthStatus | null;
  liveStatus: LiveStatus | null;
  realOnly: boolean;
  rows: MomentumScannerRow[];
  search: string;
  setActionFilter: (value: ActionFilter) => void;
  setCompactMode: (value: boolean) => void;
  setExpandedMint: (value: string | null) => void;
  setRealOnly: (value: boolean) => void;
  setSearch: (value: string) => void;
  setShowUnavailable: (value: boolean) => void;
  setSortMode: (value: SortMode) => void;
  showUnavailable: boolean;
  sortMode: SortMode;
  totalRows: number;
}) {
  return (
    <section className="tab-panel scanner-panel" role="tabpanel">
      <div className="panel-heading scanner-heading">
        <div>
          <h2>Momentum Scanner</h2>
          <p>
            {totalRows} current-session rows / {rows.length} visible / blanks are unavailable, not zero
          </p>
        </div>
        <span className="table-meta">
          {getLiveEmptyState(feedStatus, liveStatus, healthStatus)}
        </span>
      </div>

      <div className="live-controls scanner-controls" aria-label="Scanner controls">
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
            <option value="launchScore">launch score</option>
            <option value="volume10s">volume 10s</option>
            <option value="volumeVelocity">volume velocity</option>
            <option value="priceVelocity">price velocity</option>
            <option value="uniqueBuyers">unique buyers</option>
            <option value="buySellRatio">buy/sell ratio</option>
            <option value="risk">risk</option>
            <option value="pnl">PnL</option>
          </select>
        </label>
        <label>
          <span>Filter</span>
          <select
            onChange={(event) =>
              setActionFilter(event.target.value as ActionFilter)
            }
            value={actionFilter}
          >
            <option value="all">all</option>
            <option value="watch">watch</option>
            <option value="hot">hot</option>
            <option value="ripping">ripping</option>
            <option value="rejected">rejected</option>
            <option value="tradeTracked">trade tracked</option>
            <option value="discoveryOnly">discovery only</option>
            <option value="missingCritical">missing critical</option>
          </select>
        </label>
        <label className="check-control">
          <input
            checked={realOnly}
            onChange={(event) => setRealOnly(event.target.checked)}
            type="checkbox"
          />
          <span>Real only</span>
        </label>
        <label className="check-control">
          <input
            checked={showUnavailable}
            onChange={(event) => setShowUnavailable(event.target.checked)}
            type="checkbox"
          />
          <span>Unavailable</span>
        </label>
        <label className="check-control">
          <input
            checked={compactMode}
            onChange={(event) => setCompactMode(event.target.checked)}
            type="checkbox"
          />
          <span>Compact</span>
        </label>
      </div>

      <div className="scanner-summary-strip" aria-label="Scanner diagnostics summary">
        <span>price {formatCompactNumber(diagnostics?.tokensWithPrice)}</span>
        <span>volume {formatCompactNumber(diagnostics?.tokensWithVolume)}</span>
        <span>trades {formatCompactNumber(diagnostics?.tokensWithTradeData)}</span>
        <span>derivatives {formatCompactNumber(diagnostics?.tokensWithDerivatives)}</span>
        <span>mcap {formatCompactNumber(diagnostics?.tokensWithMarketCap)}</span>
        <span>liquidity {formatCompactNumber(diagnostics?.tokensWithLiquidity)}</span>
        <span>holders {formatCompactNumber(diagnostics?.tokensWithHolderData)}</span>
      </div>

      {rows.length > 0 ? (
        <div className={compactMode ? "scanner-table compact" : "scanner-table"}>
          <div className="scanner-table-header" role="row">
            <span>Token</span>
            <span>Signal</span>
            <span>Market</span>
            <span>Volume / Flow</span>
            <span>Derivatives</span>
            <span>Risk</span>
            <span>Portfolio</span>
            <span>Data</span>
          </div>
          {rows.map((row) => (
            <ScannerRow
              expanded={expandedMint === row.mint}
              key={row.mint}
              onToggle={() =>
                setExpandedMint(expandedMint === row.mint ? null : row.mint)
              }
              row={row}
              showUnavailable={showUnavailable}
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

function ScannerRow({
  expanded,
  onToggle,
  row,
  showUnavailable
}: {
  expanded: boolean;
  onToggle: () => void;
  row: MomentumScannerRow;
  showUnavailable: boolean;
}) {
  return (
    <article className={expanded ? "scanner-row expanded" : "scanner-row"}>
      <button className="scanner-row-main" onClick={onToggle} type="button">
        <div className="scanner-token-cell">
          <strong>{row.displayName}</strong>
          <span>
            {row.symbol ?? "UNKNOWN"} / {row.shortMint}
          </span>
          <small>
            {formatAge(row.ageSeconds)} / {row.source}
          </small>
        </div>
        <div>
          <span className={
            row.hardReject
              ? "score-pill danger"
              : row.launchPhase === "ripping"
                ? "score-pill hot"
                : row.launchPhase === "hot"
                  ? "score-pill warn"
                  : "score-pill"
          }>
            {row.launchScore}
          </span>
          <small>{formatDataQuality(row.launchPhase)}</small>
          <small>{row.signalAction}</small>
        </div>
        <MetricStack
          primary={formatSol(row.priceSol)}
          secondary={"MC " + formatUsd(row.marketCapUsd)}
          tertiary={"Liq " + formatUsd(row.liquidityUsd) + " / FDV " + formatUsd(row.fdvUsd)}
        />
        <MetricStack
          primary={formatSol(row.volume10sSol) + " 10s"}
          secondary={formatSol(row.volume30sSol) + " 30s"}
          tertiary={formatCompactNumber(row.buyCount10s) + "/" + formatCompactNumber(row.sellCount10s) + " buys/sells"}
        />
        <MetricStack
          primary={formatVelocity(row.volumeVelocitySolPerSec, "sol")}
          secondary={formatVelocity(row.priceVelocityPctPerSec, "pct")}
          tertiary={formatVelocity(row.buyerVelocityPerSec, "buyers")}
        />
        <MetricStack
          primary={String(row.riskLevel)}
          secondary={row.hardReject ? "hard reject" : "pass"}
          tertiary={"top " + formatPct(row.topHolderPct) + " / top10 " + formatPct(row.top10HolderPct)}
          tone={row.hardReject ? "bad" : row.riskLevel === "low" ? "good" : "neutral"}
        />
        <MetricStack
          primary={row.paperPositionStatus ?? "none"}
          secondary={formatPct(row.unrealizedPnlPct)}
          tertiary={formatSol(row.unrealizedPnlSol) + " unrealized"}
          tone={getPnlTone(row.unrealizedPnlSol)}
        />
        <MetricStack
          primary={formatDataQuality(row.dataQualityLabel)}
          secondary={row.missingCriticalFields.length + " critical"}
          tertiary={formatTimeAgo(row.lastUpdatedAt)}
          tone={row.missingCriticalFields.length > 0 ? "warn" : "neutral"}
        />
      </button>
      {expanded ? <ScannerRowAudit row={row} showUnavailable={showUnavailable} /> : null}
    </article>
  );
}

function MetricStack({
  primary,
  secondary,
  tertiary,
  tone = "neutral"
}: {
  primary: string;
  secondary: string;
  tertiary: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  return (
    <div className={"scanner-metric-stack metric-" + tone}>
      <strong>{primary}</strong>
      <span>{secondary}</span>
      <small>{tertiary}</small>
    </div>
  );
}

function ScannerRowAudit({
  row,
  showUnavailable
}: {
  row: MomentumScannerRow;
  showUnavailable: boolean;
}) {
  return (
    <div className="scanner-row-audit">
      <div>
        <h4>Metric Windows</h4>
        <dl>
          <dt>volume 5s / 10s / 30s / 60s</dt>
          <dd>
            {formatSol(row.volume5sSol)} / {formatSol(row.volume10sSol)} / {formatSol(row.volume30sSol)} / {formatSol(row.volume60sSol)}
          </dd>
          <dt>buy/sell ratio</dt>
          <dd>{formatCompactNumber(row.buySellRatio)}</dd>
          <dt>net pressure</dt>
          <dd>{formatPct(row.netBuyPressure)}</dd>
          <dt>unique buyers/sellers</dt>
          <dd>
            {formatCompactNumber(row.uniqueBuyers10s)} / {formatCompactNumber(row.uniqueSellers10s)}
          </dd>
          <dt>latest trade</dt>
          <dd>{formatTimeAgo(row.latestTradeAt)}</dd>
        </dl>
      </div>
      <div>
        <h4>Derivatives</h4>
        <dl>
          <dt>dVol/dt</dt>
          <dd>{formatVelocity(row.volumeVelocitySolPerSec, "sol")}</dd>
          <dt>d2Vol/dt2</dt>
          <dd>{formatAcceleration(row.volumeAccelerationSolPerSec2, "sol")}</dd>
          <dt>dPrice/dt</dt>
          <dd>{formatVelocity(row.priceVelocityPctPerSec, "pct")}</dd>
          <dt>d2Price/dt2</dt>
          <dd>{formatAcceleration(row.priceAccelerationPctPerSec2, "pct")}</dd>
          <dt>dBuyers/dt</dt>
          <dd>{formatVelocity(row.buyerVelocityPerSec, "buyers")}</dd>
          <dt>d2Buyers/dt2</dt>
          <dd>{formatAcceleration(row.buyerAccelerationPerSec2, "buyers")}</dd>
        </dl>
      </div>
      <div>
        <h4>Strategy Components</h4>
        <dl>
          <dt>early volume</dt>
          <dd>{formatCompactNumber(row.scoreComponents.earlyVolumeScore)}</dd>
          <dt>volume acceleration</dt>
          <dd>{formatCompactNumber(row.scoreComponents.volumeAccelerationScore)}</dd>
          <dt>price action</dt>
          <dd>{formatCompactNumber(row.scoreComponents.priceActionScore)}</dd>
          <dt>buyer growth</dt>
          <dd>{formatCompactNumber(row.scoreComponents.buyerGrowthScore)}</dd>
          <dt>buy pressure</dt>
          <dd>{formatCompactNumber(row.scoreComponents.buyPressureScore)}</dd>
          <dt>risk penalty</dt>
          <dd>{formatCompactNumber(row.scoreComponents.riskPenalty)}</dd>
          <dt>missing data penalty</dt>
          <dd>{formatCompactNumber(row.scoreComponents.missingDataPenalty)}</dd>
        </dl>
      </div>
      <div>
        <h4>Risk / Position</h4>
        <dl>
          <dt>mint / freeze auth</dt>
          <dd>
            {formatBool(row.mintAuthorityActive)} / {formatBool(row.freezeAuthorityActive)}
          </dd>
          <dt>holders</dt>
          <dd>{formatCompactNumber(row.holderCount)}</dd>
          <dt>paper position</dt>
          <dd>{row.paperPositionStatus ?? "none"}</dd>
          <dt>entry / current</dt>
          <dd>
            {formatSol(row.entryPriceSol)} / {formatSol(row.currentPriceSol)}
          </dd>
          <dt>paper exit</dt>
          <dd>{row.latestPaperExitSignal ? row.latestPaperExitSignal.sellPct + "%" : "none"}</dd>
        </dl>
      </div>
      <div className="scanner-audit-wide">
        <h4>Data Audit</h4>
        <p>{row.fieldDiagnosticsSummary}</p>
        <ReasonCodes codes={row.reasonCodes} limit={18} />
        {showUnavailable ? (
          <>
            <h4>Unavailable Fields</h4>
            <ReasonCodes codes={row.unavailableFields} limit={24} />
            <h4>Missing Critical Fields</h4>
            <ReasonCodes codes={row.missingCriticalFields} limit={12} />
          </>
        ) : null}
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
  const sortedCards = [...cards].sort((left, right) => right.score - left.score);

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
          value={strategy?.strategyName ?? "—"}
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
          value={strategy?.paperOnly ? "PAPER ONLY" : "—"}
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

function PortfolioTab({
  fills,
  orders,
  performance,
  positions,
  snapshot,
  status
}: {
  fills: PaperPortfolioFill[];
  orders: PaperPortfolioOrder[];
  performance: PaperPortfolioPerformanceResponse | null;
  positions: PaperPortfolioPosition[];
  snapshot: PaperPortfolioSnapshot | null;
  status: PaperPortfolioStatus | null;
}) {
  const bestTrade = performance?.bestTrade ?? null;
  const worstTrade = performance?.worstTrade ?? null;

  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>PORTFOLIO</h2>
          <p>
            Simulated entries, exits, PnL, fees, and replayable paper history.
          </p>
        </div>
        <span className="table-meta">
          {status?.liveExecutionDisabled ? "NO LIVE EXECUTION" : "—"}
        </span>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="portfolio"
          value={status?.enabled ? "ON" : "OFF"}
          detail="paper only"
          tone={status?.enabled ? "good" : "neutral"}
        />
        <MetricValue
          label="entry policy"
          value={status?.entryPolicyEnabled ? "ON" : "OFF"}
          detail="launch scanner"
          tone={status?.entryPolicyEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="exit policy"
          value={status?.exitPolicyEnabled ? "ON" : "OFF"}
          detail="watched wallets / stops"
          tone={status?.exitPolicyEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="cash"
          value={formatSol(snapshot?.cashSol)}
          detail="simulated"
        />
        <MetricValue
          label="deployed"
          value={formatSol(snapshot?.deployedSol)}
          detail={`${formatCompactNumber(status?.openPositionCount)} open`}
        />
        <MetricValue
          label="equity"
          value={formatSol(snapshot?.equitySol)}
          detail="cash + marks"
        />
        <MetricValue
          label="total pnl"
          value={formatSol(status?.totalPnlSol)}
          detail={formatPct(snapshot?.totalPnlPct)}
          tone={getPnlTone(status?.totalPnlSol)}
        />
        <MetricValue
          label="realized"
          value={formatSol(status?.realizedPnlSol)}
          detail={`${formatCompactNumber(status?.closedPositionCount)} closed`}
          tone={getPnlTone(status?.realizedPnlSol)}
        />
        <MetricValue
          label="unrealized"
          value={formatSol(status?.unrealizedPnlSol)}
          detail="mark-to-market"
          tone={getPnlTone(status?.unrealizedPnlSol)}
        />
        <MetricValue
          label="win rate"
          value={formatPct(status?.winRate)}
          detail={`${formatCompactNumber(snapshot?.totalTrades)} fills`}
        />
        <MetricValue
          label="drawdown"
          value={formatSol(status?.maxDrawdownSol)}
          detail={formatPct(snapshot?.maxDrawdownPct)}
          tone={status?.maxDrawdownSol ? "warn" : "neutral"}
        />
        <MetricValue
          label="fees"
          value={formatSol(snapshot?.totalFeesSol)}
          detail={`${formatCompactNumber(status?.fillCount)} fills stored`}
        />
      </div>
      <ReasonCodes codes={status?.reasonCodes ?? []} limit={18} />
      <TableShell
        empty="No paper portfolio positions"
        headers={[
          "Token",
          "Status",
          "Entry",
          "Current",
          "Remaining",
          "Unrealized",
          "Realized",
          "Fees",
          "Updated"
        ]}
        rows={positions.map((position) => [
          position.title ?? position.symbol ?? formatMintShort(position.mint),
          position.status,
          formatSol(position.averageEntryPriceSol),
          formatSol(position.currentPriceSol),
          formatSol(position.remainingSizeSol),
          `${formatSol(position.unrealizedPnlSol)} / ${formatPct(
            position.unrealizedPnlPct
          )}`,
          `${formatSol(position.realizedPnlSol)} / ${formatPct(
            position.realizedPnlPct
          )}`,
          formatSol(position.totalFeesSol),
          formatTime(position.updatedAt)
        ])}
        title="POSITIONS"
      />
      <TableShell
        empty="No paper orders"
        headers={[
          "Created",
          "Token",
          "Side",
          "Source",
          "Size",
          "Sell %",
          "Score",
          "Reasons"
        ]}
        rows={orders.map((order) => [
          formatTime(order.createdAt),
          order.title ?? order.symbol ?? formatMintShort(order.mint),
          order.side.toUpperCase(),
          order.source,
          formatSol(order.requestedSizeSol),
          order.requestedSellPct === null ? "—" : `${order.requestedSellPct}%`,
          formatCompactNumber(order.signalScore),
          <ReasonCodes codes={order.reasonCodes} key="reasons" limit={5} />
        ])}
        title="ORDERS"
      />
      <TableShell
        empty="No paper fills"
        headers={[
          "Created",
          "Token",
          "Side",
          "Status",
          "Price",
          "Effective",
          "Size",
          "Fee",
          "Reasons"
        ]}
        rows={fills.map((fill) => [
          formatTime(fill.createdAt),
          formatMintShort(fill.mint),
          fill.side.toUpperCase(),
          fill.fillStatus,
          formatSol(fill.priceSol),
          formatSol(fill.effectivePriceSol),
          formatSol(fill.sizeSol),
          formatSol(fill.feeSol),
          <ReasonCodes codes={fill.reasonCodes} key="reasons" limit={5} />
        ])}
        title="FILLS"
      />
      <TableShell
        empty="No closed paper trades yet"
        headers={["Rank", "Token", "Realized", "Return", "Closed"]}
        rows={[
          ...(bestTrade
            ? [
                [
                  "best",
                  bestTrade.title ??
                    bestTrade.symbol ??
                    formatMintShort(bestTrade.mint),
                  formatSol(bestTrade.realizedPnlSol),
                  formatPct(bestTrade.realizedPnlPct),
                  formatTime(bestTrade.closedAt)
                ]
              ]
            : []),
          ...(worstTrade
            ? [
                [
                  "worst",
                  worstTrade.title ??
                    worstTrade.symbol ??
                    formatMintShort(worstTrade.mint),
                  formatSol(worstTrade.realizedPnlSol),
                  formatPct(worstTrade.realizedPnlPct),
                  formatTime(worstTrade.closedAt)
                ]
              ]
            : [])
        ]}
        title="PERFORMANCE"
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

function ExitTab({
  events,
  rules,
  signals,
  status,
  wallets
}: {
  events: ExitEvent[];
  rules: ExitRule[];
  signals: ExitSignal[];
  status: ExitStatus | null;
  wallets: ExitWallet[];
}) {
  const eventStatsByWallet = new Map<
    string,
    { count: number; latestAt: string | null }
  >();

  for (const event of events) {
    const current = eventStatsByWallet.get(event.wallet) ?? {
      count: 0,
      latestAt: null
    };
    eventStatsByWallet.set(event.wallet, {
      count: current.count + 1,
      latestAt:
        current.latestAt && current.latestAt > event.createdAt
          ? current.latestAt
          : event.createdAt
    });
  }

  return (
    <section className="tab-panel" role="tabpanel">
      <div className="panel-heading">
        <div>
          <h2>EXIT</h2>
          <p>
            Watched-wallet triggers, paper exit plans, and metered account-trade
            gates.
          </p>
        </div>
      </div>
      <div className="status-grid secondary-grid">
        <MetricValue
          label="strategy"
          value={status?.enabled ? "ON" : "OFF"}
          detail="paper exit only"
          tone={status?.enabled ? "warn" : "neutral"}
        />
        <MetricValue
          label="account trades"
          value={status?.accountTradesEnabled ? "ON" : "OFF"}
          detail={status?.meteredAck ? "metered ack" : "ack missing"}
          tone={
            status?.accountTradeMonitoringEnabled
              ? "warn"
              : status?.accountTradesEnabled
                ? "bad"
                : "neutral"
          }
        />
        <MetricValue
          label="watched"
          value={`${formatCompactNumber(status?.watchedWalletCount)}/${formatCompactNumber(
            status?.maxWatchedWallets
          )}`}
          detail={`${formatCompactNumber(
            status?.accountTradeSubscribedWalletCount
          )} subscribed`}
        />
        <MetricValue
          label="rules"
          value={formatCompactNumber(status?.enabledRuleCount)}
          detail={`${rules.length} configured`}
        />
        <MetricValue
          label="events"
          value={`${formatCompactNumber(status?.observedTradeCount)}/${formatCompactNumber(
            status?.maxEventsPerSession
          )}`}
          detail={`${formatCompactNumber(
            status?.accountTradeEventCount
          )} session`}
        />
        <MetricValue
          label="signals"
          value={formatCompactNumber(status?.exitSignalCount)}
          detail="paper plans"
        />
        <MetricValue
          label="budget"
          value={formatSol(status?.estimatedCostSol)}
          detail={status?.budgetReached ? "cap reached" : "within cap"}
          tone={status?.budgetReached ? "bad" : "neutral"}
        />
        <MetricValue
          label="data wallet"
          value={status?.dataWalletReady ? "READY" : "BLOCKED"}
          detail="metered stream gate"
          tone={status?.dataWalletReady ? "good" : "neutral"}
        />
        <MetricValue
          label="paper only"
          value={status?.paperOnly ? "YES" : "UNKNOWN"}
          detail={
            status?.liveExecutionDisabled ? "live execution disabled" : "—"
          }
          tone="good"
        />
      </div>
      <ReasonCodes codes={status?.reasonCodes ?? []} limit={18} />
      <TableShell
        empty="No watched wallets configured"
        headers={["Alias", "Address", "Tags", "Enabled", "Last Event", "Events"]}
        rows={wallets.map((wallet) => {
          const stats = eventStatsByWallet.get(wallet.address);

          return [
            wallet.alias ?? "—",
            formatMintShort(wallet.address),
            wallet.tags.join(", ") || "—",
            wallet.enabled ? "yes" : "no",
            formatTime(stats?.latestAt ?? null),
            formatCompactNumber(stats?.count ?? 0)
          ];
        })}
        title="WATCHED WALLETS"
      />
      <TableShell
        empty="No exit rules configured"
        headers={[
          "Name",
          "Enabled",
          "Trigger",
          "Min Profit",
          "Sell Plan",
          "Cooldown",
          "Priority"
        ]}
        rows={rules.map((rule) => [
          rule.name,
          rule.enabled ? "yes" : "no",
          rule.trigger,
          formatPct(rule.minProfitPct / 100),
          `${rule.sellPct}%`,
          `${formatCompactNumber(rule.cooldownMs)}ms`,
          rule.priority
        ])}
        title="RULES"
      />
      <TableShell
        empty="No watched wallet trade events"
        headers={[
          "Wallet",
          "Mint",
          "Side",
          "Price",
          "Volume",
          "Signature",
          "Time"
        ]}
        rows={events.map((event) => [
          event.walletAlias ?? formatMintShort(event.wallet),
          formatMintShort(event.mint),
          event.side.toUpperCase(),
          formatSol(event.priceSol),
          formatSol(event.volumeSol),
          formatMintShort(event.signature),
          formatTime(event.createdAt)
        ])}
        title="WATCHED WALLET EVENTS"
      />
      <TableShell
        empty="No paper exit signals"
        headers={[
          "Token",
          "Wallet",
          "Rule",
          "Sell Plan",
          "Blocked",
          "Blockers",
          "Warnings",
          "Created"
        ]}
        rows={signals.map((signal) => [
          formatMintShort(signal.mint),
          signal.walletAlias ?? formatMintShort(signal.wallet),
          signal.ruleId,
          `${signal.sellPct}%`,
          signal.blocked ? "yes" : "no",
          <ReasonCodes codes={signal.blockers} key="blockers" limit={4} />,
          <ReasonCodes codes={signal.warnings} key="warnings" limit={4} />,
          formatTime(signal.createdAt)
        ])}
        title="PAPER EXIT SIGNALS"
      />
    </section>
  );
}

function DataTab({
  actualDataStatus,
  actualTrades,
  chainStatus,
  dataWalletStatus,
  diagnostics,
  lightningStatus,
  feedStatus,
  indexerStatus,
  launchScannerStatus,
  liveCardEnrichmentStatus,
  liveStatus,
  liveTradeTrackingStatus,
  marketObservations,
  marketStatus,
  meteredLaunchDataStatus,
  meteredLaunchDataTracked,
  pumpPortalWalletsStatus,
  runtimeActionStatus,
  runtimeControlStatus,
  runRuntimeAction,
  tokenIdentities,
  tokenIdentityStatus
}: {
  actualDataStatus: ActualDataStatus | null;
  actualTrades: PumpPortalTradeRow[];
  chainStatus: ChainStatus | null;
  dataWalletStatus: PumpPortalDataWalletStatus | null;
  diagnostics: MomentumDiagnostics | null;
  lightningStatus: LightningStatus | null;
  feedStatus: FeedStatus | null;
  indexerStatus: IndexerStatus | null;
  launchScannerStatus: LaunchScannerStatus | null;
  liveCardEnrichmentStatus: LiveCardEnrichmentStatus | null;
  liveStatus: LiveStatus | null;
  liveTradeTrackingStatus: LiveTradeTrackingStatus | null;
  marketObservations: MarketObservationRow[];
  marketStatus: MarketStatus | null;
  meteredLaunchDataStatus: MeteredLaunchDataStatus | null;
  meteredLaunchDataTracked: MeteredLaunchDataTrackedMint[];
  pumpPortalWalletsStatus: PumpPortalWalletsStatus | null;
  runtimeActionStatus: string;
  runtimeControlStatus: RuntimeControlStatus | null;
  runRuntimeAction: (path: string, label: string) => Promise<void>;
  tokenIdentities: TokenIdentityRow[];
  tokenIdentityStatus: TokenIdentityStatus | null;
}) {
  const realManagedStreamState = getRealManagedStreamState(indexerStatus);
  const meteredBlockers = getMeteredRuntimeBlockers(runtimeControlStatus);
  const canStartMetered =
    Boolean(runtimeControlStatus) &&
    runtimeControlStatus?.meteredLaunchData.enabled === true &&
    runtimeControlStatus?.meteredLaunchData.blocked === false;

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
      <DataPanel
        ariaLabel="Momentum scanner diagnostics"
        meta={<span>FIELD AVAILABILITY</span>}
        title="SCANNER DIAGNOSTICS"
      >
        <div className="status-grid secondary-grid embedded-grid">
          <MetricValue
            label="rows"
            value={formatCompactNumber(diagnostics?.rowsReturned)}
            detail={`${formatCompactNumber(
              diagnostics?.liveTokenCount
            )} live tokens`}
          />
          <MetricValue
            label="price"
            value={formatCompactNumber(diagnostics?.tokensWithPrice)}
            detail="price action"
          />
          <MetricValue
            label="volume"
            value={formatCompactNumber(diagnostics?.tokensWithVolume)}
            detail="rolling windows"
          />
          <MetricValue
            label="trades"
            value={formatCompactNumber(diagnostics?.tokensWithTradeData)}
            detail="metered samples"
          />
          <MetricValue
            label="derivatives"
            value={formatCompactNumber(diagnostics?.tokensWithDerivatives)}
            detail="sample gated"
          />
          <MetricValue
            label="market cap"
            value={formatCompactNumber(diagnostics?.tokensWithMarketCap)}
            detail="enrichment"
          />
          <MetricValue
            label="liquidity"
            value={formatCompactNumber(diagnostics?.tokensWithLiquidity)}
            detail="enrichment"
          />
          <MetricValue
            label="holders"
            value={formatCompactNumber(diagnostics?.tokensWithHolderData)}
            detail="chain verifier"
          />
          <MetricValue
            label="positions"
            value={formatCompactNumber(diagnostics?.tokensWithPaperPosition)}
            detail="paper portfolio"
          />
        </div>
        <div className="diagnostic-actions">
          {(diagnostics?.recommendedNextActions ?? []).map((action) => (
            <span key={action}>{action}</span>
          ))}
        </div>
        <ReasonBlock
          title="Momentum Diagnostics Reasons"
          codes={diagnostics?.reasonCodes}
        />
      </DataPanel>
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
          detail={liveStatus?.sessionId ?? "—"}
        />
        <MetricValue
          label="launch tracking"
          value={launchScannerStatus?.launchTrackingEnabled ? "ON" : "OFF"}
          detail={`${launchScannerStatus?.trackedMintCount ?? 0}/${
            launchScannerStatus?.maxConcurrentTracked ?? 0
          } mints`}
          tone={
            launchScannerStatus?.launchTrackingEnabled ? "warn" : "neutral"
          }
        />
        <MetricValue
          label="metered launch data"
          value={meteredLaunchDataStatus?.enabled ? "ON" : "OFF"}
          detail={`${meteredLaunchDataStatus?.trackedMintCount ?? 0}/${
            meteredLaunchDataStatus?.maxConcurrentMints ?? 0
          } mints`}
          tone={
            meteredLaunchDataStatus?.budgetReached
              ? "bad"
              : meteredLaunchDataStatus?.ready
                ? "warn"
                : "neutral"
          }
        />
        <MetricValue
          label="data wallet"
          value={(dataWalletStatus?.balanceStatus ?? "unknown").toUpperCase()}
          detail={
            dataWalletStatus?.publicKeyConfigured
              ? (dataWalletStatus.shortPublicKey ?? "—")
              : "public key missing"
          }
          tone={getDataWalletTone(dataWalletStatus?.balanceStatus)}
        />
        <MetricValue
          label="launch budget"
          value={formatSol(launchScannerStatus?.estimatedMeteredCostSol)}
          detail={`${formatSol(
            launchScannerStatus?.maxSessionCostSol
          )} cap`}
          tone={
            (launchScannerStatus?.estimatedMeteredCostSol ?? 0) >=
            (launchScannerStatus?.maxSessionCostSol ?? Number.POSITIVE_INFINITY)
              ? "bad"
              : "neutral"
          }
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
          detail={`${marketStatus?.minConfidenceForMetrics ?? "—"} min`}
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
          detail={`secondary / ${indexerStatus?.streamProvider ?? "mock"}`}
          tone={indexerStatus?.streamEnabled ? "warn" : "neutral"}
        />
        <MetricValue
          label={`REAL MANAGED STREAM: ${realManagedStreamState}`}
          value={realManagedStreamState}
          detail={`Provider ${
            indexerStatus?.managedStream?.realProvider ?? "laserstream"
          }`}
          tone={
            realManagedStreamState === "CONNECTED"
              ? "good"
              : realManagedStreamState === "READY"
                ? "warn"
                : realManagedStreamState === "BLOCKED"
                  ? "bad"
                  : "neutral"
          }
        />
        <MetricValue
          label="laser gates"
          value={
            indexerStatus?.managedStream?.realConnectionAllowed &&
            indexerStatus?.managedStream?.realConnectionAck
              ? "OPEN"
              : "CLOSED"
          }
          detail={`allow ${
            indexerStatus?.managedStream?.realConnectionAllowed ? "yes" : "no"
          } / ack ${
            indexerStatus?.managedStream?.realConnectionAck ? "yes" : "no"
          }`}
          tone={
            indexerStatus?.managedStream?.laserstream?.readyToConnect
              ? "warn"
              : "neutral"
          }
        />
        <MetricValue
          label="laser readiness"
          value={
            indexerStatus?.managedStream?.laserstream?.readyToConnect
              ? "READY"
              : "BLOCKED"
          }
          detail={
            indexerStatus?.managedStream?.laserstream?.apiKeyConfigured
              ? "api key configured"
              : "api key unset"
          }
          tone={
            indexerStatus?.managedStream?.laserstream?.readyToConnect
              ? "warn"
              : "neutral"
          }
        />
        <MetricValue
          label="laser messages"
          value={formatCompactNumber(
            indexerStatus?.managedStream?.laserstream?.messageCount
          )}
          detail={`limit ${formatCompactNumber(
            indexerStatus?.managedStream?.laserstream?.maxMessagesPerSession
          )}`}
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
          value={formatTimeAgo(
            indexerStatus?.managedStream?.laserstream?.lastMessageAt ??
              indexerStatus?.managedStream?.lastMessageAt
          )}
          detail={`runtime ${formatCompactNumber(
            indexerStatus?.managedStream?.laserstream?.maxRuntimeMs
          )} ms`}
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
      <DataPanel
        ariaLabel="Pump.fun PumpPortal runtime control"
        meta={<span>METERED DATA ONLY — NO TRADING</span>}
        title="PUMPFUN / PUMPPORTAL CONTROL"
      >
        <div className="status-grid secondary-grid embedded-grid">
          <MetricValue
            label="live discovery"
            value={getRuntimeLiveLabel(runtimeControlStatus)}
            detail={formatTimeAgo(
              runtimeControlStatus?.liveDiscovery.lastEventAt
            )}
            tone={
              runtimeControlStatus?.liveDiscovery.connected
                ? "good"
                : runtimeControlStatus?.liveDiscovery.connecting
                  ? "warn"
                  : runtimeControlStatus?.liveDiscovery.lastError
                    ? "bad"
                    : "neutral"
            }
          />
          <MetricValue
            label="new tokens"
            value={formatCompactNumber(
              runtimeControlStatus?.liveDiscovery.newTokenEventCount
            )}
            detail={`${formatCompactNumber(
              runtimeControlStatus?.liveDiscovery.migrationEventCount
            )} migrations`}
          />
          <MetricValue
            label="metered price"
            value={getRuntimeMeteredLabel(runtimeControlStatus)}
            detail={`${formatCompactNumber(
              runtimeControlStatus?.meteredLaunchData.trackedMintCount
            )} tracked`}
            tone={
              runtimeControlStatus?.meteredLaunchData.active
                ? "good"
                : runtimeControlStatus?.meteredLaunchData.blocked
                  ? "bad"
                  : "neutral"
            }
          />
          <MetricValue
            label="events"
            value={formatCompactNumber(
              runtimeControlStatus?.meteredLaunchData.eventCount
            )}
            detail={`${formatSol(
              runtimeControlStatus?.meteredLaunchData.estimatedCostSol
            )} cost`}
          />
          <MetricValue
            label="budget left"
            value={formatSol(
              runtimeControlStatus?.meteredLaunchData.budgetRemainingSol
            )}
            detail={`${formatSol(
              runtimeControlStatus?.meteredLaunchData.sessionCostCapSol
            )} cap`}
          />
          <MetricValue
            label="data wallet"
            value={(
              runtimeControlStatus?.dataWallet.balanceStatus ?? "unknown"
            ).toUpperCase()}
            detail={
              runtimeControlStatus?.dataWallet.shortPublicKey ??
              "public address"
            }
            tone={getDataWalletTone(
              runtimeControlStatus?.dataWallet.balanceStatus
            )}
          />
          <MetricValue
            label="api key"
            value={
              runtimeControlStatus?.dataWallet.apiKeyConfigured ? "YES" : "NO"
            }
            detail="backend only"
            tone={
              runtimeControlStatus?.dataWallet.apiKeyConfigured
                ? "good"
                : "bad"
            }
          />
          <MetricValue
            label="runtime"
            value={`${formatCompactNumber(
              runtimeControlStatus?.process.uptimeSeconds
            )}s`}
            detail={
              runtimeControlStatus?.paperOnly &&
              runtimeControlStatus.tradingDisabled
                ? "paper only"
                : "check gates"
            }
          />
        </div>
        <div className="runtime-actions">
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/live-discovery/start",
                "Starting discovery"
              )
            }
            type="button"
          >
            Start live discovery
          </button>
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/live-discovery/stop",
                "Stopping discovery"
              )
            }
            type="button"
          >
            Stop live discovery
          </button>
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/live-discovery/restart",
                "Restarting discovery"
              )
            }
            type="button"
          >
            Restart live discovery
          </button>
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/data-wallet/refresh",
                "Refreshing wallet"
              )
            }
            type="button"
          >
            Refresh wallet balance
          </button>
          <button
            className="control-button metered"
            disabled={!canStartMetered}
            onClick={() =>
              void runRuntimeAction(
                "/runtime/metered-launch-data/start",
                "Starting metered price action"
              )
            }
            type="button"
          >
            Start metered price action
          </button>
          <button
            className="control-button"
            onClick={() =>
              void runRuntimeAction(
                "/runtime/metered-launch-data/stop",
                "Stopping metered price action"
              )
            }
            type="button"
          >
            Stop metered price action
          </button>
        </div>
        <div className="runtime-action-status">{runtimeActionStatus}</div>
        {meteredBlockers.length > 0 ? (
          <div className="signal-risk-strip data-wallet-warnings">
            {meteredBlockers.map((blocker) => (
              <span key={blocker}>{blocker}</span>
            ))}
          </div>
        ) : null}
        <div className="data-wallet-address-row">
          <span className="mono">
            {runtimeControlStatus?.dataWallet.publicKey ??
              "data wallet public address unavailable"}
          </span>
          {runtimeControlStatus?.dataWallet.publicKey ? (
            <button
              className="copy-button"
              onClick={() =>
                void navigator.clipboard.writeText(
                  runtimeControlStatus.dataWallet.publicKey ?? ""
                )
              }
              type="button"
            >
              copy
            </button>
          ) : null}
        </div>
        <ReasonBlock
          title="Runtime Control Reasons"
          codes={runtimeControlStatus?.reasonCodes}
        />
      </DataPanel>
      <ReasonBlock title="Feed Reasons" codes={feedStatus?.reasonCodes} />
      <ReasonBlock
        title="Launch Scanner Reasons"
        codes={launchScannerStatus?.reasonCodes}
      />
      <DataPanel
        ariaLabel="PumpPortal launch tracking"
        meta={
          <span>
            {launchScannerStatus?.launchTrackingAcknowledgedMetered
              ? "METERED ACKED"
              : "METERED NOT ACKED"}
          </span>
        }
        title="PUMPPORTAL LAUNCH TRACKING"
      >
        <div className="status-grid secondary-grid embedded-grid">
          <MetricValue
            label="mode"
            value={(launchScannerStatus?.launchTrackingMode ?? "manual").toUpperCase()}
            detail={launchScannerStatus?.runtimeMode ?? "pumpportal_first"}
          />
          <MetricValue
            label="discovery"
            value={launchScannerStatus?.liveDiscoveryActive ? "ACTIVE" : "OFFLINE"}
            detail={`${launchScannerStatus?.candidateCount ?? 0} candidates`}
            tone={launchScannerStatus?.liveDiscoveryActive ? "good" : "bad"}
          />
          <MetricValue
            label="session events"
            value={formatCompactNumber(
              launchScannerStatus?.totalEventsThisSession
            )}
            detail={`${formatCompactNumber(
              launchScannerStatus?.maxEventsPerSession
            )} cap`}
          />
          <MetricValue
            label="per token"
            value={formatCompactNumber(
              launchScannerStatus?.maxEventsPerToken
            )}
            detail="event cap"
          />
          <MetricValue
            label="extend"
            value={formatCompactNumber(launchScannerStatus?.minScoreToExtend)}
            detail={`rip ${formatCompactNumber(
              launchScannerStatus?.minScoreToRip
            )}`}
          />
          <MetricValue
            label="tracked mints"
            value={formatCompactNumber(launchScannerStatus?.trackedMintCount)}
            detail={`${launchScannerStatus?.trackedMints.length ?? 0} listed`}
          />
        </div>
        <div className="data-wallet-address-row">
          <span className="mono">
            {(launchScannerStatus?.trackedMints ?? [])
              .map(formatMintShort)
              .join(" / ") || "no launch mints tracked"}
          </span>
        </div>
      </DataPanel>
      <DataPanel
        ariaLabel="Metered launch data"
        meta={
          <span>
            {meteredLaunchDataStatus?.acknowledgedCost
              ? "COST ACKED"
              : "ACK MISSING"}
          </span>
        }
        title="METERED LAUNCH DATA"
      >
        <div className="status-grid secondary-grid embedded-grid">
          <MetricValue
            label="enabled"
            value={meteredLaunchDataStatus?.enabled ? "ON" : "OFF"}
            detail={meteredLaunchDataStatus?.mode ?? "newest"}
            tone={meteredLaunchDataStatus?.enabled ? "warn" : "neutral"}
          />
          <MetricValue
            label="ready"
            value={meteredLaunchDataStatus?.ready ? "YES" : "NO"}
            detail={
              meteredLaunchDataStatus?.liveDiscoveryActive
                ? "discovery active"
                : "discovery offline"
            }
            tone={meteredLaunchDataStatus?.ready ? "good" : "bad"}
          />
          <MetricValue
            label="data wallet"
            value={
              meteredLaunchDataStatus?.dataWalletConfigured ? "READY" : "BLOCKED"
            }
            detail={(
              meteredLaunchDataStatus?.dataWalletBalanceStatus ?? "unknown"
            ).toUpperCase()}
            tone={getDataWalletTone(
              meteredLaunchDataStatus?.dataWalletBalanceStatus
            )}
          />
          <MetricValue
            label="api key"
            value={meteredLaunchDataStatus?.apiKeyConfigured ? "YES" : "NO"}
            detail="backend only"
            tone={
              meteredLaunchDataStatus?.apiKeyConfigured ? "good" : "bad"
            }
          />
          <MetricValue
            label="tracked mints"
            value={formatCompactNumber(
              meteredLaunchDataStatus?.trackedMintCount
            )}
            detail={`${formatCompactNumber(
              meteredLaunchDataStatus?.maxConcurrentMints
            )} cap`}
          />
          <MetricValue
            label="events"
            value={formatCompactNumber(
              meteredLaunchDataStatus?.totalEventsThisSession
            )}
            detail={`${formatCompactNumber(
              meteredLaunchDataStatus?.maxEventsPerSession
            )} cap`}
          />
          <MetricValue
            label="cost"
            value={formatSol(meteredLaunchDataStatus?.estimatedCostSol)}
            detail={`${formatSol(
              meteredLaunchDataStatus?.maxSessionCostSol
            )} cap`}
            tone={meteredLaunchDataStatus?.budgetReached ? "bad" : "neutral"}
          />
          <MetricValue
            label="remaining"
            value={formatSol(meteredLaunchDataStatus?.remainingBudgetSol)}
            detail={`${formatSol(
              meteredLaunchDataStatus?.projectedCostPerHourSol
            )} / hr projected`}
          />
          <MetricValue
            label="stop"
            value={
              meteredLaunchDataStatus?.lastStopReason
                ? meteredLaunchDataStatus.lastStopReason.toUpperCase()
                : "—"
            }
            detail={
              meteredLaunchDataStatus?.budgetReached
                ? "budget reached"
                : "no stop condition"
            }
          />
        </div>
        <ReasonBlock
          title="Metered Launch Data Reasons"
          codes={meteredLaunchDataStatus?.reasonCodes}
        />
        <TableShell
          empty="No metered launch mints tracked"
          headers={[
            "Mint",
            "Status",
            "Subscribed",
            "Events",
            "Cost",
            "Latest",
            "Reason"
          ]}
          rows={meteredLaunchDataTracked.map((item) => [
            formatMintShort(item.mint),
            item.status.toUpperCase(),
            formatTime(item.subscribedAt),
            formatCompactNumber(item.eventCount),
            formatSol(item.estimatedCostSol),
            formatTimeAgo(item.latestTradeAt),
            item.reason
          ])}
          title="METERED TRACKED MINTS"
        />
      </DataPanel>
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
          identity.metadataUri ? "yes" : "—",
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

function getRealManagedStreamState(
  indexerStatus: IndexerStatus | null
): "DISABLED" | "READY" | "CONNECTED" | "BLOCKED" {
  const managedStream = indexerStatus?.managedStream;
  const laserstream = managedStream?.laserstream;

  if (laserstream?.connected) {
    return "CONNECTED";
  }

  if (laserstream?.readyToConnect) {
    return "READY";
  }

  if ((managedStream?.connectionBlockedReasons?.length ?? 0) > 0) {
    return "BLOCKED";
  }

  return "DISABLED";
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
          value={dataWalletStatus?.shortPublicKey ?? "—"}
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
          value={`${lightningStatus?.slippage ?? "—"}%`}
          detail={`${formatSol(lightningStatus?.priorityFee)} priority`}
        />
        <MetricValue
          label="pool"
          value={lightningStatus?.pool ?? "—"}
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
          value={wallet?.shortPublicKey ?? "—"}
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
          <h2>Debug</h2>
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
            <strong>{String(value ?? "—")}</strong>
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
    return <span className="muted">—</span>;
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

function filterRows(
  rows: MomentumScannerRow[],
  options: {
    actionFilter: ActionFilter;
    realOnly: boolean;
    search: string;
  }
): MomentumScannerRow[] {
  const query = options.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (options.realOnly && !row.realData) {
      return false;
    }

    if (query.length > 0) {
      const haystack = [
        row.mint,
        row.name ?? "",
        row.symbol ?? "",
        row.title,
        row.displayName
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    if (options.actionFilter === "watch") {
      return row.signalAction.includes("WATCH") || row.launchPhase === "watching";
    }

    if (options.actionFilter === "hot") {
      return row.launchPhase === "hot";
    }

    if (options.actionFilter === "ripping") {
      return row.launchPhase === "ripping";
    }

    if (options.actionFilter === "rejected") {
      return row.hardReject || row.signalStrength === "reject" || row.launchPhase === "rejected";
    }

    if (options.actionFilter === "tradeTracked") {
      return row.trackingState === "tracking" || row.realTradeEventCount > 0;
    }

    if (options.actionFilter === "discoveryOnly") {
      return row.dataQualityLabel === "discovery_only";
    }

    if (options.actionFilter === "missingCritical") {
      return row.missingCriticalFields.length > 0;
    }

    return true;
  });
}

function sortRows(
  rows: MomentumScannerRow[],
  sortMode: SortMode
): MomentumScannerRow[] {
  const riskWeight: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    unknown: 2,
    low: 1
  };

  return [...rows].sort((left, right) => {
    if (sortMode === "launchScore") {
      return (
        right.launchScore - left.launchScore ||
        parseRowTime(right.latestEventAt) - parseRowTime(left.latestEventAt)
      );
    }

    if (sortMode === "volumeVelocity") {
      return (
        (right.volumeVelocitySolPerSec ?? -1) -
        (left.volumeVelocitySolPerSec ?? -1)
      );
    }

    if (sortMode === "volume10s") {
      return (
        (right.volume10sSol ?? right.volume10sUsd ?? -1) -
        (left.volume10sSol ?? left.volume10sUsd ?? -1)
      );
    }

    if (sortMode === "priceVelocity") {
      return (
        (right.priceVelocityPctPerSec ?? -1) -
        (left.priceVelocityPctPerSec ?? -1)
      );
    }

    if (sortMode === "uniqueBuyers") {
      return (
        (right.uniqueBuyers10s ?? -1) - (left.uniqueBuyers10s ?? -1)
      );
    }

    if (sortMode === "buySellRatio") {
      return (
        (right.buySellRatio ?? -1) - (left.buySellRatio ?? -1)
      );
    }

    if (sortMode === "risk") {
      return (
        (riskWeight[right.riskLevel] ?? 0) - (riskWeight[left.riskLevel] ?? 0)
      );
    }

    if (sortMode === "pnl") {
      return (
        (right.unrealizedPnlPct ?? Number.NEGATIVE_INFINITY) -
        (left.unrealizedPnlPct ?? Number.NEGATIVE_INFINITY)
      );
    }

    return parseRowTime(right.latestEventAt) - parseRowTime(left.latestEventAt);
  });
}

function parseRowTime(timestamp: string | null): number {
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
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
  return tabs.some((tab) => tab.id === hash) ? (hash as TabId) : "scanner";
}

function formatDataQuality(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}

function getRuntimeLiveLabel(status: RuntimeControlStatus | null): string {
  if (status?.liveDiscovery.connected) {
    return "CONNECTED";
  }

  if (status?.liveDiscovery.connecting) {
    return "CONNECTING";
  }

  if (status?.liveDiscovery.lastError) {
    return "ERROR";
  }

  return "STOPPED";
}

function getRuntimeMeteredLabel(status: RuntimeControlStatus | null): string {
  if (status?.meteredLaunchData.active) {
    return "ACTIVE";
  }

  if (status?.meteredLaunchData.blocked) {
    return "BLOCKED";
  }

  return "STOPPED";
}

function getMeteredRuntimeBlockers(
  status: RuntimeControlStatus | null
): string[] {
  const codes = status?.meteredLaunchData.reasonCodes ?? [];
  const blockers: string[] = [];

  if (codes.some((code) => code.includes("ACK"))) {
    blockers.push("ACK missing");
  }

  if (codes.some((code) => code.includes("API_KEY"))) {
    blockers.push("API key missing");
  }

  if (codes.some((code) => code.includes("WALLET"))) {
    blockers.push("wallet missing");
  }

  if (codes.some((code) => code.includes("BALANCE"))) {
    blockers.push("wallet low");
  }

  if (codes.some((code) => code.includes("BUDGET") || code.includes("CAP"))) {
    blockers.push("budget reached");
  }

  if (codes.some((code) => code.includes("OFFLINE"))) {
    blockers.push("live discovery offline");
  }

  return Array.from(new Set(blockers));
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

function getPnlTone(
  value: number | null | undefined
): "good" | "bad" | "warn" | "neutral" {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return "neutral";
  }

  return value > 0 ? "good" : "bad";
}

function copyPublicKey(publicKey: string | null): void {
  if (!publicKey || !navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(publicKey);
}

function formatBool(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return value ? "yes" : "no";
}

function formatUsdOrSol(
  usdValue: number | null | undefined,
  solValue: number | null | undefined
): string {
  const usd = formatUsd(usdValue);

  if (usd !== "—") {
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

async function postJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST"
  });
  const payload = (await response.json()) as T;

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `POST ${path} failed with ${response.status}`;

    throw new Error(message);
  }

  return payload;
}
