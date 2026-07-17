import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findForbiddenEnvKeys,
  readDotEnvFile,
  validatePumpPortalDataEnv,
  validateSolanaPublicKeyShape
} from "../../../scripts/setup/pumpportal-data-env-utils.mjs";

const testDirectoryRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDirectoryRoot, "../../..");
const templatePath = join(repoRoot, ".env.pumpportal-data.example");
const gitignorePath = join(repoRoot, ".gitignore");
const axiLaunchPath = join(repoRoot, "scripts/dev/axi-launch.mjs");
const secretValue = "test-secret-api-key-value";
const privateKeyValue = "test-private-key-value";

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "axi-pumpportal-env-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("PumpPortal data env setup helpers", () => {
  it("keeps the committed example placeholder-only and .env.local ignored", () => {
    const template = readFileSync(templatePath, "utf8");
    const gitignore = readFileSync(gitignorePath, "utf8");

    expect(template).toContain("PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=");
    expect(template).toContain("PUMPPORTAL_DATA_API_KEY=");
    expect(template).toContain("SOLANA_RPC_HTTP=");
    expect(template).toContain("API_HOST=127.0.0.1");
    expect(template).toContain("METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS=3");
    expect(template).toContain("ROLLING_TRACKER_RESERVED_NEWEST_SLOTS=1");
    expect(template).toContain("ROLLING_TRACKER_MAX_PROTECTED_MINTS=2");
    expect(template).toContain("ROLLING_TRACKER_QUEUE_LIMIT=50");
    expect(template).toContain("METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT=250");
    expect(template).toContain(
      "METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION=1000"
    );
    expect(template).toContain(
      "METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL=0.001"
    );
    expect(template).toContain(
      "METERED_LAUNCH_DATA_MAX_UI_SESSION_COST_SOL=0.001"
    );
    expect(template).toContain("DO NOT paste your PumpPortal private key");
    expect(template).not.toContain(secretValue);
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.pumpportal-data.example");
  });

  it("keeps the default dev launch UI-controlled unless env is respected", () => {
    const launchScript = readFileSync(axiLaunchPath, "utf8");

    expect(launchScript).toContain("--respect-env");
    expect(launchScript).toContain(
      'METERED_LAUNCH_DATA_CONTROLS_ENABLED: "true"'
    );
    expect(launchScript).toContain('METERED_LAUNCH_DATA_ENABLED: "true"');
    expect(launchScript).toContain('METERED_LAUNCH_DATA_START_ACTIVE: "false"');
    expect(launchScript).toContain(
      'METERED_LAUNCH_DATA_REQUIRE_UI_ACK: "true"'
    );
    expect(launchScript).toContain('METERED_LAUNCH_DATA_ACK_COST: "false"');
    expect(launchScript).toContain(
      'METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS: "3"'
    );
    expect(launchScript).toContain(
      'ROLLING_TRACKER_RESERVED_NEWEST_SLOTS: "1"'
    );
    expect(launchScript).toContain('ROLLING_TRACKER_MAX_PROTECTED_MINTS: "2"');
    expect(launchScript).toContain(
      'METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION: "1000"'
    );
    expect(launchScript).toContain(
      'METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL: "0.001"'
    );
    expect(launchScript).toContain('PUMPPORTAL_TOKEN_TRADES_ENABLED: "true"');
    expect(launchScript).toContain(
      'PUMPPORTAL_TOKEN_TRADES_ACK_METERED: "false"'
    );
  });

  it("parses .env.local without requiring dotenv", () => {
    const path = join(tempDir, ".env.local");
    writeFileSync(
      path,
      [
        "PUMPPORTAL_DATA_WALLET_PUBLIC_KEY=11111111111111111111111111111111",
        `PUMPPORTAL_DATA_API_KEY='${secretValue}'`,
        "SOLANA_RPC_HTTP=http://localhost:8899",
        ""
      ].join("\n")
    );

    const parsed = readDotEnvFile(path);

    expect(parsed.PUMPPORTAL_DATA_WALLET_PUBLIC_KEY).toBe(
      "11111111111111111111111111111111"
    );
    expect(parsed.PUMPPORTAL_DATA_API_KEY).toBe(secretValue);
    expect(parsed.SOLANA_RPC_HTTP).toBe("http://localhost:8899");
  });

  it("reports required placeholder values as missing", () => {
    const validation = validatePumpPortalDataEnv({
      PUMPPORTAL_DATA_WALLET_PUBLIC_KEY: "",
      PUMPPORTAL_DATA_API_KEY: "",
      PUMPPORTAL_API_KEY: "",
      METERED_LAUNCH_DATA_CONTROLS_ENABLED: "true",
      METERED_LAUNCH_DATA_ENABLED: "true",
      METERED_LAUNCH_DATA_START_ACTIVE: "false",
      METERED_LAUNCH_DATA_REQUIRE_UI_ACK: "true",
      METERED_LAUNCH_DATA_ACK_COST: "false",
      PUMPPORTAL_TOKEN_TRADES_ENABLED: "true",
      PUMPPORTAL_TOKEN_TRADES_ACK_METERED: "false",
      PAPER_AUTO_ORDER: "false",
      PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING: "false",
      PUMPPORTAL_LIGHTNING_MANUAL_ARMED: "false",
      EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED: "false",
      EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED: "false"
    });

    expect(validation.errors).toContain(
      "PUMPPORTAL_DATA_WALLET_PUBLIC_KEY is required."
    );
    expect(validation.errors).toContain("PUMPPORTAL_DATA_API_KEY is required.");
    expect(JSON.stringify(validation)).not.toContain(secretValue);
  });

  it("rejects private key and seed variables without retaining values", () => {
    const env = {
      ...validEnv(),
      PUMPPORTAL_PRIVATE_KEY: privateKeyValue,
      SEED_PHRASE: "never store this"
    };
    const validation = validatePumpPortalDataEnv(env);

    expect(findForbiddenEnvKeys(env)).toEqual([
      "PUMPPORTAL_PRIVATE_KEY",
      "SEED_PHRASE"
    ]);
    expect(validation.errors.join(" ")).toContain(
      "Forbidden private-key or seed variable"
    );
    expect(JSON.stringify(validation)).not.toContain(privateKeyValue);
    expect(JSON.stringify(validation)).not.toContain(secretValue);
  });

  it("passes for the minimal metered data env and infers the legacy key", () => {
    const validation = validatePumpPortalDataEnv(validEnv());

    expect(validation.errors).toEqual([]);
    expect(validation.dataApiKeyConfigured).toBe(true);
    expect(validation.fallbackApiKeyConfigured).toBe(false);
    expect(validation.publicKeyValid).toBe(true);
    expect(validation.warnings).toContain(
      "PUMPPORTAL_API_KEY is not set; it can be inferred from PUMPPORTAL_DATA_API_KEY for compatibility."
    );
    expect(JSON.stringify(validation)).not.toContain(secretValue);
  });

  it("validates Solana public key shape conservatively", () => {
    expect(
      validateSolanaPublicKeyShape("11111111111111111111111111111111")
    ).toBe(true);
    expect(validateSolanaPublicKeyShape("INVALID_PUBLIC_KEY")).toBe(false);
    expect(validateSolanaPublicKeyShape("")).toBe(false);
  });
});

