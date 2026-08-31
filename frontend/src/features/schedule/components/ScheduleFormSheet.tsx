import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { format } from "date-fns";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionalLabel } from "@/components/ui/optional-label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/components/ProjectPicker";
import { ServerPicker } from "@/components/ServerPicker";
import { ConflictState } from "@/components/state/ConflictState";
import { ApiError, apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePeople } from "@/hooks/usePeople";
import { useConflictResolution } from "@/hooks/useConflictResolution";
import { parseScheduledDate, useCreateSchedule, useSchedule, useUpdateSchedule } from "@/hooks/useSchedules";
import type { Schedule, ScheduleStatus, ScheduleType } from "@/types";

const SCHEDULE_TYPES: ScheduleType[] = ["PM", "MA", "other"];

/**
 * Upper bound on `notes`, mirroring the backend's SCHEDULE_NOTES_MAX_LENGTH
 * (schedules.validator.ts) with the identical message, so the user sees the
 * same text whether the client or the server rejects it. Exported so the
 * tests assert against the real limit rather than a copy of the number.
 */
export const SCHEDULE_NOTES_MAX_LENGTH = 2000;

/**
 * One key per validated field, plus `parent` for the Project/Server
 * cross-field rule, which belongs to the *pair* rather than to either
 * control. Same flat shape as ServerFormSheet's FieldErrors and
 * ResourceEditorSheet's FormFieldErrors.
 */
interface FieldErrors {
  title?: string;
  type?: string;
  scheduled_date?: string;
  assigned_to?: string;
  project_id?: string;
  server_id?: string;
  parent?: string;
  notes?: string;
}

/**
 * Fields in render order, for "focus the first invalid one". Create mode
 * only: edit mode has exactly one validated field (notes) and focuses it
 * directly, so it needs no order at all. `parent` maps to the Server picker
 * — the message renders beneath that control, so that is where focus goes.
 * project_id/server_id have no rule of their own today but keep their slots
 * so the order stays correct if one is ever added.
 */
const FIELD_DOM_ORDER_CREATE: ReadonlyArray<{ key: keyof FieldErrors; elementId: string }> = [
  { key: "title", elementId: "title" },
  { key: "type", elementId: "type" },
  { key: "scheduled_date", elementId: "date" },
  { key: "assigned_to", elementId: "assignedTo" },
  { key: "project_id", elementId: "project" },
  { key: "server_id", elementId: "server" },
  { key: "parent", elementId: "server" },
  { key: "notes", elementId: "notes" },
];

/** `aria-describedby` target for a field's error text. */
function errorId(elementId: string) {
  return `${elementId}-error`;
}

/** Danger underline on an invalid control — same token as the other two sheets. */
const INVALID_CONTROL = "shadow-underline-danger focus-visible:shadow-underline-danger";

/**
 * The only rule that applies in BOTH modes — notes is the sole editable
 * field in edit mode, and an optional one in create mode.
 */
function validateNotes(value: string): string | undefined {
  if (value.trim().length > SCHEDULE_NOTES_MAX_LENGTH) {
    return `Notes must be ${SCHEDULE_NOTES_MAX_LENGTH} characters or less.`;
  }
  return undefined;
}

const STATUS_VARIANT: Record<
  ScheduleStatus,
  "success" | "info" | "warning" | "neutral"
> = {
  done: "success",
  in_progress: "info",
  pending: "warning",
  cancelled: "neutral",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule;
}

