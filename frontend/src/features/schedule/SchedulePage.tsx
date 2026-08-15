import { useState } from "react";
import { format } from "date-fns";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaginationControls } from "@/components/PaginationControls";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";
import {
  parseScheduledDate,
  useDeleteSchedule,
  useRestoreSchedule,
  useSchedules,
  type ScheduleSort,
} from "@/hooks/useSchedules";
import type { Schedule } from "@/types";
import ScheduleCalendar from "./components/ScheduleCalendar";
import ScheduleList from "./components/ScheduleList";
import ScheduleFormDialog from "./components/ScheduleFormDialog";

const SORT_OPTIONS: { value: ScheduleSort; label: string }[] = [
  { value: "scheduled_date", label: "Scheduled date" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
];

export default function SchedulePage() {
  const pagination = usePagination({ initialSort: "scheduled_date", initialOrder: "asc" });
  // URL-synced the same way as pagination's own fields (see usePagination.ts)
  // rather than local useState, so a refresh/shared URL reproduces the same
  // status filter and calendar-day selection. Matches pre-migration behavior
  // exactly: neither one resets the page on change. A malformed `date` value
  // in the URL (unparseable as yyyy-MM-dd) falls back to "no day selected"
  // rather than crashing.
  const status = pagination.getParam("status") ?? "all";
  const selectedDate = parseDateParam(pagination.getParam("date"));

  function setStatus(value: string) {
    pagination.setParams({ status: value === "all" ? undefined : value });
  }

  function setSelectedDate(value: Date | undefined) {
    pagination.setParams({ date: value ? format(value, "yyyy-MM-dd") : undefined });
  }

  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | undefined>(undefined);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const {
    data: schedules = [],
    pagination: pageInfo,
    isLoading,
    isError,
    error,
    refetch,
  } = useSchedules({
    status: status === "all" ? undefined : status,
    page: pagination.page,
    per_page: pagination.perPage,
    sort: pagination.sort as ScheduleSort | undefined,
    order: pagination.order,
    deleted: pagination.deleted,
  });

  const totalPages = pageInfo?.total_pages ?? 1;

  const deleteSchedule = useDeleteSchedule();
  const restoreSchedule = useRestoreSchedule();

  // Calendar day selection filters client-side over whatever page is
  // currently loaded. GET /schedules has no date-equality filter (only
  // from/to bounds — see useSchedules.ts's ScheduleFilters), so a schedule
  // that falls on the selected day but sits on a different page won't show
  // here. This is an accepted limitation, not something being engineered
  // around: per_page defaults to 20 and typical schedule volumes are small,
  // so building cross-page aggregation for a single calendar click isn't
  // worth the complexity it would add.
  const visibleSchedules = selectedDate
    ? schedules.filter(
        (s) => s.scheduled_date.slice(0, 10) === format(selectedDate, "yyyy-MM-dd")
      )
    : schedules;

  function openCreateForm() {
    setEditingSchedule(undefined);
    setFormOpen(true);
  }

  function openEditForm(schedule: Schedule) {
    setEditingSchedule(schedule);
    setFormOpen(true);
  }

  function openDeleteConfirm(schedule: Schedule) {
    setDeleteTarget(schedule);
    setDeleteConfirmOpen(true);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteSchedule.mutate(deleteTarget.id, {
      onSuccess: () => toast({ title: "Schedule deleted" }),
      onError: (err) => {
        toast({
          title: "Couldn't delete schedule",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  // Restore's 409 ("Schedule is not deleted") is a business-rule conflict,
  // not a stale-write conflict — surfaced as a plain error toast, never
  // routed through useConflictResolution/ConflictState. Schedule is a leaf
  // entity (no table references schedule_id as a foreign key — verified
  // against every migration), so restoring one has no cascade and no
  // data-loss risk: a direct action, matching Clients'/People's/Resources'
  // restore convention, not a ConfirmDialog.
  function handleRestore(schedule: Schedule) {
    restoreSchedule.mutate(schedule.id, {
      onSuccess: () => toast({ title: "Schedule restored" }),
      onError: (err) => {
        toast({
          title: "Couldn't restore schedule",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule"
        actions={
          <RequireRole roles={["admin", "member"]}>
            <Button onClick={openCreateForm}>New schedule</Button>
          </RequireRole>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <ScheduleCalendar
          schedules={schedules}
          selected={selectedDate}
          onSelect={setSelectedDate}
        />

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40" aria-label="Schedule status">
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

            <Select value={pagination.sort} onValueChange={pagination.setSort}>
              <SelectTrigger className="w-44" aria-label="Sort by">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={pagination.order} onValueChange={(v) => pagination.setOrder(v as SortOrder)}>
              <SelectTrigger className="w-32" aria-label="Sort order">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={pagination.deleted}
              onValueChange={(v) => pagination.setDeleted(v as DeletedFilter)}
            >
              <SelectTrigger className="w-32" aria-label="Status filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Active</SelectItem>
                <SelectItem value="true">Deleted</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>

            {selectedDate && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)}>
                Clear date filter
              </Button>
            )}
          </div>

          {isLoading ? (
            <LoadingState message="Loading schedules..." />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : visibleSchedules.length === 0 ? (
            <EmptyState
              title="No schedules found"
              message={
                selectedDate
                  ? "No schedules on this date within the currently loaded page."
                  : "No schedules match the current filters."
              }
            />
          ) : (
            <>
              <ScheduleList
                schedules={visibleSchedules}
                onEdit={openEditForm}
                onDelete={openDeleteConfirm}
                onRestore={handleRestore}
              />

              <PaginationControls
                page={pagination.page}
                totalPages={totalPages}
                perPage={pagination.perPage}
                onPrevPage={pagination.prevPage}
                onNextPage={pagination.nextPage}
                onPerPageChange={pagination.setPerPage}
              />
            </>
          )}
        </div>
      </div>

      <ScheduleFormDialog open={formOpen} onOpenChange={setFormOpen} schedule={editingSchedule} />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this schedule?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" will be hidden from the active schedule list. Schedule is a leaf record — nothing else in the system references it, so nothing else is affected. You can restore it at any time.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function parseDateParam(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const parsed = parseScheduledDate(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
