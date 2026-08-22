import { cn } from "@/lib/utils";
import type { ChildCount } from "@/hooks/useChildCounts";

interface RelatedCountProps {
  /** One entry from `useChildCounts`' map; `undefined` for a row whose count was never requested. */
  result: ChildCount | undefined;
  /** Child noun, singular — e.g. "Project". Pluralized by appending "s". */
  noun: string;
  className?: string;
}

/**
 * Row subtext showing how many immediate children a parent row has
 * ("1 Project", "3 Environments").
 *
 * Follows VpnResourceStatus.tsx's inline-async convention: muted text in the
 * same slot for every state, so nothing reflows as counts land. The error
 * state renders a neutral "—" rather than VpnResourceStatus' warning badge —
 * a count that failed to load is far less consequential than an unverifiable
 * VPN link, and 20-50 warning badges appearing at once during a backend blip
 * would be alarming out of all proportion. Critically, neither the loading
 * nor the error state is allowed to render as "0 Projects": an unknown count
 * never masquerades as a resolved zero.
 */
export function RelatedCount({ result, noun, className }: RelatedCountProps) {
  const base = cn("text-xs text-muted-foreground", className);

  if (!result || result.isLoading) {
    return <p className={base}>Loading…</p>;
  }

  if (result.isError || result.count === undefined) {
    return (
      <p className={base} title={`Couldn't load ${noun.toLowerCase()} count`}>
        —
      </p>
    );
  }

  return (
    <p className={base}>
      {result.count} {result.count === 1 ? noun : `${noun}s`}
    </p>
  );
}
