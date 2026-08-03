export const queryKeys = {
  health: ["health"] as const,
  runtime: ["runtime", "status"] as const,
  scanner: (params: string) => ["scanner", "snapshot", params] as const,
  scannerDetail: (mint: string) => ["scanner", "detail", mint] as const,
  positions: ["portfolio", "positions"] as const,
  portfolioSummary: ["portfolio", "summary"] as const,
  strategy: ["strategy", "status"] as const,
  evidence: ["strategy", "evidence"] as const,
  diagnostics: (panel: string) => ["diagnostics", panel] as const
};
