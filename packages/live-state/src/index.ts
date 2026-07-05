import {
  getEventMint,
  getEventTimestamp,
  isTradeUsableForMetrics,
  shortMint,
  type IndexerEventType,
  type NormalizedIndexerEvent,
  type NormalizedTokenTradeEvent
} from "@axi/indexer-core";

export type DataCompletenessLabel =
  | "discovery_only"
  | "trade_tracked"
  | "enriched"
  | "strategy_ready";

export type DataCompleteness = {
  label: DataCompletenessLabel;
  missingFields: string[];
  unavailableFields: string[];
  completenessPct: number;
};

export type LiveTokenMarketState = {
  priceSol: number | null;
  priceUsd: number | null;
  volumeSol1s: number;
  volumeSol5s: number;
  volumeSol10s: number;
  volumeSol60s: number;
  volumeUsd1s: number;
  volumeUsd5s: number;
  volumeUsd10s: number;
  volumeUsd60s: number;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
};

export type LiveTokenFlowState = {
  buyCount10s: number;
  sellCount10s: number;
  tradeCount10s: number;
  uniqueBuyers10s: number;
  uniqueSellers10s: number;
  buySellRatio: number | null;
  netBuyPressure: number | null;
};

export type LiveTokenIdentityState = {
  name: string | null;
  symbol: string | null;
  title: string | null;
  displayName: string;
  metadataUri: string | null;
  imageUri: string | null;
  description: string | null;
  source: string;
};

export type LiveTokenLatestTrade = {
  side: "buy" | "sell" | "unknown";
  trader: string | null;
  priceSol: number | null;
  priceUsd: number | null;
  volumeSol: number | null;
  volumeUsd: number | null;
  tokenAmount: number | null;
  confidence: "low" | "medium" | "high";
  usableForMetrics: boolean;
  at: string;
};

export type LiveTokenHolderState = {
  holderCount: number | null;
  topHolderPct: number | null;
  top10HolderPct: number | null;
  source: string | null;
};

export type LiveTokenState = {
  mint: string;
  shortMint: string;
  name: string | null;
  symbol: string | null;
  title: string | null;
  displayName: string;
  source: string;
  sourceMode: string;
  firstSeenAt: string;
  lastSeenAt: string;
  ageSeconds: number;
  eventTypes: IndexerEventType[];
  latestSignature: string | null;
  identity: LiveTokenIdentityState;
  latestTrade: LiveTokenLatestTrade | null;
  market: LiveTokenMarketState;
  flow: LiveTokenFlowState;
  holders: LiveTokenHolderState;
  riskSummary?: unknown;
  signalSummary?: unknown;
  dataCompleteness: DataCompleteness;
  reasonCodes: string[];
  rawEventCount: number;
};

export type LiveTokenStateStats = {
  tokenCount: number;
  eventCount: number;
  eventsByType: Partial<Record<IndexerEventType, number>>;
  lastEventAt: string | null;
};

export type LiveTokenStateStore = {
  applyIndexerEvent: (event: NormalizedIndexerEvent) => LiveTokenState | undefined;
  clear: () => void;
  getLiveCards: () => LiveTokenState[];
  getStats: () => LiveTokenStateStats;
  getToken: (mint: string) => LiveTokenState | undefined;
  getTokens: () => LiveTokenState[];
};

export type LiveTokenStateStoreOptions = {
  now?: () => Date;
};

type TradeSample = {
  at: string;
  timestampMs: number;
  side: "buy" | "sell" | "unknown";
  trader: string | null;
  priceSol: number | null;
  priceUsd: number | null;
  volumeSol: number;
  volumeUsd: number;
};

type MutableLiveTokenState = Omit<
  LiveTokenState,
  "ageSeconds" | "dataCompleteness"
> & {
  trades: TradeSample[];
};

