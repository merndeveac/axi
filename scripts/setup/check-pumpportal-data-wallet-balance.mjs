import { existsSync } from "node:fs";
import {
  envLocalPath,
  findForbiddenEnvKeys,
  isFilled,
  loadEnvLocal,
  shortPublicKey,
  validateSolanaPublicKeyShape
} from "./pumpportal-data-env-utils.mjs";

const lamportsPerSol = 1_000_000_000;
const root = process.cwd();
const path = envLocalPath(root);

if (!existsSync(path)) {
  console.error(".env.local is missing.");
  console.error("Run pnpm setup:pumpportal-data-env, then edit .env.local.");
  process.exit(1);
}

const env = loadEnvLocal(root);
const forbiddenKeys = findForbiddenEnvKeys(env);
const publicKey = env.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY ?? "";
const rpcHttpUrl = env.SOLANA_RPC_HTTP ?? "";
const minBalanceSol = parseNumber(
  env.PUMPPORTAL_DATA_WALLET_MIN_BALANCE_SOL,
  0.02
);
const warnBalanceSol = parseNumber(
  env.PUMPPORTAL_DATA_WALLET_WARN_BALANCE_SOL,
  0.03
);
const criticalBalanceSol = parseNumber(
  env.PUMPPORTAL_DATA_WALLET_CRITICAL_BALANCE_SOL,
  0.02
);

if (forbiddenKeys.length > 0) {
  console.error(
    `Forbidden private-key or seed variable present: ${forbiddenKeys.join(", ")}`
  );
  console.error("Do NOT paste your private key into .env.local.");
  process.exit(1);
}

if (!validateSolanaPublicKeyShape(publicKey)) {
  console.error("PUMPPORTAL_DATA_WALLET_PUBLIC_KEY is missing or invalid.");
  process.exit(1);
}

if (!isFilled(rpcHttpUrl)) {
  console.error("SOLANA_RPC_HTTP is required for the read-only balance check.");
  process.exit(1);
}

try {
  const response = await fetch(rpcHttpUrl, {
    body: JSON.stringify({
      id: "axi-pumpportal-data-wallet-balance",
      jsonrpc: "2.0",
      method: "getBalance",
      params: [publicKey, { commitment: "confirmed" }]
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.error) {
    throw new Error(payload.error.message ?? JSON.stringify(payload.error));
  }

  const lamports = Number(payload.result?.value);

  if (!Number.isFinite(lamports)) {
    throw new Error("RPC response did not include a numeric balance.");
  }

  const balanceSol = lamports / lamportsPerSol;
  const status =
    balanceSol <= criticalBalanceSol
      ? "critical"
      : balanceSol < warnBalanceSol
        ? "warn"
        : "ok";

  console.log("PumpPortal data wallet balance:");
  console.log(`- public key: ${shortPublicKey(publicKey)}`);
  console.log(`- balance SOL: ${balanceSol.toFixed(9)}`);
  console.log(`- min balance SOL: ${minBalanceSol}`);
  console.log(`- status: ${status}`);
  console.log("- read-only RPC check: yes");
  console.log("- private key required: no");
} catch (error) {
  console.error(
    `Read-only Solana RPC balance check failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
