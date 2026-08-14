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
import { usePerson, useCreatePerson, useUpdatePerson } from "@/hooks/usePeople";
import { useConflictResolution } from "@/hooks/useConflictResolution";
import { PEOPLE_TYPES, PEOPLE_TYPE_LABELS } from "@/lib/peopleTypes";
import type { Person, PeopleType } from "@/types";

interface PersonInput {
  name: string;
  email?: string;
  phone?: string;
  type: PeopleType;
  notes?: string;
}

interface FieldErrors {
  name?: string;
  email?: string;
  phone?: string;
  type?: string;
  notes?: string;
}

/** Shape of `error.details` for a 400 VALIDATION_ERROR: Zod's ZodError.flatten(). */
interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
}

const EDITABLE_FIELDS = ["name", "email", "phone", "type", "notes"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; absent (undefined) in create mode. */
  person?: Person;
}

export default function PersonFormDialog({ open, onOpenChange, person }: Props) {
  const isEdit = Boolean(person);
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const { refetch: refetchPerson } = usePerson(person?.id);
  const { conflict, isConflict, captureConflict, clearConflict } = useConflictResolution();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<PeopleType>("internal_engineer");
  const [notes, setNotes] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  // Re-seed the form every time the dialog opens, from the person passed in
  // (create mode: blank; edit mode: the currently-selected row).
  useEffect(() => {
    if (!open) return;
    if (person) {
      setName(person.name);
      setEmail(person.email ?? "");
      setPhone(person.phone ?? "");
      setType(person.type);
      setNotes(person.notes ?? "");
      setUpdatedAt(person.updated_at);
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setType("internal_engineer");
      setNotes("");
      setUpdatedAt(undefined);
    }
    setFieldErrors({});
    setFormError(undefined);
    clearConflict();
  }, [person, open, clearConflict]);

  function buildInput(): PersonInput {
    return {
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      type,
      notes: notes.trim() || undefined,
    };
  }

  async function submit(input: PersonInput) {
    if (isEdit && person) {
      await updatePerson.mutateAsync({
        id: person.id,
        data: { ...input, updated_at: updatedAt ?? person.updated_at },
      });
    } else {
      await createPerson.mutateAsync(input);
    }
  }

  /**
   * There is no name/email-uniqueness constraint on Person (verified against
   * people.service.ts — the only 409 sources are the update optimistic lock
   * and, on a different endpoint, the person-client-link duplicate check),
   * so every 409 here is a stale-write conflict — always routed to
   * ConflictState. 400 VALIDATION_ERROR maps to per-field messages when the
   * shape supports it, everything else becomes a form-level message.
   */
  function applyServerError(err: unknown): void {
    const title = isEdit ? "Couldn't update person" : "Couldn't create person";

    if (!(err instanceof ApiError)) {
      setFormError("Something went wrong. Please try again.");
      toast({ title, description: apiErrorMessage(err), variant: "destructive" });
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
      toast({ title: isEdit ? "Person updated" : "Person created" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  async function handleReloadLatest() {
    const result = await refetchPerson();
    if (result.data) {
      setName(result.data.name);
      setEmail(result.data.email ?? "");
      setPhone(result.data.phone ?? "");
      setType(result.data.type);
      setNotes(result.data.notes ?? "");
      setUpdatedAt(result.data.updated_at);
    }
    clearConflict();
  }

  async function handleRetryWithLatest() {
    if (!person) return;
    const result = await refetchPerson();
    if (!result.data) return;

    const freshUpdatedAt = result.data.updated_at;
    setUpdatedAt(freshUpdatedAt);
    clearConflict();

    // Keep the user's current field values; only the optimistic-lock stamp
    // is refreshed before retrying.
    try {
      await updatePerson.mutateAsync({
        id: person.id,
        data: { ...buildInput(), updated_at: freshUpdatedAt },
      });
      toast({ title: "Person updated" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = createPerson.isPending || updatePerson.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit person" : "New person"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this person's details." : "Add a new person."}
          </DialogDescription>
        </DialogHeader>

        {isConflict ? (
          <ConflictState
            message={
              conflict?.message ?? "This record was changed by someone else since you loaded it."
            }
            onReloadLatest={handleReloadLatest}
            onKeepEditing={handleRetryWithLatest}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <p className="text-sm text-danger">{formError}</p>}

            <div className="space-y-1">
              <Label htmlFor="person-name">Name</Label>
              <Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} />
              {fieldErrors.name && <p className="text-xs text-danger">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PeopleType)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PEOPLE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PEOPLE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.type && <p className="text-xs text-danger">{fieldErrors.type}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="person-email">Email</Label>
              <Input
                id="person-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {fieldErrors.email && <p className="text-xs text-danger">{fieldErrors.email}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="person-phone">Phone</Label>
              <Input id="person-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {fieldErrors.phone && <p className="text-xs text-danger">{fieldErrors.phone}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="person-notes">Notes</Label>
              <Textarea
                id="person-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
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
