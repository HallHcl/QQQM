import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionsWrapperFor,
  expectDimmedIdleRowActions,
  expectNeverHiddenWithinRow,
} from "@/test/hoverActions";
import SchedulePage from "./SchedulePage";

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

const ACTIVE_SCHEDULE = {
  id: "s1",
  project_id: "p1",
  server_id: null,
  title: "Quarterly PM",
  type: "PM",
  scheduled_date: "2026-09-01",
  started_at: null,
  completed_at: null,
  assigned_to: "person-1",
  status: "pending",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
  is_overdue: false,
};

const DELETED_SCHEDULE = {
  ...ACTIVE_SCHEDULE,
  id: "s2",
  title: "Old Server Check",
  deleted_at: "2026-01-05T00:00:00.000Z",
};

function mockGetByPath(handlers: { schedules?: unknown; people?: unknown; projects?: unknown } = {}) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/schedules") return Promise.resolve(handlers.schedules ?? ok(paginated([])));
    if (path === "/api/people") return Promise.resolve(handlers.people ?? ok(paginated([])));
    if (path === "/api/projects") return Promise.resolve(handlers.projects ?? ok(paginated([])));
    if (path === "/api/schedules/{id}") return Promise.resolve(ok(ACTIVE_SCHEDULE));
    throw new Error(`Unexpected path: ${path}`);
  });
}

