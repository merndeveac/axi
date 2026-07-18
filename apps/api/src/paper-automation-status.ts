import {
  evaluatePaperAutomationHealth,
  getPaperAutomationRuntimeContract
} from "@axi/paper-automation";
import {
  closeStorage,
  defaultDatabaseRelativePath,
  getLatestPaperAutomationDeployment,
  initStorageReadOnly,
  listPaperAutomationEvents,
  listPaperAutomationOperations
} from "@axi/storage";

const databasePath = parseDatabasePath(process.argv.slice(2));
initStorageReadOnly({ databasePath });

try {
  const deployment = getLatestPaperAutomationDeployment();
  const events = deployment
    ? listPaperAutomationEvents(deployment.deploymentId, 1_000)
    : [];
  const operations = deployment
    ? listPaperAutomationOperations(deployment.deploymentId, { limit: 1_000 })
    : [];

  process.stdout.write(
    `${JSON.stringify(
      {
        deployment,
        armed: deployment?.status === "armed",
        pendingOperations: operations.filter(
          (operation) => operation.status === "pending"
        ),
        operationCount: operations.length,
        eventCount: events.length,
        health: deployment
          ? evaluatePaperAutomationHealth({ deployment, events })
          : null,
        contract: getPaperAutomationRuntimeContract(),
        databasePath,
        readOnly: true,
        networkDisabled: true,
        automaticLiveExecution: false,
        paperOnly: true,
        tradingDisabled: true,
        liveExecutionDisabled: true
      },
      null,
      2
    )}\n`
  );
} finally {
  closeStorage();
}

function parseDatabasePath(args: string[]): string {
  let databasePath = defaultDatabaseRelativePath;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage:
  pnpm --filter @axi/api paper:automation:status -- [--from-db <sqlite-path>]

Reads the current paper automation deployment, pending operations, audit events,
and forward-validation health without writing to SQLite or starting feeds.\n`);
      process.exit(0);
    }
    if (arg === "--from-db") {
      const value = args[index + 1];
      if (!value) throw new Error("--from-db requires a value");
      databasePath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg ?? ""}`);
  }
  return databasePath;
}
