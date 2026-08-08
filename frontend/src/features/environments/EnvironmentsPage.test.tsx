import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EnvironmentsPage from "./EnvironmentsPage";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const useAuthMock = vi.fn();

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

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EnvironmentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { invalidateSpy, unmount };
}

function okResult(data: unknown[], total = data.length) {
  return {
    data: { data, pagination: { page: 1, per_page: 20, total, total_pages: 1 } },
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

const SAMPLE_ENVIRONMENT = {
  id: "e1",
  project_id: "p1",
  name: "Production",
  description: "Primary environment",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  vpn_resource_id: null,
};

const DELETED_ENVIRONMENT = {
  ...SAMPLE_ENVIRONMENT,
  id: "e2",
  name: "Staging",
  deleted_at: "2026-01-05T00:00:00.000Z",
};

// EnvironmentsPage also fetches projects (to resolve project_id -> name for
// display), so the GET mock must route by path.
function mockGetByPath(handlers: { environments?: unknown; projects?: unknown }) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/environments") return Promise.resolve(handlers.environments ?? okResult([]));
    if (path === "/api/projects") return Promise.resolve(handlers.projects ?? okResult([]));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

describe("EnvironmentsPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading environments/i)).toBeInTheDocument();
  });

  it("renders environment rows once the fetch succeeds", async () => {
    mockGetByPath({
      environments: okResult([SAMPLE_ENVIRONMENT]),
      projects: okResult([SAMPLE_PROJECT]),
    });

    renderPage();

    expect(await screen.findByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Migration")).toBeInTheDocument();
  });

  it("renders an empty state when the list is empty", async () => {
    mockGetByPath({ environments: okResult([]), projects: okResult([]) });

    renderPage();

    expect(await screen.findByText(/no environments found/i)).toBeInTheDocument();
  });

  it("renders an error state when the query fails", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/api/environments") {
        return Promise.resolve({
          data: undefined,
          error: { error: { code: "INTERNAL_ERROR", message: "Something broke" } },
          response: new Response(null, { status: 500 }),
        });
      }
      return Promise.resolve(okResult([]));
    });

    renderPage();

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });

  describe("RBAC-gated create/edit/delete/restore (all admin-only on Environments, verified against backend/src/routes/environments.routes.ts)", () => {
    it("shows New environment to an admin but not to a non-admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });
      const { unmount } = renderPage();
      await screen.findByText("Production");
      expect(screen.getByRole("button", { name: /new environment/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Production");
      expect(screen.queryByRole("button", { name: /new environment/i })).not.toBeInTheDocument();
    });

    it("hides Edit and Delete from a non-admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Production");

      expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("shows Edit and Delete to an admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Production");

      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    });

    it("hides Restore from a non-admin viewing a deleted environment", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ environments: okResult([DELETED_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Staging");

      expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    });

    it("shows Restore to an admin viewing a deleted environment", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([DELETED_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Staging");

      expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
    });

    it("marks a deleted environment with a Deleted badge", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([DELETED_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();

      expect(await screen.findByText("Staging")).toBeInTheDocument();
      expect(screen.getByText("Deleted")).toBeInTheDocument();
    });
  });

  describe("delete confirmation — cascade-accurate copy", () => {
    it("opens a confirmation describing the Servers cascade before deleting, and only deletes on confirm", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });
      deleteMock.mockResolvedValue({
        data: SAMPLE_ENVIRONMENT,
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const { invalidateSpy } = renderPage();
      await screen.findByText("Production");

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));

      expect(screen.getByText("Delete this environment?")).toBeInTheDocument();
      // Must accurately describe the real cascade (soft-delete servers,
      // hard-delete their credential references) — the opposite of Projects'
      // "nothing cascades" copy.
      expect(screen.getByText(/soft-deletes all of its servers/i)).toBeInTheDocument();
      expect(screen.getByText(/hard-deletes.*their stored credential references/i)).toBeInTheDocument();
      expect(deleteMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/environments/{id}", {
        params: { path: { id: "e1" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["environments"] })
      );
    });

    it("does not call the delete mutation when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Production");

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(deleteMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Delete this environment?")).not.toBeInTheDocument();
    });
  });

  describe("restore confirmation — Servers-don't-come-back warning", () => {
    it("requires confirmation before restoring, warning that servers will not come back", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([DELETED_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });
      postMock.mockResolvedValue({
        data: { ...DELETED_ENVIRONMENT, deleted_at: null },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const { invalidateSpy } = renderPage();
      await screen.findByText("Staging");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      expect(screen.getByText("Restore this environment?")).toBeInTheDocument();
      expect(screen.getByText(/will NOT come back/)).toBeInTheDocument();
      expect(postMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Restore" }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock).toHaveBeenCalledWith("/api/environments/{id}/restore", {
        params: { path: { id: "e2" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["environments"] })
      );
    });

    it("does not call the restore mutation when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([DELETED_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Staging");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(postMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Restore this environment?")).not.toBeInTheDocument();
    });
  });

  describe("deleted filter", () => {
    it("defaults to sending deleted=false", async () => {
      mockGetByPath({ environments: okResult([]), projects: okResult([]) });
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const call = getMock.mock.calls.find(([path]) => path === "/api/environments");
      expect(call?.[1].params.query.deleted).toBe("false");
    });
  });
});
