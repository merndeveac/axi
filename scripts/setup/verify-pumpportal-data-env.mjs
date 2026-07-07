import { existsSync } from "node:fs";
import {
  envLocalPath,
  findForbiddenEnvKeys,
  formatYesNo,
  isFilled,
  isGitIgnored,
  isGitRepository,
  loadEnvLocal,
  validatePumpPortalDataEnv
} from "./pumpportal-data-env-utils.mjs";

const root = process.cwd();
const path = envLocalPath(root);

if (!existsSync(path)) {
  console.error(".env.local is missing.");
  console.error("Run pnpm setup:pumpportal-data-env, then edit .env.local.");
  process.exit(1);
}

const gitignored = isGitRepository(root) ? isGitIgnored(".env.local", root) : null;
const env = loadEnvLocal(root);
const validation = validatePumpPortalDataEnv(env, { gitignored });
const privateKeyPresent = findForbiddenEnvKeys(env).length > 0;
const accountTradesDisabled =
  (env.EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED ?? "").trim() === "false";
const lightningLiveTradingDisabled =
  (env.PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING ?? "").trim() === "false";

if (gitignored === false) {
  validation.errors.push(".env.local is not gitignored.");
}

console.log("PumpPortal data env:");
console.log(`- .env.local present: yes`);
console.log(
  `- gitignored: ${gitignored === null ? "unknown" : formatYesNo(gitignored)}`
);
console.log(
  `- public key configured: ${formatYesNo(validation.publicKeyConfigured)}`
);
console.log(
  `- API key configured: ${formatYesNo(validation.dataApiKeyConfigured)}`
);
console.log(`- private key present: ${privateKeyPresent ? "ERROR" : "no"}`);
console.log(
  `- metered data enabled: ${formatYesNo((env.METERED_LAUNCH_DATA_ENABLED ?? "") === "true")}`
);
console.log(
  `- UI session ACK required: ${formatYesNo((env.METERED_LAUNCH_DATA_REQUIRE_UI_ACK ?? "") === "true")}`
);
console.log(
  `- account trades disabled: ${formatYesNo(accountTradesDisabled)}`
);
console.log(
  `- Lightning live trading disabled: ${formatYesNo(lightningLiveTradingDisabled)}`
);

if (!isFilled(env.PUMPPORTAL_API_KEY) && isFilled(env.PUMPPORTAL_DATA_API_KEY)) {
  console.log("- PUMPPORTAL_API_KEY fallback: inferred from PUMPPORTAL_DATA_API_KEY");
}

for (const warning of validation.warnings) {
  console.warn(`WARNING: ${warning}`);
}

if (validation.errors.length > 0) {
  console.error("");
  console.error("PumpPortal data env verification failed:");

  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }

  console.error("");
  console.error("Do NOT paste your private key into .env.local.");
  process.exit(1);
}

console.log("");
console.log("PumpPortal data env verification passed.");
console.log("No API key or private key values were printed.");
