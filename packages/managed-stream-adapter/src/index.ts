import type { EventBus } from "@axi/event-bus";
import {
  createIndexerEventId,
  indexerReasonCodes,
  type IndexerEventType,
  type NormalizedIndexerEvent
} from "@axi/indexer-core";
import type { LiveTokenStateStore } from "@axi/live-state";
import {
  createPumpfunDecoder,
  pumpfunEventToIndexerEvent,
  type PumpfunDecoder
} from "@axi/pumpfun-decoder";
import {
  getEnvelopeSignature,
  isTransactionEnvelope,
  normalizeProviderError,
  type ManagedStreamEnvelope,
  type ManagedStreamProviderKind
} from "@axi/stream-core";
import type { TradeTimeseries } from "@axi/timeseries";

export const managedStreamAdapterReasonCodes = {
  decoderError: "STREAM_DECODER_ERROR",
  eventPublished: "STREAM_EVENT_PUBLISHED",
  envelopeDecoded: "STREAM_ENVELOPE_DECODED",
  envelopeRouted: "STREAM_ENVELOPE_ROUTED",
  envelopeUnknown: "STREAM_ENVELOPE_UNKNOWN",
  liveStateUpdated: "STREAM_LIVE_STATE_UPDATED",
  pumpfunSelected: "STREAM_DECODER_PUMPFUN_SELECTED",
  pumpfunSkipped: "STREAM_DECODER_PUMPFUN_SKIPPED",
  timeseriesUpdated: "STREAM_TIMESERIES_UPDATED"
} as const;

export type ManagedStreamAdapterOptions = {
  providerKind?: ManagedStreamProviderKind;
  pumpfunDecoder?: PumpfunDecoder;
  eventBus?: EventBus;
  liveState?: LiveTokenStateStore;
  timeseries?: TradeTimeseries;
  enabledDecoders?: {
    pumpfun?: boolean;
  };
  routeUnknownTransactions?: boolean;
  maxRecentEvents?: number;
};

export type ManagedStreamAdapterStatus = {
  providerKind: ManagedStreamProviderKind;
  envelopesReceived: number;
  eventsProduced: number;
  eventsByType: Partial<Record<IndexerEventType, number>>;
  decodeErrors: number;
  unknownEvents: number;
  lastEnvelopeAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  enabledDecoders: {
    pumpfun: boolean;
  };
  routeUnknownTransactions: boolean;
  reasonCodes: string[];
};

export type SanitizedStreamEnvelope = {
  id: string;
  provider: ManagedStreamProviderKind;
  connectionId?: string;
  schemaVersion: 1;
  chain: "solana";
  commitment: string;
  streamType: string;
  slot?: number;
  blockTime?: number | string | null;
  signature?: string | null;
  programIds?: string[];
  accountKeys?: string[];
  receivedAt: string;
  reasonCodes: string[];
};

export type ManagedStreamAdapter = {
  routeEnvelope: (envelope: ManagedStreamEnvelope) => NormalizedIndexerEvent[];
  getAdapterStatus: () => ManagedStreamAdapterStatus;
  getRecentEnvelopes: (limit?: number) => SanitizedStreamEnvelope[];
};

type MutableAdapterState = {
  envelopesReceived: number;
  eventsProduced: number;
  eventsByType: Map<IndexerEventType, number>;
  decodeErrors: number;
  unknownEvents: number;
  lastEnvelopeAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  recentEnvelopes: SanitizedStreamEnvelope[];
};

