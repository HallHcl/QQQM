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
import { ConflictState } from "@/components/state/ConflictState";
import { ApiError } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useResource, useUpdateResource, type ResourceListItem } from "@/hooks/useResources";
import { useConflictResolution } from "@/hooks/useConflictResolution";

interface FieldErrors {
  title?: string;
}

/** Shape of `error.details` for a 400 VALIDATION_ERROR: Zod's ZodError.flatten(). */
interface ValidationDetails {
  fieldErrors?: Record<string, string[]>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The resource being edited. Dialog is only ever opened with one selected. */
  resource: ResourceListItem | undefined;
}

/**
 * Metadata-only edit form: title/category/tags. Deliberately has no `type`
 * field (immutable after creation — structurally absent from the backend's
 * update schema, not just disabled) and no content/external_url fields
 * (content changes are a separate action — POST /:id/versions via
 * ResourceEditor's "Add version" flow, untouched by this dialog).
 */
export default function ResourceMetadataDialog({ open, onOpenChange, resource }: Props) {
  const updateResource = useUpdateResource();
  const { refetch: refetchResource } = useResource(resource?.id);
  const { conflict, isConflict, captureConflict, clearConflict } = useConflictResolution();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  // Re-seed the form every time the dialog opens, from the resource passed in.
  useEffect(() => {
    if (!open || !resource) return;
    setTitle(resource.title);
    setCategory(resource.category ?? "");
    setTagsInput(resource.tags.join(", "));
    setUpdatedAt(resource.updated_at);
    setFieldErrors({});
    setFormError(undefined);
    clearConflict();
  }, [resource, open, clearConflict]);

  function parseTags(): string[] {
    return tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  /**
   * No duplicate-constraint 409 exists for resource metadata (verified
   * against resources.service.ts's updateMetadata — the only 409 source is
   * the optimistic-lock date_trunc comparison; there is no title-uniqueness
   * query, unlike Clients). So every 409 here is a stale-write conflict —
   * always routed to ConflictState, no field-error branching needed.
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
      const messages = details?.fieldErrors?.title;
      if (messages?.length) {
        setFieldErrors({ title: messages[0] });
        return;
      }
    }

    setFormError(err.message);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!resource) return;
    setFieldErrors({});
    setFormError(undefined);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFieldErrors({ title: "Title is required." });
      return;
    }

    try {
      await updateResource.mutateAsync({
        id: resource.id,
        data: {
          title: trimmedTitle,
          category: category.trim() || undefined,
          tags: parseTags(),
          updated_at: updatedAt ?? resource.updated_at,
        },
      });
      toast({ title: "Resource updated" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  async function handleReloadLatest() {
    const result = await refetchResource();
    if (result.data) {
      setTitle(result.data.title);
      setCategory(result.data.category ?? "");
      setTagsInput(result.data.tags.join(", "));
      setUpdatedAt(result.data.updated_at);
    }
    clearConflict();
  }

  async function handleRetryWithLatest() {
    if (!resource) return;
    const result = await refetchResource();
    if (!result.data) return;

    const freshUpdatedAt = result.data.updated_at;
    setUpdatedAt(freshUpdatedAt);
    clearConflict();

    try {
      await updateResource.mutateAsync({
        id: resource.id,
        data: {
          title: title.trim(),
          category: category.trim() || undefined,
          tags: parseTags(),
          updated_at: freshUpdatedAt,
        },
      });
      toast({ title: "Resource updated" });
      onOpenChange(false);
    } catch (err) {
      applyServerError(err);
    }
  }

  const isSubmitting = updateResource.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit resource details</DialogTitle>
          <DialogDescription>
            Title, category, and tags only. Type can&apos;t be changed after creation, and content
            changes go through &quot;Add version&quot; instead.
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
              <Label htmlFor="resource-title">Title</Label>
              <Input id="resource-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              {fieldErrors.title && <p className="text-xs text-danger">{fieldErrors.title}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="resource-category">Category</Label>
              <Input
                id="resource-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="resource-tags">Tags</Label>
              <Input
                id="resource-tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="comma, separated, tags"
              />
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
