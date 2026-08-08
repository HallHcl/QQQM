import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateResourceVersion,
  useResourceVersion,
  useResourceVersions,
} from "./useResourceVersions";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
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

// Type-only guarantee: creating a version has no updated_at/conflict field —
// resource_versions is append-only, so there is nothing to go stale.
type CreateVersionInput = Parameters<ReturnType<typeof useCreateResourceVersion>["mutate"]>[0];
const _createVersionHasNoUpdatedAt: CreateVersionInput = {
  content: "v2 content",
  commit_message: "second pass",
};
void _createVersionHasNoUpdatedAt;
// resource_versions is append-only — there is no updated_at/conflict field
// to send, and no update endpoint to send it to.
const _createVersionRejectsUpdatedAt: CreateVersionInput = {
  content: "v2 content",
  // @ts-expect-error updated_at is not a field on this input
  updated_at: "2026-01-01T00:00:00.000Z",
};
void _createVersionRejectsUpdatedAt;

const VERSION_SUMMARY = {
  id: "v2",
  version_number: 2,
  commit_message: "second pass",
  created_at: "2026-01-02T00:00:00.000Z",
  author: { id: "p1", name: "Alex" },
};

const VERSION_DETAIL = {
  id: "v2",
  resource_id: "r1",
  version_number: 2,
  content: "v2 content",
  content_hash: "abc123",
  external_url: null,
  file_path: null,
  commit_message: "second pass",
  author_id: "p1",
  created_at: "2026-01-02T00:00:00.000Z",
  author: { id: "p1", name: "Alex" },
};

describe("useResourceVersions", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(
      mockOkResponse({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
    );
  });

  it("fetches the git-log-style list for a resource", async () => {
    const { result } = renderHook(() => useResourceVersions("r1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/resources/{id}/versions");
    expect(options.params.path).toEqual({ id: "r1" });
  });

  it("does not fetch when resourceId is undefined", () => {
    renderHook(() => useResourceVersions(undefined), { wrapper });
    expect(getMock).not.toHaveBeenCalled();
  });

  it("exposes `data` as a flat summary array with no content field, and pagination as a sibling", async () => {
    getMock.mockResolvedValue(
      mockOkResponse({
        data: [VERSION_SUMMARY],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      })
    );

    const { result } = renderHook(() => useResourceVersions("r1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([VERSION_SUMMARY]);
    expect(result.current.pagination).toEqual({ page: 1, per_page: 20, total: 1, total_pages: 1 });
    // The summary shape must not carry content — full content only comes
    // from useResourceVersion, a separate per-version request.
    expect(result.current.data?.[0]).not.toHaveProperty("content");
  });
});

describe("useResourceVersion", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("fetches one version's full content by version id (not version_number)", async () => {
    getMock.mockResolvedValue(mockOkResponse(VERSION_DETAIL));

    const { result } = renderHook(() => useResourceVersion("r1", "v2"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/resources/{id}/versions/{versionId}");
    expect(options.params.path).toEqual({ id: "r1", versionId: "v2" });
    expect(result.current.data?.content).toBe("v2 content");
  });

  it("does not fetch when resourceId or versionId is undefined", () => {
    renderHook(() => useResourceVersion("r1", undefined), { wrapper });
    renderHook(() => useResourceVersion(undefined, "v2"), { wrapper });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("useCreateResourceVersion", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("posts content/external_url/commit_message and does NOT discard the `warning` field from the response", async () => {
    postMock.mockResolvedValue(mockOkResponse({ version: VERSION_DETAIL, warning: undefined }));

    const { result } = renderHook(() => useCreateResourceVersion("r1"), { wrapper });

    const returned = await result.current.mutateAsync({
      content: "v2 content",
      commit_message: "second pass",
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/resources/{id}/versions");
    expect(options.params.path).toEqual({ id: "r1" });
    expect(options.body).toEqual({ content: "v2 content", commit_message: "second pass" });
    // Prior hook unwrapped to just `.version` and dropped `warning` — this
    // one must keep the full { version, warning? } envelope.
    expect(returned).toHaveProperty("version");
    expect(returned.version).toEqual(VERSION_DETAIL);
  });

  it("surfaces the warning string when new content is byte-identical to the current version", async () => {
    postMock.mockResolvedValue(
      mockOkResponse({ version: VERSION_DETAIL, warning: "Content identical to current version" })
    );

    const { result } = renderHook(() => useCreateResourceVersion("r1"), { wrapper });

    const returned = await result.current.mutateAsync({ content: "v2 content" });

    expect(returned.warning).toBe("Content identical to current version");
  });
});
