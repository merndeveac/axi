import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createEvidenceCampaignBudgetPlan,
  createEvidenceCampaignRequestInit,
  createEvidenceCampaignSubsessionPlan,
  evidenceCampaignMaximumBudgetSol,
  type EvidenceCampaignBudgetPlan
} from "./evidence-campaign-policy";
import { meteredSessionRolloverConfirmation } from "./metered-launch-data-service";

type CampaignPhase =
  | "training"
  | "training_outcome_tail"
  | "validation"
  | "validation_outcome_tail"
  | "completed"
  | "safety_stopped"
  | "failed";

type CampaignState = {
  schemaVersion: 1;
  campaignId: string;
  phase: CampaignPhase;
  plan: EvidenceCampaignBudgetPlan;
  apiBaseUrl: string;
  operator: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedSubsessionCostSol: number;
  currentSubsessionCostSol: number;
  currentSubsessionEventCount: number;
  subsessionCount: number;
  trainingSessionId: string | null;
  validationSessionId: string | null;
  outcomeTailUntil: string | null;
  lastWalletBalanceSol: number | null;
  strategyEvaluationId: string | null;
  strategyEvaluationStatus: string | null;
  lifecycleValidationId: string | null;
  lifecycleValidationStatus: string | null;
  stopReason: string | null;
  reasonCodes: string[];
};

type RuntimeStatus = {
  paperOnly: boolean;
  tradingDisabled: boolean;
  liveDiscovery: {
    connected: boolean;
    connecting: boolean;
    lastError: string | null;
    lastEventAt: string | null;
  };
  meteredPriceAction: {
    active: boolean;
    budgetReached: boolean;
    estimatedCostSol: number;
    eventCount: number;
    eventCostSolPer10000?: number;
    maxConcurrentMints: number;
    maxEventsPerSession: number;
    maxUiSessionCostSol: number;
    sessionCostCapSol: number;
    blockers: string[];
  };
  dataWallet: {
    apiKeyConfigured: boolean;
    publicKeyConfigured: boolean;
    balanceSol: number | null;
    balanceStatus: string;
  };
  safety: {
    accountTradesEnabled: boolean;
    lightningExecutionEnabled: boolean;
    localTransactionApiEnabled: boolean;
    privateKeysLoaded: boolean;
    liveTradingEnabled: boolean;
  };
};

type CaptureStatus = {
  active: boolean;
  activeSession: {
    sessionId: string;
    partition: "train" | "validation";
    config: {
      horizonMs: number;
      maxOutcomeLagMs: number;
    };
  } | null;
  observationCount: number;
  completedCount: number;
  pendingCount: number;
  unavailableCount: number;
};

type MaterializationSummary = {
  observationCount: number;
  completedCount: number;
  pendingCount: number;
  unavailableCount: number;
};

const defaultApiBaseUrl = "http://localhost:8787";
const defaultStatePath = ".data/evidence-campaign-v1.json";
const pollIntervalMs = 5_000;
const walletRefreshIntervalMs = 60_000;
const disconnectGraceMs = 30_000;

const args = parseArgs(process.argv.slice(2));
const apiBaseUrl = args.apiBaseUrl ?? defaultApiBaseUrl;
const requestedBudgetSol = args.budgetSol ?? evidenceCampaignMaximumBudgetSol;
const operator = args.operator ?? "local-operator";
const statePath = resolve(args.statePath ?? defaultStatePath);
const outputDirectory = resolve(
  args.outputDirectory ?? ".data/evidence-campaign"
);
let state: CampaignState | null = null;
let stopping = false;
let lastWalletRefreshAt = 0;
let disconnectedSince: number | null = null;
let lastProgressLogAt = 0;

process.on("SIGINT", () => void safetyStop("operator_sigint"));
process.on("SIGTERM", () => void safetyStop("operator_sigterm"));

void main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  await safetyStop(`campaign_error:${message}`, "failed");
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  if (args.resume) {
    state = loadState(statePath);
    assertResumable(state);
  } else {
    if (fileExists(statePath)) {
      const existing = loadState(statePath);
      if (!isTerminal(existing.phase)) {
        throw new Error(
          `Active campaign state already exists at ${statePath}; use --resume.`
        );
      }
    }
    state = await startCampaign();
  }

  log("campaign_started", {
    campaignId: state.campaignId,
    requestedBudgetSol: state.plan.requestedBudgetSol,
    effectiveBudgetSol: state.plan.effectiveBudgetSol,
    limitedByWalletReserve: state.plan.limitedByWalletReserve,
    phase: state.phase,
    statePath
  });

  while (!isTerminal(requireState().phase)) {
    await tick();
    await delay(pollIntervalMs);
  }
}

