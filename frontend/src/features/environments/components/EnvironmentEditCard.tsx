import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionalLabel } from "@/components/ui/optional-label";
import { Textarea } from "@/components/ui/textarea";
import { ConflictState } from "@/components/state/ConflictState";
import { VpnResourcePicker } from "./VpnResourcePicker";
import { ApiError, apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useEnvironment, useUpdateEnvironment, type EnvironmentDetail } from "@/hooks/useEnvironments";
import { useConflictResolution } from "@/hooks/useConflictResolution";

interface EnvironmentInput {
  name: string;
  description?: string;
}

interface FieldErrors {
  name?: string;
  description?: string;
}

/** Shape of `error.details` for a 400 VALIDATION_ERROR: Zod's ZodError.flatten(). */
interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
}

const EDITABLE_FIELDS = ["name", "description"] as const;

// Environments have a duplicate-name 409, scoped to (project_id, name) —
// confirmed against environments.service.ts (same shape as Projects' own
// (client_id, name) scoped conflict). There's nothing to "reload" or "retry"
// for a name collision, so route it to the Name field instead of
// ConflictState, same reasoning as ClientFormDialog/ProjectFormDialog.
const DUPLICATE_NAME_MESSAGE = "An environment with this name already exists for this project";

interface Props {
  environment: EnvironmentDetail;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Inline edit form rendered in place of EnvironmentDetailPage's read-only
 * Card 1 content. Edit-only (the project field is always the immutable
 * read-only display — there's no picker here, unlike
 * EnvironmentFormDialog's create mode). Mounted fresh each time the user
 * enters edit mode, so all local field state seeds once from `environment`
 * with no re-seed effect needed; Cancel simply unmounts this without firing
 * a mutation, discarding any in-progress edits.
 */
export default function EnvironmentEditCard({ environment, onSaved, onCancel }: Props) {
  const updateEnvironment = useUpdateEnvironment();
  const { refetch: refetchEnvironment } = useEnvironment(environment.id);
  const { conflict: conflictInfo, isConflict, captureConflict, clearConflict } = useConflictResolution();

  const [name, setName] = useState(environment.name);
  const [description, setDescription] = useState(environment.description ?? "");
  const [vpnResourceId, setVpnResourceId] = useState<string | null>(environment.vpn_resource_id);
  const [updatedAt, setUpdatedAt] = useState(environment.updated_at);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  function buildInput(): EnvironmentInput {
    return {
      name: name.trim(),
      description: description.trim() || undefined,
    };
  }

  /**
   * Applies a caught mutation error to local UI state: a stale-write 409
   * goes to the conflict primitive, a duplicate-name 409 or a 400
   * VALIDATION_ERROR maps to per-field messages when the shape supports it,
   * everything else becomes a form-level message. Never swallowed — every
   * branch leaves something visible to the user.
   */
  function applyServerError(err: unknown): void {
    const title = "Couldn't update environment";

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

    if (!input.name) {
      nextErrors.name = "Name is required.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    try {
      // project_id is never sent — the API rejects it entirely on PATCH (an
      // environment can't be re-parented to a different project this way).
      await updateEnvironment.mutateAsync({
        id: environment.id,
        data: { ...input, vpn_resource_id: vpnResourceId, updated_at: updatedAt },
      });
      toast({ title: "Environment updated" });
      onSaved();
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
      await updateEnvironment.mutateAsync({
        id: environment.id,
        data: { ...buildInput(), vpn_resource_id: vpnResourceId, updated_at: freshUpdatedAt },
      });
      toast({ title: "Environment updated" });
      onSaved();
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = updateEnvironment.isPending;

  if (isConflict) {
    return (
      <ConflictState
        message={conflictInfo?.message ?? "This record was changed by someone else since you loaded it."}
        onReloadLatest={handleReloadLatest}
        onKeepEditing={handleRetryWithLatest}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <p className="text-sm text-danger">{formError}</p>}

      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        {fieldErrors.name && <p className="text-xs text-danger">{fieldErrors.name}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="project">Project</Label>
        <Input id="project" value={environment.project.name} disabled readOnly />
        <p className="text-xs text-muted-foreground">
          An environment's project can't be changed after creation.
        </p>
      </div>

      <div className="space-y-1">
        <OptionalLabel htmlFor="vpn-resource">VPN resource</OptionalLabel>
        <VpnResourcePicker id="vpn-resource" value={vpnResourceId} onChange={setVpnResourceId} />
        <p className="text-xs text-muted-foreground">
          Any non-deleted resource can be linked here — the backend doesn't restrict this to a
          particular resource type.
        </p>
      </div>

      <div className="space-y-1">
        <OptionalLabel htmlFor="description">Description</OptionalLabel>
        <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        {fieldErrors.description && <p className="text-xs text-danger">{fieldErrors.description}</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
