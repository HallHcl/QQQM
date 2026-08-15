import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { DeletedFilter, PaginationParams } from "./usePagination";

const KEY = "clients";

/** Matches the `sort` values GET /clients actually accepts. */
export type ClientSort = "name" | "status" | "created_at" | "updated_at";

/**
 * Clients' `deleted` list filter is boolean-only server-side
 * (clients.controller.ts:35 only recognizes "true"; anything else, including
 * "all", is treated as "false") — unlike every other soft-deletable module,
 * which supports the standard three-state filter. Narrowed here so it's
 * impossible to send "all" for Clients, regardless of caller.
 */
export type ClientsListParams = Omit<Partial<PaginationParams>, "deleted"> & {
  deleted?: Exclude<DeletedFilter, "all">;
};

// Partial, not the full PaginationParams shape: OverviewPage, InfrastructurePage,
// and PersonDetailDialog still call this with no arguments at all (out of scope
// for this ticket) to get an unfiltered client list for their pickers — that
// call pattern must keep compiling and behaving the same (no query params sent).
export function useClients(params: ClientsListParams = {}) {
  const query = useQuery({
    queryKey: [KEY, params],
    queryFn: async () => {
      const result = await apiClient.GET("/api/clients", {
        params: {
          query: {
            page: params.page,
            per_page: params.per_page,
            sort: params.sort as ClientSort | undefined,
            order: params.order,
            search: params.search,
            // Zero-arg callers (OverviewPage, InfrastructurePage,
            // PersonDetailDialog pickers) don't pass `deleted` at all —
            // default to the non-deleted set for them, same as before.
            // Runtime guard (not just the ClientsListParams type) so "all"
            // can never reach the backend even if a caller bypasses the type
            // (e.g. a plain-JS call site or an `as` cast).
            deleted: params.deleted === "true" ? "true" : "false",
          },
        },
      });
      return unwrapApiResult(result);
    },
  });

  // `data` stays a flat Client[] — the same shape the old hook returned —
  // since OverviewPage, InfrastructurePage, and PersonDetailDialog all
  // destructure `{ data: clients = [] }` and are out of scope to touch here.
  // Pagination metadata is exposed as a sibling field for the new list page.
  return { ...query, data: query.data?.data, pagination: query.data?.pagination };
}

export function useClient(id: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => {
      const result = await apiClient.GET("/api/clients/{id}", {
        params: { path: { id: id as string } },
      });
      return unwrapApiResult(result);
    },
    // Callers that only need this while some other condition holds (e.g. a
    // dialog is open) can pass `enabled: false` to also unsubscribe there —
    // ANDed with the id check so it's never enabled without a real id.
    enabled: Boolean(id) && (options.enabled ?? true),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; status?: string; description?: string }) => {
      const result = await apiClient.POST("/api/clients", { body: input });
      return unwrapApiResult(result);
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
      data,
    }: {
      id: string;
      data: { name?: string; status?: string; description?: string; updated_at: string };
    }) => {
      const result = await apiClient.PATCH("/api/clients/{id}", {
        params: { path: { id } },
        body: data,
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.DELETE("/api/clients/{id}", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRestoreClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await apiClient.POST("/api/clients/{id}/restore", {
        params: { path: { id } },
      });
      return unwrapApiResult(result);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

/**
 * People linked to a client (reverse of the Person -> Clients direction
 * `usePersonClients` in usePeople.ts already covers). Used to scope who can
 * be newly assigned to one of the client's projects — per the project
 * roster feature, only people already linked to the project's client are
 * assignable, mirroring the real Project -> Client -> people_clients ->
 * People relationship chain.
 */
export function useClientPeople(clientId: string | undefined) {
  return useQuery({
    queryKey: [KEY, clientId, "people"],
    queryFn: async () => {
      const result = await apiClient.GET("/api/clients/{id}/people", {
        params: { path: { id: clientId as string } },
      });
      return unwrapApiResult(result);
    },
    enabled: Boolean(clientId),
  });
}
