import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnvironmentPicker } from "@/components/EnvironmentPicker";
import { ConflictState } from "@/components/state/ConflictState";
import { ApiError } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useCreateServer, useServer, useUpdateServer, type Server } from "@/hooks/useServers";
import { useConflictResolution } from "@/hooks/useConflictResolution";

/** Verified against backend/src/validators/servers.validator.ts. */
const SERVICE_TYPES = [
  "application",
  "database",
  "proxy",
  "monitoring",
  "repository",
  "metrics",
  "jump_host",
  "other",
] as const;

const ACCESS_METHODS = ["ssh", "rdp", "telnet", "web", "other"] as const;

const SERVICE_TYPE_LABELS: Record<(typeof SERVICE_TYPES)[number], string> = {
  application: "Application",
  database: "Database",
  proxy: "Proxy",
  monitoring: "Monitoring",
  repository: "Repository",
  metrics: "Metrics",
  jump_host: "Jump host",
  other: "Other",
};

const ACCESS_METHOD_LABELS: Record<(typeof ACCESS_METHODS)[number], string> = {
  ssh: "SSH",
  rdp: "RDP",
  telnet: "Telnet",
  web: "Web",
  other: "Other",
};

interface ServerInput {
  display_name: string;
  hostname: string;
  ip_address?: string;
  service_type: (typeof SERVICE_TYPES)[number];
  access_method: (typeof ACCESS_METHODS)[number];
  access_host: string;
  access_port?: number;
  access_path?: string;
  tech_stack?: string[];
  monitoring_url?: string;
  notes?: string;
}

interface FieldErrors {
  display_name?: string;
  environment_id?: string;
  hostname?: string;
  ip_address?: string;
  service_type?: string;
  access_method?: string;
  access_host?: string;
  access_port?: string;
  access_path?: string;
  tech_stack?: string;
  monitoring_url?: string;
  notes?: string;
}

/** Shape of `error.details` for a 400 VALIDATION_ERROR: Zod's ZodError.flatten(). */
interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
}

const EDITABLE_FIELDS = [
  "display_name",
  "environment_id",
  "hostname",
  "ip_address",
  "service_type",
  "access_method",
  "access_host",
  "access_port",
  "access_path",
  "tech_stack",
  "monitoring_url",
  "notes",
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; absent (undefined) in create mode. */
  server?: Server;
}

