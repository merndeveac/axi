import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  url: "http://localhost:8787/health"
});
await assertPortIsFree({
  name: "dashboard",
  url: "http://localhost:5173"
});

const api = startDetached({
  args: ["--filter", "@axi/api", "dev"],
  expectedToken: "@axi/api",
  logPath: apiLogPath,
  name: "api"
});
const dashboard = startDetached({
  args: ["--filter", "@axi/dashboard", "dev"],
  expectedToken: "@axi/dashboard",
  logPath: dashboardLogPath,
  name: "dashboard"
});

writeFileSync(
  pidFile,
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      processes: [api, dashboard]
    },
    null,
    2
  )
);

await waitForUrl("http://localhost:8787/health", 20_000);
const dashboardReady = await waitForUrl("http://localhost:5173", 20_000, {
  optional: true
});

console.log("Local Axi app restarted.");
console.log("API URL: http://localhost:8787");
console.log(
  `Dashboard URL: http://localhost:5173${dashboardReady ? "" : " (still starting)"}`
);
console.log(`API log: ${apiLogPath}`);
console.log(`Dashboard log: ${dashboardLogPath}`);
console.log("Stop command: pnpm local:stop");

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
  const logStream = createWriteStream(options.logPath, { flags: "a" });
  logStream.write(`\n--- ${options.name} started ${new Date().toISOString()} ---\n`);

  const child = spawn("pnpm", options.args, {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      DATA_FEED: process.env.DATA_FEED ?? "mock"
    },
    stdio: ["ignore", logStream, logStream]
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
  if (!(await canFetch(options.url))) {
    return;
  }

  throw new Error(
    `${options.name} port already responds at ${options.url}, but no trusted PID file owns it. Run pnpm local:logs for clues or stop that process manually.`
  );
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

async function canFetch(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
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
