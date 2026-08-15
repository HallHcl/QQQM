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
import { useClient, useCreateClient, useUpdateClient } from "@/hooks/useClients";
import { useConflictResolution } from "@/hooks/useConflictResolution";
import type { Client } from "@/types";

const STATUS_OPTIONS = ["active", "inactive"];

interface ClientInput {
  name: string;
  status?: string;
  description?: string;
}

interface FieldErrors {
  name?: string;
  status?: string;
  description?: string;
}

/** Shape of `error.details` for a 400 VALIDATION_ERROR: Zod's ZodError.flatten(). */
interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
}

const EDITABLE_FIELDS = ["name", "status", "description"] as const;

// Both stale-updated_at conflicts and duplicate-name conflicts return 409
// CONFLICT with no distinguishing field in the body (per the Part 20c
// investigation of clients.service.ts) — but the backend's message string
// for the name-uniqueness case is a stable literal constant, so it's cheap
// to branch on. Unlike a stale write, there's nothing to "reload" or
// "retry with a fresh updated_at" for a name collision — it's the same
// class of problem as a 400 VALIDATION_ERROR, so route it through the
// field-error channel instead of ConflictState.
const DUPLICATE_NAME_MESSAGE = "A client with this name already exists";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; absent (undefined) in create mode. */
  client?: Client;
}

export default function ClientFormDialog({ open, onOpenChange, client }: Props) {
  const isEdit = Boolean(client);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  // Gated on `open` so this unsubscribes once the dialog closes — otherwise
  // it stays subscribed on the last-edited client's id, and a subsequent
  // delete of that same record trips the list's broad invalidateQueries
  // into a pointless background refetch of a now-deleted row (404 in
  // console, no user-facing effect, but noisy and wasteful).
  const { refetch: refetchClient } = useClient(client?.id, { enabled: open });
  const { conflict: conflictInfo, isConflict, captureConflict, clearConflict } = useConflictResolution();

  const [name, setName] = useState("");
  const [status, setStatus] = useState("active");
  const [description, setDescription] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  // Re-seed the form every time the dialog opens, from the client passed in
  // (create mode: blank; edit mode: the currently-loaded row).
  useEffect(() => {
    if (!open) return;
    if (client) {
      setName(client.name);
      setStatus(client.status);
      setDescription(client.description ?? "");
      setUpdatedAt(client.updated_at);
    } else {
      setName("");
      setStatus("active");
      setDescription("");
      setUpdatedAt(undefined);
    }
    setFieldErrors({});
    setFormError(undefined);
    clearConflict();
  }, [client, open, clearConflict]);

  function buildInput(): ClientInput {
    return {
      name: name.trim(),
      status: status || undefined,
      description: description.trim() || undefined,
    };
  }

  async function submit(input: ClientInput) {
    if (isEdit && client) {
      await updateClient.mutateAsync({
        id: client.id,
        data: { ...input, updated_at: updatedAt ?? client.updated_at },
      });
    } else {
      await createClient.mutateAsync(input);
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
    const title = isEdit ? "Couldn't update client" : "Couldn't create client";

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

    // Client-side validation before hitting the network, mirroring the
    // backend's minimum requirement (name is non-empty).
    if (!input.name) {
      setFieldErrors({ name: "Name is required." });
      return;
    }

    try {
      await submit(input);
      toast({ title: isEdit ? "Client updated" : "Client created" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  async function handleReloadLatest() {
    const result = await refetchClient();
    if (result.data) {
      setName(result.data.name);
      setStatus(result.data.status);
      setDescription(result.data.description ?? "");
      setUpdatedAt(result.data.updated_at);
    }
    clearConflict();
  }

  async function handleRetryWithLatest() {
    const result = await refetchClient();
    if (!result.data) return;

    const freshUpdatedAt = result.data.updated_at;
    setUpdatedAt(freshUpdatedAt);
    clearConflict();

    // Keep the user's current field values; only the optimistic-lock stamp
    // is refreshed before retrying.
    try {
      if (client) {
        await updateClient.mutateAsync({
          id: client.id,
          data: { ...buildInput(), updated_at: freshUpdatedAt },
        });
      }
      toast({ title: "Client updated" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = createClient.isPending || updateClient.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this client's details." : "Add a new client organization."}
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
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.status && <p className="text-xs text-danger">{fieldErrors.status}</p>}
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
