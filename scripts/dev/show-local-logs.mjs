import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const logs = [
  ["API", join(root, ".tmp", "axi-api.log")],
  ["Dashboard", join(root, ".tmp", "axi-dashboard.log")]
];

for (const [name, path] of logs) {
  console.log(`\n== ${name} log: ${path} ==`);

  if (!existsSync(path)) {
    console.log("No log file yet.");
    continue;
  }

  console.log(tail(readFileSync(path, "utf8"), 80));
}

function tail(value, lineCount) {
  return value.split(/\r?\n/).slice(-lineCount).join("\n");
}