export default function ServerFormDialog({ open, onOpenChange, server }: Props) {
  const isEdit = Boolean(server);
  // Used only to resolve the current environment's display name on edit (the
  // picker itself is create-only) — same pattern EnvironmentFormDialog uses
  // for the project_id-immutable-on-edit case.
  const { data: environments = [] } = useEnvironments();
  const createServer = useCreateServer();
  const updateServer = useUpdateServer();
  const { refetch: refetchServer } = useServer(server?.id);
  const { conflict: conflictInfo, isConflict, captureConflict, clearConflict } = useConflictResolution();

  const [displayName, setDisplayName] = useState("");
  const [environmentId, setEnvironmentId] = useState<string | undefined>(undefined);
  const [hostname, setHostname] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [serviceType, setServiceType] = useState<(typeof SERVICE_TYPES)[number] | undefined>(undefined);
  const [accessMethod, setAccessMethod] = useState<(typeof ACCESS_METHODS)[number] | undefined>(undefined);
  const [accessHost, setAccessHost] = useState("");
  const [accessPort, setAccessPort] = useState("");
  const [accessPath, setAccessPath] = useState("");
  const [techStack, setTechStack] = useState("");
  const [monitoringUrl, setMonitoringUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  // Re-seed the form every time the dialog opens, from the server passed in
  // (create mode: blank; edit mode: the currently-loaded row).
  useEffect(() => {
    if (!open) return;
    if (server) {
      setDisplayName(server.display_name);
      setEnvironmentId(server.environment_id);
      setHostname(server.hostname);
      setIpAddress(server.ip_address ?? "");
      setServiceType(server.service_type ?? undefined);
      setAccessMethod(server.access_method ?? undefined);
      setAccessHost(server.access_host);
      setAccessPort(server.access_port != null ? String(server.access_port) : "");
      setAccessPath(server.access_path ?? "");
      setTechStack((server.tech_stack ?? []).join(", "));
      setMonitoringUrl(server.monitoring_url ?? "");
      setNotes(server.notes ?? "");
      setUpdatedAt(server.updated_at);
    } else {
      setDisplayName("");
      setEnvironmentId(undefined);
      setHostname("");
      setIpAddress("");
      setServiceType(undefined);
      setAccessMethod(undefined);
      setAccessHost("");
      setAccessPort("");
      setAccessPath("");
      setTechStack("");
      setMonitoringUrl("");
      setNotes("");
      setUpdatedAt(undefined);
    }
    setFieldErrors({});
    setFormError(undefined);
    clearConflict();
  }, [server, open, clearConflict]);

  function buildInput(): ServerInput {
    return {
      display_name: displayName.trim(),
      hostname: hostname.trim(),
      ip_address: ipAddress.trim() || undefined,
      service_type: serviceType as (typeof SERVICE_TYPES)[number],
      access_method: accessMethod as (typeof ACCESS_METHODS)[number],
      access_host: accessHost.trim(),
      access_port: accessPort.trim() ? Number(accessPort) : undefined,
      access_path: accessPath.trim() || undefined,
      tech_stack: techStack
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      monitoring_url: monitoringUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    };
  }

  async function submit(input: ServerInput) {
    if (isEdit && server) {
      // environment_id is not sent — the API rejects it entirely on PATCH (a
      // server can't be re-parented to a different environment this way).
      await updateServer.mutateAsync({
        id: server.id,
        data: { ...input, updated_at: updatedAt ?? server.updated_at },
      });
    } else {
      if (!environmentId) return;
      await createServer.mutateAsync({ ...input, environment_id: environmentId });
    }
  }

  /**
   * Applies a caught mutation error to local UI state. There is no
   * duplicate-name/duplicate-hostname 409 for Servers (verified against
   * servers.service.ts — no unique index exists on the table; the
   * UNIQUE_VIOLATION catch there is defensive and unreachable in practice),
   * so unlike EnvironmentFormDialog/ProjectFormDialog every 409 here is
   * treated as a stale-write conflict. A 400 VALIDATION_ERROR maps to
   * per-field messages when the shape supports it; everything else becomes a
   * form-level message. Never swallowed — every branch leaves something
   * visible to the user.
   */
  function applyServerError(err: unknown): void {
    if (!(err instanceof ApiError)) {
      setFormError("Something went wrong. Please try again.");
      return;
    }

    if (err.status === 409) {
      captureConflict(err);
      return;
    }

    if (err.status === 400 && err.code === "VALIDATION_ERROR") {
      const details = err.details as ValidationDetails | undefined;
      const nextErrors: FieldErrors = {};
      for (const [field, messages] of Object.entries(details?.fieldErrors ?? {})) {
        if (messages?.length && (EDITABLE_FIELDS as readonly string[]).includes(field)) {
          nextErrors[field as keyof FieldErrors] = messages[0];
        }
      }
      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        return;
      }
    }

    setFormError(err.message);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const input = buildInput();
    const nextErrors: FieldErrors = {};

    // Client-side validation before hitting the network, mirroring the
    // backend's minimum requirements.
    if (!input.display_name) {
      nextErrors.display_name = "Display name is required.";
    }
    if (!isEdit && !environmentId) {
      nextErrors.environment_id = "Environment is required.";
    }
    if (!input.hostname) {
      nextErrors.hostname = "Hostname is required.";
    }
    if (!serviceType) {
      nextErrors.service_type = "Service type is required.";
    }
    if (!accessMethod) {
      nextErrors.access_method = "Access method is required.";
    }
    if (!input.access_host) {
      nextErrors.access_host = "Access host is required.";
    }
    if (accessPort.trim()) {
      const port = Number(accessPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        nextErrors.access_port = "Port must be a whole number between 1 and 65535.";
      }
    }
    if (accessPath.trim() && !accessPath.trim().startsWith("/")) {
      nextErrors.access_path = "Access path must start with /.";
    }
    if (monitoringUrl.trim()) {
      try {
        new URL(monitoringUrl.trim());
      } catch {
        nextErrors.monitoring_url = "Enter a valid URL.";
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    try {
      await submit(input);
      toast({ title: isEdit ? "Server updated" : "Server created" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  async function handleReloadLatest() {
    const result = await refetchServer();
    if (result.data) {
      setDisplayName(result.data.display_name);
      setHostname(result.data.hostname);
      setIpAddress(result.data.ip_address ?? "");
      setServiceType(result.data.service_type ?? undefined);
      setAccessMethod(result.data.access_method ?? undefined);
      setAccessHost(result.data.access_host);
      setAccessPort(result.data.access_port != null ? String(result.data.access_port) : "");
      setAccessPath(result.data.access_path ?? "");
      setTechStack((result.data.tech_stack ?? []).join(", "));
      setMonitoringUrl(result.data.monitoring_url ?? "");
      setNotes(result.data.notes ?? "");
      setUpdatedAt(result.data.updated_at);
    }
    clearConflict();
  }

  async function handleRetryWithLatest() {
    const result = await refetchServer();
    if (!result.data) return;

    const freshUpdatedAt = result.data.updated_at;
    setUpdatedAt(freshUpdatedAt);
    clearConflict();

    // Keep the user's current field values; only the optimistic-lock stamp
    // is refreshed before retrying.
    try {
      if (server) {
        await updateServer.mutateAsync({
          id: server.id,
          data: { ...buildInput(), updated_at: freshUpdatedAt },
        });
      }
      toast({ title: "Server updated" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = createServer.isPending || updateServer.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit server" : "New server"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this server's details." : "Add a new server to an environment."}
          </DialogDescription>
        </DialogHeader>

        {isConflict ? (
          <ConflictState
            message={
              conflictInfo?.message ?? "This record was changed by someone else since you loaded it."
            }
            onReloadLatest={handleReloadLatest}
            onKeepEditing={handleRetryWithLatest}
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {formError && <p className="text-sm text-danger">{formError}</p>}

            <div className="space-y-1">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              {fieldErrors.display_name && (
                <p className="text-xs text-danger">{fieldErrors.display_name}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Environment</Label>
              {isEdit ? (
                <Input
                  value={environments.find((e) => e.id === environmentId)?.name ?? "—"}
                  disabled
                  readOnly
                />
              ) : (
                <EnvironmentPicker
                  value={environmentId}
                  onChange={setEnvironmentId}
                  placeholder="Select an environment"
                />
              )}
              {fieldErrors.environment_id && (
                <p className="text-xs text-danger">{fieldErrors.environment_id}</p>
              )}
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  A server's environment can't be changed after creation.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="hostname">Hostname</Label>
                <Input id="hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} />
                {fieldErrors.hostname && <p className="text-xs text-danger">{fieldErrors.hostname}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ip_address">IP address</Label>
                <Input id="ip_address" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} />
                {fieldErrors.ip_address && (
                  <p className="text-xs text-danger">{fieldErrors.ip_address}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="tech_stack">Tech stack</Label>
              <Input
                id="tech_stack"
                value={techStack}
                onChange={(e) => setTechStack(e.target.value)}
                placeholder="e.g. node, postgres, nginx"
              />
              <p className="text-xs text-muted-foreground">Comma-separated.</p>
              {fieldErrors.tech_stack && <p className="text-xs text-danger">{fieldErrors.tech_stack}</p>}
            </div>

            <fieldset className="space-y-4 rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Access documentation
              </legend>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Service type</Label>
                  <Select
                    value={serviceType}
                    onValueChange={(v) => setServiceType(v as (typeof SERVICE_TYPES)[number])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {SERVICE_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.service_type && (
                    <p className="text-xs text-danger">{fieldErrors.service_type}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Access method</Label>
                  <Select
                    value={accessMethod}
                    onValueChange={(v) => setAccessMethod(v as (typeof ACCESS_METHODS)[number])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {ACCESS_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.access_method && (
                    <p className="text-xs text-danger">{fieldErrors.access_method}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div className="space-y-1">
                  <Label htmlFor="access_host">Access host</Label>
                  <Input
                    id="access_host"
                    value={accessHost}
                    onChange={(e) => setAccessHost(e.target.value)}
                    placeholder="Hostname, IP, or anything network-resolvable"
                  />
                  {fieldErrors.access_host && (
                    <p className="text-xs text-danger">{fieldErrors.access_host}</p>
                  )}
                </div>
                <div className="w-24 space-y-1">
                  <Label htmlFor="access_port">Port</Label>
                  <Input
                    id="access_port"
                    type="number"
                    min={1}
                    max={65535}
                    value={accessPort}
                    onChange={(e) => setAccessPort(e.target.value)}
                  />
                  {fieldErrors.access_port && (
                    <p className="text-xs text-danger">{fieldErrors.access_port}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="access_path">Access path</Label>
                <Input
                  id="access_path"
                  value={accessPath}
                  onChange={(e) => setAccessPath(e.target.value)}
                  placeholder={accessMethod === "web" ? "/dashboard" : "/ (optional)"}
                />
                <p className="text-xs text-muted-foreground">
                  Optional; must start with / if provided. Not restricted to web access — shown
                  regardless of access method so nothing is lost if you switch methods later.
                </p>
                {fieldErrors.access_path && (
                  <p className="text-xs text-danger">{fieldErrors.access_path}</p>
                )}
              </div>
            </fieldset>

            <div className="space-y-1">
              <Label htmlFor="monitoring_url">Monitoring URL</Label>
              <Input
                id="monitoring_url"
                value={monitoringUrl}
                onChange={(e) => setMonitoringUrl(e.target.value)}
                placeholder="e.g. a Grafana dashboard link"
              />
              <p className="text-xs text-muted-foreground">
                A separate monitoring dashboard link — distinct from this server's access details
                above.
              </p>
              {fieldErrors.monitoring_url && (
                <p className="text-xs text-danger">{fieldErrors.monitoring_url}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              {fieldErrors.notes && <p className="text-xs text-danger">{fieldErrors.notes}</p>}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
