import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectDetailPage from "./ProjectDetailPage";

const getMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { GET: (...args: unknown[]) => getMock(...args) },
  };
});

vi.mock("@/features/auth/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function apiError(status: number, code: string, message: string) {
  return {
    data: undefined,
    error: { error: { code, message } },
    response: new Response(null, { status }),
  };
}

const PROJECT_DETAIL = {
  id: "p1",
  client_id: "c1",
  name: "Migration",
  description: "Legacy data migration",
  owner_status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  client: { id: "c1", name: "Acme Corp" },
};

function mockGetByPath(handlers: {
  project?: unknown;
  roster?: unknown;
  clientPeople?: unknown;
}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/projects/{id}") return Promise.resolve(handlers.project ?? ok(PROJECT_DETAIL));
    if (path === "/api/projects/{id}/people") return Promise.resolve(handlers.roster ?? ok([]));
    if (path === "/api/clients/{id}/people") return Promise.resolve(handlers.clientPeople ?? ok([]));
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    getMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading project/i)).toBeInTheDocument();
  });

  it("renders the project's fields once loaded", async () => {
    mockGetByPath({});

    renderPage();

    expect(await screen.findByText("Migration")).toBeInTheDocument();
    expect(screen.getByText("Legacy data migration")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders a not-found error state for a missing project", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/api/projects/{id}") {
        return Promise.resolve(apiError(404, "NOT_FOUND", "Project not found"));
      }
      return Promise.resolve(ok([]));
    });

    renderPage();

    expect(await screen.findByText("Project not found")).toBeInTheDocument();
  });

  it("renders the roster section", async () => {
    mockGetByPath({
      roster: ok([
        {
          id: "pp1",
          project_id: "p1",
          role_in_project: "Lead engineer",
          created_at: "2026-01-01T00:00:00.000Z",
          person: { id: "person1", name: "Ada Lovelace", email: null, type: "internal_engineer", deleted_at: null },
        },
      ]),
    });

    renderPage();

    expect(await screen.findByText("Team")).toBeInTheDocument();
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Lead engineer")).toBeInTheDocument();
  });

  it("shows the Edit button to an admin", async () => {
    useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
    mockGetByPath({});

    renderPage();

    expect(await screen.findByText("Migration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("hides the Edit button from a non-admin (Project update is admin-only, verified against backend/src/routes/projects.routes.ts)", async () => {
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
    mockGetByPath({});

    renderPage();

    expect(await screen.findByText("Migration")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  describe("single-column DetailPageShell adoption", () => {
    it("renders no aside column — the Team roster keeps the full content width", async () => {
      mockGetByPath({});
      const { container } = renderPage();

      await screen.findByText("Migration");
      // The shell only emits its two-column grid when an `aside` is passed;
      // this page passes none, so the 400px rail must never appear.
      expect(container.innerHTML).not.toContain("1fr_400px");
    });

    it("keeps the roster's own loading state while the page itself is fully rendered", async () => {
      getMock.mockImplementation((path: string) => {
        if (path === "/api/projects/{id}") return Promise.resolve(ok(PROJECT_DETAIL));
        // The roster query never resolves: only this nested section pends.
        if (path === "/api/projects/{id}/people") return new Promise(() => {});
        return Promise.resolve(ok([]));
      });

      renderPage();

      expect(await screen.findByText("Migration")).toBeInTheDocument();
      expect(screen.getByText("Loading team...")).toBeInTheDocument();
      // The shell's page-level loading state has resolved and must be gone.
      expect(screen.queryByText(/loading project/i)).not.toBeInTheDocument();
    });

    it("keeps the roster's two mutually-exclusive client-link hints distinct, not a generic empty state", async () => {
      // No people linked to the client at all.
      mockGetByPath({ roster: ok([]), clientPeople: ok([]) });
      const { unmount } = renderPage();

      expect(
        await screen.findByText(/No people are linked to this project's client yet/i)
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/already on the team/i)
      ).not.toBeInTheDocument();
      unmount();

      // Client has people, but all of them are already on the roster.
      const PERSON = { id: "person1", name: "Ada Lovelace", email: null, type: "internal_engineer", deleted_at: null };
      mockGetByPath({
        roster: ok([
          {
            id: "pp1",
            project_id: "p1",
            role_in_project: "Lead engineer",
            created_at: "2026-01-01T00:00:00.000Z",
            person: PERSON,
          },
        ]),
        clientPeople: ok([PERSON]),
      });
      renderPage();

      expect(
        await screen.findByText(/Everyone linked to this project's client is already on the team/i)
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/No people are linked to this project's client yet/i)
      ).not.toBeInTheDocument();
    });
  });
});
