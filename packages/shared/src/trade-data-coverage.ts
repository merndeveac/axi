import { z } from "zod";

export const TradeDataCoverageSchemaVersionSchema = z.literal(
  "trade-data-coverage-v1"
);
export type TradeDataCoverageSchemaVersion = z.infer<
  typeof TradeDataCoverageSchemaVersionSchema
>;

export const TradeDataLocalReconciliationStatusSchema = z.enum([
  "TRADE_DATA_LOCALLY_RECONCILED",
  "TRADE_DATA_LOCAL_RECONCILIATION_FAILED"
]);
export type TradeDataLocalReconciliationStatus = z.infer<
  typeof TradeDataLocalReconciliationStatusSchema
>;

export const TradeDataUpstreamCoverageStatusSchema = z.enum([
  "UPSTREAM_TRADE_COMPLETENESS_UNPROVEN",
  "UPSTREAM_TRADE_COMPLETENESS_PROVEN"
]);
export type TradeDataUpstreamCoverageStatus = z.infer<
  typeof TradeDataUpstreamCoverageStatusSchema
>;

export const TradeDataParserOutcomeSchema = z.enum([
  "pending",
  "parse_failed",
  "recognized_trade",
  "recognized_non_trade",
  "unknown_payload"
]);
export type TradeDataParserOutcome = z.infer<
  typeof TradeDataParserOutcomeSchema
>;

export const TradeDataNormalizationOutcomeSchema = z.enum([
  "pending",
  "not_applicable",
  "succeeded",
  "rejected"
]);
export type TradeDataNormalizationOutcome = z.infer<
  typeof TradeDataNormalizationOutcomeSchema
>;

export const TradeDataPipelineOutcomeSchema = z.enum([
  "pending",
  "not_applicable",
  "completed",
  "duplicate",
  "rejected",
  "failed_or_dropped"
]);
export type TradeDataPipelineOutcome = z.infer<
  typeof TradeDataPipelineOutcomeSchema
>;

export const TradeAmountNormalizationModeSchema = z.enum([
  "ui",
  "raw",
  "decimals_normalized",
  "unknown"
]);
export type TradeAmountNormalizationMode = z.infer<
  typeof TradeAmountNormalizationModeSchema
>;

export const TradeDataCoverageStageSchema = z.enum([
  "raw_received",
  "parse_succeeded",
  "parse_failed",
  "trade_recognized",
  "non_trade_recognized",
  "unknown_payload",
  "normalization_succeeded",
  "normalization_rejected",
  "duplicate_detected",
  "queue_accepted",
  "queue_transaction_started",
  "queue_committed",
  "queue_failed",
  "persistence_completed",
  "timeseries_accepted",
  "timeseries_rejected",
  "snapshot_updated",
  "rolling_windows_updated",
  "derivatives_updated",
  "derivative_strength_updated",
  "signal_updated",
  "scanner_projected",
  "broadcast_completed",
  "pipeline_completed",
  "pipeline_rejected",
  "pipeline_failed_or_dropped"
]);
export type TradeDataCoverageStage = z.infer<
  typeof TradeDataCoverageStageSchema
>;

export const TradeDataCoverageLatencyKeySchema = z.enum([
  "provider_to_receive",
  "receive_to_normalize",
  "normalize_to_persist",
  "persist_to_timeseries",
  "timeseries_to_scanner",
  "receive_to_scanner",
  "receive_to_pipeline_complete"
]);
export type TradeDataCoverageLatencyKey = z.infer<
  typeof TradeDataCoverageLatencyKeySchema
>;

export const TradeDataCoverageLatencyDistributionSchema = z.object({
  availableCount: z.number().int().nonnegative(),
  unavailableCount: z.number().int().nonnegative(),
  min: z.number().nonnegative().nullable(),
  p50: z.number().nonnegative().nullable(),
  p95: z.number().nonnegative().nullable(),
  p99: z.number().nonnegative().nullable(),
  max: z.number().nonnegative().nullable()
});
export type TradeDataCoverageLatencyDistribution = z.infer<
  typeof TradeDataCoverageLatencyDistributionSchema
>;

export const TradeDataConsistencyCheckSchema = z.object({
  status: z.enum(["passed", "failed", "unavailable"]),
  observed: z.number().finite().nullable().optional(),
  expected: z.number().finite().nullable().optional(),
  tolerance: z.number().nonnegative().nullable().optional(),
  reasonCode: z.string().min(1)
});
export type TradeDataConsistencyCheck = z.infer<
  typeof TradeDataConsistencyCheckSchema
>;

export const TradeDataCoverageEquationSchema = z.object({
  name: z.string().min(1),
  left: z.number().int().nonnegative(),
  right: z.number().int().nonnegative(),
  residual: z.number().int(),
  holds: z.boolean(),
  expression: z.string().min(1)
});
export type TradeDataCoverageEquation = z.infer<
  typeof TradeDataCoverageEquationSchema
>;

export const TradeDataChainVerificationStatusSchema = z.enum([
  "NOT_REQUESTED",
  "VERIFIED",
  "PARTIAL",
  "MISMATCH",
  "UNAVAILABLE"
]);
export type TradeDataChainVerificationStatus = z.infer<
  typeof TradeDataChainVerificationStatusSchema
