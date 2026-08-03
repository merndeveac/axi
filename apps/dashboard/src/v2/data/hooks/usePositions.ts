import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";
import { visibleRefetchInterval } from "../query-client";

export type PositionsResponse = {
  positions: unknown[];
  status: unknown;
  paperOnly: true;
  liveExecutionDisabled: true;
};

export function usePositions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.positions,
    queryFn: ({ signal }) =>
      apiClient.get<PositionsResponse>("/paper-portfolio/positions", { signal }),
    enabled,
    staleTime: 2_000,
    refetchInterval: () => visibleRefetchInterval(5_000)
  });
}
