import { test, expect, type Page } from "@playwright/test";
import {
  DESKTOP,
  assertBadgeContrast,
  assertNoHorizontalOverflow,
  assertTableCardWrapper,
  assertTabularNums,
  colorsOf,
  contrastRatio,
  ensureOutDir,
  login,
  shoot,
} from "./phase-8-3-helpers";

/**
 * Phase 8.3 sweep — group 4: data tables & status badges.
 *
 * The six list surfaces, checked for the four things the redesign put on all
 * of them at once: the elevated card wrapper `ui/table.tsx` gives every
 * table, tabular-nums alignment on the numeric/date column, the opacity-60
 * idle dim on row actions, and the deleted-row treatment (neutral badge plus
 * muted text) that closed out the Phase 5 backlog.
 *
 * Schedule additionally owns the only four-colour status vocabulary in the
 * app, so its badges are pinned to their exact token values here — the
 * earlier typography sweep only screenshotted them.
 */

test.use({ viewport: DESKTOP });

test.beforeAll(ensureOutDir);

const MODULES = [
  { slug: "clients", path: "/clients", heading: "Clients" },
  { slug: "projects", path: "/projects", heading: "Projects" },
  { slug: "servers", path: "/servers", heading: "Servers" },
  { slug: "environments", path: "/environments", heading: "Environments" },
  { slug: "people", path: "/people", heading: "People" },
  { slug: "schedule", path: "/schedule", heading: "Schedule" },
];

/**
 * Modules whose date column carries the `font-mono … tabular-nums` treatment.
 *
 * Clients and People are deliberately absent, and the two absences are not
 * the same thing: People has no date column at all, while Clients renders
 * one (`Updated`, a bare `toLocaleDateString()`) without the treatment its
 * four siblings use. See the walkthrough — flagged, not fixed here.
 */
const TABULAR_MODULES = new Set(["projects", "servers", "environments", "schedule"]);

/** The exact token values behind each schedule status badge. */
const STATUS_COLORS = {
  done: { variant: "success", color: "rgb(8, 84, 60)", background: "rgb(233, 245, 240)", border: "rgb(127, 199, 172)" },
  "in progress": { variant: "info", color: "rgb(12, 79, 151)", background: "rgb(240, 247, 255)", border: "rgb(154, 193, 243)" },
  pending: { variant: "warning", color: "rgb(147, 55, 13)", background: "rgb(254, 246, 238)", border: "rgb(245, 201, 155)" },
  cancelled: { variant: "neutral", color: "rgb(52, 64, 84)", background: "rgb(242, 244, 247)", border: "rgb(208, 213, 221)" },
} as const;

/**
 * The module's list table.
 *
 * Not `page.locator("table").first()`: SchedulePage renders react-day-picker's
 * calendar — also a <table> — ahead of the list column. Every list table
 * carries an "Actions" column header; the calendar does not.
 */
function listTable(page: Page) {
  return page.locator("table").filter({ has: page.getByRole("columnheader", { name: "Actions" }) });
}

async function open(page: Page, path: string, heading: string) {
  await login(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  await expect(listTable(page).locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });
}

for (const mod of MODULES) {
  test(`${mod.heading}: table sits in an elevated card wrapper and never scrolls the page`, async ({
    page,
  }) => {
    await open(page, mod.path, mod.heading);
    await assertTableCardWrapper(listTable(page), mod.heading);
    await assertNoHorizontalOverflow(page, mod.heading);

    // Sticky header on a sunken fill, so a scrolled body still has column names.
    const thead = listTable(page).locator("thead");
    const headerStyle = await thead.evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, background: s.backgroundColor };
    });
    console.log(`MEASURED [${mod.heading}] thead ${JSON.stringify(headerStyle)}`);
    expect(headerStyle.position).toBe("sticky");

    await shoot(page, `22-table-${mod.slug}`);
  });

  test(`${mod.heading}: row actions idle at opacity-60 and reach full opacity on row hover`, async ({
    page,
  }) => {
    await open(page, mod.path, mod.heading);

    const trigger = page.getByRole("button", { name: "Actions" }).first();
    await expect(trigger).toBeAttached();
    const wrapper = trigger.locator("xpath=ancestor::div[1]");

    const idle = Number(await wrapper.evaluate((el) => getComputedStyle(el).opacity));
    console.log(`MEASURED [${mod.heading}] row-action idle opacity=${idle}`);
    // Dimmed but legible and operable — NOT hidden. 0.6 exactly is the
    // contract src/test/hoverActions.ts pins for the unit suite.
    expect(idle).toBeCloseTo(0.6, 2);

    await trigger.locator("xpath=ancestor::tr[1]").hover();
    await expect
      .poll(async () => Number(await wrapper.evaluate((el) => getComputedStyle(el).opacity)), {
        timeout: 3_000,
      })
      .toBeGreaterThan(0.95);
    console.log(`MEASURED [${mod.heading}] row-action hovered opacity reached 1`);

    // Keyboard focus does the same job for anyone not using a mouse.
    await page.keyboard.press("Escape");
    await trigger.focus();
    const focused = Number(await wrapper.evaluate((el) => getComputedStyle(el).opacity));
    console.log(`MEASURED [${mod.heading}] row-action focus-within opacity=${focused}`);
    expect(focused).toBeGreaterThan(0.95);
  });

  test(`${mod.heading}: deleted rows get the neutral badge and muted text, and keep Restore legible`, async ({
    page,
  }) => {
    await login(page);
    // usePagination reads `deleted` straight off the URL, so this is the same
    // view the module's own filter produces. `deleted=true` rather than `all`:
    // the modules sort by name/title by default and some carry enough live
    // records that no deleted row lands on the first page of a mixed view.
    await page.goto(`${mod.path}?deleted=true`);
    await expect(page.getByRole("heading", { name: mod.heading, level: 1 })).toBeVisible();

    const deletedBadge = listTable(page).locator('tbody tr div:text-is("Deleted")').first();
    await expect(deletedBadge).toBeVisible({ timeout: 15_000 });

    // Neutral, not destructive: a deleted row is an archived record, not an error.
    const badge = await colorsOf(deletedBadge);
    console.log(`MEASURED [${mod.heading}] Deleted badge ${JSON.stringify(badge)}`);
    expect(badge.color).toBe(STATUS_COLORS.cancelled.color);
    expect(badge.background).toBe(STATUS_COLORS.cancelled.background);
    expect(badge.border).toBe(STATUS_COLORS.cancelled.border);
    await assertBadgeContrast(deletedBadge, `${mod.heading} deleted badge`);

    // Every cell in the row drops to muted-foreground (--text-secondary).
    const row = deletedBadge.locator("xpath=ancestor::tr[1]");
    const deletedCell = await colorsOf(row.locator("td").nth(1));
    console.log(`MEASURED [${mod.heading}] deleted cell colour=${deletedCell.color}`);
    expect(deletedCell.color).toBe("rgb(71, 84, 103)");

    // The row is dimmed by colour, not by opacity — Restore has to stay at
    // full contrast because it is a deleted row's only remaining action.
    const rowOpacity = Number(await row.evaluate((el) => getComputedStyle(el).opacity));
    console.log(`MEASURED [${mod.heading}] deleted row opacity=${rowOpacity}`);
    expect(rowOpacity).toBe(1);

    const restore = row.getByRole("button", { name: "Restore" });
    if (await restore.count()) {
      const restoreOpacity = Number(
        await restore.locator("xpath=ancestor::div[1]").evaluate((el) => getComputedStyle(el).opacity)
      );
      console.log(`MEASURED [${mod.heading}] Restore opacity=${restoreOpacity}`);
      expect(restoreOpacity).toBeGreaterThan(0.95);
    }

    await shoot(page, `23-deleted-rows-${mod.slug}`);
  });
}

