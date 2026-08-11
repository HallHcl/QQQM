import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScheduleStatusActions from "./ScheduleStatusActions";
import type { Schedule } from "@/types";

const patchMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: { PATCH: (...args: unknown[]) => patchMock(...args) },
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

const BASE_SCHEDULE: Schedule = {
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

function renderActions(schedule: Schedule) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <ScheduleStatusActions schedule={schedule} />
    </QueryClientProvider>
  );
  return { invalidateSpy, unmount };
}

describe("ScheduleStatusActions", () => {
  beforeEach(() => {
    patchMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
  });

  describe("button set per status", () => {
    it("pending shows Start and Cancel", () => {
      renderActions({ ...BASE_SCHEDULE, status: "pending" });
      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("in_progress shows Complete and Cancel", () => {
      renderActions({ ...BASE_SCHEDULE, status: "in_progress" });
      expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    });

    it("done shows no transition buttons (terminal)", () => {
      const { container } = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ScheduleStatusActions schedule={{ ...BASE_SCHEDULE, status: "done" }} />
        </QueryClientProvider>
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("cancelled shows no transition buttons (terminal)", () => {
      const { container } = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ScheduleStatusActions schedule={{ ...BASE_SCHEDULE, status: "cancelled" }} />
        </QueryClientProvider>
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("RBAC", () => {
    it("shows buttons to an admin and a member", () => {
      useAuthMock.mockReturnValue({ roles: ["admin"], isLoading: false });
      const { unmount } = renderActions({ ...BASE_SCHEDULE, status: "pending" });
      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
      unmount();

      useAuthMock.mockReturnValue({ roles: ["member"], isLoading: false });
      renderActions({ ...BASE_SCHEDULE, status: "pending" });
      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    });

    it("hides buttons from a role with neither admin nor member", () => {
      useAuthMock.mockReturnValue({ roles: [], isLoading: false });
      renderActions({ ...BASE_SCHEDULE, status: "pending" });
      expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    });
  });

  describe("Start (pending -> in_progress)", () => {
    it("PATCHes {status: in_progress, updated_at} and invalidates schedules on success", async () => {
      patchMock.mockResolvedValue(ok({ ...BASE_SCHEDULE, status: "in_progress" }));
      const { invalidateSpy } = renderActions(BASE_SCHEDULE);

      fireEvent.click(screen.getByRole("button", { name: "Start" }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      const [path, options] = patchMock.mock.calls[0];
      expect(path).toBe("/api/schedules/{id}");
      expect(options.params.path).toEqual({ id: "s1" });
      expect(options.body).toEqual({ status: "in_progress", updated_at: "2026-01-01T00:00:00.000Z" });

      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["schedules"] }));
    });

    it("does not require a confirmation dialog (direct action)", async () => {
      patchMock.mockResolvedValue(ok({ ...BASE_SCHEDULE, status: "in_progress" }));
      renderActions(BASE_SCHEDULE);

      fireEvent.click(screen.getByRole("button", { name: "Start" }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("disables both buttons while the transition is in flight (double-click guard)", async () => {
      let resolvePatch: (value: unknown) => void = () => {};
      patchMock.mockReturnValue(new Promise((resolve) => (resolvePatch = resolve)));
      renderActions(BASE_SCHEDULE);

      fireEvent.click(screen.getByRole("button", { name: "Start" }));

      await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeDisabled());
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

      resolvePatch(ok({ ...BASE_SCHEDULE, status: "in_progress" }));
      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    });
  });

  describe("Complete (in_progress -> done)", () => {
    it("PATCHes {status: done, updated_at}", async () => {
      const schedule = { ...BASE_SCHEDULE, status: "in_progress" as const };
      patchMock.mockResolvedValue(ok({ ...schedule, status: "done" }));
      renderActions(schedule);

      fireEvent.click(screen.getByRole("button", { name: "Complete" }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      const [, options] = patchMock.mock.calls[0];
      expect(options.body).toEqual({ status: "done", updated_at: schedule.updated_at });
    });
  });

  describe("Cancel (terminal, one-directional — confirmed before firing)", () => {
    it("opens a confirmation before PATCHing, and does not PATCH until confirmed", async () => {
      renderActions(BASE_SCHEDULE);

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(await screen.findByText("Cancel this schedule?")).toBeInTheDocument();
      expect(patchMock).not.toHaveBeenCalled();
    });

    it("does not PATCH if the confirmation is dismissed", async () => {
      renderActions(BASE_SCHEDULE);

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      const dialog = screen.getByRole("dialog");
      // ConfirmDialog's own dismiss button is labeled "Cancel" (its default
      // cancelLabel) — distinct from this dialog's confirm button, labeled
      // "Cancel schedule".
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() =>
        expect(screen.queryByText("Cancel this schedule?")).not.toBeInTheDocument()
      );
      expect(patchMock).not.toHaveBeenCalled();
    });

    it("PATCHes {status: cancelled, updated_at} once confirmed", async () => {
      patchMock.mockResolvedValue(ok({ ...BASE_SCHEDULE, status: "cancelled" }));
      renderActions(BASE_SCHEDULE);

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel schedule" }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      const [, options] = patchMock.mock.calls[0];
      expect(options.body).toEqual({ status: "cancelled", updated_at: BASE_SCHEDULE.updated_at });
    });

    it("works the same from in_progress (cancelling after starting)", async () => {
      const schedule = { ...BASE_SCHEDULE, status: "in_progress" as const, started_at: "2026-08-01T00:00:00.000Z" };
      patchMock.mockResolvedValue(ok({ ...schedule, status: "cancelled" }));
      renderActions(schedule);

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel schedule" }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      const [, options] = patchMock.mock.calls[0];
      // started_at is never sent — the backend leaves it untouched on a
      // cancel transition regardless (Part 26d's "Cancelled after starting"
      // display relies on this).
      expect(options.body).toEqual({ status: "cancelled", updated_at: schedule.updated_at });
    });
  });

  describe("409 conflict handling", () => {
    it("on a stale-write 409, refetches the schedules list instead of opening ConflictState (no in-progress draft to preserve for a button click)", async () => {
      patchMock.mockResolvedValue(
        apiError(409, "CONFLICT", "Schedule was modified by someone else; refresh and try again")
      );
      const { invalidateSpy } = renderActions(BASE_SCHEDULE);

      fireEvent.click(screen.getByRole("button", { name: "Start" }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["schedules"] }));
      expect(screen.queryByText("This record changed")).not.toBeInTheDocument();
    });

    it("re-enables the buttons after a failed transition so the user can retry", async () => {
      patchMock.mockResolvedValue(apiError(409, "CONFLICT", "stale"));
      renderActions(BASE_SCHEDULE);

      fireEvent.click(screen.getByRole("button", { name: "Start" }));

      await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).not.toBeDisabled());
    });
  });
});
