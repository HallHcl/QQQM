import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import MobileNav from "./MobileNav";
import { NAV_ITEMS } from "./nav-items";

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
});
