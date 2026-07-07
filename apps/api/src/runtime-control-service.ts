import type {
  MeteredLaunchDataDecision,
  MeteredLaunchDataSessionAckInput,
  MeteredLaunchDataStatus
} from "./metered-launch-data-service";
import type { PumpPortalDataWalletStatus } from "./pumpportal-data-wallet-service";
import type {
  PumpPortalWalletStatus,
  PumpPortalWalletsStatus
} from "./pumpportal-wallets-service";

export type RuntimeControlFeedStatus = {
  connected: boolean;
  connecting: boolean;
  lastError: string | null;
  lastEventAt: string | null;
  migrationEventCount: number;
  newTokenEventCount: number;
  parseErrorCount: number;
  provider: string;
  reasonCodes: string[];
  subscriptions: string[];
};

export type RuntimeControlAction = "start" | "stop" | "restart";

type RuntimeBalanceStatus = "missing" | "unknown" | "critical" | "low" | "ok";

export type RuntimeMeteredPriceActionState =
  | "OFF"
  | "ARM_REQUIRED"
  | "READY"
  | "ACTIVE"
  | "STOPPED"
  | "BLOCKED"
  | "BUDGET_REACHED";

export type RuntimeControlStatus = {
  controlPlaneEnabled: boolean;
  localOnly: boolean;
  runtimeMode: string;
  paperOnly: true;
  tradingDisabled: true;
  runtime: {
    mode: string;
    paperOnly: true;
    tradingDisabled: true;
    startedAt: string;
    uptimeSeconds: number;
  };
  api: {
    online: true;
    wsOnline: true;
    pid: number;
    ports: number[];
    lastUpdatedAt: string;
  };
  liveDiscovery: {
    enabled: boolean;
    provider: string;
    connected: boolean;
    connecting: boolean;
    stopped: boolean;
    lastStartedAt: string | null;
    lastStoppedAt: string | null;
    lastEventAt: string | null;
    newTokenEventCount: number;
    migrationEventCount: number;
    errorCount: number;
    lastError: string | null;
    reasonCodes: string[];
  };
  meteredPriceAction: {
    state: RuntimeMeteredPriceActionState;
    enabled: boolean;
    controlsEnabled: boolean;
    capabilityConfigured: boolean;
    active: boolean;
    canArm: boolean;
    canStart: boolean;
    canStop: boolean;
    requiresAck: boolean;
    sessionAck: boolean;
    envAck: boolean;
    ackSource: "env" | "none" | "session";
    acknowledgedCost: boolean;
    provider: string;
    apiKeyConfigured: boolean;
    dataWalletPublicKeyConfigured: boolean;
    dataWalletBalanceStatus: RuntimeBalanceStatus;
    trackedMintCount: number;
    eventCount: number;
    estimatedCostSol: number;
    sessionCostCapSol: number;
    budgetRemainingSol: number;
    maxConcurrentMints: number;
    maxEventsPerSession: number;
    maxUiSessionCostSol: number;
    budgetReached: boolean;
    latestEventAt: string | null;
    blockers: string[];
    warnings: string[];
    reasonCodes: string[];
  };
  meteredLaunchData: {
    enabled: boolean;
    active: boolean;
    blocked: boolean;
    trackedMintCount: number;
    eventCount: number;
    estimatedCostSol: number;
    sessionCostCapSol: number;
    budgetRemainingSol: number;
    latestEventAt: string | null;
    reasonCodes: string[];
  };
  dataWallet: {
    publicKeyConfigured: boolean;
    publicKey: string | null;
    shortPublicKey: string | null;
    apiKeyConfigured: boolean;
    balanceSol: number | null;
    balanceStatus: string;
    estimatedEventsRemaining: number | null;
    lastBalanceCheckAt: string | null;
    reasonCodes: string[];
  };
  tradingWallet: {
    purpose: "future_lightning_execution";
    enabledReadiness: true;
    publicKeyConfigured: boolean;
    publicKey: string | null;
    shortPublicKey: string | null;
    apiKeyConfigured: boolean;
    balanceSol: number | null;
    balanceStatus: RuntimeBalanceStatus;
    lastBalanceCheckAt: string | null;
    reasonCodes: string[];
    sameAsDataWallet: boolean;
    liveTradingAllowed: false;
    manualArmed: false;
    warning: string;
  };
  usage: {
    meteredEventCount: number;
    estimatedCostSol: number;
    maxSessionCostSol: number;
    remainingBudgetSol: number;
    projectedCostPerHourSol: number;
    trackedMintCount: number;
  };
  safety: {
    accountTradesEnabled: false;
    lightningExecutionEnabled: false;
    localTransactionApiEnabled: false;
    privateKeysLoaded: false;
    liveTradingEnabled: false;
    reasonCodes: string[];
  };
  process: {
    pid: number;
    uptimeSeconds: number;
    ports: number[];
    startedAt: string;
  };
  reasonCodes: string[];
};

