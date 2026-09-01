import { describe, expect, it } from "vitest";
import resolveConfig from "tailwindcss/resolveConfig.js";

import { cn } from "./utils";

/**
 * `tailwind.config.js` is plain JS with no type declarations, and it lives
 * outside `tsconfig.app.json`'s `include`, so a static import trips TS7016
 * under `tsc -b`. Widening the specifier to `string` makes this an untyped
 * dynamic import; only `theme.fontSize`'s keys are read from it.
 */
async function configFontSizeKeys(): Promise<string[]> {
  const mod = await import("../../tailwind.config.js" as string);
  return Object.keys(resolveConfig(mod.default).theme.fontSize);
}

async function configBoxShadowKeys(): Promise<string[]> {
  const mod = await import("../../tailwind.config.js" as string);
  return Object.keys(resolveConfig(mod.default).theme.boxShadow);
}

async function configBorderRadiusKeys(): Promise<string[]> {
  const mod = await import("../../tailwind.config.js" as string);
  return Object.keys(resolveConfig(mod.default).theme.borderRadius);
}

/**
 * Guards the `extendTailwindMerge` registration in `utils.ts` (decision #43).
 *
 * `tailwind-merge` only knows Tailwind's built-in scales. Our governed type
 * scale uses non-t-shirt keys (`heading-card`, `body`, `label`, …), so without
 * an explicit registration tailwind-merge classifies them as *text colors* —
 * which broke merging in both directions. These tests pin both directions and,
 * critically, pin the registration list against the config so a newly-added
 * fontSize token cannot silently reintroduce the bug.
 */

/** Tailwind's own built-in fontSize scale — everything else is ours. */
const BUILT_IN_FONT_SIZES = [
  "xs", "sm", "base", "lg", "xl",
  "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl",
];

describe("cn — custom fontSize token merging", () => {
  it("lets a built-in font-size override replace a custom token", () => {
    // Before #43 both classes were emitted and the cascade decided the winner,
    // silently leaking the token's bundled font-weight.
    expect(cn("text-heading-card", "text-base")).toBe("text-base");
    expect(cn("text-body", "text-xs")).toBe("text-xs");
    expect(cn("text-heading-page", "text-lg")).toBe("text-lg");
  });

  it("lets an arbitrary font-size override replace a custom token", () => {
    expect(cn("text-heading-card", "text-[10px]")).toBe("text-[10px]");
  });

  it("lets one custom token replace another", () => {
    expect(cn("text-label", "text-caption")).toBe("text-caption");
    expect(cn("text-heading-page", "text-heading-card")).toBe("text-heading-card");
  });

  it("does NOT let a text color dedupe away a custom size token", () => {
    // The more damaging half of the bug: before #43 the size token was
    // dropped entirely, taking its bundled line-height and weight with it.
    expect(cn("text-heading-card", "text-muted-foreground")).toBe(
      "text-heading-card text-muted-foreground"
    );
    expect(cn("text-body", "text-danger-text")).toBe("text-body text-danger-text");
  });

  it("still merges built-in sizes and colors the way it always did", () => {
    expect(cn("text-sm", "text-[10px]")).toBe("text-[10px]");
    expect(cn("text-sm", "text-muted-foreground")).toBe("text-sm text-muted-foreground");
    expect(cn("text-muted-foreground", "text-foreground")).toBe("text-foreground");
  });

  it("registers every custom fontSize key defined in tailwind.config.js", async () => {
    const configured = (await configFontSizeKeys()).filter(
      (key) => !BUILT_IN_FONT_SIZES.includes(key)
    );

    // A key is registered iff a built-in size can override it. An unregistered
    // key falls into the text-color group, where both classes survive.
    for (const key of configured) {
      expect(
        cn(`text-${key}`, "text-base"),
        `text-${key} is not registered in utils.ts's extendTailwindMerge font-size group`
      ).toBe("text-base");
    }

    // Sanity check that the assertion above can actually fail.
    expect(configured.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Custom boxShadow token merging (Phase 8.1a)
// ---------------------------------------------------------------------------

/** Tailwind's built-in box-shadow scale — everything else is ours. */
const BUILT_IN_SHADOWS = [
  "", "inner", "none", "DEFAULT",
  // Tailwind v3 built-in default scales:
  "sm", "md", "lg", "xl", "2xl",
];

describe("cn — custom boxShadow token merging", () => {
  it("lets one custom shadow replace another", () => {
    expect(cn("shadow-elev-1", "shadow-elev-2")).toBe("shadow-elev-2");
    expect(cn("shadow-underline", "shadow-underline-focus")).toBe("shadow-underline-focus");
  });

  it("lets a built-in shadow override a custom token", () => {
    expect(cn("shadow-elev-2", "shadow-none")).toBe("shadow-none");
    expect(cn("shadow-underline", "shadow-md")).toBe("shadow-md");
  });

  it("lets a custom token override a built-in shadow", () => {
    expect(cn("shadow-md", "shadow-elev-1")).toBe("shadow-elev-1");
  });

  it("registers every custom boxShadow key defined in tailwind.config.js", async () => {
    const configured = (await configBoxShadowKeys()).filter(
      (key) => !BUILT_IN_SHADOWS.includes(key)
    );

    for (const key of configured) {
      expect(
        cn(`shadow-${key}`, "shadow-none"),
        `shadow-${key} is not registered in utils.ts's extendTailwindMerge shadow group`
      ).toBe("shadow-none");
    }

    expect(configured.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Custom borderRadius token merging (Phase 8.1a)
// ---------------------------------------------------------------------------

/** Tailwind's built-in borderRadius scale — everything else is ours. */
const BUILT_IN_RADII = [
  "none", "sm", "", "md", "lg", "xl", "2xl", "3xl", "full", "DEFAULT",
];

describe("cn — custom borderRadius token merging", () => {
  it("lets one custom radius replace another", () => {
    expect(cn("rounded-control", "rounded-panel")).toBe("rounded-panel");
    expect(cn("rounded-modal", "rounded-pill")).toBe("rounded-pill");
  });

  it("lets a built-in radius override a custom token", () => {
    expect(cn("rounded-panel", "rounded-full")).toBe("rounded-full");
    expect(cn("rounded-control", "rounded-md")).toBe("rounded-md");
  });

  it("lets a custom token override a built-in radius", () => {
    expect(cn("rounded-md", "rounded-panel")).toBe("rounded-panel");
  });

  it("registers every custom borderRadius key defined in tailwind.config.js", async () => {
    const configured = (await configBorderRadiusKeys()).filter(
      (key) => !BUILT_IN_RADII.includes(key)
    );

    for (const key of configured) {
      expect(
        cn(`rounded-${key}`, "rounded-full"),
        `rounded-${key} is not registered in utils.ts's extendTailwindMerge border-radius group`
      ).toBe("rounded-full");
    }

    expect(configured.length).toBeGreaterThan(0);
  });
});

