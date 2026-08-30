import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { PaginationParams } from "./usePagination";

const KEY = "projects";

/** Matches the `sort` values GET /projects actually accepts. */
export type ProjectSort = "name" | "created_at" | "updated_at";

// clientId stays a separate positional arg (not folded into params) because
// OverviewPage, InfrastructurePage, ResourceEditor, ResourceFilterBar, and
// ScheduleFormSheet all call this today as either useProjects(clientId) or
// useProjects() — that call shape must keep compiling and behaving the same
// (no pagination params sent) since those five files are out of scope here.
export function useProjects(clientId?: string, params: Partial<PaginationParams> = {}) {
  const query = useQuery({
    queryKey: [KEY, { clientId, ...params }],
    queryFn: async () => {
      const result = await apiClient.GET("/api/projects", {
        params: {
          query: {
            client_id: clientId,
            page: params.page,
            per_page: params.per_page,
            sort: params.sort as ProjectSort | undefined,
            order: params.order,
            search: params.search,
            // Existing zero/one-arg callers don't pass `deleted` — default
            // to the non-deleted set for them, same as before.
            deleted: params.deleted ?? "false",
          },
        },
      });
      return unwrapApiResult(result);
    },
  });

  // `data` stays a flat Project[] — the same shape the old hook returned —
  // since the five out-of-scope pickers all destructure `{ data: projects = [] }`.
  // Pagination metadata is exposed as a sibling field for the new list page.
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}

export function useProject(id: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const result = await apiClient.GET("/api/projects/{id}", {
        params: { path: { id: id as string } },
      });
      return unwrapApiResult(result);
    },
    // Callers that only need this while some other condition holds (e.g. a
    // dialog is open) can pass `enabled: false` to also unsubscribe there —
    // ANDed with the id check so it's never enabled without a real id.
    enabled: Boolean(id) && (options.enabled ?? true),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      client_id: string;
      name: string;
      description?: string;
      owner_status?: string;
    }) => {
      const result = await apiClient.POST("/api/projects", { body: input });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    // The API PATCHes (not PUTs), rejects client_id entirely (a project
    // can't be re-parented via this endpoint), and requires updated_at for
    // its optimistic lock — pass the value from the row you last fetched.
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; description?: string; owner_status?: string; updated_at: string };
    }) => {
      const result = await apiClient.PATCH("/api/projects/{id}", {
        params: { path: { id } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.DELETE("/api/projects/{id}", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRestoreProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.POST("/api/projects/{id}/restore", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
