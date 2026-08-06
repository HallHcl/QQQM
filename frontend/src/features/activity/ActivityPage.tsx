import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import type { EntityType } from "@/types";
import ActivityTimeline from "./components/ActivityTimeline";

const ENTITY_TYPES: EntityType[] = [
  "client",
  "project",
  "environment",
  "server",
  "credential_reference",
  "people",
  "resource",
  "resource_version",
  "schedule",
  "user",
];

export default function ActivityPage() {
  const [entityType, setEntityType] = useState<string>("all");
  const { data: logs = [], isLoading } = useActivityLogs({
    entityType: entityType === "all" ? undefined : entityType,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entity types</SelectItem>
            {ENTITY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading activity...</p>
      ) : (
        <ActivityTimeline logs={logs} />
      )}
    </div>
  );
}
