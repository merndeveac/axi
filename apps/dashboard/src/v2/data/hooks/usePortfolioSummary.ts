import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";

import type { PaperPortfolioStatusV2 } from "./usePositions";

export type PaperPortfolioSnapshotV2 = {
  cashSol: number;
  deployedSol: number;
  equitySol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  totalPnlPct: number;
  openPositionCount: number;
  closedPositionCount: number;
  winRate: number;
  maxDrawdownSol: number;
  totalFeesSol: number;
  totalTrades: number;
  updatedAt: string;
};

export type PortfolioSummaryResponse = {
  snapshot: PaperPortfolioSnapshotV2;
  status: PaperPortfolioStatusV2;
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
