import type { FeedEvent, TokenCreatedEvent, TokenTradeEvent } from "@axi/data-feeds";
import { createInMemoryEventBus, type EventBus } from "@axi/event-bus";
import {
  createIndexerEventId,
  indexerReasonCodes,
  type NormalizedIndexerEvent,
  type NormalizedTokenTradeEvent
} from "@axi/indexer-core";
import {
  createLiveTokenStateStore,
  type LiveTokenState,
  type LiveTokenStateStore
} from "@axi/live-state";
import { createTradeTimeseries, type TradeTimeseries } from "@axi/timeseries";

export type IndexerAdapterOptions = {
  enabled?: boolean;
  liveStateEnabled?: boolean;
  preferLiveStateCards?: boolean;
  recentEventLimit?: number;
};

export type IndexerAdapterStatus = {
  enabled: boolean;
  liveStateEnabled: boolean;
  preferLiveStateCards: boolean;
  source: "api_adapter";
  sourceMode: "local";
  eventBus: ReturnType<EventBus["getStats"]>;
  liveState: ReturnType<LiveTokenStateStore["getStats"]>;
  futureGeyser: {
    enabled: false;
    implemented: false;
    status: "not_implemented";
  };
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

export type IndexerAdapter = {
  ingestFeedEvent: (event: FeedEvent) => NormalizedIndexerEvent | undefined;
  ingestIndexerEvent: (event: NormalizedIndexerEvent) => void;
  getLiveCards: () => LiveTokenState[];
  getRecentEvents: (limit?: number) => NormalizedIndexerEvent[];
  getStatus: () => IndexerAdapterStatus;
  getTimeseries: (mint: string) => {
    mint: string;
    windows: ReturnType<TradeTimeseries["getWindows"]>;
    rollingStats: ReturnType<TradeTimeseries["getRollingStats"]>;
  };
};

export function createIndexerAdapter(
  options: IndexerAdapterOptions = {}
): IndexerAdapter {
  const enabled = options.enabled ?? true;
  const liveStateEnabled = options.liveStateEnabled ?? true;
  const preferLiveStateCards = options.preferLiveStateCards ?? false;
  const bus = createInMemoryEventBus({
    recentEventLimit: options.recentEventLimit ?? 1000
  });
  const liveState = createLiveTokenStateStore();
  const timeseries = createTradeTimeseries();

  function ingestIndexerEvent(event: NormalizedIndexerEvent): void {
    if (!enabled) {
      return;
    }

    bus.publish(event);

    if (liveStateEnabled) {
      liveState.applyIndexerEvent(event);
    }

    if (event.type === "token_trade") {
      timeseries.ingestTrade(event);
    }
  }

  return {
    ingestFeedEvent: (event) => {
      const indexerEvent = feedEventToIndexerEvent(event);

      if (indexerEvent) {
        ingestIndexerEvent(indexerEvent);
      }

      return indexerEvent;
    },
    ingestIndexerEvent,
    getLiveCards: () => liveState.getLiveCards(),
    getRecentEvents: (limit) => bus.getRecentEvents(limit),
    getStatus: () => ({
      enabled,
      liveStateEnabled,
      preferLiveStateCards,
      source: "api_adapter",
      sourceMode: "local",
      eventBus: bus.getStats(),
      liveState: liveState.getStats(),
      futureGeyser: {
        enabled: false,
        implemented: false,
        status: "not_implemented"
      },
      paperOnly: true,
      tradingDisabled: true,
      reasonCodes: [
        "INDEXER_API_ADAPTER",
        "INDEXER_FOUNDATION_ONLY",
        "NO_GEYSER_CONNECTION",
        "NO_TRADING",
        ...(enabled ? [] : ["INDEXER_ADAPTER_DISABLED"]),
        ...(liveStateEnabled ? [] : ["INDEXER_LIVE_STATE_DISABLED"])
      ]
    }),
    getTimeseries: (mint) => ({
      mint,
      windows: timeseries.getWindows(mint),
      rollingStats: timeseries.getRollingStats(mint)
    })
  };
}

export function feedEventToIndexerEvent(
  event: FeedEvent
): NormalizedIndexerEvent | undefined {
  if (event.type === "token_created") {
    return tokenCreatedFeedEventToIndexerEvent(event);
  }

  if (event.type === "trade") {
    return tokenTradeFeedEventToIndexerEvent(event);
  }

  return undefined;
}

function tokenCreatedFeedEventToIndexerEvent(
  event: TokenCreatedEvent
): NormalizedIndexerEvent {
  const receivedAt = event.receivedAt ?? event.timestamp;
  const sourceMode = normalizeSourceMode(event.dataSourceMode);
  const common = {
    schemaVersion: 1 as const,
    source: event.source,
    sourceMode,
    chain: "solana" as const,
    receivedAt,
    signature: event.signature ?? null,
    raw: event.raw,
    reasonCodes: [
      indexerReasonCodes.schemaV1,
      indexerReasonCodes.eventNormalized,
      ...sourceReasonCodes(event.source),
      ...(event.reasonCodes ?? [])
    ]
  };

  if (event.rawSourceEventType === "migration") {
    return {
      ...common,
      id: createIndexerEventId({
        type: "token_migrated",
        mint: event.candidate.mint,
        source: event.source,
        signature: event.signature ?? null,
        receivedAt
      }),
      type: "token_migrated",
      mint: event.candidate.mint,
      pool: readString(event.raw, "pool"),
      oldBondingCurve: event.bondingCurve ?? null,
      newPool: readString(event.raw, "newPool"),
      migrationSource: event.source
    };
  }

  return {
    ...common,
    id: createIndexerEventId({
      type: "token_created",
      mint: event.candidate.mint,
      source: event.source,
      signature: event.signature ?? null,
      receivedAt
    }),
    type: "token_created",
    mint: event.candidate.mint,
    name: event.candidate.name ?? null,
    symbol: event.candidate.symbol ?? null,
    metadataUri: event.candidate.metadataUri ?? null,
    creator: event.creator ?? event.candidate.creator ?? null,
    bondingCurve: event.bondingCurve ?? null,
    associatedBondingCurve: readString(event.raw, "associatedBondingCurve"),
    initialBuySol: readNumber(event.raw, "initialBuySol"),
    marketCapSol: readNumber(event.raw, "marketCapSol")
  };
}

function tokenTradeFeedEventToIndexerEvent(
  event: TokenTradeEvent
): NormalizedTokenTradeEvent {
  const receivedAt = event.receivedAt ?? event.timestamp;
  const usableForMetrics = event.usableForMetrics === true;

  return {
    id: createIndexerEventId({
      type: "token_trade",
      mint: event.mint,
      source: event.source,
      signature: event.signature ?? null,
      receivedAt
    }),
    schemaVersion: 1,
    source: event.source,
    sourceMode: normalizeSourceMode(event.dataSourceMode),
    chain: "solana",
    receivedAt,
    signature: event.signature ?? null,
    raw: event.raw,
    reasonCodes: [
      indexerReasonCodes.schemaV1,
      indexerReasonCodes.eventNormalized,
      ...(usableForMetrics
        ? [indexerReasonCodes.eventUsableForMetrics]
        : [indexerReasonCodes.eventUnusableForMetrics]),
      ...sourceReasonCodes(event.source),
      ...(event.reasonCodes ?? [])
    ],
    type: "token_trade",
    mint: event.mint,
    side: event.side,
    trader: event.trader ?? null,
    priceSol: event.priceSol ?? null,
    priceUsd: event.priceUsd ?? null,
    volumeSol: event.volumeSol ?? null,
    volumeUsd: event.volumeUsd ?? null,
    tokenAmount: event.tokenAmount ?? null,
    pool: readString(event.raw, "pool"),
    bondingCurve: event.bondingCurve ?? null,
    confidence: event.confidence ?? "low",
    usableForMetrics
  };
}

function normalizeSourceMode(value: unknown): "mock" | "real" | "replay" | "local" | "unknown" {
  return value === "mock" || value === "real" || value === "replay"
    ? value
    : "unknown";
}

function sourceReasonCodes(source: string): string[] {
  if (source === "mock") {
    return [indexerReasonCodes.sourceMock];
  }

  if (source === "pumpportal") {
    return [indexerReasonCodes.sourcePumpPortal];
  }

  return [];
}

function readString(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumber(raw: unknown, key: string): number | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = (raw as Record<string, unknown>)[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
