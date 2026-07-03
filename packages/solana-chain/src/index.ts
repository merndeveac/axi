import {
  Connection,
  PublicKey,
  type Commitment,
  type ConfirmedSignatureInfo,
  type ParsedAccountData,
  type ParsedTransactionWithMeta
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { RiskInput } from "@axi/risk";
import {
  createEmptyTokenIdentity,
  normalizeSolanaMetadataIdentity,
  type TokenIdentity
} from "@axi/token-identity";

export type { Commitment as SolanaRpcCommitment } from "@solana/web3.js";

export type SolanaChainLogger = {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
};

export type NormalizedRpcError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type SolanaRpcClient = {
  getParsedAccountInfo: (
    publicKey: PublicKey,
    commitment?: Commitment
  ) => Promise<{
    value:
      | {
          data: unknown;
          owner?: PublicKey;
        }
      | null;
  }>;
  getParsedTransaction: (
    signature: string,
    config: {
      commitment?: Commitment;
      maxSupportedTransactionVersion: 0;
    }
  ) => Promise<ParsedTransactionWithMeta | null>;
  getSignaturesForAddress: (
    publicKey: PublicKey,
    options?: {
      limit?: number;
    },
    commitment?: Commitment
  ) => Promise<ConfirmedSignatureInfo[]>;
  getTokenLargestAccounts: (
    publicKey: PublicKey,
    commitment?: Commitment
  ) => Promise<{
    value: Array<{
      address: PublicKey | string;
      amount: string;
      decimals: number;
      uiAmount: number | null;
    }>;
  }>;
  getTokenSupply: (
    publicKey: PublicKey,
    commitment?: Commitment
  ) => Promise<{
    value: {
      amount: string;
      decimals: number;
      uiAmount: number | null;
    };
  }>;
};

export type SolanaChainClientOptions = {
  commitment?: Commitment;
  logger?: SolanaChainLogger;
  maxRetries?: number;
  requestTimeoutMs?: number;
  rpcClient?: SolanaRpcClient;
  rpcHttpUrl: string;
};

export type MintInspection = {
  mint: string;
  exists: boolean;
  decimals: number | null;
  supplyRaw: string | null;
  supplyUi: number | null;
  mintAuthorityActive: boolean | null;
  freezeAuthorityActive: boolean | null;
  mintAuthority?: string;
  freezeAuthority?: string;
  ownerProgram?: string;
  inspectedAt: string;
  error?: NormalizedRpcError;
};

export type TokenSupplyInfo = {
  mint: string;
  amountRaw: string;
  decimals: number;
  uiAmount: number;
  inspectedAt: string;
  error?: NormalizedRpcError;
};

export type TokenHolderAccount = {
  address: string;
  amountRaw: string;
  uiAmount: number;
  decimals: number;
  pctOfSupply: number;
  owner?: string | null;
};

export type HolderConcentration = {
  mint: string;
  supplyUi: number;
  topHolderPct: number | null;
  top5HolderPct: number | null;
  top10HolderPct: number | null;
  top20HolderPct: number | null;
  holderAccountCountSampled: number;
  largestAccounts: TokenHolderAccount[];
  inspectedAt: string;
  error?: NormalizedRpcError;
};

export type OnChainRiskInputPatch = Pick<
  RiskInput,
  | "estimatedSellSlippagePct"
  | "freezeAuthorityActive"
  | "holderCount"
  | "liquidityUsd"
  | "mintAuthorityActive"
  | "top10HolderPct"
  | "topHolderPct"
>;

export type OnChainTokenVerification = {
  mint: string;
  mintInspection: MintInspection;
  supply: TokenSupplyInfo | null;
  holderConcentration: HolderConcentration | null;
  riskInputPatch: OnChainRiskInputPatch;
  reasonCodes: string[];
  inspectedAt: string;
  error?: NormalizedRpcError;
};

export type RecentSignaturesResult = {
  address: string;
  signatures: ConfirmedSignatureInfo[];
  inspectedAt: string;
  error?: NormalizedRpcError;
};

export type ParsedTransactionResult = {
  signature: string;
  transaction: ParsedTransactionWithMeta | null;
  inspectedAt: string;
  error?: NormalizedRpcError;
};

export type SolanaTokenMetadata = {
  mint: string;
  name: string | null;
  symbol: string | null;
  metadataUri: string | null;
  updateAuthority: string | null;
  fetchedAt: string;
  reasonCodes: string[];
  raw?: unknown;
  error?: NormalizedRpcError;
};

const defaultCommitment: Commitment = "confirmed";
const defaultRequestTimeoutMs = 10_000;
const defaultMaxRetries = 2;
const topHolderHardRejectPct = 20;
const top10HolderHardRejectPct = 45;
const tokenMetadataProgramId = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export class SolanaChainClient {
  private readonly commitment: Commitment;
  private readonly logger: SolanaChainLogger;
  private readonly maxRetries: number;
  private readonly requestTimeoutMs: number;
  private readonly rpcClient: SolanaRpcClient;

  constructor(options: SolanaChainClientOptions) {
    this.commitment = options.commitment ?? defaultCommitment;
    this.logger = options.logger ?? {};
    this.maxRetries = options.maxRetries ?? defaultMaxRetries;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? defaultRequestTimeoutMs;
    this.rpcClient =
      options.rpcClient ??
      (new Connection(
        options.rpcHttpUrl,
        this.commitment
      ) as unknown as SolanaRpcClient);
  }

  async inspectMint(mint: string): Promise<MintInspection> {
    const inspectedAt = new Date().toISOString();
    const publicKey = parsePublicKey(mint);

    if (!publicKey) {
      return {
        mint,
        exists: false,
        decimals: null,
        supplyRaw: null,
        supplyUi: null,
        mintAuthorityActive: null,
        freezeAuthorityActive: null,
        inspectedAt,
        error: invalidAddressError(mint)
      };
    }

    const accountInfo = await this.callRpc(
      () => this.rpcClient.getParsedAccountInfo(publicKey, this.commitment),
      "getParsedAccountInfo"
    );

    if (!accountInfo.ok) {
      return {
        mint,
        exists: false,
        decimals: null,
        supplyRaw: null,
        supplyUi: null,
        mintAuthorityActive: null,
        freezeAuthorityActive: null,
        inspectedAt,
        error: accountInfo.error
      };
    }

    if (!accountInfo.value.value) {
      return {
        mint,
        exists: false,
        decimals: null,
        supplyRaw: null,
        supplyUi: null,
        mintAuthorityActive: null,
        freezeAuthorityActive: null,
        inspectedAt,
        error: {
          code: "ACCOUNT_NOT_FOUND",
          message: `Mint account ${mint} was not found.`,
          retryable: false
        }
      };
    }

    const ownerProgram = accountInfo.value.value.owner?.toBase58();
    const parsed = parseMintAccountData(accountInfo.value.value.data);

    if (!parsed) {
      return {
        mint,
        exists: true,
        decimals: null,
        supplyRaw: null,
        supplyUi: null,
        mintAuthorityActive: null,
        freezeAuthorityActive: null,
        inspectedAt,
        ...(ownerProgram ? { ownerProgram } : {}),
        error: {
          code: "UNSUPPORTED_ACCOUNT_DATA",
          message: "Mint account data was not parsed as an SPL token mint.",
          retryable: false
        }
      };
    }

    const inspection: MintInspection = {
      mint,
      exists: true,
      decimals: parsed.decimals,
      supplyRaw: parsed.supplyRaw,
      supplyUi: rawToUiNumber(parsed.supplyRaw, parsed.decimals),
      mintAuthorityActive: parsed.mintAuthority !== null,
      freezeAuthorityActive: parsed.freezeAuthority !== null,
      ownerProgram: ownerProgram ?? TOKEN_PROGRAM_ID.toBase58(),
      inspectedAt
    };

    if (parsed.mintAuthority) {
      inspection.mintAuthority = parsed.mintAuthority;
    }

    if (parsed.freezeAuthority) {
      inspection.freezeAuthority = parsed.freezeAuthority;
    }

    return inspection;
  }

  async getTokenSupplyInfo(mint: string): Promise<TokenSupplyInfo> {
    const inspectedAt = new Date().toISOString();
    const publicKey = parsePublicKey(mint);

    if (!publicKey) {
      return {
        mint,
        amountRaw: "0",
        decimals: 0,
        uiAmount: 0,
        inspectedAt,
        error: invalidAddressError(mint)
      };
    }

    const result = await this.callRpc(
      () => this.rpcClient.getTokenSupply(publicKey, this.commitment),
      "getTokenSupply"
    );

    if (!result.ok) {
      return {
        mint,
        amountRaw: "0",
        decimals: 0,
        uiAmount: 0,
        inspectedAt,
        error: result.error
      };
    }

    return {
      mint,
      amountRaw: result.value.value.amount,
      decimals: result.value.value.decimals,
      uiAmount:
        result.value.value.uiAmount ??
        rawToUiNumber(result.value.value.amount, result.value.value.decimals),
      inspectedAt
    };
  }

  async getTopTokenHolders(mint: string): Promise<TokenHolderAccount[]> {
    const publicKey = parsePublicKey(mint);

    if (!publicKey) {
      return [];
    }

    const [largestAccountsResult, supply] = await Promise.all([
      this.callRpc(
        () => this.rpcClient.getTokenLargestAccounts(publicKey, this.commitment),
        "getTokenLargestAccounts"
      ),
      this.getTokenSupplyInfo(mint)
    ]);

    if (!largestAccountsResult.ok || supply.error) {
      return [];
    }

    return largestAccountsResult.value.value.map((account) => ({
      address: toAddressString(account.address),
      amountRaw: account.amount,
      uiAmount:
        account.uiAmount ?? rawToUiNumber(account.amount, account.decimals),
      decimals: account.decimals,
      pctOfSupply: percentOfSupply(account.amount, supply.amountRaw),
      owner: null
    }));
  }

  async getHolderConcentration(mint: string): Promise<HolderConcentration> {
    const inspectedAt = new Date().toISOString();
    const publicKey = parsePublicKey(mint);

    if (!publicKey) {
      return {
        mint,
        supplyUi: 0,
        topHolderPct: null,
        top5HolderPct: null,
        top10HolderPct: null,
        top20HolderPct: null,
        holderAccountCountSampled: 0,
        largestAccounts: [],
        inspectedAt,
        error: invalidAddressError(mint)
      };
    }

    const [largestAccountsResult, supply] = await Promise.all([
      this.callRpc(
        () => this.rpcClient.getTokenLargestAccounts(publicKey, this.commitment),
        "getTokenLargestAccounts"
      ),
      this.getTokenSupplyInfo(mint)
    ]);

    if (!largestAccountsResult.ok) {
      return createHolderConcentrationError({
        error: largestAccountsResult.error,
        inspectedAt,
        mint
      });
    }

    if (supply.error) {
      return createHolderConcentrationError({
        error: supply.error,
        inspectedAt,
        mint
      });
    }

    const largestAccounts = largestAccountsResult.value.value.map((account) => ({
      address: toAddressString(account.address),
      amountRaw: account.amount,
      uiAmount:
        account.uiAmount ?? rawToUiNumber(account.amount, account.decimals),
      decimals: account.decimals,
      pctOfSupply: percentOfSupply(account.amount, supply.amountRaw),
      owner: null
    }));

    return {
      mint,
      supplyUi: supply.uiAmount,
      topHolderPct: sumTopPct(largestAccounts, 1),
      top5HolderPct: sumTopPct(largestAccounts, 5),
      top10HolderPct: sumTopPct(largestAccounts, 10),
      top20HolderPct: sumTopPct(largestAccounts, 20),
      holderAccountCountSampled: largestAccounts.length,
      largestAccounts,
      inspectedAt
    };
  }

  async getRecentSignatures(
    address: string,
    limit = 20
  ): Promise<RecentSignaturesResult> {
    const inspectedAt = new Date().toISOString();
    const publicKey = parsePublicKey(address);

    if (!publicKey) {
      return {
        address,
        signatures: [],
        inspectedAt,
        error: invalidAddressError(address)
      };
    }

    const result = await this.callRpc(
      () =>
        this.rpcClient.getSignaturesForAddress(
          publicKey,
          { limit },
          this.commitment
        ),
      "getSignaturesForAddress"
    );

    return result.ok
      ? {
          address,
          signatures: result.value,
          inspectedAt
        }
      : {
          address,
          signatures: [],
          inspectedAt,
          error: result.error
        };
  }

  async getParsedTransaction(
    signature: string
  ): Promise<ParsedTransactionResult> {
    const inspectedAt = new Date().toISOString();
    const result = await this.callRpc(
      () =>
        this.rpcClient.getParsedTransaction(signature, {
          commitment: this.commitment,
          maxSupportedTransactionVersion: 0
        }),
      "getParsedTransaction"
    );

    return result.ok
      ? {
          signature,
          transaction: result.value,
          inspectedAt
        }
      : {
          signature,
          transaction: null,
          inspectedAt,
          error: result.error
        };
  }

  async verifyTokenOnChain(mint: string): Promise<OnChainTokenVerification> {
    const inspectedAt = new Date().toISOString();
    const mintInspection = await this.inspectMint(mint);

    if (mintInspection.error || !mintInspection.exists) {
      return {
        mint,
        mintInspection,
        supply: null,
        holderConcentration: null,
        riskInputPatch: createEmptyRiskPatch(),
        reasonCodes: ["CHAIN_VERIFICATION_FAILED"],
        inspectedAt,
        ...(mintInspection.error ? { error: mintInspection.error } : {})
      };
    }

    const [supply, holderConcentration] = await Promise.all([
      this.getTokenSupplyInfo(mint),
      this.getHolderConcentration(mint)
    ]);
    const reasonCodes = createVerificationReasonCodes({
      holderConcentration,
      mintInspection,
      supply
    });
    const firstError = supply.error ?? holderConcentration.error;

    return {
      mint,
      mintInspection,
      supply,
      holderConcentration,
      riskInputPatch: {
        mintAuthorityActive: mintInspection.mintAuthorityActive,
        freezeAuthorityActive: mintInspection.freezeAuthorityActive,
        holderCount: null,
        topHolderPct: holderConcentration.topHolderPct,
        top10HolderPct: holderConcentration.top10HolderPct,
        liquidityUsd: null,
        estimatedSellSlippagePct: null
      },
      reasonCodes,
      inspectedAt,
      ...(firstError ? { error: firstError } : {})
    };
  }

  async fetchSolanaTokenMetadata(mint: string): Promise<SolanaTokenMetadata> {
    const fetchedAt = new Date().toISOString();
    const pda = getTokenMetadataPda(mint);

    if (!pda) {
      return {
        mint,
        name: null,
        symbol: null,
        metadataUri: null,
        updateAuthority: null,
        fetchedAt,
        reasonCodes: ["TOKEN_METADATA_INVALID_MINT"],
        error: invalidAddressError(mint)
      };
    }

    const result = await this.callRpc(
      () =>
        this.rpcClient.getParsedAccountInfo(
          new PublicKey(pda),
          this.commitment
        ),
      "getTokenMetadataAccount"
    );

    if (!result.ok) {
      return {
        mint,
        name: null,
        symbol: null,
        metadataUri: null,
        updateAuthority: null,
        fetchedAt,
        reasonCodes: ["TOKEN_METADATA_RPC_FAILED"],
        error: result.error
      };
    }

    if (!result.value.value) {
      return {
        mint,
        name: null,
        symbol: null,
        metadataUri: null,
        updateAuthority: null,
        fetchedAt,
        reasonCodes: ["TOKEN_METADATA_ACCOUNT_NOT_FOUND"],
        error: {
          code: "TOKEN_METADATA_ACCOUNT_NOT_FOUND",
          message: `Token metadata account for ${mint} was not found.`,
          retryable: false
        }
      };
    }

    const parsed = parseSolanaTokenMetadataAccount(result.value.value.data);

    if (!parsed) {
      return {
        mint,
        name: null,
        symbol: null,
        metadataUri: null,
        updateAuthority: null,
        fetchedAt,
        reasonCodes: ["TOKEN_METADATA_PARSE_FAILED"],
        raw: result.value.value.data,
        error: {
          code: "TOKEN_METADATA_PARSE_FAILED",
          message: `Token metadata account for ${mint} could not be parsed.`,
          retryable: false
        }
      };
    }

    return {
      mint,
      name: parsed.name,
      symbol: parsed.symbol,
      metadataUri: parsed.metadataUri,
      updateAuthority: parsed.updateAuthority,
      fetchedAt,
      reasonCodes: unique([
        "TOKEN_METADATA_ACCOUNT_FOUND",
        ...(parsed.name ? ["TOKEN_METADATA_NAME_FOUND"] : []),
        ...(parsed.symbol ? ["TOKEN_METADATA_SYMBOL_FOUND"] : []),
        ...(parsed.metadataUri ? ["TOKEN_METADATA_URI_FOUND"] : [])
      ]),
      raw: result.value.value.data
    };
  }

  async resolveTokenIdentityFromSolana(mint: string): Promise<TokenIdentity> {
    const metadata = await this.fetchSolanaTokenMetadata(mint);

    if (metadata.error || (!metadata.name && !metadata.symbol && !metadata.metadataUri)) {
      const unresolved = createEmptyTokenIdentity(mint);
      return {
        ...unresolved,
        reasonCodes: unique([
          ...unresolved.reasonCodes,
          ...metadata.reasonCodes,
          "TOKEN_IDENTITY_UNRESOLVED"
        ]),
        updatedAt: metadata.fetchedAt
      };
    }

    return normalizeSolanaMetadataIdentity(metadata);
  }

  private async callRpc<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<
    | {
        ok: true;
        value: T;
      }
    | {
        error: NormalizedRpcError;
        ok: false;
      }
  > {
    let lastError: NormalizedRpcError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const value = await withTimeout(operation(), this.requestTimeoutMs);
        return {
          ok: true,
          value
        };
      } catch (error) {
        lastError = normalizeRpcError(error);

        if (!lastError.retryable || attempt >= this.maxRetries) {
          break;
        }

        this.logger.debug?.("Retrying Solana RPC read", {
          attempt: attempt + 1,
          operationName
        });
      }
    }

    return {
      ok: false,
      error:
        lastError ??
        {
          code: "RPC_ERROR",
          message: `${operationName} failed.`,
          retryable: true
        }
    };
  }
}

