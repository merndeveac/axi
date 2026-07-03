import {
  extractSolBalanceChanges,
  extractTokenBalanceChanges,
  type ChainTradeConfidence,
  type ChainTransactionEvent,
  type NormalizedChainTradeEvent,
  type SolBalanceChange,
  type TokenBalanceChange,
  type WatchedAddressKind
} from "@axi/chain-events";

export type QuoteAsset = "SOL" | "WSOL" | "USDC" | "USDT" | "UNKNOWN";
export type MarketObservationPerspective =
  | "wallet"
  | "pool"
  | "bonding_curve"
  | "unknown";
export type MarketObservationSide = "buy" | "sell" | "unknown";
export type MarketObservationConfidence = "low" | "medium" | "high";

export type QuoteTokenDefinition = {
  symbol: QuoteAsset;
  mint: string;
  decimals: number;
  kind: "native_sol" | "wrapped_sol" | "stable_usd" | "unknown";
  assumedUsdPrice?: number;
};

export type QuoteTokenRegistry = QuoteTokenDefinition[];

export type MarketDataNormalizerOptions = {
  allowSolUsdConversion?: boolean;
  allowUsdFromStableQuotes?: boolean;
  maxReasonCodes?: number;
  minConfidenceForMetrics?: MarketObservationConfidence;
  quoteTokenRegistry?: QuoteTokenRegistry;
  solUsdPrice?: number | null;
};

export type MarketObservation = {
  type: "market_observation";
  source: "solana_rpc";
  mint: string;
  symbol?: string;
  signature: string;
  slot?: number;
  timestamp: string;
  watchedAddress?: string;
  watchedAddressKind?: WatchedAddressKind;
  perspective: MarketObservationPerspective;
  side: MarketObservationSide;
  baseTokenAmount: number | null;
  quoteAsset: QuoteAsset;
  quoteMint: string | null;
  quoteAmount: number | null;
  priceQuote: number | null;
  priceSol: number | null;
  priceUsd: number | null;
  volumeQuote: number | null;
  volumeSol: number | null;
  volumeUsd: number | null;
  confidence: MarketObservationConfidence;
  usableForMetrics: boolean;
  reasonCodes: string[];
  raw?: unknown;
  createdAt: string;
};

export type MarketObservationSummary = {
  signature: string;
  side: MarketObservationSide;
  quoteAsset: QuoteAsset;
  confidence: MarketObservationConfidence;
  usableForMetrics: boolean;
  reasonCodes: string[];
  priceSol: number | null;
  priceUsd: number | null;
  volumeSol: number | null;
  volumeUsd: number | null;
  createdAt: string;
};

export type MarketMetricsTradeEvent = {
  type: "trade";
  source: "solana_rpc";
  mint: string;
  symbol?: string;
  side: "buy" | "sell";
  priceUsd?: number | null;
  volumeUsd?: number | null;
  priceSol?: number | null;
  volumeSol?: number | null;
  priceQuote?: number | null;
  volumeQuote?: number | null;
  quoteAsset?: QuoteAsset;
  quoteMint?: string | null;
  tokenAmount?: number;
  trader?: string;
  signature: string;
  timestamp: string;
  usableForMetrics?: boolean;
  confidence?: MarketObservationConfidence;
  reasonCodes?: string[];
  marketObservation?: MarketObservationSummary;
};

export type NormalizeChainTransactionInput = {
  chainTransactionEvent?: ChainTransactionEvent;
  signature?: string;
  slot?: number;
  timestamp?: string;
  transaction?: unknown;
  tokenBalanceChanges?: TokenBalanceChange[];
  solBalanceChanges?: SolBalanceChange[];
  watchedAddress?: string;
  watchedAddressKind?: WatchedAddressKind;
  mint?: string;
  symbol?: string;
  raw?: unknown;
};

export type NormalizeChainTradeInput = {
  event: NormalizedChainTradeEvent;
};

type NormalizerConfig = Required<
  Pick<
    MarketDataNormalizerOptions,
    | "allowSolUsdConversion"
    | "allowUsdFromStableQuotes"
    | "maxReasonCodes"
    | "minConfidenceForMetrics"
  >
> & {
  quoteTokenRegistry: QuoteTokenRegistry;
  solUsdPrice: number | null;
};

type BalanceDeltaInput = {
  baseTokenAmount: number | null;
  quoteAmount: number | null;
  quoteAsset: QuoteAsset;
  quoteMint: string | null;
};

