import { z } from "zod";

export const BotModeSchema = z.enum(["paper", "manual", "live"]);
export type BotMode = z.infer<typeof BotModeSchema>;

export const SignalActionSchema = z.enum([
  "HARD_REJECT",
  "IGNORE",
  "WATCH",
  "BUY_READY"
]);
export type SignalAction = z.infer<typeof SignalActionSchema>;

export const RiskLevelSchema = z.enum([
  "unknown",
  "low",
  "medium",
  "high",
  "critical"
]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const CandidateLifecycleStateSchema = z.enum([
  "new",
  "warming",
  "watching",
  "qualified",
  "rejected",
  "paper_ordered",
  "ignored"
]);
export type CandidateLifecycleState = z.infer<
  typeof CandidateLifecycleStateSchema
>;

export const CandidateDecisionActionSchema = z.enum([
  "IGNORE",
  "WATCH",
  "REJECT",
  "PAPER_BUY_READY",
  "PAPER_ORDER_SUBMITTED"
]);
export type CandidateDecisionAction = z.infer<
  typeof CandidateDecisionActionSchema
>;

export const ChainVerificationStatusSchema = z.enum([
  "disabled",
  "config_error",
  "pending",
  "verified",
  "failed"
]);
export type ChainVerificationStatus = z.infer<
  typeof ChainVerificationStatusSchema
>;

export const ChainVerificationSummarySchema = z.object({
  mint: z.string().min(32),
  status: ChainVerificationStatusSchema,
  reasonCodes: z.array(z.string().min(1)),
  inspectedAt: z.string().datetime().optional(),
  mintAuthorityActive: z.boolean().nullable().optional(),
  freezeAuthorityActive: z.boolean().nullable().optional(),
  supplyUi: z.number().nonnegative().nullable().optional(),
  topHolderPct: z.number().min(0).max(100).nullable().optional(),
  top10HolderPct: z.number().min(0).max(100).nullable().optional(),
  errorCode: z.string().min(1).optional(),
  errorMessage: z.string().min(1).optional()
});
export type ChainVerificationSummary = z.infer<
  typeof ChainVerificationSummarySchema
>;

export const TokenIdSchema = z.object({
  chain: z.literal("solana"),
  mint: z.string().min(32)
});
export type TokenId = z.infer<typeof TokenIdSchema>;

export const TokenCandidateSchema = z.object({
  id: TokenIdSchema,
  mint: z.string().min(32),
  symbol: z.string().min(1).max(24),
  name: z.string().min(1).max(96),
  title: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  metadataUri: z.string().nullable().optional(),
  imageUri: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  twitter: z.string().nullable().optional(),
  telegram: z.string().nullable().optional(),
  discord: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  source: z.string().min(1),
  ageSeconds: z.number().nonnegative(),
  firstSeenAt: z.string().datetime()
});
export type TokenCandidate = z.infer<typeof TokenCandidateSchema>;

export const QuoteAssetSchema = z.enum([
  "SOL",
  "WSOL",
  "USDC",
  "USDT",
  "UNKNOWN"
]);
export type QuoteAsset = z.infer<typeof QuoteAssetSchema>;

export const ObservationConfidenceSchema = z.enum(["low", "medium", "high"]);
export type ObservationConfidence = z.infer<typeof ObservationConfidenceSchema>;

export const MarketObservationSummarySchema = z.object({
  signature: z.string().min(1),
  side: z.enum(["buy", "sell", "unknown"]),
  quoteAsset: QuoteAssetSchema,
  confidence: ObservationConfidenceSchema,
  usableForMetrics: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  priceSol: z.number().nonnegative().nullable(),
  priceUsd: z.number().nonnegative().nullable(),
  volumeSol: z.number().nonnegative().nullable(),
  volumeUsd: z.number().nonnegative().nullable(),
  createdAt: z.string().datetime()
});
export type MarketObservationSummary = z.infer<
  typeof MarketObservationSummarySchema
>;

export const WatchTargetKindSchema = z.enum([
  "mint",
  "pool",
  "bonding_curve",
  "program",
  "token_account",
  "wallet",
  "unknown"
]);
export type WatchTargetKind = z.infer<typeof WatchTargetKindSchema>;

export const WatchTargetSummarySchema = z.object({
  address: z.string().min(1),
  kind: WatchTargetKindSchema,
  confidence: ObservationConfidenceSchema,
  reasonCodes: z.array(z.string().min(1)),
  source: z.string().min(1)
});
export type WatchTargetSummary = z.infer<typeof WatchTargetSummarySchema>;

export const WatchPlanSummarySchema = z.object({
  shouldVerifyMint: z.boolean(),
  shouldWatchEvents: z.boolean(),
  selectedTargetCount: z.number().int().nonnegative(),
  skippedTargetCount: z.number().int().nonnegative(),
  selectedTargets: z.array(WatchTargetSummarySchema),
  reasonCodes: z.array(z.string().min(1)),
  createdAt: z.string().datetime()
});
export type WatchPlanSummary = z.infer<typeof WatchPlanSummarySchema>;

export const ActualDataSummarySchema = z.object({
  provider: z.literal("pumpportal"),
  subscriptionStatus: z.string().min(1),
  eventCount: z.number().int().nonnegative(),
  latestRealTradeAt: z.string().datetime().nullable(),
  latestPriceSol: z.number().nonnegative().nullable(),
  latestVolumeSol: z.number().nonnegative().nullable(),
  reasonCodes: z.array(z.string().min(1)),
  observationOnly: z.literal(true),
  paperOnly: z.literal(true)
});
export type ActualDataSummary = z.infer<typeof ActualDataSummarySchema>;

export const TokenIdentityDataSourceSchema = z.enum([
  "pumpportal",
  "solana_metadata",
  "offchain_metadata",
  "dexscreener",
  "jupiter_price",
  "manual",
  "mock",
  "unknown"
]);
export type TokenIdentityDataSource = z.infer<
  typeof TokenIdentityDataSourceSchema
>;

export const TokenIdentityConfidenceSchema = z.enum([
  "none",
  "low",
  "medium",
  "high"
]);
export type TokenIdentityConfidence = z.infer<
  typeof TokenIdentityConfidenceSchema
>;

export const TokenIdentitySummarySchema = z.object({
  mint: z.string().min(1),
  name: z.string().nullable(),
  symbol: z.string().nullable(),
  title: z.string().min(1),
  displayName: z.string().min(1),
  metadataUri: z.string().nullable(),
  imageUri: z.string().nullable(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  twitter: z.string().nullable(),
  telegram: z.string().nullable(),
  discord: z.string().nullable(),
  creator: z.string().nullable(),
  confidence: TokenIdentityConfidenceSchema,
  completenessScore: z.number().min(0).max(100),
  realData: z.boolean(),
  dataSource: TokenIdentityDataSourceSchema,
  resolved: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  sourcePriority: z.array(z.string().min(1)),
  firstSeenAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type TokenIdentitySummary = z.infer<typeof TokenIdentitySummarySchema>;

export const RollingMetricsSchema = z.object({
  priceUsd: z.number().nonnegative(),
  priceSol: z.number().nonnegative().nullable().optional(),
  priceQuote: z.number().nonnegative().nullable().optional(),
  marketCapUsd: z.number().nonnegative(),
  liquidityUsd: z.number().nonnegative(),
  volume1mUsd: z.number().nonnegative(),
  volume5mUsd: z.number().nonnegative(),
  volume15mUsd: z.number().nonnegative(),
  volumeSol: z.number().nonnegative().nullable().optional(),
  volumeQuote: z.number().nonnegative().nullable().optional(),
  quoteAsset: QuoteAssetSchema.optional(),
  quoteMint: z.string().min(1).nullable().optional(),
  usableForMetrics: z.boolean().optional(),
  confidence: ObservationConfidenceSchema.optional(),
  reasonCodes: z.array(z.string().min(1)).optional(),
  buyCount1m: z.number().int().nonnegative(),
  buyCount5m: z.number().int().nonnegative(),
  sellCount1m: z.number().int().nonnegative(),
  sellCount5m: z.number().int().nonnegative(),
  uniqueBuyers1m: z.number().int().nonnegative(),
  uniqueBuyers5m: z.number().int().nonnegative(),
  uniqueSellers1m: z.number().int().nonnegative(),
  uniqueSellers5m: z.number().int().nonnegative(),
  holderCount: z.number().int().nonnegative(),
  topHolderPercent: z.number().min(0).max(100),
  top10HolderPercent: z.number().min(0).max(100),
  priceChange1mPct: z.number(),
  priceChange5mPct: z.number(),
  volumeVelocity: z.number().nonnegative(),
  buyerVelocity: z.number().nonnegative()
});
export type RollingMetrics = z.infer<typeof RollingMetricsSchema>;

export const MetricWindowSchema = z.enum([
  "1s",
  "3s",
  "5s",
  "10s",
  "30s",
  "60s"
]);
export type MetricWindow = z.infer<typeof MetricWindowSchema>;

export const RollingWindowMetricsSchema = z.object({
  buyVolumeUsd: z.number().nonnegative(),
  sellVolumeUsd: z.number().nonnegative(),
  totalVolumeUsd: z.number().nonnegative(),
  netVolumeUsd: z.number(),
  buyVolumeSol: z.number().nonnegative().optional(),
  sellVolumeSol: z.number().nonnegative().optional(),
  totalVolumeSol: z.number().nonnegative().optional(),
  netVolumeSol: z.number().optional(),
  buyTradeCount: z.number().int().nonnegative(),
  sellTradeCount: z.number().int().nonnegative(),
  totalTradeCount: z.number().int().nonnegative(),
  uniqueBuyers: z.number().int().nonnegative(),
  uniqueSellers: z.number().int().nonnegative(),
  uniqueTraders: z.number().int().nonnegative(),
  priceChangePct: z.number(),
  priceSolChangePct: z.number().optional(),
  highPriceUsd: z.number().nonnegative(),
  lowPriceUsd: z.number().nonnegative(),
  highPriceSol: z.number().nonnegative().optional(),
  lowPriceSol: z.number().nonnegative().optional()
});
export type RollingWindowMetrics = z.infer<typeof RollingWindowMetricsSchema>;

const numericMetricWindowRecordSchema = z.object({
  "1s": z.number(),
  "3s": z.number(),
  "5s": z.number(),
  "10s": z.number(),
  "30s": z.number(),
  "60s": z.number()
});

const nonnegativeNumericMetricWindowRecordSchema = z.object({
  "1s": z.number().nonnegative(),
  "3s": z.number().nonnegative(),
  "5s": z.number().nonnegative(),
  "10s": z.number().nonnegative(),
  "30s": z.number().nonnegative(),
  "60s": z.number().nonnegative()
});

export const RollingWindowMetricsRecordSchema = z.object({
  "1s": RollingWindowMetricsSchema,
  "3s": RollingWindowMetricsSchema,
  "5s": RollingWindowMetricsSchema,
  "10s": RollingWindowMetricsSchema,
  "30s": RollingWindowMetricsSchema,
  "60s": RollingWindowMetricsSchema
});
export type RollingWindowMetricsRecord = z.infer<
  typeof RollingWindowMetricsRecordSchema
>;

export const RollingMetricsSnapshotSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1).optional(),
  windows: RollingWindowMetricsRecordSchema,
  volumeVelocityUsdPerSec: z.number(),
  volumeAccelerationUsdPerSec2: z.number(),
  volumeVelocitySolPerSec: z.number().optional(),
  volumeAccelerationSolPerSec2: z.number().optional(),
  tradesPerSecond: z.number().nonnegative(),
  largestTradeUsd: z.number().nonnegative(),
  largestTradeSol: z.number().nonnegative().optional(),
  largestTradeShare: z.number().nonnegative(),
  buyerVelocityPerSec: z.number(),
  buyerAccelerationPerSec2: z.number(),
  latestPriceUsd: z.number().nonnegative(),
  latestPriceSol: z.number().nonnegative().optional(),
  priceChangePct: numericMetricWindowRecordSchema,
  priceSolChangePct: numericMetricWindowRecordSchema.optional(),
  priceVelocityPctPerSec: z.number(),
  priceAccelerationPctPerSec2: z.number(),
  priceSolVelocityPctPerSec: z.number().optional(),
  priceSolAccelerationPctPerSec2: z.number().optional(),
  highPriceUsd: nonnegativeNumericMetricWindowRecordSchema,
  lowPriceUsd: nonnegativeNumericMetricWindowRecordSchema,
  highPriceSol: nonnegativeNumericMetricWindowRecordSchema.optional(),
  lowPriceSol: nonnegativeNumericMetricWindowRecordSchema.optional(),
  buySellRatio: z.number().nonnegative(),
  netBuyPressure: z.number().min(-1).max(1),
  organicBuyerScore: z.number().min(0).max(100),
  hasUsdMetrics: z.boolean().optional(),
  hasSolMetrics: z.boolean().optional(),
  usedSolMetricsFallback: z.boolean().optional(),
  insufficientMetrics: z.boolean(),
  sampleCount: z.number().int().nonnegative(),
  firstSeenAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime()
});
export type RollingMetricsSnapshot = z.infer<
  typeof RollingMetricsSnapshotSchema
>;

export const RiskFlagsSchema = z.object({
  mintAuthorityActive: z.boolean(),
  freezeAuthorityActive: z.boolean(),
  topHolderConcentrationHigh: z.boolean(),
  mutableMetadata: z.boolean(),
  suspiciousName: z.boolean(),
  lowLiquidity: z.boolean(),
  washTradingSuspected: z.boolean(),
  honeypotSuspected: z.boolean()
});
export type RiskFlags = z.infer<typeof RiskFlagsSchema>;

export const RiskSnapshotFlagsSchema = z.object({
  mintAuthorityActive: z.boolean().nullable(),
  freezeAuthorityActive: z.boolean().nullable(),
  metadataMutable: z.boolean().nullable(),
  holderCount: z.number().int().nonnegative().nullable(),
  topHolderPct: z.number().min(0).max(100).nullable(),
  top10HolderPct: z.number().min(0).max(100).nullable(),
  devHolderPct: z.number().min(0).max(100).nullable(),
  insiderHolderPct: z.number().min(0).max(100).nullable(),
  devSoldPct: z.number().min(0).max(100).nullable(),
  devNetFlowUsd: z.number().nullable(),
  priorLaunchCount: z.number().int().nonnegative().nullable(),
  priorRugCount: z.number().int().nonnegative().nullable(),
  buySellRatio: z.number().nonnegative().nullable(),
  netBuyPressure: z.number().min(-1).max(1).nullable(),
  uniqueBuyers: z.number().int().nonnegative().nullable(),
  uniqueSellers: z.number().int().nonnegative().nullable(),
  volumeVelocity: z.number().nullable(),
  volumeAcceleration: z.number().nullable(),
  buyerVelocity: z.number().nullable(),
  buyerAcceleration: z.number().nullable(),
  priceVelocity: z.number().nullable(),
  priceAcceleration: z.number().nullable(),
  largestTradeShare: z.number().min(0).max(1).nullable(),
  sampleCount: z.number().int().nonnegative().nullable(),
  insufficientMetrics: z.boolean().nullable(),
  liquidityUsd: z.number().nonnegative().nullable(),
  marketCapUsd: z.number().nonnegative().nullable(),
  fdvUsd: z.number().nonnegative().nullable(),
  estimatedSellSlippagePct: z.number().min(0).nullable(),
  sniperPct: z.number().min(0).max(100).nullable(),
  bundlerPct: z.number().min(0).max(100).nullable(),
  washTradingSuspected: z.boolean().nullable(),
  honeypotSuspected: z.boolean().nullable()
});
export type RiskSnapshotFlags = z.infer<typeof RiskSnapshotFlagsSchema>;

export const RiskSnapshotSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  riskLevel: RiskLevelSchema,
  hardReject: z.boolean(),
  riskScore: z.number().min(0).max(100),
  flags: RiskSnapshotFlagsSchema,
  reasonCodes: z.array(z.string().min(1)),
  humanSummary: z.string().min(1),
  updatedAt: z.string().datetime()
});
export type RiskSnapshot = z.infer<typeof RiskSnapshotSchema>;

