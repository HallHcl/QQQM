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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/components/ProjectPicker";
import { useCreateResource } from "@/hooks/useResources";
import { useCreateResourceVersion } from "@/hooks/useResourceVersions";
import type { ResourceType } from "@/types";

const RESOURCE_TYPES: ResourceType[] = [
  "runbook",
  "sop",
  "architecture",
  "troubleshooting",
  "faq",
  "link",
  "pdf",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "new-version";
  resourceId?: string;
}

export default function ResourceEditor({ open, onOpenChange, mode, resourceId }: Props) {
  const createResource = useCreateResource();
  const createVersion = useCreateResourceVersion(resourceId ?? "");

  const [title, setTitle] = useState("");
  const [type, setType] = useState<ResourceType>("runbook");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [commitMessage, setCommitMessage] = useState("");

  function reset() {
    setTitle("");
    setType("runbook");
    setProjectId(undefined);
    setCategory("");
    setContent("");
    setExternalUrl("");
    setCommitMessage("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (mode === "create") {
      await createResource.mutateAsync({
        title,
        type,
        project_id: projectId,
        category: category || undefined,
        content: content || undefined,
        external_url: externalUrl || undefined,
        commit_message: commitMessage || undefined,
      });
    } else if (resourceId) {
      await createVersion.mutateAsync({
        content: content || undefined,
        external_url: externalUrl || undefined,
        commit_message: commitMessage || undefined,
      });
    }

    reset();
    onOpenChange(false);
  }

  const isSubmitting = createResource.isPending || createVersion.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New resource" : "Add new version"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a runbook, SOP, or other reference document."
              : "Record a new version for this resource."}
          </DialogDescription>
        </DialogHeader>

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
                          {t.replace("_", " ")}
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

          <div className="space-y-1">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="externalUrl">External URL</Label>
            <Input
              id="externalUrl"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://..."
            />
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
