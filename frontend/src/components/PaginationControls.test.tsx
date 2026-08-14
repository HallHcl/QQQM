import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaginationControls } from "./PaginationControls";

function renderControls(overrides: Partial<React.ComponentProps<typeof PaginationControls>> = {}) {
  const props = {
    page: 2,
    totalPages: 3,
    perPage: 20,
    onPrevPage: vi.fn(),
    onNextPage: vi.fn(),
    onPerPageChange: vi.fn(),
    ...overrides,
  };
  render(<PaginationControls {...props} />);
  return props;
}

describe("PaginationControls", () => {
  it("shows the current page and total", () => {
    renderControls({ page: 2, totalPages: 3 });
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("calls onPrevPage/onNextPage when the buttons are clicked", () => {
    const props = renderControls({ page: 2, totalPages: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(props.onPrevPage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(props.onNextPage).toHaveBeenCalledTimes(1);
  });

  it("disables Previous on the first page and Next on the last page", () => {
    renderControls({ page: 1, totalPages: 1 });

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables both buttons on a middle page", () => {
    renderControls({ page: 2, totalPages: 3 });

    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("offers the default per-page options and calls onPerPageChange with a number", async () => {
    const props = renderControls({ perPage: 20 });

    fireEvent.click(screen.getByLabelText("Rows per page"));
    for (const size of ["10", "20", "50", "100"]) {
      expect(await screen.findByRole("option", { name: size })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("option", { name: "50" }));

    expect(props.onPerPageChange).toHaveBeenCalledWith(50);
  });

  it("accepts custom perPageOptions", async () => {
    renderControls({ perPageOptions: [5, 15] });

    fireEvent.click(screen.getByLabelText("Rows per page"));
    expect(await screen.findByRole("option", { name: "5" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "15" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "20" })).not.toBeInTheDocument();
  });
});
