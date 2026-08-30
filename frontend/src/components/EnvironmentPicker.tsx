import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEnvironments } from "@/hooks/useEnvironments";

interface Props {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Scopes the environment list to a project, same as useEnvironments(projectId). */
  projectId?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Passthrough so a consuming form can mark the trigger invalid. */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Mirrors ProjectPicker's shape for the Server-create environment field. */
export function EnvironmentPicker({
  value,
  onChange,
  projectId,
  placeholder = "Environment",
  className,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: Props) {
  const { data: environments = [] } = useEnvironments(projectId);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={className}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {environments.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
