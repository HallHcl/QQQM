import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Verification sweep for the Phase A UX rollout to Projects and People
 * (initials avatar, Toolbar shell, hover-vs-touch row actions) — the same
 * checks clients-ux-phase-a.spec.ts runs for the Clients pilot. Throwaway —
 * not part of the ongoing regression suite, delete once the ticket closes.
 *
 * Requires the backend + db + `npm run dev` (frontend) already running
 * locally; this spec does not start them.
 */

const OUT_DIR = path.resolve(process.cwd(), "playwright-screenshots");
const ADMIN = { username: "admin", password: "admin123" };

const MODULES = [
  {
    slug: "projects",
    path: "/projects",
    heading: "Projects",
    searchPlaceholder: "Search projects...",
    newButton: /New project/i,
    // Real seeded rows: name -> expected initials.
    cases: [
      ["Client Portal Modernization", "CP"],
      ["Warehouse Management Platform", "WM"],
    ] as Array<[string, string]>,
  },
  {
    slug: "people",
    path: "/people",
    heading: "People",
    searchPlaceholder: "Search people...",
    newButton: /New person/i,
    cases: [
      ["Priya Chandrasekaran", "PC"],
      ["Sarah Nakamura", "SN"],
    ] as Array<[string, string]>,
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
      await page.waitForTimeout(300);
      await shoot(page, `phaseA-${mod.slug}-desktop-list`);

      for (const [name, initials] of mod.cases) {
        await page.getByPlaceholder(mod.searchPlaceholder).fill(name);
        await page.waitForTimeout(400);
        // Not getByRole("row", ...): these rows carry an explicit
        // role="button" override for row-click navigation, which replaces
        // their accessible row role.
        const row = page.locator("tbody tr", { hasText: name });
        await expect(row).toBeVisible();
        const avatar = row.locator("td").first().locator("span[aria-hidden='true']");
        await expect(avatar).toHaveText(initials);
        console.log(
          `MEASURED [${mod.heading}] avatar for "${name}": "${await avatar.textContent()}" (expected "${initials}")`
        );
      }
    });

    test(`${mod.heading}: filters and the primary action share one bounded toolbar`, async ({
      page,
    }) => {
      await login(page);
      await page.goto(mod.path);
      await expect(page.getByRole("heading", { name: mod.heading })).toBeVisible();

      const search = page.getByPlaceholder(mod.searchPlaceholder);
      await expect(search).toBeVisible();

      const toolbar = page.locator("div.border-border.bg-surface").first();
      await expect(toolbar).toBeVisible();
      // The action button must live INSIDE the toolbar, not in PageHeader.
      await expect(toolbar.getByRole("button", { name: mod.newButton })).toBeVisible();
      // And the search control must be inside that same toolbar.
      await expect(toolbar.getByPlaceholder(mod.searchPlaceholder)).toBeVisible();

      const cls = await toolbar.getAttribute("class");
      console.log(`MEASURED [${mod.heading}] toolbar class: [${cls}]`);
      expect(cls).toContain("border-border");
      expect(cls).toContain("bg-surface");
      expect(cls).toContain("justify-between");

      // PageHeader must no longer carry the action button.
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
      await page.waitForTimeout(300);

      const trigger = page.getByRole("button", { name: "Actions" }).first();
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
    // Real touch emulation, not just a narrow desktop viewport: a resized
    // mouse-capable browser still matches `hover: hover` and would wrongly
    // pass a hover-gated implementation.
    test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

    test(`${mod.heading}: actions always visible at 375px, no hover performed`, async ({
      page,
    }) => {
      await login(page);
      await page.goto(mod.path);
      await expect(page.getByRole("heading", { name: mod.heading })).toBeVisible();
      await page.waitForTimeout(300);

      const hoverMedia = await page.evaluate(() => matchMedia("(hover: hover)").matches);
      console.log(`MEASURED [${mod.heading}] (hover: hover) matches: ${hoverMedia}`);
      expect(hoverMedia).toBe(false);

      await shoot(page, `phaseA-${mod.slug}-375px-touch`);

      const trigger = page.getByRole("button", { name: "Actions" }).first();
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
      await page.waitForTimeout(300);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      console.log(
        `MEASURED [${mod.heading}] @375px document scrollWidth=${scrollWidth} clientWidth=${clientWidth}`
      );
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  });
}
