import { test, expect, type Page } from "@playwright/test";
import {
  DESKTOP,
  assertBadgeContrast,
  assertNoChildOverflow,
  assertNoHorizontalOverflow,
  assertOutlinedPanel,
  colorsOf,
  contrastRatio,
  ensureOutDir,
  login,
  shoot,
  shootElement,
} from "./phase-8-3-helpers";

/**
 * Phase 8.3 sweep — group 1: Dashboard Overview.
 *
 * Covers the three things the redesign put on the landing page: the six KPI
 * tiles (including the hover and click-through affordances that
 * overview-metrics.spec.ts asserts values for but never exercises), the
 * Urgent Action Items box in all three of its states, and the Activity
 * Timeline card.
 *
 * The overdue state runs against real seeded data. Due-today and empty are
 * driven by intercepting the urgent box's own query — it is the only
 * /api/schedules call carrying a `to=` bound, so the interception cannot
 * disturb the Pending Schedules KPI, which asks for `status=pending&per_page=1`.
 */

test.use({ viewport: DESKTOP });

test.beforeAll(ensureOutDir);

const KPI_TILES = [
  { label: "Total Clients", href: "/clients" },
  { label: "Total Projects", href: "/projects" },
  { label: "Environments", href: "/environments" },
  { label: "Servers", href: "/servers" },
  { label: "Resources", href: "/resources" },
  { label: "Pending Schedules", href: "/schedule?status=pending" },
];

/** The tile's outer Card — the element that carries the hover treatment. */
function tileCard(page: Page, label: string) {
  return page.locator(`p:text-is("${label}")`).locator("xpath=ancestor::div[contains(@class,'rounded-panel')][1]");
}

function tileButton(page: Page, label: string) {
  return page.locator(`p:text-is("${label}")`).locator("xpath=ancestor::button[1]");
}

/** Rewrites the urgent box's query (the one with a `to=` bound) only. */
async function interceptUrgentQuery(
  page: Page,
  transform: (rows: Record<string, unknown>[]) => Record<string, unknown>[]
) {
  await page.route("**/api/schedules?**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("to")) return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    body.data = transform(body.data ?? []);
    if (body.pagination) body.pagination.total = body.data.length;
    await route.fulfill({ response, json: body });
  });
}

test("KPI row: six tiles render on one row, values resolved, nothing clipped", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

  const grid = page.locator(`p:text-is("Total Clients")`).locator("xpath=ancestor::div[contains(@class,'grid')][1]");
  await expect(grid).toBeVisible();

  // All six tiles resolve to a real number, never a loading "…" or error "—".
  for (const { label } of KPI_TILES) {
    const value = page.locator(`p:text-is("${label}") + p`);
    await expect(value).toBeVisible();
    await expect(value).toHaveText(/^\d+$/, { timeout: 15_000 });
    console.log(`MEASURED [KPI ${label}] value=${(await value.textContent())?.trim()}`);
  }

  // lg:grid-cols-6 at 1280px: one row, six equal tracks, none clipped.
  const tops = await Promise.all(
    KPI_TILES.map(async ({ label }) => {
      const box = await tileCard(page, label).boundingBox();
      return { label, top: Math.round(box?.y ?? -1), width: Math.round(box?.width ?? -1) };
    })
  );
  console.log(`MEASURED [KPI row] ${JSON.stringify(tops)}`);
  const uniqueTops = new Set(tops.map((t) => t.top));
  expect(uniqueTops.size, "all six KPI tiles share one row at 1280px").toBe(1);
  const widths = new Set(tops.map((t) => t.width));
  expect(widths.size, "six equal grid tracks").toBe(1);

  await assertNoChildOverflow(grid, "KPI grid");
  await assertNoHorizontalOverflow(page, "Overview");
  await shoot(page, "01-dashboard-overview", true);
});

