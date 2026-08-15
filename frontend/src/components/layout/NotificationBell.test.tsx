import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "./NotificationBell";
import type { Paginated, Schedule } from "@/types";

const getMock = vi.fn();

vi.mock("@/lib/api", () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}));

function schedule(overrides: Partial<Schedule> & Pick<Schedule, "id" | "scheduled_date">): Schedule {
  return {
    project_id: null,
    server_id: null,
    title: "Rotate backups",
    type: "PM",
    started_at: null,
    completed_at: null,
    assigned_to: "person1",
    status: "pending",
    notes: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function paginated(data: Schedule[]): Paginated<Schedule> {
  return { data, pagination: { page: 1, per_page: 20, total: data.length, total_pages: 1 } };
}

function renderBell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * `Intl.DateTimeFormat` with an explicit `timeZone` reads the wall-clock date
 * in that zone independent of `process.env.TZ`, so "today"/"tomorrow" here
 * are always the real America/New_York calendar day regardless of which
 * zone this suite happens to run in.
 */
function nyDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(date);
}

describe("NotificationBell", () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    getMock.mockReset();
  });

  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("regression: does not flag tomorrow's schedule as due in a negative-UTC-offset timezone (the bug parseScheduledDate replaces `new Date(scheduledDate)` to fix)", async () => {
    process.env.TZ = "America/New_York";

    const now = new Date();
    const tomorrowIso = `${nyDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000))}T00:00:00.000Z`;

    // The bug this guards against: `tomorrowIso` is UTC-midnight for
    // tomorrow's NY calendar day, but NY is behind UTC, so that instant
    // falls in the evening of *today* in NY local time. A bare
    // `new Date(scheduledDate)` read via local getters would therefore
    // land on today's date, not tomorrow's — misclassifying a not-yet-due
    // schedule as due. Confirmed independently before this fix.
    expect(nyDateString(new Date(tomorrowIso))).toBe(nyDateString(now));

    getMock.mockResolvedValue({ data: paginated([schedule({ id: "s-tomorrow", scheduled_date: tomorrowIso })]) });

    renderBell();

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByText("1")).not.toBeInTheDocument();
    });
  });

  it("counts a schedule due today and displays the correct calendar date, not shifted back a day", async () => {
    process.env.TZ = "America/New_York";

    const todayIso = `${nyDateString(new Date())}T00:00:00.000Z`;
    getMock.mockResolvedValue({
      data: paginated([schedule({ id: "s-today", title: "Rotate backups", scheduled_date: todayIso })]),
    });

    renderBell();

    expect(await screen.findByText("1")).toBeInTheDocument();

    // Radix's DropdownMenuTrigger opens on `pointerdown` (mouse), not `click`
    // — a bare fireEvent.click doesn't carry a pointerType and never opens it.
    fireEvent.pointerDown(screen.getByRole("button"), { button: 0, pointerType: "mouse" });

    expect(await screen.findByText("Rotate backups")).toBeInTheDocument();
    const expectedLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
    expect(screen.getByText(new RegExp(`due ${expectedLabel}`))).toBeInTheDocument();
  });

  it("does not flag an overdue schedule from yesterday as absent — still counted as due", async () => {
    process.env.TZ = "America/New_York";

    const now = new Date();
    const yesterdayIso = `${nyDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))}T00:00:00.000Z`;
    getMock.mockResolvedValue({
      data: paginated([schedule({ id: "s-yesterday", scheduled_date: yesterdayIso })]),
    });

    renderBell();

    expect(await screen.findByText("1")).toBeInTheDocument();
  });
});
