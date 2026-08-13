import { useQuery } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { EntityType, ActivityAction } from "@/types";
import type { SortOrder } from "./usePagination";

const KEY = "activityLogs";

// GET /activity-logs's `sort` query param is documented in the OpenAPI spec
// but is dead at the controller layer: activityLogs.controller.ts's
// parseListQuery never reads req.query.sort, and activityLogs.service.ts
// always `ORDER BY al.created_at` regardless. Do not expose or send it —
// `order` (asc/desc) is the only sort control that has any effect.
export interface ActivityLogFilters {
  page?: number;
  perPage?: number;
  order?: SortOrder;
  entityType?: EntityType;
  entityId?: string;
  action?: ActivityAction;
  /** Filters by people.id — the actor, never a users.id. */
  changedBy?: string;
  from?: string;
  to?: string;
}

export function useActivityLogs(filters: ActivityLogFilters = {}) {
  const query = useQuery({
    queryKey: [KEY, filters],
    queryFn: async () => {
      const result = await apiClient.GET("/api/activity-logs", {
        params: {
          query: {
            page: filters.page,
            per_page: filters.perPage,
            order: filters.order,
            entity_type: filters.entityType,
            entity_id: filters.entityId,
            action: filters.action,
            changed_by: filters.changedBy,
            from: filters.from,
            to: filters.to,
          },
        },
      });
      return unwrapApiResult(result);
    },
  });

  // `data` stays a flat ActivityLog[] (each item includes the server-joined
  // `changed_by_person`) — same flat shape the old hook returned, since both
  // ActivityPage and OverviewPage destructure `{ data: ... = [] }`.
  // Pagination metadata is exposed as a sibling field, same pattern as
  // useSchedules/useResources, so callers can wire up page controls.
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}
