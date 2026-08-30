import { expect } from "vitest";

/**
 * Shared assertions for Phase A's row-hover-quick-actions pattern, used by
 * every list module that has one (Clients, Projects, People, Servers,
 * Environments, Schedule).
 *
 * The pattern keeps row actions permanently visible and operable: an
 * `opacity-60` idle base, brought to `opacity-100` on group hover and group
 * focus-within. Nothing is media-gated.
 *
 * An earlier revision instead hid the actions behind an
 * `[@media(hover:hover)]:`-scoped `opacity-0`, relying on touch devices
 * never matching `hover: hover` to keep them reachable there. The dimmed
 * idle state replaces that: the affordance is now discoverable on every
 * device without a special case. Rewriting this as any kind of outright
 * hide — unconditional, breakpoint-scoped, or back behind the hover media
 * query — makes row actions invisible until hovered, and on a phone there is
 * no hover to reveal them with. These helpers exist to fail loudly if that
 * happens, since the pattern is otherwise only covered by Playwright specs
 * that need a live backend.
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

/** The dimmed idle state. Legible and fully operable — NOT a hiding utility. */
const IDLE_OPACITY = "opacity-60";

/**
 * Utilities that visually remove an element. Applied unconditionally — or
 * behind a breakpoint, which on a phone means "always" — any one of these
 * defeats the always-visible guarantee.
 *
 * `opacity-0` stays listed even though no call site uses it any more: it is
 * precisely the state this pattern migrated away from, and keeping it here
 * is what catches a regression back to a fully transparent idle. IDLE_OPACITY
 * is deliberately NOT a member — dimming is the intended design.
 */
const HIDING_UTILITIES = ["opacity-0", "hidden", "invisible", "sr-only"];

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
 * Asserts an actions wrapper is permanently visible, dimmed at idle, and
 * brought to full opacity on group hover and group focus-within.
 *
 * The name is retained from the pre-migration pattern so the six consuming
 * test files need no edits; "hover-gated" now means emphasis on hover, not
 * concealment until hover.
 *
 * @param wrapper the element carrying the opacity classes (the div wrapping
 *   the row's RowActions / Restore button)
 * @param label module name, to make a failure say which page broke
 */
export function expectHoverGatedRowActions(wrapper: Element, label: string): void {
  // Positive half: the pattern is present and complete. Uses toHaveClass to
  // match how the rest of the suite asserts on classes (see Toolbar.test.tsx).
  // The idle class is unscoped by design — it applies on every device.
  expect(
    wrapper,
    `${label}: actions wrapper missing the row-action visibility classes`
  ).toHaveClass(
    IDLE_OPACITY,
    `${GROUP_HOVER}:${VISIBLE}`,
    `${GROUP_FOCUS_WITHIN}:${VISIBLE}`
  );

  // First negative half: the pattern has no media-query-scoped classes at
  // all, so the mere presence of one is the regression signal, whatever it
  // wraps. This is what catches a reintroduced
  // `[@media(hover:hover)]:opacity-0` — the pre-migration idle state, which
  // a scope-exempting hiding check would wave through as "correctly scoped"
  // precisely because it carries the prefix (decision #52).
  const mediaScoped = classTokens(wrapper).filter((t) => t.startsWith(HOVER_MEDIA_PREFIX));
  expect(
    mediaScoped,
    `${label}: row actions carry "${HOVER_MEDIA_PREFIX}"-scoped classes. The ` +
      `dimmed-idle pattern is unscoped by design, so a hover-media class means ` +
      `the actions are being hidden or restyled on pointer devices only: ` +
      `[${mediaScoped.join(", ")}] on ${describeEl(wrapper)}`
  ).toEqual([]);

  // Second negative half. Any hiding utility hides the actions outright:
  // a bare hide, a breakpoint-scoped hide, `invisible`, `sr-only`, or a
  // reintroduced `opacity-0`. No scoping exemption — the assertion above has
  // already rejected every media-scoped class, so there is nothing left to
  // exempt.
  const hiding = classTokens(wrapper).filter(isHidingToken);
  expect(
    hiding,
    `${label}: row actions carry hiding utilities, so they would be ` +
      `invisible until hovered — and unreachable on touch devices, which ` +
      `have no hover: [${hiding.join(", ")}] on ${describeEl(wrapper)}`
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