function validEnv() {
  return {
    API_HOST: "127.0.0.1",
    PUMPPORTAL_DATA_WALLET_PUBLIC_KEY: "11111111111111111111111111111111",
    PUMPPORTAL_DATA_API_KEY: secretValue,
    SOLANA_RPC_HTTP: "http://localhost:8899",
    METERED_LAUNCH_DATA_CONTROLS_ENABLED: "true",
    METERED_LAUNCH_DATA_ENABLED: "true",
    METERED_LAUNCH_DATA_START_ACTIVE: "false",
    METERED_LAUNCH_DATA_REQUIRE_UI_ACK: "true",
    METERED_LAUNCH_DATA_ACK_COST: "false",
    ROLLING_TRACKER_ENABLED: "true",
    ROLLING_TRACKER_RESERVED_NEWEST_SLOTS: "1",
    ROLLING_TRACKER_MAX_PROTECTED_MINTS: "2",
    ROLLING_TRACKER_QUEUE_LIMIT: "50",
    ROLLING_TRACKER_QUEUE_MAX_AGE_MS: "30000",
    METERED_LAUNCH_DATA_MAX_CONCURRENT_MINTS: "3",
    METERED_LAUNCH_DATA_MAX_EVENTS_PER_MINT: "250",
    METERED_LAUNCH_DATA_MAX_EVENTS_PER_SESSION: "1000",
    METERED_LAUNCH_DATA_MAX_SESSION_COST_SOL: "0.001",
    METERED_LAUNCH_DATA_MAX_UI_SESSION_COST_SOL: "0.001",
    PUMPPORTAL_TOKEN_TRADES_ENABLED: "true",
    PUMPPORTAL_TOKEN_TRADES_ACK_METERED: "false",
    PAPER_AUTO_ORDER: "false",
    PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING: "false",
    PUMPPORTAL_LIGHTNING_MANUAL_ARMED: "false",
    EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED: "false",
    EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED: "false"
  };
}
