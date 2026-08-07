import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Environment, Paginated } from "@/types";

const KEY = "environments";

export function useEnvironments(projectId?: string) {
  return useQuery({
    queryKey: [KEY, { projectId }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Environment>>("/environments", {
        params: projectId ? { project_id: projectId } : undefined,
      });
      return data.data;
    },
    enabled: Boolean(projectId),
  });
}

export function useCreateEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Environment>) => {
      const { data } = await api.post<Environment>("/environments", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    // project_id is not re-parentable via this endpoint; updated_at is
    // required for the API's optimistic lock.
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<Pick<Environment, "name" | "description" | "vpn_resource_id">> & {
        updated_at: string;
      };
    }) => {
      const { data } = await api.patch<Environment>(`/environments/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<Environment>(`/environments/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
