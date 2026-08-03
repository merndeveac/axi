import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";

export function useEvidence<T = unknown>(enabled = true) {
  return useQuery({
    queryKey: queryKeys.evidence,
    queryFn: ({ signal }) =>
      apiClient.get<T>("/runtime/paper-forward-evaluation", { signal }),
    enabled,
    staleTime: 15_000
  });
}
