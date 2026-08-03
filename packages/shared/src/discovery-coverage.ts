import { z } from "zod";

export const DiscoveryCoverageSchemaVersionSchema = z.literal(
  "discovery-coverage-v1"
);
export type DiscoveryCoverageSchemaVersion = z.infer<
  typeof DiscoveryCoverageSchemaVersionSchema
>;

export const DiscoveryCoverageStatusSchema = z.enum([
  "LOCALLY_RECONCILED",
  "LOCAL_RECONCILIATION_FAILED",
  "UNPROVEN",
  "PROVEN"
]);
export type DiscoveryCoverageStatus = z.infer<
  typeof DiscoveryCoverageStatusSchema
>;

export const DiscoveryCoverageEventTypeSchema = z.enum([
  "create",
  "migration",
  "non_discovery",
  "unknown",
  "parse_failure"
]);
export type DiscoveryCoverageEventType = z.infer<
  typeof DiscoveryCoverageEventTypeSchema
>;

export const DiscoveryCoverageParserOutcomeSchema = z.enum([
  "pending",
  "parse_failure",
  "recognized_create",
  "recognized_migration",
  "recognized_non_discovery",
  "unknown_payload"
]);
export type DiscoveryCoverageParserOutcome = z.infer<
  typeof DiscoveryCoverageParserOutcomeSchema
>;

export const DiscoveryCoverageNormalizationOutcomeSchema = z.enum([
  "pending",
  "not_applicable",
  "succeeded",
  "rejected"
]);
export type DiscoveryCoverageNormalizationOutcome = z.infer<
  typeof DiscoveryCoverageNormalizationOutcomeSchema
>;

export const DiscoveryCoveragePipelineOutcomeSchema = z.enum([
  "pending",
  "not_applicable",
  "completed",
  "duplicate",
  "rejected",
  "failed_or_dropped"
]);
export type DiscoveryCoveragePipelineOutcome = z.infer<
  typeof DiscoveryCoveragePipelineOutcomeSchema
>;

export const DiscoveryCoverageStageSchema = z.enum([
  "raw_received",
  "parse_succeeded",
  "parse_failed",
  "create_recognized",
  "migration_recognized",
  "non_discovery_recognized",
  "unknown_payload",
  "normalization_succeeded",
  "normalization_rejected",
  "duplicate_detected",
  "queue_accepted",
  "queue_transaction_started",
  "queue_committed",
  "queue_failed",
  "identity_completed",
  "live_token_completed",
  "candidate_completed",
  "score_completed",
  "persistence_completed",
  "scanner_projected",
  "broadcast_attempted",
  "broadcast_completed",
  "pipeline_completed",
  "pipeline_failed_or_dropped"
]);
export type DiscoveryCoverageStage = z.infer<
  typeof DiscoveryCoverageStageSchema
>;

export const DiscoveryCoverageLatencyKeySchema = z.enum([
  "provider_to_receive",
  "receive_to_parse",
  "receive_to_normalize",
  "normalize_to_queue_accept",
  "normalize_to_queue_commit",
  "queue_accept_to_queue_commit",
  "queue_transaction_start_to_identity",
  "queue_transaction_start_to_live_token",
  "queue_transaction_start_to_candidate",
  "queue_transaction_start_to_score",
  "queue_transaction_start_to_persistence",
  "queue_transaction_start_to_scanner",
  "queue_transaction_start_to_broadcast",
  "queue_commit_to_identity",
  "queue_commit_to_live_token",
  "queue_commit_to_candidate",
  "queue_commit_to_score",
  "queue_commit_to_persistence",
  "queue_commit_to_scanner",
  "queue_commit_to_broadcast",
  "receive_to_scanner",
  "receive_to_broadcast",
  "receive_to_pipeline_complete",
  "provider_to_pipeline_complete"
]);
export type DiscoveryCoverageLatencyKey = z.infer<
  typeof DiscoveryCoverageLatencyKeySchema
>;

