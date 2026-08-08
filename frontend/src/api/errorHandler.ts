import { toast } from "@/hooks/use-toast";
import { setToken } from "@/lib/authToken";
import { ApiError } from "./errors";

let redirectingToLogin = false;

function redirectToLogin(): void {
  if (redirectingToLogin || window.location.pathname === "/login") return;
  redirectingToLogin = true;
  setToken(null);
  window.location.assign("/login");
}

/**
 * Centralized side effects for API errors, shared by React Query's
 * QueryCache/MutationCache and by the generated client's result unwrapper.
 *
 * 401 and 403 are handled here since the response is the same everywhere
 * they occur. 404 and 409 are deliberately NOT handled globally — they need
 * to be surfaced to the calling component (not-found state, conflict UI),
 * so callers inspect `ApiError.status` themselves.
 */
export function handleGlobalApiError(error: ApiError): void {
  if (error.status === 401) {
    redirectToLogin();
    return;
  }

  if (error.status === 403) {
    toast({
      title: "Not permitted",
      description: error.message,
      variant: "destructive",
    });
  }
}
