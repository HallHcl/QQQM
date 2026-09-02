import { describe, expect, it } from "vitest";
import { panelSurface } from "./panelSurface";

describe("panelSurface", () => {
  it("emits the canonical rounded-md border border-border", () => {
    expect(panelSurface()).toBe("rounded-md border border-border");
  });

  it("adds border-dashed when dashed=true", () => {
    expect(panelSurface({ dashed: true })).toBe(
      "rounded-md border border-border border-dashed"
    );
  });

  it("omits border-dashed when dashed=false (default)", () => {
    expect(panelSurface({ dashed: false })).toBe(
      "rounded-md border border-border"
    );
  });
});
