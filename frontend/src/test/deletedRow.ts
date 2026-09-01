import { expect } from "vitest";

/**
 * Shared assertions for the soft-deleted row/card treatment, used by every
 * list module that can show deleted records (Clients, Projects, People,
 * Servers, Environments, Schedule, Resources).
 *
 * Deleted records are marked by muted text plus a neutral "Deleted" badge.
 * They are NOT dimmed with opacity: lowering opacity fades foreground and
 * background together, which took primary text on white from 17.75:1 to
 * roughly 3.37:1 — under the 4.5:1 WCAG AA minimum. `text-muted-foreground`
 * (#475467) holds 7.69:1 on --surface and 7.36:1 on --surface-hover, and the
 * neutral badge is 9.49:1, so the state is now signalled by hue and by an
 * explicit label rather than by making the row harder to read.
 *
 * These assert on class names, not computed colour: jsdom loads no
 * stylesheet, so there is nothing to compute. The contrast figures above come
 * from the tokens in globals.css, and the specificity of the `[&_td]:` rule
 * over TableCell's own `text-foreground` was verified against the built
 * stylesheet.
 */

/**
 * Table rows. TableCell hard-codes `text-foreground`, so a bare
 * `text-muted-foreground` on the <tr> loses to it — every cell would stay at
 * full contrast and the class would be a no-op. The `[&_td]:` variant emits
 * `.[&_td]:text-muted-foreground td`, a descendant selector at specificity
 * (0,1,1) that beats the cell's own (0,1,0).
 */
export const DELETED_ROW_TEXT = "[&_td]:text-muted-foreground";

/**
 * ResourceList's card, which is a <button> with no <td> to target. Its title
 * and category spans set no colour of their own, so they inherit this.
 */
export const DELETED_CARD_TEXT = "text-muted-foreground";

/**
 * Opacity utilities that dim content. Any one of these on a deleted row is
 * the regression this treatment exists to prevent.
 *
 * Matched exactly, so variant-prefixed tokens are deliberately NOT flagged:
 * `disabled:opacity-50` is in Button's own base classes and applies only to a
 * disabled control, and `group-hover:opacity-100` brightens rather than dims.
 * Only an unconditional dim is a finding.
 */
const DIMMING_UTILITIES = [
  "opacity-40",
  "opacity-50",
  "opacity-60",
  "opacity-70",
  "opacity-75",
  "opacity-80",
  "opacity-90",
];

function classTokens(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

function describeEl(el: Element): string {
  return `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}">`;
}

/**
 * Asserts nothing in the subtree dims itself with opacity.
 *
 * Scans the whole subtree, not just the row element: the row-actions wrapper
 * inside every one of these tables carries `opacity-60` at idle, gated on
 * `!isDeleted`. On a deleted row that gate must hold, so finding an
 * unprefixed opacity anywhere under the row is a real failure whether it came
 * from the row itself or from that wrapper.
 *
 * @param container the <tr> (or ResourceList's card <button>)
 * @param label module name, to make a failure say which page broke
 */
export function expectNotDimmed(container: Element, label: string): void {
  const offenders = [container, ...Array.from(container.querySelectorAll("*"))].flatMap((el) =>
    classTokens(el)
      .filter((t) => DIMMING_UTILITIES.includes(t))
      .map((token) => `${token} on ${describeEl(el)}`)
  );

  expect(
    offenders,
    `${label}: a deleted row is dimmed with opacity, which fades text and ` +
      `background together and drops it under the 4.5:1 WCAG AA minimum. ` +
      `Deleted state is carried by muted text plus the neutral badge ` +
      `instead: [${offenders.join(", ")}]`
  ).toEqual([]);
}

/**
 * Asserts the "Deleted" badge uses the neutral status treatment
 * (bg #F2F4F7 / text #344054, 9.49:1) rather than the transparent `secondary`
 * variant it used while the row itself was carrying the signal.
 */
export function expectNeutralDeletedBadge(badge: Element, label: string): void {
  expect(
    badge,
    `${label}: the Deleted badge is not using the neutral variant, so the ` +
      `primary indicator of deleted state is weaker than the design requires`
  ).toHaveClass("bg-neutral-tint", "text-neutral-text");
}

/**
 * The whole treatment for one deleted record, from its badge:
 * neutral badge, muted text on the enclosing row/card, and no opacity dimming
 * anywhere beneath it.
 *
 * @param badge the "Deleted" badge element (e.g. screen.getByText("Deleted"))
 * @param label module name
 * @param options.container CSS selector for the row/card wrapper, default "tr"
 * @param options.textClass expected muted-text class, default DELETED_ROW_TEXT
 */
export function expectDeletedTreatment(
  badge: HTMLElement,
  label: string,
  options: { container?: string; textClass?: string } = {}
): void {
  const { container = "tr", textClass = DELETED_ROW_TEXT } = options;

  expectNeutralDeletedBadge(badge, label);

  const wrapper = badge.closest(container);
  expect(wrapper, `${label}: no enclosing <${container}> found for the Deleted badge`).not.toBeNull();

  expect(
    wrapper,
    `${label}: the deleted row does not mute its text, so it is visually ` +
      `identical to a live row apart from the badge`
  ).toHaveClass(textClass);

  expectNotDimmed(wrapper as Element, label);
}
