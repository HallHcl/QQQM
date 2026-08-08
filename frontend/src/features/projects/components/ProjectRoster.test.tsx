import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectRoster from "./ProjectRoster";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      DELETE: (...args: unknown[]) => deleteMock(...args),
    },
  };
});

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

const ROSTER_ENTRY = {
  id: "pp1",
  project_id: "p1",
  role_in_project: "Lead engineer",
  created_at: "2026-01-01T00:00:00.000Z",
  person: { id: "person1", name: "Ada Lovelace", email: null, type: "internal_engineer", deleted_at: null },
};

// A person on the roster who is NOT (or no longer) in the client's
// people_clients list — the edge case from decision #3. Must still render.
const STALE_ROSTER_ENTRY = {
  id: "pp2",
  project_id: "p1",
  role_in_project: "Former consultant",
  created_at: "2026-01-01T00:00:00.000Z",
  person: { id: "person2", name: "Grace Hopper", email: null, type: "vendor", deleted_at: null },
};

const CLIENT_PERSON_1 = {
  id: "person1",
  name: "Ada Lovelace",
  email: null,
  phone: null,
  type: "internal_engineer",
  deleted_at: null,
  relationship_type: null,
};

const CLIENT_PERSON_3 = {
  id: "person3",
  name: "Margaret Hamilton",
  email: null,
  phone: null,
  type: "internal_engineer",
  deleted_at: null,
  relationship_type: null,
};

function mockGetByPath(handlers: { roster?: unknown; clientPeople?: unknown }) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/projects/{id}/people") return Promise.resolve(handlers.roster ?? ok([]));
    if (path === "/api/clients/{id}/people") return Promise.resolve(handlers.clientPeople ?? ok([]));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

function renderRoster() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectRoster projectId="p1" clientId="c1" />
    </QueryClientProvider>
  );
}

describe("ProjectRoster", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
  });

  it("renders the current roster with each person's role", async () => {
    mockGetByPath({
      roster: ok([ROSTER_ENTRY]),
      clientPeople: ok([CLIENT_PERSON_1]),
    });

    renderRoster();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Lead engineer")).toBeInTheDocument();
  });

  it("renders a roster entry for a person no longer linked to the client (edge case)", async () => {
    // STALE_ROSTER_ENTRY's person is NOT in the client's people list at all —
    // simulating an assignment that predates a people_clients unlink.
    mockGetByPath({
      roster: ok([ROSTER_ENTRY, STALE_ROSTER_ENTRY]),
      clientPeople: ok([CLIENT_PERSON_1]),
    });

    renderRoster();

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Former consultant")).toBeInTheDocument();
  });

  it("scopes the assign picker to client-linked people not already on the roster", async () => {
    mockGetByPath({
      roster: ok([ROSTER_ENTRY]),
      clientPeople: ok([CLIENT_PERSON_1, CLIENT_PERSON_3]),
    });

    renderRoster();
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("combobox"));

    // Margaret Hamilton is client-linked and not yet on the roster -> shown.
    expect(await screen.findByRole("option", { name: "Margaret Hamilton" })).toBeInTheDocument();
    // Ada Lovelace is already on the roster -> not offered again.
    expect(screen.queryByRole("option", { name: "Ada Lovelace" })).not.toBeInTheDocument();
  });

  it("assigns the selected person with the entered role", async () => {
    mockGetByPath({
      roster: ok([]),
      clientPeople: ok([CLIENT_PERSON_3]),
    });
    postMock.mockResolvedValue(
      ok({
        id: "pp3",
        project_id: "p1",
        role_in_project: "QA",
        created_at: "2026-01-01T00:00:00.000Z",
        person: { ...CLIENT_PERSON_3, deleted_at: null },
      })
    );

    renderRoster();
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Margaret Hamilton" }));

    fireEvent.change(screen.getByPlaceholderText("e.g. Lead engineer"), {
      target: { value: "QA" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^assign$/i }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock).toHaveBeenCalledWith("/api/projects/{id}/people", {
      params: { path: { id: "p1" } },
      body: { people_id: "person3", role_in_project: "QA" },
    });
  });

  it("removes a person only after confirming, not immediately on click", async () => {
    mockGetByPath({
      roster: ok([ROSTER_ENTRY]),
      clientPeople: ok([CLIENT_PERSON_1]),
    });
    deleteMock.mockResolvedValue(ok({ message: "removed" }));

    renderRoster();
    await screen.findByText("Ada Lovelace");

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    expect(screen.getByText("Remove from project?")).toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    expect(deleteMock).toHaveBeenCalledWith("/api/projects/{id}/people/{peopleId}", {
      params: { path: { id: "p1", peopleId: "person1" } },
    });
  });
});
