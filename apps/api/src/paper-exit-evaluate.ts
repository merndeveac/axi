import {
  evaluatePaperExitPolicy,
  type EvaluatePaperExitPolicyInput,
  type PaperExitMarketContext,
  type PaperExitPolicyConfigInput,
  type PaperExitPolicyPosition
} from "@axi/exit-strategy";

type Fixture =
  | "hold"
  | "stop-loss"
  | "take-profit-stage-1"
  | "trailing-stop"
  | "derivative-reversal"
  | "liquidity-deterioration"
  | "momentum-decay";

const fixture = parseArgs(process.argv.slice(2));
const input = createFixture(fixture);
const report = evaluatePaperExitPolicy(input);

process.stdout.write(
  `${JSON.stringify(
    {
      fixture,
      replayMode: true,
      networkDisabled: true,
      ...report
    },
    null,
    2
  )}\n`
);

function createFixture(fixture: Fixture): EvaluatePaperExitPolicyInput {
  const position = basePosition();
  const market = baseMarket();
  let config: PaperExitPolicyConfigInput = {};

  if (fixture === "stop-loss") {
    position.currentPriceSol = 0.7;
    position.unrealizedPnlPct = -30;
  } else if (fixture === "take-profit-stage-1") {
    position.currentPriceSol = 1.3;
    position.peakPriceSol = 1.3;
    position.unrealizedPnlPct = 30;
    position.peakUnrealizedPnlPct = 30;
  } else if (fixture === "trailing-stop") {
    position.currentPriceSol = 1.5;
    position.peakPriceSol = 2;
    position.unrealizedPnlPct = 50;
    position.peakUnrealizedPnlPct = 100;
    config = { trailingActivationPct: 20, trailingStopPct: 15 };
  } else if (fixture === "derivative-reversal") {
    market.priceVelocityPctPerSec = -1;
    market.priceAccelerationPctPerSec2 = -0.1;
  } else if (fixture === "liquidity-deterioration") {
    market.estimatedSellSlippagePct = 20;
  } else if (fixture === "momentum-decay") {
    market.launchScore = 20;
  }

  return {
    evaluationId: `paper-exit-replay-${fixture}`,
    evaluatedAt: "2026-01-01T00:01:00.000Z",
    position,
    market,
    config
  };
}

function basePosition(): PaperExitPolicyPosition {
  return {
    mint: "PaperExitReplayMint1111111111111111111111111",
    status: "open",
    openedAt: "2026-01-01T00:00:30.000Z",
    entryPriceSol: 1,
    currentPriceSol: 1.1,
    peakPriceSol: 1.1,
    unrealizedPnlPct: 10,
    peakUnrealizedPnlPct: 10,
    remainingSizeSol: 0.005,
    remainingTokenAmount: 0.005,
    completedRuleIds: []
  };
}

function baseMarket(): PaperExitMarketContext {
  return {
    launchScore: 70,
    launchPhase: "hot",
    priceVelocityPctPerSec: 1,
    priceAccelerationPctPerSec2: 0.1,
    volume5sSol: 5,
    volume30sSol: 15,
    volumeAccelerationSolPerSec2: 0.1,
    buyerAccelerationPerSec2: 0.1,
    netBuyPressure: 0.5,
    liquidityVelocitySolPerSec: 0.1,
    estimatedSellSlippagePct: 1,
    riskLevel: "low",
    hardReject: false,
    migrationDetected: false,
    watchedWalletSignal: null,
    reasonCodes: ["PAPER_EXIT_REPLAY_FIXTURE"]
  };
}

function parseArgs(args: string[]): Fixture {
  let fixture: Fixture = "take-profit-stage-1";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--fixture") {
      fixture = parseFixture(requiredValue(args, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg ?? ""}`);
  }

  return fixture;
}

function parseFixture(value: string): Fixture {
  if (
    value === "hold" ||
    value === "stop-loss" ||
    value === "take-profit-stage-1" ||
    value === "trailing-stop" ||
    value === "derivative-reversal" ||
    value === "liquidity-deterioration" ||
    value === "momentum-decay"
  ) {
    return value;
  }

  throw new Error(`Unknown paper exit fixture: ${value}`);
}

function requiredValue(
  args: string[],
  index: number,
  argument: string
): string {
  const value = args[index + 1];

  if (!value) {
    throw new Error(`${argument} requires a value`);
  }

  return value;
}

function printHelp(): void {
  process.stdout.write(
    `Usage: pnpm --filter @axi/api paper:exit:evaluate -- [options]\n\n`
  );
  process.stdout.write(`Options:\n`);
  process.stdout.write(
    `  --fixture <name>  hold, stop-loss, take-profit-stage-1, trailing-stop, derivative-reversal, liquidity-deterioration, or momentum-decay\n`
  );
}
