import { describe, expect, it } from "vitest";
import { createInMemoryEventBus } from "@axi/event-bus";
import { createLiveTokenStateStore } from "@axi/live-state";
import { loadPumpfunFixture } from "@axi/pumpfun-decoder";
import { createMockTransactionEnvelopeFromFixture } from "@axi/stream-mock";
import { createTradeTimeseries } from "@axi/timeseries";
import {
  createManagedStreamAdapter,
  managedStreamAdapterReasonCodes
} from "../src";

describe("@axi/managed-stream-adapter", () => {
  it("routes mock Pump.fun buy envelope into token_trade", () => {
    const bus = createInMemoryEventBus();
    const liveState = createLiveTokenStateStore();
    const timeseries = createTradeTimeseries();
    const adapter = createManagedStreamAdapter({
      providerKind: "mock",
      eventBus: bus,
      liveState,
      timeseries
    });
    const envelope = createMockTransactionEnvelopeFromFixture(
      loadPumpfunFixture("buy-trade.json")
    );

    const events = adapter.routeEnvelope(envelope);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("token_trade");
    expect(bus.getStats().publishedCount).toBe(1);
    expect(liveState.getStats().tokenCount).toBe(1);
    expect(
      timeseries.getWindows("FixturePumpMint11111111111111111111111111111")["10s"]
        .tradeCount
    ).toBe(1);
  });

  it("routes token_created fixture", () => {
    const adapter = createManagedStreamAdapter({ providerKind: "mock" });
    const envelope = createMockTransactionEnvelopeFromFixture(
      loadPumpfunFixture("token-created.json")
    );

    const events = adapter.routeEnvelope(envelope);

    expect(events[0]?.type).toBe("token_created");
    expect(adapter.getAdapterStatus().eventsByType.token_created).toBe(1);
  });

  it("routes unknown envelopes safely", () => {
    const adapter = createManagedStreamAdapter({ providerKind: "mock" });
    const envelope = createMockTransactionEnvelopeFromFixture({
      signature: "UnknownSig111",
      slot: 99,
      blockTime: 1767225600,
      transaction: { message: { accountKeys: [], instructions: [] } },
      meta: { err: null, logMessages: [] }
    });

    const events = adapter.routeEnvelope(envelope);

    expect(events[0]?.type).toBe("unknown");
    expect(adapter.getAdapterStatus().unknownEvents).toBe(1);
    expect(adapter.getRecentEnvelopes()).toHaveLength(1);
  });

  it("captures decoder errors without throwing", () => {
    const adapter = createManagedStreamAdapter({
      providerKind: "mock",
      pumpfunDecoder: {
        decodePumpfunTransaction: () => {
          throw new Error("decoder failed");
        },
        decodePumpfunTransactionBatch: () => [],
        classifyPumpfunTransaction: () => {
          throw new Error("classifier failed");
        }
      }
    });
    const envelope = createMockTransactionEnvelopeFromFixture(
      loadPumpfunFixture("buy-trade.json")
    );

    const events = adapter.routeEnvelope(envelope);

    expect(events[0]?.type).toBe("unknown");
    expect(events[0]?.reasonCodes).toContain(
      managedStreamAdapterReasonCodes.decoderError
    );
  });
});
