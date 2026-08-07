import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Paginated, ResourceVersion } from "@/types";

const KEY = "resourceVersions";

interface VersionAuthor {
  id: string;
  name: string;
}

/** Git-log-style list item as actually returned by GET /resources/:id/versions — no content. */
export interface ResourceVersionSummary {
  id: string;
  version_number: number;
  commit_message: string | null;
  created_at: string;
  author: VersionAuthor;
}

export function useResourceVersions(resourceId: string | undefined) {
  return useQuery({
    queryKey: [KEY, resourceId],
    queryFn: async () => {
      const { data } = await api.get<Paginated<ResourceVersionSummary>>(
        `/resources/${resourceId}/versions`
      );
      return data.data;
    },
    enabled: Boolean(resourceId),
  });
}

export type ResourceVersionDetail = ResourceVersion & { author: VersionAuthor };

/** Full content for one version — the list above deliberately omits it. */
export function useResourceVersion(
  resourceId: string | undefined,
  versionId: string | undefined
) {
  return useQuery({
    queryKey: [KEY, resourceId, versionId],
    queryFn: async () => {
      const { data } = await api.get<ResourceVersionDetail>(
        `/resources/${resourceId}/versions/${versionId}`
      );
      return data;
    },
    enabled: Boolean(resourceId) && Boolean(versionId),
  });
}

export interface CreateResourceVersionInput {
  content?: string;
  external_url?: string;
  commit_message?: string;
}

export function useCreateResourceVersion(resourceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateResourceVersionInput) => {
      // The API wraps this as { version, warning? } (warning fires when the
      // new content is byte-identical to the current version) — unwrapped
      // here since nothing currently surfaces the warning in the UI.
      const { data } = await api.post<{ version: ResourceVersion; warning?: string }>(
        `/resources/${resourceId}/versions`,
        input
      );
      return data.version;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, resourceId] });
      queryClient.invalidateQueries({ queryKey: ["resources", resourceId] });
    },
  });
}

// useUploadResourceVersion was removed: POST /resources/:id/upload no longer
// exists on the backend (the file-upload flow was dropped when the Resources
// module was rebuilt — see backend Part 14 notes). Re-add once a real
// upload endpoint exists; there were no callers of this hook at removal time.
