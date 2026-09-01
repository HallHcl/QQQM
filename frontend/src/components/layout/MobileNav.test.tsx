import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import MobileNav from "./MobileNav";
import {
  NAV_GROUPS,
  NAV_ITEMS,
  OVERVIEW_ITEM,
  SETTINGS_ITEM,
} from "./nav-items";

function renderMobileNav() {
  return render(
    <MemoryRouter initialEntries={["/clients"]}>
      <MobileNav />
    </MemoryRouter>
  );
}

describe("MobileNav", () => {
  it("does not render the drawer content until opened", () => {
    renderMobileNav();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the drawer and lists every desktop nav destination", async () => {
    renderMobileNav();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const dialog = await screen.findByRole("dialog");
    for (const item of NAV_ITEMS) {
      expect(
        screen.getByRole("link", { name: new RegExp(item.label) })
      ).toBeInTheDocument();
    }
    expect(dialog).toBeInTheDocument();
  });

  it("closes and restores focus to the trigger when Escape is pressed", async () => {
    renderMobileNav();
    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("closes when the explicit close control is clicked", async () => {
    renderMobileNav();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes the drawer when a nav destination is clicked", async () => {
    renderMobileNav();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("link", { name: /Projects/ }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
  it("mirrors the sidebar's grouping inside the drawer", async () => {
    renderMobileNav();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    await screen.findByRole("dialog");

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const groups = within(nav).getAllByRole("group");
    expect(groups).toHaveLength(NAV_GROUPS.length);

    NAV_GROUPS.forEach((expected, index) => {
      expect(groups[index]).toHaveAccessibleName(expected.label);
      expect(
        within(groups[index])
          .getAllByRole("link")
          .map((link) => link.getAttribute("href"))
      ).toEqual(expected.items.map((item) => item.to));
    });

    const links = within(nav).getAllByRole("link");
    expect(links[0]).toHaveTextContent(OVERVIEW_ITEM.label);
    expect(links[links.length - 1]).toHaveTextContent(SETTINGS_ITEM.label);
  });

  it("marks the current route active in the drawer", async () => {
    renderMobileNav();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    await screen.findByRole("dialog");

    const active = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("Clients");
  });
});
