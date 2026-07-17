import {
  buildCalibrationDataset,
  serializeCalibrationDataset,
  type CalibrationExportFormat
} from "@axi/session-capture";
import {
  closeStorage,
  defaultDatabaseRelativePath,
  getCalibrationCaptureSession,
  initStorageReadOnly,
  listCalibrationCaptureSessions,
  listCapturedSignalObservationsBySession
} from "@axi/storage";

type CliOptions = {
  databasePath: string;
  format: CalibrationExportFormat;
  list: boolean;
  sessionId: string | null;
};

const options = parseArgs(process.argv.slice(2));
initStorageReadOnly({ databasePath: options.databasePath });

try {
  if (options.list) {
    process.stdout.write(
      `${JSON.stringify(
        {
          sessions: listCalibrationCaptureSessions(1_000),
          paperOnly: true,
          dataOnly: true,
          tradingDisabled: true
        },
        null,
        2
      )}\n`
    );
  } else {
    const sessionId = options.sessionId;

    if (!sessionId) {
      throw new Error("--session <capture-session-id> is required");
    }

    const session = getCalibrationCaptureSession(sessionId);

    if (!session) {
      throw new Error(`Calibration capture session ${sessionId} was not found`);
    }

    const observations = listCapturedSignalObservationsBySession(sessionId, {
      limit: session.config.maxObservationsPerSession
    });
    const dataset = buildCalibrationDataset({
      session,
      observations,
      generatedAt: new Date().toISOString()
    });

    process.stdout.write(
      `${serializeCalibrationDataset(dataset, options.format)}\n`
    );
  }
} finally {
  closeStorage();
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    databasePath: defaultDatabaseRelativePath,
    format: "json",
    list: false,
    sessionId: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--from-db") {
      options.databasePath = requiredValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--session") {
      options.sessionId = requiredValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--format") {
      const format = requiredValue(args, index, arg);
      index += 1;

      if (format !== "json" && format !== "jsonl" && format !== "csv") {
        throw new Error(`Unsupported calibration export format: ${format}`);
      }

      options.format = format;
      continue;
    }

    if (arg === "--list") {
      options.list = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg ?? ""}`);
  }

  return options;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function printHelp(): void {
  process.stdout.write(`Usage:
  pnpm --filter @axi/api calibration:export -- --list [--from-db <path>]
  pnpm --filter @axi/api calibration:export -- --session <id> [--format json|jsonl|csv] [--from-db <path>]

The command reads local SQLite capture data and writes the export to stdout.
It does not start feeds, materialize outcomes, or change thresholds.\n`);
}
