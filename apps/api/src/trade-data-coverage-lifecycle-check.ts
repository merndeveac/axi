import {
  runTradeDataCoverageLifecycleCheck,
  type TradeDataCoverageLifecycleScenario
} from "./trade-data-coverage-lifecycle-check-service";

const args = parseArgs(process.argv.slice(2));
const result = await runTradeDataCoverageLifecycleCheck(args);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`success=${result.success}`);
  console.log(`scenario=${result.scenario}`);
  console.log(`expiryOwner=${result.expiryOwner}`);
  console.log(`stopReason=${result.stopReason}`);
  console.log(`stopToUnsubscribeMs=${result.stopToUnsubscribeMs}`);
}

if (!result.success) {
  process.exitCode = 1;
}

function parseArgs(argv: string[]): {
  scenario: TradeDataCoverageLifecycleScenario;
  runtimeMs: number;
  staleNoTradesMs: number;
  graceMs: number;
  json: boolean;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--") || key === "--") {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}.`);
    }
    values.set(key, value);
    index += 1;
  }
  const scenario = values.get("--scenario") ?? "zero-trade";
  if (scenario !== "zero-trade" && scenario !== "service-owned-control") {
    throw new Error(`Unsupported lifecycle scenario: ${scenario}`);
  }
  return {
    scenario,
    runtimeMs: positiveInteger(values.get("--runtime-ms"), 90_000),
    staleNoTradesMs: positiveInteger(
      values.get("--stale-no-trades-ms"),
      30_000
    ),
    graceMs: nonnegativeInteger(values.get("--grace-ms"), 5_000),
    json: values.get("--json") === "true"
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Lifecycle durations must be positive integers.");
  }
  return parsed;
}

function nonnegativeInteger(
  value: string | undefined,
  fallback: number
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Lifecycle grace must be a nonnegative integer.");
  }
  return parsed;
}