type TradePerspectiveInput = {
  baseDelta: number | null;
  perspective: MarketObservationPerspective;
  quoteDelta: number | null;
};

export class MarketDataNormalizer {
  private readonly config: NormalizerConfig;

  constructor(options: MarketDataNormalizerOptions = {}) {
    this.config = normalizeOptions(options);
  }

  normalizeChainTransactionToMarketObservations(
    input: NormalizeChainTransactionInput
  ): MarketObservation[] {
    return normalizeChainTransactionToMarketObservations(input, this.config);
  }

  normalizeChainTradeEventToMarketObservation(
    input: NormalizeChainTradeInput | NormalizedChainTradeEvent
  ): MarketObservation {
    return normalizeChainTradeEventToMarketObservation(input, this.config);
  }

  marketObservationToMetricsTradeEvent(
    observation: MarketObservation
  ): MarketMetricsTradeEvent | null {
    return marketObservationToMetricsTradeEvent(observation, this.config);
  }

  isObservationUsableForMetrics(observation: MarketObservation): boolean {
    return isObservationUsableForMetrics(observation, this.config);
  }
}

export function createMarketDataNormalizer(
  options: MarketDataNormalizerOptions = {}
): MarketDataNormalizer {
  return new MarketDataNormalizer(options);
}

export function normalizeChainTransactionToMarketObservations(
  input: NormalizeChainTransactionInput,
  options: MarketDataNormalizerOptions = {}
): MarketObservation[] {
  const config = normalizeOptions(options);
  const chainEvent = input.chainTransactionEvent;
  const raw = input.raw ?? chainEvent?.raw;
  const rawChanges = getRawBalanceChanges(raw);
  const transaction = input.transaction ?? getRawTransaction(raw);
  const tokenBalanceChanges =
    input.tokenBalanceChanges ??
    rawChanges.tokenBalanceChanges ??
    extractTokenChangesFromUnknown(transaction);
  const solBalanceChanges =
    input.solBalanceChanges ??
    rawChanges.solBalanceChanges ??
    extractSolChangesFromUnknown(transaction);
  const signature = input.signature ?? chainEvent?.signature ?? "";
  const slot = input.slot ?? chainEvent?.slot;
  const timestamp =
    input.timestamp ??
    timestampFromChainEvent(chainEvent) ??
    new Date().toISOString();
  const watchedAddress = input.watchedAddress ?? chainEvent?.watchedAddress;
  const watchedAddressKind =
    input.watchedAddressKind ?? chainEvent?.watchedAddressKind ?? "unknown";
  const perspective = inferPerspective(watchedAddressKind);
  const requestedMint = input.mint ?? chainEvent?.mint;
  const primaryBaseChange = selectBaseTokenChange({
    config,
    tokenBalanceChanges,
    ...(requestedMint ? { mint: requestedMint } : {}),
    ...(watchedAddress ? { watchedAddress } : {})
  });

  if (!primaryBaseChange) {
    return [
      createObservation({
        baseDelta: null,
        config,
        input: {
          mint: input.mint ?? chainEvent?.mint ?? "UNKNOWN_MINT",
          signature,
          timestamp,
          watchedAddressKind,
          ...(raw ? { raw } : {}),
          ...(slot !== undefined ? { slot } : {}),
          ...(input.symbol ? { symbol: input.symbol } : {}),
          ...(watchedAddress ? { watchedAddress } : {})
        },
        perspective,
        quoteChange: null,
        reasonCodes: ["INSUFFICIENT_BASE_TOKEN_DELTA"],
        side: "unknown"
      })
    ];
  }

  const quoteChange = selectQuoteChange({
    baseMint: primaryBaseChange.mint,
    config,
    solBalanceChanges,
    tokenBalanceChanges,
    ...(watchedAddress ? { watchedAddress } : {})
  });
  const quoteDelta = quoteChange?.amount ?? null;
  const side = inferTradePerspective({
    baseDelta: primaryBaseChange.deltaUiAmount,
    perspective,
    quoteDelta
  });

  return [
    createObservation({
      baseDelta: primaryBaseChange.deltaUiAmount,
      config,
      input: {
        mint: input.mint ?? chainEvent?.mint ?? primaryBaseChange.mint,
        raw: {
          raw,
          solBalanceChanges,
          tokenBalanceChanges
        },
        signature,
        timestamp,
        watchedAddressKind,
        ...(slot !== undefined ? { slot } : {}),
        ...(input.symbol ? { symbol: input.symbol } : {}),
        ...(watchedAddress ? { watchedAddress } : {})
      },
      perspective,
      quoteChange,
      reasonCodes: [
        "TOKEN_BALANCE_CHANGES_FOUND",
        ...(solBalanceChanges.length > 0 ? ["SOL_BALANCE_CHANGES_FOUND"] : [])
      ],
      side
    })
  ];
}

