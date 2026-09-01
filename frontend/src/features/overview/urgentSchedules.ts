import { differenceInCalendarDays, isToday } from "date-fns";
import { parseScheduledDate, type ScheduleListItem } from "@/hooks/useSchedules";

/**
 * Bucketing predicates for the Urgent Action Items box.
 *
 * Kept in their own module rather than alongside the component so that file
 * exports only components — the `react(only-export-components)` lint rule
 * (fast refresh) flags mixed component/non-component exports.
 */

/**
 * Statuses that can still be acted on. `done` and `cancelled` are closed and
 * never urgent, no matter how old their scheduled_date is.
 */
const OPEN_STATUSES = new Set(["pending", "in_progress"]);

/**
 * A schedule is due today when it is still open and its scheduled_date is the
 * viewer's local today.
 *
 * `parseScheduledDate` rather than `new Date(...)` is essential here:
 * scheduled_date arrives as a UTC-midnight timestamp, and the bare
 * constructor reads it in local time, which shows the PREVIOUS calendar day
 * for anyone west of UTC — turning "due today" into "overdue" at the exact
 * boundary this box exists to get right.
 */
export function isDueToday(schedule: ScheduleListItem): boolean {
  if (!OPEN_STATUSES.has(schedule.status)) return false;
  return isToday(parseScheduledDate(schedule.scheduled_date));
}

/**
 * Overdue is NOT recomputed here. `is_overdue` is computed server-side as
 * `status IN ('pending','in_progress') AND scheduled_date < CURRENT_DATE`
 * (schedules.service.ts), and useSchedules' contract is explicit that it must
 * never be recomputed client-side — so this box and the Schedule page's own
 * overdue badge can never disagree.
 *
 * The status re-check is belt-and-braces for the shape of the data, not a
 * second opinion on the date: it costs nothing and makes the invariant local.
 */
export function isOverdue(schedule: ScheduleListItem): boolean {
  return schedule.is_overdue && OPEN_STATUSES.has(schedule.status);
}

/** Whole calendar days between a schedule's date and today, for "N days overdue". */
export function daysOverdue(schedule: ScheduleListItem, now: Date = new Date()): number {
  return differenceInCalendarDays(now, parseScheduledDate(schedule.scheduled_date));
}
