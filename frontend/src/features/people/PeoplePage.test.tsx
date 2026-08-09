import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PeoplePage from "./PeoplePage";

const getMock = vi.fn();
const postMock = vi.fn();
const deleteMock = vi.fn();
const useAuthMock = vi.fn();

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

function paginated<T>(data: T[], totalPages = 1) {
  return {
    data,
    pagination: { page: 1, per_page: 20, total: data.length, total_pages: totalPages },
  };
}

const ACTIVE_PERSON = {
  id: "p1",
  name: "Alex Rivera",
  email: "alex@example.com",
  phone: "555-0100",
  type: "internal_engineer",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
};

const DELETED_PERSON = {
  ...ACTIVE_PERSON,
  id: "p2",
  name: "Old Contact",
  deleted_at: "2026-01-05T00:00:00.000Z",
};

function mockGetByPath(handlers: { people?: unknown; personClients?: unknown; clients?: unknown }) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/people") return Promise.resolve(handlers.people ?? ok(paginated([])));
    if (path === "/api/people/{id}/clients")
      return Promise.resolve(handlers.personClients ?? ok([]));
    if (path === "/api/clients") return Promise.resolve(handlers.clients ?? ok(paginated([])));
    throw new Error(`Unexpected path: ${path}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <PeoplePage />
    </QueryClientProvider>
  );
  return { invalidateSpy, unmount };
}

describe("PeoplePage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("shows a loading state while the fetch is in flight", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading people/i)).toBeInTheDocument();
  });

  it("renders people rows once loaded", async () => {
    mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
    renderPage();

    expect(await screen.findByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("alex@example.com")).toBeInTheDocument();
  });

  it("renders an empty state when the list is empty", async () => {
    mockGetByPath({ people: ok(paginated([])) });
    renderPage();

    expect(await screen.findByText(/no people found/i)).toBeInTheDocument();
  });

  it("renders an error state when the query fails", async () => {
    getMock.mockResolvedValue(apiError(500, "INTERNAL_ERROR", "Something broke"));
    renderPage();

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });

  it("marks a deleted person with a Deleted badge and dims its row", async () => {
    mockGetByPath({ people: ok(paginated([DELETED_PERSON])) });
    renderPage();

    expect(await screen.findByText("Old Contact")).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
  });

  describe("pagination", () => {
    it("sends page/per_page/sort/order/search/deleted through to the request, with no client_id param", async () => {
      mockGetByPath({ people: ok(paginated([])) });
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const call = getMock.mock.calls.find(([path]) => path === "/api/people");
      expect(call).toBeDefined();
      const [, options] = call!;
      expect(options.params.query).toMatchObject({
        page: 1,
        per_page: 20,
        sort: "name",
        order: "asc",
        deleted: "false",
      });
      expect(options.params.query.client_id).toBeUndefined();
      expect(options.params.query.clientId).toBeUndefined();
    });

    it("advances to the next page and refetches with page=2", async () => {
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON], 2)) });
      renderPage();

      await screen.findByText("Alex Rivera");
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
      getMock.mockClear();

      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/people");
        expect(call?.[1].params.query.page).toBe(2);
      });
    });
  });

  describe("RBAC-gated create/update (admin or member — Person PATCH is not admin-only, unlike Resources)", () => {
    it("shows New person and Edit to both admin and member", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
      const { unmount } = renderPage();
      await screen.findByText("Alex Rivera");
      expect(screen.getByRole("button", { name: /new person/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Alex Rivera");
      expect(screen.getByRole("button", { name: /new person/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    });

    it("hides New person and Edit from a role with neither admin nor member", async () => {
      useAuthMock.mockReturnValue({ roles: [], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
      renderPage();
      await screen.findByText("Alex Rivera");
      expect(screen.queryByRole("button", { name: /new person/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    });
  });

  describe("RBAC-gated delete/restore (admin only)", () => {
    it("shows Delete to an admin but not a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
      const { unmount } = renderPage();
      await screen.findByText("Alex Rivera");
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Alex Rivera");
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
      // Edit still shows for member (admin+member gate).
      expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    });

    it("shows Restore to an admin viewing a deleted person, but not to a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([DELETED_PERSON])) });
      const { unmount } = renderPage();
      await screen.findByText("Old Contact");
      expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Old Contact");
      expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    });
  });

  describe("delete", () => {
    it("opens a confirmation whose copy mentions the linked-user-disable cascade, and deletes on confirm", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
      deleteMock.mockResolvedValue(ok({ ...ACTIVE_PERSON, deleted_at: "2026-02-01T00:00:00.000Z" }));

      const { invalidateSpy } = renderPage();
      await screen.findByText("Alex Rivera");
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

      expect(await screen.findByText("Delete this person?")).toBeInTheDocument();
      expect(
        screen.getByText(/if this person has a linked user account, it will also be disabled/i)
      ).toBeInTheDocument();

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/people/{id}", {
        params: { path: { id: "p1" } },
      });
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["people"] }));
    });

    it("does not delete when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });

      renderPage();
      await screen.findByText("Alex Rivera");
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

      expect(await screen.findByText("Delete this person?")).toBeInTheDocument();
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));

      await waitFor(() =>
        expect(screen.queryByText("Delete this person?")).not.toBeInTheDocument()
      );
      expect(deleteMock).not.toHaveBeenCalled();
    });
  });

  describe("restore", () => {
    it("calls the restore endpoint directly (no confirmation dialog — cascade reverses cleanly, no data-loss risk)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([DELETED_PERSON])) });
      postMock.mockResolvedValue(ok({ ...DELETED_PERSON, deleted_at: null }));

      const { invalidateSpy } = renderPage();
      await screen.findByText("Old Contact");
      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock).toHaveBeenCalledWith("/api/people/{id}/restore", {
        params: { path: { id: "p2" } },
      });
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["people"] }));
    });

    it("surfaces restore's business-rule 409 as a plain error toast, not ConflictState", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([DELETED_PERSON])) });
      postMock.mockResolvedValue(apiError(409, "CONFLICT", "Person is not deleted"));

      renderPage();
      await screen.findByText("Old Contact");
      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("This record changed")).not.toBeInTheDocument();
    });
  });
});
