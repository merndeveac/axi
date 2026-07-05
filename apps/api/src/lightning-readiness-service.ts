import { isValidSolanaMint } from "@axi/data-feeds";
import {
  createDisabledLightningClient,
  createLightningBuyPlan,
  createLightningSellPlan,
  type LightningLimits,
  type LightningReadiness,
  type LightningSafetyCheck,
  type LightningTradePlan
} from "@axi/pumpportal-lightning";
import type { CandidateState } from "@axi/candidates";
import type { RiskSnapshot } from "@axi/shared";
import type {
  PumpPortalWalletStatus,
  PumpPortalWalletsService
} from "./pumpportal-wallets-service";

export type LightningReadinessConfig = {
  enabled: boolean;
  liveTradingAllowed: boolean;
  manualArmRequired: boolean;
  manualArmed: boolean;
  baseUrl: string;
  limits: LightningLimits;
};

export type LightningPlanInput = {
  mint: string;
  amountSol: number;
  reason?: string;
};

export type LightningStatus = {
  readiness: LightningReadiness;
  limits: LightningLimits;
  baseUrlConfigured: boolean;
  liveTradingAllowed: boolean;
  manualArmRequired: boolean;
  manualArmed: boolean;
  maxBuySol: number;
  maxDailySol: number;
  maxOpenPositions: number;
  pool: string;
  slippage: number;
  priorityFee: number;
  reasonCodes: string[];
  paperOnly: true;
  tradingDisabled: true;
};

export type LightningReadinessServiceOptions = {
  config: LightningReadinessConfig;
  wallets: PumpPortalWalletsService;
  getCandidate?: (mint: string) => CandidateState | undefined;
  getRiskSnapshot?: (mint: string) => RiskSnapshot | undefined;
};

export function createLightningReadinessConfig(
  input: Partial<LightningReadinessConfig> = {}
): LightningReadinessConfig {
  return {
    enabled: input.enabled ?? true,
    liveTradingAllowed: input.liveTradingAllowed ?? false,
    manualArmRequired: input.manualArmRequired ?? true,
    manualArmed: input.manualArmed ?? false,
    baseUrl: input.baseUrl ?? "https://pumpportal.fun/api/trade",
    limits: input.limits ?? {
      maxBuySol: 0.005,
      maxDailySol: 0.02,
      maxOpenPositions: 1,
      maxSlippagePct: 10,
      priorityFeeSol: 0.00005,
      pool: "auto",
      skipPreflight: false,
      jitoOnly: false
    }
  };
}

export function createLightningReadinessService(
  options: LightningReadinessServiceOptions
): LightningReadinessService {
  return new LightningReadinessService(options);
}

export class LightningReadinessService {
  private readonly config: LightningReadinessConfig;
  private readonly getCandidate: ((mint: string) => CandidateState | undefined) | undefined;
  private readonly getRiskSnapshot:
    | ((mint: string) => RiskSnapshot | undefined)
    | undefined;
  private readonly wallets: PumpPortalWalletsService;

  constructor(options: LightningReadinessServiceOptions) {
    this.config = options.config;
    this.wallets = options.wallets;
    this.getCandidate = options.getCandidate;
    this.getRiskSnapshot = options.getRiskSnapshot;
  }

  getStatus(): LightningStatus {
    const walletsStatus = this.wallets.getStatus();
    const tradingWallet = walletsStatus.tradingWallet;
    const dataWallet = walletsStatus.dataWallet;
    const reasonCodes = this.getReadinessReasonCodes({
      dataWallet,
      sameWallet: walletsStatus.sameWallet,
      tradingWallet
    });
    const readiness: LightningReadiness = {
      enabled: this.config.enabled,
      liveTradingAllowed: this.config.liveTradingAllowed,
      manualArmRequired: this.config.manualArmRequired,
      manualArmed: this.config.manualArmed,
      dataWalletReady: dataWallet.configured,
      tradingWalletReady: this.isTradingWalletReady(tradingWallet),
      apiKeyConfigured: tradingWallet.apiKeyConfigured,
      publicKeyConfigured: tradingWallet.publicKeyConfigured,
      balanceSol: tradingWallet.balanceSol,
      limits: this.config.limits,
      reasonCodes
    };

    return {
      readiness,
      limits: this.config.limits,
      baseUrlConfigured: this.config.baseUrl.length > 0,
      liveTradingAllowed: this.config.liveTradingAllowed,
      manualArmRequired: this.config.manualArmRequired,
      manualArmed: this.config.manualArmed,
      maxBuySol: this.config.limits.maxBuySol,
      maxDailySol: this.config.limits.maxDailySol,
      maxOpenPositions: this.config.limits.maxOpenPositions,
      pool: this.config.limits.pool,
      slippage: this.config.limits.maxSlippagePct,
      priorityFee: this.config.limits.priorityFeeSol,
      reasonCodes,
      paperOnly: true,
      tradingDisabled: true
    };
  }

