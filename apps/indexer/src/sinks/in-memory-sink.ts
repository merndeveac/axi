import type { EventBus } from "@axi/event-bus";
import type { NormalizedIndexerEvent } from "@axi/indexer-core";
import type { LiveTokenStateStore } from "@axi/live-state";
import type { TradeTimeseries } from "@axi/timeseries";

export type InMemoryIndexerSink = {
  ingest: (event: NormalizedIndexerEvent) => void;
};

export function createInMemoryIndexerSink(options: {
  bus: EventBus;
  liveState: LiveTokenStateStore;
  timeseries: TradeTimeseries;
}): InMemoryIndexerSink {
  return {
    ingest: (event) => {
      options.bus.publish(event);
      options.liveState.applyIndexerEvent(event);

      if (event.type === "token_trade") {
        options.timeseries.ingestTrade(event);
      }
    }
  };
}
