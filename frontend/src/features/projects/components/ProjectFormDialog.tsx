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
import { ConflictState } from "@/components/state/ConflictState";
import { ApiError, apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useClients } from "@/hooks/useClients";
import { useProject, useCreateProject, useUpdateProject } from "@/hooks/useProjects";
import { useConflictResolution } from "@/hooks/useConflictResolution";
import type { Project } from "@/types";

interface ProjectInput {
  name: string;
  description?: string;
  owner_status?: string;
}

interface FieldErrors {
  name?: string;
  client_id?: string;
  description?: string;
  owner_status?: string;
}

/** Shape of `error.details` for a 400 VALIDATION_ERROR: Zod's ZodError.flatten(). */
interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
}

const EDITABLE_FIELDS = ["name", "client_id", "description", "owner_status"] as const;

// Projects have a duplicate-name 409, like Clients, but scoped to
// (client_id, name) rather than global (confirmed against
// projects.service.ts). Same reasoning as ClientFormDialog: there's
// nothing to "reload" or "retry" for a name collision — route it to the
// Name field instead of ConflictState. The stale-write 409 message is
// different ("Project was modified by someone else; refresh and try
// again") and still goes through the conflict flow.
const DUPLICATE_NAME_MESSAGE = "A project with this name already exists for this client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; absent (undefined) in create mode. */
  project?: Project;
}

export default function ProjectFormDialog({ open, onOpenChange, project }: Props) {
  const isEdit = Boolean(project);
  // Create mode's picker only ever offers active clients (the backend
  // requires an active client_id on create — projects.service.ts's
  // createProject rejects a deleted one with a 400), but edit mode's
  // read-only display must still resolve a name for a project whose client
  // has since been soft-deleted (projects don't cascade-hide when their
  // client does — decisions.md #6) — a separate deleted:"true" fetch covers
  // that, since Clients' `deleted` filter has no "all" mode (decisions.md #11).
  const { data: activeClients = [] } = useClients();
  const { data: deletedClients = [] } = useClients({ deleted: "true" });
  const clients = isEdit ? [...activeClients, ...deletedClients] : activeClients;
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const { refetch: refetchProject } = useProject(project?.id);
  const { conflict: conflictInfo, isConflict, captureConflict, clearConflict } = useConflictResolution();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState("");
  const [ownerStatus, setOwnerStatus] = useState("active");
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  // Re-seed the form every time the dialog opens, from the project passed
  // in (create mode: blank; edit mode: the currently-loaded row).
  useEffect(() => {
    if (!open) return;
    if (project) {
      setName(project.name);
      setClientId(project.client_id);
      setDescription(project.description ?? "");
      setOwnerStatus(project.owner_status);
      setUpdatedAt(project.updated_at);
    } else {
      setName("");
      setClientId(undefined);
      setDescription("");
      setOwnerStatus("active");
      setUpdatedAt(undefined);
    }
    setFieldErrors({});
    setFormError(undefined);
    clearConflict();
  }, [project, open, clearConflict]);

  function buildInput(): ProjectInput {
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      owner_status: ownerStatus.trim() || undefined,
    };
  }

  async function submit(input: ProjectInput) {
    if (isEdit && project) {
      // client_id is not sent — the API rejects it entirely on PATCH
      // (a project can't be re-parented to a different client this way).
      await updateProject.mutateAsync({
        id: project.id,
        data: { ...input, updated_at: updatedAt ?? project.updated_at },
      });
    } else {
      if (!clientId) return;
      await createProject.mutateAsync({ ...input, client_id: clientId });
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
    const title = isEdit ? "Couldn't update project" : "Couldn't create project";

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
    if (!isEdit && !clientId) {
      nextErrors.client_id = "Client is required.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    try {
      await submit(input);
      toast({ title: isEdit ? "Project updated" : "Project created" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  async function handleReloadLatest() {
    const result = await refetchProject();
    if (result.data) {
      setName(result.data.name);
      setDescription(result.data.description ?? "");
      setOwnerStatus(result.data.owner_status);
      setUpdatedAt(result.data.updated_at);
    }
    clearConflict();
  }

  async function handleRetryWithLatest() {
    const result = await refetchProject();
    if (!result.data) return;

    const freshUpdatedAt = result.data.updated_at;
    setUpdatedAt(freshUpdatedAt);
    clearConflict();

    // Keep the user's current field values; only the optimistic-lock stamp
    // is refreshed before retrying.
    try {
      if (project) {
        await updateProject.mutateAsync({
          id: project.id,
          data: { ...buildInput(), updated_at: freshUpdatedAt },
        });
      }
      toast({ title: "Project updated" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = createProject.isPending || updateProject.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this project's details." : "Add a new project for a client."}
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
              <Label htmlFor="client">Client</Label>
              {isEdit ? (
                <Input
                  id="client"
                  value={clients.find((c) => c.id === clientId)?.name ?? "—"}
                  disabled
                  readOnly
                />
              ) : (
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger id="client">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {fieldErrors.client_id && (
                <p className="text-xs text-danger">{fieldErrors.client_id}</p>
              )}
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  A project's client can't be changed after creation.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="owner_status">Status</Label>
              <Input
                id="owner_status"
                value={ownerStatus}
                onChange={(e) => setOwnerStatus(e.target.value)}
              />
              {fieldErrors.owner_status && (
                <p className="text-xs text-danger">{fieldErrors.owner_status}</p>
              )}
            </div>

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
