import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePagination } from "./usePagination";

describe("usePagination", () => {
  it("defaults to page 1, per_page 20, deleted=false, and no sort/order/search", () => {
    const { result } = renderHook(() => usePagination());
    expect(result.current.params).toEqual({ page: 1, per_page: 20, deleted: "false" });
  });

  it("updates page", () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.setPage(3));
    expect(result.current.params.page).toBe(3);
  });

  it("clamps per_page to the max of 100 and resets to page 1", () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.setPage(5));
    act(() => result.current.setPerPage(500));
    expect(result.current.params.per_page).toBe(100);
    expect(result.current.params.page).toBe(1);
  });

  it("clamps per_page to a minimum of 1", () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.setPerPage(0));
    expect(result.current.params.per_page).toBe(1);
  });

  it("updates sort and order independently", () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.setSort("name"));
    act(() => result.current.setOrder("desc"));
    expect(result.current.params.sort).toBe("name");
    expect(result.current.params.order).toBe("desc");
  });

  it("updates search and resets to page 1", () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.setPage(4));
    act(() => result.current.setSearch("acme"));
    expect(result.current.params.search).toBe("acme");
    expect(result.current.params.page).toBe(1);
  });

  it("omits search from params entirely when empty", () => {
    const { result } = renderHook(() => usePagination());
    expect(result.current.params.search).toBeUndefined();
    expect("search" in result.current.params).toBe(false);
  });

  it("cycles the deleted filter across false/true/all", () => {
    const { result } = renderHook(() => usePagination());
    act(() => result.current.setDeleted("true"));
    expect(result.current.params.deleted).toBe("true");
    act(() => result.current.setDeleted("all"));
    expect(result.current.params.deleted).toBe("all");
    act(() => result.current.setDeleted("false"));
    expect(result.current.params.deleted).toBe("false");
  });

  it("reset() restores the initial options, discarding interim changes", () => {
    const { result } = renderHook(() => usePagination({ initialPerPage: 50, initialDeleted: "all" }));
    act(() => {
      result.current.setPage(9);
      result.current.setSearch("x");
      result.current.setSort("created_at");
    });
    act(() => result.current.reset());
    expect(result.current.params).toEqual({ page: 1, per_page: 50, deleted: "all" });
  });
});
