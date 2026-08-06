import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Resource } from "@/types";

interface Props {
  resources: Resource[];
  selectedId: string | undefined;
  onSelect: (resource: Resource) => void;
}

export default function ResourceList({ resources, selectedId, onSelect }: Props) {
  if (resources.length === 0) {
    return <p className="text-sm text-muted-foreground">No resources found.</p>;
  }

  return (
    <ul className="space-y-1">
      {resources.map((resource) => (
        <li key={resource.id}>
          <button
            type="button"
            onClick={() => onSelect(resource)}
            className={cn(
              "flex w-full flex-col items-start gap-1 rounded-md border border-border p-3 text-left transition-colors duration-150",
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
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
