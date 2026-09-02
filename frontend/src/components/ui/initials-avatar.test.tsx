import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InitialsAvatar } from "./initials-avatar";

describe("InitialsAvatar", () => {
  it("renders the initials derived from the name", () => {
    const { container } = render(<InitialsAvatar name="Ada Lovelace" />);
    expect(container.textContent).toBe("AL");
  });

  it("is hidden from the accessibility tree", () => {
    render(<InitialsAvatar name="Ada Lovelace" />);
    expect(screen.queryByText("AL")).not.toBeNull();
    expect(document.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("pins the tile class string (guards the consolidated sites)", () => {
    const { container } = render(<InitialsAvatar name="Ada Lovelace" />);
    expect(container.firstElementChild?.getAttribute("class")).toBe(
      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-caption font-semibold text-foreground"
    );
  });

  it("merges an extra className", () => {
    const { container } = render(<InitialsAvatar name="Ada" className="h-10 w-10" />);
    const cls = container.firstElementChild?.getAttribute("class") ?? "";
    expect(cls).toContain("h-10");
    expect(cls).toContain("w-10");
    expect(cls).not.toContain("h-8");
  });
});
