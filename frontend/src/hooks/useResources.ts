import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Paginated, Resource } from "@/types";

const KEY = "resources";

export interface ResourceFilters {
  projectId?: string;
  type?: string;
  search?: string;
}

export function useResources(filters: ResourceFilters = {}) {
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Resource>>("/resources", {
        params: {
          project_id: filters.projectId,
          type: filters.type,
          search: filters.search,
        },
      });
      return data.data;
    },
  });
}

export function useResource(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get<Resource>(`/resources/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export interface CreateResourceInput {
  project_id?: string;
  type: string;
  title: string;
  category?: string;
  tags?: unknown[];
  content?: string;
  external_url?: string;
  commit_message?: string;
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateResourceInput) => {
      const { data } = await api.post<Resource>("/resources", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    // Metadata only (title/category/tags) — content changes go through
    // useCreateResourceVersion instead. updated_at is required for the
    // API's optimistic lock.
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<Pick<Resource, "title" | "category" | "tags">> & { updated_at: string };
    }) => {
      const { data } = await api.patch<Resource>(`/resources/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<Resource>(`/resources/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