async function startCampaign(): Promise<CampaignState> {
  let runtime = await getRuntimeStatus();
  assertPaperOnly(runtime);

  if (!runtime.liveDiscovery.connected) {
    await requestJson("/runtime/live-discovery/start", { method: "POST" });
    runtime = await waitForConnectedFeed();
  }

  runtime = await refreshWallet();
  assertPaperOnly(runtime);
  if (
    runtime.meteredPriceAction.active ||
    runtime.meteredPriceAction.estimatedCostSol > 0 ||
    runtime.meteredPriceAction.eventCount > 0
  ) {
    throw new Error(
      "Metered data already has an active or non-empty runtime session; restart AXI before starting a new campaign."
    );
  }
  const balanceSol = runtime.dataWallet.balanceSol;
  if (balanceSol === null) {
    throw new Error(
      "Data-wallet balance is unavailable; campaign cannot start."
    );
  }

  const metered = await requestJson<{
    eventCostSolPer10000: number;
    maxEventsPerSession: number;
    maxSessionCostSol: number;
    maxUiSessionCostSol: number;
  }>("/metered-launch-data/status");
  const plan = createEvidenceCampaignBudgetPlan({
    requestedBudgetSol,
    initialBalanceSol: balanceSol,
    eventCostSolPer10000: metered.eventCostSolPer10000
  });
  const capture = await getCaptureStatus();
  if (capture.active) {
    throw new Error(
      `Calibration capture ${capture.activeSession?.sessionId ?? "unknown"} is already active.`
    );
  }

  const started = await requestJson<{
    session: {
      sessionId: string;
    };
  }>("/runtime/session-capture/start", {
    method: "POST",
    body: JSON.stringify({
      partition: "train",
      config: { maxObservationsPerSession: 100_000 }
    })
  });
  const initial: CampaignState = {
    schemaVersion: 1,
    campaignId: `evidence-${randomUUID()}`,
    phase: "training",
    plan,
    apiBaseUrl,
    operator,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    completedSubsessionCostSol: 0,
    currentSubsessionCostSol: 0,
    currentSubsessionEventCount: 0,
    subsessionCount: 1,
    trainingSessionId: started.session.sessionId,
    validationSessionId: null,
    outcomeTailUntil: null,
    lastWalletBalanceSol: balanceSol,
    strategyEvaluationId: null,
    strategyEvaluationStatus: null,
    lifecycleValidationId: null,
    lifecycleValidationStatus: null,
    stopReason: null,
    reasonCodes: plan.reasonCodes
  };
  state = initial;
  persistState();
  await startFirstSubsession(runtime, metered);
  return requireState();
}

async function tick(): Promise<void> {
  let runtime = await getRuntimeStatus();
  assertPaperOnly(runtime);
  enforceFeedHealth(runtime);

  if (Date.now() - lastWalletRefreshAt >= walletRefreshIntervalMs) {
    runtime = await refreshWallet();
    lastWalletRefreshAt = Date.now();
  }

  const current = requireState();
  current.currentSubsessionCostSol = roundSol(
    runtime.meteredPriceAction.estimatedCostSol
  );
  current.currentSubsessionEventCount = runtime.meteredPriceAction.eventCount;
  current.lastWalletBalanceSol = runtime.dataWallet.balanceSol;
  current.updatedAt = new Date().toISOString();
  enforceWalletReserve(runtime);
  persistState();

  const totalSpentSol = getTotalSpentSol(current);
  if (totalSpentSol >= current.plan.effectiveBudgetSol) {
    await completeCampaign("effective_budget_reached");
    return;
  }

  await updateCapturePhase(totalSpentSol);

  if (
    runtime.meteredPriceAction.budgetReached ||
    current.currentSubsessionCostSol >=
      runtime.meteredPriceAction.sessionCostCapSol ||
    current.currentSubsessionEventCount >=
      runtime.meteredPriceAction.maxEventsPerSession
  ) {
    await rolloverSubsession(runtime);
  } else if (
    !runtime.meteredPriceAction.active &&
    runtime.meteredPriceAction.blockers.length > 0
  ) {
    throw new Error(
      `Metered campaign stopped by runtime gates: ${runtime.meteredPriceAction.blockers.join(", ")}`
    );
  }

  if (Date.now() - lastProgressLogAt >= 30_000) {
    const capture = await getCaptureStatus();
    lastProgressLogAt = Date.now();
    log("campaign_progress", {
      campaignId: current.campaignId,
      phase: current.phase,
      spentSol: getTotalSpentSol(current),
      effectiveBudgetSol: current.plan.effectiveBudgetSol,
      subsessionCount: current.subsessionCount,
      eventCount: current.currentSubsessionEventCount,
      observations: capture.observationCount,
      completedOutcomes: capture.completedCount,
      pendingOutcomes: capture.pendingCount,
      walletBalanceSol: current.lastWalletBalanceSol
    });
  }
}

