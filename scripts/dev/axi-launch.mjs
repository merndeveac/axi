import {
  apiHealthUrl,
  apiLogPath,
  apiUrl,
  assertPortsLaunchable,
  dashboardLogPath,
  dashboardUrl,
  fetchJson,
  loadLocalRuntimeEnv,
  startDetached,
  waitForUrl,
  writePidRecord
} from "./axi-dev-utils.mjs";

const meteredMode = process.argv.includes("--metered");
const respectEnv = process.argv.includes("--respect-env");
const uiControlledMeteredEnv = {
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
  PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING: "false",
  PUMPPORTAL_LIGHTNING_MANUAL_ARMED: "false",
  PUMPPORTAL_TOKEN_TRADES_ENABLED: "true",
  PUMPPORTAL_TOKEN_TRADES_ACK_METERED: "false",
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE: "false",
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_MIGRATION: "false",
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_NEW_TOKEN: "false",
  PUMPPORTAL_TOKEN_TRADES_AUTO_SUBSCRIBE_ON_QUALIFIED: "false",
  PUMPPORTAL_TOKEN_TRADES_MANUAL_MINTS: ""
};
const env = loadLocalRuntimeEnv(
  respectEnv
    ? meteredMode
      ? {
          METERED_LAUNCH_DATA_CONTROLS_ENABLED: "true",
          METERED_LAUNCH_DATA_ENABLED: "true",
          PUMPPORTAL_TOKEN_TRADES_ENABLED: "true"
        }
      : {
          METERED_LAUNCH_DATA_CONTROLS_ENABLED: "true"
        }
    : meteredMode
      ? {
          ...uiControlledMeteredEnv
        }
      : {
          ...uiControlledMeteredEnv
        }
);

await assertPortsLaunchable();

const api = startDetached({
  args: ["--filter", "@axi/api", "dev"],
  env,
  expectedToken: "@axi/api",
  logPath: apiLogPath,
  name: "api"
});
const dashboard = startDetached({
  args: ["--filter", "@axi/dashboard", "dev"],
  env,
  expectedToken: "@axi/dashboard",
  logPath: dashboardLogPath,
  name: "dashboard"
});

writePidRecord(meteredMode ? "metered" : "standard", [api, dashboard]);

await waitForUrl(apiHealthUrl, 30_000);
const dashboardReady = await waitForUrl(dashboardUrl, 30_000, {
  optional: true
});
const runtime = await fetchJson(`${apiUrl}/runtime/status`);

console.log("AXI launched.");
console.log(`API URL: ${apiUrl}`);
console.log(
  `Dashboard URL: ${dashboardUrl}${dashboardReady ? "" : " (still starting)"}`
);
console.log(
  `Live discovery: ${
    runtime.liveDiscovery.connected
      ? "connected"
      : runtime.liveDiscovery.connecting
        ? "connecting"
        : "stopped"
  }`
);
console.log(
  `Metered data: ${
    runtime.meteredPriceAction?.state?.toLowerCase() ??
    (runtime.meteredLaunchData.active
      ? "active"
      : runtime.meteredLaunchData.blocked
        ? "blocked"
        : "stopped")
  }`
);
console.log(
  `Data wallet: apiKey=${runtime.dataWallet.apiKeyConfigured ? "yes" : "no"} balance=${
    runtime.dataWallet.balanceStatus
  }`
);
console.log(`API log: ${apiLogPath}`);
console.log(`Dashboard log: ${dashboardLogPath}`);