export const DiscoveryCoverageLatencyDistributionSchema = z.object({
  availableCount: z.number().int().nonnegative(),
  unavailableCount: z.number().int().nonnegative(),
  min: z.number().nonnegative().nullable(),
  p50: z.number().nonnegative().nullable(),
  p95: z.number().nonnegative().nullable(),
  p99: z.number().nonnegative().nullable(),
  max: z.number().nonnegative().nullable()
});
export type DiscoveryCoverageLatencyDistribution = z.infer<
  typeof DiscoveryCoverageLatencyDistributionSchema
>;

export const DiscoveryCoverageEquationSchema = z.object({
  name: z.string().min(1),
  left: z.number().int().nonnegative(),
  right: z.number().int().nonnegative(),
  residual: z.number().int(),
  holds: z.boolean(),
  expression: z.string().min(1)
});
export type DiscoveryCoverageEquation = z.infer<
  typeof DiscoveryCoverageEquationSchema
>;

const nullableTimestampSchema = z.string().datetime().nullable();
const stageTimestampRecordSchema = z.record(
  DiscoveryCoverageStageSchema,
  nullableTimestampSchema
);
const stageLatencyRecordSchema = z.record(
  DiscoveryCoverageLatencyKeySchema,
  z.number().nonnegative().nullable()
);

