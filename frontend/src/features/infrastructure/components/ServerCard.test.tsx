import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServerCard from "./ServerCard";
import type { Server } from "@/types";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

const SAMPLE_SERVER: Server = {
  id: "s1",
  environment_id: "e1",
  hostname: "web-01",
  ip_address: "10.0.0.1",
  tech_stack: ["node", "postgres"],
  monitoring_url: "https://grafana.example.com/d/web-01",
  notes: "Primary web node",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  display_name: "Web 01",
  service_type: "application",
  access_method: "ssh",
  access_host: "web-01.internal",
  access_port: 22,
  access_path: "/srv",
};

function renderCard(server: Server) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ServerCard server={server} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ServerCard", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({ data: [], error: undefined, response: new Response(null, { status: 200 }) });
  });

  it("renders all six Access Documentation fields (display_name, service_type, access_method, access_host, access_port, access_path), not just the previously-rendered fields", () => {
    renderCard(SAMPLE_SERVER);

    // display_name is now the card title, hostname moved to subtext.
    expect(screen.getByText("Web 01")).toBeInTheDocument();
    expect(screen.getByText("web-01")).toBeInTheDocument();
    expect(screen.getByText("Application")).toBeInTheDocument();
    // access_method/access_host/access_port/access_path are rendered together.
    expect(screen.getByText(/SSH/)).toBeInTheDocument();
    expect(screen.getByText(/web-01\.internal/)).toBeInTheDocument();
    expect(screen.getByText(/:22/)).toBeInTheDocument();
    expect(screen.getByText(/\/srv/)).toBeInTheDocument();
  });

  it("still renders the previously-supported fields (ip_address, tech_stack, monitoring_url, notes)", () => {
    renderCard(SAMPLE_SERVER);

    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("node")).toBeInTheDocument();
    expect(screen.getByText("postgres")).toBeInTheDocument();
    expect(screen.getByText("Monitoring dashboard")).toBeInTheDocument();
    expect(screen.getByText("Primary web node")).toBeInTheDocument();
  });

  it("links the display name to the server detail page", () => {
    renderCard(SAMPLE_SERVER);

    const link = screen.getByRole("link", { name: "Web 01" });
    expect(link).toHaveAttribute("href", "/servers/s1");
  });

  it("does not render service_type/access_method rows when they're null (matches the InfrastructurePage/EnvironmentDetailPage usage of servers that may have nulls)", () => {
    renderCard({
      ...SAMPLE_SERVER,
      service_type: null,
      access_method: null,
      ip_address: null,
      monitoring_url: null,
      notes: null,
      tech_stack: [],
    });

    expect(screen.getByText("Web 01")).toBeInTheDocument();
    expect(screen.queryByText("Application")).not.toBeInTheDocument();
    expect(screen.queryByText(/SSH/)).not.toBeInTheDocument();
  });

  it("still expands to show the existing read-only CredentialRefList on click, unchanged behavior", async () => {
    getMock.mockResolvedValue({
      data: [],
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    renderCard(SAMPLE_SERVER);

    fireEvent.click(screen.getByRole("button", { name: /show credentials/i }));

    expect(await screen.findByText("No credential references.")).toBeInTheDocument();
  });
});
