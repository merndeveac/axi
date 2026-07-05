import { createInMemoryEventBus } from "@axi/event-bus";
import type { NormalizedIndexerEvent } from "@axi/indexer-core";
import { createLiveTokenStateStore } from "@axi/live-state";
import { createTradeTimeseries } from "@axi/timeseries";
import type { IndexerConfig } from "./config";
import { createInMemoryIndexerSink } from "./sinks/in-memory-sink";
import {
  createMockIndexerSource,
  type MockIndexerSource
} from "./sources/mock-indexer-source";
import {
  createPumpfunFixtureSource,
  type PumpfunFixtureSource,
  type PumpfunFixtureSourceSummary
} from "./sources/pumpfun-fixture-source";
import { getPumpPortalIndexerSourceStatus } from "./sources/pumpportal-indexer-source";

export type IndexerAppStatus = {
  enabled: boolean;
  source: string;
  mode: string;
  geyser: {
    enabled: boolean;
    implemented: false;
    urlConfigured: boolean;
    tokenConfigured: boolean;
    status: "not_implemented";
  };
  eventBus: ReturnType<ReturnType<typeof createInMemoryEventBus>["getStats"]>;
  liveState: ReturnType<ReturnType<typeof createLiveTokenStateStore>["getStats"]>;
  pumpfunFixtures: PumpfunFixtureSourceSummary | null;
  pumpPortal: ReturnType<typeof getPumpPortalIndexerSourceStatus>;
  paperOnly: true;
  tradingDisabled: true;
  reasonCodes: string[];
};

export type IndexerApp = {
  getRecentEvents: (limit?: number) => NormalizedIndexerEvent[];
  getStatus: () => IndexerAppStatus;
  runPumpfunSmoke: () => IndexerAppStatus;
  runSmoke: () => IndexerAppStatus;
  start: () => IndexerAppStatus;
  stop: () => void;
};

export function createIndexerApp(config: IndexerConfig): IndexerApp {
  const bus = createInMemoryEventBus({
    recentEventLimit: config.INDEXER_RECENT_EVENT_LIMIT
  });
  const liveState = createLiveTokenStateStore();
  const timeseries = createTradeTimeseries();
  const sink = createInMemoryIndexerSink({ bus, liveState, timeseries });
  let activeSource: IndexerSource | null = null;
  let started = false;

  function start(): IndexerAppStatus {
    if (started) {
      return getStatus();
    }

    started = true;

    if (!config.INDEXER_ENABLED) {
      return getStatus(["INDEXER_DISABLED"]);
    }

    if (config.GEYSER_ENABLED || config.INDEXER_SOURCE === "future_geyser") {
      return getStatus(["GEYSER_SOURCE_NOT_IMPLEMENTED"]);
    }

    activeSource = createSource(config);

    if (!activeSource) {
      return getStatus(["INDEXER_SOURCE_NOT_IMPLEMENTED"]);
    }

    activeSource.start(sink.ingest);
    return getStatus(["INDEXER_STARTED"]);
  }

  function stop(): void {
    activeSource?.stop();
    activeSource = null;
    started = false;
  }

  function runSmoke(): IndexerAppStatus {
    stop();
    config.INDEXER_ENABLED = true;
    config.INDEXER_SOURCE = "mock";
    return start();
  }

  function runPumpfunSmoke(): IndexerAppStatus {
    stop();
    config.INDEXER_ENABLED = true;
    config.INDEXER_SOURCE = "pumpfun-fixtures";
    config.INDEXER_MODE = "replay";
    return start();
  }

  function getStatus(extraReasonCodes: string[] = []): IndexerAppStatus {
    return {
      enabled: config.INDEXER_ENABLED,
      source: config.INDEXER_SOURCE,
      mode: config.INDEXER_MODE,
      geyser: {
        enabled: config.GEYSER_ENABLED,
        implemented: false,
        urlConfigured: config.GEYSER_GRPC_URL !== undefined,
        tokenConfigured: config.GEYSER_GRPC_TOKEN !== undefined,
        status: "not_implemented"
      },
      eventBus: bus.getStats(),
      liveState: liveState.getStats(),
      pumpfunFixtures:
        activeSource?.name === "pumpfun-fixtures"
          ? activeSource.getSummary()
          : null,
      pumpPortal: getPumpPortalIndexerSourceStatus(),
      paperOnly: true,
      tradingDisabled: true,
      reasonCodes: [
        "INDEXER_FOUNDATION_ONLY",
        "NO_GEYSER_CONNECTION",
        "NO_TRADING",
        ...extraReasonCodes
      ]
    };
  }

  return {
    getRecentEvents: (limit) => bus.getRecentEvents(limit),
    getStatus,
    runPumpfunSmoke,
    runSmoke,
    start,
    stop
  };
}

type IndexerSource = MockIndexerSource | PumpfunFixtureSource;

function createSource(config: IndexerConfig): IndexerSource | null {
  if (config.INDEXER_SOURCE === "mock") {
    return createMockIndexerSource();
  }

  if (config.INDEXER_SOURCE === "pumpfun-fixtures") {
    return createPumpfunFixtureSource({
      fixtureDir: config.INDEXER_FIXTURE_DIR
    });
  }

  return null;
}
