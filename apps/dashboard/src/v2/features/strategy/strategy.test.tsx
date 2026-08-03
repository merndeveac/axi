// @vitest-environment jsdom

import type { StrategyStatus } from "@axi/shared";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { StrategyEvidenceView, type ForwardEvidenceStatus } from "./StrategyEvidencePage";

afterEach(cleanup);

const strategy: StrategyStatus = {
  strategyName: "paper-momentum-risk-v1",
  strategyVersion: "paper-momentum-risk-v1",
  policyStatus: "REFERENCE_POLICY",
  calibrated: false,
  thresholds: { minScoreForPaperBuyReady: 75, minScoreForWatch: 45, minSampleCount: 8, criticalRiskBlocksBuyReady: true, hardRejectBlocksBuyReady: true, insufficientMetricsBlocksBuyReady: true },
  scoringWeights: { rollingMomentumWeight: 0.65, legacyMomentumWeight: 0.35, momentumMultiplier: 0.55, qualityMultiplier: 0.55, riskPenaltyMultiplier: 1 },
  safetyGates: ["PAPER_ONLY", "NO_TRADING_CONTROLS"],
  formula: ["total = bounded reference score"],
  paperOnly: true,
  reasonCodes: ["RAW_TECHNICAL_REASON_CODE_MUST_STAY_HIDDEN"]
};

const evidence: ForwardEvidenceStatus = {
  deploymentId: "paper-deployment-1",
  deploymentStatus: "paused",
  completedSessionCount: 5,
  interruptedSessionCount: 1,
  activeSessionCount: 0,
  eligibleSessionIds: ["session-1"],
  evaluationCount: 1,
  latestEvaluation: {
    evaluationId: "evaluation-1",
    evaluationVersion: "paper-forward-evaluation-v1",
    evaluationStatus: "insufficient_evidence",
    evaluatedAt: "2026-08-03T12:00:00.000Z",
    cohortMetrics: { closedTradeCount: 20, signalObservationCount: 80, totalNetPnlSol: 0.01, netReturnConfidenceLowerBoundPct: -0.2 },
    acceptanceGates: [{ gate: "minimum_closed_trades", passed: false, actual: 20, required: ">= 100" }]
  },
  contract: { evaluationVersion: "paper-forward-evaluation-v1", evidencePolicy: "all_completed_same_deployment_forward_sessions", candidateMeaning: "manual_review_only_no_activation", defaultConfig: {} },
  manualReviewRequired: true,
  automaticLivePromotion: false,
  automaticLiveExecution: false,
  paperOnly: true,
  tradingDisabled: true
};

describe("Strategy & Evidence", () => {
  it("shows reference policy, version, readable thresholds, and cohort evidence", () => {
    render(<StrategyEvidenceView strategy={strategy} evidence={evidence} />);
    expect(screen.getByText("REFERENCE POLICY")).toBeInTheDocument();
    expect(screen.getByText("Calibrated: false")).toBeInTheDocument();
    expect(screen.getAllByText("paper-momentum-risk-v1").length).toBeGreaterThan(0);
    expect(screen.getByText("Paper buy-ready score")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("minimum closed trades")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export evidence JSON" })).toBeInTheDocument();
  });

  it("does not put raw reason codes or execution controls in the main summary", () => {
    render(<StrategyEvidenceView strategy={strategy} evidence={evidence} />);
    expect(screen.queryByText("RAW_TECHNICAL_REASON_CODE_MUST_STAY_HIDDEN")).toBeNull();
    expect(screen.queryByRole("button", { name: /buy|sell|trade|execute|promote/i })).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
