import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateSchedule,
  useDeleteSchedule,
  useRestoreSchedule,
  useSchedules,
  useUpdateSchedule,
  type UpdateScheduleInput,
} from "./useSchedules";

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      GET: (...args: unknown[]) => getMock(...args),
      POST: (...args: unknown[]) => postMock(...args),
      PATCH: (...args: unknown[]) => patchMock(...args),
      DELETE: (...args: unknown[]) => deleteMock(...args),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const SAMPLE_SCHEDULE = {
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
  is_overdue: false,
};

function okResponse<T>(data: T, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function listResponse(data: typeof SAMPLE_SCHEDULE[] = []) {
  return okResponse({ data, pagination: { page: 1, per_page: 20, total: data.length, total_pages: 1 } });
}

describe("useSchedules", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    getMock.mockResolvedValue(listResponse());
  });

  it("sends only the params GET /schedules actually supports, defaulting deleted to false", async () => {
    const { result } = renderHook(
      () =>
        useSchedules({
          projectId: "p1",
          status: "pending",
          from: "2026-01-01",
          to: "2026-12-31",
          page: 2,
          per_page: 50,
          sort: "scheduled_date",
          order: "desc",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [path, options] = getMock.mock.calls[0];
    expect(path).toBe("/api/schedules");
    expect(options.params.query).toEqual({
      page: 2,
      per_page: 50,
      sort: "scheduled_date",
      order: "desc",
      project_id: "p1",
      status: "pending",
      from: "2026-01-01",
      to: "2026-12-31",
      deleted: "false",
    });
  });

  it("sends deleted=false and no other query params when called with only status (current SchedulePage usage)", async () => {
    const { result } = renderHook(() => useSchedules({ status: "pending" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = getMock.mock.calls[0];
    expect(options.params.query).toEqual({
      page: undefined,
      per_page: undefined,
      sort: undefined,
      order: undefined,
      project_id: undefined,
      status: "pending",
      from: undefined,
      to: undefined,
      deleted: "false",
    });
  });

  it("exposes `data` as a flat ScheduleListItem[] (including server-computed is_overdue) and pagination as a sibling field", async () => {
    getMock.mockResolvedValue(listResponse([SAMPLE_SCHEDULE]));

    const { result } = renderHook(() => useSchedules(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([SAMPLE_SCHEDULE]);
    expect(result.current.data?.[0].is_overdue).toBe(false);
    expect(result.current.pagination).toEqual({ page: 1, per_page: 20, total: 1, total_pages: 1 });
  });

  it("useCreateSchedule posts exactly the create-schema fields, with no status field sent", async () => {
    postMock.mockResolvedValue(okResponse(SAMPLE_SCHEDULE, 201));
    const { result } = renderHook(() => useCreateSchedule(), { wrapper });

    result.current.mutate({
      project_id: "p1",
      title: "Quarterly PM",
      type: "PM",
      scheduled_date: "2026-09-01",
      assigned_to: "person-1",
      notes: "bring spare parts",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/schedules");
    expect(options.body).toEqual({
      project_id: "p1",
      title: "Quarterly PM",
      type: "PM",
      scheduled_date: "2026-09-01",
      assigned_to: "person-1",
      notes: "bring spare parts",
    });
    expect(options.body.status).toBeUndefined();
  });

  it("useCreateSchedule allows project_id and server_id to both be set (CHECK constraint is OR, not XOR)", async () => {
    postMock.mockResolvedValue(okResponse(SAMPLE_SCHEDULE, 201));
    const { result } = renderHook(() => useCreateSchedule(), { wrapper });

    result.current.mutate({
      project_id: "p1",
      server_id: "srv1",
      title: "Quarterly PM",
      type: "PM",
      scheduled_date: "2026-09-01",
      assigned_to: "person-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = postMock.mock.calls[0];
    expect(options.body.project_id).toBe("p1");
    expect(options.body.server_id).toBe("srv1");
  });

  it("useUpdateSchedule PATCHes with only status/notes/updated_at — no other field is expressible at the type level", async () => {
    patchMock.mockResolvedValue(okResponse({ ...SAMPLE_SCHEDULE, status: "in_progress" }));
    const { result } = renderHook(() => useUpdateSchedule(), { wrapper });

    result.current.mutate({
      id: "s1",
      data: { status: "in_progress", notes: "started work", updated_at: "2026-01-01T00:00:00.000Z" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(patchMock).toHaveBeenCalledTimes(1);
    const [path, options] = patchMock.mock.calls[0];
    expect(path).toBe("/api/schedules/{id}");
    expect(options.params.path).toEqual({ id: "s1" });
    expect(options.body).toEqual({
      status: "in_progress",
      notes: "started work",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("useUpdateSchedule works for a notes-only PATCH with no status change (still requires updated_at)", async () => {
    patchMock.mockResolvedValue(okResponse(SAMPLE_SCHEDULE));
    const { result } = renderHook(() => useUpdateSchedule(), { wrapper });

    result.current.mutate({
      id: "s1",
      data: { notes: "rescheduled onsite visit", updated_at: "2026-01-01T00:00:00.000Z" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = patchMock.mock.calls[0];
    expect(options.body).toEqual({ notes: "rescheduled onsite visit", updated_at: "2026-01-01T00:00:00.000Z" });
  });

  // Type-level check only, enforced by tsc (not a runtime assertion): each
  // expect-error directive below is itself the test — if any of these
  // fields became assignable to UpdateScheduleInput, the missing type error
  // would fail `tsc --noEmit`. This proves title/type/scheduled_date/
  // assigned_to/project_id/server_id/started_at/completed_at are genuinely
  // absent from the update type, matching the backend's updateScheduleSchema
  // (no such keys at all) and the controller's AUTO_FIELDS pre-rejection.
  it("documents at compile time that non-status/notes fields cannot be sent on update", () => {
    const base = { updated_at: "2026-01-01T00:00:00.000Z" };

    // @ts-expect-error title is not part of UpdateScheduleInput
    const withTitle: UpdateScheduleInput = { ...base, title: "x" };
    // @ts-expect-error type is not part of UpdateScheduleInput
    const withType: UpdateScheduleInput = { ...base, type: "PM" };
    // @ts-expect-error scheduled_date is not part of UpdateScheduleInput
    const withDate: UpdateScheduleInput = { ...base, scheduled_date: "2026-01-01" };
    // @ts-expect-error assigned_to is not part of UpdateScheduleInput
    const withAssignee: UpdateScheduleInput = { ...base, assigned_to: "person-1" };
    // @ts-expect-error project_id is not part of UpdateScheduleInput
    const withProject: UpdateScheduleInput = { ...base, project_id: "p1" };
    // @ts-expect-error server_id is not part of UpdateScheduleInput
    const withServer: UpdateScheduleInput = { ...base, server_id: "srv1" };
    // @ts-expect-error started_at is not part of UpdateScheduleInput
    const withStartedAt: UpdateScheduleInput = { ...base, started_at: "2026-01-01T00:00:00.000Z" };
    // @ts-expect-error completed_at is not part of UpdateScheduleInput
    const withCompletedAt: UpdateScheduleInput = { ...base, completed_at: "2026-01-01T00:00:00.000Z" };

    expect([
      withTitle,
      withType,
      withDate,
      withAssignee,
      withProject,
      withServer,
      withStartedAt,
      withCompletedAt,
    ]).toHaveLength(8);
  });

  it("useDeleteSchedule DELETEs by id", async () => {
    deleteMock.mockResolvedValue(okResponse({ ...SAMPLE_SCHEDULE, deleted_at: "2026-01-02T00:00:00.000Z" }));
    const { result } = renderHook(() => useDeleteSchedule(), { wrapper });

    result.current.mutate("s1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(deleteMock).toHaveBeenCalledTimes(1);
    const [path, options] = deleteMock.mock.calls[0];
    expect(path).toBe("/api/schedules/{id}");
    expect(options.params.path).toEqual({ id: "s1" });
  });

  it("useRestoreSchedule POSTs to the restore endpoint with no body (not an optimistic-lock conflict)", async () => {
    postMock.mockResolvedValue(okResponse({ ...SAMPLE_SCHEDULE, deleted_at: null }));
    const { result } = renderHook(() => useRestoreSchedule(), { wrapper });

    result.current.mutate("s1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, options] = postMock.mock.calls[0];
    expect(path).toBe("/api/schedules/{id}/restore");
    expect(options.params.path).toEqual({ id: "s1" });
  });
});
