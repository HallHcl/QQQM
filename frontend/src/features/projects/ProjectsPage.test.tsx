import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsPage from "./ProjectsPage";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const useAuthMock = vi.fn();
const toastMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

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

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

function apiError(status: number, message: string) {
  return {
    data: undefined,
    error: { error: { message } },
    response: new Response(null, { status }),
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectsPage />
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

const SAMPLE_CLIENT = {
  id: "c1",
  name: "Acme Corp",
  status: "active",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const SAMPLE_PROJECT = {
  id: "p1",
  client_id: "c1",
  name: "Migration",
  description: "Legacy data migration",
  owner_status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
};

// ProjectsPage also fetches clients (to resolve client_id -> name for
// display), so the GET mock must route by path.
function mockGetByPath(handlers: { projects?: unknown; clients?: unknown }) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/projects") return Promise.resolve(handlers.projects ?? okResult([]));
    if (path === "/api/clients") return Promise.resolve(handlers.clients ?? okResult([]));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

const DELETED_PROJECT = {
  ...SAMPLE_PROJECT,
  id: "p2",
  name: "Legacy Rollback",
  deleted_at: "2026-01-05T00:00:00.000Z",
};

describe("ProjectsPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    toastMock.mockClear();
    navigateMock.mockClear();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("navigates to the project's detail page when the row is clicked", async () => {
    mockGetByPath({ projects: okResult([SAMPLE_PROJECT]), clients: okResult([SAMPLE_CLIENT]) });
    renderPage();

    const nameCell = await screen.findByText("Migration");
    const row = nameCell.closest("tr")!;
    expect(row).toHaveAttribute("role", "button");
    fireEvent.click(row);

    expect(navigateMock).toHaveBeenCalledWith("/projects/p1");
  });

  it("navigates to the project's detail page when Enter is pressed on a focused row", async () => {
    mockGetByPath({ projects: okResult([SAMPLE_PROJECT]), clients: okResult([SAMPLE_CLIENT]) });
    renderPage();

    const nameCell = await screen.findByText("Migration");
    const row = nameCell.closest("tr")!;
    fireEvent.keyDown(row, { key: "Enter" });

    expect(navigateMock).toHaveBeenCalledWith("/projects/p1");
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading projects/i)).toBeInTheDocument();
  });

  it("renders project rows once the fetch succeeds", async () => {
    mockGetByPath({
      projects: okResult([SAMPLE_PROJECT]),
      clients: okResult([SAMPLE_CLIENT]),
    });

    renderPage();

    expect(await screen.findByText("Migration")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders an empty state when the list is empty", async () => {
    mockGetByPath({ projects: okResult([]), clients: okResult([]) });

    renderPage();

    expect(await screen.findByText(/no projects found/i)).toBeInTheDocument();
  });

  it("renders an error state when the query fails", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/api/projects") {
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

  describe("RBAC-gated delete/restore", () => {
    it("shows Delete to an admin, opens a confirmation, and only deletes on confirm", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });
      deleteMock.mockResolvedValue({
        data: SAMPLE_PROJECT,
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const { invalidateSpy } = renderPage();
      await screen.findByText("Migration");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

      // Confirmation dialog is shown; the mutation has not fired yet.
      expect(screen.getByText("Delete this project?")).toBeInTheDocument();
      expect(
        screen.getByText(/its environments, servers, and schedules are not deleted or hidden/i)
      ).toBeInTheDocument();
      expect(deleteMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/projects/{id}", {
        params: { path: { id: "p1" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] })
      );
      expect(toastMock).toHaveBeenCalledWith({ title: "Project deleted" });
    });

    it("shows an error toast when delete fails", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });
      deleteMock.mockResolvedValue(apiError(500, "boom"));

      renderPage();
      await screen.findByText("Migration");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't delete project",
          description: "boom",
          variant: "destructive",
        });
      });
    });

    it("does not call the delete mutation when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });

      renderPage();
      await screen.findByText("Migration");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      expect(screen.getByText("Delete this project?")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(deleteMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Delete this project?")).not.toBeInTheDocument();
    });

    it("hides Delete and Edit from a non-admin (create/update are admin-only on Projects, verified against backend/src/routes/projects.routes.ts) — Actions menu doesn't render at all", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });

      renderPage();
      await screen.findByText("Migration");

      expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    });

    it("shows Edit to an admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });

      renderPage();
      await screen.findByText("Migration");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    });

    it("shows New project to an admin but not to a non-admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ projects: okResult([SAMPLE_PROJECT]), clients: okResult([SAMPLE_CLIENT]) });
      const { unmount } = renderPage();
      await screen.findByText("Migration");
      expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Migration");
      expect(screen.queryByRole("button", { name: /new project/i })).not.toBeInTheDocument();
    });

    it("shows Restore to an admin viewing a deleted project and lets them trigger it directly (no confirmation)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        projects: okResult([DELETED_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });
      postMock.mockResolvedValue({
        data: { ...DELETED_PROJECT, deleted_at: null },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const { invalidateSpy } = renderPage();
      await screen.findByText("Legacy Rollback");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock).toHaveBeenCalledWith("/api/projects/{id}/restore", {
        params: { path: { id: "p2" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] })
      );
      expect(toastMock).toHaveBeenCalledWith({ title: "Project restored" });
    });

    it("shows an error toast when restore fails", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        projects: okResult([DELETED_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });
      postMock.mockResolvedValue(apiError(500, "boom"));

      renderPage();
      await screen.findByText("Legacy Rollback");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't restore project",
          description: "boom",
          variant: "destructive",
        });
      });
    });

    it("hides the Restore action from a non-admin viewing a deleted project", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({
        projects: okResult([DELETED_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });

      renderPage();
      await screen.findByText("Legacy Rollback");

      expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
      // Deleted rows show no Edit action either — only Restore is offered.
      expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    });

    it("marks a deleted project with a Deleted badge", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        projects: okResult([DELETED_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });

      renderPage();

      expect(await screen.findByText("Legacy Rollback")).toBeInTheDocument();
      expect(screen.getByText("Deleted")).toBeInTheDocument();
    });
  });

  describe("deleted filter", () => {
    it("defaults to sending deleted=false", async () => {
      mockGetByPath({ projects: okResult([]), clients: okResult([]) });
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const projectsCall = getMock.mock.calls.find(([path]) => path === "/api/projects");
      expect(projectsCall?.[1].params.query.deleted).toBe("false");
    });
  });

  describe("client column when the parent client is soft-deleted (no cascade — decisions.md #6)", () => {
    it("still resolves the real client name instead of falling back to '—', since the project stays fully visible and functional", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      const DELETED_CLIENT = {
        ...SAMPLE_CLIENT,
        id: "c-orphan",
        name: "Orphan Test Client",
        deleted_at: "2026-01-10T00:00:00.000Z",
      };
      mockGetByPath({
        projects: okResult([{ ...SAMPLE_PROJECT, client_id: "c-orphan" }]),
        // Both the active-clients call and the deleted-clients call hit this
        // same handler in the test double — asserting on the merged result,
        // not on which of the two calls actually carried the deleted client.
        clients: okResult([DELETED_CLIENT]),
      });

      renderPage();

      expect(await screen.findByText("Migration")).toBeInTheDocument();
      expect(screen.getByText("Orphan Test Client")).toBeInTheDocument();
      expect(screen.queryByText("—")).not.toBeInTheDocument();
    });
  });
});