export function createSolanaChainClient(
  options: SolanaChainClientOptions
): SolanaChainClient {
  return new SolanaChainClient(options);
}

export function isValidSolanaAddress(address: string): boolean {
  return parsePublicKey(address) !== null;
}

export function normalizeRpcError(error: unknown): NormalizedRpcError {
  if (isTimeoutError(error)) {
    return {
      code: "RPC_TIMEOUT",
      message: error.message,
      retryable: true
    };
  }

  if (error instanceof Error) {
    return {
      code: readErrorCode(error) ?? "RPC_ERROR",
      message: error.message,
      retryable: isRetryableMessage(error.message)
    };
  }

  return {
    code: "RPC_ERROR",
    message: String(error),
    retryable: true
  };
}

export async function inspectMint(
  mint: string,
  options: SolanaChainClientOptions
): Promise<MintInspection> {
  return createSolanaChainClient(options).inspectMint(mint);
}

export async function getTokenSupplyInfo(
  mint: string,
  options: SolanaChainClientOptions
): Promise<TokenSupplyInfo> {
  return createSolanaChainClient(options).getTokenSupplyInfo(mint);
}

export async function getTopTokenHolders(
  mint: string,
  options: SolanaChainClientOptions
): Promise<TokenHolderAccount[]> {
  return createSolanaChainClient(options).getTopTokenHolders(mint);
}

