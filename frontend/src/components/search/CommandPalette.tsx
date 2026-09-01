import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, FolderKanban, HardDrive, Layers } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  SEARCH_GROUPS,
  searchHitPath,
  useGlobalSearch,
  type SearchEntityType,
  type SearchHit,
} from "@/hooks/useGlobalSearch";

/** Same icons the sidebar uses for these destinations, so results read as the
 *  same entities rather than a parallel vocabulary. */
const ICONS: Record<SearchEntityType, typeof Building2> = {
  client: Building2,
  project: FolderKanban,
  environment: Layers,
  server: HardDrive,
};

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term, 250);
  const { data, isFetching, isError } = useGlobalSearch(debouncedTerm);

  // Reset on close so reopening starts clean rather than showing the previous
  // search's results under an empty-looking input.
  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const trimmed = term.trim();
  const hasQuery = trimmed.length > 0;
  // The debounce means `data` still belongs to the previous term for a beat
  // after typing; treat that window as loading so results and input never
  // visibly disagree.
  const isSettling = hasQuery && debouncedTerm.trim() !== trimmed;
  const isLoading = isSettling || (hasQuery && isFetching);
  const total = data?.total ?? 0;

  function handleSelect(hit: SearchHit) {
    onOpenChange(false);
    navigate(searchHitPath(hit));
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search clients, projects, environments, servers..."
        value={term}
        onValueChange={setTerm}
        aria-label="Search clients, projects, environments and servers"
      />
      <CommandList>
        {/* cmdk's own Empty only renders when it has zero items, which never
            happens while results are held from the previous term — so the
            resting, loading, error and no-results states are handled here
            explicitly instead. */}
        {!hasQuery && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Start typing to search clients, projects, environments and servers.
          </p>
        )}
        {hasQuery && isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Searching...</p>
        )}
        {hasQuery && !isLoading && isError && (
          <p className="py-8 text-center text-sm text-destructive">
            Search failed. Try again.
          </p>
        )}
        {hasQuery && !isLoading && !isError && total === 0 && (
          <CommandEmpty>No results for &ldquo;{trimmed}&rdquo;.</CommandEmpty>
        )}

        {hasQuery &&
          !isLoading &&
          !isError &&
          SEARCH_GROUPS.map(({ key, label }) => {
            const hits = data?.[key] ?? [];
            if (hits.length === 0) return null;
            return (
              <CommandGroup key={key} heading={label}>
                {hits.map((hit) => {
                  const Icon = ICONS[hit.type];
                  return (
                    <CommandItem
                      key={`${hit.type}-${hit.id}`}
                      // cmdk dedupes by value; ids are unique per type but a
                      // type prefix keeps that true across groups.
                      value={`${hit.type}-${hit.id}`}
                      onSelect={() => handleSelect(hit)}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{hit.label}</span>
                      {hit.secondary && (
                        <span className="ml-auto shrink-0 truncate pl-3 text-xs text-muted-foreground">
                          {hit.secondary}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
      </CommandList>
    </CommandDialog>
  );
}