async function updateCapturePhase(totalSpentSol: number): Promise<void> {
  const current = requireState();

  if (
    current.phase === "training" &&
    totalSpentSol >= current.plan.trainSpendTargetSol
  ) {
    const stopped = await requestJson<{
      session: {
        config: { horizonMs: number; maxOutcomeLagMs: number };
        sessionId: string;
      } | null;
    }>("/runtime/session-capture/stop", {
      method: "POST",
      body: JSON.stringify({ reason: "training_budget_complete" })
    });
    if (!stopped.session) {
      throw new Error(
        "Training capture was not active at its evidence boundary."
      );
    }
    current.trainingSessionId = stopped.session.sessionId;
    current.phase = "training_outcome_tail";
    current.outcomeTailUntil = new Date(
      Date.now() +
        stopped.session.config.horizonMs +
        stopped.session.config.maxOutcomeLagMs +
        1_000
    ).toISOString();
    persistState();
    log("training_capture_stopped", {
      sessionId: current.trainingSessionId,
      outcomeTailUntil: current.outcomeTailUntil
    });
    return;
  }

  if (
    current.phase === "training_outcome_tail" &&
    current.outcomeTailUntil &&
    Date.now() >= Date.parse(current.outcomeTailUntil)
  ) {
    await materialize(current.trainingSessionId);
    const started = await requestJson<{
      session: { sessionId: string };
    }>("/runtime/session-capture/start", {
      method: "POST",
      body: JSON.stringify({
        partition: "validation",
        config: { maxObservationsPerSession: 100_000 }
      })
    });
    current.validationSessionId = started.session.sessionId;
    current.phase = "validation";
    current.outcomeTailUntil = null;
    persistState();
    log("validation_capture_started", {
      sessionId: current.validationSessionId
    });
    return;
  }

  const validationCaptureStopAt = roundSol(
    current.plan.effectiveBudgetSol - current.plan.outcomeTailReserveSol
  );
  if (
    current.phase === "validation" &&
    totalSpentSol >= validationCaptureStopAt
  ) {
    const stopped = await requestJson<{
      session: {
        config: { horizonMs: number; maxOutcomeLagMs: number };
        sessionId: string;
      } | null;
    }>("/runtime/session-capture/stop", {
      method: "POST",
      body: JSON.stringify({ reason: "validation_budget_complete" })
    });
    if (!stopped.session) {
      throw new Error(
        "Validation capture was not active at its evidence boundary."
      );
    }
    current.validationSessionId = stopped.session.sessionId;
    current.phase = "validation_outcome_tail";
    current.outcomeTailUntil = new Date(
      Date.now() +
        stopped.session.config.horizonMs +
        stopped.session.config.maxOutcomeLagMs +
        1_000
    ).toISOString();
    persistState();
    log("validation_capture_stopped", {
      sessionId: current.validationSessionId,
      outcomeTailUntil: current.outcomeTailUntil
    });
  }

  if (
    current.phase === "validation_outcome_tail" &&
    current.outcomeTailUntil &&
    Date.now() >= Date.parse(current.outcomeTailUntil)
  ) {
    await materialize(current.validationSessionId);
    current.outcomeTailUntil = null;
    persistState();
  }
}

