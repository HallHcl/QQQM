import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { addDays, format, subDays } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UrgentActionItems from "./UrgentActionItems";
import { daysOverdue, isDueToday, isOverdue } from "./urgentSchedules";
import type { ScheduleListItem } from "@/hooks/useSchedules";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

/**
 * scheduled_date round-trips as a UTC-midnight timestamp, so fixtures use
 * that exact shape — the component must parse the date portion locally.
 */
function isoDate(date: Date) {
  return `${format(date, "yyyy-MM-dd")}T00:00:00.000Z`;
}

const TODAY = new Date();

function schedule(overrides: Partial<ScheduleListItem> = {}): ScheduleListItem {
  return {
    id: "s1",
    project_id: "p1",
    server_id: null,
    title: "Patch database",
    type: "PM",
    scheduled_date: isoDate(TODAY),
    started_at: null,
    completed_at: null,
    assigned_to: "person-1",
    status: "pending",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    is_overdue: false,
    ...overrides,
  } as ScheduleListItem;
}

const PERSON = {
  id: "person-1",
  name: "Dana Reyes",
  email: null,
  phone: null,
  type: "internal_engineer",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

function okResult(data: unknown[]) {
  return {
    data: { data, pagination: { page: 1, per_page: 100, total: data.length, total_pages: 1 } },
    error: undefined,
    response: new Response(null, { status: 200 }),
  };
}

function routeGet(schedules: unknown[], { scheduleError = false } = {}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/people") return Promise.resolve(okResult([PERSON]));
    if (path === "/api/schedules") {
      if (scheduleError) {
        return Promise.resolve({
          data: undefined,
          error: { error: { message: "Boom" } },
          response: new Response(null, { status: 500 }),
        });
      }
      return Promise.resolve(okResult(schedules));
    }
    return Promise.resolve(okResult([]));
  });
}

function renderBox() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UrgentActionItems />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  getMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("bucketing logic", () => {
  it("treats a server-flagged open schedule as overdue", () => {
    expect(isOverdue(schedule({ is_overdue: true, status: "pending" }))).toBe(true);
    expect(isOverdue(schedule({ is_overdue: true, status: "in_progress" }))).toBe(true);
  });

  it("never treats a done or cancelled schedule as urgent, however old", () => {
    const stale = { is_overdue: true, scheduled_date: isoDate(subDays(TODAY, 90)) };
    expect(isOverdue(schedule({ ...stale, status: "done" }))).toBe(false);
    expect(isOverdue(schedule({ ...stale, status: "cancelled" }))).toBe(false);

    // Same exclusion applies to the due-today bucket.
    const dueNow = { scheduled_date: isoDate(TODAY) };
    expect(isDueToday(schedule({ ...dueNow, status: "done" }))).toBe(false);
    expect(isDueToday(schedule({ ...dueNow, status: "cancelled" }))).toBe(false);
  });

  it("does not recompute overdue from the date — the server flag decides", () => {
    // Dated in the past, but the server did not flag it. The Overview box must
    // agree with the Schedule page rather than second-guessing it.
    const notFlagged = schedule({
      is_overdue: false,
      scheduled_date: isoDate(subDays(TODAY, 5)),
    });
    expect(isOverdue(notFlagged)).toBe(false);
  });

  it("buckets today's date as due-today and not overdue", () => {
    const today = schedule({ scheduled_date: isoDate(TODAY), is_overdue: false });
    expect(isDueToday(today)).toBe(true);
    expect(isOverdue(today)).toBe(false);
  });

  it("excludes future schedules from both buckets", () => {
    const tomorrow = schedule({ scheduled_date: isoDate(addDays(TODAY, 1)) });
    expect(isDueToday(tomorrow)).toBe(false);
    expect(isOverdue(tomorrow)).toBe(false);
  });

  it("holds the midnight boundary: 23:59:59 today is still due today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 1, 23, 59, 59));

    const todayAtBoundary = schedule({ scheduled_date: "2026-09-01T00:00:00.000Z" });
    expect(isDueToday(todayAtBoundary)).toBe(true);

    // One second later it is a new local day, so the same row is no longer
    // "due today" — and only the server's flag can promote it to overdue.
    vi.setSystemTime(new Date(2026, 8, 2, 0, 0, 0));
    expect(isDueToday(todayAtBoundary)).toBe(false);
  });

  it("counts whole calendar days overdue, not elapsed 24h periods", () => {
    vi.useFakeTimers();
    // 00:30 local — a schedule dated yesterday is 1 day overdue even though
    // only 30 minutes have passed since midnight.
    vi.setSystemTime(new Date(2026, 8, 2, 0, 30, 0));
    expect(
      daysOverdue(schedule({ scheduled_date: "2026-09-01T00:00:00.000Z" }))
    ).toBe(1);
    expect(
      daysOverdue(schedule({ scheduled_date: "2026-08-30T00:00:00.000Z" }))
    ).toBe(3);
  });
});

