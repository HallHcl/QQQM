import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RowActionsProps {
  /** Omit to hide the Edit item entirely (e.g. role gating, status gating). */
  onEdit?: () => void;
  /** Omit to hide the Delete item entirely (e.g. role gating, status gating). */
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  /** Accessible name for the trigger button. */
  label?: string;
}

/**
 * Shared row-level overflow menu for Edit/Delete, used by list-page tables
 * whose rows are themselves clickable (row click = primary action). Renders
 * nothing when neither action is supplied, so callers can gate visibility
 * by simply not passing a handler rather than conditionally rendering this
 * component.
 */
export function RowActions({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
  label = "Actions",
}: RowActionsProps) {
  if (!onEdit && !onDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && <DropdownMenuItem onSelect={onEdit}>{editLabel}</DropdownMenuItem>}
        {onDelete && (
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-danger focus:bg-danger/10 focus:text-danger"
          >
            {deleteLabel}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
