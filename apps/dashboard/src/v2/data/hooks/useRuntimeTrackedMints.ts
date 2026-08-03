import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { visibleRefetchInterval } from "../query-client";

export type RuntimeTrackedMint = {
  mint: string;
  status?: string;
  firstTrackedAt?: string;
  lastEventAt?: string | null;
  eventCount?: number;
};

export type RuntimeTrackedMintsResponse = {
  current: RuntimeTrackedMint[];
  paperOnly: true;
  dataOnly: true;
  tradingDisabled: true;
};

export function useRuntimeTrackedMints(enabled = true) {
  return useQuery({
    queryKey: ["runtime", "tracked-mints"],
    queryFn: ({ signal }) =>
      apiClient.get<RuntimeTrackedMintsResponse>(
        "/metered-launch-data/tracked?limit=50",
        { signal, timeoutMs: 4_000 }
      ),
    enabled,
    staleTime: 2_000,
    refetchInterval: () => visibleRefetchInterval(5_000)
  });
}
