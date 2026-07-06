import { existsSync } from "node:fs";
import {
  apiHealthUrl,
  apiUrl,
  canFetch,
  dashboardUrl,
  fetchJson,
  getEnvSafetySummary,
  inspectPorts,
  printEnvSafetySummary,
  root,
  runCaptureSync
} from "./axi-dev-utils.mjs";

console.log("AXI doctor");
console.log(`root: ${root}`);
console.log(`branch: ${runCaptureSync("git", ["branch", "--show-current"]) || "unknown"}`);
console.log(
  `git dirty: ${runCaptureSync("git", ["status", "--short"]) ? "yes" : "no"}`
);
console.log(`node: ${process.version}`);
console.log(
  `pnpm: ${runCaptureSync("pnpm", ["--version"]) || process.env.npm_config_user_agent || "unknown"}`
);
printEnvSafetySummary();

const envSafety = getEnvSafetySummary();
if (envSafety.forbiddenPresent) {
  console.log("env safety: blocked until forbidden private-key vars are removed");
}

for (const port of await inspectPorts()) {
  console.log(
    `${port.name} port ${port.port}: ${
      port.owner
        ? `${port.owner.repoLocal ? "repo-local" : "unknown"} pid ${
            port.owner.pid ?? "?"
          }`
        : "free"
    }`
  );

  if (port.owner?.line) {
    console.log(`  ${port.owner.line}`);
  }
}

await printEndpointSummary("API health", apiHealthUrl, summarizeHealth);
console.log(`dashboard: ${(await canFetch(dashboardUrl)) ? "reachable" : "unavailable"}`);
await printEndpointSummary(
  "data wallet",
  `${apiUrl}/pumpportal/data-wallet/status`,
  (body) =>
    `configured=${body.configured ? "yes" : "no"} apiKey=${
      body.apiKeyConfigured ? "yes" : "no"
    } balance=${body.balanceStatus ?? "unknown"}`
);
await printEndpointSummary(
  "metered launch data",
  `${apiUrl}/metered-launch-data/status`,
  (body) =>
    `enabled=${body.enabled ? "yes" : "no"} ready=${
      body.ready ? "yes" : "no"
    } tracked=${body.trackedMintCount ?? 0}`
);

if (!existsSync(".env.local")) {
  console.log("hint: .env.local is missing; run pnpm setup:pumpportal-data-env for metered mode.");
}

async function printEndpointSummary(label, url, summarize = () => "reachable") {
  try {
    const body = await fetchJson(url);
    console.log(`${label}: ${summarize(body)}`);
  } catch (error) {
    console.log(
      `${label}: unavailable (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

function summarizeHealth(body) {
  return `ok mode=${body.mode ?? "unknown"} live=${
    body.runtimeLiveDiscoveryState ?? "unknown"
  } metered=${body.runtimeMeteredLaunchDataState ?? "unknown"} tradingDisabled=${
    body.tradingDisabled ? "yes" : "no"
  }`;
}
