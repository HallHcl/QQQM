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
              className={cn("cursor-pointer", isDeleted && "opacity-50")}
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
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