describe("UrgentActionItems", () => {
  it("shows the all-caught-up empty state when nothing is urgent", async () => {
    routeGet([schedule({ scheduled_date: isoDate(addDays(TODAY, 3)) })]);
    renderBox();

    expect(
      await screen.findByText("All caught up! No overdue schedules.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Overdue \(/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Due today \(/)).not.toBeInTheDocument();
  });

  it("renders overdue and due-today sections with counts, names and assignees", async () => {
    routeGet([
      schedule({
        id: "late",
        title: "Rotate certificates",
        is_overdue: true,
        scheduled_date: isoDate(subDays(TODAY, 3)),
      }),
      schedule({ id: "now", title: "Patch database", scheduled_date: isoDate(TODAY) }),
    ]);
    renderBox();

    const overdueHeading = await screen.findByText(/Overdue \(1\)/);
    const overdueSection = overdueHeading.closest("section") as HTMLElement;
    expect(within(overdueSection).getByText("Rotate certificates")).toBeInTheDocument();
    expect(within(overdueSection).getByText(/3 days overdue/)).toBeInTheDocument();
    expect(within(overdueSection).getByText(/Dana Reyes/)).toBeInTheDocument();

    const dueHeading = screen.getByText(/Due today \(1\)/);
    const dueSection = dueHeading.closest("section") as HTMLElement;
    expect(within(dueSection).getByText("Patch database")).toBeInTheDocument();

    expect(
      screen.queryByText("All caught up! No overdue schedules.")
    ).not.toBeInTheDocument();
  });

  it("singularises a one-day overdue item", async () => {
    routeGet([
      schedule({
        is_overdue: true,
        title: "Rotate certificates",
        scheduled_date: isoDate(subDays(TODAY, 1)),
      }),
    ]);
    renderBox();

    expect(await screen.findByText(/1 day overdue/)).toBeInTheDocument();
  });

  it("opens the schedule form sheet for the clicked item", async () => {
    routeGet([
      schedule({ id: "now", title: "Patch database", scheduled_date: isoDate(TODAY) }),
    ]);
    renderBox();

    fireEvent.click(await screen.findByRole("button", { name: /Patch database/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue("Patch database")).toBeInTheDocument();
  });

  it("still lists items when the people lookup fails, just without a name", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/api/people") {
        return Promise.resolve({
          data: undefined,
          error: { error: { message: "Boom" } },
          response: new Response(null, { status: 500 }),
        });
      }
      if (path === "/api/schedules") {
        return Promise.resolve(
          okResult([
            schedule({
              is_overdue: true,
              title: "Rotate certificates",
              scheduled_date: isoDate(subDays(TODAY, 2)),
            }),
          ])
        );
      }
      return Promise.resolve(okResult([]));
    });
    renderBox();

    expect(await screen.findByText("Rotate certificates")).toBeInTheDocument();
    expect(screen.getByText(/2 days overdue/)).toBeInTheDocument();
    expect(screen.queryByText(/Dana Reyes/)).not.toBeInTheDocument();
  });

  it("shows an error state when the schedule fetch fails", async () => {
    routeGet([], { scheduleError: true });
    renderBox();

    await waitFor(() => {
      expect(screen.getByText(/Couldn’t load schedules/)).toBeInTheDocument();
    });
    // An error must not be mistaken for "nothing is urgent".
    expect(
      screen.queryByText("All caught up! No overdue schedules.")
    ).not.toBeInTheDocument();
  });

  it("requests only schedules dated on or before today, bounded", async () => {
    routeGet([]);
    renderBox();

    await waitFor(() => expect(getMock).toHaveBeenCalled());
    const call = getMock.mock.calls.find(([path]) => path === "/api/schedules");
    expect(call?.[1].params.query).toMatchObject({
      to: format(TODAY, "yyyy-MM-dd"),
      per_page: 100,
      sort: "scheduled_date",
      order: "asc",
    });
  });
});
