import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScheduleFormSheet, { SCHEDULE_NOTES_MAX_LENGTH } from "./ScheduleFormSheet";
import type { Schedule } from "@/types";

// This file's tests drive multiple sequential Radix Select interactions,
// react-query fetches (people, projects, environments, servers, schedule
// detail), and waitFor chains across 20 tests. The import phase alone takes
// ~4.4s due to the hook dependency chain, leaving very little margin per
// test against Vitest's 5s default under full-suite CPU contention — the
// same pattern that caused ServerFormSheet.test.tsx to timeout and was
// fixed there with this identical scoped override. File-local, does NOT
// change the global default.
vi.setConfig({ testTimeout: 15000 });


const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      PATCH: (...args: unknown[]) => patchMock(...args),
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
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

const PEOPLE = [{ id: "person-1", name: "Alex Rivera" }];
const PROJECTS = [{ id: "p1", name: "Migration" }];
const ENVIRONMENTS = [{ id: "e1", project_id: "p1", name: "PROD" }];
const SERVERS = [
  { id: "srv-1", environment_id: "e1", display_name: "web-01" },
  { id: "srv-9", environment_id: "e9", display_name: "unrelated-server" },
];

const SAMPLE_SCHEDULE: Schedule = {
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
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

// GET /schedules/{id}'s ScheduleDetail shape — inlines the names this
// dialog needs to display for assigned_to/project/server.
function scheduleDetail(overrides: Partial<Schedule> = {}) {
  const merged = { ...SAMPLE_SCHEDULE, ...overrides };
  return {
    ...merged,
    is_overdue: false,
    assigned_to_person: { id: merged.assigned_to, name: "Alex Rivera" },
    project: merged.project_id ? { id: merged.project_id, name: "Migration" } : null,
    server: merged.server_id ? { id: merged.server_id, name: "db-01" } : null,
  };
}

function paginated<T>(data: T[]) {
  return { data, pagination: { page: 1, per_page: 20, total: data.length, total_pages: 1 } };
}

function mockGetByPath(
  overrides: {
    people?: unknown;
    projects?: unknown;
    schedule?: unknown;
    environments?: unknown;
    servers?: unknown;
  } = {}
) {
  getMock.mockImplementation((path: string) => {
    if (path === "/api/people") return Promise.resolve(overrides.people ?? ok(paginated(PEOPLE)));
    if (path === "/api/projects") return Promise.resolve(overrides.projects ?? ok(paginated(PROJECTS)));
    if (path === "/api/environments")
      return Promise.resolve(overrides.environments ?? ok(paginated(ENVIRONMENTS)));
    if (path === "/api/servers") return Promise.resolve(overrides.servers ?? ok(paginated(SERVERS)));
    if (path === "/api/schedules/{id}") return Promise.resolve(overrides.schedule ?? ok(scheduleDetail()));
    throw new Error(`Unexpected path: ${path}`);
  });
}

function renderSheet(schedule: Schedule | undefined = undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ScheduleFormSheet open onOpenChange={onOpenChange} schedule={schedule} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("ScheduleFormSheet", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    toastMock.mockClear();
    mockGetByPath();
  });

  describe("edit mode", () => {
    it("PATCHes only notes/updated_at — status is never part of the payload", async () => {
      patchMock.mockResolvedValue(ok({ ...SAMPLE_SCHEDULE, notes: "checked filters" }));
      const { onOpenChange, invalidateSpy } = renderSheet(SAMPLE_SCHEDULE);

      await screen.findByDisplayValue("Quarterly PM");
      fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: "checked filters" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

      expect(patchMock).toHaveBeenCalledTimes(1);
      const [path, options] = patchMock.mock.calls[0];
      expect(path).toBe("/api/schedules/{id}");
      expect(options.params.path).toEqual({ id: "s1" });
      expect(options.body).toEqual({
        notes: "checked filters",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["schedules"] });
      expect(toastMock).toHaveBeenCalledWith({ title: "Schedule updated" });
    });

    it("renders title/type/date/assignee/project as read-only (disabled) inputs showing the current values, and Notes as the only enabled input", async () => {
      renderSheet(SAMPLE_SCHEDULE);

      expect(await screen.findByDisplayValue("Quarterly PM")).toBeDisabled();
      expect(screen.getByDisplayValue("PM")).toBeDisabled();
      expect(screen.getByDisplayValue("Sep 1, 2026")).toBeDisabled();
      expect(await screen.findByDisplayValue("Alex Rivera")).toBeDisabled();
      expect(await screen.findByDisplayValue("Migration")).toBeDisabled();

      expect(screen.getByLabelText(/Notes/i)).not.toBeDisabled();
    });

    it("shows no server field when the schedule has no server_id", async () => {
      renderSheet(SAMPLE_SCHEDULE);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.queryByText("Server")).not.toBeInTheDocument();
    });

    it("shows the linked server's name read-only when server_id is set", async () => {
      const linked = { ...SAMPLE_SCHEDULE, server_id: "srv-1" };
      mockGetByPath({ schedule: ok(scheduleDetail({ server_id: "srv-1" })) });
      renderSheet(linked);

      expect(await screen.findByText("Server")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("db-01")).toBeDisabled();
    });

    it("shows status as a read-only badge with no status dropdown anywhere in the dialog", async () => {
      renderSheet(SAMPLE_SCHEDULE);
      await screen.findByDisplayValue("Quarterly PM");

      expect(screen.getByText("pending")).toBeInTheDocument();
      // Only one combobox should exist in edit mode: none, since assignee/
      // type/project are all plain read-only inputs now, not Selects.
      expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    });

    it("renders 'Not started yet' / 'Not completed yet' when those fields are null", async () => {
      renderSheet(SAMPLE_SCHEDULE);
      expect(await screen.findByDisplayValue("Not started yet")).toBeDisabled();
      expect(await screen.findByDisplayValue("Not completed yet")).toBeDisabled();
    });

    it("renders formatted started_at/completed_at timestamps when present", async () => {
      const inProgress = {
        ...SAMPLE_SCHEDULE,
        status: "in_progress" as const,
        started_at: "2026-08-01T10:30:00.000Z",
      };
      renderSheet(inProgress);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.queryByDisplayValue("Not started yet")).not.toBeInTheDocument();
      expect(await screen.findByDisplayValue("Not completed yet")).toBeDisabled();
    });

    it("shows 'Cancelled after starting' only for cancelled + a non-null started_at", async () => {
      const cancelledAfterStart = {
        ...SAMPLE_SCHEDULE,
        status: "cancelled" as const,
        started_at: "2026-08-01T10:30:00.000Z",
      };
      renderSheet(cancelledAfterStart);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.getByText("Cancelled after starting")).toBeInTheDocument();
    });

    it("does not show 'Cancelled after starting' for cancelled without a started_at", async () => {
      const cancelledNeverStarted = { ...SAMPLE_SCHEDULE, status: "cancelled" as const };
      renderSheet(cancelledNeverStarted);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.queryByText("Cancelled after starting")).not.toBeInTheDocument();
    });

    it("does not show 'Cancelled after starting' for a non-cancelled status even with started_at set", async () => {
      const inProgress = {
        ...SAMPLE_SCHEDULE,
        status: "in_progress" as const,
        started_at: "2026-08-01T10:30:00.000Z",
      };
      renderSheet(inProgress);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.queryByText("Cancelled after starting")).not.toBeInTheDocument();
    });

    it("shows the conflict UI (not a generic error) on a stale-write 409, and does not lose the user's notes edit", async () => {
      patchMock.mockResolvedValueOnce(
        apiError(409, "CONFLICT", "Schedule was modified by someone else; refresh and try again")
      );
      renderSheet(SAMPLE_SCHEDULE);

      await screen.findByDisplayValue("Quarterly PM");
      fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: "my in-progress note" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(await screen.findByText("This record changed")).toBeInTheDocument();
      expect(
        screen.getByText("Schedule was modified by someone else; refresh and try again")
      ).toBeInTheDocument();
      expect(toastMock).not.toHaveBeenCalled();

      const freshSchedule = { ...SAMPLE_SCHEDULE, updated_at: "2026-01-03T00:00:00.000Z" };
      mockGetByPath({ schedule: ok(scheduleDetail(freshSchedule)) });
      patchMock.mockResolvedValueOnce(ok({ ...freshSchedule, notes: "my in-progress note" }));

      fireEvent.click(screen.getByRole("button", { name: /keep my changes/i }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
      const [, retryOptions] = patchMock.mock.calls[1];
      expect(retryOptions.body).toEqual({
        notes: "my in-progress note",
        updated_at: freshSchedule.updated_at,
      });
    });

    it("reload-latest clears the conflict and re-seeds notes/status/started_at/updated_at from the server", async () => {
      patchMock.mockResolvedValueOnce(apiError(409, "CONFLICT", "stale"));
      renderSheet(SAMPLE_SCHEDULE);

      await screen.findByDisplayValue("Quarterly PM");
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      expect(await screen.findByText("This record changed")).toBeInTheDocument();

      const freshSchedule = {
        ...SAMPLE_SCHEDULE,
        status: "in_progress" as const,
        started_at: "2026-01-04T00:00:00.000Z",
        notes: "someone else already started this",
        updated_at: "2026-01-05T00:00:00.000Z",
      };
      mockGetByPath({ schedule: ok(scheduleDetail(freshSchedule)) });

      fireEvent.click(screen.getByRole("button", { name: /reload latest/i }));

      await waitFor(() =>
        expect(screen.queryByText("This record changed")).not.toBeInTheDocument()
      );
      expect(await screen.findByDisplayValue("someone else already started this")).toBeInTheDocument();
      expect(screen.getByText("in progress")).toBeInTheDocument();
    });

    it("routes a non-409 update failure to a toast, not ConflictState", async () => {
      patchMock.mockResolvedValueOnce(apiError(400, "VALIDATION_ERROR", "Something else went wrong"));
      renderSheet(SAMPLE_SCHEDULE);

      await screen.findByDisplayValue("Quarterly PM");
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("This record changed")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith({
          title: "Couldn't update schedule",
          description: "Something else went wrong",
          variant: "destructive",
        });
      });
    });
  });

  describe("create mode (regression — unaffected by this ticket except for the new Server field)", () => {
    it("still offers title/type/date/assignee/project as editable inputs, with no status/started/completed fields at all", async () => {
      renderSheet(undefined);

      expect(screen.getByLabelText("Title")).not.toBeDisabled();
      expect(screen.getByLabelText("Date")).not.toBeDisabled();
      expect(screen.queryByText("Started")).not.toBeInTheDocument();
      expect(screen.queryByText("Completed")).not.toBeInTheDocument();
    });

    // Task 0 flagged the previous lookups here — .at(-1) for Server,
    // .find(textContent === "None") for Project (which BOTH pickers render,
    // so it only worked because Project happens to come first), and
    // .find(textContent === "Select person") for the assignee — as fragile:
    // two of them fail by silently selecting the wrong control rather than
    // throwing. All three now resolve by accessible name off the visible
    // <Label htmlFor>, which is stable under reordering and placeholder
    // copy changes alike.
    const assigneeCombobox = () => screen.getByRole("combobox", { name: "Assigned to" });
    const projectCombobox = () => screen.getByRole("combobox", { name: "Project" });
    const serverCombobox = () => screen.getByRole("combobox", { name: "Server" });

    function selectAssignee() {
      fireEvent.click(assigneeCombobox());
      return screen.findByRole("option", { name: "Alex Rivera" });
    }

    function fillRequiredFields() {
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New PM visit" } });
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
    }

    it("POSTs the create payload with no status field, and server_id undefined, when only a project is selected", async () => {
      postMock.mockResolvedValue(ok({ ...SAMPLE_SCHEDULE, id: "s2" }));
      const { onOpenChange } = renderSheet(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());

      fireEvent.click(projectCombobox());
      fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

      expect(postMock).toHaveBeenCalledTimes(1);
      const [path, options] = postMock.mock.calls[0];
      expect(path).toBe("/api/schedules");
      expect(options.body).toEqual({
        title: "New PM visit",
        type: "PM",
        scheduled_date: "2026-10-01",
        assigned_to: "person-1",
        project_id: "p1",
        server_id: undefined,
        notes: undefined,
      });
      expect(options.body.status).toBeUndefined();
      expect(toastMock).toHaveBeenCalledWith({ title: "Schedule created" });
    });

    it("submits with a server selected and no project (server-only linkage)", async () => {
      postMock.mockResolvedValue(ok({ ...SAMPLE_SCHEDULE, id: "s3" }));
      const { onOpenChange } = renderSheet(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());

      fireEvent.click(serverCombobox());
      fireEvent.click(await screen.findByRole("option", { name: "web-01" }));

      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

      expect(postMock).toHaveBeenCalledTimes(1);
      const [, options] = postMock.mock.calls[0];
      expect(options.body).toMatchObject({ project_id: undefined, server_id: "srv-1" });
    });

    it("submits with both a project and a server selected", async () => {
      postMock.mockResolvedValue(ok({ ...SAMPLE_SCHEDULE, id: "s4" }));
      const { onOpenChange } = renderSheet(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());

      fireEvent.click(projectCombobox());
      fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

      fireEvent.click(serverCombobox());
      fireEvent.click(await screen.findByRole("option", { name: "web-01" }));

      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

      expect(postMock).toHaveBeenCalledTimes(1);
      const [, options] = postMock.mock.calls[0];
      expect(options.body).toMatchObject({ project_id: "p1", server_id: "srv-1" });
    });

    it("blocks submit with a clear validation message when neither project nor server is selected", async () => {
      renderSheet(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(await screen.findByText("Select a Project, a Server, or both.")).toBeInTheDocument();
      expect(postMock).not.toHaveBeenCalled();
    });

    it("announces the parent error as an alert and links it to the Server picker", async () => {
      renderSheet(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      // role="alert" rather than a bare aria-live region: the message appears
      // only in response to a submit the user just made, which is exactly the
      // assertive case, and it can sit below the fold in a scrolling sheet.
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Select a Project, a Server, or both.");

      // The message belongs to the Project/Server pair; it is wired to the
      // Server picker, under which it renders.
      const describedBy = serverCombobox().getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)).toBe(alert);
    });

    it("focuses the Server picker when the parent check fails", async () => {
      renderSheet(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());

      // Radix restores focus to a Select's trigger on close via a
      // setTimeout(0). Submitting in the same tick would let that restore
      // fire *after* the submit's own focus call and steal it back — an
      // artifact of firing both together, which two real user gestures
      // cannot do. Wait for it to land so this asserts the component.
      await waitFor(() => expect(assigneeCombobox()).toHaveFocus());

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await screen.findByText("Select a Project, a Server, or both.");
      expect(serverCombobox()).toHaveFocus();
    });

    it("carries no aria-describedby on the Server picker before a failed submit", async () => {
      renderSheet(undefined);
      await screen.findByLabelText("Title");

      expect(serverCombobox()).not.toHaveAttribute("aria-describedby");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("accepts a date through the native date input inside the sheet", async () => {
      renderSheet(undefined);

      const date = screen.getByLabelText("Date");
      expect(date).toHaveAttribute("type", "date");
      fireEvent.change(date, { target: { value: "2026-12-24" } });
      expect(date).toHaveValue("2026-12-24");
    });

    it("scopes the Server picker to the selected Project's servers, excluding servers under unrelated projects", async () => {
      renderSheet(undefined);

      fireEvent.click(projectCombobox());
      fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

      fireEvent.click(serverCombobox());

      expect(await screen.findByRole("option", { name: "web-01" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "unrelated-server" })).not.toBeInTheDocument();
    });

    it("clears an already-selected Server when the Project changes", async () => {
      renderSheet(undefined);

      // Select the server first, while unscoped.
      fireEvent.click(serverCombobox());
      fireEvent.click(await screen.findByRole("option", { name: "unrelated-server" }));
      // A hidden native <select> mirror also contains this text, so scope
      // the check to the visible trigger's own textContent rather than a
      // global text query.
      await waitFor(() => expect(serverCombobox().textContent).toBe("unrelated-server"));

      // Now select a project — the previously-selected server should clear.
      fireEvent.click(projectCombobox());
      fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

      await waitFor(() => expect(serverCombobox().textContent).not.toBe("unrelated-server"));
    });
  });

  // Per-field validation, added alongside the cross-field Project/Server
  // rule that already existed (and which now lives in the same fieldErrors
  // object rather than in its own banner — see the create-mode block above
  // for its aria/focus coverage).
  describe("validation", () => {
    const assigneeCombobox = () => screen.getByRole("combobox", { name: "Assigned to" });
    const projectCombobox = () => screen.getByRole("combobox", { name: "Project" });
    const serverCombobox = () => screen.getByRole("combobox", { name: "Server" });
    const save = () => screen.getByRole("button", { name: /save/i });

    /**
     * Radix restores focus to a Select's trigger on close via a
     * setTimeout(0). Submitting in the same tick would let that restore fire
     * *after* the submit's own focus call and steal it back — an artifact of
     * firing both together, which two real user gestures cannot do.
     */
    async function pick(combobox: HTMLElement, optionName: string) {
      fireEvent.click(combobox);
      fireEvent.click(await screen.findByRole("option", { name: optionName }));
      await waitFor(() => expect(combobox).toHaveFocus());
    }

    /** One character over the limit — the smallest value that must fail. */
    const TOO_LONG_NOTES = "n".repeat(SCHEDULE_NOTES_MAX_LENGTH + 1);
    const NOTES_ERROR = `Notes must be ${SCHEDULE_NOTES_MAX_LENGTH} characters or less.`;

    describe("create mode", () => {
      // `type` has a required rule in the component but deliberately no test
      // here: the Type select is seeded to "PM" and offers no empty option,
      // so there is no interaction that can empty it. The rule exists so the
      // requirement is stated in one place if a placeholder is ever added.

      it("blocks submit and shows 'Title is required.' on an empty title", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
        await pick(assigneeCombobox(), "Alex Rivera");
        await pick(projectCombobox(), "Migration");

        fireEvent.click(save());

        expect(await screen.findByText("Title is required.")).toBeInTheDocument();
        expect(postMock).not.toHaveBeenCalled();
      });

      it("blocks submit and shows 'Date is required.' on an empty date", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New PM visit" } });
        await pick(assigneeCombobox(), "Alex Rivera");
        await pick(projectCombobox(), "Migration");

        fireEvent.click(save());

        expect(await screen.findByText("Date is required.")).toBeInTheDocument();
        expect(postMock).not.toHaveBeenCalled();
      });

      it("blocks submit and shows 'Assignee is required.' when no assignee is chosen", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New PM visit" } });
        fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
        await pick(projectCombobox(), "Migration");

        // Save used to be disabled outright on a missing assignee, which
        // blocked submit with no explanation at all. It is now enabled, and
        // submitting is what surfaces the message.
        expect(save()).not.toBeDisabled();
        fireEvent.click(save());

        expect(await screen.findByText("Assignee is required.")).toBeInTheDocument();
        expect(postMock).not.toHaveBeenCalled();
      });

      it("blocks submit on over-length notes and leaves an at-the-limit value alone", async () => {
        postMock.mockResolvedValue(ok({ ...SAMPLE_SCHEDULE, id: "s5" }));
        const { onOpenChange } = renderSheet(undefined);
        await screen.findByLabelText("Title");

        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New PM visit" } });
        fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
        await pick(assigneeCombobox(), "Alex Rivera");
        await pick(projectCombobox(), "Migration");

        const notes = screen.getByLabelText(/Notes/i);
        fireEvent.change(notes, { target: { value: TOO_LONG_NOTES } });
        fireEvent.click(save());

        expect(await screen.findByText(NOTES_ERROR)).toBeInTheDocument();
        expect(postMock).not.toHaveBeenCalled();

        // Exactly at the limit is valid — the boundary is inclusive.
        const atLimit = "n".repeat(SCHEDULE_NOTES_MAX_LENGTH);
        fireEvent.change(notes, { target: { value: atLimit } });
        fireEvent.click(save());

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(postMock).toHaveBeenCalledTimes(1);
        expect(postMock.mock.calls[0][1].body.notes).toBe(atLimit);
      });

      it("wires each field error to its own control via aria-invalid/aria-describedby", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        fireEvent.click(save());

        const title = await screen.findByLabelText("Title");
        expect(title).toHaveAttribute("aria-invalid", "true");
        expect(document.getElementById(title.getAttribute("aria-describedby") as string))
          .toHaveTextContent("Title is required.");

        const date = screen.getByLabelText("Date");
        expect(date).toHaveAttribute("aria-invalid", "true");
        expect(document.getElementById(date.getAttribute("aria-describedby") as string))
          .toHaveTextContent("Date is required.");

        expect(assigneeCombobox()).toHaveAttribute("aria-invalid", "true");
        expect(
          document.getElementById(assigneeCombobox().getAttribute("aria-describedby") as string)
        ).toHaveTextContent("Assignee is required.");
      });

      it("marks BOTH pickers invalid and points both at the single message under the Server picker", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        fireEvent.click(save());

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Select a Project, a Server, or both.");
        // The message belongs to the pair, so it is the describedby target
        // of both controls even though it renders under only one of them.
        expect(alert).toHaveAttribute("id", "server-error");
        expect(projectCombobox()).toHaveAttribute("aria-invalid", "true");
        expect(projectCombobox()).toHaveAttribute("aria-describedby", "server-error");
        expect(serverCombobox()).toHaveAttribute("aria-invalid", "true");
        expect(serverCombobox()).toHaveAttribute("aria-describedby", "server-error");
        // Exactly one message for the pair — not one under each picker.
        expect(screen.getAllByText("Select a Project, a Server, or both.")).toHaveLength(1);
      });

      it("focuses the first invalid field in FIELD_DOM_ORDER_CREATE, not merely the first rule that failed", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        // Everything is invalid: title, date, assignee and the parent pair.
        fireEvent.click(save());
        await screen.findByText("Title is required.");
        expect(screen.getByLabelText("Title")).toHaveFocus();
      });

      it("focuses Assigned to once title and date are filled", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New PM visit" } });
        fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });

        fireEvent.click(save());
        await screen.findByText("Assignee is required.");
        expect(assigneeCombobox()).toHaveFocus();
      });

      it("focuses Notes last — only once every field above it is valid", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New PM visit" } });
        fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
        await pick(assigneeCombobox(), "Alex Rivera");
        await pick(projectCombobox(), "Migration");
        fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: TOO_LONG_NOTES } });

        fireEvent.click(save());
        await screen.findByText(NOTES_ERROR);
        expect(screen.getByLabelText(/Notes/i)).toHaveFocus();
      });

      it("shows no field errors and no invalid controls before the first submit", async () => {
        renderSheet(undefined);
        await screen.findByLabelText("Title");

        expect(screen.getByLabelText("Title")).not.toHaveAttribute("aria-invalid", "true");
        expect(screen.getByLabelText("Date")).not.toHaveAttribute("aria-invalid", "true");
        expect(assigneeCombobox()).not.toHaveAttribute("aria-invalid", "true");
        expect(projectCombobox()).not.toHaveAttribute("aria-invalid", "true");
        expect(serverCombobox()).not.toHaveAttribute("aria-invalid", "true");
        expect(screen.getByLabelText(/Notes/i)).not.toHaveAttribute("aria-invalid", "true");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
    });

    describe("edit mode", () => {
      it("blocks the PATCH, shows the notes error and focuses Notes on an over-length value", async () => {
        renderSheet(SAMPLE_SCHEDULE);
        await screen.findByDisplayValue("Quarterly PM");

        const notes = screen.getByLabelText(/Notes/i);
        fireEvent.change(notes, { target: { value: TOO_LONG_NOTES } });
        fireEvent.click(save());

        expect(await screen.findByText(NOTES_ERROR)).toBeInTheDocument();
        expect(notes).toHaveAttribute("aria-invalid", "true");
        expect(document.getElementById(notes.getAttribute("aria-describedby") as string))
          .toHaveTextContent(NOTES_ERROR);
        expect(notes).toHaveFocus();
        expect(patchMock).not.toHaveBeenCalled();
      });

      it("validates notes ONLY — the read-only fields are never marked invalid", async () => {
        renderSheet(SAMPLE_SCHEDULE);
        await screen.findByDisplayValue("Quarterly PM");

        fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: TOO_LONG_NOTES } });
        fireEvent.click(save());
        await screen.findByText(NOTES_ERROR);

        // The immutable fields have no rule, no error text and no invalid
        // state — a user cannot act on an error they cannot fix.
        for (const label of ["Title", "Type", "Date", "Assigned to", "Project"]) {
          expect(screen.getByLabelText(label)).not.toHaveAttribute("aria-invalid", "true");
        }
        expect(screen.queryByText("Title is required.")).not.toBeInTheDocument();
        expect(screen.queryByText("Date is required.")).not.toBeInTheDocument();
        expect(screen.queryByText("Assignee is required.")).not.toBeInTheDocument();
        // No cross-field rule in edit mode either, even though this schedule
        // is project-linked with no server.
        expect(screen.queryByText("Select a Project, a Server, or both.")).not.toBeInTheDocument();
      });

      it("clears the notes error and PATCHes once the value is brought back under the limit", async () => {
        patchMock.mockResolvedValue(ok({ ...SAMPLE_SCHEDULE, notes: "short again" }));
        const { onOpenChange } = renderSheet(SAMPLE_SCHEDULE);
        await screen.findByDisplayValue("Quarterly PM");

        const notes = screen.getByLabelText(/Notes/i);
        fireEvent.change(notes, { target: { value: TOO_LONG_NOTES } });
        fireEvent.click(save());
        await screen.findByText(NOTES_ERROR);

        fireEvent.change(notes, { target: { value: "short again" } });
        fireEvent.click(save());

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(screen.queryByText(NOTES_ERROR)).not.toBeInTheDocument();
        expect(patchMock).toHaveBeenCalledTimes(1);
        expect(patchMock.mock.calls[0][1].body.notes).toBe("short again");
      });
    });

    // Regression guard for the one explicit non-goal of the validation work:
    // the 409 branch swaps out the whole form, so validation must be
    // unreachable there and ConflictState's own actions must be untouched.
    describe("ConflictState is untouched by validation", () => {
      it("renders no form controls or field errors while the conflict is showing, and keeps its own two actions", async () => {
        patchMock.mockResolvedValueOnce(apiError(409, "CONFLICT", "stale"));
        renderSheet(SAMPLE_SCHEDULE);

        await screen.findByDisplayValue("Quarterly PM");
        fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: "in-progress note" } });
        fireEvent.click(save());

        expect(await screen.findByText("This record changed")).toBeInTheDocument();
        // The form (and therefore every validated control) is gone, so the
        // validation system has nothing to act on in this branch.
        expect(screen.queryByLabelText(/Notes/i)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
        expect(screen.queryByText(NOTES_ERROR)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /reload latest/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /keep my changes/i })).toBeInTheDocument();
      });

      it("does not run notes validation on the keep-my-changes retry", async () => {
        // An over-length value can only reach the retry if it got past the
        // first submit, which it cannot — so this asserts the retry path is
        // the plain, unvalidated PATCH it has always been.
        patchMock.mockResolvedValueOnce(apiError(409, "CONFLICT", "stale"));
        renderSheet(SAMPLE_SCHEDULE);

        await screen.findByDisplayValue("Quarterly PM");
        fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: "kept note" } });
        fireEvent.click(save());
        await screen.findByText("This record changed");

        const fresh = { ...SAMPLE_SCHEDULE, updated_at: "2026-02-02T00:00:00.000Z" };
        mockGetByPath({ schedule: ok(scheduleDetail(fresh)) });
        patchMock.mockResolvedValueOnce(ok({ ...fresh, notes: "kept note" }));

        fireEvent.click(screen.getByRole("button", { name: /keep my changes/i }));

        await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
        expect(patchMock.mock.calls[1][1].body).toEqual({
          notes: "kept note",
          updated_at: fresh.updated_at,
        });
        expect(toastMock).toHaveBeenCalledWith({ title: "Schedule updated" });
      });
    });
  });
});
