import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { CredentialReference } from "@/types";

const KEY = "credentialReferences";

export function useCredentialReferences(serverId?: string) {
  return useQuery({
    queryKey: [KEY, { serverId }],
    queryFn: async () => {
      const { data } = await api.get<CredentialReference[]>("/credential-references", {
        params: serverId ? { server_id: serverId } : undefined,
      });
      return data;
    },
    enabled: Boolean(serverId),
  });
}

export function useCreateCredentialReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CredentialReference>) => {
      const { data } = await api.post<CredentialReference>("/credential-references", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateCredentialReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<CredentialReference>;
    }) => {
      const { data } = await api.put<CredentialReference>(
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
