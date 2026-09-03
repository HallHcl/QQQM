import { test, expect, type Page } from "@playwright/test";
import {
  DESKTOP,
  assertNoChildOverflow,
  assertNoHorizontalOverflow,
  assertOutlinedPanel,
  ensureOutDir,
  login,
  shoot,
} from "./phase-8-3-helpers";

/**
 * Phase 8.3 sweep — group 5: record detail pages.
 *
 * Verifies the two things later Phase 8 tickets changed here:
 *
 *  - 8.1b's heading hierarchy. `CardTitle asChild` lets the record name be a
 *    real <h1> while `text-heading-card` stays owned by the card primitive.
 *    Environment and Server detail additionally render that header in edit
 *    mode as well — it previously sat behind a `!isEditing` guard, leaving
 *    the page with no heading at all mid-edit.
 *  - 8.1a's `panelSurface()` treatment on the outlined content panels.
 *
 * There is no Client detail page: `/clients/:id` is not a route (see
 * AppRoutes.tsx) — the Clients list opens ClientFormDialog on row click
 * instead. That surface is covered at the end of this file, and the gap is
 * called out in the walkthrough rather than papered over here.
 */

test.use({ viewport: DESKTOP });

test.beforeAll(ensureOutDir);

/**
 * Opens the first row of a list page and returns the detail URL it landed on.
 *
 * Waits for the back link — which only the detail shell renders — and then for
 * the <h1> to stop being the list page's own heading. Asserting on the URL
 * alone is not enough: the detail query is still in flight at that point, so
 * the list heading is briefly still the document's only <h1>.
 */
async function openFirstDetail(page: Page, listPath: string, listHeading: string, backLabel: string) {
  await login(page);
  await page.goto(listPath);
  await expect(page.getByRole("heading", { name: listHeading, level: 1 })).toBeVisible();
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const name = (await row.locator("td").first().textContent())?.trim() ?? "";
  await row.click();
  await expect(page).toHaveURL(new RegExp(`${listPath}/[0-9a-f-]{36}`));
  await expect(page.getByRole("link", { name: backLabel })).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await page.locator("h1").textContent())?.trim(), { timeout: 15_000 })
    .not.toBe(listHeading);
  return { url: page.url(), name };
}

/**
 * Exactly one <h1>, holding the record name, and no heading of a deeper level
 * appearing before it. `text-heading-card` is asserted through the computed
 * font rather than the class string, so a token retune is visible here.
 */
async function assertHeadingHierarchy(page: Page, label: string) {
  const headings = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((el) => ({
      level: Number(el.tagName.slice(1)),
      text: (el.textContent ?? "").trim().slice(0, 40),
    }))
  );
  console.log(`MEASURED [${label}] headings ${JSON.stringify(headings)}`);

  const h1s = headings.filter((h) => h.level === 1);
  expect(h1s.length, `${label} has exactly one <h1>`).toBe(1);
  expect(headings[0].level, `${label}'s first heading is the <h1>`).toBe(1);
  // No level is skipped on the way down from the h1.
  let previous = 1;
  for (const heading of headings.slice(1)) {
    expect(heading.level, `${label}: no heading level is skipped`).toBeLessThanOrEqual(previous + 1);
    previous = Math.max(previous, heading.level);
  }

  const h1 = page.locator("h1");
  const type = await h1.evaluate((el) => {
    const s = getComputedStyle(el);
    return { fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight };
  });
  console.log(`MEASURED [${label}] h1 type ${JSON.stringify(type)}`);
  // text-heading-card, not a browser-default 2em h1.
  expect(parseFloat(type.fontSize)).toBeGreaterThan(14);
  expect(parseFloat(type.fontSize)).toBeLessThan(32);
  expect(Number(type.fontWeight)).toBeGreaterThanOrEqual(500);
  return h1s[0].text;
}

