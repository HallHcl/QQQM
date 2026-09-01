import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrast guard for the soft-deleted row treatment.
 *
 * The rest of the suite asserts that deleted rows carry the right CLASSES;
 * nothing asserts that the colours behind those classes are actually legible,
 * because jsdom loads no stylesheet and has no colour to compute. That gap is
 * how the previous treatment survived: `opacity-50` on the row was correct by
 * every class-level assertion while rendering primary text at roughly 3.37:1,
 * under the 4.5:1 WCAG AA minimum.
 *
 * So this reads the tokens straight out of globals.css and does the maths. It
 * fails if someone lightens --text-secondary, darkens a surface, or repoints
 * --muted-foreground at a weaker token — the changes that would silently
 * reintroduce the same problem through a different door.
 */

const GLOBALS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../styles/globals.css"
);

/** Reads `--name: R G B;` out of globals.css as an [r,g,b] triplet. */
function token(css: string, name: string): [number, number, number] {
  const match = css.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`));
  if (!match) throw new Error(`Token --${name} not found in globals.css`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_NORMAL_TEXT = 4.5;

describe("deleted-row contrast", () => {
  const css = readFileSync(GLOBALS, "utf8");

  // --muted-foreground is an alias (`--muted-foreground: var(--text-secondary)`),
  // so the concrete triplet lives on --text-secondary. Asserted here so this
  // test fails loudly rather than silently checking the wrong colour if that
  // alias is ever repointed.
  it("--muted-foreground still resolves to --text-secondary", () => {
    expect(css).toMatch(/--muted-foreground:\s*var\(--text-secondary\)\s*;/);
  });

  const mutedText = () => token(css, "text-secondary");

  // Rows sit on --surface and shift to --surface-hover on hover, so the muted
  // text has to clear AA against both. --surface-sunken is the table header
  // and the neutral badge's own ground.
  it.each([
    ["--surface", "surface"],
    ["--surface-hover", "surface-hover"],
    ["--surface-sunken", "surface-sunken"],
  ])("deleted-row text clears WCAG AA on %s", (_label, name) => {
    expect(contrast(mutedText(), token(css, name))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("the neutral Deleted badge clears AA on its own tint", () => {
    expect(contrast(token(css, "neutral-text"), token(css, "neutral-tint"))).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT
    );
  });

  // The regression this whole change exists to prevent, stated as arithmetic:
  // primary text at 50% over the row background is what the old treatment
  // rendered, and it does NOT clear AA. If this ever starts passing, the
  // premise of the change has shifted and the treatment should be revisited.
  it("confirms the replaced opacity-50 treatment would have failed AA", () => {
    const [r, g, b] = token(css, "text-primary");
    const [br, bg, bb] = token(css, "surface");
    const blended: [number, number, number] = [
      r * 0.5 + br * 0.5,
      g * 0.5 + bg * 0.5,
      b * 0.5 + bb * 0.5,
    ];
    expect(contrast(blended, token(css, "surface"))).toBeLessThan(AA_NORMAL_TEXT);
  });
});
