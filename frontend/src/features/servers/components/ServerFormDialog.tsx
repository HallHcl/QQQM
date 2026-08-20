import { useState } from "react";
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
import { OptionalLabel } from "@/components/ui/optional-label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnvironmentPicker } from "@/components/EnvironmentPicker";
import { ApiError, apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useCreateServer } from "@/hooks/useServers";

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
}

/**
 * Create-only. Editing a server is handled inline on ServerDetailPage
 * (ServerEditCard) instead of through this dialog — see the modal-to-
 * detail-page migration. This component keeps the "New server" flow as a
 * modal since there's no detail page to navigate to for a record that
 * doesn't exist yet.
 */
export default function ServerFormDialog({ open, onOpenChange }: Props) {
  const createServer = useCreateServer();

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  function reset() {
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
    setFieldErrors({});
    setFormError(undefined);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

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

  /**
   * Applies a caught mutation error to local UI state. No ConflictState
   * branch here (unlike the old edit-mode handling) — create has no
   * existing record to "reload" or "retry" against, so any non-validation
   * error (including a 409, which no unique index makes reachable in
   * practice per servers.service.ts) just becomes a form-level message.
   * Never swallowed — every branch leaves something visible to the user.
   */
  function applyServerError(err: unknown): void {
    const title = "Couldn't create server";

    if (!(err instanceof ApiError)) {
      setFormError("Something went wrong. Please try again.");
      toast({ title, description: apiErrorMessage(err), variant: "destructive" });
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
        toast({ title, description: "Check the highlighted fields below.", variant: "destructive" });
        return;
      }
    }

    setFormError(err.message);
    toast({ title, description: err.message, variant: "destructive" });
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
    if (!environmentId) {
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

    if (!environmentId) return;

    try {
      await createServer.mutateAsync({ ...input, environment_id: environmentId });
      toast({ title: "Server created" });
      handleOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = createServer.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New server</DialogTitle>
          <DialogDescription>Add a new server to an environment.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="space-y-1">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
            {fieldErrors.display_name && (
              <p className="text-xs text-danger">{fieldErrors.display_name}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="environment">Environment</Label>
            <EnvironmentPicker
              id="environment"
              value={environmentId}
              onChange={setEnvironmentId}
              placeholder="Select an environment"
            />
            {fieldErrors.environment_id && (
              <p className="text-xs text-danger">{fieldErrors.environment_id}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="hostname">Hostname</Label>
              <Input id="hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} required />
              {fieldErrors.hostname && <p className="text-xs text-danger">{fieldErrors.hostname}</p>}
            </div>
            <div className="space-y-1">
              <OptionalLabel htmlFor="ip_address">IP address</OptionalLabel>
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
                <Label htmlFor="service_type">Service type</Label>
                <Select
                  value={serviceType}
                  onValueChange={(v) => setServiceType(v as (typeof SERVICE_TYPES)[number])}
                >
                  <SelectTrigger id="service_type" aria-required="true">
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
                <Label htmlFor="access_method">Access method</Label>
                <Select
                  value={accessMethod}
                  onValueChange={(v) => setAccessMethod(v as (typeof ACCESS_METHODS)[number])}
                >
                  <SelectTrigger id="access_method" aria-required="true">
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
                  required
                />
                {fieldErrors.access_host && (
                  <p className="text-xs text-danger">{fieldErrors.access_host}</p>
                )}
              </div>
              <div className="w-24 space-y-1">
                <OptionalLabel htmlFor="access_port">Port</OptionalLabel>
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
              <OptionalLabel htmlFor="access_path">Access path</OptionalLabel>
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
            <OptionalLabel htmlFor="monitoring_url">Monitoring URL</OptionalLabel>
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
            <OptionalLabel htmlFor="notes">Notes</OptionalLabel>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            {fieldErrors.notes && <p className="text-xs text-danger">{fieldErrors.notes}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
