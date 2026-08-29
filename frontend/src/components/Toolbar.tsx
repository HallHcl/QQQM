import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Bounded layout shell that groups a list page's filter controls and its
 * primary action into one visually-contained surface (border + bg-surface),
 * rather than letting them float as separate elements. Callers compose their
 * own children, same as `FilterBar`/`Card`.
 *
 * Distinct from `FilterBar`, which is a bare unbordered `flex ... gap-2` row
 * holding filter controls only. The two nest: `Toolbar` is the outer box, and
 * a `FilterBar` inside it sub-groups the controls so `justify-between` pushes
 * the action button to the opposite edge.
 */
export const Toolbar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface p-3",
        className
      )}
      {...props}
    />
  )
);
Toolbar.displayName = "Toolbar";
