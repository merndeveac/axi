import {
  createPaperOperationsEvidenceReport,
  type PaperOperationsEvidenceReport
} from "@axi/paper-operations";
import {
  closeStorage,
  defaultDatabaseRelativePath,
  getPaperOperationsSession,
  initStorageReadOnly,
  listPaperAutomationEventsForEvaluation,
  listPaperAutomationOperationsForEvaluation,
  listPaperOperationsAlertsForExport,
  listPaperOperationsSessions,
  listPaperOperationsSnapshotsForExport
} from "@axi/storage";

type ExportFormat = "json" | "jsonl" | "csv";

const args = parseArgs(process.argv.slice(2));
initStorageReadOnly({ databasePath: args.databasePath });

try {
  if (args.list) {
    process.stdout.write(
      `${JSON.stringify(
        {
          sessions: listPaperOperationsSessions(1_000),
          databasePath: args.databasePath,
          readOnly: true,
          networkDisabled: true,
          paperOnly: true,
          liveExecutionDisabled: true
        },
        null,
        2
      )}\n`
    );
  } else {
    const sessionId = args.sessionId as string;
    const report = buildReport(sessionId);
    process.stdout.write(formatReport(report, args.format));
  }
} finally {
  closeStorage();
}

function buildReport(sessionId: string): PaperOperationsEvidenceReport {
  const stored = getPaperOperationsSession(sessionId);
  if (!stored)
    throw new Error(`Paper forward session ${sessionId} was not found.`);
  const session = stripId(stored);
  return createPaperOperationsEvidenceReport({
    reportId: `paper-forward-report-${safeId(sessionId)}`,
    generatedAt: session.endedAt ?? new Date(0).toISOString(),
    session,
    snapshots: listPaperOperationsSnapshotsForExport(sessionId).map(stripId),
    alerts: listPaperOperationsAlertsForExport(sessionId).map(stripId),
    automationEvents: listPaperAutomationEventsForEvaluation(
      session.deploymentId
    ).filter((event) => inSession(event.observedAt, session)),
    automationOperations: listPaperAutomationOperationsForEvaluation(
      session.deploymentId
    ).filter((operation) => inSession(operation.createdAt, session))
  });
}

function formatReport(
  report: PaperOperationsEvidenceReport,
  format: ExportFormat
): string {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "jsonl") {
    return [
      { recordType: "manifest", ...report.manifest, reportId: report.reportId },
      { recordType: "session", ...report.session },
      { recordType: "summary", ...report.summary },
      ...report.snapshots.map((snapshot) => ({
        recordType: "snapshot",
        ...snapshot
      })),
      ...report.alerts.map((alert) => ({ recordType: "alert", ...alert })),
      ...report.automationEvents.map((event) => ({
        recordType: "automation_event",
        event
      })),
      ...report.automationOperations.map((operation) => ({
        recordType: "automation_operation",
        operation
      }))
    ]
      .map((record) => JSON.stringify(record))
      .join("\n")
      .concat("\n");
  }
  const columns = [
    "sampleId",
    "kind",
    "observedAt",
    "meteredActive",
    "feedConnected",
    "feedSilenceMs",
    "telemetryGapMs",
    "signalMint",
    "signalLatencyMs",
    "estimatedCostSol",
    "budgetRemainingSol",
    "dataWalletBalanceSol",
    "dataWalletBalanceStatus",
    "automationStatus",
    "automationHealthy",
    "pendingOperationCount",
    "closedTradeCount",
    "winCount",
    "totalNetPnlSol",
    "maximumDrawdownPct",
    "timeseriesGapCount",
    "timeseriesDuplicateEventCount",
    "reasonCodes"
  ] as const;
  const manifest = `# axi-paper-forward-manifest=${JSON.stringify({
    reportId: report.reportId,
    ...report.manifest,
    summary: report.summary,
    session: report.session
  })}`;
  const rows = report.snapshots.map((snapshot) =>
    columns
      .map((column) =>
        csvCell(
          column === "reasonCodes"
            ? snapshot.reasonCodes.join("|")
            : snapshot[column]
        )
      )
      .join(",")
  );
  return [manifest, columns.join(","), ...rows].join("\n").concat("\n");
}

function parseArgs(args: string[]): {
  databasePath: string;
  sessionId: string | null;
  format: ExportFormat;
  list: boolean;
} {
  let databasePath = defaultDatabaseRelativePath;
  let sessionId: string | null = null;
  let format: ExportFormat = "json";
  let list = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage:
  pnpm paper:forward:export -- --list [--from-db <sqlite-path>]
  pnpm paper:forward:export -- --session <id> [--format json|jsonl|csv] [--from-db <sqlite-path>]

Reads finalized paper-forward evidence without writing SQLite or starting feeds.\n`);
      process.exit(0);
    }
    if (arg === "--list") {
      list = true;
      continue;
    }
    if (arg === "--session") {
      sessionId = requireArg(args, ++index, "--session");
      continue;
    }
    if (arg === "--from-db") {
      databasePath = requireArg(args, ++index, "--from-db");
      continue;
    }
    if (arg === "--format") {
      const value = requireArg(args, ++index, "--format");
      if (!isExportFormat(value))
        throw new Error(`Unsupported format: ${value}`);
      format = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg ?? ""}`);
  }
  if (!list && !sessionId) throw new Error("--session or --list is required");
  if (list && sessionId)
    throw new Error("--list and --session are mutually exclusive");
  return { databasePath, sessionId, format, list };
}

function inSession(
  observedAt: string,
  session: { startedAt: string; endedAt: string | null }
): boolean {
  const observed = Date.parse(observedAt);
  return (
    observed >= Date.parse(session.startedAt) &&
    (session.endedAt === null || observed <= Date.parse(session.endedAt))
  );
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function requireArg(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function isExportFormat(value: string): value is ExportFormat {
  return value === "json" || value === "jsonl" || value === "csv";
}

function stripId<T extends { id: number }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  void _id;
  return rest;
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 120);
}