export const ScoreBreakdownSchema = z.object({
  total: z.number().min(0).max(100),
  momentum: z.number().min(0).max(100),
  quality: z.number().min(0).max(100),
  riskPenalty: z.number().min(0).max(100),
  hardReject: z.boolean(),
  action: SignalActionSchema,
  reasonCodes: z.array(z.string().min(1))
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const SignalStateSchema = z.object({
  candidate: TokenCandidateSchema,
  metrics: RollingMetricsSchema,
  riskFlags: RiskFlagsSchema,
  score: ScoreBreakdownSchema,
  updatedAt: z.string().datetime()
});
export type SignalState = z.infer<typeof SignalStateSchema>;

export const CandidateMetricsSummarySchema = z.object({
  sampleCount: z.number().int().nonnegative(),
  insufficientMetrics: z.boolean(),
  volume10sUsd: z.number().nonnegative(),
  volume10sSol: z.number().nonnegative().optional(),
  volumeVelocity: z.number(),
  volumeAcceleration: z.number(),
  volumeVelocitySol: z.number().optional(),
  volumeAccelerationSol: z.number().optional(),
  buyerVelocity: z.number(),
  buyerAcceleration: z.number(),
  priceVelocity: z.number(),
  priceSolVelocity: z.number().optional(),
  usedSolMetricsFallback: z.boolean().optional(),
  buySellRatio: z.number().nonnegative(),
  netBuyPressure: z.number().min(-1).max(1),
  lastUpdatedAt: z.string().datetime()
});
export type CandidateMetricsSummary = z.infer<
  typeof CandidateMetricsSummarySchema
>;

export const CandidateRiskSummarySchema = z.object({
  riskLevel: RiskLevelSchema,
  riskScore: z.number().min(0).max(100),
  hardReject: z.boolean(),
  humanSummary: z.string().min(1)
});
export type CandidateRiskSummary = z.infer<typeof CandidateRiskSummarySchema>;

export const CandidateDecisionSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  imageUri: z.string().nullable().optional(),
  identity: TokenIdentitySummarySchema.optional(),
  identityConfidence: TokenIdentityConfidenceSchema.optional(),
  identityResolved: z.boolean().optional(),
  identityReasonCodes: z.array(z.string().min(1)).optional(),
  identitySource: TokenIdentityDataSourceSchema.optional(),
  source: z.string().min(1).optional(),
  lifecycleState: CandidateLifecycleStateSchema,
  action: CandidateDecisionActionSchema,
  score: z.number().min(0).max(100),
  riskLevel: RiskLevelSchema,
  hardReject: z.boolean(),
  riskReasonCodes: z.array(z.string().min(1)),
  scoreReasonCodes: z.array(z.string().min(1)),
  combinedReasonCodes: z.array(z.string().min(1)),
  chainVerification: ChainVerificationSummarySchema.optional(),
  chainVerificationStatus: ChainVerificationStatusSchema.optional(),
  chainVerifiedAt: z.string().datetime().optional(),
  chainReasonCodes: z.array(z.string().min(1)).optional(),
  onChainMintAuthorityActive: z.boolean().nullable().optional(),
  onChainFreezeAuthorityActive: z.boolean().nullable().optional(),
  onChainSupplyUi: z.number().nonnegative().nullable().optional(),
  onChainTopHolderPct: z.number().min(0).max(100).nullable().optional(),
  onChainTop10HolderPct: z.number().min(0).max(100).nullable().optional(),
  marketObservationSummary: MarketObservationSummarySchema.optional(),
  marketReasonCodes: z.array(z.string().min(1)).optional(),
  actualData: ActualDataSummarySchema.optional(),
  watchPlanSummary: WatchPlanSummarySchema.optional(),
  watchReasonCodes: z.array(z.string().min(1)).optional(),
  metricsSummary: CandidateMetricsSummarySchema,
  riskSnapshotSummary: CandidateRiskSummarySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type CandidateDecision = z.infer<typeof CandidateDecisionSchema>;

export const OverlaySignalSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1),
  name: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  imageUri: z.string().nullable().optional(),
  identity: TokenIdentitySummarySchema.optional(),
  identityConfidence: TokenIdentityConfidenceSchema.optional(),
  identityResolved: z.boolean().optional(),
  identityReasonCodes: z.array(z.string().min(1)).optional(),
  identitySource: TokenIdentityDataSourceSchema.optional(),
  score: z.number().min(0).max(100),
  action: SignalActionSchema,
  hardReject: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  buySellRatio: z.number().nonnegative().optional(),
  candidateDecision: CandidateDecisionSchema.optional(),
  candidateDecisionAction: CandidateDecisionActionSchema.optional(),
  chainVerification: ChainVerificationSummarySchema.optional(),
  chainVerificationStatus: ChainVerificationStatusSchema.optional(),
  combinedReasonCodes: z.array(z.string().min(1)).optional(),
  feedProvider: z.string().min(1).optional(),
  insufficientMetrics: z.boolean().optional(),
  lifecycleState: CandidateLifecycleStateSchema.optional(),
  marketObservationSummary: MarketObservationSummarySchema.optional(),
  marketReasonCodes: z.array(z.string().min(1)).optional(),
  actualData: ActualDataSummarySchema.optional(),
  watchPlanSummary: WatchPlanSummarySchema.optional(),
  watchReasonCodes: z.array(z.string().min(1)).optional(),
  netBuyPressure: z.number().min(-1).max(1).optional(),
  priceVelocity: z.number().optional(),
  riskLevel: RiskLevelSchema.optional(),
  riskReasonCodes: z.array(z.string().min(1)).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  riskSnapshot: RiskSnapshotSchema.optional(),
  scoreReasonCodes: z.array(z.string().min(1)).optional(),
  rollingMetrics: RollingMetricsSnapshotSchema.optional(),
  volumeAcceleration: z.number().optional(),
  volumeVelocity: z.number().nonnegative(),
  buyerAcceleration: z.number().optional(),
  buyerVelocity: z.number().nonnegative(),
  riskFlags: RiskFlagsSchema,
  state: SignalStateSchema
});
export type OverlaySignal = z.infer<typeof OverlaySignalSchema>;

