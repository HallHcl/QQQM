import { cn } from "@/lib/utils";

/**
 * Emits the canonical panel-surface class set: `rounded-md border border-border`.
 *
 * Every content container that is not a Card (which already has its own
 * primitive) but still needs the standard outlined-panel treatment should use
 * this helper instead of repeating the three classes inline. The mapping is
 * 1:1 and zero-visual-delta today; when Phase 8.3 introduces the
 * `rounded-panel` token this is the single call site to update.
 *
 * The `dashed` flag swaps `border-solid` for `border-dashed` (EmptyState).
 */
export function panelSurface({ dashed = false }: { dashed?: boolean } = {}) {
  return cn(
    "rounded-md border border-border",
    dashed && "border-dashed",
  );
}
