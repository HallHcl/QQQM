import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ScheduleFormSheet from "@/features/schedule/components/ScheduleFormSheet";
import { usePeople } from "@/hooks/usePeople";
import { useSchedules, type ScheduleListItem } from "@/hooks/useSchedules";
import { daysOverdue, isDueToday, isOverdue } from "./urgentSchedules";

interface UrgentRowProps {
  schedule: ScheduleListItem;
  assignee: string | undefined;
  detail: string;
  onSelect: (schedule: ScheduleListItem) => void;
}

function UrgentRow({ schedule, assignee, detail, onSelect }: UrgentRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(schedule)}
        className="flex w-full items-center justify-between gap-3 rounded-sm border border-transparent px-3 py-2 text-left transition-colors duration-150 hover:border-border hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {schedule.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {detail}
            {assignee ? ` · ${assignee}` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function UrgentActionItems() {
  const [editing, setEditing] = useState<ScheduleListItem | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);

  // One bounded query covering both buckets. `status` is single-valued
  // server-side so "pending OR in_progress" can't be expressed there, and
  // `to` is an inclusive scheduled_date bound — so everything on or before
  // today comes back in one call and is bucketed below. per_page is well
  // above any realistic backlog; sorting oldest-first means that if the cap
  // is ever hit, it is the least urgent items that fall off the end.
  const today = format(new Date(), "yyyy-MM-dd");
  const {
    data: schedules = [],
    pagination,
    isLoading,
    isError,
  } = useSchedules({
    to: today,
    per_page: 100,
    sort: "scheduled_date",
    order: "asc",
  });

  // pagination.total counts every schedule matching `to`/`deleted` regardless
  // of status (it has no status filter — see useSchedules.ts), so it is NOT
  // "total urgent items" and must not be compared against the bucketed
  // overdue/dueToday counts. It IS the right signal for "did the per_page:100
  // cap truncate the fetch": if total exceeds what came back on this page,
  // rows beyond the cap (the ones with the latest scheduled_date, i.e.
  // closest to today) were never fetched at all and may include additional
  // overdue or due-today items.
  const truncated = Boolean(pagination && pagination.total > schedules.length);

  // Assignee names are not in the list payload — ScheduleListItem carries only
  // the assigned_to UUID, and assigned_to_person.name exists solely on
  // ScheduleDetail. One people fetch resolves every row; if it fails the rows
  // still render, just without a name.
  const { data: people = [] } = usePeople();
  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person.name])),
    [people]
  );

  const { overdue, dueToday } = useMemo(
    () => ({
      overdue: schedules.filter(isOverdue),
      dueToday: schedules.filter(isDueToday),
    }),
    [schedules]
  );

  function openSchedule(schedule: ScheduleListItem) {
    setEditing(schedule);
    setFormOpen(true);
  }

  const hasUrgent = overdue.length > 0 || dueToday.length > 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Urgent action items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading schedules...</p>
          )}

          {!isLoading && isError && (
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t load schedules.
            </p>
          )}

          {!isLoading && !isError && !hasUrgent && (
            <div className="flex items-center gap-2 rounded-sm border border-success-border bg-success-tint px-3 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
              <p className="text-sm text-success-text">
                All caught up! No overdue schedules.
              </p>
            </div>
          )}

          {!isLoading && !isError && overdue.length > 0 && (
            <section aria-labelledby="urgent-overdue-heading">
              <h3
                id="urgent-overdue-heading"
                className="mb-1 flex items-center gap-2 px-3 text-xs font-medium uppercase tracking-wider text-danger-text"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Overdue ({overdue.length})
              </h3>
              <ul>
                {overdue.map((schedule) => {
                  const days = daysOverdue(schedule);
                  return (
                    <UrgentRow
                      key={schedule.id}
                      schedule={schedule}
                      assignee={peopleById.get(schedule.assigned_to)}
                      detail={`${days} ${days === 1 ? "day" : "days"} overdue`}
                      onSelect={openSchedule}
                    />
                  );
                })}
              </ul>
            </section>
          )}

          {!isLoading && !isError && dueToday.length > 0 && (
            <section aria-labelledby="urgent-due-today-heading">
              <h3
                id="urgent-due-today-heading"
                className="mb-1 flex items-center gap-2 px-3 text-xs font-medium uppercase tracking-wider text-info-text"
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                Due today ({dueToday.length})
              </h3>
              <ul>
                {dueToday.map((schedule) => (
                  <UrgentRow
                    key={schedule.id}
                    schedule={schedule}
                    assignee={peopleById.get(schedule.assigned_to)}
                    detail="Due today"
                    onSelect={openSchedule}
                  />
                ))}
              </ul>
            </section>
          )}

          {!isLoading && !isError && truncated && (
            <p className="px-3 text-xs text-muted-foreground">
              Showing the {schedules.length} oldest of {pagination?.total} items due on or
              before today &mdash; some overdue or due-today items may not be shown.
            </p>
          )}
        </CardContent>
      </Card>

      <ScheduleFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        schedule={editing}
      />
    </>
  );
}
