export type LightningAction = "buy" | "sell";

export type LightningTradeRequest = {
  action: LightningAction;
  mint: string;
  amount: number;
  denominatedInSol: boolean;
  slippage: number;
  priorityFee: number;
  pool: string;
  skipPreflight: boolean;
  jitoOnly: boolean;
};

export type LightningSafetySeverity = "info" | "warning" | "blocker";

export type LightningSafetyCheck = {
  code: string;
  passed: boolean;
  severity: LightningSafetySeverity;
  message: string;
  value?: string | number | boolean | null;
  limit?: string | number | boolean | null;
};

export type LightningTradePlanMode =
  | "dry_run"
  | "disabled"
  | "manual_ready"
  | "live_blocked";

export type LightningTradePlan = {
  id: string;
  mode: LightningTradePlanMode;
  request: LightningTradeRequest;
  mint: string;
  amountSol: number;
  maxBuySol: number;
  estimatedRisk: string;
  safetyChecks: LightningSafetyCheck[];
  blocked: boolean;
  blockers: string[];
  warnings: string[];
  createdAt: string;
};

export type LightningLimits = {
  maxBuySol: number;
  maxDailySol: number;
  maxOpenPositions: number;
  maxSlippagePct: number;
  priorityFeeSol: number;
  pool: string;
  skipPreflight: boolean;
  jitoOnly: boolean;
};

export type LightningReadiness = {
  enabled: boolean;
  liveTradingAllowed: boolean;
  manualArmRequired: boolean;
  manualArmed: boolean;
  dataWalletReady: boolean;
  tradingWalletReady: boolean;
  apiKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  balanceSol: number | null;
  limits: LightningLimits;
  reasonCodes: string[];
};

export type LightningTradeRequestInput = {
  action: LightningAction;
  mint: string;
  amount: number;
  denominatedInSol?: boolean;
  slippage?: number;
  priorityFee?: number;
  pool?: string;
  skipPreflight?: boolean;
  jitoOnly?: boolean;
};

export type LightningValidationLimits = Partial<LightningLimits> & {
  dailySpentSol?: number;
  openPositions?: number;
};

export type LightningTradePlanInput = {
  id?: string;
  mint: string;
  amountSol: number;
  limits: LightningLimits;
  action?: LightningAction;
  createdAt?: string;
  dailySpentSol?: number;
  openPositions?: number;
  estimatedRisk?: string;
  mode?: LightningTradePlanMode;
  extraSafetyChecks?: LightningSafetyCheck[];
};

export type LightningClientRefusal = {
  ok: false;
  executed: false;
  status: "refused";
  reasonCodes: string[];
  message: string;
  paperOnly: true;
  endpointCalled: false;
};

export type DisabledLightningClient = {
  executeTrade: (
    request: LightningTradeRequest
  ) => Promise<LightningClientRefusal>;
};

export type PumpPortalLightningClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  allowLiveTrading?: boolean;
};

const defaultLimits: LightningLimits = {
  maxBuySol: 0.005,
  maxDailySol: 0.02,
  maxOpenPositions: 1,
  maxSlippagePct: 10,
  priorityFeeSol: 0.00005,
  pool: "auto",
  skipPreflight: false,
  jitoOnly: false
};

export function createLightningTradeRequest(
  input: LightningTradeRequestInput
): LightningTradeRequest {
  return {
    action: input.action,
    mint: input.mint.trim(),
    amount: input.amount,
    denominatedInSol:
      input.denominatedInSol ?? (input.action === "buy" ? true : false),
    slippage: input.slippage ?? defaultLimits.maxSlippagePct,
    priorityFee: input.priorityFee ?? defaultLimits.priorityFeeSol,
    pool: input.pool ?? defaultLimits.pool,
    skipPreflight: input.skipPreflight ?? defaultLimits.skipPreflight,
    jitoOnly: input.jitoOnly ?? defaultLimits.jitoOnly
  };
}

export function validateLightningTradeRequest(
  request: LightningTradeRequest,
  limits: LightningValidationLimits = {}
): LightningSafetyCheck[] {
  const effectiveLimits = {
    ...defaultLimits,
    ...limits
  };
  const dailySpentSol = limits.dailySpentSol ?? 0;
  const openPositions = limits.openPositions ?? 0;
  const checks: LightningSafetyCheck[] = [
    {
      code: "LIGHTNING_REQUEST_AMOUNT_POSITIVE",
      passed: Number.isFinite(request.amount) && request.amount > 0,
      severity: "blocker",
      message: "Lightning request amount must be positive.",
      value: request.amount
    },
    {
      code: "LIGHTNING_AMOUNT_EXCEEDS_MAX_BUY",
      passed:
        request.action !== "buy" ||
        (request.denominatedInSol && request.amount <= effectiveLimits.maxBuySol),
      severity: "blocker",
      message: "Buy amount must stay within the configured dry-run cap.",
      value: request.amount,
      limit: effectiveLimits.maxBuySol
    },
    {
      code: "LIGHTNING_DAILY_LIMIT_EXCEEDED",
      passed:
        request.action !== "buy" ||
        dailySpentSol + request.amount <= effectiveLimits.maxDailySol,
      severity: "blocker",
      message: "Dry-run buy amount must stay within the daily SOL cap.",
      value: dailySpentSol + request.amount,
      limit: effectiveLimits.maxDailySol
    },
    {
      code: "LIGHTNING_OPEN_POSITION_LIMIT_EXCEEDED",
      passed:
        request.action !== "buy" ||
        openPositions < effectiveLimits.maxOpenPositions,
      severity: "blocker",
      message: "Dry-run buy plan exceeds the configured open-position cap.",
      value: openPositions,
      limit: effectiveLimits.maxOpenPositions
    },
    {
      code: "LIGHTNING_SLIPPAGE_TOO_HIGH",
      passed: request.slippage <= effectiveLimits.maxSlippagePct,
      severity: "blocker",
      message: "Lightning slippage must stay within the configured cap.",
      value: request.slippage,
      limit: effectiveLimits.maxSlippagePct
    },
    {
      code: "LIGHTNING_ENDPOINT_NOT_CALLED",
      passed: true,
      severity: "info",
      message: "This package built a request model only; no endpoint was called."
    }
  ];

  const hasBlockers = checks.some(
    (check) => !check.passed && check.severity === "blocker"
  );

  checks.push({
    code: hasBlockers ? "LIGHTNING_REQUEST_BLOCKED" : "LIGHTNING_REQUEST_VALID",
    passed: !hasBlockers,
    severity: hasBlockers ? "blocker" : "info",
    message: hasBlockers
      ? "Lightning request is blocked by safety validation."
      : "Lightning request is valid for dry-run planning."
  });

  return checks;
}

