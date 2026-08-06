import { startOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import type { Schedule } from "@/types";

interface Props {
  schedules: Schedule[];
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
}

const DOT_BASE =
  "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full";

export default function ScheduleCalendar({ schedules, selected, onSelect }: Props) {
  const today = startOfDay(new Date());

  const isOverdue = (schedule: Schedule) =>
    schedule.status === "pending" && startOfDay(new Date(schedule.scheduled_date)) < today;

  const scheduledDates = schedules.filter((s) => !isOverdue(s)).map((s) => new Date(s.scheduled_date));
  const overdueDates = schedules.filter(isOverdue).map((s) => new Date(s.scheduled_date));

  return (
    <Calendar
      mode="single"
      selected={selected}
      onSelect={onSelect}
      modifiers={{ scheduled: scheduledDates, overdue: overdueDates }}
      modifiersClassNames={{
        scheduled: `${DOT_BASE} after:bg-brand`,
        overdue: `${DOT_BASE} after:bg-danger`,
      }}
      className="rounded-md border border-border bg-surface"
    />
  );
}
