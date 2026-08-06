import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useResourceVersions } from "@/hooks/useResourceVersions";
import { usePeople } from "@/hooks/usePeople";

interface Props {
  resourceId: string;
}

export default function VersionHistoryPanel({ resourceId }: Props) {
  const { data: versions = [], isLoading } = useResourceVersions(resourceId);
  const { data: people = [] } = usePeople();
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(undefined);

  const authorName = (authorId: string) =>
    people.find((p) => p.id === authorId)?.name ?? "Unknown";

  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) ?? versions[0];

  const headVersionNumber =
    versions.length > 0 ? Math.max(...versions.map((v) => v.version_number)) : undefined;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading version history...</p>;
  }

  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No versions yet.</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ul className="space-y-1">
        {versions.map((version) => {
          const isHead = version.version_number === headVersionNumber;
          const isSelected = (selectedVersion?.id ?? versions[0].id) === version.id;
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
                  <span className="font-mono text-xs text-subtle">
                    {format(new Date(version.created_at), "PPp")}
                  </span>
                </div>
                <span className="font-medium">
                  {version.commit_message ?? "No commit message"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {authorName(version.author_id)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-md border border-border bg-surface p-4">
        {selectedVersion ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Version {selectedVersion.version_number}</h4>
              <span className="font-mono text-xs text-subtle">
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
