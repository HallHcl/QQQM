import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { components } from "@/api/generated/schema";
import type { DeletedFilter, SortOrder } from "./usePagination";

const KEY = "people";

export type Person = components["schemas"]["Person"];
export type PersonDetail = components["schemas"]["PersonDetail"];
export type PeopleType = components["schemas"]["PeopleType"];

/** Matches the `sort` values GET /people actually accepts (people.controller.ts's SORTABLE_COLUMNS). */
export type PeopleSort = "name" | "created_at" | "updated_at";

// No client_id/clientId filter here. The pre-migration hook sent one
// (PeopleFilters.clientId -> `client_id` query param), but the backend never
// supported it: parseListQuery() in people.controller.ts only reads
// page/per_page/sort/order/search/type/deleted, and the generated
// `listPeople` operation has no client_id query param either. No call site
// ever exercised it. Deliberately not carried forward or wired up.
export interface PeopleFilters {
  type?: string;
  search?: string;
  page?: number;
  per_page?: number;
  sort?: PeopleSort;
  order?: SortOrder;
  deleted?: DeletedFilter;
}

export function usePeople(filters: PeopleFilters = {}) {
  const query = useQuery({
    queryKey: [KEY, filters],
    queryFn: async () => {
      const result = await apiClient.GET("/api/people", {
        params: {
          query: {
            page: filters.page,
            per_page: filters.per_page,
            sort: filters.sort,
            order: filters.order,
            search: filters.search,
            type: filters.type,
            // Zero/one-field callers (ScheduleFormDialog's usePeople(), and
            // PeoplePage before the deleted-view toggle existed) don't pass
            // `deleted` — default to the non-deleted set for them, same as
            // every other migrated list hook.
            deleted: filters.deleted ?? "false",
          },
        },
      });
      return unwrapApiResult(result);
    },
  });

  // `data` stays a flat Person[] — the same shape the old hook returned —
  // since ScheduleFormDialog and PeoplePage both destructure
  // `{ data: people = [] }`. Pagination metadata is exposed as a sibling
  // field for the newly-wired paginated list view.
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}

/** Full PersonDetail shape (adds `clients[]` and `account`) — no consumer yet, built for future use. */
export function usePerson(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const result = await apiClient.GET("/api/people/{id}", {
        params: { path: { id: id as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(id),
  });
}

export interface CreatePersonInput {
  name: string;
  email?: string;
  phone?: string;
  type: PeopleType;
  notes?: string;
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePersonInput) => {
      const result = await apiClient.POST("/api/people", { body: input });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export interface UpdatePersonInput {
  name?: string;
  email?: string;
  phone?: string;
  type?: PeopleType;
  notes?: string;
  /** Required for the API's optimistic lock. */
  updated_at: string;
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePersonInput }) => {
      const result = await apiClient.PATCH("/api/people/{id}", {
        params: { path: { id } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.DELETE("/api/people/{id}", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

// A 409 here would mean "person is not currently deleted" — a business-rule
// check, not optimistic locking (there's no updated_at input to this
// mutation at all). Do not route this through useConflictResolution; that
// hook is for stale-write conflicts on PATCH, which this isn't.
export function useRestorePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.POST("/api/people/{id}/restore", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
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
      const result = await apiClient.GET("/api/people/{id}/clients", {
        params: { path: { id: personId as string } },
      });
      return unwrapApiResult(result);
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
      const result = await apiClient.POST("/api/people/{id}/clients", {
        params: { path: { id: personId } },
        body: { client_id: clientId, relationship_type: relationshipType },
      });
      return unwrapApiResult(result);
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [KEY, variables.personId, "clients"] }),
  });
}

export function useRemovePersonClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ personId, clientId }: { personId: string; clientId: string }) => {
      const result = await apiClient.DELETE("/api/people/{id}/clients/{clientId}", {
        params: { path: { id: personId, clientId } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: [KEY, variables.personId, "clients"] }),
  });
}
