import type { PumpPortalDataWalletBalanceStatus } from "./pumpportal-data-wallet-service";

export const tradeDataCoverageLimits = {
  maxMints: 1,
  defaultMaxEvents: 50,
  hardMaxEvents: 50,
  defaultMaxRuntimeMs: 90_000,
  hardMaxRuntimeMs: 90_000,
  defaultMaxCostSol: 0.0001,
  hardMaxCostSol: 0.0001,
  defaultPostStopGraceMs: 5_000,
  hardMaxPostStopGraceMs: 10_000
} as const;

export type TradeDataCoverageForbiddenPathState = {
  accountTradesEnabled: boolean;
  paperAutomationEnabled: boolean;
  lightningEnabled: boolean;
  localTransactionApiEnabled: boolean;
  signingEnabled: boolean;
  transactionSendingEnabled: boolean;
  liveTradingEnabled: boolean;
};

export const disabledTradeDataCoverageForbiddenPaths: TradeDataCoverageForbiddenPathState =
  {
    accountTradesEnabled: false,
    paperAutomationEnabled: false,
    lightningEnabled: false,
    localTransactionApiEnabled: false,
    signingEnabled: false,
    transactionSendingEnabled: false,
    liveTradingEnabled: false
  };

export type TradeDataCoverageReadinessCapsInput = {
  maxMints?: number;
  maxEvents: number;
  maxRuntimeMs: number;
  maxCostSol: number;
  postStopGraceMs: number;
};

export type TradeDataCoverageLiveReadinessInput = {
  liveAuthorizationPresent: boolean;
  cliAckPresent: boolean;
  dataApiKeyConfigured: boolean;
  dataWalletPublicKeyConfigured: boolean;
  dataWalletPublicKeyValid: boolean;
  dataWalletBalanceStatus: PumpPortalDataWalletBalanceStatus;
  dataWalletBalanceSol: number | null;
  minimumBalanceSol: number;
  storageReady: boolean;
  caps: TradeDataCoverageReadinessCapsInput;
  forbiddenPaths: TradeDataCoverageForbiddenPathState;
  estimatedCostPerEventSol?: number;
  chainVerify?: boolean;
  solanaRpcConfigured?: boolean;
  updatedAt?: string;
};

export type TradeDataCoverageLiveReadinessV1 = {
  schemaVersion: "trade-data-coverage-readiness-v1";
  canRun: boolean;
  preflightOnly: boolean;
  liveAuthorizationPresent: boolean;
  cliAckPresent: boolean;
  cliAckRequired: true;
  dataApiKeyConfigured: boolean;
  dataWalletPublicKeyConfigured: boolean;
  balanceStatus: PumpPortalDataWalletBalanceStatus;
  dataWalletBalanceStatus: PumpPortalDataWalletBalanceStatus;
  dataWalletBalanceSol?: number;
  balancePolicy: "known_acceptable" | "known_insufficient" | "unknown_allowed";
  oneMintEnforced: true;
  caps: {
    maxMints: 1;
    requestedMaxEvents: number;
    maxEvents: number;
    maxRuntimeMs: number;
    maxCostSol: number;
    postStopGraceMs: number;
    hardMaxEvents: number;
    hardMaxRuntimeMs: number;
    hardMaxCostSol: number;
    hardMaxPostStopGraceMs: number;
  };
  capsValid: boolean;
  storageReady: boolean;
  forbiddenPaths: {
    accountTradesDisabled: boolean;
    paperAutomationDisabled: boolean;
    lightningDisabled: boolean;
    localTransactionApiDisabled: boolean;
    signingDisabled: boolean;
    transactionSendingDisabled: boolean;
    liveTradingDisabled: boolean;
  };
  blockers: string[];
  warnings: string[];
  reasonCodes: string[];
  secretsExposed: false;
  updatedAt: string;
  paperOnly: true;
  liveTradingEnabled: false;
};

