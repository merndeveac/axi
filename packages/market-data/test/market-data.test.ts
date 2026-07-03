import { describe, expect, it } from "vitest";
import {
  computePriceFromBalanceDeltas,
  createMarketDataNormalizer,
  inferQuoteAsset,
  inferTradePerspective,
  marketObservationToMetricsTradeEvent,
  normalizeChainTransactionToMarketObservations,
  type MarketObservation,
  type QuoteTokenRegistry
} from "../src/index";
import type { SolBalanceChange, TokenBalanceChange } from "@axi/chain-events";

const wallet = "11111111111111111111111111111111";
const pool = "Pool1111111111111111111111111111111111";
const mint = "BaseMint111111111111111111111111111111111";
const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const signature =
  "5NfL6eiYVQhnL5rtZJkR2Jqg7YbNLsC6Gc8a5YVwWnSb1E4qMvERqE1mUu3PF4aZ75xMwHj7pFaGgQ8z7R5dHnNU";

describe("@axi/market-data", () => {
  it("creates observation from wallet buy-style deltas", () => {
    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: 10 })],
      solBalanceChanges: [solChange({ deltaSol: -2 })],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      symbol: "BASE",
      timestamp: "2026-01-01T00:00:00.000Z"
    });

    expect(observation?.side).toBe("buy");
    expect(observation?.quoteAsset).toBe("SOL");
    expect(observation?.baseTokenAmount).toBe(10);
    expect(observation?.quoteAmount).toBe(2);
    expect(observation?.priceSol).toBe(0.2);
    expect(observation?.volumeSol).toBe(2);
    expect(observation?.priceUsd).toBeNull();
    expect(observation?.usableForMetrics).toBe(true);
    expect(observation?.reasonCodes).toContain("TRADE_SIDE_INFERRED_BUY");
  });

  it("creates observation from wallet sell-style deltas", () => {
    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: -5 })],
      solBalanceChanges: [solChange({ deltaSol: 1 })],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:01.000Z"
    });

    expect(observation?.side).toBe("sell");
    expect(observation?.priceSol).toBe(0.2);
    expect(observation?.reasonCodes).toContain("TRADE_SIDE_INFERRED_SELL");
  });

  it("creates observation from pool perspective buy-style deltas", () => {
    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: -10, owner: pool })],
      solBalanceChanges: [solChange({ account: pool, deltaSol: 2 })],
      watchedAddress: pool,
      watchedAddressKind: "pool",
      mint,
      timestamp: "2026-01-01T00:00:02.000Z"
    });

    expect(observation?.perspective).toBe("pool");
    expect(observation?.side).toBe("buy");
    expect(observation?.reasonCodes).toContain("PERSPECTIVE_POOL");
  });

  it("computes priceQuote safely", () => {
    expect(
      computePriceFromBalanceDeltas({
        baseTokenAmount: 4,
        quoteAmount: 2,
        quoteAsset: "SOL",
        quoteMint: null
      }).priceQuote
    ).toBe(0.5);
  });

  it("computes priceSol when quote is SOL or WSOL", () => {
    expect(
      computePriceFromBalanceDeltas({
        baseTokenAmount: 4,
        quoteAmount: 2,
        quoteAsset: "SOL",
        quoteMint: null
      }).priceSol
    ).toBe(0.5);

    expect(
      computePriceFromBalanceDeltas({
        baseTokenAmount: 4,
        quoteAmount: 2,
        quoteAsset: "WSOL",
        quoteMint: "So11111111111111111111111111111111111111112"
      }).priceSol
    ).toBe(0.5);
  });

  it("computes priceUsd from stable quote", () => {
    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [
        tokenChange({ deltaUiAmount: 10 }),
        tokenChange({
          deltaUiAmount: -50,
          mint: usdcMint,
          decimals: 6
        })
      ],
      solBalanceChanges: [],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:03.000Z"
    });

    expect(observation?.quoteAsset).toBe("USDC");
    expect(observation?.priceUsd).toBe(5);
    expect(observation?.volumeUsd).toBe(50);
    expect(observation?.confidence).toBe("high");
  });

  it("computes priceUsd from configured SOL_USD_PRICE only when allowed", () => {
    const [withoutConversion] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: 10 })],
      solBalanceChanges: [solChange({ deltaSol: -2 })],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:04.000Z"
    });
    const [withConversion] = normalizeChainTransactionToMarketObservations(
      {
        signature,
        tokenBalanceChanges: [tokenChange({ deltaUiAmount: 10 })],
        solBalanceChanges: [solChange({ deltaSol: -2 })],
        watchedAddress: wallet,
        watchedAddressKind: "wallet",
        mint,
        timestamp: "2026-01-01T00:00:04.000Z"
      },
      {
        allowSolUsdConversion: true,
        solUsdPrice: 2000
      }
    );

    expect(withoutConversion?.priceUsd).toBeNull();
    expect(withConversion?.priceUsd).toBe(400);
    expect(withConversion?.volumeUsd).toBe(4000);
    expect(withConversion?.reasonCodes).toContain(
      "PRICE_USD_FROM_CONFIGURED_SOL_USD"
    );
  });

  it("does not invent USD price when SOL_USD_PRICE is missing", () => {
    const normalizer = createMarketDataNormalizer({
      allowSolUsdConversion: true,
      solUsdPrice: null
    });
    const [observation] = normalizer.normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: 10 })],
      solBalanceChanges: [solChange({ deltaSol: -2 })],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:05.000Z"
    });

    expect(observation?.priceSol).toBe(0.2);
    expect(observation?.priceUsd).toBeNull();
    expect(observation?.reasonCodes).toContain("PRICE_USD_UNKNOWN");
  });

  it("handles zero base amount safely", () => {
    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: 0 })],
      solBalanceChanges: [solChange({ deltaSol: -2 })],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:06.000Z"
    });

    expect(observation?.baseTokenAmount).toBeNull();
    expect(observation?.priceQuote).toBeNull();
    expect(observation?.usableForMetrics).toBe(false);
    expect(observation?.reasonCodes).toContain("INSUFFICIENT_BASE_TOKEN_DELTA");
  });

  it("handles zero quote amount safely", () => {
    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: 10 })],
      solBalanceChanges: [solChange({ deltaSol: 0 })],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:07.000Z"
    });

    expect(observation?.quoteAmount).toBeNull();
    expect(observation?.priceQuote).toBeNull();
    expect(observation?.usableForMetrics).toBe(false);
    expect(observation?.reasonCodes).toContain("INSUFFICIENT_QUOTE_DELTA");
  });

  it("handles unknown quote asset", () => {
    const customRegistry: QuoteTokenRegistry = [];
    const [observation] = normalizeChainTransactionToMarketObservations(
      {
        signature,
        tokenBalanceChanges: [
          tokenChange({ deltaUiAmount: 10 }),
          tokenChange({ deltaUiAmount: -20, mint: "UnknownQuoteMint111111111111111111111111" })
        ],
        solBalanceChanges: [],
        watchedAddress: wallet,
        watchedAddressKind: "wallet",
        mint,
        timestamp: "2026-01-01T00:00:08.000Z"
      },
      { quoteTokenRegistry: customRegistry }
    );

    expect(inferQuoteAsset({ mint: "UnknownQuoteMint111111111111111111111111" })).toBe(
      "UNKNOWN"
    );
    expect(observation?.quoteAsset).toBe("UNKNOWN");
    expect(observation?.usableForMetrics).toBe(false);
  });

  it("marks low-confidence unusable observations correctly", () => {
    expect(
      inferTradePerspective({
        baseDelta: 10,
        quoteDelta: -2,
        perspective: "unknown"
      })
    ).toBe("unknown");

    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: 10 })],
      solBalanceChanges: [solChange({ deltaSol: -2 })],
      watchedAddress: wallet,
      watchedAddressKind: "unknown",
      mint,
      timestamp: "2026-01-01T00:00:09.000Z"
    });

    expect(observation?.confidence).toBe("low");
    expect(observation?.usableForMetrics).toBe(false);
    expect(observation?.reasonCodes).toContain("LOW_CONFIDENCE_OBSERVATION");
  });

  it("never returns NaN or Infinity", () => {
    const observation = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: Number.NaN })],
      solBalanceChanges: [solChange({ deltaSol: Number.POSITIVE_INFINITY })],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:10.000Z"
    })[0] as MarketObservation;

    expect(Object.values(observation).some((value) => value === Infinity)).toBe(false);
    expect(Object.values(observation).some((value) => Number.isNaN(value))).toBe(false);
  });

  it("converts usable observation to metrics trade event", () => {
    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: 10 })],
      solBalanceChanges: [solChange({ deltaSol: -2 })],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:11.000Z"
    });
    const metricsEvent = marketObservationToMetricsTradeEvent(observation!);

    expect(metricsEvent?.type).toBe("trade");
    expect(metricsEvent?.priceSol).toBe(0.2);
    expect(metricsEvent?.volumeSol).toBe(2);
    expect(metricsEvent?.marketObservation?.usableForMetrics).toBe(true);
  });

  it("does not convert unusable observation to metrics trade event", () => {
    const [observation] = normalizeChainTransactionToMarketObservations({
      signature,
      tokenBalanceChanges: [tokenChange({ deltaUiAmount: 10 })],
      solBalanceChanges: [],
      watchedAddress: wallet,
      watchedAddressKind: "wallet",
      mint,
      timestamp: "2026-01-01T00:00:12.000Z"
    });

    expect(marketObservationToMetricsTradeEvent(observation!)).toBeNull();
  });
});

function tokenChange(options: {
  decimals?: number;
  deltaUiAmount: number;
  mint?: string;
  owner?: string | null;
}): TokenBalanceChange {
  return {
    owner: options.owner ?? wallet,
    accountIndex: 0,
    mint: options.mint ?? mint,
    preAmountRaw: "0",
    postAmountRaw: "0",
    deltaRaw: "0",
    decimals: options.decimals ?? 6,
    preUiAmount: 0,
    postUiAmount: options.deltaUiAmount,
    deltaUiAmount: options.deltaUiAmount
  };
}

function solChange(options: {
  account?: string;
  deltaSol: number;
}): SolBalanceChange {
  return {
    accountIndex: 0,
    account: options.account ?? wallet,
    preLamports: 0,
    postLamports: 0,
    deltaLamports: Math.round(options.deltaSol * 1_000_000_000),
    deltaSol: options.deltaSol
  };
}