export async function getHolderConcentration(
  mint: string,
  options: SolanaChainClientOptions
): Promise<HolderConcentration> {
  return createSolanaChainClient(options).getHolderConcentration(mint);
}

export async function getRecentSignatures(
  address: string,
  limit: number,
  options: SolanaChainClientOptions
): Promise<RecentSignaturesResult> {
  return createSolanaChainClient(options).getRecentSignatures(address, limit);
}

export async function getParsedTransaction(
  signature: string,
  options: SolanaChainClientOptions
): Promise<ParsedTransactionResult> {
  return createSolanaChainClient(options).getParsedTransaction(signature);
}

export async function verifyTokenOnChain(
  mint: string,
  options: SolanaChainClientOptions
): Promise<OnChainTokenVerification> {
  return createSolanaChainClient(options).verifyTokenOnChain(mint);
}

export async function fetchSolanaTokenMetadata(
  mint: string,
  options: SolanaChainClientOptions
): Promise<SolanaTokenMetadata> {
  return createSolanaChainClient(options).fetchSolanaTokenMetadata(mint);
}

export async function resolveTokenIdentityFromSolana(
  mint: string,
  options: SolanaChainClientOptions
): Promise<TokenIdentity> {
  return createSolanaChainClient(options).resolveTokenIdentityFromSolana(mint);
}

