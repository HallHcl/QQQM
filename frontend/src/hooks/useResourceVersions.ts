import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ResourceVersion } from "@/types";

const KEY = "resourceVersions";

export function useResourceVersions(resourceId: string | undefined) {
  return useQuery({
    queryKey: [KEY, resourceId],
    queryFn: async () => {
      const { data } = await api.get<ResourceVersion[]>(
        `/resources/${resourceId}/versions`
      );
      return data;
    },
    enabled: Boolean(resourceId),
  });
}

export function useResourceVersion(
  resourceId: string | undefined,
  versionId: string | undefined
) {
  return useQuery({
    queryKey: [KEY, resourceId, versionId],
    queryFn: async () => {
      const { data } = await api.get<ResourceVersion>(
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
      const { data } = await api.post<ResourceVersion>(
        `/resources/${resourceId}/versions`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, resourceId] });
      queryClient.invalidateQueries({ queryKey: ["resources", resourceId] });
    },
  });
}

export function useUploadResourceVersion(resourceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, commitMessage }: { file: File; commitMessage?: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (commitMessage) formData.append("commit_message", commitMessage);

      const { data } = await api.post<ResourceVersion>(
        `/resources/${resourceId}/upload`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, resourceId] });
      queryClient.invalidateQueries({ queryKey: ["resources", resourceId] });
    },
  });
}
