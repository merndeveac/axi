import { createIndexerApp } from "./indexer-app";
import { loadIndexerConfig } from "./config";
import { runPumpfunDecodeCli } from "./pumpfun-cli";
import { runPumpfunFetchFixtureCli } from "./pumpfun-fetch-cli";
import {
  createManagedStreamStatusFromConfig,
  runManagedStreamBuildSubscriptionCli,
  runManagedStreamConfigCli
} from "./sources/managed-stream-source";

const command = process.argv[2] ?? "dev";
const config = loadIndexerConfig();
const app = createIndexerApp(config);

if (command === "smoke") {
  const status = app.runSmoke();
  console.log(
    JSON.stringify(
      {
        status: "ok",
        liveState: status.liveState,
        eventBus: status.eventBus,
        geyser: status.geyser,
        recentEvents: app.getRecentEvents(5).map((event) => ({
          id: event.id,
          type: event.type,
          source: event.source
        }))
      },
      null,
      2
    )
  );
  app.stop();
} else if (command === "smoke:pumpfun") {
  const status = app.runPumpfunSmoke();
  console.log(
    JSON.stringify(
      {
        status: "ok",
        fixtureCount: status.pumpfunFixtures?.fixtureCount ?? 0,
        decodedEventCount: status.pumpfunFixtures?.decodedEventCount ?? 0,
        eventsByType: status.pumpfunFixtures?.eventsByType ?? {},
        liveTokenCount: status.liveState.tokenCount,
        tradeCount: status.pumpfunFixtures?.tradeCount ?? 0,
        usableTradeCount: status.pumpfunFixtures?.usableTradeCount ?? 0,
        ohlcvBarCount: status.pumpfunFixtures?.ohlcvBarCount ?? 0,
        decodeErrors: status.pumpfunFixtures?.decodeErrors ?? 0,
        confidenceSummary: status.pumpfunFixtures?.confidenceSummary ?? {},
        liveState: status.liveState,
        eventBus: status.eventBus,
        paperOnly: status.paperOnly,
        tradingDisabled: status.tradingDisabled
      },
      null,
      2
    )
  );
  app.stop();
} else if (command === "smoke:managed-stream") {
  const status = app.runManagedStreamSmoke();
  console.log(
    JSON.stringify(
      {
        status: "ok",
        streamEnvelopeCount: status.managedStream?.envelopeCount ?? 0,
        normalizedEventCount: status.managedStream?.normalizedEventCount ?? 0,
        eventsByType: status.managedStream?.eventsByType ?? {},
        liveTokenCount: status.liveState.tokenCount,
        timeseries: {
          ohlcvBarCount: status.managedStream?.ohlcvBarCount ?? 0
        },
        unknownEvents: status.managedStream?.unknownEvents ?? 0,
        decodeErrors: status.managedStream?.decodeErrors ?? 0,
        providerStatus: status.managedStream?.providerStatus ?? null,
        adapterStatus: status.managedStream?.adapterStatus ?? null,
        paperOnly: status.paperOnly,
        tradingDisabled: status.tradingDisabled
      },
      null,
      2
    )
  );
  app.stop();
} else if (command === "stream:status") {
  console.log(
    JSON.stringify(
      {
        status: "ok",
        managedStream: createManagedStreamStatusFromConfig(config)
      },
      null,
      2
    )
  );
  app.stop();
} else if (command === "stream:config") {
  runManagedStreamConfigCli(config, process.argv.slice(3));
  app.stop();
} else if (command === "stream:build-subscription") {
  runManagedStreamBuildSubscriptionCli(config, process.argv.slice(3));
  app.stop();
} else if (command === "decode:pumpfun") {
  runPumpfunDecodeCli(process.argv.slice(3));
  app.stop();
} else if (command === "fetch:pumpfun-fixture") {
  await runPumpfunFetchFixtureCli(process.argv.slice(3));
  app.stop();
} else {
  const status = app.start();
  console.log(JSON.stringify(status, null, 2));
}
