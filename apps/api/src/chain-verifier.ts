import {
  createSolanaChainClient,
  isValidSolanaAddress,
  type NormalizedRpcError,
  type OnChainRiskInputPatch,
  type OnChainTokenVerification,
  type SolanaChainClient,
  type SolanaChainLogger,
  type SolanaRpcCommitment
} from "@axi/solana-chain";
import type { FeedEvent } from "@axi/data-feeds";
import type { ChainVerificationSummary } from "@axi/shared";
import type { ChainVerificationInput } from "@axi/storage";

export type ChainVerifierOptions = {
  cacheTtlMs?: number;
  commitment?: SolanaRpcCommitment;
  enabled?: boolean;
  logger?: SolanaChainLogger;
  maxConcurrent?: number;
  onMigration?: boolean;
  onMock?: boolean;
  onNewToken?: boolean;
  requestTimeoutMs?: number;
  rpcHttpUrl?: string;
  solanaClient?: SolanaChainClient;
};

export type ChainVerifierRuntimeStatus =
  | "disabled"
  | "config_error"
  | "ready";

export type ChainVerifierStatus = {
  cacheSize: number;
  cacheTtlMs: number;
  commitment: SolanaRpcCommitment;
  configured: boolean;
  enabled: boolean;
  inFlightCount: number;
  maxConcurrent: number;
  onMigration: boolean;
  onMock: boolean;
  onNewToken: boolean;
  paperOnly: true;
  requestTimeoutMs: number;
  rpcHttpUrlConfigured: boolean;
  status: ChainVerifierRuntimeStatus;
};

export type ChainVerificationRecord = {
  mint: string;
  status: "verified" | "failed";
  reasonCodes: string[];
  riskInputPatch: OnChainRiskInputPatch;
  summary: ChainVerificationSummary;
  payload: OnChainTokenVerification;
  inspectedAt: string;
  error?: NormalizedRpcError;
};

type CacheEntry = {
  expiresAt: number;
  record: ChainVerificationRecord;
};

type QueueTask = {
  mint: string;
  reject: (error: unknown) => void;
  resolve: (record: ChainVerificationRecord) => void;
};

const defaultCommitment: SolanaRpcCommitment = "confirmed";
const defaultRequestTimeoutMs = 10_000;
const defaultCacheTtlMs = 60_000;
const defaultMaxConcurrent = 2;

