import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VpnResourcePicker } from "./VpnResourcePicker";

const getMock = vi.fn();

vi.mock("@/lib/api", () => ({
  default: { get: (...args: [string, unknown?]) => getMock(...args) },
}));

const RESOURCES = [
  {
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
  },
  {
    id: "r2",
    project_id: null,
    type: "runbook",
    title: "Failover runbook",
    category: null,
    tags: [],
    current_version_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
  },
];

function mockGet() {
  getMock.mockImplementation((url: string, config?: { params?: { search?: string } }) => {
    if (url === "/resources") {
      const search = config?.params?.search;
      const data = search
        ? RESOURCES.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()))
        : RESOURCES;
      return Promise.resolve({ data: { data } });
    }
    // GET /resources/{id} for the trigger's own current-value lookup.
    const match = RESOURCES.find((r) => url === `/resources/${r.id}`);
    if (match) return Promise.resolve({ data: match });
    return Promise.reject({ isAxiosError: true, response: { status: 404 } });
  });
}

function renderPicker(value: string | null = null, onChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <VpnResourcePicker value={value} onChange={onChange} />
    </QueryClientProvider>
  );
  return { onChange };
}

describe("VpnResourcePicker", () => {
  beforeEach(() => {
    getMock.mockReset();
    mockGet();
  });

  it("shows 'No VPN resource linked' on the trigger when value is null", () => {
    renderPicker(null);
    expect(screen.getByText("No VPN resource linked")).toBeInTheDocument();
  });

  it("opens and renders resource options from useResources", async () => {
    renderPicker(null);

    fireEvent.click(screen.getByRole("button", { name: /no vpn resource linked/i }));

    expect(await screen.findByText("Corporate VPN")).toBeInTheDocument();
    expect(screen.getByText("Failover runbook")).toBeInTheDocument();
  });

  it("calls onChange with the selected resource's id", async () => {
    const { onChange } = renderPicker(null);

    fireEvent.click(screen.getByRole("button", { name: /no vpn resource linked/i }));
    fireEvent.click(await screen.findByText("Corporate VPN"));

    expect(onChange).toHaveBeenCalledWith("r1");
  });

  it("calls onChange with null when 'No VPN resource' is chosen", async () => {
    const { onChange } = renderPicker("r1");

    // Trigger label resolves via VpnResourceStatus before the popover opens.
    fireEvent.click(await screen.findByRole("button"));
    fireEvent.click(await screen.findByText("No VPN resource"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("narrows results via the search input (server-side filter, not a full unfiltered dropdown)", async () => {
    renderPicker(null);

    fireEvent.click(screen.getByRole("button", { name: /no vpn resource linked/i }));
    await screen.findByText("Corporate VPN");

    fireEvent.change(screen.getByPlaceholderText("Search resources..."), {
      target: { value: "runbook" },
    });

    expect(await screen.findByText("Failover runbook")).toBeInTheDocument();
    expect(screen.queryByText("Corporate VPN")).not.toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(
      "/resources",
      expect.objectContaining({ params: expect.objectContaining({ search: "runbook" }) })
    );
  });
});