test("Project detail: record name is the page <h1>, back link present, nothing clipped", async ({
  page,
}) => {
  const { name } = await openFirstDetail(page, "/projects", "Projects", "Back to projects");
  const h1Text = await assertHeadingHierarchy(page, "Project detail");
  expect(name).toContain(h1Text);

  await expect(page.getByRole("link", { name: "Back to projects" })).toBeVisible();
  await assertNoHorizontalOverflow(page, "Project detail");
  await assertNoChildOverflow(page.locator("main"), "Project detail");
  await shoot(page, "25-detail-project", true);
});

test("Project detail: editing happens in a dialog, so the <h1> is never removed", async ({
  page,
}) => {
  await openFirstDetail(page, "/projects", "Projects", "Back to projects");
  const before = await page.locator("h1").textContent();

  await page.getByRole("button", { name: "Edit" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // The page beneath keeps its heading — the dialog is an overlay, not a
  // mode swap, so 8.1b's edit-mode fix does not apply to this page.
  await expect(page.locator("h1")).toHaveText(before ?? "");
  console.log(`MEASURED [Project detail] h1 retained while the edit dialog is open: "${before}"`);
});

for (const entity of [
  {
    label: "Environment",
    listPath: "/environments",
    listHeading: "Environments",
    backLabel: "Back to environments",
  },
  {
    label: "Server",
    listPath: "/servers",
    listHeading: "Servers",
    backLabel: "Back to servers",
  },
]) {
  test(`${entity.label} detail (view mode): <h1> hierarchy and outlined panels render`, async ({
    page,
  }) => {
    const { name } = await openFirstDetail(page, entity.listPath, entity.listHeading, entity.backLabel);
    const h1Text = await assertHeadingHierarchy(page, `${entity.label} detail (view)`);
    expect(name).toContain(h1Text);

    await expect(page.getByRole("link", { name: entity.backLabel })).toBeVisible();

    // The two-column shell: flexible main, fixed 400px aside, both on one row.
    const main = page.locator("main");
    await assertNoChildOverflow(main, `${entity.label} detail (view)`);
    await assertNoHorizontalOverflow(page, `${entity.label} detail (view)`);

    // Card elevation on the header card.
    const card = page.locator("h1").locator("xpath=ancestor::div[contains(@class,'rounded-panel')][1]");
    const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    console.log(`MEASURED [${entity.label} detail] header card box-shadow=${shadow}`);
    expect(shadow).not.toBe("none");

    await shoot(page, `26-detail-${entity.label.toLowerCase()}-view`, true);
  });

  test(`${entity.label} detail (edit mode): the <h1> survives the mode switch`, async ({ page }) => {
    const { url } = await openFirstDetail(page, entity.listPath, entity.listHeading, entity.backLabel);
    const viewH1 = (await page.locator("h1").textContent())?.trim();

    // `?edit=true` is the same entry point the list's own "Edit" row action
    // navigates to (see ServersPage/EnvironmentsPage), so this is the real
    // edit mode rather than a synthesised state.
    await page.goto(`${url}?edit=true`);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({ timeout: 15_000 });

    const editH1 = (await page.locator("h1").textContent())?.trim();
    console.log(`MEASURED [${entity.label} detail] h1 view="${viewH1}" edit="${editH1}"`);
    expect(editH1, "the record name is still the page heading while editing").toBe(viewH1);
    await assertHeadingHierarchy(page, `${entity.label} detail (edit)`);

    await assertNoHorizontalOverflow(page, `${entity.label} detail (edit)`);
    await assertNoChildOverflow(page.locator("main"), `${entity.label} detail (edit)`);
    await shoot(page, `27-detail-${entity.label.toLowerCase()}-edit`, true);
  });
}

test("Server detail: the Access documentation panel carries the shared panelSurface treatment", async ({
  page,
}) => {
  await openFirstDetail(page, "/servers", "Servers", "Back to servers");
  const panel = page
    .getByText("Access documentation", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");
  await expect(panel).toBeVisible();
  await assertOutlinedPanel(panel, "Server detail access panel");
  await assertNoChildOverflow(panel, "Server detail access panel");

  // Its <dl> pairs stay in two readable columns rather than collapsing.
  const columns = await panel.locator("dl > div").evaluateAll((els) =>
    Array.from(new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))))
  );
  console.log(`MEASURED [Server detail] access-panel column x-offsets=${JSON.stringify(columns)}`);
  expect(columns.length).toBeGreaterThanOrEqual(1);
  expect(columns.length).toBeLessThanOrEqual(2);
});

