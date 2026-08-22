import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Throwaway verification sweep for the Overview metric tiles ticket.
 * Requires backend + db + `npm run dev` already running.
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

/** Reads a tile's rendered value straight out of the DOM. */
async function tile(page: Page, label: string) {
  const value = page.locator(`p:text-is("${label}") + p`);
  await expect(value).toBeVisible();
  return (await value.textContent())?.trim();
}

test("overview metric tiles at 1280px show real seeded counts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await page.waitForTimeout(1200);

  expect(await tile(page, "Total Clients")).toBe("2");
  expect(await tile(page, "Total Projects")).toBe("2");
  expect(await tile(page, "Environments")).toBe("5");
  expect(await tile(page, "Servers")).toBe("8");
  expect(await tile(page, "Resources")).toBe("8");
  expect(await tile(page, "Pending Schedules")).toBe("2");

  // Picker moved out of PageHeader into the client card's header.
  const h1 = page.getByRole("heading", { name: "Overview", level: 1 });
  await expect(h1.locator("xpath=..").getByLabel("Client")).toHaveCount(0);
  await expect(page.getByLabel("Client")).toBeVisible();

  await page.screenshot({ path: path.join(OUT_DIR, "overview-metrics-1280.png") });
});

test("overview metric tiles at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.waitForTimeout(1200);
  await expect(page.locator('p:text-is("Pending Schedules")')).toBeVisible();
  await page.screenshot({
    path: path.join(OUT_DIR, "overview-metrics-375.png"),
    fullPage: true,
  });
});

test("one failing endpoint greys only its own tile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  // Fail servers only, then reload so the tile query runs against the route.
  await page.route("**/api/servers?**", (route) =>
    route.fulfill({ status: 500, body: JSON.stringify({ error: { message: "Boom" } }) })
  );
  await page.reload();

  // 500 is retryable under lib/queryClient.ts (2 retries, exponential
  // backoff), so the tile legitimately sits in its loading state for a few
  // seconds before settling on the error dash. Poll rather than fix a wait.
  await expect
    .poll(() => tile(page, "Servers"), { timeout: 20_000 })
    .toBe("—");
  expect(await tile(page, "Total Clients")).toBe("2");
  expect(await tile(page, "Environments")).toBe("5");
  expect(await tile(page, "Resources")).toBe("8");
  expect(await tile(page, "Pending Schedules")).toBe("2");

  await page.screenshot({ path: path.join(OUT_DIR, "overview-metrics-one-tile-error.png") });
});
