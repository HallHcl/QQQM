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
