import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { components } from "@/api/generated/schema";
import type { PaginationParams } from "./usePagination";

const KEY = "servers";

/** Matches the `sort` values GET /servers actually accepts. */
export type ServerSort = "display_name" | "created_at" | "updated_at";

export type Server = components["schemas"]["Server"];
export type ServerDetail = components["schemas"]["ServerDetail"];

// environmentId stays a separate positional arg (not folded into params),
// mirroring useEnvironments(projectId, params) — InfrastructurePage and
// EnvironmentDetailPage call this today as useServers(environmentId) and
// that call shape must keep compiling and behaving the same.
export function useServers(environmentId?: string, params: Partial<PaginationParams> = {}) {
  const query = useQuery({
    queryKey: [KEY, { environmentId, ...params }],
    queryFn: async () => {
      const result = await apiClient.GET("/api/servers", {
        params: {
          query: {
            environment_id: environmentId,
            page: params.page,
            per_page: params.per_page,
            sort: params.sort as ServerSort | undefined,
            order: params.order,
            search: params.search,
            // Zero/one-arg callers (InfrastructurePage, EnvironmentDetailPage)
            // don't pass `deleted` — default to the non-deleted set for them,
            // same as before.
            deleted: params.deleted ?? "false",
          },
        },
      });
      return unwrapApiResult(result);
    },
  });

  // `data` stays a flat Server[] — the same shape the old hook returned —
  // since both consumers destructure `{ data: servers = [] }`. Pagination
  // metadata is exposed as a sibling field for a future list page.
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}

export function useServer(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const result = await apiClient.GET("/api/servers/{id}", {
        params: { path: { id: id as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(id),
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      environment_id: string;
      display_name: string;
      hostname: string;
      ip_address?: string;
      service_type: "application" | "database" | "proxy" | "monitoring" | "repository" | "metrics" | "jump_host" | "other";
      access_method: "ssh" | "rdp" | "telnet" | "web" | "other";
      access_host: string;
      access_port?: number;
      access_path?: string;
      tech_stack?: string[];
      monitoring_url?: string;
      notes?: string;
    }) => {
      const result = await apiClient.POST("/api/servers", { body: input });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    // environment_id is intentionally absent from this type: servers don't
    // move between environments, and the backend rejects any PATCH body that
    // includes it. updated_at is required for the API's optimistic lock.
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        display_name?: string;
        hostname?: string;
        ip_address?: string;
        service_type?: "application" | "database" | "proxy" | "monitoring" | "repository" | "metrics" | "jump_host" | "other";
        access_method?: "ssh" | "rdp" | "telnet" | "web" | "other";
        access_host?: string;
        access_port?: number;
        access_path?: string;
        tech_stack?: string[];
        monitoring_url?: string;
        notes?: string;
        updated_at: string;
      };
    }) => {
      const result = await apiClient.PATCH("/api/servers/{id}", {
        params: { path: { id } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.DELETE("/api/servers/{id}", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRestoreServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.POST("/api/servers/{id}/restore", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
