import { useState } from "react";
import { Input } from "@/components/ui/input";
import { usePeople } from "@/hooks/usePeople";
import type { Person } from "@/types";
import RoleFilterTabs from "./components/RoleFilterTabs";
import PeopleTable from "./components/PeopleTable";
import PersonDetailDialog from "./components/PersonDetailDialog";

export default function PeoplePage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Person | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: people = [], isLoading } = usePeople({
    type: typeFilter === "all" ? undefined : typeFilter,
    search: search || undefined,
  });

  function handleSelect(person: Person) {
    setSelected(person);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">People</h1>
        <Input
          placeholder="Search people..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      <RoleFilterTabs value={typeFilter} onValueChange={setTypeFilter} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading people...</p>
      ) : (
        <PeopleTable people={people} onSelect={handleSelect} />
      )}

      <PersonDetailDialog person={selected} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
