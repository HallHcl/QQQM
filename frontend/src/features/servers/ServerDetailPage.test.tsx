import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerDetailPage from "./ServerDetailPage";

const getMock = vi.fn();
const patchMock = vi.fn();
const toastMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      PATCH: (...args: unknown[]) => patchMock(...args),
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function apiError(status: number, code: string, message: string, details?: unknown) {
  return {
    data: undefined,
    error: { error: { code, message, details } },
    response: new Response(null, { status }),
  };
}

const SERVER_DETAIL = {
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
  environment: { id: "e1", name: "Production", project: { id: "p1", name: "Migration" } },
};

function mockGetByPath(handlers: { server?: unknown; credentials?: unknown }) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/servers/{id}") return Promise.resolve(handlers.server ?? ok(SERVER_DETAIL));
    if (path === "/api/servers/{serverId}/credential-references")
      return Promise.resolve(handlers.credentials ?? ok([]));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

function renderPage(initialPath = "/servers/s1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/servers/:id" element={<ServerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ServerDetailPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading server/i)).toBeInTheDocument();
  });

  it("renders the server's Access Documentation fields once loaded, including the parent environment and project", async () => {
    mockGetByPath({});

    renderPage();

    expect(await screen.findByText("Web 01")).toBeInTheDocument();
    expect(screen.getByText("web-01")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText(/Migration/)).toBeInTheDocument();
    expect(screen.getByText("Application")).toBeInTheDocument();
    expect(screen.getByText("SSH")).toBeInTheDocument();
    expect(screen.getByText("web-01.internal")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
  });

  it("renders a not-found error state for a missing server", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/api/servers/{id}") {
        return Promise.resolve(apiError(404, "NOT_FOUND", "Server not found"));
      }
      return Promise.resolve(ok([]));
    });

    renderPage();

    expect(await screen.findByText("Server not found")).toBeInTheDocument();
  });

  it("renders the credential references section as a management surface (Part 23d): visible list, Add gated to admin+member, Delete gated to admin only", async () => {
    mockGetByPath({
      credentials: ok([
        {
          id: "c1",
          server_id: "s1",
          label: "Vault path",
          reference_location: "secret/servers/web-01",
          notes: null,
          created_at: "2026-01-01T00:00:00.000Z",
          applies_to_access_method: "ssh",
        },
      ]),
    });
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });

    renderPage();

    expect(await screen.findByText("Credential references")).toBeInTheDocument();
    expect(await screen.findByText("Vault path")).toBeInTheDocument();
    expect(screen.getByText("secret/servers/web-01")).toBeInTheDocument();
    // Add is admin+member — visible to a member.
    expect(screen.getByRole("button", { name: /add credential reference/i })).toBeInTheDocument();
    // Delete is admin-only — not visible to a member (full CRUD gating is
    // covered in depth by CredentialRefList.test.tsx).
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  describe("Edit gating — admin+member (Server update, NOT admin-only like Environments)", () => {
    it("shows the Edit button to a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({});

      renderPage();

      expect(await screen.findByText("Web 01")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });

    it("shows the Edit button to an admin", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({});

      renderPage();

      expect(await screen.findByText("Web 01")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });
  });

  describe("Edit mode (inline ServerEditCard, replacing the old modal)", () => {
    it("clicking Edit switches Card 1 to the inline form, pre-filled from the loaded record, with the environment locked", async () => {
      mockGetByPath({});
      renderPage();

      await screen.findByText("Web 01");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      expect(await screen.findByLabelText("Display name")).toHaveValue("Web 01");
      expect(screen.getByLabelText("Hostname")).toHaveValue("web-01");
      expect(
        screen.getByText("A server's environment can't be changed after creation.")
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("Production")).toBeDisabled();
      // The header Edit button is gone while editing; Save/Cancel take its place.
      expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });

    it("loading /servers/s1?edit=true directly (deep link) enters edit mode without clicking Edit first", async () => {
      mockGetByPath({});
      renderPage("/servers/s1?edit=true");

      expect(await screen.findByLabelText("Display name")).toHaveValue("Web 01");
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });

    it("ignores ?edit=true in the URL for a role without edit permission (defensive gating, matches the Edit button's own RequireRole)", async () => {
      useAuthMock.mockReturnValue({ roles: [], isLoading: false });
      mockGetByPath({});
      renderPage("/servers/s1?edit=true");

      await screen.findByText("Web 01");
      expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    });

    it("Save sends a PATCH with updated_at and no environment_id, then returns to read mode", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValue(ok({ ...SERVER_DETAIL, hostname: "web-01-renamed" }));
      renderPage();

      await screen.findByText("Web 01");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      await screen.findByDisplayValue("web-01");
      fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "web-01-renamed" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      const [path, options] = patchMock.mock.calls[0];
      expect(path).toBe("/api/servers/{id}");
      expect(options.params).toEqual({ path: { id: "s1" } });
      expect(options.body).toMatchObject({
        hostname: "web-01-renamed",
        updated_at: SERVER_DETAIL.updated_at,
      });
      expect(options.body.environment_id).toBeUndefined();

      // Back in read mode: Save/Cancel gone, Edit button back.
      await waitFor(() => expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument());
    });

    it("Cancel discards changes without firing a mutation, and re-entering edit shows the original value, not the discarded one", async () => {
      mockGetByPath({});
      renderPage();

      await screen.findByText("Web 01");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      await screen.findByDisplayValue("web-01");
      fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "My In-Progress Edit" } });
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      expect(patchMock).not.toHaveBeenCalled();
      await screen.findByRole("button", { name: /^edit$/i });
      expect(screen.getByText("web-01")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      expect(await screen.findByLabelText("Hostname")).toHaveValue("web-01");
    });

    it("shows the conflict UI (not a generic error) on a stale-write 409, and does not lose the user's edit", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValueOnce(
        apiError(409, "CONFLICT", "Server was modified by someone else; refresh and try again")
      );
      renderPage();

      await screen.findByText("Web 01");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      await screen.findByDisplayValue("web-01");
      fireEvent.change(screen.getByLabelText("Hostname"), { target: { value: "My In-Progress Edit" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(await screen.findByText("This record changed")).toBeInTheDocument();
      expect(
        screen.getByText("Server was modified by someone else; refresh and try again")
      ).toBeInTheDocument();
      expect(toastMock).not.toHaveBeenCalled();

      const freshRecord = { ...SERVER_DETAIL, updated_at: "2026-01-03T00:00:00.000Z" };
      getMock.mockImplementation((path: string) => {
        if (path === "/api/servers/{id}") return Promise.resolve(ok(freshRecord));
        if (path === "/api/servers/{serverId}/credential-references") return Promise.resolve(ok([]));
        throw new Error(`Unexpected path in test: ${path}`);
      });
      patchMock.mockResolvedValueOnce(ok({ ...freshRecord, hostname: "My In-Progress Edit" }));

      fireEvent.click(screen.getByRole("button", { name: /keep my changes/i }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
      const [, retryOptions] = patchMock.mock.calls[1];
      expect(retryOptions.body).toMatchObject({
        hostname: "My In-Progress Edit",
        updated_at: freshRecord.updated_at,
      });
    });

    it("surfaces a server-side validation error against the relevant field", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValue(
        apiError(400, "VALIDATION_ERROR", "Validation failed", {
          formErrors: [],
          fieldErrors: { hostname: ["String must contain at least 1 character(s)"] },
        })
      );
      renderPage();

      await screen.findByText("Web 01");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      await screen.findByDisplayValue("web-01");
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(
        await screen.findByText("String must contain at least 1 character(s)")
      ).toBeInTheDocument();
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't update server",
        description: "Check the highlighted fields below.",
        variant: "destructive",
      });
    });

    it("shows an error toast for an unexpected (non-conflict) failure", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValue(apiError(500, "INTERNAL", "boom"));
      renderPage();

      await screen.findByText("Web 01");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      await screen.findByDisplayValue("web-01");
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't update server",
          description: "boom",
          variant: "destructive",
        });
      });
    });
  });

  describe("credential-reference gating after the two-column shell refactor", () => {
    // The audit warned that this section carries four distinct permission
    // conditions (manageable + Add/Edit admin+member + Delete admin-only) and
    // must move into the shell's `aside` as a unit rather than be re-derived.
    // These lock all four in place from the page's own perspective.
    const CREDENTIAL = {
      id: "c1",
      server_id: "s1",
      label: "Vault path",
      reference_location: "secret/servers/web-01",
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
      applies_to_access_method: "ssh",
    };

    it("shows Add and Edit but not Delete to a member", async () => {
      mockGetByPath({ credentials: ok([CREDENTIAL]) });
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });

      renderPage();

      expect(await screen.findByText("Vault path")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add credential reference/i })).toBeInTheDocument();
      // Two Edit buttons: the header's (server edit) and the credential's.
      expect(screen.getAllByRole("button", { name: /^edit$/i })).toHaveLength(2);
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it("shows Add, Edit and Delete to an admin", async () => {
      mockGetByPath({ credentials: ok([CREDENTIAL]) });
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });

      renderPage();

      expect(await screen.findByText("Vault path")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add credential reference/i })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^edit$/i })).toHaveLength(2);
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    });

    it("shows no management affordances at all to a user with no role", async () => {
      mockGetByPath({ credentials: ok([CREDENTIAL]) });
      useAuthMock.mockReturnValue({ roles: [], isLoading: false });

      renderPage();

      // The list itself still renders — only the write affordances are gated.
      expect(await screen.findByText("Vault path")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /add credential reference/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it("keeps its own inline loading text rather than adopting the shell's page-level LoadingState", async () => {
      getMock.mockImplementation((path: string) => {
        if (path === "/api/servers/{id}") return Promise.resolve(ok(SERVER_DETAIL));
        // Credentials never resolve: the page itself must be fully rendered
        // while only this nested section is still pending.
        return new Promise(() => {});
      });

      renderPage();

      expect(await screen.findByText("Web 01")).toBeInTheDocument();
      expect(screen.getByText("Loading credentials...")).toBeInTheDocument();
      // The shell's page-level loading state must be gone by now.
      expect(screen.queryByText(/loading server/i)).not.toBeInTheDocument();
    });
  });
});
