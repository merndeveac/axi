import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  SolanaChainClient,
  isValidSolanaAddress,
  type SolanaRpcClient
} from "../src/index";

const mint = "So11111111111111111111111111111111111111112";

describe("@axi/solana-chain", () => {
  it("validates Solana addresses without RPC", () => {
    expect(isValidSolanaAddress(mint)).toBe(true);
    expect(isValidSolanaAddress("INVALID_MINT")).toBe(false);
  });

  it("returns a structured invalid-address result", async () => {
    const rpcClient = createRpcClient();
    const client = new SolanaChainClient({
      rpcClient,
      rpcHttpUrl: "http://localhost:8899"
    });

    const result = await client.inspectMint("INVALID_MINT");

    expect(result.exists).toBe(false);
    expect(result.error?.code).toBe("INVALID_SOLANA_ADDRESS");
    expect(rpcClient.getParsedAccountInfo).not.toHaveBeenCalled();
  });

  it("inspects parsed mint authorities", async () => {
    const client = new SolanaChainClient({
      rpcClient: createRpcClient({
        freezeAuthority: "Freeze111111111111111111111111111111111111",
        mintAuthority: "MintAuth1111111111111111111111111111111111"
      }),
      rpcHttpUrl: "http://localhost:8899"
    });

    const result = await client.inspectMint(mint);

    expect(result.exists).toBe(true);
    expect(result.decimals).toBe(6);
    expect(result.supplyUi).toBe(1000);
    expect(result.mintAuthorityActive).toBe(true);
    expect(result.freezeAuthorityActive).toBe(true);
  });

  it("reads token supply info", async () => {
    const client = new SolanaChainClient({
      rpcClient: createRpcClient(),
      rpcHttpUrl: "http://localhost:8899"
    });

    const result = await client.getTokenSupplyInfo(mint);

    expect(result.amountRaw).toBe("1000000000");
    expect(result.decimals).toBe(6);
    expect(result.uiAmount).toBe(1000);
  });

  it("computes holder concentration from largest accounts", async () => {
    const client = new SolanaChainClient({
      rpcClient: createRpcClient({
        largestAccounts: [
          { amount: "300000000", decimals: 6, uiAmount: 300 },
          { amount: "100000000", decimals: 6, uiAmount: 100 },
          { amount: "70000000", decimals: 6, uiAmount: 70 }
        ]
      }),
      rpcHttpUrl: "http://localhost:8899"
    });

    const result = await client.getHolderConcentration(mint);

    expect(result.topHolderPct).toBe(30);
    expect(result.top5HolderPct).toBe(47);
    expect(result.top10HolderPct).toBe(47);
    expect(result.largestAccounts).toHaveLength(3);
  });

  it("handles zero supply safely", async () => {
    const client = new SolanaChainClient({
      rpcClient: createRpcClient({
        supplyAmount: "0",
        largestAccounts: [{ amount: "100", decimals: 6, uiAmount: 0.0001 }]
      }),
      rpcHttpUrl: "http://localhost:8899"
    });

    const result = await client.getHolderConcentration(mint);

    expect(result.topHolderPct).toBe(0);
  });

  it("verifies a token and builds a risk patch", async () => {
    const client = new SolanaChainClient({
      rpcClient: createRpcClient({
        largestAccounts: [
          { amount: "300000000", decimals: 6, uiAmount: 300 },
          { amount: "100000000", decimals: 6, uiAmount: 100 },
          { amount: "70000000", decimals: 6, uiAmount: 70 }
        ],
        mintAuthority: "MintAuth1111111111111111111111111111111111"
      }),
      rpcHttpUrl: "http://localhost:8899"
    });

    const result = await client.verifyTokenOnChain(mint);

    expect(result.reasonCodes).toContain("ON_CHAIN_MINT_VERIFIED");
    expect(result.reasonCodes).toContain("ON_CHAIN_SUPPLY_VERIFIED");
    expect(result.reasonCodes).toContain("ON_CHAIN_HOLDERS_VERIFIED");
    expect(result.reasonCodes).toContain("ON_CHAIN_MINT_AUTHORITY_ACTIVE");
    expect(result.reasonCodes).toContain("ON_CHAIN_TOP_HOLDER_HIGH");
    expect(result.riskInputPatch.mintAuthorityActive).toBe(true);
    expect(result.riskInputPatch.topHolderPct).toBe(30);
  });

  it("normalizes RPC errors without throwing", async () => {
    const client = new SolanaChainClient({
      maxRetries: 0,
      rpcClient: createRpcClient({
        tokenSupplyError: new Error("429 rate limit")
      }),
      rpcHttpUrl: "http://localhost:8899"
    });

    const result = await client.getTokenSupplyInfo(mint);

    expect(result.error?.code).toBe("RPC_ERROR");
    expect(result.error?.retryable).toBe(true);
  });
});

function createRpcClient(options: {
  freezeAuthority?: string | null;
  largestAccounts?: Array<{
    amount: string;
    decimals: number;
    uiAmount: number | null;
  }>;
  mintAuthority?: string | null;
  supplyAmount?: string;
  tokenSupplyError?: Error;
} = {}): SolanaRpcClient {
  const decimals = 6;
  const supplyAmount = options.supplyAmount ?? "1000000000";

  return {
    getParsedAccountInfo: vi.fn(async () => ({
      value: {
        data: {
          program: "spl-token",
          parsed: {
            type: "mint",
            info: {
              decimals,
              freezeAuthority: options.freezeAuthority ?? null,
              mintAuthority: options.mintAuthority ?? null,
              supply: supplyAmount
            }
          }
        },
        owner: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
      }
    })),
    getParsedTransaction: vi.fn(async () => null),
    getSignaturesForAddress: vi.fn(async () => []),
    getTokenLargestAccounts: vi.fn(async () => ({
      value: (options.largestAccounts ?? [
        { amount: "100000000", decimals, uiAmount: 100 }
      ]).map((account, index) => ({
        address: new PublicKey(index + 1),
        ...account
      }))
    })),
    getTokenSupply: vi.fn(async () => {
      if (options.tokenSupplyError) {
        throw options.tokenSupplyError;
      }

      return {
        value: {
          amount: supplyAmount,
          decimals,
          uiAmount: Number(supplyAmount) / 10 ** decimals
        }
      };
    })
  };
}