export function normalizeChainTradeEventToMarketObservation(
  input: NormalizeChainTradeInput | NormalizedChainTradeEvent,
  options: MarketDataNormalizerOptions = {}
): MarketObservation {
  const config = normalizeOptions(options);
  const event = "event" in input ? input.event : input;
  const rawChanges = getRawBalanceChanges(event.raw);

  if (rawChanges.tokenBalanceChanges || rawChanges.solBalanceChanges) {
    const [observation] = normalizeChainTransactionToMarketObservations(
      {
        signature: event.signature,
        timestamp: event.timestamp,
        watchedAddress: event.watchedAddress,
        watchedAddressKind: "unknown",
        mint: event.mint,
        ...(event.slot !== undefined ? { slot: event.slot } : {}),
        ...(rawChanges.tokenBalanceChanges
          ? { tokenBalanceChanges: rawChanges.tokenBalanceChanges }
          : {}),
        ...(rawChanges.solBalanceChanges
          ? { solBalanceChanges: rawChanges.solBalanceChanges }
          : {}),
        ...(event.symbol ? { symbol: event.symbol } : {}),
        ...(event.raw ? { raw: event.raw } : {})
      },
      config
    );

    if (observation) {
      return observation;
    }
  }

  const side = event.side === "buy" || event.side === "sell" ? event.side : "unknown";
  const baseTokenAmount =
    event.tokenAmount !== null &&
    event.tokenAmount !== undefined &&
    Number.isFinite(event.tokenAmount) &&
    event.tokenAmount > 0
      ? event.tokenAmount
      : null;
  const priceUsd = safePositive(event.priceUsd);
  const volumeUsd = safePositive(event.volumeUsd);
  const reasonCodes = [
    "MARKET_OBSERVATION_CREATED",
    "QUOTE_ASSET_UNKNOWN",
    "PRICE_USD_UNKNOWN",
    "VOLUME_USD_UNKNOWN",
    ...(baseTokenAmount === null ? ["INSUFFICIENT_BASE_TOKEN_DELTA"] : []),
    ...(side === "unknown" ? ["TRADE_SIDE_UNKNOWN"] : [`TRADE_SIDE_INFERRED_${side.toUpperCase()}`]),
    confidenceReason(event.confidence)
  ];

  if (priceUsd !== null && volumeUsd !== null) {
    reasonCodes.push("CHAIN_TRADE_USD_FIELDS_PRESENT");
  }

  const observation: MarketObservation = {
    type: "market_observation",
    source: "solana_rpc",
    mint: event.mint,
    ...(event.symbol ? { symbol: event.symbol } : {}),
    signature: event.signature,
    ...(event.slot !== undefined ? { slot: event.slot } : {}),
    timestamp: event.timestamp,
    watchedAddress: event.watchedAddress,
    perspective: "unknown",
    side,
    baseTokenAmount,
    quoteAsset: "UNKNOWN",
    quoteMint: null,
    quoteAmount: null,
    priceQuote: null,
    priceSol: null,
    priceUsd,
    volumeQuote: null,
    volumeSol: null,
    volumeUsd,
    confidence: event.confidence,
    usableForMetrics: false,
    reasonCodes: limitReasonCodes(
      uniqueReasonCodes([...reasonCodes, "MARKET_OBSERVATION_UNUSABLE"]),
      config.maxReasonCodes
    ),
    raw: event,
    createdAt: event.timestamp
  };

  return observation;
}

export function inferQuoteAsset(
  change: TokenBalanceChange | SolBalanceChange | { mint?: string; symbol?: string },
  registry: QuoteTokenRegistry = defaultQuoteTokenRegistry
): QuoteAsset {
  if (
    "deltaSol" in change ||
    ("symbol" in change && change.symbol === "SOL")
  ) {
    return "SOL";
  }

  const mint = "mint" in change ? change.mint : undefined;

  if (!mint) {
    return "UNKNOWN";
  }

  return registry.find((entry) => entry.mint === mint)?.symbol ?? "UNKNOWN";
}

