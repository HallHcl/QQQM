import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Paginated, Schedule, ScheduleStatus } from "@/types";

const KEY = "schedules";

export interface ScheduleFilters {
  projectId?: string;
  status?: string;
  from?: string;
  to?: string;
}

export function useSchedules(filters: ScheduleFilters = {}) {
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Schedule>>("/schedules", {
        params: {
          project_id: filters.projectId,
          status: filters.status,
          from: filters.from,
          to: filters.to,
        },
      });
      return data.data;
    },
  });
}

export function useSchedule(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get<Schedule>(`/schedules/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Schedule>) => {
      const { data } = await api.post<Schedule>("/schedules", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    // Only status/notes are editable via this endpoint; status transitions
    // are enforced server-side by a strict state machine, and started_at/
    // completed_at are set automatically — never send them. updated_at is
    // required for the API's optimistic lock.
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: { status?: ScheduleStatus; notes?: string; updated_at: string };
    }) => {
      const { data } = await api.patch<Schedule>(`/schedules/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<Schedule>(`/schedules/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
