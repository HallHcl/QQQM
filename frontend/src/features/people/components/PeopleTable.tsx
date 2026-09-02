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
import { InitialsAvatar } from "@/components/ui/initials-avatar";
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
              className={cn("group cursor-pointer", isDeleted && "[&_td]:text-muted-foreground")}
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
                  <InitialsAvatar name={person.name} />
                  {person.name}
                  {isDeleted && <Badge variant="neutral">Deleted</Badge>}
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
                {/* Row actions idle at opacity-60 — dimmed but legible and fully
                    operable everywhere, including touch, where there is no hover to
                    reveal them with. Hover or keyboard focus anywhere in the row brings
                    them to full opacity. Kept as opacity (not display/visibility) so
                    the buttons stay in the tab order throughout. Still skipped on
                    deleted rows, though decision #53's original reason is gone: the row
                    no longer carries its own opacity-50 to compound with (deleted rows
                    are marked with muted text plus a badge now), but Restore is a
                    deleted row's only action and is deliberately left at full contrast. */}
                <div
                  className={cn(
                    "inline-flex transition-opacity",
                    !isDeleted && "opacity-60",
                    "group-hover:opacity-100",
                    "group-focus-within:opacity-100"
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
