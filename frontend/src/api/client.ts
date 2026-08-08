import { apiClient } from "./generated/client";
import { ApiError, parseApiError } from "./errors";
import { handleGlobalApiError } from "./errorHandler";

export { apiClient };

interface OpenApiFetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/**
 * Unwraps an openapi-fetch result (`{ data, error, response }`) into a plain
 * value or a thrown ApiError, so React Query query/mutation functions can be
 * written as `unwrapApiResult(await apiClient.GET(...))`.
 *
 * Triggers global side effects (401 redirect, 403 toast) before throwing so
 * callers only need to handle statuses that require local UI (404, 409).
 */
export async function unwrapApiResult<T>(result: OpenApiFetchResult<T>): Promise<T> {
  if (result.error !== undefined) {
    const apiError = parseApiError(result.response.status, result.error);
    handleGlobalApiError(apiError);
    throw apiError;
  }
  if (result.data === undefined) {
    throw new ApiError(result.response.status, "Empty response received from server");
  }
  return result.data;
}
