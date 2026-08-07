import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Paginated, Project } from "@/types";

const KEY = "projects";

export function useProjects(clientId?: string) {
  return useQuery({
    queryKey: [KEY, { clientId }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Project>>("/projects", {
        params: clientId ? { client_id: clientId } : undefined,
      });
      return data.data;
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get<Project>(`/projects/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Project>) => {
      const { data } = await api.post<Project>("/projects", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    // client_id is not re-parentable via this endpoint; updated_at is
    // required for the API's optimistic lock.
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<Pick<Project, "name" | "description" | "owner_status">> & {
        updated_at: string;
      };
    }) => {
      const { data } = await api.patch<Project>(`/projects/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<Project>(`/projects/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
