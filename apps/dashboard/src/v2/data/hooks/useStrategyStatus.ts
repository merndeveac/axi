import type { StrategyStatus } from "@axi/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";

export function useStrategyStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.strategy,
    queryFn: ({ signal }) =>
      apiClient.get<StrategyStatus>("/strategy/status", { signal }),
    enabled,
    staleTime: 10_000
  });
}
