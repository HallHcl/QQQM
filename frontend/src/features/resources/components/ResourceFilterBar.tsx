import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects } from "@/hooks/useProjects";
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
  const { data: projects = [] } = useProjects();

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

      <Select
        value={filters.projectId ?? "all"}
        onValueChange={(value) =>
          onChange({ ...filters, projectId: value === "all" ? undefined : value })
        }
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Project" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