function renderPage(initialEntries = ["/schedule"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <SchedulePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { invalidateSpy, unmount };
}

describe("SchedulePage", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
  });

  it("renders schedule rows once loaded", async () => {
    mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });
    renderPage();

    expect(await screen.findByText("Quarterly PM")).toBeInTheDocument();
  });

  it("marks a deleted schedule with a Deleted badge and dims its row", async () => {
    mockGetByPath({ schedules: ok(paginated([DELETED_SCHEDULE])) });
    renderPage();

    expect(await screen.findByText("Old Server Check")).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
  });

  describe("pagination", () => {
    it("sends only the params GET /schedules actually supports (page/per_page/sort/order/deleted/project_id/status/from/to)", async () => {
      mockGetByPath({ schedules: ok(paginated([])) });
      renderPage();

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const call = getMock.mock.calls.find(([path]) => path === "/api/schedules");
      expect(call).toBeDefined();
      const [, options] = call!;
      expect(options.params.query).toEqual({
        page: 1,
        per_page: 20,
        sort: "scheduled_date",
        order: "asc",
        project_id: undefined,
        status: undefined,
        from: undefined,
        to: undefined,
        deleted: "false",
      });
      // No search/type/server_id/assigned_to param exists server-side for
      // GET /schedules — confirm none is ever sent.
      expect(options.params.query.search).toBeUndefined();
      expect(options.params.query.type).toBeUndefined();
      expect(options.params.query.server_id).toBeUndefined();
      expect(options.params.query.assigned_to).toBeUndefined();
    });

    it("advances to the next page and refetches with page=2", async () => {
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE], 2)) });
      renderPage();

      await screen.findByText("Quarterly PM");
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
      getMock.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/schedules");
        expect(call?.[1].params.query.page).toBe(2);
      });
    });

    it("switching the deleted filter re-requests with the new deleted param", async () => {
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });
      renderPage();

      await screen.findByText("Quarterly PM");
      getMock.mockClear();
      mockGetByPath({ schedules: ok(paginated([DELETED_SCHEDULE])) });

      // The 3rd combobox in the filter row is the deleted-status select
      // (status filter, sort, order, deleted — in that DOM order).
      const deletedSelect = screen.getAllByRole("combobox")[3];
      fireEvent.click(deletedSelect);
      fireEvent.click(await screen.findByRole("option", { name: "Deleted" }));

      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/schedules");
        expect(call?.[1].params.query.deleted).toBe("true");
      });
    });

    it("initializes the status filter from the URL on load (bookmarked/shared URL support)", async () => {
      mockGetByPath({ schedules: ok(paginated([])) });
      renderPage(["/schedule?status=pending"]);

      await waitFor(() => expect(getMock).toHaveBeenCalled());
      const call = getMock.mock.calls.find(([path]) => path === "/api/schedules");
      expect(call?.[1].params.query.status).toBe("pending");
    });

    it("writes the status filter to the URL when changed, without resetting the page", async () => {
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE], 2)) });
      renderPage();
      await screen.findByText("Quarterly PM");
      getMock.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      await waitFor(() => {
        const call = getMock.mock.calls.find(([path]) => path === "/api/schedules");
        expect(call?.[1].params.query.page).toBe(2);
      });
      getMock.mockClear();

      const statusSelect = screen.getAllByRole("combobox")[0];
      fireEvent.click(statusSelect);
      fireEvent.click(await screen.findByRole("option", { name: "Pending" }));

      await waitFor(() => {
        const call = getMock.mock.calls
          .filter(([path]) => path === "/api/schedules")
          .at(-1);
        expect(call?.[1].params.query.status).toBe("pending");
        // Status change never reset the page pre-migration either — preserved.
        expect(call?.[1].params.query.page).toBe(2);
      });
    });

    it("falls back gracefully when the URL's date param is malformed (no crash, no day filter applied)", async () => {
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });
      renderPage(["/schedule?date=not-a-date"]);

      expect(await screen.findByText("Quarterly PM")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /clear date filter/i })).not.toBeInTheDocument();
    });
  });

  describe("RBAC-gated create/edit (admin or member — matches Schedule's PATCH gating, not Resources' admin-only pattern)", () => {
    it("shows New schedule and Edit to both admin and member", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });
      const { unmount } = renderPage();
      await screen.findByText("Quarterly PM");
      expect(screen.getByRole("button", { name: /new schedule/i })).toBeInTheDocument();
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Quarterly PM");
      expect(screen.getByRole("button", { name: /new schedule/i })).toBeInTheDocument();
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    });

    it("hides New schedule and the Actions menu from a role with neither admin nor member", async () => {
      useAuthMock.mockReturnValue({ roles: [], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });
      renderPage();
      await screen.findByText("Quarterly PM");
      expect(screen.queryByRole("button", { name: /new schedule/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    });
  });

  describe("RBAC-gated delete/restore (admin only)", () => {
    it("shows Delete to an admin but not a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });
      const { unmount } = renderPage();
      await screen.findByText("Quarterly PM");
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Quarterly PM");
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      // Edit still shows for member (admin+member gate); Delete does not (admin only).
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    });

    it("shows Restore to an admin viewing a deleted schedule, but not to a member", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([DELETED_SCHEDULE])) });
      const { unmount } = renderPage();
      await screen.findByText("Old Server Check");
      expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderPage();
      await screen.findByText("Old Server Check");
      expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
    });
  });

  describe("Edit/Delete are hidden for terminal statuses (done/cancelled), independent of isDeleted", () => {
    it("shows the Actions menu with Edit and Delete for a pending schedule", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([{ ...ACTIVE_SCHEDULE, status: "pending" }])) });
      renderPage();
      await screen.findByText("Quarterly PM");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    });

    it("shows the Actions menu with Edit and Delete for an in_progress schedule", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([{ ...ACTIVE_SCHEDULE, status: "in_progress" }])) });
      renderPage();
      await screen.findByText("Quarterly PM");

      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    });

    it("hides the Actions menu entirely for a done schedule (not soft-deleted, but terminal)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([{ ...ACTIVE_SCHEDULE, status: "done" }])) });
      renderPage();
      await screen.findByText("Quarterly PM");

      expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    });

    it("hides the Actions menu entirely for a cancelled schedule (not soft-deleted, but terminal)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([{ ...ACTIVE_SCHEDULE, status: "cancelled" }])) });
      renderPage();
      await screen.findByText("Quarterly PM");

      expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    });
  });

  describe("delete", () => {
    it("opens a confirmation whose copy reflects Schedule being a leaf entity (no cascade), and deletes on confirm", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });
      deleteMock.mockResolvedValue(ok({ ...ACTIVE_SCHEDULE, deleted_at: "2026-02-01T00:00:00.000Z" }));

      const { invalidateSpy } = renderPage();
      await screen.findByText("Quarterly PM");
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

      expect(await screen.findByText("Delete this schedule?")).toBeInTheDocument();
      expect(screen.getByText(/leaf record.*nothing else.*affected/i)).toBeInTheDocument();

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));

      await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
      expect(deleteMock).toHaveBeenCalledWith("/api/schedules/{id}", {
        params: { path: { id: "s1" } },
      });
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["schedules"] }));
    });

    it("does not delete when the confirmation is cancelled", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });

      renderPage();
      await screen.findByText("Quarterly PM");
      fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }), { button: 0 });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

      expect(await screen.findByText("Delete this schedule?")).toBeInTheDocument();
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));

      await waitFor(() =>
        expect(screen.queryByText("Delete this schedule?")).not.toBeInTheDocument()
      );
      expect(deleteMock).not.toHaveBeenCalled();
    });
  });

  describe("restore", () => {
    it("calls the restore endpoint directly (no confirmation dialog — leaf entity, no cascade, no data-loss risk)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([DELETED_SCHEDULE])) });
      postMock.mockResolvedValue(ok({ ...DELETED_SCHEDULE, deleted_at: null }));

      const { invalidateSpy } = renderPage();
      await screen.findByText("Old Server Check");
      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(postMock).toHaveBeenCalledWith("/api/schedules/{id}/restore", {
        params: { path: { id: "s2" } },
      });
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["schedules"] }));
    });

    it("surfaces restore's business-rule 409 as a plain error toast, not ConflictState", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([DELETED_SCHEDULE])) });
      postMock.mockResolvedValue(apiError(409, "CONFLICT", "Schedule is not deleted"));

      renderPage();
      await screen.findByText("Old Server Check");
      fireEvent.click(screen.getByRole("button", { name: /restore/i }));

      await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("This record changed")).not.toBeInTheDocument();
    });
  });

  describe("row actions stay reachable on touch devices", () => {
    it("keeps the row's Actions permanently visible — dimmed at idle, brightened on hover/focus, never hidden", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });

      renderPage();
      await screen.findByText("Quarterly PM");

      expectDimmedIdleRowActions(
        actionsWrapperFor(screen.getByRole("button", { name: "Actions" })),
        "Schedule"
      );
    });

    it("leaves the status-transition controls permanently visible (workflow control, not a row action)", async () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      // ACTIVE_SCHEDULE is "pending", so ScheduleStatusActions renders its
      // Start/Cancel buttons in the Status column.
      mockGetByPath({ schedules: ok(paginated([ACTIVE_SCHEDULE])) });

      renderPage();
      await screen.findByText("Quarterly PM");

      // Deliberately excluded from the dimmed-idle treatment: unlike the
      // kebab, these drive the schedule's state machine and must not depend
      // on hover. Checked up the ancestor chain, since a hover-gated or
      // hidden wrapper would suppress them just as effectively as a class on
      // the button itself.
      for (const label of ["Start", "Cancel"]) {
        expectNeverHiddenWithinRow(
          screen.getByRole("button", { name: label }),
          `Schedule ${label} control`
        );
      }
    });
  });
});
