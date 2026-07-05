import { describe, expect, it } from "vitest";
import { createInMemoryEventBus } from "../src/index";
import type { NormalizedIndexerEvent } from "@axi/indexer-core";

const event: NormalizedIndexerEvent = {
  id: "idx_event",
  schemaVersion: 1,
  source: "mock",
  sourceMode: "mock",
  chain: "solana",
  receivedAt: "2026-01-01T00:00:00.000Z",
  reasonCodes: ["INDEXER_SCHEMA_V1"],
  type: "token_created",
  mint: "Mint111111111111111111111111111111111111",
  name: "Portal",
  symbol: "PORTAL"
};

describe("@axi/event-bus", () => {
  it("publishes events to subscribers", () => {
    const bus = createInMemoryEventBus();
    const received: NormalizedIndexerEvent[] = [];

    bus.subscribe((nextEvent) => {
      received.push(nextEvent);
    });
    bus.publish(event);

    expect(received).toEqual([event]);
  });

  it("unsubscribes handlers", () => {
    const bus = createInMemoryEventBus();
    const received: NormalizedIndexerEvent[] = [];
    const unsubscribe = bus.subscribe((nextEvent) => {
      received.push(nextEvent);
    });

    unsubscribe();
    bus.publish(event);

    expect(received).toEqual([]);
    expect(bus.getStats().subscriberCount).toBe(0);
  });

  it("does not crash when a subscriber throws", () => {
    const bus = createInMemoryEventBus();
    const received: NormalizedIndexerEvent[] = [];

    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((nextEvent) => {
      received.push(nextEvent);
    });

    expect(() => bus.publish(event)).not.toThrow();
    expect(received).toEqual([event]);
    expect(bus.getStats().errorCount).toBe(1);
  });

  it("updates stats", () => {
    const bus = createInMemoryEventBus();

    bus.publish(event);

    expect(bus.getStats()).toMatchObject({
      publishedCount: 1,
      eventsByType: {
        token_created: 1
      }
    });
    expect(bus.getStats().lastEventAt).not.toBeNull();
  });

  it("replays recent events on subscribe", () => {
    const bus = createInMemoryEventBus({ recentEventLimit: 2 });
    const first = { ...event, id: "idx_first" };
    const second = { ...event, id: "idx_second" };
    const third = { ...event, id: "idx_third" };
    const received: string[] = [];

    bus.publish(first);
    bus.publish(second);
    bus.publish(third);
    bus.subscribe((nextEvent) => {
      received.push(nextEvent.id);
    }, {
      replayRecent: true
    });

    expect(received).toEqual(["idx_second", "idx_third"]);
  });
});
