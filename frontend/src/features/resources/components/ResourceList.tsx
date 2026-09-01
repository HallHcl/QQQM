import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ResourceListItem } from "@/hooks/useResources";

interface Props {
  resources: ResourceListItem[];
  selectedId: string | undefined;
  onSelect: (resource: ResourceListItem) => void;
}

export default function ResourceList({ resources, selectedId, onSelect }: Props) {
  return (
    <ul className="space-y-1">
      {resources.map((resource) => {
        const isDeleted = Boolean(resource.deleted_at);
        return (
          <li key={resource.id}>
            <button
              type="button"
              onClick={() => onSelect(resource)}
              className={cn(
                "flex w-full flex-col items-start gap-1 rounded-md border border-border p-3 text-left transition-colors duration-150",
                isDeleted && "text-muted-foreground",
                selectedId === resource.id
                  ? "border-brand bg-surface-hover"
                  : "hover:border-brand hover:bg-surface-hover"
              )}
            >
              <span className="text-sm font-medium">{resource.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{resource.type}</Badge>
                {resource.category && (
                  <span className="text-xs text-muted-foreground">{resource.category}</span>
                )}
                {isDeleted && <Badge variant="neutral">Deleted</Badge>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