export class ChainVerifierService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pendingRequests = new Map<
    string,
    Promise<ChainVerificationRecord>
  >();
  private readonly queue: QueueTask[] = [];
  private readonly client: SolanaChainClient | undefined;
  private readonly options: Required<
    Pick<
      ChainVerifierOptions,
      | "cacheTtlMs"
      | "commitment"
      | "enabled"
      | "maxConcurrent"
      | "onMigration"
      | "onMock"
      | "onNewToken"
      | "requestTimeoutMs"
    >
  > & {
    rpcHttpUrl?: string;
  };
  private activeCount = 0;

  constructor(options: ChainVerifierOptions = {}) {
    this.options = {
      cacheTtlMs: options.cacheTtlMs ?? defaultCacheTtlMs,
      commitment: options.commitment ?? defaultCommitment,
      enabled: options.enabled ?? false,
      maxConcurrent: Math.max(1, options.maxConcurrent ?? defaultMaxConcurrent),
      onMigration: options.onMigration ?? true,
      onMock: options.onMock ?? false,
      onNewToken: options.onNewToken ?? true,
      requestTimeoutMs: options.requestTimeoutMs ?? defaultRequestTimeoutMs
    };

    if (options.rpcHttpUrl) {
      this.options.rpcHttpUrl = options.rpcHttpUrl;
    }

    this.client =
      options.solanaClient ??
      (options.rpcHttpUrl
        ? createSolanaChainClient({
            commitment: this.options.commitment,
            requestTimeoutMs: this.options.requestTimeoutMs,
            rpcHttpUrl: options.rpcHttpUrl,
            ...(options.logger ? { logger: options.logger } : {})
          })
        : undefined);
  }

  getStatus(): ChainVerifierStatus {
    return {
      cacheSize: this.cache.size,
      cacheTtlMs: this.options.cacheTtlMs,
      commitment: this.options.commitment,
      configured: Boolean(this.client),
      enabled: this.options.enabled,
      inFlightCount: this.activeCount,
      maxConcurrent: this.options.maxConcurrent,
      onMigration: this.options.onMigration,
      onMock: this.options.onMock,
      onNewToken: this.options.onNewToken,
      paperOnly: true,
      requestTimeoutMs: this.options.requestTimeoutMs,
      rpcHttpUrlConfigured: Boolean(this.options.rpcHttpUrl),
      status: this.getRuntimeStatus()
    };
  }

  shouldVerifyFeedEvent(event: FeedEvent): boolean {
    if (this.getRuntimeStatus() !== "ready") {
      return false;
    }

    if (event.source === "mock") {
      return this.options.onMock;
    }

    if (event.source === "pumpportal") {
      if (event.rawSourceEventType === "migration") {
        return this.options.onMigration;
      }

      return event.type === "token_created" && this.options.onNewToken;
    }

    return false;
  }

  getCached(mint: string): ChainVerificationRecord | undefined {
    const cached = this.cache.get(mint);

    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(mint);
      return undefined;
    }

    return cached.record;
  }

  async verifyMint(mint: string): Promise<ChainVerificationRecord> {
    const runtimeStatus = this.getRuntimeStatus();

    if (runtimeStatus === "disabled") {
      throw new ChainVerifierUnavailableError(
        "CHAIN_VERIFIER_DISABLED",
        "Chain verifier is disabled."
      );
    }

    if (runtimeStatus === "config_error" || !this.client) {
      throw new ChainVerifierUnavailableError(
        "CHAIN_VERIFIER_CONFIG_MISSING_RPC",
        "Set SOLANA_RPC_HTTP to use the read-only chain verifier."
      );
    }

    const cached = this.getCached(mint);

    if (cached) {
      return cached;
    }

    const pending = this.pendingRequests.get(mint);

    if (pending) {
      return pending;
    }

    if (!isValidSolanaAddress(mint)) {
      const inspectedAt = new Date().toISOString();
      return this.cacheRecord({
        mint,
        status: "failed",
        reasonCodes: ["INVALID_SOLANA_ADDRESS", "CHAIN_VERIFICATION_FAILED"],
        riskInputPatch: createEmptyRiskPatch(),
        summary: {
          mint,
          status: "failed",
          reasonCodes: ["INVALID_SOLANA_ADDRESS", "CHAIN_VERIFICATION_FAILED"],
          inspectedAt,
          errorCode: "INVALID_SOLANA_ADDRESS",
          errorMessage: `${mint} is not a valid Solana address.`
        },
        payload: createFailedVerificationPayload({
          error: {
            code: "INVALID_SOLANA_ADDRESS",
            message: `${mint} is not a valid Solana address.`,
            retryable: false
          },
          inspectedAt,
          mint
        }),
        inspectedAt,
        error: {
          code: "INVALID_SOLANA_ADDRESS",
          message: `${mint} is not a valid Solana address.`,
          retryable: false
        }
      });
    }

    const pendingRequest = new Promise<ChainVerificationRecord>((resolve, reject) => {
      this.queue.push({ mint, reject, resolve });
      this.drainQueue();
    });

    this.pendingRequests.set(mint, pendingRequest);

    void pendingRequest.then(
      () => {
        this.pendingRequests.delete(mint);
      },
      () => {
        this.pendingRequests.delete(mint);
      }
    );

    return pendingRequest;
  }

  toStorageInput(record: ChainVerificationRecord): ChainVerificationInput {
    return {
      mint: record.mint,
      status: record.status,
      reasonCodes: record.reasonCodes,
      mintAuthorityActive: record.summary.mintAuthorityActive ?? null,
      freezeAuthorityActive: record.summary.freezeAuthorityActive ?? null,
      supplyUi: record.summary.supplyUi ?? null,
      topHolderPct: record.summary.topHolderPct ?? null,
      top10HolderPct: record.summary.top10HolderPct ?? null,
      payload: record.payload,
      inspectedAt: record.inspectedAt
    };
  }

  private drainQueue(): void {
    while (
      this.activeCount < this.options.maxConcurrent &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift();

      if (!task) {
        return;
      }

      const cached = this.getCached(task.mint);

      if (cached) {
        task.resolve(cached);
        continue;
      }

      this.activeCount += 1;
      void this.runTask(task);
    }
  }

  private async runTask(task: QueueTask): Promise<void> {
    try {
      if (!this.client) {
        throw new ChainVerifierUnavailableError(
          "CHAIN_VERIFIER_CONFIG_MISSING_RPC",
          "Set SOLANA_RPC_HTTP to use the read-only chain verifier."
        );
      }

      const verification = await this.client.verifyTokenOnChain(task.mint);
      const record = this.cacheRecord(toRecord(verification));
      task.resolve(record);
    } catch (error) {
      task.reject(error);
    } finally {
      this.activeCount -= 1;
      this.drainQueue();
    }
  }

  private cacheRecord(record: ChainVerificationRecord): ChainVerificationRecord {
    this.cache.set(record.mint, {
      expiresAt: Date.now() + this.options.cacheTtlMs,
      record
    });
    return record;
  }

  private getRuntimeStatus(): ChainVerifierRuntimeStatus {
    if (!this.options.enabled) {
      return "disabled";
    }

    if (!this.client) {
      return "config_error";
    }

    return "ready";
  }
}

