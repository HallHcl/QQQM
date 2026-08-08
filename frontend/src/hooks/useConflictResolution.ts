import { useCallback, useState } from "react";
import { ApiError } from "@/api/errors";

export interface ConflictInfo {
  message: string;
  /** Whatever the backend put in `error.details` for this 409 — shape varies by endpoint. */
  details: unknown;
}

/**
 * Reusable primitive for the optimistic-lock (409) pattern used across PATCH
 * endpoints: a mutation fails because `updated_at` no longer matches the
 * server's record.
 *
 * This does NOT retry or discard the user's edits automatically. It just
 * captures the conflict so the caller can render a "record changed — reload
 * latest or overwrite" prompt. To show the server's current record, the
 * caller should refetch the record's GET query (e.g. via React Query's
 * `refetch()`) once `isConflict` is true.
 */
export function useConflictResolution() {
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  const captureConflict = useCallback((error: unknown): boolean => {
    if (error instanceof ApiError && error.status === 409) {
      setConflict({ message: error.message, details: error.details });
      return true;
    }
    return false;
  }, []);

  const clearConflict = useCallback(() => {
    setConflict(null);
  }, []);

  return {
    conflict,
    isConflict: conflict !== null,
    captureConflict,
    clearConflict,
  };
}
