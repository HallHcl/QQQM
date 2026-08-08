import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateEnvironment,
  useDeleteEnvironment,
  useEnvironment,
  useEnvironments,
  useRestoreEnvironment,
  useUpdateEnvironment,
} from "./useEnvironments";

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
// backend rejects vpn_resource_id on create and project_id on update, so the
// mutation input types must not accept them either.
type CreateEnvironmentInput = Parameters<ReturnType<typeof useCreateEnvironment>["mutate"]>[0];
type UpdateEnvironmentInput = Parameters<ReturnType<typeof useUpdateEnvironment>["mutate"]>[0];

const _createRejectsVpnResourceId: CreateEnvironmentInput = {
  project_id: "p1",
  name: "x",
  // @ts-expect-error vpn_resource_id cannot be set at creation
  vpn_resource_id: "r1",
};
void _createRejectsVpnResourceId;

const _updateRejectsProjectId: UpdateEnvironmentInput = {
  id: "e1",
  // @ts-expect-error project_id cannot be changed via update
  data: { project_id: "p2", updated_at: "2026-01-01T00:00:00.000Z" },
};
void _updateRejectsProjectId;

const SAMPLE_ENVIRONMENT = {
  id: "e1",
  project_id: "p1",
  name: "Production",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  vpn_resource_id: null,
};

describe("useEnvironments", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    getMock.mockResolvedValue(
      mockOkResponse({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
    );
  });

  it("builds query params from projectId and a usePagination-shaped state object", async () => {
    const { result } = renderHook(
      () =>
        useEnvironments("p1", {
          page: 2,
          per_page: 50,
          sort: "name",
          order: "desc",
          search: "prod",
          deleted: "false",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/environments");
    expect(options.params.query).toMatchObject({
      project_id: "p1",
      page: 2,
      per_page: 50,
      sort: "name",
      order: "desc",
      search: "prod",
    });
  });

  it.each(["false", "true", "all"] as const)("passes deleted=%s through to the request", async (deleted) => {
    const { result } = renderHook(() => useEnvironments(undefined, { deleted }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.deleted).toBe(deleted);
  });

  it("defaults deleted to false when not provided", async () => {
    const { result } = renderHook(() => useEnvironments("p1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.deleted).toBe("false");
  });

  it("sends no project_id (and no other params besides deleted=false) when called with no arguments", async () => {
    const { result } = renderHook(() => useEnvironments(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query).toMatchObject({
      project_id: undefined,
      page: undefined,
      per_page: undefined,
      sort: undefined,
      order: undefined,
      search: undefined,
      deleted: "false",
    });
  });

  it("exposes `data` as a flat Environment[] and pagination metadata as a sibling field", async () => {
    getMock.mockResolvedValue(
      mockOkResponse({
        data: [SAMPLE_ENVIRONMENT],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      })
    );

    // InfrastructurePage destructures `{ data: environments = [] }` — `data`
    // must stay a flat array, not the {data, pagination} envelope.
    const { result } = renderHook(() => useEnvironments("p1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([SAMPLE_ENVIRONMENT]);
    expect(result.current.pagination).toEqual({ page: 1, per_page: 20, total: 1, total_pages: 1 });
  });
});

describe("useEnvironment", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("fetches a single environment by id", async () => {
    getMock.mockResolvedValue(
      mockOkResponse({ ...SAMPLE_ENVIRONMENT, project: { id: "p1", name: "Migration" } })
    );

    const { result } = renderHook(() => useEnvironment("e1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/environments/{id}");
    expect(options.params.path).toEqual({ id: "e1" });
    expect(result.current.data).toMatchObject({ id: "e1", project: { id: "p1", name: "Migration" } });
  });

  it("does not fetch when id is undefined", () => {
    renderHook(() => useEnvironment(undefined), { wrapper });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("useCreateEnvironment", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue(mockOkResponse(SAMPLE_ENVIRONMENT));
  });

  it("posts project_id, name, and description — vpn_resource_id is not part of this payload", async () => {
    const { result } = renderHook(() => useCreateEnvironment(), { wrapper });

    await result.current.mutateAsync({ project_id: "p1", name: "Staging", description: "desc" });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/environments");
    expect(options.body).toEqual({ project_id: "p1", name: "Staging", description: "desc" });
  });
});

describe("useUpdateEnvironment", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue(mockOkResponse(SAMPLE_ENVIRONMENT));
  });

  it("PATCHes name/description/vpn_resource_id with the required updated_at optimistic-lock token", async () => {
    const { result } = renderHook(() => useUpdateEnvironment(), { wrapper });

    await result.current.mutateAsync({
      id: "e1",
      data: { name: "Renamed", vpn_resource_id: "r1", updated_at: "2026-01-01T00:00:00.000Z" },
    });

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/environments/{id}");
    expect(options.params.path).toEqual({ id: "e1" });
    expect(options.body).toEqual({
      name: "Renamed",
      vpn_resource_id: "r1",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("accepts vpn_resource_id: null to clear it", async () => {
    const { result } = renderHook(() => useUpdateEnvironment(), { wrapper });

    await result.current.mutateAsync({
      id: "e1",
      data: { vpn_resource_id: null, updated_at: "2026-01-01T00:00:00.000Z" },
    });

    const [, options] = patchMock.mock.calls[0];
    expect(options.body.vpn_resource_id).toBeNull();
  });
});

describe("useDeleteEnvironment", () => {
  it("DELETEs by id", async () => {
    deleteMock.mockReset();
    deleteMock.mockResolvedValue(mockOkResponse(SAMPLE_ENVIRONMENT));

    const { result } = renderHook(() => useDeleteEnvironment(), { wrapper });
    await result.current.mutateAsync("e1");

    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [path, options] = deleteMock.mock.calls[0];
    expect(path).toBe("/api/environments/{id}");
    expect(options.params.path).toEqual({ id: "e1" });
  });
});

describe("useRestoreEnvironment", () => {
  it("POSTs to the restore endpoint by id", async () => {
    postMock.mockReset();
    postMock.mockResolvedValue(mockOkResponse({ ...SAMPLE_ENVIRONMENT, deleted_at: null }));

    const { result } = renderHook(() => useRestoreEnvironment(), { wrapper });
    await result.current.mutateAsync("e1");

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/environments/{id}/restore");
    expect(options.params.path).toEqual({ id: "e1" });
  });
});
