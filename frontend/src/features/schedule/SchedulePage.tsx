import { useState } from "react";
import { format } from "date-fns";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
import { ApiError } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";
import {
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

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

function apiErrorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

export default function SchedulePage() {
  const pagination = usePagination({ initialSort: "scheduled_date", initialOrder: "asc" });
  const [status, setStatus] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <RequireRole roles={["admin", "member"]}>
          <Button onClick={openCreateForm}>New schedule</Button>
        </RequireRole>
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <ScheduleCalendar
          schedules={schedules}
          selected={selectedDate}
          onSelect={setSelectedDate}
        />

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
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

            <Select value={pagination.sort} onValueChange={pagination.setSort}>
              <SelectTrigger className="w-44">
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
              <SelectTrigger className="w-32">
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
              <SelectTrigger className="w-32">
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

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Rows per page</span>
                  <Select
                    value={String(pagination.perPage)}
                    onValueChange={(v) => pagination.setPerPage(Number(v))}
                  >
                    <SelectTrigger className="w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PER_PAGE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={pagination.prevPage}
                    disabled={pagination.page <= 1}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {pagination.page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={pagination.nextPage}
                    disabled={pagination.page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
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
