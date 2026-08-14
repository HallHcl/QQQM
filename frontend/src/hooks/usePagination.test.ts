import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { usePagination } from "./usePagination";

function wrapper({ initialEntries = ["/"] }: { initialEntries?: string[] } = {}) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries }, children);
}

function renderWithUrl(initialEntries?: string[], options?: Parameters<typeof usePagination>[0]) {
  return renderHook(() => usePagination(options), { wrapper: wrapper({ initialEntries }) });
}

describe("usePagination", () => {
  it("defaults to page 1, per_page 20, deleted=false, and no sort/order/search", () => {
    const { result } = renderWithUrl();
    expect(result.current.params).toEqual({ page: 1, per_page: 20, deleted: "false" });
  });

  it("updates page", () => {
    const { result } = renderWithUrl();
    act(() => result.current.setPage(3));
    expect(result.current.params.page).toBe(3);
  });

  it("clamps per_page to the max of 100 and resets to page 1", () => {
    const { result } = renderWithUrl();
    act(() => result.current.setPage(5));
    act(() => result.current.setPerPage(500));
    expect(result.current.params.per_page).toBe(100);
    expect(result.current.params.page).toBe(1);
  });

  it("clamps per_page to a minimum of 1", () => {
    const { result } = renderWithUrl();
    act(() => result.current.setPerPage(0));
    expect(result.current.params.per_page).toBe(1);
  });

  it("updates sort and order independently", () => {
    const { result } = renderWithUrl();
    act(() => result.current.setSort("name"));
    act(() => result.current.setOrder("desc"));
    expect(result.current.params.sort).toBe("name");
    expect(result.current.params.order).toBe("desc");
  });

  it("updates search and resets to page 1", () => {
    const { result } = renderWithUrl();
    act(() => result.current.setPage(4));
    act(() => result.current.setSearch("acme"));
    expect(result.current.params.search).toBe("acme");
    expect(result.current.params.page).toBe(1);
  });

  it("omits search from params entirely when empty", () => {
    const { result } = renderWithUrl();
    expect(result.current.params.search).toBeUndefined();
    expect("search" in result.current.params).toBe(false);
  });

  it("cycles the deleted filter across false/true/all", () => {
    const { result } = renderWithUrl();
    act(() => result.current.setDeleted("true"));
    expect(result.current.params.deleted).toBe("true");
    act(() => result.current.setDeleted("all"));
    expect(result.current.params.deleted).toBe("all");
    act(() => result.current.setDeleted("false"));
    expect(result.current.params.deleted).toBe("false");
  });

  it("reset() restores the initial options, discarding interim changes", () => {
    const { result } = renderWithUrl(undefined, { initialPerPage: 50, initialDeleted: "all" });
    act(() => result.current.setPage(9));
    act(() => result.current.setSearch("x"));
    act(() => result.current.setSort("created_at"));
    act(() => result.current.reset());
    expect(result.current.params).toEqual({ page: 1, per_page: 50, deleted: "all" });
  });

  describe("URL sync", () => {
    it("initializes state from URL query params present on mount", () => {
      const { result } = renderWithUrl(["/list?page=3&per_page=50&sort=name&order=desc&search=acme&deleted=true"]);
      expect(result.current.params).toEqual({
        page: 3,
        per_page: 50,
        sort: "name",
        order: "desc",
        search: "acme",
        deleted: "true",
      });
    });

    it("writes state changes back to the URL", () => {
      function useHookAndParams() {
        const pagination = usePagination();
        const [urlParams] = useSearchParams();
        return { pagination, urlParams };
      }
      const { result } = renderHook(() => useHookAndParams(), { wrapper: wrapper() });

      act(() => result.current.pagination.setSearch("acme"));
      expect(result.current.urlParams.get("search")).toBe("acme");
      expect(result.current.urlParams.get("page")).toBeNull();

      act(() => result.current.pagination.setPage(2));
      expect(result.current.urlParams.get("page")).toBe("2");
    });

    it("does not write default values into the URL (keeps bookmarkable URLs minimal)", () => {
      function useHookAndParams() {
        const pagination = usePagination({ initialSort: "name", initialOrder: "asc" });
        const [urlParams] = useSearchParams();
        return { pagination, urlParams };
      }
      const { result } = renderHook(() => useHookAndParams(), { wrapper: wrapper() });

      act(() => result.current.pagination.setSort("name"));
      act(() => result.current.pagination.setOrder("asc"));
      expect(result.current.urlParams.toString()).toBe("");
    });

    it("falls back to defaults for a malformed page value (page=abc)", () => {
      const { result } = renderWithUrl(["/list?page=abc"]);
      expect(result.current.params.page).toBe(1);
    });

    it("falls back to defaults for a negative or non-integer page value", () => {
      expect(renderWithUrl(["/list?page=-5"]).result.current.params.page).toBe(1);
      expect(renderWithUrl(["/list?page=1.5"]).result.current.params.page).toBe(1);
    });

    it("accepts an out-of-range page value without crashing (list-level empty state handles it)", () => {
      const { result } = renderWithUrl(["/list?page=9999"]);
      expect(result.current.params.page).toBe(9999);
    });

    it("falls back to the initial deleted option for an invalid deleted value", () => {
      const { result } = renderWithUrl(["/list?deleted=bogus"], { initialDeleted: "all" });
      expect(result.current.params.deleted).toBe("all");
    });

    it("falls back to the initial order option for an invalid order value", () => {
      const { result } = renderWithUrl(["/list?order=sideways"], { initialOrder: "asc" });
      expect(result.current.params.order).toBe("asc");
    });

    it("clamps a malformed per_page value to a valid range", () => {
      const { result } = renderWithUrl(["/list?per_page=abc"]);
      expect(result.current.params.per_page).toBe(20);
    });

    it("exposes getParam/setParams for a page's own additional URL-synced filters", () => {
      function useHookAndParams() {
        const pagination = usePagination();
        const [urlParams] = useSearchParams();
        return { pagination, urlParams };
      }
      const { result } = renderHook(() => useHookAndParams(), { wrapper: wrapper() });

      expect(result.current.pagination.getParam("entity_type")).toBeNull();

      act(() => result.current.pagination.setParams({ entity_type: "client" }, { resetPage: true }));
      expect(result.current.pagination.getParam("entity_type")).toBe("client");
      expect(result.current.urlParams.get("entity_type")).toBe("client");
    });
  });
});
