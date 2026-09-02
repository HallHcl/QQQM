import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { panelSurface } from "@/lib/panelSurface";

export interface EmptyStateProps {
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title = "Nothing here yet", message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-16 text-center",
        panelSurface({ dashed: true }),
        className
      )}
    >
      <Inbox className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
