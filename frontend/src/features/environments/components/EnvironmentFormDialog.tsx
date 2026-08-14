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
import { ProjectPicker } from "@/components/ProjectPicker";
import { ConflictState } from "@/components/state/ConflictState";
import { VpnResourcePicker } from "./VpnResourcePicker";
import { ApiError, apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useProjects } from "@/hooks/useProjects";
import {
  useEnvironment,
  useCreateEnvironment,
  useUpdateEnvironment,
  type Environment,
} from "@/hooks/useEnvironments";
import { useConflictResolution } from "@/hooks/useConflictResolution";

interface EnvironmentInput {
  name: string;
  description?: string;
}

interface FieldErrors {
  name?: string;
  project_id?: string;
  description?: string;
}

/** Shape of `error.details` for a 400 VALIDATION_ERROR: Zod's ZodError.flatten(). */
interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
}

const EDITABLE_FIELDS = ["name", "project_id", "description"] as const;

// Environments have a duplicate-name 409, scoped to (project_id, name) —
// confirmed against environments.service.ts (same shape as Projects' own
// (client_id, name) scoped conflict). There's nothing to "reload" or "retry"
// for a name collision, so route it to the Name field instead of
// ConflictState, same reasoning as ClientFormDialog/ProjectFormDialog.
const DUPLICATE_NAME_MESSAGE = "An environment with this name already exists for this project";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; absent (undefined) in create mode. */
  environment?: Environment;
}

export default function EnvironmentFormDialog({ open, onOpenChange, environment }: Props) {
  const isEdit = Boolean(environment);
  // Used only to resolve the current project's display name on edit (the
  // picker itself is create-only) — same pattern ProjectFormDialog uses for
  // the client_id-immutable-on-edit case.
  const { data: projects = [] } = useProjects();
  const createEnvironment = useCreateEnvironment();
  const updateEnvironment = useUpdateEnvironment();
  const { refetch: refetchEnvironment } = useEnvironment(environment?.id);
  const { conflict: conflictInfo, isConflict, captureConflict, clearConflict } = useConflictResolution();

  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState("");
  const [vpnResourceId, setVpnResourceId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  // Re-seed the form every time the dialog opens, from the environment
  // passed in (create mode: blank; edit mode: the currently-loaded row).
  useEffect(() => {
    if (!open) return;
    if (environment) {
      setName(environment.name);
      setProjectId(environment.project_id);
      setDescription(environment.description ?? "");
      setVpnResourceId(environment.vpn_resource_id);
      setUpdatedAt(environment.updated_at);
    } else {
      setName("");
      setProjectId(undefined);
      setDescription("");
      setVpnResourceId(null);
      setUpdatedAt(undefined);
    }
    setFieldErrors({});
    setFormError(undefined);
    clearConflict();
  }, [environment, open, clearConflict]);

  function buildInput(): EnvironmentInput {
    return {
      name: name.trim(),
      description: description.trim() || undefined,
    };
  }

  async function submit(input: EnvironmentInput) {
    if (isEdit && environment) {
      // project_id is not sent — the API rejects it entirely on PATCH (an
      // environment can't be re-parented to a different project this way).
      // vpn_resource_id IS sent here (edit-only) — the backend rejects it
      // entirely on create, so it's never part of the create payload below.
      await updateEnvironment.mutateAsync({
        id: environment.id,
        data: { ...input, vpn_resource_id: vpnResourceId, updated_at: updatedAt ?? environment.updated_at },
      });
    } else {
      if (!projectId) return;
      await createEnvironment.mutateAsync({ ...input, project_id: projectId });
    }
  }

  /**
   * Applies a caught mutation error to local UI state: a stale-write 409
   * goes to the conflict primitive, a duplicate-name 409 or a 400
   * VALIDATION_ERROR maps to per-field messages when the shape supports it,
   * everything else becomes a form-level message. Never swallowed — every
   * branch leaves something visible to the user.
   */
  function applyServerError(err: unknown): void {
    const title = isEdit ? "Couldn't update environment" : "Couldn't create environment";

    if (!(err instanceof ApiError)) {
      setFormError("Something went wrong. Please try again.");
      toast({ title, description: apiErrorMessage(err), variant: "destructive" });
      return;
    }

    if (err.status === 409) {
      if (err.message === DUPLICATE_NAME_MESSAGE) {
        setFieldErrors({ name: err.message });
        toast({ title, description: err.message, variant: "destructive" });
        return;
      }
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
    if (!input.name) {
      nextErrors.name = "Name is required.";
    }
    if (!isEdit && !projectId) {
      nextErrors.project_id = "Project is required.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    try {
      await submit(input);
      toast({ title: isEdit ? "Environment updated" : "Environment created" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  async function handleReloadLatest() {
    const result = await refetchEnvironment();
    if (result.data) {
      setName(result.data.name);
      setDescription(result.data.description ?? "");
      setVpnResourceId(result.data.vpn_resource_id);
      setUpdatedAt(result.data.updated_at);
    }
    clearConflict();
  }

  async function handleRetryWithLatest() {
    const result = await refetchEnvironment();
    if (!result.data) return;

    const freshUpdatedAt = result.data.updated_at;
    setUpdatedAt(freshUpdatedAt);
    clearConflict();

    // Keep the user's current field values; only the optimistic-lock stamp
    // is refreshed before retrying.
    try {
      if (environment) {
        await updateEnvironment.mutateAsync({
          id: environment.id,
          data: { ...buildInput(), vpn_resource_id: vpnResourceId, updated_at: freshUpdatedAt },
        });
      }
      toast({ title: "Environment updated" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = createEnvironment.isPending || updateEnvironment.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit environment" : "New environment"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this environment's details." : "Add a new environment for a project."}
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <p className="text-sm text-danger">{formError}</p>}

            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              {fieldErrors.name && <p className="text-xs text-danger">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="project">Project</Label>
              {isEdit ? (
                <Input
                  id="project"
                  value={projects.find((p) => p.id === projectId)?.name ?? "—"}
                  disabled
                  readOnly
                />
              ) : (
                <ProjectPicker
                  id="project"
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="Select a project"
                />
              )}
              {fieldErrors.project_id && (
                <p className="text-xs text-danger">{fieldErrors.project_id}</p>
              )}
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  An environment's project can't be changed after creation.
                </p>
              )}
            </div>

            {isEdit && (
              <div className="space-y-1">
                <Label>VPN resource</Label>
                <VpnResourcePicker value={vpnResourceId} onChange={setVpnResourceId} />
                <p className="text-xs text-muted-foreground">
                  Any non-deleted resource can be linked here — the backend doesn't restrict this to a
                  particular resource type.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {fieldErrors.description && (
                <p className="text-xs text-danger">{fieldErrors.description}</p>
              )}
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