export function getTokenMetadataPda(mint: string): string | null {
  const mintPublicKey = parsePublicKey(mint);

  if (!mintPublicKey) {
    return null;
  }

  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      tokenMetadataProgramId.toBuffer(),
      mintPublicKey.toBuffer()
    ],
    tokenMetadataProgramId
  );

  return pda.toBase58();
}

export function parseSolanaTokenMetadataAccount(data: unknown):
  | {
      name: string | null;
      symbol: string | null;
      metadataUri: string | null;
      updateAuthority: string | null;
    }
  | null {
  const buffer = accountDataToBuffer(data);

  if (!buffer || buffer.length < 65) {
    return null;
  }

  try {
    let offset = 1;
    const updateAuthority = new PublicKey(buffer.subarray(offset, offset + 32));
    offset += 32;
    offset += 32;
    const name = readMetadataString(buffer, offset);

    if (!name) {
      return null;
    }

    offset = name.nextOffset;
    const symbol = readMetadataString(buffer, offset);

    if (!symbol) {
      return null;
    }

    offset = symbol.nextOffset;
    const uri = readMetadataString(buffer, offset);

    if (!uri) {
      return null;
    }

    return {
      name: cleanMetadataText(name.value),
      symbol: cleanMetadataText(symbol.value),
      metadataUri: cleanMetadataText(uri.value),
      updateAuthority: updateAuthority.toBase58()
    };
  } catch {
    return null;
  }
}

