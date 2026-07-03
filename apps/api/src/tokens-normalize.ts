import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizePumpPortalIdentity } from "@axi/token-identity";

type Args = {
  file: string;
};

const args = parseArgs(process.argv.slice(2));
const filePath = resolve(process.cwd(), args.file);
const payload = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
const identity = normalizePumpPortalIdentity(payload);

console.log(JSON.stringify(identity, null, 2));

function parseArgs(argv: string[]): Args {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--file") {
      return {
        file: readValue(argv, index, arg)
      };
    }
  }

  throw new Error("--file is required");
}

function readValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}
