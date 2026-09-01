import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  /** Tile label, e.g. "Total Clients". */
  label: string;
  /** `pagination.total` for the metric; `undefined` until resolved. */
  count: number | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Optional muted line under the value (e.g. a scope qualifier). */
  subtext?: string;
  /** Entity icon, shown in a soft-tint frame above the value. */
  icon?: LucideIcon;
  /**
   * Destination for the tile, including any pre-applied filter search params
   * (e.g. "/schedule?status=pending"). When set the whole tile becomes a
   * link-like button; when omitted the tile is inert, as it was before.
   */
  to?: string;
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
 * Icons: this component previously documented a deliberate "no icon" rule, on
 * the grounds that RelatedCount and VpnResourceStatus established no icon
 * convention for counts and a tile icon would be the only such usage. That is
 * no longer true — the grouped sidebar and the ⌘K command palette both label
 * these same six entities with these same lucide icons, so the tile now
 * reuses that established vocabulary rather than inventing one.
 *
 * A tile with `to` stays keyboard-reachable and announces its destination: it
 * renders as a real <button> inside the card rather than an onClick on the
 * card <div>, so Enter/Space work without any extra key handling.
 */
export function MetricCard({
  label,
  count,
  isLoading,
  isError,
  subtext,
  icon: Icon,
  to,
  className,
}: MetricCardProps) {
  const navigate = useNavigate();
  const unresolved = isError || count === undefined;
  const interactive = Boolean(to);

  const body = (
    <>
      {Icon && (
        <span className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-sm border border-brand/20 bg-brand/5">
          <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
        </span>
      )}
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
    </>
  );

  return (
    <Card
      className={cn(
        interactive &&
          "transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-elev-2",
        className
      )}
    >
      {interactive ? (
        <button
          type="button"
          onClick={() => navigate(to as string)}
          className="flex w-full cursor-pointer flex-col items-start p-4 text-left focus-visible:ring-2 focus-visible:ring-primary"
        >
          {body}
        </button>
      ) : (
        <CardContent className="p-4">{body}</CardContent>
      )}
    </Card>
  );
}
