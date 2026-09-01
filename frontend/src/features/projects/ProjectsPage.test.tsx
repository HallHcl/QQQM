import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectDeletedTreatment } from "@/test/deletedRow";
import { actionsWrapperFor, expectDimmedIdleRowActions } from "@/test/hoverActions";
import ProjectsPage from "./ProjectsPage";
import {
  useCreateEnvironment,
  useDeleteEnvironment,
  useRestoreEnvironment,
} from "@/hooks/useEnvironments";

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
function mockGetByPath(handlers: {
  projects?: unknown;
  clients?: unknown;
  environments?: unknown;
}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/projects") return Promise.resolve(handlers.projects ?? okResult([]));
    if (path === "/api/clients") return Promise.resolve(handlers.clients ?? okResult([]));
    // Each rendered row fires one "N Environments" count query
    // (useChildCounts). Left unhandled it would throw below and every row
    // would silently render the count's error placeholder instead of a number.
    if (path === "/api/environments")
      return Promise.resolve(handlers.environments ?? okResult([]));
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

    it("marks a deleted project with a neutral Deleted badge and muted row text, never opacity", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        projects: okResult([DELETED_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
      });

      renderPage();

      expect(await screen.findByText("Legacy Rollback")).toBeInTheDocument();
      const badge = screen.getByText("Deleted");
      expect(badge).toBeInTheDocument();
      expectDeletedTreatment(badge, "Projects");
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

  describe("row actions stay reachable on touch devices", () => {
    it("keeps the row's Actions permanently visible — dimmed at idle, brightened on hover/focus, never hidden", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ projects: okResult([SAMPLE_PROJECT]), clients: okResult([SAMPLE_CLIENT]) });

      renderPage();
      await screen.findByText("Migration");

      expectDimmedIdleRowActions(
        actionsWrapperFor(screen.getByRole("button", { name: "Actions" })),
        "Projects"
      );
    });
  });

  describe("related counters (N Environments per project row)", () => {
    it("renders the child count returned by the per-row count query, pluralized", async () => {
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
        // per_page=1 responses carry one row of data but the real total.
        environments: okResult([{ id: "e1" }], 3),
      });

      renderPage();

      expect(await screen.findByText("3 Environments")).toBeInTheDocument();
    });

    it("uses the singular noun for a count of exactly 1", async () => {
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
        environments: okResult([{ id: "e1" }], 1),
      });

      renderPage();

      expect(await screen.findByText("1 Environment")).toBeInTheDocument();
    });

    it("requests only active children, one page-of-one per row", async () => {
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
        environments: okResult([], 0),
      });

      renderPage();

      await waitFor(() =>
        expect(getMock.mock.calls.some(([path]) => path === "/api/environments")).toBe(true)
      );
      const countCall = getMock.mock.calls.find(([path]) => path === "/api/environments");
      expect(countCall?.[1].params.query).toMatchObject({
        project_id: "p1",
        per_page: 1,
        deleted: "false",
      });
    });

    it("never renders a failed count as a resolved zero", async () => {
      mockGetByPath({
        projects: okResult([SAMPLE_PROJECT]),
        clients: okResult([SAMPLE_CLIENT]),
        environments: apiError(500, "Something broke"),
      });

      renderPage();

      expect(await screen.findByText("Migration")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTitle("Couldn't load environment count")).toBeInTheDocument()
      );
      expect(screen.queryByText("0 Environments")).not.toBeInTheDocument();
    });
  });

  describe("count invalidation after an Environment mutation (cross-entity, cross-page)", () => {
    // The Projects page renders the "N Environments" count, but nothing on
    // this page mutates environments — that happens on EnvironmentsPage or a
    // detail page, against the same QueryClient. Mounting a harness that
    // drives the real mutation hooks reproduces that, so what's under test is
    // this app's wiring: whether useEnvironments'
    // `invalidateQueries({ queryKey: ["environments"] })` prefix-matches the
    // count query's `["environments", { project_id, ... }]` key.
    function EnvironmentMutationHarness() {
      const createEnvironment = useCreateEnvironment();
      const deleteEnvironment = useDeleteEnvironment();
      const restoreEnvironment = useRestoreEnvironment();
      return (
        <div>
          <button
            onClick={() => createEnvironment.mutate({ project_id: "p1", name: "Staging" })}
          >
            harness-create
          </button>
          <button onClick={() => deleteEnvironment.mutate("e1")}>harness-delete</button>
          <button onClick={() => restoreEnvironment.mutate("e1")}>harness-restore</button>
        </div>
      );
    }

    function renderWithHarness() {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ProjectsPage />
            <EnvironmentMutationHarness />
          </MemoryRouter>
        </QueryClientProvider>
      );
    }

    /**
     * Serves the environment count from a mutable cell so a refetch after the
     * mutation observes a genuinely different total — the only way to tell a
     * real refetch from a cache read.
     */
    function mockCountThatChanges(initialTotal: number, totalAfterMutation: number) {
      const total = { current: initialTotal };
      getMock.mockImplementation((path: string) => {
        if (path === "/api/projects") return Promise.resolve(okResult([SAMPLE_PROJECT]));
        if (path === "/api/clients") return Promise.resolve(okResult([SAMPLE_CLIENT]));
        if (path === "/api/environments")
          return Promise.resolve(okResult([{ id: "e1" }], total.current));
        throw new Error(`Unexpected path in test: ${path}`);
      });
      const okMutation = {
        data: { id: "e1" },
        error: undefined,
        response: new Response(null, { status: 200 }),
      };
      postMock.mockImplementation(() => {
        total.current = totalAfterMutation;
        return Promise.resolve(okMutation);
      });
      deleteMock.mockImplementation(() => {
        total.current = totalAfterMutation;
        return Promise.resolve(okMutation);
      });
    }

    it("refetches the count after an environment is created", async () => {
      mockCountThatChanges(1, 2);
      renderWithHarness();

      expect(await screen.findByText("1 Environment")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-create"));

      expect(await screen.findByText("2 Environments")).toBeInTheDocument();
    });

    it("refetches the count after an environment is deleted", async () => {
      mockCountThatChanges(2, 1);
      renderWithHarness();

      expect(await screen.findByText("2 Environments")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-delete"));

      expect(await screen.findByText("1 Environment")).toBeInTheDocument();
    });

    it("refetches the count after an environment is restored", async () => {
      mockCountThatChanges(1, 2);
      renderWithHarness();

      expect(await screen.findByText("1 Environment")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-restore"));

      expect(await screen.findByText("2 Environments")).toBeInTheDocument();
    });
  });
});
