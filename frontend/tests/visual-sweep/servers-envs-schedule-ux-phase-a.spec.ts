import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Verification sweep for the final Phase A rollout wave — Servers,
 * Environments, Schedule (initials avatar, Toolbar shell, hover-vs-touch row
 * actions). Mirrors the checks the Clients pilot and the Projects/People wave
 * already run. Throwaway — delete once the ticket closes.
 *
 * Requires the backend + db + `npm run dev` (frontend) already running
 * locally; this spec does not start them.
 */

const OUT_DIR = path.resolve(process.cwd(), "playwright-screenshots");
const ADMIN = { username: "admin", password: "admin123" };

const MODULES: Array<{
  slug: string;
  path: string;
  heading: string;
  newButton: RegExp;
  /** A control rendered inside this module's FilterBar, used to identify
   *  its Toolbar unambiguously among other bordered surfaces on the page. */
  filterAnchor: (page: Page) => ReturnType<Page["getByRole"]>;
  cases: Array<[string, string]>;
}> = [
  {
    slug: "servers",
    path: "/servers",
    heading: "Servers",
    newButton: /New server/i,
    filterAnchor: (page) => page.getByRole("combobox", { name: "Sort by" }),
    // display_name is the row title (hostname is muted subtext beneath it).
    cases: [
      ["Portal App (Prod)", "PA"],
      ["Legacy Monitoring (Prod)", "LM"],
    ] as Array<[string, string]>,
  },
  {
    slug: "environments",
    path: "/environments",
    heading: "Environments",
    newButton: /New environment/i,
    filterAnchor: (page) => page.getByRole("combobox", { name: "Sort by" }),
    // Single-word names: getInitials falls back to the first two letters.
    cases: [
      ["Production", "PR"],
      ["Staging", "ST"],
    ],
  },
  {
    slug: "schedule",
    path: "/schedule",
    heading: "Schedule",
    newButton: /New schedule/i,
    filterAnchor: (page) => page.getByRole("combobox", { name: "Schedule status" }),
    // Schedule has a freestanding `title` field rendered as its primary
    // "Title" column, so the avatar applies here like any other module.
    cases: [
      ["Portal SSL Certificate Renewal", "PS"],
      ["Production DB Failover Drill", "PD"],
    ],
  },
];

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview/);
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