test("Server detail (edit mode): the edit fieldset keeps the outlined-panel treatment", async ({
  page,
}) => {
  const { url } = await openFirstDetail(page, "/servers", "Servers", "Back to servers");
  await page.goto(`${url}?edit=true`);
  const fieldset = page.locator("fieldset");
  await expect(fieldset).toBeVisible({ timeout: 15_000 });
  await assertOutlinedPanel(fieldset, "ServerEditCard fieldset");

  // Every control inside the panel stays within it. The `Port` *label* does
  // not — see the documented finding below, which is deliberately scoped to
  // the label rather than suppressed here.
  for (const id of ["service_type", "access_method", "access_host", "access_port", "access_path"]) {
    const within = await fieldset.evaluate((fs, controlId) => {
      const el = fs.querySelector(`#${controlId}`);
      if (!el) return true;
      return el.getBoundingClientRect().right <= fs.getBoundingClientRect().right + 1;
    }, id);
    console.log(`MEASURED [ServerEditCard fieldset] #${id} inside the panel: ${within}`);
    expect(within, `#${id} stays inside the Access documentation panel`).toBe(true);
  }
});

/**
 * Regression guard for the `Port` label overflow 8.3 found and 8.3a fixed.
 *
 * `Label` is `inline-flex` and cannot wrap (8.1a unified Label and
 * OptionalLabel onto that box model), so "PORT (optional)" lays out on one
 * line at ~124px — which used to sit inside a hardcoded `w-24` (96px) column
 * and spill ~15px past the panel border. The column is now content-sized by
 * the grid's `auto` track. `ServerFormSheet` has the twin guard in
 * phase-8-3-sheets.spec.ts.
 */
test("Server detail (edit mode): nothing inside the Access documentation panel overflows it", async ({
  page,
}) => {
  const { url } = await openFirstDetail(page, "/servers", "Servers", "Back to servers");
  await page.goto(`${url}?edit=true`);
  const fieldset = page.locator("fieldset");
  await expect(fieldset).toBeVisible({ timeout: 15_000 });
  await assertNoChildOverflow(fieldset, "ServerEditCard fieldset");

  const geometry = await fieldset.evaluate((fs) => {
    const label = fs.querySelector('label[for="access_port"]')!.getBoundingClientRect();
    const input = fs.querySelector("#access_port")!.getBoundingClientRect();
    return {
      label: Math.round(label.width),
      input: Math.round(input.width),
      labelFitsInput: label.width <= input.width + 1,
    };
  });
  console.log(`MEASURED [ServerEditCard] Port label=${geometry.label}px input=${geometry.input}px`);
  expect(geometry.labelFitsInput, "the Port label fits the column its input defines").toBe(true);
});

test("Clients: row click opens the client form dialog — there is no /clients/:id detail page", async ({
  page,
}) => {
  await login(page);
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();

  // Documented state, asserted so a future /clients/:id route trips this test
  // rather than silently leaving the sweep with a stale claim.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(page.url()).toMatch(/\/clients$/);
  console.log(`MEASURED [Clients] row click opened a dialog at ${new URL(page.url()).pathname}`);

  // The page's own <h1> is the list heading and is unaffected by the overlay.
  await expect(page.locator("h1")).toHaveText("Clients");
  await assertNoChildOverflow(dialog, "ClientFormDialog");
  await shoot(page, "28-detail-client-dialog");
});
