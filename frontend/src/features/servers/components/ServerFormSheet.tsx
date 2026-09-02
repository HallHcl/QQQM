import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { cn } from "@/lib/utils";
import { panelSurface } from "@/lib/panelSurface";

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

/**
 * Fields in the order they are rendered, paired with the DOM id of the
 * control that owns each one. Deliberately NOT reusing EDITABLE_FIELDS:
 * that list is the server-error allow-list and happens to sort tech_stack
 * last, whereas on screen tech_stack sits above the Access documentation
 * fieldset. "Focus the first invalid field" has to mean first *visually*,
 * so this is the list that drives it. The environment row is the one place
 * the error key and the element id differ (environment_id vs #environment).
 */
const FIELD_DOM_ORDER: ReadonlyArray<{ key: keyof FieldErrors; elementId: string }> = [
  { key: "display_name", elementId: "display_name" },
  { key: "environment_id", elementId: "environment" },
  { key: "hostname", elementId: "hostname" },
  { key: "ip_address", elementId: "ip_address" },
  { key: "tech_stack", elementId: "tech_stack" },
  { key: "service_type", elementId: "service_type" },
  { key: "access_method", elementId: "access_method" },
  { key: "access_host", elementId: "access_host" },
  { key: "access_port", elementId: "access_port" },
  { key: "access_path", elementId: "access_path" },
  { key: "monitoring_url", elementId: "monitoring_url" },
  { key: "notes", elementId: "notes" },
];

/** `aria-describedby` target for a field's error text. */
function errorId(elementId: string) {
  return `${elementId}-error`;
}

/**
 * Danger underline on an invalid control, matching the shadow-underline
 * treatment every control here already uses (see tailwind.config.js). The
 * `focus-visible:` half keeps the error visible while the field is focused
 * — which, given we focus the first invalid field on a failed submit, is
 * the state the user actually lands in.
 */
const INVALID_CONTROL = "shadow-underline-danger focus-visible:shadow-underline-danger";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create-only. Editing a server is handled inline on ServerDetailPage
 * (ServerEditCard) instead of through this sheet — see the modal-to-
 * detail-page migration. This component keeps the "New server" flow as an
 * overlay since there's no detail page to navigate to for a record that
 * doesn't exist yet.
 *
 * Presented as a right-hand side sheet rather than a centred modal: at 12
 * fields the dialog scrolled its own header and footer out of view. Desktop
 * only for now — responsive/mobile treatment is deferred past Phase 8.
 */