export function inferTradePerspective(
  input: TradePerspectiveInput
): MarketObservationSide {
  const baseDelta = input.baseDelta;
  const quoteDelta = input.quoteDelta;

  if (
    baseDelta === null ||
    quoteDelta === null ||
    !Number.isFinite(baseDelta) ||
    !Number.isFinite(quoteDelta) ||
    baseDelta === 0 ||
    quoteDelta === 0
  ) {
    return "unknown";
  }

  if (input.perspective === "wallet") {
    if (baseDelta > 0 && quoteDelta < 0) {
      return "buy";
    }

    if (baseDelta < 0 && quoteDelta > 0) {
      return "sell";
    }
  }

  if (input.perspective === "pool" || input.perspective === "bonding_curve") {
    if (baseDelta < 0 && quoteDelta > 0) {
      return "buy";
    }

    if (baseDelta > 0 && quoteDelta < 0) {
      return "sell";
    }
  }

  return "unknown";
}

export function computePriceFromBalanceDeltas(
  input: BalanceDeltaInput
): Pick<
  MarketObservation,
  | "priceQuote"
  | "priceSol"
  | "priceUsd"
  | "volumeQuote"
  | "volumeSol"
  | "volumeUsd"
> {
  const baseAmount = safePositive(input.baseTokenAmount);
  const quoteAmount = safePositive(input.quoteAmount);

  if (baseAmount === null || quoteAmount === null) {
    return {
      priceQuote: null,
      priceSol: null,
      priceUsd: null,
      volumeQuote: null,
      volumeSol: null,
      volumeUsd: null
    };
  }

  const priceQuote = roundMetric(quoteAmount / baseAmount);
  const volumeQuote = roundMetric(quoteAmount);

  return {
    priceQuote,
    priceSol:
      input.quoteAsset === "SOL" || input.quoteAsset === "WSOL"
        ? priceQuote
        : null,
    priceUsd:
      input.quoteAsset === "USDC" || input.quoteAsset === "USDT"
        ? priceQuote
        : null,
    volumeQuote,
    volumeSol:
      input.quoteAsset === "SOL" || input.quoteAsset === "WSOL"
        ? volumeQuote
        : null,
    volumeUsd:
      input.quoteAsset === "USDC" || input.quoteAsset === "USDT"
        ? volumeQuote
        : null
  };
}

export function marketObservationToMetricsTradeEvent(
  observation: MarketObservation,
  options: MarketDataNormalizerOptions = {}
): MarketMetricsTradeEvent | null {
  const config = normalizeOptions(options);

  if (!isObservationUsableForMetrics(observation, config)) {
    return null;
  }

  if (observation.side !== "buy" && observation.side !== "sell") {
    return null;
  }

  const event: MarketMetricsTradeEvent = {
    type: "trade",
    source: "solana_rpc",
    mint: observation.mint,
    ...(observation.symbol ? { symbol: observation.symbol } : {}),
    side: observation.side,
    priceUsd: observation.priceUsd,
    volumeUsd: observation.volumeUsd,
    priceSol: observation.priceSol,
    volumeSol: observation.volumeSol,
    priceQuote: observation.priceQuote,
    volumeQuote: observation.volumeQuote,
    quoteAsset: observation.quoteAsset,
    quoteMint: observation.quoteMint,
    signature: observation.signature,
    timestamp: observation.timestamp,
    usableForMetrics: observation.usableForMetrics,
    confidence: observation.confidence,
    reasonCodes: observation.reasonCodes,
    marketObservation: createMarketObservationSummary(observation)
  };

  if (observation.baseTokenAmount !== null) {
    event.tokenAmount = observation.baseTokenAmount;
  }

  if (observation.watchedAddress) {
    event.trader = observation.watchedAddress;
  }

  return event;
}

export function isObservationUsableForMetrics(
  observation: MarketObservation,
  options: MarketDataNormalizerOptions = {}
): boolean {
  const config = normalizeOptions(options);

  if (!observation.usableForMetrics) {
    return false;
  }

  if (compareConfidence(observation.confidence, config.minConfidenceForMetrics) < 0) {
    return false;
  }

  return hasUsablePriceAndVolume(observation);
}

