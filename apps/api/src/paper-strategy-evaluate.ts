import { buildCalibrationDataset } from "@axi/session-capture";
import { evaluatePaperStrategy } from "@axi/paper-strategy-evaluation";
import {
  closeStorage,
  defaultDatabaseRelativePath,
  getCalibrationCaptureSession,
  initStorageReadOnly,
  listCapturedSignalObservationsBySession
} from "@axi/storage";

type SessionSelection = {
  sessionId: string;
  requiredPartition: "train" | "validation" | null;
};

type CliOptions = {
  databasePath: string;
  positionSizeSol: number | undefined;
  startingCapitalSol: number | undefined;
  sessions: SessionSelection[];
  thresholds: number[] | undefined;
};

const options = parseArgs(process.argv.slice(2));
const evaluatedAt = new Date().toISOString();
initStorageReadOnly({ databasePath: options.databasePath });

try {
  const datasets = options.sessions.map((selection) => {
    const session = getCalibrationCaptureSession(selection.sessionId);

    if (!session) {
      throw new Error(
        `Calibration capture session ${selection.sessionId} was not found`
      );
    }

    if (session.status !== "stopped") {
      throw new Error(
        `Calibration capture session ${selection.sessionId} must be stopped normally before evaluation`
      );
    }

    if (
      selection.requiredPartition &&
      session.partition !== selection.requiredPartition
    ) {
      throw new Error(
        `Calibration capture session ${selection.sessionId} is ${session.partition}, not ${selection.requiredPartition}`
      );
    }

    return buildCalibrationDataset({
      session,
      observations: listCapturedSignalObservationsBySession(
        selection.sessionId,
        { limit: session.config.maxObservationsPerSession }
      ),
      generatedAt: evaluatedAt
    });
  });
  const report = evaluatePaperStrategy({
    evaluationId: `adhoc-paper-eval-${evaluatedAt.replace(/[^0-9]/gu, "")}`,
    evaluatedAt,
    datasets,
    ...(options.thresholds ? { thresholdCandidates: options.thresholds } : {}),
    ...(options.positionSizeSol !== undefined ||
    options.startingCapitalSol !== undefined
      ? {
          config: {
            ...(options.positionSizeSol !== undefined
              ? { positionSizeSol: options.positionSizeSol }
              : {}),
            ...(options.startingCapitalSol !== undefined
              ? { startingCapitalSol: options.startingCapitalSol }
              : {})
          }
        }
      : {})
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  closeStorage();
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    databasePath: defaultDatabaseRelativePath,
    positionSizeSol: undefined,
    startingCapitalSol: undefined,
    sessions: [],
    thresholds: undefined
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

    if (
      arg === "--session" ||
      arg === "--train-session" ||
      arg === "--validation-session"
    ) {
      options.sessions.push({
        sessionId: requiredValue(args, index, arg),
        requiredPartition:
          arg === "--train-session"
            ? "train"
            : arg === "--validation-session"
              ? "validation"
              : null
      });
      index += 1;
      continue;
    }

    if (arg === "--from-db") {
      options.databasePath = requiredValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--thresholds") {
      options.thresholds = parseThresholds(requiredValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--position-size-sol") {
      options.positionSizeSol = positiveNumber(
        requiredValue(args, index, arg),
        arg
      );
      index += 1;
      continue;
    }

    if (arg === "--starting-capital-sol") {
      options.startingCapitalSol = positiveNumber(
        requiredValue(args, index, arg),
        arg
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg ?? ""}`);
  }

  if (options.sessions.length === 0) {
    throw new Error("At least one capture session is required");
  }

  return options;
}

function parseThresholds(value: string): number[] {
  const entries = value.split(",").map((entry) => entry.trim());
  const thresholds = entries.map(Number);

  if (
    entries.length === 0 ||
    entries.some((entry) => entry.length === 0) ||
    thresholds.some(
      (threshold) =>
        !Number.isFinite(threshold) || threshold < 0 || threshold > 100
    )
  ) {
    throw new Error(
      "--thresholds requires comma-separated values from 0 to 100"
    );
  }

  return Array.from(new Set(thresholds));
}

function positiveNumber(value: string, flag: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number`);
  }

  return parsed;
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
  pnpm --filter @axi/api paper:strategy:evaluate -- --train-session <id> --validation-session <id>
  pnpm --filter @axi/api paper:strategy:evaluate -- --session <id> [--session <id> ...] [options]

Options:
  --from-db <sqlite-path>
  --thresholds <comma-separated scores>
  --position-size-sol <amount>
  --starting-capital-sol <amount>

The command reads finalized local capture sessions and prints a non-activating
fixed-horizon paper evaluation. It does not write to SQLite or start feeds.\n`);
}
