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
  source: z.string().min(1),
  ageSeconds: z.number().nonnegative(),
  firstSeenAt: z.string().datetime()
});
export type TokenCandidate = z.infer<typeof TokenCandidateSchema>;

export const RollingMetricsSchema = z.object({
  priceUsd: z.number().nonnegative(),
  marketCapUsd: z.number().nonnegative(),
  liquidityUsd: z.number().nonnegative(),
  volume1mUsd: z.number().nonnegative(),
  volume5mUsd: z.number().nonnegative(),
  volume15mUsd: z.number().nonnegative(),
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

export const MetricWindowSchema = z.enum(["1s", "3s", "5s", "10s", "30s", "60s"]);
export type MetricWindow = z.infer<typeof MetricWindowSchema>;

export const RollingWindowMetricsSchema = z.object({
  buyVolumeUsd: z.number().nonnegative(),
  sellVolumeUsd: z.number().nonnegative(),
  totalVolumeUsd: z.number().nonnegative(),
  netVolumeUsd: z.number(),
  buyTradeCount: z.number().int().nonnegative(),
  sellTradeCount: z.number().int().nonnegative(),
  totalTradeCount: z.number().int().nonnegative(),
  uniqueBuyers: z.number().int().nonnegative(),
  uniqueSellers: z.number().int().nonnegative(),
  uniqueTraders: z.number().int().nonnegative(),
  priceChangePct: z.number(),
  highPriceUsd: z.number().nonnegative(),
  lowPriceUsd: z.number().nonnegative()
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
  tradesPerSecond: z.number().nonnegative(),
  largestTradeUsd: z.number().nonnegative(),
  largestTradeShare: z.number().nonnegative(),
  buyerVelocityPerSec: z.number(),
  buyerAccelerationPerSec2: z.number(),
  latestPriceUsd: z.number().nonnegative(),
  priceChangePct: numericMetricWindowRecordSchema,
  priceVelocityPctPerSec: z.number(),
  priceAccelerationPctPerSec2: z.number(),
  highPriceUsd: nonnegativeNumericMetricWindowRecordSchema,
  lowPriceUsd: nonnegativeNumericMetricWindowRecordSchema,
  buySellRatio: z.number().nonnegative(),
  netBuyPressure: z.number().min(-1).max(1),
  organicBuyerScore: z.number().min(0).max(100),
  insufficientMetrics: z.boolean(),
  sampleCount: z.number().int().nonnegative(),
  firstSeenAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime()
});
export type RollingMetricsSnapshot = z.infer<typeof RollingMetricsSnapshotSchema>;

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
  volumeVelocity: z.number(),
  volumeAcceleration: z.number(),
  buyerVelocity: z.number(),
  buyerAcceleration: z.number(),
  priceVelocity: z.number(),
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
export type CandidateRiskSummary = z.infer<
  typeof CandidateRiskSummarySchema
>;

export const CandidateDecisionSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
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
  metricsSummary: CandidateMetricsSummarySchema,
  riskSnapshotSummary: CandidateRiskSummarySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type CandidateDecision = z.infer<typeof CandidateDecisionSchema>;

export const OverlaySignalSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1),
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
