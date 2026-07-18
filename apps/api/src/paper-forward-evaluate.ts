import { evaluatePaperForwardEvidence } from "@axi/paper-forward-evaluation";
import {
  closeStorage,
  defaultDatabaseRelativePath,
  initStorageReadOnly
} from "@axi/storage";
import { collectPaperForwardEvidence } from "./paper-forward-evaluation-service";

const options = parseArgs(process.argv.slice(2));
initStorageReadOnly({ databasePath: options.databasePath });

try {
  const evidence = collectPaperForwardEvidence(options.deploymentId);
  if (evidence.activeSessionIds.length > 0) {
    throw new Error(
      "The deployment has an active forward session; finalize it before evaluation."
    );
  }
  const evaluatedAt =
    evidence.reports.at(-1)?.session.endedAt ?? evidence.deployment.updatedAt;
  const report = evaluatePaperForwardEvidence({
    evaluationId: `offline-paper-forward-evaluation-${safeId(options.deploymentId)}-${evaluatedAt.replace(/[^0-9]/gu, "")}`,
    evaluatedAt,
    evaluatedBy: options.evaluatedBy,
    deployment: stripId(evidence.deployment),
    reports: evidence.reports,
    excludedInterruptedSessionIds: evidence.interruptedSessionIds
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        ...report,
        exportManifest: {
          databasePath: options.databasePath,
          readOnly: true,
          networkDisabled: true,
          allCompletedSessionsIncluded: true,
          persisted: false,
          liveExecutionDisabled: true
        }
      },
      null,
      2
    )}\n`
  );
} finally {
  closeStorage();
}

function parseArgs(args: string[]): {
  databasePath: string;
  deploymentId: string;
  evaluatedBy: string;
} {
  let databasePath = defaultDatabaseRelativePath;
  let deploymentId = "";
  let evaluatedBy = "";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage:
  pnpm paper:forward:evaluate -- --deployment <id> --operator <identity> [--from-db <sqlite-path>]

Reads every completed session for one deployment from SQLite and prints a
deterministic, non-persisted promotion-governance report. The command is
read-only, starts no feeds, and cannot activate live execution.\n`);
      process.exit(0);
    }
    if (arg === "--deployment") {
      deploymentId = requireArg(args, ++index, arg);
      continue;
    }
    if (arg === "--operator") {
      evaluatedBy = requireArg(args, ++index, arg);
      continue;
    }
    if (arg === "--from-db") {
      databasePath = requireArg(args, ++index, arg);
      continue;
    }
    throw new Error(`Unknown argument: ${arg ?? ""}`);
  }
  if (!deploymentId) throw new Error("--deployment is required");
  if (!evaluatedBy) throw new Error("--operator is required");
  return { databasePath, deploymentId, evaluatedBy };
}

function requireArg(args: string[], index: number, flag: string): string {
  const value = args[index]?.trim();
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function stripId<T extends { id: number }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  void _id;
  return rest;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 80);
}
