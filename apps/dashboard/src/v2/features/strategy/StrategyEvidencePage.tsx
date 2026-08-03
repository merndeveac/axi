import type { StrategyStatus } from "@axi/shared";
import { Download } from "lucide-react";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { ErrorState, LoadingState } from "../../components/primitives/States";
import { useEvidence } from "../../data/hooks/useEvidence";
import { useStrategyStatus } from "../../data/hooks/useStrategyStatus";
import "./strategy.css";

export type ForwardEvidenceStatus = {
  deploymentId: string | null;
  deploymentStatus: string | null;
  completedSessionCount: number;
  interruptedSessionCount: number;
  activeSessionCount: number;
  eligibleSessionIds: string[];
  evaluationCount: number;
  latestEvaluation: null | {
    evaluationId: string;
    evaluationVersion: string;
    evaluationStatus: string;
    evaluatedAt: string;
    cohortMetrics?: {
      closedTradeCount?: number;
      signalObservationCount?: number;
      totalNetPnlSol?: number;
      netReturnConfidenceLowerBoundPct?: number | null;
    };
    acceptanceGates?: Array<{ gate: string; passed: boolean; actual: unknown; required: string }>;
  };
  contract: {
    evaluationVersion: string;
    evidencePolicy: string;
    candidateMeaning: string;
    defaultConfig: Record<string, number>;
  };
  manualReviewRequired: true;
  automaticLivePromotion: false;
  automaticLiveExecution: false;
  paperOnly: true;
  tradingDisabled: true;
};

export function StrategyEvidencePage() {
  const strategy = useStrategyStatus();
  const evidence = useEvidence<ForwardEvidenceStatus>();
  if (strategy.isPending && !strategy.data) return <LoadingState label="Loading strategy policy" />;
  if (strategy.isError && !strategy.data) return <ErrorState title="Strategy policy unavailable" detail="Scanner and Runtime continue independently." onRetry={() => { void strategy.refetch(); }} />;
  return <StrategyEvidenceView strategy={strategy.data!} evidence={evidence.data ?? null} evidenceError={evidence.isError} />;
}

