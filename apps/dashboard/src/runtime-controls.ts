export type RuntimeApiStatus = "checking" | "connected" | "disconnected";

export type MeteredControlState =
  | "OFF"
  | "ARM_REQUIRED"
  | "BLOCKED"
  | "READY"
  | "STARTING"
  | "ACTIVE"
  | "STOPPED"
  | "STOPPING"
  | "BUDGET_REACHED"
  | "ERROR";

export type HeaderRuntimeStatusLike = {
  liveDiscovery?: {
    connected?: boolean;
    connecting?: boolean;
  };
  meteredLaunchData?: {
    active?: boolean;
    blocked?: boolean;
    enabled?: boolean;
    reasonCodes?: string[];
  };
  meteredPriceAction?: {
    state?: MeteredControlState;
    canStart?: boolean;
    enabled?: boolean;
    active?: boolean;
    acknowledgedCost?: boolean;
    blockers?: string[];
    warnings?: string[];
    reasonCodes?: string[];
  };
  dataWallet?: {
    apiKeyConfigured?: boolean;
    balanceSol?: number | null;
    balanceStatus?: string | null;
    publicKeyConfigured?: boolean;
    reasonCodes?: string[];
  };
};

export type MeteredLaunchDataStatusLike = {
  acknowledgedCost?: boolean;
  apiKeyConfigured?: boolean;
  budgetReached?: boolean;
  dataWalletBalanceSol?: number | null;
  dataWalletBalanceStatus?: string | null;
  dataWalletConfigured?: boolean;
  enabled?: boolean;
  liveDiscoveryActive?: boolean;
  ready?: boolean;
  reasonCodes?: string[];
};

export type MeteredControlView = {
  blockers: string[];
  buttonLabel: string;
  disabled: boolean;
  helper: string;
  state: MeteredControlState;
};

export function getMeteredControlView({
  apiStatus,
  meteredStatus,
  pendingAction,
  runtimeStatus
}: {
  apiStatus: RuntimeApiStatus;
  meteredStatus: MeteredLaunchDataStatusLike | null;
  pendingAction: string;
  runtimeStatus: HeaderRuntimeStatusLike | null;
}): MeteredControlView {
  const blockers = getMeteredRuntimeBlockers(runtimeStatus, meteredStatus);
  const normalizedPending = pendingAction.toLowerCase();

  if (apiStatus === "disconnected") {
    return {
      blockers: ["API offline"],
      buttonLabel: "API Offline",
      disabled: true,
      helper: "Run pnpm axi:doctor or pnpm axi:restart.",
      state: "ERROR"
    };
  }

  if (normalizedPending.includes("starting metered")) {
    return {
      blockers,
      buttonLabel: "Starting...",
      disabled: true,
      helper: "Requesting backend metered price-action start.",
      state: "STARTING"
    };
  }

  if (normalizedPending.includes("stopping metered")) {
    return {
      blockers,
      buttonLabel: "Stopping...",
      disabled: true,
      helper: "Requesting backend metered price-action stop.",
      state: "STOPPING"
    };
  }

  if (meteredStatus?.budgetReached) {
    return {
      blockers: unique(["budget reached", ...blockers]),
      buttonLabel: "Budget Reached",
      disabled: true,
      helper: "Session cost cap has been reached.",
      state: "BUDGET_REACHED"
    };
  }

  if (runtimeStatus?.meteredPriceAction?.state === "BUDGET_REACHED") {
    return {
      blockers: unique(["budget reached", ...blockers]),
      buttonLabel: "Budget Reached",
      disabled: true,
      helper: "Session cost cap has been reached.",
      state: "BUDGET_REACHED"
    };
  }

  if (runtimeStatus?.meteredPriceAction?.state === "ARM_REQUIRED") {
    return {
      blockers: unique(["ACK missing", ...blockers]),
      buttonLabel: "Start Metered",
      disabled: true,
      helper: "Arm this session before starting metered price action.",
      state: "ARM_REQUIRED"
    };
  }

  if (runtimeStatus?.meteredLaunchData?.active) {
    return {
      blockers,
      buttonLabel: "Metered Active",
      disabled: true,
      helper: "Use Stop Metered to pause price-action tracking.",
      state: "ACTIVE"
    };
  }

  if (runtimeStatus?.meteredPriceAction?.state === "ACTIVE") {
    return {
      blockers,
      buttonLabel: "Metered Active",
      disabled: true,
      helper: "Use Stop Metered to pause price-action tracking.",
      state: "ACTIVE"
    };
  }

  if (
    !meteredStatus?.enabled &&
    !runtimeStatus?.meteredLaunchData?.enabled &&
    !runtimeStatus?.meteredPriceAction?.enabled
  ) {
    return {
      blockers: unique(["metered disabled", ...blockers]),
      buttonLabel: "Metered Off",
      disabled: true,
      helper: "Launch with pnpm axi:restart:metered to enable the gated path.",
      state: "OFF"
    };
  }

  if (runtimeStatus?.meteredPriceAction?.canStart) {
    return {
      blockers,
      buttonLabel: "Start Metered",
      disabled: false,
      helper: "Ready to request backend metered price-action start.",
      state: runtimeStatus.meteredPriceAction.state ?? "READY"
    };
  }

  if (blockers.length > 0 || runtimeStatus?.meteredLaunchData?.blocked) {
    return {
      blockers,
      buttonLabel: `Blocked: ${blockers[0] ?? "gates"}`,
      disabled: true,
      helper: "Open diagnostics to see all gate blockers.",
      state: "BLOCKED"
    };
  }

  return {
    blockers,
    buttonLabel: "Start Metered",
    disabled: false,
    helper: "Ready to request backend metered price-action start.",
    state: "READY"
  };
}

