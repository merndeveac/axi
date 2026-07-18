import { evaluatePaperLifecycleValidation } from "@axi/paper-lifecycle-validation";
import {
  closeStorage,
  defaultDatabaseRelativePath,
  initStorageReadOnly
} from "@axi/storage";
import {
  buildPaperLifecycleReplayCases,
  requireEligibleStrategyEvaluation
} from "./paper-lifecycle-validation-service";

type CliOptions = {
  databasePath: string;
  strategyEvaluationId: string;
  startingCapitalSol: number | undefined;
  positionSizeSol: number | undefined;
  maxOpenPositions: number | undefined;
};

const options = parseArgs(process.argv.slice(2));
const evaluatedAt = new Date().toISOString();
initStorageReadOnly({ databasePath: options.databasePath });

try {
  const upstream = requireEligibleStrategyEvaluation(
    options.strategyEvaluationId
  );
  const report = evaluatePaperLifecycleValidation({
    validationId: `adhoc-paper-lifecycle-${evaluatedAt.replace(/[^0-9]/gu, "")}`,
    evaluatedAt,
    strategyProvenance: {
      evaluationId: upstream.evaluationId,
      evaluationVersion: upstream.evaluationVersion,
      evaluationStatus: upstream.evaluationStatus,
      selectedThreshold: upstream.selectedThreshold,
      captureSessionIds: upstream.captureSessionIds,
      expectedObservationCount: upstream.datasetAudit.completedObservationCount
    },
    cases: buildPaperLifecycleReplayCases(upstream),
    ...(options.startingCapitalSol !== undefined ||
    options.positionSizeSol !== undefined ||
    options.maxOpenPositions !== undefined
      ? {
          config: {
            ...(options.startingCapitalSol !== undefined
              ? { startingCapitalSol: options.startingCapitalSol }
              : {}),
            ...(options.positionSizeSol !== undefined
              ? { positionSizeSol: options.positionSizeSol }
              : {}),
            ...(options.maxOpenPositions !== undefined
              ? { maxOpenPositions: options.maxOpenPositions }
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
    strategyEvaluationId: "",
    startingCapitalSol: undefined,
    positionSizeSol: undefined,
    maxOpenPositions: undefined
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

    if (arg === "--strategy-evaluation") {
      options.strategyEvaluationId = requiredValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--from-db") {
      options.databasePath = requiredValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--starting-capital-sol" || arg === "--position-size-sol") {
      const value = positiveNumber(requiredValue(args, index, arg), arg);
      if (arg === "--starting-capital-sol") {
        options.startingCapitalSol = value;
      } else {
        options.positionSizeSol = value;
      }
      index += 1;
      continue;
    }

    if (arg === "--max-open-positions") {
      options.maxOpenPositions = positiveInteger(
        requiredValue(args, index, arg),
        arg
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg ?? ""}`);
  }

  if (!options.strategyEvaluationId) {
    throw new Error("--strategy-evaluation is required");
  }

  return options;
}

function positiveNumber(value: string, flag: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive number`);
  }

  return parsed;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer`);
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
  pnpm --filter @axi/api paper:lifecycle:validate -- --strategy-evaluation <id> [options]

Options:
  --from-db <sqlite-path>
  --starting-capital-sol <amount>
  --position-size-sol <amount>
  --max-open-positions <count>

The command reads an eligible, finalized paper strategy evaluation and its
canonical one-second paths. It prints a deterministic, non-activating lifecycle
report without writing to SQLite, starting feeds, or enabling trading.\n`);
}
