import { expect, type Locator, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Shared rig for the Phase 8.3 comprehensive visual sweep — the release gate
 * for the Phase 5-7 redesign.
 *
 * This project has no committed baseline screenshots and does not pixel-diff.
 * Visual correctness is verified from the live DOM: bounding rects, computed
 * styles, contrast ratios and zero-overflow checks, with screenshots exported
 * purely as human-reviewable evidence. These helpers are the vocabulary the
 * five 8.3 specs share; they deliberately mirror the login/shoot/overflow
 * conventions the earlier per-ticket sweeps already established
 * (row-actions-sweep.spec.ts, servers-envs-schedule-ux-phase-a.spec.ts)
 * rather than inventing a second format.
 *
 * Requires the backend + db + `npm run dev` (frontend) already running
 * locally; these specs do not start them. Not wired into CI.
 */

/**
 * Desktop-only, per the standing deferral of mobile/responsive work past
 * Phase 8 (recorded on ServerFormSheet: "Desktop only for now"). 1280 is the
 * width every other 1280px sweep in this directory uses; 900 tall matches
 * overview-metrics/typography-cleanup, the two specs that shoot full pages.
 */
export const DESKTOP = { width: 1280, height: 900 } as const;

export const OUT_DIR = path.resolve(process.cwd(), "playwright-screenshots", "phase-8-3");

export const ADMIN = { username: "admin", password: "admin123" };

export function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview/);
}

/** Logs in and lands on `route`, with the viewport already at desktop size. */
export async function visit(page: Page, route: string) {
  await page.setViewportSize(DESKTOP);
  await login(page);
  await page.goto(route);
}

export async function shoot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage });
}

/** Screenshot of one element — used for the sheets, which are overlays. */
export async function shootElement(locator: Locator, name: string) {
  await locator.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

/**
 * The page itself must never scroll sideways. A table that legitimately
 * scrolls does so inside its own `overflow-auto` wrapper (ui/table.tsx), so
 * this stays a hard assertion rather than a tolerance.
 */
export async function assertNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  console.log(`MEASURED [${label}] document scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

/**
 * No element inside `root` may spill horizontally past it. Catches the
 * clipping class of regression a page-level overflow check misses entirely:
 * a cell whose content is wider than its container still fits the viewport
 * when the container clips it.
 */
export async function assertNoChildOverflow(root: Locator, label: string) {
  const overflowing = await root.evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    const bad: string[] = [];
    for (const child of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // An element inside a scroll container is allowed to sit outside the
      // container's visible box — that container owns the scrolling.
      let scrollableAncestor = false;
      for (let n = child.parentElement; n && n !== el; n = n.parentElement) {
        const o = getComputedStyle(n).overflowX;
        if (o === "auto" || o === "scroll") {
          scrollableAncestor = true;
          break;
        }
      }
      if (scrollableAncestor) continue;
      if (r.right > bounds.right + 1 || r.left < bounds.left - 1) {
        const first = String(child.className || "").split(/\s+/)[0];
        bad.push(
          `${child.tagName.toLowerCase()}.${first} [${Math.round(r.left)}..${Math.round(r.right)}]` +
            ` vs [${Math.round(bounds.left)}..${Math.round(bounds.right)}]`
        );
      }
    }
    return bad.slice(0, 5);
  });
  console.log(`MEASURED [${label}] horizontally overflowing descendants: ${overflowing.length}`);
  expect(overflowing, `overflow inside ${label}: ${overflowing.join(" | ")}`).toEqual([]);
}

export interface Colors {
  background: string;
  border: string;
  color: string;
}

export async function colorsOf(locator: Locator): Promise<Colors> {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      border: s.borderTopColor,
      color: s.color,
    };
  });
}

/** `rgb(a, b, c)` / `rgba(a, b, c, d)` to `[r, g, b]`. */
export function parseRgb(value: string): [number, number, number] {
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) throw new Error(`Unparseable colour: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio between two `rgb()` strings. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(parseRgb(fg));
  const b = luminance(parseRgb(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Asserts a badge's text clears WCAG AA for normal text against its own tint
 * background. Badge text is 12px/500 — under 18.66px, so 4.5:1 is the bar
 * that applies, not the 3:1 large-text allowance.
 */
export async function assertBadgeContrast(badge: Locator, label: string) {
  const { background, color, border } = await colorsOf(badge);
  const ratio = contrastRatio(color, background);
  console.log(
    `MEASURED [${label}] badge fg=${color} bg=${background} border=${border} contrast=${ratio.toFixed(2)}:1`
  );
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  return { background, color, border, ratio };
}

/**
 * The canonical outlined-panel treatment from 8.1a's `panelSurface()`:
 * `rounded-md border border-border`. Asserted from computed style rather than
 * class strings so it survives the `rounded-panel` retune 8.1a flagged.
 */
export async function assertOutlinedPanel(locator: Locator, label: string) {
  const box = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      radius: s.borderTopLeftRadius,
      width: s.borderTopWidth,
      style: s.borderTopStyle,
      color: s.borderTopColor,
    };
  });
  console.log(
    `MEASURED [${label}] panel radius=${box.radius} border=${box.width} ${box.style} ${box.color}`
  );
  expect(parseFloat(box.radius)).toBeGreaterThan(0);
  expect(parseFloat(box.width)).toBeGreaterThan(0);
  expect(box.style).not.toBe("none");
  return box;
}

/**
 * The list-table card wrapper: `ui/table.tsx` wraps every table in
 * `rounded-panel border border-border bg-surface shadow-elev-1`. Elevation is
 * the part that is easy to lose to a stray class, so it is asserted
 * explicitly.
 *
 * Takes the table itself rather than the page: SchedulePage renders
 * react-day-picker's calendar, which is also a <table>, ahead of the list —
 * so "the first table on the page" is the wrong one there.
 */
export async function assertTableCardWrapper(table: Locator, label: string) {
  const wrapper = table.locator("xpath=..");
  const style = await wrapper.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      radius: s.borderTopLeftRadius,
      borderWidth: s.borderTopWidth,
      boxShadow: s.boxShadow,
      background: s.backgroundColor,
      overflowX: s.overflowX,
    };
  });
  console.log(`MEASURED [${label}] table wrapper ${JSON.stringify(style)}`);
  expect(parseFloat(style.radius)).toBeGreaterThan(0);
  expect(parseFloat(style.borderWidth)).toBeGreaterThan(0);
  expect(style.boxShadow).not.toBe("none");
  expect(style.overflowX).toBe("auto");
  return style;
}

/** `font-variant-numeric: tabular-nums` on the cells that carry dates/counts. */
export async function assertTabularNums(locator: Locator, label: string) {
  const variant = await locator.evaluate((el) => getComputedStyle(el).fontVariantNumeric);
  console.log(`MEASURED [${label}] font-variant-numeric=${variant}`);
  expect(variant).toContain("tabular-nums");
}
