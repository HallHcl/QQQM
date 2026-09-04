import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Throwaway verification sweep for the Overview metric tiles ticket.
 * Requires backend + db + `npm run dev` already running.
 */

const OUT_DIR = path.resolve(process.cwd(), "playwright-screenshots");
const ADMIN = { username: "admin", password: "admin123" };

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

interface ExpectedCounts {
  clients: string;
  projects: string;
  environments: string;
  servers: string;
  resources: string;
  pendingSchedules: string;
}

let expectedCounts: ExpectedCounts;

/**
 * Fetches the same live totals OverviewPage.tsx's tiles read
 * (`per_page: 1`, `pagination.total`) directly through the API, so the
 * assertions below track whatever the shared local DB actually contains
 * instead of a literal snapshot. `npm run seed` only inserts 1 client and 1
 * person (see backend/src/db/seed.ts) — these counts were never tied to a
 * reproducible fixture, and drift further every time create-flow-smoke.spec.ts
 * (or manual UI use) adds a real row. Fetching live removes the drift instead
 * of chasing it.
 */
test.beforeAll(async ({ request, baseURL }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const apiBase = baseURL!.replace("5173", "4000") + "/api";
  const loginRes = await request.post(`${apiBase}/auth/login`, { data: ADMIN });
  const { token } = await loginRes.json();

  async function total(path: string, extraQuery = "") {
    const res = await request.get(`${apiBase}/${path}?per_page=1${extraQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    return String(body.pagination.total);
  }

  expectedCounts = {
    clients: await total("clients"),
    projects: await total("projects"),
    environments: await total("environments"),
    servers: await total("servers"),
    resources: await total("resources"),
    pendingSchedules: await total("schedules", "&status=pending"),
  };
});

test("overview metric tiles at 1280px show real seeded counts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await page.waitForTimeout(1200);

  expect(await tile(page, "Total Clients")).toBe(expectedCounts.clients);
  expect(await tile(page, "Total Projects")).toBe(expectedCounts.projects);
  expect(await tile(page, "Environments")).toBe(expectedCounts.environments);
  expect(await tile(page, "Servers")).toBe(expectedCounts.servers);
  expect(await tile(page, "Resources")).toBe(expectedCounts.resources);
  expect(await tile(page, "Pending Schedules")).toBe(expectedCounts.pendingSchedules);

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
  expect(await tile(page, "Total Clients")).toBe(expectedCounts.clients);
  expect(await tile(page, "Environments")).toBe(expectedCounts.environments);
  expect(await tile(page, "Resources")).toBe(expectedCounts.resources);
  expect(await tile(page, "Pending Schedules")).toBe(expectedCounts.pendingSchedules);

  await page.screenshot({ path: path.join(OUT_DIR, "overview-metrics-one-tile-error.png") });
});
