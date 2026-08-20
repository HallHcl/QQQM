import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Visual sweep for the Server/Environment modal-to-inline-edit migration.
 * Confirms the new ServerEditCard/EnvironmentEditCard render cleanly (no
 * overflow/clipping) in both read and edit mode, at 375px and 1280px, and
 * that Save/Cancel stay reachable and keyboard-operable.
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
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
}

function checkNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

for (const viewport of [
  { width: 375, height: 900, label: "375px" },
  { width: 1280, height: 900, label: "1280px" },
]) {
  test.describe(`inline edit sweep at ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`ServerDetailPage read vs edit mode at ${viewport.label}`, async ({ page }) => {
      await login(page);
      await page.goto("/servers");
      await expect(page.getByRole("heading", { name: "Servers" })).toBeVisible();

      // Navigate into the first server's detail page via a row click.
      const firstRow = page.getByRole("button", { name: /^View / }).first();
      await firstRow.click();
      await expect(page).toHaveURL(/\/servers\/[^/]+$/);
      await page.waitForTimeout(300);
      await shoot(page, `server-detail-read-${viewport.label}`);

      let overflow = await checkNoHorizontalOverflow(page);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const editButton = page.getByRole("button", { name: /^edit$/i });
      await expect(editButton).toBeVisible();
      await editButton.click();
      await expect(page).toHaveURL(/\?edit=true/);
      await expect(page.getByLabel("Display name")).toBeVisible();
      await page.waitForTimeout(300);
      await shoot(page, `server-detail-edit-${viewport.label}`);

      overflow = await checkNoHorizontalOverflow(page);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      // Save/Cancel are reachable and keyboard-operable.
      const cancelButton = page.getByRole("button", { name: /cancel/i });
      const saveButton = page.getByRole("button", { name: /^save$/i });
      await expect(cancelButton).toBeVisible();
      await expect(saveButton).toBeVisible();
      await cancelButton.focus();
      await expect(cancelButton).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(saveButton).toBeFocused();

      // Cancel via keyboard returns to read mode and drops ?edit from the URL.
      await cancelButton.focus();
      await page.keyboard.press("Enter");
      await expect(page).not.toHaveURL(/\?edit=true/);
      await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
    });

    test(`EnvironmentDetailPage read vs edit mode at ${viewport.label}`, async ({ page }) => {
      await login(page);
      await page.goto("/environments");
      await expect(page.getByRole("heading", { name: "Environments" })).toBeVisible();

      const firstRow = page.getByRole("button", { name: /^View / }).first();
      await firstRow.click();
      await expect(page).toHaveURL(/\/environments\/[^/]+$/);
      await page.waitForTimeout(300);
      await shoot(page, `environment-detail-read-${viewport.label}`);

      let overflow = await checkNoHorizontalOverflow(page);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const editButton = page.getByRole("button", { name: /^edit$/i });
      // Environment edit is admin-only; the seeded admin user should see it.
      await expect(editButton).toBeVisible();
      await editButton.click();
      await expect(page).toHaveURL(/\?edit=true/);
      await expect(page.getByLabel("Name")).toBeVisible();
      await page.waitForTimeout(300);
      await shoot(page, `environment-detail-edit-${viewport.label}`);

      overflow = await checkNoHorizontalOverflow(page);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const cancelButton = page.getByRole("button", { name: /cancel/i });
      const saveButton = page.getByRole("button", { name: /^save$/i });
      await expect(cancelButton).toBeVisible();
      await expect(saveButton).toBeVisible();
      await cancelButton.focus();
      await expect(cancelButton).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(saveButton).toBeFocused();

      await cancelButton.focus();
      await page.keyboard.press("Enter");
      await expect(page).not.toHaveURL(/\?edit=true/);
      await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
    });
  });
}
