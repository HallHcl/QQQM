import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Paginated, Server } from "@/types";

const KEY = "servers";

export function useServers(environmentId?: string) {
  return useQuery({
    queryKey: [KEY, { environmentId }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Server>>("/servers", {
        params: environmentId ? { environment_id: environmentId } : undefined,
      });
      return data.data;
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
    // environment_id is not re-parentable via this endpoint; updated_at is
    // required for the API's optimistic lock.
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<Omit<Server, "id" | "environment_id" | "created_at" | "updated_at" | "deleted_at">> & {
        updated_at: string;
      };
    }) => {
      const { data } = await api.patch<Server>(`/servers/${id}`, input);
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
