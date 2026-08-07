import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Client, Paginated } from "@/types";

const KEY = "clients";

export function useClients() {
  return useQuery({
    queryKey: [KEY],
    queryFn: async () => {
      // The real API wraps list responses as { data, pagination }, not a bare array.
      const { data } = await api.get<Paginated<Client>>("/clients");
      return data.data;
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get<Client>(`/clients/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Client>) => {
      const { data } = await api.post<Client>("/clients", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    // The API PATCHes (not PUTs) and requires updated_at for its optimistic
    // lock — pass the value from the row you last fetched.
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<Pick<Client, "name" | "status" | "description">> & { updated_at: string };
    }) => {
      const { data } = await api.patch<Client>(`/clients/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<Client>(`/clients/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
