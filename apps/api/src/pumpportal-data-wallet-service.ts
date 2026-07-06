import {
  createSolanaChainClient,
  isValidSolanaAddress,
  type SolanaChainClient,
  type SolanaRpcCommitment
} from "@axi/solana-chain";

export type PumpPortalDataWalletBalanceStatus =
  | "unknown"
  | "missing_config"
  | "critical"
  | "low"
  | "ok";

export type PumpPortalDataWalletConfig = {
  apiKeyConfigured: boolean;
  balanceRefreshMs: number;
  commitment: SolanaRpcCommitment;
  criticalBalanceSol: number;
  eventCostSolPer10000: number;
  minBalanceSol: number;
  publicKey?: string | undefined;
  requestTimeoutMs: number;
  rpcHttpUrl?: string | undefined;
  targetBalanceSol: number;
  warnBalanceSol: number;
};

export type PumpPortalDataWalletStatus = {
  configured: boolean;
  apiKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  publicKey: string | null;
  shortPublicKey: string | null;
  publicKeyValid: boolean;
  solanaRpcConfigured: boolean;
  balanceSol: number | null;
  balanceLamports: number | null;
  minBalanceSol: number;
  warnBalanceSol: number;
  criticalBalanceSol: number;
  targetBalanceSol: number;
  balanceStatus: PumpPortalDataWalletBalanceStatus;
  estimatedEventsRemaining: number | null;
  estimatedCostPer10000EventsSol: number;
  lastBalanceCheckAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type PumpPortalDataWalletFundingInstructions = {
  publicKey: string | null;
  shortPublicKey: string | null;
  minBalanceSol: number;
  targetBalanceSol: number;
  instructions: string;
  warnings: string[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export type PumpPortalDataWalletReadiness = {
  configured: boolean;
  balanceSol: number | null;
  balanceStatus: PumpPortalDataWalletBalanceStatus;
  estimatedEventsRemaining: number | null;
  reasonCodes: string[];
  subscriptionBlockers: string[];
};

export type PumpPortalDataWalletServiceOptions = {
  config: PumpPortalDataWalletConfig;
  solanaClient?: SolanaChainClient;
};

type BalanceState = {
  balanceLamports: number | null;
  balanceSol: number | null;
  lastBalanceCheckAt: string | null;
  lastError: string | null;
};

export function createPumpPortalDataWalletConfig(
  input: Partial<PumpPortalDataWalletConfig> = {}
): PumpPortalDataWalletConfig {
  const config: PumpPortalDataWalletConfig = {
    apiKeyConfigured: input.apiKeyConfigured ?? false,
    balanceRefreshMs: input.balanceRefreshMs ?? 15_000,
    commitment: input.commitment ?? "confirmed",
    criticalBalanceSol: input.criticalBalanceSol ?? 0.02,
    eventCostSolPer10000: input.eventCostSolPer10000 ?? 0.01,
    minBalanceSol: input.minBalanceSol ?? 0.02,
    requestTimeoutMs: input.requestTimeoutMs ?? 10_000,
    targetBalanceSol: input.targetBalanceSol ?? 0.05,
    warnBalanceSol: input.warnBalanceSol ?? 0.03
  };

  if (input.publicKey !== undefined) {
    config.publicKey = input.publicKey;
  }

  if (input.rpcHttpUrl !== undefined) {
    config.rpcHttpUrl = input.rpcHttpUrl;
  }

  return config;
}

export function createPumpPortalDataWalletService(
  options: PumpPortalDataWalletServiceOptions
): PumpPortalDataWalletService {
  return new PumpPortalDataWalletService(options);
}

export class PumpPortalDataWalletService {
  private readonly config: PumpPortalDataWalletConfig;
  private readonly solanaClient: SolanaChainClient | undefined;
  private balanceState: BalanceState = {
    balanceLamports: null,
    balanceSol: null,
    lastBalanceCheckAt: null,
    lastError: null
  };

  constructor(options: PumpPortalDataWalletServiceOptions) {
    this.config = options.config;
    this.solanaClient =
      options.solanaClient ??
      (options.config.rpcHttpUrl
        ? createSolanaChainClient({
            commitment: options.config.commitment,
            requestTimeoutMs: options.config.requestTimeoutMs,
            rpcHttpUrl: options.config.rpcHttpUrl
          })
        : undefined);
  }

  getStatus(): PumpPortalDataWalletStatus {
    const publicKey = this.getPublicKey();
    const publicKeyConfigured = publicKey !== null;
    const publicKeyValid =
      publicKeyConfigured && isValidSolanaAddress(publicKey);
    const balanceStatus = this.getBalanceStatus({
      publicKeyConfigured,
      publicKeyValid
    });
    const reasonCodes = this.getReasonCodes({
      balanceStatus,
      publicKeyConfigured,
      publicKeyValid
    });

    return {
      configured: this.config.apiKeyConfigured && publicKeyValid,
      apiKeyConfigured: this.config.apiKeyConfigured,
      publicKeyConfigured,
      publicKey,
      shortPublicKey: publicKey ? shortPublicKey(publicKey) : null,
      publicKeyValid,
      solanaRpcConfigured: Boolean(this.config.rpcHttpUrl),
      balanceSol: this.balanceState.balanceSol,
      balanceLamports: this.balanceState.balanceLamports,
      minBalanceSol: this.config.minBalanceSol,
      warnBalanceSol: this.config.warnBalanceSol,
      criticalBalanceSol: this.config.criticalBalanceSol,
      targetBalanceSol: this.config.targetBalanceSol,
      balanceStatus,
      estimatedEventsRemaining: this.estimateRemainingEvents(
        this.balanceState.balanceSol
      ),
      estimatedCostPer10000EventsSol: this.config.eventCostSolPer10000,
      lastBalanceCheckAt: this.balanceState.lastBalanceCheckAt,
      lastError: this.balanceState.lastError,
      reasonCodes,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  async refreshBalance(options: { force?: boolean } = {}) {
    const publicKey = this.getPublicKey();

    if (!publicKey || !isValidSolanaAddress(publicKey) || !this.solanaClient) {
      return this.getStatus();
    }

    if (!options.force && !this.isBalanceRefreshDue()) {
      return this.getStatus();
    }

    const result = await this.solanaClient.getSolBalance(publicKey);

    this.balanceState = {
      balanceLamports: result.balanceLamports,
      balanceSol: result.balanceSol,
      lastBalanceCheckAt: result.inspectedAt,
      lastError: result.error
        ? `${result.error.code}: ${result.error.message}`
        : null
    };

    return this.getStatus();
  }

  estimateEventCost(eventCount: number): number {
    if (!Number.isFinite(eventCount) || eventCount <= 0) {
      return 0;
    }

    return (eventCount / 10_000) * this.config.eventCostSolPer10000;
  }

  estimateRemainingEvents(balanceSol: number | null | undefined): number | null {
    if (
      typeof balanceSol !== "number" ||
      !Number.isFinite(balanceSol) ||
      balanceSol <= 0 ||
      this.config.eventCostSolPer10000 <= 0
    ) {
      return null;
    }

    return Math.floor(
      (balanceSol / this.config.eventCostSolPer10000) * 10_000
    );
  }

  getFundingInstructions(): PumpPortalDataWalletFundingInstructions {
    const status = this.getStatus();

    return {
      publicKey: status.publicKey,
      shortPublicKey: status.shortPublicKey,
      minBalanceSol: status.minBalanceSol,
      targetBalanceSol: status.targetBalanceSol,
      instructions:
        "Send a small amount of SOL to this public address to fund PumpPortal metered data streams. This is not a bot trading wallet in AXI.",
      warnings: [
        "PumpPortal API keys are sensitive and stay backend-only.",
        "Only fund small amounts needed for metered data streams.",
        "AXI does not store a private key for this wallet.",
        "AXI does not implement PumpPortal trading endpoints."
      ],
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true
    };
  }

  getActualDataReadiness(): PumpPortalDataWalletReadiness {
    const status = this.getStatus();
    const subscriptionBlockers = unique([
      ...(status.publicKeyConfigured ? [] : ["DATA_WALLET_PUBLIC_KEY_MISSING"]),
      ...(status.publicKeyConfigured && !status.publicKeyValid
        ? ["DATA_WALLET_PUBLIC_KEY_INVALID"]
        : []),
      ...(status.balanceSol !== null && status.balanceSol < status.minBalanceSol
        ? [
            "DATA_WALLET_FUNDS_REQUIRED_FOR_METERED_STREAM",
            "DATA_WALLET_BALANCE_BELOW_MINIMUM"
          ]
        : [])
    ]);

    return {
      configured: status.configured,
      balanceSol: status.balanceSol,
      balanceStatus: status.balanceStatus,
      estimatedEventsRemaining: status.estimatedEventsRemaining,
      reasonCodes: status.reasonCodes,
      subscriptionBlockers
    };
  }

  private getPublicKey(): string | null {
    const publicKey = this.config.publicKey?.trim();
    return publicKey && publicKey.length > 0 ? publicKey : null;
  }

  private isBalanceRefreshDue(): boolean {
    if (!this.balanceState.lastBalanceCheckAt) {
      return true;
    }

    const lastCheckMs = Date.parse(this.balanceState.lastBalanceCheckAt);

    if (!Number.isFinite(lastCheckMs)) {
      return true;
    }

    return Date.now() - lastCheckMs >= this.config.balanceRefreshMs;
  }

  private getBalanceStatus(options: {
    publicKeyConfigured: boolean;
    publicKeyValid: boolean;
  }): PumpPortalDataWalletBalanceStatus {
    if (!this.config.apiKeyConfigured || !options.publicKeyConfigured) {
      return "missing_config";
    }

    if (!options.publicKeyValid) {
      return "missing_config";
    }

    if (this.balanceState.balanceSol === null) {
      return "unknown";
    }

    if (this.balanceState.balanceSol <= this.config.criticalBalanceSol) {
      return "critical";
    }

    if (this.balanceState.balanceSol < this.config.warnBalanceSol) {
      return "low";
    }

    return "ok";
  }

  private getReasonCodes(options: {
    balanceStatus: PumpPortalDataWalletBalanceStatus;
    publicKeyConfigured: boolean;
    publicKeyValid: boolean;
  }): string[] {
    const balanceSol = this.balanceState.balanceSol;
    const balanceKnown = balanceSol !== null;
    const balanceMeetsMinimum =
      balanceKnown && balanceSol >= this.config.minBalanceSol;
    const balanceBelowMinimum =
      balanceKnown && balanceSol < this.config.minBalanceSol;

    return unique([
      ...(this.config.apiKeyConfigured
        ? []
        : [
            "PUMPPORTAL_DATA_API_KEY_MISSING",
            "PUMPPORTAL_API_KEY_MISSING"
          ]),
      ...(options.publicKeyConfigured
        ? []
        : ["DATA_WALLET_PUBLIC_KEY_MISSING"]),
      ...(options.publicKeyConfigured && !options.publicKeyValid
        ? ["DATA_WALLET_PUBLIC_KEY_INVALID"]
        : []),
      ...(this.config.rpcHttpUrl ? [] : ["SOLANA_RPC_CONFIG_MISSING"]),
      ...(options.balanceStatus === "unknown"
        ? ["DATA_WALLET_BALANCE_UNKNOWN", "BALANCE_UNVERIFIED"]
        : []),
      ...(options.balanceStatus === "ok" ? ["DATA_WALLET_BALANCE_OK"] : []),
      ...(options.balanceStatus === "low" ? ["DATA_WALLET_BALANCE_LOW"] : []),
      ...(options.balanceStatus === "critical"
        ? ["DATA_WALLET_BALANCE_CRITICAL"]
        : []),
      ...(balanceBelowMinimum
        ? ["DATA_WALLET_FUNDS_REQUIRED_FOR_METERED_STREAM"]
        : []),
      ...(this.config.apiKeyConfigured &&
      options.publicKeyValid &&
      balanceMeetsMinimum
        ? ["DATA_WALLET_READY"]
        : []),
      "DATA_WALLET_DATA_ONLY",
      "TRADING_DISABLED"
    ]);
  }
}

function shortPublicKey(publicKey: string): string {
  return `${publicKey.slice(0, 8)}...${publicKey.slice(-6)}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