for (const mod of MODULES) {
  test.describe(`${mod.heading} — desktop (mouse-capable)`, () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test(`${mod.heading}: avatar initials render next to real seeded names`, async ({ page }) => {
      await login(page);
      await page.goto(mod.path);
      await expect(page.getByRole("heading", { name: mod.heading })).toBeVisible();
      await page.waitForTimeout(500);
      await shoot(page, `phaseA-${mod.slug}-desktop-list`);

      for (const [name, initials] of mod.cases) {
        // Rows are matched by their rendered text rather than getByRole("row"),
        // since several of these tables give rows an explicit role="button"
        // override for row-click navigation.
        const row = page.locator("tbody tr", { hasText: name }).first();
        await expect(row).toBeVisible();
        const avatar = row.locator("td").first().locator("span[aria-hidden='true']");
        await expect(avatar).toHaveText(initials);
        console.log(
          `MEASURED [${mod.heading}] avatar for "${name}": "${await avatar.textContent()}" (expected "${initials}")`
        );
      }
    });

    test(`${mod.heading}: primary action moved into the bounded toolbar`, async ({ page }) => {
      await login(page);
      await page.goto(mod.path);
      await expect(page.getByRole("heading", { name: mod.heading })).toBeVisible();
      await page.waitForTimeout(300);

      // Anchored on a control that lives inside this module's own FilterBar
      // rather than taking the first bordered surface on the page: Schedule
      // renders ScheduleCalendar (same rounded-md border-border bg-surface
      // treatment) ahead of the list column, so `.first()` would match the
      // calendar instead of the toolbar.
      const toolbar = page.locator("div.border-border.bg-surface", {
        has: mod.filterAnchor(page),
      });
      await expect(toolbar).toBeVisible();
      await expect(toolbar.getByRole("button", { name: mod.newButton })).toBeVisible();

      const cls = await toolbar.getAttribute("class");
      console.log(`MEASURED [${mod.heading}] toolbar class: [${cls}]`);
      expect(cls).toContain("border-border");
      expect(cls).toContain("bg-surface");
      expect(cls).toContain("justify-between");

      // The action button must no longer live in PageHeader.
      const header = page.getByRole("heading", { name: mod.heading }).locator("xpath=..");
      await expect(header.getByRole("button", { name: mod.newButton })).toHaveCount(0);
      console.log(`MEASURED [${mod.heading}] PageHeader no longer contains the action button`);

      await shoot(page, `phaseA-${mod.slug}-desktop-toolbar`);
    });

    test(`${mod.heading}: row actions hover-hidden by default, revealed on hover`, async ({
      page,
    }) => {
      await login(page);
      await page.goto(mod.path);
      await expect(page.getByRole("heading", { name: mod.heading })).toBeVisible();
      await page.waitForTimeout(500);

      const trigger = page.getByRole("button", { name: "Actions" }).first();
      await expect(trigger).toBeAttached();
      const wrapper = trigger.locator("xpath=ancestor::div[1]");

      const base = await wrapper.evaluate((el) => getComputedStyle(el).opacity);
      console.log(`MEASURED [${mod.heading}] base (unhovered) actions opacity: ${base}`);
      expect(Number(base)).toBeLessThan(0.5);

      await trigger.locator("xpath=ancestor::tr[1]").hover();
      await page.waitForTimeout(150);
      const hovered = await wrapper.evaluate((el) => getComputedStyle(el).opacity);
      console.log(`MEASURED [${mod.heading}] hovered actions opacity: ${hovered}`);
      expect(Number(hovered)).toBeGreaterThan(0.9);

      await shoot(page, `phaseA-${mod.slug}-desktop-row-hovered`);
    });
  });

  test.describe(`${mod.heading} — touch/mobile @ 375px`, () => {
    // Real touch emulation, not merely a narrow viewport: a resized
    // mouse-capable browser still matches `hover: hover` and would wrongly
    // pass a hover-gated implementation.
    test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

    test(`${mod.heading}: actions always visible at 375px, no hover performed`, async ({
      page,
    }) => {
      await login(page);
      await page.goto(mod.path);
      await expect(page.getByRole("heading", { name: mod.heading })).toBeVisible();
      await page.waitForTimeout(500);

      const hoverMedia = await page.evaluate(() => matchMedia("(hover: hover)").matches);
      console.log(`MEASURED [${mod.heading}] (hover: hover) matches: ${hoverMedia}`);
      expect(hoverMedia).toBe(false);

      await shoot(page, `phaseA-${mod.slug}-375px-touch`);

      const trigger = page.getByRole("button", { name: "Actions" }).first();
      await expect(trigger).toBeAttached();
      await trigger.scrollIntoViewIfNeeded();
      const wrapper = trigger.locator("xpath=ancestor::div[1]");
      const opacity = await wrapper.evaluate((el) => getComputedStyle(el).opacity);
      console.log(
        `MEASURED [${mod.heading}] actions opacity at 375px touch, no hover: ${opacity}`
      );
      expect(Number(opacity)).toBeGreaterThan(0.9);
      await expect(trigger).toBeVisible();
    });

    test(`${mod.heading}: no horizontal page overflow at 375px`, async ({ page }) => {
      await login(page);
      await page.goto(mod.path);
      await expect(page.getByRole("heading", { name: mod.heading })).toBeVisible();
      await page.waitForTimeout(500);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      console.log(
        `MEASURED [${mod.heading}] @375px scrollWidth=${scrollWidth} clientWidth=${clientWidth}`
      );
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  });
}

test.describe("Schedule: status-transition controls stay permanently visible", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("ScheduleStatusActions is not hover-gated (it is a workflow control, not a row action)", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await page.waitForTimeout(500);

    // A non-terminal schedule exposes a status-transition button in the
    // Status column. It must be visible without any hover.
    const statusCellButtons = page.locator("tbody tr td:nth-child(4) button");
    const count = await statusCellButtons.count();
    console.log(`MEASURED [Schedule] status-column buttons found: ${count}`);
    if (count === 0) {
      test.info().annotations.push({
        type: "note",
        description:
          "No status-transition buttons rendered (all loaded rows terminal/deleted) — nothing to assert.",
      });
      return;
    }

    const first = statusCellButtons.first();
    await expect(first).toBeVisible();
    const opacity = await first.evaluate((el) => {
      // Walk up to the nearest element that sets an opacity < 1, if any.
      let node: HTMLElement | null = el as HTMLElement;
      while (node && node.tagName !== "TR") {
        const o = getComputedStyle(node).opacity;
        if (Number(o) < 1) return o;
        node = node.parentElement;
      }
      return "1";
    });
    console.log(`MEASURED [Schedule] status control effective opacity (no hover): ${opacity}`);
    expect(Number(opacity)).toBe(1);
  });
});
