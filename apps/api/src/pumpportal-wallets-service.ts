import {
  createSolanaChainClient,
  isValidSolanaAddress,
  type SolanaChainClient,
  type SolanaRpcCommitment
} from "@axi/solana-chain";
import type { PumpPortalWalletStatusSnapshotInput } from "@axi/storage";

export type PumpPortalWalletBalanceStatus =
  | "unknown"
  | "missing_config"
  | "critical"
  | "low"
  | "ok";

export type PumpPortalWalletRole = "data" | "trading";

export type PumpPortalWalletConfig = {
  role: PumpPortalWalletRole;
  apiKeyConfigured: boolean;
  publicKey?: string | undefined;
};

export type PumpPortalWalletsConfig = {
  balanceRefreshMs: number;
  commitment: SolanaRpcCommitment;
  criticalBalanceSol: number;
  dataWallet: PumpPortalWalletConfig;
  minBalanceSol: number;
  requestTimeoutMs: number;
  rpcHttpUrl?: string | undefined;
  sameWalletAllowed: boolean;
  targetBalanceSol: number;
  tradingWallet: PumpPortalWalletConfig;
  warnBalanceSol: number;
};

export type PumpPortalWalletStatus = {
  role: PumpPortalWalletRole;
  configured: boolean;
  apiKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  publicKey: string | null;
  shortPublicKey: string | null;
  publicKeyValid: boolean;
  balanceSol: number | null;
  balanceLamports: number | null;
  balanceStatus: PumpPortalWalletBalanceStatus;
  minBalanceSol: number;
  warnBalanceSol: number;
  criticalBalanceSol: number;
  targetBalanceSol: number;
  lastBalanceCheckAt: string | null;
  lastError: string | null;
  reasonCodes: string[];
};

export type PumpPortalWalletsStatus = {
  dataWallet: PumpPortalWalletStatus;
  tradingWallet: PumpPortalWalletStatus;
  sameWallet: boolean;
  sameWalletWarning: string | null;
  solanaRpcConfigured: boolean;
  paperOnly: true;
  tradingDisabled: true;
  secretFieldsExposed: false;
  reasonCodes: string[];
};

export type PumpPortalWalletFundingInstructions = {
  dataWallet: {
    publicKey: string | null;
    shortPublicKey: string | null;
    purpose: string;
    instructions: string;
  };
  tradingWallet: {
    publicKey: string | null;
    shortPublicKey: string | null;
    purpose: string;
    instructions: string;
  };
  warnings: string[];
  sameWallet: boolean;
  paperOnly: true;
  tradingDisabled: true;
  secretFieldsExposed: false;
};

export type PumpPortalWalletsServiceOptions = {
  config: PumpPortalWalletsConfig;
  solanaClient?: SolanaChainClient;
};

type BalanceState = {
  balanceLamports: number | null;
  balanceSol: number | null;
  lastBalanceCheckAt: string | null;
  lastError: string | null;
};

const emptyBalanceState = (): BalanceState => ({
  balanceLamports: null,
  balanceSol: null,
  lastBalanceCheckAt: null,
  lastError: null
});

export function createPumpPortalWalletsService(
  options: PumpPortalWalletsServiceOptions
): PumpPortalWalletsService {
  return new PumpPortalWalletsService(options);
}

export class PumpPortalWalletsService {
  private readonly config: PumpPortalWalletsConfig;
  private readonly solanaClient: SolanaChainClient | undefined;
  private readonly balanceStates = new Map<PumpPortalWalletRole, BalanceState>([
    ["data", emptyBalanceState()],
    ["trading", emptyBalanceState()]
  ]);

