import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";

/**
 * Route guard for authenticated-only routes. Reads auth state from the
 * existing useAuth()/authToken.ts (localStorage-backed) mechanism — this
 * does not introduce a new storage or auth flow, just centralizes the guard
 * itself so it can be reused as module refactors add new route trees.
 */
export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
