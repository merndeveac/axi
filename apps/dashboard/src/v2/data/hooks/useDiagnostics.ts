import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";
import { visibleRefetchInterval } from "../query-client";

export function useDiagnostics<T>(
  panel: string,
  path: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: queryKeys.diagnostics(panel),
    queryFn: ({ signal }) => apiClient.get<T>(path, { signal, timeoutMs: 6_000 }),
    enabled,
    staleTime: 10_000,
    refetchInterval: () => visibleRefetchInterval(15_000)
  });
}
