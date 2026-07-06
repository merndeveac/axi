import { spawn } from "node:child_process";
import {
  findForbiddenEnvKeys,
  formatYesNo,
  isFilled,
  readDotEnvFile
} from "../setup/pumpportal-data-env-utils.mjs";

const root = process.cwd();
const env = {
  ...readDotEnvFile(`${root}/.env.local`),
  ...process.env
};
const missing = [];
const forbiddenKeys = findForbiddenEnvKeys(env);
const dataApiKeyConfigured = isFilled(env.PUMPPORTAL_DATA_API_KEY);
const fallbackApiKeyConfigured = isFilled(env.PUMPPORTAL_API_KEY);
const publicKeyConfigured = isFilled(env.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY);

if (env.METERED_LAUNCH_DATA_ENABLED !== "true") {
  missing.push("METERED_LAUNCH_DATA_ENABLED=true");
}

if (env.METERED_LAUNCH_DATA_ACK_COST !== "true") {
  missing.push("METERED_LAUNCH_DATA_ACK_COST=true");
}

if (!dataApiKeyConfigured && !fallbackApiKeyConfigured) {
  missing.push("PUMPPORTAL_DATA_API_KEY");
}

if (!publicKeyConfigured) {
  missing.push("PUMPPORTAL_DATA_WALLET_PUBLIC_KEY");
}

if (forbiddenKeys.length > 0) {
  console.error("Metered launch data refused to start.");
  console.error(
    `Forbidden private-key or seed variable present: ${forbiddenKeys.join(", ")}`
  );
  console.error("Do NOT paste private keys, seed phrases, or mnemonics into .env.local.");
  process.exit(1);
}

if (missing.length > 0) {
  console.error("Metered launch data gates are not ready.");
  console.error("Set these in .env.local:");

  for (const item of missing) {
    console.error(`- ${item}`);
  }

  console.error("");
  console.error("Run pnpm setup:pumpportal-data-env, then edit .env.local.");
  console.error("This script does not set the metered cost ACK or API key for you.");
  process.exit(1);
}

console.log("Metered launch data preflight:");
console.log(`- data wallet public key configured: ${formatYesNo(publicKeyConfigured)}`);
console.log(
  `- PumpPortal data API key configured: ${formatYesNo(
    dataApiKeyConfigured || fallbackApiKeyConfigured
  )}`
);
console.log(`- metered launch ACK: ${formatYesNo(env.METERED_LAUNCH_DATA_ACK_COST === "true")}`);
console.log(
  `- session cost cap SOL: ${env.METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL ?? "0.001"}`
);
console.log(
  `- max tracked mints: ${env.METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS ?? "3"}`
);
console.log("- private key present: no");
console.log("- live trading: disabled");

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
  PUMPPORTAL_API_KEY:
    isFilled(env.PUMPPORTAL_API_KEY)
      ? env.PUMPPORTAL_API_KEY
      : env.PUMPPORTAL_DATA_API_KEY,
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
