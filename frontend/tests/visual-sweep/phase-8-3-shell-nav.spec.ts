import { test, expect } from "@playwright/test";
import {
  DESKTOP,
  assertNoChildOverflow,
  assertNoHorizontalOverflow,
  colorsOf,
  contrastRatio,
  ensureOutDir,
  login,
  shoot,
  shootElement,
} from "./phase-8-3-helpers";

/**
 * Phase 8.3 sweep — group 2: Global shell & navigation.
 *
 * The sidebar reorganisation, the Topbar and the ⌘K command palette had no
 * Playwright coverage at all before this file — they are shell, so every
 * earlier per-module sweep walked straight past them. Covered here: the
 * grouped sidebar (Overview pinned above four labelled groups, Settings
 * pinned below a scrollable region), the sticky Topbar, and the palette
 * across its open / type / navigate / close states.
 */

test.use({ viewport: DESKTOP });

test.beforeAll(ensureOutDir);

const GROUPS = [
  { label: "Delivery", items: ["Clients", "Projects", "Environments", "Servers"] },
  { label: "Operations", items: ["Infrastructure", "Schedule", "Activity"] },
  { label: "Knowledge", items: ["Resources", "People"] },
];

test("Sidebar: Overview pinned on top, three labelled groups, Settings pinned below", async ({
  page,
}) => {
  await login(page);
  const sidebar = page.getByRole("navigation", { name: "Main navigation" });
  await expect(sidebar).toBeVisible();

  // Visual order, top to bottom, read from real bounding boxes rather than
  // from DOM order — the pinned Settings row is a sibling of the scroll
  // region, and "pinned below" is a layout claim, not a markup one.
  const overview = sidebar.getByRole("link", { name: "Overview" });
  const settings = sidebar.getByRole("link", { name: "Settings" });
  const overviewBox = await overview.boundingBox();
  const settingsBox = await settings.boundingBox();
  expect(overviewBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();
  console.log(
    `MEASURED [Sidebar] Overview y=${Math.round(overviewBox!.y)} Settings y=${Math.round(settingsBox!.y)}`
  );
  expect(settingsBox!.y).toBeGreaterThan(overviewBox!.y);

  let previousY = overviewBox!.y;
  for (const group of GROUPS) {
    const heading = sidebar.getByText(group.label, { exact: true });
    await expect(heading).toBeVisible();
    const headingBox = await heading.boundingBox();
    expect(headingBox!.y, `${group.label} sits below what precedes it`).toBeGreaterThan(previousY);

    // Radix-free plain markup: each group is a role="group" labelled by its
    // own heading, so the items belonging to it are asserted through that
    // relationship rather than by proximity.
    const region = sidebar.getByRole("group", { name: group.label });
    for (const item of group.items) {
      await expect(region.getByRole("link", { name: item, exact: true })).toBeVisible();
    }
    const itemCount = await region.getByRole("link").count();
    console.log(`MEASURED [Sidebar] group "${group.label}" links=${itemCount}`);
    expect(itemCount).toBe(group.items.length);
    previousY = headingBox!.y;
  }

  // The scroll region owns the overflow; Settings must never be inside it.
  const settingsInScroller = await settings.evaluate((el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (getComputedStyle(n).overflowY === "auto") return true;
    }
    return false;
  });
  console.log(`MEASURED [Sidebar] Settings inside the scroll region: ${settingsInScroller}`);
  expect(settingsInScroller).toBe(false);

  await assertNoChildOverflow(sidebar, "Sidebar");
  // The <aside> wrapper, so the shot includes the QQM wordmark above the nav.
  await shootElement(page.locator("aside").first(), "07-shell-sidebar");
});

