import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Sidebar from "./Sidebar";
import {
  NAV_GROUPS,
  NAV_ITEMS,
  OVERVIEW_ITEM,
  SETTINGS_ITEM,
} from "./nav-items";

function renderSidebar(route = "/overview") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("renders every destination exactly once, correctly routed", () => {
    renderSidebar();

    for (const item of NAV_ITEMS) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link).toHaveAttribute("href", item.to);
    }
    expect(screen.getAllByRole("link")).toHaveLength(NAV_ITEMS.length);
  });

  it("exposes the sidebar as a labelled navigation landmark", () => {
    renderSidebar();
    expect(
      screen.getByRole("navigation", { name: "Main navigation" })
    ).toBeInTheDocument();
  });

  it("groups the middle destinations under Delivery, Operations and Knowledge", () => {
    renderSidebar();

    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(NAV_GROUPS.length);

    NAV_GROUPS.forEach((expected, index) => {
      const group = groups[index];
      expect(group).toHaveAccessibleName(expected.label);

      const links = within(group).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(
        expected.items.map((item) => item.label)
      );
      expect(links.map((link) => link.getAttribute("href"))).toEqual(
        expected.items.map((item) => item.to)
      );
    });
  });

  it("matches the specified grouping", () => {
    expect(
      NAV_GROUPS.map((group) => [
        group.label,
        group.items.map((item) => item.label),
      ])
    ).toEqual([
      ["Delivery", ["Clients", "Projects", "Environments", "Servers"]],
      ["Operations", ["Infrastructure", "Schedule", "Activity"]],
      ["Knowledge", ["Resources", "People"]],
    ]);
  });

  it("keeps Overview first and Settings last, both outside any group", () => {
    renderSidebar();

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent(OVERVIEW_ITEM.label);
    expect(links[links.length - 1]).toHaveTextContent(SETTINGS_ITEM.label);

    for (const standalone of [OVERVIEW_ITEM, SETTINGS_ITEM]) {
      expect(
        screen.getByRole("link", { name: standalone.label }).closest("[role='group']")
      ).toBeNull();
    }
  });

  it("marks only the current route active, for every destination", () => {
    for (const item of NAV_ITEMS) {
      const { unmount } = renderSidebar(item.to);

      const active = screen.getAllByRole("link").filter(
        (link) => link.getAttribute("aria-current") === "page"
      );
      expect(active).toHaveLength(1);
      expect(active[0]).toHaveTextContent(item.label);
      expect(active[0].className).toContain("border-brand");

      unmount();
    }
  });
});