export function createMarketObservationSummary(
  observation: MarketObservation
): MarketObservationSummary {
  return {
    signature: observation.signature,
    side: observation.side,
    quoteAsset: observation.quoteAsset,
    confidence: observation.confidence,
    usableForMetrics: observation.usableForMetrics,
    reasonCodes: observation.reasonCodes,
    priceSol: observation.priceSol,
    priceUsd: observation.priceUsd,
    volumeSol: observation.volumeSol,
    volumeUsd: observation.volumeUsd,
    createdAt: observation.createdAt
  };
}

export const defaultQuoteTokenRegistry: QuoteTokenRegistry = [
  {
    symbol: "WSOL",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    kind: "wrapped_sol"
  },
  {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    kind: "stable_usd",
    assumedUsdPrice: 1
  },
  {
    symbol: "USDT",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoH4MZCneEXVHxCQkd",
    decimals: 6,
    kind: "stable_usd",
    assumedUsdPrice: 1
  }
];

function createObservation(options: {
  baseDelta: number | null;
  config: NormalizerConfig;
  input: {
    mint: string;
    raw?: unknown;
    signature: string;
    slot?: number;
    symbol?: string;
    timestamp: string;
    watchedAddress?: string;
    watchedAddressKind?: WatchedAddressKind;
  };
  perspective: MarketObservationPerspective;
  quoteChange: QuoteChange | null;
  reasonCodes: string[];
  side: MarketObservationSide;
}): MarketObservation {
  const baseTokenAmount = safePositiveAbs(options.baseDelta);
  const quoteAmount = safePositiveAbs(options.quoteChange?.amount ?? null);
  const quoteAsset = options.quoteChange?.quoteAsset ?? "UNKNOWN";
  const quoteMint = options.quoteChange?.quoteMint ?? null;
  const computed = computePriceFromBalanceDeltas({
    baseTokenAmount,
    quoteAmount,
    quoteAsset,
    quoteMint
  });
  const converted = applyConfiguredUsdConversion({
    computed,
    config: options.config,
    quoteAsset
  });
  const confidence = inferConfidence({
    baseTokenAmount,
    perspective: options.perspective,
    quoteAmount,
    quoteAsset,
    side: options.side
  });
  const reasonCodes = [
    "MARKET_OBSERVATION_CREATED",
    ...options.reasonCodes,
    perspectiveReason(options.perspective),
    quoteReason(quoteAsset),
    sideReason(options.side),
    confidenceReason(confidence),
    ...(baseTokenAmount === null ? ["INSUFFICIENT_BASE_TOKEN_DELTA"] : []),
    ...(quoteAmount === null ? ["INSUFFICIENT_QUOTE_DELTA"] : []),
    ...(computed.priceQuote !== null ? ["PRICE_QUOTE_COMPUTED"] : []),
    ...(computed.volumeQuote !== null ? ["VOLUME_QUOTE_COMPUTED"] : []),
    ...(converted.priceSol !== null ? ["PRICE_SOL_COMPUTED"] : []),
    ...(converted.volumeSol !== null ? ["VOLUME_SOL_COMPUTED"] : []),
    ...usdReasonCodes({
      config: options.config,
      priceUsd: converted.priceUsd,
      quoteAsset,
      volumeUsd: converted.volumeUsd
    })
  ];
  const usableForMetrics =
    options.side !== "unknown" &&
    baseTokenAmount !== null &&
    quoteAmount !== null &&
    quoteAsset !== "UNKNOWN" &&
    compareConfidence(confidence, options.config.minConfidenceForMetrics) >= 0 &&
    hasUsablePriceVolumeValues(converted);

  reasonCodes.push(
    usableForMetrics
      ? "MARKET_OBSERVATION_USABLE"
      : "MARKET_OBSERVATION_UNUSABLE"
  );

  const observation: MarketObservation = {
    type: "market_observation",
    source: "solana_rpc",
    mint: options.input.mint,
    ...(options.input.symbol ? { symbol: options.input.symbol } : {}),
    signature: options.input.signature,
    ...(options.input.slot !== undefined ? { slot: options.input.slot } : {}),
    timestamp: options.input.timestamp,
    ...(options.input.watchedAddress
      ? { watchedAddress: options.input.watchedAddress }
      : {}),
    ...(options.input.watchedAddressKind
      ? { watchedAddressKind: options.input.watchedAddressKind }
      : {}),
    perspective: options.perspective,
    side: options.side,
    baseTokenAmount,
    quoteAsset,
    quoteMint,
    quoteAmount,
    priceQuote: converted.priceQuote,
    priceSol: converted.priceSol,
    priceUsd: converted.priceUsd,
    volumeQuote: converted.volumeQuote,
    volumeSol: converted.volumeSol,
    volumeUsd: converted.volumeUsd,
    confidence,
    usableForMetrics,
    reasonCodes: limitReasonCodes(
      uniqueReasonCodes(reasonCodes),
      options.config.maxReasonCodes
    ),
    ...(options.input.raw ? { raw: options.input.raw } : {}),
    createdAt: options.input.timestamp
  };

  return sanitizeObservation(observation);
}

