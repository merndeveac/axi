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

export const OverlaySignalSchema = z.object({
  mint: z.string().min(32),
  symbol: z.string().min(1),
  score: z.number().min(0).max(100),
  action: SignalActionSchema,
  hardReject: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  buySellRatio: z.number().nonnegative().optional(),
  feedProvider: z.string().min(1).optional(),
  insufficientMetrics: z.boolean().optional(),
  netBuyPressure: z.number().min(-1).max(1).optional(),
  priceVelocity: z.number().optional(),
  rollingMetrics: RollingMetricsSnapshotSchema.optional(),
  volumeAcceleration: z.number().optional(),
  volumeVelocity: z.number().nonnegative(),
  buyerAcceleration: z.number().optional(),
  buyerVelocity: z.number().nonnegative(),
  riskFlags: RiskFlagsSchema,
  state: SignalStateSchema
});
export type OverlaySignal = z.infer<typeof OverlaySignalSchema>;