export default function ServerFormSheet({ open, onOpenChange }: Props) {
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

  const scrollBodyRef = useRef<HTMLDivElement>(null);

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

  /**
   * Moves focus to the first invalid control in render order. The elements
   * already exist when this runs, so it does not need to wait for the
   * re-render that paints the error state — focus is independent of it.
   * Radix's SelectTrigger is a real button, so the three pickers take focus
   * the same way the inputs do.
   */
  function focusFirstInvalid(errors: FieldErrors) {
    const first = FIELD_DOM_ORDER.find(({ key }) => errors[key]);
    if (!first) return;
    document.getElementById(first.elementId)?.focus();
  }

  /**
   * Brings the form-level banner back into view when the body is scrolled
   * down. `scrollTo` is optional-called because jsdom does not implement it
   * on elements — this is a purely visual affordance, so no-opping under
   * test is the right outcome rather than something to shim.
   */
  function scrollFormErrorIntoView() {
    scrollBodyRef.current?.scrollTo?.({ top: 0 });
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
      scrollFormErrorIntoView();
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
        focusFirstInvalid(nextErrors);
        toast({ title, description: "Check the highlighted fields below.", variant: "destructive" });
        return;
      }
    }

    setFormError(err.message);
    scrollFormErrorIntoView();
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
      focusFirstInvalid(nextErrors);
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" size="form" className="p-0">
        <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
          <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
            <SheetTitle>New server</SheetTitle>
            <SheetDescription>Add a new server to an environment.</SheetDescription>
          </SheetHeader>

          <div ref={scrollBodyRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/*
              role="alert" so this is announced even though it can sit
              scrolled out of view in a tall sheet. It is NOT focused: moving
              focus onto a non-interactive banner strands keyboard users
              somewhere they cannot act, and the live region already does the
              announcing. Scrolling the body back to the top (see
              applyServerError) is enough to make it visible. Note this and
              the field errors are mutually exclusive in practice —
              applyServerError only falls through to formError when no field
              error was mappable — so this never competes with the
              focus-first-invalid behaviour below.
            */}
            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                aria-invalid={!!fieldErrors.display_name}
                aria-describedby={fieldErrors.display_name ? errorId("display_name") : undefined}
                className={cn(fieldErrors.display_name && INVALID_CONTROL)}
              />
              {fieldErrors.display_name && (
                <p id={errorId("display_name")} className="text-xs text-danger">
                  {fieldErrors.display_name}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="environment">Environment</Label>
              <EnvironmentPicker
                id="environment"
                value={environmentId}
                onChange={setEnvironmentId}
                placeholder="Select an environment"
                aria-invalid={!!fieldErrors.environment_id}
                aria-describedby={fieldErrors.environment_id ? errorId("environment") : undefined}
                className={cn(fieldErrors.environment_id && INVALID_CONTROL)}
              />
              {fieldErrors.environment_id && (
                <p id={errorId("environment")} className="text-xs text-danger">
                  {fieldErrors.environment_id}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="hostname">Hostname</Label>
                <Input
                  id="hostname"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  required
                  aria-invalid={!!fieldErrors.hostname}
                  aria-describedby={fieldErrors.hostname ? errorId("hostname") : undefined}
                  className={cn(fieldErrors.hostname && INVALID_CONTROL)}
                />
                {fieldErrors.hostname && (
                  <p id={errorId("hostname")} className="text-xs text-danger">
                    {fieldErrors.hostname}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <OptionalLabel htmlFor="ip_address">IP address</OptionalLabel>
                <Input
                  id="ip_address"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  aria-invalid={!!fieldErrors.ip_address}
                  aria-describedby={fieldErrors.ip_address ? errorId("ip_address") : undefined}
                  className={cn(fieldErrors.ip_address && INVALID_CONTROL)}
                />
                {fieldErrors.ip_address && (
                  <p id={errorId("ip_address")} className="text-xs text-danger">
                    {fieldErrors.ip_address}
                  </p>
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
                aria-invalid={!!fieldErrors.tech_stack}
                aria-describedby={fieldErrors.tech_stack ? errorId("tech_stack") : undefined}
                className={cn(fieldErrors.tech_stack && INVALID_CONTROL)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated.</p>
              {fieldErrors.tech_stack && (
                <p id={errorId("tech_stack")} className="text-xs text-danger">
                  {fieldErrors.tech_stack}
                </p>
              )}
            </div>

            <fieldset className={cn(panelSurface(), "space-y-4 p-3")}>
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
                    <SelectTrigger
                      id="service_type"
                      aria-required="true"
                      aria-invalid={!!fieldErrors.service_type}
                      aria-describedby={fieldErrors.service_type ? errorId("service_type") : undefined}
                      className={cn(fieldErrors.service_type && INVALID_CONTROL)}
                    >
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
                    <p id={errorId("service_type")} className="text-xs text-danger">
                      {fieldErrors.service_type}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="access_method">Access method</Label>
                  <Select
                    value={accessMethod}
                    onValueChange={(v) => setAccessMethod(v as (typeof ACCESS_METHODS)[number])}
                  >
                    <SelectTrigger
                      id="access_method"
                      aria-required="true"
                      aria-invalid={!!fieldErrors.access_method}
                      aria-describedby={fieldErrors.access_method ? errorId("access_method") : undefined}
                      className={cn(fieldErrors.access_method && INVALID_CONTROL)}
                    >
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
                    <p id={errorId("access_method")} className="text-xs text-danger">
                      {fieldErrors.access_method}
                    </p>
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
                    aria-invalid={!!fieldErrors.access_host}
                    aria-describedby={fieldErrors.access_host ? errorId("access_host") : undefined}
                    className={cn(fieldErrors.access_host && INVALID_CONTROL)}
                  />
                  {fieldErrors.access_host && (
                    <p id={errorId("access_host")} className="text-xs text-danger">
                      {fieldErrors.access_host}
                    </p>
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
                    aria-invalid={!!fieldErrors.access_port}
                    aria-describedby={fieldErrors.access_port ? errorId("access_port") : undefined}
                    className={cn(fieldErrors.access_port && INVALID_CONTROL)}
                  />
                  {fieldErrors.access_port && (
                    <p id={errorId("access_port")} className="text-xs text-danger">
                      {fieldErrors.access_port}
                    </p>
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
                  aria-invalid={!!fieldErrors.access_path}
                  aria-describedby={fieldErrors.access_path ? errorId("access_path") : undefined}
                  className={cn(fieldErrors.access_path && INVALID_CONTROL)}
                />
                <p className="text-xs text-muted-foreground">
                  Optional; must start with / if provided. Not restricted to web access — shown
                  regardless of access method so nothing is lost if you switch methods later.
                </p>
                {fieldErrors.access_path && (
                  <p id={errorId("access_path")} className="text-xs text-danger">
                    {fieldErrors.access_path}
                  </p>
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
                aria-invalid={!!fieldErrors.monitoring_url}
                aria-describedby={fieldErrors.monitoring_url ? errorId("monitoring_url") : undefined}
                className={cn(fieldErrors.monitoring_url && INVALID_CONTROL)}
              />
              <p className="text-xs text-muted-foreground">
                A separate monitoring dashboard link — distinct from this server's access details
                above.
              </p>
              {fieldErrors.monitoring_url && (
                <p id={errorId("monitoring_url")} className="text-xs text-danger">
                  {fieldErrors.monitoring_url}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <OptionalLabel htmlFor="notes">Notes</OptionalLabel>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-invalid={!!fieldErrors.notes}
                aria-describedby={fieldErrors.notes ? errorId("notes") : undefined}
                className={cn(fieldErrors.notes && INVALID_CONTROL)}
              />
              {fieldErrors.notes && (
                <p id={errorId("notes")} className="text-xs text-danger">
                  {fieldErrors.notes}
                </p>
              )}
            </div>
          </div>

          <SheetFooter>
            <SheetClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
