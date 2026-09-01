import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's auto-cleanup relies on a global `afterEach`, which isn't present
// since this project runs Vitest without `test.globals`.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement these; Radix UI's Select/Popover/Dropdown menus
// call them when opening, so without a stub any test that actually
// interacts with one (not just renders it closed) throws.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

// Same story for ResizeObserver, which jsdom also omits: cmdk observes its
// list to keep the selected item scrolled into view, and throws on mount
// without this. A no-op is enough — no test asserts on resize behaviour.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