export function createTradeDataCoverageLiveReadiness(
  input: TradeDataCoverageLiveReadinessInput
): TradeDataCoverageLiveReadinessV1 {
  const balancePolicy =
    input.dataWalletBalanceSol === null
      ? "unknown_allowed"
      : input.dataWalletBalanceSol >= input.minimumBalanceSol
        ? "known_acceptable"
        : "known_insufficient";
  const requestedMaxEvents = input.caps.maxEvents;
  const estimatedCostPerEventSol = input.estimatedCostPerEventSol ?? 0;
  const costEventLimit =
    estimatedCostPerEventSol > 0 && Number.isFinite(input.caps.maxCostSol)
      ? Math.floor(input.caps.maxCostSol / estimatedCostPerEventSol)
      : requestedMaxEvents;
  const effectiveMaxEvents = Math.min(requestedMaxEvents, costEventLimit);
  const capBlockers = getCapBlockers(input.caps, effectiveMaxEvents);
  const blockers = unique([
    ...(input.liveAuthorizationPresent
      ? []
      : ["TRADE_COVERAGE_LIVE_ACK_MISSING"]),
    ...(input.cliAckPresent ? [] : ["TRADE_COVERAGE_CLI_ACK_MISSING"]),
    ...(input.dataApiKeyConfigured ? [] : ["TRADE_COVERAGE_API_KEY_MISSING"]),
    ...(input.dataWalletPublicKeyConfigured && input.dataWalletPublicKeyValid
      ? []
      : ["TRADE_COVERAGE_DATA_WALLET_MISSING"]),
    ...(balancePolicy === "known_insufficient"
      ? ["TRADE_COVERAGE_BALANCE_LOW"]
      : []),
    ...capBlockers,
    ...(input.forbiddenPaths.accountTradesEnabled
      ? ["TRADE_COVERAGE_ACCOUNT_TRADES_ENABLED"]
      : []),
    ...(input.forbiddenPaths.paperAutomationEnabled
      ? ["TRADE_COVERAGE_PAPER_AUTOMATION_ENABLED"]
      : []),
    ...(input.forbiddenPaths.lightningEnabled
      ? ["TRADE_COVERAGE_LIGHTNING_ENABLED"]
      : []),
    ...(input.forbiddenPaths.localTransactionApiEnabled
      ? ["TRADE_COVERAGE_LOCAL_TRANSACTION_API_ENABLED"]
      : []),
    ...(input.forbiddenPaths.signingEnabled
      ? ["TRADE_COVERAGE_SIGNING_ENABLED"]
      : []),
    ...(input.forbiddenPaths.transactionSendingEnabled
      ? ["TRADE_COVERAGE_TRANSACTION_SENDING_ENABLED"]
      : []),
    ...(input.forbiddenPaths.liveTradingEnabled
      ? ["TRADE_COVERAGE_LIVE_TRADING_ENABLED"]
      : []),
    ...(input.storageReady ? [] : ["TRADE_COVERAGE_STORAGE_NOT_READY"]),
    ...(input.chainVerify && !input.solanaRpcConfigured
      ? ["TRADE_COVERAGE_CHAIN_VERIFY_RPC_MISSING"]
      : [])
  ]);
  const warnings = unique([
    ...(balancePolicy === "unknown_allowed"
      ? ["TRADE_COVERAGE_BALANCE_UNKNOWN"]
      : [])
  ]);
  const canRun = blockers.length === 0;
  const preflightOnly = !input.liveAuthorizationPresent || !input.cliAckPresent;

  return {
    schemaVersion: "trade-data-coverage-readiness-v1",
    canRun,
    preflightOnly,
    liveAuthorizationPresent: input.liveAuthorizationPresent,
    cliAckPresent: input.cliAckPresent,
    cliAckRequired: true,
    dataApiKeyConfigured: input.dataApiKeyConfigured,
    dataWalletPublicKeyConfigured:
      input.dataWalletPublicKeyConfigured && input.dataWalletPublicKeyValid,
    balanceStatus: input.dataWalletBalanceStatus,
    dataWalletBalanceStatus: input.dataWalletBalanceStatus,
    ...(input.dataWalletBalanceSol === null
      ? {}
      : { dataWalletBalanceSol: input.dataWalletBalanceSol }),
    balancePolicy,
    oneMintEnforced: true,
    caps: {
      maxMints: 1,
      requestedMaxEvents,
      maxEvents: Math.max(0, effectiveMaxEvents),
      maxRuntimeMs: input.caps.maxRuntimeMs,
      maxCostSol: input.caps.maxCostSol,
      postStopGraceMs: input.caps.postStopGraceMs,
      hardMaxEvents: tradeDataCoverageLimits.hardMaxEvents,
      hardMaxRuntimeMs: tradeDataCoverageLimits.hardMaxRuntimeMs,
      hardMaxCostSol: tradeDataCoverageLimits.hardMaxCostSol,
      hardMaxPostStopGraceMs: tradeDataCoverageLimits.hardMaxPostStopGraceMs
    },
    capsValid: capBlockers.length === 0,
    storageReady: input.storageReady,
    forbiddenPaths: {
      accountTradesDisabled: !input.forbiddenPaths.accountTradesEnabled,
      paperAutomationDisabled: !input.forbiddenPaths.paperAutomationEnabled,
      lightningDisabled: !input.forbiddenPaths.lightningEnabled,
      localTransactionApiDisabled:
        !input.forbiddenPaths.localTransactionApiEnabled,
      signingDisabled: !input.forbiddenPaths.signingEnabled,
      transactionSendingDisabled:
        !input.forbiddenPaths.transactionSendingEnabled,
      liveTradingDisabled: !input.forbiddenPaths.liveTradingEnabled
    },
    blockers,
    warnings,
    reasonCodes: unique([
      canRun ? "TRADE_COVERAGE_READY" : "TRADE_COVERAGE_NOT_READY",
      ...(preflightOnly ? ["TRADE_COVERAGE_PREFLIGHT_ONLY"] : []),
      ...blockers,
      ...warnings,
      "TRADE_COVERAGE_SECRETS_HIDDEN"
    ]),
    secretsExposed: false,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    paperOnly: true,
    liveTradingEnabled: false
  };
}

