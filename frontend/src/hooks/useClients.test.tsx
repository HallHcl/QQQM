import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClients } from "./useClients";

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

const SAMPLE_CLIENT = {
  id: "1",
  name: "Acme Corp",
  status: "active",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

describe("useClients", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(mockOkResponse());
  });

  it("builds query params from a usePagination-shaped state object", async () => {
    const { result } = renderHook(
      () =>
        useClients({
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
    expect(path).toBe("/api/clients");
    expect(options.params.query).toMatchObject({
      page: 2,
      per_page: 50,
      sort: "name",
      order: "desc",
      search: "acme",
    });
  });

  it.each(["false", "true", "all"] as const)(
    "passes deleted=%s through to the request",
    async (deleted) => {
      const { result } = renderHook(() => useClients({ page: 1, per_page: 20, deleted }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const [, options] = getMock.mock.calls[0];
      expect(options.params.query.deleted).toBe(deleted);
    }
  );

  it("sends no query params when called with no arguments (existing picker usage)", async () => {
    const { result } = renderHook(() => useClients(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query).toMatchObject({
      page: undefined,
      per_page: undefined,
      sort: undefined,
      order: undefined,
      search: undefined,
      deleted: "false",
    });
  });

  it("exposes `data` as a flat Client[] and pagination metadata as a sibling field", async () => {
    getMock.mockResolvedValue({
      data: {
        data: [SAMPLE_CLIENT],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    // OverviewPage, InfrastructurePage, and PersonDetailDialog all destructure
    // `{ data: clients = [] }` from this hook with no arguments — `data` must
    // stay a flat array (not the {data, pagination} envelope) or those
    // out-of-scope call sites break at compile time.
    const { result } = renderHook(() => useClients(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([SAMPLE_CLIENT]);
    expect(result.current.pagination).toEqual({ page: 1, per_page: 20, total: 1, total_pages: 1 });
  });
});
