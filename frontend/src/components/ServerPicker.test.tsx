import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerPicker } from "./ServerPicker";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const ENVIRONMENTS = [
  { id: "e1", project_id: "p1", name: "PROD" },
  { id: "e2", project_id: "p1", name: "STAGING" },
];

const SERVERS = [
  { id: "s1", environment_id: "e1", display_name: "web-01" },
  { id: "s2", environment_id: "e2", display_name: "db-01" },
  { id: "s3", environment_id: "e9", display_name: "unrelated-server" },
];

function paginated<T>(data: T[]) {
  return { data, pagination: { page: 1, per_page: 20, total: data.length, total_pages: 1 } };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function mockGetByPath(overrides: { environments?: unknown; servers?: unknown } = {}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/environments")
      return Promise.resolve(overrides.environments ?? ok(paginated(ENVIRONMENTS)));
    if (path === "/api/servers") return Promise.resolve(overrides.servers ?? ok(paginated(SERVERS)));
    throw new Error(`Unexpected path: ${path}`);
  });
}

describe("ServerPicker", () => {
  beforeEach(() => {
    getMock.mockReset();
    mockGetByPath();
  });

  it("renders all servers when unscoped (no projectId)", async () => {
    render(<ServerPicker value={undefined} onChange={vi.fn()} />, { wrapper });

    fireEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByText("web-01")).toBeInTheDocument();
    expect(screen.getByText("db-01")).toBeInTheDocument();
    expect(screen.getByText("unrelated-server")).toBeInTheDocument();
  });

  it("scopes to servers whose environment belongs to the given project, excluding servers under other projects", async () => {
    render(<ServerPicker value={undefined} onChange={vi.fn()} projectId="p1" />, { wrapper });

    fireEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByText("web-01")).toBeInTheDocument();
    expect(screen.getByText("db-01")).toBeInTheDocument();
    expect(screen.queryByText("unrelated-server")).not.toBeInTheDocument();
  });

  it("passes project_id through to useEnvironments for scoping", async () => {
    render(<ServerPicker value={undefined} onChange={vi.fn()} projectId="p1" />, { wrapper });

    const call = getMock.mock.calls.find(([path]) => path === "/api/environments");
    expect(call).toBeDefined();
    expect(call?.[1].params.query.project_id).toBe("p1");
  });

  it("fires onChange with the selected server id", async () => {
    const onChange = vi.fn();
    render(<ServerPicker value={undefined} onChange={onChange} />, { wrapper });

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("db-01"));

    expect(onChange).toHaveBeenCalledWith("s2");
  });

  it("shows no servers for a project with no matching environments", async () => {
    render(<ServerPicker value={undefined} onChange={vi.fn()} projectId="p-empty" />, { wrapper });

    fireEvent.click(screen.getByRole("combobox"));

    expect(screen.queryByText("web-01")).not.toBeInTheDocument();
    expect(screen.queryByText("db-01")).not.toBeInTheDocument();
    expect(screen.queryByText("unrelated-server")).not.toBeInTheDocument();
  });
});
