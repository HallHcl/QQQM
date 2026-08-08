/**
 * Normalized API error shape used across the app, regardless of which HTTP
 * client (axios today, the generated openapi-fetch client for future
 * modules) produced the failure.
 *
 * Backend envelope: `{ error: { code, message, details? } }`. Known
 * technical debt: 404 and 500 responses currently omit `code` — every
 * consumer must tolerate that instead of assuming it's always present.
 */
export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly body?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.body = body;
  }
}

const STATUS_FALLBACK_MESSAGE: Record<number, string> = {
  400: "The request was invalid.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "The requested item could not be found.",
  409: "This record was changed by someone else since you loaded it.",
  500: "Something went wrong on the server. Please try again.",
};

/** Normalizes a (possibly malformed) error response body into an ApiError. */
export function parseApiError(status: number, body: unknown): ApiError {
  const envelope = isApiErrorBody(body) ? body : undefined;
  const code = envelope?.error?.code;
  const message =
    envelope?.error?.message ?? STATUS_FALLBACK_MESSAGE[status] ?? `Request failed with status ${status}`;
  const details = envelope?.error?.details;
  return new ApiError(status, message, code, details, body);
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return typeof body === "object" && body !== null && "error" in body;
}
