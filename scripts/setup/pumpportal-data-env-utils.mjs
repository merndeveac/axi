import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const forbiddenEnvKeyPatterns = [
  "PRIVATE_KEY",
  "SECRET_KEY",
  "SEED_PHRASE",
  "MNEMONIC",
  "WALLET_PRIVATE",
  "PUMPPORTAL_PRIVATE_KEY"
];

export const forbiddenExactEnvKeys = ["SEED"];

export const requiredMeteredEnv = {
  API_HOST: "127.0.0.1",
  METERED_LAUNCH_DATA_CONTROLS_ENABLED: "true",
  METERED_LAUNCH_DATA_ENABLED: "true",
  METERED_LAUNCH_DATA_START_ACTIVE: "false",
  METERED_LAUNCH_DATA_REQUIRE_UI_ACK: "true",
  METERED_LAUNCH_DATA_ACK_COST: "false",
  METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS: "3",
  METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT: "250",
  METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION: "1000",
  METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL: "0.001",
  METERED_LAUNCH_DATA_MAX_UI_SESSION_COST_SOL: "0.001",
  PUMPPORTAL_TOKEN_TRADES_ENABLED: "true",
  PAPER_AUTO_ORDER: "false",
  PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING: "false",
  PUMPPORTAL_LIGHTNING_MANUAL_ARMED: "false",
  EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED: "false",
  EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED: "false"
};

export function readDotEnvFile(path) {
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

export function envLocalPath(root = process.cwd()) {
  return join(root, ".env.local");
}

export function loadEnvLocal(root = process.cwd()) {
  return readDotEnvFile(envLocalPath(root));
}

export function isFilled(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();

  return (
    trimmed.length > 0 &&
    trimmed !== "..." &&
    !trimmed.startsWith("<") &&
    !trimmed.endsWith(">") &&
    upper !== "REPLACE_ME" &&
    upper !== "TODO" &&
    upper !== "YOUR_API_KEY" &&
    upper !== "YOUR_PUBLIC_KEY"
  );
}

export function validateSolanaPublicKeyShape(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value ?? "");
}

export function findForbiddenEnvKeys(env) {
  return Object.keys(env).filter((key) => {
    const upper = key.toUpperCase();

    return (
      forbiddenExactEnvKeys.includes(upper) ||
      forbiddenEnvKeyPatterns.some((pattern) => upper.includes(pattern))
    );
  });
}

export function isGitRepository(root = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    encoding: "utf8"
  });

  return result.status === 0 && result.stdout.trim() === "true";
}

export function isGitIgnored(path, root = process.cwd()) {
  const result = spawnSync("git", ["check-ignore", "--quiet", path], {
    cwd: root,
    encoding: "utf8"
  });

  return result.status === 0;
}

export function formatYesNo(value) {
  return value ? "yes" : "no";
}

export function shortPublicKey(publicKey) {
  if (!publicKey || publicKey.length <= 14) {
    return publicKey ?? "";
  }

  return `${publicKey.slice(0, 8)}...${publicKey.slice(-6)}`;
}

export function validatePumpPortalDataEnv(env, options = {}) {
  const errors = [];
  const warnings = [];
  const forbiddenKeys = findForbiddenEnvKeys(env);
  const dataApiKeyConfigured = isFilled(env.PUMPPORTAL_DATA_API_KEY);
  const fallbackApiKeyConfigured = isFilled(env.PUMPPORTAL_API_KEY);
  const publicKeyConfigured = isFilled(env.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY);
  const publicKeyValid =
    publicKeyConfigured &&
    validateSolanaPublicKeyShape(env.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY);
  const gitignored =
    options.gitignored === undefined ? null : Boolean(options.gitignored);

  if (forbiddenKeys.length > 0) {
    errors.push(
      `Forbidden private-key or seed variable present: ${forbiddenKeys.join(", ")}`
    );
  }

  if (!publicKeyConfigured) {
    errors.push("PUMPPORTAL_DATA_WALLET_PUBLIC_KEY is required.");
  } else if (!publicKeyValid) {
    errors.push(
      "PUMPPORTAL_DATA_WALLET_PUBLIC_KEY does not look like a Solana public key."
    );
  }

  if (!dataApiKeyConfigured) {
    errors.push("PUMPPORTAL_DATA_API_KEY is required.");
  }

  if (!fallbackApiKeyConfigured) {
    if (dataApiKeyConfigured) {
      warnings.push(
        "PUMPPORTAL_API_KEY is not set; it can be inferred from PUMPPORTAL_DATA_API_KEY for compatibility."
      );
    } else {
      errors.push(
        "PUMPPORTAL_API_KEY is required or must be inferable from PUMPPORTAL_DATA_API_KEY."
      );
    }
  }

  if (!isFilled(env.SOLANA_RPC_HTTP)) {
    warnings.push(
      "SOLANA_RPC_HTTP is missing; balance checks will be unavailable."
    );
  }

  for (const [key, expected] of Object.entries(requiredMeteredEnv)) {
    if ((env[key] ?? "").trim() !== expected) {
      errors.push(`${key} must be ${expected}.`);
    }
  }

  if ((env.PUMPPORTAL_LIGHTNING_MANUAL_ARMED ?? "false").trim() !== "false") {
    errors.push("PUMPPORTAL_LIGHTNING_MANUAL_ARMED must be false.");
  }

  return {
    errors,
    fallbackApiKeyConfigured,
    forbiddenKeys,
    gitignored,
    publicKeyConfigured,
    publicKeyValid,
    dataApiKeyConfigured,
    warnings
  };
}