export function createLightningBuyPlan(
  input: LightningTradePlanInput
): LightningTradePlan {
  return createLightningPlan({
    ...input,
    action: "buy"
  });
}

export function createLightningSellPlan(
  input: LightningTradePlanInput
): LightningTradePlan {
  return createLightningPlan({
    ...input,
    action: "sell"
  });
}

export function calculateMaxAllowedBuy(input: {
  maxBuySol: number;
  maxDailySol: number;
  dailySpentSol?: number;
}): number {
  const remainingDailySol = Math.max(
    0,
    input.maxDailySol - (input.dailySpentSol ?? 0)
  );

  return Math.max(0, Math.min(input.maxBuySol, remainingDailySol));
}

export function sanitizeLightningConfig<T extends Record<string, unknown>>(
  config: T
): Omit<T, "apiKey"> & {
  apiKeyConfigured: boolean;
  maskedApiKey: string | null;
} {
  const apiKey =
    typeof config.apiKey === "string" && config.apiKey.length > 0
      ? config.apiKey
      : undefined;
  const { apiKey: _apiKey, ...safeConfig } = config;
  void _apiKey;

  return {
    ...safeConfig,
    apiKeyConfigured: Boolean(apiKey),
    maskedApiKey: maskApiKey(apiKey)
  };
}

export function maskApiKey(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return "****";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function buildLightningEndpointUrl(
  baseUrl: string,
  apiKey: string | undefined
): string {
  const url = new URL(baseUrl);

  if (apiKey) {
    url.searchParams.set("api-key", apiKey);
  }

  return url.toString();
}

export function createDisabledLightningClient(): DisabledLightningClient {
  return {
    executeTrade: async () => createExecutionRefusal()
  };
}

export function createPumpPortalLightningClient(
  options: PumpPortalLightningClientOptions = {}
): DisabledLightningClient {
  void options;
  return createDisabledLightningClient();
}

function createLightningPlan(
  input: LightningTradePlanInput & { action: LightningAction }
): LightningTradePlan {
  const request = createLightningTradeRequest({
    action: input.action,
    mint: input.mint,
    amount: input.amountSol,
    denominatedInSol: input.action === "buy",
    slippage: input.limits.maxSlippagePct,
    priorityFee: input.limits.priorityFeeSol,
    pool: input.limits.pool,
    skipPreflight: input.limits.skipPreflight,
    jitoOnly: input.limits.jitoOnly
  });
  const safetyChecks = [
    ...validateLightningTradeRequest(
      request,
      createValidationLimits(input)
    ),
    ...(input.extraSafetyChecks ?? [])
  ];
  const blockers = safetyChecks
    .filter((check) => !check.passed && check.severity === "blocker")
    .map((check) => check.code);
  const warnings = safetyChecks
    .filter((check) => !check.passed && check.severity === "warning")
    .map((check) => check.code);

  return {
    id: input.id ?? createPlanId(),
    mode: input.mode ?? "dry_run",
    request,
    mint: request.mint,
    amountSol: input.amountSol,
    maxBuySol: input.limits.maxBuySol,
    estimatedRisk: input.estimatedRisk ?? "unknown",
    safetyChecks,
    blocked: blockers.length > 0,
    blockers,
    warnings,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function createValidationLimits(
  input: LightningTradePlanInput
): LightningValidationLimits {
  return {
    ...input.limits,
    ...(input.dailySpentSol !== undefined
      ? { dailySpentSol: input.dailySpentSol }
      : {}),
    ...(input.openPositions !== undefined
      ? { openPositions: input.openPositions }
      : {})
  };
}

function createPlanId(): string {
  return `lightning_plan_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function createExecutionRefusal(): LightningClientRefusal {
  return {
    ok: false,
    executed: false,
    status: "refused",
    reasonCodes: [
      "LIGHTNING_EXECUTION_DISABLED",
      "LIGHTNING_LIVE_TRADING_DISABLED",
      "LIGHTNING_ENDPOINT_NOT_CALLED"
    ],
    message:
      "PumpPortal Lightning execution is disabled in this readiness-only build.",
    paperOnly: true,
    endpointCalled: false
  };
}
