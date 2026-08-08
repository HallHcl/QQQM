import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { components } from "@/api/generated/schema";
import type { DeletedFilter, SortOrder } from "./usePagination";

const KEY = "resources";

export type Resource = components["schemas"]["Resource"];
export type ResourceListItem = components["schemas"]["ResourceListItem"];
export type ResourceDetail = components["schemas"]["ResourceDetail"];
export type ResourceType = components["schemas"]["ResourceType"];

/** Matches the `sort` values GET /resources actually accepts. */
export type ResourceSort = "title" | "created_at" | "updated_at";

// Field names (projectId, not project_id) and shape match the pre-migration
// hook exactly — ResourceFilterBar.tsx and ResourcesPage.tsx both pass this
// object straight through, and VpnResourcePicker.tsx (a cross-feature
// consumer in the Environments feature) calls useResources({ search }) with
// this same shape. Pagination fields are new and optional, so none of those
// call sites need to change.
export interface ResourceFilters {
  projectId?: string;
  type?: string;
  search?: string;
  page?: number;
  per_page?: number;
  sort?: ResourceSort;
  order?: SortOrder;
  deleted?: DeletedFilter;
}

export function useResources(filters: ResourceFilters = {}) {
  const query = useQuery({
    queryKey: [KEY, filters],
    queryFn: async () => {
      const result = await apiClient.GET("/api/resources", {
        params: {
          query: {
            page: filters.page,
            per_page: filters.per_page,
            sort: filters.sort,
            order: filters.order,
            search: filters.search,
            project_id: filters.projectId,
            type: filters.type,
            // Zero/one-field callers (VpnResourcePicker, ResourcesPage before
            // any deleted-view toggle is built) don't pass `deleted` —
            // default to the non-deleted set for them, same as before.
            deleted: filters.deleted ?? "false",
          },
        },
      });
      return unwrapApiResult(result);
    },
  });

  // `data` stays a flat ResourceListItem[] — the same shape the old hook
  // returned — since ResourcesPage/ResourceList/VpnResourcePicker all
  // destructure `{ data: resources = [] }`. Pagination metadata is exposed
  // as a sibling field for a future paginated list view.
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}

export function useResource(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const result = await apiClient.GET("/api/resources/{id}", {
        params: { path: { id: id as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(id),
  });
}

// content_hash is deliberately absent: it's always computed server-side
// (sha256 over content/external_url) and there is no field for the client
// to submit it through. project_id/type/title/category/tags are the
// resource's metadata; content/external_url/commit_message create version 1
// atomically in the same request — POST /api/resources is a single call,
// never a two-step resource-then-version flow.
export interface CreateResourceInput {
  project_id?: string;
  type: ResourceType;
  title: string;
  category?: string;
  tags?: string[];
  content?: string;
  external_url?: string;
  commit_message?: string;
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateResourceInput) => {
      const result = await apiClient.POST("/api/resources", { body: input });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// Metadata only (title/category/tags) — content/external_url/file_path/type
// are intentionally absent from this type: the backend rejects any of them
// in this request body before validation even runs (content changes go
// through useCreateResourceVersion instead, and type is immutable after
// creation). updated_at is required for the API's optimistic lock.
export interface UpdateResourceMetadataInput {
  title?: string;
  category?: string;
  tags?: string[];
  updated_at: string;
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateResourceMetadataInput }) => {
      const result = await apiClient.PATCH("/api/resources/{id}", {
        params: { path: { id } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.DELETE("/api/resources/{id}", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// A 409 here means "resource is not currently deleted" — a business-rule
// check, not optimistic locking (there's no updated_at input to this
// mutation at all). Do not route this through useConflictResolution; that
// hook is for stale-write conflicts on PATCH, which this isn't.
export function useRestoreResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.POST("/api/resources/{id}/restore", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
