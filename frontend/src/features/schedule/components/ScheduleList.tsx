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
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types";
import ScheduleStatusActions from "./ScheduleStatusActions";

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
          return (
            <TableRow key={schedule.id} className={cn(isDeleted && "opacity-50")}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {schedule.title}
                  {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                </div>
              </TableCell>
              <TableCell>{schedule.type}</TableCell>
              <TableCell>{format(new Date(schedule.scheduled_date), "PP")}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[schedule.status]}>
                    {schedule.status.replace("_", " ")}
                  </Badge>
                  {!isDeleted && <ScheduleStatusActions schedule={schedule} />}
                </div>
              </TableCell>
              <TableCell className="space-x-2 text-right">
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
                  <>
                    <RequireRole roles={["admin", "member"]}>
                      <Button variant="ghost" size="sm" onClick={() => onEdit(schedule)}>
                        Edit
                      </Button>
                    </RequireRole>
                    <RequireRole roles={["admin"]}>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(schedule)}>
                        Delete
                      </Button>
                    </RequireRole>
                  </>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
