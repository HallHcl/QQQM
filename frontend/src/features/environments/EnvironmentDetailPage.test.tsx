import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EnvironmentDetailPage from "./EnvironmentDetailPage";

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

const ENVIRONMENT_DETAIL = {
  id: "e1",
  project_id: "p1",
  name: "Production",
  description: "Primary environment",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  vpn_resource_id: null as string | null,
  project: { id: "p1", name: "Migration" },
};

function mockGetByPath(handlers: {
  environment?: unknown;
  servers?: unknown;
  projects?: unknown;
  resource?: unknown;
  resources?: unknown;
}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/environments/{id}") return Promise.resolve(handlers.environment ?? ok(ENVIRONMENT_DETAIL));
    if (path === "/api/servers")
      return Promise.resolve(
        handlers.servers ?? ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
      );
    if (path === "/api/projects") return Promise.resolve(handlers.projects ?? ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } }));
    // useResource was migrated to apiClient in Part 24a — the VPN resource
    // status lookup now goes through the same getMock as everything else.
    // Default: 404 (no linked resource / soft-deleted, same as before).
    if (path === "/api/resources/{id}") return Promise.resolve(handlers.resource ?? apiError(404, "NOT_FOUND", "Resource not found"));
    // The VPN resource picker (edit-only) reads Resources through the same
    // getMock. Default: empty list (its own search is unrelated to the
    // VpnResourceStatus lookup above).
    if (path === "/api/resources")
      return Promise.resolve(
        handlers.resources ?? ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
      );
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

