import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useConflictResolution } from "@/hooks/useConflictResolution";
import { useUpdateSchedule } from "@/hooks/useSchedules";
import type { Schedule, ScheduleStatus } from "@/types";

interface Transition {
  label: string;
  targetStatus: ScheduleStatus;
  /** Cancel is a one-directional terminal move (no "un-cancel") — confirm it. */
  confirm?: boolean;
}

// The button set for a status IS the legal-transition set — there's no
// button for "pending -> done" because the state machine
// (backend/src/services/scheduleStateMachine.ts) doesn't allow it, so no
// separate client-side canTransition() check is needed: offering only these
// buttons is what keeps every click legal by construction. done/cancelled
// are terminal (empty arrays -> ScheduleStatusActions renders nothing).
const TRANSITIONS: Record<ScheduleStatus, Transition[]> = {
  pending: [
    { label: "Start", targetStatus: "in_progress" },
    { label: "Cancel", targetStatus: "cancelled", confirm: true },
  ],
  in_progress: [
    { label: "Complete", targetStatus: "done" },
    { label: "Cancel", targetStatus: "cancelled", confirm: true },
  ],
  done: [],
  cancelled: [],
};

const SUCCESS_MESSAGE: Partial<Record<ScheduleStatus, string>> = {
  in_progress: "Schedule started",
  done: "Schedule completed",
  cancelled: "Schedule cancelled",
};

interface Props {
  schedule: Schedule;
}

export default function ScheduleStatusActions({ schedule }: Props) {
  const updateSchedule = useUpdateSchedule();
  const { captureConflict } = useConflictResolution();
  const queryClient = useQueryClient();
  const [confirmingTransition, setConfirmingTransition] = useState<Transition | undefined>(undefined);

  const transitions = TRANSITIONS[schedule.status];
  if (transitions.length === 0) return null;

  function runTransition(transition: Transition) {
    updateSchedule.mutate(
      { id: schedule.id, data: { status: transition.targetStatus, updated_at: schedule.updated_at } },
      {
        onSuccess: () => toast({ title: SUCCESS_MESSAGE[transition.targetStatus] ?? "Schedule updated" }),
        onError: (err) => {
          // A 409 here means someone else changed this schedule since the
          // row was last fetched — the same stale-write conflict
          // useConflictResolution/ConflictState handle in the edit dialog.
          // But a list-row button click has no in-progress draft to lose
          // (unlike the notes-edit dialog), so there's nothing for a
          // "keep editing & retry" prompt to preserve — instead of opening
          // ConflictState, surface the conflict as a toast and force a
          // refetch so the row's displayed status/updated_at catch up to
          // the current server state on their own. captureConflict still
          // does the 409-detection + message-extraction work; it's just
          // not tied to a persisted UI state here since there's no dialog
          // to show it in.
          if (err instanceof ApiError && captureConflict(err)) {
            toast({
              title: "Schedule changed",
              description: `${err.message} The list has been refreshed with the latest version.`,
              variant: "destructive",
            });
            queryClient.invalidateQueries({ queryKey: ["schedules"] });
            return;
          }
          toast({
            title: `Couldn't ${transition.label.toLowerCase()} schedule`,
            description: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  }

  function handleClick(transition: Transition) {
    if (transition.confirm) {
      setConfirmingTransition(transition);
      return;
    }
    runTransition(transition);
  }

  return (
    <RequireRole roles={["admin", "member"]}>
      <span className="inline-flex gap-2">
        {transitions.map((transition) => (
          <Button
            key={transition.targetStatus}
            variant="outline"
            size="sm"
            disabled={updateSchedule.isPending}
            onClick={() => handleClick(transition)}
          >
            {transition.label}
          </Button>
        ))}
      </span>

      <ConfirmDialog
        open={Boolean(confirmingTransition)}
        onOpenChange={(open) => {
          if (!open) setConfirmingTransition(undefined);
        }}
        title="Cancel this schedule?"
        description={`"${schedule.title}" will be marked cancelled. Cancelled is a terminal state — there's no "un-cancel" action, so this can't be undone from here.`}
        confirmLabel="Cancel schedule"
        variant="destructive"
        onConfirm={() => confirmingTransition && runTransition(confirmingTransition)}
      />
    </RequireRole>
  );
}
