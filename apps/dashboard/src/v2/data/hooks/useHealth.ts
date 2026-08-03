import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";
import { visibleRefetchInterval } from "../query-client";

export type HealthResponse = {
  ok?: boolean;
  status?: string;
  mode?: string;
};

export function useHealth(enabled = true) {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) =>
      apiClient.get<HealthResponse>("/health", { signal, timeoutMs: 3_000 }),
    enabled,
    staleTime: 2_000,
    refetchInterval: () => visibleRefetchInterval(5_000)
  });
}
