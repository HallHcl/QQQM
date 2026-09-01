import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CommandPalette from "./CommandPalette";
import { SearchPaletteProvider } from "./SearchPaletteProvider";
import { useSearchPalette } from "./useSearchPalette";

const getMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

const RESULTS = {
  clients: [{ id: "c1", type: "client", label: "Acme Corp", secondary: "active" }],
  projects: [
    { id: "p1", type: "project", label: "Atlas Migration", secondary: "Acme Corp" },
  ],
  environments: [
    { id: "e1", type: "environment", label: "PROD", secondary: "Atlas Migration" },
  ],
  servers: [
    { id: "s1", type: "server", label: "Web Node", secondary: "10.77.0.42" },
  ],
  total: 4,
};

function mockResults(data: unknown = RESULTS) {
  getMock.mockResolvedValue({
    data,
    error: undefined,
    response: new Response(null, { status: 200 }),
  });
}

function renderPalette(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/overview"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/overview" element={<>{ui}</>} />
          <Route path="/projects/:id" element={<div>Project detail page</div>} />
          <Route path="/clients" element={<div>Clients list page</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/**
 * Finds a result row by its primary label. Deliberately not
 * `getByRole("option", { name })`: an option's accessible name concatenates
 * the label AND the secondary field, so "Acme Corp" would also match the
 * project whose client is Acme Corp.
 */
function optionFor(label: string) {
  const match = screen
    .getAllByRole("option")
    .find((option) => option.querySelector("span")?.textContent === label);
  if (!match) throw new Error(`No result row labelled "${label}"`);
  return match;
}

async function findOptionFor(label: string) {
  await waitFor(() => optionFor(label));
  return optionFor(label);
}

/** The row cmdk currently has selected, or undefined if there is none. */
function selectedOption() {
  return screen
    .getAllByRole("option")
    .find((option) => option.getAttribute("data-selected") === "true");
}

/** Types into the palette input and lets the 250ms debounce elapse. */
async function typeAndSettle(term: string) {
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: term } });
  await waitFor(() => {
    expect(getMock).toHaveBeenCalled();
  });
  return input;
}

beforeEach(() => {
  getMock.mockReset();
  mockResults();
});

describe("CommandPalette", () => {
  it("shows the resting empty state before anything is typed", () => {
    renderPalette(<CommandPalette open onOpenChange={() => {}} />);

    expect(
      screen.getByText(/Start typing to search clients, projects/i)
    ).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("debounces input rather than firing a request per keystroke", async () => {
    renderPalette(<CommandPalette open onOpenChange={() => {}} />);
    const input = screen.getByRole("combobox");

    for (const value of ["a", "ac", "acm", "acme"]) {
      fireEvent.change(input, { target: { value } });
    }
    // Still inside the debounce window: nothing has gone out yet.
    expect(getMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledTimes(1);
    });
    expect(getMock).toHaveBeenCalledWith("/api/search", {
      params: { query: { q: "acme" } },
    });
  });

  it("shows a loading state while the search is in flight", async () => {
    renderPalette(<CommandPalette open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "acme" } });

    expect(screen.getByText("Searching...")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Searching...")).not.toBeInTheDocument();
    });
  });

  it("renders results grouped by entity type with a secondary field", async () => {
    renderPalette(<CommandPalette open onOpenChange={() => {}} />);
    await typeAndSettle("acme");

    for (const heading of ["Clients", "Projects", "Environments", "Servers"]) {
      expect(await screen.findByText(heading)).toBeInTheDocument();
    }

    const option = await findOptionFor("Acme Corp");
    expect(within(option).getByText("active")).toBeInTheDocument();
    expect(optionFor("Web Node")).toHaveTextContent("10.77.0.42");
  });

  it("shows a no-results state for a term that matches nothing", async () => {
    mockResults({
      clients: [],
      projects: [],
      environments: [],
      servers: [],
      total: 0,
    });
    renderPalette(<CommandPalette open onOpenChange={() => {}} />);
    await typeAndSettle("zzzz");

    expect(await screen.findByText(/No results for/)).toBeInTheDocument();
  });

  it("shows an error state when the search request fails", async () => {
    getMock.mockRejectedValue(new Error("network down"));
    renderPalette(<CommandPalette open onOpenChange={() => {}} />);
    await typeAndSettle("acme");

    expect(await screen.findByText(/Search failed/)).toBeInTheDocument();
  });

  it("moves the selection with arrow keys, across group boundaries", async () => {
    renderPalette(<CommandPalette open onOpenChange={() => {}} />);
    const input = await typeAndSettle("a");
    await findOptionFor("Acme Corp");

    // cmdk selects the first item automatically.
    expect(selectedOption()).toHaveTextContent("Acme Corp");

    // Down from the last Clients item lands on the first Projects item —
    // the group boundary must not stop traversal.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => {
      expect(selectedOption()).toHaveTextContent("Atlas Migration");
    });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => {
      expect(selectedOption()).toHaveTextContent("PROD");
    });

    fireEvent.keyDown(input, { key: "ArrowUp" });
    await waitFor(() => {
      expect(selectedOption()).toHaveTextContent("Atlas Migration");
    });
  });

  it("navigates to the selected result on Enter and closes the palette", async () => {
    const onOpenChange = vi.fn();
    renderPalette(<CommandPalette open onOpenChange={onOpenChange} />);
    const input = await typeAndSettle("atlas");
    await findOptionFor("Acme Corp");

    // Move to the project hit, then activate it.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => {
      expect(selectedOption()).toHaveTextContent("Atlas Migration");
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Project detail page")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("navigates on click as well as Enter", async () => {
    const onOpenChange = vi.fn();
    renderPalette(<CommandPalette open onOpenChange={onOpenChange} />);
    await typeAndSettle("acme");

    fireEvent.click(await findOptionFor("Acme Corp"));

    expect(await screen.findByText("Clients list page")).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

function PaletteHarness() {
  const { openPalette } = useSearchPalette();
  return (
    <button type="button" onClick={openPalette}>
      Open search
    </button>
  );
}

describe("SearchPaletteProvider", () => {
  it("opens the palette on Ctrl+K from anywhere in the app", async () => {
    renderPalette(
      <SearchPaletteProvider>
        <PaletteHarness />
      </SearchPaletteProvider>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens the palette on Meta+K (macOS)", async () => {
    renderPalette(
      <SearchPaletteProvider>
        <PaletteHarness />
      </SearchPaletteProvider>
    );

    fireEvent.keyDown(document, { key: "K", metaKey: true });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("ignores a bare k with no modifier, so typing is unaffected", () => {
    renderPalette(
      <SearchPaletteProvider>
        <PaletteHarness />
      </SearchPaletteProvider>
    );

    fireEvent.keyDown(document, { key: "k" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger that opened it", async () => {
    renderPalette(
      <SearchPaletteProvider>
        <PaletteHarness />
      </SearchPaletteProvider>
    );

    const trigger = screen.getByRole("button", { name: "Open search" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("clears the previous term when reopened", async () => {
    renderPalette(
      <SearchPaletteProvider>
        <PaletteHarness />
      </SearchPaletteProvider>
    );

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "acme" } });
    expect(screen.getByRole("combobox")).toHaveValue("acme");

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await screen.findByRole("dialog");
    expect(screen.getByRole("combobox")).toHaveValue("");
  });
});
