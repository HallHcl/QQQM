import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export type DeletedFilter = "false" | "true" | "all";
export type SortOrder = "asc" | "desc";

export interface PaginationParams {
  page: number;
  per_page: number;
  sort?: string;
  order?: SortOrder;
  search?: string;
  deleted: DeletedFilter;
}

export interface UsePaginationOptions {
  initialPage?: number;
  initialPerPage?: number;
  initialSort?: string;
  initialOrder?: SortOrder;
  initialSearch?: string;
  initialDeleted?: DeletedFilter;
}

const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 20;
const VALID_DELETED: DeletedFilter[] = ["false", "true", "all"];
const VALID_ORDER: SortOrder[] = ["asc", "desc"];

/**
 * Shared page/per_page/sort/order/search/deleted state for list endpoints,
 * synced bidirectionally with the URL query string (via react-router-dom's
 * useSearchParams) so a page refresh or a shared/bookmarked URL reproduces
 * the exact same view. Consumed directly by all 8 list pages (Clients,
 * Projects, Environments, Servers, Resources, People, Schedule, Activity).
 * Malformed/out-of-range URL values (e.g. `page=abc`, `page=9999`,
 * `deleted=bogus`) fall back to this hook's initial options rather than
 * throwing.
 *
 * Pages with their own additional filters (Activity's entity_type/action/
 * etc., Resources' type/project, People's role, Schedule's status) should
 * read/write those through `getParam`/`setParams` below rather than a
 * separate `useSearchParams()` call of their own — react-router's
 * `setSearchParams` closes over the params snapshot from the render it was
 * obtained in, so two independent calls issued in the same event handler
 * (e.g. "change a filter" + "reset the page") would race and the second
 * call would silently clobber the first. Routing every URL write for a page
 * through this single hook instance's `setParams` (one call per
 * interaction, patching multiple keys at once when needed) avoids that.
 */
export function usePagination(options: UsePaginationOptions = {}) {
  const {
    initialPage = 1,
    initialPerPage = DEFAULT_PER_PAGE,
    initialSort,
    initialOrder,
    initialSearch = "",
    initialDeleted = "false",
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();

  const page = parsePage(searchParams.get("page"), initialPage);
  const perPage = parsePerPage(searchParams.get("per_page"), initialPerPage);
  const sort = searchParams.get("sort") ?? initialSort ?? undefined;
  const order = parseOrder(searchParams.get("order"), initialOrder);
  const search = searchParams.get("search") ?? initialSearch;
  const deleted = parseDeleted(searchParams.get("deleted"), initialDeleted);

  /**
   * Generic escape hatch: read one URL param outside this hook's own
   * managed keys (page/per_page/sort/order/search/deleted).
   */
  const getParam = useCallback((key: string) => searchParams.get(key), [searchParams]);

  /**
   * Generic escape hatch: patch one or more URL params (including this
   * hook's own keys and/or a page's additional filter keys) in a single
   * atomic navigation. Keys set to `undefined`/`""` are removed from the
   * URL. `resetPage` additionally clears `page` (back to its default) in
   * the same call.
   */
  const setParams = useCallback(
    (patch: Record<string, string | undefined>, opts: { resetPage?: boolean } = {}) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === "") next.delete(key);
            else next.set(key, value);
          }
          if (opts.resetPage) next.delete("page");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setPage = useCallback(
    (value: number) => {
      const next = Math.max(1, Math.trunc(value) || 1);
      setParams({ page: next === 1 ? undefined : String(next) });
    },
    [setParams]
  );

  const setPerPage = useCallback(
    (value: number) => {
      const clamped = clampPerPage(value);
      setParams(
        { per_page: clamped === initialPerPage ? undefined : String(clamped) },
        { resetPage: true }
      );
    },
    [setParams, initialPerPage]
  );

  const setSort = useCallback(
    (value: string | undefined) => {
      setParams({ sort: value === initialSort ? undefined : value });
    },
    [setParams, initialSort]
  );

  const setOrder = useCallback(
    (value: SortOrder | undefined) => {
      setParams({ order: value === initialOrder ? undefined : value });
    },
    [setParams, initialOrder]
  );

  const setSearch = useCallback(
    (value: string) => {
      setParams({ search: value === initialSearch ? undefined : value }, { resetPage: true });
    },
    [setParams, initialSearch]
  );

  const setDeleted = useCallback(
    (value: DeletedFilter) => {
      setParams({ deleted: value === initialDeleted ? undefined : value });
    },
    [setParams, initialDeleted]
  );

  const nextPage = useCallback(() => {
    setParams({ page: String(page + 1) });
  }, [setParams, page]);

  const prevPage = useCallback(() => {
    const next = Math.max(1, page - 1);
    setParams({ page: next === 1 ? undefined : String(next) });
  }, [setParams, page]);

  const reset = useCallback(() => {
    setParams({
      page: undefined,
      per_page: undefined,
      sort: undefined,
      order: undefined,
      search: undefined,
      deleted: undefined,
    });
  }, [setParams]);

  const params: PaginationParams = {
    page,
    per_page: perPage,
    ...(sort ? { sort } : {}),
    ...(order ? { order } : {}),
    ...(search ? { search } : {}),
    deleted,
  };

  return {
    page,
    perPage,
    sort,
    order,
    search,
    deleted,
    params,
    setPage,
    setPerPage,
    setSort,
    setOrder,
    setSearch,
    setDeleted,
    nextPage,
    prevPage,
    reset,
    getParam,
    setParams,
  };
}

function clampPerPage(value: number): number {
  return Math.min(Math.max(1, Math.trunc(value)), MAX_PER_PAGE);
}

function parsePage(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

function parsePerPage(raw: string | null, fallback: number): number {
  if (raw === null) return clampPerPage(fallback);
  const n = Number(raw);
  if (!Number.isFinite(n)) return clampPerPage(fallback);
  return clampPerPage(n);
}

function parseOrder(raw: string | null, fallback: SortOrder | undefined): SortOrder | undefined {
  if (raw === null) return fallback;
  return (VALID_ORDER as string[]).includes(raw) ? (raw as SortOrder) : fallback;
}

function parseDeleted(raw: string | null, fallback: DeletedFilter): DeletedFilter {
  if (raw === null) return fallback;
  return (VALID_DELETED as string[]).includes(raw) ? (raw as DeletedFilter) : fallback;
}
