import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Person } from "@/types";

interface Props {
  people: Person[];
  onSelect: (person: Person) => void;
}

export default function PeopleTable({ people, onSelect }: Props) {
  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">No people found.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => (
          <TableRow
            key={person.id}
            className="cursor-pointer"
            onClick={() => onSelect(person)}
          >
            <TableCell className="font-medium">{person.name}</TableCell>
            <TableCell>
              <Badge variant="outline">{person.type.replace("_", " ")}</Badge>
            </TableCell>
            <TableCell>{person.email ?? "—"}</TableCell>
            <TableCell>{person.phone ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