>;

export const TradeDataSubscriptionEventTypeSchema = z.enum([
  "track_requested",
  "subscribe_sent",
  "subscribe_acknowledged",
  "active",
  "first_trade_received",
  "stop_requested",
  "unsubscribe_sent",
  "unsubscribe_acknowledged",
  "grace_started",
  "finalized",
  "error"
]);
export type TradeDataSubscriptionEventType = z.infer<
  typeof TradeDataSubscriptionEventTypeSchema
>;

export const TradeDataSubscriptionEventSchema = z.object({
  schemaVersion: TradeDataCoverageSchemaVersionSchema,
  subscriptionEventId: z.string().min(1),
  sessionId: z.string().min(1),
  mint: z.string().min(1),
  eventType: TradeDataSubscriptionEventTypeSchema,
  timestamp: z.string().datetime(),
  safeReason: z.string().min(1).nullable(),
  reasonCodes: z.array(z.string().min(1)),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime()
});
export type TradeDataSubscriptionEvent = z.infer<
  typeof TradeDataSubscriptionEventSchema
>;

const nullableTimestampSchema = z.string().datetime().nullable();
const stageTimestampRecordSchema = z.record(
  TradeDataCoverageStageSchema,
  nullableTimestampSchema
);
const stageLatencyRecordSchema = z.record(
  TradeDataCoverageLatencyKeySchema,
  z.number().nonnegative().nullable()
);