export default function ScheduleFormSheet({ open, onOpenChange, schedule }: Props) {
  const isEdit = Boolean(schedule);
  const { data: people = [] } = usePeople();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  // In edit mode this also supplies the assignee/project/server display
  // names (ScheduleDetail inlines them) for the read-only fields below, not
  // just the 409 refetch — title/type/scheduled_date/assigned_to/project_id/
  // server_id are immutable after creation (PATCH has no fields for them),
  // so they're read straight off the stable `schedule` prop; only status/
  // notes/started_at/completed_at can change server-side and need refreshing.
  const { data: scheduleDetail, refetch: refetchSchedule } = useSchedule(schedule?.id);
  const { conflict: conflictInfo, isConflict, captureConflict, clearConflict } = useConflictResolution();

  // Create-only fields — this dialog offers no way to change any of these
  // after creation (the backend's updateScheduleSchema has no fields for
  // them at all), so edit mode never touches this state and reads straight
  // off `schedule` instead.
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ScheduleType>("PM");
  const [scheduledDate, setScheduledDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | undefined>(undefined);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [serverId, setServerId] = useState<string | undefined>(undefined);
  // Every client-side validation message lives here, including the
  // "at least one of Project/Server" cross-field rule (`parent`), which
  // mirrors the backend's CHECK constraint (chk_schedules_has_parent:
  // project_id IS NOT NULL OR server_id IS NOT NULL) — client-side so the
  // user gets a clear message instead of a 400. It used to be a standalone
  // banner; folding it in here keeps this sheet's error presentation
  // identical to ServerFormSheet's and ResourceEditorSheet's.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Read-only-in-this-dialog fields that CAN change server-side (via another
  // user's status transition) — tracked in state so a 409's "reload latest"/
  // "keep editing & retry" can refresh what's displayed, unlike the
  // create-only fields above which never change once set.
  const [status, setStatus] = useState<ScheduleStatus>("pending");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  // The only genuinely editable field in edit mode.
  const [notes, setNotes] = useState("");
  // Tracks the optimistic-lock stamp separately from `schedule.updated_at`
  // so "keep editing & retry" after a 409 can refresh just this value
  // without discarding the user's in-progress notes edit.
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (schedule) {
      setStatus(schedule.status);
      setStartedAt(schedule.started_at);
      setCompletedAt(schedule.completed_at);
      setNotes(schedule.notes ?? "");
      setUpdatedAt(schedule.updated_at);
    } else {
      setTitle("");
      setType("PM");
      setScheduledDate("");
      setAssignedTo(undefined);
      setProjectId(undefined);
      setServerId(undefined);
      setNotes("");
      setUpdatedAt(undefined);
    }
    setFieldErrors({});
    clearConflict();
  }, [schedule, open, clearConflict]);

  /**
   * Moves focus to the first invalid control in render order. The elements
   * already exist when this runs, so it does not wait for the re-render
   * that paints the error state. Create mode only — see FIELD_DOM_ORDER_CREATE.
   */
  function focusFirstInvalid(errors: FieldErrors) {
    const first = FIELD_DOM_ORDER_CREATE.find(({ key }) => errors[key]);
    if (!first) return;
    document.getElementById(first.elementId)?.focus();
  }

  // Servers under a project are computed client-side (environment_id
  // intersection — see ServerPicker), so re-validating "is the currently
  // selected server still under the new project" here would mean
  // duplicating that fetch/filter logic in the parent just to check
  // membership. Simplest safe behavior: any project change clears the
  // server selection outright, whether or not it would still have been
  // valid — the user can just pick it again if the project change was
  // incidental. There's no existing cross-field reset precedent in the
  // other create forms to follow here (Client/Environment/Server forms only
  // reset state on dialog close, not on a sibling field changing), so this
  // is a fresh call for Schedule specifically.
  function handleProjectChange(next: string | undefined) {
    setProjectId(next);
    setServerId(undefined);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Validation runs only on this branch. The 409 path renders
    // ConflictState instead of the <form>, so this handler is unreachable
    // there and the two systems never interact.
    if (schedule) {
      // Edit mode validates notes and nothing else: it is the only editable
      // field. The rest are disabled/readOnly inputs that already carry
      // their own <Label htmlFor>, and wiring them into fieldErrors would
      // claim a user could fix something they cannot change.
      const notesError = validateNotes(notes);
      if (notesError) {
        setFieldErrors({ notes: notesError });
        document.getElementById("notes")?.focus();
        return;
      }
      setFieldErrors({});
    } else {
      const nextErrors: FieldErrors = {};
      if (!title.trim()) nextErrors.title = "Title is required.";
      // Defensive: `type` is a Select seeded to "PM" with no empty option,
      // so this cannot fire today. It is here so the rule is stated in one
      // place if a placeholder is ever added.
      if (!type) nextErrors.type = "Type is required.";
      if (!scheduledDate) nextErrors.scheduled_date = "Date is required.";
      if (!assignedTo) nextErrors.assigned_to = "Assignee is required.";
      if (!projectId && !serverId) {
        nextErrors.parent = "Select a Project, a Server, or both.";
      }
      const notesError = validateNotes(notes);
      if (notesError) nextErrors.notes = notesError;

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        focusFirstInvalid(nextErrors);
        return;
      }
      setFieldErrors({});
    }

    try {
      if (schedule) {
        // notes is the only field this dialog can change; status transitions
        // are handled by the dedicated action buttons in ScheduleStatusActions.tsx
        // (rendered in ScheduleList.tsx, not here) and every other field is
        // immutable after creation. updated_at is still required for the
        // optimistic lock even though status isn't part of this write.
        await updateSchedule.mutateAsync({
          id: schedule.id,
          data: { notes: notes || undefined, updated_at: updatedAt ?? schedule.updated_at },
        });
      } else {
        // Narrowing only — the required-field pass above already rejected
        // an empty assignee with a visible error.
        if (!assignedTo) return;
        await createSchedule.mutateAsync({
          title,
          type,
          scheduled_date: scheduledDate,
          assigned_to: assignedTo,
          project_id: projectId,
          server_id: serverId,
          notes: notes || undefined,
        });
      }

      toast({ title: schedule ? "Schedule updated" : "Schedule created" });
      onOpenChange(false);
    } catch (err) {
      // A stale-write 409 goes to the conflict primitive; everything else
      // surfaces as a toast (this dialog has no per-field error UI for
      // notes today).
      if (err instanceof ApiError && captureConflict(err)) return;
      toast({
        title: schedule ? "Couldn't update schedule" : "Couldn't create schedule",
        description: apiErrorMessage(err),
        variant: "destructive",
      });
    }
  }

  async function handleReloadLatest() {
    const result = await refetchSchedule();
    if (result.data) {
      setStatus(result.data.status);
      setStartedAt(result.data.started_at);
      setCompletedAt(result.data.completed_at);
      setNotes(result.data.notes ?? "");
      setUpdatedAt(result.data.updated_at);
    }
    clearConflict();
  }

  async function handleKeepEditingAndRetry() {
    const result = await refetchSchedule();
    if (!result.data || !schedule) return;

    // Status/started_at/completed_at may have changed server-side too (e.g.
    // someone else transitioned it while this dialog was open) — refresh
    // the read-only display alongside the lock stamp, but leave the user's
    // in-progress notes edit untouched.
    const freshUpdatedAt = result.data.updated_at;
    setStatus(result.data.status);
    setStartedAt(result.data.started_at);
    setCompletedAt(result.data.completed_at);
    setUpdatedAt(freshUpdatedAt);
    clearConflict();

    try {
      await updateSchedule.mutateAsync({
        id: schedule.id,
        data: { notes: notes || undefined, updated_at: freshUpdatedAt },
      });
      toast({ title: "Schedule updated" });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && captureConflict(err)) return;
      toast({
        title: "Couldn't update schedule",
        description: apiErrorMessage(err),
        variant: "destructive",
      });
    }
  }

  const isSubmitting = createSchedule.isPending || updateSchedule.isPending;

  const assigneeName = isEdit
    ? (scheduleDetail?.assigned_to_person?.name ?? people.find((p) => p.id === schedule?.assigned_to)?.name ?? "—")
    : undefined;
  const projectName = isEdit
    ? (schedule?.project_id ? (scheduleDetail?.project?.name ?? "—") : "—")
    : undefined;
  const serverName = isEdit && schedule?.server_id ? (scheduleDetail?.server?.name ?? "—") : undefined;
  const cancelledAfterStarting = status === "cancelled" && Boolean(startedAt);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="form" className="p-0">
        {/*
          The 409 branch swaps out the body AND the footer, exactly as the
          dialog did — a Save button over a form that is not rendered would
          be inert, and ConflictState carries its own actions. Only the
          header survives, so the sheet keeps a title and an accessible name.
          Both branches render their own SheetHeader rather than hoisting it
          above the ternary, because the form branch needs it *inside* the
          <form> flex column for the sticky layout to work.
        */}
        {isConflict ? (
          <>
            <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
              <SheetTitle>{isEdit ? "Edit schedule" : "New schedule"}</SheetTitle>
              <SheetDescription className="sr-only">
                {isEdit
                  ? "Update this schedule's notes. Every other field is fixed after creation."
                  : "Schedule a new visit against a project, a server, or both."}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <ConflictState
                message={
                  conflictInfo?.message ??
                  "This record was changed by someone else since you loaded it."
                }
                onReloadLatest={handleReloadLatest}
                onKeepEditing={handleKeepEditingAndRetry}
              />
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
            <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
              <SheetTitle>{isEdit ? "Edit schedule" : "New schedule"}</SheetTitle>
              <SheetDescription className="sr-only">
                {isEdit
                  ? "Update this schedule's notes. Every other field is fixed after creation."
                  : "Schedule a new visit against a project, a server, or both."}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-1">
                <Label htmlFor="title">Title</Label>
                {isEdit ? (
                  <Input id="title" value={schedule?.title ?? ""} disabled readOnly />
                ) : (
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    aria-invalid={!!fieldErrors.title}
                    aria-describedby={fieldErrors.title ? errorId("title") : undefined}
                    className={cn(fieldErrors.title && INVALID_CONTROL)}
                  />
                )}
                {!isEdit && fieldErrors.title && (
                  <p id={errorId("title")} className="text-xs text-danger">
                    {fieldErrors.title}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="type">Type</Label>
                  {isEdit ? (
                    <Input id="type" value={schedule?.type ?? ""} disabled readOnly />
                  ) : (
                    <Select value={type} onValueChange={(v) => setType(v as ScheduleType)}>
                      <SelectTrigger
                        id="type"
                        aria-required="true"
                        aria-invalid={!!fieldErrors.type}
                        aria-describedby={fieldErrors.type ? errorId("type") : undefined}
                        className={cn(fieldErrors.type && INVALID_CONTROL)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEDULE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!isEdit && fieldErrors.type && (
                    <p id={errorId("type")} className="text-xs text-danger">
                      {fieldErrors.type}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="date">Date</Label>
                  {isEdit ? (
                    <Input
                      id="date"
                      value={schedule ? format(parseScheduledDate(schedule.scheduled_date), "PP") : ""}
                      disabled
                      readOnly
                    />
                  ) : (
                    <Input
                      id="date"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      required
                      aria-invalid={!!fieldErrors.scheduled_date}
                      aria-describedby={fieldErrors.scheduled_date ? errorId("date") : undefined}
                      className={cn(fieldErrors.scheduled_date && INVALID_CONTROL)}
                    />
                  )}
                  {!isEdit && fieldErrors.scheduled_date && (
                    <p id={errorId("date")} className="text-xs text-danger">
                      {fieldErrors.scheduled_date}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="assignedTo">Assigned to</Label>
                  {isEdit ? (
                    <Input id="assignedTo" value={assigneeName} disabled readOnly />
                  ) : (
                    <Select value={assignedTo} onValueChange={setAssignedTo}>
                      <SelectTrigger
                        id="assignedTo"
                        aria-required="true"
                        aria-invalid={!!fieldErrors.assigned_to}
                        aria-describedby={fieldErrors.assigned_to ? errorId("assignedTo") : undefined}
                        className={cn(fieldErrors.assigned_to && INVALID_CONTROL)}
                      >
                        <SelectValue placeholder="Select person" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!isEdit && fieldErrors.assigned_to && (
                    <p id={errorId("assignedTo")} className="text-xs text-danger">
                      {fieldErrors.assigned_to}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="project">Project</Label>
                  {isEdit ? (
                    <Input id="project" value={projectName} disabled readOnly />
                  ) : (
                    <ProjectPicker
                      id="project"
                      value={projectId}
                      onChange={handleProjectChange}
                      placeholder="None"
                      aria-invalid={!!fieldErrors.parent}
                      aria-describedby={fieldErrors.parent ? errorId("server") : undefined}
                      className={cn(fieldErrors.parent && INVALID_CONTROL)}
                    />
                  )}
                </div>
              </div>

              {isEdit && serverName && (
                <div className="space-y-1">
                  <Label htmlFor="server">Server</Label>
                  <Input id="server" value={serverName} disabled readOnly />
                </div>
              )}

              {!isEdit && (
                <div className="space-y-1">
                  <Label htmlFor="server">Server</Label>
                  <ServerPicker
                    id="server"
                    value={serverId}
                    onChange={setServerId}
                    projectId={projectId}
                    placeholder="None"
                    aria-invalid={!!fieldErrors.parent}
                    aria-describedby={fieldErrors.parent ? errorId("server") : undefined}
                    className={cn(fieldErrors.parent && INVALID_CONTROL)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {projectId
                      ? "Scoped to servers under the selected project."
                      : "Optional — pick a project, a server, or both."}
                  </p>
                  {/*
                    The cross-field message lives here, under the Server
                    picker, and both pickers point at it: it belongs to the
                    Project/Server pair, not to either control alone.
                    role="alert" is kept (and is the only per-field error
                    here that carries it) because this one appears in
                    response to a submit and can sit below the fold.
                  */}
                  {fieldErrors.parent && (
                    <p id={errorId("server")} role="alert" className="text-xs text-danger">
                      {fieldErrors.parent}
                    </p>
                  )}
                </div>
              )}

              {isEdit && (
                <div className="space-y-1">
                  <Label>Status</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[status]}>{status.replace("_", " ")}</Badge>
                    {cancelledAfterStarting && (
                      <span className="text-xs text-muted-foreground">Cancelled after starting</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Status isn't changed from here.
                  </p>
                </div>
              )}

              {isEdit && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="startedAt">Started</Label>
                    <Input
                      id="startedAt"
                      value={startedAt ? format(new Date(startedAt), "PPp") : "Not started yet"}
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="completedAt">Completed</Label>
                    <Input
                      id="completedAt"
                      value={completedAt ? format(new Date(completedAt), "PPp") : "Not completed yet"}
                      disabled
                      readOnly
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <OptionalLabel htmlFor="notes">Notes</OptionalLabel>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  aria-invalid={!!fieldErrors.notes}
                  aria-describedby={fieldErrors.notes ? errorId("notes") : undefined}
                  className={cn(fieldErrors.notes && INVALID_CONTROL)}
                />
                {fieldErrors.notes && (
                  <p id={errorId("notes")} className="text-xs text-danger">
                    {fieldErrors.notes}
                  </p>
                )}
              </div>
            </div>

            <SheetFooter>
              <SheetClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </SheetClose>
              {/*
                No longer disabled on a missing assignee: that silently
                blocked submit with no explanation. Submitting now surfaces
                "Assignee is required." on the field itself.
              */}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
