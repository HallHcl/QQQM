import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateResource,
  useDeleteResource,
  useResource,
  useResources,
  useRestoreResource,
  useUpdateResource,
} from "./useResources";

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

// Type-only guarantees (checked by `tsc --noEmit`, not at runtime).
type CreateResourceInput = Parameters<ReturnType<typeof useCreateResource>["mutate"]>[0];
type UpdateResourceInput = Parameters<ReturnType<typeof useUpdateResource>["mutate"]>[0];

// content_hash is always backend-computed — the create payload type must not
// be able to carry one.
const _createRejectsContentHash: CreateResourceInput = {
  type: "runbook",
  title: "Deploy guide",
  content: "steps",
  // @ts-expect-error content_hash is never accepted from the client
  content_hash: "deadbeef",
};
void _createRejectsContentHash;

// PATCH /resources/:id is metadata-only — content/external_url/file_path/type
// must be structurally impossible on the update payload, matching the
// backend's IMMUTABLE_METADATA_FIELDS rejection.
const _updateRejectsContentAndType: UpdateResourceInput = {
  id: "r1",
  data: {
    title: "Renamed",
    updated_at: "2026-01-01T00:00:00.000Z",
    // @ts-expect-error content cannot be changed via metadata update
    content: "new content",
  },
};
void _updateRejectsContentAndType;

const _updateRejectsType: UpdateResourceInput = {
  id: "r1",
  data: {
    updated_at: "2026-01-01T00:00:00.000Z",
    // @ts-expect-error type is immutable after creation
    type: "link",
  },
};
void _updateRejectsType;

const SAMPLE_RESOURCE = {
  id: "r1",
  project_id: null,
  type: "runbook",
  title: "Deploy guide",
  category: null,
  tags: [],
  current_version_id: "v1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const SAMPLE_LIST_ITEM = {
  ...SAMPLE_RESOURCE,
  current_version: {
    id: "v1",
    version_number: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    author: { id: "p1", name: "Alex" },
  },
};

describe("useResources", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(
      mockOkResponse({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
    );
  });

  it("builds query params from a filters object (projectId/type/search + pagination)", async () => {
    const { result } = renderHook(
      () =>
        useResources({
          projectId: "p1",
          type: "runbook",
          search: "deploy",
          page: 2,
          per_page: 50,
          sort: "title",
          order: "desc",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/resources");
    expect(options.params.query).toMatchObject({
      project_id: "p1",
      type: "runbook",
      search: "deploy",
      page: 2,
      per_page: 50,
      sort: "title",
      order: "desc",
    });
  });

  it.each(["false", "true", "all"] as const)("passes deleted=%s through to the request", async (deleted) => {
    const { result } = renderHook(() => useResources({ deleted }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.deleted).toBe(deleted);
  });

  it("defaults deleted to false and sends no other params when called with no filters", async () => {
    const { result } = renderHook(() => useResources(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query).toMatchObject({
      project_id: undefined,
      type: undefined,
      search: undefined,
      page: undefined,
      per_page: undefined,
      sort: undefined,
      order: undefined,
      deleted: "false",
    });
  });

  it("matches VpnResourcePicker's call shape: useResources({ search })", async () => {
    const { result } = renderHook(() => useResources({ search: "vpn" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query.search).toBe("vpn");
  });

  it("exposes `data` as a flat array (with current_version summary) and pagination as a sibling field", async () => {
    getMock.mockResolvedValue(
      mockOkResponse({
        data: [SAMPLE_LIST_ITEM],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      })
    );

    const { result } = renderHook(() => useResources(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([SAMPLE_LIST_ITEM]);
    expect(result.current.pagination).toEqual({ page: 1, per_page: 20, total: 1, total_pages: 1 });
  });
});

describe("useResource", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("fetches a single resource by id, including full current_version content", async () => {
    getMock.mockResolvedValue(
      mockOkResponse({
        ...SAMPLE_RESOURCE,
        current_version: {
          id: "v1",
          version_number: 1,
          created_at: "2026-01-01T00:00:00.000Z",
          author: { id: "p1", name: "Alex" },
          content: "Step 1...",
          external_url: null,
          file_path: null,
          content_hash: "abc123",
          commit_message: "Initial version",
        },
      })
    );

    const { result } = renderHook(() => useResource("r1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/resources/{id}");
    expect(options.params.path).toEqual({ id: "r1" });
    expect(result.current.data?.current_version?.content).toBe("Step 1...");
  });

  it("does not fetch when id is undefined", () => {
    renderHook(() => useResource(undefined), { wrapper });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("useCreateResource", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue(mockOkResponse({ ...SAMPLE_RESOURCE, current_version: null }));
  });

  it("posts metadata and initial-content fields together — atomic resource + v1 creation, one call", async () => {
    const { result } = renderHook(() => useCreateResource(), { wrapper });

    await result.current.mutateAsync({
      project_id: "p1",
      type: "runbook",
      title: "Deploy guide",
      category: "ops",
      tags: ["deploy"],
      content: "Step 1...",
      commit_message: "Initial version",
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/resources");
    expect(options.body).toEqual({
      project_id: "p1",
      type: "runbook",
      title: "Deploy guide",
      category: "ops",
      tags: ["deploy"],
      content: "Step 1...",
      commit_message: "Initial version",
    });
  });
});

describe("useUpdateResource", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue(mockOkResponse(SAMPLE_RESOURCE));
  });

  it("PATCHes title/category/tags with the required updated_at optimistic-lock token", async () => {
    const { result } = renderHook(() => useUpdateResource(), { wrapper });

    await result.current.mutateAsync({
      id: "r1",
      data: { title: "Renamed guide", updated_at: "2026-01-01T00:00:00.000Z" },
    });

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/resources/{id}");
    expect(options.params.path).toEqual({ id: "r1" });
    expect(options.body).toEqual({
      title: "Renamed guide",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("useDeleteResource", () => {
  it("DELETEs by id", async () => {
    deleteMock.mockReset();
    deleteMock.mockResolvedValue(mockOkResponse(SAMPLE_RESOURCE));

    const { result } = renderHook(() => useDeleteResource(), { wrapper });
    await result.current.mutateAsync("r1");

    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [path, options] = deleteMock.mock.calls[0];
    expect(path).toBe("/api/resources/{id}");
    expect(options.params.path).toEqual({ id: "r1" });
  });
});

describe("useRestoreResource", () => {
  it("POSTs to the restore endpoint by id, with no updated_at/conflict field in its input", async () => {
    postMock.mockReset();
    postMock.mockResolvedValue(mockOkResponse({ ...SAMPLE_RESOURCE, deleted_at: null }));

    const { result } = renderHook(() => useRestoreResource(), { wrapper });
    await result.current.mutateAsync("r1");

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/resources/{id}/restore");
    expect(options.params.path).toEqual({ id: "r1" });
    // The restore mutation takes a bare id, not { id, data: { updated_at } } —
    // structurally distinct from useUpdateResource, so its 409 ("not
    // currently deleted") can't be confused with a stale-write conflict.
    type RestoreInput = Parameters<ReturnType<typeof useRestoreResource>["mutate"]>[0];
    const _restoreInputIsBareId: RestoreInput = "r1";
    void _restoreInputIsBareId;
  });
});