export function createLiveTokenStateStore(
  options: LiveTokenStateStoreOptions = {}
): LiveTokenStateStore {
  const now = options.now ?? (() => new Date());
  const tokens = new Map<string, MutableLiveTokenState>();
  const eventsByType = new Map<IndexerEventType, number>();
  let eventCount = 0;
  let lastEventAt: string | null = null;

  function applyIndexerEvent(
    event: NormalizedIndexerEvent
  ): LiveTokenState | undefined {
    eventCount += 1;
    eventsByType.set(event.type, (eventsByType.get(event.type) ?? 0) + 1);
    lastEventAt = getEventTimestamp(event);

    const mint = getEventMint(event);

    if (!mint) {
      return undefined;
    }

    const state = ensureToken(event, mint);
    state.rawEventCount += 1;
    state.lastSeenAt = maxIso(state.lastSeenAt, getEventTimestamp(event));
    state.source = event.source;
    state.sourceMode = event.sourceMode;
    state.latestSignature = event.signature ?? state.latestSignature;
    state.eventTypes = unique([...state.eventTypes, event.type]);
    state.reasonCodes = unique([
      ...state.reasonCodes,
      ...event.reasonCodes,
      "LIVE_STATE_EVENT_APPLIED"
    ]);

    switch (event.type) {
      case "token_created":
        applyIdentity(state, {
          name: event.name ?? null,
          symbol: event.symbol ?? null,
          metadataUri: event.metadataUri ?? null,
          source: event.source
        });
        break;
      case "token_migrated":
        state.reasonCodes = unique([
          ...state.reasonCodes,
          "LIVE_STATE_TOKEN_MIGRATED"
        ]);
        break;
      case "token_trade":
        applyTrade(state, event);
        break;
      case "holder_snapshot":
        state.holders = {
          holderCount: sanitizeInteger(event.holderCount),
          topHolderPct: sanitizeNumber(event.topHolderPct),
          top10HolderPct: sanitizeNumber(event.top10HolderPct),
          source: event.source
        };
        break;
      case "token_metadata":
        applyIdentity(state, {
          description: event.description ?? null,
          displayName: event.displayName ?? null,
          imageUri: event.imageUri ?? null,
          metadataUri: event.metadataUri ?? null,
          name: event.name ?? null,
          source: event.source,
          symbol: event.symbol ?? null,
          title: event.title ?? null
        });
        break;
      case "pool_created":
      case "pool_updated":
      case "account_update":
      case "token_enrichment":
      case "unknown":
        break;
      default:
        return assertNeverEvent(event);
    }

    return toPublicState(state, now());
  }

  function ensureToken(
    event: NormalizedIndexerEvent,
    mint: string
  ): MutableLiveTokenState {
    const existing = tokens.get(mint);

    if (existing) {
      return existing;
    }

    const timestamp = getEventTimestamp(event);
    const state: MutableLiveTokenState = {
      mint,
      shortMint: shortMint(mint),
      name: null,
      symbol: null,
      title: null,
      displayName: shortMint(mint),
      source: event.source,
      sourceMode: event.sourceMode,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      eventTypes: [event.type],
      latestSignature: event.signature ?? null,
      identity: {
        name: null,
        symbol: null,
        title: null,
        displayName: shortMint(mint),
        metadataUri: null,
        imageUri: null,
        description: null,
        source: event.source
      },
      latestTrade: null,
      market: createEmptyMarket(),
      flow: createEmptyFlow(),
      holders: {
        holderCount: null,
        topHolderPct: null,
        top10HolderPct: null,
        source: null
      },
      reasonCodes: unique([...event.reasonCodes, "LIVE_STATE_TOKEN_CREATED"]),
      rawEventCount: 0,
      trades: []
    };

    tokens.set(mint, state);
    return state;
  }

  function applyIdentity(
    state: MutableLiveTokenState,
    input: {
      name?: string | null;
      symbol?: string | null;
      title?: string | null;
      displayName?: string | null;
      metadataUri?: string | null;
      imageUri?: string | null;
      description?: string | null;
      source: string;
    }
  ): void {
    const name = input.name ?? state.identity.name;
    const symbol = input.symbol ?? state.identity.symbol;
    const title = input.title ?? createTitle(symbol, name, state.mint);
    const displayName =
      input.displayName ?? createDisplayName(symbol, name, title, state.mint);

    state.name = name;
    state.symbol = symbol;
    state.title = title;
    state.displayName = displayName;
    state.identity = {
      name,
      symbol,
      title,
      displayName,
      metadataUri: input.metadataUri ?? state.identity.metadataUri,
      imageUri: input.imageUri ?? state.identity.imageUri,
      description: input.description ?? state.identity.description,
      source: input.source
    };
  }

  function applyTrade(
    state: MutableLiveTokenState,
    event: NormalizedTokenTradeEvent
  ): void {
    const timestamp = getEventTimestamp(event);
    const sample: TradeSample = {
      at: timestamp,
      timestampMs: Date.parse(timestamp),
      side: event.side,
      trader: event.trader ?? null,
      priceSol: sanitizeNumber(event.priceSol),
      priceUsd: sanitizeNumber(event.priceUsd),
      volumeSol: sanitizeNumber(event.volumeSol) ?? 0,
      volumeUsd: sanitizeNumber(event.volumeUsd) ?? 0
    };

    state.latestTrade = {
      side: event.side,
      trader: event.trader ?? null,
      priceSol: sample.priceSol,
      priceUsd: sample.priceUsd,
      volumeSol: sanitizeNumber(event.volumeSol),
      volumeUsd: sanitizeNumber(event.volumeUsd),
      tokenAmount: sanitizeNumber(event.tokenAmount),
      confidence: event.confidence,
      usableForMetrics: isTradeUsableForMetrics(event),
      at: timestamp
    };
    state.market.priceSol = sample.priceSol ?? state.market.priceSol;
    state.market.priceUsd = sample.priceUsd ?? state.market.priceUsd;

    if (isTradeUsableForMetrics(event)) {
      state.trades.push(sample);
      state.trades.sort((left, right) => left.timestampMs - right.timestampMs);
      pruneTrades(state, sample.timestampMs);
    }

    recomputeRollingState(state, sample.timestampMs);
  }

  return {
    applyIndexerEvent,
    clear: () => {
      tokens.clear();
      eventsByType.clear();
      eventCount = 0;
      lastEventAt = null;
    },
    getLiveCards: () => getSortedPublicStates(),
    getStats: () => ({
      tokenCount: tokens.size,
      eventCount,
      eventsByType: Object.fromEntries(eventsByType) as Partial<
        Record<IndexerEventType, number>
      >,
      lastEventAt
    }),
    getToken: (mint: string) => {
      const state = tokens.get(mint.trim());
      return state ? toPublicState(state, now()) : undefined;
    },
    getTokens: () => getSortedPublicStates()
  };

  function getSortedPublicStates(): LiveTokenState[] {
    return Array.from(tokens.values())
      .map((state) => toPublicState(state, now()))
      .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt));
  }
}

