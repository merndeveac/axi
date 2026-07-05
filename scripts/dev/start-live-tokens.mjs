import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const tmpDir = join(root, ".tmp");
const pidFile = join(tmpDir, "axi-dev-pids.json");
const apiLogPath = join(tmpDir, "axi-api.log");
const dashboardLogPath = join(tmpDir, "axi-dashboard.log");

mkdirSync(tmpDir, { recursive: true });

await runCheck("pnpm", ["typecheck"]);
await runCheck("pnpm", ["test"]);
await runCheck("pnpm", ["lint"]);
await runCheck("pnpm", ["build"]);

await stopRecordedProcesses();

await assertPortIsFree({
  name: "API",
  port: 8787,
  url: "http://localhost:8787/health"
});
await assertPortIsFree({
  name: "dashboard",
  port: 5173,
  url: "http://localhost:5173"
});

const liveEnv = {
  ...process.env,
  AXI_RUNTIME_MODE: "pumpportal_first",
  DATA_FEED_MODE: "live",
  DATA_FEED: "pumpportal",
  PUMPPORTAL_LIVE_DISCOVERY_ENABLED: "true",
  PUMPPORTAL_SUBSCRIBE_NEW_TOKEN: "true",
  PUMPPORTAL_SUBSCRIBE_MIGRATION: "true",
  PUMPPORTAL_LAUNCH_TRACKING_ENABLED: "false",
  PUMPPORTAL_LAUNCH_TRACKING_ACK_METERED: "false",
  PUMPPORTAL_TOKEN_TRADES_ENABLED: "false",
  PUMPPORTAL_TOKEN_TRADES_ACK_METERED: "false",
  ALLOW_MOCK_DATA: "false",
  MOCK_FEED_ENABLED: "false",
  PAPER_AUTO_ORDER: "false"
};
const api = startDetached({
  args: ["--filter", "@axi/api", "dev"],
  env: liveEnv,
  expectedToken: "@axi/api",
  logPath: apiLogPath,
  name: "api"
});
const dashboard = startDetached({
  args: ["--filter", "@axi/dashboard", "dev"],
  env: liveEnv,
  expectedToken: "@axi/dashboard",
  logPath: dashboardLogPath,
  name: "dashboard"
});

writeFileSync(
  pidFile,
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      mode: "live-tokens",
      processes: [api, dashboard]
    },
    null,
    2
  )
);

await waitForUrl("http://localhost:8787/health", 20_000);
const feedStatus = await waitForFeedStatus(60_000);
const liveStatus = await fetchJson("http://localhost:8787/live/status");
const dashboardReady = await waitForUrl("http://localhost:5173", 20_000, {
  optional: true
});

console.log("Live token feed launched.");
console.log("API URL: http://localhost:8787");
console.log(
  `Dashboard URL: http://localhost:5173${dashboardReady ? "" : " (still starting)"}`
);
console.log(`Feed status: ${JSON.stringify(feedStatus)}`);
console.log(`Live token count: ${liveStatus.liveTokenCount ?? 0}`);
console.log(`API log: ${apiLogPath}`);
console.log(`Dashboard log: ${dashboardLogPath}`);
console.log("Stop command: pnpm live:tokens:stop");

async function runCheck(command, args) {
  console.log(`Running ${command} ${args.join(" ")}`);

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with ${code}`));
    });
  });
}

async function stopRecordedProcesses() {
  if (!existsSync(pidFile)) {
    return;
  }

  const record = JSON.parse(readFileSync(pidFile, "utf8"));
  const processes = Array.isArray(record.processes) ? record.processes : [];

  for (const item of processes) {
    await stopRecordedProcess(item);
  }

  rmSync(pidFile, { force: true });
}

async function stopRecordedProcess(item) {
  const pid = Number(item.pid);
  const expectedToken = String(item.expectedToken ?? "");

  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  const cmdline = readCmdline(pid);

  if (!cmdline) {
    return;
  }

  if (expectedToken && !cmdline.includes(expectedToken)) {
    console.warn(
      `PID ${pid} no longer looks like ${expectedToken}; leaving it alone.`
    );
    return;
  }

  signalProcessGroup(pid, "SIGTERM");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!readCmdline(pid)) {
      return;
    }

    await delay(100);
  }

  signalProcessGroup(pid, "SIGKILL");
}

function startDetached(options) {
  appendFileSync(
    options.logPath,
    `\n--- ${options.name} live tokens started ${new Date().toISOString()} ---\n`
  );
  const logFd = openSync(options.logPath, "a");

  const child = spawn("pnpm", options.args, {
    cwd: root,
    detached: true,
    env: options.env,
    stdio: ["ignore", logFd, logFd]
  });

  child.unref();

  return {
    expectedToken: options.expectedToken,
    logPath: options.logPath,
    name: options.name,
    pid: child.pid
  };
}

async function assertPortIsFree(options) {
  const owner = await describePortOwner(options.port);

  if (owner) {
    throw new Error(
      `${options.name} port ${options.port} is already owned by an untrusted process: ${owner}`
    );
  }

  if (await canFetch(options.url)) {
    throw new Error(
      `${options.name} port already responds at ${options.url}, but no trusted PID file owns it.`
    );
  }
}

async function waitForUrl(url, timeoutMs, options = {}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canFetch(url)) {
      return true;
    }

    await delay(500);
  }

  if (options.optional) {
    return false;
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForFeedStatus(timeoutMs) {
  const startedAt = Date.now();
  let lastStatus = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastStatus = await fetchJson("http://localhost:8787/feed/status");

    if (lastStatus.connected || lastStatus.lastError) {
      return lastStatus;
    }

    await delay(1000);
  }

  return lastStatus ?? (await fetchJson("http://localhost:8787/feed/status"));
}

async function canFetch(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return response.json();
}

async function describePortOwner(port) {
  const output = await runCapture("ss", ["-ltnp"]);
  const line = output
    .split(/\r?\n/)
    .find((item) => item.includes(`:${port} `) || item.includes(`:${port}\n`));

  return line?.trim() ?? "";
}

async function runCapture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve(""));
    child.on("exit", () => resolve(output));
  });
}

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      console.warn(`Could not send ${signal} to PID group ${pid}: ${error}`);
    }
  }
}

function readCmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
  } catch {
    return "";
  }
}
