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
import { getInitials } from "@/lib/initials";
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
  "default" | "secondary" | "outline" | "destructive" | "warning"
> = {
  pending: "warning",
  in_progress: "secondary",
  done: "default",
  cancelled: "destructive",
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
            <TableRow key={schedule.id} className={cn("group", isDeleted && "opacity-50")}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-caption font-semibold text-foreground"
                  >
                    {getInitials(schedule.title)}
                  </span>
                  {schedule.title}
                  {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                </div>
              </TableCell>
              <TableCell>{schedule.type}</TableCell>
              <TableCell>{format(parseScheduledDate(schedule.scheduled_date), "PP")}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[schedule.status]}>
                    {schedule.status.replace("_", " ")}
                  </Badge>
                  {!isDeleted && <ScheduleStatusActions schedule={schedule} />}
                </div>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                {/* Hover-reveal is scoped to mouse-capable devices via the
                    `hover: hover` media feature, so touch/mobile viewports
                    (which never match it) keep actions at their base
                    opacity-100 — always visible, never hover-gated. Kept as
                    opacity (not display/visibility) so the buttons stay in
                    the tab order and reveal on keyboard focus too. Scoped to
                    this Actions cell only: ScheduleStatusActions in the
                    Status column is a workflow control, not a row action, so
                    it stays permanently visible. */}
                <div
                  className={cn(
                    "inline-flex opacity-100 transition-opacity",
                    "[@media(hover:hover)]:opacity-0",
                    "[@media(hover:hover)]:group-hover:opacity-100",
                    "[@media(hover:hover)]:group-focus-within:opacity-100"
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
