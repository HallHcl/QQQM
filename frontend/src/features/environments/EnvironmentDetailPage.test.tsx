import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EnvironmentDetailPage from "./EnvironmentDetailPage";

const getMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function apiError(status: number, code: string, message: string) {
  return {
    data: undefined,
    error: { error: { code, message } },
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/environments/e1"]}>
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
});
