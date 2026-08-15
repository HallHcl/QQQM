import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActivityLog } from "@/types";

const ACTION_VARIANT: Record<ActivityLog["action"], "default" | "secondary" | "destructive"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  restore: "secondary",
};

const ACTION_DOT: Record<ActivityLog["action"], string> = {
  create: "bg-brand",
  update: "bg-warning",
  delete: "bg-danger",
  restore: "bg-brand",
};

interface Props {
  logs: ActivityLog[];
}

export default function ActivityTimeline({ logs }: Props) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity recorded.</p>;
  }

  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {logs.map((log) => (
        <li key={log.id} className="relative">
          <span
            className={cn(
              "absolute -left-[25px] top-1 h-2 w-2 rounded-sm",
              ACTION_DOT[log.action]
            )}
          />
          <div className="flex items-center gap-2">
            <Badge variant={ACTION_VARIANT[log.action]}>{log.action}</Badge>
            <span className="text-sm font-medium capitalize">
              {log.entity_type.replace("_", " ")}
            </span>
            <span className="text-sm text-muted-foreground">by {log.changed_by_person.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {format(new Date(log.created_at), "PPp")}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">Entity ID: {log.entity_id}</p>
        </li>
      ))}
    </ol>
  );
}
