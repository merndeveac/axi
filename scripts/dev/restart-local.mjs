import { runChecked } from "./axi-dev-utils.mjs";

await runChecked("pnpm", ["axi:restart", ...process.argv.slice(2)]);