export function createManagedStreamAdapter(
  options: ManagedStreamAdapterOptions = {}
): ManagedStreamAdapter {
  const providerKind = options.providerKind ?? "unknown";
  const enabledDecoders = {
    pumpfun: options.enabledDecoders?.pumpfun ?? true
  };
  const routeUnknownTransactions = options.routeUnknownTransactions ?? true;
  const maxRecentEvents = Math.max(1, options.maxRecentEvents ?? 100);
  const pumpfunDecoder = options.pumpfunDecoder ?? createPumpfunDecoder();
  const state: MutableAdapterState = {
    envelopesReceived: 0,
    eventsProduced: 0,
    eventsByType: new Map(),
    decodeErrors: 0,
    unknownEvents: 0,
    lastEnvelopeAt: null,
    lastEventAt: null,
    lastError: null,
    recentEnvelopes: []
  };

  function routeManagedEnvelope(
    envelope: ManagedStreamEnvelope
  ): NormalizedIndexerEvent[] {
    state.envelopesReceived += 1;
    state.lastEnvelopeAt = envelope.receivedAt;
    state.recentEnvelopes.unshift(sanitizeEnvelope(envelope));

    while (state.recentEnvelopes.length > maxRecentEvents) {
      state.recentEnvelopes.pop();
    }

    const events = createDecoderRouter({
      enabledDecoders,
      pumpfunDecoder,
      routeUnknownTransactions
    })(envelope);

    for (const event of events) {
      applyEvent(event, envelope);
    }

    return events;
  }

  function applyEvent(
    event: NormalizedIndexerEvent,
    envelope: ManagedStreamEnvelope
  ): void {
    const routedEvent = addReasonCodes(event, [
      managedStreamAdapterReasonCodes.envelopeRouted,
      ...envelope.reasonCodes
    ]);
    state.eventsProduced += 1;
    state.eventsByType.set(
      routedEvent.type,
      (state.eventsByType.get(routedEvent.type) ?? 0) + 1
    );
    state.lastEventAt = routedEvent.receivedAt;

    if (routedEvent.type === "unknown") {
      state.unknownEvents += 1;
    }

    if (routedEvent.reasonCodes.includes(managedStreamAdapterReasonCodes.decoderError)) {
      state.decodeErrors += 1;
      state.lastError =
        routedEvent.reasonCodes.find((code) => code.includes("failed")) ??
        managedStreamAdapterReasonCodes.decoderError;
    }

    options.eventBus?.publish(
      addReasonCodes(routedEvent, [managedStreamAdapterReasonCodes.eventPublished])
    );
    options.liveState?.applyIndexerEvent(
      addReasonCodes(routedEvent, [managedStreamAdapterReasonCodes.liveStateUpdated])
    );

    if (routedEvent.type === "token_trade") {
      const ingested = options.timeseries?.ingestTrade(
        addReasonCodes(routedEvent, [
          managedStreamAdapterReasonCodes.timeseriesUpdated
        ])
      );

      if (ingested) {
        state.lastEventAt = routedEvent.receivedAt;
      }
    }
  }

  return {
    routeEnvelope: routeManagedEnvelope,
    getAdapterStatus: () => ({
      providerKind,
      envelopesReceived: state.envelopesReceived,
      eventsProduced: state.eventsProduced,
      eventsByType: Object.fromEntries(state.eventsByType) as Partial<
        Record<IndexerEventType, number>
      >,
      decodeErrors: state.decodeErrors,
      unknownEvents: state.unknownEvents,
      lastEnvelopeAt: state.lastEnvelopeAt,
      lastEventAt: state.lastEventAt,
      lastError: state.lastError,
      enabledDecoders,
      routeUnknownTransactions,
      reasonCodes: [
        managedStreamAdapterReasonCodes.envelopeRouted,
        ...(enabledDecoders.pumpfun
          ? [managedStreamAdapterReasonCodes.pumpfunSelected]
          : [managedStreamAdapterReasonCodes.pumpfunSkipped]),
        ...(state.decodeErrors > 0
          ? [managedStreamAdapterReasonCodes.decoderError]
          : [])
      ]
    }),
    getRecentEnvelopes: (limit = maxRecentEvents) =>
      state.recentEnvelopes.slice(0, Math.max(0, limit))
  };

  function createDecoderRouter(input: {
    enabledDecoders: { pumpfun: boolean };
    pumpfunDecoder: PumpfunDecoder;
    routeUnknownTransactions: boolean;
  }): (envelope: ManagedStreamEnvelope) => NormalizedIndexerEvent[] {
    return (envelope) => routeEnvelope(envelope, input);
  }
}

export function routeEnvelope(
  envelope: ManagedStreamEnvelope,
  options: {
    enabledDecoders?: {
      pumpfun?: boolean;
    };
    pumpfunDecoder?: PumpfunDecoder;
    routeUnknownTransactions?: boolean;
  } = {}
): NormalizedIndexerEvent[] {
  const enabledDecoders = {
    pumpfun: options.enabledDecoders?.pumpfun ?? true
  };
  const routeUnknownTransactions = options.routeUnknownTransactions ?? true;

  if (!isTransactionEnvelope(envelope)) {
    return routeUnknownTransactions ? [createUnknownIndexerEvent(envelope)] : [];
  }

  if (!enabledDecoders.pumpfun) {
    return routeUnknownTransactions ? [createUnknownIndexerEvent(envelope)] : [];
  }

  return createPumpfunEnvelopeRouter({
    pumpfunDecoder: options.pumpfunDecoder ?? createPumpfunDecoder(),
    routeUnknownTransactions
  })(envelope);
}

