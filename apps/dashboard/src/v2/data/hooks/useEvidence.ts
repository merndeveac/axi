import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api-client";
import { queryKeys } from "../query-keys";

export function useEvidence(enabled = true) {
  return useQuery({
    queryKey: queryKeys.evidence,
    queryFn: ({ signal }) =>
      apiClient.get<unknown>("/runtime/paper-forward-evaluation", { signal }),
    enabled,
    staleTime: 15_000
  });
}
