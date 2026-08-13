import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ActivityPage from "./ActivityPage";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
    },
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

function paginated<T>(data: T[], totalPages = 1) {
  return {
    data,
    pagination: { page: 1, per_page: 20, total: data.length, total_pages: totalPages },
  };
}

const LOG_1 = {
  id: "log-1",
  entity_type: "client",
  entity_id: "c1",
  action: "create",
  changed_by: "person-1",
  old_value: undefined,
  new_value: { name: "Acme" },
  created_at: "2026-01-01T00:00:00.000Z",
  changed_by_person: { id: "person-1", name: "Ada Admin" },
};

function mockGetByPath(handlers: { activity?: unknown } = {}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/activity-logs") return Promise.resolve(handlers.activity ?? ok(paginated([])));
    throw new Error(`Unexpected path: ${path}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ActivityPage />
    </QueryClientProvider>
  );
}

describe("ActivityPage", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("renders activity rows once loaded, including who made the change", async () => {
    mockGetByPath({ activity: ok(paginated([LOG_1])) });
    renderPage();

    expect(await screen.findByText("create")).toBeInTheDocument();
    expect(screen.getByText("by Ada Admin")).toBeInTheDocument();
    expect(screen.getByText(/Entity ID: c1/)).toBeInTheDocument();
  });

  it("shows a loading state before the first response resolves", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText("Loading activity...")).toBeInTheDocument();
  });

  it("shows an empty state when no logs match the current filters", async () => {
    mockGetByPath({ activity: ok(paginated([])) });
    renderPage();

    expect(await screen.findByText("No activity found")).toBeInTheDocument();
  });

  it("shows an error state on a failed fetch, and retries on demand", async () => {
    mockGetByPath({ activity: apiError(500, "boom") });
    renderPage();

    expect(await screen.findByText("boom")).toBeInTheDocument();
    getMock.mockClear();
    mockGetByPath({ activity: ok(paginated([LOG_1])) });

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("create")).toBeInTheDocument();
  });

  describe("filters", () => {
    it("sends page/per_page/order and no `sort` param on initial load", async () => {
      mockGetByPath({ activity: ok(paginated([])) });
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const call = getMock.mock.calls.find(([path]) => path === "/api/activity-logs");
      expect(call).toBeDefined();
      const [, options] = call!;
      expect(options.params.query).toEqual({
        page: 1,
        per_page: 20,
        order: "desc",
        entity_type: undefined,
        entity_id: undefined,
        action: undefined,
        changed_by: undefined,
        from: undefined,
        to: undefined,
      });
      expect("sort" in options.params.query).toBe(false);
    });

    it("changing the entity type filter re-requests with entity_type set and resets to page 1", async () => {
      mockGetByPath({ activity: ok(paginated([LOG_1], 2)) });
      renderPage();

      await screen.findByText("create");
      getMock.mockClear();

      fireEvent.click(screen.getAllByRole("combobox")[0]);
      fireEvent.click(await screen.findByRole("option", { name: "client" }));

      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/activity-logs");
        expect(call?.[1].params.query.entity_type).toBe("client");
        expect(call?.[1].params.query.page).toBe(1);
      });
    });

    it("typing an entity ID re-requests with entity_id set", async () => {
      mockGetByPath({ activity: ok(paginated([LOG_1])) });
      renderPage();

      await screen.findByText("create");
      getMock.mockClear();

      fireEvent.change(screen.getByPlaceholderText("Entity ID"), { target: { value: "c1" } });

      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/activity-logs");
        expect(call?.[1].params.query.entity_id).toBe("c1");
      });
    });
  });

  describe("pagination", () => {
    it("advances to the next page and refetches with page=2", async () => {
      mockGetByPath({ activity: ok(paginated([LOG_1], 2)) });
      renderPage();

      await screen.findByText("create");
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
      getMock.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/activity-logs");
        expect(call?.[1].params.query.page).toBe(2);
      });
    });

    it("changing rows-per-page re-requests with the new per_page and resets to page 1", async () => {
      mockGetByPath({ activity: ok(paginated([LOG_1], 3)) });
      renderPage();

      await screen.findByText("create");
      getMock.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/activity-logs");
        expect(call?.[1].params.query.page).toBe(2);
      });
      await screen.findByText("Page 2 of 3");
      getMock.mockClear();

      // Combobox DOM order: entity type, action, order, rows-per-page.
      const perPageSelect = screen.getAllByRole("combobox")[3];
      fireEvent.click(perPageSelect);
      fireEvent.click(await screen.findByRole("option", { name: "50" }));

      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/activity-logs");
        expect(call?.[1].params.query.per_page).toBe(50);
        expect(call?.[1].params.query.page).toBe(1);
      });
    });
  });
});
