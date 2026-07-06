import { chmodSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  envLocalPath,
  isGitIgnored,
  isGitRepository
} from "./pumpportal-data-env-utils.mjs";

const root = process.cwd();
const templatePath = join(root, ".env.pumpportal-data.example");
const targetPath = envLocalPath(root);

if (!existsSync(templatePath)) {
  console.error(".env.pumpportal-data.example was not found.");
  process.exit(1);
}

if (existsSync(targetPath)) {
  console.log(".env.local already exists. It was not overwritten.");
} else {
  copyFileSync(templatePath, targetPath);

  try {
    chmodSync(targetPath, 0o600);
  } catch (error) {
    console.warn(
      `Could not chmod .env.local to 600: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  console.log("Created .env.local from .env.pumpportal-data.example.");
}

if (isGitRepository(root)) {
  if (!isGitIgnored(".env.local", root)) {
    console.error("");
    console.error("ERROR: .env.local is not gitignored. Do not paste secrets until this is fixed.");
    process.exit(1);
  }

  console.log(".env.local gitignored: yes");
} else {
  console.log(".env.local gitignored: skipped outside a Git worktree");
}

console.log("");
console.log("PumpPortal metered data setup warnings:");
console.log("- Do NOT paste your PumpPortal private key.");
console.log("- Do NOT commit .env.local.");
console.log("- Fund only small SOL for metered data messages.");
console.log("- PumpPortal token-trade data is metered and costs SOL.");
console.log("- No trading, signing, Lightning execution, or account trades are enabled.");
console.log("");
console.log("Required keys in .env.local:");
console.log("- PUMPPORTAL_DATA_WALLET_PUBLIC_KEY");
console.log("- PUMPPORTAL_DATA_API_KEY");
console.log("- SOLANA_RPC_HTTP is optional but recommended for read-only balance checks.");
console.log("");
console.log("Next steps:");
console.log("1. Open .env.local.");
console.log("2. Fill PUMPPORTAL_DATA_WALLET_PUBLIC_KEY.");
console.log("3. Fill PUMPPORTAL_DATA_API_KEY.");
console.log("4. Fill SOLANA_RPC_HTTP if you want read-only balance checks.");
console.log("5. Do NOT paste your private key.");
console.log("6. Fund the public key with a small amount of SOL.");
console.log("7. Run pnpm verify:pumpportal-data-env.");
console.log("8. Run pnpm live:tokens:metered.");
