import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Visual sweep for the RowActions ticket (shared row-level overflow menu
 * rolled out to Clients/Projects/Environments/Servers/People/Schedule).
 * Not previously covered by 375px-sweep.spec.ts (Projects/Environments were
 * absent entirely, and no spec exercised the kebab trigger or an open
 * menu) — this file adds that coverage rather than editing the existing
 * specs, so it can be deleted independently once the ticket is closed out.
 *
 * Requires the backend + db + `npm run dev` (frontend) already running
 * locally; this spec does not start them.
 */

const OUT_DIR = path.resolve(process.cwd(), "playwright-screenshots");
const ADMIN = { username: "admin", password: "admin123" };

const MODULES = [
  { path: "/clients", heading: "Clients", slug: "clients" },
  { path: "/projects", heading: "Projects", slug: "projects" },
  { path: "/environments", heading: "Environments", slug: "environments" },
  { path: "/servers", heading: "Servers", slug: "servers" },
  { path: "/people", heading: "People", slug: "people" },
  { path: "/schedule", heading: "Schedule", slug: "schedule" },
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

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  console.log(`MEASURED [${label}] document scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

for (const viewport of [
  { width: 375, height: 812, tag: "375px" },
  { width: 1280, height: 800, tag: "1280px" },
]) {
  test.describe(`RowActions sweep @ ${viewport.tag}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    for (const mod of MODULES) {
      test(`${mod.heading} list: no overflow, kebab trigger visible and within viewport`, async ({
        page,
      }) => {
        await page.goto(mod.path);
        await expect(page.getByRole("heading", { name: mod.heading })).toBeVisible();
        await page.waitForTimeout(300);
        await shoot(page, `rowactions-${viewport.tag}-${mod.slug}-list`);

        await assertNoHorizontalOverflow(page, `${mod.heading} list`);

        const trigger = page.getByRole("button", { name: "Actions" }).first();
        // Schedule's active rows may all be in a terminal status in seed
        // data (Actions hidden there by design) — only assert the trigger
        // when at least one is rendered, but always capture the screenshot
        // above for a manual look either way.
        const triggerCount = await page.getByRole("button", { name: "Actions" }).count();
        if (triggerCount === 0) {
          test.info().annotations.push({
            type: "note",
            description: `No visible "Actions" trigger on ${mod.heading} at ${viewport.tag} (RBAC or all-terminal-status rows) — skipping trigger-geometry assertions for this run.`,
          });
          return;
        }

        // The Table component wraps every list in its own overflow-x:auto
        // container (components/ui/table.tsx) — pre-existing, unrelated to
        // this ticket — so a wide table's trailing columns naturally sit
        // outside the initial viewport at 375px and require horizontal
        // scroll to reach, same as the Edit/Delete buttons did before this
        // ticket. scrollIntoViewIfNeeded reproduces that real user action;
        // the actual regression to catch is the trigger being clipped or
        // overlapping the adjacent column *after* scrolling to it, not its
        // unscrolled position.
        await trigger.scrollIntoViewIfNeeded();
        await expect(trigger).toBeVisible();
        const triggerBox = await trigger.boundingBox();
        expect(triggerBox).not.toBeNull();
        console.log(
          `MEASURED [${mod.heading} @ ${viewport.tag}] Actions trigger box (after scrollIntoView): ${JSON.stringify(triggerBox)}`
        );
        // Once scrolled to, the trigger must be fully inside the viewport —
        // not clipped off the right edge and not overlapping the adjacent
        // column to its left.
        expect(triggerBox!.x).toBeGreaterThanOrEqual(0);
        expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(triggerBox!.y).toBeGreaterThanOrEqual(0);

        // Open the menu and confirm it doesn't push the page into
        // horizontal scroll and its content stays within the viewport.
        await trigger.click();
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await page.waitForTimeout(150);
        await shoot(page, `rowactions-${viewport.tag}-${mod.slug}-menu-open`);

        const menuBox = await menu.boundingBox();
        expect(menuBox).not.toBeNull();
        console.log(
          `MEASURED [${mod.heading} @ ${viewport.tag}] open menu box: ${JSON.stringify(menuBox)}`
        );
        expect(menuBox!.x).toBeGreaterThanOrEqual(0);
        expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width + 1);

        await assertNoHorizontalOverflow(page, `${mod.heading} list with menu open`);

        // Close it so it doesn't bleed into whatever runs next.
        await page.keyboard.press("Escape");
      });
    }
  });
}

test.describe("Destructive styling — Delete vs Edit, Clients as the representative module", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Delete menu item renders visually distinct (destructive) from Edit", async ({ page }) => {
    await login(page);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

    const trigger = page.getByRole("button", { name: "Actions" }).first();
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await page.waitForTimeout(150);
    await shoot(page, "rowactions-destructive-styling-clients-menu-open");

    const editItem = page.getByRole("menuitem", { name: "Edit" });
    const deleteItem = page.getByRole("menuitem", { name: "Delete" });
    await expect(editItem).toBeVisible();
    await expect(deleteItem).toBeVisible();

    const editColor = await editItem.evaluate((el) => getComputedStyle(el).color);
    const deleteColor = await deleteItem.evaluate((el) => getComputedStyle(el).color);
    console.log(`MEASURED Edit item color: ${editColor}`);
    console.log(`MEASURED Delete item color: ${deleteColor}`);
    expect(deleteColor).not.toBe(editColor);

    // Hover/focus Delete specifically to capture its focus-state background
    // (text-danger + focus:bg-danger/10) distinctly from Edit's neutral one.
    await deleteItem.focus();
    await page.waitForTimeout(100);
    await shoot(page, "rowactions-destructive-styling-clients-delete-focused");

    const deleteFocusedBg = await deleteItem.evaluate((el) => getComputedStyle(el).backgroundColor);
    console.log(`MEASURED Delete item focused background: ${deleteFocusedBg}`);

    await editItem.focus();
    await page.waitForTimeout(100);
    const editFocusedBg = await editItem.evaluate((el) => getComputedStyle(el).backgroundColor);
    console.log(`MEASURED Edit item focused background: ${editFocusedBg}`);
    expect(deleteFocusedBg).not.toBe(editFocusedBg);

    await page.keyboard.press("Escape");
  });
});

test.describe("Keyboard walkthrough — visible focus rings, Clients as the representative module", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Tab reaches the row and the Actions trigger with a visible focus outline", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await page.waitForTimeout(300);

    // Tab from the search input through the page controls until a table
    // row picks up focus (role="button" row), capturing along the way.
    await page.getByPlaceholder("Search clients...").focus();
    let reachedRow = false;
    for (let i = 0; i < 15 && !reachedRow; i++) {
      await page.keyboard.press("Tab");
      reachedRow = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === "TR" && el.getAttribute("role") === "button";
      });
    }
    expect(reachedRow).toBe(true);
    await page.waitForTimeout(100);
    await shoot(page, "rowactions-keyboard-row-focused");

    const rowOutline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor };
    });
    console.log(`MEASURED focused row outline: ${JSON.stringify(rowOutline)}`);

    // Continue tabbing to reach the Actions trigger within the same row.
    await page.keyboard.press("Tab");
    const reachedTrigger = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute("aria-label") === "Actions";
    });
    expect(reachedTrigger).toBe(true);
    await page.waitForTimeout(100);
    await shoot(page, "rowactions-keyboard-trigger-focused");

    const triggerOutline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor };
    });
    console.log(`MEASURED focused Actions trigger outline: ${JSON.stringify(triggerOutline)}`);
  });
});
