import { useAuth } from "@/features/auth/useAuth";

/** Matches the 2-role model currently implemented server-side. */
export type Role = "admin" | "member";

/**
 * Checks whether the current user has at least one of the given roles.
 *
 * This is a UX convenience for deciding what to show — it does NOT enforce
 * anything. The backend already enforces the RBAC matrix and returns 403 for
 * disallowed requests (handled by the Part 19 global error handler); this
 * hook exists so the UI doesn't show an action a user will immediately get
 * a 403 for, not to replace that enforcement.
 *
 * Returns `false` while auth is still resolving, so it's safe to call
 * before the user's session is loaded.
 */
export function useHasRole(roles: Role | Role[]): boolean {
  const { roles: userRoles, isLoading } = useAuth();
  if (isLoading) return false;

  const required = Array.isArray(roles) ? roles : [roles];
  return required.some((role) => userRoles.includes(role));
}