type QuoteChange = {
  amount: number;
  quoteAsset: QuoteAsset;
  quoteMint: string | null;
};

function selectBaseTokenChange(options: {
  config: NormalizerConfig;
  mint?: string;
  tokenBalanceChanges: TokenBalanceChange[];
  watchedAddress?: string;
}): TokenBalanceChange | undefined {
  return options.tokenBalanceChanges
    .filter((change) => {
      if (isQuoteMint(change.mint, options.config)) {
        return false;
      }

      if (options.mint && change.mint !== options.mint) {
        return false;
      }

      return change.deltaUiAmount !== 0;
    })
    .sort((left, right) => {
      const leftWatched = left.owner === options.watchedAddress ? 1 : 0;
      const rightWatched = right.owner === options.watchedAddress ? 1 : 0;

      if (leftWatched !== rightWatched) {
        return rightWatched - leftWatched;
      }

      return Math.abs(right.deltaUiAmount) - Math.abs(left.deltaUiAmount);
    })[0];
}

function selectQuoteChange(options: {
  baseMint: string;
  config: NormalizerConfig;
  solBalanceChanges: SolBalanceChange[];
  tokenBalanceChanges: TokenBalanceChange[];
  watchedAddress?: string;
}): QuoteChange | null {
  const solChange = selectSolQuoteChange(
    options.solBalanceChanges,
    options.watchedAddress
  );

  if (solChange) {
    return {
      amount: solChange.deltaSol,
      quoteAsset: "SOL",
      quoteMint: null
    };
  }

  const tokenQuoteChange = options.tokenBalanceChanges
    .filter(
      (change) =>
        change.mint !== options.baseMint &&
        isQuoteMint(change.mint, options.config) &&
        change.deltaUiAmount !== 0
    )
    .sort((left, right) => {
      const leftWatched = left.owner === options.watchedAddress ? 1 : 0;
      const rightWatched = right.owner === options.watchedAddress ? 1 : 0;

      if (leftWatched !== rightWatched) {
        return rightWatched - leftWatched;
      }

      return Math.abs(right.deltaUiAmount) - Math.abs(left.deltaUiAmount);
    })[0];

  if (!tokenQuoteChange) {
    return null;
  }

  return {
    amount: tokenQuoteChange.deltaUiAmount,
    quoteAsset: inferQuoteAsset(tokenQuoteChange, options.config.quoteTokenRegistry),
    quoteMint: tokenQuoteChange.mint
  };
}

function selectSolQuoteChange(
  changes: SolBalanceChange[],
  watchedAddress: string | undefined
): SolBalanceChange | undefined {
  if (watchedAddress) {
    const watched = changes.find((change) => change.account === watchedAddress);

    if (watched) {
      return watched;
    }
  }

  return changes
    .filter((change) => change.deltaSol !== 0)
    .sort((left, right) => Math.abs(right.deltaSol) - Math.abs(left.deltaSol))[0];
}

function inferPerspective(
  watchedAddressKind: WatchedAddressKind | undefined
): MarketObservationPerspective {
  if (watchedAddressKind === "wallet") {
    return "wallet";
  }

  if (watchedAddressKind === "pool") {
    return "pool";
  }

  if (watchedAddressKind === "bonding_curve") {
    return "bonding_curve";
  }

  return "unknown";
}

function inferConfidence(input: {
  baseTokenAmount: number | null;
  perspective: MarketObservationPerspective;
  quoteAmount: number | null;
  quoteAsset: QuoteAsset;
  side: MarketObservationSide;
}): MarketObservationConfidence {
  if (
    input.side === "unknown" ||
    input.baseTokenAmount === null ||
    input.quoteAmount === null ||
    input.quoteAsset === "UNKNOWN" ||
    input.perspective === "unknown"
  ) {
    return "low";
  }

  return input.quoteAsset === "SOL" || input.quoteAsset === "WSOL"
    ? "medium"
    : "high";
}

