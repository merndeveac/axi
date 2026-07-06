import type {
  MeteredLaunchDataDecision,
  MeteredLaunchDataStatus
} from "./metered-launch-data-service";
import type { PumpPortalDataWalletStatus } from "./pumpportal-data-wallet-service";

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

export type RuntimeControlStatus = {
  controlPlaneEnabled: boolean;
  localOnly: boolean;
  runtimeMode: string;
  paperOnly: true;
  tradingDisabled: true;
  liveDiscovery: {
    enabled: boolean;
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
  process: {
    pid: number;
    uptimeSeconds: number;
    ports: number[];
    startedAt: string;
  };
  reasonCodes: string[];
};

export type RuntimeControlResult = {
  action: RuntimeControlAction | "refresh";
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
  ports?: number[];
  refreshDataWallet: () =>
    | PumpPortalDataWalletStatus
    | Promise<PumpPortalDataWalletStatus>;
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
  refreshDataWallet: () => Promise<RuntimeControlResult>;
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
    const [dataWallet, feed, metered] = await Promise.all([
      options.getDataWalletStatus(),
      options.getFeedStatus(),
      options.getMeteredLaunchDataStatus()
    ]);
    const liveStopped =
      !feed.connected &&
      !feed.connecting &&
      liveDiscoveryStoppedAt !== null;
    const meteredBlocked = isMeteredBlocked(metered);
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

    return {
      controlPlaneEnabled: true,
      localOnly: true,
      runtimeMode: options.runtimeMode,
      paperOnly: true,
      tradingDisabled: true,
      liveDiscovery: {
        enabled: feed.provider === "pumpportal",
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
      meteredLaunchData: {
        enabled: metered.enabled,
        active: metered.active && !meteredBlocked,
        blocked: meteredBlocked,
        trackedMintCount: metered.trackedMintCount,
        eventCount: metered.totalEventsThisSession,
        estimatedCostSol: metered.estimatedCostSol,
        sessionCostCapSol: metered.maxSessionCostSol,
        budgetRemainingSol: metered.remainingBudgetSol,
        latestEventAt: options.getMeteredLatestEventAt?.() ?? null,
        reasonCodes: mapMeteredReasonCodes(metered.reasonCodes)
      },
      dataWallet: {
        publicKeyConfigured: dataWallet.publicKeyConfigured,
        publicKey: dataWallet.publicKey,
        shortPublicKey: dataWallet.shortPublicKey,
        apiKeyConfigured: dataWallet.apiKeyConfigured,
        balanceSol: dataWallet.balanceSol,
        balanceStatus: dataWallet.balanceStatus,
        estimatedEventsRemaining: dataWallet.estimatedEventsRemaining,
        lastBalanceCheckAt: dataWallet.lastBalanceCheckAt,
        reasonCodes: dataWallet.reasonCodes
      },
      process: {
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        ports: options.ports ?? [8787, 5173],
        startedAt: processStartedAt
      },
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
          "Metered launch data uses subscribeTokenTrade only after existing backend gates pass.",
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

    if (blockers.length > 0) {
      return actionResult(
        "start",
        false,
        "Metered launch data is blocked by current gates.",
        ["METERED_DATA_START_REQUESTED", ...blockers]
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
    getDiagnostics,
    getStatus,
    refreshDataWallet,
    restartLiveDiscovery,
    restartMeteredLaunchData,
    startLiveDiscovery,
    startMeteredLaunchData,
    stopLiveDiscovery,
    stopMeteredLaunchData
  };
}

function isMeteredBlocked(status: MeteredLaunchDataStatus): boolean {
  return !status.ready || status.reasonCodes.some(isBlockingMeteredReason);
}

function mapMeteredBlockers(status: MeteredLaunchDataStatus): string[] {
  return mapMeteredBlockerCodes(status.reasonCodes);
}

function mapMeteredReasonCodes(reasonCodes: string[]): string[] {
  return unique([
    ...reasonCodes,
    ...mapMeteredBlockerCodes(reasonCodes)
  ]);
}

function mapMeteredBlockerCodes(reasonCodes: string[]): string[] {
  return unique(reasonCodes.filter(isBlockingMeteredReason).map((code) => {
    if (code.includes("ACK")) {
      return "METERED_DATA_ACK_MISSING";
    }

    if (code.includes("API_KEY")) {
      return "METERED_DATA_API_KEY_MISSING";
    }

    if (code.includes("WALLET") || code.includes("BALANCE")) {
      return "METERED_DATA_WALLET_NOT_READY";
    }

    if (code.includes("BUDGET") || code.includes("CAP")) {
      return "METERED_DATA_BUDGET_REACHED";
    }

    return "METERED_DATA_BLOCKED_BY_GATES";
  }));
}

function isBlockingMeteredReason(code: string): boolean {
  return (
    code.includes("DISABLED") ||
    code.includes("STOPPED") ||
    code.includes("ACK") ||
    code.includes("API_KEY") ||
    code.includes("WALLET") ||
    code.includes("BALANCE") ||
    code.includes("BUDGET") ||
    code.includes("CAP") ||
    code.includes("OFFLINE")
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
