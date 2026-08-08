import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAssignPersonToProject,
  useProjectPeople,
  useRemovePersonFromProject,
} from "./useProjectPeople";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      DELETE: (...args: unknown[]) => deleteMock(...args),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const ROSTER_ENTRY = {
  id: "pp1",
  project_id: "p1",
  role_in_project: "Lead engineer",
  created_at: "2026-01-01T00:00:00.000Z",
  person: { id: "person1", name: "Ada Lovelace", email: null, type: "internal_engineer", deleted_at: null },
};

describe("useProjectPeople", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
  });

  it("fetches the roster for the given project", async () => {
    getMock.mockResolvedValue({
      data: [ROSTER_ENTRY],
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    const { result } = renderHook(() => useProjectPeople("p1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledWith("/api/projects/{id}/people", {
      params: { path: { id: "p1" } },
    });
    expect(result.current.data).toEqual([ROSTER_ENTRY]);
  });

  it("does not fetch when projectId is undefined", () => {
    renderHook(() => useProjectPeople(undefined), { wrapper });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("useAssignPersonToProject", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("sends people_id and role_in_project to the assignment endpoint", async () => {
    postMock.mockResolvedValue({
      data: ROSTER_ENTRY,
      error: undefined,
      response: new Response(null, { status: 201 }),
    });

    const { result } = renderHook(() => useAssignPersonToProject(), { wrapper });

    result.current.mutate({ projectId: "p1", peopleId: "person1", roleInProject: "Lead engineer" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(postMock).toHaveBeenCalledWith("/api/projects/{id}/people", {
      params: { path: { id: "p1" } },
      body: { people_id: "person1", role_in_project: "Lead engineer" },
    });
  });
});

describe("useRemovePersonFromProject", () => {
  beforeEach(() => {
    deleteMock.mockReset();
  });

  it("sends the project and person ids to the removal endpoint", async () => {
    deleteMock.mockResolvedValue({
      data: { message: "removed" },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    const { result } = renderHook(() => useRemovePersonFromProject(), { wrapper });

    result.current.mutate({ projectId: "p1", peopleId: "person1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(deleteMock).toHaveBeenCalledWith("/api/projects/{id}/people/{peopleId}", {
      params: { path: { id: "p1", peopleId: "person1" } },
    });
  });
});
