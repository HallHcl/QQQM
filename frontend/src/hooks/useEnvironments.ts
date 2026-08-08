import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { components } from "@/api/generated/schema";
import type { PaginationParams } from "./usePagination";

const KEY = "environments";

/** Matches the `sort` values GET /environments actually accepts. */
export type EnvironmentSort = "name" | "created_at" | "updated_at";

export type Environment = components["schemas"]["Environment"];
export type EnvironmentDetail = components["schemas"]["EnvironmentDetail"];

// projectId stays a separate positional arg (not folded into params), mirroring
// useProjects(clientId, params) — InfrastructurePage calls this today as
// useEnvironments(projectId) and that call shape must keep compiling and
// behaving the same.
export function useEnvironments(projectId?: string, params: Partial<PaginationParams> = {}) {
  const query = useQuery({
    queryKey: [KEY, { projectId, ...params }],
    queryFn: async () => {
      const result = await apiClient.GET("/api/environments", {
        params: {
          query: {
            project_id: projectId,
            page: params.page,
            per_page: params.per_page,
            sort: params.sort as EnvironmentSort | undefined,
            order: params.order,
            search: params.search,
            // Zero/one-arg callers (InfrastructurePage) don't pass `deleted` —
            // default to the non-deleted set for them, same as before.
            deleted: params.deleted ?? "false",
          },
        },
      });
      return unwrapApiResult(result);
    },
  });

  // `data` stays a flat Environment[] — the same shape the old hook returned —
  // since InfrastructurePage destructures `{ data: environments = [] }`.
  // Pagination metadata is exposed as a sibling field for a future list page.
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}

export function useEnvironment(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const result = await apiClient.GET("/api/environments/{id}", {
        params: { path: { id: id as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(id),
  });
}

export function useCreateEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    // vpn_resource_id cannot be set at creation — the backend doesn't accept
    // it in this payload at all (set it via update once the environment
    // exists).
    mutationFn: async (input: { project_id: string; name: string; description?: string }) => {
      const result = await apiClient.POST("/api/environments", { body: input });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    // project_id is intentionally absent from this type: environments don't
    // move between projects, and the backend rejects any PATCH body that
    // includes it. updated_at is required for the API's optimistic lock.
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        vpn_resource_id?: string | null;
        updated_at: string;
      };
    }) => {
      const result = await apiClient.PATCH("/api/environments/{id}", {
        params: { path: { id } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.DELETE("/api/environments/{id}", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRestoreEnvironment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.POST("/api/environments/{id}/restore", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
