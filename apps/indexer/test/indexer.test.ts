import { describe, expect, it } from "vitest";
import { createIndexerApp } from "../src/indexer-app";
import { loadIndexerConfig } from "../src/config";
import { createMockIndexerSource } from "../src/sources/mock-indexer-source";
import { createInMemoryEventBus } from "@axi/event-bus";
import { createLiveTokenStateStore } from "@axi/live-state";
import { createTradeTimeseries } from "@axi/timeseries";
import { createInMemoryIndexerSink } from "../src/sinks/in-memory-sink";

describe("@axi/indexer", () => {
  it("parses config defaults", () => {
    const config = loadIndexerConfig({});

    expect(config.INDEXER_ENABLED).toBe(false);
    expect(config.INDEXER_SOURCE).toBe("mock");
    expect(config.GEYSER_ENABLED).toBe(false);
  });

  it("mock source emits events", () => {
    const source = createMockIndexerSource({
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });
    const events: string[] = [];

    source.start((event) => events.push(event.type));

    expect(events).toEqual(["token_created", "token_trade", "holder_snapshot"]);
  });

  it("live-state receives events through the in-memory sink", () => {
    const bus = createInMemoryEventBus();
    const liveState = createLiveTokenStateStore();
    const timeseries = createTradeTimeseries();
    const sink = createInMemoryIndexerSink({ bus, liveState, timeseries });
    const source = createMockIndexerSource({
      now: () => new Date("2026-01-01T00:00:00.000Z")
    });

    source.start(sink.ingest);

    expect(liveState.getStats().tokenCount).toBe(1);
    expect(bus.getStats().publishedCount).toBe(3);
  });

  it("smoke mode emits mock events and reports stats", () => {
    const app = createIndexerApp(loadIndexerConfig({}));
    const status = app.runSmoke();

    expect(status.liveState.tokenCount).toBe(1);
    expect(status.eventBus.publishedCount).toBe(3);
    expect(status.geyser.status).toBe("not_implemented");
  });
});
