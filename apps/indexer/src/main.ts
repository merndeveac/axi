import { createIndexerApp } from "./indexer-app";
import { loadIndexerConfig } from "./config";
import { runPumpfunDecodeCli } from "./pumpfun-cli";

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
        decodedEventCount: status.pumpfunFixtures?.decodedEventCount ?? 0,
        eventsByType: status.pumpfunFixtures?.eventsByType ?? {},
        liveTokenCount: status.liveState.tokenCount,
        tradeCount: status.pumpfunFixtures?.tradeCount ?? 0,
        decodeErrors: status.pumpfunFixtures?.decodeErrors ?? 0,
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
} else if (command === "decode:pumpfun") {
  runPumpfunDecodeCli(process.argv.slice(3));
  app.stop();
} else {
  const status = app.start();
  console.log(JSON.stringify(status, null, 2));
}
