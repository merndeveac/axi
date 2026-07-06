import { existsSync, readFileSync } from "node:fs";
import { apiLogPath, dashboardLogPath } from "./axi-dev-utils.mjs";

for (const [name, path] of [
  ["API", apiLogPath],
  ["Dashboard", dashboardLogPath]
]) {
  console.log(`\n== ${name} log: ${path} ==`);

  if (!existsSync(path)) {
    console.log("No log file yet.");
    continue;
  }

  console.log(tail(readFileSync(path, "utf8"), 120));
}

function tail(value, lineCount) {
  return value.split(/\r?\n/).slice(-lineCount).join("\n");
}
