import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScheduleFormDialog from "./ScheduleFormDialog";
import type { Schedule } from "@/types";

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

function renderDialog(schedule: Schedule | undefined = undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ScheduleFormDialog open onOpenChange={onOpenChange} schedule={schedule} />
    </QueryClientProvider>
  );
  return { onOpenChange, invalidateSpy };
}

describe("ScheduleFormDialog", () => {
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
      const { onOpenChange, invalidateSpy } = renderDialog(SAMPLE_SCHEDULE);

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
      renderDialog(SAMPLE_SCHEDULE);

      expect(await screen.findByDisplayValue("Quarterly PM")).toBeDisabled();
      expect(screen.getByDisplayValue("PM")).toBeDisabled();
      expect(screen.getByDisplayValue("Sep 1, 2026")).toBeDisabled();
      expect(await screen.findByDisplayValue("Alex Rivera")).toBeDisabled();
      expect(await screen.findByDisplayValue("Migration")).toBeDisabled();

      expect(screen.getByLabelText(/Notes/i)).not.toBeDisabled();
    });

    it("shows no server field when the schedule has no server_id", async () => {
      renderDialog(SAMPLE_SCHEDULE);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.queryByText("Server")).not.toBeInTheDocument();
    });

    it("shows the linked server's name read-only when server_id is set", async () => {
      const linked = { ...SAMPLE_SCHEDULE, server_id: "srv-1" };
      mockGetByPath({ schedule: ok(scheduleDetail({ server_id: "srv-1" })) });
      renderDialog(linked);

      expect(await screen.findByText("Server")).toBeInTheDocument();
      expect(await screen.findByDisplayValue("db-01")).toBeDisabled();
    });

    it("shows status as a read-only badge with no status dropdown anywhere in the dialog", async () => {
      renderDialog(SAMPLE_SCHEDULE);
      await screen.findByDisplayValue("Quarterly PM");

      expect(screen.getByText("pending")).toBeInTheDocument();
      // Only one combobox should exist in edit mode: none, since assignee/
      // type/project are all plain read-only inputs now, not Selects.
      expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    });

    it("renders 'Not started yet' / 'Not completed yet' when those fields are null", async () => {
      renderDialog(SAMPLE_SCHEDULE);
      expect(await screen.findByDisplayValue("Not started yet")).toBeDisabled();
      expect(await screen.findByDisplayValue("Not completed yet")).toBeDisabled();
    });

    it("renders formatted started_at/completed_at timestamps when present", async () => {
      const inProgress = {
        ...SAMPLE_SCHEDULE,
        status: "in_progress" as const,
        started_at: "2026-08-01T10:30:00.000Z",
      };
      renderDialog(inProgress);
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
      renderDialog(cancelledAfterStart);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.getByText("Cancelled after starting")).toBeInTheDocument();
    });

    it("does not show 'Cancelled after starting' for cancelled without a started_at", async () => {
      const cancelledNeverStarted = { ...SAMPLE_SCHEDULE, status: "cancelled" as const };
      renderDialog(cancelledNeverStarted);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.queryByText("Cancelled after starting")).not.toBeInTheDocument();
    });

    it("does not show 'Cancelled after starting' for a non-cancelled status even with started_at set", async () => {
      const inProgress = {
        ...SAMPLE_SCHEDULE,
        status: "in_progress" as const,
        started_at: "2026-08-01T10:30:00.000Z",
      };
      renderDialog(inProgress);
      await screen.findByDisplayValue("Quarterly PM");
      expect(screen.queryByText("Cancelled after starting")).not.toBeInTheDocument();
    });

    it("shows the conflict UI (not a generic error) on a stale-write 409, and does not lose the user's notes edit", async () => {
      patchMock.mockResolvedValueOnce(
        apiError(409, "CONFLICT", "Schedule was modified by someone else; refresh and try again")
      );
      renderDialog(SAMPLE_SCHEDULE);

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
      renderDialog(SAMPLE_SCHEDULE);

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
      renderDialog(SAMPLE_SCHEDULE);

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
      renderDialog(undefined);

      expect(screen.getByLabelText("Title")).not.toBeDisabled();
      expect(screen.getByLabelText("Date")).not.toBeDisabled();
      expect(screen.queryByText("Started")).not.toBeInTheDocument();
      expect(screen.queryByText("Completed")).not.toBeInTheDocument();
    });

    function selectAssignee() {
      const assigneeTrigger = screen
        .getAllByRole("combobox")
        .find((el) => el.textContent === "Select person");
      if (!assigneeTrigger) throw new Error("Assignee combobox not found");
      fireEvent.click(assigneeTrigger);
      return screen.findByRole("option", { name: "Alex Rivera" });
    }

    function fillRequiredFields() {
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New PM visit" } });
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-01" } });
    }

    it("POSTs the create payload with no status field, and server_id undefined, when only a project is selected", async () => {
      postMock.mockResolvedValue(ok({ ...SAMPLE_SCHEDULE, id: "s2" }));
      const { onOpenChange } = renderDialog(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());

      const projectCombobox = screen
        .getAllByRole("combobox")
        .find((el) => el.textContent === "None");
      if (!projectCombobox) throw new Error("Project combobox not found");
      fireEvent.click(projectCombobox);
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
      const { onOpenChange } = renderDialog(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());

      // Both Project and Server render "None" placeholders unscoped — the
      // Server picker is the last combobox in DOM order (Assigned to,
      // Project, Server).
      const serverCombobox = screen.getAllByRole("combobox").at(-1);
      if (!serverCombobox) throw new Error("Server combobox not found");
      fireEvent.click(serverCombobox);
      fireEvent.click(await screen.findByRole("option", { name: "web-01" }));

      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

      expect(postMock).toHaveBeenCalledTimes(1);
      const [, options] = postMock.mock.calls[0];
      expect(options.body).toMatchObject({ project_id: undefined, server_id: "srv-1" });
    });

    it("submits with both a project and a server selected", async () => {
      postMock.mockResolvedValue(ok({ ...SAMPLE_SCHEDULE, id: "s4" }));
      const { onOpenChange } = renderDialog(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());

      const projectCombobox = screen
        .getAllByRole("combobox")
        .find((el) => el.textContent === "None");
      if (!projectCombobox) throw new Error("Project combobox not found");
      fireEvent.click(projectCombobox);
      fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

      const serverCombobox = screen.getAllByRole("combobox").at(-1);
      if (!serverCombobox) throw new Error("Server combobox not found");
      fireEvent.click(serverCombobox);
      fireEvent.click(await screen.findByRole("option", { name: "web-01" }));

      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

      expect(postMock).toHaveBeenCalledTimes(1);
      const [, options] = postMock.mock.calls[0];
      expect(options.body).toMatchObject({ project_id: "p1", server_id: "srv-1" });
    });

    it("blocks submit with a clear validation message when neither project nor server is selected", async () => {
      renderDialog(undefined);

      fillRequiredFields();
      fireEvent.click(await selectAssignee());
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      expect(await screen.findByText("Select a Project, a Server, or both.")).toBeInTheDocument();
      expect(postMock).not.toHaveBeenCalled();
    });

    it("scopes the Server picker to the selected Project's servers, excluding servers under unrelated projects", async () => {
      renderDialog(undefined);

      const projectCombobox = screen
        .getAllByRole("combobox")
        .find((el) => el.textContent === "None");
      if (!projectCombobox) throw new Error("Project combobox not found");
      fireEvent.click(projectCombobox);
      fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

      const serverCombobox = screen.getAllByRole("combobox").at(-1);
      if (!serverCombobox) throw new Error("Server combobox not found");
      fireEvent.click(serverCombobox);

      expect(await screen.findByRole("option", { name: "web-01" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "unrelated-server" })).not.toBeInTheDocument();
    });

    it("clears an already-selected Server when the Project changes", async () => {
      renderDialog(undefined);

      // Select the server first, while unscoped.
      let serverCombobox = screen.getAllByRole("combobox").at(-1);
      if (!serverCombobox) throw new Error("Server combobox not found");
      fireEvent.click(serverCombobox);
      fireEvent.click(await screen.findByRole("option", { name: "unrelated-server" }));
      // A hidden native <select> mirror also contains this text, so scope
      // the check to the visible trigger's own textContent rather than a
      // global text query.
      await waitFor(() => expect(serverCombobox?.textContent).toBe("unrelated-server"));

      // Now select a project — the previously-selected server should clear.
      const projectCombobox = screen
        .getAllByRole("combobox")
        .find((el) => el.textContent === "None");
      if (!projectCombobox) throw new Error("Project combobox not found");
      fireEvent.click(projectCombobox);
      fireEvent.click(await screen.findByRole("option", { name: "Migration" }));

      serverCombobox = screen.getAllByRole("combobox").at(-1);
      await waitFor(() => expect(serverCombobox?.textContent).not.toBe("unrelated-server"));
    });
  });
});
