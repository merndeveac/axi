import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import {
  basename,
  extname,
  isAbsolute,
  join,
  resolve
} from "node:path";
import type {
  IndexerEventType,
  NormalizedIndexerEvent
} from "@axi/indexer-core";
import {
  decodePumpfunTransaction,
  pumpfunEventToIndexerEvent
} from "@axi/pumpfun-decoder";

export type PumpfunFixtureSourceSummary = {
  fixtureDir: string;
  decodedEventCount: number;
  decodeErrors: number;
  eventsByType: Partial<Record<IndexerEventType, number>>;
  files: string[];
  tradeCount: number;
  reasonCodes: string[];
};

export type PumpfunFixtureSource = {
  name: "pumpfun-fixtures";
  getSummary: () => PumpfunFixtureSourceSummary;
  start: (handler: (event: NormalizedIndexerEvent) => void) => void;
  stop: () => void;
};

export function createPumpfunFixtureSource(options: {
  fixtureDir: string;
}): PumpfunFixtureSource {
  const fixtureDir = resolvePumpfunFixturePath(options.fixtureDir);
  let stopped = false;
  let summary = createEmptySummary(fixtureDir);

  return {
    name: "pumpfun-fixtures",
    getSummary: () => ({
      ...summary,
      eventsByType: { ...summary.eventsByType },
      files: [...summary.files],
      reasonCodes: [...summary.reasonCodes]
    }),
    start: (handler) => {
      stopped = false;
      summary = createEmptySummary(fixtureDir);

      for (const filePath of listPumpfunFixtureFiles(fixtureDir)) {
        if (stopped) {
          return;
        }

        summary.files.push(basename(filePath));

        try {
          const event = decodePumpfunFixtureFile(filePath);
          summary.decodedEventCount += 1;
          summary.eventsByType[event.type] =
            (summary.eventsByType[event.type] ?? 0) + 1;

          if (event.type === "token_trade") {
            summary.tradeCount += 1;
          }

          handler(event);
        } catch {
          summary.decodeErrors += 1;
          summary.reasonCodes = uniqueReasonCodes([
            ...summary.reasonCodes,
            "PUMPFUN_FIXTURE_DECODE_ERROR"
          ]);
        }
      }
    },
    stop: () => {
      stopped = true;
    }
  };
}

export function decodePumpfunFixtureFile(
  filePath: string
): NormalizedIndexerEvent {
  const input = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return pumpfunEventToIndexerEvent(decodePumpfunTransaction(input));
}

export function listPumpfunFixtureFiles(fixturePath: string): string[] {
  const resolvedPath = resolvePumpfunFixturePath(fixturePath);
  const stats = statSync(resolvedPath);

  if (stats.isFile()) {
    return extname(resolvedPath) === ".json" ? [resolvedPath] : [];
  }

  return readdirSync(resolvedPath)
    .filter((entry) => extname(entry) === ".json")
    .sort(compareFixtureNames)
    .map((entry) => join(resolvedPath, entry));
}

export function resolvePumpfunFixturePath(inputPath: string): string {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  const fromCurrentWorkingDirectory = resolve(process.cwd(), inputPath);

  if (existsSync(fromCurrentWorkingDirectory)) {
    return fromCurrentWorkingDirectory;
  }

  return resolve(process.cwd(), "../..", inputPath);
}

function createEmptySummary(fixtureDir: string): PumpfunFixtureSourceSummary {
  return {
    fixtureDir,
    decodedEventCount: 0,
    decodeErrors: 0,
    eventsByType: {},
    files: [],
    tradeCount: 0,
    reasonCodes: ["PUMPFUN_FIXTURE_SOURCE", "NO_NETWORK", "NO_TRADING"]
  };
}

function uniqueReasonCodes(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function compareFixtureNames(left: string, right: string): number {
  const order = [
    "token-created.json",
    "buy-trade.json",
    "sell-trade.json",
    "migration.json",
    "failed-transaction.json",
    "unknown-transaction.json"
  ];
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);

  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? order.length : leftIndex) -
      (rightIndex === -1 ? order.length : rightIndex);
  }

  return left.localeCompare(right);
}
