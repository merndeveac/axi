import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const verifyScript = join(scriptDirectory, "verify-pumpportal-data-env.mjs");
const verify = spawnSync("node", [verifyScript], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: "inherit"
});

if (verify.status !== 0) {
  process.exit(verify.status ?? 1);
}

const apiBaseUrl = process.env.AXI_API_BASE_URL ?? "http://localhost:8787";

if (!(await canFetch(`${apiBaseUrl}/health`))) {
  console.log("");
  console.log(`API is not running at ${apiBaseUrl}; skipping API status smoke checks.`);
  console.log("No PumpPortal calls, token-trade subscriptions, or SOL spend occurred.");
  process.exit(0);
}

await smokeEndpoint("metered launch data status", `${apiBaseUrl}/metered-launch-data/status`);
await smokeEndpoint("PumpPortal data wallet status", `${apiBaseUrl}/pumpportal/data-wallet/status`);
console.log("No PumpPortal calls, token-trade subscriptions, or SOL spend occurred.");

async function smokeEndpoint(label, url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }

  const body = await response.json();
  console.log(
    `${label}: ok (apiKeyConfigured=${body.apiKeyConfigured === true ? "yes" : "no"})`
  );
}

async function canFetch(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}