export type SignalStrength = "none" | "weak" | "moderate" | "strong" | "reject";

export type StrategySignalDriver = {
  reasonCode: string;
  label: string;
  value: number | string | boolean | null;
};

export type StrategySignalExplanation = {
  strategyName: string;
  score: number;
  action: string;
  signalStrength: SignalStrength;
  components: {
    momentumScore: number;
    qualityScore: number;
    riskPenalty: number;
    liquidityPenalty: number;
    concentrationPenalty: number;
    missingDataPenalty: number;
  };
  positiveDrivers: StrategySignalDriver[];
  negativeDrivers: StrategySignalDriver[];
  blockers: StrategySignalDriver[];
  calculationInputs: {
    volumeVelocity: number | null;
    volumeAcceleration: number | null;
    priceVelocity: number | null;
    priceAcceleration: number | null;
    buyerVelocity: number | null;
    buyerAcceleration: number | null;
    holderVelocity: number | null;
    holderAcceleration: number | null;
  };
  lastUpdatedAt: string | null;
};

export type StrategyStatus = {
  strategyName: string;
  thresholds: {
    minScoreForPaperBuyReady: number;
    minScoreForWatch: number;
    minSampleCount: number;
    criticalRiskBlocksBuyReady: boolean;
    hardRejectBlocksBuyReady: boolean;
    insufficientMetricsBlocksBuyReady: boolean;
  };
  scoringWeights: {
    rollingMomentumWeight: number;
    legacyMomentumWeight: number;
    momentumMultiplier: number;
    qualityMultiplier: number;
    riskPenaltyMultiplier: number;
  };
  safetyGates: string[];
  formula: string[];
  paperOnly: true;
  reasonCodes: string[];
};

