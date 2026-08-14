import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Layout shell for a row of filter controls (Select, Input, pickers,
 * etc.) — a single consistent wrap/gap container, not a new control
 * type. Callers compose their own filter controls as children, same as
 * `Card`/`CardContent`.
 */
export const FilterBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
  )
);
FilterBar.displayName = "FilterBar";
