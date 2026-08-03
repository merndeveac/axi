import type { MomentumScannerRow } from "@axi/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";

export const RESEARCH_DETAIL_TTL_MS = 60_000;

export function useScannerDetail(mint: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.scannerDetail(mint ?? "none"),
    queryFn: ({ signal }) =>
      apiClient.get<MomentumScannerRow>(
        `/ui/v2/scanner/${encodeURIComponent(mint ?? "")}`,
        { signal, timeoutMs: 5_000 }
      ),
    enabled: enabled && mint !== null,
    staleTime: 15_000,
    gcTime: RESEARCH_DETAIL_TTL_MS
  });
}
