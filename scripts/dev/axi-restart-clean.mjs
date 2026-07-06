import { runChecked } from "./axi-dev-utils.mjs";

const meteredMode = process.argv.includes("--metered");

if (meteredMode) {
  await runChecked("pnpm", ["verify:pumpportal-data-env"]);
}

await runChecked("pnpm", ["axi:stop"]);
await runChecked("pnpm", ["axi:rebuild"]);
await runChecked("pnpm", meteredMode ? ["axi:launch", "--metered"] : ["axi:launch"]);
