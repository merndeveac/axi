import type { ScannerSnapshotV2 } from "@axi/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";

export type ScannerSnapshotParams = {
  limit?: number;
  cursor?: string | null;
  sort?: string;
  filters?: string;
  activeOnly?: boolean;
  includeProtected?: boolean;
  query?: string;
};

export function scannerParams(params: ScannerSnapshotParams): string {
  const query = new URLSearchParams();
  query.set("limit", String(params.limit ?? 100));
  query.set("sort", params.sort ?? "newest");
  query.set("activeOnly", String(params.activeOnly ?? true));
  query.set("includeProtected", String(params.includeProtected ?? true));
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.filters) query.set("filters", params.filters);
  if (params.query) query.set("query", params.query);
  return query.toString();
}

export function useScannerSnapshot(
  params: ScannerSnapshotParams = {},
  enabled = true
) {
  const encoded = scannerParams(params);
  return useQuery({
    queryKey: queryKeys.scanner(encoded),
    queryFn: ({ signal }) =>
      apiClient.get<ScannerSnapshotV2>(`/ui/v2/scanner?${encoded}`, {
        signal,
        timeoutMs: 5_000
      }),
    enabled,
    staleTime: 1_000,
    placeholderData: (previous) => previous
  });
}
