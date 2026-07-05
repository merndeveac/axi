import {
  simulateLaunchMomentumFixture,
  type LaunchSimulationFixture
} from "@axi/launch-momentum";

const args = parseArgs(process.argv.slice(2));
const snapshot = simulateLaunchMomentumFixture(args.fixture);

console.log(
  JSON.stringify(
    {
      fixture: args.fixture,
      snapshot,
      paperOnly: true,
      tradingDisabled: true,
      reasonCodes: ["LAUNCH_SIMULATION_FIXTURE", "NO_NETWORK", "NO_TRADING"]
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
