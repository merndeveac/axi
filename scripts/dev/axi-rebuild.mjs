import { runChecked } from "./axi-dev-utils.mjs";

try {
  await runChecked("pnpm", ["install", "--frozen-lockfile"]);
  await runChecked("pnpm", ["typecheck"]);
  await runChecked("pnpm", ["test"]);
  await runChecked("pnpm", ["lint"]);
  await runChecked("pnpm", ["build"]);
  console.log("AXI rebuild passed.");
} catch (error) {
  console.error(
    `AXI rebuild failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
