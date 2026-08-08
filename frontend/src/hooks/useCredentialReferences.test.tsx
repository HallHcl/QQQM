import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateCredentialReference,
  useCredentialReferences,
  useDeleteCredentialReference,
  useUpdateCredentialReference,
} from "./useCredentialReferences";

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

// Type-only guarantee (checked by `tsc --noEmit`, not at runtime): unlike
// every other entity's update payload, this one has no updated_at field —
// credential_references has no updated_at column and the generated update
// schema doesn't require (or even accept) one. This test documents that
// finding from Part 23a for Part 23d.
type UpdateCredentialReferenceInput = Parameters<
  ReturnType<typeof useUpdateCredentialReference>["mutate"]
>[0];

const _updateHasNoOptimisticLockField: UpdateCredentialReferenceInput = {
  id: "c1",
  data: { label: "Renamed" },
  // no updated_at here — and none is required, unlike useUpdateServer/
  // useUpdateEnvironment/useUpdateProject.
};
void _updateHasNoOptimisticLockField;

const SAMPLE_CREDENTIAL_REFERENCE = {
  id: "c1",
  server_id: "s1",
  label: "Vault path",
  reference_location: "secret/servers/web-01",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  applies_to_access_method: "ssh",
};

describe("useCredentialReferences", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue(mockOkResponse([]));
  });

  it("fetches the plain array for a server, not a {data, pagination} envelope", async () => {
    getMock.mockResolvedValue(mockOkResponse([SAMPLE_CREDENTIAL_REFERENCE]));

    const { result } = renderHook(() => useCredentialReferences("s1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/servers/{serverId}/credential-references");
    expect(options.params.path).toEqual({ serverId: "s1" });
    // No query object is sent at all: GET /servers/{serverId}/credential-references
    // has `parameters.query: never` in the generated schema — this endpoint
    // does not support page/per_page/sort/order/search/deleted the way the
    // top-level list endpoints (Servers, Environments, Projects) do. It is a
    // small junction-style resource always scoped to one server.
    expect(options.params.query).toBeUndefined();
    expect(result.current.data).toEqual([SAMPLE_CREDENTIAL_REFERENCE]);
  });

  it("does not fetch when serverId is undefined", () => {
    renderHook(() => useCredentialReferences(undefined), { wrapper });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("useCreateCredentialReference", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue(mockOkResponse(SAMPLE_CREDENTIAL_REFERENCE));
  });

  it("posts label/reference_location/applies_to_access_method/notes nested under the server", async () => {
    const { result } = renderHook(() => useCreateCredentialReference(), { wrapper });

    await result.current.mutateAsync({
      serverId: "s1",
      data: {
        label: "Vault path",
        reference_location: "secret/servers/web-01",
        applies_to_access_method: "ssh",
      },
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/servers/{serverId}/credential-references");
    expect(options.params.path).toEqual({ serverId: "s1" });
    expect(options.body).toEqual({
      label: "Vault path",
      reference_location: "secret/servers/web-01",
      applies_to_access_method: "ssh",
    });
  });
});

describe("useUpdateCredentialReference", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue(mockOkResponse(SAMPLE_CREDENTIAL_REFERENCE));
  });

  it("PATCHes fields against the top-level (non-nested) endpoint with no updated_at / optimistic-lock token", async () => {
    const { result } = renderHook(() => useUpdateCredentialReference(), { wrapper });

    await result.current.mutateAsync({
      id: "c1",
      data: { label: "Renamed" },
    });

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/credential-references/{id}");
    expect(options.params.path).toEqual({ id: "c1" });
    expect(options.body).toEqual({ label: "Renamed" });
    expect(options.body.updated_at).toBeUndefined();
  });
});

describe("useDeleteCredentialReference", () => {
  it("hard-DELETEs by id against the top-level endpoint (no restore endpoint exists for this resource)", async () => {
    deleteMock.mockReset();
    deleteMock.mockResolvedValue(mockOkResponse(SAMPLE_CREDENTIAL_REFERENCE));

    const { result } = renderHook(() => useDeleteCredentialReference(), { wrapper });
    await result.current.mutateAsync("c1");

    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [path, options] = deleteMock.mock.calls[0];
    expect(path).toBe("/api/credential-references/{id}");
    expect(options.params.path).toEqual({ id: "c1" });
  });
});
