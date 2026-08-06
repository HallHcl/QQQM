import { Calendar } from "@/components/ui/calendar";
import type { Schedule } from "@/types";

interface Props {
  schedules: Schedule[];
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
}

export default function ScheduleCalendar({ schedules, selected, onSelect }: Props) {
  const scheduledDates = schedules.map((s) => new Date(s.scheduled_date));

  return (
    <Calendar
      mode="single"
      selected={selected}
      onSelect={onSelect}
      modifiers={{ hasSchedule: scheduledDates }}
      modifiersClassNames={{
        hasSchedule: "font-semibold underline decoration-primary decoration-2",
      }}
      className="rounded-md border"
    />
  );
}
