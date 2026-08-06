import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Schedule } from "@/types";

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
      const { data } = await api.get<Schedule[]>("/schedules", {
        params: {
          project_id: filters.projectId,
          status: filters.status,
          from: filters.from,
          to: filters.to,
        },
      });
      return data;
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
    mutationFn: async ({ id, data: input }: { id: string; data: Partial<Schedule> }) => {
      const { data } = await api.put<Schedule>(`/schedules/${id}`, input);
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
