import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { components } from "@/api/generated/schema";
import type { DeletedFilter, SortOrder } from "./usePagination";

const KEY = "schedules";

export type Schedule = components["schemas"]["Schedule"];
export type ScheduleListItem = components["schemas"]["ScheduleListItem"];
export type ScheduleDetail = components["schemas"]["ScheduleDetail"];
export type ScheduleType = components["schemas"]["ScheduleType"];
export type ScheduleStatus = components["schemas"]["ScheduleStatus"];

/** Matches the `sort` values GET /schedules actually accepts. */
export type ScheduleSort = "scheduled_date" | "created_at" | "updated_at";

// GET /schedules only supports page/per_page/sort/order/deleted/project_id/
// status/from/to (schedules.controller.ts's parseListQuery) — there is no
// search, type, server_id, or assigned_to filter param server-side, despite
// those existing as filters on other modules. Don't invent them here.
export interface ScheduleFilters {
  projectId?: string;
  status?: ScheduleStatus | string;
  /** Lower bound on scheduled_date. */
  from?: string;
  /** Upper bound on scheduled_date. */
  to?: string;
  page?: number;
  per_page?: number;
  sort?: ScheduleSort;
  order?: SortOrder;
  deleted?: DeletedFilter;
}

export function useSchedules(filters: ScheduleFilters = {}) {
  const query = useQuery({
    queryKey: [KEY, filters],
    queryFn: async () => {
      const result = await apiClient.GET("/api/schedules", {
        params: {
          query: {
            page: filters.page,
            per_page: filters.per_page,
            sort: filters.sort,
            order: filters.order,
            project_id: filters.projectId,
            status: filters.status,
            from: filters.from,
            to: filters.to,
            // Zero/partial-arg callers (SchedulePage today only ever passes
            // `status`) don't pass `deleted` — default to the non-deleted
            // set for them, same as every other migrated list hook.
            deleted: filters.deleted ?? "false",
          },
        },
      });
      return unwrapApiResult(result);
    },
  });

  // `data` stays a flat ScheduleListItem[] (each item includes the
  // server-computed `is_overdue` field — never recompute it client-side) —
  // the same flat shape the old hook returned, since SchedulePage
  // destructures `{ data: schedules = [] }`. Pagination metadata is exposed
  // as a sibling field for a future paginated list view (not wired into
  // SchedulePage in this ticket).
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}

export function useSchedule(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const result = await apiClient.GET("/api/schedules/{id}", {
        params: { path: { id: id as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(id),
  });
}

// project_id/server_id are both optional at the type level — the CHECK
// constraint (project_id IS NOT NULL OR server_id IS NOT NULL) is an OR, not
// XOR, and both may legally be set at once — but the service still requires
// at least one, enforced server-side (createSchedule's manual check, since
// the DB constraint alone would surface as an opaque 500). status is
// deliberately absent here: schedules always create as 'pending' server-side
// and createScheduleSchema has no status key to send one through.
export interface CreateScheduleInput {
  project_id?: string;
  server_id?: string;
  title: string;
  type: ScheduleType;
  scheduled_date: string;
  assigned_to: string;
  notes?: string;
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateScheduleInput) => {
      const result = await apiClient.POST("/api/schedules", { body: input });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// Exactly these three fields are possible — not a scope choice, a hard
// backend constraint: updateScheduleSchema has no title/type/scheduled_date/
// assigned_to/project_id/server_id key at all, and the controller
// pre-rejects started_at/completed_at as own-properties on the request body
// before validation even runs. A status transition is not a distinct
// request shape — it's the same PATCH, validated against the same
// canTransition() state machine, gated by the same updated_at optimistic
// lock as a notes-only edit (no exemption for status-changing writes).
export interface UpdateScheduleInput {
  status?: ScheduleStatus;
  notes?: string;
  /** Required for the API's optimistic lock — every PATCH needs this, transition or not. */
  updated_at: string;
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateScheduleInput }) => {
      const result = await apiClient.PATCH("/api/schedules/{id}", {
        params: { path: { id } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.DELETE("/api/schedules/{id}", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// A 409 here means "schedule is not currently deleted" — a business-rule
// check, not optimistic locking (there's no updated_at input to this
// mutation at all). Do not route this through useConflictResolution; that
// hook is for stale-write conflicts on PATCH, which this isn't.
export function useRestoreSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.POST("/api/schedules/{id}/restore", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
