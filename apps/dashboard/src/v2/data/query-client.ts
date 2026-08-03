import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError, isAbortError } from "./errors";

export function createDashboardQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 5 * 60_000,
        staleTime: 2_000,
        refetchOnWindowFocus: true,
        retry(failureCount, error) {
          if (isAbortError(error)) return false;
          if (error instanceof ApiRequestError && !error.retryable) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000)
      },
      mutations: { retry: false }
    }
  });
}

export const dashboardQueryClient = createDashboardQueryClient();

export function visibleRefetchInterval(intervalMs: number): number | false {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return false;
  }
  return intervalMs;
}
