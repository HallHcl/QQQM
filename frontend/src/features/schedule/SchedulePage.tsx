import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchedules } from "@/hooks/useSchedules";
import type { Schedule } from "@/types";
import ScheduleCalendar from "./components/ScheduleCalendar";
import ScheduleList from "./components/ScheduleList";
import ScheduleFormDialog from "./components/ScheduleFormDialog";

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [status, setStatus] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | undefined>(undefined);

  const { data: schedules = [] } = useSchedules({
    status: status === "all" ? undefined : status,
  });

  const visibleSchedules = selectedDate
    ? schedules.filter(
        (s) => s.scheduled_date.slice(0, 10) === format(selectedDate, "yyyy-MM-dd")
      )
    : schedules;

  function handleNew() {
    setEditingSchedule(undefined);
    setFormOpen(true);
  }

  function handleEdit(schedule: Schedule) {
    setEditingSchedule(schedule);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <Button onClick={handleNew}>New schedule</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <ScheduleCalendar
          schedules={schedules}
          selected={selectedDate}
          onSelect={setSelectedDate}
        />

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            {selectedDate && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)}>
                Clear date filter
              </Button>
            )}
          </div>

          <ScheduleList schedules={visibleSchedules} onEdit={handleEdit} />
        </div>
      </div>

      <ScheduleFormDialog open={formOpen} onOpenChange={setFormOpen} schedule={editingSchedule} />
    </div>
  );
}