function toPublicState(
  state: MutableLiveTokenState,
  now: Date
): LiveTokenState {
  return sanitizeLiveState({
    ...state,
    ageSeconds: Math.max(
      0,
      Math.round((now.getTime() - Date.parse(state.firstSeenAt)) / 1000)
    ),
    dataCompleteness: computeDataCompleteness(state)
  });
}

function createEmptyMarket(): LiveTokenMarketState {
  return {
    priceSol: null,
    priceUsd: null,
    volumeSol1s: 0,
    volumeSol5s: 0,
    volumeSol10s: 0,
    volumeSol60s: 0,
    volumeUsd1s: 0,
    volumeUsd5s: 0,
    volumeUsd10s: 0,
    volumeUsd60s: 0,
    marketCapUsd: null,
    liquidityUsd: null,
    fdvUsd: null
  };
}

function createEmptyFlow(): LiveTokenFlowState {
  return {
    buyCount10s: 0,
    sellCount10s: 0,
    tradeCount10s: 0,
    uniqueBuyers10s: 0,
    uniqueSellers10s: 0,
    buySellRatio: null,
    netBuyPressure: null
  };
}

function recomputeRollingState(
  state: MutableLiveTokenState,
  referenceTimestampMs: number
): void {
  pruneTrades(state, referenceTimestampMs);
  const window1s = filterWindow(state.trades, referenceTimestampMs, 1000);
  const window5s = filterWindow(state.trades, referenceTimestampMs, 5000);
  const window10s = filterWindow(state.trades, referenceTimestampMs, 10000);
  const window60s = filterWindow(state.trades, referenceTimestampMs, 60000);

  state.market = {
    ...state.market,
    volumeSol1s: sum(window1s, "volumeSol"),
    volumeSol5s: sum(window5s, "volumeSol"),
    volumeSol10s: sum(window10s, "volumeSol"),
    volumeSol60s: sum(window60s, "volumeSol"),
    volumeUsd1s: sum(window1s, "volumeUsd"),
    volumeUsd5s: sum(window5s, "volumeUsd"),
    volumeUsd10s: sum(window10s, "volumeUsd"),
    volumeUsd60s: sum(window60s, "volumeUsd")
  };

  const buyTrades = window10s.filter((trade) => trade.side === "buy");
  const sellTrades = window10s.filter((trade) => trade.side === "sell");
  const buyVolume = sum(buyTrades, "volumeSol") || sum(buyTrades, "volumeUsd");
  const sellVolume =
    sum(sellTrades, "volumeSol") || sum(sellTrades, "volumeUsd");
  const totalVolume = buyVolume + sellVolume;

  state.flow = {
    buyCount10s: buyTrades.length,
    sellCount10s: sellTrades.length,
    tradeCount10s: window10s.length,
    uniqueBuyers10s: uniqueTraders(buyTrades),
    uniqueSellers10s: uniqueTraders(sellTrades),
    buySellRatio: sellVolume > 0 ? roundMetric(buyVolume / sellVolume) : buyVolume > 0 ? 999 : null,
    netBuyPressure:
      totalVolume > 0 ? roundMetric((buyVolume - sellVolume) / totalVolume) : null
  };
}

