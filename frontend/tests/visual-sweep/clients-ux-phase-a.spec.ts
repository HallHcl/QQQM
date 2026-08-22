import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Verification sweep for the Clients-module Phase A UX pilot (avatar
 * initials, unified filter toolbar, hover-vs-touch row actions). Throwaway —
 * not part of the ongoing regression suite, delete once the ticket closes.
 *
 * Requires the backend + db + `npm run dev` (frontend) already running
 * locally; this spec does not start them.
 */

const OUT_DIR = path.resolve(process.cwd(), "playwright-screenshots");
const ADMIN = { username: "admin", password: "admin123" };

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

test.describe("Desktop (mouse-capable): avatar, toolbar, hover-reveal actions", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("avatar initials render next to real seeded client names", async ({ page }) => {
    await login(page);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "clients-desktop-list");

    // Real seeded rows, not fixtures: confirms the deterministic algorithm
    // against actual data. Searches first since this db has many leftover
    // fixture clients from prior test runs, and the named rows aren't
    // guaranteed to land on page 1 otherwise.
    const cases: Array<[string, string]> = [
      ["Brightwater Logistics", "BL"],
      ["Calloway Financial Group", "CF"],
    ];
    for (const [name, initials] of cases) {
      await page.getByPlaceholder("Search clients...").fill(name);
      await page.waitForTimeout(400);
      // Not getByRole("row", ...): the row carries an explicit role="button"
      // override (pre-existing, for the row-click-to-edit behavior), which
      // replaces its accessible role entirely — a plain tag selector finds
      // it regardless of that override.
      const row = page.locator("tbody tr", { hasText: name });
      await expect(row).toBeVisible();
      const avatar = row.locator("td").first().locator("span[aria-hidden='true']");
      await expect(avatar).toHaveText(initials);
      console.log(`MEASURED avatar for "${name}": "${await avatar.textContent()}" (expected "${initials}")`);
    }
  });

  test("search, filters, and New client share one bounded toolbar", async ({ page }) => {
    await login(page);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

    const search = page.getByPlaceholder("Search clients...");
    const newClientBtn = page.getByRole("button", { name: "New client" });
    await expect(search).toBeVisible();
    await expect(newClientBtn).toBeVisible();

    // Both controls should share the same bounded toolbar ancestor
    // (border + bg-surface container), not float as separate elements.
    const toolbar = page.locator("div.border-border.bg-surface", { has: search });
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "New client" })).toBeVisible();
    console.log("MEASURED: search input and New client button share one bordered toolbar container");
    await shoot(page, "clients-desktop-toolbar");
  });

  test("row actions are hover-hidden by default and reveal on hover (mouse-capable)", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await page.waitForTimeout(300);

    const trigger = page.getByRole("button", { name: "Actions" }).first();
    const wrapper = trigger.locator("xpath=ancestor::div[1]");

    const baseOpacity = await wrapper.evaluate((el) => getComputedStyle(el).opacity);
    console.log(`MEASURED base (unhovered) actions wrapper opacity: ${baseOpacity}`);
    expect(Number(baseOpacity)).toBeLessThan(0.5);

    const row = trigger.locator("xpath=ancestor::tr[1]");
    await row.hover();
    await page.waitForTimeout(150);
    const hoveredOpacity = await wrapper.evaluate((el) => getComputedStyle(el).opacity);
    console.log(`MEASURED hovered actions wrapper opacity: ${hoveredOpacity}`);
    expect(Number(hoveredOpacity)).toBeGreaterThan(0.9);
    await shoot(page, "clients-desktop-row-hovered-actions-visible");
  });
});

test.describe("Touch/mobile @ 375px: actions always visible, never hover-gated", () => {
  // Real touch emulation (hasTouch + isMobile), not just a narrow desktop
  // viewport — a resized mouse-capable browser would still match
  // `hover: hover` and wrongly hide actions, defeating the point of this
  // check.
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
  });

  test("actions are visible without any hover interaction at 375px", async ({ page }) => {
    await login(page);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await page.waitForTimeout(300);

    const hoverMedia = await page.evaluate(() => matchMedia("(hover: hover)").matches);
    console.log(`MEASURED (hover: hover) media match on this emulated device: ${hoverMedia}`);
    expect(hoverMedia).toBe(false);

    await shoot(page, "clients-375px-touch-actions-always-visible");

    const trigger = page.getByRole("button", { name: "Actions" }).first();
    await trigger.scrollIntoViewIfNeeded();
    const wrapper = trigger.locator("xpath=ancestor::div[1]");
    const opacity = await wrapper.evaluate((el) => getComputedStyle(el).opacity);
    console.log(`MEASURED actions wrapper opacity at 375px touch, no hover performed: ${opacity}`);
    expect(Number(opacity)).toBeGreaterThan(0.9);
    await expect(trigger).toBeVisible();
  });

  test("avatar + unified toolbar also render correctly at 375px", async ({ page }) => {
    await login(page);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "clients-375px-avatar-and-toolbar");

    await page.getByPlaceholder("Search clients...").fill("Brightwater Logistics");
    await page.waitForTimeout(400);
    const row = page.locator("tbody tr", { hasText: "Brightwater Logistics" });
    const avatar = row.locator("td").first().locator("span[aria-hidden='true']");
    await expect(avatar).toHaveText("BL");
  });
});