test("KPI tile hover: lift, brand border and elevation step, all reversible", async ({ page }) => {
  await login(page);
  const card = tileCard(page, "Servers");
  await expect(card).toBeVisible();

  const read = () =>
    card.evaluate((el) => {
      const s = getComputedStyle(el);
      return { transform: s.transform, boxShadow: s.boxShadow, borderColor: s.borderTopColor };
    });

  const idle = await read();
  console.log(`MEASURED [KPI hover] idle ${JSON.stringify(idle)}`);

  await card.hover();
  // The tile animates (transition-all); give it a frame past the default.
  await expect.poll(async () => (await read()).transform, { timeout: 2_000 }).not.toBe(idle.transform);
  const hovered = await read();
  console.log(`MEASURED [KPI hover] hovered ${JSON.stringify(hovered)}`);

  expect(hovered.boxShadow, "elevation steps up on hover").not.toBe(idle.boxShadow);
  expect(hovered.borderColor, "border picks up the brand tint on hover").not.toBe(idle.borderColor);
  await shoot(page, "02-dashboard-kpi-hover");

  // Move away: the treatment must be purely a hover state, not sticky.
  await page.getByRole("heading", { name: "Overview", level: 1 }).hover();
  await expect.poll(async () => (await read()).transform, { timeout: 2_000 }).toBe(idle.transform);
});

