import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  DESKTOP,
  assertNoChildOverflow,
  assertOutlinedPanel,
  colorsOf,
  contrastRatio,
  ensureOutDir,
  login,
  shootElement,
} from "./phase-8-3-helpers";

/**
 * Phase 8.3 sweep — group 3: all three Sheet forms.
 *
 * ServerFormSheet, ScheduleFormSheet and ResourceEditorSheet are the three
 * surfaces Phase 7 moved from centred modals to right-hand side sheets.
 * create-flow-smoke.spec.ts walks the Server happy path; nothing exercised
 * the validation-error presentation, the schedule sheet at all, or the
 * resource editor at all. This file covers each sheet's structure, its
 * error state, and the branch that replaces the form body outright
 * (ScheduleFormSheet's 409 ConflictState, ResourceEditorSheet's
 * duplicate-content confirmation).
 *
 * All three sheets share one contract, asserted per sheet below: right-hand
 * side, `size="form"` (`sm:max-w-xl` = 576px), a bordered header that never
 * scrolls, a scrollable body, and a footer pinned beneath it.
 */

test.use({ viewport: DESKTOP });

test.beforeAll(ensureOutDir);

/**
 * `SheetContent` slides in from the right over ~500ms. Measuring geometry
 * before that settles reads a transform mid-flight, so wait for the box to
 * stop moving rather than for a fixed duration.
 */
async function settleSheet(sheet: Locator) {
  await expect
    .poll(async () => Math.round((await sheet.boundingBox())?.x ?? -1), { timeout: 5_000 })
    .toBe(DESKTOP.width - 576);
}

/** The shared sheet shell: docked right, 576px, header/body/footer stack. */
async function assertSheetShell(sheet: Locator, label: string) {
  await settleSheet(sheet);
  const geometry = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      width: Math.round(r.width),
      top: Math.round(r.top),
      height: Math.round(r.height),
    };
  });
  console.log(`MEASURED [${label}] sheet ${JSON.stringify(geometry)}`);
  // Docked to the right edge of a 1280px viewport at the `form` size.
  expect(geometry.width).toBe(576);
  expect(geometry.x + geometry.width).toBe(DESKTOP.width);
  // Full height, so header and footer can be pinned against the body.
  expect(geometry.top).toBe(0);
  expect(geometry.height).toBe(DESKTOP.height);
  await assertNoChildOverflow(sheet, label);
  return geometry;
}

/**
 * The body — and only the body — scrolls. This is the whole reason these
 * three forms became sheets: at 12 fields the old centred dialog scrolled
 * its own header and footer out of reach.
 */
async function assertScrollingBodyOnly(sheet: Locator, label: string) {
  const scrollers = await sheet.evaluate((el) => {
    const found: { tag: string; scrollable: boolean; scrollHeight: number; clientHeight: number }[] = [];
    for (const node of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
      // A <textarea> computes to overflow-y:auto in every browser — it is a
      // form control that scrolls its own value, not a layout region.
      if (["TEXTAREA", "INPUT", "SELECT"].includes(node.tagName)) continue;
      const s = getComputedStyle(node);
      if (s.overflowY === "auto" || s.overflowY === "scroll") {
        found.push({
          tag: node.tagName.toLowerCase(),
          scrollable: node.scrollHeight > node.clientHeight,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        });
      }
    }
    return found;
  });
  console.log(`MEASURED [${label}] scroll containers ${JSON.stringify(scrollers)}`);
  expect(scrollers.length, "exactly one scroll region inside the sheet").toBe(1);
}

/** Every visible per-field error must clear AA and sit next to its control. */
async function assertFieldErrors(sheet: Locator, label: string, expectedIds: string[]) {
  for (const id of expectedIds) {
    const error = sheet.locator(`#${id}-error`);
    await expect(error, `${label}: #${id}-error is rendered`).toBeVisible();
    const control = sheet.locator(`#${id}`);
    // The control announces its own error text.
    await expect(control).toHaveAttribute("aria-describedby", `${id}-error`);
    await expect(control).toHaveAttribute("aria-invalid", "true");

    const { color } = await colorsOf(error);
    const bg = (await colorsOf(sheet)).background;
    const ratio = contrastRatio(color, bg);
    console.log(`MEASURED [${label}] #${id}-error "${(await error.textContent())?.trim()}" ${color} = ${ratio.toFixed(2)}:1`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);

    // Error text sits directly beneath its own control, not floated elsewhere.
    const controlBox = await control.boundingBox();
    const errorBox = await error.boundingBox();
    expect(errorBox!.y).toBeGreaterThanOrEqual(controlBox!.y);
  }
}