export function StrategyEvidenceView({ strategy, evidence, evidenceError = false }: { strategy: StrategyStatus; evidence: ForwardEvidenceStatus | null; evidenceError?: boolean }) {
  const evaluation = evidence?.latestEvaluation ?? null;
  function exportEvaluation() {
    if (!evaluation) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(evaluation, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${evaluation.evaluationId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="axi-v2-page axi-v2-strategy-page" aria-labelledby="strategy-title">
      <header className="axi-v2-page__heading"><div><h1 className="axi-v2-page-title" id="strategy-title">Strategy & Evidence</h1><p className="axi-v2-page-description">Readable policy, forward-session evidence, and manual-review boundaries.</p></div><div className="axi-v2-heading-badges"><Badge tone="warning">{strategy.policyStatus.replaceAll("_", " ")}</Badge><Badge tone="info">Calibrated: {String(strategy.calibrated)}</Badge></div></header>

      <section className="axi-v2-strategy-hero">
        <div><span className="axi-v2-eyebrow">Current strategy version</span><h2>{strategy.strategyVersion}</h2><p>{strategy.strategyName} is a read-only paper policy. Reference thresholds are not a promise of edge.</p></div>
        <Badge tone="danger">No live promotion</Badge>
      </section>

      <div className="axi-v2-strategy-grid">
        <StrategyPanel title="Policy thresholds">
          <PolicyRow label="Paper buy-ready score" value={strategy.thresholds.minScoreForPaperBuyReady} />
          <PolicyRow label="Watch score" value={strategy.thresholds.minScoreForWatch} />
          <PolicyRow label="Minimum samples" value={strategy.thresholds.minSampleCount} />
          <PolicyRow label="Critical risk blocks" value={yesNo(strategy.thresholds.criticalRiskBlocksBuyReady)} />
          <PolicyRow label="Hard reject blocks" value={yesNo(strategy.thresholds.hardRejectBlocksBuyReady)} />
          <PolicyRow label="Missing metrics block" value={yesNo(strategy.thresholds.insufficientMetricsBlocksBuyReady)} />
        </StrategyPanel>
        <StrategyPanel title="Scoring weights">
          {Object.entries(strategy.scoringWeights).map(([key, value]) => <PolicyRow key={key} label={humanize(key)} value={value} />)}
          <details className="axi-v2-strategy-details"><summary>Formula notes</summary>{strategy.formula.map((line) => <p key={line}>{line}</p>)}</details>
        </StrategyPanel>
        <StrategyPanel title="Paper policy">
          <div className="axi-v2-policy-badges"><Badge tone="info">Paper only</Badge><Badge tone="danger">Trading controls absent</Badge><Badge tone="warning">Manual review</Badge></div>
          <p>Signals can support paper entries only after backend sample, quality, momentum, and risk gates pass. No threshold automatically activates execution.</p>
          <ul>{strategy.safetyGates.filter((gate) => !gate.includes("PUMPPORTAL")).map((gate) => <li key={gate}>{humanize(gate)}</li>)}</ul>
        </StrategyPanel>
        <StrategyPanel title="Forward sessions" badge={<Badge>{evidence?.completedSessionCount ?? 0} complete</Badge>}>
          {evidenceError ? <p>Forward evidence is unavailable; strategy policy remains readable.</p> : <div className="axi-v2-evidence-stats"><PolicyRow label="Deployment" value={evidence?.deploymentId ?? "None"} /><PolicyRow label="Active sessions" value={evidence?.activeSessionCount ?? 0} /><PolicyRow label="Interrupted" value={evidence?.interruptedSessionCount ?? 0} /><PolicyRow label="Evaluations" value={evidence?.evaluationCount ?? 0} /></div>}
          <p>Policy: {humanize(evidence?.contract.evidencePolicy ?? "all completed same deployment forward sessions")}.</p>
        </StrategyPanel>
      </div>

      <section className="axi-v2-evaluation-panel">
        <header><div><span className="axi-v2-eyebrow">Cohort evaluation</span><h2>{evaluation ? evaluation.evaluationStatus.replaceAll("_", " ") : "No completed evaluation"}</h2></div>{evaluation ? <Button onClick={exportEvaluation}><Download size={14} aria-hidden="true" />Export evidence JSON</Button> : null}</header>
        {evaluation ? <><div className="axi-v2-evaluation-metrics"><PolicyMetric label="Closed trades" value={evaluation.cohortMetrics?.closedTradeCount ?? "—"} /><PolicyMetric label="Signal observations" value={evaluation.cohortMetrics?.signalObservationCount ?? "—"} /><PolicyMetric label="Net PnL SOL" value={evaluation.cohortMetrics?.totalNetPnlSol ?? "—"} /><PolicyMetric label="95% lower bound" value={evaluation.cohortMetrics?.netReturnConfidenceLowerBoundPct ?? "—"} /></div><div className="axi-v2-gate-list">{evaluation.acceptanceGates?.map((gate) => <div key={gate.gate}><Badge tone={gate.passed ? "positive" : "warning"}>{gate.passed ? "pass" : "not passed"}</Badge><span>{humanize(gate.gate)}</span><small>{String(gate.actual ?? "—")} / {gate.required}</small></div>)}</div></> : <p>Complete bounded paper-forward sessions before a cohort can be evaluated. Interrupted sessions are excluded and disclosed.</p>}
      </section>
    </section>
  );
}

function StrategyPanel({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) { return <section className="axi-v2-strategy-panel"><header><h2>{title}</h2>{badge}</header>{children}</section>; }
function PolicyRow({ label, value }: { label: string; value: string | number }) { return <div className="axi-v2-policy-row"><span>{label}</span><strong className="axi-v2-numeric">{value}</strong></div>; }
function PolicyMetric({ label, value }: { label: string; value: string | number }) { return <div><span>{label}</span><strong className="axi-v2-numeric">{value}</strong></div>; }
function yesNo(value: boolean) { return value ? "Yes" : "No"; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2"); }
