import { FilterBar } from "@/components/FilterBar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeletedFilter, SortOrder } from "@/hooks/usePagination";
import type { PeopleSort } from "@/hooks/usePeople";
import RoleFilterTabs from "./RoleFilterTabs";

const SORT_OPTIONS: { value: PeopleSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
];

interface Props {
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sort: string | undefined;
  onSortChange: (value: string) => void;
  order: SortOrder | undefined;
  onOrderChange: (value: SortOrder) => void;
  deleted: DeletedFilter;
  onDeletedChange: (value: DeletedFilter) => void;
}

/**
 * Consolidates People's filtering into one place: the role tabs stay a
 * tabs widget (5 fixed, stable options — the primary way this list gets
 * triaged, so it keeps its own visual weight rather than collapsing into
 * a same-size Select alongside Sort/Order/Status) but now lives inside
 * this single component instead of a separately-positioned sibling, and
 * search moves in from the page header alongside sort/order/status.
 */
export default function PeopleFilterBar({
  typeFilter,
  onTypeFilterChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  order,
  onOrderChange,
  deleted,
  onDeletedChange,
}: Props) {
  return (
    <div className="space-y-3">
      <RoleFilterTabs value={typeFilter} onValueChange={onTypeFilterChange} />

      <FilterBar>
        <Input
          placeholder="Search people..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-64"
        />

        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger className="w-40" aria-label="Sort by">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={order} onValueChange={(v) => onOrderChange(v as SortOrder)}>
          <SelectTrigger className="w-32" aria-label="Sort order">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascending</SelectItem>
            <SelectItem value="desc">Descending</SelectItem>
          </SelectContent>
        </Select>

        <Select value={deleted} onValueChange={(v) => onDeletedChange(v as DeletedFilter)}>
          <SelectTrigger className="w-40" aria-label="Record status filter">
            <SelectValue placeholder="Record status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Active</SelectItem>
            <SelectItem value="true">Deleted</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
    </div>
  );
}