export type LiveCardDataQualityLabel =
  | "discovery_only"
  | "partial_market"
  | "trade_tracked"
  | "enriched"
  | "strategy_ready";

export type LiveCardDataCompleteness = {
  requiredFieldCount: number;
  availableFieldCount: number;
  unavailableFieldCount: number;
  completenessPct: number;
  missingCriticalFields: string[];
  missingOptionalFields: string[];
  dataQualityLabel: LiveCardDataQualityLabel;
  reasonCodes: string[];
};

export type LiveTradeTrackingState =
  | "not_tracked"
  | "tracking_requested"
  | "tracking"
  | "budget_reached"
  | "unsubscribed"
  | "error";

export type LiveLaunchTrackingState =
  | "not_tracked"
  | "tracking"
  | "budget_reached"
  | "unsubscribed"
  | "blocked";

export type LiveCardLaunchWindowLabel = "5s" | "10s" | "30s" | "2m" | "5m";

export type LiveCardLaunchWindowMetrics = {
  volumeSol: number;
  buyVolumeSol: number;
  sellVolumeSol: number;
  netVolumeSol: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  buySellRatio: number | null;
  netBuyPressure: number;
  openSol: number | null;
  highSol: number | null;
  lowSol: number | null;
  closeSol: number | null;
  priceChangePct: number;
};

