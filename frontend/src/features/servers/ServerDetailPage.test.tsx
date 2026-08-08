import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerDetailPage from "./ServerDetailPage";

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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/servers/s1"]}>
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
});