async function openServerSheet(page: Page) {
  await login(page);
  await page.goto("/servers");
  await expect(page.getByRole("heading", { name: "Servers", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New server" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

test("ServerFormSheet: all 12 fields render inside the sheet shell", async ({ page }) => {
  const sheet = await openServerSheet(page);
  await expect(sheet.getByText("New server", { exact: true })).toBeVisible();

  // The 12 editable fields, by the DOM id each control owns.
  const FIELD_IDS = [
    "display_name",
    "environment",
    "hostname",
    "ip_address",
    "tech_stack",
    "service_type",
    "access_method",
    "access_host",
    "access_port",
    "access_path",
    "monitoring_url",
    "notes",
  ];
  for (const id of FIELD_IDS) {
    await expect(sheet.locator(`#${id}`), `#${id} is present`).toBeAttached();
  }
  console.log(`MEASURED [ServerFormSheet] fields present=${FIELD_IDS.length}`);

  await assertSheetShell(sheet, "ServerFormSheet");
  await assertScrollingBodyOnly(sheet, "ServerFormSheet");

  // The Access documentation fieldset is one of 8.1a's 11 panelSurface sites.
  const fieldset = sheet.locator("fieldset");
  await expect(fieldset).toBeVisible();
  await assertOutlinedPanel(fieldset, "ServerFormSheet access fieldset");

  // Header and footer stay put while the body scrolls.
  const header = sheet.locator("div.shrink-0").first();
  const headerBefore = (await header.boundingBox())!.y;
  const body = sheet.locator("div.overflow-y-auto").first();
  await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await page.waitForTimeout(200);
  const headerAfter = (await header.boundingBox())!.y;
  console.log(`MEASURED [ServerFormSheet] header y before=${headerBefore} after scroll=${headerAfter}`);
  expect(headerAfter).toBe(headerBefore);
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();

  await shootElement(sheet, "12-sheet-server-form");
});

/**
 * Regression guard for the `Port` label overflow 8.3 found and 8.3a fixed.
 *
 * `Label` is `inline-flex` and cannot wrap (8.1a unified Label and
 * OptionalLabel onto that box model), so "PORT (optional)" lays out on one
 * line at ~124px — which used to sit inside a hardcoded `w-24` (96px) column
 * and spill ~15px past the panel border. The column is now content-sized by
 * the grid's `auto` track, so the label always fits. This asserts nothing
 * inside the panel crosses its border; `ServerEditCard` has the twin guard in
 * phase-8-3-detail-pages.spec.ts.
 */
test("ServerFormSheet: nothing inside the Access documentation panel overflows it", async ({
  page,
}) => {
  const sheet = await openServerSheet(page);
  const fieldset = sheet.locator("fieldset");
  await expect(fieldset).toBeVisible();
  await assertNoChildOverflow(fieldset, "ServerFormSheet access fieldset");

  // The Port column is sized by its label, and both are flush with the
  // panel's inner right edge rather than short of it or past it.
  const geometry = await fieldset.evaluate((fs) => {
    const label = fs.querySelector('label[for="access_port"]')!.getBoundingClientRect();
    const input = fs.querySelector("#access_port")!.getBoundingClientRect();
    return {
      label: Math.round(label.width),
      input: Math.round(input.width),
      labelFitsInput: label.width <= input.width + 1,
    };
  });
  console.log(`MEASURED [ServerFormSheet] Port label=${geometry.label}px input=${geometry.input}px`);
  expect(geometry.labelFitsInput, "the Port label fits the column its input defines").toBe(true);
});

test("ServerFormSheet: empty submit flags all six required fields and focuses the first", async ({
  page,
}) => {
  const sheet = await openServerSheet(page);
  await sheet.getByRole("button", { name: "Save" }).click();

  await assertFieldErrors(sheet, "ServerFormSheet", [
    "display_name",
    "environment",
    "hostname",
    "service_type",
    "access_method",
    "access_host",
  ]);
  // Focus lands on the first invalid control in render order.
  await expect(sheet.locator("#display_name")).toBeFocused();

  // The invalid control carries the danger underline, not just a red message.
  const underline = await sheet.locator("#display_name").evaluate((el) => getComputedStyle(el).boxShadow);
  console.log(`MEASURED [ServerFormSheet] invalid control box-shadow=${underline}`);
  expect(underline).not.toBe("none");

  await assertNoChildOverflow(sheet, "ServerFormSheet (errors)");
  await shootElement(sheet, "13-sheet-server-form-errors");
});

test("ServerFormSheet: field-level rules fire for port, path and URL", async ({ page }) => {
  const sheet = await openServerSheet(page);
  await sheet.locator("#display_name").fill("Sweep server");
  await sheet.locator("#hostname").fill("sweep.local");
  await sheet.locator("#access_host").fill("sweep.internal");
  await sheet.locator("#access_port").fill("70000");
  await sheet.locator("#access_path").fill("no-leading-slash");
  await sheet.locator("#monitoring_url").fill("not a url");
  await sheet.getByRole("button", { name: "Save" }).click();

  await assertFieldErrors(sheet, "ServerFormSheet", ["access_port", "access_path", "monitoring_url"]);
  await expect(sheet.locator("#access_port-error")).toHaveText(/between 1 and 65535/);
  await expect(sheet.locator("#access_path-error")).toHaveText(/must start with \//);
  await expect(sheet.locator("#monitoring_url-error")).toHaveText(/valid URL/);
});

async function openScheduleCreateSheet(page: Page) {
  await login(page);
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New schedule" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Opens the edit sheet for the first row that still offers an Edit action. */
async function openScheduleEditSheet(page: Page) {
  await login(page);
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
  await page.waitForTimeout(600);

  const triggers = page.getByRole("button", { name: "Actions" });
  const count = await triggers.count();
  for (let i = 0; i < count; i += 1) {
    await triggers.nth(i).click();
    const edit = page.getByRole("menuitem", { name: "Edit" });
    if (await edit.count()) {
      await edit.click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      return sheet;
    }
    await page.keyboard.press("Escape");
  }
  throw new Error("No schedule row offered an Edit action — seed data has no non-terminal schedule.");
}

test("ScheduleFormSheet (create): renders the create form in the shared sheet shell", async ({
  page,
}) => {
  const sheet = await openScheduleCreateSheet(page);
  await expect(sheet.getByText("New schedule", { exact: true })).toBeVisible();
  await expect(sheet.locator("#title")).toBeEditable();

  await assertSheetShell(sheet, "ScheduleFormSheet (create)");
  await assertScrollingBodyOnly(sheet, "ScheduleFormSheet (create)");
  await shootElement(sheet, "14-sheet-schedule-create");
});

test("ScheduleFormSheet (create): empty submit flags title, date, assignee and the parent rule", async ({
  page,
}) => {
  const sheet = await openScheduleCreateSheet(page);
  await sheet.getByRole("button", { name: /^Save|^Create/ }).click();

  await assertFieldErrors(sheet, "ScheduleFormSheet", ["title", "date", "assignedTo"]);
  // The cross-field rule (project OR server) mirrors the backend CHECK
  // constraint and renders as its own message rather than a banner.
  await expect(sheet.getByText("Select a Project, a Server, or both.")).toBeVisible();
  await expect(sheet.locator("#title")).toBeFocused();

  await assertNoChildOverflow(sheet, "ScheduleFormSheet (errors)");
  await shootElement(sheet, "15-sheet-schedule-create-errors");
});

test("ScheduleFormSheet (edit): immutable fields are locked, notes is the one editable field", async ({
  page,
}) => {
  const sheet = await openScheduleEditSheet(page);
  await expect(sheet.getByText("Edit schedule", { exact: true })).toBeVisible();

  // Everything except notes is fixed after creation.
  await expect(sheet.locator("#title")).toBeDisabled();
  await expect(sheet.locator("#notes")).toBeEditable();

  // The current status renders as a badge, using the same four-colour
  // vocabulary the list uses.
  const badge = sheet.locator("div.inline-flex.items-center.rounded-sm.border").first();
  await expect(badge).toBeVisible();
  const { color, background } = await colorsOf(badge);
  console.log(`MEASURED [ScheduleFormSheet edit] status badge ${color} on ${background}`);
  expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(4.5);

  await assertSheetShell(sheet, "ScheduleFormSheet (edit)");
  await shootElement(sheet, "16-sheet-schedule-edit");
});

test("ScheduleFormSheet (edit): a 409 replaces the form with ConflictState", async ({ page }) => {
  // Forced rather than raced: the optimistic-lock branch is unreachable
  // against a single-client seed, and this is the state Phase 7 restyled.
  await page.route("**/api/schedules/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "CONFLICT",
          message: "This schedule was updated by someone else since you loaded it.",
        },
      }),
    });
  });

  const sheet = await openScheduleEditSheet(page);
  await sheet.locator("#notes").fill(`Sweep note ${Date.now()}`);
  await sheet.getByRole("button", { name: /^Save|^Update/ }).click();

  const conflict = sheet.getByText("This record changed");
  await expect(conflict).toBeVisible();
  await expect(
    sheet.getByText("This schedule was updated by someone else since you loaded it.")
  ).toBeVisible();

  // The form body and its Save are gone — a Save over an unrendered form
  // would be inert; ConflictState carries its own two actions instead.
  await expect(sheet.locator("#notes")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Reload latest version" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Keep my changes/ })).toBeVisible();
  // The header survives, so the sheet keeps its accessible name.
  await expect(sheet.getByText("Edit schedule", { exact: true })).toBeVisible();

  const panel = conflict.locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");
  await assertOutlinedPanel(panel, "ConflictState");
  await assertNoChildOverflow(sheet, "ScheduleFormSheet (conflict)");
  await shootElement(sheet, "17-sheet-schedule-conflict");
});

async function openResourceCreateSheet(page: Page) {
  await login(page);
  await page.goto("/resources");
  await expect(page.getByRole("heading", { name: "Resources", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New resource" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Selects a resource, then opens "Add version".
 *
 * Deliberately not "the first row": the seeded list is sorted title-first and
 * opens with two `link` resources, which carry an `external_url` and no
 * `content` at all. Naming a body-bearing resource keeps the pre-fill and
 * duplicate-content assertions about the sheet rather than about which row
 * happened to sort first.
 */
const CONTENT_RESOURCE = "WMS Incident Response Runbook";

async function openResourceNewVersionSheet(page: Page) {
  await login(page);
  await page.goto("/resources");
  await expect(page.getByRole("heading", { name: "Resources", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(CONTENT_RESOURCE) }).click();
  await page.getByRole("button", { name: "Add version" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

test("ResourceEditorSheet (create): create mode renders in the shared sheet shell", async ({
  page,
}) => {
  const sheet = await openResourceCreateSheet(page);
  await expect(sheet.getByText("New resource", { exact: true })).toBeVisible();
  await expect(
    sheet.getByText("Create a runbook, SOP, or other reference document.")
  ).toBeVisible();

  for (const id of ["title", "category", "content", "externalUrl", "commitMessage"]) {
    await expect(sheet.locator(`#${id}`), `#${id} is present`).toBeAttached();
  }
  await assertSheetShell(sheet, "ResourceEditorSheet (create)");
  await assertScrollingBodyOnly(sheet, "ResourceEditorSheet (create)");
  await shootElement(sheet, "18-sheet-resource-create");
});

test("ResourceEditorSheet (create): empty submit flags title and content", async ({ page }) => {
  const sheet = await openResourceCreateSheet(page);
  await sheet.getByRole("button", { name: /^Save|^Create/ }).click();

  await expect(sheet.locator("#title-error")).toBeVisible();
  await expect(sheet.locator("#title-error")).toHaveText(/Title is required/);
  await expect(sheet.locator("#title")).toBeFocused();
  await assertFieldErrors(sheet, "ResourceEditorSheet", ["title"]);

  await shootElement(sheet, "19-sheet-resource-create-errors");
});

test("ResourceEditorSheet (new version): pre-filled from the current version, type locked", async ({
  page,
}) => {
  const sheet = await openResourceNewVersionSheet(page);
  await expect(sheet.getByText("Add new version", { exact: true })).toBeVisible();
  await expect(
    sheet.getByText("Pre-filled with the current version's content — edit and save to record a new version.")
  ).toBeVisible();

  // Type is immutable on a new version, so the select is simply absent.
  await expect(sheet.locator("#type")).toHaveCount(0);
  // The body pre-fills from the current version rather than opening empty.
  await expect.poll(async () => (await sheet.locator("#content").inputValue()).length, {
    timeout: 10_000,
  }).toBeGreaterThan(0);

  await assertSheetShell(sheet, "ResourceEditorSheet (new version)");
  await shootElement(sheet, "20-sheet-resource-new-version");
});

test("ResourceEditorSheet (new version): unchanged content raises the duplicate confirmation", async ({
  page,
}) => {
  const sheet = await openResourceNewVersionSheet(page);
  await expect.poll(async () => (await sheet.locator("#content").inputValue()).length, {
    timeout: 10_000,
  }).toBeGreaterThan(0);

  // Save without touching the pre-filled content: byte-identical to the
  // current version, which is exactly what the confirmation exists for.
  await sheet.getByRole("button", { name: /^Save|^Create/ }).click();

  const prompt = sheet.getByText("This content is identical to the current version. Create a new version anyway?");
  await expect(prompt).toBeVisible();

  // Like the 409 branch, this replaces the body AND the footer.
  await expect(sheet.locator("#content")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Create anyway" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(sheet.getByText("Add new version", { exact: true })).toBeVisible();

  const callout = prompt.locator("xpath=ancestor::div[@role='alert'][1]");
  await assertOutlinedPanel(callout, "Duplicate-content confirmation");
  await assertNoChildOverflow(sheet, "ResourceEditorSheet (duplicate)");
  await shootElement(sheet, "21-sheet-resource-duplicate-confirm");

  // Cancel returns to the form rather than committing anything.
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet.locator("#content")).toBeVisible();
});
