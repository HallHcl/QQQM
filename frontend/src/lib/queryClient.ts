import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";
import { handleGlobalApiError } from "@/api/errorHandler";

/** 401/403/404/409 are not transient — retrying them just repeats the same failure. */
const NON_RETRYABLE_STATUSES = new Set([401, 403, 404, 409]);

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && NON_RETRYABLE_STATUSES.has(error.status)) {
    return false;
  }
  return failureCount < 2;
}

function onError(error: unknown): void {
  if (error instanceof ApiError) {
    handleGlobalApiError(error);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
