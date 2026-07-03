import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  WatchedAddressRegistryError,
  classifyPossibleTrade,
  createBackfillScanner,
  createSolanaTransactionIngestor,
  createWatchedAddressRegistry,
  extractSolBalanceChanges,
  extractTokenBalanceChanges,
  normalizeTransactionToChainEvents,
  type ChainTransactionEvent,
  type NormalizedChainTradeEvent,
  type SolanaRpcClient
} from "../src/index";

const walletAddress = "11111111111111111111111111111111";
const mint = "So11111111111111111111111111111111111111112";
const secondAddress = "Sysvar1111111111111111111111111111111111111";
const signature =
  "5NfL6eiYVQhnL5rtZJkR2Jqg7YbNLsC6Gc8a5YVwWnSb1E4qMvERqE1mUu3PF4aZ75xMwHj7pFaGgQ8z7R5dHnNU";

describe("@axi/chain-events", () => {
  it("watched address registry adds, removes, and lists addresses", () => {
    const registry = createWatchedAddressRegistry();
    const watched = registry.add({
      address: walletAddress,
      kind: "wallet",
      label: "system",
      reasonCodes: ["TEST_WATCH"]
    });

    expect(watched.address).toBe(walletAddress);
    expect(watched.kind).toBe("wallet");
    expect(registry.list()).toHaveLength(1);
    expect(registry.remove(walletAddress)).toBe(true);
    expect(registry.list()).toHaveLength(0);
  });

  it("max watch limit is enforced", () => {
    const registry = createWatchedAddressRegistry({
      maxWatchedAddresses: 1
    });

    registry.add({ address: walletAddress });

    expect(() => registry.add({ address: secondAddress })).toThrow(
      WatchedAddressRegistryError
    );
  });

  it("invalid address is rejected", () => {
    const registry = createWatchedAddressRegistry();

    expect(() => registry.add({ address: "INVALID_ADDRESS" })).toThrow(
      "not a valid Solana address"
    );
  });

  it("extracts token balance changes from mocked parsed transactions", () => {
    const changes = extractTokenBalanceChanges(createParsedTransaction());

    expect(changes).toHaveLength(1);
    expect(changes[0]?.mint).toBe(mint);
    expect(changes[0]?.preAmountRaw).toBe("0");
    expect(changes[0]?.postAmountRaw).toBe("2500000");
    expect(changes[0]?.deltaRaw).toBe("2500000");
    expect(changes[0]?.deltaUiAmount).toBe(2.5);
  });

  it("extracts SOL balance changes from mocked parsed transactions", () => {
    const changes = extractSolBalanceChanges(createParsedTransaction());

    expect(changes).toHaveLength(2);
    expect(changes[0]?.account).toBe(walletAddress);
    expect(changes[0]?.deltaSol).toBe(-1);
    expect(changes[1]?.deltaSol).toBe(1);
  });

  it("unknown transaction becomes an unclassified chain event", () => {
    const [event] = normalizeTransactionToChainEvents({
      signature,
      transaction: createParsedTransaction({
        postBalances: [1_000_000_000],
        preBalances: [1_000_000_000],
        postTokenAmount: "0",
        preTokenAmount: "0"
      }),
      watchedAddress: createWatchedAddress()
    });

    expect(event?.status).toBe("unclassified");
    expect(event?.reasonCodes).toContain("UNCLASSIFIED_TRANSACTION");
  });

  it("classifies possible buys only with enough evidence", () => {
    const trade = classifyPossibleTrade({
      signature,
      transaction: createParsedTransaction(),
      watchedAddress: createWatchedAddress()
    });

    expect(trade?.side).toBe("buy");
    expect(trade?.confidence).toBe("medium");
    expect(trade?.reasonCodes).toContain("POSSIBLE_TOKEN_BUY");
    expect(trade?.priceUsd).toBeNull();
    expect(trade?.volumeUsd).toBeNull();
    expect(trade?.reasonCodes).toContain("INSUFFICIENT_PRICE_DATA");
  });

  it("classifies possible sells only with enough evidence", () => {
    const trade = classifyPossibleTrade({
      signature,
      transaction: createParsedTransaction({
        postBalances: [2_000_000_000, 1_000_000_000],
        preBalances: [1_000_000_000, 2_000_000_000],
        postTokenAmount: "0",
        preTokenAmount: "2500000"
      }),
      watchedAddress: createWatchedAddress()
    });

    expect(trade?.side).toBe("sell");
    expect(trade?.confidence).toBe("medium");
    expect(trade?.reasonCodes).toContain("POSSIBLE_TOKEN_SELL");
  });

  it("keeps low-confidence trade observations low", () => {
    const trade = classifyPossibleTrade({
      signature,
      transaction: createParsedTransaction({
        postBalances: [1_000_000_000, 1_000_000_000],
        preBalances: [1_000_000_000, 1_000_000_000]
      }),
      watchedAddress: createWatchedAddress()
    });

    expect(trade?.side).toBe("unknown");
    expect(trade?.confidence).toBe("low");
    expect(trade?.reasonCodes).toContain("TRADE_SIDE_UNKNOWN");
  });

  it("backfill scanner uses mocked RPC clients", async () => {
    const rpcClient = createMockRpcClient();
    const scanner = createBackfillScanner({ rpcClient });

    const records = await scanner.scanAddress({
      address: walletAddress,
      limit: 1,
      watchedAddress: {
        address: walletAddress,
        kind: "wallet",
        mint
      }
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.transactionEvent.signature).toBe(signature);
    expect(records[0]?.tradeEvents[0]?.side).toBe("buy");
  });

  it("live watcher uses mocked WebSocket/RPC subscription path", async () => {
    const rpcClient = createMockRpcClient();
    const chainEvents: ChainTransactionEvent[] = [];
    const tradeEvents: NormalizedChainTradeEvent[] = [];
    const ingestor = createSolanaTransactionIngestor({
      rpcHttpUrl: "http://localhost:8899",
      rpcWsUrl: "ws://localhost:8900",
      watchedAddresses: [
        {
          address: walletAddress,
          kind: "wallet",
          mint
        }
      ],
      rpcClient,
      onChainEvent: (event) => {
        chainEvents.push(event);
      },
      onTradeEvent: (event) => {
        tradeEvents.push(event);
      }
    });

    await ingestor.start();
    rpcClient.emitLog(signature);
    await waitForMicrotasks();
    await ingestor.stop();

    expect(rpcClient.subscriptionCount()).toBe(0);
    expect(chainEvents[0]?.reasonCodes).toContain("WATCHED_ADDRESS_LOG");
    expect(tradeEvents[0]?.side).toBe("buy");
  });
});

function createWatchedAddress() {
  return createWatchedAddressRegistry({
    watchedAddresses: [
      {
        address: walletAddress,
        kind: "wallet",
        mint,
        symbol: "SOL"
      }
    ]
  }).list()[0]!;
}

function createParsedTransaction(options: {
  postBalances?: number[];
  postTokenAmount?: string;
  preBalances?: number[];
  preTokenAmount?: string;
} = {}): ParsedTransactionWithMeta {
  const preTokenAmount = options.preTokenAmount ?? "0";
  const postTokenAmount = options.postTokenAmount ?? "2500000";

  return {
    blockTime: 1_767_225_600,
    meta: {
      computeUnitsConsumed: 1,
      err: null,
      fee: 5000,
      innerInstructions: [],
      loadedAddresses: {
        readonly: [],
        writable: []
      },
      logMessages: [],
      postBalances: options.postBalances ?? [0, 2_000_000_000],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint,
          owner: walletAddress,
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          uiTokenAmount: {
            amount: postTokenAmount,
            decimals: 6,
            uiAmount: Number(postTokenAmount) / 1_000_000,
            uiAmountString: String(Number(postTokenAmount) / 1_000_000)
          }
        }
      ],
      preBalances: options.preBalances ?? [1_000_000_000, 1_000_000_000],
      preTokenBalances: [
        {
          accountIndex: 0,
          mint,
          owner: walletAddress,
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          uiTokenAmount: {
            amount: preTokenAmount,
            decimals: 6,
            uiAmount: Number(preTokenAmount) / 1_000_000,
            uiAmountString: String(Number(preTokenAmount) / 1_000_000)
          }
        }
      ],
      rewards: [],
      status: {
        Ok: null
      }
    },
    slot: 123,
    transaction: {
      message: {
        accountKeys: [
          {
            pubkey: new PublicKey(walletAddress),
            signer: true,
            source: "transaction",
            writable: true
          },
          {
            pubkey: new PublicKey(secondAddress),
            signer: false,
            source: "transaction",
            writable: true
          }
        ],
        addressTableLookups: [],
        instructions: [],
        recentBlockhash: "11111111111111111111111111111111"
      },
      signatures: [signature]
    },
    version: "legacy"
  } as ParsedTransactionWithMeta;
}

function createMockRpcClient(): Pick<
  SolanaRpcClient,
  "getParsedTransaction" | "getSignaturesForAddress"
> &
  SolanaRpcClient & {
    emitLog: (nextSignature: string) => void;
    subscriptionCount: () => number;
  } {
  const subscriptions = new Map<
    number,
    (logs: { err: null; logs: string[]; signature: string }, context: { slot: number }) => void
  >();

  return {
    emitLog: (nextSignature: string) => {
      for (const callback of subscriptions.values()) {
        callback(
          {
            err: null,
            logs: ["Program log: test"],
            signature: nextSignature
          },
          { slot: 123 }
        );
      }
    },
    getParsedTransaction: async () => createParsedTransaction(),
    getSignaturesForAddress: async () => [
      {
        blockTime: 1_767_225_600,
        confirmationStatus: "confirmed",
        err: null,
        memo: null,
        signature,
        slot: 123
      }
    ],
    onLogs: async (_publicKey, callback) => {
      subscriptions.set(1, callback);
      return 1;
    },
    removeOnLogsListener: async (clientSubscriptionId) => {
      subscriptions.delete(clientSubscriptionId);
    },
    subscriptionCount: () => subscriptions.size
  };
}

async function waitForMicrotasks(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
