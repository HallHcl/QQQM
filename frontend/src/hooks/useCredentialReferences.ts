import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { CredentialReference } from "@/types";

const KEY = "credentialReferences";

export function useCredentialReferences(serverId?: string) {
  return useQuery({
    queryKey: [KEY, { serverId }],
    queryFn: async () => {
      // Nested under the server, not a top-level list — there is no bare
      // GET /credential-references on the real API. Not paginated.
      const { data } = await api.get<CredentialReference[]>(
        `/servers/${serverId}/credential-references`
      );
      return data;
    },
    enabled: Boolean(serverId),
  });
}

export function useCreateCredentialReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serverId,
      data: input,
    }: {
      serverId: string;
      data: Partial<Omit<CredentialReference, "id" | "server_id" | "created_at">>;
    }) => {
      const { data } = await api.post<CredentialReference>(
        `/servers/${serverId}/credential-references`,
        input
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateCredentialReference() {
  const queryClient = useQueryClient();
  return useMutation({
    // No optimistic lock on this resource (no updated_at field at all).
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<Omit<CredentialReference, "id" | "server_id" | "created_at">>;
    }) => {
      const { data } = await api.patch<CredentialReference>(
        `/credential-references/${id}`,
        input
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteCredentialReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<CredentialReference>(`/credential-references/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
