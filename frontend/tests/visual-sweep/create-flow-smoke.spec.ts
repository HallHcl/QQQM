import { test, expect } from "@playwright/test";

/**
 * Manual Playwright smoke checks confirming the create flows are untouched
 * by the modal-to-inline-edit migration: the "New <entity>" button still
 * opens a working create overlay and successfully creates a record end to
 * end, with no ?edit param involved anywhere in the flow.
 *
 * Covers Server and Environment — the two entities that received that
 * migration. Both assert `getByRole("dialog")`: Server's overlay became a
 * side sheet in Phase 7, but `sheet.tsx` is built on
 * `@radix-ui/react-dialog`, so the role is the same. Environment is still
 * a true centred modal (EnvironmentFormDialog).
 *
 * Requires the backend + db + `npm run dev` (frontend) already running
 * locally; this spec does not start them. Not wired into CI. Creates a
 * real (throwaway) row each run.
 */

const ADMIN = { username: "admin", password: "admin123" };

test("New server still opens a working create modal (unaffected by the edit migration)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview/);

  await page.goto("/servers");
  await page.getByRole("button", { name: "New server" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(page.url()).not.toContain("edit=true");

  const suffix = Date.now();
  await dialog.getByLabel("Display name").fill(`Smoke Create ${suffix}`);
  await dialog.getByLabel("Hostname").fill(`smoke-${suffix}.local`);
  await dialog.getByLabel("Access host").fill(`smoke-${suffix}.internal`);

  const [environmentTrigger, serviceTypeTrigger, accessMethodTrigger] = await dialog
    .getByRole("combobox")
    .all();
  await environmentTrigger.click();
  await page.getByRole("option").first().click();
  await serviceTypeTrigger.click();
  await page.getByRole("option", { name: "Application" }).click();
  await accessMethodTrigger.click();
  await page.getByRole("option", { name: "SSH" }).click();

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(`Smoke Create ${suffix}`)).toBeVisible();
});

test("New environment still opens a working create modal (unaffected by the edit migration)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview/);

  await page.goto("/environments");
  await page.getByRole("button", { name: "New environment" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(page.url()).not.toContain("edit=true");

  const suffix = Date.now();
  await dialog.getByLabel("Name").fill(`Smoke Env ${suffix}`);

  // Project is required and is a ProjectPicker (Radix Select, so a
  // combobox); it is the only combobox in this dialog. Description is
  // optional and deliberately left blank — this is a create smoke test,
  // not a field-coverage test.
  await dialog.getByRole("combobox").click();
  await page.getByRole("option").first().click();

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(`Smoke Env ${suffix}`)).toBeVisible();
});
