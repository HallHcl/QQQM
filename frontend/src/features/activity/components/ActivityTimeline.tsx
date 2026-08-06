import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { ActivityLog } from "@/types";

const ACTION_VARIANT: Record<ActivityLog["action"], "default" | "secondary" | "destructive"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
};

interface Props {
  logs: ActivityLog[];
}

export default function ActivityTimeline({ logs }: Props) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity recorded.</p>;
  }

  return (
    <ol className="relative space-y-6 border-l pl-6">
      {logs.map((log) => (
        <li key={log.id} className="relative">
          <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
          <div className="flex items-center gap-2">
            <Badge variant={ACTION_VARIANT[log.action]}>{log.action}</Badge>
            <span className="text-sm font-medium capitalize">
              {log.entity_type.replace("_", " ")}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(log.created_at), "PPp")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Entity ID: {log.entity_id}</p>
        </li>
      ))}
    </ol>
  );
}
