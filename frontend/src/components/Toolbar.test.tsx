import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toolbar } from "./Toolbar";

describe("Toolbar", () => {
  it("renders its children", () => {
    render(
      <Toolbar>
        <input placeholder="Search..." />
        <button>New item</button>
      </Toolbar>
    );

    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New item" })).toBeInTheDocument();
  });

  it("applies the base layout classes and merges a caller-provided className", () => {
    render(<Toolbar className="mt-4" data-testid="toolbar" />);

    const toolbar = screen.getByTestId("toolbar");
    expect(toolbar).toHaveClass(
      "flex",
      "flex-wrap",
      "items-center",
      "justify-between",
      "gap-3",
      "rounded-md",
      "border",
      "border-border",
      "bg-surface",
      "p-3",
      "mt-4"
    );
  });

  it("forwards a ref to the underlying div", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Toolbar ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
