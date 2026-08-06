import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Environment } from "@/types";

const KEY = "environments";

export function useEnvironments(projectId?: string) {
  return useQuery({
    queryKey: [KEY, { projectId }],
    queryFn: async () => {
      const { data } = await api.get<Environment[]>("/environments", {
        params: projectId ? { project_id: projectId } : undefined,
      });
      return data;
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
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<Environment>;
    }) => {
      const { data } = await api.put<Environment>(`/environments/${id}`, input);
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
