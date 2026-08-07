import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Paginated, Person } from "@/types";

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
      const { data } = await api.get<Paginated<Person>>("/people", {
        params: {
          type: filters.type,
          client_id: filters.clientId,
          search: filters.search,
        },
      });
      return data.data;
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
    // updated_at is required for the API's optimistic lock.
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: Partial<Pick<Person, "name" | "email" | "phone" | "type" | "notes">> & {
        updated_at: string;
      };
    }) => {
      const { data } = await api.patch<Person>(`/people/${id}`, input);
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

/** Linked-client summary as actually returned by GET /people/:id/clients — not the raw people_clients junction row. */
export interface PersonLinkedClient {
  id: string;
  name: string;
  relationship_type: string | null;
}

export function usePersonClients(personId: string | undefined) {
  return useQuery({
    queryKey: [KEY, personId, "clients"],
    queryFn: async () => {
      // Not paginated — this sub-resource returns a bare array.
      const { data } = await api.get<PersonLinkedClient[]>(`/people/${personId}/clients`);
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
      const { data } = await api.post<PersonLinkedClient>(`/people/${personId}/clients`, {
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
      const { data } = await api.delete<{ message: string }>(
        `/people/${personId}/clients/${clientId}`
      );
      return data;
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [KEY, variables.personId, "clients"] }),
  });
}
