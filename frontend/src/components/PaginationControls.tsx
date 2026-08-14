import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_PER_PAGE_OPTIONS = [10, 20, 50, 100];

export interface PaginationControlsProps {
  page: number;
  totalPages: number;
  perPage: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPerPageChange: (perPage: number) => void;
  /** Defaults to [10, 20, 50, 100] — the same options every current list page offers. */
  perPageOptions?: number[];
}

/**
 * Previous/Next + "Page X of Y" + per-page Select, consuming
 * `usePagination`'s return shape. Shared across every list page instead
 * of each one reimplementing this block.
 */
export function PaginationControls({
  page,
  totalPages,
  perPage,
  onPrevPage,
  onNextPage,
  onPerPageChange,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
}: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <Select value={String(perPage)} onValueChange={(v) => onPerPageChange(Number(v))}>
          <SelectTrigger className="w-16" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {perPageOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrevPage} disabled={page <= 1}>
          Previous
        </Button>
        <span>
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={onNextPage} disabled={page >= totalPages}>
          Next
        </Button>
      </div>
    </div>
  );
}
