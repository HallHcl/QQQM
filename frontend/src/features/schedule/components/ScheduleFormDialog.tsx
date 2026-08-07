import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePeople } from "@/hooks/usePeople";
import { useProjects } from "@/hooks/useProjects";
import { useCreateSchedule, useUpdateSchedule } from "@/hooks/useSchedules";
import type { Schedule, ScheduleStatus, ScheduleType } from "@/types";

const SCHEDULE_TYPES: ScheduleType[] = ["PM", "MA", "other"];
const SCHEDULE_STATUSES: ScheduleStatus[] = ["pending", "in_progress", "done", "cancelled"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule;
}

export default function ScheduleFormDialog({ open, onOpenChange, schedule }: Props) {
  const { data: people = [] } = usePeople();
  const { data: projects = [] } = useProjects();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<ScheduleType>("PM");
  const [scheduledDate, setScheduledDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | undefined>(undefined);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ScheduleStatus>("pending");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (schedule) {
      setTitle(schedule.title);
      setType(schedule.type);
      setScheduledDate(schedule.scheduled_date.slice(0, 10));
      setAssignedTo(schedule.assigned_to);
      setProjectId(schedule.project_id ?? undefined);
      setStatus(schedule.status);
      setNotes(schedule.notes ?? "");
    } else {
      setTitle("");
      setType("PM");
      setScheduledDate("");
      setAssignedTo(undefined);
      setProjectId(undefined);
      setStatus("pending");
      setNotes("");
    }
  }, [schedule, open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!assignedTo) return;

    if (schedule) {
      // Only status/notes are editable via PATCH; project_id/type/etc. are
      // fixed at creation. updated_at is required for the optimistic lock —
      // status transitions the user didn't intend to make (e.g. "pending" ->
      // "done") are rejected server-side by the status state machine.
      await updateSchedule.mutateAsync({
        id: schedule.id,
        data: { status, notes: notes || undefined, updated_at: schedule.updated_at },
      });
    } else {
      await createSchedule.mutateAsync({
        title,
        type,
        scheduled_date: scheduledDate,
        assigned_to: assignedTo,
        project_id: projectId,
        notes: notes || undefined,
      });
    }

    onOpenChange(false);
  }

  const isSubmitting = createSchedule.isPending || updateSchedule.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit schedule" : "New schedule"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ScheduleType)}>
                <SelectTrigger>
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
            </div>
            <div className="space-y-1">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Assigned to</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
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
            </div>
            <div className="space-y-1">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ScheduleStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !assignedTo}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
