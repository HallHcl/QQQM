import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServersPage from "./ServersPage";

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
        <ServersPage />
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

const SAMPLE_SERVER = {
  id: "s1",
  environment_id: "e1",
  hostname: "web-01",
  ip_address: "10.0.0.1",
  tech_stack: ["node"],
  monitoring_url: null,
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  display_name: "Web 01",
  service_type: "application",
  access_method: "ssh",
  access_host: "web-01.internal",
  access_port: 22,
  access_path: null,
};

const DELETED_SERVER = {
  ...SAMPLE_SERVER,
  id: "s2",
  display_name: "Web 02",
  deleted_at: "2026-01-05T00:00:00.000Z",
};

// ServersPage also fetches environments (to resolve environment_id -> name
// for display), so the GET mock must route by path.
function mockGetByPath(handlers: { servers?: unknown; environments?: unknown }) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/servers") return Promise.resolve(handlers.servers ?? okResult([]));
    if (path === "/api/environments") return Promise.resolve(handlers.environments ?? okResult([]));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

describe("ServersPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    toastMock.mockClear();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading servers/i)).toBeInTheDocument();
  });

  it("renders server rows once the fetch succeeds, including the resolved environment name", async () => {
    mockGetByPath({
      servers: okResult([SAMPLE_SERVER]),
      environments: okResult([SAMPLE_ENVIRONMENT]),
    });

    renderPage();

    expect(await screen.findByText("Web 01")).toBeInTheDocument();
    expect(screen.getByText("web-01")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Application")).toBeInTheDocument();
    expect(screen.getByText("SSH")).toBeInTheDocument();
  });

  it("renders an empty state when the list is empty", async () => {
    mockGetByPath({ servers: okResult([]), environments: okResult([]) });

    renderPage();

    expect(await screen.findByText(/no servers found/i)).toBeInTheDocument();
  });

  it("renders an error state when the query fails", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/api/servers") {
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

  describe("RBAC — Server create/update is admin+member, delete/restore is admin-only (verified against backend/src/routes/servers.routes.ts, deliberately NOT Environments' admin-only-everything gating)", () => {
    it("shows New server to both admin and member", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ servers: okResult([SAMPLE_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });
      const { unmount } = renderPage();
      await screen.findByText("Web 01");
      expect(screen.getByRole("button", { name: /new server/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      renderPage();
      await screen.findByText("Web 01");
      expect(screen.getByRole("button", { name: /new server/i })).toBeInTheDocument();
    });

    it("shows Edit but not Delete to a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ servers: okResult([SAMPLE_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });

      renderPage();
      await screen.findByText("Web 01");

      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("shows both Edit and Delete to an admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([SAMPLE_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });

      renderPage();
      await screen.findByText("Web 01");

      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    });

    it("hides Restore from a member viewing a deleted server", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({ servers: okResult([DELETED_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });

      renderPage();
      await screen.findByText("Web 02");

      expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    });

    it("shows Restore to an admin viewing a deleted server", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([DELETED_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });

      renderPage();
      await screen.findByText("Web 02");

      expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
    });

    it("marks a deleted server with a Deleted badge", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([DELETED_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });

      renderPage();

      expect(await screen.findByText("Web 02")).toBeInTheDocument();
      expect(screen.getByText("Deleted")).toBeInTheDocument();
    });
  });

  describe("delete confirmation — accurate hard-delete-of-credentials copy", () => {
    it("opens a confirmation describing the permanent credential-reference removal, and only deletes on confirm", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([SAMPLE_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });
      deleteMock.mockResolvedValue({
        data: SAMPLE_SERVER,
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const { invalidateSpy } = renderPage();
      await screen.findByText("Web 01");

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));

      expect(screen.getByText("Delete this server?")).toBeInTheDocument();
      expect(screen.getByText(/permanently removes \(hard-deletes\) its stored credential references/i)).toBeInTheDocument();
      expect(deleteMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/servers/{id}", {
        params: { path: { id: "s1" } },
      });
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["servers"] }));
      expect(toastMock).toHaveBeenCalledWith({ title: "Server deleted" });
    });

    it("shows an error toast when delete fails", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([SAMPLE_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });
      deleteMock.mockResolvedValue(apiError(500, "boom"));

      renderPage();
      await screen.findByText("Web 01");

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't delete server",
          description: "boom",
          variant: "destructive",
        });
      });
    });

    it("does not call the delete mutation when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([SAMPLE_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });

      renderPage();
      await screen.findByText("Web 01");

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(deleteMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Delete this server?")).not.toBeInTheDocument();
    });
  });

  describe("restore confirmation — credential references don't come back (data loss on the server's own children, a new kind of warning vs. Environments' sibling-entity warning)", () => {
    it("requires confirmation before restoring, warning that credential references will not come back", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([DELETED_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });
      postMock.mockResolvedValue({
        data: { ...DELETED_SERVER, deleted_at: null },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

      const { invalidateSpy } = renderPage();
      await screen.findByText("Web 02");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      expect(screen.getByText("Restore this server?")).toBeInTheDocument();
      expect(screen.getByText(/credential references it had before deletion will NOT come back/i)).toBeInTheDocument();
      expect(postMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Restore" }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock).toHaveBeenCalledWith("/api/servers/{id}/restore", {
        params: { path: { id: "s2" } },
      });
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["servers"] }));
      expect(toastMock).toHaveBeenCalledWith({ title: "Server restored" });
    });

    it("shows an error toast when restore fails", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([DELETED_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });
      postMock.mockResolvedValue(apiError(500, "boom"));

      renderPage();
      await screen.findByText("Web 02");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't restore server",
          description: "boom",
          variant: "destructive",
        });
      });
    });

    it("does not call the restore mutation when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ servers: okResult([DELETED_SERVER]), environments: okResult([SAMPLE_ENVIRONMENT]) });

      renderPage();
      await screen.findByText("Web 02");

      fireEvent.click(screen.getByRole("button", { name: /restore/i }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(postMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Restore this server?")).not.toBeInTheDocument();
    });
  });

  describe("deleted filter", () => {
    it("defaults to sending deleted=false", async () => {
      mockGetByPath({ servers: okResult([]), environments: okResult([]) });
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const call = getMock.mock.calls.find(([path]) => path === "/api/servers");
      expect(call?.[1].params.query.deleted).toBe("false");
    });
  });
});