function applyConfiguredUsdConversion(options: {
  computed: ReturnType<typeof computePriceFromBalanceDeltas>;
  config: NormalizerConfig;
  quoteAsset: QuoteAsset;
}): ReturnType<typeof computePriceFromBalanceDeltas> {
  const computed = { ...options.computed };

  if (
    (options.quoteAsset === "SOL" || options.quoteAsset === "WSOL") &&
    options.config.allowSolUsdConversion &&
    options.config.solUsdPrice !== null &&
    computed.priceSol !== null &&
    computed.volumeSol !== null
  ) {
    computed.priceUsd = roundMetric(computed.priceSol * options.config.solUsdPrice);
    computed.volumeUsd = roundMetric(computed.volumeSol * options.config.solUsdPrice);
  }

  if (
    (options.quoteAsset === "USDC" || options.quoteAsset === "USDT") &&
    !options.config.allowUsdFromStableQuotes
  ) {
    computed.priceUsd = null;
    computed.volumeUsd = null;
  }

  return computed;
}

function usdReasonCodes(options: {
  config: NormalizerConfig;
  priceUsd: number | null;
  quoteAsset: QuoteAsset;
  volumeUsd: number | null;
}): string[] {
  const codes: string[] = [];

  if (options.priceUsd !== null) {
    codes.push(
      options.quoteAsset === "SOL" || options.quoteAsset === "WSOL"
        ? "PRICE_USD_FROM_CONFIGURED_SOL_USD"
        : "PRICE_USD_FROM_STABLE_QUOTE"
    );
  } else {
    codes.push("PRICE_USD_UNKNOWN");
  }

  if (options.volumeUsd !== null) {
    codes.push(
      options.quoteAsset === "SOL" || options.quoteAsset === "WSOL"
        ? "VOLUME_USD_FROM_CONFIGURED_SOL_USD"
        : "VOLUME_USD_FROM_STABLE_QUOTE"
    );
  } else {
    codes.push("VOLUME_USD_UNKNOWN");
  }

  return codes;
}

function hasUsablePriceAndVolume(observation: MarketObservation): boolean {
  return (
    hasPositivePair(observation.priceUsd, observation.volumeUsd) ||
    hasPositivePair(observation.priceSol, observation.volumeSol) ||
    hasPositivePair(observation.priceQuote, observation.volumeQuote)
  );
}

function hasUsablePriceVolumeValues(
  values: ReturnType<typeof computePriceFromBalanceDeltas>
): boolean {
  return (
    hasPositivePair(values.priceUsd, values.volumeUsd) ||
    hasPositivePair(values.priceSol, values.volumeSol) ||
    hasPositivePair(values.priceQuote, values.volumeQuote)
  );
}

function hasPositivePair(left: number | null, right: number | null): boolean {
  return (
    left !== null &&
    right !== null &&
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    left > 0 &&
    right > 0
  );
}

function normalizeOptions(
  options: MarketDataNormalizerOptions = {}
): NormalizerConfig {
  const solUsdPrice = safePositive(options.solUsdPrice ?? null);

  return {
    allowSolUsdConversion: options.allowSolUsdConversion ?? false,
    allowUsdFromStableQuotes: options.allowUsdFromStableQuotes ?? true,
    maxReasonCodes: Math.max(1, options.maxReasonCodes ?? 20),
    minConfidenceForMetrics: options.minConfidenceForMetrics ?? "medium",
    quoteTokenRegistry: options.quoteTokenRegistry ?? defaultQuoteTokenRegistry,
    solUsdPrice
  };
}

function compareConfidence(
  left: MarketObservationConfidence,
  right: MarketObservationConfidence
): number {
  return confidenceRank(left) - confidenceRank(right);
}

function confidenceRank(confidence: MarketObservationConfidence): number {
  switch (confidence) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
  }
}

function isQuoteMint(mint: string, config: NormalizerConfig): boolean {
  return config.quoteTokenRegistry.some((entry) => entry.mint === mint);
}

function extractTokenChangesFromUnknown(value: unknown): TokenBalanceChange[] {
  if (!looksLikeParsedTransaction(value)) {
    return [];
  }

  return extractTokenBalanceChanges(value);
}

function extractSolChangesFromUnknown(value: unknown): SolBalanceChange[] {
  if (!looksLikeParsedTransaction(value)) {
    return [];
  }

  return extractSolBalanceChanges(value);
}

function looksLikeParsedTransaction(value: unknown): value is Parameters<
  typeof extractTokenBalanceChanges
