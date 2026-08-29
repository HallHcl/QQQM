import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Throwaway verification sweep for the Card/Button/Badge typography &
 * style cleanup ticket. Requires backend + db + the Vite dev server.
 *
 * Pass is selected by SWEEP_PASS=before|after so the same spec produces
 * a comparable pair of directories.
 */

const PASS = process.env.SWEEP_PASS ?? "after";
const OUT_DIR = path.resolve(
  process.cwd(),
  "playwright-screenshots",
  "typography-cleanup-" + PASS
);
const ADMIN = { username: "admin", password: "admin123" };

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/overview/);
}

/** Reads the computed type properties the ticket actually changes. */
async function type(page: Page, sel: string) {
  return page
    .locator(sel)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        fontWeight: s.fontWeight,
        textTransform: s.textTransform,
        letterSpacing: s.letterSpacing,
      };
    });
}

test("1 - login card: CardTitle + default Button", async ({ page }) => {
  await page.goto("/login");
  const title = page.getByText("Sign in", { exact: true }).first();
  await expect(title).toBeVisible();

  console.log("CardTitle:", JSON.stringify(await type(page, 'div:text-is("Sign in")')));
  console.log("Button(default):", JSON.stringify(await type(page, 'button[type="submit"]')));

  await page.screenshot({ path: path.join(OUT_DIR, "1-login-card-and-button.png") });
});

test("2 - overview: CardTitle + activity badges", async ({ page }) => {
  await login(page);
  await page.waitForTimeout(1500);
  await expect(page.getByText("Recent activity")).toBeVisible();
  console.log(
    "CardTitle(overview):",
    JSON.stringify(await type(page, 'div:text-is("Recent activity")'))
  );
  await page.screenshot({
    path: path.join(OUT_DIR, "2-overview-cards-badges.png"),
    fullPage: true,
  });
});

test("3 - schedule: warning / destructive / default / secondary badges", async ({ page }) => {
  await login(page);
  await page.goto("/schedule");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT_DIR, "3-schedule-badges.png"),
    fullPage: true,
  });
});

test("4 - people: outline badges + buttons", async ({ page }) => {
  await login(page);
  await page.goto("/people");
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT_DIR, "4-people-badges-buttons.png"),
    fullPage: true,
  });
});

/**
 * Swatch strip. success/info/neutral badge variants have no call site in
 * the app, so they are rendered here from the exact class strings that
 * badge.tsx emits for this pass. Tailwind's JIT has already generated
 * those classes because badge.tsx carries them as source literals.
 */
test("5 - full badge + button variant swatch", async ({ page }) => {
  await login(page);
  await page.waitForTimeout(800);

  const badgeBaseByPass: Record<string, string> = {
    before:
      "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors duration-150 bg-transparent",
    after:
      "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors duration-150",
  };

  const badgeVariantsByPass: Record<string, Record<string, string>> = {
    before: {
      default: "border-brand text-brand",
      secondary: "border-border text-muted-foreground",
      destructive: "border-danger text-danger",
      outline: "border-border text-foreground",
      warning: "border-warning text-warning",
      success: "border-success text-success",
      info: "border-info text-info",
      neutral: "border-neutral text-neutral",
    },
    after: {
      default: "bg-transparent border-brand text-brand",
      secondary: "bg-transparent border-border text-muted-foreground",
      destructive: "bg-danger-tint border-danger-border text-danger-text",
      outline: "bg-transparent border-border text-foreground",
      warning: "bg-warning-tint border-warning-border text-warning-text",
      success: "bg-success-tint border-success-border text-success-text",
      info: "bg-info-tint border-info-border text-info-text",
      neutral: "bg-neutral-tint border-neutral-border text-neutral-text",
    },
  };

  const buttonBase =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors duration-150 h-10 px-4 py-2";

  const buttonVariantsByPass: Record<string, Record<string, string>> = {
    before: {
      default: "bg-primary text-background uppercase tracking-wide text-xs",
      destructive: "bg-danger text-destructive-foreground",
      outline: "border border-border bg-transparent text-foreground",
      secondary: "bg-surface-sunken text-foreground",
      ghost: "text-foreground",
      link: "text-brand underline-offset-4",
    },
    after: {
      default: "bg-primary text-background",
      destructive: "bg-danger text-destructive-foreground",
      outline: "border border-border bg-transparent text-foreground",
      secondary: "bg-surface-sunken text-foreground",
      ghost: "text-foreground",
      link: "text-brand underline-offset-4",
    },
  };

  const badgeBase = badgeBaseByPass[PASS];
  const badgeVariants = badgeVariantsByPass[PASS];
  const buttonVariants = buttonVariantsByPass[PASS];

  await page.evaluate(
    ({ badgeBase, badgeVariants, buttonBase, buttonVariants }) => {
      const host = document.createElement("div");
      host.id = "sweep-swatch";
      host.setAttribute(
        "style",
        "position:fixed;inset:0;z-index:99999;background:rgb(var(--background));padding:32px;overflow:auto;font-family:Inter,system-ui,sans-serif"
      );
      const section = (label: string) =>
        '<div style="margin:24px 0 10px;font:600 13px Inter;color:rgb(var(--muted-foreground))">' +
        label +
        "</div>";

      let html = section("Badges");
      html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">';
      for (const name of Object.keys(badgeVariants)) {
        html +=
          '<div style="text-align:center"><div class="' +
          badgeBase +
          " " +
          badgeVariants[name] +
          '">' +
          name +
          '</div><div style="font:400 10px Inter;color:rgb(var(--muted-foreground));margin-top:6px">' +
          name +
          "</div></div>";
      }
      html += "</div>";

      html += section("Buttons");
      html += '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">';
      for (const name of Object.keys(buttonVariants)) {
        html +=
          '<button class="' +
          buttonBase +
          " " +
          buttonVariants[name] +
          '">' +
          name +
          " action</button>";
      }
      html += "</div>";

      host.innerHTML = html;
      document.body.appendChild(host);
    },
    { badgeBase, badgeVariants, buttonBase, buttonVariants }
  );

  await page.waitForTimeout(400);

  for (const b of await page.locator("#sweep-swatch .inline-flex").all()) {
    console.log(
      "BADGE",
      await b.evaluate((el) => {
        const s = getComputedStyle(el);
        return (
          el.textContent +
          " | " +
          s.fontSize +
          " w" +
          s.fontWeight +
          " tt=" +
          s.textTransform +
          " ls=" +
          s.letterSpacing +
          " bg=" +
          s.backgroundColor +
          " bd=" +
          s.borderTopColor +
          " fg=" +
          s.color
        );
      })
    );
  }
  for (const b of await page.locator("#sweep-swatch button").all()) {
    console.log(
      "BUTTON",
      await b.evaluate((el) => {
        const s = getComputedStyle(el);
        return (
          el.textContent +
          " | " +
          s.fontSize +
          " w" +
          s.fontWeight +
          " tt=" +
          s.textTransform +
          " ls=" +
          s.letterSpacing
        );
      })
    );
  }

  await page.screenshot({ path: path.join(OUT_DIR, "5-variant-swatch.png") });
});
