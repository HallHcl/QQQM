import { afterEach, describe, expect, it } from "vitest";
import { parseScheduledDate } from "./useSchedules";

describe("parseScheduledDate", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("returns the correct local calendar day for a bare yyyy-MM-dd string", () => {
    const date = parseScheduledDate("2026-08-15");
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 8, 15]);
  });

  it("returns the correct local calendar day for the full UTC-midnight ISO timestamp the API actually sends (confirmed live: POST /api/schedules echoes scheduled_date as \"2026-08-15T00:00:00.000Z\")", () => {
    const date = parseScheduledDate("2026-08-15T00:00:00.000Z");
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 8, 15]);
  });

  it("regression: does not shift to the previous day in a negative-UTC-offset timezone (the bug this function replaces `new Date(scheduledDate)` to fix)", () => {
    process.env.TZ = "America/New_York";

    // The bug this guards against: `new Date("2026-08-15T00:00:00.000Z")`
    // displays as Aug 14 in America/New_York (UTC-4/-5) because it's parsed
    // as a UTC instant, then read via local getters. Confirmed independently
    // before this fix — this assertion documents the exact failure mode.
    const buggy = new Date("2026-08-15T00:00:00.000Z");
    expect(buggy.getDate()).toBe(14);

    const fixed = parseScheduledDate("2026-08-15T00:00:00.000Z");
    expect([fixed.getFullYear(), fixed.getMonth() + 1, fixed.getDate()]).toEqual([2026, 8, 15]);
  });
});