export const DiscoveryCoverageEventSchema = z.object({
  schemaVersion: DiscoveryCoverageSchemaVersionSchema,
  sessionId: z.string().min(1),
  correlationId: z.string().min(1),
  sourceEventKey: z.string().min(1).nullable(),
  provider: z.string().min(1),
  receivedAt: z.string().datetime(),
  providerTimestamp: z.string().datetime().nullable(),
  eventType: DiscoveryCoverageEventTypeSchema,
  mint: z.string().min(1).nullable(),
  signature: z.string().min(1).nullable(),
  parserOutcome: DiscoveryCoverageParserOutcomeSchema,
  normalizationOutcome: DiscoveryCoverageNormalizationOutcomeSchema,
  pipelineOutcome: DiscoveryCoveragePipelineOutcomeSchema,
  duplicateKey: z.string().min(1).nullable(),
  duplicateReason: z.string().min(1).nullable(),
  rejectionReason: z.string().min(1).nullable(),
  failureStage: DiscoveryCoverageStageSchema.nullable(),
  failureReason: z.string().min(1).nullable(),
  safePayloadHash: z.string().min(1).nullable(),
  topLevelKeys: z.array(z.string().min(1)),
  stageTimestamps: stageTimestampRecordSchema,
  stageLatenciesMs: stageLatencyRecordSchema,
  reasonCodes: z.array(z.string().min(1)),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type DiscoveryCoverageEvent = z.infer<
  typeof DiscoveryCoverageEventSchema
>;

export const DiscoveryCoverageConnectionEventTypeSchema = z.enum([
  "connection_attempt",
  "connection_opened",
  "subscription_sent",
  "subscription_acknowledged",
  "subscription_acknowledgement_unavailable",
  "connection_error",
  "disconnected",
  "reconnect_attempt",
  "reconnect_success",
  "reconnect_failure",
  "subscription_replay_attempted",
  "subscription_replay_completed",
  "event_before_disconnect",
  "event_after_reconnect"
]);
export type DiscoveryCoverageConnectionEventType = z.infer<
  typeof DiscoveryCoverageConnectionEventTypeSchema
>;

export const DiscoveryCoverageGapStatusSchema = z.enum([
  "not_applicable",
  "reconciled",
  "invalidated",
  "unproven"
]);
export type DiscoveryCoverageGapStatus = z.infer<
  typeof DiscoveryCoverageGapStatusSchema
>;

export const DiscoveryCoverageConnectionEventSchema = z.object({
  schemaVersion: DiscoveryCoverageSchemaVersionSchema,
  connectionEventId: z.string().min(1),
  sessionId: z.string().min(1),
  eventType: DiscoveryCoverageConnectionEventTypeSchema,
  connectionId: z.string().min(1),
  attemptedAt: z.string().datetime().nullable(),
  connectedAt: z.string().datetime().nullable(),
  disconnectedAt: z.string().datetime().nullable(),
  disconnectedDurationMs: z.number().nonnegative().nullable(),
  reconnectAttempt: z.number().int().nonnegative(),
  replayAttempted: z.boolean(),
  replayResult: z.string().min(1).nullable(),
  gapStatus: DiscoveryCoverageGapStatusSchema,
  safeReason: z.string().min(1).nullable(),
  adjacentCorrelationId: z.string().min(1).nullable(),
  createdAt: z.string().datetime()
});
export type DiscoveryCoverageConnectionEvent = z.infer<
  typeof DiscoveryCoverageConnectionEventSchema
>;

export const DiscoveryCoverageSessionSchema = z.object({
  schemaVersion: DiscoveryCoverageSchemaVersionSchema,
  sessionId: z.string().min(1),
  provider: z.string().min(1),
  sourceMode: z.string().min(1),
  startedAt: z.string().datetime(),
  stoppedAt: z.string().datetime().nullable(),
  stopReason: z.string().min(1).nullable(),
  observationDurationMs: z.number().nonnegative(),
  connectionCount: z.number().int().nonnegative(),
  reconnectAttemptCount: z.number().int().nonnegative(),
  reconnectSuccessCount: z.number().int().nonnegative(),
  disconnectedDurationMs: z.number().nonnegative(),
  rawFrameCount: z.number().int().nonnegative(),
  parsedFrameCount: z.number().int().nonnegative(),
  parseFailureCount: z.number().int().nonnegative(),
  recognizedCreateCount: z.number().int().nonnegative(),
  recognizedMigrationCount: z.number().int().nonnegative(),
  recognizedNonDiscoveryCount: z.number().int().nonnegative(),
  unknownPayloadCount: z.number().int().nonnegative(),
  normalizationSuccessCount: z.number().int().nonnegative(),
  normalizationRejectCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  queueAcceptedCount: z.number().int().nonnegative(),
  queueCommittedCount: z.number().int().nonnegative(),
  queueFailureCount: z.number().int().nonnegative(),
  pipelineCompletedCount: z.number().int().nonnegative(),
  pipelineFailedOrDroppedCount: z.number().int().nonnegative(),
  identityCreatedCount: z.number().int().nonnegative(),
  identityUpdatedCount: z.number().int().nonnegative(),
  liveTokenCreatedCount: z.number().int().nonnegative(),
  liveTokenUpdatedCount: z.number().int().nonnegative(),
  candidateCreatedCount: z.number().int().nonnegative(),
  candidateUpdatedCount: z.number().int().nonnegative(),
  scoreProducedCount: z.number().int().nonnegative(),
  persistenceCompletedCount: z.number().int().nonnegative(),
  scannerProjectedCount: z.number().int().nonnegative(),
  broadcastAttemptedCount: z.number().int().nonnegative(),
  broadcastCompletedCount: z.number().int().nonnegative(),
  telemetryFailureCount: z.number().int().nonnegative(),
  latencyDistributions: z.record(
    DiscoveryCoverageLatencyKeySchema,
    DiscoveryCoverageLatencyDistributionSchema
  ),
  reconciliation: z.object({
    equations: z.array(DiscoveryCoverageEquationSchema),
    maximumAbsoluteResidual: z.number().int().nonnegative()
  }),
  localReconciliationStatus: DiscoveryCoverageStatusSchema,
  upstreamCoverageStatus: DiscoveryCoverageStatusSchema,
  reasonCodes: z.array(z.string().min(1)),
  updatedAt: z.string().datetime(),
  paperOnly: z.literal(true),
  paidStreamsActive: z.literal(false),
  liveTradingEnabled: z.literal(false)
});
export type DiscoveryCoverageSession = z.infer<
  typeof DiscoveryCoverageSessionSchema
>;

export const DiscoveryCoverageEventQuerySchema = z.object({
  sessionId: z.string().min(1).optional(),
  eventType: DiscoveryCoverageEventTypeSchema.optional(),
  parserOutcome: DiscoveryCoverageParserOutcomeSchema.optional(),
  pipelineOutcome: DiscoveryCoveragePipelineOutcomeSchema.optional(),
  mint: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0)
});
export type DiscoveryCoverageEventQuery = z.infer<
  typeof DiscoveryCoverageEventQuerySchema
>;

export const discoveryCoverageLatencyKeys =
  DiscoveryCoverageLatencyKeySchema.options;