export type LiveCardLaunchWindows = Record<
  LiveCardLaunchWindowLabel,
  LiveCardLaunchWindowMetrics
>;

export type LiveCardLaunchDerivatives = {
  volumeVelocitySolPerSec: number;
  volumeAccelerationSolPerSec2: number;
  priceVelocityPctPerSec: number;
  priceAccelerationPctPerSec2: number;
  buyerVelocityPerSec: number;
  buyerAccelerationPerSec2: number;
  tradeVelocityPerSec: number;
  tradeAccelerationPerSec2: number;
};

export type LiveTokenCardViewModel = {
  mint: string;
  shortMint: string;
  name: string | null;
  symbol: string | null;
  title: string;
  displayName: string;
  imageUri: string | null;
  identityConfidence: TokenIdentityConfidence;
  identitySource: TokenIdentityDataSource;
  identityResolved: boolean;
  metadataUri: string | null;
  source: string;
  sourceMode: string;
  realData: boolean;
  eventTypes: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  ageSeconds: number;
  latestEventAt: string;
  latestSignature: string | null;
  liveSessionOnly: boolean;
  stale: boolean;
  dataFreshnessMs: number | null;
  priceSol: number | null;
  priceUsd: number | null;
  priceQuote: number | null;
  quoteAsset: QuoteAsset | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume1sUsd: number | null;
  volume3sUsd: number | null;
  volume5sUsd: number | null;
  volume10sUsd: number | null;
  volume30sUsd: number | null;
  volume60sUsd: number | null;
  volume1sSol: number | null;
  volume3sSol: number | null;
  volume5sSol: number | null;
  volume10sSol: number | null;
  volume30sSol: number | null;
  volume60sSol: number | null;
  buyVolume10s: number | null;
  sellVolume10s: number | null;
  netVolume10s: number | null;
  buySellRatio: number | null;
  netBuyPressure: number | null;
  uniqueBuyers1s: number | null;
  uniqueBuyers5s: number | null;
  uniqueBuyers10s: number | null;
  uniqueSellers10s: number | null;
  uniqueTraders10s: number | null;
  buyTradeCount10s: number | null;
  sellTradeCount10s: number | null;
  totalTradeCount10s: number | null;
  holders: number | null;
  holderCount: number | null;
  topHolderPct: number | null;
  top10HolderPct: number | null;
  devHolderPct: number | null;
  holderDataSource: string | null;
  holderDataFreshnessMs: number | null;
  volumeVelocityUsdPerSec: number | null;
  volumeAccelerationUsdPerSec2: number | null;
  volumeVelocitySolPerSec: number | null;
  volumeAccelerationSolPerSec2: number | null;
  priceVelocityPctPerSec: number | null;
  priceAccelerationPctPerSec2: number | null;
  priceSolVelocityPctPerSec: number | null;
  priceSolAccelerationPctPerSec2: number | null;
  buyerVelocityPerSec: number | null;
  buyerAccelerationPerSec2: number | null;
  holderVelocityPerSec: number | null;
  holderAccelerationPerSec2: number | null;
  sampleCount: number;
  validMetricSampleCount: number;
  insufficientMetrics: boolean;
  calculationConfidence: ObservationConfidence;
  calculationReasonCodes: string[];
  riskLevel: RiskLevel;
  riskScore: number | null;
  hardReject: boolean;
  riskReasonCodes: string[];
  topRiskWarnings: string[];
  mintAuthorityActive: boolean | null;
  freezeAuthorityActive: boolean | null;
  liquidityRisk: string;
  concentrationRisk: string;
  washTradingSuspected: boolean | null;
  honeypotSuspected: boolean | null;
  action: string;
  lifecycleState: CandidateLifecycleState;
  score: number;
  scoreLabel: string;
  signalStrength: SignalStrength;
  combinedReasonCodes: string[];
  buyReady: boolean;
  rejectReason: string | null;
  strategyName: string;
  signalUpdatedAt: string | null;
  strategy: StrategySignalExplanation;
  rawEventCount: number;
  actualTradeEventCount: number;
  meteredLaunchDataState: LiveLaunchTrackingState;
  priceActionSource: "PumpPortal subscribeTokenTrade" | "unavailable";
  realTradeEventCount: number;
  realPriceActionReady: boolean;
  realTimeSeriesReady: boolean;
  missingDataReason: string | null;
  marketObservationCount: number;
  chainVerificationStatus: ChainVerificationStatus | "not_checked";
  feedProvider: string;
  dataSourceWarnings: string[];
  dataCompleteness: LiveCardDataCompleteness;
  tradeTrackingState: LiveTradeTrackingState;
  tradeTrackingReasonCodes: string[];
  latestTradeAt: string | null;
  latestTradeAgeSeconds: number | null;
  tradeEventCount: number;
  launchAgeSeconds: number | null;
  launchPhase: string;
  launchScore: number;
  launchScoreLabel: string;
  launchBuyReadyPaper: boolean;
  launchTradeSampleCount: number;
  launchPriceSol: number | null;
  launchWindows: LiveCardLaunchWindows | null;
  launchDerivatives: LiveCardLaunchDerivatives | null;
  launchTrackingState: LiveLaunchTrackingState;
  launchVolume5sSol: number | null;
  launchVolume10sSol: number | null;
  launchVolume30sSol: number | null;
  launchVolume2mSol: number | null;
  launchVolume5mSol: number | null;
  launchBuyCount10s: number | null;
  launchSellCount10s: number | null;
  launchUniqueBuyers10s: number | null;
  launchUniqueSellers10s: number | null;
  launchNetBuyPressure10s: number | null;
  launchPriceChange10sPct: number | null;
  launchVolumeVelocitySolPerSec: number | null;
  launchVolumeAccelerationSolPerSec2: number | null;
  launchPriceVelocityPctPerSec: number | null;
  launchPriceAccelerationPctPerSec2: number | null;
  launchBuyerVelocityPerSec: number | null;
  launchBuyerAccelerationPerSec2: number | null;
  launchDrivers: string[];
  launchBlockers: string[];
  launchReasonCodes: string[];
  launchMissingDataReasons: string[];
  exitSignalSummary: {
    hasExitSignal: boolean;
    exitSignalCount: number;
    latestExitSignal: {
      signalId: string;
      action: "paper_sell";
      sellPct: number;
      blocked: boolean;
      wallet: string;
      walletAlias: string | null;
      ruleId: string;
      createdAt: string;
      reasonCodes: string[];
    } | null;
    watchedWalletTriggers: string[];
    exitBlockers: string[];
  };
  paperPositionSummary: {
    hasPosition: boolean;
    status: "open" | "partially_closed" | "closed" | null;
    entryPriceSol: number | null;
    currentPriceSol: number | null;
    unrealizedPnlPct: number | null;
    unrealizedPnlSol: number | null;
    realizedPnlSol: number | null;
    remainingSizeSol: number | null;
    latestPaperOrder: {
      orderId: string;
      side: "buy" | "sell";
      source: string;
      createdAt: string;
      reasonCodes: string[];
    } | null;
    latestPaperExitSignal: {
      signalId: string;
      sellPct: number;
      blocked: boolean;
      createdAt: string;
      reasonCodes: string[];
    } | null;
  };
  dataCompletenessLabel: LiveCardDataQualityLabel;
  missingCriticalFields: string[];
  enrichmentStatus: "disabled" | "not_checked" | "partial" | "available";
  enrichmentSource: string | null;
  pairAddress: string | null;
  dexId: string | null;
  missingFields: string[];
  unavailableFields: string[];
  lastUpdatedAt: string;
};
