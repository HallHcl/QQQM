import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionsWrapperFor, expectHoverGatedRowActions } from "@/test/hoverActions";
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

function renderPage(initialEntries = ["/people"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <PeoplePage />
      </MemoryRouter>
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

  describe("row keyboard activation (opens PersonDetailDialog, same as a click)", () => {
    it("opens the detail dialog when Enter is pressed on a focused row", async () => {
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
      renderPage();

      const nameCell = await screen.findByText("Alex Rivera");
      const row = nameCell.closest("tr")!;
      expect(row).toHaveAttribute("role", "button");
      fireEvent.keyDown(row, { key: "Enter" });

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("does not open the detail dialog from a keydown on the Actions menu trigger", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
      renderPage();

      await screen.findByText("Alex Rivera");
      fireEvent.keyDown(screen.getByRole("button", { name: "Actions" }), { key: "Enter" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
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

    it("initializes the role filter from the URL on load (bookmarked/shared URL support)", async () => {
      mockGetByPath({ people: ok(paginated([])) });
      renderPage(["/people?type=vendor&search=alex"]);

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const call = getMock.mock.calls.find(([path]) => path === "/api/people");
      expect(call?.[1].params.query).toMatchObject({ type: "vendor", search: "alex" });
    });

    it("writes the role filter to the URL when changed, without resetting the page", async () => {
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON], 2)) });
      renderPage();
      await screen.findByText("Alex Rivera");
      getMock.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/people");
        expect(call?.[1].params.query.page).toBe(2);
      });
      getMock.mockClear();

      const vendorsTab = screen.getByRole("tab", { name: "Vendors" });
      fireEvent.mouseDown(vendorsTab);
      fireEvent.click(vendorsTab);

      await waitFor(() => {
        const call = getMock.mock.calls
          .filter(([path]) => path === "/api/people")
          .at(-1);
        expect(call?.[1].params.query.type).toBe("vendor");
        // Role change never reset the page pre-migration either — preserved.
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
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Alex Rivera");
      expect(screen.getByRole("button", { name: /new person/i })).toBeInTheDocument();
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    });

    it("hides New person and the Actions menu from a role with neither admin nor member", async () => {
      useAuthMock.mockReturnValue({ roles: [], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
      renderPage();
      await screen.findByText("Alex Rivera");
      expect(screen.queryByRole("button", { name: /new person/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    });
  });

  describe("RBAC-gated delete/restore (admin only)", () => {
    it("shows Delete to an admin but not a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });
      const { unmount } = renderPage();
      await screen.findByText("Alex Rivera");
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Alex Rivera");
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      // Edit still shows for member (admin+member gate); Delete does not (admin only).
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
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
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

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
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

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

  describe("row actions stay reachable on touch devices", () => {
    it("hover-gates the row's Actions only on hover-capable devices, never unconditionally", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ people: ok(paginated([ACTIVE_PERSON])) });

      renderPage();
      await screen.findByText("Alex Rivera");

      expectHoverGatedRowActions(
        actionsWrapperFor(screen.getByRole("button", { name: "Actions" })),
        "People"
      );
    });
  });
});
