import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  discoveryCoverageLatencyKeys,
  type DiscoveryCoverageSession
} from "@axi/shared";
import {
  DiscoveryCoveragePanel,
  coverageValue,
  latencyPercentiles,
  loadDiscoveryCoverage,
  type DiscoveryCoveragePanelState
} from "./DiscoveryCoveragePanel";

describe("DiscoveryCoveragePanel", () => {
  it("renders loading and empty values without converting unknown to zero", () => {
    const html = render({ status: "loading", session: null, error: null });
    expect(html).toContain("LOADING");
    expect(html).toContain("—");
    expect(coverageValue(undefined)).toBe("—");
  });

  it("renders local reconciliation pass and upstream unproven separately", () => {
    const html = render({
      status: "ready",
      session: makeSession(),
      error: null
    });
    expect(html).toContain("LOCALLY_RECONCILED");
    expect(html).toContain("UNPROVEN");
    expect(html).toContain("raw_parser_terminal: residual 0");
  });

  it("renders reconciliation failure and timing unavailability", () => {
    const session = makeSession({
      localReconciliationStatus: "LOCAL_RECONCILIATION_FAILED",
      reconciliation: {
        maximumAbsoluteResidual: 1,
        equations: [
          {
            name: "raw_parser_terminal",
            left: 2,
            right: 1,
            residual: 1,
            holds: false,
            expression: "raw = terminal parser outcomes"
          }
        ]
      }
    });
    const html = render({ status: "ready", session, error: null });
    expect(html).toContain("LOCAL_RECONCILIATION_FAILED");
    expect(html).toContain("residual 1");
    expect(latencyPercentiles(session, "provider_to_receive")).toBe("—");
  });

  it("isolates endpoint failure in the panel state", async () => {
    const state = await loadDiscoveryCoverage(async () => {
      throw new Error("offline");
    });
    expect(state).toEqual({
      status: "error",
      session: null,
      error: "Discovery coverage diagnostics unavailable"
    });
    expect(render(state)).toContain("ENDPOINT UNAVAILABLE");
  });
});

function render(state: DiscoveryCoveragePanelState): string {
  return renderToStaticMarkup(<DiscoveryCoveragePanel state={state} />);
}

function makeSession(
  overrides: Partial<DiscoveryCoverageSession> = {}
): DiscoveryCoverageSession {
  const unavailable = {
    availableCount: 0,
    unavailableCount: 1,
    min: null,
    p50: null,
    p95: null,
    p99: null,
    max: null
  };
  const latencyDistributions = Object.fromEntries(
    discoveryCoverageLatencyKeys.map((key) => [key, unavailable])
  ) as DiscoveryCoverageSession["latencyDistributions"];
  return {
    schemaVersion: "discovery-coverage-v1",
    sessionId: "session-1",
    provider: "pumpportal",
    sourceMode: "live",
    startedAt: "2026-08-02T00:00:00.000Z",
    stoppedAt: null,
    stopReason: null,
    observationDurationMs: 1_000,
    connectionCount: 1,
    reconnectAttemptCount: 0,
    reconnectSuccessCount: 0,
    disconnectedDurationMs: 0,
    rawFrameCount: 1,
    parsedFrameCount: 1,
    parseFailureCount: 0,
    recognizedCreateCount: 1,
    recognizedMigrationCount: 0,
    recognizedNonDiscoveryCount: 0,
    unknownPayloadCount: 0,
    normalizationSuccessCount: 1,
    normalizationRejectCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    queueAcceptedCount: 1,
    queueCommittedCount: 1,
    queueFailureCount: 0,
    pipelineCompletedCount: 1,
    pipelineFailedOrDroppedCount: 0,
    identityCreatedCount: 1,
    identityUpdatedCount: 0,
    liveTokenCreatedCount: 1,
    liveTokenUpdatedCount: 0,
    candidateCreatedCount: 1,
    candidateUpdatedCount: 0,
    scoreProducedCount: 1,
    persistenceCompletedCount: 1,
    scannerProjectedCount: 1,
    broadcastAttemptedCount: 1,
    broadcastCompletedCount: 1,
    telemetryFailureCount: 0,
    latencyDistributions,
    reconciliation: {
      maximumAbsoluteResidual: 0,
      equations: [
        {
          name: "raw_parser_terminal",
          left: 1,
          right: 1,
          residual: 0,
          holds: true,
          expression: "raw = terminal parser outcomes"
        }
      ]
    },
    localReconciliationStatus: "LOCALLY_RECONCILED",
    upstreamCoverageStatus: "UNPROVEN",
    reasonCodes: ["UPSTREAM_PROVIDER_COMPLETENESS_UNPROVEN"],
    updatedAt: "2026-08-02T00:00:01.000Z",
    paperOnly: true,
    paidStreamsActive: false,
    liveTradingEnabled: false,
    ...overrides
  };
}
