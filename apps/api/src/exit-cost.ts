import { loadApiConfig } from "./app";
import {
  createWatchedWalletExitConfig,
  createWatchedWalletExitService
} from "./watched-wallet-exit-service";

const config = loadApiConfig();
const args = parseArgs(process.argv.slice(2));
const service = createWatchedWalletExitService({
  config: createWatchedWalletExitConfig({
    eventCostSolPer10000: config.PUMPPORTAL_DATA_EVENT_COST_SOL_PER_10000,
    maxEventsPerSession: config.EXIT_STRATEGY_MAX_EVENTS_PER_SESSION,
    maxSessionCostSol: config.EXIT_STRATEGY_MAX_SESSION_COST_SOL,
    maxWatchedWallets: config.EXIT_STRATEGY_MAX_WATCHED_WALLETS
  })
});

console.log(
  JSON.stringify(
    {
      ...service.estimateCost(args),
      wallets: args.wallets,
      eventsPerWallet: args.eventsPerWallet,
      networkDisabled: true,
      tradingDisabled: true
    },
    null,
    2
  )
);

function parseArgs(argv: string[]) {
  const parsed = {
    eventsPerWallet: 100,
    wallets: 10
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--wallets") {
      parsed.wallets = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
      continue;
    }

    if (arg === "--events-per-wallet") {
      parsed.eventsPerWallet = Number.parseInt(readValue(argv, index, arg), 10);
      index += 1;
    }
  }

  if (!Number.isFinite(parsed.wallets) || parsed.wallets < 0) {
    throw new Error("--wallets must be zero or greater");
  }

  if (
    !Number.isFinite(parsed.eventsPerWallet) ||
    parsed.eventsPerWallet < 0
  ) {
    throw new Error("--events-per-wallet must be zero or greater");
  }

  return parsed;
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}
