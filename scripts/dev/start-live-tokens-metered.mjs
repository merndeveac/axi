import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const env = {
  ...readDotEnvFile(join(root, ".env.local")),
  ...process.env
};
const missing = [];

if (env.METERED_LAUNCH_DATA_ENABLED !== "true") {
  missing.push("METERED_LAUNCH_DATA_ENABLED=true");
}

if (env.METERED_LAUNCH_DATA_ACK_COST !== "true") {
  missing.push("METERED_LAUNCH_DATA_ACK_COST=true");
}

if (!env.PUMPPORTAL_DATA_API_KEY && !env.PUMPPORTAL_API_KEY) {
  missing.push("PUMPPORTAL_DATA_API_KEY or PUMPPORTAL_API_KEY");
}

if (!env.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY) {
  missing.push("PUMPPORTAL_DATA_WALLET_PUBLIC_KEY");
}

if (missing.length > 0) {
  console.error("Metered launch data gates are not ready.");
  console.error("Set these in your shell or .env.local:");

  for (const item of missing) {
    console.error(`- ${item}`);
  }

  console.error("");
  console.error("This script does not set the metered cost ACK for you.");
  process.exit(1);
}

const childEnv = {
  ...env,
  BOT_MODE: "paper",
  METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS:
    env.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS ?? "3",
  METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION:
    env.METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION ?? "1000",
  METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL:
    env.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL ?? "0.001",
  PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING: "false",
  PUMPPORTAL_LIGHTNING_MANUAL_ARMED: "false",
  EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED: "false",
  EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED: "false",
  PAPER_AUTO_ORDER: "false"
};

await new Promise((resolve, reject) => {
  const child = spawn("pnpm", ["live:tokens"], {
    cwd: root,
    env: childEnv,
    stdio: "inherit"
  });

  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`pnpm live:tokens failed with ${code}`));
  });
});

function readDotEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const parsed = {};
  const text = readFileSync(path, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    parsed[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return parsed;
}
