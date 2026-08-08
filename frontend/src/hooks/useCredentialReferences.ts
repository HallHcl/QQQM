import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { components } from "@/api/generated/schema";

const KEY = "credentialReferences";

export type CredentialReference = components["schemas"]["CredentialReference"];

// GET /servers/{serverId}/credential-references takes no query params at all
// (its `parameters.query` is `never` in the generated schema) — it returns a
// plain CredentialReference[], not a {data, pagination} envelope like the
// top-level list endpoints. This is a small junction-style resource nested
// under a server, and does not support page/per_page/sort/order/search/
// deleted the way Servers/Environments/Projects do. No params argument here
// on purpose — there is nothing for it to forward.
export function useCredentialReferences(serverId?: string) {
  return useQuery({
    queryKey: [KEY, { serverId }],
    queryFn: async () => {
      const result = await apiClient.GET("/api/servers/{serverId}/credential-references", {
        params: { path: { serverId: serverId as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(serverId),
  });
}

export function useCreateCredentialReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serverId,
      data,
    }: {
      serverId: string;
      data: {
        label: string;
        reference_location: string;
        applies_to_access_method?: "ssh" | "rdp" | "telnet" | "web" | "other";
        notes?: string;
      };
    }) => {
      const result = await apiClient.POST("/api/servers/{serverId}/credential-references", {
        params: { path: { serverId } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateCredentialReference() {
  const queryClient = useQueryClient();
  return useMutation({
    // No optimistic lock on this resource — credential_references has no
    // updated_at column at all, and the generated update schema has no
    // updated_at field in its request body (unlike every other entity's
    // update payload). Do not add one here.
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        label?: string;
        reference_location?: string;
        applies_to_access_method?: "ssh" | "rdp" | "telnet" | "web" | "other";
        notes?: string;
      };
    }) => {
      const result = await apiClient.PATCH("/api/credential-references/{id}", {
        params: { path: { id } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// Hard delete — credential_references has no soft delete / restore. There is
// no useRestoreCredentialReference; that endpoint does not exist.
export function useDeleteCredentialReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.DELETE("/api/credential-references/{id}", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