export function getMeteredRuntimeBlockers(
  runtimeStatus: HeaderRuntimeStatusLike | null,
  meteredStatus: MeteredLaunchDataStatusLike | null
): string[] {
  const action = runtimeStatus?.meteredPriceAction;
  const explicitBlockers = (action?.blockers ?? []).map(toMeteredBlockerLabel);
  const runtimeCodes = runtimeStatus?.meteredLaunchData?.reasonCodes ?? [];
  const actionCodes = action?.reasonCodes ?? [];
  const meteredCodes = meteredStatus?.reasonCodes ?? [];
  const walletCodes = runtimeStatus?.dataWallet?.reasonCodes ?? [];
  const codes = [...explicitBlockers, ...actionCodes, ...runtimeCodes, ...meteredCodes, ...walletCodes];
  const blockers: string[] = [...explicitBlockers];
  const walletBalanceStatus =
    meteredStatus?.dataWalletBalanceStatus ??
    runtimeStatus?.dataWallet?.balanceStatus ??
    null;

  if (meteredStatus && !meteredStatus.acknowledgedCost) {
    blockers.push("ACK missing");
  }

  if (
    meteredStatus &&
    (meteredStatus.apiKeyConfigured === false ||
      codes.some((code) => code.includes("API_KEY")))
  ) {
    blockers.push("API key missing");
  }

  if (
    meteredStatus &&
    (meteredStatus.dataWalletConfigured === false ||
      runtimeStatus?.dataWallet?.publicKeyConfigured === false)
  ) {
    blockers.push("wallet missing");
  }

  if (walletBalanceStatus === "low" || walletBalanceStatus === "critical") {
    blockers.push("wallet low");
  }

  if (
    walletBalanceStatus === "unknown" ||
    codes.some((code) => code.includes("BALANCE_UNKNOWN"))
  ) {
    // Unknown balance is surfaced as a warning; a configured wallet is not missing.
  }

  if (meteredStatus?.budgetReached || codes.some(isBudgetCode)) {
    blockers.push("budget reached");
  }

  if (
    meteredStatus &&
    meteredStatus.liveDiscoveryActive === false &&
    !runtimeStatus?.liveDiscovery?.connected &&
    !runtimeStatus?.liveDiscovery?.connecting
  ) {
    blockers.push("live feed offline");
  }

  if (codes.some((code) => code.includes("ACK"))) {
    blockers.push("ACK missing");
  }

  if (
    codes.some(
      (code) =>
        code.includes("WALLET_NOT_READY") ||
        code.includes("WALLET_MISSING") ||
        code.includes("WALLET_INVALID")
    )
  ) {
    blockers.push("wallet missing");
  }

  if (
    codes.some(
      (code) =>
        code.includes("WALLET_LOW") ||
        code.includes("BALANCE_LOW") ||
        code.includes("BALANCE_CRITICAL") ||
        code.includes("FUNDS")
    )
  ) {
    blockers.push("wallet low");
  }

  if (codes.some((code) => code.includes("OFFLINE"))) {
    blockers.push("live feed offline");
  }

  return unique(blockers);
}

export function getWalletSetupText(
  runtimeStatus: HeaderRuntimeStatusLike | null
): string | null {
  if (runtimeStatus?.dataWallet?.publicKeyConfigured) {
    return null;
  }

  return "Run pnpm setup:pumpportal-data-env";
}

function isBudgetCode(code: string): boolean {
  return code.includes("BUDGET") || code.includes("CAP");
}

function toMeteredBlockerLabel(code: string): string {
  if (code.includes("ACK")) {
    return "ACK missing";
  }

  if (code.includes("API_KEY")) {
    return "API key missing";
  }

  if (code.includes("WALLET_LOW") || code.includes("FUNDS")) {
    return "wallet low";
  }

  if (code.includes("WALLET")) {
    return "wallet missing";
  }

  if (isBudgetCode(code)) {
    return "budget reached";
  }

  if (code.includes("OFFLINE") || code.includes("LIVE_DISCOVERY")) {
    return "live feed offline";
  }

  if (code.includes("DISABLED")) {
    return "metered disabled";
  }

  return code.toLowerCase().replaceAll("_", " ");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
