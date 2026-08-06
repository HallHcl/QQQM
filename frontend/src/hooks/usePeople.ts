import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { PeopleClient, Person } from "@/types";

const KEY = "people";

export interface PeopleFilters {
  type?: string;
  clientId?: string;
  search?: string;
}

export function usePeople(filters: PeopleFilters = {}) {
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: async () => {
      const { data } = await api.get<Person[]>("/people", {
        params: {
          type: filters.type,
          client_id: filters.clientId,
          search: filters.search,
        },
      });
      return data;
    },
  });
}

export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get<Person>(`/people/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Person>) => {
      const { data } = await api.post<Person>("/people", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data: input }: { id: string; data: Partial<Person> }) => {
      const { data } = await api.put<Person>(`/people/${id}`, input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<Person>(`/people/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePersonClients(personId: string | undefined) {
  return useQuery({
    queryKey: [KEY, personId, "clients"],
    queryFn: async () => {
      const { data } = await api.get<PeopleClient[]>(`/people/${personId}/clients`);
      return data;
    },
    enabled: Boolean(personId),
  });
}

export function useAddPersonClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      personId,
      clientId,
      relationshipType,
    }: {
      personId: string;
      clientId: string;
      relationshipType?: string;
    }) => {
      const { data } = await api.post<PeopleClient>(`/people/${personId}/clients`, {
        client_id: clientId,
        relationship_type: relationshipType,
      });
      return data;
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [KEY, variables.personId, "clients"] }),
  });
}

export function useRemovePersonClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ personId, clientId }: { personId: string; clientId: string }) => {
      const { data } = await api.delete<PeopleClient>(
        `/people/${personId}/clients/${clientId}`
      );
      return data;
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [KEY, variables.personId, "clients"] }),
  });
}
