import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { cn } from "@/lib/utils";

export interface DetailPageShellProps<T> {
  /** Route the back-link navigates to, e.g. "/servers". */
  backTo: string;
  /** Back-link text, e.g. "Back to servers". */
  backLabel: string;

  /** The detail query's result. `undefined` after loading resolves means not-found. */
  entity: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;

  /** Messages for the not-found branch (a resolved query that returned nothing). */
  notFoundTitle?: string;
  notFoundMessage: string;

  /** Page-level loading message, e.g. "Loading server...". */
  loadingMessage: string;

  /**
   * Primary column. Called only once `entity` is loaded, so it receives a
   * defined value and needs no guard of its own.
   */
  main: (entity: T) => ReactNode;
  /**
   * Optional secondary column — related/linked records. Omit it entirely and
   * `main` spans the full content width with no empty track left behind.
   */
  aside?: (entity: T) => ReactNode;

  /** Extra classes for the outermost wrapper. */
  className?: string;
}

/**
 * Shared scaffolding for the record detail pages (/servers/:id and, in later
 * tickets, /environments/:id and /projects/:id). Owns three things those
 * pages had duplicated verbatim:
 *
 *  1. The back-link (icon + label).
 *  2. The four-state chain — loading, error (retryable), resolved-but-empty
 *     ("not found"), success — in that order. `main`/`aside` are render props
 *     rather than nodes precisely so they are never evaluated in the first
 *     three states: the caller can dereference the entity freely.
 *  3. A two-column grid: flexible main, fixed-width aside, collapsing to one
 *     stacked column below `lg`.
 *
 * It owns the page's *frame*, not its content. It deliberately renders no
 * heading of its own — whether a detail page's record name should be a real
 * <h1> instead of a CardTitle is an open question from the detail-page audit
 * and is the caller's business until it's decided.
 *
 * Column direction mirrors the codebase's existing two-column pages
 * (ResourcesPage's `lg:grid-cols-[320px_1fr]`, SchedulePage's
 * `lg:grid-cols-[auto_1fr]`), which both put the narrow track first; a detail
 * page wants the opposite, so the fixed track is second. `min-w-0` on the
 * flexible column keeps wide content (long hostnames, tables, code) from
 * forcing the grid wider than its container instead of wrapping.
 */
export function DetailPageShell<T>({
  backTo,
  backLabel,
  entity,
  isLoading,
  isError,
  error,
  onRetry,
  notFoundTitle = "Not found",
  notFoundMessage,
  loadingMessage,
  main,
  aside,
  className,
}: DetailPageShellProps<T>) {
  return (
    <div className={cn("space-y-6", className)}>
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      {isLoading ? (
        <LoadingState message={loadingMessage} />
      ) : isError ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : !entity ? (
        <ErrorState title={notFoundTitle} message={notFoundMessage} />
      ) : aside ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-6">{main(entity)}</div>
          <div className="space-y-6">{aside(entity)}</div>
        </div>
      ) : (
        <div className="space-y-6">{main(entity)}</div>
      )}
    </div>
  );
}
