import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  envLocalPath,
  findForbiddenEnvKeys,
  formatYesNo,
  isGitIgnored,
  isGitRepository,
  loadEnvLocal
} from "../setup/pumpportal-data-env-utils.mjs";

export const root = process.cwd();
export const tmpDir = join(root, ".tmp");
export const pidFile = join(tmpDir, "axi-dev-pids.json");
export const apiLogPath = join(tmpDir, "axi-api.log");
export const dashboardLogPath = join(tmpDir, "axi-dashboard.log");
export const apiUrl = "http://localhost:8787";
export const dashboardUrl = "http://localhost:5173";
export const apiHealthUrl = `${apiUrl}/health`;
export const repoRoot = resolve(root);

export function ensureTmpDir() {
  mkdirSync(tmpDir, { recursive: true });
}

export function loadLocalRuntimeEnv(extra = {}) {
  const envLocal = loadEnvLocal(root);

  return {
    ...envLocal,
    ...process.env,
    AXI_RUNTIME_MODE: process.env.AXI_RUNTIME_MODE ?? envLocal.AXI_RUNTIME_MODE ?? "pumpportal_first",
    DATA_FEED_MODE: process.env.DATA_FEED_MODE ?? envLocal.DATA_FEED_MODE ?? "live",
    DATA_FEED: process.env.DATA_FEED ?? envLocal.DATA_FEED ?? "pumpportal",
    PUMPPORTAL_LIVE_DISCOVERY_ENABLED:
      process.env.PUMPPORTAL_LIVE_DISCOVERY_ENABLED ??
      envLocal.PUMPPORTAL_LIVE_DISCOVERY_ENABLED ??
      "true",
    PUMPPORTAL_SUBSCRIBE_NEW_TOKEN:
      process.env.PUMPPORTAL_SUBSCRIBE_NEW_TOKEN ??
      envLocal.PUMPPORTAL_SUBSCRIBE_NEW_TOKEN ??
      "true",
    PUMPPORTAL_SUBSCRIBE_MIGRATION:
      process.env.PUMPPORTAL_SUBSCRIBE_MIGRATION ??
      envLocal.PUMPPORTAL_SUBSCRIBE_MIGRATION ??
      "true",
    ALLOW_MOCK_DATA: process.env.ALLOW_MOCK_DATA ?? envLocal.ALLOW_MOCK_DATA ?? "false",
    MOCK_FEED_ENABLED:
      process.env.MOCK_FEED_ENABLED ?? envLocal.MOCK_FEED_ENABLED ?? "false",
    PAPER_AUTO_ORDER:
      process.env.PAPER_AUTO_ORDER ?? envLocal.PAPER_AUTO_ORDER ?? "false",
    PUMPPORTAL_LIGHTNING_ALLOW_LIVE_TRADING: "false",
    PUMPPORTAL_LIGHTNING_MANUAL_ARMED: "false",
    EXIT_STRATEGY_ACCOUNT_TRADES_ENABLED: "false",
    EXIT_STRATEGY_ACCOUNT_TRADES_ACK_METERED: "false",
    ...extra
  };
}

export function getEnvSafetySummary() {
  const exists = existsSync(envLocalPath(root));
  const env = exists ? loadEnvLocal(root) : {};
  const forbiddenKeys = findForbiddenEnvKeys(env);
  const gitignored = isGitRepository(root) ? isGitIgnored(".env.local", root) : null;

  return {
    exists,
    forbiddenKeys,
    forbiddenPresent: forbiddenKeys.length > 0,
    gitignored
  };
}

export function printEnvSafetySummary() {
  const summary = getEnvSafetySummary();

  console.log(`.env.local exists: ${formatYesNo(summary.exists)}`);
  console.log(
    `.env.local ignored: ${
      summary.gitignored === null ? "unknown" : formatYesNo(summary.gitignored)
    }`
  );
  console.log(`forbidden private-key vars present: ${formatYesNo(summary.forbiddenPresent)}`);

  if (summary.forbiddenKeys.length > 0) {
    console.log(`forbidden keys: ${summary.forbiddenKeys.join(", ")}`);
  }
}

