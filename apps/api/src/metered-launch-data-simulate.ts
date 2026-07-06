import {
  simulateLaunchMomentumFixture,
  type LaunchSimulationFixture
} from "@axi/launch-momentum";
import { loadApiConfig } from "./app";

const config = loadApiConfig();
const args = parseArgs(process.argv.slice(2));
const snapshot = simulateLaunchMomentumFixture(args.fixture);
const wouldTrack =
  config.METERED_LAUNCH_DATA_ENABLED &&
  config.METERED_LAUNCH_DATA_ACK_COST &&
  config.METERED_LAUNCH_DATA_MODE !== "manual" &&
  snapshot.score >= config.METERED_LAUNCH_DATA_MIN_SCORE_TO_TRACK &&
  !snapshot.blockers.includes("HARD_REJECT");
const wouldExtend =
  wouldTrack && snapshot.score >= config.METERED_LAUNCH_DATA_MIN_SCORE_TO_EXTEND;

console.log(
  JSON.stringify(
    {
      fixture: args.fixture,
      snapshot,
      meteredLaunchData: {
        enabled: config.METERED_LAUNCH_DATA_ENABLED,
        acknowledgedCost: config.METERED_LAUNCH_DATA_ACK_COST,
        mode: config.METERED_LAUNCH_DATA_MODE,
        wouldTrack,
        wouldExtend,
        maxConcurrentMints: config.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS,
        maxEventsPerMint: config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT,
        maxEventsPerSession: config.METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION,
        maxSessionCostSol: config.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL
      },
      paperOnly: true,
      dataOnly: true,
      tradingDisabled: true,
      networkDisabled: true,
      reasonCodes: [
        "METERED_LAUNCH_DATA_SIMULATION",
        "LAUNCH_SIMULATION_FIXTURE",
        "NO_NETWORK",
        "NO_TRADING"
      ]
    },
    null,
    2
  )
);

function parseArgs(argv: string[]): { fixture: LaunchSimulationFixture } {
  let fixture: LaunchSimulationFixture = "strong-ripper";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--fixture") {
      fixture = parseFixture(readValue(argv, index, arg));
      index += 1;
    }
  }

  return { fixture };
}

function parseFixture(value: string): LaunchSimulationFixture {
  if (
    value === "strong-ripper" ||
    value === "weak-launch" ||
    value === "sell-pressure" ||
    value === "no-trades"
  ) {
    return value;
  }

  throw new Error(
    "--fixture must be strong-ripper, weak-launch, sell-pressure, or no-trades"
  );
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}
