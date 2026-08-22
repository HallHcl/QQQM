import { RequireRole } from "@/components/auth/RequireRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RowActions } from "@/components/RowActions";
import { useHasRole } from "@/hooks/useHasRole";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { Person } from "@/types";

interface Props {
  people: Person[];
  onSelect: (person: Person) => void;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
  onRestore: (person: Person) => void;
}

export default function PeopleTable({ people, onSelect, onEdit, onDelete, onRestore }: Props) {
  const canEdit = useHasRole(["admin", "member"]);
  const canDelete = useHasRole(["admin"]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => {
          const isDeleted = Boolean(person.deleted_at);
          return (
            <TableRow
              key={person.id}
              className={cn("group cursor-pointer", isDeleted && "opacity-50")}
              role="button"
              tabIndex={0}
              // Explicit aria-label so the row's accessible name doesn't
              // flatten in the nested Edit/Delete menu's own labels.
              aria-label={`View ${person.name}`}
              onClick={() => onSelect(person)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(person);
                }
              }}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-caption font-semibold text-foreground"
                  >
                    {getInitials(person.name)}
                  </span>
                  {person.name}
                  {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{person.type.replace("_", " ")}</Badge>
              </TableCell>
              <TableCell>{person.email ?? "—"}</TableCell>
              <TableCell>{person.phone ?? "—"}</TableCell>
              <TableCell
                className="text-right"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {/* Hover-reveal is scoped to mouse-capable devices via the
                    `hover: hover` media feature, so touch/mobile viewports
                    (which never match it) keep actions at their base
                    opacity-100 — always visible, never hover-gated. Kept as
                    opacity (not display/visibility) so the buttons stay in
                    the tab order and reveal on keyboard focus too. */}
                <div
                  className={cn(
                    "inline-flex opacity-100 transition-opacity",
                    "[@media(hover:hover)]:opacity-0",
                    "[@media(hover:hover)]:group-hover:opacity-100",
                    "[@media(hover:hover)]:group-focus-within:opacity-100"
                  )}
                >
                  {isDeleted ? (
                    <RequireRole roles={["admin"]}>
                      <Button variant="ghost" size="sm" onClick={() => onRestore(person)}>
                        Restore
                      </Button>
                    </RequireRole>
                  ) : (
                    <RowActions
                      onEdit={canEdit ? () => onEdit(person) : undefined}
                      onDelete={canDelete ? () => onDelete(person) : undefined}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