export class ChainVerifierUnavailableError extends Error {
  readonly code: "CHAIN_VERIFIER_CONFIG_MISSING_RPC" | "CHAIN_VERIFIER_DISABLED";

  constructor(
    code: "CHAIN_VERIFIER_CONFIG_MISSING_RPC" | "CHAIN_VERIFIER_DISABLED",
    message: string
  ) {
    super(message);
    this.name = "ChainVerifierUnavailableError";
    this.code = code;
  }
}

export function createChainVerifierService(
  options: ChainVerifierOptions = {}
): ChainVerifierService {
  return new ChainVerifierService(options);
}

function toRecord(
  verification: OnChainTokenVerification
): ChainVerificationRecord {
  const status = verification.error ? "failed" : "verified";
  const reasonCodes = verification.reasonCodes.length
    ? verification.reasonCodes
    : status === "verified"
      ? ["ON_CHAIN_MINT_VERIFIED"]
      : ["CHAIN_VERIFICATION_FAILED"];
  const summary: ChainVerificationSummary = {
    mint: verification.mint,
    status,
    reasonCodes,
    inspectedAt: verification.inspectedAt,
    mintAuthorityActive: verification.mintInspection.mintAuthorityActive,
    freezeAuthorityActive: verification.mintInspection.freezeAuthorityActive,
    supplyUi: verification.supply?.uiAmount ?? null,
    topHolderPct: verification.holderConcentration?.topHolderPct ?? null,
    top10HolderPct: verification.holderConcentration?.top10HolderPct ?? null
  };

  if (verification.error) {
    summary.errorCode = verification.error.code;
    summary.errorMessage = verification.error.message;
  }

  return {
    mint: verification.mint,
    status,
    reasonCodes,
    riskInputPatch: verification.riskInputPatch,
    summary,
    payload: verification,
    inspectedAt: verification.inspectedAt,
    ...(verification.error ? { error: verification.error } : {})
  };
}

function createFailedVerificationPayload(options: {
  error: NormalizedRpcError;
  inspectedAt: string;
  mint: string;
}): OnChainTokenVerification {
  return {
    mint: options.mint,
    mintInspection: {
      mint: options.mint,
      exists: false,
      decimals: null,
      supplyRaw: null,
      supplyUi: null,
      mintAuthorityActive: null,
      freezeAuthorityActive: null,
      inspectedAt: options.inspectedAt,
      error: options.error
    },
    supply: null,
    holderConcentration: null,
    riskInputPatch: createEmptyRiskPatch(),
    reasonCodes: ["INVALID_SOLANA_ADDRESS", "CHAIN_VERIFICATION_FAILED"],
    inspectedAt: options.inspectedAt,
    error: options.error
  };
}

function createEmptyRiskPatch(): OnChainRiskInputPatch {
  return {
    estimatedSellSlippagePct: null,
    freezeAuthorityActive: null,
    holderCount: null,
    liquidityUsd: null,
    mintAuthorityActive: null,
    top10HolderPct: null,
    topHolderPct: null
  };
}
