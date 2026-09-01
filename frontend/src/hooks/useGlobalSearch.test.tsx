import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SEARCH_GROUPS,
  searchHitPath,
  useGlobalSearch,
  type SearchHit,
} from "./useGlobalSearch";

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
    data: { clients: [], projects: [], environments: [], servers: [], total: 0 },
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue(mockOkResponse());
});

describe("searchHitPath", () => {
  const hit = (type: SearchHit["type"]): SearchHit => ({
    id: "abc-123",
    type,
    label: "x",
    secondary: null,
  });

  it("routes projects, environments and servers to their detail pages", () => {
    expect(searchHitPath(hit("project"))).toBe("/projects/abc-123");
    expect(searchHitPath(hit("environment"))).toBe("/environments/abc-123");
    expect(searchHitPath(hit("server"))).toBe("/servers/abc-123");
  });

  it("routes clients to the list page, since no client detail route exists", () => {
    expect(searchHitPath(hit("client"))).toBe("/clients");
  });
});

describe("SEARCH_GROUPS", () => {
  it("declares the four DELIVERY groups in render order", () => {
    expect(SEARCH_GROUPS.map((group) => group.key)).toEqual([
      "clients",
      "projects",
      "environments",
      "servers",
    ]);
  });
});

describe("useGlobalSearch", () => {
  it("does not issue a request for an empty or whitespace-only term", async () => {
    const { result } = renderHook(() => useGlobalSearch("   "), { wrapper });

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });
    expect(getMock).not.toHaveBeenCalled();
  });

  it("sends the trimmed term as the q query parameter", async () => {
    const { result } = renderHook(() => useGlobalSearch("  acme  "), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(getMock).toHaveBeenCalledWith("/api/search", {
      params: { query: { q: "acme" } },
    });
  });

  it("returns the grouped payload as-is, preserving server-side ranking", async () => {
    const clients: SearchHit[] = [
      { id: "1", type: "client", label: "Acme", secondary: "active" },
      { id: "2", type: "client", label: "Acme Holdings", secondary: "active" },
    ];
    getMock.mockResolvedValue({
      data: { clients, projects: [], environments: [], servers: [], total: 2 },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    const { result } = renderHook(() => useGlobalSearch("acme"), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    // Order must survive untouched — the backend's ts_rank decided it.
    expect(result.current.data?.clients.map((hit) => hit.label)).toEqual([
      "Acme",
      "Acme Holdings",
    ]);
    expect(result.current.data?.total).toBe(2);
  });
});
