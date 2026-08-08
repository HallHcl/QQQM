import { useCallback, useMemo, useState } from "react";

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

/**
 * Shared page/per_page/sort/order/search/deleted state for list endpoints.
 * Matches the standard list query params used across all modules. Not wired
 * into any page yet — module refactors will consume this directly.
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

  const [page, setPage] = useState(initialPage);
  const [perPage, setPerPageState] = useState(clampPerPage(initialPerPage));
  const [sort, setSort] = useState<string | undefined>(initialSort);
  const [order, setOrder] = useState<SortOrder | undefined>(initialOrder);
  const [search, setSearchState] = useState(initialSearch);
  const [deleted, setDeleted] = useState<DeletedFilter>(initialDeleted);

  const setPerPage = useCallback((value: number) => {
    setPerPageState(clampPerPage(value));
    setPage(1);
  }, []);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);

  const nextPage = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);

  const params = useMemo<PaginationParams>(
    () => ({
      page,
      per_page: perPage,
      ...(sort ? { sort } : {}),
      ...(order ? { order } : {}),
      ...(search ? { search } : {}),
      deleted,
    }),
    [page, perPage, sort, order, search, deleted]
  );

  const reset = useCallback(() => {
    setPage(initialPage);
    setPerPageState(clampPerPage(initialPerPage));
    setSort(initialSort);
    setOrder(initialOrder);
    setSearchState(initialSearch);
    setDeleted(initialDeleted);
  }, [initialPage, initialPerPage, initialSort, initialOrder, initialSearch, initialDeleted]);

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
  };
}

function clampPerPage(value: number): number {
  return Math.min(Math.max(1, Math.trunc(value)), MAX_PER_PAGE);
}