async function startFirstSubsession(
  runtime: RuntimeStatus,
  metered: {
    eventCostSolPer10000: number;
    maxEventsPerSession: number;
    maxSessionCostSol: number;
    maxUiSessionCostSol: number;
  }
): Promise<void> {
  const current = requireState();
  const sub = createEvidenceCampaignSubsessionPlan({
    remainingBudgetSol: current.plan.effectiveBudgetSol,
    configuredCostCapSol: Math.min(
      metered.maxSessionCostSol,
      metered.maxUiSessionCostSol
    ),
    configuredEventCap: metered.maxEventsPerSession,
    eventCostSolPer10000: metered.eventCostSolPer10000
  });

  await requestJson("/runtime/metered-launch-data/ack-session", {
    method: "POST",
    body: JSON.stringify({
      ackCost: true,
      maxSessionCostSol: sub.costCapSol,
      maxConcurrentMints: runtime.meteredPriceAction.maxConcurrentMints,
      maxEventsPerSession: sub.eventCap
    })
  });
  await requestJson("/runtime/metered-launch-data/start", { method: "POST" });
}

async function rolloverSubsession(runtime: RuntimeStatus): Promise<void> {
  const current = requireState();
  await requestJson("/runtime/metered-launch-data/stop", { method: "POST" });
  current.completedSubsessionCostSol = roundSol(
    current.completedSubsessionCostSol + current.currentSubsessionCostSol
  );
  current.currentSubsessionCostSol = 0;
  current.currentSubsessionEventCount = 0;
  const remainingBudgetSol = roundSol(
    current.plan.effectiveBudgetSol - current.completedSubsessionCostSol
  );

  if (remainingBudgetSol <= 0) {
    persistState();
    await completeCampaign("effective_budget_reached");
    return;
  }

  const metered = await requestJson<{
    eventCostSolPer10000: number;
    maxEventsPerSession: number;
    maxSessionCostSol: number;
    maxUiSessionCostSol: number;
  }>("/metered-launch-data/status");
  const sub = createEvidenceCampaignSubsessionPlan({
    remainingBudgetSol,
    configuredCostCapSol: Math.min(
      metered.maxSessionCostSol,
      metered.maxUiSessionCostSol
    ),
    configuredEventCap: metered.maxEventsPerSession,
    eventCostSolPer10000: metered.eventCostSolPer10000
  });

  await requestJson("/runtime/metered-launch-data/rollover", {
    method: "POST",
    body: JSON.stringify({
      ackCost: true,
      confirmation: meteredSessionRolloverConfirmation,
      maxSessionCostSol: sub.costCapSol,
      maxConcurrentMints: runtime.meteredPriceAction.maxConcurrentMints,
      maxEventsPerSession: sub.eventCap,
      startAfterAck: true
    })
  });
  current.subsessionCount += 1;
  persistState();
  log("metered_subsession_rolled_over", {
    subsessionCount: current.subsessionCount,
    completedCostSol: current.completedSubsessionCostSol,
    remainingBudgetSol,
    nextCostCapSol: sub.costCapSol,
    nextEventCap: sub.eventCap
  });
}

async function completeCampaign(reason: string): Promise<void> {
  const current = requireState();
  if (isTerminal(current.phase)) {
    return;
  }

  await requestJson("/runtime/metered-launch-data/stop", { method: "POST" });
  current.completedSubsessionCostSol = roundSol(
    current.completedSubsessionCostSol + current.currentSubsessionCostSol
  );
  current.currentSubsessionCostSol = 0;
  current.currentSubsessionEventCount = 0;

  const capture = await getCaptureStatus();
  if (capture.active) {
    const stopped = await requestJson<{
      session: { partition: "train" | "validation"; sessionId: string } | null;
    }>("/runtime/session-capture/stop", {
      method: "POST",
      body: JSON.stringify({ reason })
    });
    if (stopped.session?.partition === "train") {
      current.trainingSessionId = stopped.session.sessionId;
    } else if (stopped.session?.partition === "validation") {
      current.validationSessionId = stopped.session.sessionId;
    }
  }

  await materialize(current.trainingSessionId);
  await materialize(current.validationSessionId);
  await evaluateEvidence();
  current.phase = "completed";
  current.completedAt = new Date().toISOString();
  current.stopReason = reason;
  current.updatedAt = current.completedAt;
  persistState();
  await exportEvidence();
  log("campaign_completed", {
    campaignId: current.campaignId,
    estimatedSpendSol: current.completedSubsessionCostSol,
    trainingSessionId: current.trainingSessionId,
    validationSessionId: current.validationSessionId,
    strategyEvaluationId: current.strategyEvaluationId,
    strategyEvaluationStatus: current.strategyEvaluationStatus,
    lifecycleValidationId: current.lifecycleValidationId,
    lifecycleValidationStatus: current.lifecycleValidationStatus,
    stopReason: reason
  });
}