export function createPumpfunEnvelopeRouter(options: {
  pumpfunDecoder?: PumpfunDecoder;
  routeUnknownTransactions?: boolean;
} = {}): (envelope: ManagedStreamEnvelope) => NormalizedIndexerEvent[] {
  const pumpfunDecoder = options.pumpfunDecoder ?? createPumpfunDecoder();
  const routeUnknownTransactions = options.routeUnknownTransactions ?? true;

  return (envelope) => {
    if (!isTransactionEnvelope(envelope)) {
      return routeUnknownTransactions ? [createUnknownIndexerEvent(envelope)] : [];
    }

    try {
      const decoded = pumpfunDecoder.decodePumpfunTransaction(envelope.raw);
      const event = addReasonCodes(pumpfunEventToIndexerEvent(decoded), [
        managedStreamAdapterReasonCodes.pumpfunSelected,
        managedStreamAdapterReasonCodes.envelopeDecoded
      ]);

      if (event.type === "unknown" && !routeUnknownTransactions) {
        return [];
      }

      return [event];
    } catch (error) {
      const normalized = normalizeProviderError(error);

      if (!routeUnknownTransactions) {
        return [];
      }

      return [
        addReasonCodes(createUnknownIndexerEvent(envelope, normalized.message), [
          managedStreamAdapterReasonCodes.decoderError
        ])
      ];
    }
  };
}

export function createDecoderRouter(options: {
  enabledDecoders?: {
    pumpfun?: boolean;
  };
  pumpfunDecoder?: PumpfunDecoder;
  routeUnknownTransactions?: boolean;
} = {}): (envelope: ManagedStreamEnvelope) => NormalizedIndexerEvent[] {
  return (envelope) => routeEnvelope(envelope, options);
}

export function getAdapterStatus(
  adapter: Pick<ManagedStreamAdapter, "getAdapterStatus">
): ManagedStreamAdapterStatus {
  return adapter.getAdapterStatus();
}

function createUnknownIndexerEvent(
  envelope: ManagedStreamEnvelope,
  errorMessage?: string
): NormalizedIndexerEvent {
  const receivedAt = envelope.receivedAt;

  return {
    id: createIndexerEventId({
      type: "unknown",
      source: `managed_stream:${envelope.provider}`,
      signature: getEnvelopeSignature(envelope),
      slot: envelope.slot ?? null,
      blockTime: envelope.blockTime ?? null,
      receivedAt
    }),
    schemaVersion: 1,
    source: `managed_stream:${envelope.provider}`,
    sourceMode: envelope.provider === "mock" ? "replay" : "real",
    chain: "solana",
    signature: getEnvelopeSignature(envelope),
    receivedAt,
    program: envelope.programIds?.[0] ?? null,
    raw: envelope.raw,
    reasonCodes: uniqueReasonCodes([
      indexerReasonCodes.schemaV1,
      indexerReasonCodes.eventNormalized,
      indexerReasonCodes.eventUnknown,
      managedStreamAdapterReasonCodes.envelopeUnknown,
      ...(errorMessage ? [managedStreamAdapterReasonCodes.decoderError] : []),
      ...(errorMessage ? [errorMessage] : []),
      ...envelope.reasonCodes
    ]),
    type: "unknown",
    mint: null,
    ...(envelope.slot !== undefined ? { slot: envelope.slot } : {}),
    ...(envelope.blockTime !== undefined ? { blockTime: envelope.blockTime } : {})
  };
}

function addReasonCodes<T extends NormalizedIndexerEvent>(
  event: T,
  reasonCodes: string[]
): T {
  return {
    ...event,
    reasonCodes: uniqueReasonCodes([...event.reasonCodes, ...reasonCodes])
  };
}

function sanitizeEnvelope(envelope: ManagedStreamEnvelope): SanitizedStreamEnvelope {
  return {
    id: envelope.id,
    provider: envelope.provider,
    schemaVersion: envelope.schemaVersion,
    chain: envelope.chain,
    commitment: envelope.commitment,
    streamType: envelope.streamType,
    receivedAt: envelope.receivedAt,
    reasonCodes: [...envelope.reasonCodes],
    ...(envelope.connectionId !== undefined
      ? { connectionId: envelope.connectionId }
      : {}),
    ...(envelope.slot !== undefined ? { slot: envelope.slot } : {}),
    ...(envelope.blockTime !== undefined ? { blockTime: envelope.blockTime } : {}),
    ...(envelope.signature !== undefined ? { signature: envelope.signature } : {}),
    ...(envelope.programIds ? { programIds: [...envelope.programIds] } : {}),
    ...(envelope.accountKeys ? { accountKeys: [...envelope.accountKeys] } : {})
  };
}

function uniqueReasonCodes(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
