import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { components } from "@/api/generated/schema";

const KEY = "resourceVersions";

/** Git-log-style list item as returned by GET /resources/:id/versions — no content. */
export type ResourceVersionSummary = components["schemas"]["ResourceVersionSummary"];

/** Full content for one version, returned by GET /resources/:id/versions/:versionId. */
export type ResourceVersionDetail = components["schemas"]["ResourceVersionWithAuthor"];

export interface ListResourceVersionsParams {
  page?: number;
  per_page?: number;
}

export function useResourceVersions(
  resourceId: string | undefined,
  params: ListResourceVersionsParams = {}
) {
  const query = useQuery({
    queryKey: [KEY, resourceId, params],
    queryFn: async () => {
      const result = await apiClient.GET("/api/resources/{id}/versions", {
        params: {
          path: { id: resourceId as string },
          query: { page: params.page, per_page: params.per_page },
        },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(resourceId),
  });

  // `data` stays a flat ResourceVersionSummary[] — VersionHistoryPanel.tsx
  // destructures `{ data: versions = [] }` — pagination exposed as a sibling
  // field, same pattern as useResources/useServers.
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}

// Looked up by version id (UUID), not version_number — there is no
// fetch-by-number endpoint. The list above deliberately omits content.
export function useResourceVersion(
  resourceId: string | undefined,
  versionId: string | undefined
) {
  return useQuery({
    queryKey: [KEY, resourceId, versionId],
    queryFn: async () => {
      const result = await apiClient.GET("/api/resources/{id}/versions/{versionId}", {
        params: { path: { id: resourceId as string, versionId: versionId as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(resourceId) && Boolean(versionId),
  });
}

// content_hash is deliberately absent: always computed server-side.
// resource_versions is append-only — no updated_at/conflict field exists
// because there is no update endpoint to conflict with.
export interface CreateResourceVersionInput {
  content?: string;
  external_url?: string;
  commit_message?: string;
}

export type CreateVersionResult = components["schemas"]["CreateVersionResult"];

export function useCreateResourceVersion(resourceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateResourceVersionInput): Promise<CreateVersionResult> => {
      const result = await apiClient.POST("/api/resources/{id}/versions", {
        params: { path: { id: resourceId } },
        body: input,
      });
      // `warning` (present only when the new content is byte-identical to
      // the current version) is intentionally kept in the returned shape,
      // not unwrapped away — Part 24d's build needs it to warn the user
      // before/after submit.
      return unwrapApiResult(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, resourceId] });
      queryClient.invalidateQueries({ queryKey: ["resources", resourceId] });
    },
  });
}

// No update or delete hooks for versions: resource_versions has no such
// endpoints on the backend — it is structurally append-only.

// useUploadResourceVersion was removed: POST /resources/:id/upload no
// longer exists on the backend (the file-upload flow was dropped when the
// Resources module was rebuilt — see backend Part 14 notes). Re-add once a
// real upload endpoint exists; there were no callers of this hook at
// removal time.
