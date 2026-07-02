import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const pidFile = join(root, ".tmp", "axi-dev-pids.json");

if (!existsSync(pidFile)) {
  console.log("No local Axi PID file found. Nothing to stop.");
  process.exit(0);
}

const record = JSON.parse(readFileSync(pidFile, "utf8"));
const processes = Array.isArray(record.processes) ? record.processes : [];

for (const item of processes) {
  await stopRecordedProcess(item);
}

rmSync(pidFile, { force: true });
console.log("Stopped recorded local Axi processes.");

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
      `Skipping PID ${pid}; it no longer looks like ${expectedToken}.`
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
