import { createExitSimulationFixture } from "@axi/exit-strategy";

type ExitSimulationFixture =
  | "watched-wallet-buy-profit"
  | "watched-wallet-buy-no-position"
  | "watched-wallet-buy-below-profit"
  | "watched-wallet-sell";

const args = parseArgs(process.argv.slice(2));
const result = createExitSimulationFixture(args.fixture);

console.log(
  JSON.stringify(
    {
      fixture: args.fixture,
      ...result,
      paperOnly: true,
      networkDisabled: true,
      tradingDisabled: true,
      liveExecutionDisabled: true,
      reasonCodes: ["EXIT_SIMULATION_FIXTURE", "NO_NETWORK", "NO_TRADING"]
    },
    null,
    2
  )
);

function parseArgs(argv: string[]): { fixture: ExitSimulationFixture } {
  let fixture: ExitSimulationFixture = "watched-wallet-buy-profit";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--fixture") {
      fixture = parseFixture(readValue(argv, index, arg));
      index += 1;
    }
  }

  return { fixture };
}

function parseFixture(value: string): ExitSimulationFixture {
  if (
    value === "watched-wallet-buy-profit" ||
    value === "watched-wallet-buy-no-position" ||
    value === "watched-wallet-buy-below-profit" ||
    value === "watched-wallet-sell"
  ) {
    return value;
  }

  throw new Error(
    "--fixture must be watched-wallet-buy-profit, watched-wallet-buy-no-position, watched-wallet-buy-below-profit, or watched-wallet-sell"
  );
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}
