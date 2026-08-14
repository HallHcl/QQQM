import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterBar } from "./FilterBar";

describe("FilterBar", () => {
  it("renders its children", () => {
    render(
      <FilterBar>
        <input placeholder="Search..." />
        <button>Filter</button>
      </FilterBar>
    );

    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("applies the base layout classes and merges a caller-provided className", () => {
    render(<FilterBar className="mt-4" data-testid="bar" />);

    const bar = screen.getByTestId("bar");
    expect(bar).toHaveClass("flex", "flex-wrap", "items-center", "gap-2", "mt-4");
  });

  it("forwards a ref to the underlying div", () => {
    const ref = createRef<HTMLDivElement>();
    render(<FilterBar ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
