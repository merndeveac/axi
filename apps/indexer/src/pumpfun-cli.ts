import type {
  IndexerEventType,
  NormalizedIndexerEvent
} from "@axi/indexer-core";
import {
  classifyPumpfunTransaction,
  compareExpectedNormalizedOutput,
  getFixtureEntry,
  listPumpfunFixtures,
  loadPumpfunFixture,
  pumpfunEventToIndexerEvent,
  summarizeTransactionFixture,
  decodePumpfunTransaction,
  type ExpectedOutputComparison,
  type FixtureManifestEntry,
  type PumpfunConfidence,
  type PumpfunTransactionClassification,
  type TransactionFixtureSummary
} from "@axi/pumpfun-decoder";
import {
  decodePumpfunFixtureFile,
  listPumpfunFixtureFiles,
  resolvePumpfunFixturePath
} from "./sources/pumpfun-fixture-source";

export type PumpfunDecodeCliOptions = {
  compareExpected: boolean;
  dir?: string;
  file?: string;
  fixture?: string;
  json: boolean;
  manifestId?: string;
  showEvidence: boolean;
  summary: boolean;
};

export type PumpfunDecodeCliItem = {
  event: NormalizedIndexerEvent;
  entry?: FixtureManifestEntry;
  classification?: PumpfunTransactionClassification;
  fixtureSummary?: TransactionFixtureSummary;
  expectedComparison?: ExpectedOutputComparison;
};

export type PumpfunDecodeCliSummary = {
  decodedEventCount: number;
  eventsByType: Partial<Record<IndexerEventType, number>>;
  tradeCount: number;
  usableTradeCount: number;
  decodeErrors: number;
  files: string[];
  fixtureCount: number;
  confidenceSummary: Partial<Record<PumpfunConfidence, number>>;
  expectedComparisons: {
    checked: number;
    matched: number;
    mismatched: number;
  };
  paperOnly: true;
  tradingDisabled: true;
  networkDisabled: true;
};

export type PumpfunDecodeCliResult = {
  events: NormalizedIndexerEvent[];
  results: PumpfunDecodeCliItem[];
  summary: PumpfunDecodeCliSummary;
};

type DecodeTarget = {
  file?: string;
  entry?: FixtureManifestEntry;
  input: unknown;
};

