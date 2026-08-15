import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { usePeople } from "@/hooks/usePeople";
import { useConflictResolution } from "@/hooks/useConflictResolution";
import { parseScheduledDate, useCreateSchedule, useSchedule, useUpdateSchedule } from "@/hooks/useSchedules";
import type { Schedule, ScheduleStatus, ScheduleType } from "@/types";

const SCHEDULE_TYPES: ScheduleType[] = ["PM", "MA", "other"];

const STATUS_VARIANT: Record<
  ScheduleStatus,
  "default" | "secondary" | "outline" | "destructive" | "warning"
> = {
  pending: "warning",
  in_progress: "secondary",
  done: "default",
  cancelled: "destructive",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule;
}

export default function ScheduleFormDialog({ open, onOpenChange, schedule }: Props) {
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
  // "At least one of Project/Server" mirrors the backend's CHECK constraint
  // (chk_schedules_has_parent: project_id IS NOT NULL OR server_id IS NOT
  // NULL) — client-side so the user gets a clear message instead of a 400.
  const [parentError, setParentError] = useState<string | undefined>(undefined);

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
    setParentError(undefined);
    clearConflict();
  }, [schedule, open, clearConflict]);

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
        if (!assignedTo) return;
        if (!projectId && !serverId) {
          setParentError("Select a Project, a Server, or both.");
          return;
        }
        setParentError(undefined);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit schedule" : "New schedule"}</DialogTitle>
        </DialogHeader>

        {isConflict ? (
          <ConflictState
            message={
              conflictInfo?.message ?? "This record was changed by someone else since you loaded it."
            }
            onReloadLatest={handleReloadLatest}
            onKeepEditing={handleKeepEditingAndRetry}
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="title">Title</Label>
              {isEdit ? (
                <Input id="title" value={schedule?.title ?? ""} disabled readOnly />
              ) : (
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="type">Type</Label>
                {isEdit ? (
                  <Input id="type" value={schedule?.type ?? ""} disabled readOnly />
                ) : (
                  <Select value={type} onValueChange={(v) => setType(v as ScheduleType)}>
                    <SelectTrigger id="type" aria-required="true">
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
                  />
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
                    <SelectTrigger id="assignedTo" aria-required="true">
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
                />
                <p className="text-xs text-muted-foreground">
                  {projectId
                    ? "Scoped to servers under the selected project."
                    : "Optional — pick a project, a server, or both."}
                </p>
                {parentError && <p className="text-xs text-danger">{parentError}</p>}
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
                  Status isn't changed from this dialog.
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
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || (!isEdit && !assignedTo)}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
