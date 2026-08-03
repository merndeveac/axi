import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TradeDataCoverageSession } from "@axi/shared";
import {
  TradeDataCoveragePanel,
  loadTradeDataCoverage,
  tradeCoverageValue,
  tradeLatencyPercentiles,
  type TradeDataCoveragePanelState
} from "./TradeDataCoveragePanel";

describe("TradeDataCoveragePanel", () => {
  it("renders loading and unknown values as em dashes", () => {
    const html = render({ status: "loading", session: null, error: null });
    expect(html).toContain("LOADING");
    expect(html).toContain("—");
    expect(tradeCoverageValue(undefined)).toBe("—");
  });

  it("keeps local reconciliation separate from upstream completeness", () => {
    const session = makeSession();
    const html = render({ status: "ready", session, error: null });
    expect(html).toContain("TRADE_DATA_LOCALLY_RECONCILED");
    expect(html).toContain("UPSTREAM_TRADE_COMPLETENESS_UNPROVEN");
    expect(html).toContain("trade_frame_classification: residual 0");
    expect(html).toContain("0.000001 SOL");
  });

  it("renders timing unavailable without inventing zero", () => {
    expect(tradeLatencyPercentiles(makeSession(), "provider_to_receive")).toBe(
      "—"
    );
  });

  it("isolates endpoint errors from the rest of the dashboard", async () => {
    const state = await loadTradeDataCoverage(async () => {
      throw new Error("offline");
    });
    expect(state.status).toBe("error");
    expect(render(state)).toContain("ENDPOINT UNAVAILABLE");
    expect(render(state)).toContain(
      "Trade-data coverage diagnostics unavailable"
    );
  });
});

function render(state: TradeDataCoveragePanelState): string {
  return renderToStaticMarkup(<TradeDataCoveragePanel state={state} />);
}

function makeSession(): TradeDataCoverageSession {
  const unavailable = {
    availableCount: 0,
    unavailableCount: 1,
    min: null,
    p50: null,
    p95: null,
    p99: null,
    max: null
  };
  return {
    schemaVersion: "trade-data-coverage-v1",
    sessionId: "trade-session-1",
    provider: "pumpportal",
    sourceMode: "live",
    selectedMint: "11111111111111111111111111111111",
    startedAt: "2026-08-02T00:00:00.000Z",
    stoppedAt: "2026-08-02T00:00:05.000Z",
    stopReason: "MAX_EVENTS",
    subscriptionRequestedAt: "2026-08-02T00:00:00.000Z",
    subscriptionSentAt: "2026-08-02T00:00:00.010Z",
    subscriptionAcknowledgedAt: null,
    firstTradeAt: "2026-08-02T00:00:00.100Z",
    unsubscribeRequestedAt: "2026-08-02T00:00:04.000Z",
    unsubscribeSentAt: "2026-08-02T00:00:04.010Z",
    finalTradeAt: "2026-08-02T00:00:03.000Z",
    activeDurationMs: 4_010,
    observationDurationMs: 5_000,
    postStopGraceMs: 1_000,
    maxEvents: 50,
    maxRuntimeMs: 90_000,
    maxCostSol: 0.0001,
    rawFrameCount: 1,
    parsedFrameCount: 1,
    parseFailureCount: 0,
    recognizedTradeCount: 1,
    recognizedNonTradeCount: 0,
    unknownPayloadCount: 0,
    normalizationSuccessCount: 1,
    normalizationRejectCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    pipelineCompletedCount: 1,
    pipelineFailedOrDroppedCount: 0,
    queueAcceptedCount: 1,
    queueCommittedCount: 1,
    queueFailureCount: 0,
    persistenceCompletedCount: 1,
    timeseriesAcceptedCount: 1,
    timeseriesRejectedCount: 0,
    snapshotUpdatedCount: 1,
    rollingWindowsUpdatedCount: 1,
    derivativeUpdatedCount: 1,
    derivativeStrengthUpdatedCount: 1,
    signalUpdatedCount: 1,
    scannerProjectedCount: 1,
    broadcastCompletedCount: 1,
    postStopFrameCount: 0,
    postStopTradeCount: 0,
    unexpectedPostStopTradeCount: 0,
    usableTradeCount: 1,
    unusableTradeCount: 0,
    wrongMintFrameCount: 0,
    missingSignatureCount: 0,
    missingAmountCount: 0,
    consistencyMismatchCount: 0,
    oneSecondBucketCount: 1,
    completedOneSecondBucketCount: 1,
    validSampleCount: 1,
    firstDerivativeAvailable: false,
    secondDerivativeAvailable: false,
    telemetryFailureCount: 0,
    estimatedCostSol: 0.000001,
    estimatedCostPerEventSol: 0.000001,
    costIsEstimated: true,
    consistencySummary: { passed: 4, failed: 0, unavailable: 2 },
    latencyDistributions: {
      provider_to_receive: unavailable,
      receive_to_normalize: unavailable,
      normalize_to_persist: unavailable,
      persist_to_timeseries: unavailable,
      timeseries_to_scanner: unavailable,
      receive_to_scanner: unavailable,
      receive_to_pipeline_complete: unavailable
    },
    reconciliation: {
      maximumAbsoluteResidual: 0,
      equations: [
        {
          name: "trade_frame_classification",
          left: 1,
          right: 1,
          residual: 0,
          holds: true,
          expression: "raw = terminal parser outcomes"
        }
      ]
    },
    chainVerification: {
      enabled: false,
      maxSignatures: 5,
      sampledSignatures: 0,
      verified: 0,
      partial: 0,
      mismatch: 0,
      unavailable: 0
    },
    subscriptionLifecycle: [],
    localReconciliationStatus: "TRADE_DATA_LOCALLY_RECONCILED",
    upstreamCoverageStatus: "UPSTREAM_TRADE_COMPLETENESS_UNPROVEN",
    reasonCodes: ["PAPER_ONLY"],
    updatedAt: "2026-08-02T00:00:05.000Z",
    paperOnly: true,
    accountTradesActive: false,
    paperAutomationActive: false,
    lightningActive: false,
    signingActive: false,
    transactionSendingActive: false,
    liveTradingEnabled: false
  };
}
