import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateServer,
  useDeleteServer,
  useRestoreServer,
  useServer,
  useServers,
  useUpdateServer,
} from "./useServers";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      PATCH: (...args: unknown[]) => patchMock(...args),
      DELETE: (...args: unknown[]) => deleteMock(...args),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function mockOkResponse<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

// Type-only guarantees (checked by `tsc --noEmit`, not at runtime): the
// backend rejects environment_id on update entirely, so the mutation input
// type must not accept it.
type UpdateServerInput = Parameters<ReturnType<typeof useUpdateServer>["mutate"]>[0];

const _updateRejectsEnvironmentId: UpdateServerInput = {
  id: "s1",
  // @ts-expect-error environment_id cannot be changed via update
  data: { environment_id: "e2", updated_at: "2026-01-01T00:00:00.000Z" },
};
void _updateRejectsEnvironmentId;

const SAMPLE_SERVER = {
  id: "s1",
  environment_id: "e1",
  hostname: "web-01",
  ip_address: "10.0.0.1",
  tech_stack: ["node", "postgres"],
  monitoring_url: null,
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  display_name: "Web 01",
  service_type: "application",
  access_method: "ssh",
  access_host: "web-01.internal",
  access_port: 22,
  access_path: null,
};

describe("useServers", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    getMock.mockResolvedValue(
      mockOkResponse({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
    );
  });

  it("builds query params from environmentId and a usePagination-shaped state object", async () => {
    const { result } = renderHook(
      () =>
        useServers("e1", {
          page: 2,
          per_page: 50,
          sort: "display_name",
          order: "desc",
          search: "web",
          deleted: "false",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/servers");
    expect(options.params.query).toMatchObject({
      environment_id: "e1",
      page: 2,
      per_page: 50,
      sort: "display_name",
      order: "desc",
      search: "web",
    });
  });

  it.each(["false", "true", "all"] as const)("passes deleted=%s through to the request", async (deleted) => {
    const { result } = renderHook(() => useServers(undefined, { deleted }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.deleted).toBe(deleted);
  });

  it("defaults deleted to false when not provided", async () => {
    const { result } = renderHook(() => useServers("e1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.deleted).toBe("false");
  });

  it("sends no environment_id (and no other params besides deleted=false) when called with no arguments", async () => {
    const { result } = renderHook(() => useServers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query).toMatchObject({
      environment_id: undefined,
      page: undefined,
      per_page: undefined,
      sort: undefined,
      order: undefined,
      search: undefined,
      deleted: "false",
    });
  });

  it("exposes `data` as a flat Server[] and pagination metadata as a sibling field", async () => {
    getMock.mockResolvedValue(
      mockOkResponse({
        data: [SAMPLE_SERVER],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      })
    );

    // InfrastructurePage and EnvironmentDetailPage both destructure
    // `{ data: servers = [] }` — `data` must stay a flat array, not the
    // {data, pagination} envelope.
    const { result } = renderHook(() => useServers("e1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([SAMPLE_SERVER]);
    expect(result.current.pagination).toEqual({ page: 1, per_page: 20, total: 1, total_pages: 1 });
  });
});

describe("useServer", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("fetches a single server by id", async () => {
    getMock.mockResolvedValue(
      mockOkResponse({
        ...SAMPLE_SERVER,
        environment: { id: "e1", name: "Production", project: { id: "p1", name: "Migration" } },
      })
    );

    const { result } = renderHook(() => useServer("s1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/servers/{id}");
    expect(options.params.path).toEqual({ id: "s1" });
    expect(result.current.data).toMatchObject({ id: "s1" });
  });

  it("does not fetch when id is undefined", () => {
    renderHook(() => useServer(undefined), { wrapper });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("useCreateServer", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue(mockOkResponse(SAMPLE_SERVER));
  });

  it("posts the Access Documentation fields alongside the base server fields", async () => {
    const { result } = renderHook(() => useCreateServer(), { wrapper });

    await result.current.mutateAsync({
      environment_id: "e1",
      display_name: "Web 01",
      hostname: "web-01",
      service_type: "application",
      access_method: "ssh",
      access_host: "web-01.internal",
      access_port: 22,
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/servers");
    expect(options.body).toEqual({
      environment_id: "e1",
      display_name: "Web 01",
      hostname: "web-01",
      service_type: "application",
      access_method: "ssh",
      access_host: "web-01.internal",
      access_port: 22,
    });
  });
});

describe("useUpdateServer", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue(mockOkResponse(SAMPLE_SERVER));
  });

  it("PATCHes server fields with the required updated_at optimistic-lock token, and never sends environment_id", async () => {
    const { result } = renderHook(() => useUpdateServer(), { wrapper });

    await result.current.mutateAsync({
      id: "s1",
      data: { hostname: "web-01-renamed", updated_at: "2026-01-01T00:00:00.000Z" },
    });

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/servers/{id}");
    expect(options.params.path).toEqual({ id: "s1" });
    expect(options.body).toEqual({
      hostname: "web-01-renamed",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    expect(options.body.environment_id).toBeUndefined();
  });
});

describe("useDeleteServer", () => {
  it("DELETEs by id", async () => {
    deleteMock.mockReset();
    deleteMock.mockResolvedValue(mockOkResponse(SAMPLE_SERVER));

    const { result } = renderHook(() => useDeleteServer(), { wrapper });
    await result.current.mutateAsync("s1");

    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [path, options] = deleteMock.mock.calls[0];
    expect(path).toBe("/api/servers/{id}");
    expect(options.params.path).toEqual({ id: "s1" });
  });
});

describe("useRestoreServer", () => {
  it("POSTs to the restore endpoint by id", async () => {
    postMock.mockReset();
    postMock.mockResolvedValue(mockOkResponse({ ...SAMPLE_SERVER, deleted_at: null }));

    const { result } = renderHook(() => useRestoreServer(), { wrapper });
    await result.current.mutateAsync("s1");

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/servers/{id}/restore");
    expect(options.params.path).toEqual({ id: "s1" });
  });
});
