import { loadApiConfig } from "./app";

const config = loadApiConfig();
const args = parseArgs(process.argv.slice(2));
const estimatedCostPerEventSol =
  config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000 / 10_000;
const estimatedCostSol = round(args.events * estimatedCostPerEventSol);

console.log(
  JSON.stringify(
    {
      events: args.events,
      eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
      estimatedCostPerEventSol: round(estimatedCostPerEventSol),
      estimatedCostSol,
      maxSessionCostSol: config.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL,
      withinSessionCostCap:
        estimatedCostSol <= config.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL,
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      reasonCodes: [
        "METERED_LAUNCH_DATA_COST_ESTIMATE",
        "PUMPPORTAL_TRADE_STREAM_METERED",
        "METERED_LAUNCH_DATA_ONLY_NO_TRADING",
        "LIGHTNING_EXECUTION_DISABLED"
      ]
    },
    null,
    2
  )
);

function parseArgs(argv: string[]) {
  let events = 10_000;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--events") {
      events = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
    }
  }

  if (!Number.isInteger(events) || events < 0) {
    throw new Error("--events must be a non-negative integer");
  }

  return { events };
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}
