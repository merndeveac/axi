import { join } from "node:path";
import { readdirSync } from "node:fs";
import { removePath, root, tmpDir } from "./axi-dev-utils.mjs";

const includeNodeModules = process.argv.includes("--node-modules");
const removed = [];

for (const scope of ["apps", "packages"]) {
  for (const name of safeReadDir(join(root, scope))) {
    const base = join(root, scope, name);
    remove(base, "dist");
    remove(base, "build");
  }
}

remove(root, ".turbo");
remove(root, "coverage");
remove(root, "node_modules/.vite");
remove(root, "apps/dashboard/node_modules/.vite");
remove(root, "apps/extension/node_modules/.vite");
remove(tmpDir, "axi-api.log");
remove(tmpDir, "axi-dashboard.log");
remove(tmpDir, "axi-dev-pids.json");

if (includeNodeModules) {
  remove(root, "node_modules");
}

if (removed.length === 0) {
  console.log("No safe build/cache artifacts found.");
} else {
  console.log("Removed safe build/cache artifacts:");
  for (const item of removed) {
    console.log(`- ${item}`);
  }
}

console.log("Preserved .env.local, .data, sqlite files, and wallet/key files.");

function remove(base, child) {
  const path = join(base, child);

  if (removePath(path)) {
    removed.push(path);
  }
}

function safeReadDir(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}
