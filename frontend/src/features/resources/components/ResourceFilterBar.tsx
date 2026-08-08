import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/components/ProjectPicker";
import type { ResourceFilters } from "@/hooks/useResources";
import type { ResourceType } from "@/types";

const RESOURCE_TYPES: ResourceType[] = [
  "runbook",
  "sop",
  "architecture",
  "troubleshooting",
  "faq",
  "link",
  "pdf",
];

interface Props {
  filters: ResourceFilters;
  onChange: (filters: ResourceFilters) => void;
}

export default function ResourceFilterBar({ filters, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search resources..."
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
        className="w-56"
      />

      <Select
        value={filters.type ?? "all"}
        onValueChange={(value) =>
          onChange({ ...filters, type: value === "all" ? undefined : value })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {RESOURCE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type.replace("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ProjectPicker
        value={filters.projectId}
        onChange={(projectId) => onChange({ ...filters, projectId })}
        includeAllOption
        allOptionLabel="All projects"
        placeholder="Project"
        className="w-48"
      />
    </div>
  );
}
