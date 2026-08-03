import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";
import { visibleRefetchInterval } from "../query-client";
import {
  adaptRuntimeStatusV2,
  type CanonicalRuntimeStatus
} from "../runtime-adapter";

export function useRuntimeStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.runtime,
    queryFn: ({ signal }) =>
      apiClient.get<CanonicalRuntimeStatus>("/runtime/status", {
        signal,
        timeoutMs: 4_000
      }),
    select: adaptRuntimeStatusV2,
    enabled,
    staleTime: 1_000,
    refetchInterval: () => visibleRefetchInterval(2_000)
  });
}
