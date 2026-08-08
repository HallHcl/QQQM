import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VpnResourceStatus } from "./VpnResourceStatus";

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

function apiError(status: number) {
  return {
    data: undefined,
    error: { error: { message: "failed" } },
    response: new Response(null, { status }),
  };
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
  current_version: null,
};

function renderStatus(resourceId: string | null | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VpnResourceStatus resourceId={resourceId} />
    </QueryClientProvider>
  );
}

describe("VpnResourceStatus", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("shows 'No VPN resource linked' and makes no request when resourceId is null", () => {
    renderStatus(null);
    expect(screen.getByText("No VPN resource linked")).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("shows the resource's title when the reference resolves normally", async () => {
    getMock.mockResolvedValue(ok(VALID_RESOURCE));
    renderStatus("r1");

    expect(await screen.findByText("Corporate VPN")).toBeInTheDocument();
  });

  it("shows an orphan warning (not stale/blank data) when GET /resources/{id} 404s — the only signal available for a soft-deleted resource, since that endpoint excludes soft-deleted rows entirely", async () => {
    getMock.mockResolvedValue(apiError(404));
    renderStatus("r-deleted");

    expect(await screen.findByText("Linked VPN resource has been deleted")).toBeInTheDocument();
    expect(screen.queryByText("Corporate VPN")).not.toBeInTheDocument();
  });

  it("shows a generic can't-verify warning for a non-404 failure", async () => {
    getMock.mockResolvedValue(apiError(500));
    renderStatus("r1");

    expect(await screen.findByText("Couldn't verify linked VPN resource")).toBeInTheDocument();
  });
});
