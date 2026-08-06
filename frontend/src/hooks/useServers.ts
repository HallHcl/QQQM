import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Server } from "@/types";

const KEY = "servers";

export function useServers(environmentId?: string) {
  return useQuery({
    queryKey: [KEY, { environmentId }],
    queryFn: async () => {
      const { data } = await api.get<Server[]>("/servers", {
        params: environmentId ? { environment_id: environmentId } : undefined,
      });
      return data;
    },
    enabled: Boolean(environmentId),
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Server>) => {
      const { data } = await api.post<Server>("/servers", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data: input }: { id: string; data: Partial<Server> }) => {
      const { data } = await api.put<Server>(`/servers/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<Server>(`/servers/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
