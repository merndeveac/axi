import {
  closeStorage,
  initStorage,
  listLaunchScoreSnapshots
} from "@axi/storage";
import type { LaunchSimulationFixture } from "@axi/launch-momentum";
import {
  runPaperBacktest,
  type PaperBacktestSnapshotInput
} from "./paper-backtest-lib";

const launchFixtures: LaunchSimulationFixture[] = [
  "strong-ripper",
  "weak-launch",
  "sell-pressure",
  "no-trades"
];

type CliOptions = {
  fixture: LaunchSimulationFixture;
  fromDb: string | null;
  limit: number;
  pretty: boolean;
};

const options = parseArgs(process.argv.slice(2));

if (options.fromDb) {
  initStorage({ databasePath: options.fromDb });

  try {
    const snapshots: PaperBacktestSnapshotInput[] = listLaunchScoreSnapshots(
      options.limit
    ).map((snapshot) => ({
      mint: snapshot.mint,
      score: snapshot.score,
      label: snapshot.label,
      phase: snapshot.phase,
      tradeSampleCount: snapshot.tradeSampleCount,
      priceSol: snapshot.priceSol,
      volumeSol: snapshot.volumeSol,
      reasonCodes: snapshot.reasonCodes,
      payload: snapshot.payload,
      evaluatedAt: snapshot.evaluatedAt
    }));

    print(
      runPaperBacktest({
        snapshots
      }),
      options.pretty
    );
  } finally {
    closeStorage();
  }
} else {
  print(
    runPaperBacktest({
      fixture: options.fixture
    }),
    options.pretty
  );
}

function parseArgs(args: string[]): CliOptions {
  const parsed: CliOptions = {
    fixture: "strong-ripper",
    fromDb: null,
    limit: 100,
    pretty: true
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

    if (arg === "--fixture" || arg === "--source") {
      const value = args[index + 1];
      index += 1;

      if (isLaunchFixture(value)) {
        parsed.fixture = value;
        continue;
      }

      if (value === "launch-fixture") {
        const next = args[index + 1];

        if (isLaunchFixture(next)) {
          parsed.fixture = next;
          index += 1;
        }
        continue;
      }

      throw new Error(`Unknown launch fixture: ${value ?? ""}`);
    }

    if (arg === "--from-db") {
      parsed.fromDb = requiredValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      parsed.limit = Math.max(1, Number(requiredValue(args, index, arg)));
      index += 1;
      continue;
    }

    if (arg === "--compact") {
      parsed.pretty = false;
      continue;
    }

    if (isLaunchFixture(arg)) {
      parsed.fixture = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
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

function isLaunchFixture(
  value: string | undefined
): value is LaunchSimulationFixture {
  return launchFixtures.includes(value as LaunchSimulationFixture);
}

function print(value: unknown, pretty: boolean): void {
  console.log(JSON.stringify(value, null, pretty ? 2 : 0));
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @axi/api paper:backtest -- --fixture strong-ripper
  pnpm --filter @axi/api paper:backtest -- --source launch-fixture sell-pressure
  pnpm --filter @axi/api paper:backtest -- --from-db .data/axi.sqlite --limit 100

Options:
  --fixture <strong-ripper|weak-launch|sell-pressure|no-trades>
  --source launch-fixture <fixture>
  --from-db <sqlite-path>
  --limit <count>
  --compact`);
}
