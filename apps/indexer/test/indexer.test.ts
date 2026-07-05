import { describe, expect, it } from "vitest";
import { createIndexerApp } from "../src/indexer-app";
import { loadIndexerConfig } from "../src/config";
import { createMockIndexerSource } from "../src/sources/mock-indexer-source";
import { createPumpfunFixtureSource } from "../src/sources/pumpfun-fixture-source";
import { createInMemoryEventBus } from "@axi/event-bus";
import { createLiveTokenStateStore } from "@axi/live-state";
import { createTradeTimeseries } from "@axi/timeseries";
import { createInMemoryIndexerSink } from "../src/sinks/in-memory-sink";
import { parsePumpfunDecodeArgs, runPumpfunDecodeCli } from "../src/pumpfun-cli";

describe("@axi/indexer", () => {
  it("parses config defaults", () => {
    const config = loadIndexerConfig({});

    expect(config.INDEXER_ENABLED).toBe(false);
    expect(config.INDEXER_SOURCE).toBe("mock");
    expect(config.INDEXER_FIXTURE_DIR).toBe("packages/pumpfun-decoder/fixtures");
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

  it("pumpfun fixture source emits expected event types", () => {
    const source = createPumpfunFixtureSource({
      fixtureDir: "packages/pumpfun-decoder/fixtures"
    });
    const events: string[] = [];

    source.start((event) => events.push(event.type));

    expect(events).toContain("token_created");
    expect(events.filter((type) => type === "token_trade")).toHaveLength(2);
    expect(events).toContain("token_migrated");
    expect(source.getSummary().decodeErrors).toBe(0);
  });

  it("pumpfun fixture source updates live-state and timeseries", () => {
    const bus = createInMemoryEventBus();
    const liveState = createLiveTokenStateStore({
      now: () => new Date("2026-01-01T00:00:20.000Z")
    });
    const timeseries = createTradeTimeseries();
    const sink = createInMemoryIndexerSink({ bus, liveState, timeseries });
    const source = createPumpfunFixtureSource({
      fixtureDir: "packages/pumpfun-decoder/fixtures"
    });

    source.start(sink.ingest);

    const cards = liveState.getLiveCards();
    const token = cards[0];

    expect(liveState.getStats().tokenCount).toBe(1);
    expect(bus.getStats().publishedCount).toBeGreaterThanOrEqual(6);
    expect(token?.eventTypes).toEqual([
      "token_created",
      "token_trade",
      "token_migrated"
    ]);
    expect(token?.market.priceSol).toBe(0.0004);
    expect(token?.market.volumeSol10s).toBe(1.9);
    expect(token?.flow.buyCount10s).toBe(1);
    expect(token?.flow.sellCount10s).toBe(1);

    const windows = timeseries.getWindows(
      "FixturePumpMint11111111111111111111111111111"
    );
    expect(windows["10s"].tradeCount).toBe(2);
    expect(windows["10s"].volumeSol).toBe(1.9);
    expect(windows["10s"].closeSol).toBe(0.0004);
  });

  it("pumpfun smoke mode reports decoded fixture stats", () => {
    const app = createIndexerApp(loadIndexerConfig({}));
    const status = app.runPumpfunSmoke();

    expect(status.source).toBe("pumpfun-fixtures");
    expect(status.pumpfunFixtures?.decodedEventCount).toBe(6);
    expect(status.pumpfunFixtures?.tradeCount).toBe(2);
    expect(status.pumpfunFixtures?.decodeErrors).toBe(0);
    expect(status.liveState.tokenCount).toBe(1);
    expect(status.liveState.eventsByType.token_migrated).toBe(1);
  });

  it("parses and runs pumpfun decode CLI file mode", () => {
    const options = parsePumpfunDecodeArgs([
      "--",
      "--file",
      "packages/pumpfun-decoder/fixtures/buy-trade.json",
      "--summary",
      "true"
    ]);

    expect(options.file).toBe("packages/pumpfun-decoder/fixtures/buy-trade.json");
    expect(options.summary).toBe(true);

    const result = runWithCapturedConsole(() =>
      runPumpfunDecodeCli([
        "--file",
        "packages/pumpfun-decoder/fixtures/buy-trade.json"
      ])
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("token_trade");
    expect(result.summary.tradeCount).toBe(1);
  });
});

function runWithCapturedConsole<T>(fn: () => T): T {
  const originalLog = console.log;

  try {
    console.log = () => undefined;
    return fn();
  } finally {
    console.log = originalLog;
  }
}
