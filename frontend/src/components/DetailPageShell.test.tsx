import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DetailPageShell } from "./DetailPageShell";
import { ApiError } from "@/api/errors";

interface Widget {
  id: string;
  name: string;
}

const WIDGET: Widget = { id: "w1", name: "Test Widget" };

const BASE = {
  backTo: "/widgets",
  backLabel: "Back to widgets",
  loadingMessage: "Loading widget...",
  notFoundMessage: "This widget could not be found.",
};

function renderShell(props: Partial<React.ComponentProps<typeof DetailPageShell<Widget>>> = {}) {
  return render(
    <MemoryRouter>
      <DetailPageShell<Widget>
        {...BASE}
        entity={WIDGET}
        isLoading={false}
        isError={false}
        main={(widget) => <p>main: {widget.name}</p>}
        {...props}
      />
    </MemoryRouter>
  );
}

describe("DetailPageShell", () => {
  it("renders the back-link with the given label and destination", () => {
    renderShell();

    const link = screen.getByRole("link", { name: /back to widgets/i });
    expect(link).toHaveAttribute("href", "/widgets");
  });

  it("keeps the back-link visible in every state, so a failed page is never a dead end", () => {
    const { rerender } = renderShell({ isLoading: true, entity: undefined });
    expect(screen.getByRole("link", { name: /back to widgets/i })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <DetailPageShell<Widget>
          {...BASE}
          entity={undefined}
          isLoading={false}
          isError
          main={() => <p>main</p>}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: /back to widgets/i })).toBeInTheDocument();
  });

  describe("four-state chain", () => {
    it("shows the loading state and does not evaluate the content slots", () => {
      const main = vi.fn(() => <p>main</p>);
      const aside = vi.fn(() => <p>aside</p>);
      renderShell({ isLoading: true, entity: undefined, main, aside });

      expect(screen.getByText("Loading widget...")).toBeInTheDocument();
      // The slots are render props precisely so a caller can dereference the
      // entity without guarding — calling them here would blow up on undefined.
      expect(main).not.toHaveBeenCalled();
      expect(aside).not.toHaveBeenCalled();
    });

    it("shows the error state, derived from the ApiError, with a working retry", () => {
      const onRetry = vi.fn();
      renderShell({
        isError: true,
        entity: undefined,
        error: new ApiError(500, "Upstream exploded"),
        onRetry,
      });

      expect(screen.getByText("Upstream exploded")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("shows the not-found state when the query resolves with no entity", () => {
      const main = vi.fn(() => <p>main</p>);
      renderShell({ entity: undefined, main });

      expect(screen.getByText("Not found")).toBeInTheDocument();
      expect(screen.getByText("This widget could not be found.")).toBeInTheDocument();
      expect(main).not.toHaveBeenCalled();
    });

    it("prefers the error state over not-found when both would apply", () => {
      renderShell({
        isError: true,
        entity: undefined,
        error: new ApiError(500, "Upstream exploded"),
      });

      expect(screen.getByText("Upstream exploded")).toBeInTheDocument();
      expect(screen.queryByText("This widget could not be found.")).not.toBeInTheDocument();
    });

    it("renders the content slots with the loaded entity once resolved", () => {
      renderShell({ aside: (widget) => <p>aside: {widget.id}</p> });

      expect(screen.getByText(/main: Test Widget/)).toBeInTheDocument();
      expect(screen.getByText(/aside: w1/)).toBeInTheDocument();
    });
  });

  describe("two-column grid", () => {
    it("renders both columns, main first in DOM order, when an aside is given", () => {
      const { container } = renderShell({ aside: () => <p>aside content</p> });

      const grid = container.querySelector(".grid")!;
      expect(grid).toBeInTheDocument();
      expect(grid.className).toContain("lg:grid-cols-[1fr_400px]");
      // Main precedes aside in the DOM, so keyboard/screen-reader order follows
      // the visual order rather than depending on grid placement.
      expect(grid.children).toHaveLength(2);
      expect(grid.children[0]).toHaveTextContent("main: Test Widget");
      expect(grid.children[1]).toHaveTextContent("aside content");
    });

    it("gives the flexible column min-w-0 so wide content wraps instead of stretching the grid", () => {
      const { container } = renderShell({ aside: () => <p>aside content</p> });

      const mainColumn = container.querySelector(".grid")!.children[0];
      expect(mainColumn.className).toContain("min-w-0");
    });

    it("collapses to a single stacked column below the lg breakpoint", () => {
      const { container } = renderShell({ aside: () => <p>aside content</p> });

      // The column template is lg-gated, so the grid is single-column by
      // default and only splits at >=1024px. Visual collapse itself is
      // Playwright's job; this guards the breakpoint gate not being dropped.
      const grid = container.querySelector(".grid")!;
      expect(grid.className).toContain("lg:grid-cols-[1fr_400px]");
      expect(grid.className).not.toMatch(/(?<!lg:)grid-cols-\[/);
    });

    it("renders main at full width with no empty second track when aside is omitted", () => {
      const { container } = renderShell();

      expect(screen.getByText(/main: Test Widget/)).toBeInTheDocument();
      // No grid at all — not a grid with one empty cell, which would still
      // reserve the 400px track and leave main visibly narrowed.
      expect(container.querySelector(".grid")).toBeNull();
      expect(container.className).not.toContain("400px");
    });
  });
});