function accountDataToBuffer(data: unknown): Buffer | null {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  if (Array.isArray(data) && typeof data[0] === "string") {
    return Buffer.from(data[0], data[1] === "base64" ? "base64" : "utf8");
  }

  if (isRecord(data)) {
    const nestedData = data["data"];

    if (Buffer.isBuffer(nestedData)) {
      return nestedData;
    }

    if (nestedData instanceof Uint8Array) {
      return Buffer.from(nestedData);
    }

    if (Array.isArray(nestedData) && typeof nestedData[0] === "string") {
      return Buffer.from(
        nestedData[0],
        nestedData[1] === "base64" ? "base64" : "utf8"
      );
    }
  }

  return null;
}

function readMetadataString(
  buffer: Buffer,
  offset: number
): { nextOffset: number; value: string } | null {
  if (offset + 4 > buffer.length) {
    return null;
  }

  const length = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;

  if (length > 1024 || end > buffer.length) {
    return null;
  }

  return {
    nextOffset: end,
    value: buffer.subarray(start, end).toString("utf8")
  };
}

function cleanMetadataText(value: string): string | null {
  const cleaned = value.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : null;
}

function parsePublicKey(address: string): PublicKey | null {
  try {
    return new PublicKey(address);
  } catch {
    return null;
  }
}

