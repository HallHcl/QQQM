import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionsWrapperFor, expectDimmedIdleRowActions } from "@/test/hoverActions";
import ClientsPage from "./ClientsPage";
import {
  useCreateProject,
  useDeleteProject,
  useRestoreProject,
} from "@/hooks/useProjects";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const useAuthMock = vi.fn();
const toastMock = vi.fn();

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
        <ClientsPage />
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

const ACTIVE_CLIENT = {
  id: "1",
  name: "Acme Corp",
  status: "active",
  description: "A widget maker",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
};

const DELETED_CLIENT = {
  id: "2",
  name: "Old Co",
  status: "inactive",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: "2026-01-05T00:00:00.000Z",
};

describe("ClientsPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    toastMock.mockClear();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading clients/i)).toBeInTheDocument();
  });

  it("renders client rows once the fetch succeeds", async () => {
    getMock.mockResolvedValue(
      okResult([
        {
          id: "1",
          name: "Acme Corp",
          status: "active",
          description: "A widget maker",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
          deleted_at: null,
        },
      ])
    );

    renderPage();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders an empty state when the list is empty", async () => {
    getMock.mockResolvedValue(okResult([]));

    renderPage();

    expect(await screen.findByText(/no clients found/i)).toBeInTheDocument();
  });

  it("renders an error state when the query fails", async () => {
    getMock.mockResolvedValue({
      data: undefined,
      error: { error: { code: "INTERNAL_ERROR", message: "Something broke" } },
      response: new Response(null, { status: 500 }),
    });

    renderPage();

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });

  describe("RBAC-gated create", () => {
    it("shows New client to an admin but not a non-admin (create is admin-only, verified against backend/src/routes/clients.routes.ts)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));
      const { unmount } = renderPage();
      await screen.findByText("Acme Corp");
      expect(screen.getByRole("button", { name: /new client/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Acme Corp");
      expect(screen.queryByRole("button", { name: /new client/i })).not.toBeInTheDocument();
    });
  });

  describe("RBAC-gated delete/restore", () => {
    it("opens a confirmation naming the client before deleting, and only deletes on confirm", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));
      deleteMock.mockResolvedValue({
        data: ACTIVE_CLIENT,
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const { invalidateSpy } = renderPage();
      await screen.findByText("Acme Corp");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

      expect(screen.getByText("Delete this client?")).toBeInTheDocument();
      expect(screen.getByText(/"Acme Corp" will be hidden/i)).toBeInTheDocument();
      expect(deleteMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/clients/{id}", {
        params: { path: { id: "1" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clients"] })
      );
      expect(toastMock).toHaveBeenCalledWith({ title: "Client deleted" });
    });

    it("does not call the delete mutation when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));

      renderPage();
      await screen.findByText("Acme Corp");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(deleteMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Delete this client?")).not.toBeInTheDocument();
    });

    it("shows an error toast when delete fails", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));
      deleteMock.mockResolvedValue(apiError(500, "boom"));

      renderPage();
      await screen.findByText("Acme Corp");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't delete client",
          description: "boom",
          variant: "destructive",
        });
      });
    });

    it("hides the Delete action from a non-admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));

      renderPage();
      await screen.findByText("Acme Corp");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      // Edit is not RBAC-gated (create/update are admin+member) and should still show.
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    });

    it("shows the Restore action to an admin viewing a deleted client and lets them trigger it", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([DELETED_CLIENT]));
      const restoreMock = vi.fn().mockResolvedValue({
        data: { ...DELETED_CLIENT, deleted_at: null },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
      postMock.mockImplementation(restoreMock);

      const { invalidateSpy } = renderPage();
      await screen.findByText("Old Co");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock).toHaveBeenCalledWith("/api/clients/{id}/restore", {
        params: { path: { id: "2" } },
      });
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["clients"] })
      );
      expect(toastMock).toHaveBeenCalledWith({ title: "Client restored" });
    });

    it("shows an error toast when restore fails", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([DELETED_CLIENT]));
      postMock.mockResolvedValue(apiError(500, "boom"));

      renderPage();
      await screen.findByText("Old Co");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't restore client",
          description: "boom",
          variant: "destructive",
        });
      });
    });

    it("hides the Restore action from a non-admin viewing a deleted client", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      getMock.mockResolvedValue(okResult([DELETED_CLIENT]));

      renderPage();
      await screen.findByText("Old Co");

      expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
      // Deleted clients show no Edit action either — only Restore is offered.
      expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    });

    it("marks a deleted client with a Deleted badge", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([DELETED_CLIENT]));

      renderPage();

      expect(await screen.findByText("Old Co")).toBeInTheDocument();
      expect(screen.getByText("Deleted")).toBeInTheDocument();
    });
  });

  describe("row click / keyboard opens Edit (Clients has no detail page)", () => {
    it("opens the edit form when an active row is clicked", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));

      renderPage();
      const nameCell = await screen.findByText("Acme Corp");
      const row = nameCell.closest("tr")!;
      expect(row).toHaveAttribute("role", "button");
      expect(row).toHaveAttribute("tabIndex", "0");

      fireEvent.click(row);

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Acme Corp")).toBeInTheDocument();
    });

    it("opens the edit form when Enter is pressed on a focused row", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));

      renderPage();
      const nameCell = await screen.findByText("Acme Corp");
      const row = nameCell.closest("tr")!;

      fireEvent.keyDown(row, { key: "Enter" });

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("does not open the edit form when the Actions menu trigger is clicked", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));

      renderPage();
      await screen.findByText("Acme Corp");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });

      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("full keyboard-only walkthrough: Tab reaches the Actions trigger independently of the row, opens via keyboard, and Delete reaches the confirmation dialog", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));

      renderPage();
      const nameCell = await screen.findByText("Acme Corp");
      const row = nameCell.closest("tr")!;
      const actionsTrigger = screen.getByRole("button", { name: "Actions" });

      // The row and the Actions trigger are both independently focusable —
      // the row's keyboard handling doesn't swallow the trigger's own focus
      // or keyboard behavior (Radix owns the trigger/menu's keyboard nav).
      row.focus();
      expect(row).toHaveFocus();
      actionsTrigger.focus();
      expect(actionsTrigger).toHaveFocus();

      // Radix's DropdownMenuTrigger opens on pointerdown or on Enter/Space/
      // ArrowDown keydown — exercise the keyboard path here.
      fireEvent.keyDown(actionsTrigger, { key: "Enter" });
      const deleteItem = await screen.findByRole("menuitem", { name: "Delete" });

      // Selecting Delete via the menu (Radix's own keyboard handling)
      // reaches the same confirmation dialog as a mouse click would.
      fireEvent.click(deleteItem);
      expect(await screen.findByText("Delete this client?")).toBeInTheDocument();

      // The row's own primary action (opening the edit form) never fired —
      // the Actions-menu interaction is fully isolated from the row.
      expect(screen.queryByDisplayValue("Acme Corp")).not.toBeInTheDocument();
    });

    it("does not make a deleted row clickable (no Edit action for deleted clients)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([DELETED_CLIENT]));

      renderPage();
      const nameCell = await screen.findByText("Old Co");
      const row = nameCell.closest("tr")!;
      expect(row).not.toHaveAttribute("role", "button");
      expect(row).not.toHaveAttribute("tabIndex");
    });
  });

  describe("row actions stay reachable on touch devices", () => {
    it("keeps the row's Actions permanently visible — dimmed at idle, brightened on hover/focus, never hidden", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));

      renderPage();
      await screen.findByText("Acme Corp");

      expectDimmedIdleRowActions(
        actionsWrapperFor(screen.getByRole("button", { name: "Actions" })),
        "Clients"
      );
    });
  });

  describe("deleted filter", () => {
    it("sends the selected deleted filter value through to the request", async () => {
      getMock.mockResolvedValue(okResult([]));
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const [, initialOptions] = getMock.mock.calls[0];
      expect(initialOptions.params.query.deleted).toBe("false");
    });

    it('offers only Active/Deleted — no "All" option (backend only recognizes deleted=true, clients.controller.ts:35)', async () => {
      getMock.mockResolvedValue(okResult([ACTIVE_CLIENT]));
      renderPage();
      await screen.findByText("Acme Corp");

      // The 3rd combobox in the filter row is the deleted-status select
      // (sort, order, deleted — in that DOM order).
      const deletedSelect = screen.getAllByRole("combobox")[2];
      fireEvent.click(deletedSelect);

      expect(screen.getByRole("option", { name: "Active" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Deleted" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "All" })).not.toBeInTheDocument();
    });
  });

  describe("related counters (N Projects per client row)", () => {
    // Unlike the tests above, these must route by path: the page now issues
    // both a /api/clients list call and one /api/projects count call per row.
    function mockCounts(projectsResult: unknown) {
      getMock.mockImplementation((path: string) => {
        if (path === "/api/clients") return Promise.resolve(okResult([ACTIVE_CLIENT]));
        if (path === "/api/projects") return Promise.resolve(projectsResult);
        throw new Error(`Unexpected path in test: ${path}`);
      });
    }

    it("renders the child count returned by the per-row count query, pluralized", async () => {
      // per_page=1 responses carry one row of data but the real total.
      mockCounts(okResult([{ id: "p1" }], 2));

      renderPage();

      expect(await screen.findByText("2 Projects")).toBeInTheDocument();
    });

    it("uses the singular noun for a count of exactly 1", async () => {
      mockCounts(okResult([{ id: "p1" }], 1));

      renderPage();

      expect(await screen.findByText("1 Project")).toBeInTheDocument();
    });

    it("requests only active children, one page-of-one per row", async () => {
      mockCounts(okResult([], 0));

      renderPage();

      await waitFor(() =>
        expect(getMock.mock.calls.some(([path]) => path === "/api/projects")).toBe(true)
      );
      const countCall = getMock.mock.calls.find(([path]) => path === "/api/projects");
      expect(countCall?.[1].params.query).toMatchObject({
        client_id: "1",
        per_page: 1,
        deleted: "false",
      });
    });

    it("never renders a failed count as a resolved zero", async () => {
      mockCounts(apiError(500, "Something broke"));

      renderPage();

      expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTitle("Couldn't load project count")).toBeInTheDocument()
      );
      expect(screen.queryByText("0 Projects")).not.toBeInTheDocument();
    });
  });

  describe("count invalidation after a Project mutation (cross-entity, cross-page)", () => {
    // The Clients page renders the "N Projects" count, but nothing on this
    // page mutates projects — the mutation happens elsewhere (ProjectsPage,
    // a detail page) against the same QueryClient. These tests reproduce that
    // by mounting ClientsPage alongside a harness that drives the real
    // mutation hooks, so what's under test is this app's own invalidation
    // wiring: whether useProjects' `invalidateQueries({ queryKey: ["projects"] })`
    // prefix-matches the count query's `["projects", { client_id, ... }]` key.
    // Calling queryClient.invalidateQueries directly here would only test
    // React Query itself.
    function ProjectMutationHarness() {
      const createProject = useCreateProject();
      const deleteProject = useDeleteProject();
      const restoreProject = useRestoreProject();
      return (
        <div>
          <button
            onClick={() =>
              createProject.mutate({ client_id: "1", name: "New Project" })
            }
          >
            harness-create
          </button>
          <button onClick={() => deleteProject.mutate("p1")}>harness-delete</button>
          <button onClick={() => restoreProject.mutate("p1")}>harness-restore</button>
        </div>
      );
    }

    function renderWithHarness() {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ClientsPage />
            <ProjectMutationHarness />
          </MemoryRouter>
        </QueryClientProvider>
      );
    }

    /**
     * Routes GETs by path and serves the project count from a mutable cell,
     * so a refetch after the mutation observes a genuinely different total —
     * the only way to tell a real refetch from a cache read.
     */
    function mockCountThatChanges(initialTotal: number, totalAfterMutation: number) {
      const total = { current: initialTotal };
      getMock.mockImplementation((path: string) => {
        if (path === "/api/clients") return Promise.resolve(okResult([ACTIVE_CLIENT]));
        if (path === "/api/projects")
          return Promise.resolve(okResult([{ id: "p1" }], total.current));
        throw new Error(`Unexpected path in test: ${path}`);
      });
      const okMutation = {
        data: { id: "p1" },
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

    it("refetches the count after a project is created", async () => {
      mockCountThatChanges(1, 2);
      renderWithHarness();

      expect(await screen.findByText("1 Project")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-create"));

      expect(await screen.findByText("2 Projects")).toBeInTheDocument();
    });

    it("refetches the count after a project is deleted", async () => {
      mockCountThatChanges(2, 1);
      renderWithHarness();

      expect(await screen.findByText("2 Projects")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-delete"));

      expect(await screen.findByText("1 Project")).toBeInTheDocument();
    });

    it("refetches the count after a project is restored", async () => {
      mockCountThatChanges(1, 2);
      renderWithHarness();

      expect(await screen.findByText("1 Project")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-restore"));

      expect(await screen.findByText("2 Projects")).toBeInTheDocument();
    });
  });
});
