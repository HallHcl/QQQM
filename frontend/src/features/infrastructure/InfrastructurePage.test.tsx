import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InfrastructurePage from "./InfrastructurePage";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function apiError(status: number, message: string) {
  return {
    data: undefined,
    error: { error: { message } },
    response: new Response(null, { status }),
  };
}

function paginated<T>(data: T[]) {
  return { data, pagination: { page: 1, per_page: 20, total: data.length, total_pages: 1 } };
}

const CLIENT_1 = {
  id: "c1",
  name: "Acme Corp",
  status: "active",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const PROJECT_1 = {
  id: "p1",
  client_id: "c1",
  name: "Migration",
  description: null,
  owner_status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const ENVIRONMENT_1 = {
  id: "e1",
  project_id: "p1",
  name: "Production",
  description: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  vpn_resource_id: null,
};

const SERVER_1 = {
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

function mockGetByPath(handlers: {
  clients?: unknown;
  projects?: unknown;
  environments?: unknown;
  servers?: unknown;
}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/clients") return Promise.resolve(handlers.clients ?? ok(paginated([CLIENT_1])));
    if (path === "/api/projects") return Promise.resolve(handlers.projects ?? ok(paginated([PROJECT_1])));
    if (path === "/api/environments")
      return Promise.resolve(handlers.environments ?? ok(paginated([ENVIRONMENT_1])));
    if (path === "/api/servers") return Promise.resolve(handlers.servers ?? ok(paginated([SERVER_1])));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <InfrastructurePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("InfrastructurePage", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("renders servers once all four queries resolve", async () => {
    mockGetByPath({});
    renderPage();

    expect(await screen.findByText("Web 01")).toBeInTheDocument();
  });

  it("shows a loading state before the first responses resolve", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText("Loading infrastructure...")).toBeInTheDocument();
  });

  it("shows an empty state when the selected environment has no servers", async () => {
    mockGetByPath({ servers: ok(paginated([])) });
    renderPage();

    expect(await screen.findByText("No servers found")).toBeInTheDocument();
  });

  it("shows an error state when any of the four queries fails, and retries all of them on demand", async () => {
    mockGetByPath({ servers: apiError(500, "boom") });
    renderPage();

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.queryByText("Web 01")).not.toBeInTheDocument();

    getMock.mockClear();
    mockGetByPath({});

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Web 01")).toBeInTheDocument();
    // Retry re-fetches all four queries, not just the one that failed.
    await waitFor(() => {
      const calledPaths = getMock.mock.calls.map((call) => call[0]);
      expect(calledPaths).toEqual(
        expect.arrayContaining(["/api/clients", "/api/projects", "/api/environments", "/api/servers"])
      );
    });
  });
});