async function evaluateEvidence(): Promise<void> {
  const current = requireState();
  if (!current.trainingSessionId || !current.validationSessionId) {
    current.reasonCodes.push("EVIDENCE_CAMPAIGN_PARTITION_MISSING");
    return;
  }

  try {
    const strategy = await requestJson<{
      evaluationId: string;
      status: string;
    }>("/runtime/paper-strategy-evaluation/evaluate", {
      method: "POST",
      body: JSON.stringify({
        captureSessionIds: [
          current.trainingSessionId,
          current.validationSessionId
        ]
      })
    });
    current.strategyEvaluationId = strategy.evaluationId;
    current.strategyEvaluationStatus = strategy.status;

    if (strategy.status === "paper_observation_candidate") {
      const lifecycle = await requestJson<{
        validationId: string;
        status: string;
      }>("/runtime/paper-lifecycle-validation/evaluate", {
        method: "POST",
        body: JSON.stringify({
          paperStrategyEvaluationId: strategy.evaluationId
        })
      });
      current.lifecycleValidationId = lifecycle.validationId;
      current.lifecycleValidationStatus = lifecycle.status;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    current.reasonCodes.push("EVIDENCE_CAMPAIGN_EVALUATION_FAILED");
    current.stopReason = message;
    log("campaign_evaluation_failed", { message });
  }
}

async function exportEvidence(): Promise<void> {
  const current = requireState();
  const campaignDirectory = resolve(outputDirectory, current.campaignId);
  mkdirSync(campaignDirectory, { recursive: true });

  for (const [partition, sessionId] of [
    ["train", current.trainingSessionId],
    ["validation", current.validationSessionId]
  ] as const) {
    if (!sessionId) continue;
    const body = await requestText(
      `/runtime/session-capture/sessions/${encodeURIComponent(sessionId)}/export?format=json`
    );
    writeFileSync(resolve(campaignDirectory, `${partition}.json`), body, {
      encoding: "utf8",
      mode: 0o600
    });
  }

  writeFileSync(
    resolve(campaignDirectory, "campaign.json"),
    `${JSON.stringify(current, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
}

async function materialize(
  sessionId: string | null
): Promise<MaterializationSummary | null> {
  if (!sessionId) return null;
  return requestJson(
    `/runtime/session-capture/sessions/${encodeURIComponent(sessionId)}/materialize`,
    { method: "POST", body: "{}" }
  );
}

async function safetyStop(
  reason: string,
  phase: "safety_stopped" | "failed" = "safety_stopped"
): Promise<void> {
  if (stopping) return;
  stopping = true;

  try {
    await requestJson("/runtime/metered-launch-data/stop", { method: "POST" });
  } catch {
    // The bounded server-side session remains the final fail-safe.
  }
  try {
    await requestJson("/runtime/session-capture/stop", {
      method: "POST",
      body: JSON.stringify({ reason })
    });
  } catch {
    // Preserve the original stop reason.
  }

  if (state) {
    state.phase = phase;
    state.completedAt = new Date().toISOString();
    state.stopReason = reason;
    state.updatedAt = state.completedAt;
    state.reasonCodes.push(
      phase === "failed"
        ? "EVIDENCE_CAMPAIGN_FAILED_CLOSED"
        : "EVIDENCE_CAMPAIGN_SAFETY_STOPPED"
    );
    persistState();
    log("campaign_stopped", {
      campaignId: state.campaignId,
      phase,
      estimatedSpendSol: getTotalSpentSol(state),
      reason
    });
  }
}

function assertPaperOnly(runtime: RuntimeStatus): void {
  const unsafe =
    runtime.paperOnly !== true ||
    runtime.tradingDisabled !== true ||
    runtime.safety.accountTradesEnabled ||
    runtime.safety.lightningExecutionEnabled ||
    runtime.safety.localTransactionApiEnabled ||
    runtime.safety.privateKeysLoaded ||
    runtime.safety.liveTradingEnabled;
  if (unsafe) {
    throw new Error("Runtime paper-only safety contract failed.");
  }
}

function enforceFeedHealth(runtime: RuntimeStatus): void {
  if (runtime.liveDiscovery.connected) {
    disconnectedSince = null;
    return;
  }
  disconnectedSince ??= Date.now();
  if (Date.now() - disconnectedSince >= disconnectGraceMs) {
    throw new Error(
      `Live discovery disconnected beyond grace period: ${runtime.liveDiscovery.lastError ?? "unknown error"}`
    );
  }
}

function enforceWalletReserve(runtime: RuntimeStatus): void {
  const current = requireState();
  const balance = runtime.dataWallet.balanceSol;
  if (balance === null) {
    throw new Error("Data-wallet balance became unavailable.");
  }
  if (balance <= current.plan.minimumWalletReserveSol) {
    throw new Error("Data-wallet minimum reserve reached.");
  }
}

async function waitForConnectedFeed(): Promise<RuntimeStatus> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const runtime = await getRuntimeStatus();
    if (runtime.liveDiscovery.connected) return runtime;
    await delay(1_000);
  }
  throw new Error("Live discovery did not connect within 60 seconds.");
}

async function getRuntimeStatus(): Promise<RuntimeStatus> {
  return requestJson("/runtime/status");
}

async function getCaptureStatus(): Promise<CaptureStatus> {
  return requestJson("/runtime/session-capture");
}

async function refreshWallet(): Promise<RuntimeStatus> {
  const result = await requestJson<{ status: RuntimeStatus }>(
    "/runtime/data-wallet/refresh",
    { method: "POST" }
  );
  return result.status;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl}${path}`,
    createEvidenceCampaignRequestInit(init)
  );
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `${response.status} ${response.statusText}`;
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${message}`);
  }
  return body as T;
}

async function requestText(path: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  return response.text();
}

function persistState(): void {
  const current = requireState();
  mkdirSync(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(current, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  renameSync(temporaryPath, statePath);
}

function loadState(path: string): CampaignState {
  return JSON.parse(readFileSync(path, "utf8")) as CampaignState;
}

function assertResumable(candidate: CampaignState): void {
  if (candidate.schemaVersion !== 1 || isTerminal(candidate.phase)) {
    throw new Error("Campaign state is not resumable.");
  }
  if (candidate.apiBaseUrl !== apiBaseUrl) {
    throw new Error("Campaign API base URL does not match the saved state.");
  }
}

function getTotalSpentSol(candidate: CampaignState): number {
  return roundSol(
    candidate.completedSubsessionCostSol + candidate.currentSubsessionCostSol
  );
}

function requireState(): CampaignState {
  if (!state) throw new Error("Campaign state has not been initialized.");
  return state;
}

function isTerminal(phase: CampaignPhase): boolean {
  return ["completed", "safety_stopped", "failed"].includes(phase);
}

function fileExists(path: string): boolean {
  try {
    readFileSync(path, { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

function parseArgs(values: string[]): {
  apiBaseUrl?: string;
  budgetSol?: number;
  operator?: string;
  outputDirectory?: string;
  resume: boolean;
  statePath?: string;
} {
  const parsed: {
    apiBaseUrl?: string;
    budgetSol?: number;
    operator?: string;
    outputDirectory?: string;
    resume: boolean;
    statePath?: string;
  } = { resume: false };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const next = values[index + 1];
    if (value === "--resume") {
      parsed.resume = true;
    } else if (value === "--api" && next) {
      parsed.apiBaseUrl = next;
      index += 1;
    } else if (value === "--budget-sol" && next) {
      parsed.budgetSol = Number(next);
      index += 1;
    } else if (value === "--operator" && next) {
      parsed.operator = next;
      index += 1;
    } else if (value === "--state" && next) {
      parsed.statePath = next;
      index += 1;
    } else if (value === "--output" && next) {
      parsed.outputDirectory = next;
      index += 1;
    }
  }

  return parsed;
}

function log(event: string, details: Record<string, unknown>): void {
  process.stdout.write(
    `${JSON.stringify({ at: new Date().toISOString(), event, ...details })}\n`
  );
}

function roundSol(value: number): number {
  return Number(value.toFixed(12));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
