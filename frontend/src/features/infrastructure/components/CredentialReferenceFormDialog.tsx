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
import { ApiError } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import {
  useCreateCredentialReference,
  useUpdateCredentialReference,
  type CredentialReference,
} from "@/hooks/useCredentialReferences";

/** Verified against backend/src/validators/credentialReferences.validator.ts — same enum as Server's access_method. */
const ACCESS_METHODS = ["ssh", "rdp", "telnet", "web", "other"] as const;

const ACCESS_METHOD_LABELS: Record<(typeof ACCESS_METHODS)[number], string> = {
  ssh: "SSH",
  rdp: "RDP",
  telnet: "Telnet",
  web: "Web",
  other: "Other",
};

/** Sentinel for the Select's "not set" option — the field itself is optional/nullable, never this literal string. */
const UNSET = "__unset__";

interface CredentialReferenceInput {
  label: string;
  reference_location: string;
  applies_to_access_method?: (typeof ACCESS_METHODS)[number];
  notes?: string;
}

interface FieldErrors {
  label?: string;
  reference_location?: string;
  applies_to_access_method?: string;
  notes?: string;
}

/** Shape of `error.details` for a 400 VALIDATION_ERROR: Zod's ZodError.flatten(). */
interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
}

const EDITABLE_FIELDS = ["label", "reference_location", "applies_to_access_method", "notes"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  /** Present in edit mode; absent (undefined) in create mode. */
  credentialReference?: CredentialReference;
}

/**
 * No optimistic-lock plumbing here (no ConflictState, no updated_at) —
 * credential_references has no updated_at column and the generated update
 * schema doesn't accept one, so there is nothing to lock against. This is a
 * known, backend-imposed limitation: two admins editing the same credential
 * reference at once will silently last-write-wins with no conflict
 * detection, unlike every other entity in this app. Not something to work
 * around client-side.
 */
export default function CredentialReferenceFormDialog({
  open,
  onOpenChange,
  serverId,
  credentialReference,
}: Props) {
  const isEdit = Boolean(credentialReference);
  const createCredentialReference = useCreateCredentialReference();
  const updateCredentialReference = useUpdateCredentialReference();

  const [label, setLabel] = useState("");
  const [referenceLocation, setReferenceLocation] = useState("");
  const [appliesToAccessMethod, setAppliesToAccessMethod] = useState<
    (typeof ACCESS_METHODS)[number] | undefined
  >(undefined);
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (credentialReference) {
      setLabel(credentialReference.label);
      setReferenceLocation(credentialReference.reference_location);
      setAppliesToAccessMethod(credentialReference.applies_to_access_method ?? undefined);
      setNotes(credentialReference.notes ?? "");
    } else {
      setLabel("");
      setReferenceLocation("");
      setAppliesToAccessMethod(undefined);
      setNotes("");
    }
    setFieldErrors({});
    setFormError(undefined);
  }, [credentialReference, open]);

  function buildInput(): CredentialReferenceInput {
    return {
      label: label.trim(),
      reference_location: referenceLocation.trim(),
      applies_to_access_method: appliesToAccessMethod,
      notes: notes.trim() || undefined,
    };
  }

  /**
   * No 409 handling — nothing in credentialReferences.service.ts can produce
   * one (no unique constraint, no updated_at check to fail). A 400
   * VALIDATION_ERROR maps to per-field messages when the shape supports it;
   * everything else (including a 404 if the record was deleted by someone
   * else mid-edit) becomes a form-level message.
   */
  function applyServerError(err: unknown): void {
    if (!(err instanceof ApiError)) {
      setFormError("Something went wrong. Please try again.");
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

    if (!input.label) {
      nextErrors.label = "Label is required.";
    }
    if (!input.reference_location) {
      nextErrors.reference_location = "Reference location is required.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    try {
      if (isEdit && credentialReference) {
        await updateCredentialReference.mutateAsync({ id: credentialReference.id, data: input });
      } else {
        await createCredentialReference.mutateAsync({ serverId, data: input });
      }
      toast({ title: isEdit ? "Credential reference updated" : "Credential reference added" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = createCredentialReference.isPending || updateCredentialReference.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit credential reference" : "Add credential reference"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update where this credential is stored."
              : "Point to where this server's credentials are stored — not the credentials themselves."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="space-y-1">
            <Label htmlFor="cr_label">Label</Label>
            <Input id="cr_label" value={label} onChange={(e) => setLabel(e.target.value)} />
            {fieldErrors.label && <p className="text-xs text-danger">{fieldErrors.label}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="cr_reference_location">Reference location</Label>
            <Input
              id="cr_reference_location"
              value={referenceLocation}
              onChange={(e) => setReferenceLocation(e.target.value)}
              placeholder="e.g. a vault path, not the secret itself"
            />
            {fieldErrors.reference_location && (
              <p className="text-xs text-danger">{fieldErrors.reference_location}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Applies to access method</Label>
            <Select
              value={appliesToAccessMethod ?? UNSET}
              onValueChange={(v) =>
                setAppliesToAccessMethod(v === UNSET ? undefined : (v as (typeof ACCESS_METHODS)[number]))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>Not set</SelectItem>
                {ACCESS_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {ACCESS_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.applies_to_access_method && (
              <p className="text-xs text-danger">{fieldErrors.applies_to_access_method}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="cr_notes">Notes</Label>
            <Textarea id="cr_notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
