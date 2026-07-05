import { createIndexerApp } from "./indexer-app";
import { loadIndexerConfig } from "./config";

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
} else {
  const status = app.start();
  console.log(JSON.stringify(status, null, 2));
}