  createBuyPlan(input: LightningPlanInput): LightningTradePlan {
    return this.createPlan("buy", input);
  }

  createSellPlan(input: LightningPlanInput): LightningTradePlan {
    return this.createPlan("sell", input);
  }

  async refuseExecution() {
    const client = createDisabledLightningClient();
    return client.executeTrade({
      action: "buy",
      amount: 0,
      denominatedInSol: true,
      jitoOnly: this.config.limits.jitoOnly,
      mint: "",
      pool: this.config.limits.pool,
      priorityFee: this.config.limits.priorityFeeSol,
      skipPreflight: this.config.limits.skipPreflight,
      slippage: this.config.limits.maxSlippagePct
    });
  }

  private createPlan(
    action: "buy" | "sell",
    input: LightningPlanInput
  ): LightningTradePlan {
    const walletsStatus = this.wallets.getStatus();
    const tradingWallet = walletsStatus.tradingWallet;
    const candidate = this.getCandidate?.(input.mint);
    const riskSnapshot = this.getRiskSnapshot?.(input.mint);
    const extraSafetyChecks = this.createPlanSafetyChecks({
      candidate,
      input,
      riskSnapshot,
      sameWallet: walletsStatus.sameWallet,
      tradingWallet
    });
    const mode = extraSafetyChecks.some(
      (check) =>
        !check.passed &&
        check.severity === "blocker" &&
        check.code === "LIGHTNING_LIVE_TRADING_DISABLED"
    )
      ? "live_blocked"
      : this.config.manualArmed
        ? "manual_ready"
        : "dry_run";

    return action === "buy"
      ? createLightningBuyPlan({
          mint: input.mint,
          amountSol: input.amountSol,
          limits: this.config.limits,
          estimatedRisk: riskSnapshot?.riskLevel ?? candidate?.latestRisk?.riskLevel ?? "unknown",
          extraSafetyChecks,
          mode
        })
      : createLightningSellPlan({
          mint: input.mint,
          amountSol: input.amountSol,
          limits: this.config.limits,
          estimatedRisk: riskSnapshot?.riskLevel ?? candidate?.latestRisk?.riskLevel ?? "unknown",
          extraSafetyChecks,
          mode
        });
  }

