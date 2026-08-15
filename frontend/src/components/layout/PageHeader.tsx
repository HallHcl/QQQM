import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  /** Optional right-aligned action slot (buttons, pickers, etc.) */
  actions?: React.ReactNode;
  /**
   * Override the wrapper's flex classes. Default: "flex items-center justify-between".
   * Use to extend with flex-wrap/gap when the actions area has multiple wide controls
   * (e.g. InfrastructurePage's two Select pickers).
   */
  className?: string;
}

/**
 * Shared page-level header. Renders the page title (h1, text-heading-page)
 * and an optional right-aligned actions slot (buttons, pickers, etc.).
 *
 * Extracted from the identical copy-paste pattern that existed across all
 * 11 module pages. Produces the same rendered output as the inline version;
 * this is a refactor-for-reuse, not a redesign.
 */
export function PageHeader({ title, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <h1 className="text-heading-page">{title}</h1>
      {actions ? (
        // min-w-0 lets this flex item actually shrink below its unwrapped
        // content width so flex-wrap can engage at narrow viewports,
        // instead of the row silently overflowing past the page edge.
        <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
