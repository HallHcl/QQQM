import { format } from "date-fns";
import { RequireRole } from "@/components/auth/RequireRole";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RowActions } from "@/components/RowActions";
import { useHasRole } from "@/hooks/useHasRole";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { cn } from "@/lib/utils";
import { parseScheduledDate } from "@/hooks/useSchedules";
import type { Schedule } from "@/types";
import ScheduleStatusActions from "./ScheduleStatusActions";

// Edit/Delete are hidden once a schedule reaches a terminal status — mirrors
// scheduleStateMachine.ts's terminal states (done/cancelled have no further
// transitions). This is independent of isDeleted: a non-deleted schedule
// that's simply done or cancelled shouldn't still offer Edit/Delete.
const TERMINAL_STATUSES: Schedule["status"][] = ["done", "cancelled"];

const STATUS_VARIANT: Record<
  Schedule["status"],
  "success" | "info" | "warning" | "neutral"
> = {
  done: "success",
  in_progress: "info",
  pending: "warning",
  cancelled: "neutral",
};

interface Props {
  schedules: Schedule[];
  onEdit: (schedule: Schedule) => void;
  onDelete: (schedule: Schedule) => void;
  onRestore: (schedule: Schedule) => void;
}

export default function ScheduleList({ schedules, onEdit, onDelete, onRestore }: Props) {
  const canEdit = useHasRole(["admin", "member"]);
  const canDelete = useHasRole(["admin"]);

  if (schedules.length === 0) {
    return <p className="text-sm text-muted-foreground">No schedules found.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {schedules.map((schedule) => {
          const isDeleted = Boolean(schedule.deleted_at);
          const isTerminal = TERMINAL_STATUSES.includes(schedule.status);
          return (
            <TableRow key={schedule.id} className={cn("group", isDeleted && "[&_td]:text-muted-foreground")}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <InitialsAvatar name={schedule.title} />
                  {schedule.title}
                  {isDeleted && <Badge variant="neutral">Deleted</Badge>}
                </div>
              </TableCell>
              <TableCell>{schedule.type}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">{format(parseScheduledDate(schedule.scheduled_date), "PP")}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[schedule.status]}>
                    {schedule.status.replace("_", " ")}
                  </Badge>
                  {!isDeleted && <ScheduleStatusActions schedule={schedule} />}
                </div>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                {/* Row actions idle at opacity-60 — dimmed but legible and fully
                    operable everywhere, including touch, where there is no hover to
                    reveal them with. Hover or keyboard focus anywhere in the row brings
                    them to full opacity. Kept as opacity (not display/visibility) so
                    the buttons stay in the tab order throughout. Still skipped on
                    deleted rows, though decision #53's original reason is gone: the row
                    no longer carries its own opacity-50 to compound with (deleted rows
                    are marked with muted text plus a badge now), but Restore is a
                    deleted row's only action and is deliberately left at full contrast. */}
                <div
                  className={cn(
                    "inline-flex transition-opacity",
                    !isDeleted && "opacity-60",
                    "group-hover:opacity-100",
                    "group-focus-within:opacity-100"
                  )}
                >
                  {isDeleted ? (
                    // Restore's 409 ("Schedule is not deleted") is a business-rule
                    // conflict, not a stale-write conflict. Schedule is a leaf
                    // entity — nothing references schedules.id as a foreign key
                    // (verified: no migration adds a schedule_id column anywhere)
                    // — so restoring one has no cascade and no data-loss risk,
                    // matching Clients'/People's/Resources' restore convention:
                    // a direct action, not a ConfirmDialog.
                    <RequireRole roles={["admin"]}>
                      <Button variant="ghost" size="sm" onClick={() => onRestore(schedule)}>
                        Restore
                      </Button>
                    </RequireRole>
                  ) : (
                    <RowActions
                      onEdit={canEdit && !isTerminal ? () => onEdit(schedule) : undefined}
                      onDelete={canDelete && !isTerminal ? () => onDelete(schedule) : undefined}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
