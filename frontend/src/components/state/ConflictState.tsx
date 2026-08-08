import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConflictStateProps {
  message: string;
  /** Discards the user's in-progress edits and loads the current server values. */
  onReloadLatest: () => void;
  /** Optional: keep the user's edits, refresh just the optimistic-lock stamp, and retry. */
  onKeepEditing?: () => void;
  className?: string;
}

/**
 * Generic 409 optimistic-lock conflict prompt — not tied to Clients. Any
 * PATCH flow using useConflictResolution (Part 19) can drop this in as-is:
 * pass the caught conflict's message and a reload handler that refetches
 * the record and repopulates the form.
 *
 * Never wired to auto-retry or auto-discard — both actions here are
 * explicit user choices.
 */
export function ConflictState({ message, onReloadLatest, onKeepEditing, className }: ConflictStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium text-foreground">This record changed</p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onKeepEditing && (
          <Button variant="outline" size="sm" onClick={onKeepEditing}>
            Keep my changes &amp; retry
          </Button>
        )}
        <Button size="sm" onClick={onReloadLatest}>
          Reload latest version
        </Button>
      </div>
    </div>
  );
}
