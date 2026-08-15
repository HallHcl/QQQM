import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Throwaway 375px visual sweep — Ticket C (tooling gap follow-up).
 *
 * Limited to the pages/dialogs the source-only audit could not verify in a
 * real browser: two grid pages with an lg: breakpoint, the DialogTitle
 * break-words fix, and the two touch-target re-measurements from Ticket A.
 * Not a full 8-module audit — see the ticket for what's deliberately
 * excluded.
 *
 * Requires the backend + db + `npm run dev` (frontend) already running
 * locally; this spec does not start them.
 */

const OUT_DIR = path.resolve(process.cwd(), "playwright-screenshots");
const ADMIN = { username: "admin", password: "admin123" };
const LONG_NAME = "Krzysztofferpendragonwickramasinghebalasubramaniam";

test.use({ viewport: { width: 375, height: 812 } });

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

test.describe("375px sweep", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("ClientsPage list at 375px", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "01-clients-page");
  });

  test("PeoplePage list at 375px", async ({ page }) => {
    await page.goto("/people");
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "02-people-page");
  });

  test("ServersPage list at 375px", async ({ page }) => {
    await page.goto("/servers");
    await expect(page.getByRole("heading", { name: "Servers" })).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "03-servers-page");
  });

  test("SchedulePage at 375px (lg:grid-cols-[auto_1fr])", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "04-schedule-page");
  });

  test("ResourcesPage at 375px (lg:grid-cols-[320px_1fr])", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.getByRole("heading", { name: "Resources" })).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "05-resources-page");
  });

  test("PersonDetailDialog with 40+ char no-space name: overflow + touch targets", async ({
    page,
    request,
    baseURL,
  }) => {
    // Create the long-name fixture via the API (not the UI form) so this
    // test only exercises what it's checking: dialog rendering, not the
    // create-person flow.
    const apiBase = baseURL!.replace("5173", "4000") + "/api";
    const loginRes = await request.post(`${apiBase}/auth/login`, {
      data: ADMIN,
    });
    const { token } = await loginRes.json();

    const createRes = await request.post(`${apiBase}/people`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: LONG_NAME, type: "internal_engineer" },
    });
    expect(createRes.ok()).toBeTruthy();

    await page.goto("/people");
    await page.getByPlaceholder(/search/i).fill(LONG_NAME);
    await page.waitForTimeout(500);
    await page.getByText(LONG_NAME).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "06-person-detail-dialog-long-name");

    // Touch-target re-measurement 1: dialog close button, live rendered box.
    const closeButton = dialog.getByRole("button", { name: "Close" });
    const closeBox = await closeButton.boundingBox();
    console.log(
      `MEASURED close button box: ${JSON.stringify(closeBox)} (width x height in CSS px)`
    );
    expect(closeBox).not.toBeNull();

    // Touch-target re-measurement 2: does the wrapped (break-words) title
    // visually collide with the close button?
    const titleBox = await dialog.getByRole("heading", { level: 2 }).boundingBox().catch(() => null);
    console.log(`MEASURED title box: ${JSON.stringify(titleBox)}`);
    if (closeBox && titleBox) {
      const overlapX = titleBox.x + titleBox.width > closeBox.x;
      const overlapY = titleBox.y + titleBox.height > closeBox.y;
      console.log(
        `Title/close overlap check -> titleRight=${titleBox.x + titleBox.width}, closeLeft=${closeBox.x}, titleBottom=${titleBox.y + titleBox.height}, closeTop=${closeBox.y}, overlapX=${overlapX}, overlapY=${overlapY}`
      );
    }
  });

  test("ServerFormDialog at 375px: OptionalLabel fields + max-h-[85vh] scroll", async ({
    page,
  }) => {
    await page.goto("/servers");
    await page.getByRole("button", { name: "New server" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    await shoot(page, "07-server-form-dialog-top");

    // Scroll within the dialog to confirm overflow-y-auto actually scrolls
    // the form content at 375px rather than the page.
    await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(200);
    await shoot(page, "08-server-form-dialog-scrolled");
  });
});