function parseMintAccountData(data: unknown):
  | {
      decimals: number;
      freezeAuthority: string | null;
      mintAuthority: string | null;
      supplyRaw: string;
    }
  | null {
  if (!isParsedAccountData(data) || data.parsed.type !== "mint") {
    return null;
  }

  const info = data.parsed.info;

  if (!isRecord(info)) {
    return null;
  }

  const decimals = readNumber(info["decimals"]);
  const supplyRaw = readString(info["supply"]);

  if (decimals === null || supplyRaw === null) {
    return null;
  }

  return {
    decimals,
    freezeAuthority: readNullableString(info["freezeAuthority"]),
    mintAuthority: readNullableString(info["mintAuthority"]),
    supplyRaw
  };
}

function isParsedAccountData(value: unknown): value is ParsedAccountData {
  return (
    isRecord(value) &&
    typeof value["program"] === "string" &&
    isRecord(value["parsed"]) &&
    typeof value["parsed"]["type"] === "string" &&
    "info" in value["parsed"]
  );
}

function createVerificationReasonCodes(options: {
  holderConcentration: HolderConcentration;
  mintInspection: MintInspection;
  supply: TokenSupplyInfo;
}): string[] {
  const reasonCodes: string[] = [];

  if (!options.mintInspection.error && options.mintInspection.exists) {
    reasonCodes.push("ON_CHAIN_MINT_VERIFIED");
  }

  if (!options.supply.error) {
    reasonCodes.push("ON_CHAIN_SUPPLY_VERIFIED");
  }

  if (!options.holderConcentration.error) {
    reasonCodes.push("ON_CHAIN_HOLDERS_VERIFIED");
  }

  if (options.mintInspection.mintAuthorityActive === true) {
    reasonCodes.push("ON_CHAIN_MINT_AUTHORITY_ACTIVE");
  }

  if (options.mintInspection.freezeAuthorityActive === true) {
    reasonCodes.push("ON_CHAIN_FREEZE_AUTHORITY_ACTIVE");
  }

  if (
    options.holderConcentration.topHolderPct !== null &&
    options.holderConcentration.topHolderPct > topHolderHardRejectPct
  ) {
    reasonCodes.push("ON_CHAIN_TOP_HOLDER_HIGH");
  }

  if (
    options.holderConcentration.top10HolderPct !== null &&
    options.holderConcentration.top10HolderPct > top10HolderHardRejectPct
  ) {
    reasonCodes.push("ON_CHAIN_TOP10_HOLDER_HIGH");
  }

  if (options.supply.error || options.holderConcentration.error) {
    reasonCodes.push("CHAIN_VERIFICATION_FAILED");
  }

  return unique(reasonCodes);
}

