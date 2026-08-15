import { Calendar } from "@/components/ui/calendar";
import { parseScheduledDate, type ScheduleListItem } from "@/hooks/useSchedules";

interface Props {
  schedules: ScheduleListItem[];
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
}

const DOT_BASE =
  "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full";

export default function ScheduleCalendar({ schedules, selected, onSelect }: Props) {
  // is_overdue is computed server-side (schedules.service.ts's overdueExpr:
  // status IN (pending, in_progress) AND scheduled_date < CURRENT_DATE) and
  // returned on every list/detail response — read it directly rather than
  // reimplementing the same logic client-side (a prior version only checked
  // status === "pending", silently missing in_progress schedules).
  const scheduledDates = schedules.filter((s) => !s.is_overdue).map((s) => parseScheduledDate(s.scheduled_date));
  const overdueDates = schedules.filter((s) => s.is_overdue).map((s) => parseScheduledDate(s.scheduled_date));

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