function getCapBlockers(
  caps: TradeDataCoverageReadinessCapsInput,
  effectiveMaxEvents: number
): string[] {
  const blockers: string[] = [];
  const maxMints = caps.maxMints ?? tradeDataCoverageLimits.maxMints;

  if (
    maxMints !== 1 ||
    !Number.isInteger(caps.maxEvents) ||
    caps.maxEvents <= 0 ||
    !Number.isInteger(caps.maxRuntimeMs) ||
    caps.maxRuntimeMs <= 0 ||
    !Number.isFinite(caps.maxCostSol) ||
    caps.maxCostSol <= 0 ||
    !Number.isInteger(caps.postStopGraceMs) ||
    caps.postStopGraceMs < 0 ||
    effectiveMaxEvents < 1
  ) {
    blockers.push("TRADE_COVERAGE_CAP_INVALID");
  }
  if (caps.maxEvents > tradeDataCoverageLimits.hardMaxEvents) {
    blockers.push("TRADE_COVERAGE_EVENT_CAP_TOO_HIGH");
  }
  if (caps.maxRuntimeMs > tradeDataCoverageLimits.hardMaxRuntimeMs) {
    blockers.push("TRADE_COVERAGE_RUNTIME_CAP_TOO_HIGH");
  }
  if (caps.maxCostSol > tradeDataCoverageLimits.hardMaxCostSol) {
    blockers.push("TRADE_COVERAGE_COST_CAP_TOO_HIGH");
  }
  if (caps.postStopGraceMs > tradeDataCoverageLimits.hardMaxPostStopGraceMs) {
    blockers.push("TRADE_COVERAGE_GRACE_CAP_TOO_HIGH");
  }

  return blockers;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