>[0] {
  return (
    typeof value === "object" &&
    value !== null &&
    "meta" in value &&
    "transaction" in value
  );
}

function getRawTransaction(raw: unknown): unknown {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "transaction" in raw &&
    looksLikeParsedTransaction((raw as { transaction?: unknown }).transaction)
  ) {
    return (raw as { transaction?: unknown }).transaction;
  }

  return looksLikeParsedTransaction(raw) ? raw : undefined;
}

function getRawBalanceChanges(raw: unknown): {
  solBalanceChanges?: SolBalanceChange[];
  tokenBalanceChanges?: TokenBalanceChange[];
} {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const record = raw as {
    solBalanceChanges?: unknown;
    tokenBalanceChanges?: unknown;
  };

  return {
    ...(isSolBalanceChangeArray(record.solBalanceChanges)
      ? { solBalanceChanges: record.solBalanceChanges }
      : {}),
    ...(isTokenBalanceChangeArray(record.tokenBalanceChanges)
      ? { tokenBalanceChanges: record.tokenBalanceChanges }
      : {})
  };
}

function isTokenBalanceChangeArray(value: unknown): value is TokenBalanceChange[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "mint" in item &&
        "deltaUiAmount" in item
    )
  );
}

function isSolBalanceChangeArray(value: unknown): value is SolBalanceChange[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "deltaSol" in item &&
        "deltaLamports" in item
    )
  );
}

function timestampFromChainEvent(
  event: ChainTransactionEvent | undefined
): string | undefined {
  if (!event) {
    return undefined;
  }

  if (typeof event.blockTime === "number") {
    return new Date(event.blockTime * 1000).toISOString();
  }

  return event.receivedAt;
}

function safePositive(value: number | null | undefined): number | null {
  return value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : null;
}

function safePositiveAbs(value: number | null | undefined): number | null {
  return value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value !== 0
    ? roundMetric(Math.abs(value))
    : null;
}

function sanitizeObservation(observation: MarketObservation): MarketObservation {
  return {
    ...observation,
    baseTokenAmount: sanitizeNullableNumber(observation.baseTokenAmount),
    quoteAmount: sanitizeNullableNumber(observation.quoteAmount),
    priceQuote: sanitizeNullableNumber(observation.priceQuote),
    priceSol: sanitizeNullableNumber(observation.priceSol),
    priceUsd: sanitizeNullableNumber(observation.priceUsd),
    volumeQuote: sanitizeNullableNumber(observation.volumeQuote),
    volumeSol: sanitizeNullableNumber(observation.volumeSol),
    volumeUsd: sanitizeNullableNumber(observation.volumeUsd)
  };
}

function sanitizeNullableNumber(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function perspectiveReason(perspective: MarketObservationPerspective): string {
  switch (perspective) {
    case "wallet":
      return "PERSPECTIVE_WALLET";
    case "pool":
      return "PERSPECTIVE_POOL";
    case "bonding_curve":
      return "PERSPECTIVE_BONDING_CURVE";
    case "unknown":
      return "PERSPECTIVE_UNKNOWN";
  }
}

function quoteReason(quoteAsset: QuoteAsset): string {
  switch (quoteAsset) {
    case "SOL":
    case "WSOL":
      return "QUOTE_ASSET_SOL";
    case "USDC":
      return "QUOTE_ASSET_USDC";
    case "USDT":
      return "QUOTE_ASSET_USDT";
    case "UNKNOWN":
      return "QUOTE_ASSET_UNKNOWN";
  }
}

function sideReason(side: MarketObservationSide): string {
  switch (side) {
    case "buy":
      return "TRADE_SIDE_INFERRED_BUY";
    case "sell":
      return "TRADE_SIDE_INFERRED_SELL";
    case "unknown":
      return "TRADE_SIDE_UNKNOWN";
  }
}

function confidenceReason(confidence: MarketObservationConfidence | ChainTradeConfidence): string {
  switch (confidence) {
    case "low":
      return "LOW_CONFIDENCE_OBSERVATION";
    case "medium":
      return "MEDIUM_CONFIDENCE_OBSERVATION";
    case "high":
      return "HIGH_CONFIDENCE_OBSERVATION";
  }
}

function uniqueReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(new Set(reasonCodes));
}

function limitReasonCodes(reasonCodes: string[], maxReasonCodes: number): string[] {
  return reasonCodes.slice(0, maxReasonCodes);
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(12));
}
