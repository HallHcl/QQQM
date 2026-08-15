import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScheduleCalendar from "./ScheduleCalendar";
import type { ScheduleListItem } from "@/hooks/useSchedules";

/**
 * Asserts a Date's LOCAL calendar day (not `.toISOString()`, which reads
 * UTC and would give a timezone-dependent — sometimes wrong — answer for a
 * Date that's meant to represent a specific local calendar day; see
 * parseScheduledDate's doc comment in useSchedules.ts for why that
 * distinction matters here specifically).
 */
function expectLocalDate(date: Date, isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([year, month, day]);
}

const calendarPropsSpy = vi.fn();

// The underlying Calendar/react-day-picker rendering (which cell gets which
// class) is a UI-library concern already covered by that library's own
// tests; what this component owns is deciding which dates land in the
// "scheduled" vs "overdue" modifier buckets. Stubbing Calendar and asserting
// the props ScheduleCalendar hands it isolates exactly that logic.
vi.mock("@/components/ui/calendar", () => ({
  Calendar: (props: unknown) => {
    calendarPropsSpy(props);
    return null;
  },
}));

function baseItem(overrides: Partial<ScheduleListItem>): ScheduleListItem {
  return {
    id: "s1",
    project_id: "p1",
    server_id: null,
    title: "Quarterly PM",
    type: "PM",
    scheduled_date: "2026-08-15",
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
  };
}

describe("ScheduleCalendar", () => {
  it("buckets an in_progress schedule with is_overdue: true as overdue — the prior logic only checked status === 'pending' and would have missed this", () => {
    calendarPropsSpy.mockReset();
    const item = baseItem({ status: "in_progress", is_overdue: true });

    render(<ScheduleCalendar schedules={[item]} selected={undefined} onSelect={vi.fn()} />);

    const props = calendarPropsSpy.mock.calls[0][0] as {
      modifiers: { scheduled: Date[]; overdue: Date[] };
    };
    expect(props.modifiers.overdue).toHaveLength(1);
    expectLocalDate(props.modifiers.overdue[0], "2026-08-15");
    expect(props.modifiers.scheduled).toHaveLength(0);
  });

  it("never buckets a schedule as overdue when is_overdue: false, even with a past scheduled_date", () => {
    calendarPropsSpy.mockReset();
    const item = baseItem({ status: "pending", is_overdue: false, scheduled_date: "2020-01-01" });

    render(<ScheduleCalendar schedules={[item]} selected={undefined} onSelect={vi.fn()} />);

    const props = calendarPropsSpy.mock.calls[0][0] as {
      modifiers: { scheduled: Date[]; overdue: Date[] };
    };
    expect(props.modifiers.overdue).toHaveLength(0);
    expect(props.modifiers.scheduled).toHaveLength(1);
    expectLocalDate(props.modifiers.scheduled[0], "2020-01-01");
  });

  it("buckets a pending schedule with is_overdue: true as overdue too (not exclusive to in_progress)", () => {
    calendarPropsSpy.mockReset();
    const item = baseItem({ status: "pending", is_overdue: true });

    render(<ScheduleCalendar schedules={[item]} selected={undefined} onSelect={vi.fn()} />);

    const props = calendarPropsSpy.mock.calls[0][0] as {
      modifiers: { scheduled: Date[]; overdue: Date[] };
    };
    expect(props.modifiers.overdue).toHaveLength(1);
  });
});