export const TradeDataCoverageEventSchema = z.object({
  schemaVersion: TradeDataCoverageSchemaVersionSchema,
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  sourceEventKey: z.string().min(1).nullable(),
  provider: z.string().min(1),
  subscribedMint: z.string().min(1),
  observedMint: z.string().min(1).nullable(),
  signature: z.string().min(1).nullable(),
  eventIndex: z.string().min(1).nullable(),
  receivedAt: z.string().datetime(),
  providerTimestamp: z.string().datetime().nullable(),
  side: z.enum(["buy", "sell", "unknown"]).nullable(),
  trader: z.string().min(1).nullable(),
  rawSolAmount: z.number().finite().nullable(),
  rawTokenAmount: z.number().finite().nullable(),
  normalizedVolumeSol: z.number().finite().nullable(),
  normalizedTokenAmount: z.number().finite().nullable(),
  normalizedPriceSol: z.number().finite().nullable(),
  marketCapSol: z.number().finite().nullable(),
  virtualTokenReserves: z.number().finite().nullable(),
  virtualSolReserves: z.number().finite().nullable(),
  amountNormalizationMode: TradeAmountNormalizationModeSchema,
  confidence: z.enum(["low", "medium", "high"]),
  usableForMetrics: z.boolean(),
  parserOutcome: TradeDataParserOutcomeSchema,
  normalizationOutcome: TradeDataNormalizationOutcomeSchema,
  pipelineOutcome: TradeDataPipelineOutcomeSchema,
  duplicateKey: z.string().min(1).nullable(),
  duplicateReason: z.string().min(1).nullable(),
  rejectionReason: z.string().min(1).nullable(),
  failureStage: TradeDataCoverageStageSchema.nullable(),
  failureReason: z.string().min(1).nullable(),
  postStop: z.boolean(),
  postStopClassification: z
    .enum([
      "not_applicable",
      "expected_in_flight",
      "unexpected_after_unsubscribe"
    ])
    .default("not_applicable"),
  stageTimestamps: stageTimestampRecordSchema,
  stageLatenciesMs: stageLatencyRecordSchema,
  consistencyChecks: z.record(z.string(), TradeDataConsistencyCheckSchema),
  chainVerificationStatus: TradeDataChainVerificationStatusSchema,
  reasonCodes: z.array(z.string().min(1)),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type TradeDataCoverageEvent = z.infer<
  typeof TradeDataCoverageEventSchema
>;

const nonnegativeCount = z.number().int().nonnegative();

export const TradeDataCoverageSessionSchema = z.object({
  schemaVersion: TradeDataCoverageSchemaVersionSchema,
  sessionId: z.string().min(1),
  provider: z.string().min(1),
  sourceMode: z.string().min(1),
  startedAt: z.string().datetime(),
  stoppedAt: nullableTimestampSchema,
  stopReason: z.string().min(1).nullable(),
  selectedMint: z.string().min(1),
  subscriptionRequestedAt: nullableTimestampSchema,
  subscriptionSentAt: nullableTimestampSchema,
  subscriptionAcknowledgedAt: nullableTimestampSchema,
  firstTradeAt: nullableTimestampSchema,
  unsubscribeRequestedAt: nullableTimestampSchema,
  unsubscribeSentAt: nullableTimestampSchema,
  finalTradeAt: nullableTimestampSchema,
  activeDurationMs: z.number().nonnegative(),
  observationDurationMs: z.number().nonnegative(),
  postStopGraceMs: z.number().int().nonnegative(),
  maxEvents: z.number().int().positive(),
  maxRuntimeMs: z.number().int().positive(),
  maxCostSol: z.number().positive(),
  rawFrameCount: nonnegativeCount,
  parsedFrameCount: nonnegativeCount,
  parseFailureCount: nonnegativeCount,
  recognizedTradeCount: nonnegativeCount,
  recognizedNonTradeCount: nonnegativeCount,
  unknownPayloadCount: nonnegativeCount,
  normalizationSuccessCount: nonnegativeCount,
  normalizationRejectCount: nonnegativeCount,
  duplicateCount: nonnegativeCount,
  rejectedCount: nonnegativeCount,
  pipelineCompletedCount: nonnegativeCount,
  pipelineFailedOrDroppedCount: nonnegativeCount,
  queueAcceptedCount: nonnegativeCount,
  queueCommittedCount: nonnegativeCount,
  queueFailureCount: nonnegativeCount,
  persistenceCompletedCount: nonnegativeCount,
  timeseriesAcceptedCount: nonnegativeCount,
  timeseriesRejectedCount: nonnegativeCount,
  snapshotUpdatedCount: nonnegativeCount,
  rollingWindowsUpdatedCount: nonnegativeCount,
  derivativeUpdatedCount: nonnegativeCount,
  derivativeStrengthUpdatedCount: nonnegativeCount,
  signalUpdatedCount: nonnegativeCount,
  scannerProjectedCount: nonnegativeCount,
  broadcastCompletedCount: nonnegativeCount,
  postStopFrameCount: nonnegativeCount,
  postStopTradeCount: nonnegativeCount,
  unexpectedPostStopTradeCount: nonnegativeCount,
  usableTradeCount: nonnegativeCount,
  unusableTradeCount: nonnegativeCount,
  wrongMintFrameCount: nonnegativeCount,
  missingSignatureCount: nonnegativeCount,
  missingAmountCount: nonnegativeCount,
  consistencyMismatchCount: nonnegativeCount,
  oneSecondBucketCount: nonnegativeCount,
  completedOneSecondBucketCount: nonnegativeCount,
  validSampleCount: nonnegativeCount,
  firstDerivativeAvailable: z.boolean(),
  secondDerivativeAvailable: z.boolean(),
  telemetryFailureCount: nonnegativeCount,
  estimatedCostSol: z.number().nonnegative(),
  estimatedCostPerEventSol: z.number().nonnegative(),
  costIsEstimated: z.literal(true),
  consistencySummary: z.object({
    passed: nonnegativeCount,
    failed: nonnegativeCount,
    unavailable: nonnegativeCount
  }),
  latencyDistributions: z.record(
    TradeDataCoverageLatencyKeySchema,
    TradeDataCoverageLatencyDistributionSchema
  ),
  reconciliation: z.object({
    equations: z.array(TradeDataCoverageEquationSchema),
    maximumAbsoluteResidual: nonnegativeCount
  }),
  chainVerification: z.object({
    enabled: z.boolean(),
    maxSignatures: z.number().int().nonnegative(),
    sampledSignatures: nonnegativeCount,
    verified: nonnegativeCount,
    partial: nonnegativeCount,
    mismatch: nonnegativeCount,
    unavailable: nonnegativeCount
  }),
  subscriptionLifecycle: z.array(TradeDataSubscriptionEventSchema),
  localReconciliationStatus: TradeDataLocalReconciliationStatusSchema,
  upstreamCoverageStatus: TradeDataUpstreamCoverageStatusSchema,
  reasonCodes: z.array(z.string().min(1)),
  updatedAt: z.string().datetime(),
  paperOnly: z.literal(true),
  accountTradesActive: z.literal(false),
  paperAutomationActive: z.literal(false),
  lightningActive: z.literal(false),
  signingActive: z.literal(false),
  transactionSendingActive: z.literal(false),
  liveTradingEnabled: z.literal(false)
});
export type TradeDataCoverageSession = z.infer<
  typeof TradeDataCoverageSessionSchema
>;

export const TradeDataCoverageEventQuerySchema = z.object({
  sessionId: z.string().min(1).optional(),
  mint: z.string().min(1).optional(),
  signature: z.string().min(1).optional(),
  parserOutcome: TradeDataParserOutcomeSchema.optional(),
  normalizationOutcome: TradeDataNormalizationOutcomeSchema.optional(),
  pipelineOutcome: TradeDataPipelineOutcomeSchema.optional(),
  usableForMetrics: z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean().optional()
  ),
  postStop: z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean().optional()
  ),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0)
});
export type TradeDataCoverageEventQuery = z.infer<
  typeof TradeDataCoverageEventQuerySchema
>;

export const TradeDataSubscriptionEventQuerySchema = z.object({
  sessionId: z.string().min(1).optional(),
  mint: z.string().min(1).optional(),
  eventType: TradeDataSubscriptionEventTypeSchema.optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0)
});
export type TradeDataSubscriptionEventQuery = z.infer<
  typeof TradeDataSubscriptionEventQuerySchema
>;

export const tradeDataCoverageLatencyKeys =
  TradeDataCoverageLatencyKeySchema.options;
