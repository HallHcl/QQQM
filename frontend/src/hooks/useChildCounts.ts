import { useQueries } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";

/**
 * Immediate-child counts for a page of parent rows ("N Projects" on a Client
 * row, "N Environments" on a Project row, "N Servers" on an Environment row).
 *
 * There is no batch-count endpoint (the backend is frozen), so this fans out
 * one request per visible row: `GET /api/<children>?<parent>_id=X&per_page=1`,
 * reading `pagination.total` and discarding the single row of data that comes
 * back with it. The fan-out is bounded by the page size, and `perPageOptions`
 * on the three consuming pages is capped at 50 (rather than the shared
 * default's 100) specifically to bound it.
 *
 * This is the codebase's first use of `useQueries`. Two things about it that
 * differ from the `useQuery` hooks next door and that any future adopter needs
 * to know:
 *
 *  - `queries` is rebuilt on every render, so `queryFn` must not close over
 *    anything render-unstable; here each closure captures only `parentId` and
 *    the module-level descriptor.
 *  - Results come back positionally, in the same order as the input array. The
 *    returned Map re-keys them by parent id so callers never index by position
 *    (which would silently mis-attribute counts if the row order changed).
 *
 * Counts deliberately use the global 30s `staleTime` with no per-query
 * override: a longer window would keep showing a stale count after a child was
 * created or deleted, which is a worse failure than a redundant request.
 */

export interface ChildCount {
  /** `pagination.total` for the child list; undefined until resolved. */
  count: number | undefined;
  isLoading: boolean;
  isError: boolean;
}

interface ChildCountDescriptor {
  /** React Query key prefix — matches the child list hook's own `KEY`. */
  key: string;
  /** Child list endpoint. */
  path: "/api/projects" | "/api/environments" | "/api/servers";
  /** Query-string param that filters the child list by its parent. */
  parentParam: "client_id" | "project_id" | "environment_id";
}

/** Client row -> how many Projects belong to it. */
export const PROJECTS_PER_CLIENT: ChildCountDescriptor = {
  key: "projects",
  path: "/api/projects",
  parentParam: "client_id",
};

/** Project row -> how many Environments belong to it. */
export const ENVIRONMENTS_PER_PROJECT: ChildCountDescriptor = {
  key: "environments",
  path: "/api/environments",
  parentParam: "project_id",
};

/** Environment row -> how many Servers belong to it. */
export const SERVERS_PER_ENVIRONMENT: ChildCountDescriptor = {
  key: "servers",
  path: "/api/servers",
  parentParam: "environment_id",
};

export function useChildCounts(
  parentIds: string[],
  descriptor: ChildCountDescriptor
): Map<string, ChildCount> {
  const results = useQueries({
    queries: parentIds.map((parentId) => ({
      // Mirrors the list hooks' `[KEY, { <parentId>, ...params }]` shape
      // (useProjects.ts:17). `deleted` is part of the key because it is part
      // of the request — an active-only count and an all-records count are
      // different values and must not share a cache entry.
      queryKey: [
        descriptor.key,
        { [descriptor.parentParam]: parentId, per_page: 1, deleted: "false" },
      ],
      queryFn: async () => {
        const result = await apiClient.GET(descriptor.path, {
          params: {
            query: {
              [descriptor.parentParam]: parentId,
              per_page: 1,
              // Counts match what the list pages show by default: active
              // children only. Same literal the list hooks send.
              deleted: "false",
            },
          },
        });
        return unwrapApiResult(result);
      },
    })),
  });

  const byParentId = new Map<string, ChildCount>();
  parentIds.forEach((parentId, index) => {
    const result = results[index];
    byParentId.set(parentId, {
      count: result?.data?.pagination?.total,
      isLoading: result?.isLoading ?? true,
      isError: result?.isError ?? false,
    });
  });
  return byParentId;
}