function createEmptyRiskPatch(): OnChainRiskInputPatch {
  return {
    mintAuthorityActive: null,
    freezeAuthorityActive: null,
    holderCount: null,
    topHolderPct: null,
    top10HolderPct: null,
    liquidityUsd: null,
    estimatedSellSlippagePct: null
  };
}

function createHolderConcentrationError(options: {
  error: NormalizedRpcError;
  inspectedAt: string;
  mint: string;
}): HolderConcentration {
  return {
    mint: options.mint,
    supplyUi: 0,
    topHolderPct: null,
    top5HolderPct: null,
    top10HolderPct: null,
    top20HolderPct: null,
    holderAccountCountSampled: 0,
    largestAccounts: [],
    inspectedAt: options.inspectedAt,
    error: options.error
  };
}

function invalidAddressError(address: string): NormalizedRpcError {
  return {
    code: "INVALID_SOLANA_ADDRESS",
    message: `${address} is not a valid Solana address.`,
    retryable: false
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new RpcTimeoutError(`Solana RPC read timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

class RpcTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcTimeoutError";
  }
}

function isTimeoutError(error: unknown): error is RpcTimeoutError {
  return error instanceof Error && error.name === "RpcTimeoutError";
}

function isRetryableMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("rate limit") ||
    normalized.includes("429") ||
    normalized.includes("503") ||
    normalized.includes("temporarily") ||
    normalized.includes("econnreset") ||
    normalized.includes("socket")
  );
}

function readErrorCode(error: Error): string | undefined {
  const maybeCode = (error as { code?: unknown }).code;

  return typeof maybeCode === "string" ? maybeCode : undefined;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rawToUiNumber(rawAmount: string, decimals: number): number {
  const raw = Number(rawAmount);

  if (!Number.isFinite(raw)) {
    return 0;
  }

  return raw / 10 ** decimals;
}

function percentOfSupply(amountRaw: string, supplyRaw: string): number {
  try {
    const amount = BigInt(amountRaw);
    const supply = BigInt(supplyRaw);

    if (supply === 0n) {
      return 0;
    }

    return Number((amount * 1_000_000n) / supply) / 10_000;
  } catch {
    return 0;
  }
}

function sumTopPct(accounts: TokenHolderAccount[], count: number): number | null {
  if (accounts.length === 0) {
    return null;
  }

  return Number(
    accounts
      .slice(0, count)
      .reduce((total, account) => total + account.pctOfSupply, 0)
      .toFixed(6)
  );
}

function toAddressString(address: PublicKey | string): string {
  return typeof address === "string" ? address : address.toBase58();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
