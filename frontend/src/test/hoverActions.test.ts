import { describe, expect, it } from "vitest";
import {
  HOVER_MEDIA_PREFIX,
  actionsWrapperFor,
  expectDimmedIdleRowActions,
  expectNeverHiddenWithinRow,
} from "./hoverActions";

/**
 * Tests for the guards themselves, not for any page.
 *
 * The six list-page suites only ever feed these helpers correct markup, so
 * they prove the helpers accept the real pattern and nothing else. In
 * particular the ancestor walk — hover-gating or hiding applied to an
 * enclosing `<td>` rather than to the wrapper — cannot be reached from those
 * suites at all, because production always classes the wrapper directly. That
 * is exactly the gap the walk exists to close, so it is asserted here instead
 * of shipping unverified.
 *
 * `expect().toEqual([])` inside a helper throws on failure, so "this markup
 * is rejected" is expressed as `expect(() => helper(...)).toThrow()`.
 */

/** The real production pattern: dimmed idle, full opacity on hover/focus. */
const GOOD_WRAPPER_CLASSES = [
  "inline-flex",
  "transition-opacity",
  "opacity-60",
  "group-hover:opacity-100",
  "group-focus-within:opacity-100",
].join(" ");

/**
 * Builds a realistic row: <table><tbody><tr><td><div><button>. Returns the
 * pieces the assertions need to target or to sabotage.
 */
function buildRow(wrapperClasses = GOOD_WRAPPER_CLASSES) {
  const table = document.createElement("table");
  table.innerHTML = `
    <tbody>
      <tr class="border-b border-border">
        <td class="px-4 py-3 align-middle">
          <div class="${wrapperClasses}">
            <button aria-label="Actions">x</button>
          </div>
        </td>
      </tr>
    </tbody>
  `;
  document.body.appendChild(table);

  const trigger = table.querySelector("button") as HTMLElement;
  return {
    trigger,
    wrapper: table.querySelector("div") as Element,
    cell: table.querySelector("td") as Element,
    row: table.querySelector("tr") as Element,
  };
}

describe("expectDimmedIdleRowActions", () => {
  it("accepts the production pattern", () => {
    const { wrapper } = buildRow();
    expect(() => expectDimmedIdleRowActions(wrapper, "Test")).not.toThrow();
  });

  it("rejects a wrapper missing the idle or hover/focus classes", () => {
    const { wrapper } = buildRow("inline-flex opacity-60");
    expect(() => expectDimmedIdleRowActions(wrapper, "Test")).toThrow();
  });

  describe("hiding utilities", () => {
    it("rejects one on the wrapper itself", () => {
      const { wrapper } = buildRow(`${GOOD_WRAPPER_CLASSES} hidden`);
      expect(() => expectDimmedIdleRowActions(wrapper, "Test")).toThrow();
    });

    // The gap the ancestor walk closes: before it, only the wrapper was
    // inspected, so this markup passed despite the actions being invisible.
    it("rejects one on the enclosing <td>", () => {
      const { wrapper, cell } = buildRow();
      cell.setAttribute("class", `${cell.getAttribute("class")} invisible`);
      expect(() => expectDimmedIdleRowActions(wrapper, "Test")).toThrow();
    });

    it("names the offending ancestor in the failure message", () => {
      const { wrapper, cell } = buildRow();
      cell.setAttribute("class", "px-4 sr-only");
      expect(() => expectDimmedIdleRowActions(wrapper, "Clients")).toThrow(/sr-only on <td/);
    });
  });

  describe("hover-media-scoped classes", () => {
    it("rejects one on the wrapper itself", () => {
      const { wrapper } = buildRow(`${GOOD_WRAPPER_CLASSES} ${HOVER_MEDIA_PREFIX}opacity-0`);
      expect(() => expectDimmedIdleRowActions(wrapper, "Test")).toThrow();
    });

    it("rejects one on the enclosing <td>", () => {
      const { wrapper, cell } = buildRow();
      cell.setAttribute("class", `px-4 ${HOVER_MEDIA_PREFIX}opacity-0`);
      expect(() => expectDimmedIdleRowActions(wrapper, "Test")).toThrow();
    });
  });

  // The row carries its own dim for deleted rows (opacity-50), and `hover:`
  // background utilities besides. Walking into it would make every deleted
  // row a false failure, so the chain stops below it.
  it("ignores classes on the <tr> and above", () => {
    const { wrapper, row } = buildRow();
    row.setAttribute("class", `hidden invisible ${HOVER_MEDIA_PREFIX}opacity-0`);
    expect(() => expectDimmedIdleRowActions(wrapper, "Test")).not.toThrow();
  });

  it("does not treat the idle dim as a hiding utility", () => {
    // opacity-60 is the intended design; only opacity-0 is a regression.
    const { wrapper } = buildRow();
    expect(() => expectDimmedIdleRowActions(wrapper, "Test")).not.toThrow();
  });
});

describe("expectNeverHiddenWithinRow", () => {
  it("accepts a control with no visibility styling anywhere in its row", () => {
    const { trigger } = buildRow("inline-flex");
    expect(() => expectNeverHiddenWithinRow(trigger, "Test")).not.toThrow();
  });

  it("rejects a hiding utility on an ancestor wrapper", () => {
    const { trigger } = buildRow("inline-flex opacity-0");
    expect(() => expectNeverHiddenWithinRow(trigger, "Test")).toThrow();
  });

  it("rejects a hover-media-scoped class on an ancestor wrapper", () => {
    const { trigger } = buildRow(`inline-flex ${HOVER_MEDIA_PREFIX}opacity-0`);
    expect(() => expectNeverHiddenWithinRow(trigger, "Test")).toThrow();
  });

  // Aggregating the walk into one assertion (rather than one per ancestor)
  // means a failure reports the whole chain instead of stopping at the
  // lowest offender.
  it("reports every offending element in the chain, not just the first", () => {
    const { trigger, cell } = buildRow("inline-flex hidden");
    cell.setAttribute("class", "px-4 invisible");
    expect(() => expectNeverHiddenWithinRow(trigger, "Test")).toThrow(/hidden on <div/);
    expect(() => expectNeverHiddenWithinRow(trigger, "Test")).toThrow(/invisible on <td/);
  });

  it("ignores classes on the <tr> and above", () => {
    const { trigger, row } = buildRow("inline-flex");
    row.setAttribute("class", "hidden");
    expect(() => expectNeverHiddenWithinRow(trigger, "Test")).not.toThrow();
  });
});

describe("actionsWrapperFor", () => {
  it("resolves the wrapper div from the row's trigger button", () => {
    const { trigger, wrapper } = buildRow();
    expect(actionsWrapperFor(trigger)).toBe(wrapper);
  });

  it("throws a clear error when the trigger has no wrapping div", () => {
    const orphan = document.createElement("button");
    document.body.appendChild(orphan);
    expect(() => actionsWrapperFor(orphan)).toThrow(/No wrapping <div> found/);
  });
});