export type RuntimeControlResult = {
  action: RuntimeControlAction | "refresh" | "arm";
  ok: boolean;
  message: string;
  status: RuntimeControlStatus;
  decisions?: MeteredLaunchDataDecision[];
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

export type RuntimeControlDiagnostics = RuntimeControlStatus & {
  diagnostics: {
    localOnlyControls: true;
    accountTradesDisabled: true;
    lightningDisabled: true;
    noTransactions: true;
    noTrading: true;
    notes: string[];
  };
};

export type RuntimeControlServiceOptions = {
  getDataWalletStatus: () =>
    | PumpPortalDataWalletStatus
    | Promise<PumpPortalDataWalletStatus>;
  getFeedStatus: () => RuntimeControlFeedStatus;
  getMeteredLatestEventAt?: () => string | null;
  getMeteredLaunchDataStatus: () => MeteredLaunchDataStatus;
  getTradingWalletsStatus?: () =>
    | PumpPortalWalletsStatus
    | Promise<PumpPortalWalletsStatus>;
  ackMeteredLaunchDataSession?: (
    input: MeteredLaunchDataSessionAckInput
  ) => MeteredLaunchDataStatus | Promise<MeteredLaunchDataStatus>;
  clearMeteredLaunchDataSessionAck?: () =>
    | MeteredLaunchDataStatus
    | Promise<MeteredLaunchDataStatus>;
  ports?: number[];
  refreshDataWallet: () =>
    | PumpPortalDataWalletStatus
    | Promise<PumpPortalDataWalletStatus>;
  refreshTradingWallet?: () =>
    | PumpPortalWalletsStatus
    | Promise<PumpPortalWalletsStatus>;
  restartLiveDiscovery: () => void | Promise<void>;
  runtimeMode: string;
  startLiveDiscovery: () => void | Promise<void>;
  startMeteredLaunchData: () => void | Promise<void>;
  stopLiveDiscovery: () => void | Promise<void>;
  stopMeteredLaunchData: () => void | Promise<void>;
  trackCurrentMeteredCandidates?: (
    limit?: number
  ) => MeteredLaunchDataDecision[];
};

export type RuntimeControlService = {
  getDiagnostics: () => Promise<RuntimeControlDiagnostics>;
  getStatus: () => Promise<RuntimeControlStatus>;
  ackMeteredLaunchDataSession: (
    input: MeteredLaunchDataSessionAckInput
  ) => Promise<RuntimeControlResult>;
  clearMeteredLaunchDataSessionAck: () => Promise<RuntimeControlResult>;
  refreshDataWallet: () => Promise<RuntimeControlResult>;
  refreshTradingWallet: () => Promise<RuntimeControlResult>;
  restartLiveDiscovery: () => Promise<RuntimeControlResult>;
  restartMeteredLaunchData: () => Promise<RuntimeControlResult>;
  startLiveDiscovery: () => Promise<RuntimeControlResult>;
  startMeteredLaunchData: () => Promise<RuntimeControlResult>;
  stopLiveDiscovery: () => Promise<RuntimeControlResult>;
  stopMeteredLaunchData: () => Promise<RuntimeControlResult>;
};

const processStartedAt = new Date().toISOString();

export function createRuntimeControlService(
  options: RuntimeControlServiceOptions
): RuntimeControlService {
  let liveDiscoveryStoppedAt: string | null = null;
  let liveDiscoveryStartedAt: string | null = null;

  async function getStatus(): Promise<RuntimeControlStatus> {
    const [dataWallet, feed, metered, wallets] = await Promise.all([
      options.getDataWalletStatus(),
      options.getFeedStatus(),
      options.getMeteredLaunchDataStatus(),
      options.getTradingWalletsStatus?.() ?? Promise.resolve(null)
    ]);
    const now = new Date().toISOString();
    const liveStopped =
      !feed.connected &&
      !feed.connecting &&
      liveDiscoveryStoppedAt !== null;
    const latestMeteredEventAt = options.getMeteredLatestEventAt?.() ?? null;
    const meteredBlockers = mapMeteredBlockers(metered);
    const meteredWarnings = mapMeteredWarnings(metered, dataWallet);
    const meteredState = getMeteredPriceActionState(metered, meteredBlockers);
    const meteredBlocked = isMeteredBlocked(metered);
    const processStatus = {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      ports: options.ports ?? [8787, 5173],
      startedAt: processStartedAt
    };
    const tradingWallet = wallets?.tradingWallet ?? emptyTradingWallet();
    const sameAsDataWallet = Boolean(
      dataWallet.publicKey &&
        tradingWallet.publicKey &&
        dataWallet.publicKey === tradingWallet.publicKey
    );
    const reasonCodes = unique([
      "CONTROL_PLANE_ENABLED",
      "CONTROL_PLANE_LOCAL_ONLY",
      "TRADING_DISABLED",
      "LIGHTNING_DISABLED",
      "ACCOUNT_TRADES_DISABLED",
      ...(liveStopped ? ["LIVE_DISCOVERY_STOPPED"] : []),
      ...(feed.connected ? ["LIVE_DISCOVERY_STARTED"] : []),
      ...(meteredBlocked ? ["METERED_DATA_BLOCKED_BY_GATES"] : []),
      ...(metered.active && !meteredBlocked ? ["METERED_DATA_STARTED"] : [])
    ]);
    const safety: RuntimeControlStatus["safety"] = {
      accountTradesEnabled: false,
      lightningExecutionEnabled: false,
      localTransactionApiEnabled: false,
      privateKeysLoaded: false,
      liveTradingEnabled: false,
      reasonCodes: [
        "ACCOUNT_TRADES_DISABLED",
        "LIGHTNING_EXECUTION_DISABLED",
        "LOCAL_TRANSACTION_API_DISABLED",
        "PRIVATE_KEYS_NOT_LOADED",
        "LIVE_TRADING_DISABLED",
        "PAPER_ONLY"
      ]
    };

    return {
      controlPlaneEnabled: true,
      localOnly: true,
      runtimeMode: options.runtimeMode,
      paperOnly: true,
      tradingDisabled: true,
      runtime: {
        mode: options.runtimeMode,
        paperOnly: true,
        tradingDisabled: true,
        startedAt: processStartedAt,
        uptimeSeconds: processStatus.uptimeSeconds
      },
      api: {
        online: true,
        wsOnline: true,
        pid: process.pid,
        ports: processStatus.ports,
        lastUpdatedAt: now
      },
      liveDiscovery: {
        enabled: feed.provider === "pumpportal",
        provider: feed.provider,
        connected: feed.connected,
        connecting: feed.connecting,
        stopped: liveStopped,
        lastStartedAt: liveDiscoveryStartedAt ?? null,
        lastStoppedAt: liveDiscoveryStoppedAt,
        lastEventAt: feed.lastEventAt,
        newTokenEventCount: feed.newTokenEventCount,
        migrationEventCount: feed.migrationEventCount,
        errorCount: feed.parseErrorCount + (feed.lastError ? 1 : 0),
        lastError: feed.lastError,
        reasonCodes: unique([
          ...feed.reasonCodes,
          ...(liveStopped ? ["LIVE_DISCOVERY_STOPPED"] : [])
        ])
      },
      meteredPriceAction: {
        state: meteredState,
        enabled: metered.enabled,
        controlsEnabled: metered.controlsEnabled,
        capabilityConfigured: metered.capabilityConfigured,
        active: metered.active && meteredBlockers.length === 0,
        canArm: metered.canArm,
        canStart: metered.canStart && !metered.budgetReached,
        canStop: metered.canStop,
        requiresAck: metered.requireUiAck,
        sessionAck: metered.sessionAcknowledgedCost,
        envAck: metered.envAcknowledgedCost,
        ackSource: metered.ackSource,
        acknowledgedCost: metered.acknowledgedCost,
        provider: metered.provider,
        apiKeyConfigured: metered.apiKeyConfigured,
        dataWalletPublicKeyConfigured: metered.dataWalletConfigured,
        dataWalletBalanceStatus: normalizeBalanceStatus(
          metered.dataWalletBalanceStatus
        ),
        trackedMintCount: metered.trackedMintCount,
        eventCount: metered.totalEventsThisSession,
        estimatedCostSol: metered.estimatedCostSol,
        sessionCostCapSol: metered.maxSessionCostSol,
        budgetRemainingSol: metered.remainingBudgetSol,
        maxConcurrentMints: metered.maxConcurrentMints,
        maxEventsPerSession: metered.maxEventsPerSession,
        maxUiSessionCostSol: metered.maxUiSessionCostSol,
        budgetReached: metered.budgetReached,
        latestEventAt: latestMeteredEventAt,
        blockers: meteredBlockers,
        warnings: meteredWarnings,
        reasonCodes: unique([
          ...metered.reasonCodes,
          ...meteredBlockers,
          ...meteredWarnings
        ])
      },
      meteredLaunchData: {
        enabled: metered.enabled,
        active: metered.active && !meteredBlocked,
        blocked: meteredBlocked,
        trackedMintCount: metered.trackedMintCount,
        eventCount: metered.totalEventsThisSession,
        estimatedCostSol: metered.estimatedCostSol,
        sessionCostCapSol: metered.maxSessionCostSol,
        budgetRemainingSol: metered.remainingBudgetSol,
        latestEventAt: latestMeteredEventAt,
        reasonCodes: mapMeteredReasonCodes(metered.reasonCodes)
      },
      dataWallet: {
        publicKeyConfigured: dataWallet.publicKeyConfigured,
        publicKey: dataWallet.publicKey,
        shortPublicKey: dataWallet.shortPublicKey,
        apiKeyConfigured: dataWallet.apiKeyConfigured,
        balanceSol: dataWallet.balanceSol,
        balanceStatus: normalizeBalanceStatus(dataWallet.balanceStatus),
        estimatedEventsRemaining: dataWallet.estimatedEventsRemaining,
        lastBalanceCheckAt: dataWallet.lastBalanceCheckAt,
        reasonCodes: dataWallet.reasonCodes
      },
      tradingWallet: {
        purpose: "future_lightning_execution",
        enabledReadiness: true,
        publicKeyConfigured: tradingWallet.publicKeyConfigured,
        publicKey: tradingWallet.publicKey,
        shortPublicKey: tradingWallet.shortPublicKey,
        apiKeyConfigured: tradingWallet.apiKeyConfigured,
        balanceSol: tradingWallet.balanceSol,
        balanceStatus: normalizeBalanceStatus(tradingWallet.balanceStatus),
        lastBalanceCheckAt: tradingWallet.lastBalanceCheckAt,
        reasonCodes: tradingWallet.reasonCodes,
        sameAsDataWallet,
        liveTradingAllowed: false,
        manualArmed: false,
        warning: "READINESS ONLY - LIVE TRADING DISABLED"
      },
      usage: {
        meteredEventCount: metered.totalEventsThisSession,
        estimatedCostSol: metered.estimatedCostSol,
        maxSessionCostSol: metered.maxSessionCostSol,
        remainingBudgetSol: metered.remainingBudgetSol,
        projectedCostPerHourSol: metered.projectedCostPerHourSol,
        trackedMintCount: metered.trackedMintCount
      },
      safety,
      process: processStatus,
      reasonCodes
    };
  }

  async function getDiagnostics(): Promise<RuntimeControlDiagnostics> {
    return {
      ...(await getStatus()),
      diagnostics: {
        localOnlyControls: true,
        accountTradesDisabled: true,
        lightningDisabled: true,
        noTransactions: true,
        noTrading: true,
        notes: [
          "Runtime controls are local/dev only.",
          "Live discovery controls the PumpPortal discovery websocket.",
          "Metered launch data uses subscribeTokenTrade only after session ACK and backend gates pass.",
          "No endpoint signs transactions, sends transactions, or enables trading."
        ]
      }
    };
  }

  async function startLiveDiscovery(): Promise<RuntimeControlResult> {
    const before = options.getFeedStatus();

    if (before.connected || before.connecting) {
      liveDiscoveryStartedAt = liveDiscoveryStartedAt ?? new Date().toISOString();
      return actionResult("start", true, "Live discovery is already running.", [
        "LIVE_DISCOVERY_START_REQUESTED",
        "LIVE_DISCOVERY_ALREADY_RUNNING"
      ]);
    }

    await options.startLiveDiscovery();
    liveDiscoveryStartedAt = new Date().toISOString();
    liveDiscoveryStoppedAt = null;

    return actionResult("start", true, "Live discovery start requested.", [
      "LIVE_DISCOVERY_START_REQUESTED",
      "LIVE_DISCOVERY_STARTED"
    ]);
  }

  async function stopLiveDiscovery(): Promise<RuntimeControlResult> {
    const before = options.getFeedStatus();
    await options.stopLiveDiscovery();
    liveDiscoveryStoppedAt = new Date().toISOString();

    return actionResult(
      "stop",
      true,
      before.connected || before.connecting
        ? "Live discovery stopped."
        : "Live discovery was already stopped.",
      [
        "LIVE_DISCOVERY_STOP_REQUESTED",
        before.connected || before.connecting
          ? "LIVE_DISCOVERY_STOPPED"
          : "LIVE_DISCOVERY_ALREADY_STOPPED"
      ]
    );
  }

  async function restartLiveDiscovery(): Promise<RuntimeControlResult> {
    await options.restartLiveDiscovery();
    liveDiscoveryStartedAt = new Date().toISOString();
    liveDiscoveryStoppedAt = null;

    return actionResult("restart", true, "Live discovery restart requested.", [
      "LIVE_DISCOVERY_STOP_REQUESTED",
      "LIVE_DISCOVERY_START_REQUESTED",
      "LIVE_DISCOVERY_STARTED"
    ]);
  }

  async function startMeteredLaunchData(): Promise<RuntimeControlResult> {
    await options.refreshDataWallet();
    let metered = options.getMeteredLaunchDataStatus();
    const blockers = mapMeteredBlockers(metered);

    if (metered.active && blockers.length === 0) {
      return actionResult("start", true, "Metered launch data is already running.", [
        "METERED_DATA_START_REQUESTED",
        "METERED_DATA_ALREADY_RUNNING"
      ]);
    }

    if (blockers.length > 0 || !metered.canStart) {
      return actionResult(
        "start",
        false,
        "Metered launch data is blocked by current gates.",
        [
          "METERED_DATA_START_REQUESTED",
          ...(blockers.length > 0 ? blockers : ["METERED_DATA_NOT_READY"])
        ]
      );
    }

    await options.startMeteredLaunchData();

    const decisions = options.trackCurrentMeteredCandidates?.(50) ?? [];
    metered = options.getMeteredLaunchDataStatus();
    const nextStatus = await getStatus();

    return {
      ...(await actionResult("start", true, "Metered launch data started.", [
        "METERED_DATA_START_REQUESTED",
        "METERED_DATA_STARTED"
      ])),
      decisions,
      status: {
        ...nextStatus,
        meteredLaunchData: {
          ...nextStatus.meteredLaunchData,
          enabled: metered.enabled
        }
      }
    };
  }

  async function stopMeteredLaunchData(): Promise<RuntimeControlResult> {
    await options.stopMeteredLaunchData();

    return actionResult("stop", true, "Metered launch data stopped.", [
      "METERED_DATA_STOP_REQUESTED",
      "METERED_DATA_STOPPED"
    ]);
  }

  async function restartMeteredLaunchData(): Promise<RuntimeControlResult> {
    await stopMeteredLaunchData();
    const started = await startMeteredLaunchData();

    return {
      ...started,
      action: "restart",
      reasonCodes: unique([
        "METERED_DATA_STOP_REQUESTED",
        ...started.reasonCodes
      ])
    };
  }

  async function refreshDataWallet(): Promise<RuntimeControlResult> {
    await options.refreshDataWallet();

    return actionResult("refresh", true, "Data wallet balance refreshed.", [
      "DATA_WALLET_REFRESH_REQUESTED"
    ]);
  }

  async function refreshTradingWallet(): Promise<RuntimeControlResult> {
    await options.refreshTradingWallet?.();

    return actionResult("refresh", true, "Trading wallet readiness refreshed.", [
      "TRADING_WALLET_REFRESH_REQUESTED"
    ]);
  }

  async function ackMeteredLaunchDataSession(
    input: MeteredLaunchDataSessionAckInput
  ): Promise<RuntimeControlResult> {
    await options.refreshDataWallet();
    await options.ackMeteredLaunchDataSession?.(input);

    return actionResult("arm", true, "Metered price action armed for this session.", [
      "METERED_DATA_SESSION_ACK_REQUESTED",
      "METERED_DATA_SESSION_ARMED"
    ]);
  }

  async function clearMeteredLaunchDataSessionAck(): Promise<RuntimeControlResult> {
    await options.clearMeteredLaunchDataSessionAck?.();

    return actionResult("arm", true, "Metered price action session ACK cleared.", [
      "METERED_DATA_SESSION_ACK_CLEAR_REQUESTED",
      "METERED_DATA_SESSION_ACK_CLEARED"
    ]);
  }

  async function actionResult(
    action: RuntimeControlResult["action"],
    ok: boolean,
    message: string,
    reasonCodes: string[]
  ): Promise<RuntimeControlResult> {
    return {
      action,
      ok,
      message,
      status: await getStatus(),
      reasonCodes: unique([
        ...reasonCodes,
        "CONTROL_PLANE_LOCAL_ONLY",
        "TRADING_DISABLED",
        "LIGHTNING_DISABLED",
        "ACCOUNT_TRADES_DISABLED"
      ]),
      paperOnly: true,
      tradingDisabled: true
    };
  }

  return {
    ackMeteredLaunchDataSession,
    clearMeteredLaunchDataSessionAck,
    getDiagnostics,
    getStatus,
    refreshDataWallet,
    refreshTradingWallet,
    restartLiveDiscovery,
    restartMeteredLaunchData,
    startLiveDiscovery,
    startMeteredLaunchData,
    stopLiveDiscovery,
    stopMeteredLaunchData
  };
}

function isMeteredBlocked(status: MeteredLaunchDataStatus): boolean {
  const state = getMeteredPriceActionState(status, mapMeteredBlockers(status));
  return (
    state === "ARM_REQUIRED" ||
    state === "BLOCKED" ||
    state === "BUDGET_REACHED"
  );
}

function mapMeteredBlockers(status: MeteredLaunchDataStatus): string[] {
  return mapMeteredBlockerCodes(status.blockers);
}

function mapMeteredReasonCodes(reasonCodes: string[]): string[] {
  return unique([
    ...reasonCodes,
    ...mapMeteredBlockerCodes(reasonCodes)
  ]);
}

function mapMeteredBlockerCodes(reasonCodes: string[]): string[] {
  return unique(
    reasonCodes
      .map((code): string | null => {
        if (code === "METERED_LAUNCH_DATA_DISABLED") {
          return "METERED_DATA_DISABLED";
        }

        if (code.includes("ACK")) {
          return "METERED_DATA_ACK_MISSING";
        }

        if (code.includes("API_KEY")) {
          return "METERED_DATA_API_KEY_MISSING";
        }

        if (code.includes("WALLET_MISSING") || code.includes("WALLET_INVALID")) {
          return "METERED_DATA_WALLET_NOT_READY";
        }

        if (
          code.includes("WALLET_LOW") ||
          code.includes("FUNDS") ||
          code.includes("BALANCE_LOW") ||
          code.includes("BALANCE_CRITICAL")
        ) {
          return "METERED_DATA_WALLET_LOW";
        }

        if (code.includes("BUDGET") || code.includes("CAP")) {
          return "METERED_DATA_BUDGET_REACHED";
        }

        if (code.includes("OFFLINE")) {
          return "METERED_DATA_LIVE_DISCOVERY_OFFLINE";
        }

        return null;
      })
      .filter((code): code is string => Boolean(code))
  );
}

function mapMeteredWarnings(
  status: MeteredLaunchDataStatus,
  dataWallet: PumpPortalDataWalletStatus
): string[] {
  return unique([
    ...status.warnings.map((warning) =>
      warning === "METERED_LAUNCH_DATA_STOPPED"
        ? "METERED_DATA_STOPPED"
        : warning
    ),
    ...(status.dataWalletBalanceStatus === "unknown" ||
    dataWallet.balanceStatus === "unknown" ||
    status.reasonCodes.some((code) => code.includes("BALANCE_UNKNOWN"))
      ? ["METERED_DATA_BALANCE_UNKNOWN"]
      : []),
  ]);
}

function getMeteredPriceActionState(
  status: MeteredLaunchDataStatus,
  blockers: string[]
): RuntimeMeteredPriceActionState {
  if (!status.controlsEnabled || !status.enabled) {
    return "OFF";
  }

  if (status.budgetReached || blockers.includes("METERED_DATA_BUDGET_REACHED")) {
    return "BUDGET_REACHED";
  }

  if (status.active && blockers.length === 0) {
    return "ACTIVE";
  }

  if (!status.acknowledgedCost) {
    return "ARM_REQUIRED";
  }

  if (blockers.length > 0) {
    return "BLOCKED";
  }

  if (
    status.reasonCodes.includes("METERED_LAUNCH_DATA_STOPPED") &&
    status.lastStopReason !== null
  ) {
    return "STOPPED";
  }

  return "READY";
}

function normalizeBalanceStatus(status: string): RuntimeBalanceStatus {
  if (status === "missing_config") {
    return "missing";
  }

  if (
    status === "unknown" ||
    status === "critical" ||
    status === "low" ||
    status === "ok"
  ) {
    return status;
  }

  return "unknown";
}

function emptyTradingWallet(): PumpPortalWalletStatus {
  return {
    role: "trading",
    configured: false,
    apiKeyConfigured: false,
    publicKeyConfigured: false,
    publicKey: null,
    shortPublicKey: null,
    publicKeyValid: false,
    balanceSol: null,
    balanceLamports: null,
    balanceStatus: "missing_config",
    minBalanceSol: 0,
    warnBalanceSol: 0,
    criticalBalanceSol: 0,
    targetBalanceSol: 0,
    lastBalanceCheckAt: null,
    lastError: null,
    reasonCodes: ["LIGHTNING_PUBLIC_KEY_MISSING", "LIGHTNING_API_KEY_MISSING"]
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