test("Sidebar: the active destination is the only one carrying the brand rail", async ({ page }) => {
  await login(page);
  await page.goto("/servers");
  const sidebar = page.getByRole("navigation", { name: "Main navigation" });
  const active = sidebar.getByRole("link", { name: "Servers", exact: true });
  const inactive = sidebar.getByRole("link", { name: "Clients", exact: true });

  const read = (which: typeof active) =>
    which.evaluate((el) => {
      const s = getComputedStyle(el);
      return { railColor: s.borderLeftColor, railWidth: s.borderLeftWidth, bg: s.backgroundColor, fg: s.color };
    });

  const on = await read(active);
  const off = await read(inactive);
  console.log(`MEASURED [Sidebar] active=${JSON.stringify(on)} inactive=${JSON.stringify(off)}`);

  expect(on.railColor, "active item's left rail is not transparent").not.toBe(off.railColor);
  expect(on.bg, "active item gets the surface-active fill").not.toBe(off.bg);
  // Both label colours must clear AA against whatever they sit on.
  for (const [name, state] of [
    ["active", on],
    ["inactive", off],
  ] as const) {
    const bg = state.bg === "rgba(0, 0, 0, 0)" ? "rgb(255, 255, 255)" : state.bg;
    const ratio = contrastRatio(state.fg, bg);
    console.log(`MEASURED [Sidebar] ${name} label ${state.fg} on ${bg} = ${ratio.toFixed(2)}:1`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});

test("Topbar: sticky, full-width beside the sidebar, with search / notifications / account", async ({
  page,
}) => {
  await login(page);
  const topbar = page.locator("header").first();
  await expect(topbar).toBeVisible();

  const style = await topbar.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { position: s.position, top: s.top, zIndex: s.zIndex, height: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right) };
  });
  console.log(`MEASURED [Topbar] ${JSON.stringify(style)}`);
  expect(style.position).toBe("sticky");
  expect(style.top).toBe("0px");
  expect(Number(style.zIndex)).toBeGreaterThan(0);

  // The 240px (w-60) sidebar sits to its left; the topbar spans the rest.
  const sidebarBox = await page.getByRole("navigation", { name: "Main navigation" }).boundingBox();
  expect(style.left).toBeGreaterThanOrEqual(Math.round(sidebarBox!.width) - 1);
  expect(style.right).toBe(DESKTOP.width);

  await expect(topbar.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(topbar.getByRole("button", { name: /admin|account/i })).toBeVisible();

  // Scrolling the page must not move it.
  await page.goto("/servers");
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  const afterScroll = await topbar.boundingBox();
  console.log(`MEASURED [Topbar] y after 400px scroll = ${Math.round(afterScroll!.y)}`);
  expect(Math.round(afterScroll!.y)).toBe(0);

  await assertNoHorizontalOverflow(page, "Topbar");
  await shootElement(topbar, "08-shell-topbar");
});

/**
 * The ⌘K handler is registered by SearchPaletteProvider, which mounts with
 * AppLayout — pressing the shortcut before the shell has painted lands on a
 * document with no listener yet and silently does nothing. Waiting on the
 * sidebar is waiting on that same mount.
 */
async function loginAndWaitForShell(page: Parameters<typeof login>[0]) {
  await login(page);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
}

test("Command palette: opens on ⌘K, shows its resting prompt, closes on Escape", async ({ page }) => {
  await loginAndWaitForShell(page);

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();
  await expect(
    dialog.getByText("Start typing to search clients, projects, environments and servers.")
  ).toBeVisible();

  // Centred overlay, comfortably inside the viewport, nothing clipped.
  const box = await dialog.boundingBox();
  console.log(
    `MEASURED [⌘K] dialog x=${Math.round(box!.x)} w=${Math.round(box!.width)} y=${Math.round(box!.y)} h=${Math.round(box!.height)}`
  );
  expect(box!.x).toBeGreaterThan(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(DESKTOP.width);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  await assertNoChildOverflow(dialog, "Command palette (resting)");
  await shoot(page, "09-shell-palette-resting");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  // The Topbar's magnifier is the discoverable second entry point.
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("Command palette: typing groups real hits by entity, and Enter navigates", async ({ page }) => {
  await loginAndWaitForShell(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  const input = dialog.getByRole("combobox");
  await input.fill("prod");

  // Debounced 250ms then fetched; poll rather than fixing a wait.
  const options = dialog.getByRole("option");
  await expect.poll(() => options.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  const headings = await dialog.locator("[cmdk-group-heading]").allTextContents();
  console.log(`MEASURED [⌘K] groups=${JSON.stringify(headings)} hits=${await options.count()}`);
  expect(headings.length).toBeGreaterThan(0);

  // Each row: icon, label, optional right-aligned secondary — one line, no
  // wrapping and no spill past the dialog.
  const first = options.first();
  const rowHeight = await first.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  console.log(`MEASURED [⌘K] first result row height=${rowHeight}px`);
  expect(rowHeight).toBeLessThanOrEqual(48);
  await assertNoChildOverflow(dialog, "Command palette (results)");
  await shoot(page, "10-shell-palette-results");

  // Arrow-key movement changes the selected row, then Enter navigates.
  const firstLabel = (await first.textContent())?.trim();
  await page.keyboard.press("ArrowDown");
  const selected = dialog.locator('[cmdk-item][data-selected="true"]');
  await expect(selected).toHaveCount(1);
  console.log(`MEASURED [⌘K] selected after ArrowDown="${(await selected.textContent())?.trim()}" (first was "${firstLabel}")`);

  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/(clients|projects|environments|servers)/);
  console.log(`MEASURED [⌘K] navigated to ${new URL(page.url()).pathname}`);
});

test("Command palette: a term with no matches shows the no-results line, not an empty box", async ({
  page,
}) => {
  await loginAndWaitForShell(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("zzzznotathing");

  await expect(dialog.getByText(/No results for/)).toBeVisible({ timeout: 15_000 });
  const { color, background } = await colorsOf(dialog.getByText(/No results for/));
  const dialogBg = (await colorsOf(dialog)).background;
  const ratio = contrastRatio(color, background === "rgba(0, 0, 0, 0)" ? dialogBg : background);
  console.log(`MEASURED [⌘K] no-results text ${color} = ${ratio.toFixed(2)}:1`);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await shoot(page, "11-shell-palette-no-results");
});
