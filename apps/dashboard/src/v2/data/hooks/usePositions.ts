import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";
import { visibleRefetchInterval } from "../query-client";

export type PaperPositionV2 = {
  id: string;
  mint: string;
  symbol?: string | null;
  title?: string | null;
  status: "open" | "partially_closed" | "closed";
  entryPriceSol: number;
  averageEntryPriceSol: number;
  currentPriceSol?: number | null;
  sizeSol: number;
  remainingSizeSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  realizedPnlPct: number;
  unrealizedPnlPct: number;
  openedAt: string;
  updatedAt: string;
  closedAt?: string | null;
};

export type PaperPortfolioStatusV2 = {
  enabled: boolean;
  entryPolicyEnabled: boolean;
  exitPolicyEnabled: boolean;
  openPositionCount: number;
  closedPositionCount: number;
  totalPnlSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  winRate: number;
  paperOnly: true;
  liveExecutionDisabled: true;
};

export type PositionsResponse = {
  positions: PaperPositionV2[];
  status: PaperPortfolioStatusV2;
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
