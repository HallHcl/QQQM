import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * 1280px visual check for the ServersPage table redesign (Connection column,
 * service-type subtitle, VPN badge). Mirrors the login/shoot helper pattern
 * from 375px-sweep.spec.ts, scoped to just this page/viewport since that's
 * all this ticket touches.
 *
 * Requires the backend + db + `npm run dev` (frontend) already running
 * locally; this spec does not start them.
 */

const OUT_DIR = path.resolve(process.cwd(), "playwright-screenshots");
const ADMIN = { username: "admin", password: "admin123" };

test.use({ viewport: { width: 1280, height: 800 } });

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

test.describe("1280px sweep", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("ServersPage list at 1280px: Connection column fits without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/servers");
    await expect(page.getByRole("heading", { name: "Servers" })).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "09-servers-page-1280");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    console.log(`MEASURED document scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
