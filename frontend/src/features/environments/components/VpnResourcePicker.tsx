import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useResources } from "@/hooks/useResources";
import { VpnResourceStatus } from "./VpnResourceStatus";

interface Props {
  value: string | null | undefined;
  onChange: (resourceId: string | null) => void;
  disabled?: boolean;
}

/**
 * Server-side search (via useResources' existing `search` filter) rather
 * than a plain dropdown of every Resource: Resources' list endpoint is
 * paginated (defaults to 20 rows) and useResources() doesn't expose a
 * page/per_page override, so an unfiltered dropdown would silently omit
 * anything past the first page. Typing narrows the same bounded query
 * server-side instead, which scales regardless of total resource count
 * without needing to touch useResources.ts.
 */
export function VpnResourcePicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: resources = [], isLoading } = useResources({ search: search || undefined });

  function select(resourceId: string | null) {
    onChange(resourceId);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="flex h-10 w-full items-center justify-between px-3 py-2 font-normal"
        >
          <VpnResourceStatus resourceId={value} />
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="space-y-2">
          <Input
            placeholder="Search resources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => select(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                !value && "font-medium text-brand"
              )}
            >
              <X className="h-3.5 w-3.5" />
              No VPN resource
            </button>

            {isLoading ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading...</p>
            ) : resources.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No matching resources.</p>
            ) : (
              resources.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => select(resource.id)}
                  className={cn(
                    "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    value === resource.id && "font-medium text-brand"
                  )}
                >
                  <span>{resource.title}</span>
                  <span className="text-xs text-muted-foreground">{resource.type}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
