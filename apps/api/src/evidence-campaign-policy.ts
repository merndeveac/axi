export const evidenceCampaignMaximumBudgetSol = 0.25;
export const evidenceCampaignMinimumWalletReserveSol = 0.02;
export const evidenceCampaignMaximumSubsessionCostSol = 0.001;
export const evidenceCampaignDefaultTrainRatio = 0.6;

export type EvidenceCampaignBudgetPlan = {
  requestedBudgetSol: number;
  effectiveBudgetSol: number;
  initialBalanceSol: number;
  minimumWalletReserveSol: number;
  trainSpendTargetSol: number;
  validationSpendTargetSol: number;
  outcomeTailReserveSol: number;
  limitedByWalletReserve: boolean;
  reasonCodes: string[];
};

export type EvidenceCampaignSubsessionPlan = {
  costCapSol: number;
  eventCap: number;
  estimatedCostPerEventSol: number;
};

export function createEvidenceCampaignBudgetPlan(input: {
  requestedBudgetSol: number;
  initialBalanceSol: number;
  eventCostSolPer10000: number;
  minimumWalletReserveSol?: number;
  trainRatio?: number;
}): EvidenceCampaignBudgetPlan {
  const requestedBudgetSol = positiveFinite(
    input.requestedBudgetSol,
    "requested campaign budget"
  );
  const initialBalanceSol = nonnegativeFinite(
    input.initialBalanceSol,
    "initial data-wallet balance"
  );
  const eventCostSolPer10000 = positiveFinite(
    input.eventCostSolPer10000,
    "event cost per 10,000"
  );
  const minimumWalletReserveSol = nonnegativeFinite(
    input.minimumWalletReserveSol ?? evidenceCampaignMinimumWalletReserveSol,
    "minimum wallet reserve"
  );
  const trainRatio = ratio(
    input.trainRatio ?? evidenceCampaignDefaultTrainRatio,
    "training spend ratio"
  );

  if (requestedBudgetSol > evidenceCampaignMaximumBudgetSol) {
    throw new Error(
      `Evidence campaign budget cannot exceed ${evidenceCampaignMaximumBudgetSol} SOL.`
    );
  }

  const estimatedCostPerEventSol = eventCostSolPer10000 / 10_000;
  const walletSpendableSol = Math.max(
    0,
    initialBalanceSol - minimumWalletReserveSol - estimatedCostPerEventSol
  );
  const effectiveBudgetSol = floorToIncrement(
    Math.min(requestedBudgetSol, walletSpendableSol),
    estimatedCostPerEventSol
  );

  if (effectiveBudgetSol < estimatedCostPerEventSol) {
    throw new Error(
      "The data wallet has no spendable event budget above its required reserve."
    );
  }

  const outcomeTailReserveSol = floorToIncrement(
    Math.min(
      evidenceCampaignMaximumSubsessionCostSol,
      effectiveBudgetSol * 0.05
    ),
    estimatedCostPerEventSol
  );
  const evidenceSpendSol = Math.max(
    estimatedCostPerEventSol,
    effectiveBudgetSol - outcomeTailReserveSol
  );
  const trainSpendTargetSol = floorToIncrement(
    evidenceSpendSol * trainRatio,
    estimatedCostPerEventSol
  );
  const validationSpendTargetSol = roundSol(
    evidenceSpendSol - trainSpendTargetSol
  );
  const limitedByWalletReserve =
    effectiveBudgetSol + estimatedCostPerEventSol < requestedBudgetSol;

  return {
    requestedBudgetSol: roundSol(requestedBudgetSol),
    effectiveBudgetSol,
    initialBalanceSol: roundSol(initialBalanceSol),
    minimumWalletReserveSol: roundSol(minimumWalletReserveSol),
    trainSpendTargetSol,
    validationSpendTargetSol,
    outcomeTailReserveSol,
    limitedByWalletReserve,
    reasonCodes: [
      "EVIDENCE_CAMPAIGN_PAPER_ONLY",
      "EVIDENCE_CAMPAIGN_LIVE_EXECUTION_DISABLED",
      "EVIDENCE_CAMPAIGN_WALLET_RESERVE_ENFORCED",
      "EVIDENCE_CAMPAIGN_BOUNDED_SUBSESSIONS",
      ...(limitedByWalletReserve
        ? ["EVIDENCE_CAMPAIGN_BUDGET_LIMITED_BY_WALLET_RESERVE"]
        : [])
    ]
  };
}

export function createEvidenceCampaignSubsessionPlan(input: {
  remainingBudgetSol: number;
  configuredCostCapSol: number;
  configuredEventCap: number;
  eventCostSolPer10000: number;
}): EvidenceCampaignSubsessionPlan {
  const remainingBudgetSol = nonnegativeFinite(
    input.remainingBudgetSol,
    "remaining campaign budget"
  );
  const configuredCostCapSol = positiveFinite(
    input.configuredCostCapSol,
    "configured session cost cap"
  );
  const configuredEventCap = positiveInteger(
    input.configuredEventCap,
    "configured session event cap"
  );
  const estimatedCostPerEventSol =
    positiveFinite(input.eventCostSolPer10000, "event cost per 10,000") /
    10_000;
  const requestedCap = Math.min(
    remainingBudgetSol,
    configuredCostCapSol,
    evidenceCampaignMaximumSubsessionCostSol
  );
  const eventCap = Math.min(
    configuredEventCap,
    Math.floor((requestedCap + Number.EPSILON) / estimatedCostPerEventSol)
  );

  if (eventCap < 1) {
    throw new Error("No metered events remain in the campaign budget.");
  }

  return {
    costCapSol: roundSol(eventCap * estimatedCostPerEventSol),
    eventCap,
    estimatedCostPerEventSol: roundSol(estimatedCostPerEventSol)
  };
}

export function createEvidenceCampaignRequestInit(
  init: RequestInit = {}
): RequestInit {
  const hasBody = init.body !== undefined && init.body !== null;
  return {
    ...init,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  };
}

function floorToIncrement(value: number, increment: number): number {
  return roundSol(Math.floor((value + Number.EPSILON) / increment) * increment);
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
}

function nonnegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative finite number.`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function ratio(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new Error(`${label} must be between zero and one.`);
  }
  return value;
}

function roundSol(value: number): number {
  return Number(value.toFixed(12));
}