export function parsePumpfunDecodeArgs(argv: string[]): PumpfunDecodeCliOptions {
  const options: PumpfunDecodeCliOptions = {
    compareExpected: false,
    json: true,
    showEvidence: false,
    summary: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg || arg === "--") {
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

    if (arg.startsWith("--fixture=")) {
      options.fixture = arg.slice("--fixture=".length);
      continue;
    }

    if (arg === "--fixture") {
      options.fixture = readNextArg(argv, index, "--fixture");
      index += 1;
      continue;
    }

    if (arg.startsWith("--manifest-id=")) {
      options.manifestId = arg.slice("--manifest-id=".length);
      continue;
    }

    if (arg === "--manifest-id") {
      options.manifestId = readNextArg(argv, index, "--manifest-id");
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

    if (arg.startsWith("--show-evidence=")) {
      options.showEvidence = parseBooleanOption(
        arg.slice("--show-evidence=".length),
        "--show-evidence"
      );
      continue;
    }

    if (arg === "--show-evidence") {
      options.showEvidence = parseBooleanOption(
        readNextArg(argv, index, "--show-evidence"),
        "--show-evidence"
      );
      index += 1;
      continue;
    }

    if (arg.startsWith("--compare-expected=")) {
      options.compareExpected = parseBooleanOption(
        arg.slice("--compare-expected=".length),
        "--compare-expected"
      );
      continue;
    }

    if (arg === "--compare-expected") {
      options.compareExpected = parseBooleanOption(
        readNextArg(argv, index, "--compare-expected"),
        "--compare-expected"
      );
      index += 1;
      continue;
    }

    throw new Error(`Unknown decode:pumpfun option: ${arg}`);
  }

  const selectedTargets = [
    options.file,
    options.dir,
    options.fixture,
    options.manifestId
  ].filter(Boolean);

  if (selectedTargets.length === 0) {
    throw new Error("decode:pumpfun requires --file, --dir, --fixture, or --manifest-id");
  }

  if (selectedTargets.length > 1) {
    throw new Error("decode:pumpfun accepts one target option at a time");
  }

  return options;
}

export function runPumpfunDecodeCli(argv: string[]): PumpfunDecodeCliResult {
  const options = parsePumpfunDecodeArgs(argv);
  const targets = resolveDecodeTargets(options);
  const results: PumpfunDecodeCliItem[] = [];
  let decodeErrors = 0;

  for (const target of targets) {
    try {
      results.push(decodeTarget(target, options));
    } catch {
      decodeErrors += 1;
    }
  }

  const events = results.map((result) => result.event);
  const summary = summarizeResults(results, targets, decodeErrors);

  printDecodeResult(results, summary, options);

  return {
    events,
    results,
    summary
  };
}

function resolveDecodeTargets(options: PumpfunDecodeCliOptions): DecodeTarget[] {
  if (options.manifestId) {
    const entry = getFixtureEntry(options.manifestId);
    return [
      {
        entry,
        input: loadPumpfunFixture(entry.filename)
      }
    ];
  }

  if (options.fixture) {
    const entry = getFixtureEntry(options.fixture);
    return [
      {
        entry,
        input: loadPumpfunFixture(entry.filename)
      }
    ];
  }

  if (options.file) {
    const file = resolvePumpfunFixturePath(options.file);
    const entry = tryGetEntryByFilename(options.file);
    return [
      {
        file,
        ...(entry ? { entry } : {}),
        input: loadFileThroughExistingDecoder(file)
      }
    ];
  }

  return listPumpfunFixtureFiles(readRequiredDir(options)).map((file) => ({
    file,
    input: loadFileThroughExistingDecoder(file)
  }));
}

function decodeTarget(
  target: DecodeTarget,
  options: PumpfunDecodeCliOptions
): PumpfunDecodeCliItem {
  const decoded = decodePumpfunTransaction(target.input);
  const event = pumpfunEventToIndexerEvent(decoded);
  const classification = classifyPumpfunTransaction(target.input);
  const item: PumpfunDecodeCliItem = {
    event,
    ...(target.entry ? { entry: target.entry } : {}),
    ...(options.showEvidence ? { classification } : {}),
    fixtureSummary: summarizeTransactionFixture(target.input),
    ...(options.compareExpected && target.entry
      ? {
          expectedComparison: compareExpectedNormalizedOutput(
            target.entry,
            event
          )
        }
      : {})
  };

  return item;
}

function loadFileThroughExistingDecoder(file: string): unknown {
  const event = decodePumpfunFixtureFile(file);
  return event.raw ?? {};
}

function summarizeResults(
  results: PumpfunDecodeCliItem[],
  targets: DecodeTarget[],
  decodeErrors: number
): PumpfunDecodeCliSummary {
  const eventsByType: Partial<Record<IndexerEventType, number>> = {};
  const confidenceSummary: Partial<Record<PumpfunConfidence, number>> = {};
  let tradeCount = 0;
  let usableTradeCount = 0;
  let expectedChecked = 0;
  let expectedMatched = 0;
  let expectedMismatched = 0;

  for (const result of results) {
    eventsByType[result.event.type] = (eventsByType[result.event.type] ?? 0) + 1;

    if (result.event.type === "token_trade") {
      tradeCount += 1;

      if (result.event.usableForMetrics) {
        usableTradeCount += 1;
      }
    }

    const confidence = result.classification?.confidence ?? readEventConfidence(result.event);

    if (confidence) {
      confidenceSummary[confidence] = (confidenceSummary[confidence] ?? 0) + 1;
    }

    if (result.expectedComparison?.checked) {
      expectedChecked += 1;

      if (result.expectedComparison.ok) {
        expectedMatched += 1;
      } else {
        expectedMismatched += 1;
      }
    }
  }

  return {
    decodedEventCount: results.length,
    eventsByType,
    tradeCount,
    usableTradeCount,
    decodeErrors,
    files: targets.flatMap((target) => target.file ?? target.entry?.filename ?? []),
    fixtureCount: listPumpfunFixtures().length,
    confidenceSummary,
    expectedComparisons: {
      checked: expectedChecked,
      matched: expectedMatched,
      mismatched: expectedMismatched
    },
    paperOnly: true,
    tradingDisabled: true,
    networkDisabled: true
  };
}

function printDecodeResult(
  results: PumpfunDecodeCliItem[],
  summary: PumpfunDecodeCliSummary,
  options: PumpfunDecodeCliOptions
): void {
  if (options.json) {
    const payload =
      options.summary || options.showEvidence || options.compareExpected
        ? { results, summary }
        : results.length === 1
          ? results[0]?.event
          : results.map((result) => result.event);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (options.summary) {
    console.log(formatSummary(summary));
  }
}

function tryGetEntryByFilename(filename: string): FixtureManifestEntry | null {
  try {
    return getFixtureEntry(filename);
  } catch {
    return null;
  }
}

function readEventConfidence(
  event: NormalizedIndexerEvent
): PumpfunConfidence | null {
  return event.type === "token_trade" ? event.confidence : null;
}

function formatSummary(summary: PumpfunDecodeCliSummary): string {
  return [
    `fixtureCount=${summary.fixtureCount}`,
    `decodedEventCount=${summary.decodedEventCount}`,
    `tradeCount=${summary.tradeCount}`,
    `usableTradeCount=${summary.usableTradeCount}`,
    `decodeErrors=${summary.decodeErrors}`,
    `eventsByType=${JSON.stringify(summary.eventsByType)}`,
    `confidenceSummary=${JSON.stringify(summary.confidenceSummary)}`,
    `expectedComparisons=${JSON.stringify(summary.expectedComparisons)}`
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
