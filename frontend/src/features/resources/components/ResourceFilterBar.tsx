import { FilterBar } from "@/components/FilterBar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/components/ProjectPicker";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES } from "@/lib/resourceTypes";
import type { DeletedFilter, SortOrder } from "@/hooks/usePagination";

interface Props {
  search: string;
  onSearchChange: (search: string) => void;
  type: string | undefined;
  onTypeChange: (type: string | undefined) => void;
  projectId: string | undefined;
  onProjectIdChange: (projectId: string | undefined) => void;
  sort: string | undefined;
  onSortChange: (sort: string | undefined) => void;
  sortOptions: { value: string; label: string }[];
  order: SortOrder | undefined;
  onOrderChange: (order: SortOrder | undefined) => void;
  deleted: DeletedFilter;
  onDeletedChange: (deleted: DeletedFilter) => void;
}

export default function ResourceFilterBar({
  search,
  onSearchChange,
  type,
  onTypeChange,
  projectId,
  onProjectIdChange,
  sort,
  onSortChange,
  sortOptions,
  order,
  onOrderChange,
  deleted,
  onDeletedChange,
}: Props) {
  return (
    <FilterBar>
      <Input
        placeholder="Search resources..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-56"
      />

      <Select
        value={type ?? "all"}
        onValueChange={(value) => onTypeChange(value === "all" ? undefined : value)}
      >
        <SelectTrigger className="w-40" aria-label="Resource type">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {RESOURCE_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {RESOURCE_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ProjectPicker
        value={projectId}
        onChange={onProjectIdChange}
        includeAllOption
        allOptionLabel="All projects"
        placeholder="Project"
        className="w-48"
        aria-label="Project"
      />

      <Select value={sort} onValueChange={onSortChange}>
        <SelectTrigger className="w-40" aria-label="Sort by">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((opt) => (
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
  );
}
