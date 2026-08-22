import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  /** Tile label, e.g. "Total Clients". */
  label: string;
  /** `pagination.total` for the metric; `undefined` until resolved. */
  count: number | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Optional muted line under the value (e.g. a scope qualifier). */
  subtext?: string;
  className?: string;
}

/**
 * A single system-wide KPI tile on OverviewPage ("Total Clients", "Servers",
 * "Pending Schedules").
 *
 * Follows RelatedCount.tsx's inline-async convention: the value slot is the
 * same element in every state, so the tile grid doesn't reflow as the six
 * independent counts land at different times. Two rules carried over from
 * there, both load-bearing:
 *
 *  - Neither the loading nor the error state may render as "0". An unknown
 *    count must never masquerade as a resolved zero — and unlike a row
 *    subtext, a wrong "0" on a dashboard tile reads as a factual claim about
 *    the system.
 *  - The error state is a neutral "—", not a warning badge. A backend blip
 *    would otherwise light up six alarms at once on the landing page.
 *
 * Loading and error deliberately render *different* glyphs ("…" vs "—") so a
 * tile that failed is distinguishable from one still in flight, rather than
 * hanging in a permanent-looking ellipsis.
 *
 * No icon: RelatedCount and VpnResourceStatus establish no icon convention
 * for counts, and inventing one here would be the only such usage.
 */
export function MetricCard({
  label,
  count,
  isLoading,
  isError,
  subtext,
  className,
}: MetricCardProps) {
  const unresolved = isError || count === undefined;

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <p className="text-caption text-muted-foreground">{label}</p>
        {isLoading ? (
          <p className="text-heading-page tabular-nums text-muted-foreground" aria-busy="true">
            <span aria-hidden="true">…</span>
            <span className="sr-only">Loading</span>
          </p>
        ) : unresolved ? (
          <p
            className="text-heading-page tabular-nums text-muted-foreground"
            title={`Couldn't load ${label.toLowerCase()}`}
          >
            —
          </p>
        ) : (
          <p className="text-heading-page tabular-nums text-foreground">{count}</p>
        )}
        {subtext ? <p className="text-caption text-muted-foreground">{subtext}</p> : null}
      </CardContent>
    </Card>
  );
}
