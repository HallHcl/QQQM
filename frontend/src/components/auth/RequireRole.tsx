import type { ReactNode } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useHasRole, type Role } from "@/hooks/useHasRole";

export interface RequireRoleProps {
  roles: Role | Role[];
  /** Rendered instead of `children` when the role check fails. Defaults to nothing. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Element-level role gate — hides/shows a UI element (e.g. a Delete button)
 * based on the current user's role. This is NOT a route guard (see
 * `RequireAuth` for that) and it is NOT a security boundary: it only
 * controls what's shown for a better experience. The backend is the actual
 * enforcement point for every action this might gate.
 *
 * Renders nothing while auth is still resolving, regardless of `fallback`,
 * so admin-only content never flashes before the user's role is known.
 */
export function RequireRole({ roles, fallback = null, children }: RequireRoleProps) {
  const { isLoading } = useAuth();
  const hasRole = useHasRole(roles);

  if (isLoading) return null;
  return hasRole ? <>{children}</> : <>{fallback}</>;
}