function computeDataCompleteness(state: MutableLiveTokenState): DataCompleteness {
  const missingFields: string[] = [];
  const unavailableFields: string[] = [];

  if (!state.identity.name) {
    missingFields.push("name");
  }

  if (!state.identity.symbol) {
    missingFields.push("symbol");
  }

  if (!state.market.priceSol && !state.market.priceUsd) {
    missingFields.push("price");
  }

  if (!state.holders.holderCount) {
    unavailableFields.push("holderCount");
  }

  if (!state.latestTrade) {
    unavailableFields.push("latestTrade");
  }

  const requiredFields = ["name", "symbol", "price", "latestTrade"];
  const availableFieldCount = requiredFields.length - missingFields.length -
    unavailableFields.filter((field) => requiredFields.includes(field)).length;
  const completenessPct = clamp(
    Math.round((availableFieldCount / requiredFields.length) * 100),
    0,
    100
  );
  const hasIdentity = Boolean(state.identity.name || state.identity.symbol);
  const hasMetadata = Boolean(
    state.identity.metadataUri || state.identity.imageUri || state.identity.description
  );
  const hasTrade = state.latestTrade !== null;
  const hasHolders = state.holders.holderCount !== null;
  const label: DataCompletenessLabel =
    hasTrade && hasIdentity && hasHolders
      ? "strategy_ready"
      : hasTrade && hasMetadata
        ? "enriched"
        : hasTrade
          ? "trade_tracked"
          : "discovery_only";

  return {
    label,
    missingFields,
    unavailableFields,
    completenessPct
  };
}

function filterWindow(
  trades: TradeSample[],
  referenceTimestampMs: number,
  windowMs: number
): TradeSample[] {
  const cutoff = referenceTimestampMs - windowMs;
  return trades.filter(
    (trade) =>
      Number.isFinite(trade.timestampMs) &&
      trade.timestampMs > cutoff &&
      trade.timestampMs <= referenceTimestampMs
  );
}

function pruneTrades(state: MutableLiveTokenState, referenceTimestampMs: number): void {
  const cutoff = referenceTimestampMs - 60_000;
  state.trades = state.trades.filter((trade) => trade.timestampMs >= cutoff);
}

function sum(trades: TradeSample[], key: "volumeSol" | "volumeUsd"): number {
  return roundMetric(trades.reduce((total, trade) => total + trade[key], 0));
}

function uniqueTraders(trades: TradeSample[]): number {
  return new Set(
    trades.map(
      (trade) => trade.trader ?? `${trade.side}:${trade.at}:${trade.volumeSol}:${trade.volumeUsd}`
    )
  ).size;
}

function sanitizeLiveState(state: LiveTokenState & { trades?: TradeSample[] }): LiveTokenState {
  const publicState = { ...state };
  delete publicState.trades;
  return publicState;
}

function sanitizeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeInteger(value: number | null | undefined): number | null {
  const number = sanitizeNumber(value);
  return number === null ? null : Math.max(0, Math.trunc(number));
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(10)) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function maxIso(left: string, right: string): string {
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function createTitle(
  symbol: string | null,
  name: string | null,
  mint: string
): string {
  if (symbol && name) {
    return `${symbol} - ${name}`;
  }

  return name ?? symbol ?? shortMint(mint);
}

function createDisplayName(
  symbol: string | null,
  name: string | null,
  title: string | null,
  mint: string
): string {
  if (symbol && name) {
    return `${symbol} ${name}`.slice(0, 48);
  }

  return (title ?? shortMint(mint)).slice(0, 48);
}

function assertNeverEvent(event: never): never {
  throw new Error(`Unhandled indexer event: ${String(event)}`);
}