export async function runChecked(command, args, options = {}) {
  console.log(`Running ${command} ${args.join(" ")}`);

  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with ${code}`));
    });
  });
}

export async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return response.json();
}

export async function canFetch(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForUrl(url, timeoutMs, options = {}) {
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

export function startDetached(options) {
  ensureTmpDir();
  appendFileSync(
    options.logPath,
    `\n--- ${options.name} started ${new Date().toISOString()} ---\n`
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

export function writePidRecord(mode, processes) {
  ensureTmpDir();
  writeFileSync(
    pidFile,
    JSON.stringify(
      {
        mode,
        repoRoot,
        startedAt: new Date().toISOString(),
        processes
      },
      null,
      2
    )
  );
}

export function readPidRecord() {
  if (!existsSync(pidFile)) {
    return null;
  }

  return JSON.parse(readFileSync(pidFile, "utf8"));
}

export async function stopRecordedProcesses() {
  const record = readPidRecord();

  if (!record) {
    return [];
  }

  const stopped = [];
  const processes = Array.isArray(record.processes) ? record.processes : [];

  for (const item of processes) {
    if (await stopRecordedProcess(item)) {
      stopped.push(item);
    }
  }

  rmSync(pidFile, { force: true });
  return stopped;
}

export async function stopRecordedProcess(item) {
  const pid = Number(item.pid);
  const expectedToken = String(item.expectedToken ?? "");

  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  const cmdline = readCmdline(pid);

  if (!cmdline) {
    return false;
  }

  if (expectedToken && !cmdline.includes(expectedToken)) {
    console.warn(`Skipping PID ${pid}; it no longer looks like ${expectedToken}.`);
    return false;
  }

  signalProcessGroup(pid, "SIGTERM");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!readCmdline(pid)) {
      return true;
    }

    await delay(100);
  }

  signalProcessGroup(pid, "SIGKILL");
  return true;
}

export async function inspectPorts() {
  const [apiOwner, dashboardOwner] = await Promise.all([
    describePortOwner(8787),
    describePortOwner(5173)
  ]);

  return [
    { name: "API", port: 8787, owner: apiOwner },
    { name: "dashboard", port: 5173, owner: dashboardOwner }
  ];
}

export async function assertPortsLaunchable() {
  const ports = await inspectPorts();

  for (const item of ports) {
    if (!item.owner) {
      continue;
    }

    if (item.owner.repoLocal) {
      throw new Error(
        `${item.name} port ${item.port} is owned by a repo-local process not in the PID file. Run pnpm axi:stop --adopt-repo-processes.`
      );
    }

    throw new Error(
      `${item.name} port ${item.port} is owned by an unknown process. Run pnpm axi:doctor.`
    );
  }
}

export async function adoptRepoPortOwners() {
  const ports = await inspectPorts();
  const stopped = [];

  for (const item of ports) {
    if (!item.owner?.repoLocal || !item.owner.pid) {
      continue;
    }

    signalProcessGroup(item.owner.pid, "SIGTERM");

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (!readCmdline(item.owner.pid)) {
        break;
      }

      await delay(100);
    }

    if (readCmdline(item.owner.pid)) {
      signalProcessGroup(item.owner.pid, "SIGKILL");
    }

    stopped.push(item.owner);
  }

  return stopped;
}

export async function describePortOwner(port) {
  const output = await runCapture("ss", ["-ltnp"]);
  const line = output
    .split(/\r?\n/)
    .find((item) => item.includes(`:${port} `));

  if (!line) {
    return null;
  }

  const pidMatch = line.match(/pid=(\d+)/);
  const pid = pidMatch ? Number(pidMatch[1]) : null;
  const cmdline = pid ? readCmdline(pid) : "";

  return {
    cmdline,
    line: line.trim(),
    pid,
    repoLocal: Boolean(cmdline && cmdline.includes(repoRoot))
  };
}

export function readCmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
  } catch {
    return "";
  }
}

export function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code === "ESRCH") {
      try {
        process.kill(pid, signal);
      } catch (fallbackError) {
        if (fallbackError?.code !== "ESRCH") {
          console.warn(`Could not send ${signal} to PID ${pid}: ${fallbackError}`);
        }
      }
      return;
    }

    if (error?.code !== "ESRCH") {
      console.warn(`Could not send ${signal} to PID group ${pid}: ${error}`);
    }
  }
}

export function runCaptureSync(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8"
  });

  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

export async function runCapture(command, args) {
  return new Promise((resolvePromise) => {
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
    child.on("error", () => resolvePromise(""));
    child.on("exit", () => resolvePromise(output));
  });
}

export function removePath(path) {
  if (!existsSync(path)) {
    return false;
  }

  rmSync(path, { recursive: true, force: true });
  return true;
}