for (const { label, href } of KPI_TILES) {
  test(`KPI tile click-through: ${label} navigates to ${href}`, async ({ page }) => {
    await login(page);
    const button = tileButton(page, label);
    await expect(button).toBeVisible();
    // A real <button>, so it is keyboard-reachable rather than an onClick div.
    expect(await button.evaluate((el) => el.tagName)).toBe("BUTTON");

    await button.click();
    await expect(page).toHaveURL(new RegExp(href.replace("?", "\\?")));
    console.log(`MEASURED [KPI click] ${label} -> ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
  });
}

test("Urgent action items: overdue bucket renders against real seeded data", async ({ page }) => {
  await login(page);
  const card = page
    .locator(`div:text-is("Urgent action items")`)
    .locator("xpath=ancestor::div[contains(@class,'rounded-panel')][1]");
  await expect(card).toBeVisible();

  const overdue = page.locator("#urgent-overdue-heading");
  await expect(overdue).toBeVisible({ timeout: 15_000 });
  await expect(overdue).toHaveText(/Overdue \(\d+\)/);
  console.log(`MEASURED [Urgent] ${(await overdue.textContent())?.trim()}`);

  // The heading is danger-toned; it sits on the card surface, so contrast is
  // measured against the card, not against the heading's own transparent bg.
  const headingColor = (await colorsOf(overdue)).color;
  const cardBg = (await colorsOf(card)).background;
  const ratio = contrastRatio(headingColor, cardBg);
  console.log(`MEASURED [Urgent] overdue heading ${headingColor} on ${cardBg} = ${ratio.toFixed(2)}:1`);
  // 12px uppercase — normal-text AA applies.
  expect(ratio).toBeGreaterThanOrEqual(4.5);

  const rows = card.locator("li button");
  expect(await rows.count()).toBeGreaterThan(0);
  await assertNoChildOverflow(card, "Urgent action items");
  await shootElement(card, "03-dashboard-urgent-overdue");
});

test("Urgent action items: due-today bucket renders its own section", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.route("**/api/schedules?**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("to")) return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    // Pull one real row forward onto today and mark it open + not overdue, so
    // the box has to bucket it as "due today" rather than "overdue".
    const rows = (body.data ?? []).slice(0, 1).map((row: Record<string, unknown>) => ({
      ...row,
      status: "pending",
      is_overdue: false,
      scheduled_date: `${today}T00:00:00.000Z`,
    }));
    await route.fulfill({ response, json: { ...body, data: rows } });
  });

  await login(page);
  const dueToday = page.locator("#urgent-due-today-heading");
  await expect(dueToday).toBeVisible({ timeout: 15_000 });
  await expect(dueToday).toHaveText(/Due today \(1\)/);
  await expect(page.locator("#urgent-overdue-heading")).toHaveCount(0);
  console.log(`MEASURED [Urgent] ${(await dueToday.textContent())?.trim()}`);

  const card = dueToday.locator("xpath=ancestor::div[contains(@class,'rounded-panel')][1]");
  const infoColor = (await colorsOf(dueToday)).color;
  const cardBg = (await colorsOf(card)).background;
  const ratio = contrastRatio(infoColor, cardBg);
  console.log(`MEASURED [Urgent] due-today heading ${infoColor} on ${cardBg} = ${ratio.toFixed(2)}:1`);
  expect(ratio).toBeGreaterThanOrEqual(4.5);

  await expect(card.getByText("Due today", { exact: false }).first()).toBeVisible();
  await shootElement(card, "04-dashboard-urgent-due-today");
});

test("Urgent action items: empty state shows the success callout, not a bare box", async ({ page }) => {
  await interceptUrgentQuery(page, () => []);
  await login(page);

  const callout = page.getByText("All caught up! No overdue schedules.");
  await expect(callout).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#urgent-overdue-heading")).toHaveCount(0);
  await expect(page.locator("#urgent-due-today-heading")).toHaveCount(0);

  // Success tint + border + text, and the text has to be legible on the tint.
  const box = callout.locator("xpath=ancestor::div[1]");
  await assertOutlinedPanel(box, "Urgent empty callout");
  const { background } = await colorsOf(box);
  const { color } = await colorsOf(callout);
  const ratio = contrastRatio(color, background);
  console.log(`MEASURED [Urgent empty] ${color} on ${background} = ${ratio.toFixed(2)}:1`);
  expect(ratio).toBeGreaterThanOrEqual(4.5);

  const card = callout.locator("xpath=ancestor::div[contains(@class,'rounded-panel')][last()]");
  await shootElement(card, "05-dashboard-urgent-empty");
});

test("Activity timeline: recent activity card renders rows inside an elevated card", async ({ page }) => {
  await login(page);
  const title = page.locator(`div:text-is("Recent activity")`);
  await expect(title).toBeVisible({ timeout: 15_000 });
  const card = title.locator("xpath=ancestor::div[contains(@class,'rounded-panel')][1]");

  const elevation = await card.evaluate((el) => getComputedStyle(el).boxShadow);
  console.log(`MEASURED [Activity timeline] card box-shadow=${elevation}`);
  expect(elevation).not.toBe("none");

  const rows = card.locator("ul > li");
  const count = await rows.count();
  console.log(`MEASURED [Activity timeline] rows=${count}`);
  expect(count).toBeGreaterThan(0);
  // Capped at 10 by OverviewPage (`activity.slice(0, 10)`).
  expect(count).toBeLessThanOrEqual(10);

  // Action / entity on the left, relative timestamp hard right on one line.
  const first = rows.first();
  const geometry = await first.evaluate((el) => {
    const spans = Array.from(el.children) as HTMLElement[];
    return spans.map((s) => {
      const r = s.getBoundingClientRect();
      return { text: (s.textContent ?? "").trim().slice(0, 30), left: Math.round(r.left), right: Math.round(r.right) };
    });
  });
  console.log(`MEASURED [Activity timeline] first row ${JSON.stringify(geometry)}`);
  expect(geometry.length).toBe(2);
  expect(geometry[1].left).toBeGreaterThan(geometry[0].right);

  await assertNoChildOverflow(card, "Activity timeline");
  await shootElement(card, "06-dashboard-activity-timeline");
});

test("Overview client card: status badge and project panels keep the shared treatment", async ({ page }) => {
  await login(page);
  await page.waitForTimeout(1_200);

  // The client card's own status badge sits beside the client name CardTitle.
  const statusBadge = page.locator("div.inline-flex.items-center.rounded-sm.border").first();
  await expect(statusBadge).toBeVisible();
  await assertBadgeContrast(statusBadge, "Overview client status");

  const panels = page.locator("li.rounded-md.border");
  const panelCount = await panels.count();
  console.log(`MEASURED [Overview] project panel rows=${panelCount}`);
  if (panelCount > 0) {
    await assertOutlinedPanel(panels.first(), "Overview project panel");
  }
  await assertNoHorizontalOverflow(page, "Overview client card");
});
