import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionsWrapperFor, expectDimmedIdleRowActions } from "@/test/hoverActions";
import EnvironmentsPage from "./EnvironmentsPage";
import {
  useCreateServer,
  useDeleteServer,
  useRestoreServer,
} from "@/hooks/useServers";

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
function mockGetByPath(handlers: {
  environments?: unknown;
  projects?: unknown;
  servers?: unknown;
}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/environments") return Promise.resolve(handlers.environments ?? okResult([]));
    if (path === "/api/projects") return Promise.resolve(handlers.projects ?? okResult([]));
    // Each rendered row fires one "N Servers" count query (useChildCounts).
    // Left unhandled it would throw below and every row would silently render
    // the count's error placeholder instead of a number.
    if (path === "/api/servers") return Promise.resolve(handlers.servers ?? okResult([]));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

describe("EnvironmentsPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    toastMock.mockClear();
    navigateMock.mockClear();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("navigates to the environment's detail page when the row is clicked", async () => {
    mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });
    renderPage();

    const nameCell = await screen.findByText("Production");
    const row = nameCell.closest("tr")!;
    expect(row).toHaveAttribute("role", "button");
    fireEvent.click(row);

    expect(navigateMock).toHaveBeenCalledWith("/environments/e1");
  });

  it("navigates to the environment's detail page when Enter is pressed on a focused row", async () => {
    mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });
    renderPage();

    const nameCell = await screen.findByText("Production");
    const row = nameCell.closest("tr")!;
    fireEvent.keyDown(row, { key: "Enter" });

    expect(navigateMock).toHaveBeenCalledWith("/environments/e1");
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

    it("hides the Actions menu entirely from a non-admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Production");

      expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    });

    it("shows Edit and Delete to an admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Production");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
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

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

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
      expect(toastMock).toHaveBeenCalledWith({ title: "Environment deleted" });
    });

    it("shows an error toast when delete fails", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });
      deleteMock.mockResolvedValue(apiError(500, "boom"));

      renderPage();
      await screen.findByText("Production");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't delete environment",
          description: "boom",
          variant: "destructive",
        });
      });
    });

    it("does not call the delete mutation when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([SAMPLE_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });

      renderPage();
      await screen.findByText("Production");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
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
      expect(toastMock).toHaveBeenCalledWith({ title: "Environment restored" });
    });

    it("shows an error toast when restore fails", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ environments: okResult([DELETED_ENVIRONMENT]), projects: okResult([SAMPLE_PROJECT]) });
      postMock.mockResolvedValue(apiError(500, "boom"));

      renderPage();
      await screen.findByText("Staging");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't restore environment",
          description: "boom",
          variant: "destructive",
        });
      });
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

  describe("row actions stay reachable on touch devices", () => {
    it("keeps the row's Actions permanently visible — dimmed at idle, brightened on hover/focus, never hidden", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({
        environments: okResult([SAMPLE_ENVIRONMENT]),
        projects: okResult([SAMPLE_PROJECT]),
      });

      renderPage();
      await screen.findByText("Production");

      expectDimmedIdleRowActions(
        actionsWrapperFor(screen.getByRole("button", { name: "Actions" })),
        "Environments"
      );
    });
  });

  describe("related counters (N Servers per environment row)", () => {
    it("renders the child count returned by the per-row count query, pluralized", async () => {
      mockGetByPath({
        environments: okResult([SAMPLE_ENVIRONMENT]),
        projects: okResult([SAMPLE_PROJECT]),
        // per_page=1 responses carry one row of data but the real total.
        servers: okResult([{ id: "s1" }], 4),
      });

      renderPage();

      expect(await screen.findByText("4 Servers")).toBeInTheDocument();
    });

    it("uses the singular noun for a count of exactly 1", async () => {
      mockGetByPath({
        environments: okResult([SAMPLE_ENVIRONMENT]),
        projects: okResult([SAMPLE_PROJECT]),
        servers: okResult([{ id: "s1" }], 1),
      });

      renderPage();

      expect(await screen.findByText("1 Server")).toBeInTheDocument();
    });

    it("requests only active children, one page-of-one per row", async () => {
      mockGetByPath({
        environments: okResult([SAMPLE_ENVIRONMENT]),
        projects: okResult([SAMPLE_PROJECT]),
        servers: okResult([], 0),
      });

      renderPage();

      await waitFor(() =>
        expect(getMock.mock.calls.some(([path]) => path === "/api/servers")).toBe(true)
      );
      const countCall = getMock.mock.calls.find(([path]) => path === "/api/servers");
      expect(countCall?.[1].params.query).toMatchObject({
        environment_id: "e1",
        per_page: 1,
        deleted: "false",
      });
    });

    it("never renders a failed count as a resolved zero", async () => {
      mockGetByPath({
        environments: okResult([SAMPLE_ENVIRONMENT]),
        projects: okResult([SAMPLE_PROJECT]),
        servers: apiError(500, "Something broke"),
      });

      renderPage();

      expect(await screen.findByText("Production")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTitle("Couldn't load server count")).toBeInTheDocument()
      );
      expect(screen.queryByText("0 Servers")).not.toBeInTheDocument();
    });
  });

  describe("count invalidation after a Server mutation (cross-entity, cross-page)", () => {
    // The Environments page renders the "N Servers" count, but nothing on
    // this page mutates servers — that happens on ServersPage or a detail
    // page, against the same QueryClient. Mounting a harness that drives the
    // real mutation hooks reproduces that, so what's under test is this app's
    // wiring: whether useServers'
    // `invalidateQueries({ queryKey: ["servers"] })` prefix-matches the count
    // query's `["servers", { environment_id, ... }]` key.
    function ServerMutationHarness() {
      const createServer = useCreateServer();
      const deleteServer = useDeleteServer();
      const restoreServer = useRestoreServer();
      return (
        <div>
          <button
            onClick={() =>
              createServer.mutate({
                environment_id: "e1",
                display_name: "web-01",
                hostname: "web-01.internal",
                service_type: "application",
                access_method: "ssh",
                access_host: "web-01.internal",
              })
            }
          >
            harness-create
          </button>
          <button onClick={() => deleteServer.mutate("s1")}>harness-delete</button>
          <button onClick={() => restoreServer.mutate("s1")}>harness-restore</button>
        </div>
      );
    }

    function renderWithHarness() {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <EnvironmentsPage />
            <ServerMutationHarness />
          </MemoryRouter>
        </QueryClientProvider>
      );
    }

    /**
     * Serves the server count from a mutable cell so a refetch after the
     * mutation observes a genuinely different total — the only way to tell a
     * real refetch from a cache read.
     */
    function mockCountThatChanges(initialTotal: number, totalAfterMutation: number) {
      const total = { current: initialTotal };
      getMock.mockImplementation((path: string) => {
        if (path === "/api/environments")
          return Promise.resolve(okResult([SAMPLE_ENVIRONMENT]));
        if (path === "/api/projects") return Promise.resolve(okResult([SAMPLE_PROJECT]));
        if (path === "/api/servers")
          return Promise.resolve(okResult([{ id: "s1" }], total.current));
        throw new Error(`Unexpected path in test: ${path}`);
      });
      const okMutation = {
        data: { id: "s1" },
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

    it("refetches the count after a server is created", async () => {
      mockCountThatChanges(1, 2);
      renderWithHarness();

      expect(await screen.findByText("1 Server")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-create"));

      expect(await screen.findByText("2 Servers")).toBeInTheDocument();
    });

    it("refetches the count after a server is deleted", async () => {
      mockCountThatChanges(2, 1);
      renderWithHarness();

      expect(await screen.findByText("2 Servers")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-delete"));

      expect(await screen.findByText("1 Server")).toBeInTheDocument();
    });

    it("refetches the count after a server is restored", async () => {
      mockCountThatChanges(1, 2);
      renderWithHarness();

      expect(await screen.findByText("1 Server")).toBeInTheDocument();

      fireEvent.click(screen.getByText("harness-restore"));

      expect(await screen.findByText("2 Servers")).toBeInTheDocument();
    });
  });
});
