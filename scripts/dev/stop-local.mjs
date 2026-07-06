import { runChecked } from "./axi-dev-utils.mjs";

await runChecked("pnpm", ["axi:stop", ...process.argv.slice(2)]);
