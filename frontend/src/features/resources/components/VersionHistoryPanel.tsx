import { useState } from "react";
import { format } from "date-fns";
import { RequireRole } from "@/components/auth/RequireRole";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/state/EmptyState";
import { LoadingState } from "@/components/state/LoadingState";
import { cn } from "@/lib/utils";
import { useResourceVersion, useResourceVersions } from "@/hooks/useResourceVersions";

interface Props {
  resourceId: string;
  /**
   * Called when the user clicks "Revert to this version" on a historical
   * (non-HEAD) version. This is a UI affordance only — it opens the same
   * new-version form used by "Add version", pre-filled with that version's
   * content, and results in an ordinary POST /:id/versions call. No
   * distinct backend action exists for "revert".
   */
  onRevert?: (versionId: string) => void;
}

export default function VersionHistoryPanel({ resourceId, onRevert }: Props) {
  const { data: versions = [], isLoading } = useResourceVersions(resourceId);
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(undefined);

  const headVersionNumber =
    versions.length > 0 ? Math.max(...versions.map((v) => v.version_number)) : undefined;

  const activeVersionId = selectedVersionId ?? versions[0]?.id;
  // The list response is deliberately light (no content) — fetch the full
  // version separately once one is selected.
  const { data: selectedVersion, isLoading: isDetailLoading } = useResourceVersion(
    resourceId,
    activeVersionId
  );

  if (isLoading) {
    return <LoadingState message="Loading version history..." />;
  }

  if (versions.length === 0) {
    return <EmptyState title="No versions yet" />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ul className="space-y-1">
        {versions.map((version) => {
          const isHead = version.version_number === headVersionNumber;
          const isSelected = activeVersionId === version.id;
          return (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => setSelectedVersionId(version.id)}
                className={cn(
                  "flex w-full flex-col items-start gap-1 border-l-2 py-2 pl-3 text-left text-sm transition-colors duration-150",
                  isHead ? "border-brand" : "border-border",
                  isSelected ? "bg-surface-hover" : "hover:bg-surface-hover"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-xs text-foreground">
                    v{version.version_number}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {format(new Date(version.created_at), "PPp")}
                  </span>
                </div>
                <span className="font-medium">
                  {version.commit_message ?? "No commit message"}
                </span>
                <span className="text-xs text-muted-foreground">{version.author.name}</span>
              </button>
              {/* Reverting to the current version doesn't make sense, so this
                  only ever appears on historical (non-HEAD) versions. */}
              {!isHead && onRevert && (
                <RequireRole roles={["admin", "member"]}>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 pl-3 text-xs"
                    onClick={() => onRevert(version.id)}
                  >
                    Revert to this version
                  </Button>
                </RequireRole>
              )}
            </li>
          );
        })}
      </ul>

      <div className="rounded-md border border-border bg-surface p-4">
        {isDetailLoading ? (
          <LoadingState message="Loading version..." />
        ) : selectedVersion ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Version {selectedVersion.version_number}</h4>
              <span className="font-mono text-xs text-muted-foreground">
                {format(new Date(selectedVersion.created_at), "PPp")}
              </span>
            </div>
            {selectedVersion.content && (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-background p-3 text-xs">
                {selectedVersion.content}
              </pre>
            )}
            {selectedVersion.external_url && (
              <a
                href={selectedVersion.external_url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-brand underline underline-offset-2"
              >
                {selectedVersion.external_url}
              </a>
            )}
            {selectedVersion.file_path && (
              <p className="font-mono text-sm text-muted-foreground">
                File: {selectedVersion.file_path}
              </p>
            )}
            {!selectedVersion.content &&
              !selectedVersion.external_url &&
              !selectedVersion.file_path && (
                <p className="text-sm text-muted-foreground">No content recorded.</p>
              )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a version to view it.</p>
        )}
      </div>
    </div>
  );
}
