import { expect } from "vitest";

/**
 * Shared assertions for Phase A's row-hover-quick-actions pattern, used by
 * every list module that has one (Clients, Projects, People, Servers,
 * Environments, Schedule).
 *
 * The pattern deliberately hides row actions ONLY on hover-capable devices:
 * a visible `opacity-100` base, an `[@media(hover:hover)]:`-scoped hide, and
 * `[@media(hover:hover)]:`-scoped reveals on group hover and focus-within.
 *
 * Touch devices never match `hover: hover`, so they keep the visible base
 * state. Rewriting this as an unconditional or breakpoint-based hide (the
 * tempting "simplification" to a bare hide plus a breakpoint-scoped
 * re-show) makes row actions unreachable on phones — there is no hover to
 * reveal them with. These helpers exist to fail loudly if that ever happens,
 * since the pattern is otherwise only covered by Playwright specs that need
 * a live backend.
 *
 * Note on the string building below: Tailwind's content scanner reads every
 * file matched by its `content` glob, comments and string literals included,
 * and emits a rule for any complete utility token it finds. Spelling the
 * variant-prefixed utilities out literally here would therefore add dead
 * rules to the production stylesheet from a test-only file, so the tokens
 * are assembled at runtime from fragments that are not themselves classes.
 */

/** Tailwind arbitrary-variant prefix scoping a utility to hover-capable devices. */
export const HOVER_MEDIA_PREFIX = "[@media(hover:hover)]:";

const GROUP_HOVER = "group-hover";
const GROUP_FOCUS_WITHIN = "group-focus-within";
const VISIBLE = "opacity-100";
const TRANSPARENT = "opacity-0";

/** Scopes a utility (optionally itself variant-prefixed) to hover-capable devices. */
const hoverScoped = (utility: string) => `${HOVER_MEDIA_PREFIX}${utility}`;

/**
 * Utilities that visually remove an element. Applied unconditionally — or
 * behind a breakpoint, which on a phone means "always" — any one of these
 * defeats the touch-visible fallback. Assembled rather than written inline
 * for the content-scanner reason above.
 */
const HIDING_UTILITIES = [TRANSPARENT, "hidden", "invisible", "sr-only"];

function classTokens(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

/**
 * Strips any variant prefix chain, returning the bare utility. Works for the
 * arbitrary media variant too: the last ":" in the hover-scoped form is the
 * one introducing the utility, not the one inside the media query.
 */
function bareUtility(token: string): string {
  const i = token.lastIndexOf(":");
  return i === -1 ? token : token.slice(i + 1);
}

function isHidingToken(token: string): boolean {
  return HIDING_UTILITIES.includes(bareUtility(token));
}

function describeEl(el: Element): string {
  return `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}">`;
}

/**
 * Asserts an actions wrapper is visible by default and hover-gated only on
 * hover-capable devices.
 *
 * @param wrapper the element carrying the opacity classes (the div wrapping
 *   the row's RowActions / Restore button)
 * @param label module name, to make a failure say which page broke
 */
export function expectHoverGatedRowActions(wrapper: Element, label: string): void {
  // Positive half: the pattern is present and complete. Uses toHaveClass to
  // match how the rest of the suite asserts on classes (see Toolbar.test.tsx).
  expect(wrapper, `${label}: actions wrapper missing the Phase A hover-gate classes`).toHaveClass(
    VISIBLE,
    hoverScoped(TRANSPARENT),
    hoverScoped(`${GROUP_HOVER}:${VISIBLE}`),
    hoverScoped(`${GROUP_FOCUS_WITHIN}:${VISIBLE}`)
  );

  // Negative half — the actual regression guard. Any hiding utility that is
  // NOT scoped to `hover: hover` hides the actions on touch. This catches a
  // bare hide, a breakpoint-scoped hide, `invisible`, `sr-only`, and so on,
  // rather than merely confirming the correct classes are also present.
  const unscopedHiding = classTokens(wrapper).filter(
    (t) => isHidingToken(t) && !t.startsWith(HOVER_MEDIA_PREFIX)
  );
  expect(
    unscopedHiding,
    `${label}: row actions carry hiding utilities that are not scoped to ` +
      `"${HOVER_MEDIA_PREFIX}", so they would be unreachable on touch devices: ` +
      `[${unscopedHiding.join(", ")}] on ${describeEl(wrapper)}`
  ).toEqual([]);
}

/**
 * Asserts an element — and every ancestor up to its table row — is free of
 * hover-gating and hiding utilities, i.e. it stays permanently visible.
 *
 * Used for Schedule's ScheduleStatusActions (Start/Complete/Cancel), which is
 * a workflow control rather than a row action and is deliberately excluded
 * from the hover-gate. Walking ancestors matters because the opacity that
 * would hide it lives on a wrapper, not on the button itself.
 */
export function expectNeverHiddenWithinRow(el: Element, label: string): void {
  let node: Element | null = el;

  while (node && node.tagName !== "TR") {
    const offenders = classTokens(node).filter(
      (t) => t.startsWith(HOVER_MEDIA_PREFIX) || isHidingToken(t)
    );
    expect(
      offenders,
      `${label}: expected this control to stay permanently visible, but ` +
        `${describeEl(node)} applies [${offenders.join(", ")}]`
    ).toEqual([]);
    node = node.parentElement;
  }
}

/**
 * Resolves the wrapper element carrying the hover-gate classes from the row's
 * kebab trigger. RowActions renders the trigger button as the wrapper div's
 * direct child, so `closest("div")` lands on the wrapper.
 */
export function actionsWrapperFor(trigger: HTMLElement): Element {
  const wrapper = trigger.closest("div");
  if (!wrapper) throw new Error("No wrapping <div> found around the Actions trigger");
  return wrapper;
}