  constructor(options: PumpPortalWalletsServiceOptions) {
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

  getStatus(): PumpPortalWalletsStatus {
    const dataWallet = this.getWalletStatus(this.config.dataWallet);
    const tradingWallet = this.getWalletStatus(this.config.tradingWallet);
    const sameWallet = this.isSameWallet(dataWallet, tradingWallet);
    const reasonCodes = unique([
      ...dataWallet.reasonCodes,
      ...tradingWallet.reasonCodes,
      ...(sameWallet ? ["LIGHTNING_SHARED_WALLET_WARNING"] : []),
      "TRADING_DISABLED"
    ]);

    return {
      dataWallet,
      tradingWallet,
      sameWallet,
      sameWalletWarning: sameWallet
        ? "Same hot wallet is configured for metered data billing and future Lightning trading. Keep funds tiny."
        : null,
      solanaRpcConfigured: Boolean(this.config.rpcHttpUrl),
      paperOnly: true,
      tradingDisabled: true,
      secretFieldsExposed: false,
      reasonCodes
    };
  }

  async refreshBalances(options: { force?: boolean } = {}) {
    await Promise.all([
      this.refreshWalletBalance(this.config.dataWallet, options),
      this.refreshWalletBalance(this.config.tradingWallet, options)
    ]);

    return this.getStatus();
  }

  getFundingInstructions(): PumpPortalWalletFundingInstructions {
    const status = this.getStatus();

    return {
      dataWallet: {
        publicKey: status.dataWallet.publicKey,
        shortPublicKey: status.dataWallet.shortPublicKey,
        purpose: "metered PumpPortal WebSocket data streams",
        instructions:
          "Fund this public address only with the small SOL amount needed for metered data messages."
      },
      tradingWallet: {
        publicKey: status.tradingWallet.publicKey,
        shortPublicKey: status.tradingWallet.shortPublicKey,
        purpose: "future PumpPortal Lightning execution readiness",
        instructions:
          "Fund this public address only with a tiny future-execution test balance. AXI does not execute trades yet."
      },
      warnings: [
        "Hot wallet infrastructure: keep balances tiny.",
        "AXI does not store private keys.",
        "AXI does not expose API keys to the frontend.",
        "AXI does not execute trades yet.",
        ...(status.sameWallet
          ? [
              "Same wallet is configured for data billing and future trading; separate wallets are recommended."
            ]
          : [])
      ],
      sameWallet: status.sameWallet,
      paperOnly: true,
      tradingDisabled: true,
      secretFieldsExposed: false
    };
  }

  toStorageSnapshot(): PumpPortalWalletStatusSnapshotInput {
    const status = this.getStatus();

    return {
      dataWalletPublicKey: status.dataWallet.publicKey,
      tradingWalletPublicKey: status.tradingWallet.publicKey,
      sameWallet: status.sameWallet,
      dataWalletBalanceSol: status.dataWallet.balanceSol,
      tradingWalletBalanceSol: status.tradingWallet.balanceSol,
      dataWalletStatus: status.dataWallet.balanceStatus,
      tradingWalletStatus: status.tradingWallet.balanceStatus,
      reasonCodes: status.reasonCodes,
      payload: status
    };
  }

  private async refreshWalletBalance(
    wallet: PumpPortalWalletConfig,
    options: { force?: boolean }
  ): Promise<void> {
    const publicKey = getPublicKey(wallet.publicKey);

    if (!publicKey || !isValidSolanaAddress(publicKey) || !this.solanaClient) {
      return;
    }

    if (!options.force && !this.isBalanceRefreshDue(wallet.role)) {
      return;
    }

    const result = await this.solanaClient.getSolBalance(publicKey);
    this.balanceStates.set(wallet.role, {
      balanceLamports: result.balanceLamports,
      balanceSol: result.balanceSol,
      lastBalanceCheckAt: result.inspectedAt,
      lastError: result.error
        ? `${result.error.code}: ${result.error.message}`
        : null
    });
  }

  private getWalletStatus(wallet: PumpPortalWalletConfig): PumpPortalWalletStatus {
    const publicKey = getPublicKey(wallet.publicKey);
    const publicKeyConfigured = publicKey !== null;
    const publicKeyValid =
      publicKeyConfigured && isValidSolanaAddress(publicKey);
    const balanceState = this.balanceStates.get(wallet.role) ?? emptyBalanceState();
    const balanceStatus = this.getBalanceStatus({
      apiKeyConfigured: wallet.apiKeyConfigured,
      balanceSol: balanceState.balanceSol,
      publicKeyConfigured,
      publicKeyValid
    });
    const reasonCodes = this.getWalletReasonCodes({
      apiKeyConfigured: wallet.apiKeyConfigured,
      balanceStatus,
      balanceSol: balanceState.balanceSol,
      publicKeyConfigured,
      publicKeyValid,
      role: wallet.role
    });

    return {
      role: wallet.role,
      configured: wallet.apiKeyConfigured && publicKeyValid,
      apiKeyConfigured: wallet.apiKeyConfigured,
      publicKeyConfigured,
      publicKey,
      shortPublicKey: publicKey ? shortPublicKey(publicKey) : null,
      publicKeyValid,
      balanceSol: balanceState.balanceSol,
      balanceLamports: balanceState.balanceLamports,
      balanceStatus,
      minBalanceSol: this.config.minBalanceSol,
      warnBalanceSol: this.config.warnBalanceSol,
      criticalBalanceSol: this.config.criticalBalanceSol,
      targetBalanceSol: this.config.targetBalanceSol,
      lastBalanceCheckAt: balanceState.lastBalanceCheckAt,
      lastError: balanceState.lastError,
      reasonCodes
    };
  }

  private getBalanceStatus(options: {
    apiKeyConfigured: boolean;
    balanceSol: number | null;
    publicKeyConfigured: boolean;
    publicKeyValid: boolean;
  }): PumpPortalWalletBalanceStatus {
    if (
      !options.apiKeyConfigured ||
      !options.publicKeyConfigured ||
      !options.publicKeyValid
    ) {
      return "missing_config";
    }

    if (options.balanceSol === null) {
      return "unknown";
    }

    if (options.balanceSol <= this.config.criticalBalanceSol) {
      return "critical";
    }

    if (options.balanceSol < this.config.warnBalanceSol) {
      return "low";
    }

    return "ok";
  }

  private getWalletReasonCodes(options: {
    apiKeyConfigured: boolean;
    balanceSol: number | null;
    balanceStatus: PumpPortalWalletBalanceStatus;
    publicKeyConfigured: boolean;
    publicKeyValid: boolean;
    role: PumpPortalWalletRole;
  }): string[] {
    if (options.role === "data") {
      return unique([
        ...(options.apiKeyConfigured ? [] : ["PUMPPORTAL_API_KEY_MISSING"]),
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
        ...(options.balanceSol !== null &&
        options.balanceSol < this.config.minBalanceSol
          ? ["DATA_WALLET_FUNDS_REQUIRED_FOR_METERED_STREAM"]
          : []),
        ...(options.apiKeyConfigured &&
        options.publicKeyValid &&
        options.balanceSol !== null &&
        options.balanceSol >= this.config.minBalanceSol
          ? ["DATA_WALLET_READY"]
          : []),
        "DATA_WALLET_DATA_ONLY"
      ]);
    }

    return unique([
      ...(options.apiKeyConfigured ? [] : ["LIGHTNING_API_KEY_MISSING"]),
      ...(options.publicKeyConfigured ? [] : ["LIGHTNING_PUBLIC_KEY_MISSING"]),
      ...(options.publicKeyConfigured && !options.publicKeyValid
        ? ["LIGHTNING_PUBLIC_KEY_INVALID"]
        : []),
      ...(this.config.rpcHttpUrl ? [] : ["SOLANA_RPC_CONFIG_MISSING"]),
      ...(options.balanceStatus === "unknown"
        ? ["LIGHTNING_BALANCE_UNKNOWN"]
        : []),
      ...(options.balanceStatus === "ok" ? ["LIGHTNING_BALANCE_READY"] : []),
      ...(options.balanceStatus === "low" ||
      options.balanceStatus === "critical"
        ? ["LIGHTNING_BALANCE_LOW"]
        : []),
      ...(options.apiKeyConfigured &&
      options.publicKeyValid &&
      options.balanceSol !== null &&
      options.balanceSol >= this.config.minBalanceSol
        ? ["LIGHTNING_BALANCE_READY"]
        : [])
    ]);
  }

  private isBalanceRefreshDue(role: PumpPortalWalletRole): boolean {
    const lastBalanceCheckAt = this.balanceStates.get(role)?.lastBalanceCheckAt;

    if (!lastBalanceCheckAt) {
      return true;
    }

    const lastCheckMs = Date.parse(lastBalanceCheckAt);

    if (!Number.isFinite(lastCheckMs)) {
      return true;
    }

    return Date.now() - lastCheckMs >= this.config.balanceRefreshMs;
  }

  private isSameWallet(
    dataWallet: PumpPortalWalletStatus,
    tradingWallet: PumpPortalWalletStatus
  ): boolean {
    return Boolean(
      this.config.sameWalletAllowed ||
        (dataWallet.publicKey &&
          tradingWallet.publicKey &&
          dataWallet.publicKey === tradingWallet.publicKey)
    );
  }
}

export function createPumpPortalWalletsConfig(
  input: Partial<PumpPortalWalletsConfig> = {}
): PumpPortalWalletsConfig {
  return {
    balanceRefreshMs: input.balanceRefreshMs ?? 15_000,
    commitment: input.commitment ?? "confirmed",
    criticalBalanceSol: input.criticalBalanceSol ?? 0.02,
    dataWallet: input.dataWallet ?? {
      role: "data",
      apiKeyConfigured: false
    },
    minBalanceSol: input.minBalanceSol ?? 0.02,
    requestTimeoutMs: input.requestTimeoutMs ?? 10_000,
    sameWalletAllowed: input.sameWalletAllowed ?? false,
    targetBalanceSol: input.targetBalanceSol ?? 0.05,
    tradingWallet: input.tradingWallet ?? {
      role: "trading",
      apiKeyConfigured: false
    },
    warnBalanceSol: input.warnBalanceSol ?? 0.03,
    ...(input.rpcHttpUrl !== undefined ? { rpcHttpUrl: input.rpcHttpUrl } : {})
  };
}

function getPublicKey(publicKey: string | undefined): string | null {
  const trimmed = publicKey?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function shortPublicKey(publicKey: string): string {
  return `${publicKey.slice(0, 8)}...${publicKey.slice(-6)}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