  private createPlanSafetyChecks(options: {
    candidate: CandidateState | undefined;
    input: LightningPlanInput;
    riskSnapshot: RiskSnapshot | undefined;
    sameWallet: boolean;
    tradingWallet: PumpPortalWalletStatus;
  }): LightningSafetyCheck[] {
    const checks: LightningSafetyCheck[] = [
      {
        code: this.config.enabled
          ? "LIGHTNING_READINESS_ENABLED"
          : "LIGHTNING_READINESS_DISABLED",
        passed: this.config.enabled,
        severity: this.config.enabled ? "info" : "blocker",
        message: this.config.enabled
          ? "Lightning readiness is enabled for planning."
          : "Lightning readiness is disabled."
      },
      {
        code: "LIGHTNING_LIVE_TRADING_DISABLED",
        passed: this.config.liveTradingAllowed,
        severity: "blocker",
        message: "Live Lightning trading is disabled. Plan only."
      },
      {
        code: "LIGHTNING_MANUAL_NOT_ARMED",
        passed:
          !this.config.manualArmRequired || this.config.manualArmed === true,
        severity: "blocker",
        message: "Manual Lightning arm is required and is not armed."
      },
      {
        code: "LIGHTNING_API_KEY_MISSING",
        passed: options.tradingWallet.apiKeyConfigured,
        severity: "blocker",
        message: "Trading API key is not configured."
      },
      {
        code: "LIGHTNING_PUBLIC_KEY_MISSING",
        passed:
          options.tradingWallet.publicKeyConfigured &&
          options.tradingWallet.publicKeyValid,
        severity: "blocker",
        message: "Trading wallet public key is missing or invalid."
      },
      {
        code: "LIGHTNING_REQUEST_BLOCKED",
        passed: isValidSolanaMint(options.input.mint),
        severity: "blocker",
        message: "Mint must be a valid Solana address for future execution.",
        value: options.input.mint
      },
      {
        code: "LIGHTNING_ENDPOINT_NOT_CALLED",
        passed: true,
        severity: "info",
        message: "No PumpPortal Lightning endpoint was called."
      }
    ];

    if (this.config.manualArmRequired) {
      checks.push({
        code: "LIGHTNING_MANUAL_ARM_REQUIRED",
        passed: true,
        severity: "info",
        message: "Manual arm is required before any future execution phase."
      });
    }

    if (
      options.tradingWallet.balanceSol !== null &&
      options.tradingWallet.balanceSol < options.tradingWallet.minBalanceSol
    ) {
      checks.push({
        code: "LIGHTNING_BALANCE_LOW",
        passed: false,
        severity: "blocker",
        message: "Trading wallet balance is below the configured minimum.",
        value: options.tradingWallet.balanceSol,
        limit: options.tradingWallet.minBalanceSol
      });
    }

    if (
      options.riskSnapshot?.hardReject ||
      options.candidate?.latestRisk?.hardReject ||
      options.candidate?.latestDecision?.hardReject
    ) {
      checks.push({
        code: "LIGHTNING_HARD_REJECT_BLOCKED",
        passed: false,
        severity: "blocker",
        message: "Candidate is hard-rejected by available paper-mode risk data."
      });
      checks.push({
        code: "LIGHTNING_RISK_BLOCKED",
        passed: false,
        severity: "blocker",
        message: "Risk gates block this dry-run plan."
      });
    }

    if (options.sameWallet) {
      checks.push({
        code: "LIGHTNING_SHARED_WALLET_WARNING",
        passed: false,
        severity: "warning",
        message:
          "Same hot wallet is configured for data billing and future trading."
      });
      checks.push({
        code: "LIGHTNING_DATA_ONLY_WALLET_WARNING",
        passed: false,
        severity: "warning",
        message: "Separate data and trading wallets are recommended."
      });
    }

    checks.push({
      code: "LIGHTNING_PLAN_CREATED",
      passed: true,
      severity: "info",
      message: "Dry-run Lightning plan was created. No transaction sent."
    });

    return checks;
  }

  private getReadinessReasonCodes(options: {
    dataWallet: PumpPortalWalletStatus;
    sameWallet: boolean;
    tradingWallet: PumpPortalWalletStatus;
  }): string[] {
    return unique([
      ...(this.config.enabled
        ? ["LIGHTNING_READINESS_ENABLED"]
        : ["LIGHTNING_READINESS_DISABLED"]),
      ...(this.config.liveTradingAllowed
        ? []
        : ["LIGHTNING_LIVE_TRADING_DISABLED", "LIGHTNING_EXECUTION_DISABLED"]),
      ...(this.config.manualArmRequired
        ? ["LIGHTNING_MANUAL_ARM_REQUIRED"]
        : []),
      ...(this.config.manualArmRequired && !this.config.manualArmed
        ? ["LIGHTNING_MANUAL_NOT_ARMED"]
        : []),
      ...options.tradingWallet.reasonCodes,
      ...(options.tradingWallet.balanceStatus === "unknown"
        ? ["LIGHTNING_BALANCE_UNKNOWN"]
        : []),
      ...(options.tradingWallet.balanceStatus === "ok"
        ? ["LIGHTNING_BALANCE_READY"]
        : []),
      ...(options.sameWallet
        ? [
            "LIGHTNING_SHARED_WALLET_WARNING",
            "LIGHTNING_DATA_ONLY_WALLET_WARNING"
          ]
        : []),
      ...(options.tradingWallet.apiKeyConfigured &&
      options.tradingWallet.publicKeyValid &&
      !this.config.liveTradingAllowed
        ? ["READY_BUT_LIVE_TRADING_DISABLED"]
        : []),
      "LIGHTNING_ENDPOINT_NOT_CALLED"
    ]);
  }

  private isTradingWalletReady(wallet: PumpPortalWalletStatus): boolean {
    return Boolean(
      wallet.apiKeyConfigured &&
        wallet.publicKeyValid &&
        (wallet.balanceSol === null || wallet.balanceSol >= wallet.minBalanceSol)
    );
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
