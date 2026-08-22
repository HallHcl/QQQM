import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OverviewPage from "./OverviewPage";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

function okResult(data: unknown[], total = data.length) {
  return {
    data: { data, pagination: { page: 1, per_page: 1, total, total_pages: 1 } },
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

function errResult(status = 500) {
  return {
    data: undefined,
    error: { error: { message: "Boom" } },
    response: new Response(null, { status }),
  };
}

const CLIENT = {
  id: "1",
  name: "Acme Corp",
  status: "active",
  description: "A widget maker",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
};

/**
 * The six tiles all hit different endpoints, so route by path — and for
 * /api/clients also by `per_page`, since the picker's zero-arg call and the
 * "Total Clients" tile share an endpoint but are different queries.
 */
function routeGet(totals: Record<string, number | "error">) {
  getMock.mockImplementation((path: string, opts?: { params?: { query?: Record<string, unknown> } }) => {
    const query = opts?.params?.query ?? {};
    if (path === "/api/clients" && query.per_page !== 1) {
      return Promise.resolve(okResult([CLIENT], 1));
    }
    if (path === "/api/activity-logs") return Promise.resolve(okResult([], 0));
    const total = totals[path];
    if (total === "error") return Promise.resolve(errResult());
    return Promise.resolve(okResult([], total ?? 0));
  });
}

const ALL_OK: Record<string, number> = {
  "/api/clients": 2,
  "/api/projects": 3,
  "/api/environments": 4,
  "/api/servers": 5,
  "/api/resources": 6,
  "/api/schedules": 2,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The tile's value is the sibling <p> after its label, inside the same card. */
function tileValue(label: string) {
  const labelEl = screen.getByText(label);
  const card = labelEl.parentElement as HTMLElement;
  return (card.children[1] as HTMLElement).textContent;
}

describe("OverviewPage metric tiles", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("renders all six system-wide counts from pagination.total", async () => {
    routeGet(ALL_OK);
    renderPage();

    await waitFor(() => expect(tileValue("Total Clients")).toBe("2"));
    expect(tileValue("Total Projects")).toBe("3");
    expect(tileValue("Environments")).toBe("4");
    expect(tileValue("Servers")).toBe("5");
    expect(tileValue("Resources")).toBe("6");
    expect(tileValue("Pending Schedules")).toBe("2");
  });

  it("requests exactly one row per tile and filters schedules to pending", async () => {
    routeGet(ALL_OK);
    renderPage();

    await waitFor(() => expect(tileValue("Pending Schedules")).toBe("2"));

    const scheduleCall = getMock.mock.calls.find(([path]) => path === "/api/schedules");
    expect(scheduleCall?.[1].params.query).toMatchObject({ per_page: 1, status: "pending" });

    // `some`, not the first matching call: /api/projects and /api/clients are
    // each hit twice — once unpaginated by a picker, once with per_page 1 by
    // its tile — and only the tile's call is being asserted here.
    for (const path of ["/api/clients", "/api/projects", "/api/environments", "/api/servers", "/api/resources"]) {
      const calls = getMock.mock.calls.filter(([p]) => p === path);
      expect(calls.some(([, opts]) => opts.params.query.per_page === 1)).toBe(true);
    }
  });

  it("greys out only the failing tile and leaves the other five intact", async () => {
    routeGet({ ...ALL_OK, "/api/servers": "error" });
    renderPage();

    // The failed tile shows a neutral em dash — never "0", which would read as
    // a real count of zero servers.
    await waitFor(() => expect(tileValue("Servers")).toBe("—"));

    expect(tileValue("Total Clients")).toBe("2");
    expect(tileValue("Total Projects")).toBe("3");
    expect(tileValue("Environments")).toBe("4");
    expect(tileValue("Resources")).toBe("6");
    expect(tileValue("Pending Schedules")).toBe("2");
  });

  it("shows a resolved zero as 0, distinct from the error dash", async () => {
    routeGet({ ...ALL_OK, "/api/resources": 0 });
    renderPage();

    await waitFor(() => expect(tileValue("Resources")).toBe("0"));
  });
});

describe("OverviewPage client picker", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("lives in the client card's header, not the page header", async () => {
    routeGet(ALL_OK);
    renderPage();

    const picker = await screen.findByLabelText("Client");

    // PageHeader is now a bare title with no actions slot.
    const heading = screen.getByRole("heading", { name: "Overview", level: 1 });
    expect(heading.parentElement).not.toContainElement(picker);

    // The picker sits alongside the client name and status badge. "Acme Corp"
    // appears twice now (the CardTitle and the picker's own selected value);
    // the CardTitle is the one carrying `truncate`.
    const clientName = screen
      .getAllByText("Acme Corp")
      .find((el) => el.className.includes("truncate")) as HTMLElement;
    const cardHeader = clientName.closest("div.p-6") as HTMLElement;
    expect(cardHeader).toContainElement(picker);
    expect(within(cardHeader).getByText("active")).toBeInTheDocument();
  });
});
