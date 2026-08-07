import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ActivityLog, Paginated } from "@/types";

const KEY = "activityLogs";

export interface ActivityLogFilters {
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

export function useActivityLogs(filters: ActivityLogFilters = {}) {
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ActivityLog>>("/activity-logs", {
        params: {
          entity_type: filters.entityType,
          entity_id: filters.entityId,
          from: filters.from,
          to: filters.to,
        },
      });
      return data.data;
    },
  });
}
