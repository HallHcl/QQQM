import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PeopleFilterBar from "./PeopleFilterBar";

function renderBar(overrides: Partial<React.ComponentProps<typeof PeopleFilterBar>> = {}) {
  const props = {
    typeFilter: "all",
    onTypeFilterChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    sort: "name",
    onSortChange: vi.fn(),
    order: "asc" as const,
    onOrderChange: vi.fn(),
    deleted: "false" as const,
    onDeletedChange: vi.fn(),
    ...overrides,
  };
  render(<PeopleFilterBar {...props} />);
  return props;
}

describe("PeopleFilterBar", () => {
  it("renders the role tabs, search input, and sort/order/status selects all in one component", () => {
    renderBar();

    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Vendors" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search people...")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort by")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort order")).toBeInTheDocument();
    expect(screen.getByLabelText("Record status filter")).toBeInTheDocument();
  });

  it("calls onTypeFilterChange when a role tab is clicked", () => {
    const props = renderBar();
    const vendorsTab = screen.getByRole("tab", { name: "Vendors" });
    fireEvent.mouseDown(vendorsTab);
    fireEvent.click(vendorsTab);
    expect(props.onTypeFilterChange).toHaveBeenCalledWith("vendor");
  });

  it("calls onSearchChange as the search input changes", () => {
    const props = renderBar();
    fireEvent.change(screen.getByPlaceholderText("Search people..."), {
      target: { value: "ada" },
    });
    expect(props.onSearchChange).toHaveBeenCalledWith("ada");
  });

  it("calls onSortChange, onOrderChange, and onDeletedChange from their respective selects", async () => {
    const props = renderBar();

    fireEvent.click(screen.getByLabelText("Sort by"));
    fireEvent.click(await screen.findByRole("option", { name: "Created" }));
    expect(props.onSortChange).toHaveBeenCalledWith("created_at");

    fireEvent.click(screen.getByLabelText("Sort order"));
    fireEvent.click(await screen.findByRole("option", { name: "Descending" }));
    expect(props.onOrderChange).toHaveBeenCalledWith("desc");

    fireEvent.click(screen.getByLabelText("Record status filter"));
    fireEvent.click(await screen.findByRole("option", { name: "Deleted" }));
    expect(props.onDeletedChange).toHaveBeenCalledWith("true");
  });
});
