import { format } from "date-fns";
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
import { useDeleteSchedule } from "@/hooks/useSchedules";
import type { Schedule } from "@/types";

const STATUS_VARIANT: Record<Schedule["status"], "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  in_progress: "secondary",
  done: "default",
  cancelled: "destructive",
};

interface Props {
  schedules: Schedule[];
  onEdit: (schedule: Schedule) => void;
}

export default function ScheduleList({ schedules, onEdit }: Props) {
  const deleteSchedule = useDeleteSchedule();

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
        {schedules.map((schedule) => (
          <TableRow key={schedule.id}>
            <TableCell className="font-medium">{schedule.title}</TableCell>
            <TableCell>{schedule.type}</TableCell>
            <TableCell>{format(new Date(schedule.scheduled_date), "PP")}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[schedule.status]}>
                {schedule.status.replace("_", " ")}
              </Badge>
            </TableCell>
            <TableCell className="space-x-2 text-right">
              <Button variant="ghost" size="sm" onClick={() => onEdit(schedule)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteSchedule.mutate(schedule.id)}
              >
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
