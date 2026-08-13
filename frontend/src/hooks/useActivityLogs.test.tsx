import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityLogs } from "./useActivityLogs";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const SAMPLE_LOG = {
  id: "log-1",
  entity_type: "client",
  entity_id: "c1",
  action: "update",
  changed_by: "person-1",
  old_value: { name: "Old" },
  new_value: { name: "New" },
  created_at: "2026-01-01T00:00:00.000Z",
  changed_by_person: { id: "person-1", name: "Admin User" },
};

function okResponse<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function listResponse(data: typeof SAMPLE_LOG[] = [], totalPages = 1) {
  return okResponse({
    data,
    pagination: { page: 1, per_page: 20, total: data.length, total_pages: totalPages },
  });
}

describe("useActivityLogs", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(listResponse());
  });

  it("sends every live filter param, mapped to its snake_case query name, and never sends `sort`", async () => {
    const { result } = renderHook(
      () =>
        useActivityLogs({
          page: 2,
          perPage: 50,
          order: "asc",
          entityType: "client",
          entityId: "c1",
          action: "update",
          changedBy: "person-1",
          from: "2026-01-01",
          to: "2026-12-31",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/activity-logs");
    expect(options.params.query).toEqual({
      page: 2,
      per_page: 50,
      order: "asc",
      entity_type: "client",
      entity_id: "c1",
      action: "update",
      changed_by: "person-1",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    // `sort` is dead at the controller layer (activityLogs.controller.ts
    // never reads it; the service always ORDER BY created_at) — confirm it's
    // never part of the outgoing query at all, not even as `undefined`... it
    // simply isn't a key this hook knows about.
    expect("sort" in options.params.query).toBe(false);
  });

  it("sends all params as undefined when called with no filters (OverviewPage's current usage)", async () => {
    const { result } = renderHook(() => useActivityLogs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query).toEqual({
      page: undefined,
      per_page: undefined,
      order: undefined,
      entity_type: undefined,
      entity_id: undefined,
      action: undefined,
      changed_by: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("exposes `data` as a flat ActivityLog[] including changed_by_person, and pagination as a sibling field", async () => {
    getMock.mockResolvedValue(listResponse([SAMPLE_LOG], 3));

    const { result } = renderHook(() => useActivityLogs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([SAMPLE_LOG]);
    expect(result.current.data?.[0].changed_by_person).toEqual({
      id: "person-1",
      name: "Admin User",
    });
    expect(result.current.pagination).toEqual({ page: 1, per_page: 20, total: 1, total_pages: 3 });
  });

  it("returns an empty pagination-less `data` as undefined before the request resolves (no discarded envelope)", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useActivityLogs(), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.pagination).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });
});
