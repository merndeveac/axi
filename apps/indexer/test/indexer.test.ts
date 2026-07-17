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
import {
  parsePumpfunFetchArgs,
  runPumpfunFetchFixtureCli
} from "../src/pumpfun-fetch-cli";
import {
  buildManagedStreamSubscriptionPreview,
  createLaserStreamRealReadiness,
  createManagedStreamSource,
  createManagedStreamStatusFromConfig,
  runManagedStreamBuildSubscriptionCli,
  runManagedStreamConnectCheckCli,
  runManagedStreamLaserStreamConnectCli,
  runManagedStreamConfigCli
} from "../src/sources/managed-stream-source";

describe("@axi/indexer", () => {
  it("parses config defaults", () => {
    const config = loadIndexerConfig({});

    expect(config.INDEXER_ENABLED).toBe(false);
    expect(config.INDEXER_SOURCE).toBe("mock");
    expect(config.INDEXER_FIXTURE_DIR).toBe("packages/pumpfun-decoder/fixtures");
    expect(config.TIMESERIES_RETENTION_MS).toBe(300_000);
    expect(config.GEYSER_ENABLED).toBe(false);
    expect(config.MANAGED_STREAM_ENABLED).toBe(false);
    expect(config.MANAGED_STREAM_PROVIDER).toBe("mock");
    expect(config.MANAGED_STREAM_ALLOW_REAL_CONNECTION).toBe(false);
    expect(config.MANAGED_STREAM_REAL_PROVIDER).toBe("mock");
    expect(config.MANAGED_STREAM_API_KEY).toBeUndefined();
    expect(config.LASERSTREAM_MAX_MESSAGES_PER_SESSION).toBe(10000);
    expect(config.LASERSTREAM_MAX_RUNTIME_MS).toBe(300000);
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
    expect(source.getSummary().fixtureCount).toBe(6);
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
    expect(status.pumpfunFixtures?.usableTradeCount).toBe(2);
    expect(status.pumpfunFixtures?.ohlcvBarCount).toBeGreaterThan(0);
    expect(status.pumpfunFixtures?.decodeErrors).toBe(0);
    expect(status.liveState.tokenCount).toBe(1);
    expect(status.liveState.eventsByType.token_migrated).toBe(1);
    expect(status.timeseries).toMatchObject({
      canonical: true,
      bucketMs: 1000,
      retentionMs: 300_000
    });
  });

  it("managed stream source with mock provider emits Pump.fun fixture events", () => {
    const config = loadIndexerConfig({
      MANAGED_STREAM_ENABLED: "true",
      MANAGED_STREAM_PROVIDER: "mock"
    });
    const source = createManagedStreamSource(config);
    const events: string[] = [];

    source.start((event) => events.push(event.type));

    expect(events).toContain("token_created");
    expect(events.filter((type) => type === "token_trade")).toHaveLength(2);
    expect(source.getSummary().providerStatus.provider).toBe("mock");
    expect(source.getSummary().envelopeCount).toBe(6);
  });

  it("managed stream smoke mode reports adapter stats", () => {
    const app = createIndexerApp(loadIndexerConfig({}));
    const status = app.runManagedStreamSmoke();

    expect(status.source).toBe("managed-stream");
    expect(status.managedStream?.envelopeCount).toBe(6);
    expect(status.managedStream?.normalizedEventCount).toBe(6);
    expect(status.managedStream?.providerStatus.provider).toBe("mock");
    expect(status.managedStream?.ohlcvBarCount).toBeGreaterThan(0);
    expect(status.liveState.tokenCount).toBe(1);
  });

  it("managed stream status reports placeholders for real providers", () => {
    const yellowstone = createManagedStreamStatusFromConfig(
      loadIndexerConfig({
        MANAGED_STREAM_ENABLED: "true",
        MANAGED_STREAM_PROVIDER: "yellowstone",
        YELLOWSTONE_GRPC_URL: "https://yellowstone.example.invalid",
        YELLOWSTONE_GRPC_TOKEN: "not-a-real-token"
      })
    );
    const laserstream = createManagedStreamStatusFromConfig(
      loadIndexerConfig({
        MANAGED_STREAM_ENABLED: "true",
        MANAGED_STREAM_PROVIDER: "laserstream",
        LASERSTREAM_GRPC_URL: "https://laserstream.example.invalid",
        LASERSTREAM_API_KEY: "not-a-real-key"
      })
    );

    expect(yellowstone.providerStatus.connectionState).toBe("not_implemented");
    expect(yellowstone.authTokenMasked).toBe("configured:16");
    expect(JSON.stringify(yellowstone)).not.toContain("not-a-real-token");
    expect(laserstream.providerStatus.connectionState).toBe("blocked");
    expect(laserstream.reasonCodes).toContain("REAL_STREAM_DISABLED");
    expect(JSON.stringify(laserstream)).not.toContain("not-a-real-key");
  });

  it("managed stream config CLI masks endpoints and auth", () => {
    const config = loadIndexerConfig({
      MANAGED_STREAM_ENABLED: "true",
      MANAGED_STREAM_PROVIDER: "laserstream",
      LASERSTREAM_GRPC_URL: "https://laserstream.example.invalid?api_key=secret",
      LASERSTREAM_API_KEY: "not-a-real-key"
    });
    const result = runWithCapturedConsole(() =>
      runManagedStreamConfigCli(config, [])
    );
    const serialized = JSON.stringify(result);

    expect(result.clientKind).toBe("laserstream");
    expect(result.endpointMasked).toContain("api_key=****");
    expect(result.authConfigured).toBe(true);
    expect(serialized).not.toContain("not-a-real-key");
    expect(serialized).not.toContain("api_key=secret");
  });

  it("reports LaserStream real readiness and connect-check without connecting", () => {
    const blocked = runWithCapturedConsole(() =>
      runManagedStreamConnectCheckCli(loadIndexerConfig({}), [])
    );
    const readyConfig = loadIndexerConfig({
      MANAGED_STREAM_ALLOW_REAL_CONNECTION: "true",
      MANAGED_STREAM_REAL_CONNECTION_ACK: "true",
      MANAGED_STREAM_REAL_PROVIDER: "laserstream",
      LASERSTREAM_ENABLED: "true",
      LASERSTREAM_GRPC_URL: "https://laserstream.example.invalid?api-key=secret",
      LASERSTREAM_API_KEY: "not-a-real-key",
      PUMPFUN_PROGRAM_ID: "FakePumpfunProgram111111111111111111111111111"
    });
    const ready = runWithCapturedConsole(() =>
      runManagedStreamConnectCheckCli(readyConfig, [])
    );
    const readiness = createLaserStreamRealReadiness(readyConfig);
    const serialized = JSON.stringify({ blocked, ready, readiness });

    expect(blocked.wouldConnect).toBe(false);
    expect(blocked.reasonCodes).toContain("REAL_STREAM_DISABLED");
    expect(ready.wouldConnect).toBe(true);
    expect(readiness.canConnect).toBe(true);
    expect(readiness.maskedConfig.endpointMasked).toContain("api-key=****");
    expect(serialized).not.toContain("not-a-real-key");
    expect(serialized).not.toContain("api-key=secret");
  });

  it("refuses LaserStream connect command when real gates are closed", async () => {
    const result = await runWithCapturedConsoleAsync(() =>
      runManagedStreamLaserStreamConnectCli(loadIndexerConfig({}), [])
    );

    expect(result.attempted).toBe(false);
    expect(result.connected).toBe(false);
    expect(result.messageCount).toBe(0);
    expect(result.reasonCodes).toContain("NO_NETWORK");
    expect(result.reasonCodes).toContain("REAL_STREAM_DISABLED");
  });

  it("managed stream build-subscription previews Yellowstone and LaserStream", () => {
    const config = loadIndexerConfig({
      MANAGED_STREAM_PROVIDER: "yellowstone",
      YELLOWSTONE_GRPC_URL: "https://yellowstone.example.invalid?token=secret",
      YELLOWSTONE_GRPC_TOKEN: "not-a-real-token"
    });
    const yellowstone = runWithCapturedConsole(() =>
      runManagedStreamBuildSubscriptionCli(config, [
        "--provider",
        "yellowstone",
        "--include-program",
        "FakeProgram111111111111111111111111111111111",
        "--required-account",
        "FakeRequired1111111111111111111111111111111",
        "--profile",
        "pumpfun_program_transactions"
      ])
    );
    const laserstream = buildManagedStreamSubscriptionPreview(config, {
      provider: "laserstream",
      commitment: "processed",
      profile: "laserstream_pumpfun_transactions",
      includeProgram: ["FakeLaserProgram111111111111111111111111111"],
      requiredAccount: ["FakeLaserRequired1111111111111111111111111"]
    });
    const serialized = JSON.stringify({ yellowstone, laserstream });

    expect(yellowstone.provider).toBe("yellowstone");
    expect(yellowstone.subscriptionSummary.transactionAccountIncludeCount).toBe(1);
    expect(yellowstone.reasonCodes).toContain("STREAM_PROFILE_BUILT");
    expect(laserstream.provider).toBe("laserstream");
    expect(laserstream.subscriptionSummary.commitment).toBe("processed");
    expect(serialized).not.toContain("not-a-real-token");
    expect(serialized).not.toContain("secret");
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

  it("parses and runs pumpfun decode CLI manifest modes", () => {
    const fixtureResult = runWithCapturedConsole(() =>
      runPumpfunDecodeCli([
        "--fixture",
        "buy-trade.json",
        "--summary",
        "true",
        "--show-evidence",
        "true"
      ])
    );
    const manifestResult = runWithCapturedConsole(() =>
      runPumpfunDecodeCli([
        "--manifest-id",
        "buy-trade",
        "--compare-expected",
        "true"
      ])
    );

    expect(fixtureResult.results[0]?.classification?.evidence.logHints.length)
      .toBeGreaterThan(0);
    expect(manifestResult.results[0]?.expectedComparison?.ok).toBe(true);
  });

  it("parses fetch:pumpfun-fixture args", () => {
    const options = parsePumpfunFetchArgs([
      "--signature",
      "Sig111",
      "--kind",
      "buy_trade",
      "--update-manifest",
      "true"
    ]);

    expect(options.signature).toBe("Sig111");
    expect(options.kind).toBe("buy_trade");
    expect(options.updateManifest).toBe(true);
  });

  it("fetch:pumpfun-fixture uses mocked RPC and writes sanitized output", async () => {
    const writes: Array<{ path: string; value: string }> = [];
    const fixture = {
      slot: 123,
      blockTime: 1767225600,
      transaction: {
        signatures: ["Sig111"],
        message: {
          accountKeys: [],
          instructions: []
        }
      },
      meta: {
        err: null,
        logMessages: [],
        preBalances: [],
        postBalances: [],
        preTokenBalances: [],
        postTokenBalances: []
      }
    };
    const fetchImpl = async () => ({
      json: async () => ({ result: fixture })
    });
    const result = await runWithCapturedConsoleAsync(() =>
      runPumpfunFetchFixtureCli(
        [
          "--signature",
          "Sig111",
          "--kind",
          "buy_trade",
          "--rpc",
          "https://example.invalid",
          "--out",
          "packages/pumpfun-decoder/fixtures/imported/Sig111.json"
        ],
        {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          writeFile: (path, value) => writes.push({ path, value })
        }
      )
    );

    expect(result.transactionFound).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]?.value ?? "{}")).toMatchObject({
      signature: "Sig111"
    });
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

async function runWithCapturedConsoleAsync<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;

  try {
    console.log = () => undefined;
    return await fn();
  } finally {
    console.log = originalLog;
  }
}
