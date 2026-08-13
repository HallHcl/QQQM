import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActivityAction, EntityType } from "@/types";

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

const ACTIONS: ActivityAction[] = ["create", "update", "delete", "restore"];

interface Props {
  entityType: EntityType | undefined;
  onEntityTypeChange: (entityType: EntityType | undefined) => void;
  entityId: string;
  onEntityIdChange: (entityId: string) => void;
  action: ActivityAction | undefined;
  onActionChange: (action: ActivityAction | undefined) => void;
  changedBy: string;
  onChangedByChange: (changedBy: string) => void;
  from: string;
  onFromChange: (from: string) => void;
  to: string;
  onToChange: (to: string) => void;
}

export default function ActivityFilterBar({
  entityType,
  onEntityTypeChange,
  entityId,
  onEntityIdChange,
  action,
  onActionChange,
  changedBy,
  onChangedByChange,
  from,
  onFromChange,
  to,
  onToChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={entityType ?? "all"}
        onValueChange={(value) => onEntityTypeChange(value === "all" ? undefined : (value as EntityType))}
      >
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

      <Select
        value={action ?? "all"}
        onValueChange={(value) => onActionChange(value === "all" ? undefined : (value as ActivityAction))}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Action" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All actions</SelectItem>
          {ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        placeholder="Entity ID"
        value={entityId}
        onChange={(e) => onEntityIdChange(e.target.value)}
        className="w-48 font-mono text-xs"
      />

      <Input
        placeholder="Changed by (person ID)"
        value={changedBy}
        onChange={(e) => onChangedByChange(e.target.value)}
        className="w-48 font-mono text-xs"
      />

      <Input
        type="date"
        aria-label="From date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className="w-40"
      />

      <Input
        type="date"
        aria-label="To date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className="w-40"
      />
    </div>
  );
}