test("List tables: tabular-nums on the date column of every module that has one", async ({ page }) => {
  const carried: string[] = [];
  for (const mod of MODULES) {
    await open(page, mod.path, mod.heading);
    const cell = listTable(page).locator("tbody td.tabular-nums").first();
    const has = (await cell.count()) > 0;
    console.log(`MEASURED [${mod.heading}] tabular-nums date column present=${has}`);
    if (TABULAR_MODULES.has(mod.slug)) {
      await assertTabularNums(cell, mod.heading);
      carried.push(mod.slug);
    }
  }
  expect(carried.sort()).toEqual([...TABULAR_MODULES].sort());
});

test("Schedule: all four status badges render their own token colours, distinctly", async ({
  page,
}) => {
  await login(page);
  // `deleted=all` so the four statuses are all reachable in one view — the
  // seed's only remaining non-deleted `pending` row would otherwise be one
  // page-size away from the rest.
  await page.goto("/schedule?deleted=all&per_page=100");
  await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
  await expect(listTable(page).locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });

  const seen: Record<string, { color: string; background: string; border: string }> = {};
  for (const [status, expected] of Object.entries(STATUS_COLORS)) {
    // The status badge is the one in the Status column, so scope by cell —
    // the Title cell can carry a "Deleted" badge of its own.
    const badge = listTable(page).locator(`tbody tr td:nth-child(4) div:text-is("${status}")`).first();
    await expect(badge, `a "${status}" schedule exists in the seed`).toBeVisible();

    const actual = await colorsOf(badge);
    console.log(
      `MEASURED [Schedule status] "${status}" (${expected.variant}) ${JSON.stringify(actual)}`
    );
    expect(actual.color, `${status} text`).toBe(expected.color);
    expect(actual.background, `${status} tint`).toBe(expected.background);
    expect(actual.border, `${status} border`).toBe(expected.border);

    const ratio = contrastRatio(actual.color, actual.background);
    console.log(`MEASURED [Schedule status] "${status}" contrast=${ratio.toFixed(2)}:1`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    seen[status] = actual;
  }

  // Four statuses, four distinguishable colours — the whole point of the
  // vocabulary is that a glance separates them.
  const distinct = new Set(Object.values(seen).map((c) => `${c.color}|${c.background}`));
  console.log(`MEASURED [Schedule status] distinct colour pairs=${distinct.size}`);
  expect(distinct.size).toBe(4);

  await shoot(page, "24-schedule-status-badges", true);
});

test("Schedule: the status-transition control stays at full opacity beside its badge", async ({
  page,
}) => {
  await open(page, "/schedule", "Schedule");
  // A workflow control, not a row action — it is never part of the idle dim.
  const control = listTable(page).locator("tbody tr td:nth-child(4) button").first();
  if ((await control.count()) === 0) {
    test.skip(true, "No non-terminal schedule in view — nothing to transition.");
  }
  await expect(control).toBeVisible();
  const opacity = await control.evaluate((el) => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node && node.tagName !== "TR") {
      if (Number(getComputedStyle(node).opacity) < 1) return getComputedStyle(node).opacity;
      node = node.parentElement;
    }
    return "1";
  });
  console.log(`MEASURED [Schedule] status control effective opacity=${opacity}`);
  expect(Number(opacity)).toBe(1);
});
