import type {
  IndexerEventType,
  NormalizedIndexerEvent
} from "@axi/indexer-core";
import {
  decodePumpfunFixtureFile,
  listPumpfunFixtureFiles,
  resolvePumpfunFixturePath
} from "./sources/pumpfun-fixture-source";

export type PumpfunDecodeCliOptions = {
  dir?: string;
  file?: string;
  json: boolean;
  summary: boolean;
};

export type PumpfunDecodeCliSummary = {
  decodedEventCount: number;
  eventsByType: Partial<Record<IndexerEventType, number>>;
  tradeCount: number;
  decodeErrors: number;
  files: string[];
  paperOnly: true;
  tradingDisabled: true;
  networkDisabled: true;
};

export type PumpfunDecodeCliResult = {
  events: NormalizedIndexerEvent[];
  summary: PumpfunDecodeCliSummary;
};

export function parsePumpfunDecodeArgs(argv: string[]): PumpfunDecodeCliOptions {
  const options: PumpfunDecodeCliOptions = {
    json: true,
    summary: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg) {
      continue;
    }

    if (arg === "--") {
      continue;
    }

    if (arg.startsWith("--file=")) {
      options.file = arg.slice("--file=".length);
      continue;
    }

    if (arg === "--file") {
      options.file = readNextArg(argv, index, "--file");
      index += 1;
      continue;
    }

    if (arg.startsWith("--dir=")) {
      options.dir = arg.slice("--dir=".length);
      continue;
    }

    if (arg === "--dir") {
      options.dir = readNextArg(argv, index, "--dir");
      index += 1;
      continue;
    }

    if (arg.startsWith("--json=")) {
      options.json = parseBooleanOption(arg.slice("--json=".length), "--json");
      continue;
    }

    if (arg === "--json") {
      options.json = parseBooleanOption(readNextArg(argv, index, "--json"), "--json");
      index += 1;
      continue;
    }

    if (arg.startsWith("--summary=")) {
      options.summary = parseBooleanOption(
        arg.slice("--summary=".length),
        "--summary"
      );
      continue;
    }

    if (arg === "--summary") {
      options.summary = parseBooleanOption(
        readNextArg(argv, index, "--summary"),
        "--summary"
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown decode:pumpfun option: ${arg}`);
  }

  if (!options.file && !options.dir) {
    throw new Error("decode:pumpfun requires --file or --dir");
  }

  if (options.file && options.dir) {
    throw new Error("decode:pumpfun accepts either --file or --dir, not both");
  }

  return options;
}

export function runPumpfunDecodeCli(argv: string[]): PumpfunDecodeCliResult {
  const options = parsePumpfunDecodeArgs(argv);
  const files = options.file
    ? [resolvePumpfunFixturePath(options.file)]
    : listPumpfunFixtureFiles(readRequiredDir(options));
  const events: NormalizedIndexerEvent[] = [];
  let decodeErrors = 0;

  for (const file of files) {
    try {
      events.push(decodePumpfunFixtureFile(file));
    } catch {
      decodeErrors += 1;
    }
  }

  const summary = summarizeEvents(events, files, decodeErrors);

  if (options.json) {
    const payload = options.summary
      ? { events, summary }
      : events.length === 1
        ? events[0]
        : events;
    console.log(JSON.stringify(payload, null, 2));
  } else if (options.summary) {
    console.log(formatSummary(summary));
  }

  return {
    events,
    summary
  };
}

function summarizeEvents(
  events: NormalizedIndexerEvent[],
  files: string[],
  decodeErrors: number
): PumpfunDecodeCliSummary {
  const eventsByType: Partial<Record<IndexerEventType, number>> = {};
  let tradeCount = 0;

  for (const event of events) {
    eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;

    if (event.type === "token_trade") {
      tradeCount += 1;
    }
  }

  return {
    decodedEventCount: events.length,
    eventsByType,
    tradeCount,
    decodeErrors,
    files,
    paperOnly: true,
    tradingDisabled: true,
    networkDisabled: true
  };
}

function formatSummary(summary: PumpfunDecodeCliSummary): string {
  return [
    `decodedEventCount=${summary.decodedEventCount}`,
    `tradeCount=${summary.tradeCount}`,
    `decodeErrors=${summary.decodeErrors}`,
    `eventsByType=${JSON.stringify(summary.eventsByType)}`
  ].join("\n");
}

function readNextArg(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function parseBooleanOption(value: string, name: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} accepts true or false`);
}

function readRequiredDir(options: PumpfunDecodeCliOptions): string {
  if (!options.dir) {
    throw new Error("decode:pumpfun requires --dir");
  }

  return options.dir;
}
