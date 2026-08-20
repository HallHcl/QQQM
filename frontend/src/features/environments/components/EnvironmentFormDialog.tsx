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
import { ProjectPicker } from "@/components/ProjectPicker";
import { ApiError, apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useCreateEnvironment } from "@/hooks/useEnvironments";

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
// (client_id, name) scoped conflict). There's nothing to "reload" or
// "retry" for a name collision, so route it to the Name field rather than
// a ConflictState (which this create-only dialog no longer has any use
// for — see EnvironmentEditCard for the edit-mode conflict flow).
const DUPLICATE_NAME_MESSAGE = "An environment with this name already exists for this project";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create-only. Editing an environment is handled inline on
 * EnvironmentDetailPage (EnvironmentEditCard) instead of through this
 * dialog — see the modal-to-detail-page migration. This component keeps
 * the "New environment" flow as a modal since there's no detail page to
 * navigate to for a record that doesn't exist yet.
 */
export default function EnvironmentFormDialog({ open, onOpenChange }: Props) {
  const createEnvironment = useCreateEnvironment();

  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  function reset() {
    setName("");
    setProjectId(undefined);
    setDescription("");
    setFieldErrors({});
    setFormError(undefined);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function buildInput(): EnvironmentInput {
    return {
      name: name.trim(),
      description: description.trim() || undefined,
    };
  }

  /**
   * Applies a caught mutation error to local UI state: a duplicate-name 409
   * or a 400 VALIDATION_ERROR maps to per-field messages when the shape
   * supports it, everything else becomes a form-level message. Never
   * swallowed — every branch leaves something visible to the user.
   */
  function applyServerError(err: unknown): void {
    const title = "Couldn't create environment";

    if (!(err instanceof ApiError)) {
      setFormError("Something went wrong. Please try again.");
      toast({ title, description: apiErrorMessage(err), variant: "destructive" });
      return;
    }

    if (err.status === 409 && err.message === DUPLICATE_NAME_MESSAGE) {
      setFieldErrors({ name: err.message });
      toast({ title, description: err.message, variant: "destructive" });
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
    if (!projectId) {
      nextErrors.project_id = "Project is required.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    if (!projectId) return;

    try {
      await createEnvironment.mutateAsync({ ...input, project_id: projectId });
      toast({ title: "Environment created" });
      handleOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = createEnvironment.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New environment</DialogTitle>
          <DialogDescription>Add a new environment for a project.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            {fieldErrors.name && <p className="text-xs text-danger">{fieldErrors.name}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="project">Project</Label>
            <ProjectPicker
              id="project"
              value={projectId}
              onChange={setProjectId}
              placeholder="Select a project"
            />
            {fieldErrors.project_id && (
              <p className="text-xs text-danger">{fieldErrors.project_id}</p>
            )}
          </div>

          <div className="space-y-1">
            <OptionalLabel htmlFor="description">Description</OptionalLabel>
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
      </DialogContent>
    </Dialog>
  );
}
