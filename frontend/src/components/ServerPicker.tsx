import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useServers } from "@/hooks/useServers";

interface Props {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /**
   * Scopes the server list to a project. Servers have no direct project_id —
   * only environment_id (a Server belongs to an Environment, which belongs
   * to a Project; confirmed against the Server schema and GET /servers'
   * query params, which accept environment_id but not project_id). There is
   * no single endpoint for "servers under this project," so this is
   * composed client-side: fetch the project's environments, then filter an
   * unscoped server fetch down to the ones whose environment_id is among
   * them. Leave undefined to show all servers (needed for a server-linked
   * schedule where the user never selects a project at all).
   */
  projectId?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Passthrough so a consuming form can describe/flag the trigger. */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function ServerPicker({
  value,
  onChange,
  projectId,
  placeholder = "Server",
  className,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: Props) {
  const { data: environments = [] } = useEnvironments(projectId);
  // Unscoped (environment_id undefined) — there's no project-level filter
  // to push down to the API, so scoping happens via the intersection below.
  // per_page raised from the hook's default 20 to reduce (not eliminate —
  // this is a client-side composition, not a real cross-page guarantee) the
  // chance of a server being missed in a project with many servers.
  const { data: allServers = [] } = useServers(undefined, { per_page: 100 });

  const environmentIds = new Set(environments.map((e) => e.id));
  const servers = projectId ? allServers.filter((s) => environmentIds.has(s.environment_id)) : allServers;

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
        {servers.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
