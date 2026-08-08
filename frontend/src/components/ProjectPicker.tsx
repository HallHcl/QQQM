import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects } from "@/hooks/useProjects";

interface Props {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Scopes the project list to a client, same as useProjects(clientId). */
  clientId?: string;
  /**
   * Renders a leading "All projects" (or `allOptionLabel`) item that maps to
   * `undefined`, for filter-bar usage. Off by default, matching the
   * required/optional-field usage (Schedule, Resources forms) where no such
   * item exists today.
   */
  includeAllOption?: boolean;
  allOptionLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ProjectPicker({
  value,
  onChange,
  clientId,
  includeAllOption = false,
  allOptionLabel = "All projects",
  placeholder = "Project",
  className,
  disabled,
}: Props) {
  const { data: projects = [] } = useProjects(clientId);

  return (
    <Select
      value={includeAllOption ? (value ?? "all") : value}
      onValueChange={(v) => onChange(includeAllOption && v === "all" ? undefined : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAllOption && <SelectItem value="all">{allOptionLabel}</SelectItem>}
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
