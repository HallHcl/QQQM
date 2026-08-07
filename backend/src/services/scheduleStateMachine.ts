/**
 * Single source of truth for legal schedule status transitions. Nothing else
 * in the codebase (validator, controller) should encode this table — the
 * service layer calls canTransition() before ever writing a status change.
 */
const TRANSITIONS: Record<string, string[]> = {
  pending: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
