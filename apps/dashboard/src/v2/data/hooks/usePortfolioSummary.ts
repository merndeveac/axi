import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";

export type PortfolioSummaryResponse = {
  snapshot: unknown;
  status: unknown;
  paperOnly: true;
  liveExecutionDisabled: true;
};

export function usePortfolioSummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.portfolioSummary,
    queryFn: ({ signal }) =>
      apiClient.get<PortfolioSummaryResponse>("/paper-portfolio/snapshot", {
        signal
      }),
    enabled,
    staleTime: 2_000
  });
}
