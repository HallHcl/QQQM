import { FilterBar } from "@/components/FilterBar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/components/ProjectPicker";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES } from "@/lib/resourceTypes";

interface Props {
  search: string;
  onSearchChange: (search: string) => void;
  type: string | undefined;
  onTypeChange: (type: string | undefined) => void;
  projectId: string | undefined;
  onProjectIdChange: (projectId: string | undefined) => void;
}

export default function ResourceFilterBar({
  search,
  onSearchChange,
  type,
  onTypeChange,
  projectId,
  onProjectIdChange,
}: Props) {
  return (
    <FilterBar>
      <Input
        placeholder="Search resources..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-56"
      />

      <Select
        value={type ?? "all"}
        onValueChange={(value) => onTypeChange(value === "all" ? undefined : value)}
      >
        <SelectTrigger className="w-40" aria-label="Resource type">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {RESOURCE_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {RESOURCE_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ProjectPicker
        value={projectId}
        onChange={onProjectIdChange}
        includeAllOption
        allOptionLabel="All projects"
        placeholder="Project"
        className="w-48"
        aria-label="Project"
      />
    </FilterBar>
  );
}
