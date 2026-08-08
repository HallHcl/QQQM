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
import { ProjectPicker } from "@/components/ProjectPicker";
import { toast } from "@/hooks/use-toast";
import { useCreateResource } from "@/hooks/useResources";
import { useCreateResourceVersion, useResourceVersion } from "@/hooks/useResourceVersions";
import type { ResourceType } from "@/types";
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  validateResourceContentFields,
  type ResourceContentFieldErrors,
} from "@/lib/resourceTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "new-version";
  resourceId?: string;
  /**
   * The resource's own type — new-version mode has no Type select (type is
   * immutable), but every version still has to satisfy that same type's
   * content rules, so this is required to run validateResourceContentFields
   * in this mode. Unused in create mode.
   */
  resourceType?: ResourceType;
  /**
   * The resource's current_version_id. Used as the duplicate-content
   * comparison baseline regardless of which version the form was pre-filled
   * from — reverting to an old version still warns if that content matches
   * what's CURRENTLY live, not what it's pre-filled from.
   */
  currentVersionId?: string | null;
  /**
   * Which version's content to pre-fill the form with in new-version mode.
   * Omit (or pass the same id as currentVersionId) for the plain "Add
   * version" flow — pre-fills from the current version. Pass a historical
   * version's id for "Revert to this version".
   */
  prefillVersionId?: string;
}

export default function ResourceEditor({
  open,
  onOpenChange,
  mode,
  resourceId,
  resourceType,
  currentVersionId,
  prefillVersionId,
}: Props) {
  const createResource = useCreateResource();
  const createVersion = useCreateResourceVersion(resourceId ?? "");

  const isNewVersion = mode === "new-version";
  const effectivePrefillId = prefillVersionId ?? currentVersionId ?? undefined;
  const isReverting = Boolean(
    effectivePrefillId && currentVersionId && effectivePrefillId !== currentVersionId
  );

  // Fetches the version whose content pre-fills the form. Deliberately
  // calls the same useResourceVersion hook VersionHistoryPanel already
  // uses — when the ids match (e.g. the user just viewed this exact
  // version in the history panel), React Query's cache serves it instantly
  // with no extra network round-trip; this is a fresh fetch only when they
  // don't.
  const { data: prefillVersion, isLoading: isPrefillLoading } = useResourceVersion(
    isNewVersion ? resourceId : undefined,
    isNewVersion ? effectivePrefillId : undefined
  );

  // The duplicate-content check always compares against the CURRENT
  // version, never against whatever the form happens to be pre-filled
  // from. Only fetched separately when reverting to a non-current version
  // — the plain "Add version" flow pre-fills from the current version
  // already, so prefillVersion doubles as the baseline and no second
  // request is made.
  const { data: fetchedBaselineVersion } = useResourceVersion(
    isNewVersion && isReverting ? resourceId : undefined,
    isNewVersion && isReverting ? currentVersionId ?? undefined : undefined
  );
  const baselineVersion = isReverting ? fetchedBaselineVersion : prefillVersion;

  const [title, setTitle] = useState("");
  const [type, setType] = useState<ResourceType>("runbook");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ResourceContentFieldErrors>({});
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);

  // Re-seed the new-version form from the pre-fill version's content every
  // time the dialog opens (or the pre-fill target changes, e.g. switching
  // from "Add version" to "Revert to v2"). Create mode is untouched by
  // this — it keeps its own blank-by-default fields via reset().
  useEffect(() => {
    if (!open || !isNewVersion || !prefillVersion) return;
    setContent(prefillVersion.content ?? "");
    setExternalUrl(prefillVersion.external_url ?? "");
    setCommitMessage("");
    setFieldErrors({});
    setShowDuplicateConfirm(false);
  }, [open, isNewVersion, prefillVersion]);

  function reset() {
    setTitle("");
    setType("runbook");
    setProjectId(undefined);
    setCategory("");
    setContent("");
    setExternalUrl("");
    setCommitMessage("");
    setFieldErrors({});
    setShowDuplicateConfirm(false);
  }

  function handleCancel() {
    reset();
    onOpenChange(false);
  }

  // Mirrors the backend's hash input exactly: computeContentHash() hashes
  // `content ?? external_url ?? ""` — the same `content || externalUrl`
  // precedence the submit payload already uses below. Comparing raw
  // (untrimmed) values against the raw baseline keeps this client-side
  // check aligned with the server's byte-exact comparison, so the
  // post-submit `warning` fallback should rarely if ever be the one that
  // actually catches a duplicate.
  function isDuplicateOfBaseline(): boolean {
    if (!isNewVersion || !baselineVersion) return false;
    const baselineSource = baselineVersion.content || baselineVersion.external_url || "";
    const submittedSource = content || externalUrl || "";
    return submittedSource === baselineSource;
  }

  async function submitNewVersion() {
    const result = await createVersion.mutateAsync({
      content: content || undefined,
      external_url: externalUrl || undefined,
      commit_message: commitMessage || undefined,
    });
    // Belt-and-suspenders: the client-side check above should already have
    // caught an identical-content submission before this point, but if it
    // somehow didn't (edge case), the backend's own warning still fires —
    // surfaced here since the version is already created and can't be
    // un-submitted at this point.
    if (result.warning) {
      toast({ title: "Heads up", description: result.warning });
    }
    reset();
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (mode === "create") {
      const errors = validateResourceContentFields(type, content, externalUrl);
      if (errors.content || errors.external_url) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});

      await createResource.mutateAsync({
        title,
        type,
        project_id: projectId,
        category: category || undefined,
        content: content || undefined,
        external_url: externalUrl || undefined,
        commit_message: commitMessage || undefined,
      });
      reset();
      onOpenChange(false);
    } else if (resourceId) {
      const errors = validateResourceContentFields(resourceType ?? "runbook", content, externalUrl);
      if (errors.content || errors.external_url) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});

      if (isDuplicateOfBaseline()) {
        setShowDuplicateConfirm(true);
        return;
      }

      await submitNewVersion();
    }
  }

  async function handleConfirmDuplicate() {
    setShowDuplicateConfirm(false);
    await submitNewVersion();
  }

  const isSubmitting = createResource.isPending || createVersion.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New resource" : isReverting ? "Revert to this version" : "Add new version"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a runbook, SOP, or other reference document."
              : isReverting
                ? "Pre-filled from an older version — edit if needed, then save to create a new version with this content."
                : "Pre-filled with the current version's content — edit and save to record a new version."}
          </DialogDescription>
        </DialogHeader>

        {showDuplicateConfirm ? (
          <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm text-foreground">
              This content is identical to the current version. Create a new version anyway?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDuplicateConfirm(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmDuplicate} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Create anyway"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "create" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as ResourceType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RESOURCE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {RESOURCE_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Project</Label>
                    <ProjectPicker value={projectId} onChange={setProjectId} placeholder="None" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
              </>
            )}

            {isNewVersion && isPrefillLoading && (
              <p className="text-xs text-muted-foreground">Loading current content...</p>
            )}

            <div className="space-y-1">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              {fieldErrors.content && <p className="text-xs text-danger">{fieldErrors.content}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="externalUrl">External URL</Label>
              <Input
                id="externalUrl"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://..."
              />
              {fieldErrors.external_url && (
                <p className="text-xs text-danger">{fieldErrors.external_url}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="commitMessage">Commit message</Label>
              <Input
                id="commitMessage"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
              />
            </div>

            <DialogFooter>
              {isNewVersion && (
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
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