const VALID_RESOURCE = {
  id: "r1",
  project_id: null,
  type: "link",
  title: "Corporate VPN",
  category: null,
  tags: [],
  current_version_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

function renderPage(initialPath = "/environments/e1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/environments/:id" element={<EnvironmentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EnvironmentDetailPage", () => {
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
    expect(screen.getByText(/loading environment/i)).toBeInTheDocument();
  });

  it("renders the environment's fields once loaded, including the parent project", async () => {
    mockGetByPath({});

    renderPage();

    expect(await screen.findByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Primary environment")).toBeInTheDocument();
    expect(screen.getByText("Migration")).toBeInTheDocument();
  });

  it("exposes the environment name as the page's single <h1>", async () => {
    mockGetByPath({});

    renderPage();

    expect(await screen.findByRole("heading", { name: "Production", level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders a not-found error state for a missing environment", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/api/environments/{id}") {
        return Promise.resolve(apiError(404, "NOT_FOUND", "Environment not found"));
      }
      return Promise.resolve(ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } }));
    });

    renderPage();

    expect(await screen.findByText("Environment not found")).toBeInTheDocument();
  });

  it("renders the Servers section using the existing read-only server display components", async () => {
    mockGetByPath({});

    renderPage();

    expect(await screen.findByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Servers (0)")).toBeInTheDocument();
    expect(await screen.findByText("No servers")).toBeInTheDocument();
  });

  it("shows the Edit button to an admin", async () => {
    useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
    mockGetByPath({});

    renderPage();

    expect(await screen.findByText("Production")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("hides the Edit button from a non-admin (Environment update is admin-only, verified against backend/src/routes/environments.routes.ts)", async () => {
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
    mockGetByPath({});

    renderPage();

    expect(await screen.findByText("Production")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  describe("VPN resource field", () => {
    it("shows 'No VPN resource linked' when vpn_resource_id is null", async () => {
      mockGetByPath({});

      renderPage();

      expect(await screen.findByText("No VPN resource linked")).toBeInTheDocument();
    });

    it("shows the resource's name when vpn_resource_id references a live resource", async () => {
      mockGetByPath({
        environment: ok({ ...ENVIRONMENT_DETAIL, vpn_resource_id: "r1" }),
        resource: ok(VALID_RESOURCE),
      });

      renderPage();

      expect(await screen.findByText("Corporate VPN")).toBeInTheDocument();
    });

    it("shows an orphan warning, not a broken/blank reference, when vpn_resource_id points at a soft-deleted resource", async () => {
      mockGetByPath({ environment: ok({ ...ENVIRONMENT_DETAIL, vpn_resource_id: "r-deleted" }) });
      // GET /resources/{id} 404s for a soft-deleted resource (the endpoint
      // excludes deleted rows entirely) — mockGetByPath's default `resource`
      // response is already a 404, which is exactly that case.

      renderPage();

      expect(await screen.findByText("Linked VPN resource has been deleted")).toBeInTheDocument();
    });
  });

  describe("Edit mode (inline EnvironmentEditCard, replacing the old modal)", () => {
    beforeEach(() => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
    });

    it("clicking Edit switches Card 1 to the inline form, pre-filled from the loaded record, with the project locked and the VPN resource picker present", async () => {
      mockGetByPath({});
      renderPage();

      await screen.findByText("Production");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      expect(await screen.findByLabelText("Name")).toHaveValue("Production");
      expect(
        screen.getByText("An environment's project can't be changed after creation.")
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("Migration")).toBeDisabled();
      expect(await screen.findByText("No VPN resource linked")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });

    it("keeps the <h1> present in edit mode — the heading used to live inside the `!isEditing` guard and vanished on Edit", async () => {
      mockGetByPath({});
      renderPage("/environments/e1?edit=true");

      await screen.findByLabelText("Name");

      expect(screen.getByRole("heading", { name: "Production", level: 1 })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("loading /environments/e1?edit=true directly (deep link) enters edit mode without clicking Edit first", async () => {
      mockGetByPath({});
      renderPage("/environments/e1?edit=true");

      expect(await screen.findByLabelText("Name")).toHaveValue("Production");
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });

    it("ignores ?edit=true in the URL for a role without edit permission (defensive gating, matches the Edit button's own RequireRole)", async () => {
      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      mockGetByPath({});
      renderPage("/environments/e1?edit=true");

      await screen.findByText("Production");
      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    });

    it("Save sends a PATCH with updated_at and the unchanged vpn_resource_id, without project_id, then returns to read mode", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValue(ok({ ...ENVIRONMENT_DETAIL, name: "Production v2" }));
      renderPage();

      await screen.findByText("Production");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      await screen.findByLabelText("Name");
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Production v2" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      const [path, options] = patchMock.mock.calls[0];
      expect(path).toBe("/api/environments/{id}");
      expect(options.params).toEqual({ path: { id: "e1" } });
      expect(options.body).toMatchObject({
        name: "Production v2",
        updated_at: ENVIRONMENT_DETAIL.updated_at,
        vpn_resource_id: null,
      });
      expect(options.body.project_id).toBeUndefined();

      await waitFor(() => expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument());
    });

    it("selecting a VPN resource sends its id in the PATCH body", async () => {
      mockGetByPath({
        resources: ok({
          data: [{ id: "r1", type: "link", title: "Corporate VPN" }],
          pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
        }),
      });
      patchMock.mockResolvedValue(ok({ ...ENVIRONMENT_DETAIL, vpn_resource_id: "r1" }));
      renderPage();

      await screen.findByText("Production");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      // Accessible name comes from the associated <label for="vpn-resource">.
      fireEvent.click(await screen.findByRole("button", { name: /^vpn resource/i }));
      fireEvent.click(await screen.findByText("Corporate VPN"));
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      expect(patchMock.mock.calls[0][1].body).toMatchObject({ vpn_resource_id: "r1" });
    });

    it("Cancel discards changes without firing a mutation, and re-entering edit shows the original value, not the discarded one", async () => {
      mockGetByPath({});
      renderPage();

      await screen.findByText("Production");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

      await screen.findByLabelText("Name");
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My In-Progress Edit" } });
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      expect(patchMock).not.toHaveBeenCalled();
      await screen.findByRole("button", { name: /^edit$/i });
      expect(screen.getByText("Production")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      expect(await screen.findByLabelText("Name")).toHaveValue("Production");
    });

    it("shows the conflict UI (not a generic error) on a stale-write 409, and does not lose the user's edit", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValueOnce(
        apiError(409, "CONFLICT", "Environment was modified by someone else; refresh and try again")
      );
      renderPage();

      await screen.findByText("Production");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      await screen.findByLabelText("Name");
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My In-Progress Edit" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(await screen.findByText("This record changed")).toBeInTheDocument();
      expect(
        screen.getByText("Environment was modified by someone else; refresh and try again")
      ).toBeInTheDocument();
      expect(toastMock).not.toHaveBeenCalled();

      const freshRecord = { ...ENVIRONMENT_DETAIL, updated_at: "2026-01-03T00:00:00.000Z" };
      mockGetByPath({ environment: ok(freshRecord) });
      patchMock.mockResolvedValueOnce(ok({ ...freshRecord, name: "My In-Progress Edit" }));

      fireEvent.click(screen.getByRole("button", { name: /keep my changes/i }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
      const [, retryOptions] = patchMock.mock.calls[1];
      expect(retryOptions.body).toMatchObject({
        name: "My In-Progress Edit",
        updated_at: freshRecord.updated_at,
      });
    });

    it("routes a duplicate-name 409 to the Name field instead of the conflict UI", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValueOnce(
        apiError(409, "CONFLICT", "An environment with this name already exists for this project")
      );
      renderPage();

      await screen.findByText("Production");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      await screen.findByLabelText("Name");
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Duplicate Name" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(
        await screen.findByText("An environment with this name already exists for this project")
      ).toBeInTheDocument();
      expect(screen.queryByText("This record changed")).not.toBeInTheDocument();
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't update environment",
        description: "An environment with this name already exists for this project",
        variant: "destructive",
      });
    });

    it("surfaces a server-side validation error against the relevant field", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValue(
        apiError(400, "VALIDATION_ERROR", "Validation failed", {
          formErrors: [],
          fieldErrors: { name: ["String must contain at least 1 character(s)"] },
        })
      );
      renderPage();

      await screen.findByText("Production");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      await screen.findByLabelText("Name");
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(
        await screen.findByText("String must contain at least 1 character(s)")
      ).toBeInTheDocument();
      expect(toastMock).toHaveBeenCalledWith({
        title: "Couldn't update environment",
        description: "Check the highlighted fields below.",
        variant: "destructive",
      });
    });

    it("shows an error toast for an unexpected (non-field, non-conflict) failure", async () => {
      mockGetByPath({});
      patchMock.mockResolvedValue(apiError(500, "INTERNAL", "boom"));
      renderPage();

      await screen.findByText("Production");
      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      await screen.findByLabelText("Name");
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't update environment",
          description: "boom",
          variant: "destructive",
        });
      });
    });
  });

  describe("single-column DetailPageShell adoption", () => {
    it("renders no aside column — the Servers grid keeps the full content width", async () => {
      mockGetByPath({});
      const { container } = renderPage();

      await screen.findByText("Production");
      // The shell only emits its two-column grid when an `aside` is passed;
      // this page passes none, so the 400px rail must never appear at any
      // width. The Servers section's own responsive grid is unaffected.
      expect(container.innerHTML).not.toContain("1fr_400px");
    });

    it("keeps the Servers section's own loading state while the page itself is fully rendered", async () => {
      getMock.mockImplementation((path: string) => {
        if (path === "/api/environments/{id}") return Promise.resolve(ok(ENVIRONMENT_DETAIL));
        if (path === "/api/resources/{id}")
          return Promise.resolve(apiError(404, "NOT_FOUND", "Resource not found"));
        // Servers never resolve: only this nested section stays pending.
        if (path === "/api/servers") return new Promise(() => {});
        return Promise.resolve(
          ok({ data: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 } })
        );
      });

      renderPage();

      expect(await screen.findByText("Production")).toBeInTheDocument();
      expect(screen.getByText("Loading servers...")).toBeInTheDocument();
      // The shell's page-level loading state has resolved and must be gone.
      expect(screen.queryByText(/loading environment/i)).not.toBeInTheDocument();
    });
  });
});
