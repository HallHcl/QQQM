import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { useProjects } from "./useProjects";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockOkResponse() {
  return {
    data: { data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } },
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

const SAMPLE_PROJECT = {
  id: "p1",
  client_id: "c1",
  name: "Migration",
  description: null,
  owner_status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

describe("useProjects", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(mockOkResponse());
  });

  it("builds query params from clientId and a usePagination-shaped state object", async () => {
    const { result } = renderHook(
      () =>
        useProjects("c1", {
          page: 2,
          per_page: 50,
          sort: "name",
          order: "desc",
          search: "acme",
          deleted: "false",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/projects");
    expect(options.params.query).toMatchObject({
      client_id: "c1",
      page: 2,
      per_page: 50,
      sort: "name",
      order: "desc",
      search: "acme",
    });
  });

  it.each(["false", "true", "all"] as const)("passes deleted=%s through to the request", async (deleted) => {
    const { result } = renderHook(() => useProjects(undefined, { deleted }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.deleted).toBe(deleted);
  });

  it("defaults deleted to false when not provided", async () => {
    const { result } = renderHook(() => useProjects("c1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.deleted).toBe("false");
  });

  it("sends no params (besides deleted=false) when called with no arguments", async () => {
    const { result } = renderHook(() => useProjects(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query).toMatchObject({
      client_id: undefined,
      page: undefined,
      per_page: undefined,
      sort: undefined,
      order: undefined,
      search: undefined,
      deleted: "false",
    });
  });

  it("exposes `data` as a flat Project[] and pagination metadata as a sibling field", async () => {
    getMock.mockResolvedValue({
      data: {
        data: [SAMPLE_PROJECT],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    // OverviewPage, InfrastructurePage, ResourceEditorSheet, ResourceFilterBar,
    // and ScheduleFormSheet all destructure `{ data: projects = [] }` —
    // `data` must stay a flat array or those out-of-scope call sites break.
    const { result } = renderHook(() => useProjects("c1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([SAMPLE_PROJECT]);
    expect(result.current.pagination).toEqual({ page: 1, per_page: 20, total: 1, total_pages: 1 });
  });
});
