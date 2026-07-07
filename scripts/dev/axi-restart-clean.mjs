import { runChecked } from "./axi-dev-utils.mjs";

const meteredMode = process.argv.includes("--metered");
const respectEnv = process.argv.includes("--respect-env");

if (meteredMode) {
  await runChecked("pnpm", ["verify:pumpportal-data-env"]);
}

await runChecked("pnpm", ["axi:stop"]);
await runChecked("pnpm", ["axi:rebuild"]);
await runChecked(
  "pnpm",
  [
    "axi:launch",
    ...(meteredMode ? ["--metered"] : []),
    ...(respectEnv ? ["--respect-env"] : [])
  ]
);
